# Progress notes (no secrets in this file)

Pipeline run `2026-11-14_22-43-35`. Update this file after every milestone so work can resume.

## Decisions in force
- D-1 native PostgreSQL 16 + Redis (Homebrew), pgvector 0.8.x built from source against PG16.
- D-2 Playwright on installed Google Chrome (`chrome` channel).
- D-3 MiroFish MUST run live in Docker. No fixtures, NetworkX stand-ins or mocks. Recorded output is allowed only as a clearly labeled emergency backup, and never counts as verification.
- D-4/D-6 LLM = Google Gemini Developer API key. `gemini-2.5-flash` for MiroFish, `analyst`, `judge`. `gemini-2.5-flash-lite` for bot turns. Verify both models are available to the key BEFORE configuring LiteLLM. MiroFish gets a dedicated budgeted LiteLLM virtual key.
- D-5 Zep Cloud key supplied. Stored only in `infra/.env.mirofish` (mode 600, gitignored).
- D-7 Docker ceiling: 4 CPUs, 8 GB RAM, 30 GB disk. Do not exceed without asking.
- D-8 Colima + Homebrew `docker` + `docker-compose` authorized. No Docker Desktop or OrbStack.
- Live verification chain (all must hit real services): 1 Zep auth and graph access, 2 Gemini via LiteLLM, 3 MiroFish project creation, 4 graph construction, 5 simulation preparation and start, 6 active OASIS simulation, 7 live chat message to a simulated returning fan, 8 real live reply shown in the stage flow.
- Report success only if the real services were exercised.

## Secrets handling
- `infra/.env.llm` holds GEMINI_API_KEY (mode 600, gitignored). `infra/.env.mirofish` holds ZEP_API_KEY (mode 600, gitignored).
- Never print, echo, log or screenshot values. Verify by length/prefix/permissions only. Redact in all script output.

## Host facts
- macOS arm64, 12 CPUs, 36 GB RAM, 166 GB free disk. Nothing from the Docker/Postgres/Redis toolchain was installed at start.
- Python 3.13.5 and 3.14.4 on PATH, uv 0.11.7 (can install 3.11). Node 24.10, npm 11.6. ffmpeg present. Chrome present.
- MiroFish v0.1.2 = commit 985f89f49a, AGPL-3.0, ports 3000/5001, needs LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_NAME, ZEP_API_KEY.

## Findings that block or shape work
- BLOCKER Q-9: `gemini-2.5-flash` and `gemini-2.5-flash-lite` are listed for the key (models.get 200) but generateContent returns 404 "no longer available to new users". API names `gemini-3.8-flash` and `gemini-3.5-flash-lite` as successors. NOT configured in LiteLLM. Waiting for the user's decision. (A call to list models was declined, so no more calls with the Gemini key until asked.)
- Zep Cloud: key accepted. /projects/info 200, /graph/list-all 200 (project already has 1 graph that is not ours; leave it alone). Note: api.getzep.com sits behind Cloudflare, which blocks the default Python urllib user agent (error 1010), so send a normal User-Agent.
- MiroFish v0.1.2 Dockerfile: `FROM python:3.11`, apt nodejs+npm, uv 0.9.26, `npm ci`, `uv sync --frozen`, EXPOSE 3000 5001, CMD `npm run dev` (one container runs both). Compose file and .env.example at the tag were not read (declined). The clone into infra/mirofish/checkout was also declined, so it has not been done.
- Several tool calls were declined by the user (clone, log read, model listing). Ask before repeating them.

## Checkpoint (end of this session segment)
DONE and verified (150 tests green, `uv run --no-sync pytest tests -q`):
- P0 scaffold, P1 PG16 + pgvector 0.8.7 + Redis, P2 migrations (4 schemas up/down/up verified), P3 common lib + dev-auth,
  P4 Odyssey API (public :8001 + internal :8011) with vote/close/publish/idempotency/rate-limit/state guards/SSE/council.
- Tests: 10 contended vote-vs-close races (mixed accepted/refused verified, tally == vote table), 2 deterministic
  lock-ordering tests, publish race (1 episode, 1 event), 20 same-key concurrent requests (1 effect), full state-pair matrices in SQL,
  internal-route auth matrix, expired/forged/alg=none tokens, rate limits incl. fail-closed 503.
- Gotchas learned: macOS marks uv's editable .pth files "hidden" and Python skips them -> run `make fix-pth` (chflags nohidden) after every `uv sync`.
  Cloudflare blocks Python's default urllib User-Agent on api.getzep.com. asyncpg text cannot contain NUL.
