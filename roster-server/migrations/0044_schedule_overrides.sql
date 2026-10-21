-- Class Log schedule overrides from the Desk (school/class-log/POLISH3_SPEC.md, WP-S S1).
-- Run by hand in the Supabase SQL editor (as postgres), then
-- `NOTIFY pgrst, 'reload schema';`. Every name is schema-qualified with a2.
-- because the SQL editor does not keep `SET search_path`. Idempotent: safe to
-- run again. Until it runs, GET /class-log/schedule and the teacher routes
-- answer 503 and the phone keeps its local schedule.
-- The phone never touches these tables; roster-server reads and writes them
-- with the service key (GET /class-log/schedule, PUT/DELETE
-- /teacher/schedule-overrides; scripts/push-schedule.mjs seeds them).
--
-- schedule_overrides: one row per (date, section). cancelled = true means the
-- section does not meet that day (start/end null); otherwise start/end are that
-- day's bell times. schedule_days_off: a row cancels every section that day.
create table if not exists a2.schedule_overrides (
  date        date not null,
  section     text not null check (char_length(section) between 1 and 16),
  start       time,
  "end"       time,
  cancelled   boolean not null default false,
  note        text check (note is null or char_length(note) <= 200),
  source      text not null default 'desk',
  updated_at  timestamptz not null default now(),
  primary key (date, section),
  check (cancelled or (start is not null and "end" is not null and start < "end"))
);

create table if not exists a2.schedule_days_off (
  date        date primary key,
  note        text check (note is null or char_length(note) <= 200),
  updated_at  timestamptz not null default now()
);

alter table a2.schedule_overrides enable row level security;
alter table a2.schedule_days_off enable row level security;
revoke all on a2.schedule_overrides, a2.schedule_days_off from anon, authenticated;
grant all on a2.schedule_overrides, a2.schedule_days_off to service_role;

-- Any UPDATE (Desk push or a hand edit in the SQL editor) bumps updated_at.
-- Same function as 0042; recreated here so this file also stands alone.
create or replace function a2.a2_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function a2.a2_touch_updated_at() from public, anon, authenticated;
grant execute on function a2.a2_touch_updated_at() to service_role;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'schedule_overrides_touch_updated_at' and tgrelid = 'a2.schedule_overrides'::regclass
  ) then
    create trigger schedule_overrides_touch_updated_at
      before update on a2.schedule_overrides
      for each row execute function a2.a2_touch_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'schedule_days_off_touch_updated_at' and tgrelid = 'a2.schedule_days_off'::regclass
  ) then
    create trigger schedule_days_off_touch_updated_at
      before update on a2.schedule_days_off
      for each row execute function a2.a2_touch_updated_at();
  end if;
end;
$trigger$;
