#!/usr/bin/env python3
import sys
import json
import os
import subprocess
import tempfile
import shutil
import time

# ---------------------------------------------------------------------------
# Audio compression helper
# ---------------------------------------------------------------------------

def compress_audio_for_api(audio_path: str, max_mb: float = 24.0) -> str | None:
    """
    If audio_path exceeds max_mb, compress to a temp mp3 at 64kbps and return its path.
    Caller is responsible for deleting the temp file when done.
    Returns None if compression fails or file is already small enough.
    """
    try:
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        if file_size_mb <= max_mb:
            return None  # No compression needed

        print(f"[compress] File is {file_size_mb:.1f}MB > {max_mb}MB limit, compressing to mp3…", file=sys.stderr)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.close()

        result = subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path,
             "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k",
             tmp.name],
            capture_output=True, text=True,
        )
        if result.returncode == 0 and os.path.exists(tmp.name) and os.path.getsize(tmp.name) > 0:
            compressed_mb = os.path.getsize(tmp.name) / (1024 * 1024)
            print(f"[compress] Compressed to {compressed_mb:.1f}MB → {tmp.name}", file=sys.stderr)
            return tmp.name
        else:
            print(f"[compress] Compression failed: {result.stderr.strip()[:200]}", file=sys.stderr)
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
            return None
    except Exception as e:
        print(f"[compress] Error: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# OpenVINO GPU (kept for compatibility — not used on this machine)
# ---------------------------------------------------------------------------

def transcribe_with_openvino_gpu(audio_path):
    """Import and use the GPU Whisper function"""
    try:
        import sys
        import os
        gpu_script_path = os.path.join(os.path.dirname(__file__), 'whisper_gpu.py')

        import subprocess
        result = subprocess.run(
            [sys.executable, gpu_script_path, audio_path]
        , capture_output=True, text=True, timeout=2500)

        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            return {
                "success": False,
                "error": f"GPU script failed: {result.stderr}"
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"GPU transcription error: {str(e)}"
        }


# ---------------------------------------------------------------------------
# OpenAI Whisper API
# ---------------------------------------------------------------------------

def transcribe_with_openai_api(audio_path, api_key):
    """
    Transcribe audio using OpenAI Whisper API.
    Automatically compresses large files to mp3 before sending.
    """
    try:
        import requests

        print("Using OpenAI Whisper API for transcription...", file=sys.stderr)

        if not os.path.exists(audio_path):
            return {"success": False, "error": f"Audio file not found: {audio_path}"}

        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        print(f"Audio file size: {file_size_mb:.2f} MB", file=sys.stderr)

        # Compress if needed (OpenAI limit is 25MB)
        compressed_path = compress_audio_for_api(audio_path, max_mb=24.0)
        send_path = compressed_path if compressed_path else audio_path

        send_size_mb = os.path.getsize(send_path) / (1024 * 1024)
        if send_size_mb > 25:
            # Even after compression it's too big — split and use chunks
            if compressed_path:
                try:
                    os.unlink(compressed_path)
                except Exception:
                    pass
            return {
                "success": False,
                "error": f"File too large even after compression: {send_size_mb:.1f}MB (max 25MB)"
            }

        url = "https://api.openai.com/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {api_key}"}
        mime = "audio/mpeg" if send_path.endswith(".mp3") else "audio/wav"

        with open(send_path, 'rb') as audio_file:
            files = {'file': (os.path.basename(send_path), audio_file, mime)}
            data = {
                'model': 'whisper-1',
                'response_format': 'verbose_json',
                'timestamp_granularities[]': 'segment'
            }

            print("Sending request to OpenAI API...", file=sys.stderr)
            start_time = time.time()
            response = requests.post(url, headers=headers, files=files, data=data, timeout=2500)
            elapsed = time.time() - start_time
            print(f"OpenAI API response received in {elapsed:.2f} seconds", file=sys.stderr)

        # Clean up
        if compressed_path:
            try:
                os.unlink(compressed_path)
            except Exception:
                pass

        if response.status_code == 200:
            result = response.json()
            print("OpenAI API transcription successful!", file=sys.stderr)

            segments = []
            for segment in result.get('segments', []):
                segments.append({
                    "start": float(segment["start"]),
                    "end": float(segment["end"]),
                    "text": segment["text"].strip()
                })

            return {
                "success": True,
                "transcription": result["text"],
                "segments": segments,
                "language": result.get("language", "unknown")
            }
        else:
            error_msg = f"OpenAI API error: {response.status_code} - {response.text}"
            print(f"OpenAI API failed: {error_msg}", file=sys.stderr)
            return {"success": False, "error": error_msg}

    except Exception as e:
        error_msg = f"OpenAI API error: {str(e)}"
        print(f"OpenAI API exception: {error_msg}", file=sys.stderr)
        return {"success": False, "error": error_msg}


# ---------------------------------------------------------------------------
# Groq Whisper API (fast cloud fallback for large files)
# ---------------------------------------------------------------------------

