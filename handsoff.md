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
cd backend && python main.py

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
                                                google_drive.py
                                                demucs_wrapper.py
                                                utils.py
```

### Key Architecture Decisions

- **No Electron** — Pure web app. Two processes: Vite dev server + FastAPI backend.
- **Backend is required** — Frontend cannot function without backend. Health-checked every 5s.
- **CORS enabled** — `allow_origins=["*"]` on FastAPI.
- **Production mode** — `npm run build` outputs to `dist/`, FastAPI serves it as static files at `http://localhost:8765`.
- **All audio processing is server-side** — Frontend only handles uploads, playback, and downloads via browser APIs.
- **Training is async** — Runs in background thread, API stays responsive. Health check never blocks.
- **Google Drive bridge** — Training data uploaded to Drive, Colab trains from Drive, model imported back from Drive.

---

## Pages & Routes

| Path | Component | Requires Backend | Description |
|---|---|---|---|
| `/` | Home.jsx | No | Landing page, hero, how-it-works, features, status footer |
| `/train` | Train.jsx | Yes | Upload MP3s → One-click training with Drive + Colab |
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

### Google Drive Auth

```
GET /auth/google/url
→ { "url": str }   # OAuth consent URL

GET /auth/google/callback?code=xxx&state=yyy
→ Redirect to http://localhost:5173/train (after auth)

GET /auth/google/status
→ { "authenticated": bool }

POST /auth/google/revoke
→ { "revoked": bool }
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

### One-Click Training (Background)

```
POST /training/start
  FormData: source_files[], model_name, has_background_music
→ { "task_id": str, "model_name": str, "files_saved": int }

GET /training/start/status/{task_id}
→ { "status": "processing"|"done"|"error",
     "progress": str,
     "result": { model_name, total_duration_minutes, total_size_mb,
                 colab_url, drive_file_id, ... } | null,
     "error": str | null }

POST /training/import-model
  FormData: model_name
→ { "imported": [str], "model_name": str, "message": str }
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

## Training Flow (One-Click)

The simplified training flow for non-technical users:

1. **Upload** — Drag-drop MP3/WAV files, name model, toggle audio source (full songs vs clean vocals)
2. **Start Training** — Button triggers background pipeline:
   - Saves files → runs Demucs (if needed, in background thread) → packages zip → uploads to Drive → returns Colab URL
3. **Open Colab** — Button opens pre-configured notebook (auto-detects model from Drive folder)
4. **Run All in Colab** — User clicks Runtime → Run all (30-60 min on T4 GPU)
5. **Import Model** — Button scans Drive for .pth/.index, downloads to /models folder

**Google Drive auth required once.** OAuth flow: popup → consent → token saved in `backend/token.pickle`.

### Background Task System

Heavy processing (Demucs) runs in `threading.Thread` with status polling:
- `_training_tasks` dict (in-memory) stores task_id → { status, progress, result, error }
- Frontend polls every 2s via `GET /training/start/status/{task_id}`
- Server never blocks — health check stays responsive
- Timeout: Demucs subprocess has 1800s (30 min) limit

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

**4-step wizard with step indicator:**

| Step | State | Description |
|---|---|---|
| Upload | `upload` | Drop zone, model name input, audio source toggle, Start Training button |
| Drive Auth | `drive-auth` | Google sign-in prompt (shown if not authenticated) |
| Training | `training` | Progress spinner with live status message, polls task every 2s |
| Colab | `colab` | "Open Colab" button + "Import Model" button |
| Done | `done` | Success with "Go to Convert" + "Train Another" buttons |
| Error | `error` | Persistent error screen with error message and suggestions |

Key behaviors:
- **Start Training** disabled when no files selected, auto-generates model name if blank
- **Drive auth check** on mount, blocks training if not authenticated
- **Polling** runs `GET /training/start/status/{task_id}` every 2s with 5s timeout
- **Error handling** — shows persistent error screen with common causes (CPU timeout, format, etc.) instead of flash-toast + silent redirect
- **Import model** — `POST /training/import-model`, scans Drive for .pth + .index

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

