import os
import logging
from functools import lru_cache
from fastapi import HTTPException

import librosa
import soundfile as sf
import numpy as np

logger = logging.getLogger(__name__)

# Track whether rvc-python is available
_rvc_available = False

try:
    from rvc_python.infer import RVCInference
    _rvc_available = True
    logger.info("rvc-python loaded successfully")
except ImportError:
    logger.warning("rvc-python not installed. Conversion will fail with helpful message.")
    RVCInference = None

MODELS_DIR = None

# LRU cache with max 3 models
_model_cache = {}
_model_cache_order = []


def _set_models_dir(path: str):
    global MODELS_DIR
    MODELS_DIR = path


@lru_cache(maxsize=1)
def _get_device() -> str:
    """Determine device: cuda if available, else cpu."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        logger.info("CUDA not available, using CPU")
        return "cpu"
    except ImportError:
        return "cpu"


def check_rvc_available() -> bool:
    """Returns True if rvc-python can be imported."""
    return _rvc_available


def load_rvc_model(model_name: str):
    """
    Load an RVC model from /models/{model_name}.pth.
    Caches up to 3 models with LRU eviction.
    """
    if MODELS_DIR is None:
        raise RuntimeError("Models directory not configured. Call _set_models_dir first.")

    if not _rvc_available:
        raise HTTPException(
            status_code=501,
            detail="rvc-python not installed. Run: pip install rvc-python"
        )

    pth_path = os.path.join(MODELS_DIR, f"{model_name}.pth")
    if not os.path.exists(pth_path):
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model_name}' not found at {pth_path}. "
                   f"Place {model_name}.pth in the models folder."
        )

    index_path = os.path.join(MODELS_DIR, f"{model_name}.index")
    if not os.path.exists(index_path):
        index_path = None
        logger.info(f"No index file found for {model_name}")

    cache_key = model_name

    if cache_key in _model_cache:
        _model_cache_order.remove(cache_key)
        _model_cache_order.append(cache_key)
        logger.info(f"Using cached model: {model_name}")
        return _model_cache[cache_key]

    # Evict LRU if at capacity
    if len(_model_cache) >= 3:
        evict_key = _model_cache_order.pop(0)
        del _model_cache[evict_key]
        logger.info(f"Evicted model: {evict_key}")

    logger.info(f"Loading model: {model_name} (index: {index_path})")
    device = _get_device()

    try:
        rvc = RVCInference(device=device)
        rvc.load_model(pth_path, index_path=index_path)
        _model_cache[cache_key] = rvc
        _model_cache_order.append(cache_key)
        return rvc
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load model '{model_name}': {str(e)}"
        )


def convert_voice(
    source_audio_path: str,
    model_name: str,
    output_path: str,
    pitch_shift: int = 0,
    index_rate: float = 0.75,
    filter_radius: int = 3,
    f0_method: str = "rmvpe"
) -> dict:
    """
    Convert voice using RVC inference.

    Preprocesses audio to 16kHz mono WAV, then runs RVC.
    """
    if not _rvc_available:
        raise HTTPException(
            status_code=501,
            detail="rvc-python not installed. Run: pip install rvc-python"
        )

    # Preprocess: ensure 16kHz mono WAV
    temp_preprocessed = output_path.replace(".wav", "_preprocessed.wav")
    try:
        y, sr = librosa.load(source_audio_path, sr=16000, mono=True)
        sf.write(temp_preprocessed, y, 16000)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to preprocess audio: {str(e)}"
        )

    # Load model
    rvc = load_rvc_model(model_name)

    # Validate params
    pitch_shift = max(-24, min(24, pitch_shift))
    index_rate = max(0.0, min(1.0, index_rate))
    filter_radius = max(1, min(7, filter_radius))

    valid_f0 = ["rmvpe", "crepe", "harvest", "pm"]
    if f0_method not in valid_f0:
        f0_method = "rmvpe"

    logger.info(
        f"Running RVC inference: model={model_name}, pitch={pitch_shift}, "
        f"index_rate={index_rate}, filter_radius={filter_radius}, f0={f0_method}"
    )

    try:
        rvc.infer_file(
            temp_preprocessed,
            output_path,
            f0_up_key=pitch_shift,
            f0_method=f0_method,
            index_rate=index_rate,
            filter_radius=filter_radius
        )
    except Exception as e:
        error_msg = str(e).lower()
        if "out of memory" in error_msg or "cuda" in error_msg and "memory" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="CUDA out of memory. Close other GPU apps or set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128"
            )
        raise HTTPException(
            status_code=500,
            detail=f"RVC inference failed: {str(e)}"
        )

    if not os.path.exists(output_path):
        raise HTTPException(
            status_code=500,
            detail="RVC inference completed but output file not found."
        )

    try:
        duration = float(librosa.get_duration(path=output_path))
    except Exception:
        duration = 0.0

    # Cleanup preprocessed temp
    try:
        os.remove(temp_preprocessed)
    except Exception:
        pass

    logger.info(f"Conversion complete: {output_path} ({duration:.1f}s)")

    return {
        "output_path": output_path,
        "duration": round(duration, 2)
    }
