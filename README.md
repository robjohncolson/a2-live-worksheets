# Algebra 2 Desk

An isolated Algebra 2 fork for LEHS sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), and G (Tue/Wed/Thu/Fri), SY2026–27. Early-release Wednesdays remain meeting days.

The roster, academic ledger, receipts, transcripts, flashcards, teacher feedback, and offline recovery survive. The district grade is Assessments 50% (minimum 4), Assignments 40% (minimum 10), and Engagement 10% (minimum 10). Lesson checks are 10 points, topic assessments 100, Try-Its 2, and passed lesson decks 1 per quarter. Missing due work counts as zero after its lesson day. The alternative v3 engine retains its two-track gates.

Content is authored in `../Lesson_planning`; see `A2_FORK_PLAN.md` for the Savvas transcription and question-bank pipeline. Lesson 1-1 is published in `content/a2/`; later lessons remain unpublished until authored content is ready.

Run `npx vitest run` at root, `npx vitest run` from `roster-server/`, and `pytest tests/` at root. Named inherited failures and phase results live in `A2_FORK_BASELINE.md`.


Add/drop bonus window: work due on or before September 18, 2026 can only raise the category grade: attempted work counts only when it does not lower the running average. Unattempted bonus work is excluded; later due work follows the normal zero rule.

Topic assessments can be retaken any number of times. The latest score replaces the earlier one. Makeup and retake times are announced in class.

Historical architecture and removed-feature documents are in `docs/apstats-history/`; use `A2_FORK_PLAN.md` and `A2_FORK_BASELINE.md` for the current Algebra 2 implementation.

## Deployment

The private repository is `robjohncolson/a2-live-worksheets`. Both Vercel and GitHub Pages host the static root; Railway runs `a2-live-worksheets` from `roster-server/`. A2 shares an existing Supabase project, with all tables and RPCs isolated in schema `a2` (`ROSTER_DB_SCHEMA=a2`).

Follow [deploy/RUNBOOK.md](deploy/RUNBOOK.md) for bootstrap SQL, REST schema exposure, environment variables, both hosts, CORS, smoke checks, Schoology dry-run and rollback. Regenerate SQL with `node scripts/build-bootstrap-sql.mjs`. The committed Railway URL is a placeholder; replace it with the actual service URL before student use.
