# Desk grade rebuild — spec (approved by the teacher 2026-09-21)

Make the Desk the book of record for the grade the syllabus describes, with every grading pathway
idempotent, then let students see it again (`A2_STUDENT_GRADES_VISIBLE = true`) and push it to
Schoology instead of typing it there.

## Decisions from the teacher (2026-09-21)

- The Desk is the book of record; Schoology mirrors it.
- Every pathway that writes a score must be idempotent: re-running an import, a sync or a re-score
  produces the same gradebook, never a duplicate or a drift.
- Try-Its can always be attempted. A Try-It set the teacher has scored that a student has not
  attempted becomes a **provisional zero one week later**, shown to the student as not final; a
  later attempt replaces it. Nothing becomes zero before the teacher has scored that set for the
  section (a packet the teacher has not collected cannot hurt anyone).
- Work through Fri Sep 18 never counts against anyone (it became Bonus).

## Point values (approved) (config, not code: `grade-config` / `A2_FEEDERS`)

| Piece | Category | Points | Counted score |
| --- | --- | --- | --- |
| Try-It (each one is its own item) | Assignments | 10 | latest: 10 right with work · 8 real effort but wrong, or right with no work · 1–7 partial · 0 not attempted |
| Quiz | Assessments | 20 | latest; same 80% rule per question |
| Topic assessment | Assessments | 100 | latest (unchanged) |
| Daily Engagement | Engagement | 10 per class day | from `scripts/a2-daily-engagement.mjs` (Blooket + flashcard redemption); an absent day is no item, not a zero |
| IXL homework, when assigned | Bonus | up to the award the teacher sets | **A SmartScore of 80 counts as complete.** 100 is never required: past 80, IXL gets redundant and frustrating |
| Bonus | Assignments, extra credit | 0 possible, capped at 10 earned per quarter | sum of the bonus ledger |

