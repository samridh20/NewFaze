"""Fail if LiteLLM 1.82.7 or 1.82.8 is referenced in any tracked or unignored file (AC-57)."""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAD = re.compile(r"litellm[^\n]{0,40}?1\.82\.[78]\b", re.I)


def main() -> int:
    names = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True,
                           text=True, check=True).stdout.splitlines()
    hits = []
    for name in names:
        path = ROOT / name
        if name.endswith("litellm_version_guard.py") or not path.is_file() or path.suffix in {".png", ".mp4", ".md"}:
            continue
        lines = path.read_text(errors="ignore").splitlines()
        if any(BAD.search(line) and not re.search(r"never|fail if|banned|malware", line, re.I) for line in lines):
            hits.append(name)
    for h in hits:
        print(f"banned LiteLLM version referenced: {h}")
    print(f"litellm-guard: {'FAIL' if hits else 'ok'}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
