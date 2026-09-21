# A focused student Desk — spec (2026-09-21)

The teacher's words: "Kids need only to know what needs to be done that day. Right now all things
are tentative, so a teacher maybe can see all the business, but a student needs a focused vision
on what matters, and ONLY what matters." And: Try-Its leave the student Desk for now; the teacher
grades them by hand from the physical packet on quiz day. Later the Desk may *display* that grade,
read-only; a student can never change it from the Desk.

Rules: match surrounding style; no new dependencies; do not run `scripts/bump-build.mjs`, commit
or push; add/update tests; root suite may fail only the six inherited files (`tests/a2-fork-freeze`,
`tests/phase4b-structure`, the three `tests/progress-reset-matrix-*`,
`tests/journeys/j7-offline-grade`), `roster-server` `npm test` fully green. GitNexus does not
index this checkout: do not refresh or write any index; grep for callers before editing a function
and list the blast radius in your report. `A2_STUDENT_GRADES_VISIBLE` stays `false`.

Two audiences, one flag. `a2FocusedView()` is true for role `student` **and for signed-out
visitors** (a student who has not signed in yet must not see the busy view either); false for
role `teacher`. Everything below applies only when it is true; the teacher's Desk is unchanged.

V1. **Calendar cells.** In the focused view a cell shows text only if it is a meeting day of the
viewed section that is **today or later within the current and next school week**; everything
earlier is an empty, quiet cell (no title, no sub-lines, no dashed borders, no hover card), and
nothing beyond next week is drawn except a topic-assessment or quiz day label. A visible cell
shows at most two lines: the lesson ("1-1 · Key Features of Functions") and that day's student
line (V3). Today's cell is visually the strongest thing on the calendar. No "Try-Its n/m scored,
n points", no "Lesson check", no IXL skill counts, no planned/dimmed future lessons, no "Landed:"
teacher notes in labels or tooltips.
V2. **Do Now banner.** One sentence for the day: "Today: <student line>" when there is one, else
"Today: <lesson title>"; on a non-meeting day "Next class <weekday>: <student line>". It never
mentions Try-Its, lesson checks or scoring. The "Your grade is in Schoology for now." line stays.
V3. **The student line.** `content/a2/day-log.json` entries gain an optional `student` string
(max ~80 characters): what the class is doing that day, written for students. Only `student` is
ever shown in the focused view; `note` and `plan` remain teacher-only. Author these for this week
from the existing plans:
  - C Tue Sep 22: "Example 5, Try It 5, then Example 4" · C Thu Sep 24: "1-1 Quiz"
  - D Wed Sep 23: "Try It 5, then Example 4" · D Fri Sep 25: "1-1 Quiz"
  - G Tue Sep 22: "IXL Web Jam, then Example 5 and Try It 5" · G Wed Sep 23: "Example 4" ·
    G Thu Sep 24: "Quiz review" · G Fri Sep 25: "1-1 Quiz"
  (add plan-only entries where a day has none; do not change existing `note`/`plan` text).
V4. **Lesson panel.** For the focused view it contains: the lesson title, "Open Flashcards", the
OneNote notebook link and the lesson's resource links (Blooket, IXL skills). It does not list
Try-Its, scores, the day-log history or teacher notes.
V5. **Try-Its off the student Desk.** No student surface shows Try-It items, counts, points,
"scored in class", or lets a student open, attempt or change a Try-It. The teacher scoring page
and the grade engine are untouched (the teacher will enter packet grades there). Leave one
documented seam for later: a read-only "Try-Its: your teacher gave you n/10" line behind a flag
`A2_SHOW_TRYIT_GRADES = false`; do not build the UI beyond the flag and a test that it is off.
V6. **Desktop clutter.** In the focused view hide the "Unit Progress" bar and its "On pace — n of
m lessons done" caption, and any desktop icon or menu item that leads only to hidden features
(My Progress is already hidden). Keep: My Receipts, the objectives strip, Sign in, flashcards.
V7. Tests with the real Desk page: signed-out and student see the focused calendar (assert the
exact visible text of a past cell = empty, today's cell, a next-week cell, a far-future cell);
teacher still sees today's full detail; no student-visible string matches
/Try-?Its?|scored|Lesson check|On pace|Landed/ anywhere on the Desk in the focused view.
