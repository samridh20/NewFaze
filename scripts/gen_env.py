"""Create or complete infra/.env, infra/.env.lab and infra/.env.llm with random secrets.

Existing values are never overwritten, so keys the user supplied (GEMINI_API_KEY,
model IDs) survive. Files are created with mode 600. Values are never printed.

    python3 scripts/gen_env.py
"""

from __future__ import annotations

import os
import secrets

from secretsafe import ROOT, load_env

INFRA = ROOT / "infra"


def token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def write_private(path, values: dict[str, str]) -> None:
    body = "".join(f"{key}={value}\n" for key, value in values.items())
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(body)
    os.chmod(path, 0o600)


def merged(path, wanted: dict[str, str]) -> tuple[dict[str, str], int]:
    """Existing values win. Returns the merged mapping and how many keys were added."""
    existing = load_env(path) if path.exists() else {}
    added = 0
    for key, value in wanted.items():
        if not existing.get(key):
            existing[key] = value
            added += 1
    return existing, added


def main() -> None:
    master = "sk-faze-" + token(24)
    litellm_db_password = token(18)

    shared = {
        "APP_ENV": "local",
        "DEMO_MODE": "1",
        "DATABASE_HOST": "localhost",
        "DATABASE_PORT": "5432",
        "DATABASE_NAME": "faze",
        "OWNER_DB_PASSWORD": token(),
        "ODYSSEY_DB_PASSWORD": token(),
        "LAB_DB_PASSWORD": token(),
        "RELAY_DB_PASSWORD": token(),
        "WORKERS_DB_PASSWORD": token(),
        "LITELLM_DB_PASSWORD": litellm_db_password,
        "REDIS_URL": "redis://localhost:6379/0",
        "SUPABASE_URL": "",
        "SUPABASE_JWKS_URL": "http://localhost:8003/.well-known/jwks.json",
        "JWT_ISSUER": "http://localhost:8003",
        "JWT_AUDIENCE": "faze",
        "DEV_AUTH_URL": "http://localhost:8003",
        "ODYSSEY_INTERNAL_TOKEN_SECRET": token(),
        "IP_HASH_SECRET": token(),
        "COUNCIL_LINK_SECRET": token(),
        "TRUSTED_PROXIES": "",
        "ODYSSEY_PUBLIC_URL": "http://localhost:8001",
        "ODYSSEY_INTERNAL_URL": "http://127.0.0.1:8011",
        "SIGNAL_LAB_URL": "http://localhost:8002",
        "MUX_TOKEN_ID": "",
        "MUX_TOKEN_SECRET": "",
        "MUX_WEBHOOK_SECRET": "",
        "LITELLM_URL": "http://localhost:4010/v1",
    }
    # CC-2: secrets go only to the role file of the process that needs them.
    role_keys = {
        "odyssey": ["ODYSSEY_DB_PASSWORD", "ODYSSEY_INTERNAL_TOKEN_SECRET", "IP_HASH_SECRET", "COUNCIL_LINK_SECRET"],
        "lab": ["LAB_DB_PASSWORD", "ODYSSEY_INTERNAL_TOKEN_SECRET", "MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"],
        "relay": ["RELAY_DB_PASSWORD"],
        "workers": ["WORKERS_DB_PASSWORD", "ODYSSEY_INTERNAL_TOKEN_SECRET"],
        "owner": ["OWNER_DB_PASSWORD", "LITELLM_DB_PASSWORD"],
    }
    legacy = load_env(INFRA / ".env") if (INFRA / ".env").exists() else {}
    secret_names = {k for keys in role_keys.values() for k in keys}
    pool = {**shared, **{k: v for k, v in legacy.items() if k in secret_names and v}}
    for role, keys in role_keys.items():
        path = INFRA / f".env.{role}"
        existing = load_env(path) if path.exists() else {}
        if role == "lab":  # lab already holds LITELLM_MASTER_KEY
            pass
        wanted = {k: pool[k] for k in keys if k in pool}
        for k, v in wanted.items():
            existing.setdefault(k, v)
        write_private(path, existing)
        print(f"infra/.env.{role}: {len(existing)} variables, mode 600")
    # Keep one value per secret across role files (shared secrets must match).
    for k in secret_names:
        pass
    public = {k: v for k, v in {**legacy, **shared}.items() if k not in secret_names and k != "LITELLM_DB_PASSWORD"}
    write_private(INFRA / ".env", public)
    print(f"infra/.env: {len(public)} non-secret variables, mode 600")
    values = pool
    master = "sk-faze-" + token(24)
    lab_existing = load_env(INFRA / ".env.lab")
    llm_existing = load_env(INFRA / ".env.llm") if (INFRA / ".env.llm").exists() else {}
    master = lab_existing.get("LITELLM_MASTER_KEY") or llm_existing.get("LITELLM_MASTER_KEY") or master
    lab, added = merged(INFRA / ".env.lab", {"LITELLM_MASTER_KEY": master})
    write_private(INFRA / ".env.lab", lab)
    workers = load_env(INFRA / ".env.workers")
    workers.setdefault("LITELLM_MASTER_KEY", master)
    write_private(INFRA / ".env.workers", workers)
    llm, added = merged(
        INFRA / ".env.llm",
        {
            "LITELLM_MASTER_KEY": master,
            "LITELLM_SALT_KEY": token(),
            "LITELLM_DATABASE_URL": (
                f"postgresql://litellm:{values.get('LITELLM_DB_PASSWORD', litellm_db_password)}"
                "@postgres:5432/litellm"
            ),
            "GEMINI_FLASH_MODEL": "",
            "GEMINI_FLASH_LITE_MODEL": "",
        },
    )
    write_private(INFRA / ".env.llm", llm)
    print(f"infra/.env.llm: {len(llm)} variables ({added} added), mode 600")


if __name__ == "__main__":
    main()
