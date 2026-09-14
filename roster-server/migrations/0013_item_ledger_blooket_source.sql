-- 0013_item_ledger_blooket_source: allow source='blooket' (per-lesson Blooket
-- warm-up rows) in item_ledger.
--
-- USER-RUN (run on the shared Supabase, like 0011). Additive: this widens the
-- source CHECK to admit the new Blooket track of Grading Model v3 (10% of Work,
-- renormalized). The teacher endpoint POST /class/blooket writes source='blooket'
-- rows; before this migration runs Postgres REJECTS them (check_violation), and
-- the endpoint reports 503 "blooket source not provisioned" so the service stays
-- up and no missing blooket is ever counted as 0.
--
-- Mirror of 0011: drop + re-add the source CHECK with the extra value.
--
--
-- If your constraint has a non-default name, find it with `\d item_ledger` (psql)
-- and adjust the DROP below. The default for an inline column CHECK is
-- <table>_<column>_check = item_ledger_source_check.

alter table item_ledger drop constraint if exists item_ledger_source_check;

alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','blooket'));
