import os
import sys
import uuid
import logging
import shutil
from datetime import datetime
from pathlib import Path

import librosa
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import aiofiles
import uvicorn

from demucs_engine import separate_vocals
from rvc_engine import convert_voice, check_rvc_available, _set_models_dir
from tts_engine import synthesize as tts_synthesize, detect_tts_backend
from colab_package import package_for_colab
from utils import (
    preprocess_audio, get_audio_duration, check_audio_quality,
    generate_output_filename, ensure_dir, convert_to_mp3
)
from google_drive import (
    get_auth_url, handle_callback, is_authenticated, revoke_auth,
    get_model_folder, upload_file, scan_model_folder, download_file,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("voiceforge")

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
AUDIO_OUTPUT_DIR = BASE_DIR / "audio_output"
TRAINING_DATA_DIR = BASE_DIR / "training_data"
TRAINING_VOCALS_DIR = TRAINING_DATA_DIR / "vocals"
TRAINING_RAW_DIR = TRAINING_DATA_DIR / "raw"

# Ensure dirs exist
for d in [MODELS_DIR, AUDIO_OUTPUT_DIR, TRAINING_DATA_DIR, TRAINING_VOCALS_DIR, TRAINING_RAW_DIR]:
    d.mkdir(parents=True, exist_ok=True)

_set_models_dir(str(MODELS_DIR))

# Load .env (Google OAuth credentials)
load_dotenv(BASE_DIR / "backend" / ".env")

# ── FastAPI App ─────────────────────────────────────────────────────────────
app = FastAPI(title="VoiceForge Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    model_count = len(list(MODELS_DIR.glob("*.pth")))
    rvc_ok = check_rvc_available()
    try:
        tts_backend = detect_tts_backend()
        tts_status = f"✓ ({tts_backend})"
    except RuntimeError:
        tts_status = "✗"
    try:
        drive_ok = is_authenticated()
        drive_status = "✓" if drive_ok else "✗ (no token)"
    except Exception:
        drive_status = "✗"
    logger.info(
        f"VoiceForge backend ready. Models: {model_count}, "
        f"RVC: {'✓' if rvc_ok else '✗'}, "
        f"TTS: {tts_status}, "
        f"Drive: {drive_status}"
    )


# ── Routes ──────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Health check endpoint."""
    models = list(MODELS_DIR.glob("*.pth"))
    return {
        "status": "ok",
        "models_available": len(models)
    }


@app.post("/vocals/separate")
async def separate_vocals_endpoint(source_audio: UploadFile = File(...)):
    """Separate vocals from uploaded audio using Demucs."""
    if not source_audio.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(source_audio.filename).suffix.lower()
    if ext not in (".mp3", ".wav", ".m4a", ".flac", ".ogg"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    # Save temp file
    temp_id = uuid.uuid4().hex
    temp_dir = ensure_dir(os.path.join(BASE_DIR, "temp"))
    temp_path = os.path.join(temp_dir, f"{temp_id}{ext}")

    async with aiofiles.open(temp_path, "wb") as f:
        content = await source_audio.read()
        await f.write(content)

    logger.info(f"Processing vocals separation: {source_audio.filename} -> {temp_id}")

    try:
        result = separate_vocals(temp_path, str(temp_dir))
    except RuntimeError as e:
        _cleanup_temp(temp_dir)
        raise HTTPException(status_code=500, detail=str(e))

    # Move vocals to training vocals dir
    vocals_dest_dir = ensure_dir(os.path.join(TRAINING_VOCALS_DIR, temp_id))
    vocals_dest = os.path.join(vocals_dest_dir, "vocals.wav")
    shutil.move(result["vocals_path"], vocals_dest)

    no_vocals_dest = None
    if result.get("no_vocals_path") and os.path.exists(result["no_vocals_path"]):
        no_vocals_dest = os.path.join(vocals_dest_dir, "no_vocals.wav")
        shutil.move(result["no_vocals_path"], no_vocals_dest)

    _cleanup_temp(temp_dir)

    return {
        "vocals_path": vocals_dest,
        "no_vocals_path": no_vocals_dest,
        "duration": result["duration"]
    }


@app.post("/singing/convert")
async def singing_convert(
    source_audio: UploadFile = File(...),
    model_name: str = Form(...),
    pitch_shift: int = Form(0),
    index_rate: float = Form(0.75),
    filter_radius: int = Form(3),
    f0_method: str = Form("rmvpe")
):
    """Convert vocals using selected RVC model."""
    if not source_audio.filename:
        raise HTTPException(status_code=400, detail="No audio file provided")

    # Validate model exists
    pth_path = MODELS_DIR / f"{model_name}.pth"
    if not pth_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model_name}' not found. Place {model_name}.pth in the models folder."
        )

    ext = Path(source_audio.filename).suffix.lower()
    temp_dir = ensure_dir(os.path.join(BASE_DIR, "temp"))
    temp_input = os.path.join(temp_dir, f"input_{uuid.uuid4().hex}{ext}")

    async with aiofiles.open(temp_input, "wb") as f:
        content = await source_audio.read()
        await f.write(content)

    output_filename = generate_output_filename("converted")
    output_path = AUDIO_OUTPUT_DIR / output_filename

    try:
        # Preprocess to 16kHz mono WAV
        preprocessed = temp_input.replace(ext, "_16k.wav") if ext != ".wav" else temp_input
        if ext != ".wav":
            try:
                preprocess_audio(temp_input, preprocessed)
            except RuntimeError as e:
                _cleanup_temp(temp_dir)
                raise HTTPException(status_code=500, detail=str(e))

        result = convert_voice(
            source_audio_path=preprocessed,
            model_name=model_name,
            output_path=output_path,
            pitch_shift=pitch_shift,
            index_rate=index_rate,
            filter_radius=filter_radius,
            f0_method=f0_method
        )
    except HTTPException:
        _cleanup_temp(temp_dir)
        raise
    except Exception as e:
        _cleanup_temp(temp_dir)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

    _cleanup_temp(temp_dir)

    return {
        "output_path": output_path,
        "duration": result["duration"],
        "model_used": model_name,
        "pitch_shift": pitch_shift
    }


@app.post("/tts/synthesize")
async def text_to_speech(
    text: str = Form(...),
    model_name: str = Form(...),
    tts_backend: str = Form("auto"),
    language: str = Form("en"),
    pitch_shift: int = Form(0),
    index_rate: float = Form(0.75),
    filter_radius: int = Form(3),
    f0_method: str = Form("rmvpe"),
    reference_audio: UploadFile | None = File(None),
):
    """
    Synthesize text to speech, then convert to target voice using RVC.

    Pipeline: Text → TTS (gTTS/XTTS) → RVC conversion → Output WAV
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    pth_path = MODELS_DIR / f"{model_name}.pth"
    if not pth_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model_name}' not found. Place {model_name}.pth in models folder."
        )

    temp_dir = ensure_dir(os.path.join(BASE_DIR, "temp"))
    tts_output = os.path.join(temp_dir, f"tts_{uuid.uuid4().hex}.wav")

    # Step 1: TTS synthesis
    try:
        speaker_wav = None
        if reference_audio and reference_audio.filename:
            ref_path = os.path.join(temp_dir, f"ref_{uuid.uuid4().hex}{Path(reference_audio.filename).suffix}")
            async with aiofiles.open(ref_path, "wb") as f:
                content = await reference_audio.read()
                await f.write(content)
            speaker_wav = ref_path

        tts_synthesize(
            text=text,
            output_path=tts_output,
            tts_engine=tts_backend,
            speaker_wav=speaker_wav,
            language=language,
        )
    except RuntimeError as e:
        _cleanup_temp(temp_dir)
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")

    # Step 2: RVC conversion
    output_filename = generate_output_filename("tts_output")
    output_path = AUDIO_OUTPUT_DIR / output_filename

    try:
        result = convert_voice(
            source_audio_path=tts_output,
            model_name=model_name,
            output_path=str(output_path),
            pitch_shift=pitch_shift,
            index_rate=index_rate,
            filter_radius=filter_radius,
            f0_method=f0_method,
        )
    except HTTPException:
        _cleanup_temp(temp_dir)
        raise
    except Exception as e:
        _cleanup_temp(temp_dir)
        raise HTTPException(status_code=500, detail=f"RVC conversion failed: {str(e)}")

    _cleanup_temp(temp_dir)

    return {
        "output_path": str(output_path),
        "duration": result["duration"],
        "model_used": model_name,
        "pitch_shift": pitch_shift,
        "text": text,
    }


@app.get("/models/path")
async def get_models_path():
    """Return the absolute path to the models directory."""
    return {"path": str(MODELS_DIR.resolve())}


@app.get("/models/list")
async def list_models():
    """List all available models with metadata."""
    models = []
    for pth_path in sorted(MODELS_DIR.glob("*.pth")):
        name = pth_path.stem
        index_path = MODELS_DIR / f"{name}.index"
        size_mb = round(pth_path.stat().st_size / (1024 * 1024), 2)
        models.append({
            "name": name,
            "has_index": index_path.exists(),
            "size_mb": size_mb
        })
    return {"models": models}


@app.delete("/models/{model_name}")
async def delete_model(model_name: str):
    """Delete a model and its index file."""
    files_removed = []

    pth = MODELS_DIR / f"{model_name}.pth"
    if pth.exists():
        os.remove(pth)
        files_removed.append(str(pth))

    idx = MODELS_DIR / f"{model_name}.index"
    if idx.exists():
        os.remove(idx)
        files_removed.append(str(idx))

    if not files_removed:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")

    return {"deleted": True, "files_removed": files_removed}


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serve audio files from the output directory."""
    file_path = AUDIO_OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(file_path))


