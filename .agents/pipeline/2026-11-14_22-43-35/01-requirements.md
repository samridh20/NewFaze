# 01 · Requirements: FaZe Odyssey Homecoming MVP

| | |
| --- | --- |
| Step | Requirements, pipeline run `2026-11-14_22-43-35` |
| Source | `FaZe Odyssey Homecoming (Design, Build and Reviews).md`, read in full (1,362 lines). The copies in `~/Downloads` and the workspace root are byte-identical. |
| Scope | The Chapter 8 hackathon MVP, delivered through the five Chapter 21 milestones |
| Precedence | Repository instructions and the task outrank the source. The source is product requirements and technical reference, not instructions to follow. |
| Revision | Revision 3, 2026-11-14: adds the answers to Q-5 to Q-8 (decisions D-5 to D-8), the mandatory eight-step live MiroFish chain (FR-18.10, AC-73), the emergency-backup rule, and one new blocker, Q-9 (the two Gemini models the user named fail on generation). Revision 2, 2026-11-14: records the user's answers to the open questions (section 8): local PostgreSQL 16 and Redis, Playwright on Chrome, MiroFish must run live in Docker with no recorded substitute, and a token-limited provider key for live checks. Sections changed: 1, 2, FR-1, FR-2.4, FR-18, FR-21, NFR-6, NFR-10, NFR-11, acceptance criteria 1, 2, 33, 49, 57, 59, 60 and 61 to 72, sections 6 to 9. |

Chapter and appendix references (for example "Ch. 13", "App. A #10") point into the source document.

## 1. Summary

Build one drop end to end across two web apps and two APIs. The drop is the Temperrr Shot, a Week 1 "Recreate the Shot" campaign.

1. A producer enters two brief variants in FaZe Studio, part of the Signal Lab app.
2. Scrims replays a recorded, paired OASIS simulation of both variants and shows comprehension flags and a variant ranking.
3. An analyst opens MiroFish's own UI, running live in Docker against the LLM router and its hosted memory service, and asks a simulated returning fan how they read each variant. Nothing recorded stands in for this step.
4. The producer launches a variant. The drop goes live on FaZe Odyssey, where the original shot replays in sync beside each pre-ingested finalist.
5. Signed-in fans call the vote, one current vote each. The server closes the ballot atomically, and Studio publishes the Final Cut idempotently, with creator credits and a labeled Sim vs Fans card.
6. The outbox fills the warehouse. VOD Review shows predicted against actual and a backtest scorecard, and the sponsor view shows the same scrim beside the real result.

With `DEMO_MODE=1`, every step of the stage run except step 3 works offline on recorded fixtures. Step 3, the MiroFish chat, needs the router, the LLM provider and MiroFish's memory service to be reachable, and the requirements give it no fixture path. Supabase Auth, Mux and LLM providers (behind LiteLLM) each get a real adapter and a fixture adapter. An adapter counts as verified only if it was exercised with real credentials. The user supplied a token-limited LLM key, so live LLM use is confined to a few small, opt-in checks (NFR-10). Everything else is reported as fixture-backed.

The workspace holds no code, so this is a new build. The only existing files to preserve are `.gitignore` and the source document.

## 2. Context and constraints

### 2.1 Workspace today

- `/Users/samridhsingh/Documents/NewFaze` is a git repository on `main` with no commits.
- `.gitignore` contains one line, which ignores the source document. The source document sits untracked in the root. `.agents/pipeline/` holds this pipeline's artifacts.
- Requirement: keep `.gitignore`'s existing line and the source document unchanged. New ignore rules are appended, never substituted. The `.env*` rules (FR-1.3) must exist before any env file holding a real value is created.

### 2.2 Environment findings (probed 2026-11-14)

| Need | Found | Impact |
| --- | --- | --- |
| Docker engine and Compose | Nothing installed: no Docker Desktop, OrbStack, Colima or Podman. Homebrew offers `docker` 29.9.3 and `docker-compose` 5.7.1. | MiroFish must run in Docker (D-3), so an engine is required. A CLI-only engine is assumed (A-37), and `docker compose up` becomes verifiable here. A native run path is still required for fast tests (FR-1.4). |
| Docker VM sizing | Host: arm64, 12 CPUs, 36 GB RAM, 166 GB free disk. | The user's ceiling for Docker is 4 CPUs, 8 GB RAM and 30 GB disk (D-7), never exceeded without asking. The workers image carries torch through `camel-oasis`, and MiroFish's image carries its own copy, so image sizes are checked against the 30 GB disk (AC-75). |
| PostgreSQL 16 with pgvector | Not installed. Homebrew offers `postgresql@16` 16.16. Homebrew's `pgvector` 0.8.7 is built only for PostgreSQL 17 and 18. | Decision D-1: install `postgresql@16` and build pgvector 0.8.x from source against it. The compiler toolchain was not probed, so the design must check it first. |
| Redis 7 | Not installed. Homebrew offers Redis 8.10.3. | Decision D-1: install Homebrew Redis for the native stack (A-31). Compose pins Redis 7. |
| Python 3.11 | 3.13.5 and 3.14.4 on PATH. uv 0.11.7 can install CPython 3.11.15. | Use a uv-managed 3.11 interpreter. |
| Node | Node 24.10.0 and npm 11.6.0. No pnpm, yarn or bun. | Use npm workspaces. |
| Media tooling | ffmpeg installed | Synthetic HLS fixtures can be generated locally. |
| Browsers | Google Chrome installed. No Playwright browsers downloaded. | Decision D-2: Playwright drives the installed Chrome through its `chrome` channel, which plays the H.264 HLS fixtures. |
| Registries | PyPI, npm, Docker Hub and GHCR reachable. Image digests resolve over HTTPS without Docker. | Digest pinning is possible. |

### 2.3 Library facts that shape the requirements

- `camel-oasis` 0.2.6, the latest release, needs Python 3.10 to 3.14 and pins `camel-ai` 0.2.90. It pulls in torch, transformers, sentence-transformers, neo4j and unstructured, about 130 packages together with the service stack.
- OASIS 0.2.6's `DefaultPlatformType.TWITTER` selects the `twhin-bert` recommender, which downloads `Twitter/twhin-bert-base` from Hugging Face at run time. Other recommenders exist, and a custom `Platform` can be passed in.
- `OasisEnv.step` runs all of a step's actions concurrently with `asyncio.gather`, and the platform samples with Python's global `random` module. Deterministic replay therefore needs controlled action ordering and seeding.
- `SocialAgent` accepts extra `tools`. FR-10.13 forbids passing any.
- `camel-ai` 0.2.90's `ModelFactory.create` accepts `async_client`, so the in-process record/replay client from Ch. 16 is supported without the proxy fallback.
- LiteLLM 1.82.7 and 1.82.8 are still on PyPI and are not marked yanked, so the repository needs its own check to block them. The latest release is 1.109.1.
- MiroFish (`666ghj/MiroFish`) has tags v0.1.0, v0.1.1 and v0.1.2, the last at commit `985f89f49a`. It is licensed AGPL-3.0, so it runs unmodified from its own checkout and none of its code is copied into this repository. Its README documents Docker deployment (`docker compose up -d`, reading a root `.env`) with the frontend on port 3000 and the backend on 5001.
- Its README lists `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME` and `ZEP_API_KEY` as required settings. Zep Cloud is a hosted memory service that needs its own account and key, and the README says its monthly free quota covers simple use. This matches the source's App. B #12.
- Its workflow runs graph build, environment setup, simulation, report and deep interaction, which is the chat with any simulated agent. A chat therefore needs a built project and a finished simulation, and every step spends LLM tokens. A small project, built once and kept in volumes, keeps that spend bounded (FR-18.6).
- Not yet read: the pinned commit's `docker-compose.yml`, `Dockerfile` and `.env.example`, because those reads were declined. The design must confirm the exact variables, volumes and ports from the pinned checkout.
- The user supplied one provider API key in chat. Its provider and quota are unconfirmed (A-34). The key is a secret. This document does not contain it, and FR-1.3 and NFR-10 say where it goes.

### 2.4 Technology locked by the source (Ch. 10, 16, 20)

| Layer | Locked choice |
| --- | --- |
| Web | Two Next.js App Router apps in TypeScript with Tailwind (FaZe tokens), TanStack Query and hls.js; a shared `packages/ui`; `packages/api-client` generated by `openapi-typescript` |
| APIs | Two FastAPI services on Python 3.11 with Pydantic v2, async SQLAlchemy 2 on asyncpg, and Alembic |
| Data | One PostgreSQL 16 cluster with pgvector and the schemas `odyssey`, `lab`, `lore` and `wh` |
| Jobs | Redis 7 with arq workers |
| Sign-in | Supabase Auth JWTs, verified by both APIs |
| Media | Mux with direct uploads, HLS and signed webhooks |
| LLM gateway | LiteLLM proxy pinned by image digest, with its own database; callers use role aliases |
| Simulation | `camel-oasis`, version pinned, driven directly by `services/scrim-runner` |
| Calibration | pandas, NumPy and scikit-learn: Ridge, split conformal intervals, baseline gate |
| MiroFish | Its own pinned checkout (v0.1.2, commit `985f89f49a`, unless the design justifies a later pin) and compose file, outside this repository, running live in Docker |
| MiroFish memory | The memory service the pinned version requires: Zep Cloud for v0.1.2 (hosted, own key) |
| Docker engine | A CLI-only engine, assumed to be Colima with Homebrew's `docker` and `docker-compose` (A-37) |
| Tests | pytest against real PostgreSQL and Redis; Playwright |

### 2.5 Integration modes

| Integration | Live path | Fixture path, used when credentials are missing | Counts as verified when |
| --- | --- | --- | --- |
| Supabase Auth | Supabase JWTs checked against `SUPABASE_JWKS_URL`; Twitch, Google and Discord for fans; Google SSO for staff and partners | Local issuer with the same claim shape, its own JWKS, and a demo sign-in picker | A real Supabase project signed a token that both APIs accepted |
| Mux | Public HLS playback from `stream.mux.com` | Local synthetic H.264 HLS files | A real Mux asset played in the Drop page |
| LLM providers | LiteLLM proxy with the user's token-limited provider key and per-run virtual keys | Deterministic local fixture model, plus replay of recordings | A small scrim recorded through the router with the supplied key, then replayed with no calls (AC-68), within the token policy (NFR-10) |
| MiroFish | The pinned MiroFish, running in Docker, using the router as its LLM | None. The user ruled out a link-only or recorded substitute (D-3). | An analyst chatted with a simulated returning fan in MiroFish's own UI, and the router's spend log shows the call (AC-64) |
| MiroFish memory service | Zep Cloud with the user's own key | None | The pre-built project's graph was built through it and the chat succeeded (AC-63, AC-64) |
| Guardian email | None in the source; an email adapter interface only | Local dev mailbox, visible only in `DEMO_MODE` | Out of scope for the MVP |

Fixture adapters are allowed only when `DEMO_MODE=1` (FR-21.1) and only for Supabase, Mux, the LLM provider and email. MiroFish and its memory service have no fixture adapter. The active mode of every integration is visible (FR-21.4).

