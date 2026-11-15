"""Fan Council: opt-in, ages 14 and up, guardian step for 14 to 15, aggregates only (FR-17, Ch. 19)."""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.auth import Principal
from faze_common.errors import ProblemError

from . import outbox

CONSENT_VERSION = "council-2026-11"
MIN_AGE = 14
SELF_CONSENT_AGE = 16
MIN_GROUP = 20
LINK_TTL_SECONDS = 48 * 3600
_AUDIENCE = "council-guardian"


def conservative_age(birth_year: int, today: datetime | None = None) -> int:
    """With only a birth year, the youngest the person could be (A-21)."""
    return (today or datetime.now(UTC)).year - birth_year - 1


def make_guardian_token(secret: str, *, user_id: str, birth_year: int, guardian_email: str, cohort: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"aud": _AUDIENCE, "sub": user_id, "by": birth_year, "ge": guardian_email, "co": cohort,
         "cv": CONSENT_VERSION, "iat": now, "exp": now + LINK_TTL_SECONDS},
        secret, algorithm="HS256",
    )


async def enrol(
    conn: AsyncConnection, principal: Principal, *, birth_year: int, consent_version: str,
    guardian_email: str | None, cohort: str, secret: str,
) -> dict[str, Any]:
    if consent_version != CONSENT_VERSION:
        raise ProblemError(422, "validation-error", "Consent text has changed",
                           errors=[{"field": "consent_version", "message": f"expected {CONSENT_VERSION}"}])
    age = conservative_age(birth_year)
    if age < MIN_AGE:  # nothing is stored for under-14s
        raise ProblemError(422, "age-too-young", "Fan Council is for ages 14 and up")
    if age < SELF_CONSENT_AGE:
        if not guardian_email:
            raise ProblemError(422, "validation-error", "A guardian's email is required",
                               errors=[{"field": "guardian_email", "message": "required for ages 14 to 15"}])
        # No row is written. The signed link carries everything needed to finish the enrolment.
        token = make_guardian_token(secret, user_id=principal.sub, birth_year=birth_year,
                                    guardian_email=guardian_email, cohort=cohort)
        return {"status": "pending_guardian", "guardian_token": token, "guardian_email": guardian_email}

    await conn.execute(
        text("insert into odyssey.council_members (user_id, birth_year, consent_version, cohort) "
             "values (:u, :b, :c, :co) on conflict (user_id) do nothing"),
        {"u": principal.sub, "b": birth_year, "c": consent_version, "co": cohort},
    )
    await outbox.emit(conn, "council.enrolled", account_user_id=principal.sub, props={"path": "self"})
    return {"status": "enrolled"}


async def confirm_guardian(conn: AsyncConnection, token: str, secret: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=_AUDIENCE,
                            options={"require": ["exp", "sub", "aud"]})
    except jwt.ExpiredSignatureError as exc:
        raise ProblemError(410, "link-expired", "This guardian link has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise ProblemError(422, "validation-error", "Invalid guardian link") from exc
    existing = (await conn.execute(text("select 1 from odyssey.council_members where user_id = :u"),
                                   {"u": claims["sub"]})).first()
    if existing is not None:
        return {"status": "already-confirmed"}
    await conn.execute(
        text("insert into odyssey.council_members "
             "(user_id, birth_year, consent_version, guardian_email, guardian_confirmed_at, cohort) "
             "values (:u, :b, :c, :g, now(), :co)"),
        {"u": claims["sub"], "b": claims["by"], "c": claims["cv"], "g": claims["ge"], "co": claims["co"]},
    )
    await outbox.emit(conn, "council.enrolled", account_user_id=claims["sub"], props={"path": "guardian"})
    return {"status": "enrolled"}


async def questions(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = (await conn.execute(text("select id, prompt, kind, options from odyssey.council_questions "
                                    "where active order by prompt"))).all()
    return [{"question_id": str(r.id), "prompt": r.prompt, "kind": r.kind, "options": r.options} for r in rows]


async def answer(conn: AsyncConnection, principal: Principal, question_id: str, value: str) -> dict[str, Any]:
    member = (await conn.execute(text("select 1 from odyssey.council_members where user_id = :u"),
                                 {"u": principal.sub})).first()
    if member is None:
        raise ProblemError(403, "forbidden", "Join the Fan Council first")
    question = (await conn.execute(
        text("select kind, options from odyssey.council_questions where id = :q and active"),
        {"q": question_id})).first()
    if question is None:
        raise ProblemError(404, "not-found", "Question not found")
    if question.kind == "choice" and value not in (question.options or []):
        raise ProblemError(422, "validation-error", "Not one of the options",
                           errors=[{"field": "answer", "message": "choose one of the listed options"}])
    await conn.execute(
        text("insert into odyssey.council_answers (user_id, question_id, answer) values (:u, :q, :a) "
             "on conflict (user_id, question_id) do update set answer = excluded.answer"),
        {"u": principal.sub, "q": question_id, "a": value},
    )
    return {"status": "recorded"}


async def export_aggregates(conn: AsyncConnection) -> dict[str, Any]:
    """The only path that lets Council data leave Odyssey: cohort totals for cohorts of 20 or more (FR-17.4)."""
    cohorts = (await conn.execute(
        text("select cohort, count(*) as members from odyssey.council_members group by cohort "
             "having count(*) >= :n order by cohort"), {"n": MIN_GROUP})).all()
    allowed = [c.cohort for c in cohorts]
    answers: list[dict[str, Any]] = []
    if allowed:
        rows = (await conn.execute(
            text("select a.question_id, m.cohort, a.answer, count(*) as n from odyssey.council_answers a "
                 "join odyssey.council_members m on m.user_id = a.user_id "
                 "where m.cohort = any(:cohorts) group by 1, 2, 3 order by 1, 2, 3"),
            {"cohorts": allowed})).all()
        answers = [{"question_id": str(r.question_id), "cohort": r.cohort, "answer": r.answer, "count": r.n}
                   for r in rows]
    return {"min_group": MIN_GROUP, "cohorts": [{"cohort": c.cohort, "members": c.members} for c in cohorts],
            "answers": answers}
