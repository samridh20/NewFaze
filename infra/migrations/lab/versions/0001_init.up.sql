-- lab: Signal Lab runs, models, Studio drafts and backtests. Source: Ch. 13, Ch. 18.
create schema if not exists lab;

create table lab.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fictional boolean not null default true
);
create table lab.activations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references lab.partners,
  campaign_slug text not null,
  name text not null,
  placement text not null,
  creative jsonb not null default '{}'::jsonb
);

create table lab.studio_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  title text not null check (char_length(title) between 1 and 120),
  format text not null check (format in ('recreate_the_shot','call_the_play','editor_relay')),
  chosen_variant text check (chosen_variant in ('A','B')),
  scrim_run_id uuid,
  sponsor_partner_id uuid references lab.partners,
  created_by text not null,
  created_at timestamptz not null default now()
);
create table lab.studio_variants (
  campaign_id uuid not null references lab.studio_campaigns,
  variant text not null check (variant in ('A','B')),
  body_md text not null check (char_length(body_md) between 1 and 20000),
  rules jsonb not null default '{}'::jsonb,
  primary key (campaign_id, variant)
);

create table lab.scrim_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references lab.studio_campaigns,
  partner_id uuid references lab.partners,
  status text not null default 'queued'
    check (status in ('queued','running','done','failed','over_budget')),
  mode text not null check (mode in ('record','fixture','replay')),
  provider text not null default 'fixture',
  replay_of uuid references lab.scrim_runs,
  config jsonb not null,
  key_alias text,
  budget_usd numeric(10,2) not null check (budget_usd > 0),
  spend_usd numeric(10,4) not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  failure_reason text,
  progress jsonb not null default '{"done": 0, "total": 0}'::jsonb,
  results jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table lab.scrim_bots (
  run_id uuid not null references lab.scrim_runs,
  bot_id int not null,
  cohort text not null check (cohort in ('returning','newcomer','creator')),
  weight numeric not null,
  persona jsonb not null,
  primary key (run_id, bot_id)
);

create table lab.scrim_observations (
  run_id uuid not null references lab.scrim_runs,
  variant text not null check (variant in ('A','B')),
  seed int not null,
  metrics jsonb not null,
  primary key (run_id, variant, seed)
);

create table lab.llm_calls (
  id bigserial primary key,
  run_id uuid not null references lab.scrim_runs,
  request_hash text not null,
  occurrence int not null,
  request jsonb not null,
  response jsonb not null,
  model_alias text,
  provider text not null default 'fixture',
  cost_usd numeric(10,6) not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, request_hash, occurrence)
);

create table lab.forecasts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references lab.studio_campaigns,
  scrim_run_id uuid references lab.scrim_runs,
  model_version text,
  metric text not null check (metric in ('entrants','voters','week2_return')),
  p10 numeric, p50 numeric, p90 numeric,
  calibrated boolean not null default false,
  created_at timestamptz not null default now()
);

create table lab.calibration_models (
  version text primary key,
  trained_at timestamptz not null default now(),
  features text[] not null,
  n_drops int not null default 0,
  baseline_mae numeric, model_mae numeric, coverage_80 numeric,
  shipped boolean not null
);

create table lab.backtest_cases (
  id text primary key,
  version int not null default 1,
  family text not null check (family in ('recruitment','subathon','creator_event','drop')),
  title text not null,
  t0 timestamptz not null,
  resolves_at timestamptz not null,
  brief jsonb not null,
  entities text[] not null default '{}',
  known_at_t0 jsonb,
  questions jsonb not null,
  outcomes jsonb not null,
  baseline jsonb not null,
  split text not null check (split in ('dev','holdout','prospective')),
  frozen_at timestamptz,
  forecast_sha256 text,
  forecast jsonb
);
create table lab.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_version text not null,
  model_alias text not null, model_id text not null,
  model_cutoff date,
  split text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  scorecard jsonb,
  started_at timestamptz not null default now(), finished_at timestamptz
);
create table lab.backtest_results (
  run_id uuid not null references lab.backtest_runs,
  case_id text not null references lab.backtest_cases,
  metric text not null,
  clean boolean not null, leaky boolean not null, shock boolean not null,
  probe jsonb, scrim_run_id uuid,
  p10 numeric, p50 numeric, p90 numeric,
  b2_p10 numeric, b2_p50 numeric, b2_p90 numeric,
  b1 numeric, actual numeric,
  primary key (run_id, case_id, metric)
);

create table lab.mirofish_project (
  id int primary key default 1 check (id = 1),
  pin text not null,
  project_id text, graph_id text, simulation_id text, agent_id int,
  zep_graph_name text,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- A frozen backtest case never changes; a correction is a new version (Ch. 18).
create function lab.guard_frozen_case() returns trigger language plpgsql as $$
begin
  if old.frozen_at is not null then
    raise exception using errcode = 'P0001', message = 'case-frozen: frozen cases cannot change';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger backtest_case_frozen before update or delete on lab.backtest_cases
  for each row execute function lab.guard_frozen_case();

-- A prospective forecast hash is written once.
create function lab.guard_forecast_hash() returns trigger language plpgsql as $$
begin
  if old.forecast_sha256 is not null and (new.forecast_sha256 is distinct from old.forecast_sha256
       or new.forecast is distinct from old.forecast) then
    raise exception using errcode = 'P0001', message = 'forecast-locked: a locked forecast cannot change';
  end if;
  return new;
end $$;
-- Applies only to rows that are still unfrozen, since frozen rows are already blocked above.
create trigger backtest_forecast_locked before update on lab.backtest_cases
  for each row execute function lab.guard_forecast_hash();

grant usage on schema lab to lab_app, workers_rw;
grant select, insert, update, delete on all tables in schema lab to lab_app, workers_rw;
grant usage, select on all sequences in schema lab to lab_app, workers_rw;
