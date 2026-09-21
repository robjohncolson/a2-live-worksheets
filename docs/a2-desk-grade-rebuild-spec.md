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
