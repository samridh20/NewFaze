-- lore: FaZe Lore with two timelines on every fact. Source: Ch. 13, App. B #13.
create schema if not exists lore;
create extension if not exists vector;

create table lore.entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  canonical_name text not null
);
create table lore.aliases (
  entity_id uuid not null references lore.entities,
  alias text not null,
  valid tstzrange not null default tstzrange(null, null)
);
create table lore.facts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references lore.entities,
  predicate text not null,
  object_id uuid references lore.entities,
  value jsonb,
  valid tstzrange not null,
  recorded_at timestamptz not null default now(),
  -- When the world could have known this fact. Backfilled history uses its source's publication date (A-27).
  known_from timestamptz not null default now(),
  source_url text,
  confidence real check (confidence between 0 and 1),
  reviewed_by uuid,
  demo_authored boolean not null default false,
  hostile_test boolean not null default false
);
create index facts_valid_idx on lore.facts using gist (valid);
create table lore.chunks (
  id uuid primary key default gen_random_uuid(),
  source_url text,
  body text,
  embedding vector(1024),
  known_from timestamptz not null
);

grant usage on schema lore to lab_app, workers_rw;
grant select, insert, update, delete on all tables in schema lore to lab_app;
grant select on all tables in schema lore to workers_rw;
