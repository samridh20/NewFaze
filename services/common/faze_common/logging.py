"""Structured JSON logs with redaction applied to every field (NFR-1)."""

from __future__ import annotations

import logging
import sys

import structlog

from .redaction import redact_value, register_env_secrets


def _redact_processor(_logger, _method, event_dict):  # type: ignore[no-untyped-def]
    return redact_value(event_dict)


def configure_logging(level: str = "INFO") -> None:
    register_env_secrets()
    logging.basicConfig(stream=sys.stdout, level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            _redact_processor,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
