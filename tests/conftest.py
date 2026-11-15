"""Shared pytest setup. Tests run against real PostgreSQL 16 (database faze_test) and real Redis.

Environment is fixed before any service module is imported, so settings and the engine point at the test database.
No test here calls an LLM provider (NFR-10).
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ["DATABASE_NAME"] = "faze_test"
os.environ["DEMO_MODE"] = "1"
os.environ["APP_ENV"] = "test"
os.environ["DEV_AUTH_KEY_DIR"] = str(ROOT / ".local" / "dev-auth-test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/9")  # database 9, never the demo's 0
# Votes race in bulk in these tests, so the production limits are raised here and tested separately.
os.environ["VOTE_ACCOUNT_CAPACITY"] = "1000"
os.environ["VOTE_IP_CAPACITY"] = "100000"
os.environ["VOTE_IP_REFILL_PER_SEC"] = "100000"

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import uvicorn  # noqa: E402


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session", autouse=True)
def migrated_test_database() -> None:
    """Start from a clean schema set so every run proves the migrations (AC-3)."""
    run = [sys.executable, str(ROOT / "infra" / "migrations" / "run.py")]
    env = {**os.environ}
    subprocess.run([*run, "downgrade"], check=True, env=env, capture_output=True)
    subprocess.run([*run, "upgrade"], check=True, env=env, capture_output=True)


@pytest.fixture(scope="session")
def dev_auth_url() -> str:
    import dev_auth.main as dev_main  # noqa: PLC0415 - needs the env set above

    port = _free_port()
    config = uvicorn.Config(dev_main.app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        try:
            httpx.get(f"http://127.0.0.1:{port}/health", timeout=0.5)
            break
        except httpx.HTTPError:
            time.sleep(0.05)
    os.environ["SUPABASE_JWKS_URL"] = f"http://127.0.0.1:{port}/.well-known/jwks.json"
    os.environ["JWT_ISSUER"] = dev_main.ISSUER
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def public_app(dev_auth_url: str):
    from faze_common.settings import get_settings  # noqa: PLC0415

    get_settings.cache_clear()
    from odyssey_api.public import app  # noqa: PLC0415

    async with app.router.lifespan_context(app):
        await app.state.redis.flushdb()
        yield app


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def internal_app(dev_auth_url: str):
    from faze_common.settings import get_settings  # noqa: PLC0415

    get_settings.cache_clear()
    from odyssey_api.internal import app  # noqa: PLC0415

    async with app.router.lifespan_context(app):
        yield app


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def public(public_app):
    transport = httpx.ASGITransport(app=public_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://public", timeout=60) as client:
        yield client


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def internal(internal_app):
    transport = httpx.ASGITransport(app=internal_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://internal", timeout=60) as client:
        yield client


@pytest.fixture
def token():
    from dev_auth.main import mint  # noqa: PLC0415

    return mint


@pytest.fixture
def service_token():
    from faze_common.auth import mint_service_token  # noqa: PLC0415
    from faze_common.settings import get_settings  # noqa: PLC0415

    secret = get_settings().ODYSSEY_INTERNAL_TOKEN_SECRET
    return lambda actor="producer-pat": mint_service_token(secret, actor)
