"""Voting, close and publish through the real apps, real PostgreSQL and real Redis (AC-10 to AC-16)."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text

from tests.helpers import bearer, idem, make_world, owner_engine

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine():
    eng = owner_engine()
    yield eng
    await eng.dispose()


async def vote(public, token, world, entry, *, sub=None, headers=None, role="fan"):
    tok = token(sub=sub or str(uuid.uuid4()), role=role)
    return await public.post(
        f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(entry)},
        headers={**bearer(tok), **(headers or idem())},
    )


async def close(internal, service_token, ballot_id, key=None):
    return await internal.post(f"/internal/v1/ballots/{ballot_id}/close",
                               headers={**bearer(service_token()), **(key or idem())})


async def test_vote_cast_change_and_same_choice(public, engine, token):
    world = await make_world(engine)
    sub = str(uuid.uuid4())
    first = await vote(public, token, world, world.entry_a, sub=sub)
    assert first.status_code == 201 and first.json()["revision"] == 1
    me = await public.get(f"/v1/ballots/{world.ballot_id}/me", headers=bearer(token(sub=sub, role="fan")))
    assert me.json()["entry_id"] == str(world.entry_a)

    changed = await vote(public, token, world, world.entry_b, sub=sub)
    assert changed.status_code == 200 and changed.json()["revision"] == 2

    same = await vote(public, token, world, world.entry_b, sub=sub)
    assert same.status_code == 200 and same.json()["revision"] == 2 and same.json()["changed"] is False

    async with engine.connect() as conn:
        rows = (await conn.execute(text("select entry_id, revision from odyssey.votes where ballot_id = :b"),
                                   {"b": world.ballot_id})).all()
        topics = [r.topic for r in (await conn.execute(text(
            "select topic from odyssey.outbox where payload->'props'->>'ballot_id' = :b "
            "and topic in ('vote.cast', 'vote.changed') order by id"), {"b": str(world.ballot_id)})).all()]
    assert len(rows) == 1 and rows[0].entry_id == world.entry_b and rows[0].revision == 2
    assert topics == ["vote.cast", "vote.changed"]  # the repeated choice wrote no event


async def test_vote_refusals(public, internal, engine, token, service_token):
    world = await make_world(engine)
    no_auth = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                                headers=idem())
    assert no_auth.status_code == 401
    assert no_auth.headers["content-type"].startswith("application/problem+json")
    for role in ("producer", "partner"):
        assert (await vote(public, token, world, world.entry_a, role=role)).status_code == 403
    outsider = await vote(public, token, world, uuid.uuid4())
    assert outsider.status_code == 422 and outsider.json()["type"].endswith("/not-a-finalist")
    missing_key = await public.post(f"/v1/ballots/{world.ballot_id}/votes", json={"entry_id": str(world.entry_a)},
                                    headers=bearer(token(role="fan")))
    assert missing_key.status_code == 400
    extra_field = await public.post(f"/v1/ballots/{world.ballot_id}/votes",
                                    json={"entry_id": str(world.entry_a), "weight": 5},
                                    headers={**bearer(token(role="fan")), **idem()})
    assert extra_field.status_code == 422

    # Past the deadline on the database clock, whatever the client says.
    late = await make_world(engine, closes_in=timedelta(seconds=-30))
    r = await vote(public, token, late, late.entry_a)
    assert r.status_code == 409 and r.json()["type"].endswith("/ballot-closed")

    # Paused, then closed.
    async with engine.begin() as conn:
        await conn.execute(text("update odyssey.ballots set state = 'paused' where id = :b"), {"b": world.ballot_id})
    r = await vote(public, token, world, world.entry_a)
    assert r.status_code == 409 and r.json()["type"].endswith("/ballot-paused")
    async with engine.begin() as conn:
        await conn.execute(text("update odyssey.ballots set state = 'open' where id = :b"), {"b": world.ballot_id})
    assert (await close(internal, service_token, world.ballot_id)).status_code == 200
    r = await vote(public, token, world, world.entry_a)
    assert r.status_code == 409 and r.json()["type"].endswith("/ballot-closed")


async def test_idempotent_vote(public, engine, token):
    world = await make_world(engine)
    sub, headers = str(uuid.uuid4()), idem()
    a = await vote(public, token, world, world.entry_a, sub=sub, headers=headers)
    b = await vote(public, token, world, world.entry_a, sub=sub, headers=headers)
    assert a.status_code == 201 and b.status_code == 201 and a.json() == b.json()
    assert b.headers.get("idempotent-replay") == "true"
    reuse = await vote(public, token, world, world.entry_b, sub=sub, headers=headers)
    assert reuse.status_code == 422 and reuse.json()["type"].endswith("/idempotency-key-reuse")
    async with engine.connect() as conn:
        n = (await conn.execute(text("select count(*) from odyssey.votes where ballot_id = :b"),
                                {"b": world.ballot_id})).scalar_one()
        events = (await conn.execute(text(
            "select count(*) from odyssey.outbox where topic = 'vote.cast' and payload->'props'->>'ballot_id' = :b"),
            {"b": str(world.ballot_id)})).scalar_one()
    assert n == 1 and events == 1

    # Twenty concurrent requests with one key produce one effect.
    sub2, headers2 = str(uuid.uuid4()), idem()
    results = await asyncio.gather(*[vote(public, token, world, world.entry_b, sub=sub2, headers=headers2)
                                     for _ in range(20)])
    assert {r.status_code for r in results} == {201}
    assert len({json.dumps(r.json(), sort_keys=True) for r in results}) == 1
    async with engine.connect() as conn:
        n = (await conn.execute(text("select count(*) from odyssey.votes where voter_id = :v"),
                                {"v": sub2})).scalar_one()
    assert n == 1


RACE_RESULTS: list[tuple[int, int]] = []  # (accepted, refused) per run


@pytest.mark.parametrize("run", range(10))
async def test_vote_close_race(public, internal, engine, token, service_token, run):
    """200 concurrent voters race one close. Every success is in the frozen tally, every refusal left no row."""
    world = await make_world(engine)
    voters = [str(uuid.uuid4()) for _ in range(200)]
    finished = 0
    fire = asyncio.Event()
    threshold = 10 + 18 * run  # the close fires after this many votes have returned, with the rest in flight

    async def cast(index: int):
        nonlocal finished
        entry = world.entry_a if index % 3 else world.entry_b
        response = await vote(public, token, world, entry, sub=voters[index])
        finished += 1
        if finished >= threshold:
            fire.set()
        return voters[index], entry, response.status_code

    async def closer():
        await fire.wait()
        return await close(internal, service_token, world.ballot_id)

    outcomes = await asyncio.gather(closer(), *[cast(i) for i in range(200)])
    close_response, casts = outcomes[0], outcomes[1:]
    assert close_response.status_code == 200
    assert {status for _, _, status in casts} <= {201, 409}

    accepted = {voter: entry for voter, entry, status in casts if status == 201}
    refused = [voter for voter, _, status in casts if status == 409]
    async with engine.connect() as conn:
        rows = (await conn.execute(text("select voter_id::text as v, entry_id from odyssey.votes "
                                        "where ballot_id = :b"), {"b": world.ballot_id})).all()
        ballot = (await conn.execute(text("select state, tally, closed_at from odyssey.ballots where id = :b"),
                                     {"b": world.ballot_id})).one()
    RACE_RESULTS.append((len(accepted), len(refused)))
    stored = {r.v: r.entry_id for r in rows}
    assert stored == accepted                       # one row per accepted voter, none for the refused
    assert not set(refused) & set(stored)
    assert ballot.state == "closed"
    expected = {}
    for entry in stored.values():
        expected[str(entry)] = expected.get(str(entry), 0) + 1
    assert ballot.tally == expected                 # the frozen tally equals the vote table exactly


async def test_close_waits_for_an_inflight_vote(internal, engine, service_token):
    """Deterministic: a vote that holds the ballot share lock delays close, and lands in the frozen tally."""
    world = await make_world(engine)
    voter = uuid.uuid4()
    async with engine.connect() as slow_vote:
        transaction = await slow_vote.begin()
        await slow_vote.execute(text("select 1 from odyssey.ballots where id = :b for share"), {"b": world.ballot_id})
        await slow_vote.execute(text(
            "insert into odyssey.votes (ballot_id, voter_id, entry_id) values (:b, :v, :e)"),
            {"b": world.ballot_id, "v": voter, "e": world.entry_a})
        closing = asyncio.create_task(close(internal, service_token, world.ballot_id))
        await asyncio.sleep(0.4)
        assert not closing.done(), "close must wait for the vote that is still in flight"
        await transaction.commit()
        response = await closing
    assert response.status_code == 200
    assert response.json()["tally"] == {str(world.entry_a): 1}


async def test_a_vote_behind_a_closing_ballot_is_refused(public, engine, token):
    """Deterministic: a vote that arrives while close holds the row waits, then is refused, never half-applied."""
    world = await make_world(engine)
    async with engine.connect() as closing:
        transaction = await closing.begin()
        await closing.execute(text("select 1 from odyssey.ballots where id = :b for update"), {"b": world.ballot_id})
        await closing.execute(text("update odyssey.ballots set state = 'closed', closed_at = clock_timestamp(), "
                                   "tally = '{}'::jsonb where id = :b"), {"b": world.ballot_id})
        await closing.execute(text("update odyssey.campaigns set state = 'closed' where id = :c"),
                              {"c": world.campaign_id})
        racing = asyncio.create_task(vote(public, token, world, world.entry_a))
        await asyncio.sleep(0.4)
        assert not racing.done(), "the vote must wait while close holds the ballot row"
        await transaction.commit()
        response = await racing
    assert response.status_code == 409 and response.json()["type"].endswith("/ballot-closed")
    async with engine.connect() as conn:
        n = (await conn.execute(text("select count(*) from odyssey.votes where ballot_id = :b"),
                                {"b": world.ballot_id})).scalar_one()
    assert n == 0


async def test_the_race_was_actually_contended():
    """Guards the guard: if no run ever mixed accepted and refused votes, the race test proved nothing."""
    print("race results (accepted, refused):", RACE_RESULTS)
    assert len(RACE_RESULTS) == 10
    assert any(accepted > 0 and refused > 0 for accepted, refused in RACE_RESULTS), RACE_RESULTS


async def test_close_is_repeatable(public, internal, engine, token, service_token):
    world = await make_world(engine)
    for _ in range(3):
        assert (await vote(public, token, world, world.entry_a)).status_code == 201
    first = await close(internal, service_token, world.ballot_id)
    second = await close(internal, service_token, world.ballot_id)  # a new key
    assert first.status_code == second.status_code == 200
    assert first.json()["tally"] == second.json()["tally"] == {str(world.entry_a): 3}
    assert second.json()["already_closed"] is True
    async with engine.connect() as conn:
        state = (await conn.execute(text("select state from odyssey.campaigns where id = :c"),
                                    {"c": world.campaign_id})).scalar_one()
        closed_events = (await conn.execute(text(
            "select count(*) from odyssey.outbox where topic = 'ballot.closed' and payload->'props'->>'ballot_id' = :b"),
            {"b": str(world.ballot_id)})).scalar_one()
    assert state == "closed" and closed_events == 1


async def test_publish_race_creates_one_episode(public, internal, engine, token, service_token):
    world = await make_world(engine)
    for i in range(5):
        assert (await vote(public, token, world, world.entry_a if i < 3 else world.entry_b)).status_code == 201
    assert (await close(internal, service_token, world.ballot_id)).status_code == 200

    async def publish():
        return await internal.post(f"/internal/v1/ballots/{world.ballot_id}/publish",
                                   headers={**bearer(service_token()), **idem()})

    first_pair = await asyncio.gather(publish(), publish())
    assert [r.status_code for r in first_pair] == [200, 200]
    ids = {r.json()["episode_id"] for r in first_pair}
    assert len(ids) == 1
    assert sorted(r.json()["created"] for r in first_pair) == [False, True]
    third = await publish()
    assert third.json()["episode_id"] in ids and third.json()["created"] is False

    async with engine.connect() as conn:
        episodes = (await conn.execute(text("select count(*) from odyssey.episodes where ballot_id = :b"),
                                       {"b": world.ballot_id})).scalar_one()
        events = (await conn.execute(text(
            "select count(*) from odyssey.outbox where topic = 'episode.published' "
            "and payload->'props'->>'ballot_id' = :b"), {"b": str(world.ballot_id)})).scalar_one()
        credits = (await conn.execute(text(
            "select handle, channel_url, role from odyssey.credits cr join odyssey.episodes e on e.id = cr.episode_id "
            "where e.ballot_id = :b order by position"), {"b": world.ballot_id})).all()
        campaign = (await conn.execute(text("select state from odyssey.campaigns where id = :c"),
                                       {"c": world.campaign_id})).scalar_one()
    assert episodes == 1 and events == 1 and campaign == "published"
    assert [c.role for c in credits] == ["winner", "finalist"]
    assert credits[0].channel_url == "https://example.com/a"   # creator_a opted in to a channel link
    assert credits[1].channel_url is None                      # creator_b did not


async def test_publish_needs_a_closed_ballot(internal, engine, service_token):
    world = await make_world(engine)
    r = await internal.post(f"/internal/v1/ballots/{world.ballot_id}/publish",
                            headers={**bearer(service_token()), **idem()})
    assert r.status_code == 409 and r.json()["type"].endswith("/illegal-transition")
    async with engine.connect() as conn:
        n = (await conn.execute(text("select count(*) from odyssey.episodes where ballot_id = :b"),
                                {"b": world.ballot_id})).scalar_one()
    assert n == 0
