import os
import logging
import uuid
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_tts_backend = None


def detect_tts_backend() -> str:
    """Detect available TTS backend. Returns 'xtts', 'gtts', or raises."""
    global _tts_backend
    if _tts_backend is not None:
        return _tts_backend

    # Try XTTS first (voice cloning, high quality)
    try:
        from TTS.api import TTS
        _ = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
        _tts_backend = "xtts"
        logger.info("TTS backend: XTTS v2 — voice cloning available")
        return _tts_backend
    except Exception as e:
        logger.info(f"XTTS not available: {e}")

    # Fall back to gTTS (lightweight, no model download)
    try:
        import gtts
        _tts_backend = "gtts"
        logger.info("TTS backend: gTTS — lightweight, internet required")
        return _tts_backend
    except ImportError:
        pass

    raise RuntimeError(
        "No TTS backend available. Install one:\n"
        "  pip install gtts           (lightweight, needs internet)\n"
        "  pip install TTS            (high quality, voice cloning, ~2GB model)"
    )


def _synthesize_gtts(text: str, output_path: str, lang: str = "en") -> str:
    """Synthesize speech using Google TTS."""
    from gtts import gTTS
    tts = gTTS(text=text, lang=lang, slow=False)
    tts.save(output_path)
    logger.info(f"gTTS generated: {output_path}")
    return output_path


def _synthesize_xtts(
    text: str,
    output_path: str,
    speaker_wav: str | None = None,
    language: str = "en",
) -> str:
    """Synthesize speech using Coqui XTTS v2 with optional voice cloning."""
    from TTS.api import TTS

    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)

    if speaker_wav and os.path.exists(speaker_wav):
        logger.info(f"XTTS with voice clone from: {speaker_wav}")
        tts.tts_to_file(
            text=text,
            file_path=output_path,
            speaker_wav=speaker_wav,
            language=language,
        )
    else:
        logger.info("XTTS without voice cloning (default speaker)")
        tts.tts_to_file(
            text=text,
            file_path=output_path,
            language=language,
        )

    logger.info(f"XTTS generated: {output_path}")
    return output_path


def synthesize(
    text: str,
    output_path: str,
    tts_engine: str = "auto",
    speaker_wav: str | None = None,
    language: str = "en",
) -> str:
    """
    Generate speech from text using available TTS backend.

    Args:
        text: Text to synthesize
        output_path: Where to save WAV file
        tts_engine: 'auto', 'gtts', or 'xtts'
        speaker_wav: Optional reference audio for XTTS voice cloning
        language: Language code (e.g. 'en', 'ur', 'hi')

    Returns:
        Path to generated WAV file
    """
    if tts_engine == "auto":
        tts_engine = detect_tts_backend()

    # Ensure .wav extension
    if not output_path.endswith(".wav"):
        output_path = output_path + ".wav"

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if tts_engine == "xtts":
        _synthesize_xtts(text, output_path, speaker_wav, language)
    elif tts_engine == "gtts":
        _synthesize_gtts(text, output_path, language)
    else:
        raise ValueError(f"Unknown TTS engine: {tts_engine}")

    return output_path