### TTS.jsx

Same two-column layout as Convert:

**Left column:**
- Text area (character + word count)
- Speech Settings — TTS engine (auto/gtts/xtts), Language dropdown (13 languages)
- Reference Audio upload (only shown when XTTS selected)
- Target Voice — model dropdown
- RVC params (same 4 as Convert)
- Generate Speech button

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

- Runs `demucs_wrapper.py` (NOT `python -m demucs` directly) via subprocess
- Wrapper monkey-patches `torchaudio.load` and `torchaudio.save` with soundfile to bypass torchcodec dependency
- Output: `{output_dir}/htdemucs/{filename}/vocals.wav` and `no_vocals.wav`
- Gets duration via `librosa.get_duration`
- Timeout: 1800s (30 min) — CPU Demucs is slow
- Errors: captures stderr, returns RuntimeError with details

### demucs_wrapper.py

Created to fix `torchcodec` import error with torchaudio 2.11+:
- Patches `torchaudio.load` → soundfile read
- Patches `torchaudio.save` → soundfile write (accepts **kwargs for encoding/bits_per_sample)
- Must be used as subprocess entry point instead of `python -m demucs`

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

### google_drive.py

OAuth + Drive operations module:
- **OAuth flow:** PKCE code_verifier persisted in `.flow_cache/state_*.json` between auth URL and callback
- **Auth URL:** `get_auth_url(redirect_uri)` → returns consent URL with state
- **Callback:** `handle_callback(code, state, redirect_uri)` → exchanges code, saves token to `token.pickle`
- **Token refresh:** Automatic via `google.auth.transport.requests.Request` refresh flow
- **Folder management:** `get_voiceforge_root()` → creates/finds `VoiceForge/` folder, `get_model_folder(name)` → creates/finds subfolder
- **Upload:** `upload_file(local_path, folder_id)` → resumable upload to Drive
- **Scan:** `scan_model_folder(name)` → lists .pth + .index files under `VoiceForge/{name}/`
- **Download:** `download_file(file_id, dest_path)` → downloads to local path
- **Revoke:** `revoke_auth()` → deletes token.pickle

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

Auto-run notebook with form parameters.  
URL: `https://colab.research.google.com/github/QaziAbsaar/voice_banaow/blob/main/colab/voiceforge_train.ipynb`

**Notebook cells (Run All order):**

| # | Cell | What it does |
|---|---|---|
| 1 | **Settings** | `GDRIVE_FILE_ID` + `MODEL_NAME` params |
| 2 | **Mount Drive** | `google.colab.drive.mount()` |
| 3 | **Auto-detect** | If `MODEL_NAME` is default, scans `Drive/VoiceForge/` for latest folder |
| 4 | System deps | apt-get: libsndfile1-dev, ffmpeg, unzip |
| 5 | **Download** | Checks Drive for zip at `VoiceForge/{MODEL_NAME}/`, falls back to manual upload |
| 6 | Clone RVC | `git clone RVC-WebUI` |
| 7 | Install deps | pip install individual packages (skip fairseq) |
| 8 | Pretrained | Download hubert, rmvpe, f0G40k, f0D40k from HuggingFace |
| 9 | **Preprocess** | `preprocess.py` → resample to 16kHz |
| 10 | Extract f0 | `extract_f0_print.py` |
| 11 | Extract features | `extract_feature_print.py` on CUDA |
| 12 | **Train** | `train.py` (30-60 min, T4 GPU) — args: -e, -sr 16000, -f0 1, -bs 4, -g 0, -te 100, -se 20 |
| 13 | Generate index | `tools/infer/train-index.py` |
| 14 | **Export to Drive** | Copy .pth + .index to `MyDrive/VoiceForge/{MODEL_NAME}/` |

**Key feature:** Auto-detects model name from Drive folder (new cell after Drive mount). User just clicks Run All.

### Known RVC Repository Structure

