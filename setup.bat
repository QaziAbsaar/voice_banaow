@echo off
echo.
echo === VoiceForge Setup ===
echo.
python --version >nul 2>&1 || (
  echo Python not found. Install Python 3.10+ from https://python.org
  pause
  exit /b 1
)
echo Creating virtual environment...
python -m venv venv
call venv\Scripts\activate
echo Installing Python dependencies...
pip install -r backend\requirements.txt
echo.
echo Installing Node.js dependencies...
call npm install
echo.
echo === Setup complete! ===
echo Run: npm run dev
pause
