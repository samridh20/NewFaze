"""State machines enforced by the database, internal-route auth, rate limits (AC-6, AC-13, AC-20)."""

from __future__ import annotations

import itertools
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from faze_common.ratelimit import RateLimitUnavailable
from faze_common.states import (
    BALLOT_STATES,
    BALLOT_TRANSITIONS,
    CAMPAIGN_STATES,
    CAMPAIGN_TRANSITIONS,
    ENTRY_STATES,
    ENTRY_TRANSITIONS,
)
from tests.helpers import bearer, idem, make_world, owner_engine

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine():
    eng = owner_engine()
    yield eng
    await eng.dispose()


async def test_code_and_database_transition_tables_agree(engine):
    async with engine.connect() as conn:
        for table, expected in (("campaign", CAMPAIGN_TRANSITIONS), ("entry", ENTRY_TRANSITIONS),
                                ("ballot", BALLOT_TRANSITIONS)):
            rows = (await conn.execute(text(f"select from_state, to_state from odyssey.{table}_transitions"))).all()
            assert {(r.from_state, r.to_state) for r in rows} == set(expected), table


async def _try(engine, sql: str, params: dict) -> str | None:
    """Returns None on success, or the error message."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql), params)
        return None
    except DBAPIError as exc:
        return str(exc.orig)


@pytest.mark.parametrize("source,target", [p for p in itertools.product(CAMPAIGN_STATES, CAMPAIGN_STATES) if p[0] != p[1]])
async def test_illegal_campaign_moves_fail_in_sql(engine, source, target):
    campaign_id = uuid.uuid4()
    async with engine.begin() as conn:  # INSERT does not fire the update guard, so any starting state can be set up
        await conn.execute(text(
            "insert into odyssey.campaigns (id, slug, format, title, state, paused_from) "
            "values (:id, :s, 'recreate_the_shot', 't', cast(:st as odyssey.campaign_state), "
            "        case when :st = 'paused' then cast('voting' as odyssey.campaign_state) end)"),
            {"id": campaign_id, "s": f"c-{campaign_id.hex[:12]}", "st": source})
    error = await _try(engine, "update odyssey.campaigns set state = cast(:t as odyssey.campaign_state) where id = :id",
                       {"t": target, "id": campaign_id})
    if (source, target) not in CAMPAIGN_TRANSITIONS:
        assert error is not None and "illegal-transition" in error, f"{source} -> {target} must be refused"


@pytest.mark.parametrize("source,target", [p for p in itertools.product(ENTRY_STATES, ENTRY_STATES) if p[0] != p[1]])
async def test_entry_moves_in_sql(engine, source, target):
    world = await make_world(engine, voting=False)
    async with engine.begin() as conn:
        entry_id = uuid.uuid4()
        await conn.execute(text(
            "insert into odyssey.entries (id, campaign_id, user_id, source, handle, permissions, state, receipt_code) "
            "values (:id, :c, :u, 'link', 'h', '{}'::jsonb, :st, :r)"),
            {"id": entry_id, "c": world.campaign_id, "u": uuid.uuid4(), "st": source, "r": f"R-{entry_id.hex[:10]}"})
    error = await _try(engine, "update odyssey.entries set state = :t where id = :id", {"t": target, "id": entry_id})
    allowed = (source, target) in ENTRY_TRANSITIONS
    assert (error is None) == allowed, f"{source} -> {target}: {error}"
    # An entry withdrawn after publication, or a published entry going back, is impossible (App. A #10).
    if source == "published":
        assert error is not None


@pytest.mark.parametrize("source,target", [p for p in itertools.product(BALLOT_STATES, BALLOT_STATES) if p[0] != p[1]])
async def test_ballot_moves_in_sql(engine, source, target):
    world = await make_world(engine, voting=False)
    async with engine.begin() as conn:
        ballot_id = (await conn.execute(text(
            "insert into odyssey.ballots (campaign_id, version, state, opens_at, closes_at) "
            "values (:c, 2, :s, now() - interval '1 hour', now() + interval '1 hour') returning id"),
            {"c": world.campaign_id, "s": source})).scalar_one()
    error = await _try(engine, "update odyssey.ballots set state = :t where id = :id", {"t": target, "id": ballot_id})
    assert (error is None) == ((source, target) in BALLOT_TRANSITIONS), f"{source} -> {target}: {error}"
    if source == "closed":
        assert error is not None  # a ballot is never reopened after close


async def test_api_rejects_illegal_campaign_move_with_409(internal, engine, service_token):
    world = await make_world(engine, voting=False)  # shortlist_locked
    r = await internal.post(f"/internal/v1/campaigns/{world.campaign_id}/transition", json={"to": "archived"},
                            headers={**bearer(service_token()), **idem()})
    assert r.status_code == 409 and r.json()["type"].endswith("/illegal-transition")
    r = await internal.post(f"/internal/v1/campaigns/{world.campaign_id}/transition", json={"to": "published"},
                            headers={**bearer(service_token()), **idem()})
    assert r.status_code == 409 and r.json()["type"].endswith("/precondition-failed")


async def test_finalists_cannot_change_after_lock(engine):
    world = await make_world(engine)
    error = await _try(engine, "update odyssey.ballot_finalists set marker_ms = 1 where ballot_id = :b",
                       {"b": world.ballot_id})
    assert error is not None and "ballot-locked" in error
    error = await _try(engine, "delete from odyssey.ballot_finalists where ballot_id = :b", {"b": world.ballot_id})
    assert error is not None and "ballot-locked" in error


async def test_closed_ballot_never_reopens_or_changes_its_tally(engine, internal, service_token):
    world = await make_world(engine)
    r = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/close",
                            headers={**bearer(service_token()), **idem()})
    assert r.status_code == 200
    assert "illegal-transition" in (await _try(engine, "update odyssey.ballots set state = 'open' where id = :b",
                                               {"b": world.ballot_id}) or "")
    assert "ballot-frozen" in (await _try(engine, "update odyssey.ballots set tally = '{\"x\": 1}'::jsonb where id = :b",
                                          {"b": world.ballot_id}) or "")
    assert "ballot-frozen" in (await _try(engine, "update odyssey.ballots set closes_at = closes_at + interval '1 day' "
                                          "where id = :b", {"b": world.ballot_id}) or "")


async def test_sim_prediction_is_refused_after_close(internal, engine, service_token):
    world = await make_world(engine)
    body = {"commitment": "a" * 64}
    ok = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/prediction", json=body,
                             headers={**bearer(service_token()), **idem()})
    assert ok.status_code == 200
    await internal.post(f"/internal/v1/ballots/{world.ballot_id}/close", headers={**bearer(service_token()), **idem()})
    late = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/prediction", json=body,
                               headers={**bearer(service_token()), **idem()})
    assert late.status_code == 409 and late.json()["type"].endswith("/prediction-too-late")


# ------------------------------------------------------------------ AC-6: internal routes

async def test_internal_routes_need_a_service_token(internal, public, engine, token, service_token):
    world = await make_world(engine)
    path = f"/internal/v1/ballots/{world.ballot_id}"
    assert (await internal.get(path)).status_code == 401
    assert (await internal.get(path, headers=bearer(token(role="admin")))).status_code == 403  # admin JWT is not enough
    assert (await internal.get(path, headers=bearer(token(role="producer")))).status_code == 403
    assert (await internal.get(path, headers=bearer("not.a.jwt"))).status_code in (401, 403)
    assert (await internal.get(path, headers=bearer(service_token()))).status_code == 200
    assert (await public.get(path)).status_code == 404            # the public listener has no internal routes
    assert (await public.get(path, headers=bearer(service_token()))).status_code == 404


async def test_advance_does_not_exist_without_demo_mode(internal, engine, service_token):
    world = await make_world(engine, voting=False)
    settings = internal._transport.app.state.settings  # noqa: SLF001
    settings.DEMO_MODE = False
    try:
        r = await internal.post(f"/internal/v1/campaigns/{world.campaign_id}/advance",
                                headers={**bearer(service_token()), **idem()})
        assert r.status_code == 404
    finally:
        settings.DEMO_MODE = True
    r = await internal.post(f"/internal/v1/campaigns/{world.campaign_id}/advance",
                            headers={**bearer(service_token()), **idem()})
    assert r.status_code == 200 and r.json()["to"] == "voting"


async def test_expired_and_wrong_tokens_are_refused(public, engine, token):
    world = await make_world(engine)
    path, body = f"/v1/ballots/{world.ballot_id}/votes", {"entry_id": str(world.entry_a)}
    expired = token(role="fan", ttl=-60)
    assert (await public.post(path, json=body, headers={**bearer(expired), **idem()})).status_code == 401
    import jwt  # noqa: PLC0415

    forged = jwt.encode({"sub": str(uuid.uuid4()), "role": "fan", "aud": "faze", "iss": "x"}, "secret", algorithm="HS256")
    assert (await public.post(path, json=body, headers={**bearer(forged), **idem()})).status_code == 401
    none_alg = jwt.encode({"sub": str(uuid.uuid4()), "role": "fan"}, None, algorithm="none")
    assert (await public.post(path, json=body, headers={**bearer(none_alg), **idem()})).status_code == 401


# ------------------------------------------------------------------ AC-13: rate limits

async def test_vote_rate_limits(public_app, public, engine, token):
    settings = public_app.state.settings
    saved = (settings.VOTE_ACCOUNT_CAPACITY, settings.VOTE_ACCOUNT_REFILL_PER_SEC,
             settings.VOTE_IP_CAPACITY, settings.VOTE_IP_REFILL_PER_SEC)
    await public_app.state.redis.flushdb()
    try:
        settings.VOTE_ACCOUNT_CAPACITY, settings.VOTE_ACCOUNT_REFILL_PER_SEC = 2, 0.001
        world = await make_world(engine)
        sub = str(uuid.uuid4())
        statuses = []
        for _ in range(3):
            r = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                                  headers={**bearer(token(sub=sub, role="fan")), **idem()})
            statuses.append(r)
        assert [r.status_code for r in statuses] == [201, 200, 429]
        assert statuses[2].json()["type"].endswith("/rate-limited") and int(statuses[2].headers["retry-after"]) >= 1

        # Many accounts behind one client IP share the IP bucket, and a spoofed header from an untrusted peer
        # does not move the charge to another bucket.
        await public_app.state.redis.flushdb()
        settings.VOTE_ACCOUNT_CAPACITY, settings.VOTE_ACCOUNT_REFILL_PER_SEC = 1000, 1000
        settings.VOTE_IP_CAPACITY, settings.VOTE_IP_REFILL_PER_SEC = 3, 0.001
        codes = []
        for i in range(5):
            r = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                                  headers={**bearer(token(role="fan")), **idem(), "X-Forwarded-For": f"203.0.113.{i}"})
            codes.append(r.status_code)
        assert codes[:3] == [201, 201, 201] and codes[3:] == [429, 429]
    finally:
        (settings.VOTE_ACCOUNT_CAPACITY, settings.VOTE_ACCOUNT_REFILL_PER_SEC,
         settings.VOTE_IP_CAPACITY, settings.VOTE_IP_REFILL_PER_SEC) = saved
        await public_app.state.redis.flushdb()


async def test_votes_fail_closed_when_the_limiter_is_down(public_app, public, engine, token):
    class Down:
        async def take(self, *_a, **_k):
            raise RateLimitUnavailable("redis down")

    world = await make_world(engine)
    real = public_app.state.limiter
    public_app.state.limiter = Down()
    try:
        r = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                              headers={**bearer(token(role="fan")), **idem()})
    finally:
        public_app.state.limiter = real
    assert r.status_code == 503 and r.json()["type"].endswith("/rate-limit-unavailable")
    async with engine.connect() as conn:
        n = (await conn.execute(text("select count(*) from odyssey.votes where ballot_id = :b"),
                                {"b": world.ballot_id})).scalar_one()
    assert n == 0   # nothing was accepted without a limit (A-9)


async def test_no_secrets_or_tokens_in_error_bodies(public, engine, token):
    world = await make_world(engine)
    tok = token(role="fan")
    r = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": "not-a-uuid"},
                          headers={**bearer(tok), **idem()})
    assert r.status_code == 422 and tok not in r.text and r.headers["content-type"].startswith("application/problem+json")


async def test_prediction_is_stored_only_as_a_hash_and_revealed_at_publish(internal, engine, service_token):
    from faze_common.commitment import prediction_commitment
    world = await make_world(engine)
    predicted = {str(world.entry_a): 0.7, str(world.entry_b): 0.3}
    h = {**bearer(service_token()), **idem()}
    c = prediction_commitment(str(world.ballot_id), predicted, "nonce-12345")
    assert (await internal.post(f"/internal/v1/ballots/{world.ballot_id}/prediction", json={"commitment": c},
                                headers=h)).status_code == 200
    async with engine.connect() as conn:
        cols = {r[0] for r in (await conn.execute(text(
            "select column_name from information_schema.columns where table_schema='odyssey' "
            "and table_name='sim_predictions'"))).all()}
    assert "predicted" not in cols and "commitment" in cols
    await internal.post(f"/internal/v1/ballots/{world.ballot_id}/close", headers={**bearer(service_token()), **idem()})
    bad = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/publish",
                              json={"predicted": {str(world.entry_a): 0.2, str(world.entry_b): 0.8}, "nonce": "nonce-12345"},
                              headers={**bearer(service_token()), **idem()})
    assert bad.status_code == 422
    ok = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/publish",
                             json={"predicted": predicted, "nonce": "nonce-12345"},
                             headers={**bearer(service_token()), **idem()})
    assert ok.status_code == 200


async def test_supabase_shaped_token_maps_app_metadata_role(public, engine, dev_auth_url):
    import httpx
    from dev_auth.main import mint
    token = mint(role="producer")
    me = await public.get(f"/v1/ballots/{uuid.uuid4()}/me", headers=bearer(token))
    assert me.status_code != 401  # authenticated and not rejected as role "authenticated"
    bad = await public.get(f"/v1/ballots/{uuid.uuid4()}/me", headers=bearer(mint(role="authenticated")))
    assert bad.status_code == 401
