# DESK MONTHLY GRADE CHECK-IN SPEC

> **Status:** SHIPPED 2026-07-16 in `cb8ffd4` (Desk + `tests/desk-grade-checkin.test.js`).
> **Owner:** teacher. **Target:**
> `ap_stats_roadmap_square_mode.html`. **Scope:** teacher-only reminder UI and
> browser-local acknowledgment state. No grading-engine, database, or student
> behavior changes.

## 1. Problem and decision

The private grade-trajectory monitor in the sibling `Lesson_planning` workspace
is useful only if the teacher remembers to run and inspect it throughout the
year. The Desk is opened routinely and already has role-gated Teacher menu,
Teacher Tools, badge, and System 7 overlay patterns.

Add a **Monthly Grade Check-in** reminder to the Desk. It should make a check-in
hard to overlook without interrupting instruction or exposing the private grade
policy.

The check-in is a review prompt, not an instruction to change assumptions every
month. A valid outcome is "reviewed; no change needed." Assumption changes remain
manual and should be evidence-driven, especially after the first full month,
first real PC results, and quarter boundaries.

## 2. Privacy boundary

The Desk is public client code even when an element is role-gated. Therefore the
implementation MUST NOT contain or render:

- Any private curve, floor, threshold, transformation, or grading-policy value.
- Student names, identifiers, grades, report rows, or class-level report values.
- The contents of `config.private.json`, `latest.json`, `latest.md`, or history.
- A note field in which private policy details could accidentally be stored.
- An absolute local filesystem path or Windows username.

Allowed Desk state is limited to schedule keys, completion timestamps, and
snooze dates. The UI may refer generically to a "grade trajectory check-in" and
the private local monitor.

The reminder MUST be invisible and inert for students, signed-out users,
teacher view-as sessions, and Preview as Student. HTML reminder elements must be
hidden by default so there is no pre-JavaScript flash.

## 3. User experience

### 3.1 Awareness surfaces

Add all three teacher-only entry points:

1. A **Grade Check-in...** item in the Teacher menu with a compact due badge.
2. A **Grade Check-in** tile in the existing Teacher Tools window.
3. A compact banner inside the roadmap window when the current check-in is due
   soon, due, or overdue.

Do not auto-open a modal and do not request browser notification permission.
The banner and badge are enough. An overdue reminder remains visible until the
teacher marks that period reviewed or deliberately snoozes it.

### 3.2 Check-in window

Open a System 7 overlay matching the existing Teacher Tools and Nightly Review
windows. It shows:

- Current state: upcoming, due soon, due today, overdue, or reviewed.
- The applicable check-in label and due date.
- Last completed check-in and the next scheduled check-in.
- A short workflow checklist:
  1. Confirm the latest backup verifies.
  2. Run the grade trajectory monitor.
  3. Compare observed participation/feeders with the simulation assumptions.
  4. Record either no change or make a separately reviewed private-config change.

Provide these command buttons:

- **Copy Run Command**: copies `node grade-monitor\run.mjs`. The adjacent text
  says to run it from the `Lesson_planning` workspace. Use `navigator.clipboard`
  with a non-destructive fallback when clipboard access is unavailable.
- **Download Backup**: calls the existing `_downloadGradeBackup()` helper. Label
  this as an optional fresh manual backup; do not imply that it updates the
  nightly backup path used by the monitor.
- **Snooze 3 Days**: hides the banner and menu badge through the local snooze
  date. The Teacher Tools tile remains available.
- **Mark Reviewed**: records only the period key and completion timestamp, then
  advances to the next outstanding or upcoming check-in.

No button may run a local process from the hosted Desk. Do not add a server
endpoint, shell bridge, file upload, report parser, or report display.

## 4. Schedule

Due dates are derived from the active `SCHEDULE_DEFS[cYear]`; do not maintain a
second hand-written list of monthly dates.

Calendar arrays in `SCHEDULE_DEFS` use JavaScript's zero-indexed month convention.
For example, `[2026, 8, 1]` is September 1, 2026. Convert them with the existing
`dateFromArr()` helper or equivalent `new Date(year, monthIndex, day)` logic; never
interpret the middle value as a human month number.

### 4.1 Periods

For each active school-year definition:

- **Preseason**: due on the final eligible weekday before `def.range.start`.
- **Monthly**: one check-in for each calendar month intersecting the active
  schedule range. It is due on that month's final instructional day.
- **Final month**: stop at the final instructional day before the AP Exam or the
  schedule range end, whichever comes first. Exam and post-exam rows are not
  instructional days.

SY26-27 has `_legacyS: null`, so its authoritative rows exist only after
`loadYear()` generates the global `S` from pacing. Derive monthly instructional
dates from that generated `S`. A row is instructional only when at least one
period has a real lesson/admin cell; a period sentinel of `NC`, `OFF`, `EX`, or
`PO` is not instruction. Do not duplicate holiday or pacing logic from the
calendar generator.

`updateUserRoleUI()` can run before `S` is ready. In that state the reminder
renderer must safely hide/defer, then recalculate after `loadYear()` has populated
`S` and invoke it again from the calendar refresh path.

Each period has a stable key scoped to the schedule, for example:

```text
SY26-27:preseason
SY26-27:2026-09
SY26-27:2026-10
```

### 4.2 Reminder states

