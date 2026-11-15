"""Campaign upsert, generic transitions, demo advance and the Sim vs Fans prediction (FR-3, FR-4)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.errors import ProblemError
from faze_common.states import CAMPAIGN_TRANSITIONS, HAPPY_PATH

from . import ballots, outbox


class BriefIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variant: Literal["A", "B"]
    body_md: str = Field(min_length=1, max_length=20000)
    rules: dict[str, Any] = Field(default_factory=dict)
    scrim_run_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _rules_size(self) -> BriefIn:
        if len(str(self.rules)) > 8192:
            raise ValueError("rules must be 8 KB or smaller")
        return self


class CampaignUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,63}$")
    format: Literal["recreate_the_shot", "call_the_play", "editor_relay"]
    title: str = Field(min_length=1, max_length=120)
    briefs: list[BriefIn] = Field(min_length=1, max_length=2)
    live_variant: Literal["A", "B"] | None = None
    reference_asset_id: str | None = Field(default=None, max_length=200)
    reference_marker_ms: int | None = Field(default=None, ge=0)
    intro_asset_id: str | None = Field(default=None, max_length=200)
    end_card_asset_id: str | None = Field(default=None, max_length=200)
    opens_at: datetime | None = None
    voting_opens_at: datetime | None = None
    closes_at: datetime | None = None
    reveal_at: datetime | None = None
    reporting_window_end: datetime | None = None
    sponsor_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _order(self) -> CampaignUpsert:
        times = [self.opens_at, self.voting_opens_at, self.closes_at, self.reveal_at]
        given = [t for t in times if t is not None]
        for earlier, later in zip(given, given[1:], strict=False):
            if earlier.tzinfo is None or later.tzinfo is None:
                raise ValueError("times must include a timezone")
            if earlier > later:
                raise ValueError("opens_at <= voting_opens_at <= closes_at <= reveal_at must hold")
        if self.live_variant and self.live_variant not in {b.variant for b in self.briefs}:
            raise ValueError("live_variant must be one of the supplied briefs")
        return self


async def upsert_campaign(conn: AsyncConnection, campaign_id: uuid.UUID, body: CampaignUpsert,
                          actor: str) -> dict[str, Any]:
    existing = (
        await conn.execute(text("select state from odyssey.campaigns where id = :id for update"), {"id": campaign_id})
    ).first()
    if existing is not None and existing.state not in ("draft", "scheduled"):
        raise ProblemError(409, "brief-locked", "The live brief is locked",
                           f"campaign is {existing.state}; briefs are fixed once entries open")
    values = {
        "id": campaign_id, "slug": body.slug, "format": body.format, "title": body.title,
        "ra": body.reference_asset_id, "rm": body.reference_marker_ms, "ia": body.intro_asset_id,
        "ea": body.end_card_asset_id, "o": body.opens_at, "vo": body.voting_opens_at, "c": body.closes_at,
        "r": body.reveal_at, "rw": body.reporting_window_end, "sp": body.sponsor_id,
    }
    await conn.execute(
        text(
            "insert into odyssey.campaigns (id, slug, format, title, reference_asset_id, reference_marker_ms, "
            "  intro_asset_id, end_card_asset_id, opens_at, voting_opens_at, closes_at, reveal_at, "
            "  reporting_window_end, sponsor_id) "
            "values (:id, :slug, :format, :title, :ra, :rm, :ia, :ea, :o, :vo, :c, :r, :rw, :sp) "
            "on conflict (id) do update set slug = excluded.slug, format = excluded.format, "
            "  title = excluded.title, reference_asset_id = excluded.reference_asset_id, "
            "  reference_marker_ms = excluded.reference_marker_ms, intro_asset_id = excluded.intro_asset_id, "
            "  end_card_asset_id = excluded.end_card_asset_id, opens_at = excluded.opens_at, "
            "  voting_opens_at = excluded.voting_opens_at, closes_at = excluded.closes_at, "
            "  reveal_at = excluded.reveal_at, reporting_window_end = excluded.reporting_window_end, "
            "  sponsor_id = excluded.sponsor_id, updated_at = now()"
        ),
        values,
    )
    live_id = None
    for brief in body.briefs:
        brief_id = (
            await conn.execute(
                text("insert into odyssey.brief_versions (campaign_id, variant, body_md, rules, scrim_run_id) "
                     "values (:c, :v, :b, cast(:r as jsonb), :s) "
                     "on conflict (campaign_id, variant) do update set body_md = excluded.body_md, "
                     "  rules = excluded.rules, scrim_run_id = excluded.scrim_run_id returning id"),
                {"c": campaign_id, "v": brief.variant, "b": brief.body_md,
                 "r": outbox.jsonb(brief.rules), "s": brief.scrim_run_id},
            )
        ).scalar_one()
        if brief.variant == body.live_variant:
            live_id = brief_id
    if live_id is not None:
        await conn.execute(text("update odyssey.campaigns set live_brief_id = :b where id = :id"),
                           {"b": live_id, "id": campaign_id})
    state = (await conn.execute(text("select state from odyssey.campaigns where id = :id"),
                                {"id": campaign_id})).scalar_one()
    return {"campaign_id": str(campaign_id), "slug": body.slug, "state": state,
            "live_variant": body.live_variant, "created": existing is None}


async def transition(conn: AsyncConnection, campaign_id: uuid.UUID, to_state: str, actor: str) -> dict[str, Any]:
    campaign = (
        await conn.execute(text("select * from odyssey.campaigns where id = :id for update"), {"id": campaign_id})
    ).first()
    if campaign is None:
        raise ProblemError(404, "not-found", "Campaign not found")
    source = campaign.state

    if to_state == "shortlist_locked":
        raise ProblemError(409, "precondition-failed", "Lock finalists with the ballot operation",
                           missing=["POST /internal/v1/ballots"])
    if to_state in ("closed", "published"):
        raise ProblemError(409, "precondition-failed", f"Use the {'close' if to_state == 'closed' else 'publish'} operation",
                           missing=[f"ballot {'close' if to_state == 'closed' else 'publish'}"])
    if to_state == "voting" and source == "shortlist_locked":
        return await ballots.open_voting(conn, campaign_id, actor)
    if to_state == "paused":
        if source == "paused" or (source, "paused") not in CAMPAIGN_TRANSITIONS:
            raise ProblemError(409, "illegal-transition", "That state change is not allowed",
                               f"campaign {source} -> paused")
        return await ballots.pause_voting(conn, campaign_id, actor)
    if source == "paused":
        if to_state != campaign.paused_from:
            raise ProblemError(409, "illegal-transition", "That state change is not allowed",
                               f"campaign paused from {campaign.paused_from} cannot resume into {to_state}")
        return await ballots.resume_campaign(conn, campaign_id, actor)
    if (source, to_state) not in CAMPAIGN_TRANSITIONS:
        raise ProblemError(409, "illegal-transition", "That state change is not allowed",
                           f"campaign {source} -> {to_state}", **{"from": source, "to": to_state})
    if source == "draft" and to_state == "scheduled" and campaign.live_brief_id is None:
        raise ProblemError(409, "precondition-failed", "A live brief is required", missing=["live brief version"])

    await conn.execute(text("update odyssey.campaigns set state = :s where id = :id"),
                       {"s": to_state, "id": campaign_id})
    await outbox.emit(conn, "campaign.transitioned", campaign_id=campaign_id,
                      props={"from": source, "to": to_state, "actor": actor})
    return {"campaign_id": str(campaign_id), "state": to_state}


async def advance(conn: AsyncConnection, campaign_id: uuid.UUID, actor: str) -> dict[str, Any]:
    """Demo clock: the next happy-path state through the same operations and checks as the real routes."""
    campaign = (
        await conn.execute(text("select state from odyssey.campaigns where id = :id for update"), {"id": campaign_id})
    ).first()
    if campaign is None:
        raise ProblemError(404, "not-found", "Campaign not found")
    state = campaign.state
    target = HAPPY_PATH.get(state)
    if target is None:
        raise ProblemError(409, "no-next-state", "There is no next state", f"campaign is {state}")
    if state == "accepting_entries":
        raise ProblemError(409, "precondition-failed", "Lock two finalists first",
                           missing=["ballot with two locked finalists"])
    if state in ("voting", "closed"):
        ballot_id = (
            await conn.execute(
                text("select id from odyssey.ballots where campaign_id = :c order by version desc limit 1"),
                {"c": campaign_id},
            )
        ).scalar_one_or_none()
        if ballot_id is None:
            raise ProblemError(409, "precondition-failed", "No ballot exists", missing=["ballot"])
        if state == "voting":
            result = await ballots.close_ballot(conn, ballot_id, actor)
        else:
            result = await ballots.publish_ballot(conn, ballot_id, actor)
        return {"campaign_id": str(campaign_id), "from": state, "to": target, "result": result}
    result = await transition(conn, campaign_id, target, actor)
    return {"campaign_id": str(campaign_id), "from": state, "to": target, "result": result}


async def register_prediction(conn: AsyncConnection, ballot_id: uuid.UUID, commitment: str,
                              scrim_run_id: uuid.UUID | None, actor: str) -> dict[str, Any]:
    """Stores only the SHA-256 commitment. The prediction itself arrives at publish (CC-1, AC-55)."""
    exists = (await conn.execute(text("select state from odyssey.ballots where id = :id for share"),
                                 {"id": ballot_id})).first()
    if exists is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    await conn.execute(
        text("insert into odyssey.sim_predictions (ballot_id, commitment, scrim_run_id, registered_by) "
             "values (:b, :c, :s, :a) "
             "on conflict (ballot_id) do update set commitment = excluded.commitment, "
             "  scrim_run_id = excluded.scrim_run_id, registered_by = excluded.registered_by, registered_at = now()"),
        {"b": ballot_id, "c": commitment, "s": scrim_run_id, "a": actor},
    )
    return {"ballot_id": str(ballot_id), "registered": True}
