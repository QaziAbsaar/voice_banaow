import os
import zipfile
import logging
from pathlib import Path
from datetime import datetime
import shutil

logger = logging.getLogger(__name__)


def package_for_colab(vocals_dir: str, output_dir: str) -> dict:
    """
    Package prepared vocal files into a zip for Colab training.

    Args:
        vocals_dir: Directory containing prepared vocal subdirs with vocals.wav
        output_dir: Where to save the zip file

    Returns:
        dict with zip_path, total_files, total_size_mb, file_count
    """
    vocals_dir = Path(vocals_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect all vocals.wav files
    vocal_files = []
    for subdir in sorted(vocals_dir.iterdir()):
        if subdir.is_dir():
            wav = subdir / "vocals.wav"
            if wav.exists():
                vocal_files.append(wav)

    if not vocal_files:
        # Fallback: look for any wav files directly
        vocal_files = list(vocals_dir.rglob("*.wav"))
        vocal_files = [f for f in vocal_files if "no_vocals" not in f.name]

    if not vocal_files:
        return {
            "zip_path": None,
            "error": "No vocal files found. Prepare vocals first on the Train page.",
            "total_files": 0,
            "total_size_mb": 0,
            "file_count": 0,
        }

    # Generate zip name with date
    date_str = datetime.now().strftime("%Y%m%d")
    zip_name = f"voiceforge_dataset_{date_str}.zip"
    zip_path = output_dir / zip_name

    # Create zip
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, wav_path in enumerate(vocal_files):
            arcname = f"vocals_{i:03d}.wav"
            zf.write(wav_path, arcname)
            logger.info(f"Packaged: {wav_path.name} -> {arcname}")

    total_size_mb = round(zip_path.stat().st_size / (1024 * 1024), 2)
    total_duration_sec = 0
    try:
        import librosa
        for wav in vocal_files:
            total_duration_sec += librosa.get_duration(path=str(wav))
    except Exception:
        pass

    return {
        "zip_path": str(zip_path),
        "zip_name": zip_name,
        "total_files": len(vocal_files),
        "total_size_mb": total_size_mb,
        "total_duration_minutes": round(total_duration_sec / 60, 1),
        "file_count": len(vocal_files),
        "error": None,
    }
