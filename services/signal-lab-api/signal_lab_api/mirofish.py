# ruff: noqa: E501 - scenario prompts and response regexes are clearer as intact literals.
"""MiroFish orchestration for the Signal Lab dashboard. Drives the real MiroFish backend (no fixtures):
pack -> ontology -> graph build (Zep) -> simulation create -> prepare -> start, then exposes graph, feed and chat.
One run at a time (the MiroFish key is budget-capped). State lives in memory plus lab.mirofish_project."""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request
from faze_common.auth import Principal, current_principal
from faze_common.errors import ProblemError
from faze_common.settings import get_settings
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

router = APIRouter(prefix="/v1/mirofish")
Staff = Depends(current_principal("producer", "analyst", "admin"))

SCENARIOS: dict[str, dict[str, str]] = {
    "clip-vote": {
        "label": "Clip A vs Clip B",
        "tag": "Homecoming week 1",
        "requirement": "Predict how the FaZe fan community splits between Clip A and Clip B in the Homecoming week-one "
        "vote, and why. All agents are English-speaking esports fans.",
    },
    "temperrr-brief": {
        "label": "Temperrr Shot briefs",
        "tag": "Brief A vs B",
        "requirement": "Two brief variants for the Temperrr Shot drop. Variant A gives the clip length and rules; "
        "variant B omits the clip length. Predict which brief fans understand and enter more, and what "
        "confuses them. All agents are English-speaking esports fans.",
    },
    "recruitment-masked": {
        "label": "Org A recruitment",
        "tag": "Masked backtest",
        "requirement": "Org A runs two recruitment challenges, described in the document. Simulate how creators and "
        "fans react, which challenge each person would enter, and which challenge attracts more total "
        "entries and by roughly how much. All agents are English-speaking creators and fans.",
    },
    "mafiathon-masked": {
        "label": "Mafiathon 2 vs. 3",
        "tag": "Masked livestream backtest",
        "requirement": "A major livestream creator ran two month-long marathon events, described as Challenge 1 "
        "and Challenge 2 in the document. Simulate how viewers react to each edition and predict which challenge "
        "reaches the higher peak active subscription count. Agents must explicitly refer to Challenge 1 or "
        "Challenge 2 when taking a side. All agents are English-speaking livestream viewers and creator fans.",
    },
    "sponsor-reveal": {
        "label": "Sponsor reveal",
        "tag": "Partners",
        "requirement": "A fictional energy-drink sponsor appears on the Final Cut end card. Predict how fans react to "
        "the sponsor placement and whether it hurts the vote. English-speaking esports fans.",
    },
}

STAGES = ["queued", "ontology", "graph", "create", "prepare", "start", "running", "ready", "failed"]


class RunState:
    def __init__(self) -> None:
        self.id: str | None = None
        self.stage = "idle"
        self.message = ""
        self.scenario: str | None = None
        self.prompt = ""
        self.started_at: float | None = None
        self.project_id: str | None = None
        self.graph_id: str | None = None
        self.simulation_id: str | None = None
        self.task: asyncio.Task | None = None
        self.log: list[dict[str, Any]] = []

    def say(self, stage: str, message: str) -> None:
        self.stage, self.message = stage, message
        self.log.append({"t": round(time.time(), 1), "stage": stage, "message": message})
        self.log = self.log[-60:]

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "stage": self.stage,
            "message": self.message,
            "scenario": self.scenario,
            "prompt": self.prompt,
            "project_id": self.project_id,
            "graph_id": self.graph_id,
            "simulation_id": self.simulation_id,
            "log": self.log,
            "elapsed_s": round(time.time() - self.started_at) if self.started_at else 0,
        }


STATE = RunState()


def backend() -> str:
    return get_settings().MIROFISH_BACKEND_URL.rstrip("/")


async def mf(
    method: str,
    path: str,
    *,
    timeout: float = 60,  # noqa: ASYNC109 - this is the upstream client's timeout
    **kw: Any,
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, backend() + path, **kw)
    except httpx.HTTPError:
        raise ProblemError(503, "mirofish-unreachable", "MiroFish is not reachable") from None
    try:
        body = r.json()
    except ValueError:
        body = {}
    if r.status_code >= 400 or body.get("success") is False:
        raise ProblemError(
            502,
            "mirofish-error",
            "MiroFish returned an error",
            str(body.get("error", r.status_code))[:240],
        )
    return body.get("data", body)


