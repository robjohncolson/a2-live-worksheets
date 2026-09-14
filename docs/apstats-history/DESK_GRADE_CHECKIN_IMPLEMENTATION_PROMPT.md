# Implementation Prompt: Desk Monthly Grade Check-in

Work in:

```text
C:\Users\rober\Downloads\Projects\school\follow-alongs
```

Implement `DESK_GRADE_CHECKIN_SPEC.md` end to end. This is a coding task, not a
design-only response. Continue through implementation, focused tests, visual
verification, and a concise final report. Do not commit unless explicitly asked.

## Required orientation

1. Read `AGENTS.md` and obey its GitNexus workflow.
2. Read `DESK_GRADE_CHECKIN_SPEC.md` in full.
3. Inspect `git status --short` before editing. The worktree may contain unrelated
   user/agent changes; preserve them and do not clean, reset, or rewrite them.
4. Use GitNexus query/context to trace the Desk teacher-role and Teacher Tools
   flows. Before modifying any existing function, run upstream impact analysis
   on that symbol and report direct callers, affected processes, and risk. Warn
   before proceeding if risk is HIGH or CRITICAL.
5. Read the relevant existing code and tests, especially:
   - `ap_stats_roadmap_square_mode.html`
   - `tests/desk-nightly-review.test.js`
   - `tests/desk-summer-calendar.test.js`
   - `tests/desk-year-opener.test.js`
   - `PREVIEW_AS_STUDENT_SPEC.md`

If GitNexus reports a stale index, run the repository's documented analyzer
before continuing.

## User intent

The teacher wants a dependable monthly prompt to run the private grade trajectory
monitor and decide whether its assumptions still fit the evidence. The prompt
belongs in the Desk because the teacher opens it routinely.

This is a monthly review, not a mandate to modify assumptions. "Reviewed; no
change" is a normal result. The Desk must never reveal the private final-grade
policy.

## Hard boundaries

- Keep the feature teacher-only and hidden by default.
- `_deskIsTeacher()` must guard every open/mutate entry point. Student, signed-out,
  view-as, and Preview as Student states must hide and disable it.
- Do not add any private curve/floor/threshold/transformation value, report value,
  student data, private config, or absolute local path to tracked code or storage.
- Do not read or parse `Lesson_planning/grade-monitor` reports from the Desk.
- Do not add a server endpoint, migration, Supabase table, upload flow, shell
  bridge, notification permission, or background process.
- Do not modify grading, ledger, roster, backup, or student-progress behavior.
- Store only version, period completion timestamps, and snooze dates under
  `apstats_teacher_grade_checkin_v1`.
- Copy only the generic command `node grade-monitor\run.mjs`; identify
  `Lesson_planning` as the workspace in ordinary UI text, without an absolute
  path.
- Calendar definition arrays use zero-indexed JavaScript months. Always convert
  them through `dateFromArr()` or equivalent `new Date(y, monthIndex, d)` logic.
- SY26-27 has `_legacyS: null`; derive instructional dates from generated `S`
  only after `loadYear()` populates it. A date is instructional only when at
  least one period cell is not `NC`, `OFF`, `EX`, or `PO`.
- `updateUserRoleUI()` may run before generated `S` exists. Hide/defer safely in
  that state and rerender after the calendar load path completes.
- Reuse the active calendar definition and existing holiday/pacing logic. Do not
  hardcode a second monthly date list.

## Expected implementation

In `ap_stats_roadmap_square_mode.html`, add:

1. A Teacher-menu `Grade Check-in...` item with a due badge.
2. A static `Grade Check-in` tile in `_TEACHER_TOOLS`.
3. A hidden, teacher-only roadmap banner shown from seven days before a derived
   due date until completion, with overdue persistence.
4. A responsive System 7 check-in overlay containing status, due/last/next dates,
   the short workflow checklist, and these actions:
   - Copy Run Command
   - optional Download Backup using `_downloadGradeBackup()`
   - Snooze 3 Days
   - Mark Reviewed
5. Pure, testable schedule/state helpers implementing the spec's preseason,
   monthly final-instructional-day, exam cutoff, outstanding-period, completion,
   and snooze rules.
6. Rendering hooks on verified teacher role changes and calendar/year refreshes.

Use actual buttons, stable responsive dimensions, existing System 7 styles, and
`aria-live="polite"`. Do not auto-open the overlay or introduce new animation.

## Tests and verification

Create `tests/desk-grade-checkin.test.js`. Cover every case listed in the spec,
including deterministic dates through `apstats_desk_today_override`, malformed
storage, multiple outstanding periods, and all non-teacher gates.

Run focused tests first, at minimum:

```powershell
npx vitest run tests/desk-grade-checkin.test.js tests/desk-nightly-review.test.js tests/desk-summer-calendar.test.js tests/desk-year-opener.test.js
```

Then run any additional affected Desk suites identified by GitNexus/inspection.
Run the full root test suite if feasible; if not, state exactly what was not run.

Serve the Desk and use Playwright to inspect teacher due/upcoming and student
states at desktop and mobile viewports. If Playwright cannot run on the host, use
the available interactive browser-automation harness instead; source-only tests
do not count as visual verification. Use the existing date override rather than
changing the system clock. Check that text does not clip, controls do not
overlap, the overlay fits at 390px width, and hidden states truly render no
reminder. If no browser harness is available, report that pass as outstanding
instead of claiming success.

Before finishing:

1. Run `git diff --check`.
2. Search the added diff for private policy values, report data, student fields,
   and absolute paths.
3. Run `gitnexus_detect_changes({scope: "all"})` and confirm only the intended
   Desk reminder symbols/tests and flows are affected.
4. Review `git status --short` and separate your files from pre-existing changes.

Final response should list the implemented behavior, exact files changed,
verification results, and any residual limitation. The expected v1 limitation
is that acknowledgment is browser-local and may remind again on another device.
