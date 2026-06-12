const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let splashWindow = null;
let pythonProcess = null;

const BACKEND_PORT = 8765;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const DEV_URL = 'http://localhost:5173';

// ── Resolve paths ──────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const projectRoot = path.resolve(__dirname, '..');

function getPythonCommand() {
  const venvPython = process.platform === 'win32'
    ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'venv', 'bin', 'python3');

  // Prefer venv python, fall back to system python
  try {
    require('fs').accessSync(venvPython);
    return venvPython;
  } catch {
    return process.platform === 'win32' ? 'python' : 'python3';
  }
}

// ── Splash window ──────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: { nodeIntegration: false },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <head><style>
      body {
        margin:0; display:flex; align-items:center; justify-content:center;
        height:100vh; background:rgba(10,10,15,0.95);
        font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color:white; flex-direction:column;
      }
      h1 { font-size:28px; font-weight:600; margin-bottom:8px; color:#7c3aed; }
      p { font-size:14px; color:#8888aa; }
      .spinner { margin-top:24px; width:32px; height:32px; border:3px solid #2a2a3a;
        border-top-color:#7c3aed; border-radius:50%; animation:spin 0.8s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
    </style></head>
    <body>
      <h1>VoiceForge</h1>
      <p>Starting backend server...</p>
      <div class="spinner"></div>
    </body>
    </html>
  `);
}

// ── Main window ────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 600,
    frame: true,
    show: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(projectRoot, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── Backend health check ───────────────────────────────────────────────────
function checkBackend(retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function poll() {
      attempts++;
      const req = http.get(`${BACKEND_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < retries) {
          setTimeout(poll, interval);
        } else {
          reject(new Error('Backend health check failed'));
        }
      });

      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(poll, interval);
        } else {
          reject(new Error(`Backend not reachable after ${retries} attempts`));
        }
      });

      req.end();
    }

    poll();
  });
}

// ── Start backend ──────────────────────────────────────────────────────────
function startBackend() {
  const pythonCmd = getPythonCommand();
  const backendScript = path.join(projectRoot, 'backend', 'main.py');

  console.log(`Starting backend: ${pythonCmd} ${backendScript}`);

  pythonProcess = spawn(pythonCmd, [backendScript], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    pythonProcess = null;
  });
}

// ── Kill lingering Demucs processes ────────────────────────────────────────
function killDemucsProcesses() {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM python.exe /FI "CMDLINE LIKE %demucs%" 2>nul', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "demucs" 2>/dev/null', { stdio: 'ignore' });
    }
  } catch {
    // Ignore
  }
}

// ── IPC Handlers ───────────────────────────────────────────────────────────
ipcMain.handle('open-models-folder', () => {
  const modelsPath = path.join(projectRoot, 'models');
  shell.openPath(modelsPath);
});

ipcMain.handle('open-output-folder', () => {
  const outputPath = path.join(projectRoot, 'audio_output');
  shell.openPath(outputPath);
});

ipcMain.handle('get-app-path', () => {
  return projectRoot;
});

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplashWindow();
  startBackend();

  try {
    await checkBackend(30, 1000);
    console.log('Backend is ready');
  } catch (err) {
    console.error('Backend failed to start:', err.message);
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  killDemucsProcesses();

  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    // Force kill after 3 seconds if still alive
    setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGKILL');
      }
    }, 3000);
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killDemucsProcesses();
  if (pythonProcess) {
    pythonProcess.kill('SIGKILL');
  }
});