async def _poll(fn, done, timeout_s: int, every: float = 4) -> dict[str, Any]:
    end = time.time() + timeout_s
    last: dict[str, Any] = {}
    while time.time() < end:
        last = await fn()
        if done(last):
            return last
        await asyncio.sleep(every)
    raise TimeoutError("MiroFish step timed out")


PACKS = {
    "recruitment-masked": "recruitment-masked.md",
    "mafiathon-masked": "mafiathon-masked.md",
}  # masked cases must not reuse the FaZe fan pack


def build_pack(
    scenario: str, prompt: str, pack_md: str | None = None, requirement: str | None = None
) -> str:
    """The document MiroFish reads. A custom ``pack_md`` (an ecosystem dossier cut at a date) replaces the seeded pack."""
    if pack_md is not None:
        extra = (
            requirement
            or "Simulate how the people and groups in this briefing react and what they choose."
        )
        return f"{pack_md.strip()}\n\n## Scenario\n{extra}\n\n## Analyst question\n{prompt}\n"
    pack = (get_settings_root() / "seeds" / "mirofish" / PACKS.get(scenario, "pack.md")).read_text()
    extra = SCENARIOS.get(scenario, {}).get("requirement", "")
    return f"{pack}\n\n## Scenario\n{extra}\n\n## Analyst question\n{prompt}\n"


def get_settings_root():
    from faze_common.settings import ROOT

    return ROOT


async def _pipeline(
    engine,
    scenario: str,
    prompt: str,
    agents: int,
    rounds: int,
    pack_md: str | None = None,
    requirement: str | None = None,
) -> None:
    s = STATE
    try:
        s.say("ontology", "Reading the fan pack and generating the ontology (LLM)")
        goal = (
            (requirement or SCENARIOS.get(scenario, {}).get("requirement", "")) + " " + prompt
        ).strip()
        if pack_md is not None:
            s.say(
                "ontology",
                f"Reading an ecosystem dossier ({len(pack_md):,} characters) and generating the ontology (LLM)",
            )
        files = {
            "files": (
                "pack.md",
                build_pack(scenario, prompt, pack_md, requirement).encode(),
                "text/markdown",
            )
        }
        data = await mf(
            "POST",
            "/api/graph/ontology/generate",
            timeout=300,
            files=files,
            data={"simulation_requirement": goal, "project_name": f"faze-{scenario}"},
        )
        s.project_id = data["project_id"]
        s.say("graph", "Building the knowledge graph in Zep")
        task = await mf("POST", "/api/graph/build", json={"project_id": s.project_id})
        done = await _poll(
            lambda: mf("GET", f"/api/graph/task/{task['task_id']}"),
            lambda t: t.get("status") in {"completed", "failed"},
            600,
        )
        if done.get("status") != "completed":
            raise RuntimeError(f"graph build failed: {done.get('message')}")
        s.graph_id = (done.get("result") or {}).get("graph_id")
        s.say("create", "Creating the simulation")
        sim = await mf(
            "POST",
            "/api/simulation/create",
            json={
                "project_id": s.project_id,
                "graph_id": s.graph_id,
                "enable_twitter": False,
                "enable_reddit": True,
            },
        )
        s.simulation_id = sim["simulation_id"]
        s.say("prepare", "Generating English fan personas (LLM)")
        prep = await mf(
            "POST",
            "/api/simulation/prepare",
            json={
                "simulation_id": s.simulation_id,
                "use_llm_for_profiles": True,
                "parallel_profile_count": min(agents, 5),
            },
        )
        await _poll(
            lambda: mf(
                "POST",
                "/api/simulation/prepare/status",
                json={"task_id": prep.get("task_id"), "simulation_id": s.simulation_id},
            ),
            lambda t: (
                t.get("status") in {"completed", "ready", "failed"}
                or bool(t.get("already_prepared"))
            ),
            900,
        )
        s.say("start", f"Starting the simulation ({rounds} rounds, evening peak)")
        await mf(
            "POST",
            "/api/simulation/start",
            json={
                "simulation_id": s.simulation_id,
                "platform": "reddit",
                "max_rounds": rounds,
                "force": True,
            },
        )
        async with engine.begin() as conn:
            await conn.execute(text("delete from lab.mirofish_project"))
            await conn.execute(
                text(
                    "insert into lab.mirofish_project (pin, project_id, graph_id, simulation_id, agent_id, notes) "
                    "values ('v0.1.2-985f89f-en', :p, :g, :s, 0, cast(:n as jsonb))"
                ),
                {
                    "p": s.project_id,
                    "g": s.graph_id,
                    "s": s.simulation_id,
                    "n": json.dumps({"scenario": scenario}),
                },
            )
        s.say("running", "Agents are posting and replying")
        # MiroFish v0.1.2's round counter does not advance (its monitor reads a file this build never writes).
        # The environment switches to "alive" (waiting for interview commands) once the round loop has finished.
        await _poll(
            lambda: mf(
                "POST", "/api/simulation/env-status", json={"simulation_id": s.simulation_id}
            ),
            lambda t: bool(t.get("env_alive")),
            1800,
            every=8,
        )
        s.say("ready", "Simulation finished its rounds. Agents stay online for chat")
    except Exception as exc:
        s.say("failed", str(getattr(exc, "detail", None) or exc)[:240])


class RunIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: str = Field(
        pattern="^(clip-vote|temperrr-brief|recruitment-masked|mafiathon-masked|sponsor-reveal|custom|ecosystem)$"
    )
    pack_md: str | None = Field(
        default=None,
        min_length=200,
        max_length=40000,
        description="An ecosystem dossier. Replaces the seeded pack.",
    )
    requirement: str | None = Field(default=None, max_length=700)
    prompt: str = Field(default="", max_length=600)
    agents: int = Field(default=6, ge=3, le=12)
    rounds: int = Field(default=12, ge=2, le=24)


@router.get("/scenarios")
async def scenarios(user: Principal = Staff) -> dict[str, Any]:
    return {
        "scenarios": [{"id": k, "label": v["label"], "tag": v["tag"]} for k, v in SCENARIOS.items()]
    }


@router.post("/runs", status_code=202)
async def start_run(body: RunIn, request: Request, user: Principal = Staff) -> dict[str, Any]:
    if STATE.task is not None and not STATE.task.done():
        raise ProblemError(409, "mirofish-busy", "A MiroFish run is already in progress")
    STATE.__init__()
    if body.scenario == "ecosystem" and body.pack_md is None:
        raise ProblemError(422, "validation-error", "An ecosystem run needs a dossier (pack_md)")
    STATE.id, STATE.scenario, STATE.prompt, STATE.started_at = (
        uuid.uuid4().hex[:8],
        body.scenario,
        body.prompt,
        time.time(),
    )
    STATE.say("queued", "Queued")
    STATE.task = asyncio.create_task(
        _pipeline(
            request.app.state.engine,
            body.scenario,
            body.prompt,
            body.agents,
            body.rounds,
            body.pack_md,
            body.requirement,
        )
    )
    return STATE.view()


async def _current_ids(request: Request) -> tuple[str | None, str | None]:
    if STATE.simulation_id or STATE.graph_id:
        return STATE.graph_id, STATE.simulation_id
    async with request.app.state.engine.connect() as conn:
        row = (
            await conn.execute(text("select graph_id, simulation_id from lab.mirofish_project"))
        ).first()
    return (row.graph_id, row.simulation_id) if row else (None, None)


@router.get("/runs/current")
async def current(request: Request, user: Principal = Staff) -> dict[str, Any]:
    view = STATE.view()
    if STATE.id is None:
        graph_id, sim_id = await _current_ids(request)
        view.update(
            graph_id=graph_id,
            simulation_id=sim_id,
            stage="ready" if sim_id else "idle",
            message="Previous MiroFish simulation" if sim_id else "No run yet",
        )
    sim_id = view.get("simulation_id")
    if sim_id:
        try:
            st = await mf("GET", f"/api/simulation/{sim_id}/run-status", timeout=10)
            view["run_status"] = {k: st.get(k) for k in ("runner_status", "total_rounds")}
            posts = await mf(
                "GET", f"/api/simulation/{sim_id}/posts?platform=reddit&limit=500", timeout=10
            )
            comments = await mf(
                "GET", f"/api/simulation/{sim_id}/comments?platform=reddit&limit=500", timeout=10
            )
            view["run_status"].update(
                posts=len(posts.get("posts", [])), comments=len(comments.get("comments", []))
            )
        except ProblemError:
            view["run_status"] = None
    try:
        await mf("GET", "/health", timeout=5)
        view["mirofish"] = "online"
    except ProblemError:
        view["mirofish"] = "offline"
    return view