Why these numbers, for Quarter 1 (4 lessons: 1-1, 1-2, 1-5, 1-6; 17 Try-Its; 19–27 class days left
per section; no topic test lands inside Q1 because Topic 1's test is dated Nov 9–10):
- Assignments: even if only ~12 of the 17 Try-Its get done, that is 12 items (district minimum 10)
  and 120 points, so the 10-point Bonus cap is worth about +3 on the quarter grade, as intended.
  On a 2-point scale the 80% rule cannot be expressed and Bonus would swamp the category.
- Assessments: Q1 will hold quizzes only, and the district minimum is 4, so plan one short quiz per
  lesson. At 20 points a quiz is a fifth of a topic test; in a two-test quarter five quizzes are
  about a third of Assessments, which matches "quizzes are evidence, the test is the measure".
- Engagement: one 10-point item per class day clears the minimum of 10 in about three weeks.
- Retired from the grade: the digital lesson check and the per-lesson flashcard pass (flashcards
  now count through the daily Engagement redemption instead).

Quarter 1 has no topic test (Topic 1's is dated Nov 9-10), so Assessments in Q1 are one short quiz
per lesson. The schedule is not changed by this work.

Rules for every work item: match surrounding style; no new dependencies; do not run
`scripts/bump-build.mjs`, commit or push; stay inside owned paths; add tests; the root suite may
fail only the six inherited files (`tests/a2-fork-freeze`, `tests/phase4b-structure`, the three
`tests/progress-reset-matrix-*`, `tests/journeys/j7-offline-grade`) and `roster-server` `npm test`
must be fully green; never print, log or commit student names or secrets. GitNexus does not index
this checkout: do not refresh or write any index; grep for callers before editing a function and
list the blast radius in your report. `A2_STUDENT_GRADES_VISIBLE` stays `false` until R4.

R0. **Copy.** Start Here's "What gets graded" table (the syllabus and Open House handout lift it)
states the points above and the IXL rule in the teacher's words: "When I assign IXL homework, a
SmartScore of 80 counts as complete. You do not need 100." Also: an unattempted Try-It becomes a
zero one week after I score that set, it is not final, and you can redo it any time. Owned paths:
`start-here.html`, `open-house.html`, `syllabus-*.html`, `scripts/build-open-house.mjs`,
`scripts/build-a2-syllabus.mjs`, and the tests that pin them.

## Work items (each idempotent by construction: one stable item id per thing, upsert not insert)

R1. **Engine.** New sources `quiz` and `daily-engagement`, `bonus` as extra credit (earned counts,
possible does not, capped per quarter); `try-it` to 10 points; `lesson-check` and `flashcard`
leave the district formula. Items exist only once **assigned for that section** (the teacher
scored it, or imported a day), so unassigned Try-Its never count. Provisional zero = assigned date
+ 7 days with no attempt; exposed as `provisional: true`. Server and client engine copies stay in
parity (`scripts/sync-server-shared.mjs`, bundle-parity tests).
R2. **Teacher entry.** `teacher-tryits.html`: 0–10 with one-tap 10 / 8 / 0 and a "collected today"
action that assigns the set to the section; quiz entry with the same presets per question. Every
save is an upsert keyed by (student, item), so re-saving is harmless.
R3. **Imports.** `scripts/a2-daily-engagement.mjs --commit` writes the day's points as
`daily-engagement` items (item id = date + section); `scripts/a2-bonus-totals.mjs --commit` writes
one `bonus` item per student per quarter. Both overwrite, never add; both have `--dry-run`.
R4. **Student view.** Flip `A2_STUDENT_GRADES_VISIBLE`; the lesson cells stop saying "Lesson check
not attempted"; provisional zeros read "not final — redo this any time".
R5. **Schoology mirror.** `tools/schoology-sync.py` maps the new sources to the three district
categories plus the existing Bonus column and overwrites scores; creating a column twice is
impossible (registry keyed by item id).

Order: R1 → R2 and R3 in parallel → review → R4 → R5. Nothing is visible to students until R4, so
R1–R3 can ship early without risk. Deploys happen outside school hours.

## Fix round 1 (after review of R0–R3)

One agent. Owned paths: `roster-server/**`, the engine sources and generated bundle, `scripts/**`,
`lib/**`, `teacher-tryits.html`, `deploy/**`, `tests/**`.

H1 (major). Score rows are filtered by the UTC date prefix of `recorded_at`, so anything saved
after 8 pm New York time is dated "tomorrow" and dropped until midnight (an evening re-score can
even remove a counted score). Convert timestamps to the school date (America/New_York) before every
date comparison, in the server engine and the generated client bundle.
H2 (major). A delayed retry of an older save can overwrite a newer score. Every teacher save and
import carries a monotonic client timestamp; the server stores it on the row and rejects (200,
`superseded: true`, no write) any write older than what is stored. Retrying the same request is a
no-op that returns the current row.
H3 (major). After a rescore whose receipt update failed, a retry returns the new score with the old
receipt. A receipt is valid only if it matches the row's current score and response; otherwise
reissue it.
H4 (major). `teacher-score-import.js` does not use the per-student serialization the teacher-entry
route uses, so concurrent imports can leave a row with another write's receipt. Share the same
lock and write score + receipt as one consistent step.
H5 (major). Protection of work through 2026-09-18 is decided from the *current* lesson date, so
re-pacing a lesson can turn protected September work into a penalty. Decide it from the dates
saved on the row (`assignedDate` / `dueDate` at the time of scoring).
H6 (minor). Saving an unchanged score must leave the row byte-identical (same `recorded_at`, same
receipt); detect "no academic change" before writing.
H7. Migration `0040_a2_teacher_entry.sql` stays (the `item_ledger.source` check constraint makes it
unavoidable). Regenerate `deploy/supabase_a2_bootstrap.sql` with `node
scripts/build-bootstrap-sql.mjs`, and add to `deploy/RUNBOOK.md` the one teacher step this deploy
needs: run the bootstrap (or migration 0040) in the Supabase SQL editor **before** the new server
code is used, plus how to verify it. The server must degrade safely if the migration has not been
run yet: reads keep working and a write of a new source fails with a clear 503 message naming the
migration, never a silent loss.
H8. `tests/journeys/a2-check.journey.test.js` and `roster-server/tests/bootstrap-sql.test.js` fail
now. After this round: root suite fails only the six inherited files; `roster-server` fully green.

## Fix round 2 (after the second review)

Same owned paths as fix round 1.

H9 (major, replaces H2's mechanism). Ordering by client timestamps is wrong: clocks differ between
the teacher's phone and laptop, and an unchanged save forgets that it was newer. Use optimistic
versioning instead, with no clocks: each score row carries an integer `version` (in the response
JSON; no new column). A write sends the `expectedVersion` it last saw (0 for a new row). Inside the
per-student lock: same `requestId` as the stored one → return the current row (idempotent retry);
`expectedVersion` equal to the stored version → accept and increment the version, **even when the
score is unchanged** (then `recorded_at`, score and receipt stay exactly as they were: only the
version moves); anything else → `409 { error: 'score-changed', current: { score, version } }` and
no write. `teacher-tryits.html` must surface a 409 (show the current score, let the teacher tap
again to overwrite it with the fresh version) and must never say "Saved" for a rejected write.
Imports read the current version and write inside the same lock (a snapshot import is
last-writer-wins by design); the CLIs print how many writes were rejected and exit non-zero if any.
H10 (major). September protection for a student with **no score row**: fall back to the saved
section assignment date (`a2_tryit_assignments.assigned_date`), never to the current schedule
date, in the server engine and the generated bundle.
H11 (major). Before migration 0040 is applied, the old trigger still keeps the best
topic-assessment score, so lowering 90 → 70 stores 90 while the helper signs and reports 70. Always
sign the receipt for, and return, the score the database actually stored; when it differs from the
requested score respond `503` naming migration 0040 (the correction did not take effect).
H12 (known, not fixed here). The retained alternative v3 engine still compares UTC date prefixes.
Production runs the district formula, and the v3 engine is frozen by decision; record this in
`A2_FORK_BASELINE.md` as an inherited limitation rather than editing v3.
After this round: root suite fails only the six inherited files; `roster-server` fully green.

## Fix round 3 (after the third review) — teacher tap queue

H13 (major). `teacher-tryits.html`: two taps on one item while the first POST is in flight both
carry `expectedVersion N`; the second is replayed with a stale version, gets 409 and is discarded,
so the teacher's latest tap is lost with no competing device. Same when a committed save's response
is lost. Sends for one (student, item) must be strictly serialized, and the queued record's
`expectedVersion` must be refreshed from the latest acknowledged response (or from the 409's
`current.version` when the server's stored `requestId` is one of ours) before it is sent. A 409
caused by a genuinely different writer still surfaces to the teacher.
H14 (major). Before migration 0040, a correction that the old trigger refused returns 503 the
first time but `200 ok` when the same `requestId` is retried (duplicate branch in
`roster-server/a2-routes.js` and `a2-score-write.js`), so the page drops it and the correction is
never retried. The duplicate branch must re-check that the stored score equals the requested
score and return the same 503 otherwise; the page keeps such a record queued and says why.
H15 (minor). "Saved" may be shown only for a request the server acknowledged. A record replaced in
the queue by a newer tap shows nothing; a queued-offline record shows "Queued", never "Saved".
Tests must drive the real page code through these interleavings. Same exit criteria as before.
