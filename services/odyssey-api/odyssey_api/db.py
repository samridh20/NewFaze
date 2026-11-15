"""Database access for the Odyssey API: one async engine as role odyssey_app, plus error mapping."""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TypeVar

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from faze_common.errors import ProblemError
from faze_common.settings import get_settings

T = TypeVar("T")

_engine: AsyncEngine | None = None

# Guard messages raised by the migration triggers (SQLSTATE P0001) mapped to problem types.
_GUARD_MAP: list[tuple[re.Pattern[str], int, str, str]] = [
    (re.compile(r"illegal-transition"), 409, "illegal-transition", "That state change is not allowed"),
    (re.compile(r"ballot-closed"), 409, "ballot-closed", "The ballot is closed"),
    (re.compile(r"ballot-locked"), 409, "ballot-locked", "The finalists are locked"),
    (re.compile(r"ballot-frozen"), 409, "ballot-frozen", "The ballot is frozen"),
    (re.compile(r"brief-locked"), 409, "brief-locked", "The live brief is locked"),
    (re.compile(r"prediction-too-late"), 409, "prediction-too-late", "The ballot has already closed"),
]
RETRYABLE_SQLSTATES = {"40001", "40P01"}


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url("odyssey_app"), pool_size=20, max_overflow=30, pool_pre_ping=True,
        )
    return _engine


async def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def transaction() -> AsyncIterator[AsyncConnection]:
    async with get_engine().begin() as conn:
        yield conn


def sqlstate(exc: BaseException) -> str | None:
    original = getattr(exc, "orig", None)
    cause = getattr(original, "__cause__", None)
    return getattr(cause, "sqlstate", None) or getattr(original, "sqlstate", None)


def map_db_error(exc: DBAPIError) -> ProblemError | None:
    message = str(exc.orig) if exc.orig is not None else str(exc)
    if sqlstate(exc) == "P0001":
        for pattern, status, slug, title in _GUARD_MAP:
            if pattern.search(message):
                detail = re.sub(r"^.*?(illegal-transition|ballot-\w+|brief-locked|prediction-too-late):?\s*", "", message, count=1).strip()
                return ProblemError(status, slug, title, detail.splitlines()[0] if detail else None)
    return None


async def run_with_retry(work: Callable[[AsyncConnection], Awaitable[T]], attempts: int = 2) -> T:
    """Run ``work`` in one transaction. A deadlock or serialization failure is retried once (section 5)."""
    for attempt in range(attempts):
        try:
            async with transaction() as conn:
                return await work(conn)
        except DBAPIError as exc:
            mapped = map_db_error(exc)
            if mapped is not None:
                raise mapped from exc
            if sqlstate(exc) in RETRYABLE_SQLSTATES:
                if attempt + 1 < attempts:
                    await asyncio.sleep(0.02 * (attempt + 1))
                    continue
                raise ProblemError(503, "try-again", "Please retry", "the database was busy") from exc
            raise
    raise ProblemError(503, "try-again", "Please retry")  # pragma: no cover
