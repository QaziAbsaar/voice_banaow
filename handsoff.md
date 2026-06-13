# VoiceForge — Hands-Off Document

## Project Overview

Voice cloning web app. Train on singer MP3s using RVC v2, convert any vocal to sound like them. Also supports TTS (text → speech → target voice).

**Stack:** React 18 + Vite + TailwindCSS (frontend) → FastAPI (backend, port 8765)  
**Audio:** Demucs (vocal separation), RVC v2 (voice conversion), librosa, ffmpeg  
**Desktop:** Was Electron, now pure web app (browser-based)

---

## Quick Start

```bash
# Terminal 1 — Backend (port 8765)
python backend/main.py
# Or: ./venv/bin/python backend/main.py

# Terminal 2 — Frontend (port 5173)
npm run dev

# Open: http://localhost:5173
```

---

## Architecture

```
Browser (React SPA)  ←→  FastAPI (port 8765)  ←→  Python engines
       :5173                  |                        |
                       /models/                 demucs_engine.py
                       /audio_output/           rvc_engine.py
                       /training_data/          tts_engine.py
                                                colab_package.py
                                                utils.py
```

### Key Architecture Decisions

- **No Electron** — Pure web app. Two processes: Vite dev server + FastAPI backend.
- **Backend is required** — Frontend cannot function without backend. Health-checked every 5s.
- **CORS enabled** — `allow_origins=["*"]` on FastAPI.
- **Production mode** — `npm run build` outputs to `dist/`, FastAPI serves it as static files at `http://localhost:8765`.
- **All audio processing is server-side** — Frontend only handles uploads, playback, and downloads via browser APIs.

---

## Pages & Routes

| Path | Component | Requires Backend | Description |
|---|---|---|---|
| `/` | Home.jsx | No | Landing page, hero, how-it-works, features, status footer |
| `/train` | Train.jsx | Yes | Upload MP3s, Demucs extraction, Colab packaging |
| `/convert` | Convert.jsx | Yes | Voice conversion with parameter controls |
| `/tts` | TTS.jsx | Yes | Text-to-speech → RVC pipeline |
| `/models` | Models.jsx | No | Model card grid, delete, refresh |
| `*` | NotFound.jsx | No | 404 page |

### Offline Behavior

Pages marked "Requires Backend" show a full-screen overlay when backend is offline:
```
[AlertCircle icon]
Backend is not running
1. Open terminal in VoiceForge folder
2. Run: python backend/main.py
3. Wait for: Uvicorn running on http://0.0.0.0:8765
4. Refresh this page
[Check Again] button
```

Home and Models pages are always accessible without backend.

---

## Backend API (FastAPI — port 8765)

### Health

```
GET /health
→ { "status": "ok", "models_available": int }
```

### Models

```
GET /models/list
→ { "models": [{ "name": str, "has_index": bool, "size_mb": float }] }

GET /models/path
→ { "path": str }

DELETE /models/{model_name}
→ { "deleted": true, "files_removed": [str] }
```

### Vocal Separation (Demucs)

```
POST /vocals/separate
  FormData: source_audio (file)
→ { "vocals_path": str, "no_vocals_path": str|null, "duration": float }
```

### Voice Conversion (RVC)

```
POST /singing/convert
  FormData: source_audio, model_name, pitch_shift, index_rate,
            filter_radius, f0_method
→ { "output_path": str, "duration": float, "model_used": str, "pitch_shift": int }
```

### Text-to-Speech

```
POST /tts/synthesize
  FormData: text, model_name, tts_backend, language,
            pitch_shift, index_rate, filter_radius, f0_method,
            reference_audio (optional, for XTTS)
→ { "output_path": str, "duration": float, "model_used": str, "text": str }
```

### Training Data Preparation

```
POST /training/prepare
  FormData: source_files[] (multiple), has_background_music (bool, default true)
→ { "prepared_files": [str], "total_duration_minutes": float,
    "ready_for_training": bool, "errors": [str] }

POST /training/package
→ { "zip_name": str, "total_size_mb": float, "total_duration_minutes": float,
    "total_files": int, "ready": bool, "colab_url": str }

GET /training/package/download
→ Zip file download
```

### Audio Serving

```
GET /audio/{filename}
→ WAV file (static file from audio_output/)

POST /audio/convert-to-mp3
  JSON: { "filename": str }
→ MP3 file download (Content-Disposition: attachment)
```

---

## Frontend Components

### App.jsx (Root)

