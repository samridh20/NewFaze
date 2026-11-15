-- wh: the warehouse the outbox fills. Source: Ch. 13, Ch. 17.
create schema if not exists wh;

create table wh.events (
  event_id uuid primary key,
  topic text not null,
  version int not null,
  occurred_at timestamptz not null,
  campaign_id uuid,
  brief_version_id uuid,
  account_id uuid,
  session_id text,
  referral text,
  props jsonb
);
create index events_campaign_topic_idx on wh.events (campaign_id, topic);

create table wh.outcome_sets (
  campaign_id uuid not null,
  brief_version_id uuid not null,
  window_start timestamptz,
  window_end timestamptz,
  entrants int,
  voters int,
  week2_return numeric,
  frozen_at timestamptz,
  primary key (campaign_id, brief_version_id)
);

-- A frozen outcome set never changes (FR-13.3).
create function wh.guard_frozen_outcomes() returns trigger language plpgsql as $$
begin
  if old.frozen_at is not null then
    raise exception using errcode = 'P0001', message = 'outcomes-frozen: a frozen outcome set cannot change';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger outcome_frozen before update or delete on wh.outcome_sets
  for each row execute function wh.guard_frozen_outcomes();

grant usage on schema wh to lab_app, relay, workers_rw;
grant select on all tables in schema wh to lab_app;
grant insert on wh.events to relay;
grant select on wh.events to workers_rw;
grant select, insert, update on wh.outcome_sets to workers_rw;
