"""Public listener: fan-facing routes (FR-5, FR-6, FR-8). Port 8001."""

from __future__ import annotations

import re
import uuid
from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import text

from faze_common.auth import Principal, current_principal
from faze_common.errors import ProblemError
from faze_common.ratelimit import RateLimitUnavailable, client_ip, hash_ip

from . import sse
from .app_factory import build_app
from .db import run_with_retry, transaction
from .domain import council, outbox, votes
from .domain.idempotency import run_idempotent, validate_key

app = build_app("public")
fan = current_principal("fan")
_REFERRAL = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")


class VoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entry_id: uuid.UUID


class EnrolIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    birth_year: int = Field(ge=1900, le=2100)
    consent_version: str = Field(min_length=1, max_length=32)
    guardian_email: EmailStr | None = Field(default=None, max_length=254)
    cohort: str = Field(default="newcomer", pattern="^(returning|newcomer|creator)$")


class AnswerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: uuid.UUID
    answer: str = Field(min_length=1, max_length=500)


class GuardianIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=2000)


class ClickIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credit_id: uuid.UUID


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "odyssey-api", "listener": "public"}


# ---------------------------------------------------------------- read routes

def _finalist_view(media: Any, rows: list[Any]) -> list[dict[str, Any]]:
    return [{"label": f.label, "entry_id": str(f.entry_id), "handle": f.handle,
             "playback_url": media.playback_url(f.locked_asset_id), "marker_ms": f.marker_ms} for f in rows]


@app.get("/v1/campaigns/{slug}")
async def get_campaign(slug: str, request: Request) -> dict[str, Any]:
    media = request.app.state.media
    async with transaction() as conn:
        c = (await conn.execute(text(
            "select c.id, c.slug, c.title, c.format, c.state, c.opens_at, c.voting_opens_at, c.closes_at, "
            "c.reveal_at, c.reference_asset_id, c.reference_marker_ms, b.body_md, b.rules "
            "from odyssey.campaigns c left join odyssey.brief_versions b on b.id = c.live_brief_id "
            "where c.slug = :s and c.state <> 'draft'"), {"s": slug})).first()
        if c is None:
            raise ProblemError(404, "not-found", "Drop not found")
        ballot = (await conn.execute(text(
            "select id, state, closes_at from odyssey.ballots where campaign_id = :c order by version desc limit 1"),
            {"c": c.id})).first()
        finalists: list[Any] = []
        if ballot is not None and c.state in ("voting", "paused", "closed", "published"):
            finalists = (await conn.execute(text(
                "select f.label, f.entry_id, f.locked_asset_id, f.marker_ms, e.handle "
                "from odyssey.ballot_finalists f join odyssey.entries e on e.id = f.entry_id "
                "where f.ballot_id = :b order by f.label"), {"b": ballot.id})).all()
        episode = (await conn.execute(text(
            "select e.slug from odyssey.episodes e join odyssey.ballots b on b.id = e.ballot_id "
            "where b.campaign_id = :c"), {"c": c.id})).first()
    return {
        "slug": c.slug, "title": c.title, "format": c.format, "state": c.state,
        "opens_at": c.opens_at, "voting_opens_at": c.voting_opens_at, "closes_at": c.closes_at,
        "reveal_at": c.reveal_at,
        "brief": {"body_md": c.body_md, "rules": c.rules} if c.body_md else None,
        "reference": {"playback_url": media.playback_url(c.reference_asset_id),
                      "marker_ms": c.reference_marker_ms},
        "ballot": {"id": str(ballot.id), "state": ballot.state, "closes_at": ballot.closes_at} if ballot else None,
        "finalists": _finalist_view(media, finalists),
        "episode_slug": episode.slug if episode else None,
    }


@app.get("/v1/lobby")
async def lobby(request: Request) -> dict[str, Any]:
    live = "('accepting_entries','shortlist_locked','voting','paused','closed','published')"
    async with transaction() as conn:
        current = (await conn.execute(text(
            f"select slug, title, state, closes_at, reveal_at from odyssey.campaigns where state in {live} "
            "order by updated_at desc limit 1"))).first()
        if current is None:
            current = (await conn.execute(text(
                "select slug, title, state, closes_at, reveal_at from odyssey.campaigns "
                "where state = 'scheduled' order by opens_at asc nulls last limit 1"))).first()
        nxt = (await conn.execute(text(
            "select slug, title, state, opens_at from odyssey.campaigns where state = 'scheduled' "
            "and slug is distinct from :cur order by opens_at desc nulls last limit 1"),
            {"cur": current.slug if current else None})).first()
        last = (await conn.execute(text(
            "select e.slug, e.published_at, c.title from odyssey.episodes e join odyssey.ballots b on b.id = e.ballot_id "
            "join odyssey.campaigns c on c.id = b.campaign_id order by e.published_at desc limit 1"))).first()
    return {
        "this_week": dict(current._mapping) if current else None,
        "last_final_cut": {"slug": last.slug, "title": last.title, "published_at": last.published_at} if last else None,
        "next_drop": dict(nxt._mapping) if nxt else None,
    }


