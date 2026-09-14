# Task 2: ledger recorded_at refresh + teacher TI-84 practice visibility (Codex implement spec)

Repo: C:/Users/rober/Downloads/Projects/school/follow-alongs
Owned paths: roster-server/ (code + tests), teacher-dashboard.html
Do NOT touch: ti84-trainer-v2/, gradebook-client.js, tests/ at repo root, any worksheet, ap_stats_roadmap_square_mode.html.
Do NOT commit. Leave changes in the working tree. The tree has pre-existing dirty and untracked files - never revert or stage them.
Context: roster-server auto-deploys to Railway on push to master, so correctness here is grade-adjacent. Both changes below are additive and must not alter any grade computation.

## Part 1: refresh recorded_at on ledger upsert

Problem (verified finding): insertLedgerRow (roster-server/ledger-db.js, ~lines 28-48) upserts on (student_id, source, item_id, attempt) but omits recorded_at from the payload. The column default now() (migrations/0002_item_ledger.sql:15) fires only on INSERT, so a conflict-update leaves the original timestamp. Any same-attempt re-submission (TI-84 trainer re-practice, worksheet attempt-1 re-answers, Blooket re-import) keeps a permanently stale recorded_at while score/response update. The teacher's recent feed (/teacher/student/:sid/recent, teacher.js ~131-194, sorted recorded_at desc) therefore buries re-practiced items at their FIRST submission date.

Change: add recorded_at: new Date().toISOString() to the upsert payload in insertLedgerRow so re-submissions surface as recent.

Before shipping, verify by reading the code (and say so in your report):
1. roster-server/scoring.js latestPerItem - recorded_at is only a tie-break within one item_id; confirm fresher timestamps cannot change which row wins for grading.
2. The persistent-answers fetchPrior dedupe path - confirm nothing keys on recorded_at stability.
3. Any other consumer of recorded_at in roster-server/ (grep it).

Tests: roster-server has its own vitest suite (cd roster-server && npm test). Add or extend a test pinning that the upsert payload now includes a recorded_at ISO string. Follow the existing mocking style in roster-server/tests/.

## Part 2: additive trainer summary on /class/grades + dashboard panel

Problem (verified finding): TI-84 trainer practice rows (source 'trainer', itemId 'TI84-<procedure-id>') land in item_ledger but are grade-inert by design, and the ONLY place a teacher can see them is the per-student recent drawer (newest-20 mixed feed). There is no class-level 'who is practicing' view.

Change A (server): in the /class/grades handler path (roster-server/class.js - fanLedger at ~39-51 already fetches each student's full ledger rows and computeGrade ignores trainer rows), derive an additive per-student summary from the ALREADY-FETCHED rows - no new DB round-trips:

  trainer: {
    procedures: <count of distinct item_id with source 'trainer'>,
    avgScore: <mean of score over those rows, 0-1, null when none>,
    lastAt: <max recorded_at ISO string, null when none>
  }

Attach it to each student's entry in the /class/grades response. Students with zero trainer rows get trainer: null (or omit the field - pick one and be consistent; document which in your report). Do not change any existing field, total, or ordering. Grade math untouched.

Change B (dashboard): teacher-dashboard.html already fetches /class/grades. Add a compact "TI-84 Practice" section that lists only students having trainer activity: student name, distinct procedure count, average score as a percent, and last-practice date (humanized like the dashboard's existing date displays). Follow the dashboard's existing section/markup/styling conventions exactly (read how the Remediation section is structured and mirror it). If the class grid table has a natural place for a small extra column, you may ALSO add one, but the section is the requirement; do not redesign the grid.

Tests: extend roster-server tests for the /class/grades response shape: a student with two trainer rows for the same item and one for another item -> procedures 2, avgScore computed over the rows as returned by the (upsert-deduped) ledger, lastAt = the max. A student with no trainer rows -> the null/omitted convention you chose. Existing tests must stay green.

## Verify + report

1. cd roster-server && npm test - exit 0.
2. Do not run the repo-root suite (another agent owns tests/ right now).
3. Report: files touched, the recorded_at consumer audit results (item 1-3 above), the trainer-field convention chosen, and test counts.
