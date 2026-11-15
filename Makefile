# FaZe Odyssey. Every command in the docs is one of these targets.
# Native path: services on the host against Homebrew PostgreSQL 16 and Redis.
# Compose path: the same services in Colima (4 CPU, 8 GiB, 30 GiB), with the real LiteLLM router.

SHELL := /bin/bash
UV := uv
PY := $(UV) run --no-sync python

.PHONY: help env setup setup-python setup-node db-install db-up db-down db-reset migrate seed \
        test test-unit test-integration lint fmt typecheck check compose-check compose-up compose-down \
        live-check-gemini live-check-zep secret-scan litellm-guard

help:
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

env: ## Create infra/.env* with random secrets (never overwrites supplied keys)
	python3 scripts/gen_env.py

setup: env setup-python setup-node ## Install Python 3.11 deps and npm workspace deps

setup-python: ## uv sync every workspace member (includes torch via camel-oasis)
	$(UV) sync --python 3.11 --all-packages
	$(MAKE) fix-pth

fix-pth: ## macOS marks uv's editable .pth files hidden, and Python skips hidden .pth files
	@if [ "$$(uname)" = "Darwin" ]; then chflags nohidden .venv/lib/python3.11/site-packages/*.pth; fi

setup-node:
	npm install

db-install: ## Build pgvector against Homebrew PostgreSQL 16 and start PostgreSQL and Redis
	bash scripts/local_db.sh install

db-up: ## Start PostgreSQL 16 and Redis, create the database and login roles
	bash scripts/local_db.sh up

db-down:
	bash scripts/local_db.sh down

db-reset: ## Drop and recreate the local database (destructive, local only)
	bash scripts/local_db.sh reset

migrate: ## Upgrade all four schemas to head
	$(PY) infra/migrations/run.py upgrade

seed: ## Reset the demo to its starting state (DEMO_MODE only, no network)
	$(PY) seeds/seed.py

test-unit:
	$(UV) run --no-sync pytest tests/unit -q

test-integration:
	$(UV) run --no-sync pytest tests/integration -q

test: test-unit test-integration ## No provider calls (NFR-10)

lint:
	$(UV) run --no-sync ruff check .
	$(UV) run --no-sync ruff format --check .
	npm run lint

fmt:
	$(UV) run --no-sync ruff format .
	$(UV) run --no-sync ruff check --fix .
	npm run format

typecheck:
	$(UV) run --no-sync mypy services scripts
	npm run typecheck

secret-scan: ## Fail if a key-shaped string is in a tracked or unignored file
	$(PY) scripts/secret_scan.py

litellm-guard: ## Fail if LiteLLM 1.82.7 or 1.82.8 is referenced anywhere
	$(PY) scripts/litellm_version_guard.py

check: lint typecheck secret-scan litellm-guard test ## All quality gates

compose-check:
	docker compose --env-file infra/.env --env-file infra/.env.owner -f infra/docker-compose.yml config --quiet

compose-up:
	docker compose --env-file infra/.env --env-file infra/.env.owner -f infra/docker-compose.yml up -d --build

compose-down:
	docker compose --env-file infra/.env --env-file infra/.env.owner -f infra/docker-compose.yml down

# ---- Live targets spend real tokens. They print a ceiling and need CONFIRM_LIVE=1 (NFR-10). ----
live-check-gemini: ## Needs CONFIRM_LIVE=1. Checks the key can see and generate with each model
	@test "$$CONFIRM_LIVE" = "1" || (echo "Refusing: this spends provider tokens (about 40 total). Re-run with CONFIRM_LIVE=1"; exit 2)
	$(PY) scripts/check_gemini.py $(if $(MODELS),--models=$(MODELS),)

live-check-zep: ## Read-only Zep check (no tokens)
	$(PY) scripts/check_zep.py