- **BackendProvider** wraps everything — polls GET /health every 5s
- **Top navbar** (sticky, 60px, `bg-forge-bg` with `border-b border-forge-border`):
  - Left: "VoiceForge" logo (NavLink to `/`)
  - Center: nav links — Home, Train, Convert, TTS, Models
  - Right: status dot (green/red/yellow) + label
- **Offline overlay** for protected pages
- **Toast system** (bottom-right, auto-dismiss 4s)
- **Routes**: `/` → Home, `/train` → Train, `/convert` → Convert, `/tts` → TTS, `/models` → Models, `*` → 404

### BackendContext.jsx

```jsx
// Context value:
{ status: 'checking' | 'ready' | 'offline' | 'error',
  checkHealth: () => Promise<bool>,
  api: 'http://localhost:8765' }
```

### Home.jsx

- Hero section: "Clone Any **Singer's Voice**" with two CTA buttons
- "How It Works" — 4 steps in a horizontal row (Upload MP3s → Extract Vocals → Train Model → Convert)
- "Powered By" — 3 feature cards (RVC v2, Demucs, Local & Private)
- Footer: backend status bar with version + health dot

### Train.jsx

**Section 1 — Upload & Prepare:**
- Drag-drop zone for MP3/WAV files
- Audio source toggle: "Full songs with music" (runs Demucs, slow) vs "Clean vocals only" (instant)
- File list with size, remove button
- "Prepare Vocals" button → POST /training/prepare
- Result: duration, ready_for_training indicator, file list, errors

**Section 2 — Package for Colab:**
- "Package for Colab" button → POST /training/package
- Package info: file count, size MB, duration minutes
- Download .zip button
- Step-by-step Drive upload instructions (numbered list)
- "Open Custom Notebook" button → window.open(colab_url)
- Instruction box: drop .pth/.index into /models folder

**Section 3 — Manual Training (Alternative):**
- Link to standard RVC Colab notebook

### Convert.jsx

Two-column layout:

**Left column:**
- Source Audio — drag-drop, file info, preview audio player, "Separate vocals first" toggle
- Voice Model — dropdown from GET /models/list, refresh button, model metadata
- Parameters — 4 sliders/selects:
  - Pitch Shift (-24 to +24, default 0)
  - Index Rate (0.0 to 1.0, step 0.05, default 0.75)
  - Filter Radius (1 to 7, default 3)
  - F0 Method (rmvpe/crepe/harvest/pm)
- Convert button (disabled without source + model)

**Right column:**
- Placeholder before conversion
- After: audio player, stats (duration/model/pitch), Download WAV + Download MP3 buttons

### TTS.jsx

Same two-column layout as Convert:

**Left column:**
- Text area (character + word count)
- Speech Settings — TTS engine (auto/gtts/xtts), Language dropdown (13 languages)
- Reference Audio upload (only shown when XTTS selected)
- Target Voice — model dropdown
- RVC params (same 4 as Convert)
- Generate Speech button

**Right column:**
- Placeholder before generation with "How it works" box
- After: audio player, spoken text display, Download button

### Models.jsx

- Header: title + model count + Refresh button
- States:
  - **Loading**: centered spinner
  - **Empty**: icon, message, numbered instructions, "Drop .pth and .index files" box
  - **Has models**: 2-3 column card grid
- Model card: icon, name, size MB, index status (green ✓ or yellow warning), Delete button
- Delete flow: click Delete → shows Confirm/Cancel buttons → deletes via API

### NotFound.jsx

Centered "404 — Page not found" with "Back to Home" button.

---

## Styling System

### Color Scheme

| Token | Hex | Usage |
|---|---|---|
| forge-bg | `#0a0a0f` | Base background |
| forge-card | `#111118` | Card backgrounds |
| forge-input | `#1a1a24` | Input fields |
| forge-border | `#2a2a3a` | Borders |
| forge-accent | `#7c3aed` | Violet accent (buttons, active nav, links) |
| forge-accent-hover | `#6d28d9` | Darker accent hover |
| forge-text | `#f0f0f5` | Primary text |
| forge-text-secondary | `#8888aa` | Secondary text |
| forge-success | `#10b981` | Success indicators |
| forge-error | `#ef4444` | Error indicators |

### Tailwind Config

All custom colors defined in `tailwind.config.js` under `theme.extend.colors.forge.*`.  
Dark mode: `class` strategy (always on via `<html class="dark">`).

