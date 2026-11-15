"""Live check, step 1 of the MiroFish chain: Zep Cloud authentication and graph access.

Read-only: no episodes are ingested, so nothing counts against the free quota.
The key is read from infra/.env.mirofish and sent only in the Authorization
header to api.getzep.com. Nothing secret is printed; all output is redacted.

    python3 scripts/check_zep.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from secretsafe import ROOT, load_env, redact

BASE = "https://api.getzep.com/api/v2"
TIMEOUT = 30
# Tried in order. The first one that answers 200 proves authentication and read access.
PROBES = [
    ("project info", "/projects/info"),
    ("graph list", "/graph/list-all?pageNumber=1&pageSize=5"),
    ("user list", "/users-ordered?pageNumber=1&pageSize=5"),
]


def get(key: str, path: str) -> tuple[int, object]:
    request = urllib.request.Request(BASE + path, method="GET")
    request.add_header("Authorization", f"Api-Key {key}")
    request.add_header("Accept", "application/json")
    # Cloudflare in front of api.getzep.com blocks Python's default urllib user agent (error 1010).
    request.add_header("User-Agent", "faze-odyssey-dev-check/1.0 (+local)")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        body = error.read() or b""
        try:
            return error.code, json.loads(body)
        except json.JSONDecodeError:
            return error.code, {"raw": body[:120].decode("utf-8", "replace")}


def summarize(payload: object) -> str:
    """Describe the response shape without echoing identifiers or free text."""
    if isinstance(payload, dict):
        parts = []
        for name, value in payload.items():
            if isinstance(value, list):
                parts.append(f"{name}=[{len(value)} items]")
            elif isinstance(value, (int, float, bool)) or value is None:
                parts.append(f"{name}={value}")
            else:
                parts.append(f"{name}=<{type(value).__name__}>")
        return ", ".join(parts[:8])
    return type(payload).__name__


def main() -> int:
    key = load_env(ROOT / "infra" / ".env.mirofish").get("ZEP_API_KEY", "")
    if not key:
        print("ZEP_API_KEY missing from infra/.env.mirofish")
        return 2
    authenticated = False
    graph_access = False
    for label, path in PROBES:
        status, payload = get(key, path)
        detail = summarize(payload) if status == 200 else redact(json.dumps(payload)[:160], [key])
        print(f"{label}: GET {path.split('?')[0]} -> HTTP {status} | {detail}")
        if status == 403 and "cloudflare" in json.dumps(payload).lower():
            print("RESULT: blocked at Cloudflare's edge before reaching Zep; the key was not evaluated")
            return 3
        if status in (401, 403):
            print("RESULT: Zep Cloud rejected the key")
            return 1
        if status == 200:
            authenticated = True
            graph_access |= label == "graph list"
    print(f"authenticated={authenticated} graph_access={graph_access}")
    print("RESULT:", "PASS (authenticated and graph endpoint readable)" if authenticated and graph_access
          else "INCOMPLETE (authentication or graph access not confirmed)")
    return 0 if authenticated and graph_access else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - last-resort redaction
        print("error:", redact(repr(error)))
        sys.exit(1)