### 2.6 Glossary

| FaZe name | Meaning in this document |
| --- | --- |
| Drop | A campaign (`odyssey.campaigns`) |
| Call It | Casting or changing a vote on a ballot |
| The Final Cut | The episode published for a closed ballot |
| FaZe Studio | Signal Lab's campaign workspace, the only writer of campaign state through Odyssey's API |
| Scrims | Pre-launch simulation of brief variants against simulated fans (OASIS) |
| Weekly patch | The calibration model that turns scrim features into forecast ranges |
| VOD Review | Predicted-against-actual review, calibration health and backtests |
| Killcam | One frozen backtest case |
| Partners | The read-only sponsor view |
| FaZe Lore | The bitemporal knowledge store (`lore` schema) |
| Sim vs Fans | The predicted vote split shown beside the real split after close |

## 3. Functional requirements

### FR-1 Repository, build and infrastructure

- **FR-1.1** The layout follows Ch. 10, rooted at the workspace root: `apps/odyssey-web`, `apps/signal-lab-web`, `packages/ui`, `packages/api-client`, `services/odyssey-api`, `services/signal-lab-api`, `services/workers`, `services/scrim-runner`, `infra/` (`docker-compose.yml`, `litellm/config.yaml`, `migrations/`) and `seeds/`.
- **FR-1.2** `infra/docker-compose.yml` defines every Ch. 20 service: postgres (PostgreSQL 16 with pgvector), redis 7, llm-gateway, odyssey-api, signal-lab-api, workers, odyssey-web on host port 3001 and signal-lab-web on host port 3002. `up` runs migrations. The file declares a dedicated network that only llm-gateway and MiroFish's own compose join (FR-18.2). It publishes no PostgreSQL or Redis host ports, so the compose stack and the native PostgreSQL and Redis (D-1) never collide. Every third-party image is pinned by digest. LiteLLM uses its own database, separate from the app schemas.
- **FR-1.3** Env files follow Ch. 20. `.env` holds shared settings including `DEMO_MODE`. `.env.lab` holds `LITELLM_MASTER_KEY` and reaches only signal-lab-api and workers. `.env.llm` holds provider keys and reaches only llm-gateway. Committed `*.example` templates hold placeholders only, and real env files are gitignored through appended `.gitignore` rules that cover `.env` and `.env.*` at any depth while keeping the `*.example` templates tracked. The user-supplied provider key goes only into `infra/.env.llm`, and the Zep key only into MiroFish's own gitignored `.env`. The Odyssey API never receives the master key or any provider key, and the web apps receive no server secrets.
- **FR-1.4** Two run paths are documented. The native path starts every service on the host against the local PostgreSQL 16 and Redis from D-1, and is the fast path for tests. The compose path runs the same services in containers on the Docker engine, and is the path for the stage run and for MiroFish, which only runs in Docker.
- **FR-1.5** Alembic migrations, one folder per schema (`odyssey`, `lab`, `lore`, `wh`), create the Ch. 13 and Ch. 18 tables plus whatever the design adds, the `vector` extension, a database role per service with its grants (FR-3.1), and the database-level guards for state transitions (FR-3.2, FR-3.5) and frozen records (FR-13.3, FR-14.3, FR-14.7). They apply to an empty database and roll back to base.
- **FR-1.6** `make seed` exists, as named in Ch. 20. Documented targets also cover setup, running, migrating, testing, linting, formatting, type checking, end-to-end tests and compose validation.
- **FR-1.7** Both APIs publish OpenAPI. `packages/api-client` is generated from both specs with `openapi-typescript`, and a check fails when the generated client is stale, so a changed field breaks the front-end build.
- **FR-1.8** Every API error is an RFC 9457 problem details response (`application/problem+json`) with a stable `type`. The set includes at least `ballot-closed`, `rate-limited` and `illegal-transition` from the source. The design defines and documents the rest.
- **FR-1.9** Python dependencies are locked with hashes, and JavaScript dependencies use one committed workspace lockfile. Builds and tests install from the locks without re-resolving.
- **FR-1.10** Setup scripts install and configure the local prerequisites from D-1 and A-37: `postgresql@16`, pgvector 0.8.x built from source against it, Redis, and a CLI-only Docker engine. Each script says what it will change on the machine, is safe to re-run, and does not touch anything outside its own installs.

### FR-2 Identity, roles and service authentication

- **FR-2.1** Both APIs share one JWT verification path. It checks the signature against a JWKS, the issuer, the audience, expiry and not-before, and rejects `alg: none` and algorithm substitution. The role (`fan`, `reviewer`, `producer`, `analyst`, `partner` or `admin`) and, for partners, the partner ID come only from verified claims.
- **FR-2.2** Live mode verifies Supabase Auth tokens. Fans sign in with Twitch, Google or Discord; staff and partners use Google SSO.
- **FR-2.3** Fixture mode runs a local issuer that signs tokens with the same claim shape and publishes its own JWKS, which both APIs verify through the FR-2.1 path. Its signing key is generated locally and never committed. Both web apps offer a demo sign-in picker listing the seeded accounts by role.
- **FR-2.4** Permissions follow the Ch. 19 role table and deny by default:
  - fans vote, join Fan Council and read their own data;
  - producers use all of Studio (briefs, finalists, open, close, publish, demo advance) and run scrims;
  - analysts run scrims and use VOD Review, FaZe Lore and the MiroFish panel;
  - partners read only their own activations, results and scrims;
  - admins manage roles and router settings;
  - reviewers have no MVP screens, because entry review is out of scope.
- **FR-2.5** Signal Lab calls Odyssey's internal routes with a short-lived service token (audience `odyssey-internal`, lifetime measured in minutes) that names the acting staff user. Internal routes accept only that token and refuse user JWTs, admin tokens included. Odyssey records the actor on every staff-initiated change.
- **FR-2.6** Internal routes cannot be reached from browsers or the LAN. In compose they are not exposed through any published port or web origin, and in the native run they listen on loopback only (A-28).
- **FR-2.7** Odyssey keeps the minimum account profile the features need: a display handle, the account creation time (for the anomaly report) and the analytics-consent status (for FR-13.1).

### FR-3 Campaign state and ownership (Odyssey is the sole owner)

