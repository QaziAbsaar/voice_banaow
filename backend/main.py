import os
import sys
import uuid
import logging
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import aiofiles
import uvicorn

from demucs_engine import separate_vocals
from rvc_engine import convert_voice, check_rvc_available, _set_models_dir
from utils import (
    preprocess_audio, get_audio_duration, check_audio_quality,
    generate_output_filename, ensure_dir, convert_to_mp3
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("voiceforge")

# ── Paths ──────────────────────────────────────────────────────────────────
# Resolve project root (two levels up from backend/ if running from backend/)
BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = ensure_dir(os.path.join(BASE_DIR, "models"))
AUDIO_OUTPUT_DIR = ensure_dir(os.path.join(BASE_DIR, "audio_output"))
TRAINING_DATA_DIR = ensure_dir(os.path.join(BASE_DIR, "training_data"))
TRAINING_VOCALS_DIR = ensure_dir(os.path.join(TRAINING_DATA_DIR, "vocals"))
TRAINING_RAW_DIR = ensure_dir(os.path.join(TRAINING_DATA_DIR, "raw"))

_set_models_dir(str(MODELS_DIR))

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
    ensure_dir(MODELS_DIR)
    ensure_dir(AUDIO_OUTPUT_DIR)
    ensure_dir(TRAINING_VOCALS_DIR)
    ensure_dir(TRAINING_RAW_DIR)
    model_count = len(list(MODELS_DIR.glob("*.pth")))
    rvc_ok = check_rvc_available()
    logger.info(
        f"VoiceForge backend ready. Models found: {model_count}, "
        f"rvc-python: {'✓' if rvc_ok else '✗'}"
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
    pth_path = os.path.join(MODELS_DIR, f"{model_name}.pth")
    if not os.path.exists(pth_path):
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
    output_path = os.path.join(AUDIO_OUTPUT_DIR, output_filename)

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


@app.post("/training/prepare")
async def prepare_training(source_files: list[UploadFile] = File(...)):
    """Upload MP3s, extract vocals via Demucs, prepare for training."""
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

        try:
            result = separate_vocals(raw_path, str(TRAINING_DATA_DIR))
            # Move vocals to organized dir
            final_vocals = os.path.join(vocals_dest_dir, "vocals.wav")
            if os.path.exists(result["vocals_path"]):
                shutil.move(result["vocals_path"], final_vocals)
                prepared_files.append(final_vocals)
                total_duration += result["duration"]
            logger.info(f"Prepared: {source.filename} -> {final_vocals}")
        except RuntimeError as e:
            errors.append(f"{source.filename}: {str(e)}")
            logger.error(f"Failed to process {source.filename}: {e}")
            continue

    ready = total_duration > 300  # > 5 minutes in seconds

    return {
        "prepared_files": prepared_files,
        "total_duration_minutes": round(total_duration / 60, 2),
        "ready_for_training": ready,
        "errors": errors
    }


def _cleanup_temp(temp_dir: str):
    """Remove temp directory if it exists."""
    try:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
    except Exception:
        pass


if __name__ == "__main__":
    logger.info("Starting VoiceForge backend on port 8765...")
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