def transcribe_with_groq_api(audio_path, groq_api_key):
    """
    Transcribe audio using Groq's Whisper API.
    Groq is very fast (~100-300x realtime) and cheap.
    Handles large files by splitting into chunks under 25MB.
    """
    try:
        import requests

        print("Using Groq Whisper API for transcription...", file=sys.stderr)

        if not os.path.exists(audio_path):
            return {"success": False, "error": f"Audio file not found: {audio_path}"}

        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        print(f"[Groq] Audio file size: {file_size_mb:.2f} MB", file=sys.stderr)

        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {groq_api_key}"}

        def _transcribe_file(path: str, offset: float = 0.0) -> dict:
            """Send a single file to Groq and return parsed result."""
            with open(path, 'rb') as f:
                mime = "audio/mpeg" if path.endswith(".mp3") else "audio/wav"
                files = {'file': (os.path.basename(path), f, mime)}
                data = {
                    'model': 'whisper-large-v3-turbo',
                    'response_format': 'verbose_json',
                    'timestamp_granularities[]': 'segment'
                }
                resp = requests.post(url, headers=headers, files=files, data=data, timeout=300)

            if resp.status_code != 200:
                return {"success": False, "error": f"Groq API error {resp.status_code}: {resp.text[:200]}"}

            result = resp.json()
            segments = []
            for seg in result.get('segments', []):
                segments.append({
                    "start": float(seg["start"]) + offset,
                    "end": float(seg["end"]) + offset,
                    "text": seg["text"].strip()
                })
            return {
                "success": True,
                "transcription": result.get("text", ""),
                "segments": segments,
                "language": result.get("language", "unknown")
            }

        # If file is under 24MB, send directly (prefer mp3 compressed)
        compressed_path = compress_audio_for_api(audio_path, max_mb=24.0)
        send_path = compressed_path if compressed_path else audio_path
        send_size_mb = os.path.getsize(send_path) / (1024 * 1024)

        if send_size_mb <= 25:
            print(f"[Groq] Sending {send_size_mb:.1f}MB file to Groq API…", file=sys.stderr)
            start = time.time()
            result = _transcribe_file(send_path)
            elapsed = time.time() - start
            if compressed_path:
                try:
                    os.unlink(compressed_path)
                except Exception:
                    pass
            if result.get("success"):
                print(f"[Groq] ✅ Groq transcription successful in {elapsed:.1f}s!", file=sys.stderr)
            return result

        # File still too large — split into 10-minute chunks and send each
        if compressed_path:
            try:
                os.unlink(compressed_path)
            except Exception:
                pass

        print("[Groq] File too large even after compression, splitting into chunks…", file=sys.stderr)
        chunks = split_audio(audio_path, chunk_duration=600)
        print(f"[Groq] Split into {len(chunks)} chunks", file=sys.stderr)

        all_segments = []
        full_text = ""
        language = "unknown"
        time_offset = 0.0

        for i, chunk_path in enumerate(chunks):
            # Compress each chunk
            comp = compress_audio_for_api(chunk_path, max_mb=24.0)
            send = comp if comp else chunk_path
            print(f"[Groq] Transcribing chunk {i+1}/{len(chunks)}…", file=sys.stderr)
            r = _transcribe_file(send, offset=time_offset)
            if comp:
                try:
                    os.unlink(comp)
                except Exception:
                    pass
            if not r.get("success"):
                return r
            all_segments.extend(r["segments"])
            full_text += r["transcription"] + " "
            language = r.get("language", language)
            time_offset += 600.0
            try:
                os.remove(chunk_path)
            except Exception:
                pass

        # Clean up temp dir from split_audio
        if chunks:
            try:
                shutil.rmtree(os.path.dirname(chunks[0]), ignore_errors=True)
            except Exception:
                pass

        print("✅ Groq Whisper transcription successful!", file=sys.stderr)
        return {
            "success": True,
            "transcription": full_text.strip(),
            "segments": all_segments,
            "language": language
        }

    except Exception as e:
        error_msg = f"Groq API error: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        return {"success": False, "error": error_msg}


# ---------------------------------------------------------------------------
# Local Whisper fallback
# ---------------------------------------------------------------------------

