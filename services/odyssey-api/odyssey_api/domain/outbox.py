"""Transactional outbox writer (FR-13.1, Ch. 17). Payloads are versioned and validated before they are written."""

from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

SCHEMA_VERSION = 1
TOPICS = {
    "campaign.transitioned", "entry.accepted", "vote.cast", "vote.changed", "ballot.closed",
    "episode.published", "episode.viewed", "channel.clicked", "council.enrolled",
}


class OutboxEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: uuid.UUID
    v: int = SCHEMA_VERSION
    campaign_id: uuid.UUID | None = None
    brief_version_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None  # present only for accounts that consented to analytics
    referral: str | None = None
    props: dict[str, Any] = {}


async def consented_account(conn: AsyncConnection, user_id: str) -> uuid.UUID | None:
    row = (
        await conn.execute(
            text("select analytics_consent from odyssey.accounts where user_id = :u"), {"u": user_id}
        )
    ).first()
    return uuid.UUID(user_id) if row is not None and row.analytics_consent else None


async def emit(
    conn: AsyncConnection,
    topic: str,
    *,
    campaign_id: uuid.UUID | str | None = None,
    brief_version_id: uuid.UUID | str | None = None,
    account_user_id: str | None = None,
    referral: str | None = None,
    props: dict[str, Any] | None = None,
) -> uuid.UUID:
    if topic not in TOPICS:
        raise ValueError(f"unknown outbox topic {topic}")
    event = OutboxEvent(
        event_id=uuid.uuid4(),
        campaign_id=campaign_id,  # type: ignore[arg-type]
        brief_version_id=brief_version_id,  # type: ignore[arg-type]
        account_id=await consented_account(conn, account_user_id) if account_user_id else None,
        referral=referral,
        props=props or {},
    )
    await conn.execute(
        text("insert into odyssey.outbox (topic, payload) values (:t, cast(:p as jsonb))"),
        {"t": topic, "p": event.model_dump_json()},
    )
    return event.event_id


def jsonb(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)
