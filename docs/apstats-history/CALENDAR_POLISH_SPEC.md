# CALENDAR_POLISH_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 106). Thread 2 of the
> post-grade-pipeline backlog (CONTINUATION_PROMPT.md session 105).
> Companion frozen contract: CALENDAR_POLISH_BUILD.md.

## 1. Overview

Four visual-polish changes to the calendar grid on the AP Stats Desk
(`ap_stats_roadmap_square_mode.html`). The calendar is the vertical
week-grid a signed-in student sees on the Desk. This thread makes it
read better at a glance: finished work recedes, the current lesson
stands out, the academic quarters are labeled, and one redundant
per-cell control is removed.

Scope is ONE existing file plus ONE new test file. No server change, no
schema change, no new dependency, no change to the `/donow` contract or
the schedule data. The Desk is the contended ~10k-line single file --
this thread is planner-direct (never parallel-Sonnet).

## 2. Goals / non-goals

Goals:
- A student can tell at a glance what is done, what is now, and which
  quarter a week belongs to.
- Remove a redundant affordance (the per-cell direct-link icons -- the
  cell already opens a resource modal that covers them).

Non-goals:
- No change to the calendar's underlying schedule data, the resource
  modal, the Do Now card, the grade pills, or the `/donow` engine.
- No change to the 4-state Do-Now coloring LOGIC (`donowCellState`:
  none / partial / done / ahead). This thread layers VISUAL treatment
  on top of the classes that logic already assigns.
- No change to lesson gating or the sequential-unlock behavior.

## 3. The four changes

### C1. Done lessons render greyscale

Current: `paintDonowCells()` (Desk ~line 4147) adds `.dc-done` to a cell
whose covering Do-Now lesson(s) are all complete and dated today-or-past,
and `.dc-ahead` to a complete lesson dated in the future. Both render a
colored inset ring (`.dc-done` green, `.dc-ahead` gold + pulse).

Change: a `.dc-done` cell renders greyscaled (`filter: grayscale(1)`),
muting its unit color so finished past work visibly recedes.

Decisions:
- D-C1a. Greyscale applies to `.dc-done` ONLY. `.dc-ahead` (complete but
  ahead of the class date) KEEPS its celebratory gold glow -- being
  ahead is a reward state, not a "behind you" state.
- D-C1b. Greyscale is suppressed on the current-lesson cell (C2) and on
  today's cell. Emphasis wins over recede. Expressed purely in CSS:
  `.dc-done:not(.cell-today):not(.cal-current)`.
- D-C1c. Pure-CSS change keyed off the existing `.dc-done` class. No
  change to `paintDonowCells` logic for C1.

Hook: CSS block near the existing `.dc-done` rule (Desk ~line 472).

### C2. The current lesson is visually emphasized

Current: the calendar marks TODAY (`.cell-today`, black inset ring +
"TODAY" badge, ~line 9888) but does NOT mark the student's current
lesson. The current lesson -- the next incomplete lesson -- lives in
`_donowData.nextTask.lesson` (~line 4179) and is used only for the Do
Now card and the soft "bump" nudge.

Change: the calendar cell(s) matching `_donowData.nextTask.lesson` get a
distinct emphasis so a student sees "you are here" on the calendar.

Decisions:
- D-C2a. `paintDonowCells()` adds a new `.cal-current` class to every
  cell whose topic is covered by `_donowData.nextTask.lesson`, matched
  with the existing `donowLessonCovers()` helper (~line 4119) -- the
  SAME helper the done/partial/ahead coloring already uses. `.cal-current`
  therefore marks exactly the cells that helper matches (e.g. lesson
  "4.1-2" matches cell "4.1"), staying consistent with the existing
  coloring.
- D-C2b. If `nextTask` is null (student is all caught up) no cell is
  marked. Re-running `paintDonowCells` clears stale `.cal-current` the
  same way it clears the `.dc-*` classes.
- D-C2c. The emphasis is a bright accent OUTLINE plus a small corner
  marker -- NOT a box-shadow. An outline composes cleanly with the
  existing `.dc-partial/.dc-done/.dc-ahead` box-shadow ring, so a
  current lesson can show BOTH its Do-Now state and the current marker.
- D-C2d. `.cal-current` and `.cell-today` may coexist on one cell
  (today IS the current lesson) -- both treatments stack, no conflict.

Hook: `paintDonowCells()` (~line 4147) gains the `.cal-current` pass;
a new CSS rule for `.cal-current`.

### C3. Q1-Q4 quarter markers on the calendar

Current: the quarter -> unit mapping exists as `QUARTER_BAND_LABEL`
(~line 4212: Q1 = U1,U2,U3; Q2 = U4,U5; Q3 = U6,U7; Q4 = U8,U9) but is
used only by the Do Now grade strip. The calendar grid shows no quarter
boundaries.

