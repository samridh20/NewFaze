"""Server-sent events for campaign state (FR-5.4, design 3.9). Redis pub/sub reaches every API process."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from redis.asyncio import Redis

CHANNEL = "campaign:{slug}"


def frame(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


async def publish_state(redis: Redis, slug: str, state: str, extra: dict[str, Any] | None = None) -> None:
    payload = {"slug": slug, "state": state, "at": datetime.now(UTC).isoformat(), **(extra or {})}
    await redis.publish(CHANNEL.format(slug=slug), json.dumps(payload))


async def stream(
    request: Request,
    redis: Redis,
    slug: str,
    snapshot: Callable[[], Awaitable[dict[str, Any]]],
    countdown_seconds: int,
) -> AsyncIterator[str]:
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL.format(slug=slug))
    try:
        current = await snapshot()
        yield frame("state", current)
        last_countdown = time.monotonic()
        while not await request.is_disconnected():
            try:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            except Exception as exc:  # noqa: BLE001 - tell the client, then close so it reconnects
                yield frame("error", {"message": "live updates interrupted", "kind": type(exc).__name__})
                return
            if message and message.get("type") == "message":
                data = message["data"]
                yield f"event: state\ndata: {data.decode() if isinstance(data, bytes) else data}\n\n"
            if time.monotonic() - last_countdown >= countdown_seconds:
                last_countdown = time.monotonic()
                current = await snapshot()
                yield frame("countdown", {"slug": slug, "state": current.get("state"),
                                          "closes_at": current.get("closes_at"),
                                          "reveal_at": current.get("reveal_at")})
            await asyncio.sleep(0)
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()
