"""P5 workers: relay moves outbox to wh.events once; janitor purges expired keys; outcome freeze is final."""
from __future__ import annotations
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from faze_common.settings import get_settings
from workers import janitor, outcomes, relay
from tests.helpers import make_world, owner_engine


@pytest.fixture
async def engines():
    s = get_settings()
    e = {r: create_async_engine(s.database_url(r)) for r in ("relay", "workers_rw")}
    yield e
    for x in e.values():
        await x.dispose()


async def test_relay_copies_each_event_once_and_marks_published(engines):
    owner = owner_engine()
    async with owner.begin() as c:
        await c.execute(text("insert into odyssey.outbox (topic, payload) values ('vote.cast', cast(:p as jsonb))"),
                        {"p": '{"event_id":"11111111-1111-4111-8111-111111111111","v":1,"props":{"a":1}}'})
    moved = 0
    while batch := await relay.relay_once(engines["relay"]):
        moved += batch
    assert moved >= 1
    assert await relay.relay_once(engines["relay"]) == 0
    async with owner.connect() as c:
        n = (await c.execute(text("select count(*) from wh.events where event_id='11111111-1111-4111-8111-111111111111'"))).scalar_one()
        pending = (await c.execute(text("select count(*) from odyssey.outbox where published_at is null"))).scalar_one()
    assert n == 1 and pending == 0


async def test_janitor_purges_only_expired_keys(engines):
    owner = owner_engine()
    async with owner.begin() as c:
        await c.execute(text("insert into odyssey.idempotency_keys (scope,key,request_hash,status_code,expires_at) "
                             "values ('t','old','h',200, now() - interval '1 hour'),('t','new','h',200, now() + interval '1 hour')"))
    assert await janitor.purge_once(engines["workers_rw"]) >= 1
    async with owner.connect() as c:
        keys = {r[0] for r in (await c.execute(text("select key from odyssey.idempotency_keys where scope='t'"))).all()}
    assert keys == {"new"}


async def test_outcome_freeze_is_final(engines):
    owner = owner_engine()
    import uuid
    cid = uuid.uuid4()
    async with owner.begin() as c:
        await c.execute(text("insert into odyssey.campaigns (id, slug, format, title) values (:c, :s, 'recreate_the_shot', 't')"),
                        {"c": cid, "s": f"fz-{cid.hex[:8]}"})
        bv = (await c.execute(text("insert into odyssey.brief_versions (campaign_id, variant, body_md, rules) "
                                   "values (:c,'A','b','{}') returning id"), {"c": cid})).scalar_one()
        await c.execute(text("update odyssey.campaigns set live_brief_id=:b, reporting_window_end = now() - interval '1 minute' where id=:c"),
                        {"b": bv, "c": cid})
    assert await outcomes.freeze_once(engines["workers_rw"]) >= 1
    assert await outcomes.freeze_once(engines["workers_rw"]) == 0
    with pytest.raises(Exception, match="outcomes-frozen"):
        async with owner.begin() as c:
            await c.execute(text("update wh.outcome_sets set voters = 99 where campaign_id=:c"), {"c": cid})
