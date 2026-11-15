"""Scrim runner: cohort-weighted bots choose between finalists A and B. Modes (lab.scrim_runs.mode):
  fixture  calls the fixture gateway (no provider), records every call
  record   calls the live router (LITELLM_URL), records every call
  replay   serves every answer from lab.llm_calls, makes no network call at all (AC-27 to AC-29)
Sequential and seeded, so a replay reproduces the first run exactly. Provider usage is capped by budget_usd.
The OASIS 0.2.6 social driver is deferred; this is the minimum bot loop the Sim vs Fans prediction needs."""
from __future__ import annotations
import hashlib
import json
import random
import uuid
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

COHORTS = {
    "returning": ("a returning fan who values skill, clutch plays and tension", 0.5),
    "newcomer": ("a newcomer who values humor, funny moments and fast edits", 0.3),
    "creator": ("a creator who judges craft and skill", 0.2),
}


def request_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


async def _ask(client: httpx.AsyncClient | None, base: str, engine: AsyncEngine, run_id: uuid.UUID, mode: str,
               payload: dict, seen: dict[str, int], model_alias: str) -> str:
    h = request_hash(payload)
    occurrence = seen.get(h, 0)
    seen[h] = occurrence + 1
    source = run_id
    async with engine.connect() as conn:
        if mode == "replay":
            row = (await conn.execute(text(
                "select response from lab.llm_calls where run_id = (select replay_of from lab.scrim_runs where id=:r) "
                "and request_hash=:h and occurrence=:o"), {"r": run_id, "h": h, "o": occurrence})).first()
            if row is None:
                raise RuntimeError("replay-miss: the recorded run has no answer for this request")
            return str(row.response["choices"][0]["message"]["content"]).strip()[:1]
    assert client is not None
    response = (await client.post(f"{base}/chat/completions", json=payload, timeout=60)).json()
    usage = response.get("usage", {})
    async with engine.begin() as conn:
        await conn.execute(text(
            "insert into lab.llm_calls (run_id, request_hash, occurrence, request, response, model_alias, provider, "
            "tokens_in, tokens_out) values (:r,:h,:o,cast(:q as jsonb),cast(:s as jsonb),:m,:p,:ti,:to)"),
            {"r": source, "h": h, "o": occurrence, "q": json.dumps(payload), "s": json.dumps(response),
             "m": model_alias, "p": "fixture" if response.get("fixture") else "router",
             "ti": usage.get("prompt_tokens", 0), "to": usage.get("completion_tokens", 0)})
    return str(response["choices"][0]["message"]["content"]).strip()[:1]


async def run_scrim(engine: AsyncEngine, *, run_id: uuid.UUID, base_url: str, bots: int = 30,
                    seeds: tuple[int, ...] = (1, 2, 3), labels: tuple[str, str] = ("A", "B"),
                    model_alias: str = "bots-fast", transport: Any = None) -> dict[str, Any]:
    async with engine.connect() as conn:
        run = (await conn.execute(text("select mode, config from lab.scrim_runs where id=:r"), {"r": run_id})).one()
    mode = run.mode
    client = None if mode == "replay" else httpx.AsyncClient(transport=transport)
    observations = []
    try:
        for seed in seeds:
            rng = random.Random(seed)
            seen: dict[str, int] = {}
            votes = {labels[0]: 0.0, labels[1]: 0.0}
            for bot in range(bots):
                cohort = rng.choices(list(COHORTS), weights=[w for _, w in COHORTS.values()])[0]
                persona = COHORTS[cohort][0]
                payload = {"model": model_alias, "max_tokens": 4, "temperature": 0, "messages": [
                    {"role": "system", "content": f"You are {persona}. Answer with one letter."},
                    {"role": "user", "content": f"Seed {seed} bot {bot}. Clip A: a long-range clutch. "
                                                f"Clip B: a comedic trick-shot montage. Which clip gets your vote, A or B?"}]}
                choice = await _ask(client, base_url, engine, run_id, mode, payload, seen, model_alias)
                votes[labels[0] if choice != "B" else labels[1]] += 1
            share = {k: round(v / bots, 6) for k, v in votes.items()}
            observations.append({"seed": seed, "metrics": {"share": share, "bots": bots}})
    finally:
        if client is not None:
            await client.aclose()
    mean = {label: round(sum(o["metrics"]["share"][label] for o in observations) / len(observations), 6) for label in labels}
    total = sum(mean.values()) or 1.0
    predicted = {k: round(v / total, 6) for k, v in mean.items()}
    results = {"predicted": predicted, "seeds": list(seeds), "bots": bots, "mode": mode, "fixture": mode != "record",
               "paired_summary": {"a_minus_b": round(predicted[labels[0]] - predicted[labels[1]], 6)},
               "calibrated": False}
    async with engine.begin() as conn:
        for o in observations:
            await conn.execute(text("insert into lab.scrim_observations (run_id, variant, seed, metrics) values "
                                    "(:r,'A',:s,cast(:m as jsonb)) on conflict do nothing"),
                               {"r": run_id, "s": o["seed"], "m": json.dumps(o["metrics"])})
        await conn.execute(text("update lab.scrim_runs set status='done', results=cast(:x as jsonb), finished_at=now(), "
                                "progress=cast(:p as jsonb) where id=:r"),
                           {"r": run_id, "x": json.dumps(results), "p": json.dumps({"done": len(seeds), "total": len(seeds)})})
    return results
