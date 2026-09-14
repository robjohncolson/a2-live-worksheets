-- 0008_nudges_log.sql -- nudges_log persistence (Phase 3 of
-- TEACHER_STUDENT_CONSOLE_SPEC.md). One row per teacher -> student
-- nudge AND per student -> teacher reply. Idempotent.

create table if not exists nudges_log (
  id                 bigserial primary key,
  nudge_id           text not null,
  parent_nudge_id    text,
  sender_username    text not null,
  recipient_username text not null,
  text               text not null check (char_length(text) <= 280),
  direction          text not null check (direction in ('teacher', 'student')),
  section            text,
  created_at         timestamptz not null default now(),
  delivered_at       timestamptz
);

create index if not exists nudges_log_nudge_id_idx on nudges_log (nudge_id);
create index if not exists nudges_log_recipient_section_idx on nudges_log (recipient_username, section, created_at desc);
create index if not exists nudges_log_sender_section_idx on nudges_log (sender_username, section, created_at desc);
create index if not exists nudges_log_parent_idx on nudges_log (parent_nudge_id) where parent_nudge_id is not null;

alter table nudges_log enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0007 + 0004 pattern).