- More than 7 calendar days before due: `upcoming`; no banner or menu badge.
- 1-7 calendar days before due: `due-soon`; show an amber reminder.
- On the due date: `due`; show the reminder.
- After the due date and incomplete: `overdue`; use the existing restrained
  warning treatment and keep it visible.
- Completed: hide that period's banner/badge and advance to the next period.
- Snoozed: hide banner/badge until the snooze date, but do not mark complete.

If multiple periods are outstanding, surface the oldest incomplete period and
show the outstanding count. Marking it reviewed advances to the next one.

Use local calendar dates, not UTC date slicing. For deterministic tests, honor
the Desk's existing `apstats_desk_today_override` localStorage override.

## 5. Local state

Use one versioned localStorage key:

```text
apstats_teacher_grade_checkin_v1
```

Suggested shape:

```json
{
  "v": 1,
  "completed": {
    "SY26-27:preseason": "2026-08-31T19:30:00.000Z"
  },
  "snoozedUntil": {
    "SY26-27:2026-09": "2026-09-28"
  }
}
```

Requirements:

- Parse and validate defensively; ignore unknown fields.
- A malformed or unavailable store must not break the Desk.
- Storage failure should err toward showing a due reminder, not silently marking
  it complete.
- Completion is intentionally device-local in v1. Another device may remind
  again; that conservative duplication is acceptable.
- Signing out or entering student preview hides the UI but does not erase the
  teacher's local completion history.

## 6. Integration points

Keep the implementation localized in `ap_stats_roadmap_square_mode.html`:

- Teacher menu near the existing Nightly Review entry.
- A hidden banner near `#roadmap-status`.
- A hidden overlay beside the Teacher Tools/Nightly Review overlays.
- One static tile in `_TEACHER_TOOLS`.
- `updateUserRoleUI()` to render or clear reminder state on role changes.
- `loadYear()` or the equivalent calendar refresh point so a schedule change
  recalculates periods.

Suggested function surface (names may change only for a strong local reason):

```text
_gradeCheckinToday
_gradeCheckinPeriods
_gradeCheckinLoad
_gradeCheckinSave
_gradeCheckinStatus
_renderGradeCheckinUI
openGradeCheckin
closeGradeCheckin
_gradeCheckinMarkReviewed
_gradeCheckinSnooze
_gradeCheckinCopyCommand
```

All entry points must independently enforce `_deskIsTeacher()`. Do not rely only
on the visibility of the Teacher menu.

## 7. Accessibility and responsive behavior

- Use actual buttons for actions and the reminder banner.
- Keep visible focus behavior and keyboard activation.
- Give status changes `aria-live="polite"`; do not steal focus on page load.
- Match existing System 7 typography, borders, and square controls.
- Overlay width must fit at 390px mobile width and normal desktop sizes without
  horizontal scrolling or clipped button text.
- Do not add animation beyond existing Desk interaction feedback. Respect the
  existing reduced-motion behavior.

## 8. Tests

Add `tests/desk-grade-checkin.test.js` using the repository's existing Vitest
source/VM extraction style.

### 8.1 Pure schedule/state tests

Pin at least these SY26-27 outcomes from the current calendar:

- Preseason is Monday, August 31, 2026: the final eligible weekday before the
  Tuesday, September 1 start. It is not the preceding Friday.
- September resolves to its final instructional day.
- December resolves before the configured winter break, not December 31.
- The final period stops before the AP Exam/post-exam rows.
- Seven-day warning boundary, due date, and overdue transitions.
- Completion advances to the next period.
- Snooze suppresses the banner only through its specified date.
- Malformed localStorage does not throw and does not fabricate completion.

### 8.2 Role and structure tests

- Menu item, badge, banner, overlay, and Teacher Tools tile exist.
- Banner and overlay are hidden in static HTML.
- Student/signed-out/Preview as Student calls hide the surfaces and cannot open
  the overlay or mark a period reviewed.
- `updateUserRoleUI()` and calendar refresh invoke the renderer.
- Added source contains no private policy numbers, report contents, or absolute
  path.

### 8.3 Visual verification

Serve the Desk and inspect browser screenshots at approximately 1440x900 and
390x844. Use Playwright when it runs on the host; otherwise use the available
interactive browser-automation harness. Source-only assertions are not a visual
substitute. If no browser automation can run, report the visual pass as an
explicit residual verification item rather than claiming it passed.

- Teacher, upcoming: no banner.
- Teacher, due-soon/overdue using `apstats_desk_today_override`: banner and badge
  are readable; overlay controls do not overlap.
- Student and Preview as Student: no reminder UI.

Use the existing test override; do not change the real system clock.

## 9. Acceptance criteria

The feature is complete when:

1. A teacher gets a visible but non-modal reminder starting seven days before
   every derived check-in date.
2. Overdue reminders persist and multiple missed periods are not silently lost.
3. Marking reviewed and snoozing behave deterministically across reloads.
4. Students and preview/view-as sessions never see or activate the feature.
5. No private grading-policy value or report data enters tracked Desk code or
   browser storage.
6. No grade, ledger, roster, Supabase, or server behavior changes.
7. Focused tests and relevant existing Desk tests pass, and desktop/mobile
   screenshots show no clipping or overlap.

## 10. Non-goals

- Automatically running Node, Racket, or the monitor from the browser.
- Automatically changing simulation assumptions or grades.
- Synchronizing acknowledgments across devices.
- Adding a Supabase table, migration, API endpoint, email, push notification, or
  OS scheduled task.
- Displaying monitor results in the Desk.
