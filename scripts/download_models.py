"""
Download pre-trained RVC v2 voice models for testing.

Usage:
    python scripts/download_models.py
    python scripts/download_models.py --model emu     # specific model
    python scripts/download_models.py --list           # list available models
"""

import argparse
import os
import sys
import urllib.request
import json

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

AVAILABLE_MODELS = {
    "default": {
        "name": "Default Test Voice",
        "description": "Generic test voice for RVC v2 pipeline testing",
        "pth": "https://huggingface.co/PhoenixStormJr/RVC-V2-default-voice/resolve/main/default.pth",
        "index": "https://huggingface.co/PhoenixStormJr/RVC-V2-default-voice/resolve/main/added_IVF511_Flat_nprobe_1_default_v2.index",
        "rename_index": "default.index",
        "size_mb": 55,
    },
    "emu": {
        "name": "Emu (Project Sekai)",
        "description": "Hatsune Miku / Project Sekai character voice (v2)",
        "pth": "https://huggingface.co/chitsanfei/rvc-emu-model/resolve/main/emu_v2.pth",
        "index": "https://huggingface.co/chitsanfei/rvc-emu-model/resolve/main/emu_v2.index",
        "size_mb": 55,
    },
}


def download_file(url: str, dest: str, desc: str = "") -> None:
    """Download with progress indicator."""
    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1024 / 1024
        print(f"  Already exists: {dest} ({size_mb:.0f} MB)")
        return

    print(f"  Downloading {desc or os.path.basename(dest)}...")
    try:
        def report(block_count: int, block_size: int, total_size: int):
            if total_size > 0:
                downloaded = block_count * block_size / 1024 / 1024
                total = total_size / 1024 / 1024
                sys.stdout.write(f"\r    {downloaded:.0f}/{total:.0f} MB")
                sys.stdout.flush()

        urllib.request.urlretrieve(url, dest, reporthook=report)  # type: ignore
        print(f"\r    Done: {os.path.getsize(dest) / 1024 / 1024:.0f} MB")
    except Exception as e:
        print(f"  FAILED: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        raise


def download_model(model_key: str) -> None:
    """Download a specific model by key."""
    model = AVAILABLE_MODELS.get(model_key)
    if not model:
        print(f"Unknown model: {model_key}")
        print(f"Available: {', '.join(AVAILABLE_MODELS.keys())}")
        return

    os.makedirs(MODELS_DIR, exist_ok=True)

    print(f"\n{'='*50}")
    print(f"Model: {model['name']}")
    print(f"  {model['description']}")
    print(f"{'='*50}")

    # Download .pth
    pth_path = os.path.join(MODELS_DIR, f"{model_key}.pth")
    download_file(model["pth"], pth_path, desc=f"{model_key}.pth")

    # Download .index
    index_name = model.get("rename_index", f"{model_key}.index")
    index_path = os.path.join(MODELS_DIR, index_name)
    download_file(model["index"], index_path, desc=index_name)

    print(f"  ✓ Model '{model_key}' ready at: {MODELS_DIR}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Download RVC v2 voice models for testing")
    parser.add_argument("--model", "-m", default="all", help="Model key (default, emu, or all)")
    parser.add_argument("--list", "-l", action="store_true", help="List available models")
    args = parser.parse_args()

    if args.list:
        print("Available models:\n")
        for key, model in AVAILABLE_MODELS.items():
            print(f"  {key:12s} — {model['name']} ({model['size_mb']} MB)")
            print(f"               {model['description']}")
        return

    if args.model == "all":
        for key in AVAILABLE_MODELS:
            download_model(key)
    else:
        download_model(args.model)

    print("Done! Restart the backend to pick up new models.")


if __name__ == "__main__":
    main()
