"""Process runner (CC-4): starts every local service with only its own role's env files (CC-2).
    python scripts/dev.py            # foreground; Ctrl-C stops everything
"""
from __future__ import annotations
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = str(ROOT / ".venv" / "bin" / "python")
LIB = ":".join(str(ROOT / "services" / d) for d in ("common", "dev-auth", "odyssey-api", "signal-lab-api", "workers",
                                                      "scrim-runner", "fixture-gateway"))
SERVICES = [  # name, role, command
    ("dev-auth", "", ["-m", "uvicorn", "dev_auth.main:app", "--port", "8003"]),
    ("fixture-gateway", "", ["-m", "uvicorn", "fixture_gateway.main:app", "--port", "4010"]),
    ("odyssey-public", "odyssey", ["-m", "uvicorn", "odyssey_api.public:app", "--port", "8001"]),
    ("odyssey-internal", "odyssey", ["-m", "uvicorn", "odyssey_api.internal:app", "--host", "127.0.0.1", "--port", "8011"]),
    ("signal-lab-api", "lab", ["-m", "uvicorn", "signal_lab_api.main:app", "--port", "8002"]),
    ("relay", "relay", ["-m", "workers.relay"]),
    ("janitor", "workers", ["-m", "workers.janitor"]),
    ("odyssey-web", "", ["NPM", "run", "dev", "-w", "odyssey-web"]),
    ("signal-lab-web", "", ["NPM", "run", "dev", "-w", "signal-lab-web"]),
]


def main() -> int:
    procs = []
    for name, role, args in SERVICES:
        env = {k: v for k, v in os.environ.items() if not k.endswith("_PASSWORD") and "SECRET" not in k}
        for line in (ROOT / "infra" / ".env").read_text().splitlines():  # non-secret shared settings only
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env.setdefault(key.strip(), value.strip())
        env.update(PYTHONPATH=LIB, SERVICE_ROLE=role)
        cmd = ["npm", *args[1:]] if args[0] == "NPM" else [PY, *args]
        procs.append((name, subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=open(ROOT / ".local" / f"{name}.log", "w"),
                                             stderr=subprocess.STDOUT)))
        print("started", name)
    def stop(*_):
        for _, p in procs:
            p.terminate()
        sys.exit(0)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    while True:
        for name, p in procs:
            if p.poll() is not None:
                print(name, "exited with", p.returncode, "(see .local logs)")
                stop()
        time.sleep(1)


if __name__ == "__main__":
    (ROOT / ".local").mkdir(exist_ok=True)
    sys.exit(main())
