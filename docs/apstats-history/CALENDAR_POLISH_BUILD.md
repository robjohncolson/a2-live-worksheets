# CALENDAR_POLISH_BUILD.md

Frozen implementation contract for **Thread 2 -- Calendar polish**.
`CALENDAR_POLISH_SPEC.md` is the design; this is the precise, frozen
contract. Written 2026-05-21 (session 106).

## 0. Method and ownership

PLANNER-DIRECT. The single edited file `ap_stats_roadmap_square_mode.html`
is the contended ~10k-line Desk -- edited by the planner, never a
parallel subagent.

Owned paths: `ap_stats_roadmap_square_mode.html` (EDIT),
`tests/calendar-polish.test.js` (NEW).

Before editing, Grep the call sites of the three touched functions
(`paintDonowCells`, `rCal`, `htm`) and confirm the blast radius is
calendar-internal. (The GitNexus MCP tools are not loaded this session;
Grep-based caller analysis substitutes for `gitnexus_impact`.)

## 1. Line anchors (session-106 investigation -- verify before editing)

- `tdy()` ~9840 -- midnight-today.
- `htm(inf, dateStr)` ~9843-9863 -- cell HTML builder. Direct-link icon
  loop ~9850-9862; `linkHtml` appended in the return ~9863.
- `rCal()` ~9865 -- calendar grid render; builds week objects, applies
  `.cell-today` ~9888, calls `paintDonowCells()` ~9924.
- `donowLessonCovers(L,T)` ~4119; `donowCellState(topic)` ~4126;
  `paintDonowCells()` ~4147-4162.
- `_donowData` ~4114; `_donowData.nextTask` ~4179.
- `QUARTER_BAND_LABEL` ~4212-4217 (`Q1:'U1, U2, U3'`, `Q2:'U4, U5'`,
  `Q3:'U6, U7'`, `Q4:'U8, U9'`).
- CSS: `.cell-today` ~453-462; `.dc-partial/.dc-done/.dc-ahead`
  ~472-480; `.link-row` ~1010-1016; `.dc` cell rules ~401-441.

## 2. C1 -- greyscale done lessons (CSS only)

Add a CSS rule near the existing `.dc-done` block (~472):

```
.dc-done:not(.cell-today):not(.cal-current) { filter: grayscale(1); }
```

- No change to `paintDonowCells` logic for C1 -- the rule keys off the
  class that function already assigns.
- `.dc-ahead` is untouched (keeps its gold pulse).
- The `:not(.cell-today):not(.cal-current)` exclusion implements
  spec D-C1b -- emphasis suppresses recede.

## 3. C2 -- emphasize the current lesson

3a. `paintDonowCells()` (~4147): add `'cal-current'` to the
    `classList.remove(...)` call so it is cleared on every repaint.
    After the existing `.dc-*` logic, add: read
    `nt = _donowData && _donowData.nextTask`; if `nt && nt.lesson &&
    donowLessonCovers(nt.lesson, c.dataset.topic)`, add `'cal-current'`
    to the cell. Guard fully -- `nextTask` may be null/absent.

3b. New CSS rule for `.cal-current` -- a bright accent OUTLINE:

```
.cal-current { outline: 3px solid var(--accent, #3a6ff0); outline-offset: -3px; }
```

   `outline` is a separate property from `box-shadow`, so the rule does
   not collide with the `.dc-*` ring declarations. The accent blue is
   distinct from the green / gold / black rings. A text corner-marker
   was considered but dropped -- the ~50px cell is too small and a
   marker would overlap the date label.

## 4. C3 -- Q1-Q4 quarter dividers

4a. Add a helper `unitQuarter(u)` near `QUARTER_BAND_LABEL`: returns 1
    for units 1-3, 2 for 4-5, 3 for 6-7, 4 for 8-9, else 0. (Matches
    `QUARTER_BAND_LABEL` and roster-server's Phase 6 bands.)

4b. In `rCal()`'s week-render loop: for each week, compute its quarter
    as `unitQuarter(minUnit)` where `minUnit` is the smallest `inf.u`
    among that week's day cells that have a unit. Track `lastQuarter`
    (start 0). When a week's quarter is non-zero AND differs from
    `lastQuarter`, append a `<div class="cal-qband">` BEFORE that
    week's `.wk-row`, then set `lastQuarter`. Weeks with no unit cell
    (review/off/exam only) emit nothing and do not change
    `lastQuarter`.

4c. Band label text: `'Quarter ' + n + '  (' + QUARTER_BAND_LABEL['Q'+n]
    + ')'` -- e.g. `Quarter 2  (U4, U5)`. Build it with
    `textContent`/DOM, not innerHTML.

4d. New CSS rule:

```
.cal-qband {
  padding: 3px 8px; font-size: 10px; font-weight: bold;
  background: var(--black); color: var(--white);
  border-bottom: 1px solid var(--black); letter-spacing: 0.5px;
}
```

   The `.cal-qband` div is a sibling row inside `.cal-outer`, NOT a
   cell inside a `.wk-row` -- it does not participate in the week
   grid, carries no `data-topic`, and is never painted by
   `paintDonowCells`.

## 5. C4 -- remove the per-cell direct-link icons

5a. In `htm()` (~9850-9862): delete the icon-building loop (the
    `getAllRegistryEntries` iteration that builds `<div class="link-row">`
    of worksheet/quiz/blooket links). Remove the `linkHtml` variable
    and drop it from the return value (~9863).

5b. Delete the `.link-row` and `.link-row a` CSS rules (~1010-1016).

5c. Do NOT remove `getAllRegistryEntries` -- it is used elsewhere; only
    the cell-icon consumer is removed. Clicking a cell still opens the
    resource modal (unchanged).

## 6. Test file -- tests/calendar-polish.test.js (NEW)

vitest + jsdom, following the existing Desk structure-test pattern
(see `tests/desk-donow-card.test.js` for how the Desk HTML is loaded
and CSS/strings are asserted). Pins:
- C1: a `.dc-done` greyscale rule exists with the
  `:not(.cell-today):not(.cal-current)` exclusion; `.dc-ahead` is not
  greyscaled.
- C2: `paintDonowCells` source clears and conditionally adds
  `cal-current` via `donowLessonCovers` against `_donowData.nextTask`;
  a `.cal-current` CSS rule exists.
- C3: `unitQuarter` maps units to quarters correctly; `rCal` emits a
  `.cal-qband` on quarter change; label text derives from
  `QUARTER_BAND_LABEL`; `.cal-qband` CSS exists.
- C4: `htm` no longer references `link-row`; the `.link-row` CSS is
  gone.

## 7. Rules

- EOL: the Desk file is LF -- preserve it. The new test file is LF.
- ASCII-only in the new test file (the marker text 'NOW' and label
  text are ASCII).
- Stage own paths only at commit time -- never `git add -A`.
- `data/skill-map.js` may regenerate a timestamp-only header if the
  audit runs -- `git checkout` it if that is its only diff.

## 8. Definition of done (GREEN)

- follow-alongs `npm test`: no NEW failures beyond the known
  pre-existing `tests/study-guide.test.js` fail; `calendar-polish`
  passes.
- `node scripts/audit-feeder-ids.mjs` -> CLEAN 69 / MISMATCH 0.
- The Desk file stays LF.
- Commit is Thread-2-only (the Desk file + the new test); the push
  does NOT touch `roster-server/**`, so no roster-server redeploy.
