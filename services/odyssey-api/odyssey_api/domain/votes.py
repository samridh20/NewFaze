"""Cast or change a vote (design 3.6, FR-6). One transaction, ordered by the ballot row lock."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.auth import Principal
from faze_common.errors import ProblemError

from . import outbox


async def cast_vote(
    conn: AsyncConnection,
    *,
    ballot_id: uuid.UUID,
    principal: Principal,
    entry_id: uuid.UUID,
    referral: str | None,
    ip_hash: str | None,
) -> dict[str, Any]:
    # FOR SHARE: a concurrent close (FOR UPDATE) waits for this vote, and later votes wait for the close.
    ballot = (
        await conn.execute(
            text(
                "select b.state, b.campaign_id, c.state as campaign_state, "
                "       clock_timestamp() < b.opens_at as not_yet, clock_timestamp() >= b.closes_at as past "
                "from odyssey.ballots b join odyssey.campaigns c on c.id = b.campaign_id "
                "where b.id = :id for share of b"
            ),
            {"id": ballot_id},
        )
    ).first()
    if ballot is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    if ballot.state == "paused":
        raise ProblemError(409, "ballot-paused", "The ballot is paused")
    if ballot.state != "open" or ballot.past or ballot.campaign_state not in ("voting",):
        if ballot.not_yet or (ballot.state == "open" and ballot.campaign_state != "voting" and not ballot.past):
            raise ProblemError(409, "ballot-not-open", "Voting has not opened yet")
        raise ProblemError(409, "ballot-closed", "The ballot is closed")
    if ballot.not_yet:
        raise ProblemError(409, "ballot-not-open", "Voting has not opened yet")

    finalist = (
        await conn.execute(
            text("select 1 from odyssey.ballot_finalists where ballot_id = :b and entry_id = :e"),
            {"b": ballot_id, "e": entry_id},
        )
    ).first()
    if finalist is None:
        raise ProblemError(422, "not-a-finalist", "That entry is not a finalist on this ballot")

    await conn.execute(
        text(
            "insert into odyssey.accounts (user_id, handle, role, analytics_consent) "
            "values (:u, :h, :r, false) "
            "on conflict (user_id) do update set handle = excluded.handle"
        ),
        {"u": principal.sub, "h": principal.handle or "fan", "r": principal.role},
    )

    row = (
        await conn.execute(
            text(
                "insert into odyssey.votes (ballot_id, voter_id, entry_id, referral, ip_hash) "
                "values (:b, :v, :e, :ref, :ip) "
                "on conflict (ballot_id, voter_id) do update "
                "  set entry_id = excluded.entry_id, revision = odyssey.votes.revision + 1, "
                "      updated_at = clock_timestamp() "
                "  where odyssey.votes.entry_id <> excluded.entry_id "
                "returning revision, (xmax = 0) as inserted"
            ),
            {"b": ballot_id, "v": principal.sub, "e": entry_id, "ref": referral, "ip": ip_hash},
        )
    ).first()

    if row is None:  # the same choice again: nothing changes and no event is written
        current = (
            await conn.execute(
                text("select revision from odyssey.votes where ballot_id = :b and voter_id = :v"),
                {"b": ballot_id, "v": principal.sub},
            )
        ).one()
        return {"ballot_id": str(ballot_id), "entry_id": str(entry_id), "revision": current.revision,
                "changed": False}

    await outbox.emit(
        conn,
        "vote.cast" if row.inserted else "vote.changed",
        campaign_id=ballot.campaign_id,
        account_user_id=principal.sub,
        referral=referral,
        props={"ballot_id": str(ballot_id), "entry_id": str(entry_id), "revision": row.revision},
    )
    return {"ballot_id": str(ballot_id), "entry_id": str(entry_id), "revision": row.revision, "changed": True}


async def my_vote(conn: AsyncConnection, ballot_id: uuid.UUID, user_id: str) -> dict[str, Any]:
    ballot = (
        await conn.execute(
            text("select b.state, b.closes_at, c.slug from odyssey.ballots b "
                 "join odyssey.campaigns c on c.id = b.campaign_id where b.id = :id"),
            {"id": ballot_id},
        )
    ).first()
    if ballot is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    vote = (
        await conn.execute(
            text("select entry_id, revision from odyssey.votes where ballot_id = :b and voter_id = :v"),
            {"b": ballot_id, "v": user_id},
        )
    ).first()
    return {
        "ballot_id": str(ballot_id),
        "state": ballot.state,
        "campaign_slug": ballot.slug,
        "entry_id": str(vote.entry_id) if vote else None,
        "revision": vote.revision if vote else None,
    }
