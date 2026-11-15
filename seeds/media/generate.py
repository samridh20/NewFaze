"""Synthetic placeholder HLS clips with ffmpeg (no FaZe or third-party footage). Idempotent."""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / "out"
CLIPS = {"intro": "0x222222", "clip-a": "0xaa2222", "clip-b": "0x2244aa", "end-card": "0x222222"}


def main() -> int:
    for name, color in CLIPS.items():
        target = OUT / name
        if (target / "index.m3u8").exists():
            continue
        target.mkdir(parents=True, exist_ok=True)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={color}:s=640x360:d=4:r=25",
               "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-profile:v", "main",
               "-pix_fmt", "yuv420p", "-g", "50", "-c:a", "aac", "-shortest", "-hls_time", "2",
               "-hls_playlist_type", "vod", "-hls_segment_filename", str(target / "seg%03d.ts"), str(target / "index.m3u8")]
        subprocess.run(cmd, check=True)
    print("media ready:", ", ".join(CLIPS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
