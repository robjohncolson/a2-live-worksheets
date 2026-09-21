# Flashcards: one mode, no pass/fail; lesson check retired — spec (2026-09-21)

The teacher's decisions: there is one flashcard activity (the daily 10), it is not pass/fail and
nothing about it mentions 80%, and the digital lesson check is deprecated because it confuses
students. Flashcards count only through the daily Engagement redemption (raw `correct/total`,
already recorded per day by `/flashcards/daily`).

Rules: match surrounding style; no new dependencies; do not run `scripts/bump-build.mjs`, commit
or push; add/update tests; root suite may fail only the six inherited files
(`tests/a2-fork-freeze`, `tests/phase4b-structure`, the three `tests/progress-reset-matrix-*`,
`tests/journeys/j7-offline-grade`), `roster-server` `npm test` fully green; never print or commit
student names or secrets. GitNexus does not index this checkout: do not refresh or write any
index; grep for callers before editing a function and list the blast radius in your report.
`A2_STUDENT_GRADES_VISIBLE` stays `false`.

S1. **One mode.** Remove the "Full deck" button and the full timed deck as a student-facing mode on
the Desk and mobile. The Flashcards button starts the daily draw of 10 (`dailyDraw`) and that is
the only flashcard activity. Title it "Flashcards — <lesson>", with "Question n of 10". Keep the
review-due (spaced practice) feature as it is. Dead code for the timed deck may stay if removing
it is risky, but no student-reachable control may start it.
S2. **No pass/fail, no 80.** Remove every student-facing "pass", "≥ 80%", "caps at 80%", "Need ≥
80% to mark Done", "Flashcards not passed/passed" string. The end screen shows "You got n of 10",
the review of misses, and "Try again (new shuffle)". A finished run always records the raw result
through the existing daily path; stop writing the capped pass/fail ledger item
(`BL-…-DESK_DONE`) for A2 flashcard runs.
S3. **Nothing depends on a flashcard pass.** Lesson completion, unlocks, the coach/Do Now nudges
("make one up to 80% with the Desk flashcards") and any gate that required a flashcard score of
80 must no longer require or mention it. A lesson's completion must not be blocked by flashcards.
S4. **Lesson check retired.** Remove the "Open lesson check" button from the lesson panel, the
"Lesson check not attempted / n%" line from calendar cells and the lesson panel, and any Do Now /
coach text that tells a student to take it. `check.html` stays reachable by direct URL for the
teacher but nothing on student pages links to it. The server keeps accepting old `lesson-check`
rows (history), and the district formula already ignores them.
S5. Calendar cells and the lesson panel then show only what still exists: Try-Its (n of m scored)
and, once grades are visible, nothing about flashcards passing. Start Here, the syllabus and the
Open House handout must not mention a lesson check or a flashcard pass; fix any leftover wording.