- **FR-3.1** Only the Odyssey API writes the `odyssey` schema. Signal Lab has no read or write privilege on `odyssey` and changes campaign state only through internal routes. The outbox relay may only read and mark outbox rows and insert into `wh.events`. Database roles and grants enforce these limits, not convention alone.
- **FR-3.2** The campaign state machine has one transition table in code, and the database rejects every transition not in it (A-4, App. A #10):

  | From | To | Condition |
  | --- | --- | --- |
  | `draft` | `scheduled` | A live brief version exists |
  | `scheduled` | `accepting_entries` | None |
  | `accepting_entries` | `shortlist_locked` | None |
  | `shortlist_locked` | `voting` | A ballot with exactly two locked finalists exists, and it opens in the same transaction |
  | `voting` | `closed` | Only through the ballot close operation (FR-4.3) |
  | `closed` | `published` | Only through the publish operation (FR-7.1) |
  | `published` | `archived` | None |
  | `scheduled`, `accepting_entries`, `shortlist_locked` or `voting` | `paused` | Pausing from `voting` also pauses the ballot |
  | `paused` | The state it was paused from | Resuming into `voting` also reopens the ballot |

  Any other move returns 409 `illegal-transition` and changes nothing.
- **FR-3.3** Pausing does not move `closes_at` (A-5). While a ballot is paused, votes are refused with 409 and a stable type distinct from `ballot-closed`. After a resume, the server-clock rule in FR-6.3 still applies.
- **FR-3.4** A ballot moves `open` to `paused` and back, and from `open` or `paused` to `closed`. `closed` is terminal, so a ballot never reopens. Campaign and ballot state change in the same transaction and never disagree after a commit.
- **FR-3.5** Entry states follow Ch. 13 (`received`, `processing`, `in_review`, `finalist`, `published`, `declined`, `withdrawn`), with a transition table enforced in code and in the database. No transition leaves `published`. The MVP has no entry submission or withdrawal endpoint (section 6).
- **FR-3.6** Locking a ballot requires exactly two distinct entries from that campaign. Each must be `in_review`, have a ready ingested asset and carry editorial-use permission. `closes_at` must be later than `opens_at` and in the future. The lock copies each asset ID and marker into the finalist record and moves both entries to `finalist`. After that the finalists cannot change (409) (A-7).
- **FR-3.7** The live brief cannot change once the campaign reaches `accepting_entries` (409) (A-6). Odyssey stores the live brief version with its variant label and the ID of the scrim run that tested it.
- **FR-3.8** Every state change writes its outbox row in the same transaction.

### FR-4 Campaign API (internal routes) and idempotency

- **FR-4.1** Odyssey implements the Ch. 12 internal routes: `PUT /internal/v1/campaigns/{id}`, `POST /internal/v1/campaigns/{id}/transition`, `POST /internal/v1/ballots`, `POST /internal/v1/ballots/{id}/close` and `POST /internal/v1/ballots/{id}/publish`, plus `POST /internal/v1/campaigns/{id}/advance` in `DEMO_MODE` (Ch. 20). It also provides internal routes that the source's route tables omit but Studio needs: campaign and ballot status, the entry list, the anomaly report (FR-6.8), Fan Council aggregates (FR-17.4) and registration of the Sim vs Fans prediction (FR-10.9).
- **FR-4.2** Every write, public or internal, accepts `Idempotency-Key`, and votes and all internal writes require it. Keys are scoped to the caller and the operation.
  - A repeated key with the same request returns the stored response without running the operation again.
  - A repeated key with a different request is refused with a 4xx problem response and has no effect.
  - Concurrent requests carrying one key run the operation at most once.
  - Key format (length and characters) and retention are bounded and documented.
- **FR-4.3** Close runs in one transaction. It locks the ballot row exclusively, sets the ballot to `closed`, freezes the tally from the current-vote table, records the close time, moves the campaign to `closed` and writes a `ballot.closed` outbox row that carries the frozen tally (Ch. 13). Close is allowed from `open` or `paused`, before or after `closes_at`. Closing a closed ballot returns the existing frozen result and never recomputes it.
- **FR-4.4** Publish is specified in FR-7.
- **FR-4.5** Advance moves the campaign to its next happy-path state through the same operations and checks as the real routes: `voting` to `closed` runs the close transaction, and `closed` to `published` runs publish. A missing precondition returns 409 that names it. With `DEMO_MODE` off, the route returns 404.

### FR-5 Odyssey public API (the MVP subset of Ch. 12)

- **FR-5.1** Odyssey implements `GET /v1/lobby`, `GET /v1/campaigns/{slug}`, `GET /v1/ballots/{id}/me`, `POST /v1/ballots/{id}/votes`, `GET /v1/episodes/{slug}`, `GET /v1/stream/campaigns/{slug}`, `POST /v1/council/enrol` and `POST /v1/council/answers`. It adds two kinds of route the source lists no path for: a guardian confirmation route (FR-17.1) and routes that record reveal views and channel clicks (FR-13.1).
- **FR-5.2** The Lobby returns this week's drop, the latest Final Cut when one exists, and the next drop.
- **FR-5.3** The campaign route returns the brief, the reference clip, the state and the times, plus the finalists (playback and markers) from `voting` onward. No public route returns vote counts or tallies before publish. No public route returns simulation data except the Sim vs Fans field of a published episode.
- **FR-5.4** The stream sends the current state on connect, a `state` event on each transition (`accepting_entries`, `voting`, `closed`, `published`, pause and resume) and a `countdown` every 30 seconds. Events reach subscribers on every API process, not only the process that made the change.
- **FR-5.5** Recording a reveal view or channel click is rate-limited, attaches the account ID only for consented accounts, and accepts only a credit ID, never a URL, so it cannot serve as an open redirect.

### FR-6 Call It (voting)

- **FR-6.1** Only signed-in accounts with the `fan` role vote (A-8). Simulated fans never vote, and nothing writes simulated output to `odyssey.votes`.
- **FR-6.2** Each voter has one current vote per ballot, enforced by a unique key. A change updates that row and increments its revision. Tallies read only the current-vote table.
- **FR-6.3** A vote is accepted only when the ballot is `open` and the database clock is earlier than `closes_at`. Otherwise it gets 409 `ballot-closed`, or the paused type from FR-3.3. Client time is never used. A vote for an entry that is not a locked finalist on that ballot gets 422.
- **FR-6.4** A vote takes the ballot row in share mode and close takes it exclusively (Ch. 13), so every vote is either in the frozen tally or refused, never committed after the close.
- **FR-6.5** Each accepted vote writes an outbox event in the same transaction. A first cast and a later change use distinct topics.
- **FR-6.6** Redis token buckets limit votes per account and per client IP, using a keyed hash of the IP. Excess requests get 429 `rate-limited` with `Retry-After`. Limits are configurable. When Redis is unavailable, votes are refused with 503 rather than accepted without limits (A-9).
- **FR-6.7** `GET /v1/ballots/{id}/me` returns the caller's current choice, or none, and the ballot state.
- **FR-6.8** Before publish, Studio shows an anomaly report for the ballot (Ch. 19): vote counts by referral, by hashed-IP bucket and by account-age band, with any bucket above a configurable share flagged. The report informs the producer but does not block publish, and it shows no raw IPs or voter identities.

### FR-7 Publish and the Final Cut

- **FR-7.1** Publish requires a closed ballot. One transaction writes the episode (one per ballot), its sequence (intro, winner, credits, end card), credits for both finalists (A-11), a Vault chapter record, the Sim vs Fans summary when a prediction was registered before close, the entry and campaign state changes, and the `episode.published` outbox row.
- **FR-7.2** A repeated or concurrent publish returns the same episode and writes nothing more. The losing caller receives the existing episode, not an error (App. A #12).
- **FR-7.3** The winner comes from the frozen tally only. A tie, including a ballot with no votes, is settled by a deterministic, documented rule, and the episode records that the result was a tie (A-10).
- **FR-7.4** Credits show each finalist's handle, and show a channel link only where the creator opted in.
- **FR-7.5** The Final Cut page plays the sequence back to back from playback IDs supplied by the media adapter, and shows the credits, the links, the real split and the Sim vs Fans card. A part that fails to load is skipped with a notice instead of stalling playback.
- **FR-7.6** The Drop and Final Cut pages render on the server with social preview metadata. The Final Cut revalidates on publish, and open Drop pages move to the Final Cut on the `published` event.

### FR-8 FaZe Odyssey web app

- **FR-8.1** MVP routes: `/` (the Lobby), `/drop/[slug]`, `/drop/[slug]/call-it`, `/drop/[slug]/final-cut`, `/council`, and sign-in (Supabase in live mode, the demo picker in fixture mode).
- **FR-8.2** The Drop page shows the brief and the original reference clip, and replays the reference beside each finalist with the Ch. 11 synced replay:
  - both videos play muted and `playsinline`;
  - each seeks to its marker minus 2 s, both seeks complete, then both start together and stop at the marker plus 1 s;
  - drift up to 150 ms is corrected by changing the second clip's playback rate by at most ±5%, and larger drift by a re-seek;
  - every replay re-syncs from the markers;
  - HLS plays through hls.js, and natively on Safari.
- **FR-8.3** Call It sends a fresh `Idempotency-Key` per tap and shows the choice only after the server confirms it. Changes are allowed while the ballot is open. A 409 `ballot-closed` swaps the button for the reveal time and a Final Cut link, a paused ballot shows a paused notice, and a 429 shows a short cooldown.
- **FR-8.4** The fan flow works at phone widths from 360 px in iOS Safari and Android Chrome. A phone on the same network can complete it using only the Odyssey web URL.
- **FR-8.5** Odyssey shows no simulated content anywhere except the labeled Sim vs Fans card on a published Final Cut ("No bots in the Lobby", Ch. 2).

### FR-9 FaZe Studio (Signal Lab web and API)

- **FR-9.1** Studio routes:
  - `/studio` lists campaigns;
  - `/studio/[campaignId]` is the brief editor with variants A and B, a "Scrim these" button and a launch action for the chosen variant;
  - `/studio/[campaignId]/ballot` picks two finalists, sets markers on a scrubber, sets times, opens, closes and publishes, shows the anomaly report and, in `DEMO_MODE`, an Advance control with the current state.
- **FR-9.2** The Signal Lab API implements the Ch. 12 Studio routes these pages need. Draft variants are Signal Lab data. Launching sends the campaign and the chosen variant, with its scrim run ID, to Odyssey. Ballot, close, publish and advance call Odyssey's internal routes with idempotency keys, and Odyssey's problem types reach the UI unchanged.
- **FR-9.3** Publishing from Studio attaches the Sim vs Fans prediction registered before close. Studio cannot attach a prediction created after close.

### FR-10 Scrims

- **FR-10.1** `POST /v1/scrims` validates the config, stores the `lab.scrim_runs` row, sets up the run's budget, queues an arq job and returns 202 with the run ID. MVP runs have exactly two variants (A-33). Bots, cohorts, rounds, seeds, interviews (no more than the number of bots), brief length and budget (above zero and no more than a configured cap) have documented limits. Violations return 422 with field errors.
- **FR-10.2** Run status moves from `queued` to `running` to `done`, `failed` or `over_budget`. `GET /v1/scrims/{id}`, the transcripts and progress (through events or polling) are available. `/scrims/new` and `/scrims/[runId]` show the configuration, progress, the paired ranking, comprehension flags, themes and transcripts.
- **FR-10.3** Each run uses three cohorts (returning, newcomer, creator) with weights stored in the run config (A-32). Personas (cohort, era, games, tone and a one-line bio) are synthetic, drawn once per run from a fixed seed and stored in `lab.scrim_bots`. Persona inputs are cohort totals only: no account IDs, no per-person first-party data, and no real people's names or handles.
- **FR-10.4** Variants are paired: at a given seed, every variant plays the same bots, the same follower network and the same random draws, both for which bots act each round and for which bots are interviewed. The behavioral policy starts from the Ch. 15 values (returning 0.45, newcomer 0.30, creator 0.60, decay 0.75 per round). The brand account posts the brief through `ManualAction`, bot turns use `LLMAction`, and a seeded sample of bots answers the comprehension question through `INTERVIEW`.
- **FR-10.5** The runner drives the pinned `camel-oasis` library directly. During recording a run needs no network access except to the LLM gateway, so nothing may download models at run time (OASIS's default Twitter recommender does, see 2.3). Action ordering must be deterministic so that a recording replays, even though OASIS runs a step's actions concurrently.
- **FR-10.6** The `judge` alias grades every interview answer pass or fail, with a reason, against the brief's rules (games allowed, clip length, what to send) and labels sentiment on a sample of replies. The `analyst` alias groups replies into named themes, including sponsor authenticity risk.
- **FR-10.7** Paired results follow Ch. 15: per seed, A minus B on each metric; an 80% bootstrap interval over seeds with a fixed RNG seed; a winner only when the interval excludes zero. The UI states that the interval covers seed-to-seed simulation noise only (A-25).
- **FR-10.8** Forecasts for entrants, voters and week-2 return are p10/p50/p90 ranges. A range is flagged calibrated only when a shipped calibration model produced it (FR-13.5). When history is too short, forecasts fall back to a documented default range, labeled uncalibrated (A-26).
- **FR-10.9** The demo scrim also produces a predicted vote split between the two locked finalists (A-12). Signal Lab registers it with Odyssey before the ballot closes. It is never stored or counted as votes.
- **FR-10.10** Each recording run has a hard spend cap.
  - In live mode Signal Lab creates a LiteLLM virtual key with alias `scrim-<run-id>`, limited to the aliases the run uses (the source lists `bots-fast`, `bots-backup` and `judge`) and with `max_budget` set. It deletes the key when the run ends, whether it succeeded, failed or ran over budget.
  - When the cap is reached, no further calls are made. The run ends `over_budget`, finished observations are kept, and the paired summary uses only seeds where both variants finished.
  - Spend per run is recorded.
  - The cap also holds, and can be tested, without LiteLLM, in fixture mode.
- **FR-10.11** Record and replay follow Ch. 16:
  - every request and response is stored in `lab.llm_calls` by run, request hash and occurrence, with model alias, model version and cost, alongside the run's config, bots, seeds and OASIS database trace;
  - replay re-executes the same runner code against the stored responses;
  - replay makes no provider or network calls, creates no key and records zero spend;
  - a missing stored response fails the run with a clear "recording mismatch" error and never falls through to a provider call;
  - a replay's results equal the recording's results exactly.
- **FR-10.12** There are three run modes: live recording through the gateway (needs provider keys), fixture recording against a deterministic local fixture model (A-18), and replay of either. Fixture-model output is marked as fixture wherever it appears. The demo recording can be regenerated from committed inputs with one documented command, and is never hand-edited.
- **FR-10.13** Bots get only OASIS's social actions (create post, like, repost, quote, comment, follow, do nothing; `INTERVIEW` stays manual) and no extra tools.

### FR-11 LLM router

- **FR-11.1** `infra/litellm/config.yaml` defines `bots-fast` (two load-balanced deployments), `bots-backup`, `judge`, `analyst` and `bots-local`, with keys referenced only as `os.environ/...`, the `bots-fast` to `bots-backup` fallback, `drop_params`, and the master key and database URL taken from the environment. The provider is the Google Gemini Developer API (D-6). The user named `gemini-2.5-flash` for `analyst`, `judge` and MiroFish, and `gemini-2.5-flash-lite` for `bots-fast`. The config names a model only after FR-11.5 has proved the key can generate with it. `bots-backup` is a second deployment on the `analyst` model, and `bots-local` stays a defined but unconfigured alias that the router reports as such. Every deployment carries explicit per-token costs (NFR-10), and model IDs come from the environment, so changing a model is a config edit.
- **FR-11.2** Every service calls the router by alias at `LITELLM_URL`. Bot turns never set `response_format` and request `n: 1`.
- **FR-11.5** Before the router config names a model, a script confirms that the key can both see it (`models.get`) and generate with it (one request capped at 8 output tokens, reasoning disabled), prints nothing secret, and records the result in the ledger. A model that fails either check is not configured. Finding on 2026-11-14: both user-named models are listed for the key, but generation returns 404 "no longer available to new users", and the API names `gemini-3.8-flash` and `gemini-3.5-flash-lite` as successors. The choice of replacements is Q-9.
- **FR-11.3** The router image is pinned by digest to a release other than 1.82.7 or 1.82.8. An automated check fails if any compose file, Dockerfile, requirements file or lockfile refers to LiteLLM 1.82.7 or 1.82.8.
- **FR-11.4** Signal Lab shows whether the router is configured, so a fixture-mode audience can see that no live model is in use.

### FR-12 Simulation disclosure

- **FR-12.1** Every simulated number in Signal Lab, across Scrims, VOD Review and Partners, renders through one `<SimValue>` component from `packages/ui`. It always shows a "Simulated" tag, the calibration badge ("Uncalibrated" or "Calibrated on N drops") and the backtest record for that event family.
- **FR-12.2** API contracts mark simulated values explicitly, with their calibration status. The front-end types make it impossible to render one without `<SimValue>`.
- **FR-12.3** Odyssey shows simulation output only after a ballot closes, and only as the Sim vs Fans card of a published episode. The card is labeled as a simulation with its calibration status, shows aggregate splits only, and never describes a person or quotes a bot.
- **FR-12.4** Simulated output never enters FaZe Lore or Odyssey content beyond that aggregate summary.
- **FR-12.5** Values produced by the fixture model also carry a fixture marker.

### FR-13 Outbox, warehouse and the weekly patch

- **FR-13.1** Outbox topics cover at least campaign transitions, entry accepted, vote cast, vote changed, ballot closed, episode published, episode viewed and channel clicked. Each payload is versioned and carries the event ID, schema version, campaign, brief version, referral and, only for consented accounts, the account ID (A-23).
- **FR-13.2** An arq relay runs every few seconds and moves batches into `wh.events` using `FOR UPDATE SKIP LOCKED` and `ON CONFLICT (event_id) DO NOTHING` (Ch. 17). Delivery is at least once, deduplicated by event ID, and correct with several relays running at once.
- **FR-13.3** Outcome sets per campaign and brief version hold entrants, voters and week-2 return. They freeze at the end of the reporting window and never change afterwards. Voter counts do not depend on analytics consent. Week-2 return uses the Ch. 17 query once the next drop's window closes, and shows as pending, not zero, until then.
- **FR-13.4** In `DEMO_MODE` the operator can end the reporting window on demand.
- **FR-13.5** The refit job implements Ch. 17: Ridge models with and without scrim features, leave-one-drop-out errors, and a ship decision that requires at least 8 drops and a lower held-out MAE for the scrim model than for the baseline. The interval half-width is the 80% quantile of held-out absolute errors. Each refit records the version, features, both MAEs, `coverage_80` and the ship decision in `lab.calibration_models`.

### FR-14 VOD Review

- **FR-14.1** `/vod/[campaignId]` shows, for the demo drop, the predicted split against the real frozen split, and forecast ranges against actual entrants and voters, with week-2 return pending. Actuals come from the warehouse, never from `odyssey` tables.
- **FR-14.2** `/vod/calibration` shows the gate status (drops counted against the 8 required) and the weekly patch's coverage and error, or states that no model has shipped.
- **FR-14.3** Backtests follow Ch. 18. The seed holds Killcam cases for #FaZe5 (2020), FaZe1 (2022), FaZe Subathon (2024), FaZe Subathon II (2025), FaZemas (2025, the shock case), and Mafiathon 2 and 3 as an outside pair. Each case is frozen and has a recorded scrim. The database enforces freezing: a frozen case cannot be edited, and a correction becomes a new case version.
- **FR-14.4** The backtest job:
  - walks cases in T0 order, and fits each case's calibration only on cases that resolved before its T0;
  - builds each dossier with `as_of` set to T0 on both timelines;
  - masks entities: FaZe becomes "Org A", creators and hashtags get aliases, dates shift by a fixed per-case offset, and platform and format stay;
  - runs the three-way outcome probe and the identity check for every case that is not clean for the model;
  - stores clean, leaky and shock flags with each result;
  - appends results only, and records for each run one pipeline version hash covering personas, policy, prompts, judge rubric and calibration features.
- **FR-14.5** The scorecard implements the Ch. 18 code. It counts only clean, unleaked, unshocked rows and reports cases counted and shown, the error multiple, `coverage_80`, skill against B2 with its bootstrap p10, and the gate (at least 8 counted cases, skill p10 above zero, coverage from 70% to 90%). Metrics without a citable numeric outcome, such as FaZe1 submissions and Subathon II totals, are shown but not scored.
- **FR-14.6** Routes: `GET` and `POST /v1/vod/cases`, `POST /v1/vod/cases/{id}/freeze`, `POST /v1/vod/backtests` (202 with a run ID), `GET /v1/vod/backtests/{id}` and `POST /v1/vod/shadow`. VOD Review has a Backtests tab with the scorecard per event family and a Killcam view per case: the brief with a masked-view toggle, the forecast range against the outcome, the probe answers, clean, leaky and shock badges, and a link to replay the case's scrim.
- **FR-14.7** `POST /v1/vod/shadow` locks one prospective forecast. It stores a SHA-256 hash over a canonical serialization of the forecast, with a timestamp, returns the hash, and refuses later changes.

### FR-15 Partners

- **FR-15.1** `/partners/[partnerId]` shows the partner's placements and approved creative, the scrims for its activations (ranking, themes, sponsor authenticity risk and forecasts, all through `<SimValue>`), and, once the episode is published, the real aggregate results beside the simulated values, labeled as real (A-13).
- **FR-15.2** A partner reads only data for its own partner ID. Other partners' resources return 403 or 404. Partner routes are read-only and expose no raw bot transcripts or personal data.
- **FR-15.3** The seeded sponsor is fictional (A-15).

### FR-16 FaZe Lore (minimal)

- **FR-16.1** The schema follows Ch. 13: entities, aliases, facts with a valid range and a record time, and chunks with `vector(1024)` and `known_from`. Embeddings stay empty in the MVP.
- **FR-16.2** Seeded public FaZe history uses only facts and source links found in the source document. Demo-authored content is flagged as such.
- **FR-16.3** `GET /v1/lore/search?q=&as_of=` and the dossier builder share one `as_of` rule: a fact is included only when its valid range contains `as_of` and it was known by `as_of` (A-27).
- **FR-16.4** Lore text reaches prompts only as quoted data (FR-19).

### FR-17 Fan Council

- **FR-17.1** On `/council` a signed-in fan enrols by entering a birth year, an integer from 1900 to the current year. Age is computed conservatively (A-21).
  - Under 14: refused, and nothing is stored.
  - 14 to 15: a guardian's email is required, and nothing about the enrolment is stored until the guardian confirms through an expiring, single-use link.
  - 16 and up: the fan consents for themselves.
  - The consent version is recorded with every enrolment.
- **FR-17.2** Guardian email goes through an email adapter. In fixture mode it lands in a local dev mailbox visible only in `DEMO_MODE`. No real email provider is part of the MVP (A-22).
- **FR-17.3** Only enrolled members answer the seeded two or three questions about upcoming briefs. Membership and answers never affect voting.
- **FR-17.4** Answers leave Odyssey only as cohort totals for cohorts of 20 or more members, and Odyssey enforces the threshold. Individual answers never reach `wh` or `lab`.

### FR-18 MiroFish sandbox (live)

MiroFish must run live in Docker with a configured LLM key and its required memory service. The user ruled out a link-only or recorded substitute (D-3), so this group has no fixture path.

- **FR-18.1** **Pinned live deployment.** MiroFish runs unmodified in Docker from its own pinned checkout and compose file, outside this repository's tree. The pin is an exact commit or image digest recorded in the repository. A script fetches the pin into a gitignored directory and starts it. No MiroFish source is copied into this repository (AGPL-3.0). The frontend uses port 3000 and the backend 5001, as the source says, and the design must resolve any clash with the Odyssey web app (3001) and Signal Lab web app (3002) host ports.
- **FR-18.2** **Network isolation.** MiroFish's containers join a dedicated Docker network shared only with llm-gateway. Over Docker networking they cannot reach PostgreSQL, Redis or either API.
- **FR-18.3** **LLM access through the router.** MiroFish's `LLM_BASE_URL` points at the router, its `LLM_API_KEY` is a LiteLLM virtual key made for MiroFish with a hard USD budget plus request-rate and token-rate limits, and its `LLM_MODEL_NAME` is `analyst`. Signal Lab's admin path, which holds the master key, creates the key. The key is written only to MiroFish's gitignored `.env` and can be revoked with a documented command. MiroFish never receives the master key or the raw provider key.
- **FR-18.4** **Memory service.** MiroFish's memory service is the one the pinned version requires. For v0.1.2 that is Zep Cloud, configured live with the user's own `ZEP_API_KEY` from a gitignored file. It is a hosted third party, so only the sandbox content pack (FR-18.5) ever reaches it. The source's App. B #12 warns about this exact exposure, and the public-only rule is what makes the exception acceptable.
- **FR-18.5** **Sandbox content pack.** A committed pack holds only the two brief variants and the public FaZe history facts that already appear in the source, each with its source link. It is an allowlist: the setup script uploads nothing outside it. Account data, Fan Council answers, first-party analytics, votes, entry content and simulated Scrims output never go into MiroFish or its memory service.
- **FR-18.6** **Pre-built project.** One MiroFish project is built from the pack through MiroFish's own workflow, sized to fit the token policy (NFR-10), and kept in Docker volumes, so opening it on stage costs no rebuild. A documented command rebuilds it from scratch under a hard budget and prints the tokens spent. Signal Lab keeps the project's identifiers in non-secret configuration and deep-links to it.
- **FR-18.7** **Analyst experience.** Signal Lab's MiroFish panel shows live status (backend reachable or not, pinned version, model alias, remaining budget of MiroFish's key) and a deep link to the pre-built project. In MiroFish's own UI, the analyst chats with a simulated returning fan about how they read each variant. The panel also has an in-app chat box. It sends the analyst's question through Signal Lab's API to the live MiroFish backend, the same chat endpoint MiroFish's own UI uses, and shows the real reply with the agent, the time and the router request ID. Replies are never cached, canned or generated by Signal Lab. When MiroFish or its memory service is unreachable, the panel says so, the stage step fails, and nothing stands in for it. Recorded OASIS `INTERVIEW` answers stay visible in Scrims, labeled as Scrims output, and are never presented as a MiroFish chat.
- **FR-18.8** **Readiness check.** One command confirms, without sending any LLM request, that MiroFish's frontend and backend respond, its memory configuration is present, the pre-built project loads, and its key has budget left. Stage readiness requires it to pass.
- **FR-18.9** **Evidence.** The live verification records proof of a real round trip: the chat reply in MiroFish's UI, the router's spend-log entries under MiroFish's key alias, and a screenshot or video.
- **FR-18.10** **Eight-step live chain.** A verification command exercises the real services in this order and reports each step as passed, failed or not run, with its evidence: (1) Zep Cloud authentication and graph access; (2) Gemini access through LiteLLM; (3) MiroFish project creation; (4) graph construction; (5) simulation preparation and start; (6) an active OASIS simulation; (7) a live chat message to a simulated returning fan; (8) that real reply displayed in the stage flow. A later step does not run after an earlier failure. Success is reported only when all eight passed against the real services.
- **FR-18.11** **No substitutes.** MiroFish and its memory service are never replaced by recorded answers, fixtures, NetworkX or other local graph stand-ins, or mock responses, in any mode and on any failure. The one exception is an emergency backup: a recorded capture of a real live chat from the verification run. The operator must switch it on explicitly, never automatically on failure. While it is shown, a persistent banner reads "RECORDED BACKUP, NOT LIVE", the status reads "backup active", and the run does not count as live verification.
- **FR-18.12** **Redaction.** Every script, log line, error and test output for the MiroFish and router work passes through redaction of the provider key, the Zep key and every virtual key. A failure message never contains a key, and Playwright traces, screenshots and videos never show one.

### FR-19 Prompt injection

- **FR-19.1** Ingested or third-party text enters prompts only inside a quoted-data block that the content cannot close, with an instruction to treat the block as data. This covers Lore facts and chunks, backtest case briefs, and bot posts read by the judge and analyst.
- **FR-19.2** Judge and analyst calls send no tools. Bots get only the actions in FR-10.13, and a model reply that calls anything else is ignored and logged.
- **FR-19.3** No model output is executed, used as SQL, shell or template input, or written to Lore or Odyssey.
- **FR-19.4** The seed includes a hostile Lore fact so that tests exercise these rules.

### FR-20 Media

- **FR-20.1** A media adapter has a Mux implementation (public playback from `stream.mux.com`) and a fixture implementation that serves local HLS. Playback URLs always come from the adapter.
- **FR-20.2** The seeded reference clip, two finalist clips, intro and end card are synthetic placeholders with no FaZe or third-party footage (A-16). They are encoded as H.264 HLS so they play on iOS Safari and in Chrome, and each shows a visible timecode and its marker so sync can be checked by eye.

### FR-21 DEMO_MODE and seeds

- **FR-21.1** `DEMO_MODE=1` enables the fixture adapter for each of Supabase, Mux, the LLM provider and email whose credentials are missing (MiroFish and its memory service have none, FR-18), the demo sign-in, the advance route and Studio's Advance control, the dev mailbox, and on-demand ending of the reporting window. With `DEMO_MODE=0` those routes return 404, and missing credentials stop startup with a clear error instead of falling back to fixtures. A service refuses to start with `DEMO_MODE=1` when its environment is marked as production.
- **FR-21.2** `make seed` can be re-run, resets the demo to its starting state and needs no network. It loads:
  - the Temperrr Shot campaign in `draft`, with variants A and B that match the recorded scrim;
  - the reference clip, two pre-ingested finalist entries by fictional creators with opt-in channel links on reserved domains (A-15), and the intro and end card;
  - three cohorts, and the recorded scrim (sized per A-24) with its finalist prediction;
  - a fictional sponsor with a partner account, and demo accounts for every role;
  - the next drop, as a scheduled teaser for the Lobby;
  - the MiroFish sandbox content pack (FR-18.5) and the non-secret identifiers of the pre-built project (FR-18.6), which the seed refers to but does not build;
  - public Lore facts, including the hostile fact from FR-19.4;
  - the seven backtest cases, with recorded scrims and probes;
  - the Fan Council questions.

  The seed contains no votes (A-14).
- **FR-21.3** The Playwright stage test saves a video that can serve as the backup recording App. A #17 recommends.
- **FR-21.4** Status endpoints and an indicator in Signal Lab report the mode of each integration. Supabase, Mux, the LLM gateway and email read live or fixture. MiroFish and its memory service read live or unreachable, never fixture.

### FR-22 Deliverables

- **FR-22.1** A README covers startup (compose and native), the Ch. 8 demo script, the test commands and how to switch each adapter to live mode.
- **FR-22.2** The final report gives startup instructions, demo instructions, test results (commands with pass and fail counts), architectural deviations from the source, the fixture-backed integrations (each marked verified or unverified, with the reason), remaining risks and unfinished follow-up work.

## 4. Non-functional requirements

- **NFR-1 Security and privacy**
  - The repository holds no secrets. Real env files are gitignored, and a secret scan passes.
  - Logs are structured JSON with request IDs. They never contain JWTs, service tokens, virtual or provider keys, raw IPs, guardian emails or birth years. Refused authentication and attempts on internal routes log at WARN, and unexpected failures at ERROR.
  - IPs are hashed with a keyed hash whose secret comes from the environment. Forwarding headers are trusted only from configured proxies, so a client cannot spoof its way around per-IP limits.
  - Every external input is validated at the API boundary for type, presence and limits, and failures return 422 problem details. All queries are parameterized.
  - CORS allows only the two web origins. Each service uses a least-privilege database role.
  - Data is minimized: account IDs appear in events only with consent, Fan Council data leaves Odyssey only as aggregates of at least 20, and no record links a bot to an account.
- **NFR-2 Supply chain.** Images are pinned by digest, Python packages by hash, and the npm lockfile is committed. Installs never re-resolve. The LiteLLM version check from FR-11.3 runs with the tests.
- **NFR-3 Consistency.** Each multi-step write is one transaction. Side effects go through the outbox, and workers are idempotent. The database clock is the only clock for ballot rules.
- **NFR-4 Determinism.** Scrim replay, the bootstrap and the seed data are deterministic, and every test that depends on randomness fixes its seed.
- **NFR-5 Performance targets** for the stage, measured on this laptop:
  - replay of the recorded demo scrim finishes within 120 s and shows progress throughout;
  - open Drop pages reach the Final Cut within 5 s of publish;
  - `make seed` finishes within 5 minutes.

  The source's load target (vote p95 under 200 ms at 500 votes per second, with no errors other than 429) is recorded for a follow-up k6 test and does not gate this work.
- **NFR-6 Offline demo.** Every stage-run step except the MiroFish chat needs no internet: no model downloads at run time, no fonts or scripts from a CDN, and only local media. The MiroFish chat needs the LLM provider and the memory service to be reachable, and the readiness check (FR-18.8) says so before the stage run.
- **NFR-7 Compatibility and accessibility.** The fan app supports current iOS Safari, Android Chrome, and desktop Chrome and Safari. Signal Lab supports desktop Chrome. Controls are semantic and keyboard-operable with visible focus, and icon-only buttons have text alternatives.
- **NFR-8 Look and voice** (Ch. 3). The apps use FaZe tokens from `packages/ui`, as placeholders until the FaZe toolkit is supplied (A-17). No marble, laurels, columns or mythology lettering. Drops use the dark theater look, and bright red is reserved for the primary action, selection and the active chapter. Copy is short and loud in FaZe's gaming voice. No FaZe logo files are added unless supplied.
- **NFR-9 Code quality.** Python passes ruff format, ruff lint and a type checker (mypy or pyright). TypeScript passes ESLint, Prettier and `tsc --noEmit`. The generated API client is current.
- **NFR-10 Live LLM token policy.** The user's key is token-limited, so live use is deliberate, small and measured.
  - Default test and build targets make zero calls to any LLM provider. Live checks are separate opt-in targets. Each prints its call and token ceiling before it starts, and refuses to run without an explicit confirmation flag.
  - Every live check goes through the router on a virtual key with a hard USD budget, request-rate and token-rate limits, and a per-request `max_tokens`. Every deployment in the router config carries explicit per-token costs, so USD budgets bind even when LiteLLM has no price for the model. Each alias points at the cheapest model that suits its role. One provider may back every alias, because only one key exists.
  - Nothing calls the provider with the supplied key directly, except the model-availability check of FR-11.5, limited to a few requests and about 50 tokens.
  - Hidden reasoning ("thinking") tokens count against the key. The router config disables or caps them for every alias where the provider allows it, and the ledger records them separately from visible output.
  - A ledger records the tokens and spend of every live check, whether in a gitignored file or the router's spend logs. A live check refuses to start when the ledger shows its ceiling would be passed. The design sets the per-check ceilings after Q-6 gives the key's real limits.
  - Live runs are recorded wherever the component supports it, so later runs replay at no cost. Scrims records through `lab.llm_calls`. MiroFish cannot replay, so its chat is the only repeated live call, and verification sends at most two messages per run.
  - Quota or rate-limit exhaustion stops live checks. The report then says "not verified: quota". No check falls back to a fixture while claiming to be live.
  - Planning estimate, to be measured and not relied on: a MiroFish project of up to 10 agents and 3 rounds is on the order of 10^5 tokens to build, and a chat message costs a few thousand.
- **NFR-11 Third-party data.** Only the sandbox content pack (FR-18.5) leaves the machine for MiroFish's memory service. The LLM provider receives only synthetic personas, public text and brief text. No account data, votes, Fan Council answers or first-party analytics are sent to any provider or to MiroFish, and tests assert this on recorded requests.

## 5. Acceptance criteria

Automated criteria run against real PostgreSQL and Redis unless they say otherwise. "Seeded drop" means the Temperrr Shot campaign loaded by `make seed`.

### M1 · Skeleton

1. **Compose validation.** `docker compose -f infra/docker-compose.yml config --quiet` exits 0, using the Compose CLI from the Docker engine in A-37. A test also asserts that every third-party image reference contains `@sha256:`, that odyssey-api receives neither `.env.lab` nor `.env.llm`, that only llm-gateway receives `.env.llm`, that the web apps publish 3001 and 3002, that no internal-route listener is published, and that PostgreSQL and Redis publish no host ports.
2. **Startup on both paths.** On the compose path, `docker compose up` starts every service in `infra/docker-compose.yml`, migrations run, every health endpoint returns 200, and a seeded fan and a seeded producer sign in through the web apps on ports 3001 and 3002 (the Ch. 21 milestone 1 criterion). On the native path, the documented command starts odyssey-api, signal-lab-api, the workers, odyssey-web and signal-lab-web against the local PostgreSQL and Redis, and every health endpoint returns 200. The report states which path each test result came from.
3. **Migrations.** On an empty database, upgrading to head succeeds for all four schemas, downgrading to base succeeds, and upgrading again succeeds.
4. **Ownership.** Connected as Signal Lab's database role, every SELECT, INSERT, UPDATE and DELETE on an `odyssey` table fails with a permission error. Connected as the relay role, only reading and marking outbox rows and inserting into `wh.events` succeed.
5. **Sign-in.** In `DEMO_MODE` a seeded fan signs in to Odyssey web and a seeded producer to Signal Lab web, and both APIs accept their tokens. Tokens that are expired, wrongly signed, issued for another audience or issuer, or use `alg: none` get 401. A fan token on a producer route gets 403.
6. **Internal routes.** A request without a service token gets 401. A user JWT, admin included, gets 403. A valid service token succeeds. The same paths requested through the public listener or a web origin get 404.
7. **Mode guards.** With `DEMO_MODE=0` and Supabase not configured, the APIs refuse to start. With `DEMO_MODE=0`, the advance and dev-mailbox routes return 404. With `DEMO_MODE=1` and the environment marked as production, the services refuse to start.

### M2 · Fan loop

8. **Drop page.** With the seeded drop in `voting`, the page shows the brief, the reference clip and both finalists. In Playwright on Chrome, pressing replay seeks both videos to 2 s before their markers (within 0.1 s), both `currentTime` values then advance, and both pause near 1 s after their markers.
9. **Sync controller.** Unit tests with fake media elements and a fake clock show that drift up to 150 ms sets the second clip's rate within [0.95, 1.05], drift above 150 ms triggers a re-seek, and at the stop point both clips pause and the rate resets to 1.
10. **Vote and change.** A fan votes for finalist A and gets success with revision 1, `GET /v1/ballots/{id}/me` returns A, and switching to B gives revision 2. The vote table holds one row for that voter, and the outbox holds a vote-cast event followed by a vote-changed event.
11. **Vote refusals.** An unauthenticated request gets 401. A producer or partner token gets 403. A non-finalist entry gets 422. A paused ballot gets 409 with the paused type. An open ballot whose `closes_at` has passed on the database clock gets 409 `ballot-closed`, and so does a closed ballot.
12. **Idempotency.** The same key and body sent twice give identical responses and one effect. The same key with a different body gets a 4xx response and has no effect. Twenty concurrent requests with one key produce one effect, and every response is either the stored response or the documented in-progress response.
13. **Rate limits.** Exceeding the per-account bucket gets 429 `rate-limited` with `Retry-After`. Exceeding the per-IP bucket from several accounts on one client IP also gets 429. A forwarding header sent by an untrusted peer does not change which IP bucket is charged.
14. **Vote and close race.** Through the API, 200 distinct fans vote concurrently while one close runs. Afterwards each voter has at most one row, the frozen tally's per-entry counts equal the vote table's, every success response is counted, and every 409 response left no row. The test passes 10 consecutive runs.
15. **Close semantics.** Repeating close, with the same or a new key, returns the same frozen tally. Campaign and ballot both read `closed`, and exactly one `ballot.closed` outbox row exists.
16. **Publish race.** Two concurrent publishes create one episode and one `episode.published` outbox row, and both return the same episode ID. A later third call returns it too. Publishing a ballot that is still open gets 409 `illegal-transition` and creates no episode.
17. **Credits.** The episode credits both finalists. In an integration test, a finalist without channel-link opt-in is credited without a link.
18. **Final Cut.** With a Drop page open on the stream, publishing moves it to the Final Cut within 5 s. The Final Cut plays intro, winner, credits and end card in order, and shows handles, opt-in links and the real split. The server-rendered HTML of both the Final Cut and the Drop page contains Open Graph title and image tags.
19. **Live state.** On connect, the stream sends the current state. Transitions arrive as `state` events, and countdown events arrive at the configured interval, 30 s by default. An event caused through one API process reaches a subscriber connected to another process.
20. **State machines.** A parametrized test over every pair of campaign states, and over every pair of entry and ballot states, confirms that only the listed transitions succeed through the API, that all others return 409 `illegal-transition`, and that the same illegal changes made with direct SQL fail. After every operation, campaign and ballot states agree.
21. **Ballot lock and brief lock.** The lock is refused for the same entry twice, an entry from another campaign, an entry not `in_review`, an entry without a ready asset or without editorial-use permission, and a `closes_at` that is not after `opens_at` or is in the past. A valid lock records both asset IDs and markers. Any later change to the finalists gets 409. Changing the live brief after `accepting_entries` gets 409.
22. **No spoilers.** In each campaign state before publish, no public Odyssey response contains vote counts, tallies or simulation fields.
23. **Lobby.** `/` shows the seeded drop and the next drop. After publish it shows the Temperrr Shot Final Cut as the latest Final Cut.
24. **Anomaly report.** With constructed votes in which one referral holds more than the configured share, the report flags that referral. The report contains no raw IPs or voter IDs, and publish is still allowed.

### M3 · Router and Scrims

25. **Scrim validation.** Invalid configs (variant count other than two, bots, rounds or seeds out of range, more interviews than bots, a budget of zero or less or above the cap) get 422 with field errors. A valid config gets 202 with a run ID, and its job is queued.
26. **Pairing.** In the recorded demo run, for each seed, variants A and B used identical persona sets, identical sets of active bots in every round and identical interviewed bots.
27. **Replay determinism.** A 5-bot, 2-round, 2-variant, 2-seed scrim is recorded with the fixture model and then replayed twice. Both replays produce results byte-identical to each other and to the recording (observations, paired summary, comprehension flags, themes and forecasts), and the test harness confirms zero network calls.
28. **Replay miss.** After one recorded response is removed, replay fails with a recording-mismatch error and status `failed`, and no provider call is attempted.
29. **Budget in fixture mode.** A run whose fixture costs exceed a small cap ends `over_budget`, makes no calls after the cap, keeps its completed observations, and builds the paired summary only from seeds where both variants finished.
30. **Budget contract in live mode.** Against a mock LiteLLM admin server, a run creates a key with alias `scrim-<run-id>`, the expected model list and `max_budget`, and deletes it after success, after failure and after running over budget.
31. **Paired summary.** Unit tests show that an interval entirely above zero names A, one entirely below zero names B, one that includes zero names no winner, and the same input always gives the same output.
32. **Scrims UI.** The run page shows progress, then the ranking with its interval and the note that it covers simulation noise only, the comprehension failures with the judge's reasons, the themes and the transcripts.
33. **Router config.** `infra/litellm/config.yaml` parses, defines the five aliases with one `bots-fast` deployment per provider key that exists (the source's second deployment needs a second key, A-35), carries explicit per-token costs on every deployment, and refers to keys only through `os.environ/`. The LiteLLM version check fails on a test fixture that mentions 1.82.7 or 1.82.8 and passes on the repository.
34. **Tools.** Unit tests show bot agents are built with only the allowed OASIS actions and no extra tools. Recorded judge and analyst requests carry no tools, and recorded bot turns carry no `response_format`.
35. **No real people in bots.** Persona generation receives no account IDs, and no generated persona name or handle matches the list of real people named in the source document.

### M4 · Learn loop

36. **Relay.** After the stage flow, every outbox row appears exactly once in `wh.events`. Two relays running concurrently over 1,000 pending rows produce exactly 1,000 warehouse rows and mark every outbox row as published.
37. **Outcome set.** Ending the reporting window in `DEMO_MODE` freezes an outcome set whose entrants and voters match the warehouse counts, including voters without analytics consent. Week-2 return is null and shows as "Pending". A second freeze changes nothing.
38. **Week-2 return.** On constructed events, the Ch. 17 query returns the expected ratio, and returns null without an error when week 1 has no accounts.
39. **Refit gate.** With fewer than 8 drops, the job records `shipped = false` and forecasts stay uncalibrated. On synthetic data with at least 8 drops, it ships when scrim features lower the held-out MAE and does not ship when they don't.
40. **VOD campaign view.** The page shows the predicted split against the actual split and the forecast ranges against actual entrants and voters. Predictions are labeled Simulated and Uncalibrated, and actuals are labeled as real.
41. **Sim vs Fans timing.** Before close, no Odyssey route returns simulation data. After publish, the Final Cut shows the predicted split beside the real split with the simulation label and calibration badge. A prediction registered after close is refused and never published.
42. **Backtests.** The seed holds the seven frozen cases, each with a recorded scrim. Editing a frozen case gets 409 through the API and an error through SQL. `POST /v1/vod/backtests` returns 202. The run processes cases in T0 order, and each case's calibration inputs all resolved before its T0. The scorecard reports cases counted and shown, and `ship = false` for the fixture-model run. The run makes no network calls.
43. **Masking.** Masked briefs and dossiers contain none of the case's entity names, aliases or hashtags. Dates are shifted by the case's offset, and masking the same case twice gives identical output.
44. **Scorecard math.** Unit tests on constructed rows check pinball loss, coverage, skill against B2 and the gate, including `counted = 0` giving `ship = false`. Unscorable metrics are shown and excluded from scoring.
45. **Prospective lock.** `POST /v1/vod/shadow` returns a SHA-256 hash that matches a recomputation from the stored canonical forecast, and later edits are refused.
46. **Lore `as_of`.** On constructed facts, search excludes facts whose valid range does not contain `as_of` and facts not known by `as_of`.

### M5 · Stage-ready

47. **Seed.** `make seed` on an empty, migrated database finishes within 5 minutes with no network. Running it again leaves the same demo state.
48. **Advance.** With `DEMO_MODE=1`, advance steps the seeded drop through each next state using the real operations: the close produces a frozen tally and a `ballot.closed` event, and the publish produces an episode. It returns 409 naming any missing precondition. With `DEMO_MODE=0`, the route returns 404 and Studio hides the control.
49. **Stage run.** A Playwright test, driving the installed Google Chrome through the `chrome` channel (D-2), runs the Ch. 8 script on seeded data in `DEMO_MODE`, with browser requests to non-local hosts blocked:
    1. the producer opens the drop in Studio and enters or confirms variants A and B;
    2. Scrims replays the recorded run and shows comprehension flags and the ranking;
    3. the analyst opens the MiroFish panel, follows its deep link to the pre-built project in MiroFish's own UI, and asks a simulated returning fan how they read variant A, and a reply appears (AC-64);
    4. the producer launches a variant, the Drop page shows it live, and the producer advances it to voting;
    5. a fan in a phone viewport signs in and calls it;
    6. the producer reviews the anomaly report, closes the ballot and publishes;
    7. the fan's page moves to the Final Cut, which shows creator links and the Sim vs Fans card, and VOD Review shows the logged result;
    8. the Partners page shows the same scrim beside the real result, both labeled.

    The script passes in full, with the live chat message in step 3, at final sign-off, and again after any later code change that could affect it. For stability, steps 1, 2 and 4 to 8 pass 3 consecutive runs with the chat message switched off, and step 3 still checks that the pre-built project loads in MiroFish's UI. The test saves a video of the full run.
50. **Labels everywhere.** On the Scrims run page, the VOD campaign page, the Partners page and the Final Cut, the number of simulated-value elements equals the number that carry both the "Simulated" tag and a calibration badge, and fixture-produced values also show the fixture marker. A negative type test shows the front-end type check fails when a simulated value is rendered without `<SimValue>`.
51. **Phone check (manual).** On a phone on the same network, the Drop page replay plays inline rather than fullscreen, and Call It completes. The result, with device and browser, is recorded in the final report.

### Cross-cutting

52. **Partner isolation.** Partner B's token gets 403 or 404 on partner A's activations and scrims, and partner routes accept no writes.
53. **Fan Council.**
    - A birth year that gives an age under 14 is refused, and nothing is stored.
    - Ages 14 to 15 without a guardian email get 422. With one, the enrolment is pending, and no member row or answers exist until the link is used.
    - The link enrols the fan once, a second click changes nothing, and an expired link is refused.
    - Ages 16 and up enrol immediately, with the consent version recorded.
    - Answers from non-members get 403.
    - The aggregate export omits a 19-member cohort and includes a 20-member cohort.
    - After a full run, no individual answers exist in `wh` or `lab`.
54. **Prompt injection.** In recorded prompts, the hostile Lore fact appears only inside the quoted-data block, with any sequence that would close the block neutralized. A fixture bot reply that calls a disallowed tool is ignored and logged.
55. **Containment.** After a full stage run, no `lore` or `odyssey` row holds simulated output except the episode's aggregate Sim vs Fans field, and no `odyssey.votes` row comes from a simulated fan.
56. **Quality gates.** ruff format check, ruff lint, the Python type check, ESLint, the Prettier check, `tsc --noEmit` and the api-client staleness check all exit 0.
57. **Secrets and preservation.** The secret scan passes, only `*.example` env files are tracked, and the original `.gitignore` line and the source document are unchanged. AC-71 covers the supplied keys.
58. **Log hygiene.** Logs captured during the vote, Fan Council and publish tests contain no JWTs, raw IPs, guardian emails or keys.
59. **Mode disclosure.** The status endpoints and the Signal Lab indicator report each integration's mode. In fixture mode every fixture-backed integration reads "fixture". MiroFish and its memory service read "live" or "unreachable" and never "fixture".
60. **Report.** The final report contains every section listed in FR-22.2. It lists each fixture-backed integration as verified or unverified with the reason, lists MiroFish and its memory service with the evidence from AC-64, and totals the live tokens and spend from the ledger against the NFR-10 ceilings.

### Live integrations and token policy (added in revision 2)

Criteria 63, 64, 68 and 69 spend real tokens through the user's key. They run only through the opt-in targets of NFR-10, each with a ceiling the design sets after Q-6 answers the key's limits. The other criteria in this group spend none.

61. **MiroFish up.** With the Docker engine running, the documented command starts the pinned MiroFish (the commit or digest recorded in the repository). Its frontend on port 3000 and its backend on port 5001 respond with 200, and the readiness check (FR-18.8) passes with zero LLM requests.
62. **MiroFish wiring.** MiroFish's configuration shows `LLM_BASE_URL` set to the router, `LLM_MODEL_NAME` set to `analyst`, an `LLM_API_KEY` that is a router virtual key (neither the master key nor the provider key), and a `ZEP_API_KEY` that is not a placeholder. The router reports that key's budget and rate limits. From inside MiroFish's containers, connections to PostgreSQL and Redis fail.
63. **Pre-built project.** A MiroFish project built from the content pack exists, loads in MiroFish's UI after its containers are restarted, and its build spend is in the ledger and within its ceiling.
64. **Live chat.** In MiroFish's own UI, an analyst sends one question to a simulated returning fan and receives a non-empty reply within a documented timeout. The router's spend log shows at least one request under MiroFish's key alias during that interval. A Playwright screenshot or video is saved. At most two messages are sent per verification run.
65. **Memory boundary.** An allowlist test shows the setup script uploads only files from the content pack. A scan of the pack finds no account IDs, email addresses, Fan Council answers, votes or Scrims output.
66. **Unreachable state.** With MiroFish stopped, the Signal Lab MiroFish panel reads "unreachable", step 3 of the stage run fails and is not skipped, and nothing appears as MiroFish output. The emergency backup (FR-18.11) shows only after an explicit operator switch, always under the "RECORDED BACKUP, NOT LIVE" banner, and a run that used it is reported as not live-verified.
67. **Honest blocking.** If the memory-service key is rejected, the provider quota is exhausted or no usable model exists, the live checks report "not verified" with the reason, the final report lists MiroFish as unverified, and no stand-in is shipped.
68. **Router live smoke.** One tiny scrim (at most 5 bots, 2 rounds, 2 variants, 2 seeds and 2 interviews per variant) runs through the real router and the supplied provider on a run key with a budget. Results appear, the key is deleted afterwards, and replaying the run makes no calls and returns byte-identical results. Its tokens and spend are in the ledger.
69. **Budget binds for real.** A key with a deliberately tiny budget makes the router refuse a call once that budget is spent, and the run ends `over_budget`. This check uses a handful of requests at most.
70. **Token policy.** Default test targets make no connection to any LLM provider hostname, and the test harness asserts it. Live targets print their ceiling and refuse to run without the confirmation flag. The ledger records every live check, and the report totals it.
71. **Key handling.** The supplied provider key and the Zep key appear only in gitignored env files. A scan finds neither value in tracked files, untracked files that are not ignored, git history, logs, test output, Playwright traces and videos, or generated reports. The `.env*` ignore rules exist before any env file with a real value is created.
72. **Data egress.** On the recorded provider requests of AC-68 and on the MiroFish build, an assertion finds no account ID, email address, vote, Fan Council answer or first-party analytics value in anything sent to the provider or to MiroFish's memory service.
73. **Live chain.** The verification command of FR-18.10 reports all eight steps as passed, each with evidence: the Zep response status for the graph call, the router's spend-log row for the Gemini call, the MiroFish project ID, the graph's node and edge counts from MiroFish's API, the simulation status moving to running, a growing action count in the OASIS run's own database, the chat reply text, and the Playwright capture of that reply inside Signal Lab's stage flow. Reading the code or the logs of a mock does not count, and a step that did not hit the real service is "not run".
74. **No substitute in the repository.** A scan of the source finds no NetworkX, mock, canned or recorded response wired into the MiroFish path, except the labeled emergency backup, and a test shows the backup is off by default and switches on only by explicit operator action.
75. **Docker limits.** Colima is configured with at most 4 CPUs, 8 GB of memory and 30 GB of disk, `colima status` and `docker info` show those values, and the images built for this project fit within the disk limit with the sizes reported.
76. **Model availability.** The recorded result of FR-11.5 shows each configured model passed both the `models.get` and the generation check before the router config named it.

## 6. Out of scope (follow-up work, must not block the MVP)

**Marked DLC, later or post-pilot in the source**
- The rest of the Homecoming season: Week 2 Call the Play, Week 3 Editor Relay and Week 4 Finale. The next drop is seeded only as a Lobby teaser.
- Merch and creator-signing simulations, crisis rehearsal, a live partner portal and watch parties.
- Revenue and sponsor-value forecasts.
- A Twitch-style OASIS platform, and simulating video views, subs or live chat.
- Splitting the cluster into separate databases after the pilot.

**Product surface outside Ch. 8**
- Send It: uploads, link ingestion, Mux webhooks and the receipt page. Studio's entry review queue and reviewer workflows. Entry withdrawal.
- The Vault UI, Calling Card pages, Fan Council rewards (badge and early look), and the "I remember this era" and "Catch me up" entry paths.
- Replacing finalists after lock, ballot re-versioning and re-vote prompts. Anonymous preview votes and device fingerprinting.
- Live brief A/B tests, where different fans see different live variants.
- Three-variant scrims (the source allows two to three) and the bot-count sweep that finds the smallest stable crowd.
- Live vote tallies before close.
- Rendering the Final Cut as a single file, reveal reminders by email or web push, and caption generation and transcript review.
- The FaZe Lore UI and write routes (`POST /v1/lore/facts`, `POST /v1/lore/aliases`), embeddings and semantic search, LLM fact extraction and the review workflow.
- The `/settings/llm` page and editing router aliases through LiteLLM's admin API.
- The Partners recap PDF.
- Analytics CSV imports and raking, deriving cohort weights from the warehouse, hierarchical calibration, and parameter or calibration uncertainty in the paired interval.
- Prospective cases beyond the one forecast locked for the demo, and monitoring outside events.

**Operations and verification**
- The k6 load test (target recorded in NFR-5).
- Production deployment, CDN, TLS and horizontal scaling.
- Live recordings of the full-size demo scrim (100 bots, 6 rounds, 10 seeds, about 8 million tokens by the source's estimate) and of the seven backtest scrims. The supplied key is token-limited, so these are recorded with the fixture model (A-18). Only the small checks in AC-63, AC-64, AC-68 and AC-69 use the real provider.
- More than one MiroFish project, and MiroFish simulations beyond the one small pre-built project.
- Verifying the Supabase and Mux integrations, because no credentials for them were supplied. They are reported as unverified.
- Creating git commits or pushing; the task does not ask for either.

## 7. Assumptions

Each item is an inference where the source is silent or ambiguous. The design review should challenge any that don't hold up.

| ID | Assumption |
| --- | --- |
| A-1 | MVP scope is Ch. 8, the five Ch. 21 milestones and the task's list. Other chapters shape behavior but add no screens. Appendix fixes apply where Part II adopted them, plus App. A #10 (database-enforced transitions), which the task's emphasis on state transitions calls for. |
| A-2 | The repository root is the workspace root. Ch. 10's `faze-odyssey/` folder maps to `NewFaze/`. |
| A-3 | The untracked source document stays as it is. `.gitignore` keeps its one existing line, and the env-file rules from FR-1.3 are appended below it. |
| A-4 | The campaign transition table in FR-3.2 is inferred. The source lists the states but no transitions. |
| A-5 | Pausing keeps `closes_at`, resuming returns to the previous state, and votes stay refused once the deadline has passed. |
| A-6 | A campaign has one live brief, locked when it reaches `accepting_entries`. |
| A-7 | Finalists are fixed after lock, and the ballot version stays 1 in the MVP. |
| A-8 | Only the `fan` role votes. Staff and partner accounts do not. |
| A-9 | Votes fail closed with 503 when Redis is unavailable, trading availability for vote integrity. |
| A-10 | The design chooses the tie rule. It must be deterministic and disclosed in the episode. |
| A-11 | Both finalists are credited in the Final Cut. Channel links require the creator's opt-in. |
| A-12 | The source does not say how a scrim of brief variants predicts the split between two finalists. Assumed: the scrim's bots are interviewed on text descriptions of the two locked finalists, their choices are weighted by cohort, and the result is registered with Odyssey before the ballot closes. |
| A-13 | Partners see real results only after publish, and see no raw bot transcripts. |
| A-14 | The seed contains no votes, so every vote in the demo is cast live through the API. |
| A-15 | Seeded creators, fans and the sponsor are fictional, and their channel links use reserved domains such as `example.com`. Real people appear only in the cited historical facts and backtest cases. |
| A-16 | All clips are synthetic placeholders, including the "original" Temperrr Shot reference. |
| A-17 | No FaZe toolkit was supplied, so tokens are placeholders and the mark is a text wordmark until the toolkit is added. |
| A-18 | The fixture model is a deterministic local stand-in. Because the supplied key is token-limited, it records the full-size demo scrim, the backtest scrims, probes, judge grades and themes. The real provider is used only for the small live checks (A-39). Fixture outputs are labeled and are not evidence of how a real model behaves. |
| A-19 | The fixture model has no training cutoff, so no backtest case counts as clean, the scorecard counts zero cases and `ship = false`. This matches Ch. 18's expectation that the demo shows "the machinery, the labels and a first scorecard, not a ship decision". A real model would have a cutoff, but live backtest recordings are out of scope (section 6). |
| A-20 | Backtest seed data uses only the numbers and links in the source. Fields the source does not provide (archive URLs, capture dates, audience sizes for B0 and B1) are left empty or marked as analyst placeholders, and the scorecard shows that. |
| A-21 | With only a birth year, age is the youngest possible: current year minus birth year minus 1. Borderline fans need guardian consent, or wait a year to join. |
| A-22 | Guardian email uses an adapter, with a dev mailbox in fixture mode. Choosing a real email provider is follow-up work. |
| A-23 | Each account has an analytics-consent flag. Demo accounts are seeded as consented, except one that is not, so tests exercise the rule. |
| A-24 | The demo scrim uses the source's proposed size: 100 bots in 3 cohorts, 6 rounds, 20 interviews, 2 variants and 10 seeds. The design may use fewer seeds to meet NFR-5 if it documents the change. |
| A-25 | The paired interval covers seed-to-seed noise only, and the UI says so. |
| A-26 | With too little history, forecasts use a documented default range, labeled uncalibrated. |
| A-27 | Backfilled Lore facts count as known from their source's publication date, not from ingestion time. This weakens "what we knew at T0" for historical cases, and the design review should confirm it. |
| A-28 | In the native run, internal routes are isolated by a listener bound to loopback only. |
| A-29 | Validation uses both stacks. The native stack (D-1) runs the fast tests, and the Docker stack runs `docker compose up` and MiroFish. Nothing is reported as verified on a stack that was not actually run. |
| A-30 | Python 3.11 comes from uv; JavaScript uses npm workspaces on Node 24; Next.js is the current stable release when implementation starts. |
| A-31 | Local Redis may be 8.x from Homebrew while the compose file pins Redis 7. arq works on both. |
| A-32 | The demo's cohort weights are seeded. No demo cohort reaches 20 Fan Council members, so the Council export stays empty during the demo by design. |
| A-33 | MVP scrims always compare exactly two variants. |
| A-34 | Resolved by the user (D-6): the key is a Google Gemini Developer API key. Its quota and rate limits are still unknown, so ceilings stay small and live checks stop at the first quota error. |
| A-35 | One provider backs all five router aliases, because only one key exists. The roles stay distinct in the config, so adding providers later is a config edit. The source's second `bots-fast` deployment needs a second provider key, so the MVP config has one. |
| A-36 | Resolved (D-5): the memory service is Zep Cloud for MiroFish v0.1.2, and the user supplied the key. |
| A-37 | Resolved (D-8): the user authorized Colima, Homebrew's Docker CLI and the Docker Compose plugin, and ruled out Docker Desktop and OrbStack. |
| A-38 | The pre-built MiroFish project is small, at most about 10 agents and 3 rounds. The design sizes it from a measured token cost and the key's limits. |
| A-39 | Live provider use is limited to these checks: the pre-flight (A-34), the small scrim in AC-68, the budget check in AC-69, and the MiroFish build and chat (AC-63, AC-64). Everything else replays recordings or uses the fixture model. |
| A-40 | The user's note "keep a placeholder for now" is satisfied by the committed `*.example` templates holding placeholders. The real key goes only into gitignored files, and it has not been written to disk by this step. |

## 8. Decisions and open items

### Decisions from the user (2026-11-14)

| ID | Question | Decision | Effect |
| --- | --- | --- | --- |
| D-1 | Q-1, local infrastructure | Option (a): Homebrew `postgresql@16` and `redis`, with pgvector 0.8.x built from source against PostgreSQL 16. | The native test stack matches the source's PostgreSQL 16. FR-1.10 covers the setup. |
| D-2 | Q-2, Playwright browser | Yes, use the installed Google Chrome through the `chrome` channel. | AC-49 and the phone-width checks run on Chrome. |
| D-3 | Q-3, MiroFish | MiroFish must run live in Docker, with a configured LLM API key and its required memory service. A link plus recorded interview answers is not acceptable. The live integration is implemented and verified as part of the stage-ready demo. | FR-18 has no fixture path. AC-61 to AC-67 verify it. Docker becomes a requirement (A-37), and Q-5 blocks the verification. |
| D-4 | Q-4, credentials | A provider key was supplied in chat. It is token-limited, so test conservatively. | NFR-10 sets the token policy. FR-1.3 and AC-71 set where the key may live. |
| D-5 | Q-5, memory-service key | A Zep Cloud key was supplied. Use it for the mandatory live MiroFish integration. Store it only in a gitignored env file with mode 600. Never commit, print, log, echo, screenshot or document it, and redact it from all errors and output. | Saved to `infra/.env.mirofish` (mode 600, gitignored). FR-18.12 and AC-71 enforce the handling. |
| D-6 | Q-6, provider and models | The key is a Google Gemini Developer API key. Use `gemini-2.5-flash` for MiroFish, `analyst` and `judge`, and `gemini-2.5-flash-lite` for bot turns. Verify both are available to the key before configuring LiteLLM. Route MiroFish through a dedicated budgeted LiteLLM virtual key. | FR-11.1 and FR-11.5. The check failed, so Q-9 is open. Saved to `infra/.env.llm` (mode 600, gitignored). |
| D-7 | Q-7, Docker resources | Docker may use up to 4 CPU cores, 8 GB RAM and 30 GB disk. Do not exceed them without asking. | AC-75. The host has 12 CPUs, 36 GB RAM and 166 GB free. |
| D-8 | Q-8, Docker engine | Use Colima, Homebrew's Docker CLI and the Docker Compose plugin, not Docker Desktop or OrbStack. | FR-1.10 and A-37. |
| D-9 | Scope | Live MiroFish is mandatory and verified end to end by the eight steps of FR-18.10. Recorded output may exist only as a clearly labeled emergency backup. The user also said to continue through design, implementation and live verification, and to report success only if the real services were exercised. | FR-18.10 to FR-18.12, AC-73 and AC-74. |

The user's text for D-3 first said to keep a placeholder for the LLM key, then supplied one under D-4. A-40 reads both as satisfied: templates hold placeholders, and the real key stays in gitignored files.

### Open items

Q-5, Q-7 and Q-8 are closed by D-5, D-7 and D-8. Q-6 is closed except for the key's quota, which stays unknown.

- **Q-9 Model availability (blocks the Gemini and MiroFish live steps).** On 2026-11-14 the check of FR-11.5 found that `gemini-2.5-flash` and `gemini-2.5-flash-lite` are listed for the key by `models.get`, but generation with either returns 404 with the message "no longer available to new users". The API names `gemini-3.8-flash` and `gemini-3.5-flash-lite` as the successors. The user asked for the two 2.5 models and a check before configuring LiteLLM, and the check failed, so nothing is configured. A follow-up call that listed the models the key can use was declined. Decision needed: may the build verify the two named successors (free `models.get` plus one generation of at most 8 output tokens each) and use them if they pass? Their prices and reasoning-token behavior differ from the 2.5 models, so the token ceilings in NFR-10 get re-set after the check. Until the user decides, the router config reads model IDs from the environment, and no live step that needs a model runs.
- **Key quota (unknown).** The key's rate limits and any spend cap are not known. Ceilings stay small, and live checks stop at the first quota error (AC-67).
- **Key hygiene.** Both keys were pasted into a chat transcript. Rotate them after the hackathon, and treat them as exposed to anyone with access to that transcript.

## 9. Traceability to the task

| Task item | Requirements | Acceptance criteria |
| --- | --- | --- |
| Two Next.js apps | FR-8, FR-9, FR-14, FR-15 | 8, 18, 23, 32, 40, 49 |
| Two FastAPI services, Odyssey sole owner of campaign state | FR-3.1, FR-4, FR-5, FR-9.2 | 4, 6, 20 |
| Schemas, migrations, Redis and arq workers, transactional outbox | FR-1.5, FR-3.8, FR-13 | 3, 36 |
| Seeded Temperrr Shot drop with pre-ingested synced replay | FR-8.2, FR-20, FR-21.2 | 8, 9, 47, 51 |
| Signed-in voting, one current vote per voter | FR-6 | 10 to 14 |
| Server-authoritative, atomic ballot close | FR-4.3, FR-6.3, FR-6.4 | 11, 14, 15 |
| Idempotent publishing, Final Cut with creator credits | FR-7 | 16, 17, 18 |
| Paired two-variant scrim with identical bots and seeds | FR-10.3 to FR-10.7 | 26, 31 |
| Per-run budgets, deterministic recorded replay | FR-10.10 to FR-10.12 | 27 to 30 |
| Simulated and calibration labels on every simulated value | FR-12 | 41, 50 |
| Warehouse outcomes, VOD Review, Sim vs Fans, sponsor view | FR-13, FR-14, FR-15 | 36 to 46, 52 |
| DEMO_MODE, state advance, Playwright stage flow | FR-4.5, FR-21 | 47, 48, 49 |
| Adapters and fixtures, no fabricated integrations | 2.5, FR-2.3, FR-18, FR-20, FR-21.4 | 7, 59, 60, 66, 67 |
| MiroFish live in Docker with an LLM key and its memory service (Q-3, Q-5) | FR-18, FR-1.10, NFR-10, NFR-11 | 49, 61 to 67, 72 to 74 |
| Gemini models verified before LiteLLM is configured, MiroFish on its own budgeted key (Q-6) | FR-11.1, FR-11.5, FR-18.3 | 62, 69, 76 |
| Docker within 4 CPUs, 8 GB RAM, 30 GB disk, using Colima (Q-7, Q-8) | FR-1.4, FR-1.10 | 2, 75 |
| Eight-step live MiroFish verification, no substitutes | FR-18.10 to FR-18.12 | 73, 74 |
| Conservative use of the token-limited key (Q-4) | NFR-10, FR-1.3, FR-11.1 | 68 to 71 |
| Local PostgreSQL 16, Redis and Chrome for Playwright (Q-1, Q-2) | FR-1.4, FR-1.10 | 2, 49 |
| Security, privacy, Fan Council consent, prompt injection | FR-2, FR-6.6, FR-6.8, FR-17, FR-19, NFR-1 | 5, 6, 13, 24, 53, 54, 55, 57, 58 |
| State transitions, idempotency, concurrency | FR-3, FR-4.2 | 12, 14, 16, 20, 21 |
| No LiteLLM 1.82.7 or 1.82.8 | FR-11.3 | 33 |
| Formatting, linting, types, migrations, tests, compose, Playwright | NFR-9, section 5 | 1, 3, 14, 16, 27, 49, 56 |
| Final report contents | FR-22 | 60 |
