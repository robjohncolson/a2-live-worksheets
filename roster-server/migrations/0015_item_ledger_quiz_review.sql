-- 0015_item_ledger_quiz_review: allow source='quiz_review' (AI-review partial
-- credit for quiz items) in item_ledger.
--
-- USER-RUN (run on the shared Supabase, like 0011/0013/0014). Additive: widens
-- the source CHECK. A quiz_review row (item_id '<baseItemId>#rev', score = earned
-- credit 1.0 / 0.667 / 0.333) is written by cr when an AI review/appeal completes:
--   E / exception-granted -> 1.0,  P -> 0.667,  I (engaged the review) -> 0.333.
-- The grade engine takes max(answer-key correct ? 1 : 0, reviewCredit) per item
-- and scores Q = sum(credit) / total. This GENERALIZES the s125 quiz_exception
-- (which was E-only, 1.0); quiz_exception stays in the CHECK for safety and the
-- engine still reads it as credit 1.0.
--
-- Distinct '#rev' item id is REQUIRED (latestPerItem dedupes by item_id, so it
-- must not collide with the quiz row). Before this migration runs Postgres
-- rejects the rows and the fire-and-forget feeder no-ops.
--
-- Mirror of 0011/0013/0014: drop + re-add the source CHECK with the extra value.

alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','blooket','quiz_exception','quiz_review'));