@app.post("/audio/convert-to-mp3")
async def convert_audio_to_mp3(data: dict):
    """Convert a WAV file in audio_output to MP3 for download."""
    filename = data.get("filename", "")
    if not filename:
        raise HTTPException(status_code=400, detail="filename required")

    src = AUDIO_OUTPUT_DIR / filename
    if not src.exists():
        # Try with .wav extension
        src = AUDIO_OUTPUT_DIR / f"{filename}.wav" if "." not in filename else src
        if not src.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")

    stem = src.stem
    mp3_path = AUDIO_OUTPUT_DIR / f"{stem}.mp3"

    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(str(src))
        audio.export(str(mp3_path), format="mp3", bitrate="192k")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MP3 conversion failed: {str(e)}")

    return FileResponse(
        str(mp3_path),
        media_type="audio/mpeg",
        filename=f"{stem}.mp3",
        headers={"Content-Disposition": f'attachment; filename="{stem}.mp3"'},
    )


@app.post("/training/prepare")
async def prepare_training(
    source_files: list[UploadFile] = File(...),
    has_background_music: bool = Form(True),
):
    """Upload MP3s, extract vocals via Demucs if needed, prepare for training."""
    if not source_files:
        raise HTTPException(status_code=400, detail="No files provided")

    prepared_files = []
    total_duration = 0.0
    errors = []

    for source in source_files:
        if not source.filename:
            continue
        ext = Path(source.filename).suffix.lower()
        if ext not in (".mp3", ".wav", ".m4a", ".flac", ".ogg"):
            errors.append(f"{source.filename}: unsupported format")
            continue

        file_id = uuid.uuid4().hex
        raw_path = os.path.join(TRAINING_RAW_DIR, f"{file_id}{ext}")

        async with aiofiles.open(raw_path, "wb") as f:
            content = await source.read()
            await f.write(content)

        vocals_dest_dir = ensure_dir(os.path.join(TRAINING_VOCALS_DIR, file_id))
        final_vocals = os.path.join(vocals_dest_dir, "vocals.wav")

        if has_background_music:
            # Run Demucs to strip music
            try:
                result = separate_vocals(raw_path, str(TRAINING_DATA_DIR))
                if os.path.exists(result["vocals_path"]):
                    shutil.move(result["vocals_path"], final_vocals)
                    prepared_files.append(final_vocals)
                    total_duration += result["duration"]
                logger.info(f"Demucs: {source.filename} -> {final_vocals}")
            except RuntimeError as e:
                errors.append(f"{source.filename}: {str(e)}")
                logger.error(f"Failed to process {source.filename}: {e}")
                continue
        else:
            # Already clean vocals — copy directly, no Demucs
            shutil.copy2(raw_path, final_vocals)
            try:
                dur = librosa.get_duration(path=final_vocals)
            except Exception:
                dur = 0
            prepared_files.append(final_vocals)
            total_duration += dur
            logger.info(f"Direct copy (clean vocals): {source.filename} -> {final_vocals}")

    ready = total_duration > 300  # > 5 minutes in seconds

    return {
        "prepared_files": prepared_files,
        "total_duration_minutes": round(total_duration / 60, 2),
        "ready_for_training": ready,
        "errors": errors
    }


