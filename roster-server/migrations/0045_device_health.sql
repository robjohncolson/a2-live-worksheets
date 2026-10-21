-- Class Log device health ping (school/class-log/POLISH3_SPEC.md, WP-H H2).
-- Run by hand in the Supabase SQL editor (as postgres), then
-- `NOTIFY pgrst, 'reload schema';`. Every name is schema-qualified with a2.
-- because the SQL editor does not keep `SET search_path`. Idempotent: safe to
-- run again. Until it runs, POST /class-log/health and GET /teacher/health
-- answer 503 and the phone logs `Health: failed (HTTP 503)` at most hourly.
-- The phone never touches these tables; roster-server writes them with the
-- service key (POST /class-log/health upserts the current row, appends to the
-- log and prunes log rows older than 30 days) and the Desk reads the current
-- rows (GET /teacher/health).
create table if not exists a2.device_health (
  device       text primary key,
  at           timestamptz,                         -- the phone's own clock
  payload      jsonb not null,                      -- the whole ping body
  received_at  timestamptz not null default now()   -- server clock
);

create table if not exists a2.device_health_log (
  id           bigserial primary key,
  device       text not null,
  at           timestamptz,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
create index if not exists device_health_log_received_at on a2.device_health_log (received_at);

alter table a2.device_health enable row level security;
alter table a2.device_health_log enable row level security;
revoke all on a2.device_health, a2.device_health_log from anon, authenticated;
revoke all on sequence a2.device_health_log_id_seq from anon, authenticated;
grant all on a2.device_health, a2.device_health_log to service_role;
grant usage, select on sequence a2.device_health_log_id_seq to service_role;
