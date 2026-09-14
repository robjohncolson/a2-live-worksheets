# Misconceptions data-flow fixes

Baseline: master at 1cef455. Preserve all pre-existing worktree changes.

## Plan (before implementation)

1. Refresh GitNexus and inspect the extraction, worker/RPC, sweep, and regrade flows. Run upstream impact analysis before modifying existing symbols and report risk.
2. Capture baseline root/server suite results and a read-only local reproduction using real PeriodE ledger rows. Keep temporary scripts, snapshots, and logs outside state/. Never print credentials or student responses.
3. Commit 1: accept quiz and curriculum_quiz through one shared predicate; cover curriculum_quiz extraction in tests. Include this plan.
4. Commit 2: locate the actual FRQ detail-stripping layer, preserve rubric elements through worker and sweep persistence, and add weak score-only fallback events excluded from class persistence. Add focused regression tests and a migration only if the RPC requires one.
5. Commit 3: implement explicit feedback backfill selection and feedbackOnly storage that cannot change the score of record, retain retry/rate limiting, and add a manual workflow input. Test lower and higher grader scores and both server branches.
6. Before each commit run focused tests, review the staged diff, and run GitNexus detect_changes. After implementation run roster-server npm test and root npm test; compare failure names to baseline. Run before/after extraction over the same real-row snapshot and report rows, events by source, class-persistent count, and evidence keys.
7. Print a plain-text report with three commit hashes, actual stripping location, suite results and unchanged baseline failure names, reproduction numbers, any teacher-applied migration, and unmet requirements.

## Constraints

- Never push, apply a live migration, or execute the feedback backfill live.
- Live data access is read-only using roster-server/.env; only aggregate reproduction results are reported.
- No scratch directories under state/.
- Exactly three defect commits; stage only this task's changes.

## Implementation findings

- Commit 1: 74aedea recognizes both quiz source names through one predicate.
- Commit 2: b9921a7 preserves matched/missing/suggestion through the sweep and both regrade branches. A real SQL regression test confirms migration 0031 already retains these fields. Only responseHash/response_hash are intentionally removed by the RPC; no new migration is required.
- Legacy score-zero FRQs without missing elements produce weak item-level evidence, including browser-graded rows with no frq_result. Weak events cannot contribute class share, lesson count, source counts, or class timestamps.
- Commit 3 adds --backfill-feedback (explicit feedback write; --dry-run overrides it), with the existing 20/minute limiter and retries. The snapshot must include frq_result so already-detailed rows are skipped.
- Both route modes use one conditional DB update containing only frq_result. It compares response, score, and previous result to reject stale/concurrent writes, stores the score of record in the result, and labels the provider ai-backfill. No grade, timestamp, receipt, or ticket-state update occurs. Real SQL tests check preservation of every other column.
- PeriodE read-only baseline: 4,775 rows, 386 curriculum_quiz rows, 6 FRQs with results, zero events. Same-row local result: 53 events (28 MCQ, 25 weak FRQ), zero class-persistent entries. Full aggregate evidence keys are in test-results/misconceptions-fix-repro.log.
- No migration to apply, no push, no live backfill. Temporary verification files remain under test-results/, not state/.
- Final server suite: 91 files passed, 1,771 tests passed, 3 skipped. Final root suite (four workers): 9,970 passed, 22 failed, 1 skipped; all 22 failures match the 24-failure baseline, with J2/J4 baseline timeouts passing on rerun. The pre-existing teacher-workspace/renderMisconceptions unhandled error remains. No new failures.
- GitNexus impact checks completed before implementation; staged detect_changes completed for each commit. The aggregate backfill diff is flagged HIGH (14 flows), partly inflated by duplicate symbols in the pre-existing test-results/e-wednesday-baseline checkout. The actual staged file list and diff were reviewed independently and contain only the intended changes.