NOT DONE: P5 workers, P6 fixture gateway + scrim runner (+ OASIS driver proof), P7 Signal Lab API, P8 seeds + ffmpeg media,
  P9 web apps + packages, P10 LiteLLM config + compose, P11 MiroFish wrapper + chain verify, P12 Playwright, P13 gates/report.
BLOCKED on user: Q-9 (Gemini 2.5 models return 404 on generation). Needed for chain steps 2-8, router smoke, budget check.

## Checkpoint 2 (infra, not yet a live verification)
Running right now in Colima (stop with `docker compose -f infra/mirofish/compose.yml down` and `docker compose -f infra/docker-compose.yml down`):
- faze-postgres-1 (healthy, litellm DB + role exist, no host port), faze-redis-1 (healthy)
- faze-llm-gateway-1 CREATED BUT NOT STARTED on purpose: its config reads model IDs from the environment and Q-9 is unresolved.
- faze-mirofish-mirofish-1 STARTED with a PLACEHOLDER LLM key (`render_env.py --placeholder-llm-key`) so only boot/health can be checked.
  Its /health and the isolation check (cannot reach postgres/redis) were attempted but the commands were declined, so they are NOT confirmed.
Built: image faze/mirofish:v0.1.2-985f89f (pinned commit 985f89f49acbb44ee14d9d680682c741a44eeebe), total docker images 3.6 GB.
Digests pinned in infra/docker-compose.yml: pgvector/pgvector:pg16, redis:7, ghcr.io/berriai/litellm v1.83.14-stable.
Files added: infra/litellm/config.yaml (env-driven model IDs, thinking off, explicit costs), infra/mirofish/{compose.yml,render_env.py,provision_key.py},
  services/common/faze_common/litellm_admin.py, config/live-budgets.json, scripts/{check_gemini,check_zep,gen_env,local_db.sh,secretsafe}.
Chain status: step 1 (Zep auth + graph list) VERIFIED LIVE. Steps 2-8 NOT RUN. Nothing may be reported as live-verified beyond step 1.
Next when unblocked: (1) confirm MiroFish /health + isolation, (2) Q-9 -> set GEMINI_*_MODEL in infra/.env.llm via the check script,
  start llm-gateway, (3) provision_key.py -> render_env.py -> restart mirofish, (4) write scripts/verify_mirofish_chain.py and run steps 2-7,
  (5) Signal Lab MiroFish panel + Playwright for step 8.

## Status
- [x] .gitignore env rules appended (original line kept)
- [x] Keys saved to gitignored mode-600 files
- [x] Gemini availability check ran: models visible, generation 404 (see Q-9)
- [x] Zep Cloud auth + graph access verified live (chain step 1)
- [x] Requirements doc updated to revision 3
- [x] Installed via brew: colima 0.10.3, docker 29.9.3, docker-compose 5.7.1, postgresql@16 16.16, redis 8.10.3. Compose plugin symlinked at ~/.docker/cli-plugins.
- [x] Colima running at exactly 4 CPU / 8 GiB / 30 GiB (docker info confirmed), Compose 5.7.1 works
- [x] MiroFish v0.1.2 cloned to infra/mirofish/checkout (gitignored), commit 985f89f49acbb44ee14d9d680682c741a44eeebe
- [x] 02-design.md written (with self-review), 03-plan.md written
- [ ] pgvector 0.8.x build against PG16 (P1, not started)

## MiroFish API facts (read from the pinned checkout)
- Backend :5001, /health -> {"status":"ok"}. Blueprints /api/graph, /api/simulation, /api/report. Frontend :3000.
- Graph: POST /api/graph/ontology/generate (upload + create project), POST /api/graph/build, GET /api/graph/task/<id>, GET /api/graph/data/<graph_id>.
- Simulation: POST /create, /prepare (+ /prepare/status), /start (platform twitter|reddit|parallel, max_rounds, force), GET /<id>/run-status, /actions, POST /interview (needs env alive in wait-for-command mode after the loop), /env-status, /close-env.
- Config env: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_NAME, ZEP_API_KEY, OASIS_DEFAULT_MAX_ROUNDS, REPORT_AGENT_MAX_TOOL_CALLS. LLM via plain OpenAI SDK, max_tokens up to 4096, json_object mode.
- Compose in checkout uses ghcr.io/666ghj/mirofish:latest (moving tag): we build from the pinned checkout instead.
- [ ] Design doc (02-design.md)
- [ ] Implementation plan (03-plan.md)
- [ ] LiteLLM router up with budgeted keys
- [ ] MiroFish live chain 1..7
- [ ] App slice (APIs, workers, web apps, seeds)
- [ ] Stage flow incl. step 8 and Playwright
