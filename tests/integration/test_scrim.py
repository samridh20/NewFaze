"""P6: scrim determinism and replay without network (AC-27 to AC-29)."""
import json
import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from faze_common.settings import get_settings
from fixture_gateway.main import app as gateway
from scrim.runner import run_scrim
from tests.helpers import owner_engine


async def _new_run(owner, mode, replay_of=None):
    rid = uuid.uuid4()
    async with owner.begin() as c:
        await c.execute(text("insert into lab.scrim_runs (id, mode, replay_of, config, budget_usd) values "
                             "(:i,:m,:r,'{}',0.05)"), {"i": rid, "m": mode, "r": replay_of})
    return rid


async def test_fixture_run_then_replay_is_identical_and_offline():
    owner = owner_engine()
    lab = create_async_engine(get_settings().database_url("lab_app"))
    first = await _new_run(owner, "fixture")
    transport = httpx.ASGITransport(app=gateway)
    a = await run_scrim(lab, run_id=first, base_url="http://fixture/v1", transport=transport)
    replay = await _new_run(owner, "replay", first)
    b = await run_scrim(lab, run_id=replay, base_url="http://127.0.0.1:1")  # nothing listens here
    assert a["predicted"] == b["predicted"]
    assert abs(sum(a["predicted"].values()) - 1.0) < 1e-6
    assert a["fixture"] is True and a["calibrated"] is False
    again = await _new_run(owner, "fixture")
    c = await run_scrim(lab, run_id=again, base_url="http://fixture/v1", transport=transport)
    assert c["predicted"] == a["predicted"]  # same seeds, same answer
    await lab.dispose()
