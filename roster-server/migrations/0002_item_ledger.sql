-- 0002_item_ledger.sql — Gradebook Sprint 1. Apply to the shared Supabase project, schema a2
-- (project selected via deployment environment; §6.1 / D-G). Creates ONLY item_ledger — NEVER ALTER/touch existing tables.
create table if not exists item_ledger (
  ledger_id     uuid primary key default gen_random_uuid(),
  student_id    uuid not null references roster(student_id) on delete cascade,
  source        text not null check (source in ('worksheet','frq','curriculum_quiz')),
  item_id       text not null,
  unit          text,
  topic         text,
  skill         text,
  response      jsonb,
  score         numeric,
  evidence_tier text not null default 'practice' check (evidence_tier in ('practice','proctored')),
  attempt       int  not null default 1,
  recorded_at   timestamptz not null default now(),
  graded_at     timestamptz,
  unique (student_id, source, item_id, attempt)
);
create index if not exists item_ledger_student_idx on item_ledger(student_id);
create index if not exists item_ledger_skill_idx   on item_ledger(skill);
create index if not exists item_ledger_unit_idx    on item_ledger(unit);
alter table item_ledger enable row level security;
-- (Intentionally NO policies. Service-role only. Blooket is excluded by spec — no 'blooket' source.)