### Shared Styles (index.css)

- Custom scrollbar (thin, dark)
- Custom range sliders (violet thumb, dynamic fill gradient via `--fill` CSS var)
- Dropzone (dashed border, violet on hover, green when file loaded)
- Toast animation (slide in right, fade out)
- Spinner (violet, 0.6s)

```css
input[type="range"].range-fill {
  background: linear-gradient(to right, #7c3aed 0%, #7c3aed var(--fill),
              #1a1a24 var(--fill), #1a1a24 100%);
}
```

### Component Patterns

- Cards: `rounded-xl border border-forge-border bg-forge-card p-6`
- Buttons (primary): `bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover`
- Buttons (secondary): `bg-forge-input border border-forge-border text-forge-text`
- Inputs: `bg-forge-input border border-forge-border rounded-lg px-3 py-2.5`
- Sliders: `w-full range-fill` with inline `style={sliderFill(val, min, max)}`

---

## Backend Engines

### demucs_engine.py

```python
def separate_vocals(input_path: str, output_dir: str) -> dict
```

- Runs `python -m demucs --two-stems=vocals -n htdemucs -o {output_dir} {input_path}`
- Output: `{output_dir}/htdemucs/{filename}/vocals.wav` and `no_vocals.wav`
- Gets duration via `librosa.get_duration`
- Timeout: 600s (10 min)
- Errors: captures stderr, returns RuntimeError with details

### rvc_engine.py

```python
def convert_voice(source_audio_path, model_name, output_path, pitch_shift=0,
                  index_rate=0.75, filter_radius=3, f0_method="rmvpe") -> dict
```

- Tries `from rvc_python.infer import RVCInference`
- Falls back: raises HTTPException 501 telling user to `pip install rvc-python`
- LRU model cache (max 3 models) — `_model_cache` dict + `_model_cache_order` list
- Device detection: CUDA if available, else CPU (cached via `@lru_cache`)
- Preprocesses input to 16kHz mono WAV via librosa before inference
- Parameter clamping: pitch [-24,24], index [0,1], filter [1,7], f0 validated against whitelist

### tts_engine.py

```python
def synthesize(text, output_path, tts_engine="auto", speaker_wav=None, language="en") -> str
def detect_tts_backend() -> str
```

- **gTTS** (primary): `gtts.gTTS(text, lang=language)`. Lightweight, needs internet.
- **XTTS** (optional): `TTS("tts_models/multilingual/multi-dataset/xtts_v2")`. High quality voice cloning from reference audio. Needs `pip install TTS` (~2GB model download).
- Backend detection on startup: tries XTTS first, falls back to gTTS
- Status reported in health log: `TTS: ✓ (gtts)` or `TTS: ✗`

### colab_package.py

```python
def package_for_colab(vocals_dir: str, output_dir: str) -> dict
```

- Scans `training_data/vocals/` for `vocals.wav` in subdirectories
- Falls back to `*.wav` in entire tree (excluding `no_vocals`)
- Creates zip: `voiceforge_dataset_{YYYYMMDD}.zip`
- Returns: zip_path, zip_name, file count, size MB, duration minutes
- If no files: returns error message

### utils.py

```python
def preprocess_audio(input_path, output_path, target_sr=16000) -> str
def get_audio_duration(path) -> float
def check_audio_quality(path) -> dict  # snr_db, duration, rating (EXCELLENT/GOOD/FAIR/POOR), issues
def generate_output_filename(prefix="output", ext=".wav") -> str
def ensure_dir(path) -> str
def convert_to_mp3(wav_path, mp3_path, bitrate="192k") -> str
```

---

## Colab Training

### Custom Notebook: `colab/voiceforge_train.ipynb`

Auto-run notebook with form parameters. URL: `https://colab.research.google.com/github/QaziAbsaar/voice_banaow/blob/main/colab/voiceforge_train.ipynb`

**Notebook cells (Run All order):**

