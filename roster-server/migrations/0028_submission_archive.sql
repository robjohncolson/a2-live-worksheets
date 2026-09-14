-- 0028_submission_archive: the offline-grading-mesh hub reconcile (Phase 4).
-- OFFLINE_GRADING_MESH_SPEC.md §0.10, §4. USER-RUN, additive, idempotent.
--
-- When a device with internet reaches the server, it uploads the raw student
-- SUBMISSIONS it has gossiped (self-signed, t:'submission') so they're durable off
-- the mesh and auditable. This table is APPEND-ONLY and content-addressed by the
-- submission's receipt_id — re-uploading the same submission is a no-op (idempotent).
--
-- CRITICAL (§0.10): archiving is DECOUPLED from grading. This table is NOT item_ledger
-- and nothing here ever writes a score — so the server can NEVER re-grade a submission
-- that already carries a teacher grade, nor mint a competing score. Teacher-signed
-- grades reach the ledger through the EXISTING /admin/restore path (the teacher device
-- key is a trusted issuer); the archive is purely the raw-work record.
--
-- The server verifies each submission's STUDENT signature (against student_keys from
-- migration 0027) before storing, so a peer can't inject a fake submission.
--
-- Until this runs, POST/GET /submissions/archive 503 (table absent).

create table if not exists submission_archive (
  receipt_id      text primary key,          -- content address (sha256 of the signed payload)
  student_id      uuid not null references roster(student_id) on delete cascade,
  source          text not null,
  item_id         text not null,
  response        jsonb,
  attempt         int not null default 1,
  recorded_at     timestamptz,               -- the student's signed submission ts (display-only, §0.11)
  receipt_compact text not null,             -- the full self-signed receipt (re-verifiable)
  archived_at     timestamptz not null default now()
);

create index if not exists submission_archive_student_idx on submission_archive (student_id);
create index if not exists submission_archive_item_idx    on submission_archive (item_id);

-- Defense-in-depth RLS (service-role bypasses); mirrors 0025/0026/0027.
alter table submission_archive enable row level security;
