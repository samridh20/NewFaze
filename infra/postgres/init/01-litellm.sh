#!/bin/sh
# Runs once, when the compose PostgreSQL volume is first created. LiteLLM gets its own database and login,
# separate from the app schemas (FR-1.2).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<EOSQL
CREATE ROLE litellm LOGIN PASSWORD '${LITELLM_DB_PASSWORD}';
CREATE DATABASE litellm OWNER litellm;
EOSQL
