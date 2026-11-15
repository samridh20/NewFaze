"""Internal listener: FaZe Studio only (FR-2.5, FR-2.6, FR-4). Port 8011, loopback or the private network.

Every route needs a service token (audience odyssey-internal). A user JWT, admin included, gets 403.
Every write needs an Idempotency-Key.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from faze_common.auth import service_actor
from faze_common.errors import ProblemError

from . import sse
from .app_factory import build_app
from .db import run_with_retry, transaction
from .domain import ballots, campaigns, council, reports
from .domain.idempotency import run_idempotent, validate_key

app = build_app("internal")
Actor = Annotated[str, Depends(service_actor)]
IdemKey = Annotated[str | None, Header(alias="Idempotency-Key")]


class TransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to: str = Field(pattern="^(draft|scheduled|accepting_entries|shortlist_locked|voting|closed|published|archived|paused)$")


class FinalistIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entry_id: uuid.UUID
    marker_ms: int = Field(ge=0)


class BallotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaign_id: uuid.UUID
    finalists: list[FinalistIn] = Field(min_length=2, max_length=2)
    opens_at: datetime
    closes_at: datetime


class PredictionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    commitment: str = Field(pattern="^[0-9a-f]{64}$")
    scrim_run_id: uuid.UUID | None = None


class PublishIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    predicted: dict[str, float]
    nonce: str = Field(min_length=8, max_length=128)


async def idempotent(request: Request, actor: str, key: str | None, payload: Any, operation: Any,
                     *, after: Any = None) -> JSONResponse:
    """Run ``operation(conn)`` once per (actor, route, key). ``after`` runs after commit (SSE fan-out)."""
    checked = validate_key(key)
    assert checked is not None
    scope = f"{actor}:{request.method}:{request.scope['route'].path}"

    async def work(conn: Any) -> tuple[int, dict[str, Any], bool]:
        async def handler() -> tuple[int, dict[str, Any]]:
            body = await operation(conn)
            return (200, body)

        return await run_idempotent(conn, scope=scope, key=checked, payload=payload, handler=handler)

    status, body, replayed = await run_with_retry(work)
    if after is not None and not replayed:
        await after(body)
    return JSONResponse(body, status_code=status, headers={"Idempotent-Replay": "true"} if replayed else {})


async def notify_campaign(request: Request, campaign_id: uuid.UUID | str) -> None:
    async with transaction() as conn:
        row = (await conn.execute(text("select slug, state from odyssey.campaigns where id = :id"),
                                  {"id": campaign_id})).first()
    if row is not None:
        await sse.publish_state(request.app.state.redis, row.slug, row.state)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "odyssey-api", "listener": "internal"}


@app.put("/internal/v1/campaigns/{campaign_id}")
async def put_campaign(campaign_id: uuid.UUID, body: campaigns.CampaignUpsert, request: Request,
                       actor: Actor, idempotency_key: IdemKey = None) -> JSONResponse:
    return await idempotent(
        request, actor, idempotency_key, {"id": str(campaign_id), **body.model_dump(mode="json")},
        lambda conn: campaigns.upsert_campaign(conn, campaign_id, body, actor),
    )


@app.get("/internal/v1/campaigns/{campaign_id}")
async def get_campaign(campaign_id: uuid.UUID, _: Actor) -> dict[str, Any]:
    async with transaction() as conn:
        return await reports.campaign_status(conn, campaign_id)


@app.get("/internal/v1/campaigns/{campaign_id}/entries")
async def list_entries(campaign_id: uuid.UUID, _: Actor) -> list[dict[str, Any]]:
    async with transaction() as conn:
        return await reports.campaign_entries(conn, campaign_id)


@app.post("/internal/v1/campaigns/{campaign_id}/transition")
async def post_transition(campaign_id: uuid.UUID, body: TransitionIn, request: Request, actor: Actor,
                          idempotency_key: IdemKey = None) -> JSONResponse:
    return await idempotent(
        request, actor, idempotency_key, {"id": str(campaign_id), "to": body.to},
        lambda conn: campaigns.transition(conn, campaign_id, body.to, actor),
        after=lambda _body: notify_campaign(request, campaign_id),
    )


@app.post("/internal/v1/campaigns/{campaign_id}/advance")
async def post_advance(campaign_id: uuid.UUID, request: Request, actor: Actor,
                       idempotency_key: IdemKey = None) -> JSONResponse:
    if not request.app.state.settings.DEMO_MODE:  # the demo clock does not exist outside DEMO_MODE (FR-4.5)
        raise ProblemError(404, "not-found", "Not found")
    return await idempotent(
        request, actor, idempotency_key, {"id": str(campaign_id)},
        lambda conn: campaigns.advance(conn, campaign_id, actor),
        after=lambda _body: notify_campaign(request, campaign_id),
    )


@app.post("/internal/v1/ballots")
async def post_ballot(body: BallotCreate, request: Request, actor: Actor,
                      idempotency_key: IdemKey = None) -> JSONResponse:
    return await idempotent(
        request, actor, idempotency_key, body.model_dump(mode="json"),
        lambda conn: ballots.lock_ballot(
            conn, campaign_id=body.campaign_id,
            finalists=[{"entry_id": f.entry_id, "marker_ms": f.marker_ms} for f in body.finalists],
            opens_at=body.opens_at, closes_at=body.closes_at, actor=actor),
        after=lambda _body: notify_campaign(request, body.campaign_id),
    )


@app.get("/internal/v1/ballots/{ballot_id}")
async def get_ballot(ballot_id: uuid.UUID, _: Actor) -> dict[str, Any]:
    async with transaction() as conn:
        return await reports.ballot_status(conn, ballot_id)


async def _campaign_of(ballot_id: uuid.UUID) -> uuid.UUID | None:
    async with transaction() as conn:
        return (await conn.execute(text("select campaign_id from odyssey.ballots where id = :id"),
                                   {"id": ballot_id})).scalar_one_or_none()


@app.post("/internal/v1/ballots/{ballot_id}/close")
async def post_close(ballot_id: uuid.UUID, request: Request, actor: Actor,
                     idempotency_key: IdemKey = None) -> JSONResponse:
    async def after(_body: Any) -> None:
        campaign_id = await _campaign_of(ballot_id)
        if campaign_id:
            await notify_campaign(request, campaign_id)

    return await idempotent(request, actor, idempotency_key, {"id": str(ballot_id)},
                            lambda conn: ballots.close_ballot(conn, ballot_id, actor), after=after)


@app.post("/internal/v1/ballots/{ballot_id}/publish")
async def post_publish(ballot_id: uuid.UUID, request: Request, actor: Actor,
                       body: PublishIn | None = None, idempotency_key: IdemKey = None) -> JSONResponse:
    async def after(_body: Any) -> None:
        campaign_id = await _campaign_of(ballot_id)
        if campaign_id:
            await notify_campaign(request, campaign_id)

    return await idempotent(request, actor, idempotency_key,
                            {"id": str(ballot_id), "body": body.model_dump(mode="json") if body else None},
                            lambda conn: ballots.publish_ballot(conn, ballot_id, actor, body), after=after)


@app.post("/internal/v1/ballots/{ballot_id}/prediction")
async def post_prediction(ballot_id: uuid.UUID, body: PredictionIn, request: Request, actor: Actor,
                          idempotency_key: IdemKey = None) -> JSONResponse:
    return await idempotent(
        request, actor, idempotency_key, {"id": str(ballot_id), **body.model_dump(mode="json")},
        lambda conn: campaigns.register_prediction(conn, ballot_id, body.commitment, body.scrim_run_id, actor),
    )


@app.get("/internal/v1/ballots/{ballot_id}/anomalies")
async def get_anomalies(ballot_id: uuid.UUID, _: Actor) -> dict[str, Any]:
    async with transaction() as conn:
        return await reports.anomaly_report(conn, ballot_id)


@app.get("/internal/v1/council/aggregates")
async def get_council_aggregates(_: Actor) -> dict[str, Any]:
    async with transaction() as conn:
        return await council.export_aggregates(conn)