Change: a slim full-width labeled divider row is rendered in the
calendar at the start of each quarter, e.g. "Quarter 2 -- Units 4, 5".

Decisions:
- D-C3a. Marker form = a horizontal divider row spanning the grid
  width, inserted ABOVE the first week-row of each quarter. NOT a
  per-cell badge -- the cells are small (~50px) and a badge crowds
  them.
- D-C3b. A week's quarter is derived from the unit of its lesson cells
  (the schedule entry's `inf.u`). When a week's quarter differs from
  the previously emitted quarter, emit the divider before that week.
  Weeks with no unit cells (review / off / exam-only) inherit the
  running quarter and emit nothing.
- D-C3c. Label text is sourced from `QUARTER_BAND_LABEL` so the
  calendar stays consistent with the Do Now grade strip and
  roster-server. No new quarter mapping is introduced.
- D-C3d. The divider is non-interactive (not a calendar cell -- it has
  no topic, is not painted by `paintDonowCells`, is not clickable).

Hook: `rCal()` (~line 9865) week-row build loop; the `QUARTER_BAND_LABEL`
const (~line 4212); a new `.cal-qband` CSS rule.

### C4. Remove the per-cell direct-link icons

Current: `htm()` (Desk ~line 9850-9862) builds a `.link-row` of up to
three direct-link emoji icons (worksheet / quiz / blooket) on lesson
cells whose registry entry is ready or partial. Clicking a cell ALSO
opens the resource modal, which lists the same links in full and visually
covers the cell -- the icons are redundant.

Change: delete the icon-building loop and the `.link-row` it produces.
Cells show only the date, topic id, lesson name, and the optional
double-topic badge. The resource modal (opened by clicking the cell) is
unchanged and remains the single way to reach a lesson's links.

Decisions:
- D-C4a. Remove the icon loop in `htm()` and drop `linkHtml` from its
  return value.
- D-C4b. Remove the now-unused `.link-row` CSS rules (~line 1010).
- D-C4c. `getAllRegistryEntries()` stays -- it is used elsewhere. Only
  the cell-icon CONSUMER is removed.

Hook: `htm()` (~line 9843-9863); the `.link-row` CSS (~line 1010).

## 4. Interaction and precedence

A single cell can carry several of these classes at once. Precedence,
all expressible declaratively in CSS:
- `.cal-current` (outline + marker) and `.cell-today` (box-shadow ring +
  badge) STACK -- different CSS properties, no conflict.
- `.cal-current` and `.cell-today` SUPPRESS the C1 greyscale (D-C1b).
- `.dc-ahead` is never greyscaled (D-C1a).
- `.cal-current`'s outline composes with any `.dc-*` box-shadow ring
  (D-C2c) -- a current lesson that is partially done shows the amber
  Do-Now ring AND the current outline.

## 5. Testing

New `tests/calendar-polish.test.js` (vitest + jsdom, following the
existing Desk structure-test pattern, e.g. `tests/desk-donow-*`):
- C1: a `.dc-done` greyscale CSS rule exists and excludes
  `.cell-today` / `.cal-current`; `.dc-ahead` is NOT greyscaled.
- C2: `paintDonowCells` adds `.cal-current` for the `nextTask` lesson,
  marks all cells of a combined-lesson next-task, clears stale
  `.cal-current` on re-run, and adds nothing when `nextTask` is null.
- C3: a quarter divider is emitted at each quarter boundary, label text
  comes from `QUARTER_BAND_LABEL`, dividers are not painted as cells.
- C4: `htm()` output contains no `.link-row`; the `.link-row` CSS is
  gone; clicking a cell still opens the resource modal.

Definition of done: follow-alongs `npm test` shows no NEW failures
beyond the known pre-existing `tests/study-guide.test.js` fail; the new
`calendar-polish` test passes; `node scripts/audit-feeder-ids.mjs` ->
CLEAN; the Desk file stays LF.

## 6. Risks and gotchas

- The Desk is the contended ~10k-line single file -- planner-direct,
  EOL LF preserved, no parallel-Sonnet.
- `filter: grayscale()` on a `.dc` element also greys that element's
  box-shadow ring -- this is intended (a done cell fully recedes).
- C3 must not break the `.wk-row` CSS grid layout -- the divider is a
  sibling row, not a cell inside a `.wk-row`.
- `paintDonowCells` runs both at the end of `rCal()` and on every
  `/donow` success -- the `.cal-current` add/clear must be idempotent,
  exactly like the existing `.dc-*` toggling.
- ASCII-only in the new test file (the Codex cross-agent runner has a
  known UTF-8 decode bug).
