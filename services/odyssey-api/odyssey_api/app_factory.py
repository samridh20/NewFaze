"""Shared construction for the public and internal listeners (design 3.2)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from faze_common.auth import JwtVerifier
from faze_common.errors import install_error_handling
from faze_common.logging import configure_logging
from faze_common.ratelimit import RateLimiter
from faze_common.settings import Settings, get_settings

from .adapters import DevMailbox, MediaAdapter
from .db import dispose_engine

WEB_ORIGINS = ["http://localhost:3001", "http://localhost:3002", "http://127.0.0.1:3001", "http://127.0.0.1:3002"]
log = structlog.get_logger("odyssey")


def check_startup(settings: Settings, kind: str) -> None:
    """Refuse to start in an unsafe configuration (FR-21.1, AC-7)."""
    if not settings.DEMO_MODE and not settings.SUPABASE_URL:
        raise RuntimeError(
            "DEMO_MODE=0 requires SUPABASE_URL and SUPABASE_JWKS_URL. Fixture sign-in is not available."
        )
    if kind == "internal" and len(settings.ODYSSEY_INTERNAL_TOKEN_SECRET) < 32:
        raise RuntimeError("ODYSSEY_INTERNAL_TOKEN_SECRET must be at least 32 characters")
    if not settings.IP_HASH_SECRET:
        raise RuntimeError("IP_HASH_SECRET is not set. Run: make env")


def build_app(kind: str) -> FastAPI:
    configure_logging()
    settings = get_settings()
    check_startup(settings, kind)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=False)
        app.state.redis = redis
        app.state.limiter = RateLimiter(redis)
        app.state.settings = settings
        app.state.verifier = JwtVerifier(settings.SUPABASE_JWKS_URL, settings.JWT_ISSUER, settings.JWT_AUDIENCE)
        app.state.service_secret = settings.ODYSSEY_INTERNAL_TOKEN_SECRET
        app.state.media = MediaAdapter(settings.ODYSSEY_PUBLIC_URL)
        app.state.mailbox = DevMailbox()
        log.info("started", kind=kind, demo_mode=settings.DEMO_MODE)
        try:
            yield
        finally:
            await redis.aclose()
            await dispose_engine()

    app = FastAPI(
        title=f"Odyssey API ({kind})",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if kind == "public" else None,
        redoc_url=None,
    )
    install_error_handling(app)
    if kind == "public":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=WEB_ORIGINS,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Referral"],
            expose_headers=["Retry-After", "X-Request-Id"],
        )
    return app
