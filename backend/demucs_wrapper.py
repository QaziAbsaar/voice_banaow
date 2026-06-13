"""
Wrapper that patches torchaudio.load before Demucs uses it.
Torchaudio 2.11 forces torchcodec which needs ffmpeg shared libs.
This wrapper replaces torchaudio.load with soundfile-based loading.
"""
import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("demucs_wrapper")

# 1. Monkey-patch torchaudio.load BEFORE demucs imports it
import torch
import torchaudio

import soundfile as sf
import numpy as np

_original_load = torchaudio.load


def _patched_load(filepath, out=None, frame_offset=0, num_frames=-1, normalize=True, channels_first=True, format=None):
    """Replace torchaudio.load with soundfile-based read."""
    logger.info("demucs_wrapper: loading %s via soundfile", filepath)
    data, sr = sf.read(filepath, dtype='float32', always_2d=True)
    # sf returns (frames, channels), torchaudio expects (channels, frames)
    data = data.T
    if num_frames > 0:
        end = frame_offset + num_frames
        data = data[:, frame_offset:end]
    else:
        data = data[:, frame_offset:]
    return torch.from_numpy(data), sr


def _patched_save(filepath, src, sample_rate, **kwargs):
    """Replace torchaudio.save with soundfile-based write. Ignores extra kwargs (encoding, bits_per_sample, etc.)."""
    logger.info("demucs_wrapper: saving %s via soundfile (sr=%d)", filepath, sample_rate)
    data = src.cpu().numpy()
    if data.ndim == 2:
        data = data.T  # (frames, channels) for soundfile
    sf.write(filepath, data, sample_rate, subtype='PCM_16')
    return


torchaudio.load = _patched_load
torchaudio.save = _patched_save

logger.info("torchaudio.load/.save patched with soundfile backend")

# 2. Now import and run Demucs
from demucs import separate


def main():
    separate.main()


if __name__ == "__main__":
    main()
