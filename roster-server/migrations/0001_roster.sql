-- 0001_roster.sql — Gradebook Phase 0. Apply to the shared Supabase project, schema a2
-- (project selected via deployment environment; §6.1 revised 2026-05-17 / D-G). Creates ONLY roster + roster_alias
-- (idempotent, RLS on those two only) — NEVER ALTER or touch existing tables in this shared project.
-- gen_random_uuid() is built into PostgreSQL 13+; no shared extension changes.

create table if not exists roster (
  student_id     uuid primary key default gen_random_uuid(),
  real_name      text not null,
  section        text not null,
  login_username text not null unique,
  password_hash  text not null,
  email          text,
  status         text not null default 'active' check (status in ('active','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists roster_alias (
  alias_id   uuid primary key default gen_random_uuid(),
  student_id uuid not null references roster(student_id) on delete cascade,
  source     text not null check (source in ('worksheet','studyguide','roadmap')),
  legacy_key text not null,
  created_at timestamptz not null default now(),
  unique (source, legacy_key)
);

create index if not exists roster_section_idx on roster(section);
create index if not exists roster_alias_student_idx on roster_alias(student_id);

-- updated_at trigger
create or replace function roster_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists roster_set_updated_at on roster;
create trigger roster_set_updated_at before update on roster
  for each row execute function roster_touch_updated_at();

-- RLS: enabled with NO policies => only the service-role key (which bypasses RLS) can touch these.
alter table roster        enable row level security;
alter table roster_alias  enable row level security;
-- (Intentionally NO create policy statements. Anon/auth roles get zero rows. Spec §7.1.)
