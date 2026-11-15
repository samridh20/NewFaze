-- odyssey: campaign state. Written only by the Odyssey API (FR-3.1). Source: Ch. 13.
create schema if not exists odyssey;

create type odyssey.campaign_state as enum (
  'draft','scheduled','accepting_entries','shortlist_locked','voting','closed','published','archived','paused');

create table odyssey.accounts (
  user_id uuid primary key,
  handle text not null,
  role text not null default 'fan',
  analytics_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table odyssey.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  format text not null check (format in ('recreate_the_shot','call_the_play','editor_relay')),
  title text not null check (char_length(title) between 1 and 120),
  state odyssey.campaign_state not null default 'draft',
  paused_from odyssey.campaign_state,
  live_brief_id uuid,
  reference_asset_id text,
  reference_marker_ms int,
  intro_asset_id text,
  end_card_asset_id text,
  reporting_window_end timestamptz,
  opens_at timestamptz, voting_opens_at timestamptz, closes_at timestamptz, reveal_at timestamptz,
  sponsor_id uuid,
  updated_at timestamptz not null default now()
);

create table odyssey.brief_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references odyssey.campaigns,
  variant text not null check (variant in ('A','B')),
  body_md text not null check (char_length(body_md) <= 20000),
  rules jsonb not null,
  scrim_run_id uuid,
  unique (campaign_id, variant)
);
alter table odyssey.campaigns
  add constraint campaigns_live_brief_fk foreign key (live_brief_id)
  references odyssey.brief_versions (id) deferrable initially deferred;

create table odyssey.entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references odyssey.campaigns,
  user_id uuid not null,
  source text not null check (source in ('upload','link')),
  source_url text,
  mux_asset_id text, playback_id text,
  duration_ms int,
  trim_start_ms int, trim_end_ms int, marker_ms int,
  handle text not null, channel_url text, note text,
  permissions jsonb not null,
  state text not null default 'received'
    check (state in ('received','processing','in_review','finalist','published','declined','withdrawn')),
  receipt_code text unique not null,
  created_at timestamptz not null default now()
);

create table odyssey.ballots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references odyssey.campaigns,
  version int not null,
  state text not null check (state in ('open','paused','closed')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  closed_at timestamptz,
  tally jsonb,
  unique (campaign_id, version),
  check (closes_at > opens_at)
);

create table odyssey.ballot_finalists (
  ballot_id uuid not null references odyssey.ballots,
  entry_id uuid not null references odyssey.entries,
  label char(1) not null check (label in ('A','B')),
  locked_asset_id text not null,
  marker_ms int not null check (marker_ms >= 0),
  primary key (ballot_id, entry_id),
  unique (ballot_id, label)
);

-- One current vote per voter and ballot. The composite foreign key means a vote can only name a finalist.
create table odyssey.votes (
  ballot_id uuid not null references odyssey.ballots,
  voter_id uuid not null,
  entry_id uuid not null,
  revision int not null default 1,
  referral text,
  ip_hash text,
  first_cast_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ballot_id, voter_id),
  foreign key (ballot_id, entry_id) references odyssey.ballot_finalists (ballot_id, entry_id)
);
create index votes_ballot_entry_idx on odyssey.votes (ballot_id, entry_id);

create table odyssey.sim_predictions (
  ballot_id uuid primary key references odyssey.ballots,
  predicted jsonb not null,
  scrim_run_id uuid,
  registered_by text not null,
  registered_at timestamptz not null default now()
);

create table odyssey.episodes (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid unique not null references odyssey.ballots,
  slug text unique not null,
  winner_entry_id uuid not null references odyssey.entries,
  tally jsonb not null,
  tie boolean not null default false,
  no_votes boolean not null default false,
  sequence jsonb not null,
  sim_vs_fans jsonb,
  published_at timestamptz not null default now()
);

create table odyssey.credits (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references odyssey.episodes,
  entry_id uuid not null references odyssey.entries,
  handle text not null,
  channel_url text,
  role text not null check (role in ('winner','finalist')),
  position int not null,
  unique (episode_id, entry_id)
);

