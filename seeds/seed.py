"""Reset the demo to its starting state (DEMO_MODE only, local database, no network). Idempotent: running it twice
gives the same state. Drop -> vote -> close -> publish -> Final Cut -> Sim vs Fans -> VOD Review -> Partners follows."""
from __future__ import annotations
import asyncio
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("SERVICE_ROLE", "owner")
sys.path[:0] = [str(ROOT / "services" / "common")]

from faze_common.demo_ids import DEMO_ACCOUNTS, PARTNER_NAMES, account_id, demo_uuid, partner_id  # noqa: E402
from faze_common.settings import get_settings  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402


async def main() -> int:
    s = get_settings()
    if not s.DEMO_MODE or s.is_production:
        print("seed refused: DEMO_MODE=1 and a non-production APP_ENV are required")
        return 2
    py = [sys.executable, str(ROOT / "infra" / "migrations" / "run.py")]
    subprocess.run([*py, "downgrade"], check=True, capture_output=True)
    subprocess.run([*py, "upgrade"], check=True, capture_output=True)
    subprocess.run([sys.executable, str(ROOT / "seeds" / "media" / "generate.py")], check=True)
    eng = create_async_engine(s.database_url("faze_owner"))
    cid, ea, eb, now = demo_uuid("campaign:homecoming-week1"), demo_uuid("entry:a"), demo_uuid("entry:b"), datetime.now(UTC)
    async with eng.begin() as c:
        await c.execute(text("insert into odyssey.campaigns (id, slug, format, title, intro_asset_id, end_card_asset_id, "
                             "reference_asset_id, reference_marker_ms) values (:i,'homecoming-week1','recreate_the_shot',"
                             "'Homecoming Week 1: Recreate the Shot','intro','end-card','clip-a',2000)"), {"i": cid})
        for st in ("scheduled", "accepting_entries"):
            await c.execute(text("update odyssey.campaigns set state=:s where id=:i"), {"s": st, "i": cid})
        for eid, asset, handle, link in ((ea, "clip-a", "maya_clutch", True), (eb, "clip-b", "dev_trickshots", False)):
            await c.execute(text(
                "insert into odyssey.entries (id, campaign_id, user_id, source, mux_asset_id, playback_id, duration_ms, handle, "
                "channel_url, permissions, state, receipt_code, created_at) values (:i,:c,:u,'upload',:a,:a,4000,:h,:url,"
                "cast(:p as jsonb),'in_review',:r,:t)"),
                {"i": eid, "c": cid, "u": demo_uuid(f"user:{handle}"), "a": asset, "h": handle,
                 "url": f"https://example.com/{handle}", "p": '{"editorial_use": true, "channel_link": %s}' % str(link).lower(),
                 "r": f"R-{eid.hex[:10]}", "t": now})
        bid = (await c.execute(text("insert into odyssey.ballots (id, campaign_id, version, state, opens_at, closes_at) "
                                    "values (:i,:c,1,'open',:o,:x) returning id"),
                               {"i": demo_uuid("ballot:homecoming-week1"), "c": cid, "o": now - timedelta(minutes=1), "x": now + timedelta(days=7)})).scalar_one()
        for label, eid, asset in (("A", ea, "clip-a"), ("B", eb, "clip-b")):
            await c.execute(text("insert into odyssey.ballot_finalists (ballot_id, entry_id, label, locked_asset_id, marker_ms) "
                                 "values (:b,:e,:l,:a,2000)"), {"b": bid, "e": eid, "l": label, "a": asset})
            await c.execute(text("update odyssey.entries set state='finalist' where id=:i"), {"i": eid})
        for st in ("shortlist_locked", "voting"):
            await c.execute(text("update odyssey.campaigns set state=:s where id=:i"), {"s": st, "i": cid})
        for name, (role, handle, consent, _partner) in DEMO_ACCOUNTS.items():
            await c.execute(text("insert into odyssey.accounts (user_id, handle, role, analytics_consent) values (:u,:h,:r,:c)"),
                            {"u": account_id(name), "h": handle, "r": role, "c": consent})
        for key, name in PARTNER_NAMES.items():
            await c.execute(text("insert into lab.partners (id, name, fictional) values (:i,:n,true)"),
                            {"i": partner_id(key), "n": name})
            await c.execute(text("insert into lab.activations (partner_id, campaign_slug, name, placement) values "
                                 "(:p,'homecoming-week1',:n,'end card')"), {"p": partner_id(key), "n": f"{name} end-card"})
    await eng.dispose()
    print(f"seeded: campaign homecoming-week1 in voting, ballot {bid}, {len(DEMO_ACCOUNTS)} accounts, {len(PARTNER_NAMES)} partners")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
