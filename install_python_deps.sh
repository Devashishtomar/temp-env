#!/bin/bash

echo "Setting up Python dependencies for YouTube Shorts Generator..."

# Activate virtual environment
source .venv/bin/activate

echo "Upgrading pip, setuptools, and wheel..."
pip install --upgrade pip setuptools wheel

echo "Installing numpy (compatible version)..."
pip install "numpy<2"

echo "Attempting to install openai-whisper..."
pip install openai-whisper

if [ $? -eq 0 ]; then
    echo "✅ Whisper installed successfully!"
else
    echo "⚠️  Whisper installation failed. This is likely due to Python 3.13 compatibility issues."
    echo "The application will use fallback transcription instead."
    echo ""
    echo "To fix this, you can:"
    echo "1. Use Python 3.11 or 3.12 instead of 3.13"
    echo "2. Wait for whisper to support Python 3.13"
    echo "3. Use the fallback transcription (current behavior)"
fi

echo "Python dependencies setup complete!" 