@router.get("/graph")
async def graph(request: Request, user: Principal = Staff) -> dict[str, Any]:
    graph_id, _ = await _current_ids(request)
    if not graph_id:
        return {"nodes": [], "edges": []}
    data = await mf("GET", f"/api/graph/data/{graph_id}", timeout=30)
    nodes = [
        {
            "id": n.get("uuid") or n.get("name"),
            "name": n.get("name"),
            "type": next((label for label in n.get("labels", []) if label != "Entity"), "Entity"),
            "summary": (n.get("summary") or "")[:400],
        }
        for n in data.get("nodes", [])
    ]
    ids = {n["id"] for n in nodes}
    edges = [
        {
            "source": e.get("source_node_uuid"),
            "target": e.get("target_node_uuid"),
            "label": (e.get("name") or (e.get("attributes") or {}).get("edge_type") or ""),
            "fact": (e.get("fact") or "")[:300],
        }
        for e in data.get("edges", [])
        if e.get("source_node_uuid") in ids and e.get("target_node_uuid") in ids
    ]
    return {"graph_id": graph_id, "nodes": nodes, "edges": edges}


A_RE = re.compile(
    r"\b(clip a|variant a|brief a|option a|challenge (1|one)|first challenge|five[- ]spot\w*|five spots)\b",
    re.I,
)
B_RE = re.compile(
    r"\b(clip b|variant b|brief b|option b|challenge (2|two)|second challenge|one[- ]spot\w*|single spot|"
    r"million[- ]dollar|\$1,?000,?000|\$1m)\b",
    re.I,
)


@router.get("/feed")
async def feed(request: Request, user: Principal = Staff) -> dict[str, Any]:
    _, sim_id = await _current_ids(request)
    if not sim_id:
        return {"posts": [], "agents": [], "lean": None}
    posts = (
        await mf("GET", f"/api/simulation/{sim_id}/posts?platform=reddit&limit=100", timeout=20)
    ).get("posts", [])
    try:
        comments = (
            await mf(
                "GET", f"/api/simulation/{sim_id}/comments?platform=reddit&limit=200", timeout=20
            )
        ).get("comments", [])
    except ProblemError:
        comments = []
    profiles = (
        await mf("GET", f"/api/simulation/{sim_id}/profiles?platform=reddit", timeout=20)
    ).get("profiles", [])
    agents = [
        {
            "id": i,
            "name": p.get("name") or p.get("username") or f"agent {i}",
            "username": p.get("username"),
            "bio": (p.get("bio") or "")[:240],
            "mbti": p.get("mbti"),
            "country": p.get("country"),
        }
        for i, p in enumerate(profiles)
    ]
    names = {a["id"]: a["name"] for a in agents}
    items = [
        {
            "kind": "post",
            "id": f"p{p['post_id']}",
            "agent": names.get(p.get("user_id"), p.get("user_id")),
            "agent_id": p.get("user_id"),
            "content": p.get("content"),
            "likes": p.get("num_likes", 0),
            "at": p.get("created_at"),
        }
        for p in posts
    ]
    items += [
        {
            "kind": "comment",
            "id": f"c{c.get('comment_id')}",
            "agent": names.get(c.get("user_id"), c.get("user_id")),
            "agent_id": c.get("user_id"),
            "content": c.get("content"),
            "likes": c.get("num_likes", 0),
            "at": c.get("created_at"),
            "post_id": c.get("post_id"),
        }
        for c in comments
    ]
    items.sort(key=lambda x: str(x.get("at")), reverse=True)
    a = sum(
        1
        for x in items
        if A_RE.search(x.get("content") or "") and not B_RE.search(x.get("content") or "")
    )
    b = sum(
        1
        for x in items
        if B_RE.search(x.get("content") or "") and not A_RE.search(x.get("content") or "")
    )
    lean = {
        "a": a,
        "b": b,
        "method": "mentions in agent posts (heuristic, simulated, uncalibrated)",
    }
    return {"posts": items[:120], "agents": agents, "lean": lean}


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=500)
    agent_id: int = Field(default=0, ge=0, le=100)