@app.get("/v1/episodes/{slug}")
async def get_episode(slug: str, request: Request) -> dict[str, Any]:
    media = request.app.state.media
    async with transaction() as conn:
        ep = (await conn.execute(text(
            "select e.id, e.slug, e.tally, e.tie, e.no_votes, e.sequence, e.sim_vs_fans, e.published_at, "
            "c.title, c.slug as campaign_slug, e.ballot_id "
            "from odyssey.episodes e join odyssey.ballots b on b.id = e.ballot_id "
            "join odyssey.campaigns c on c.id = b.campaign_id where e.slug = :s"), {"s": slug})).first()
        if ep is None:
            raise ProblemError(404, "not-found", "Final Cut not found")
        credits = (await conn.execute(text(
            "select id, handle, channel_url, role, position, entry_id from odyssey.credits "
            "where episode_id = :e order by position"), {"e": ep.id})).all()
        finalists = (await conn.execute(text(
            "select entry_id, label from odyssey.ballot_finalists where ballot_id = :b"), {"b": ep.ballot_id})).all()
    labels = {str(f.entry_id): f.label for f in finalists}
    sequence = [{**part, "playback_url": media.playback_url(part.get("asset_id"))} for part in ep.sequence]
    return {
        "slug": ep.slug, "title": ep.title, "campaign_slug": ep.campaign_slug, "published_at": ep.published_at,
        "sequence": sequence,
        "credits": [{"id": str(c.id), "handle": c.handle, "channel_url": c.channel_url, "role": c.role,
                     "position": c.position} for c in credits],
        "real": {"tally": ep.tally, "labels": labels, "tie": ep.tie, "no_votes": ep.no_votes},
        "sim_vs_fans": ep.sim_vs_fans,
    }


# ---------------------------------------------------------------- voting

@app.get("/v1/ballots/{ballot_id}/me")
async def my_vote(ballot_id: uuid.UUID, principal: Annotated[Principal, Depends(fan)]) -> dict[str, Any]:
    async with transaction() as conn:
        return await votes.my_vote(conn, ballot_id, principal.sub)


