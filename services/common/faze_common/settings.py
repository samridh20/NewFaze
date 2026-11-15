"""Settings from infra/.env (or the path in ENV_FILE) plus the process environment."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]
ENV_FILES = tuple(
    str(p) for p in (ROOT / "infra" / ".env", ROOT / "infra" / ".env.lab") if p.exists()
) if not os.environ.get("ENV_FILE") else tuple(os.environ["ENV_FILE"].split(os.pathsep))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILES or None, extra="ignore", case_sensitive=True)

    APP_ENV: str = "local"
    DEMO_MODE: bool = False

    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 5432
    DATABASE_NAME: str = "faze"
    OWNER_DB_PASSWORD: str = ""
    ODYSSEY_DB_PASSWORD: str = ""
    LAB_DB_PASSWORD: str = ""
    RELAY_DB_PASSWORD: str = ""
    WORKERS_DB_PASSWORD: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"

    SUPABASE_URL: str = ""
    SUPABASE_JWKS_URL: str = "http://localhost:8003/.well-known/jwks.json"
    JWT_ISSUER: str = "http://localhost:8003"
    JWT_AUDIENCE: str = "faze"
    DEV_AUTH_URL: str = "http://localhost:8003"

    ODYSSEY_INTERNAL_TOKEN_SECRET: str = ""
    IP_HASH_SECRET: str = ""
    COUNCIL_LINK_SECRET: str = ""
    TRUSTED_PROXIES: str = ""

    ODYSSEY_PUBLIC_URL: str = "http://localhost:8001"
    ODYSSEY_WEB_URL: str = "http://localhost:3001"
    SIGNAL_LAB_WEB_URL: str = "http://localhost:3002"
    ODYSSEY_INTERNAL_URL: str = "http://127.0.0.1:8011"
    SIGNAL_LAB_URL: str = "http://localhost:8002"

    LITELLM_URL: str = "http://localhost:4010/v1"
    LITELLM_MASTER_KEY: str = ""

    MUX_TOKEN_ID: str = ""
    MUX_TOKEN_SECRET: str = ""
    MUX_WEBHOOK_SECRET: str = ""

    # Rate limits (FR-6.6). Environment-tunable so concurrency tests can raise them.
    VOTE_ACCOUNT_CAPACITY: int = Field(default=5)
    VOTE_ACCOUNT_REFILL_PER_SEC: float = Field(default=1 / 6)
    VOTE_IP_CAPACITY: int = Field(default=60)
    VOTE_IP_REFILL_PER_SEC: float = Field(default=2.0)

    SSE_COUNTDOWN_SECONDS: int = 30
    SCRIM_MAX_BUDGET_USD: float = 2.0
    MIROFISH_BACKEND_URL: str = "http://localhost:5001"
    MIROFISH_FRONTEND_URL: str = "http://localhost:3000"

    def database_url(self, role: str) -> str:
        passwords = {
            "faze_owner": self.OWNER_DB_PASSWORD,
            "odyssey_app": self.ODYSSEY_DB_PASSWORD,
            "lab_app": self.LAB_DB_PASSWORD,
            "relay": self.RELAY_DB_PASSWORD,
            "workers_rw": self.WORKERS_DB_PASSWORD,
        }
        password = quote(passwords[role], safe="")
        return (
            f"postgresql+asyncpg://{role}:{password}@{self.DATABASE_HOST}:{self.DATABASE_PORT}"
            f"/{self.DATABASE_NAME}"
        )

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"prod", "production"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.DEMO_MODE and settings.is_production:
        raise RuntimeError("DEMO_MODE=1 is refused when APP_ENV is production (FR-21.1)")
    return settings