@router.post("/chat")
async def chat(body: ChatIn, request: Request, user: Principal = Staff) -> dict[str, Any]:
    _, sim_id = await _current_ids(request)
    if not sim_id:
        raise ProblemError(409, "mirofish-chat-failed", "No live MiroFish simulation is registered")
    env = await mf("POST", "/api/simulation/env-status", json={"simulation_id": sim_id}, timeout=15)
    if not env.get("env_alive"):
        raise ProblemError(
            409,
            "mirofish-chat-failed",
            "The simulation is not accepting chat yet",
            "Agents accept chat once the simulation has finished its rounds",
        )
    data = await mf(
        "POST",
        "/api/simulation/interview",
        timeout=180,
        json={
            "simulation_id": sim_id,
            "agent_id": body.agent_id,
            "prompt": body.prompt,
            "platform": "reddit",
            "timeout": 150,
        },
    )
    result = data.get("result") or {}
    reply = result.get("response") if isinstance(result, dict) else str(result)
    return {"live": True, "agent_id": body.agent_id, "reply": reply}


ORG_LIKE = re.compile(
    r"organi[sz]ation|community management|administration|\bbrand\b|sponsor|company|collective|platform|partner program|event organi",
    re.I,
)


class PollIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=5, max_length=600)
    options: list[str] = Field(min_length=2, max_length=4)
    skip_organisations: bool = True


def parse_choice(reply: str, options: list[str]) -> str | None:
    """Reads 'CHOICE: <option>'. Falls back to the only option named in the first line. Never guesses between two."""
    m = re.search(r"CHOICE\s*[:\-]\s*\**\s*(.+)", reply, re.I)
    head = (m.group(1) if m else reply.splitlines()[0] if reply.strip() else "").lower()
    found = [o for o in options if o.lower() in head]
    return found[0] if len(found) == 1 else None


@router.post("/poll")
async def poll(body: PollIn, request: Request, user: Principal = Staff) -> dict[str, Any]:
    """Asks every simulated person the same forced-choice question once, in character, and tallies the answers.
    Needs the simulation to have finished its rounds (agents stay online for interviews)."""
    _, sim_id = await _current_ids(request)
    if not sim_id:
        raise ProblemError(409, "mirofish-chat-failed", "No live MiroFish simulation is registered")
    env = await mf("POST", "/api/simulation/env-status", json={"simulation_id": sim_id}, timeout=15)
    if not env.get("env_alive"):
        raise ProblemError(
            409,
            "mirofish-chat-failed",
            "The simulation is not accepting questions yet",
            "Wait for the Chat step",
        )
    profiles = (
        await mf("GET", f"/api/simulation/{sim_id}/profiles?platform=reddit", timeout=20)
    ).get("profiles", [])
    asked = [
        (i, p)
        for i, p in enumerate(profiles)
        if not (body.skip_organisations and ORG_LIKE.search(p.get("profession") or ""))
    ]
    skipped = [p.get("name") for i, p in enumerate(profiles) if (i, p) not in asked]
    if len(asked) < 2:
        raise ProblemError(422, "validation-error", "Fewer than two simulated people to ask")
    labels = " or ".join(f'"{o}"' for o in body.options)
    prompt = (
        f"{body.question}\nStart your reply with exactly one line in this form: CHOICE: <{labels}>\n"
        "Then give one sentence of reasoning in your own voice."
    )
    gate = asyncio.Semaphore(3)

    async def ask(i: int, p: dict[str, Any]) -> dict[str, Any]:
        async with gate:
            try:
                data = await mf(
                    "POST",
                    "/api/simulation/interview",
                    timeout=180,
                    json={
                        "simulation_id": sim_id,
                        "agent_id": i,
                        "prompt": prompt,
                        "platform": "reddit",
                        "timeout": 150,
                    },
                )
                result = data.get("result") or {}
                reply = str(result.get("response") if isinstance(result, dict) else result)
            except ProblemError as exc:
                return {
                    "agent_id": i,
                    "name": p.get("name"),
                    "choice": None,
                    "reason": f"no answer ({exc.detail})"[:200],
                }
        choice = parse_choice(reply, body.options)
        reason = (
            re.sub(r"(?is)^.*?CHOICE\s*[:\-][^\n]*\n?", "", reply, count=1).strip() or reply.strip()
        )
        return {"agent_id": i, "name": p.get("name"), "choice": choice, "reason": reason[:400]}

    answers = await asyncio.gather(*(ask(i, p) for i, p in asked))
    tally = {o: sum(1 for a in answers if a["choice"] == o) for o in body.options}
    return {
        "simulation_id": sim_id,
        "agents": answers,
        "tally": tally,
        "undecided": sum(1 for a in answers if a["choice"] is None),
        "skipped": skipped,
        "asked": len(answers),
    }
