"""Seeded stage flow through the real APIs: vote -> close -> Lab commitment -> publish with reveal -> VOD review."""
import httpx
import pytest_asyncio
from sqlalchemy import text

import signal_lab_api.main as lab
from fixture_gateway.main import app as gateway
from tests.helpers import bearer, idem, make_world, owner_engine

from faze_common.settings import get_settings


@pytest_asyncio.fixture(scope="module", loop_scope="session")
async def lab_client(dev_auth_url):
    get_settings.cache_clear()
    lab.GATEWAY_TRANSPORT = httpx.ASGITransport(app=gateway)
    async with lab.app.router.lifespan_context(lab.app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=lab.app), base_url="http://lab", timeout=60) as c:
            yield c


async def test_sim_vs_fans_is_hash_only_until_publish_then_revealed(lab_client, public, internal, token, service_token,
                                                                    monkeypatch):
    owner = owner_engine()
    world = await make_world(owner)

    async def to_internal(method, path, actor, *, json_body=None, public=False):
        client = public_client if public else internal
        headers = {} if public else {**bearer(service_token(actor)), **idem()}
        return await client.request(method, path, json=json_body, headers=headers)
    public_client = public
    monkeypatch.setattr(lab, "odyssey", to_internal)

    for i in range(3):
        r = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                              headers={**bearer(token()), **idem()})
        assert r.status_code in (200, 201), r.text
    producer = token(role="producer", handle="producer-pat")
    scrim = await lab_client.post("/v1/scrims", headers=bearer(producer), json={
        "ballot_id": str(world.ballot_id), "labels": {str(world.entry_a): "A", str(world.entry_b): "B"}, "bots": 12})
    assert scrim.status_code == 201, scrim.text
    assert scrim.json()["fixture"] is True
    run_id = scrim.json()["id"]
    reg = await lab_client.post(f"/v1/scrims/{run_id}/prediction", headers=bearer(producer))
    assert reg.status_code == 200, reg.text

    async with owner.connect() as c:  # before close: only a hash exists in Odyssey
        row = (await c.execute(text("select commitment from odyssey.sim_predictions where ballot_id=:b"),
                               {"b": world.ballot_id})).one()
    assert len(row.commitment) == 64
    before = await public.get(f"/v1/ballots/{world.ballot_id}/me", headers=bearer(token()))
    assert "predicted" not in before.text and row.commitment not in before.text

    assert (await internal.post(f"/internal/v1/ballots/{world.ballot_id}/close",
                                headers={**bearer(service_token()), **idem()})).status_code == 200
    pub = await lab_client.post(f"/v1/scrims/{run_id}/reveal-and-publish", headers=bearer(producer))
    assert pub.status_code == 200, pub.text
    slug = pub.json().get("slug") or pub.json().get("episode", {}).get("slug")
    vod = await lab_client.get(f"/v1/vod/{slug}", headers=bearer(producer))
    assert vod.status_code == 200
    svf = vod.json()["sim_vs_fans"]
    assert svf["simulated"] is True and svf["calibrated"] is False
    assert set(svf["predicted"]) == {str(world.entry_a), str(world.entry_b)}
    assert svf["real"][str(world.entry_a)] == 3
    fan = await lab_client.get(f"/v1/vod/{slug}", headers=bearer(token()))
    assert fan.status_code == 403
