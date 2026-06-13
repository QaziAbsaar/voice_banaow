import os
import subprocess
import sys
import logging
from pathlib import Path

import librosa

logger = logging.getLogger(__name__)


def separate_vocals(input_path: str, output_dir: str) -> dict:
    """
    Run Demucs to separate vocals from music.

    Args:
        input_path: Path to input audio file
        output_dir: Directory where Demucs will place its output

    Returns:
        dict with keys:
            - vocals_path: path to extracted vocals WAV
            - no_vocals_path: path to remaining accompaniment WAV
            - duration: duration in seconds
    """
    input_path = os.path.abspath(input_path)
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    input_filename = Path(input_path).stem

    logger.info(f"Starting Demucs separation for: {input_path}")

    try:
        wrapper_path = os.path.join(os.path.dirname(__file__), "demucs_wrapper.py")
        cmd = [
            sys.executable, wrapper_path,
            "--two-stems=vocals",
            "-n", "htdemucs",
            "-o", output_dir,
            input_path
        ]

        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=600
        )
        logger.info(f"Demucs stdout: {result.stdout[-500:] if result.stdout else ''}")
    except subprocess.CalledProcessError as e:
        stderr = e.stderr[-2000:] if e.stderr else "No stderr output"
        logger.error(f"Demucs failed: {stderr}")
        raise RuntimeError(
            f"Demucs separation failed. Error: {stderr}"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Demucs timed out after 10 minutes.")
    except FileNotFoundError:
        raise RuntimeError(
            "Demucs not found. Install it with: pip install demucs"
        )

    demucs_output_dir = os.path.join(output_dir, "htdemucs", input_filename)
    vocals_path = os.path.join(demucs_output_dir, "vocals.wav")
    no_vocals_path = os.path.join(demucs_output_dir, "no_vocals.wav")

    if not os.path.exists(vocals_path):
        raise RuntimeError(
            f"Demucs completed but vocals file not found at: {vocals_path}"
        )

    try:
        duration = float(librosa.get_duration(path=vocals_path))
    except Exception:
        duration = 0.0

    logger.info(f"Demucs separation complete. Vocals: {vocals_path}, Duration: {duration:.1f}s")

    return {
        "vocals_path": vocals_path,
        "no_vocals_path": no_vocals_path if os.path.exists(no_vocals_path) else None,
        "duration": round(duration, 2)
    }
