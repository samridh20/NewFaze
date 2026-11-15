"""Idempotency keys (FR-4.2, design 3.7).

The first response is stored under (scope, key). A repeat returns it. The same key with a different request is
refused. Concurrent requests with one key serialize on a transaction-scoped advisory lock, so there is no
"in progress" state for a caller to see.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from faze_common.errors import ProblemError

KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-:.]{8,128}$")


def validate_key(key: str | None, *, required: bool = True) -> str | None:
    if key is None or key == "":
        if required:
            raise ProblemError(400, "idempotency-key-required", "Idempotency-Key header required")
        return None
    if not KEY_PATTERN.match(key):
        raise ProblemError(422, "invalid-idempotency-key", "Invalid Idempotency-Key",
                           "use 8 to 128 characters from A-Z a-z 0-9 _ - : .")
    return key


def request_hash(payload: Any) -> str:
    canonical = json.dumps(jsonable_encoder(payload), sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def run_idempotent(
    conn: AsyncConnection,
    *,
    scope: str,
    key: str,
    payload: Any,
    handler: Callable[[], Awaitable[tuple[int, dict[str, Any]]]],
) -> tuple[int, dict[str, Any], bool]:
    """Returns (status, body, replayed)."""
    await conn.execute(
        # "\x1f" (unit separator) is legal in text and cannot appear in a scope or a validated key.
        text("select pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"{scope}\x1f{key}"}
    )
    digest = request_hash(payload)
    row = (
        await conn.execute(
            text("select request_hash, status_code, response from odyssey.idempotency_keys "
                 "where scope = :s and key = :k"),
            {"s": scope, "k": key},
        )
    ).first()
    if row is not None:
        if row.request_hash != digest:
            raise ProblemError(422, "idempotency-key-reuse", "Idempotency-Key reused",
                               "this key was already used with a different request")
        return row.status_code, row.response, True
    status, body = await handler()
    await conn.execute(
        text("insert into odyssey.idempotency_keys (scope, key, request_hash, status_code, response) "
             "values (:s, :k, :h, :c, cast(:r as jsonb))"),
        {"s": scope, "k": key, "h": digest, "c": status,
         "r": json.dumps(jsonable_encoder(body), default=str)},
    )
    return status, body, False
