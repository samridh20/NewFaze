"""Fail if a key-shaped string is in a tracked or unignored file (AC-33). Never prints the match."""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATTERNS = {
    "google-api-key": re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
    "openai-style-key": re.compile(r"\bsk-(?!faze-)[A-Za-z0-9]{32,}"),
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "zep-key": re.compile(r"\bz_[A-Za-z0-9_\-]{60,}"),
}
SKIP_SUFFIX = {".png", ".jpg", ".mp4", ".ts", ".m3u8", ".lock", ".pyc"}


def files() -> list[Path]:
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True,
                         check=True).stdout.splitlines()
    return [ROOT / f for f in out if (ROOT / f).is_file() and Path(f).suffix not in SKIP_SUFFIX]


def main() -> int:
    hits = []
    for path in files():
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(text):
                hits.append(f"{path.relative_to(ROOT)}: {name}")
    for hit in hits:
        print(hit)
    print(f"secret-scan: {'FAIL' if hits else 'ok'} ({len(files())} files)")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
