#!/usr/bin/env bash
# Local PostgreSQL 16 + pgvector + Redis for the native run path (decision D-1).
# Safe to re-run. It only touches Homebrew's own PostgreSQL 16 and Redis.
# Usage: scripts/local_db.sh install | up | down | reset
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_PREFIX="/opt/homebrew/opt/postgresql@16"
PG_BIN="$PG_PREFIX/bin"
PGVECTOR_TAG="${PGVECTOR_TAG:-v0.8.7}"
export PATH="$PG_BIN:$PATH"

say() { printf '%s\n' "$*"; }

load_env() {
  # Export only the variables this script needs. Values are never printed.
  [ -f "$ROOT/infra/.env" ] || { say "infra/.env missing. Run: make env"; exit 2; }
  while IFS='=' read -r key value; do
    case "$key" in
      DATABASE_NAME|OWNER_DB_PASSWORD|ODYSSEY_DB_PASSWORD|LAB_DB_PASSWORD|RELAY_DB_PASSWORD|WORKERS_DB_PASSWORD|LITELLM_DB_PASSWORD)
        export "$key=$value" ;;
    esac
  done < <(cat "$ROOT/infra/.env" "$ROOT"/infra/.env.owner "$ROOT"/infra/.env.odyssey "$ROOT"/infra/.env.lab "$ROOT"/infra/.env.relay "$ROOT"/infra/.env.workers)
}

install_pgvector() {
  if [ -f "$PG_PREFIX/share/postgresql@16/extension/vector.control" ] || \
     [ -f "$("$PG_BIN/pg_config" --sharedir)/extension/vector.control" ]; then
    say "pgvector already installed for PostgreSQL 16"
    return
  fi
  command -v clang >/dev/null || { say "clang not found. Install the Xcode command-line tools: xcode-select --install"; exit 3; }
  local src="$ROOT/.local/build/pgvector"
  mkdir -p "$ROOT/.local/build"
  if [ ! -d "$src" ]; then
    git clone --depth 1 --branch "$PGVECTOR_TAG" https://github.com/pgvector/pgvector.git "$src"
  fi
  say "Building pgvector $PGVECTOR_TAG against $("$PG_BIN/pg_config" --version)"
  ( cd "$src" && make PG_CONFIG="$PG_BIN/pg_config" >/dev/null && make PG_CONFIG="$PG_BIN/pg_config" install >/dev/null )
  say "pgvector installed"
}

start_services() {
  brew services start postgresql@16 >/dev/null
  brew services start redis >/dev/null
  for _ in $(seq 1 30); do
    "$PG_BIN/pg_isready" -q -h localhost -p 5432 && break
    sleep 1
  done
  "$PG_BIN/pg_isready" -h localhost -p 5432
  for _ in $(seq 1 15); do
    [ "$(redis-cli ping 2>/dev/null)" = "PONG" ] && break
    sleep 1
  done
  say "redis: $(redis-cli ping)"
}

psql_admin() { "$PG_BIN/psql" -h localhost -p 5432 -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

create_roles_and_database() {
  load_env
  # Passwords are passed through psql variables read from the environment, not the command line.
  OWNER_PW="$OWNER_DB_PASSWORD" ODY_PW="$ODYSSEY_DB_PASSWORD" LAB_PW="$LAB_DB_PASSWORD" \
  RELAY_PW="$RELAY_DB_PASSWORD" WORK_PW="$WORKERS_DB_PASSWORD" DB="$DATABASE_NAME" \
  psql_admin <<'SQL'
\getenv owner_pw OWNER_PW
\getenv ody_pw ODY_PW
\getenv lab_pw LAB_PW
\getenv relay_pw RELAY_PW
\getenv work_pw WORK_PW
\getenv dbname DB
SELECT format('CREATE ROLE faze_owner LOGIN PASSWORD %L CREATEROLE', :'owner_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'faze_owner') \gexec
SELECT format('ALTER ROLE faze_owner PASSWORD %L', :'owner_pw') \gexec
SELECT format('CREATE ROLE odyssey_app LOGIN PASSWORD %L', :'ody_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'odyssey_app') \gexec
SELECT format('ALTER ROLE odyssey_app PASSWORD %L', :'ody_pw') \gexec
SELECT format('CREATE ROLE lab_app LOGIN PASSWORD %L', :'lab_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_app') \gexec
SELECT format('ALTER ROLE lab_app PASSWORD %L', :'lab_pw') \gexec
SELECT format('CREATE ROLE relay LOGIN PASSWORD %L', :'relay_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'relay') \gexec
SELECT format('ALTER ROLE relay PASSWORD %L', :'relay_pw') \gexec
SELECT format('CREATE ROLE workers_rw LOGIN PASSWORD %L', :'work_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workers_rw') \gexec
SELECT format('ALTER ROLE workers_rw PASSWORD %L', :'work_pw') \gexec
SELECT format('CREATE DATABASE %I OWNER faze_owner', :'dbname')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname') \gexec
SELECT format('CREATE DATABASE %I OWNER faze_owner', :'dbname' || '_test')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname' || '_test') \gexec
SQL
  say "roles and databases ready (demo database and a separate _test database for pytest)"
}

enable_extension() {
  load_env
  # The extension is created once by the local superuser, so the app roles never need superuser rights.
  for db in "$DATABASE_NAME" "${DATABASE_NAME}_test"; do
    "$PG_BIN/psql" -h localhost -p 5432 -d "$db" -q -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
  done
  say "extension vector enabled in $DATABASE_NAME and ${DATABASE_NAME}_test"
}

case "${1:-}" in
  install) install_pgvector; start_services; create_roles_and_database; enable_extension ;;
  up)      start_services; create_roles_and_database ;;
  down)    brew services stop redis >/dev/null || true; brew services stop postgresql@16 >/dev/null || true; say "stopped" ;;
  reset)
    load_env
    start_services
    psql_admin -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\" WITH (FORCE)"
    create_roles_and_database; enable_extension ;;
  *) say "usage: $0 install|up|down|reset"; exit 2 ;;
esac
