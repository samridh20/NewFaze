"""Dev token issuer. Stands in for Supabase Auth in DEMO_MODE only (FR-2.3).

The APIs verify these tokens through the same code path they use for Supabase: a JWKS, issuer and audience.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from faze_common.demo_ids import DEMO_ACCOUNTS, account_id, partner_id

from .keys import jwks, load_or_create_private_key, sign

ISSUER = os.environ.get("JWT_ISSUER", "http://localhost:8003")
AUDIENCE = os.environ.get("JWT_AUDIENCE", "faze")
DEMO_MODE = os.environ.get("DEMO_MODE", "0") == "1"
APP_ENV = os.environ.get("APP_ENV", "local").lower()

if DEMO_MODE and APP_ENV in {"prod", "production"}:
    print("DEMO_MODE=1 is refused in production", file=sys.stderr)
    raise SystemExit(2)
if not DEMO_MODE:
    print("dev-auth only runs with DEMO_MODE=1", file=sys.stderr)
    raise SystemExit(2)

_KEY = load_or_create_private_key()
app = FastAPI(title="FaZe dev-auth (DEMO_MODE only)", docs_url=None, redoc_url=None)
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3001", "http://localhost:3002"],
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"])


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "dev-auth"}


@app.get("/.well-known/jwks.json")
def well_known() -> dict:
    return jwks(_KEY)


@app.get("/dev/accounts")
def accounts() -> list[dict]:
    return [
        {"account": name, "role": role, "handle": handle, "analytics_consent": consent,
         "sub": str(account_id(name)),
         "partner_id": str(partner_id(partner)) if partner else None}
        for name, (role, handle, consent, partner) in DEMO_ACCOUNTS.items()
    ]


@app.post("/dev/token")
def token(body: TokenRequest) -> dict:
    spec = DEMO_ACCOUNTS.get(body.account)
    if spec is None:
        raise HTTPException(404, "unknown demo account")
    role, handle, consent, partner = spec
    claims = {
        "sub": str(account_id(body.account)),
        "role": "authenticated",  # what Supabase sets; the application role is in app_metadata (CC-13)
        "app_metadata": {"role": role, "partner_id": str(partner_id(partner)) if partner else None},
        "user_metadata": {"handle": handle},
    }
    return {"access_token": sign(_KEY, claims, ISSUER, AUDIENCE), "token_type": "bearer",
            "account": body.account, "role": role, "handle": handle, "sub": claims["sub"]}


def mint(sub: str | None = None, role: str = "fan", handle: str = "tester", ttl: int = 3600, **extra) -> str:
    """For tests only: sign a token for any subject with this process's key."""
    extra_meta = {k: extra.pop(k) for k in ("partner_id",) if k in extra}
    claims = {"sub": sub or str(uuid.uuid4()), "role": "authenticated",
              "app_metadata": {"role": role, **extra_meta}, "user_metadata": {"handle": handle}, **extra}
    return sign(_KEY, claims, ISSUER, AUDIENCE, ttl)


def private_key_path() -> Path:
    from .keys import KEY_DIR

    return KEY_DIR / "private.pem"