After cloning RVC-WebUI:
```
/content/RVC-WebUI/
├── infer/modules/train/
│   ├── preprocess.py              # Resampling
│   ├── extract/extract_f0_print.py   # Pitch extraction
│   ├── extract_feature_print.py      # Hubert feature extraction
│   └── train.py                   # Main training script
├── tools/infer/
│   ├── train-index.py             # Index file generation
│   └── train-index-v2.py
├── requirements.txt               # Pip deps (fairseq often fails — skip it)
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
soundfile, pydub, ffmpeg-python, numpy, aiofiles, gtts,
python-dotenv, google-auth-oauthlib, google-auth-httplib2,
google-api-python-client
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
│   ├── main.py           # FastAPI app + all routes
│   ├── demucs_engine.py  # Demucs vocal separation (uses wrapper)
│   ├── demucs_wrapper.py # torchaudio patch for soundfile backend
│   ├── rvc_engine.py     # RVC voice conversion
│   ├── tts_engine.py     # Text-to-speech (gTTS/XTTS)
│   ├── colab_package.py  # Training data zip packaging
│   ├── google_drive.py   # OAuth + Drive upload/scan/download
│   ├── utils.py          # Audio utilities
│   ├── requirements.txt
│   ├── .env              # Google OAuth credentials
│   ├── token.pickle      # Drive auth token (generated)
│   └── .flow_cache/      # PKCE state cache (generated)
├── colab/             # Custom Colab training notebook
│   └── voiceforge_train.ipynb
├── src/               # React frontend (pages + components)
├── models/            # Drop .pth + .index files here
├── audio_output/      # Converted WAV files served via /audio/
├── training_data/
│   ├── raw/           # Uploaded source audio
│   └── vocals/        # Demucs-extracted clean vocals
├── temp/              # Temporary processing directory
├── dist/              # Built frontend (npm run build)
├── package.json
├── vite.config.js
├── tailwind.config.js
├── index.html
├── handsoff.md
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
- [x] Demucs vocal separation (via soundfile-patched wrapper)
- [x] gTTS TTS pipeline
- [x] Colab packaging + zip download
- [x] Audio playback in browser
- [x] WAV + MP3 download
- [x] Custom Colab notebook with Run All
- [x] Audio source toggle (has music / clean vocals)
- [x] 404 page
- [x] Google Drive OAuth (PKCE flow, token refresh)
- [x] Drive upload / scan / download
- [x] One-click training in background thread (no server blocking)
- [x] Training status polling (2s interval with progress messages)
- [x] Auto-import model from Drive to /models
- [x] Colab notebook auto-detects model name from Drive folder
- [x] Persistent error screen (instead of flash-toast + silent redirect)

### Needs Manual Setup
- [ ] `pip install rvc-python` — required for Convert + TTS pages to work
- [ ] Commit + push to GitHub — custom Colab notebook URL won't work until repo is public
- [ ] Google Cloud Project OAuth consent screen — add test users for Drive auth

### Known Issues
- **Demucs is slow on CPU** (2-5 min per song). GPU is 10x faster. Timeout set to 30 min.
- **torchcodec requires ffmpeg shared libs** — WSL2 doesn't have them. Workaround: `demucs_wrapper.py` patches torchaudio to use soundfile.
- **torchaudio 2.11+ hard-requires torchcodec** — downgrading may help if ffmpeg shared libs are available.
- **fairseq in RVC requirements.txt fails to build on Colab** — must install deps individually.
- **Electron removed** — No file-system access from browser. "Open models folder" replaced with text instructions.
- **Google OAuth** — App in testing mode, needs test user email whitelisted. Publish to production for public use.
- **Colab URL** — `#model_name=xxx` fragment causes Colab JS crash. Removed — auto-detect from Drive instead.

---

## Git Workflow

```bash
# Add changes
git add -A

# Commit
git commit -m "feat: descriptive message"

# Push (Colab notebook URL becomes live after push)
git push origin main
```
