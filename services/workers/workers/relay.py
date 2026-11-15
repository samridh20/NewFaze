"""Outbox relay: copies unpublished odyssey.outbox rows to wh.events, then marks them published (FR-13.1).
Runs as the `relay` database role (column-limited grants). At-least-once: wh.events.event_id is the key."""
from __future__ import annotations
import asyncio
import os

from faze_common.settings import get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

SQL_BATCH = """
with batch as (
  select id, topic, payload from odyssey.outbox where published_at is null order by id limit :n for update skip locked
), moved as (
  insert into wh.events (event_id, topic, version, occurred_at, campaign_id, brief_version_id, account_id, referral, props)
  select (payload->>'event_id')::uuid, topic, (payload->>'v')::int, now(),
         nullif(payload->>'campaign_id','')::uuid, nullif(payload->>'brief_version_id','')::uuid,
         nullif(payload->>'account_id','')::uuid, payload->>'referral', coalesce(payload->'props','{}'::jsonb)
  from batch on conflict (event_id) do nothing returning 1
)
update odyssey.outbox o set published_at = now() from batch b where o.id = b.id returning o.id
"""


async def relay_once(engine, n: int = 100) -> int:
    async with engine.begin() as conn:
        return len((await conn.execute(text(SQL_BATCH), {"n": n})).all())


async def run_forever(interval: float = 1.0) -> None:
    engine = create_async_engine(get_settings().database_url("relay"))
    while True:
        while await relay_once(engine):
            pass
        await asyncio.sleep(interval)


if __name__ == "__main__":
    os.environ.setdefault("SERVICE_ROLE", "relay")
    asyncio.run(run_forever())
