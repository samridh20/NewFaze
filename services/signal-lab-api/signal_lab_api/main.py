"""Signal Lab API (P7, minimum slice): scrims, Sim vs Fans prediction, VOD review, partner report, MiroFish proxy.
Runs as database role lab_app. It reaches Odyssey only through Odyssey's own HTTP APIs (service token for writes)."""
from __future__ import annotations
import json
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from scrim.runner import run_scrim
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from faze_common.auth import JwtVerifier, Principal, current_principal, mint_service_token
from faze_common.commitment import prediction_commitment
from faze_common.errors import ProblemError, install_error_handling
from faze_common.settings import get_settings

GATEWAY_TRANSPORT: Any = None  # tests inject an ASGI transport for the fixture gateway
STAFF = ("producer", "analyst", "admin")
Staff = Annotated[Principal, Depends(current_principal(*STAFF))]
AnyUser = Annotated[Principal, Depends(current_principal())]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    app.state.engine = create_async_engine(s.database_url("lab_app"), pool_size=10)
    app.state.verifier = JwtVerifier(s.SUPABASE_JWKS_URL, s.JWT_ISSUER, s.JWT_AUDIENCE)
    yield
    await app.state.engine.dispose()


app = FastAPI(title="Signal Lab API", version="0.1.0", lifespan=lifespan)
install_error_handling(app)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3002", "http://127.0.0.1:3002"],
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])


def engine(request: Request) -> AsyncEngine:
    return request.app.state.engine


async def odyssey(method: str, path: str, actor: str, *, json_body: Any = None, public: bool = False) -> httpx.Response:
    s = get_settings()
    base = s.ODYSSEY_PUBLIC_URL if public else s.ODYSSEY_INTERNAL_URL
    headers = {} if public else {"Authorization": f"Bearer {mint_service_token(s.ODYSSEY_INTERNAL_TOKEN_SECRET, actor)}",
                                 "Idempotency-Key": uuid.uuid4().hex}
    async with httpx.AsyncClient(timeout=30) as client:
        return await client.request(method, base + path, json=json_body, headers=headers)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


class ScrimIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ballot_id: uuid.UUID
    labels: dict[str, str] = Field(description="finalist entry id to label A or B")
    mode: str = Field(default="fixture", pattern="^(fixture|record)$")
    bots: int = Field(default=30, ge=5, le=200)


@app.post("/v1/scrims", status_code=201)
async def create_scrim(body: ScrimIn, request: Request, user: Staff) -> dict[str, Any]:
    s = get_settings()
    if len(body.labels) != 2 or set(body.labels.values()) != {"A", "B"}:
        raise ProblemError(422, "validation-error", "labels must map two finalist entry IDs to A and B")
    run_id = uuid.uuid4()
    nonce = secrets.token_hex(16)
    async with engine(request).begin() as conn:
        await conn.execute(text("insert into lab.scrim_runs (id, mode, provider, config, budget_usd, status) values "
                                "(:i,:m,:p,cast(:c as jsonb),:b,'running')"),
                           {"i": run_id, "m": body.mode, "p": "fixture" if body.mode == "fixture" else "router",
                            "c": json.dumps({"ballot_id": str(body.ballot_id), "labels": body.labels, "nonce": nonce,
                                             "requested_by": user.sub}), "b": s.SCRIM_MAX_BUDGET_USD})
    results = await run_scrim(engine(request), run_id=run_id, base_url=s.LITELLM_URL, bots=body.bots,
                              labels=("A", "B"), transport=GATEWAY_TRANSPORT)
    return {"id": str(run_id), "status": "done", "mode": body.mode, "fixture": results["fixture"],
            "paired_summary": results["paired_summary"], "bots": results["bots"], "seeds": results["seeds"],
            "calibrated": False}


async def _run(request: Request, run_id: uuid.UUID):
    async with engine(request).connect() as conn:
        row = (await conn.execute(text("select id, status, mode, config, results from lab.scrim_runs where id=:i"),
                                  {"i": run_id})).first()
    if row is None:
        raise ProblemError(404, "not-found", "Scrim not found")
    return row


@app.post("/v1/scrims/{run_id}/prediction")
async def register_prediction(run_id: uuid.UUID, request: Request, user: Staff) -> dict[str, Any]:
    """Commits the scrim's predicted split to Odyssey as a hash. The split itself stays in Lab until publish (CC-1)."""
    row = await _run(request, run_id)
    if row.status != "done":
        raise ProblemError(409, "illegal-transition", "The scrim has not finished")
    labels = row.config["labels"]  # entry id -> label
    by_label = row.results["predicted"]
    predicted = {entry: by_label[label] for entry, label in labels.items()}
    commitment = prediction_commitment(row.config["ballot_id"], predicted, row.config["nonce"])
    resp = await odyssey("POST", f"/internal/v1/ballots/{row.config['ballot_id']}/prediction", user.sub,
                         json_body={"commitment": commitment, "scrim_run_id": str(run_id)})
    if resp.status_code != 200:
        raise ProblemError(resp.status_code, "upstream-error", "Odyssey refused the commitment", resp.text[:200])
    return {"registered": True, "commitment": commitment, "ballot_id": row.config["ballot_id"]}


