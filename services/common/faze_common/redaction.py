"""Secret redaction for logs, errors and script output (FR-18.12, NFR-1).

Two layers: exact values registered from the environment, and patterns for the shapes of the
secrets this project handles. Everything that reaches a log line goes through ``redact``.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterable

_MARK = "[REDACTED]"

_PATTERNS = [
    re.compile(r"AQ\.[A-Za-z0-9_\-]{20,}"),  # Google-issued API keys
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"z_[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}"),  # Zep Cloud keys
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),  # LiteLLM master and virtual keys, OpenAI-style keys
    re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*"),  # JWTs
    re.compile(r"(?i)(?:bearer|api-key)\s+[A-Za-z0-9._\-]{12,}"),
    re.compile(r"postgres(?:ql)?(?:\+\w+)?://[^:\s/]+:[^@\s]+@"),  # passwords inside connection URLs
]

_SECRET_NAME = re.compile(r"(KEY|SECRET|PASSWORD|TOKEN|SALT)", re.IGNORECASE)
_known: set[str] = set()


def register_secret(value: str | None) -> None:
    if value and len(value) >= 8:
        _known.add(value)


def register_env_secrets(environ: dict[str, str] | None = None) -> int:
    """Register every environment value whose name looks secret. Returns how many were added."""
    count = 0
    for name, value in (environ or os.environ).items():
        if _SECRET_NAME.search(name) and value and len(value) >= 8:
            _known.add(value)
            count += 1
    return count


def redact(text: str, extra: Iterable[str] | None = None) -> str:
    out = text
    for secret in sorted(_known | set(extra or ()), key=len, reverse=True):
        if secret:
            out = out.replace(secret, _MARK)
    for pattern in _PATTERNS:
        out = pattern.sub(_MARK, out)
    return out


def redact_value(value: object) -> object:
    """Redact strings nested inside simple containers."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {key: redact_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(redact_value(item) for item in value)
    return value
