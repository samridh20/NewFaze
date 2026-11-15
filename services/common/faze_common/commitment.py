"""Sim vs Fans commitment (CC-1, FR-9.3). Only this hash is stored before the ballot closes."""
from __future__ import annotations
import hashlib
import json
from typing import Any


def prediction_commitment(ballot_id: str, predicted: dict[str, float], nonce: str) -> str:
    body = {"ballot_id": str(ballot_id), "nonce": nonce,
            "predicted": {k: round(float(v), 6) for k, v in sorted(predicted.items())}}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