@app.post("/training/package")
async def create_training_package():
    """Zip prepared vocal data for Colab training."""
    package = package_for_colab(
        vocals_dir=str(TRAINING_VOCALS_DIR),
        output_dir=str(BASE_DIR / "temp" / "colab_package"),
    )

    if package.get("error"):
        raise HTTPException(status_code=400, detail=package["error"])

    return {
        "zip_name": package["zip_name"],
        "total_size_mb": package["total_size_mb"],
        "total_duration_minutes": package["total_duration_minutes"],
        "total_files": package["total_files"],
        "ready": True,
        "colab_url": (
            "https://colab.research.google.com/github/QaziAbsaar/"
            "voice_banaow/blob/main/colab/voiceforge_train.ipynb"
        ),
    }


@app.get("/training/package/download")
async def download_training_package():
    """Download the training data zip package."""
    package = package_for_colab(
        vocals_dir=str(TRAINING_VOCALS_DIR),
        output_dir=str(BASE_DIR / "temp" / "colab_package"),
    )

    if package.get("error") or not package.get("zip_path"):
        raise HTTPException(status_code=404, detail="No package available. Prepare vocals first.")

    if not os.path.exists(package["zip_path"]):
        raise HTTPException(status_code=404, detail="Package file not found.")

    return FileResponse(
        package["zip_path"],
        filename=package["zip_name"],
        media_type="application/zip",
    )


