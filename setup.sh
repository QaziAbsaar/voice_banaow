#!/bin/bash
set -e

echo ""
echo "=== VoiceForge Setup ==="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Install Python 3.10+ from https://python.org"
    exit 1
fi

echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

echo ""
echo "Installing Node.js dependencies..."
npm install

echo ""
echo "=== Setup complete! ==="
echo "Run: npm run dev"
