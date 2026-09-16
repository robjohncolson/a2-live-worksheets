# Algebra 2 Desk

An isolated Algebra 2 fork for LEHS sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), and G (Tue/Wed/Thu/Fri), SY2026–27. Early-release Wednesdays remain meeting days.

The roster, academic ledger, receipts, transcripts, flashcards, teacher feedback, and offline recovery survive. The district grade is Assessments 50% (minimum 4), Assignments 40% (minimum 10), and Engagement 10% (minimum 10). Lesson checks are 10 points, topic assessments 100, Try-Its 2, and passed lesson decks 1 per quarter. Missing due work counts as zero after its lesson day. The alternative v3 engine retains its two-track gates.

Content is authored in `../Lesson_planning`; see `A2_FORK_PLAN.md` for the Savvas transcription and question-bank pipeline. Lesson 1-1 is published in `content/a2/`; later lessons remain unpublished until authored content is ready.

Run `npx vitest run` at root, `npm test` from `roster-server/` (runs the legacy v3-forced suite and the district-formula suite; `npm run test:district` alone for the production formula), and `pytest tests/` at root. Named inherited failures and phase results live in `A2_FORK_BASELINE.md`.


Historical architecture and removed-feature documents are in `docs/apstats-history/`; use `A2_FORK_PLAN.md` and `A2_FORK_BASELINE.md` for the current Algebra 2 implementation.
