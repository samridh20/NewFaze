"""Create MiroFish's dedicated, budgeted LiteLLM virtual key (FR-18.3, D-6). Needs the router up.

Reads the master key from infra/.env.lab and the ceilings from config/live-budgets.json. The new key is written
only to .local/secrets/mirofish-virtual-key (mode 600). Nothing secret is printed.

    python infra/mirofish/provision_key.py [--rotate]
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "services" / "common"))

from secretsafe import load_env, redact  # noqa: E402

from faze_common.litellm_admin import LiteLLMAdmin, LiteLLMError  # noqa: E402

KEY_FILE = ROOT / ".local" / "secrets" / "mirofish-virtual-key"


async def main() -> int:
    master = load_env(ROOT / "infra" / ".env.lab").get("LITELLM_MASTER_KEY", "")
    budget = json.loads((ROOT / "config" / "live-budgets.json").read_text())["mirofish"]
    admin = LiteLLMAdmin("http://127.0.0.1:4000", master)
    if not await admin.health():
        print("router not reachable on 127.0.0.1:4000. Start it first (it needs model IDs, Q-9).")
        return 2
    if KEY_FILE.exists() and "--rotate" not in sys.argv:
        print("a MiroFish virtual key already exists. Use --rotate to replace it.")
        return 0
    if KEY_FILE.exists():
        try:
            await admin.delete_key(KEY_FILE.read_text().strip())
        except LiteLLMError as exc:
            print("could not delete the old key:", redact(str(exc), [master]))
    try:
        key = await admin.generate_key(
            models=budget["models"], max_budget=budget["max_budget_usd"], alias="mirofish",
            rpm_limit=budget["rpm_limit"], tpm_limit=budget["tpm_limit"], metadata={"purpose": "mirofish"})
    except LiteLLMError as exc:
        print("key creation failed:", redact(str(exc), [master]))
        return 1
    KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(key)
    os.chmod(KEY_FILE, 0o600)
    print(f"created key alias 'mirofish' (models={budget['models']}, max_budget=${budget['max_budget_usd']}, "
          f"rpm={budget['rpm_limit']}, tpm={budget['tpm_limit']}); stored in {KEY_FILE.relative_to(ROOT)}, mode 600")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
