"""Deterministic IDs for seeded demo records, so the seed, dev-auth and tests all agree."""

from __future__ import annotations

import uuid

_NAMESPACE = uuid.UUID("5f0b1c9e-6f0a-4b6e-9a55-0fa2e3a7d001")


def demo_uuid(name: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, name)


# name -> (role, handle, analytics_consent, partner key or None)
DEMO_ACCOUNTS: dict[str, tuple[str, str, bool, str | None]] = {
    "fan-ava": ("fan", "ava_clutch", True, None),
    "fan-ben": ("fan", "ben_flick", True, None),
    "fan-cy": ("fan", "cy_nocookies", False, None),  # analytics consent withheld (A-23)
    "fan-dee": ("fan", "dee_returning", True, None),
    "producer-pat": ("producer", "pat_producer", True, None),
    "reviewer-rae": ("reviewer", "rae_reviewer", True, None),
    "analyst-ana": ("analyst", "ana_analyst", True, None),
    "admin-ada": ("admin", "ada_admin", True, None),
    "partner-acme": ("partner", "acme_partner", True, "acme"),
    "partner-zenith": ("partner", "zenith_partner", True, "zenith"),
}

PARTNER_NAMES = {"acme": "Acme Energy (fictional)", "zenith": "Zenith Gear (fictional)"}


def account_id(name: str) -> uuid.UUID:
    return demo_uuid(f"account:{name}")


def partner_id(key: str) -> uuid.UUID:
    return demo_uuid(f"partner:{key}")
