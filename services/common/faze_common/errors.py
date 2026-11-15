"""RFC 9457 problem details with stable types, and the request-ID and error middleware (FR-1.8)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .redaction import redact

PROBLEM_BASE = "https://faze.example/problems/"
log = structlog.get_logger("faze.errors")


class ProblemError(Exception):
    """Raise anywhere in a request. ``slug`` is the stable type, for example ``ballot-closed``."""

    def __init__(
        self,
        status: int,
        slug: str,
        title: str,
        detail: str | None = None,
        *,
        headers: dict[str, str] | None = None,
        **extra: Any,
    ) -> None:
        super().__init__(f"{slug}: {detail or title}")
        self.status = status
        self.slug = slug
        self.title = title
        self.detail = detail
        self.headers = headers or {}
        self.extra = extra


def problem_body(request: Request, status: int, slug: str, title: str, detail: str | None,
                 extra: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": PROBLEM_BASE + slug,
        "title": title,
        "status": status,
        "instance": getattr(request.state, "request_id", None),
    }
    if detail:
        body["detail"] = redact(detail)
    if extra:
        body.update(extra)
    return body


def problem_response(request: Request, exc: ProblemError) -> JSONResponse:
    return JSONResponse(
        problem_body(request, exc.status, exc.slug, exc.title, exc.detail, exc.extra),
        status_code=exc.status,
        media_type="application/problem+json",
        headers=exc.headers,
    )


def install_error_handling(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
        try:
            response = await call_next(request)
        except ProblemError as exc:  # raised from middleware-level dependencies
            response = problem_response(request, exc)
        response.headers["x-request-id"] = request_id
        return response

    @app.exception_handler(ProblemError)
    async def _problem(request: Request, exc: ProblemError) -> JSONResponse:
        level = log.error if exc.status >= 500 else log.info
        level("problem", slug=exc.slug, status=exc.status)
        return problem_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(part) for part in err["loc"] if part != "body"), "message": err["msg"]}
            for err in exc.errors()
        ]
        body = problem_body(request, 422, "validation-error", "Request validation failed", None, {"errors": errors})
        return JSONResponse(body, status_code=422, media_type="application/problem+json")

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        slug = {401: "unauthenticated", 403: "forbidden", 404: "not-found", 405: "method-not-allowed"}.get(
            exc.status_code, "http-error"
        )
        body = problem_body(request, exc.status_code, slug, str(exc.detail), None)
        return JSONResponse(body, status_code=exc.status_code, media_type="application/problem+json")

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled", error=redact(repr(exc)), exc_info=False)
        body = problem_body(request, 500, "internal-error", "Internal error", None)
        return JSONResponse(body, status_code=500, media_type="application/problem+json")
