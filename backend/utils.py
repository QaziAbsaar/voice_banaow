import os
import subprocess
import uuid
import librosa
import soundfile as sf
import numpy as np


def preprocess_audio(input_path: str, output_path: str, target_sr: int = 16000) -> str:
    """Convert any audio file to WAV, mono, target sample rate using ffmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ac", "1",
            "-ar", str(target_sr),
            "-sample_fmt", "s16",
            output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return output_path
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg preprocessing failed: {e.stderr.decode()}")
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg not found. Install from https://ffmpeg.org/download.html and add to PATH."
        )


def get_audio_duration(path: str) -> float:
    """Get duration of audio file in seconds using librosa."""
    try:
        y, sr = librosa.load(path, sr=None, mono=True)
        return float(len(y) / sr)
    except Exception as e:
        raise RuntimeError(f"Failed to get audio duration: {e}")


def check_audio_quality(path: str) -> dict:
    """Check audio quality: SNR, duration, rating, issues."""
    try:
        y, sr = librosa.load(path, sr=None, mono=True)
        duration = len(y) / sr

        if len(y) == 0:
            return {"snr_db": 0, "duration": 0, "rating": "POOR", "issues": ["Silent audio"]}

        noise_floor = np.mean(np.abs(y[y < np.percentile(np.abs(y), 10)]))
        signal_rms = np.sqrt(np.mean(y ** 2))

        if noise_floor < 1e-10:
            snr_db = 40.0
        else:
            snr_db = float(20 * np.log10(signal_rms / max(noise_floor, 1e-10)))

        issues = []
        if duration < 30:
            issues.append("Very short audio")
        if snr_db < 15:
            issues.append("High background noise")

        if snr_db >= 30:
            rating = "EXCELLENT"
        elif snr_db >= 20:
            rating = "GOOD"
        elif snr_db >= 15:
            rating = "FAIR"
        else:
            rating = "POOR"

        return {
            "snr_db": round(snr_db, 2),
            "duration": round(duration, 2),
            "rating": rating,
            "issues": issues
        }
    except Exception as e:
        return {"snr_db": 0, "duration": 0, "rating": "POOR", "issues": [str(e)]}


def generate_output_filename(prefix: str = "output", ext: str = ".wav") -> str:
    """Generate a unique filename."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}{ext}"


def ensure_dir(path: str) -> str:
    """Ensure directory exists, return path."""
    os.makedirs(path, exist_ok=True)
    return path


def convert_to_mp3(wav_path: str, mp3_path: str, bitrate: str = "192k") -> str:
    """Convert WAV to MP3 using ffmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", wav_path,
            "-codec:a", "libmp3lame",
            "-b:a", bitrate,
            mp3_path
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return mp3_path
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"MP3 conversion failed: {e.stderr.decode()}")
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Install from https://ffmpeg.org/download.html")
