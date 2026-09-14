-- 0005_roster_role.sql -- Connected Teacher Auth (TEACHER_AUTH_BUILD.md).
--
-- Adds a `role` column to the roster table so a teacher's own roster
-- account can authorize the teacher-gated endpoints via its session
-- token. The x-teacher-secret stays as a break-glass fallback.
--
-- Additive + idempotent. Run by hand in the curriculum_render Supabase
-- SQL editor (same as migration 0004). Until this runs, roster-server
-- degrades safely: the token-based teacher path resolves every account
-- to 'student', so teachers keep using x-teacher-secret -- no lockout.

ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';

-- Constrain to the two valid values. Guarded so a re-run does not error.
DO $$ BEGIN
  ALTER TABLE roster ADD CONSTRAINT roster_role_chk
    CHECK (role IN ('student','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mark the teacher account. ADJUST the username below if the teacher's
-- roster account is not 'date_tiger'.
UPDATE roster SET role = 'teacher' WHERE login_username = 'date_tiger';
