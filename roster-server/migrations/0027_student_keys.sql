-- 0027_student_keys: the STUDENT trust set for the offline-grading mesh
-- (OFFLINE_GRADING_MESH_SPEC.md §0.1-0.3). USER-RUN, additive, idempotent.
--
-- Students self-sign raw SUBMISSIONS (never grades) with a device Ed25519 key;
-- this table is the authenticated pubkey→student binding (§0.2) plus revocation
-- (§0.3). It deliberately mirrors 0026_trusted_issuers with two hard differences:
--   1. It is a SEPARATE table from trusted_issuers — the grades trust set and the
--      student trust set are never merged (§0.1c). A pubkey in one must never
--      appear in the other (enforced at the route layer).
--   2. Revocation is TERMINAL: re-registering a revoked pubkey must NOT un-revoke
--      it (a lost/stolen key signs as the student forever if it can come back).
--      trusted_issuers' upsert-un-revoke behavior is acceptable for teacher-gated
--      issuer keys, catastrophic for a fleet of student keys.
--
-- One-sid-per-pubkey: pubkey is the PK; a key can never re-bind to a different
-- student (§0.5). One student MAY hold several keys over time (new device → new
-- key; old keys stay so old submissions keep verifying, unless revoked).
--
-- Until this runs, /student-keys* routes return 503 and the mesh submissions
-- lane stays inert (no student trust set to verify against).

create table if not exists student_keys (
  pubkey     text primary key,   -- base64url Ed25519 public-key x (43 chars)
  student_id uuid not null references roster(student_id) on delete cascade,
  label      text,               -- human note, e.g. "Pixel 3 (app)"
  revoked    boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists student_keys_student_idx on student_keys (student_id);

-- Service-role bypasses RLS; no anon access. Mirrors 0025/0026.
alter table student_keys enable row level security;
