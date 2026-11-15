"""Builders that create campaigns, entries and ballots directly in the test database."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from faze_common.settings import get_settings


def owner_engine() -> AsyncEngine:
    return create_async_engine(get_settings().database_url("faze_owner"), pool_size=5)


@dataclass
class World:
    campaign_id: uuid.UUID
    slug: str
    ballot_id: uuid.UUID
    entry_a: uuid.UUID
    entry_b: uuid.UUID
    extra: dict = field(default_factory=dict)


async def make_world(
    engine: AsyncEngine, *, voting: bool = True, closes_in: timedelta = timedelta(hours=1)
) -> World:
    """A campaign with two in_review entries and an open, locked ballot. Optionally in the voting state."""
    campaign_id, entry_a, entry_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    slug = f"drop-{campaign_id.hex[:10]}"
    now = datetime.now(UTC)
    async with engine.begin() as conn:
        await conn.execute(text(
            "insert into odyssey.campaigns (id, slug, format, title, intro_asset_id, end_card_asset_id) "
            "values (:id, :slug, 'recreate_the_shot', 'Temperrr Shot test', 'intro', 'endcard')"),
            {"id": campaign_id, "slug": slug})
        for state in ("scheduled", "accepting_entries"):
            await conn.execute(text("update odyssey.campaigns set state = :s where id = :id"),
                               {"s": state, "id": campaign_id})
        for index, entry_id in enumerate((entry_a, entry_b)):
            await conn.execute(text(
                "insert into odyssey.entries (id, campaign_id, user_id, source, mux_asset_id, playback_id, "
                "duration_ms, handle, channel_url, permissions, state, receipt_code, created_at) "
                "values (:id, :c, :u, 'upload', :asset, :asset, 12000, :h, :url, "
                "cast(:p as jsonb), 'in_review', :r, :ts)"),
                {"id": entry_id, "c": campaign_id, "u": uuid.uuid4(), "asset": f"asset-{index}",
                 "h": f"creator_{'ab'[index]}", "url": f"https://example.com/{'ab'[index]}",
                 "p": '{"editorial_use": true, "channel_link": %s}' % ("true" if index == 0 else "false"),
                 "r": f"R-{entry_id.hex[:10]}", "ts": now + timedelta(seconds=index)})
        ballot_id = (await conn.execute(text(
            "insert into odyssey.ballots (campaign_id, version, state, opens_at, closes_at) "
            "values (:c, 1, 'open', :o, :x) returning id"),
            {"c": campaign_id, "o": now - timedelta(minutes=1), "x": now + closes_in})).scalar_one()
        for label, entry_id in (("A", entry_a), ("B", entry_b)):
            await conn.execute(text(
                "insert into odyssey.ballot_finalists (ballot_id, entry_id, label, locked_asset_id, marker_ms) "
                "values (:b, :e, :l, :a, 5000)"),
                {"b": ballot_id, "e": entry_id, "l": label, "a": f"asset-{'AB'.index(label)}"})
            await conn.execute(text("update odyssey.entries set state = 'finalist' where id = :id"),
                               {"id": entry_id})
        await conn.execute(text("update odyssey.campaigns set state = 'shortlist_locked' where id = :id"),
                           {"id": campaign_id})
        if voting:
            await conn.execute(text("update odyssey.campaigns set state = 'voting' where id = :id"),
                               {"id": campaign_id})
    return World(campaign_id, slug, ballot_id, entry_a, entry_b)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def idem() -> dict[str, str]:
    return {"Idempotency-Key": f"test-{uuid.uuid4().hex}"}
