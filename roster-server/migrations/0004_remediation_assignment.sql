-- 0004_remediation_assignment.sql — Gradebook Phase 4b. Apply to the
-- shared Supabase project, schema a2 (project selected via deployment environment; §6.1 / D-G).
-- Creates ONLY remediation_assignment + its indexes — NEVER ALTER an existing
-- table. Shared-project discipline (same posture as 0001_roster.sql and
-- 0002_item_ledger.sql).
--
-- Schema mirrors GRADEBOOK_GRADING_SPEC.md §6 (record + retake gate). RLS is
-- enabled with zero policies — service-role only access via roster-server.
--
-- Until this migration is run, the Phase-4b roster-server endpoints respond
-- with 503 {ok:false, error:"remediation table not yet provisioned"}; the
-- rest of the service stays up. See GRADEBOOK_PHASE4B_BUILD.md §1.

create table if not exists remediation_assignment (
  assignment_id    uuid primary key default gen_random_uuid(),
  student_id       uuid not null references roster(student_id) on delete cascade,
  unit             text not null,
  skill            text not null,
  source_attempt   text,                                          -- optional ref to an item_ledger row id
  assigned_refs    jsonb not null default '[]'::jsonb,            -- list of items the student is being asked to do
  status           text not null check (status in ('proposed','assigned','completed','waived')) default 'proposed',
  proposed_by      text not null default 'system',
  approved_by      text,                                          -- teacher username/email, set on approve
  assigned_at      timestamptz,                                   -- set on approve (status='assigned')
  completed_at     timestamptz,                                   -- set on complete (status='completed')
  completed_score  numeric,                                       -- optional score on the re-check item
  recheck_item_id  text,                                          -- the item that closed the loop
  unlocks          text,                                          -- the re-check this remediation gates (free-form id/name)
  notes            text,                                          -- optional teacher notes
  created_at       timestamptz not null default now()
);

create index if not exists remediation_student_idx       on remediation_assignment(student_id);
create index if not exists remediation_skill_idx         on remediation_assignment(skill);
create index if not exists remediation_status_idx        on remediation_assignment(status);
create index if not exists remediation_student_skill_idx on remediation_assignment(student_id, skill);

alter table remediation_assignment enable row level security;
-- Intentionally NO policies. Service-role only. Same posture as roster + item_ledger.
