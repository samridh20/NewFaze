"""Gemini preflight (CC-5, design 3.17): exactly one generateContent request per model.
Eight output tokens maximum, 120 s timeout, no retries, redacted output, every attempt in the token ledger.
The key is read from infra/.env.llm and sent only in the x-goog-api-key header. Needs CONFIRM_LIVE=1 via make.
    python3 scripts/check_gemini.py [--models=a,b]
"""
from __future__ import annotations
import json
import sys
import time
import urllib.error
import urllib.request

from secretsafe import ROOT, ledger_append, load_env, redact

BASE = "https://generativelanguage.googleapis.com/v1beta"
MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
TIMEOUT = 120


def one_request(key: str, model: str) -> tuple[str, int, dict]:
    """Returns (category, http_status, body). Never retries."""
    body = {"contents": [{"parts": [{"text": "Reply with the single word: ok"}]}],
            "generationConfig": {"maxOutputTokens": 8, "temperature": 0}}
    request = urllib.request.Request(f"{BASE}/models/{model}:generateContent", data=json.dumps(body).encode(),
                                     method="POST")
    request.add_header("x-goog-api-key", key)
    request.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return "ok", response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read() or b"{}")
        except json.JSONDecodeError:
            payload = {}
        category = {404: "unavailable", 429: "quota", 401: "auth", 403: "auth"}.get(error.code, f"http-{error.code}")
        return category, error.code, payload
    except TimeoutError:
        return "timeout", 0, {}
    except urllib.error.URLError as error:
        return ("timeout" if "timed out" in str(error.reason) else "network"), 0, {}


def main() -> int:
    key = load_env(ROOT / "infra" / ".env.llm").get("GEMINI_API_KEY", "")
    if not key:
        print("GEMINI_API_KEY missing from infra/.env.llm")
        return 2
    models = MODELS
    for arg in sys.argv[1:]:
        if arg.startswith("--models="):
            models = [m for m in arg.split("=", 1)[1].split(",") if m]
    failed = False
    for model in models:  # a timeout on one model does not stop the other
        started = time.time()
        category, status, payload = one_request(key, model)
        usage = payload.get("usageMetadata", {})
        prompt = int(usage.get("promptTokenCount", 0))
        thinking = int(usage.get("thoughtsTokenCount", 0))
        output = int(usage.get("candidatesTokenCount", 0))
        ledger_append("gemini-preflight", model, prompt, output + thinking, "one request, max 8 output tokens",
                      status=category, thinking_tokens=thinking)
        elapsed = time.time() - started
        message = redact(str(payload.get("error", {}).get("message", "")), [key])[:160]
        print(f"{model}: {category} http={status} prompt={prompt} output={output} thinking={thinking} "
              f"{elapsed:.1f}s {message}")
        failed |= category != "ok"
    print("RESULT:", "FAILED" if failed else "both models generated")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print("error:", redact(repr(error)))
        sys.exit(1)
