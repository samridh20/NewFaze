"""Run the four per-schema Alembic environments in order.

    python infra/migrations/run.py upgrade     # odyssey, lab, lore, wh
    python infra/migrations/run.py downgrade   # wh, lore, lab, odyssey (back to base)
    python infra/migrations/run.py current

Connects as the owner role from infra/.env. Never prints the password.
"""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

from alembic import command
from alembic.config import Config

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ORDER = ["odyssey", "lab", "lore", "wh"]


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def owner_url() -> str:
    import os

    env = {**load_env(ROOT / "infra" / ".env"), **load_env(ROOT / "infra" / ".env.owner")}
    password = quote(env["OWNER_DB_PASSWORD"], safe="")
    # DATABASE_NAME in the process environment wins, so pytest can migrate faze_test instead of the demo database.
    name = os.environ.get("DATABASE_NAME") or env.get("DATABASE_NAME", "faze")
    return (
        f"postgresql+psycopg://faze_owner:{password}"
        f"@{env.get('DATABASE_HOST', 'localhost')}:{env.get('DATABASE_PORT', '5432')}/{name}"
    )


def config_for(schema: str, url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(HERE / "_alembic"))
    config.set_main_option("version_locations", str(HERE / schema / "versions"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    config.set_main_option("version_table", f"alembic_version_{schema}")
    return config


def main(argv: list[str]) -> int:
    action = argv[1] if len(argv) > 1 else "upgrade"
    url = owner_url()
    if action == "upgrade":
        for schema in ORDER:
            command.upgrade(config_for(schema, url), "head")
            print(f"{schema}: at head")
    elif action == "downgrade":
        for schema in reversed(ORDER):
            command.downgrade(config_for(schema, url), "base")
            print(f"{schema}: at base")
    elif action == "current":
        for schema in ORDER:
            print(f"-- {schema}")
            command.current(config_for(schema, url))
    else:
        print("usage: run.py upgrade|downgrade|current")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
