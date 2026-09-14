-- 0030_quarter_grade_snapshot: freeze a student's quarter grade at teacher-run
-- quarter close (PC makeup [D] freeze/delta). The snapshot is the AUTHORITATIVE
-- closed-quarter record — the teacher enters it into Schoology at close; the live
-- engine keeps recomputing, and post-close improvements surface as BONUS DELTAS
-- (current - frozen). Best-wins-at-write (Phase 2 /pc submit) guarantees the live
-- grade only ever RISES post-close, so a delta is always a positive extra-credit
-- candidate, never a drop the freeze has to shield against.
--
-- Idempotent close: PK(student_id, quarter) + INSERT ... ON CONFLICT DO NOTHING
-- (the FIRST close wins — a frozen grade is immutable; re-closing only snapshots
-- students not yet frozen). /class/quarter/* return 503 until this is applied.

create table if not exists quarter_grade_snapshot (
  student_id      text not null,
  quarter         text not null check (quarter in ('Q1','Q2','Q3','Q4')),
  login_username  text,                 -- for teacher-facing display
  frozen_grade    numeric,              -- the quarterGrade at close (0..100, or null = nothing due)
  frozen_pc_avg   numeric,              -- the PC-track avg at close (detail)
  frozen_work_avg numeric,              -- the Work-track avg at close (detail)
  closed_by       text,                 -- acting teacher (best-effort)
  frozen_at       timestamptz not null default now(),
  primary key (student_id, quarter)
);

-- Service-role only (same policy as the ledger): the roster server holds
-- the service key; no anon/authenticated policies are defined.
alter table quarter_grade_snapshot enable row level security;
