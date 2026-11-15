"""Adapters for media and email. Fixture implementations run only in DEMO_MODE (FR-20.1, FR-21.1)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from faze_common.errors import ProblemError
from faze_common.settings import ROOT, get_settings

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", ROOT / "seeds" / "media" / "out"))
MAILBOX_DIR = ROOT / ".local" / "mailbox"


class MediaAdapter:
    """Playback URLs always come from here. ``mux:`` assets use Mux, everything else is local HLS."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def playback_url(self, asset_id: str | None) -> str | None:
        if not asset_id:
            return None
        if asset_id.startswith("mux:"):
            return f"https://stream.mux.com/{asset_id.removeprefix('mux:')}.m3u8"
        return f"{self._base}/media/{asset_id}/index.m3u8"

    @property
    def mode(self) -> str:
        return "fixture" if not get_settings().MUX_TOKEN_ID else "live"


class DevMailbox:
    """Writes messages to a gitignored local folder. Visible only in DEMO_MODE (A-22)."""

    def send(self, to: str, subject: str, body: str) -> None:
        if not get_settings().DEMO_MODE:
            raise ProblemError(503, "email-unavailable", "Email is not configured")
        MAILBOX_DIR.mkdir(parents=True, exist_ok=True)
        path = MAILBOX_DIR / f"{int(time.time() * 1000)}.json"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as handle:
            json.dump({"to": to, "subject": subject, "body": body}, handle)

    def list(self) -> list[dict]:
        if not MAILBOX_DIR.exists():
            return []
        return [json.loads(p.read_text()) for p in sorted(MAILBOX_DIR.glob("*.json"))[-20:]]
