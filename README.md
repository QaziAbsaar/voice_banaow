# VoiceForge

> Clone any singer's voice with AI — RVC v2 based voice conversion web app.

Train on MP3s of any singer, then convert any vocal recording to sound like them. Everything runs locally with optional Google Colab GPU training.

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **ffmpeg** — Install from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
- **(Recommended)** NVIDIA GPU with CUDA for faster Demucs + RVC inference

### Setup

```bash
git clone <repo> voiceforge
cd voiceforge

# Python setup
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

# JS setup
npm install
```

Or run `./setup.sh` (Mac/Linux) or `setup.bat` (Windows).

### Run (two terminals)

```bash
# Terminal 1 — Backend (FastAPI on port 8765)
python backend/main.py
# Or: ./venv/bin/python backend/main.py

# Terminal 2 — Frontend (Vite on port 5173)
npm run dev
```

Open **http://localhost:5173** in your browser.

### Or run in production

```bash
npm run build       # Builds frontend to dist/
python backend/main.py  # Backend serves both API + frontend at http://localhost:8765
```

## How to Train a Voice Model

### Step 1: Upload MP3s
Go to **Train Voice** page. Drag and drop MP3 files of your target singer (5-20 minutes recommended). Full songs with music are fine.

### Step 2: Extract Vocals
Click **Prepare Vocals**. The app runs Demucs to separate vocals from music for each file. This takes 1-3 minutes per song.

Wait for the green "Ready for training" confirmation.

### Step 3: Train on Colab
Click **Open Training Notebook**. This opens the RVC Colab notebook.

In Colab:
1. Run the setup cells
2. Upload your vocal data (zip the `/training_data/vocals/` folder)
3. Start training (takes 30-60 minutes on free GPU)
4. Download the trained files: `{model_name}.pth` and `{model_name}.index`

### Step 4: Add Model to App
Click **Open Models Folder** and drop the `.pth` and `.index` files there. The model appears automatically on the Models and Convert pages.

## How to Convert Audio

1. Go to **Convert** page
2. Upload vocals you want to convert (your singing or any audio)
3. Select your trained model from the dropdown
4. Adjust parameters:
   - **Pitch Shift**: +8 to +12 for male→NFAK style
   - **Index Rate**: Higher = more like target
   - **Filter Radius**: Higher = smoother
   - **F0 Method**: rmvpe is best for singing
5. Click **Convert**
6. Listen and download

## Troubleshooting

### rvc-python not installed
```bash
pip install rvc-python
```
If installation fails, see [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI) for manual setup.

### ffmpeg not found
Install ffmpeg:
- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt install ffmpeg`
- **Windows**: Download from https://ffmpeg.org/download.html and add to PATH

### CUDA out of memory
- Close other GPU-intensive apps
- Restart the backend
- Set environment variable: `PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128`

### Demucs takes too long
First run downloads the model (200MB). Subsequent runs are faster. On CPU, expect 2-3 minutes per 5-minute song. GPU is ~10x faster.

### Backend won't start
Check port 8765 isn't in use:
```bash
lsof -i :8765   # Mac/Linux
netstat -ano | findstr :8765   # Windows
```

## Adding Models

Place `.pth` and `.index` files in the `/models` directory:
- `models/nfak.pth`
- `models/nfak.index`

The app scans this directory on the Models page and Convert page. Click "Refresh" to re-scan.

## Project Structure

```
voiceforge/
├── electron/          # Electron main process
│   ├── main.js        # Backend spawning, window management, IPC
│   └── preload.js     # contextBridge API
├── src/               # React frontend
│   ├── App.jsx        # Layout, sidebar, routing
│   ├── pages/
│   │   ├── Home.jsx   # Landing page
│   │   ├── Train.jsx  # Upload, Demucs, Colab training
│   │   ├── Convert.jsx # Voice conversion interface
│   │   └── Models.jsx # Model management
│   └── index.css      # Tailwind + custom styles
├── backend/           # FastAPI backend
│   ├── main.py        # API routes
│   ├── demucs_engine.py  # Vocal separation
│   ├── rvc_engine.py     # RVC inference
│   └── utils.py          # Audio preprocessing
├── models/            # Trained .pth and .index files
├── audio_output/      # Converted audio files
├── training_data/     # Vocal preparation output
└── package.json
```

## Tech Stack

- **Frontend**: React 18, TailwindCSS, Vite, Lucide Icons
- **Desktop**: Electron 30
- **Backend**: FastAPI, Uvicorn
- **Audio**: Demucs (vocal separation), RVC (voice conversion), librosa, ffmpeg
- **ML**: PyTorch, rvc-python

## License

MIT