| # | Cell | What it does |
|---|---|---|
| 1 | Form | `GDRIVE_FILE_ID` + `MODEL_NAME` params |
| 2 | Mount Drive | `google.colab.drive.mount()` |
| 3 | System deps | apt-get: libsndfile1-dev, ffmpeg, unzip |
| 4 | Download data | gdown from Drive → unzip |
| 5 | Clone RVC | git clone RVC-WebUI |
| 6 | Install deps | pip install individual packages (skip fairseq) |
| 7 | Pretrained | Download hubert, rmvpe, f0G40k, f0D40k from HuggingFace |
| 8 | Preprocess | `preprocess.py` → resample to 16kHz |
| 9 | Extract f0 | `extract_f0_print.py` |
| 10 | Extract features | `extract_feature_print.py` on CUDA |
| 11 | Train | `train.py` (30-60 min, T4 GPU) — args: -e, -sr 16000, -f0 1, -bs 4, -g 0, -te 100, -se 20 |
| 12 | Generate index | `tools/infer/train-index.py` |
| 13 | Export to Drive | Copy .pth + .index to `MyDrive/VoiceForge/{MODEL_NAME}/` |

**Custom notebook URL in app:** `colab.research.google.com/github/QaziAbsaar/voice_banaow/blob/main/colab/voiceforge_train.ipynb`  
**Standard RVC notebook URL:** `colab.research.google.com/github/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/Retrieval_based_Voice_Conversion_WebUI_v2.ipynb`

### Known RVC Repository Structure

After cloning RVC-WebUI:
```
/content/RVC-WebUI/
├── infer/modules/train/
│   ├── preprocess.py          # Resampling
│   ├── extract/extract_f0_print.py   # Pitch extraction
│   ├── extract_feature_print.py      # Hubert feature extraction
│   └── train.py               # Main training script
├── tools/infer/
│   ├── train-index.py         # Index file generation
│   └── train-index-v2.py
├── requirements.txt           # Pip deps (fairseq often fails — skip it)
```

### Training Parameters

| Flag | Value | Purpose |
|---|---|---|
| -e | /content/experiments/{NAME} | Experiment output directory |
| -sr | 16000 | Sample rate |
| -f0 | 1 | Enable pitch guidance |
| -bs | 4 | Batch size (reduce if OOM) |
| -g | 0 | GPU index |
| -te | 100 | Total epochs |
| -se | 20 | Save every N epochs |
| -pg | /content/assets/pretrained/f0G40k.pth | Pretrained generator |
| -pd | /content/assets/pretrained/f0D40k.pth | Pretrained discriminator |

---

## Required Python Packages

### Core (requirements.txt)
```
fastapi, uvicorn, python-multipart, demucs, librosa,
soundfile, pydub, ffmpeg-python, numpy, aiofiles, gtts
```

### Optional (manual install)
```
pip install rvc-python           # RVC inference (required for Convert + TTS)
pip install TTS                  # XTTS voice cloning TTS (~2GB model)
```

### System Requirements
- ffmpeg (system-wide, in PATH)
- Python 3.10+
- Node.js 18+
- NVIDIA GPU + CUDA (recommended, not required)

---

## File System Layout

```
voiceforge/
├── backend/          # FastAPI + all Python engines
├── colab/            # Custom Colab training notebook
├── src/              # React frontend (pages + components)
├── models/           # Drop .pth + .index files here
├── audio_output/     # Converted WAV files served via /audio/
├── training_data/
│   ├── raw/          # Uploaded source audio
│   └── vocals/       # Demucs-extracted clean vocals
├── temp/             # Temporary processing directory
├── dist/             # Built frontend (npm run build)
├── package.json
├── vite.config.js
├── tailwind.config.js
├── index.html
└── README.md
```

---

## Status & Known Issues

### Working
- [x] Frontend serves at http://localhost:5173
- [x] Backend serves at http://localhost:8765
- [x] Health check polling (5s interval)
- [x] Offline overlay for protected pages
- [x] Model listing, deletion, refresh
- [x] Demucs vocal separation
- [x] gTTS TTS pipeline
- [x] Colab packaging + zip download
- [x] Audio playback in browser
- [x] WAV + MP3 download
- [x] Custom Colab notebook with Run All
- [x] Audio source toggle (has music / clean vocals)
- [x] 404 page

### Needs Manual Setup
- [ ] `pip install rvc-python` — required for Convert + TTS pages to work
- [ ] Commit + push to GitHub — custom Colab notebook URL won't work until repo is public

### Known Issues
- Demucs is slow on CPU (2-5 min per song). GPU is 10x faster.
- fairseq in RVC requirements.txt fails to build on Colab — must install deps individually
- Electron removed. No file-system access from browser. "Open models folder" replaced with text instructions.

---

## Git Workflow

```bash
# Add changes
git add -A

# Commit
git commit -m "feat: migrate from Electron to web app, add TTS + Colab packaging"

# Push (Colab notebook URL becomes live after push)
git push origin main
```
