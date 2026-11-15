"""RSA key handling for the dev issuer. The private key is generated locally, mode 600, never committed."""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = Path(__file__).resolve().parents[3]
KEY_DIR = Path(os.environ.get("DEV_AUTH_KEY_DIR", ROOT / ".local" / "dev-auth"))
KEY_ID = "dev-auth-1"


def _b64(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def load_or_create_private_key() -> rsa.RSAPrivateKey:
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    path = KEY_DIR / "private.pem"
    if not path.exists():
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(pem)
    os.chmod(path, 0o600)
    return serialization.load_pem_private_key(path.read_bytes(), password=None)  # type: ignore[return-value]


def jwks(key: rsa.RSAPrivateKey) -> dict:
    numbers = key.public_key().public_numbers()
    return {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": KEY_ID,
                      "n": _b64(numbers.n), "e": _b64(numbers.e)}]}


def sign(key: rsa.RSAPrivateKey, claims: dict, issuer: str, audience: str, ttl_seconds: int = 3600) -> str:
    now = int(time.time())
    payload = {"iss": issuer, "aud": audience, "iat": now, "nbf": now - 5, "exp": now + ttl_seconds, **claims}
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": KEY_ID})
