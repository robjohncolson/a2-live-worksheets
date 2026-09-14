-- 0006_roster_sprite_hue.sql -- Live Classroom r3 (LIVE_CLASSROOM_R3_BUILD.md).
--
-- Adds a `sprite_hue` column to the roster table so a student's chosen
-- avatar hue persists cross-app via their roster account. The Live Classroom
-- board reads this via GET /roster/verify (spriteHue field) and writes it
-- via PATCH /roster/:studentId/sprite-hue.
--
-- Additive + idempotent. Run by hand in the curriculum_render Supabase
-- SQL editor (same pattern as migrations 0004 and 0005). Until this runs,
-- roster-server degrades safely: getSpriteHueByStudentId returns null and
-- the PATCH route responds 503 "sprite_hue not provisioned" -- no lockout.

ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS sprite_hue integer;

-- Constrain to valid hue range (0-359) or NULL. Guarded so a re-run does not error.
DO $$ BEGIN
  ALTER TABLE roster ADD CONSTRAINT roster_sprite_hue_chk
    CHECK (sprite_hue IS NULL OR sprite_hue BETWEEN 0 AND 359);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
