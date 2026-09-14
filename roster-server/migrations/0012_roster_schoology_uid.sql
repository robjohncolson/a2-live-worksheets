-- 0012_roster_schoology_uid: add the schoology_uid bridge column to roster.
-- Maps a roster student to their Schoology user id so the grade-sync producer
-- (tools/build_schoology_fixture.py) can key the fixture by Schoology uid
-- directly, instead of a hand-authored --uid-map. GRADE_PIPELINE_E2E_SPEC.md P4b.
--
-- Additive + idempotent. Run on the shared curriculum_render Supabase. NEVER
-- ALTER or touch any other table in this shared project.
alter table roster add column if not exists schoology_uid text;

-- One Schoology account maps to at most one roster row. Partial unique index
-- (nulls ignored) blocks two students sharing a uid; many NULLs are allowed.
create unique index if not exists roster_schoology_uid_key
  on roster (schoology_uid) where schoology_uid is not null;
