"""Read models for Studio: ballot status, entries, and the pre-publish anomaly report (FR-6.8)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.errors import ProblemError

FLAG_SHARE = 0.5  # a bucket above this share of all votes is flagged
FLAG_MIN_VOTES = 5


def _bucket(rows: list[Any], total: int, key: str) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        share = row.n / total if total else 0.0
        out.append({key: row[0], "votes": row.n, "share": round(share, 4),
                    "flagged": total >= FLAG_MIN_VOTES and share > FLAG_SHARE})
    return out


async def anomaly_report(conn: AsyncConnection, ballot_id: uuid.UUID) -> dict[str, Any]:
    exists = (await conn.execute(text("select 1 from odyssey.ballots where id = :id"), {"id": ballot_id})).first()
    if exists is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    total = (await conn.execute(text("select count(*) from odyssey.votes where ballot_id = :b"),
                                {"b": ballot_id})).scalar_one()
    by_referral = (await conn.execute(
        text("select coalesce(referral, '(none)') as referral, count(*) as n from odyssey.votes "
             "where ballot_id = :b group by 1 order by n desc limit 20"), {"b": ballot_id})).all()
    by_ip = (await conn.execute(
        text("select left(coalesce(ip_hash, '(none)'), 8) as ip_bucket, count(*) as n from odyssey.votes "
             "where ballot_id = :b group by 1 order by n desc limit 20"), {"b": ballot_id})).all()
    by_age = (await conn.execute(
        text("select case when v.first_cast_at - a.created_at < interval '1 day' then 'under 1 day' "
             "            when v.first_cast_at - a.created_at < interval '7 days' then '1 to 7 days' "
             "            else '7 days or more' end as age_band, count(*) as n "
             "from odyssey.votes v join odyssey.accounts a on a.user_id = v.voter_id "
             "where v.ballot_id = :b group by 1 order by n desc"), {"b": ballot_id})).all()
    report = {
        "ballot_id": str(ballot_id), "total_votes": total,
        "by_referral": _bucket(by_referral, total, "referral"),
        "by_ip_bucket": _bucket(by_ip, total, "ip_bucket"),
        "by_account_age": _bucket(by_age, total, "age_band"),
    }
    report["any_flagged"] = any(b["flagged"] for key in ("by_referral", "by_ip_bucket", "by_account_age")
                                for b in report[key])
    return report


async def ballot_status(conn: AsyncConnection, ballot_id: uuid.UUID) -> dict[str, Any]:
    row = (await conn.execute(
        text("select b.id, b.state, b.opens_at, b.closes_at, b.closed_at, b.tally, c.id as campaign_id, "
             "       c.slug, c.state as campaign_state, (select count(*) from odyssey.votes v where v.ballot_id = b.id) as votes "
             "from odyssey.ballots b join odyssey.campaigns c on c.id = b.campaign_id where b.id = :id"),
        {"id": ballot_id})).first()
    if row is None:
        raise ProblemError(404, "not-found", "Ballot not found")
    finalists = (await conn.execute(
        text("select f.entry_id, f.label, f.locked_asset_id, f.marker_ms, e.handle from odyssey.ballot_finalists f "
             "join odyssey.entries e on e.id = f.entry_id where f.ballot_id = :b order by f.label"),
        {"b": ballot_id})).all()
    return {
        "ballot_id": str(row.id), "state": row.state, "campaign_id": str(row.campaign_id), "slug": row.slug,
        "campaign_state": row.campaign_state, "votes": row.votes,
        "opens_at": row.opens_at.isoformat(), "closes_at": row.closes_at.isoformat(),
        "closed_at": row.closed_at.isoformat() if row.closed_at else None, "tally": row.tally,
        "finalists": [{"entry_id": str(f.entry_id), "label": f.label, "asset_id": f.locked_asset_id,
                       "marker_ms": f.marker_ms, "handle": f.handle} for f in finalists],
    }


async def campaign_entries(conn: AsyncConnection, campaign_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (await conn.execute(
        text("select id, handle, state, mux_asset_id, duration_ms, marker_ms, permissions, created_at "
             "from odyssey.entries where campaign_id = :c order by created_at"), {"c": campaign_id})).all()
    return [{"entry_id": str(r.id), "handle": r.handle, "state": r.state, "asset_id": r.mux_asset_id,
             "duration_ms": r.duration_ms, "marker_ms": r.marker_ms,
             "editorial_use": bool((r.permissions or {}).get("editorial_use"))} for r in rows]


async def campaign_status(conn: AsyncConnection, campaign_id: uuid.UUID) -> dict[str, Any]:
    row = (await conn.execute(text("select id, slug, title, state, paused_from from odyssey.campaigns where id = :id"),
                              {"id": campaign_id})).first()
    if row is None:
        raise ProblemError(404, "not-found", "Campaign not found")
    ballot = (await conn.execute(
        text("select id, state from odyssey.ballots where campaign_id = :c order by version desc limit 1"),
        {"c": campaign_id})).first()
    return {"campaign_id": str(row.id), "slug": row.slug, "title": row.title, "state": row.state,
            "paused_from": row.paused_from, "ballot_id": str(ballot.id) if ballot else None,
            "ballot_state": ballot.state if ballot else None}
