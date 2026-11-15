"""Key janitor: purges expired idempotency keys (CC-11, FR-4.2). Runs as workers_rw."""
from __future__ import annotations
import asyncio
import os

from faze_common.settings import get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def purge_once(engine) -> int:
    async with engine.begin() as conn:
        return (await conn.execute(text("delete from odyssey.idempotency_keys where expires_at < now()"))).rowcount


async def run_forever(interval: float = 600.0) -> None:
    engine = create_async_engine(get_settings().database_url("workers_rw"))
    while True:
        await purge_once(engine)
        await asyncio.sleep(interval)


if __name__ == "__main__":
    os.environ.setdefault("SERVICE_ROLE", "workers")
    asyncio.run(run_forever())