@app.post("/v1/scrims/{run_id}/reveal-and-publish")
async def reveal_and_publish(run_id: uuid.UUID, request: Request, user: Staff) -> dict[str, Any]:
    row = await _run(request, run_id)
    labels = row.config["labels"]
    predicted = {entry: row.results["predicted"][label] for entry, label in labels.items()}
    resp = await odyssey("POST", f"/internal/v1/ballots/{row.config['ballot_id']}/publish", user.sub,
                         json_body={"predicted": predicted, "nonce": row.config["nonce"]})
    if resp.status_code != 200:
        raise ProblemError(resp.status_code, "upstream-error", "Odyssey refused to publish", resp.text[:200])
    return resp.json()


@app.post("/v1/ballots/{ballot_id}/close")
async def close_ballot(ballot_id: uuid.UUID, user: Staff) -> dict[str, Any]:
    resp = await odyssey("POST", f"/internal/v1/ballots/{ballot_id}/close", user.sub)
    if resp.status_code != 200:
        raise ProblemError(resp.status_code, "upstream-error", "Odyssey refused to close", resp.text[:200])
    return resp.json()


@app.get("/v1/vod/{slug}")
async def vod_review(slug: str, user: Staff) -> dict[str, Any]:
    """VOD Review: the published Final Cut with the real tally and Sim vs Fans, read from Odyssey's public API."""
    resp = await odyssey("GET", f"/v1/episodes/{slug}", user.sub, public=True)
    if resp.status_code != 200:
        raise ProblemError(resp.status_code, "not-found", "Final Cut not found")
    ep = resp.json()
    markers = [{"label": p["kind"], "asset_id": p.get("asset_id")} for p in ep["sequence"]]
    return {"episode": ep, "markers": markers, "sim_vs_fans": ep.get("sim_vs_fans")}


@app.get("/v1/partners")
async def list_partners(request: Request, user: Staff) -> dict[str, Any]:
    async with engine(request).connect() as conn:
        rows = (await conn.execute(text("select id, name from lab.partners order by name"))).all()
    return {"partners": [{"id": str(r.id), "name": r.name} for r in rows]}


@app.get("/v1/partners/{partner_id}/report")
async def partner_report(partner_id: uuid.UUID, request: Request, user: AnyUser) -> dict[str, Any]:
    if user.role == "partner" and user.partner_id != str(partner_id):
        raise ProblemError(403, "forbidden", "Not allowed", "partners see only their own report")
    if user.role not in (*STAFF, "partner"):
        raise ProblemError(403, "forbidden", "Not allowed")
    async with engine(request).connect() as conn:
        partner = (await conn.execute(text("select id, name, fictional from lab.partners where id=:i"),
                                      {"i": partner_id})).first()
        acts = (await conn.execute(text("select campaign_slug, name, placement from lab.activations where partner_id=:i"),
                                   {"i": partner_id})).all()
    if partner is None:
        raise ProblemError(404, "not-found", "Partner not found")
    return {"partner": {"id": str(partner.id), "name": partner.name, "fictional": partner.fictional},
            "activations": [dict(a._mapping) for a in acts],
            "note": "Synthetic demo partner. Figures are simulated and uncalibrated."}


@app.get("/v1/mirofish/status")
async def mirofish_status(request: Request, user: Staff) -> dict[str, Any]:
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            ready = (await c.get(f"{s.MIROFISH_BACKEND_URL}/health")).status_code == 200
    except httpx.HTTPError:
        raise ProblemError(503, "mirofish-unreachable", "MiroFish is not reachable") from None
    async with engine(request).connect() as conn:
        row = (await conn.execute(text("select project_id, graph_id, simulation_id, agent_id from lab.mirofish_project"))).first()
    return {"ready": ready, **(dict(row._mapping) if row else {})}


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=500)


@app.post("/v1/mirofish/chat")
async def mirofish_chat(body: ChatIn, request: Request, user: Staff) -> dict[str, Any]:
    s = get_settings()
    async with engine(request).connect() as conn:
        row = (await conn.execute(text("select simulation_id, agent_id from lab.mirofish_project"))).first()
    if row is None or not row.simulation_id:
        raise ProblemError(409, "mirofish-chat-failed", "No live MiroFish simulation is registered")
    try:
        async with httpx.AsyncClient(timeout=180) as c:
            r = await c.post(f"{s.MIROFISH_BACKEND_URL}/api/simulation/interview",
                             json={"simulation_id": row.simulation_id, "agent_id": row.agent_id or 0,
                                   "prompt": body.prompt, "platform": "reddit", "timeout": 150})
    except httpx.HTTPError:
        raise ProblemError(503, "mirofish-unreachable", "MiroFish is not reachable") from None
    data = r.json()
    if r.status_code != 200 or not data.get("success"):
        raise ProblemError(502, "mirofish-chat-failed", "MiroFish could not answer", str(data.get("error", ""))[:200])
    return {"live": True, "agent_id": row.agent_id or 0, "reply": data["data"].get("result")}
