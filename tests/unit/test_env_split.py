"""CC-2: a process gets only its own role's secrets."""
import importlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _settings_for(role: str) -> dict:
    code = ("import json,os;from faze_common.settings import Settings;s=Settings();"
            "print(json.dumps({k:bool(getattr(s,k)) for k in ['OWNER_DB_PASSWORD','ODYSSEY_DB_PASSWORD','LAB_DB_PASSWORD',"
            "'RELAY_DB_PASSWORD','WORKERS_DB_PASSWORD','COUNCIL_LINK_SECRET','LITELLM_MASTER_KEY']}))")
    env = {k: v for k, v in os.environ.items() if not k.endswith("_PASSWORD") and k not in {"LITELLM_MASTER_KEY", "COUNCIL_LINK_SECRET", "ENV_FILE"}}
    env.update(SERVICE_ROLE=role, PYTHONPATH=str(ROOT / "services" / "common"))
    import json
    return json.loads(subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True).stdout)


def test_each_role_sees_only_its_own_database_password():
    for role, key in {"odyssey": "ODYSSEY_DB_PASSWORD", "lab": "LAB_DB_PASSWORD", "relay": "RELAY_DB_PASSWORD",
                      "workers": "WORKERS_DB_PASSWORD"}.items():
        seen = _settings_for(role)
        assert seen[key], role
        assert [k for k in seen if k.endswith("_DB_PASSWORD") and seen[k]] == [key], (role, seen)


def test_no_role_but_owner_sees_owner_password():
    assert not _settings_for("odyssey")["OWNER_DB_PASSWORD"]
    assert _settings_for("owner")["OWNER_DB_PASSWORD"]


def test_no_secret_in_shared_env():
    text = (ROOT / "infra" / ".env").read_text()
    assert "PASSWORD" not in text and "SECRET" not in text