@app.post("/v1/ballots/{ballot_id}/votes")
async def cast_vote(
    ballot_id: uuid.UUID,
    body: VoteIn,
    request: Request,
    principal: Annotated[Principal, Depends(fan)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    x_referral: Annotated[str | None, Header(alias="X-Referral")] = None,
) -> JSONResponse:
    key = validate_key(idempotency_key)
    assert key is not None
    settings = request.app.state.settings
    ip_hash = hash_ip(client_ip(request, settings.trusted_proxy_list), settings.IP_HASH_SECRET)
    referral = x_referral if x_referral and _REFERRAL.match(x_referral) else None

    limiter = request.app.state.limiter
    try:
        ok_account, retry_a = await limiter.take(
            f"rl:vote:acct:{principal.sub}", settings.VOTE_ACCOUNT_CAPACITY, settings.VOTE_ACCOUNT_REFILL_PER_SEC)
        ok_ip, retry_i = await limiter.take(
            f"rl:vote:ip:{ip_hash}", settings.VOTE_IP_CAPACITY, settings.VOTE_IP_REFILL_PER_SEC)
    except RateLimitUnavailable as exc:
        raise ProblemError(503, "rate-limit-unavailable", "Voting is temporarily unavailable",
                           "the rate limiter cannot be reached") from exc
    if not (ok_account and ok_ip):
        retry = max(retry_a if not ok_account else 0, retry_i if not ok_ip else 0, 1)
        raise ProblemError(429, "rate-limited", "Too many votes", "slow down and try again",
                           headers={"Retry-After": str(retry)})

    scope = f"{principal.sub}:POST:/v1/ballots/{{id}}/votes"
    payload = {"ballot_id": str(ballot_id), "entry_id": str(body.entry_id)}

    async def work(conn: Any) -> tuple[int, dict[str, Any], bool]:
        async def handler() -> tuple[int, dict[str, Any]]:
            result = await votes.cast_vote(conn, ballot_id=ballot_id, principal=principal,
                                           entry_id=body.entry_id, referral=referral, ip_hash=ip_hash)
            return (201 if result["changed"] and result["revision"] == 1 else 200), result

        return await run_idempotent(conn, scope=scope, key=key, payload=payload, handler=handler)

    status, result, replayed = await run_with_retry(work)
    headers = {"Idempotent-Replay": "true"} if replayed else {}
    return JSONResponse(result, status_code=status, headers=headers)


# ---------------------------------------------------------------- live state

@app.get("/v1/stream/campaigns/{slug}")
async def stream_campaign(slug: str, request: Request) -> StreamingResponse:
    async def snapshot() -> dict[str, Any]:
        async with transaction() as conn:
            row = (await conn.execute(text(
                "select slug, state, closes_at, reveal_at from odyssey.campaigns where slug = :s"),
                {"s": slug})).first()
        if row is None:
            raise ProblemError(404, "not-found", "Drop not found")
        return {"slug": row.slug, "state": row.state, "closes_at": row.closes_at, "reveal_at": row.reveal_at}

    await snapshot()  # 404 before the stream starts
    generator = sse.stream(request, request.app.state.redis, slug, snapshot,
                           request.app.state.settings.SSE_COUNTDOWN_SECONDS)
    return StreamingResponse(generator, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- reveal analytics

@app.post("/v1/episodes/{slug}/views", status_code=202)
async def episode_viewed(slug: str, request: Request,
                         principal: Annotated[Principal | None, Depends(current_principal(optional=True))] = None
                         ) -> dict[str, str]:
    async with transaction() as conn:
        ep = (await conn.execute(text(
            "select b.campaign_id from odyssey.episodes e join odyssey.ballots b on b.id = e.ballot_id "
            "where e.slug = :s"), {"s": slug})).first()
        if ep is None:
            raise ProblemError(404, "not-found", "Final Cut not found")
        if principal is not None:
            await conn.execute(text(
                "insert into odyssey.accounts (user_id, handle, role, analytics_consent) values (:u, :h, :r, :c) "
                "on conflict (user_id) do update set analytics_consent = excluded.analytics_consent"),
                {"u": principal.sub, "h": principal.handle or "fan", "r": principal.role,
                 "c": principal.analytics_consent})
        await outbox.emit(conn, "episode.viewed", campaign_id=ep.campaign_id,
                          account_user_id=principal.sub if principal else None, props={"slug": slug})
    return {"status": "accepted"}


@app.post("/v1/credits/click", status_code=202)
async def credit_clicked(body: ClickIn, request: Request) -> dict[str, str]:
    """Takes a credit ID, never a URL, so it cannot be used as an open redirect (FR-5.5)."""
    async with transaction() as conn:
        credit = (await conn.execute(text(
            "select b.campaign_id from odyssey.credits cr join odyssey.episodes e on e.id = cr.episode_id "
            "join odyssey.ballots b on b.id = e.ballot_id where cr.id = :c"), {"c": body.credit_id})).first()
        if credit is None:
            raise ProblemError(404, "not-found", "Credit not found")
        await outbox.emit(conn, "channel.clicked", campaign_id=credit.campaign_id,
                          props={"credit_id": str(body.credit_id)})
    return {"status": "accepted"}


# ---------------------------------------------------------------- Fan Council

@app.get("/v1/council/questions")
async def council_questions(_: Annotated[Principal, Depends(fan)]) -> list[dict[str, Any]]:
    async with transaction() as conn:
        return await council.questions(conn)


@app.post("/v1/council/enrol")
async def council_enrol(body: EnrolIn, request: Request,
                        principal: Annotated[Principal, Depends(fan)]) -> dict[str, Any]:
    settings = request.app.state.settings
    async with transaction() as conn:
        result = await council.enrol(
            conn, principal, birth_year=body.birth_year, consent_version=body.consent_version,
            guardian_email=body.guardian_email, cohort=body.cohort, secret=settings.COUNCIL_LINK_SECRET)
    if result["status"] == "pending_guardian":
        # The link opens a page with a Confirm button, so an email scanner's prefetch cannot confirm by itself.
        link = f"{settings.ODYSSEY_WEB_URL}/council/guardian?token={result['guardian_token']}"
        request.app.state.mailbox.send(
            result["guardian_email"], "Confirm your young fan's Fan Council enrolment",
            f"A fan aged 14 or 15 asked to join the FaZe Fan Council. Confirm here: {link}")
        return {"status": "pending_guardian"}  # the token itself never goes back to the browser
    return result


@app.post("/v1/council/guardian/confirm")
async def council_confirm(body: GuardianIn, request: Request) -> dict[str, Any]:
    async with transaction() as conn:
        return await council.confirm_guardian(conn, body.token, request.app.state.settings.COUNCIL_LINK_SECRET)


@app.post("/v1/council/answers")
async def council_answers(body: AnswerIn, principal: Annotated[Principal, Depends(fan)]) -> dict[str, Any]:
    async with transaction() as conn:
        return await council.answer(conn, principal, str(body.question_id), body.answer)


# ---------------------------------------------------------------- demo helpers (DEMO_MODE only)

@app.get("/v1/dev/mailbox")
async def dev_mailbox(request: Request) -> list[dict]:
    if not request.app.state.settings.DEMO_MODE:
        raise ProblemError(404, "not-found", "Not found")
    return request.app.state.mailbox.list()
