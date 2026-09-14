-- 0009_lesson_unlock.sql -- lesson_unlock persistence (Phase 5 of
-- TEACHER_STUDENT_CONSOLE_SPEC.md). Records teacher overrides of the
-- sequential lesson gate. Sticky (status='active' persists across
-- sessions). One row per (student, lesson) -- UNIQUE constraint.
-- Idempotent.

create table if not exists lesson_unlock (
  id                 bigserial primary key,
  student_username   text not null,
  lesson_key         text not null,
  unlocked_by        text not null,
  unlocked_at        timestamptz not null default now(),
  reason             text,
  status             text not null default 'active' check (status in ('active', 'revoked')),
  unique (student_username, lesson_key)
);

create index if not exists lesson_unlock_student_idx on lesson_unlock (student_username) where status = 'active';
create index if not exists lesson_unlock_lesson_idx on lesson_unlock (lesson_key);

alter table lesson_unlock enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0007 + 0008).
