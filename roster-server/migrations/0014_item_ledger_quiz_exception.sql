-- 0014_item_ledger_quiz_exception: allow source='quiz_exception' (AI-granted
-- "discuss your answer" exceptions that flip a wrong quiz item to correct) in
-- item_ledger.
--
-- USER-RUN (run on the shared Supabase, like 0011 / 0013). Additive: widens the
-- source CHECK to admit exception rows. The cr quiz "Discuss with AI" flow writes
-- a source='quiz_exception' row (item_id = `<baseItemId>#exc`) only after the AI
-- grants the appeal; the grade engine ORs that into the base item's correctness.
-- Before this migration runs Postgres REJECTS the rows (check_violation) and the
-- fire-and-forget feeder no-ops, so no exception is ever silently lost or counted.
--
-- The exception row uses a DISTINCT `#exc` item_id on purpose: latestPerItem
-- dedupes by item_id alone, so reusing the quiz item's id would replace the quiz
-- row. The engine strips `#exc` to find the base item it forgives.
--
-- Mirror of 0011 / 0013: drop + re-add the source CHECK with the extra value.
-- Default inline-CHECK name is item_ledger_source_check.

alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','blooket','quiz_exception'));
