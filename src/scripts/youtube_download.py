#!/usr/bin/env python3
"""
youtube_download.py — Downloads YouTube video (MP4) at 1080p minimum.

Strategy:
  1. yt-dlp  (primary — uses WARP proxy IF available, else direct)
  2. PyTubefix + FFmpeg (fallback — uses WARP proxy IF available)

Usage:
  python youtube_download.py <youtube_url> <output_path>

Output: JSON on stdout
"""

import json
import os
import subprocess
import sys
import tempfile
import shutil
import socket

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Proxy Detection
# ---------------------------------------------------------------------------

def _is_warp_running() -> bool:
    """Checks if the Cloudflare WARP SOCKS5 proxy is open on port 40000."""
    try:
        # Try to quickly connect to the local proxy port (0.5s timeout)
        with socket.create_connection(("127.0.0.1", 40000), timeout=0.5):
            return True
    except OSError:
        return False

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------

def _log(level: str, method: str, msg: str) -> None:
    """Emit a structured log line to stderr."""
    print(f"[{level}] [{method}] {msg}", file=sys.stderr, flush=True)

def _log_info(method: str, msg: str)  -> None: _log("INFO",  method, msg)
def _log_warn(method: str, msg: str)  -> None: _log("WARN",  method, msg)
def _log_error(method: str, msg: str) -> None: _log("ERROR", method, msg)
def _log_ok(method: str, msg: str)    -> None: _log("OK",    method, msg)

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _find_output_file(base_path: str, extensions: list) -> str | None:
    for ext in extensions:
        for candidate in [base_path, base_path + ext]:
            if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
                return candidate

    base_name = os.path.splitext(os.path.basename(base_path))[0]
    directory  = os.path.dirname(base_path) or "."
    try:
        for fname in sorted(os.listdir(directory)):
            fpath = os.path.join(directory, fname)
            if fname.startswith(base_name) and os.path.getsize(fpath) > 0:
                return fpath
    except OSError:
        pass
    return None

def _ffmpeg_remux_to_mp4(src: str, dst: str) -> bool:
    _log_info("FFmpeg", f"Remuxing '{os.path.basename(src)}' → '{os.path.basename(dst)}'")
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", src, "-c", "copy", dst],
            capture_output=True, text=True,
        )
        if result.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 0:
            _log_ok("FFmpeg", f"Remux succeeded → {dst}")
            return True
        _log_warn("FFmpeg", f"Remux failed (rc={result.returncode}): {result.stderr.strip()[:300]}")
        return False
    except FileNotFoundError:
        _log_warn("FFmpeg", "ffmpeg binary not found on PATH — skipping remux")
        return False

# ---------------------------------------------------------------------------
# yt-dlp — PRIMARY method (Dynamic Proxy + 1080p)
# ---------------------------------------------------------------------------

def _ytdlp_available() -> bool:
    try:
        r = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True)
        return r.returncode == 0
    except FileNotFoundError:
        return False

