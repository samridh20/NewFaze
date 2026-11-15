"""Fixture LLM gateway (design 9.6): an OpenAI-compatible stand-in so the demo and tests make no provider calls.
Deterministic: the answer depends only on the request. Every response is flagged ``fixture: true``.
It is never used to claim MiroFish or live-model verification (D-3)."""
from __future__ import annotations
import hashlib
import json

from fastapi import FastAPI, Request

app = FastAPI(title="fixture-gateway")


def decide(prompt: str) -> str:
    """A/B choice from persona cues in the prompt, then a hash tie-breaker."""
    lowered = prompt.lower()
    lean = lowered.count("skill") + lowered.count("clutch") + lowered.count("tension") \
        - lowered.count("humor") - lowered.count("funny") - lowered.count("fast edits")
    digest = int(hashlib.sha256(prompt.encode()).hexdigest(), 16)
    if lean != 0 and digest % 100 < 78:
        return "A" if lean > 0 else "B"
    return "A" if digest % 2 == 0 else "B"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "fixture": True}


@app.post("/v1/chat/completions")
async def completions(request: Request) -> dict:
    body = await request.json()
    prompt = json.dumps(body.get("messages", []), sort_keys=True)
    answer = decide(prompt)
    return {
        "id": "fixture-" + hashlib.sha256(prompt.encode()).hexdigest()[:12], "object": "chat.completion",
        "model": body.get("model", "fixture"), "fixture": True,
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": answer}}],
        "usage": {"prompt_tokens": len(prompt) // 4, "completion_tokens": 1, "total_tokens": len(prompt) // 4 + 1},
    }
