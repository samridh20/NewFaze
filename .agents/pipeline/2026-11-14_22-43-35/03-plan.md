# 03 · Implementation plan

Order follows risk (App. A: synced replay and vote integrity first) and keeps the mandatory live MiroFish chain on its own track so an outside blocker (Q-9) never stalls the rest. Each step ends with a check that must pass before the next one starts. `make` targets are the only commands in the final report.

| # | Step | Check that proves it |
| --- | --- | --- |
| P0 | Scaffold: root `Makefile`, uv workspace (`pyproject.toml`), npm workspace (`package.json`), `*.example` env templates, `common` package | `uv sync` and `npm install` succeed; `git status` shows no secret file |
| P1 | Local data stores: build pgvector 0.8.x against `postgresql@16`; start PostgreSQL 16 and Redis with Homebrew services; create databases and role passwords from the environment | `psql -c "create extension vector"` works; `redis-cli ping` returns PONG |
| P2 | Migrations for `odyssey`, `lab`, `lore`, `wh`; roles and grants; transition and freeze triggers | up, down to base, up again; grants test (AC-3, AC-4); trigger test (AC-20 SQL half) |
| P3 | `common`: auth, RFC 9457 errors, state tables, idempotency, rate limit, quoting, redaction; `dev-auth` service | Unit tests; token accept and reject matrix (AC-5) |
| P4 | Odyssey API: domain functions, public and internal apps, SSE, outbox writer | Vote, close, publish, idempotency, state and rate-limit integration tests (AC-10 to AC-22); concurrency tests ten runs (AC-14, AC-16) |
| P5 | Workers: outbox relay, outcome freeze, calibration refit, key janitor | AC-36 to AC-39 |
| P6 | Fixture gateway; scrim-runner with sequential OASIS driver, record and replay, paired summary | Determinism test (AC-27, AC-28, AC-29, AC-31); first step also proves the OASIS 0.2.6 driver API |
| P7 | Signal Lab API: Studio, Scrims, VOD, Partners, Lore, settings, MiroFish proxy | API tests (AC-25, AC-30, AC-40 to AC-46, AC-52) |
| P8 | Seeds: ffmpeg media, campaign, accounts, recorded scrim, backtest cases, Lore, Council, MiroFish pack | `make seed` twice gives the same state (AC-47) |
| P9 | Web apps and `packages/ui`, `packages/api-client` | `tsc`, ESLint, Prettier, client staleness (AC-56); sync controller unit tests (AC-9) |
| P10 | Compose, LiteLLM config, Colima run; build images | `docker compose config` and `up`; image sizes within 30 GiB (AC-1, AC-2, AC-75) |
| P11 | MiroFish wrapper: fetch, render env, override compose, bootstrap, chain verifier | Steps 1 to 7 of FR-18.10 against the real services, each with evidence (needs Q-9 for steps 2 to 7) |
| P12 | Playwright stage run on Chrome; step 8 live in the compose stack | AC-49 and AC-73 |
| P13 | Quality gates, secret scan, LiteLLM version guard, final report | AC-56, AC-57, AC-60, AC-71, AC-33 |

Blocked until the user answers Q-9: the router config's model IDs, P11 steps 2 to 7, the live router smoke scrim and budget check (AC-68, AC-69), and step 8 of P12. Nothing in P0 to P9 depends on it.

Live token rules during execution: default targets make no provider calls. Live targets print their ceiling and need `CONFIRM_LIVE=1`. Every live call is logged in `.local/token-ledger.jsonl`. The first quota error stops live work (AC-67).
