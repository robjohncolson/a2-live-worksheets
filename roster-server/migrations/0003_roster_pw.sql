-- 0003_roster_pw.sql — Gradebook teacher-tools TR1. Apply to the shared Supabase project, schema a2 (project selected via deployment environment). ADDITIVE ONLY: adds two columns to the
-- existing `roster` table. NEVER ALTER or touch any other table in this shared project.
--
-- Sanity check first (optional): the two columns should not already exist.
--   select column_name from information_schema.columns
--   where table_name='roster' and column_name in ('password_cipher','must_change_password');
--
-- password_cipher       : AES-256-GCM blob of the CURRENT password (teacher login-recovery).
--                          Readable only with ROSTER_PW_ENC_KEY (Railway env, server-only).
-- must_change_password  : student must change the default password on first sign-in.
--                          Existing rows inherit TRUE (acceptable; real cohort not yet enrolled,
--                          SMOKETEST rows are removed by the existing cleanup chore).

alter table roster add column if not exists password_cipher text;
alter table roster add column if not exists must_change_password boolean not null default true;
