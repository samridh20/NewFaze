-- CC-1: Odyssey stores only a hash of the Sim vs Fans prediction before close.
delete from odyssey.sim_predictions;
alter table odyssey.sim_predictions drop column predicted;
alter table odyssey.sim_predictions add column commitment text not null check (commitment ~ '^[0-9a-f]{64}$');
-- CC-10 / CC-11
create table odyssey.audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  subject text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table odyssey.idempotency_keys add column expires_at timestamptz not null default now() + interval '24 hours';
-- CC-6: append-only guards
create function odyssey.guard_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'append-only: %% on odyssey.%% is not allowed', tg_op, tg_table_name using errcode = 'P0001';
end $$;
create trigger episodes_append_only before update or delete on odyssey.episodes
  for each row execute function odyssey.guard_append_only();
create trigger credits_append_only before update or delete on odyssey.credits
  for each row execute function odyssey.guard_append_only();
create trigger audit_append_only before update or delete on odyssey.audit_log
  for each row execute function odyssey.guard_append_only();
-- CC-6: tighten grants
revoke delete on all tables in schema odyssey from odyssey_app;
grant delete on odyssey.idempotency_keys to odyssey_app;
revoke update, delete on odyssey.outbox from odyssey_app;
grant select, insert on odyssey.outbox to odyssey_app;
grant usage, select on all sequences in schema odyssey to odyssey_app;
