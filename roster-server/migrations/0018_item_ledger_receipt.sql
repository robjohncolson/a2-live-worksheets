-- 0018_item_ledger_receipt: persist signed ledger receipts for durable replay.
--
-- USER-RUN (run on the shared Supabase, like 0011/0013/0014/0015/0016 -- never
-- auto-run). Additive: adds nullable receipt columns to item_ledger.
--
-- Until this migration runs, receipt persistence silently no-ops: grade writes
-- still succeed, signed receipts are still returned in-band, and GET
-- /ledger/student returns rows without receipt fields.

alter table item_ledger add column if not exists receipt_id text;
alter table item_ledger add column if not exists receipt_compact text;
