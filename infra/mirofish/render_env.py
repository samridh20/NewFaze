"""Render infra/mirofish/.env.runtime for the MiroFish container (FR-18.3, FR-18.4).

Inputs, all gitignored and mode 600:
  infra/.env.mirofish                   ZEP_API_KEY (the user's Zep Cloud key)
  .local/secrets/mirofish-virtual-key   a LiteLLM virtual key made for MiroFish (provision_key.py)

MiroFish never receives the master key or the Gemini key. Nothing secret is printed.

    python infra/mirofish/render_env.py [--placeholder-llm-key]

--placeholder-llm-key writes a non-working LLM key so the container can start and be health-checked before the
router has models. Any call that needs the LLM then fails honestly. It is never used to claim a live result.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from secretsafe import load_env  # noqa: E402

OUT = ROOT / "infra" / "mirofish" / ".env.runtime"
KEY_FILE = ROOT / ".local" / "secrets" / "mirofish-virtual-key"


def main() -> int:
    zep = load_env(ROOT / "infra" / ".env.mirofish").get("ZEP_API_KEY", "")
    if not zep:
        print("ZEP_API_KEY missing from infra/.env.mirofish")
        return 2
    if "--placeholder-llm-key" in sys.argv:
        llm_key = "sk-placeholder-not-a-real-key"
        print("using a PLACEHOLDER LLM key: LLM calls will fail until a real virtual key is provisioned")
    elif KEY_FILE.exists():
        llm_key = KEY_FILE.read_text().strip()
    else:
        print("no MiroFish virtual key yet. Run infra/mirofish/provision_key.py once the router is up.")
        return 3

    values = {
        "LLM_API_KEY": llm_key,
        "LLM_BASE_URL": "http://llm-gateway:4000/v1",
        "LLM_MODEL_NAME": "analyst",
        "ZEP_API_KEY": zep,
        "OASIS_DEFAULT_MAX_ROUNDS": "3",
        "REPORT_AGENT_MAX_TOOL_CALLS": "2",
        "REPORT_AGENT_MAX_REFLECTION_ROUNDS": "1",
        "FLASK_DEBUG": "false",
    }
    descriptor = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write("".join(f"{key}={value}\n" for key, value in values.items()))
    os.chmod(OUT, 0o600)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(values)} variables, mode 600)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
