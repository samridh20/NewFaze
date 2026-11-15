"""Helpers for handling secrets in dev scripts without ever printing them.

Rules: read secrets from gitignored env files, never print them, and pass every
string destined for stdout, stderr or a log through ``redact``.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / ".local" / "token-ledger.jsonl"

# Matches the shapes of the secrets this project handles, as a safety net when a
# value was not loaded through load_env (for example inside an upstream error).
_PATTERNS = [
    re.compile(r"AQ\.[A-Za-z0-9_\-]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"z_[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
]


def load_env(path: Path) -> dict[str, str]:
    """Parse KEY=VALUE lines. Never logs values."""
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def redact(text: str, secrets: list[str] | None = None) -> str:
    """Replace known secret values and secret-shaped strings with a marker."""
    out = text
    for secret in secrets or []:
        if secret:
            out = out.replace(secret, "[REDACTED]")
    for pattern in _PATTERNS:
        out = pattern.sub("[REDACTED]", out)
    return out


def ledger_append(check: str, model: str, prompt_tokens: int, completion_tokens: int, note: str = "") -> None:
    """Record live token use. The ledger is gitignored and holds no secrets."""
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "check": check,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "note": note,
    }
    with LEDGER.open("a") as handle:
        handle.write(json.dumps(entry) + "\n")


def ledger_total() -> int:
    if not LEDGER.exists():
        return 0
    return sum(json.loads(line)["total_tokens"] for line in LEDGER.read_text().splitlines() if line.strip())
