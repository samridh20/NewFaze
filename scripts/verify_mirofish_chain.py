"""Live MiroFish chain verifier (FR-18.10). Steps 1 to 7 against the real services; evidence in .local/evidence.
Spends real tokens through the budgeted MiroFish virtual key (rounds capped). Needs CONFIRM_LIVE=1 via make.
No fixtures, no mocks. A step that fails is reported as failed and later steps are skipped.
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from secretsafe import ROOT, load_env, redact

BACKEND = "http://127.0.0.1:5001"
GATEWAY = "http://127.0.0.1:4000"
EVIDENCE = ROOT / ".local" / "evidence" / "mirofish-chain.json"
UA = {"User-Agent": "faze-odyssey-verifier/1.0"}
results: list[dict] = []


def http(method: str, url: str, body=None, headers=None, timeout=120, raw: bytes | None = None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {**UA, **(headers or {})}
    if body is not None:
        h["content-type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:  # noqa: BLE001
            return e.code, {}


def record(step: int, name: str, ok: bool, evidence: dict) -> bool:
    results.append({"step": step, "name": name, "ok": ok, "evidence": evidence})
    print(f"step {step} {name}: {'PASS' if ok else 'FAIL'} {json.dumps(evidence)[:300]}")
    EVIDENCE.write_text(json.dumps(results, indent=2))
    return ok


def multipart(fields: dict[str, str], filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{filename}"\r\n'
                 f'Content-Type: text/markdown\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def poll(fn, done, timeout_s: int, every: int = 5):
    end = time.time() + timeout_s
    last = {}
    while time.time() < end:
        last = fn()
        if done(last):
            return True, last
        time.sleep(every)
    return False, last


def main() -> int:
    zep = load_env(ROOT / "infra" / ".env.mirofish").get("ZEP_API_KEY", "")
    vkey = (ROOT / ".local" / "secrets" / "mirofish-virtual-key").read_text().strip()
    # 1 Zep auth + graph access
    req = urllib.request.Request("https://api.getzep.com/api/v2/graph/list-all?pageSize=1", headers={**UA, "Authorization": f"Api-Key {zep}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if not record(1, "zep-auth", r.status == 200, {"http": r.status}):
                return 1
    except Exception as e:  # noqa: BLE001
        record(1, "zep-auth", False, {"error": redact(repr(e), [zep])[:150]})
        return 1
    # 2 Gemini via LiteLLM using the MiroFish virtual key
    s, d = http("POST", f"{GATEWAY}/v1/chat/completions",
                {"model": "analyst", "messages": [{"role": "user", "content": "Reply: ok"}], "max_tokens": 8},
                {"Authorization": f"Bearer {vkey}"})
    if not record(2, "gemini-via-litellm", s == 200, {"http": s, "usage": d.get("usage", {}).get("total_tokens")}):
        return 1
    s, d = http("GET", f"{BACKEND}/health")
    if not record(0, "mirofish-ready", s == 200 and d.get("status") == "ok", {"http": s}):
        return 1
    # 3 project creation (ontology generation calls the LLM)
    body, ctype = multipart({"simulation_requirement": "Predict how the fan community splits between Clip A and Clip B.",
                             "project_name": "faze-odyssey-chain"}, "pack.md",
                            (ROOT / "seeds" / "mirofish" / "pack.md").read_bytes())
    s, d = http("POST", f"{BACKEND}/api/graph/ontology/generate", headers={"content-type": ctype}, raw=body, timeout=300)
    project_id = (d.get("data") or {}).get("project_id")
    if not record(3, "project-created", s == 200 and bool(project_id), {"http": s, "project_id": project_id,
                                                                       "error": str(d.get("error", ""))[:150]}):
        return 1
    # 4 graph build
    s, d = http("POST", f"{BACKEND}/api/graph/build", {"project_id": project_id}, timeout=60)
    task_id = (d.get("data") or {}).get("task_id")
    if s != 200 or not task_id:
        return 1 if not record(4, "graph-build-start", False, {"http": s, "error": str(d.get("error", ""))[:150]}) else 0
    ok, last = poll(lambda: http("GET", f"{BACKEND}/api/graph/task/{task_id}")[1].get("data", {}),
                    lambda t: t.get("status") in {"completed", "failed"}, 600)
    graph_id = (last.get("result") or {}).get("graph_id")
    if not record(4, "graph-built", last.get("status") == "completed" and bool(graph_id),
                  {"status": last.get("status"), "graph_id": graph_id, "message": str(last.get("message", ""))[:150]}):
        return 1
    s, g = http("GET", f"{BACKEND}/api/graph/data/{graph_id}")
    results[-1]["evidence"].update(nodes=(g.get("data") or {}).get("node_count"), edges=(g.get("data") or {}).get("edge_count"))
    # 5 simulation create + prepare + start
    s, d = http("POST", f"{BACKEND}/api/simulation/create", {"project_id": project_id, "graph_id": graph_id,
                                                              "enable_twitter": False, "enable_reddit": True})
    sim_id = (d.get("data") or {}).get("simulation_id")
    if not sim_id:
        record(5, "simulation-created", False, {"http": s, "error": str(d.get("error", ""))[:150]})
        return 1
    s, d = http("POST", f"{BACKEND}/api/simulation/prepare", {"simulation_id": sim_id, "use_llm_for_profiles": True,
                                                                "parallel_profile_count": 3})
    ptask = (d.get("data") or {}).get("task_id")
    ok, last = poll(lambda: http("POST", f"{BACKEND}/api/simulation/prepare/status",
                                 {"task_id": ptask, "simulation_id": sim_id})[1].get("data", {}),
                    lambda t: t.get("status") in {"completed", "ready", "failed"} or t.get("already_prepared"), 900)
    prepared = last.get("status") in {"completed", "ready"} or bool(last.get("already_prepared"))
    if not record(5, "simulation-prepared", prepared, {"simulation_id": sim_id, "status": last.get("status"),
                                                       "message": str(last.get("message", ""))[:150]}):
        return 1
    s, d = http("POST", f"{BACKEND}/api/simulation/start", {"simulation_id": sim_id, "platform": "reddit",
                                                              "max_rounds": 2, "force": True})
    # 6 active simulation
    ok, last = poll(lambda: http("GET", f"{BACKEND}/api/simulation/{sim_id}/run-status")[1].get("data", {}),
                    lambda t: t.get("runner_status") in {"running", "completed", "failed"} and (t.get("total_actions_count") or 0) > 0
                    or t.get("runner_status") in {"completed", "failed"}, 600)
    s2, actions = http("GET", f"{BACKEND}/api/simulation/{sim_id}/actions?limit=5")
    n_actions = len((actions.get("data") or {}).get("actions", [])) if isinstance(actions.get("data"), dict) else len(actions.get("data") or [])
    if not record(6, "simulation-active", last.get("runner_status") in {"running", "completed"},
                  {"runner_status": last.get("runner_status"), "round": last.get("current_round"),
                   "actions_sample": n_actions, "total_actions": last.get("total_actions_count")}):
        return 1
    # 7 live agent chat (needs the simulation environment alive)
    ok, env = poll(lambda: http("POST", f"{BACKEND}/api/simulation/env-status", {"simulation_id": sim_id})[1].get("data", {}),
                   lambda t: bool(t.get("env_alive")), 300, every=10)
    s, d = http("POST", f"{BACKEND}/api/simulation/interview",
                {"simulation_id": sim_id, "agent_id": 0, "prompt": "In one sentence: which clip do you favour and why?",
                 "platform": "reddit", "timeout": 120}, timeout=180)
    reply = json.dumps((d.get("data") or {}).get("result", ""))
    record(7, "agent-chat", s == 200 and d.get("success") is True and len(reply) > 10,
           {"http": s, "env_alive": env.get("env_alive"), "reply_chars": len(reply), "reply_preview": redact(reply, [vkey, zep])[:160],
            "error": str(d.get("error", ""))[:150]})
    print("chain:", "ALL PASS" if all(r["ok"] for r in results) else "INCOMPLETE")
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
