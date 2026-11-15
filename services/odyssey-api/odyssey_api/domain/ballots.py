"""Lock, open, close and publish (design 3.6). Odyssey is the only writer of this state (FR-3.1)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.commitment import prediction_commitment
from faze_common.errors import ProblemError

from . import outbox


async def _campaign_for_update(conn: AsyncConnection, campaign_id: uuid.UUID) -> Any:
    row = (
        await conn.execute(text("select * from odyssey.campaigns where id = :id for update"), {"id": campaign_id})
    ).first()
    if row is None:
        raise ProblemError(404, "not-found", "Campaign not found")
    return row


async def lock_ballot(
    conn: AsyncConnection,
    *,
    campaign_id: uuid.UUID,
    finalists: list[dict[str, Any]],
    opens_at: datetime,
    closes_at: datetime,
    actor: str,
) -> dict[str, Any]:
    """Lock exactly two finalists and create the ballot (FR-3.6). Moves the campaign to shortlist_locked."""
    campaign = await _campaign_for_update(conn, campaign_id)
    if campaign.state != "accepting_entries":
        raise ProblemError(409, "precondition-failed", "The campaign must be accepting entries",
                           missing=["campaign.state == accepting_entries"])
    if len(finalists) != 2 or len({f["entry_id"] for f in finalists}) != 2:
        raise ProblemError(422, "validation-error", "A ballot needs exactly two distinct finalists",
                           errors=[{"field": "finalists", "message": "send two distinct entry IDs"}])
    if closes_at <= opens_at:
        raise ProblemError(422, "validation-error", "closes_at must be after opens_at",
                           errors=[{"field": "closes_at", "message": "must be later than opens_at"}])
    in_the_future = (await conn.execute(text("select cast(:c as timestamptz) > clock_timestamp()"),
                                        {"c": closes_at})).scalar_one()
    if not in_the_future:
        raise ProblemError(422, "validation-error", "closes_at must be in the future",
                           errors=[{"field": "closes_at", "message": "must be in the future"}])

    problems: list[dict[str, str]] = []
    resolved: list[Any] = []
    for index, finalist in enumerate(finalists):
        entry = (
            await conn.execute(
                text("select id, campaign_id, state, mux_asset_id, duration_ms, permissions "
                     "from odyssey.entries where id = :id for update"),
                {"id": finalist["entry_id"]},
            )
        ).first()
        field = f"finalists[{index}]"
        if entry is None or entry.campaign_id != campaign_id:
            problems.append({"field": field, "message": "entry is not part of this campaign"})
        elif entry.state != "in_review":
            problems.append({"field": field, "message": "entry must be in_review"})
        elif not entry.mux_asset_id:
            problems.append({"field": field, "message": "entry has no ready asset"})
        elif not (entry.permissions or {}).get("editorial_use"):
            problems.append({"field": field, "message": "entry lacks editorial-use permission"})
        elif entry.duration_ms is not None and not 0 <= finalist["marker_ms"] <= entry.duration_ms:
            problems.append({"field": field, "message": "marker is outside the clip"})
        else:
            resolved.append(entry)
    if problems:
        raise ProblemError(422, "validation-error", "Finalists failed validation", errors=problems)

    version = (
        await conn.execute(
            text("select coalesce(max(version), 0) + 1 from odyssey.ballots where campaign_id = :c"),
            {"c": campaign_id},
        )
    ).scalar_one()
    ballot_id = (
        await conn.execute(
            text("insert into odyssey.ballots (campaign_id, version, state, opens_at, closes_at) "
                 "values (:c, :v, 'open', :o, :x) returning id"),
            {"c": campaign_id, "v": version, "o": opens_at, "x": closes_at},
        )
    ).scalar_one()
    for label, finalist, entry in zip("AB", finalists, resolved, strict=True):
        await conn.execute(
            text("insert into odyssey.ballot_finalists (ballot_id, entry_id, label, locked_asset_id, marker_ms) "
                 "values (:b, :e, :l, :a, :m)"),
            {"b": ballot_id, "e": entry.id, "l": label, "a": entry.mux_asset_id, "m": finalist["marker_ms"]},
        )
        await conn.execute(text("update odyssey.entries set state = 'finalist' where id = :id"), {"id": entry.id})
    await conn.execute(
        text("update odyssey.campaigns set state = 'shortlist_locked' where id = :id"), {"id": campaign_id}
    )
    await outbox.emit(conn, "campaign.transitioned", campaign_id=campaign_id,
                      props={"from": "accepting_entries", "to": "shortlist_locked", "actor": actor})
    return {"ballot_id": str(ballot_id), "campaign_id": str(campaign_id), "version": version,
            "state": "open", "campaign_state": "shortlist_locked"}


async def open_voting(conn: AsyncConnection, campaign_id: uuid.UUID, actor: str) -> dict[str, Any]:
    """shortlist_locked to voting: the ballot opens in the same transaction (FR-3.2)."""
    campaign = await _campaign_for_update(conn, campaign_id)
    ballot = (
        await conn.execute(
            text("select id, closes_at, clock_timestamp() >= closes_at as past from odyssey.ballots "
                 "where campaign_id = :c order by version desc limit 1 for update"),
            {"c": campaign_id},
        )
    ).first()
    if campaign.state != "shortlist_locked" or ballot is None:
        raise ProblemError(409, "precondition-failed", "A ballot with two locked finalists is required",
                           missing=["ballot with two locked finalists"])
    if ballot.past:
        raise ProblemError(409, "precondition-failed", "The ballot's close time has passed",
                           missing=["closes_at in the future"])
    await conn.execute(
        text("update odyssey.ballots set opens_at = least(opens_at, clock_timestamp()) where id = :id"),
        {"id": ballot.id},
    )
    await conn.execute(text("update odyssey.campaigns set state = 'voting' where id = :id"), {"id": campaign_id})
    await outbox.emit(conn, "campaign.transitioned", campaign_id=campaign_id,
                      props={"from": "shortlist_locked", "to": "voting", "actor": actor})
    return {"campaign_id": str(campaign_id), "state": "voting", "ballot_id": str(ballot.id)}


async def pause_voting(conn: AsyncConnection, campaign_id: uuid.UUID, actor: str) -> dict[str, Any]:
    campaign = await _campaign_for_update(conn, campaign_id)
    if campaign.state == "voting":
        await conn.execute(
            text("update odyssey.ballots set state = 'paused' where campaign_id = :c and state = 'open'"),
            {"c": campaign_id},
        )
    await conn.execute(text("update odyssey.campaigns set state = 'paused' where id = :id"), {"id": campaign_id})
    await outbox.emit(conn, "campaign.transitioned", campaign_id=campaign_id,
                      props={"from": campaign.state, "to": "paused", "actor": actor})
    return {"campaign_id": str(campaign_id), "state": "paused", "paused_from": campaign.state}


async def resume_campaign(conn: AsyncConnection, campaign_id: uuid.UUID, actor: str) -> dict[str, Any]:
    campaign = await _campaign_for_update(conn, campaign_id)
    if campaign.state != "paused" or campaign.paused_from is None:
        raise ProblemError(409, "illegal-transition", "That state change is not allowed",
                           f"campaign is {campaign.state}, not paused")
    target = campaign.paused_from
    if target == "voting":
        await conn.execute(
            text("update odyssey.ballots set state = 'open' where campaign_id = :c and state = 'paused'"),
            {"c": campaign_id},
        )
    await conn.execute(text("update odyssey.campaigns set state = :s where id = :id"),
                       {"s": target, "id": campaign_id})
    await outbox.emit(conn, "campaign.transitioned", campaign_id=campaign_id,
                      props={"from": "paused", "to": target, "actor": actor})
    return {"campaign_id": str(campaign_id), "state": target}


async def close_ballot(conn: AsyncConnection, ballot_id: uuid.UUID, actor: str) -> dict[str, Any]:
    """Close atomically and freeze the tally (FR-4.3). Waits for in-flight votes, then blocks later ones."""
    ballot = (
        await conn.execute(
            text("select id, campaign_id, state, tally, closed_at from odyssey.ballots where id = :id for update"),
            {"id": ballot_id},
        )
    ).first()
    if ballot is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    if ballot.state == "closed":
        return {"ballot_id": str(ballot_id), "state": "closed", "tally": ballot.tally,
                "closed_at": ballot.closed_at.isoformat(), "already_closed": True}

    closed = (
        await conn.execute(
            text(
                "update odyssey.ballots set state = 'closed', closed_at = clock_timestamp(), "
                "  tally = (select coalesce(jsonb_object_agg(entry_id::text, n), '{}'::jsonb) from "
                "           (select entry_id, count(*) as n from odyssey.votes where ballot_id = :id "
                "            group by entry_id) t) "
                "where id = :id returning tally, closed_at"
            ),
            {"id": ballot_id},
        )
    ).one()
    await conn.execute(
        text("update odyssey.campaigns set state = 'closed' where id = :c"), {"c": ballot.campaign_id}
    )
    await outbox.emit(conn, "ballot.closed", campaign_id=ballot.campaign_id,
                      props={"ballot_id": str(ballot_id), "tally": closed.tally, "actor": actor})
    return {"ballot_id": str(ballot_id), "state": "closed", "tally": closed.tally,
            "closed_at": closed.closed_at.isoformat(), "already_closed": False}


def pick_winner(finalists: list[Any], tally: dict[str, int]) -> tuple[Any, bool, bool]:
    """Winner, tie flag, no-votes flag. Ties go to the earlier entry, then the lower ID (A-10)."""
    counted = [(int(tally.get(str(f.entry_id), 0)), f) for f in finalists]
    top = max(count for count, _ in counted)
    leaders = [f for count, f in counted if count == top]
    leaders.sort(key=lambda f: (f.created_at, str(f.entry_id)))
    return leaders[0], len(leaders) > 1, top == 0


async def publish_ballot(conn: AsyncConnection, ballot_id: uuid.UUID, actor: str, reveal: Any = None) -> dict[str, Any]:
    """One episode per ballot. A repeat or a lost race returns the existing episode (FR-7.2)."""
    ballot = (
        await conn.execute(
            text("select b.id, b.state, b.campaign_id, b.tally, c.slug, c.title, c.intro_asset_id, "
                 "       c.end_card_asset_id, c.reporting_window_end "
                 "from odyssey.ballots b join odyssey.campaigns c on c.id = b.campaign_id "
                 "where b.id = :id for update of b"),
            {"id": ballot_id},
        )
    ).first()
    if ballot is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    existing = await episode_for_ballot(conn, ballot_id)
    if existing is not None:
        return {**existing, "created": False}
    if ballot.state != "closed":
        raise ProblemError(409, "illegal-transition", "That state change is not allowed",
                           "publish requires a closed ballot")

    finalists = (
        await conn.execute(
            text("select f.entry_id, f.label, f.locked_asset_id, f.marker_ms, e.handle, e.channel_url, "
                 "       e.permissions, e.created_at "
                 "from odyssey.ballot_finalists f join odyssey.entries e on e.id = f.entry_id "
                 "where f.ballot_id = :b order by f.label"),
            {"b": ballot_id},
        )
    ).all()
    tally = ballot.tally or {}
    winner, tie, no_votes = pick_winner(list(finalists), tally)
    other = next(f for f in finalists if f.entry_id != winner.entry_id)

    prediction = (
        await conn.execute(
            text("select commitment, scrim_run_id, registered_at from odyssey.sim_predictions where ballot_id = :b"), {"b": ballot_id}
        )
    ).first()
    sim_vs_fans = None
    if prediction is not None:
        if reveal is None:
            raise ProblemError(422, "validation-error", "Publish needs the prediction and nonce",
                               errors=[{"field": "predicted", "message": "a commitment exists; reveal it"}])
        if prediction_commitment(str(ballot_id), reveal.predicted, reveal.nonce) != prediction.commitment:
            raise ProblemError(422, "prediction-mismatch", "The prediction does not match its commitment")
        if {str(f.entry_id) for f in finalists} != set(reveal.predicted) or abs(sum(reveal.predicted.values()) - 1.0) > 1e-6:
            raise ProblemError(422, "validation-error", "The prediction must split 1.0 across the two finalists")
        sim_vs_fans = {
            "predicted": reveal.predicted,
            "commitment": prediction.commitment,
            "real": {str(f.entry_id): int(tally.get(str(f.entry_id), 0)) for f in finalists},
            "labels": {str(f.entry_id): f.label for f in finalists},
            "simulated": True,
            "calibrated": False,
            "scrim_run_id": str(prediction.scrim_run_id) if prediction.scrim_run_id else None,
        }
    sequence = [
        {"kind": "intro", "asset_id": ballot.intro_asset_id},
        {"kind": "winner", "asset_id": winner.locked_asset_id, "entry_id": str(winner.entry_id)},
        {"kind": "credits", "asset_id": None},
        {"kind": "end_card", "asset_id": ballot.end_card_asset_id},
    ]
    slug = f"{ballot.slug}-final-cut"
    episode = (
        await conn.execute(
            text("insert into odyssey.episodes (ballot_id, slug, winner_entry_id, tally, tie, no_votes, "
                 "  sequence, sim_vs_fans) "
                 "values (:b, :s, :w, cast(:t as jsonb), :tie, :nv, cast(:seq as jsonb), cast(:sim as jsonb)) "
                 "on conflict (ballot_id) do nothing returning id, published_at"),
            {"b": ballot_id, "s": slug, "w": winner.entry_id, "t": json.dumps(tally), "tie": tie, "nv": no_votes,
             "seq": json.dumps(sequence), "sim": json.dumps(sim_vs_fans) if sim_vs_fans else None},
        )
    ).first()
    if episode is None:  # lost a race on the unique constraint: return the winner's episode
        existing = await episode_for_ballot(conn, ballot_id)
        assert existing is not None
        return {**existing, "created": False}

    for position, (finalist, role) in enumerate(((winner, "winner"), (other, "finalist")), start=1):
        link_ok = bool((finalist.permissions or {}).get("channel_link"))
        await conn.execute(
            text("insert into odyssey.credits (episode_id, entry_id, handle, channel_url, role, position) "
                 "values (:ep, :en, :h, :u, :r, :p)"),
            {"ep": episode.id, "en": finalist.entry_id, "h": finalist.handle,
             "u": finalist.channel_url if link_ok else None, "r": role, "p": position},
        )
        await conn.execute(text("update odyssey.entries set state = 'published' where id = :id"),
                           {"id": finalist.entry_id})
    await conn.execute(
        text("insert into odyssey.vault_chapters (episode_id, slug, era, title) values (:e, :s, 'homecoming', :t)"),
        {"e": episode.id, "s": slug, "t": f"{ballot.title}: the Final Cut"},
    )
    await conn.execute(text("update odyssey.campaigns set state = 'published' where id = :id"),
                       {"id": ballot.campaign_id})
    await outbox.emit(conn, "episode.published", campaign_id=ballot.campaign_id,
                      props={"episode_id": str(episode.id), "ballot_id": str(ballot_id), "actor": actor,
                             "tie": tie})
    result = await episode_for_ballot(conn, ballot_id)
    assert result is not None
    return {**result, "created": True}


async def episode_for_ballot(conn: AsyncConnection, ballot_id: uuid.UUID) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            text("select id, slug, winner_entry_id, tally, tie, no_votes, sequence, sim_vs_fans, published_at "
                 "from odyssey.episodes where ballot_id = :b"),
            {"b": ballot_id},
        )
    ).first()
    if row is None:
        return None
    return {"episode_id": str(row.id), "slug": row.slug, "winner_entry_id": str(row.winner_entry_id),
            "tally": row.tally, "tie": row.tie, "no_votes": row.no_votes, "sequence": row.sequence,
            "sim_vs_fans": row.sim_vs_fans, "published_at": row.published_at.isoformat()}