create table odyssey.vault_chapters (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid unique not null references odyssey.episodes,
  slug text unique not null,
  era text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table odyssey.council_members (
  user_id uuid primary key,
  birth_year int not null check (birth_year between 1900 and 2100),
  consent_version text not null,
  guardian_email text,
  guardian_confirmed_at timestamptz,
  cohort text not null default 'newcomer' check (cohort in ('returning','newcomer','creator')),
  enrolled_at timestamptz not null default now(),
  -- Ages 14 to 15 are only ever stored after the guardian confirms (Ch. 19).
  -- Age is the youngest possible: year minus birth year minus one (A-21). So 16 and up means a gap of 17.
  check ((extract(year from enrolled_at)::int - birth_year) >= 17
         or (guardian_email is not null and guardian_confirmed_at is not null))
);
create table odyssey.council_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  kind text not null check (kind in ('choice','text')),
  options jsonb,
  active boolean not null default true
);
create table odyssey.council_answers (
  user_id uuid not null references odyssey.council_members,
  question_id uuid not null references odyssey.council_questions,
  answer text not null check (char_length(answer) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table odyssey.outbox (
  id bigserial primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  -- A malformed payload would block the relay's batch statement, so it is refused at write time.
  check (payload ? 'event_id' and (payload->>'event_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and (payload->>'v') ~ '^[0-9]+$')
);
create index outbox_unpublished_idx on odyssey.outbox (id) where published_at is null;

create table odyssey.idempotency_keys (
  scope text not null,
  key text not null,
  request_hash text not null,
  status_code int not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

-- ---------- transition tables (the same data as faze_common.states) ----------
create table odyssey.campaign_transitions (from_state text not null, to_state text not null, primary key (from_state, to_state));
create table odyssey.entry_transitions    (from_state text not null, to_state text not null, primary key (from_state, to_state));
create table odyssey.ballot_transitions   (from_state text not null, to_state text not null, primary key (from_state, to_state));

insert into odyssey.campaign_transitions values
  ('draft','scheduled'),('scheduled','accepting_entries'),('accepting_entries','shortlist_locked'),
  ('shortlist_locked','voting'),('voting','closed'),('closed','published'),('published','archived'),
  ('scheduled','paused'),('accepting_entries','paused'),('shortlist_locked','paused'),('voting','paused'),
  ('paused','scheduled'),('paused','accepting_entries'),('paused','shortlist_locked'),('paused','voting'),
  ('paused','closed');
insert into odyssey.entry_transitions values
  ('received','processing'),('received','in_review'),('processing','in_review'),
  ('received','declined'),('processing','declined'),('in_review','declined'),
  ('received','withdrawn'),('processing','withdrawn'),('in_review','withdrawn'),
  ('in_review','finalist'),('finalist','published');
insert into odyssey.ballot_transitions values
  ('open','paused'),('paused','open'),('open','closed'),('paused','closed');

-- ---------- guards ----------
create function odyssey.guard_campaign() returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state then
    if not exists (select 1 from odyssey.campaign_transitions where from_state = old.state::text and to_state = new.state::text) then
      raise exception using errcode = 'P0001',
        message = 'illegal-transition: campaign ' || old.state::text || ' -> ' || new.state::text;
    end if;
    if new.state = 'paused' then
      new.paused_from := old.state;
    elsif old.state = 'paused' then
      if new.state is distinct from old.paused_from
         and not (new.state = 'closed' and old.paused_from = 'voting') then
        raise exception using errcode = 'P0001',
          message = 'illegal-transition: campaign paused from ' || coalesce(old.paused_from::text, 'null')
                    || ' cannot resume into ' || new.state::text;
      end if;
      new.paused_from := null;
    end if;
    -- Campaign and ballot never disagree (FR-3.4): voting needs an open ballot with two finalists,
    -- and pausing a voting campaign needs its ballot paused in the same transaction.
    if new.state = 'voting' and not exists (
         select 1 from odyssey.ballots b
         where b.campaign_id = new.id and b.state = 'open'
           and (select count(*) from odyssey.ballot_finalists f where f.ballot_id = b.id) = 2) then
      raise exception using errcode = 'P0001',
        message = 'illegal-transition: voting needs an open ballot with two locked finalists';
    end if;
    if new.state = 'paused' and old.state = 'voting' and not exists (
         select 1 from odyssey.ballots where campaign_id = new.id and state = 'paused') then
      raise exception using errcode = 'P0001',
        message = 'illegal-transition: pause the ballot together with a voting campaign';
    end if;
    -- closed and published are reachable only through the close and publish operations.
    if new.state = 'closed' and not exists (select 1 from odyssey.ballots where campaign_id = new.id and state = 'closed') then
      raise exception 'illegal-transition: campaign cannot close before its ballot is closed' using errcode = 'P0001';
    end if;
    if new.state = 'published' and not exists (
         select 1 from odyssey.episodes e join odyssey.ballots b on b.id = e.ballot_id where b.campaign_id = new.id) then
      raise exception 'illegal-transition: campaign cannot publish without an episode' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  -- The live brief is fixed once entries open (FR-3.7).
  if new.live_brief_id is distinct from old.live_brief_id
     and old.state not in ('draft','scheduled') then
    raise exception 'brief-locked: the live brief cannot change after entries open' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger campaign_guard before update on odyssey.campaigns
  for each row execute function odyssey.guard_campaign();

create function odyssey.guard_entry() returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state and not exists (
       select 1 from odyssey.entry_transitions where from_state = old.state and to_state = new.state) then
    raise exception using errcode = 'P0001',
      message = 'illegal-transition: entry ' || old.state || ' -> ' || new.state;
  end if;
  return new;
end $$;
create trigger entry_guard before update of state on odyssey.entries
  for each row execute function odyssey.guard_entry();

create function odyssey.guard_ballot() returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state and not exists (
       select 1 from odyssey.ballot_transitions where from_state = old.state and to_state = new.state) then
    raise exception using errcode = 'P0001',
      message = 'illegal-transition: ballot ' || old.state || ' -> ' || new.state;
  end if;
  if old.state = 'closed' and (new.tally is distinct from old.tally or new.closes_at is distinct from old.closes_at) then
    raise exception 'ballot-frozen: a closed ballot cannot change' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ballot_guard before update on odyssey.ballots
  for each row execute function odyssey.guard_ballot();

-- A vote is refused unless the ballot is open and the server clock is before closes_at. The trigger takes the
-- ballot row lock itself, so even a caller that forgot to lock cannot slip a vote past a close (FR-6.4).
create function odyssey.guard_vote() returns trigger language plpgsql as $$
declare b record;
begin
  -- FOR SHARE OF b locks only the ballot row. The campaign state is read from the same snapshot, and it
  -- changes only in the transactions that also change this ballot row, which the share lock orders.
  select b0.state, b0.opens_at, b0.closes_at, c.state as campaign_state into b
  from odyssey.ballots b0 join odyssey.campaigns c on c.id = b0.campaign_id
  where b0.id = new.ballot_id for share of b0;
  if b.state is distinct from 'open' or b.campaign_state is distinct from 'voting'
     or clock_timestamp() < b.opens_at or clock_timestamp() >= b.closes_at then
    raise exception using errcode = 'P0001', message = 'ballot-closed';
  end if;
  return new;
end $$;
create trigger vote_guard before insert or update on odyssey.votes
  for each row execute function odyssey.guard_vote();

-- Finalists are exactly two and never change after the lock (FR-3.6).
create function odyssey.guard_finalist_change() returns trigger language plpgsql as $$
begin
  raise exception 'ballot-locked: finalists cannot change after the lock' using errcode = 'P0001';
end $$;
create trigger finalists_immutable before update or delete on odyssey.ballot_finalists
  for each row execute function odyssey.guard_finalist_change();

create function odyssey.check_two_finalists() returns trigger language plpgsql as $$
begin
  if (select count(*) from odyssey.ballot_finalists where ballot_id = new.ballot_id) <> 2 then
    raise exception 'ballot-locked: a ballot needs exactly two finalists' using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger ballot_two_finalists after insert on odyssey.ballot_finalists
  deferrable initially deferred for each row execute function odyssey.check_two_finalists();

-- A prediction is refused once the ballot has closed, so Sim vs Fans can never be written after the result (FR-10.9).
create function odyssey.guard_prediction() returns trigger language plpgsql as $$
begin
  if (select state from odyssey.ballots where id = new.ballot_id) = 'closed' then
    raise exception 'prediction-too-late: the ballot is closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger prediction_guard before insert or update on odyssey.sim_predictions
  for each row execute function odyssey.guard_prediction();

create function odyssey.guard_episode() returns trigger language plpgsql as $$
begin
  if (select state from odyssey.ballots where id = new.ballot_id) is distinct from 'closed' then
    raise exception 'illegal-transition: an episode needs a closed ballot' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger episode_guard before insert on odyssey.episodes
  for each row execute function odyssey.guard_episode();

-- ---------- grants ----------
grant usage on schema odyssey to odyssey_app, relay;
grant select, insert, update, delete on all tables in schema odyssey to odyssey_app;
grant usage, select on all sequences in schema odyssey to odyssey_app;
grant select (id, topic, payload, created_at, published_at), update (published_at) on odyssey.outbox to relay;
grant usage on sequence odyssey.outbox_id_seq to relay;
