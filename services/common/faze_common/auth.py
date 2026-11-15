"""JWT verification shared by both APIs (FR-2.1, FR-2.5).

User tokens: RS256 or ES256 only, verified against a JWKS with issuer, audience, expiry and not-before.
Service tokens: HS256, audience ``odyssey-internal``, at most five minutes long. They are a different
code path, and a user token never validates as a service token or the other way round.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import anyio
import jwt
from fastapi import Request
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError

from .errors import ProblemError

USER_ALGORITHMS = ("RS256", "ES256")
ROLES = ("fan", "reviewer", "producer", "analyst", "partner", "admin")
STAFF_ROLES = ("reviewer", "producer", "analyst", "admin")
SERVICE_AUDIENCE = "odyssey-internal"
MAX_SERVICE_TOKEN_SECONDS = 300


@dataclass(frozen=True)
class Principal:
    sub: str
    role: str
    handle: str | None = None
    partner_id: str | None = None
    analytics_consent: bool = False


def _unauth(detail: str) -> ProblemError:
    return ProblemError(401, "unauthenticated", "Authentication required", detail,
                        headers={"WWW-Authenticate": "Bearer"})


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


class JwtVerifier:
    def __init__(self, jwks_url: str, issuer: str, audience: str) -> None:
        self._client = PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=5)
        self._issuer = issuer
        self._audience = audience

    def _verify_sync(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except InvalidTokenError as exc:
            raise _unauth("malformed token") from exc
        algorithm = header.get("alg")
        if algorithm not in USER_ALGORITHMS:  # rejects "none" and any HS* before a key is looked up
            raise _unauth("unsupported algorithm")
        try:
            key = self._client.get_signing_key_from_jwt(token).key
            return jwt.decode(
                token, key, algorithms=[algorithm], audience=self._audience, issuer=self._issuer,
                options={"require": ["exp", "sub", "iss", "aud"]},
            )
        except PyJWKClientConnectionError as exc:
            raise ProblemError(503, "auth-unavailable", "Sign-in is unavailable", "key set unreachable") from exc
        except InvalidTokenError as exc:
            raise _unauth(type(exc).__name__) from exc

    async def verify(self, token: str) -> Principal:
        claims = await anyio.to_thread.run_sync(self._verify_sync, token)
        role = claims.get("role") or claims.get("app_metadata", {}).get("role")
        if role not in ROLES:
            raise _unauth("no valid role claim")
        return Principal(
            sub=str(claims["sub"]), role=role, handle=claims.get("handle"),
            partner_id=claims.get("partner_id"), analytics_consent=bool(claims.get("analytics_consent")),
        )


def mint_service_token(secret: str, actor: str, ttl_seconds: int = 120) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": actor, "aud": SERVICE_AUDIENCE, "iat": now, "nbf": now - 2, "exp": now + ttl_seconds,
         "typ": "service"},
        secret, algorithm="HS256",
    )


def verify_service_token(token: str, secret: str) -> str:
    """Returns the acting staff user. Raises 401 on any problem."""
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "HS256":
            raise _unauth("service tokens use HS256")
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=SERVICE_AUDIENCE,
                            options={"require": ["exp", "sub", "aud", "iat"]})
    except InvalidTokenError as exc:
        raise _unauth("service token rejected") from exc
    if claims["exp"] - claims["iat"] > MAX_SERVICE_TOKEN_SECONDS:
        raise _unauth("service token lifetime too long")
    return str(claims["sub"])


def current_principal(*roles: str, optional: bool = False) -> Callable[[Request], Any]:
    """FastAPI dependency factory. ``roles`` empty means any signed-in role."""

    async def dependency(request: Request) -> Principal | None:
        token = bearer_token(request)
        if token is None:
            if optional:
                return None
            raise _unauth("missing bearer token")
        principal = await request.app.state.verifier.verify(token)
        if roles and principal.role not in roles:
            raise ProblemError(403, "forbidden", "Not allowed", f"role {principal.role} cannot do this")
        request.state.principal = principal
        return principal

    return dependency


def service_actor(request: Request) -> str:
    """Dependency for internal routes: only a valid service token passes (FR-2.5)."""
    token = bearer_token(request)
    if token is None:
        raise _unauth("service token required")
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
    except InvalidTokenError as exc:
        raise _unauth("malformed token") from exc
    if unverified.get("aud") != SERVICE_AUDIENCE:
        # A user token, admin included, is a 403 here, not a 401 (AC-6).
        raise ProblemError(403, "forbidden", "Not allowed", "internal routes accept service tokens only")
    return verify_service_token(token, request.app.state.service_secret)
