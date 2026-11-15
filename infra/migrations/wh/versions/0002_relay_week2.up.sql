-- ON CONFLICT (event_id) needs select on the key column (relay); CC-7 week-2 returns.
grant select (event_id) on wh.events to relay;
create table wh.week2_returns (campaign_id uuid not null, account_id uuid not null, returned_at timestamptz not null default now(), primary key (campaign_id, account_id));
grant select, insert on wh.week2_returns to workers_rw;
grant select on wh.week2_returns to lab_app;