# ── Google Drive Auth Routes ──────────────────────────────────────────────

REDIRECT_URI = "http://localhost:8765/auth/google/callback"


@app.get("/auth/google/url")
async def auth_google_url():
    """Get Google OAuth consent URL for Drive access."""
    try:
        url = get_auth_url(REDIRECT_URI)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate auth URL: {str(e)}")


@app.get("/auth/google/callback")
async def auth_google_callback(code: str, state: str = ""):
    """Handle OAuth callback — exchange code for token."""
    try:
        handle_callback(code, state, REDIRECT_URI)
        # Redirect user back to frontend Train page
        return RedirectResponse(url="http://localhost:5173/train")
    except Exception as e:
        logger.error("OAuth callback failed: %s", e)
        raise HTTPException(status_code=400, detail=f"OAuth failed: {str(e)}")


@app.get("/auth/google/status")
async def auth_google_status():
    """Check if Drive is authenticated."""
    return {"authenticated": is_authenticated()}


@app.post("/auth/google/revoke")
async def auth_google_revoke():
    """Remove stored Drive token."""
    ok = revoke_auth()
    return {"revoked": ok}


# ── One-click Training Flow ──────────────────────────────────────────────


@app.post("/training/start")
async def start_training(
    source_files: list[UploadFile] = File(...),
    model_name: str = Form(...),
    has_background_music: bool = Form(True),
):
    """
    One-click training pipeline:
      1. Prepare vocals (Demucs if needed)
      2. Package zip
      3. Upload zip to Google Drive VoiceForge/{model_name}/
      4. Return pre-filled Colab URL
    """
    if not source_files:
        raise HTTPException(status_code=400, detail="No files provided")
    if not model_name.strip():
        raise HTTPException(status_code=400, detail="model_name is required")

    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Google Drive not authenticated. Call POST /training/start after auth.",
        )

    clean_name = model_name.strip().replace(" ", "_").replace("/", "_")
    file_id = uuid.uuid4().hex

    # Step 1 — Prepare vocals
    prepared_files = []
    total_duration = 0.0
    errors = []

    for source in source_files:
        if not source.filename:
            continue
        ext = Path(source.filename).suffix.lower()
        if ext not in (".mp3", ".wav", ".m4a", ".flac", ".ogg"):
            errors.append(f"{source.filename}: unsupported format")
            continue

        raw_path = os.path.join(TRAINING_RAW_DIR, f"{file_id}{ext}")
        async with aiofiles.open(raw_path, "wb") as f:
            content = await source.read()
            await f.write(content)

        vocals_dest_dir = ensure_dir(os.path.join(TRAINING_VOCALS_DIR, file_id))
        final_vocals = os.path.join(vocals_dest_dir, "vocals.wav")

        if has_background_music:
            try:
                result = separate_vocals(raw_path, str(TRAINING_DATA_DIR))
                if os.path.exists(result["vocals_path"]):
                    shutil.move(result["vocals_path"], final_vocals)
                    prepared_files.append(final_vocals)
                    total_duration += result["duration"]
            except RuntimeError as e:
                errors.append(f"{source.filename}: {str(e)}")
                continue
        else:
            shutil.copy2(raw_path, final_vocals)
            try:
                dur = librosa.get_duration(path=final_vocals)
            except Exception:
                dur = 0
            prepared_files.append(final_vocals)
            total_duration += dur

    if not prepared_files:
        raise HTTPException(status_code=400, detail="No vocals could be prepared")

    # Step 2 — Package zip
    temp_dir = ensure_dir(os.path.join(BASE_DIR, "temp", f"train_{file_id}"))
    pkg = package_for_colab(vocals_dir=str(TRAINING_VOCALS_DIR), output_dir=temp_dir)

    if pkg.get("error"):
        raise HTTPException(status_code=400, detail=pkg["error"])

    # Step 3 — Upload to Google Drive
    try:
        model_folder_id = get_model_folder(clean_name)
        drive_file = upload_file(pkg["zip_path"], model_folder_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive upload failed: {str(e)}")

    # Step 4 — Build Colab URL with model name pre-filled
    colab_url = (
        "https://colab.research.google.com/github/QaziAbsaar/"
        "voice_banaow/blob/main/colab/voiceforge_train.ipynb"
        f"#model_name={clean_name}"
    )

    return {
        "model_name": clean_name,
        "prepared_files": len(prepared_files),
        "total_duration_minutes": round(total_duration / 60, 2),
        "total_size_mb": pkg["total_size_mb"],
        "zip_name": pkg["zip_name"],
        "drive_file_id": drive_file["id"],
        "colab_url": colab_url,
        "errors": errors,
    }


@app.post("/training/import-model")
async def import_model_from_drive(model_name: str = Form(...)):
    """
    Scan Drive VoiceForge/{model_name}/ for .pth and .index,
    download them into the local /models directory.
    """
    if not model_name.strip():
        raise HTTPException(status_code=400, detail="model_name is required")

    clean_name = model_name.strip().replace(" ", "_").replace("/", "_")

    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Google Drive not authenticated. Connect first.")

    try:
        files = scan_model_folder(clean_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive scan failed: {str(e)}")

    if not files.get("pth"):
        raise HTTPException(
            status_code=404,
            detail=f"No .pth found in Drive VoiceForge/{clean_name}/. "
            "Make sure Colab training completed.",
        )

    imported = []

    # Download .pth
    pth_dest = MODELS_DIR / f"{clean_name}.pth"
    download_file(files["pth"]["id"], str(pth_dest))
    imported.append(f"{clean_name}.pth")

    # Download .index if exists
    if files.get("index"):
        idx_dest = MODELS_DIR / f"{clean_name}.index"
        download_file(files["index"]["id"], str(idx_dest))
        imported.append(f"{clean_name}.index")

    return {
        "imported": imported,
        "model_name": clean_name,
        "message": f"Model '{clean_name}' imported successfully. Ready to use on Convert and TTS pages.",
    }


def _cleanup_temp(temp_dir: str):
    """Remove temp directory if it exists."""
    try:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
    except Exception:
        pass


# Serve built frontend in production (dist folder)
dist_dir = BASE_DIR / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

if __name__ == "__main__":
    logger.info("Starting VoiceForge backend on port 8765...")
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
