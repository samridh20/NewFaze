"""Outcome freeze (FR-13.3, AC-36/37): after the reporting window closes, count entrants and voters from wh.events
once and freeze the row. A frozen set never changes (trigger). Runs as workers_rw."""
from __future__ import annotations
import asyncio
import os

from faze_common.settings import get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

FREEZE = """
insert into wh.outcome_sets (campaign_id, brief_version_id, window_start, window_end, entrants, voters, frozen_at)
select c.id, c.live_brief_id, c.opens_at, c.reporting_window_end,
  (select count(distinct props->>'entry_id') from wh.events e where e.campaign_id = c.id and e.topic = 'entry.accepted'),
  (select count(distinct account_id) from wh.events e where e.campaign_id = c.id and e.topic = 'vote.cast'),
  now()
from odyssey.campaigns c
where c.live_brief_id is not null and c.reporting_window_end is not null and c.reporting_window_end < now()
on conflict (campaign_id, brief_version_id) do nothing
returning campaign_id
"""


async def freeze_once(engine) -> int:
    async with engine.begin() as conn:
        return len((await conn.execute(text(FREEZE))).all())


if __name__ == "__main__":
    os.environ.setdefault("SERVICE_ROLE", "workers")
    eng = create_async_engine(get_settings().database_url("workers_rw"))
    print("frozen:", asyncio.run(freeze_once(eng)))
