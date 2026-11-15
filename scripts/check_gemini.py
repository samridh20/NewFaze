"""Confirm the supplied Gemini key can see and use the two models we plan to route.

Cost: models.get and countTokens are free. With --generate, one request per model
asks for at most 8 output tokens with reasoning disabled. The key is read from
infra/.env.llm and sent only in the x-goog-api-key header to Google. Nothing
secret is ever printed.

    python3 scripts/check_gemini.py             # free checks only
    python3 scripts/check_gemini.py --generate  # plus one tiny generation per model
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from secretsafe import ROOT, ledger_append, load_env, redact

BASE = "https://generativelanguage.googleapis.com/v1beta"
MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
TIMEOUT = 30


def call(key: str, method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("x-goog-api-key", key)
    if data is not None:
        request.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read() or b"{}")
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload


def list_models(key: str) -> int:
    """Free: print generative models visible to the key (name, limits). No key output."""
    names: list[str] = []
    token = ""
    while True:
        url = f"{BASE}/models?pageSize=200" + (f"&pageToken={token}" if token else "")
        status, page = call(key, "GET", url)
        if status != 200:
            print("models.list HTTP", status, redact(str(page.get("error", {}).get("message", "")), [key])[:200])
            return 1
        for item in page.get("models", []):
            if "generateContent" in item.get("supportedGenerationMethods", []) and "gemini" in item["name"]:
                names.append(f"{item['name'].removeprefix('models/')}  (in={item.get('inputTokenLimit')}, out={item.get('outputTokenLimit')})")
        token = page.get("nextPageToken", "")
        if not token:
            break
    print(f"{len(names)} generative gemini models listed for this key:")
    for line in sorted(names):
        print("  ", line)
    return 0


def main() -> int:
    generate = "--generate" in sys.argv
    key = load_env(ROOT / "infra" / ".env.llm").get("GEMINI_API_KEY", "")
    if not key:
        print("GEMINI_API_KEY missing from infra/.env.llm")
        return 2
    if "--list" in sys.argv:
        return list_models(key)
    models = MODELS
    for arg in sys.argv[1:]:
        if arg.startswith("--models="):
            models = [m for m in arg.split("=", 1)[1].split(",") if m]
    failed = False
    for model in models:
        status, meta = call(key, "GET", f"{BASE}/models/{model}")
        if status != 200:
            message = redact(str(meta.get("error", {}).get("message", "")), [key])[:200]
            print(f"{model}: models.get HTTP {status} {message}")
            failed = True
            continue
        methods = ",".join(meta.get("supportedGenerationMethods", []))
        print(f"{model}: available | in_limit={meta.get('inputTokenLimit')} out_limit={meta.get('outputTokenLimit')} | methods={methods}")

        # countTokens is informational: routing needs generation, not token counting.
        status, counted = call(key, "POST", f"{BASE}/models/{model}:countTokens",
                               {"contents": [{"parts": [{"text": "ping"}]}]})
        note = "" if status == 200 else " " + redact(str(counted.get("error", {}).get("message", "")), [key])[:160]
        print(f"{model}: countTokens HTTP {status} totalTokens={counted.get('totalTokens')}{note} (informational)")

        if generate:
            body = {
                "contents": [{"parts": [{"text": "Reply with the single word: ok"}]}],
                "generationConfig": {"maxOutputTokens": 8, "temperature": 0,
                                     "thinkingConfig": {"thinkingBudget": 0}},
            }
            status, result = call(key, "POST", f"{BASE}/models/{model}:generateContent", body)
            usage = result.get("usageMetadata", {})
            if status == 200:
                prompt = int(usage.get("promptTokenCount", 0))
                output = int(usage.get("candidatesTokenCount", 0)) + int(usage.get("thoughtsTokenCount", 0))
                ledger_append("gemini-preflight", model, prompt, output, "availability check")
                print(f"{model}: generateContent HTTP 200 prompt={prompt} output={output}")
            else:
                message = redact(str(result.get("error", {}).get("message", "")), [key])[:200]
                print(f"{model}: generateContent HTTP {status} {message}")
                failed = True
    print("RESULT:", "FAILED" if failed else "both models available to the key")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - last-resort redaction
        print("error:", redact(repr(error)))
        sys.exit(1)