def _ytdlp_video(url: str, output_path: str) -> dict:
    METHOD = "yt-dlp"

    if not _ytdlp_available():
        _log_error(METHOD, "yt-dlp is not installed or not on PATH")
        return {"success": False, "method": METHOD, "error": "yt-dlp not found"}

    # Dynamically build the command based on whether the proxy is running
    use_proxy = _is_warp_running()
    base_cmd = ["yt-dlp", "--newline"]
    
    if use_proxy:
        _log_info(METHOD, "WARP Proxy detected. Routing traffic through tunnel.")
        base_cmd.extend(["--proxy", "socks5://127.0.0.1:40000"])
    else:
        _log_info(METHOD, "No proxy detected. Using direct local connection.")

    FORMAT_STR = "bestvideo[height>=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"

    strategies = [
        {
            "label": f"1/2 — Mobile Spoofing (1080p+) [{'Proxy' if use_proxy else 'Direct'}]",
            "cmd": base_cmd + [
                "--extractor-args", "youtube:player_client=android,ios",
                "-f", FORMAT_STR,
                "--merge-output-format", "mp4",
                "--output", output_path,
                "--no-playlist", "--no-warnings", url,
            ]
        },
        {
            "label": f"2/2 — TV Spoofing (1080p+) [{'Proxy' if use_proxy else 'Direct'}]",
            "cmd": base_cmd + [
                "--extractor-args", "youtube:player_client=tv",
                "-f", FORMAT_STR,
                "--merge-output-format", "mp4",
                "--output", output_path,
                "--no-playlist", "--no-warnings", url,
            ]
        }
    ]

    last_err = ""
    for i, strat in enumerate(strategies, 1):
        _log_info(METHOD, f"Strategy {i}/{len(strategies)}: {strat['label']}")

        proc = subprocess.Popen(
            strat["cmd"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        last_lines = []
        for line in proc.stdout:
            print(line, end="", file=sys.stderr, flush=True)
            last_lines.append(line.strip())
            if len(last_lines) > 15:
                last_lines.pop(0)

        proc.wait() 

        if proc.returncode == 0:
            actual = _find_output_file(output_path, [".mp4", ".webm", ".mkv"])
            if actual:
                _log_ok(METHOD, f"Strategy {i} succeeded → {actual}")
                return {
                    "success": True,
                    "file":    actual,
                    "method":  METHOD,
                    "message": f"Video downloaded via yt-dlp (strategy {i})",
                }
            _log_warn(METHOD, f"Strategy {i} exited 0 but no output file found")
        else:
            last_err = "\n".join(last_lines)
            _log_warn(METHOD, f"Strategy {i} failed (rc={proc.returncode})")

    _log_error(METHOD, "All yt-dlp bypass strategies failed — handing off to PyTubefix")
    return {
        "success": False,
        "method":  METHOD,
        "error":   "All applicable yt-dlp strategies failed",
        "details": last_err,
    }

# ---------------------------------------------------------------------------
# PyTubefix + FFmpeg — FALLBACK method
# ---------------------------------------------------------------------------

def _pytubefix_video(url: str, output_path: str) -> dict:
    METHOD = "PyTubefix"

    try:
        from pytubefix import YouTube
    except ImportError:
        _log_error(METHOD, "pytubefix is not installed (pip install pytubefix)")
        return {"success": False, "method": METHOD, "error": "pytubefix not installed"}

    try:
        _log_info(METHOD, f"Fetching metadata and generating PO Token for: {url}")
        
        # Apply proxy ONLY if it is actively running
        PROXY_DICT = None
        if _is_warp_running():
            PROXY_DICT = {
                "http": "socks5://127.0.0.1:40000",
                "https": "socks5://127.0.0.1:40000"
            }
        
        yt = YouTube(url, client='WEB', proxies=PROXY_DICT)

        out_dir = os.path.dirname(output_path) or "."
        os.makedirs(out_dir, exist_ok=True)
        stem = os.path.splitext(os.path.basename(output_path))[0] or "video"

        stream = (
            yt.streams.filter(progressive=True, file_extension="mp4").order_by("resolution").last()
            or yt.streams.filter(progressive=True).order_by("resolution").last()
            or yt.streams.filter(file_extension="mp4").order_by("resolution").last()
            or yt.streams.first()
        )

        if not stream:
            _log_error(METHOD, "No downloadable streams found for this video")
            return {"success": False, "method": METHOD, "error": "No streams found"}

        with tempfile.TemporaryDirectory() as tmpdir:
            _log_info(METHOD, "Downloading stream …")
            raw_path = stream.download(output_path=tmpdir, filename=stem)
            final_path = os.path.join(out_dir, stem + ".mp4")

            if raw_path.lower().endswith(".mp4"):
                shutil.move(raw_path, final_path)
            else:
                ok = _ffmpeg_remux_to_mp4(raw_path, final_path)
                if not ok:
                    raw_ext = os.path.splitext(raw_path)[1]
                    final_path = os.path.join(out_dir, stem + raw_ext)
                    shutil.move(raw_path, final_path)

        _log_ok(METHOD, f"PyTubefix download complete → {final_path}")
        return {
            "success": True,
            "file":    final_path,
            "method":  METHOD,
            "message": "Video downloaded via PyTubefix",
        }

    except Exception as exc:
        _log_error(METHOD, f"Unexpected error: {exc}")
        return {"success": False, "method": METHOD, "error": f"PyTubefix failed: {exc}"}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def download_youtube_video(url: str, output_path: str) -> dict:
    _log_info("Downloader", "=" * 60)
    _log_info("Downloader", f"URL: {url}")
    _log_info("Downloader", f"Output path: {output_path}")
    _log_info("Downloader", "Step 1 of 2 — Attempting download with yt-dlp (primary)")
    _log_info("Downloader", "=" * 60)

    result = _ytdlp_video(url, output_path)
    if result.get("success"):
        _log_ok("Downloader", "yt-dlp succeeded — download complete")
        return result

    _log_warn("Downloader", "-" * 60)
    _log_warn("Downloader", f"yt-dlp failed: {result.get('error')}")
    _log_warn("Downloader", "Step 2 of 2 — Falling back to PyTubefix + FFmpeg")
    _log_warn("Downloader", "-" * 60)

    result = _pytubefix_video(url, output_path)
    if result.get("success"):
        _log_ok("Downloader", "PyTubefix fallback succeeded — download complete")
    else:
        _log_error("Downloader", f"PyTubefix fallback also failed: {result.get('error')}")
        _log_error("Downloader", "All download methods exhausted — giving up")

    return result

# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--video"]

    if len(args) != 2:
        print(json.dumps({
            "success": False,
            "error":   "Usage: python youtube_download.py <youtube_url> <output_path>",
        }))
        sys.exit(1)

    url_arg, out_arg = args[0], args[1]
    output = download_youtube_video(url_arg, out_arg)
    print(json.dumps(output))