def get_audio_duration(audio_path):
    """Get audio duration using ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception:
        return None

def split_audio(audio_path, chunk_duration=600):
    """Split long audio into smaller chunks"""
    duration = get_audio_duration(audio_path)
    if not duration or duration <= chunk_duration:
        return [audio_path]

    chunks = []
    temp_dir = tempfile.mkdtemp()
    num_chunks = int(duration / chunk_duration) + 1

    for i in range(num_chunks):
        start_time = i * chunk_duration
        chunk_path = os.path.join(temp_dir, f"chunk_{i}.wav")
        cmd = [
            'ffmpeg', '-i', audio_path, '-ss', str(start_time),
            '-t', str(chunk_duration), '-y', chunk_path
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            if os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 0:
                chunks.append(chunk_path)
        except subprocess.CalledProcessError:
            continue

    return chunks


def transcribe_with_local_whisper(audio_path):
    """Transcribe using local Whisper model (CPU fallback — slow)."""
    try:
        import whisper
    except ImportError:
        return {
            "success": False,
            "error": "Whisper is not installed. Please install it with: pip install openai-whisper"
        }

    print("[LocalWhisper] Loading local Whisper model (base)…", file=sys.stderr)
    model = whisper.load_model("base")

    duration = get_audio_duration(audio_path)
    print(f"[LocalWhisper] Audio duration: {duration} seconds", file=sys.stderr)

    if duration and duration > 600:
        print("[LocalWhisper] Long audio detected, splitting into chunks…", file=sys.stderr)
        chunks = split_audio(audio_path)
        print(f"[LocalWhisper] Split into {len(chunks)} chunks", file=sys.stderr)

        all_segments = []
        full_transcription = ""
        time_offset = 0
        result = None

        for i, chunk_path in enumerate(chunks):
            print(f"Transcribing chunk {i+1}/{len(chunks)}...", file=sys.stderr)
            result = model.transcribe(chunk_path)

            for segment in result["segments"]:
                all_segments.append({
                    "start": float(segment["start"]) + time_offset,
                    "end": float(segment["end"]) + time_offset,
                    "text": segment["text"].strip()
                })

            full_transcription += result["text"] + " "
            time_offset += 600

            try:
                os.remove(chunk_path)
            except Exception:
                pass

        try:
            shutil.rmtree(os.path.dirname(chunks[0]))
        except Exception:
            pass

        print("✅ Local Whisper transcription successful!", file=sys.stderr)
        return {
            "success": True,
            "transcription": full_transcription.strip(),
            "segments": all_segments,
            "language": result["language"] if result else "unknown"
        }
    else:
        print("[LocalWhisper] Transcribing audio…", file=sys.stderr)
        result = model.transcribe(audio_path)

        segments = []
        for segment in result["segments"]:
            segments.append({
                "start": float(segment["start"]),
                "end": float(segment["end"]),
                "text": segment["text"].strip()
            })

        print("✅ Local Whisper transcription successful!", file=sys.stderr)
        return {
            "success": True,
            "transcription": result["text"],
            "segments": segments,
            "language": result["language"]
        }


# ---------------------------------------------------------------------------
# Main transcription orchestrator
# ---------------------------------------------------------------------------

def transcribe_audio(audio_path, api_key=None, groq_api_key=None):
    """
    Transcribe audio file using the fastest available method:
      1. OpenVINO GPU (if available)
      2. OpenAI Whisper API (auto-compresses large files to mp3)
      3. Groq Whisper API (very fast cloud, great for large files)
      4. Local Whisper on CPU (slow fallback)
    """
    try:
        if not os.path.exists(audio_path):
            return {"success": False, "error": f"Audio file not found: {audio_path}"}

        # 1. Try OpenVINO GPU
        try:
            print("Attempting OpenVINO GPU Whisper transcription...", file=sys.stderr)
            gpu_result = transcribe_with_openvino_gpu(audio_path)
            if gpu_result["success"]:
                print("✅ OpenVINO GPU transcription successful!", file=sys.stderr)
                return gpu_result
            else:
                print(f"❌ OpenVINO GPU failed: {gpu_result['error']}", file=sys.stderr)
        except Exception as e:
            print(f"❌ OpenVINO GPU error: {str(e)}", file=sys.stderr)

        # 2. Try OpenAI API (compresses large files automatically)
        if api_key:
            print("Attempting OpenAI Whisper API transcription...", file=sys.stderr)
            api_result = transcribe_with_openai_api(audio_path, api_key)
            if api_result["success"]:
                print("✅ OpenAI API transcription successful!", file=sys.stderr)
                return api_result
            else:
                print(f"❌ OpenAI API failed: {api_result['error']}", file=sys.stderr)
        else:
            print("No OpenAI API key provided, skipping OpenAI API...", file=sys.stderr)

        # 3. Try Groq API (fast cloud Whisper, great for large files)
        if groq_api_key:
            print("Attempting Groq Whisper API transcription...", file=sys.stderr)
            groq_result = transcribe_with_groq_api(audio_path, groq_api_key)
            if groq_result["success"]:
                print("✅ Groq API transcription successful!", file=sys.stderr)
                return groq_result
            else:
                print(f"❌ Groq API failed: {groq_result['error']}", file=sys.stderr)
        else:
            print("No Groq API key provided, skipping Groq API...", file=sys.stderr)

        # 4. Fall back to local Whisper on CPU
        print("Falling back to local Whisper (CPU)…", file=sys.stderr)
        return transcribe_with_local_whisper(audio_path)

    except Exception as e:
        error_msg = f"Transcription failed: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        return {"success": False, "error": error_msg}


if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 4:
        print(json.dumps({"success": False, "error": "Usage: python transcribe.py <audio_file_path> [openai_api_key] [groq_api_key]"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    api_key = sys.argv[2] if len(sys.argv) >= 3 else None
    groq_api_key = sys.argv[3] if len(sys.argv) >= 4 else None

    if not os.path.exists(audio_path):
        print(json.dumps({"success": False, "error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    result = transcribe_audio(audio_path, api_key, groq_api_key)
    print(json.dumps(result))
