# QUARTERS_BY_DATE_BUILD.md

> Frozen implementation contract for F2 (quarters-by-date). Design:
> QUARTERS_BY_DATE_SPEC.md. Written 2026-05-21 (session 108). ONE Sonnet
> unit -- all roster-server. No Desk change (see Section 7).

## 0. Scope and ownership

One implementation unit, all inside `roster-server/`:

- `roster-server/grade-config.js`   -- EDIT (add windows + quarterOfDate)
- `roster-server/lesson-grade.js`   -- EDIT (date-driven quarter selection)
- `roster-server/grade.js`          -- EDIT (the per-quarter caller)
- `roster-server/data/lesson-schedule.json` -- REGENERATED (by the script)
- `scripts/build-sy2627-schedule.mjs` -- NEW (the generator)
- `roster-server/tests/lesson-grade.test.js`, `grade.test.js` -- EDIT (new signature)
- `roster-server/tests/quarters-by-date.test.js` -- NEW

EOL: preserve each file's existing line endings. `lesson-schedule.json`
is LF; keep it LF and 2-space-indented JSON (match the current file).
Stage only the paths above. Touches `roster-server/**` -> roster-server
auto-deploys on push.

## 1. roster-server/grade-config.js

In `PHASE3_CONFIG.quarters`, add `start` and `end` (inclusive ISO date
strings) to every quarter, alongside the existing `units` and `pcAnchor`
(both KEPT unchanged):

```
quarters: {
  Q1: { units: [1,2,3], start: '2026-09-09', end: '2026-11-13', pcAnchor: { p85: 40, p100: 60 } },
  Q2: { units: [4,5],   start: '2026-11-14', end: '2027-01-29', pcAnchor: { p85: 45, p100: 64 } },
  Q3: { units: [6,7],   start: '2027-01-30', end: '2027-04-09', pcAnchor: { p85: 50, p100: 67 } },
  Q4: { units: [8,9],   start: '2027-04-10', end: '2027-06-23', pcAnchor: { p85: 55, p100: 70 } },
},
```

Add a new exported helper after `quarterOfUnit`:

```
// Which quarter a calendar date falls in ('Q1'..'Q4'), or null if the
// date is outside every quarter window. Boundaries inclusive. ISO
// YYYY-MM-DD strings compare correctly lexicographically.
export function quarterOfDate(dateStr, cfg = PHASE3_CONFIG) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  for (const q of Object.keys(cfg.quarters)) {
    const w = cfg.quarters[q];
    if (w.start && w.end && dateStr >= w.start && dateStr <= w.end) return q;
  }
  return null;
}
```

`quarterOfUnit` is UNCHANGED -- it stays for the PC path and the
null-date fallback. `gradingWindowStart` ('2026-09-01') is UNCHANGED.

## 2. roster-server/lesson-grade.js

`computeQuarterFromLessons` becomes date-driven. Add at the top of the
file:

```
import { quarterOfDate, quarterOfUnit } from './grade-config.js';
```

(grade-config.js is pure config + pure functions -- no I/O -- so
lesson-grade.js stays unit-testable.)

Add a helper (export it for tests):

```
// The quarter a scheduled lesson belongs to. Date-driven, with a
// unit-band fallback for a lesson that has no usable date.
//   entry  -- a lesson-schedule entry { unit, periods: {B,E}, ... }
//   period -- 'B' | 'E' | null  (from sectionToPeriod)
// Returns 'Q1'..'Q4' (quarterOfUnit always resolves for units 1-9).
export function quarterOfLesson(entry, period, config) {
  const periods = (entry && entry.periods) || {};
  // A known section uses ONLY that section's date; a null there falls
  // through to the unit-band path (do NOT borrow the other section --
  // it would disagree with isDue). The B/E union is for period === null.
  let date = period ? (periods[period] || null)
                    : (periods.B || periods.E || null);
  if (date) {
    const q = quarterOfDate(date, config);
    if (q) return q;
  }
  return quarterOfUnit(entry && entry.unit, config);
}
```

`computeQuarterFromLessons` -- change the destructured params: REMOVE
`quarterBand`, ADD `quarterKey` and `config`. Everything else
(`lessonMap`, `schedule`, `todayDateStr`, `section`, `pcBandData`, `C`,
`gradingWindowStart`) stays.

In the body, the ONLY change is the band filter. Today:

```
if (!quarterBand.includes(entry.unit)) continue;
```

becomes:

```
if (quarterOfLesson(entry, period, config) !== quarterKey) continue;
```

`period` is already computed at the top (`sectionToPeriod(section)`).
Everything downstream -- `inWindow` / `gradingWindowStart`, the
`isDue` due-by-today filter, the ungraded-due-counts-as-0 rule, the
ceiling math, the return shape -- is UNCHANGED.

## 3. roster-server/grade.js

The per-quarter loop (currently ~lines 190-233). The `computeQuarterFromLessons`
call passes `quarterBand: band` -- change it to `quarterKey: qKey` and
add `config`:

```
qResult = computeQuarterFromLessons({
  quarterKey: qKey,
  config,
  lessonMap,
  schedule,
  todayDateStr: todayStr,
  section,
  pcBandData: { P_quarter },
  C,
  gradingWindowStart: (config && config.gradingWindowStart) || null,
});
```

`band` is still used by the loop for the unit-level `unitGrades` and the
`P_quarter` PC math -- KEEP `const band = config.quarters[qKey].units;`.
The no-schedule fallback branch (the `else`) does NOT call
`computeQuarterFromLessons` -- leave it untouched. The unit-level grade
path (the `quarterOfUnit` use ~line 144) is UNCHANGED.

## 4. scripts/build-sy2627-schedule.mjs (NEW)

A re-runnable Node ESM generator. Reads `roster-server/data/lesson-schedule.json`,
assigns every lesson a SY26-27 date, writes the file back.

Calendar constants (embed these literally):

```
WINDOWS = { Q1:['2026-09-09','2026-11-13'], Q2:['2026-11-14','2027-01-29'],
            Q3:['2027-01-30','2027-04-09'], Q4:['2027-04-10','2027-06-23'] }
UNIT_QUARTER = { 1:'Q1',2:'Q1',3:'Q1', 4:'Q2',5:'Q2', 6:'Q3',7:'Q3', 8:'Q4',9:'Q4' }
```

Closures -- NOT school days (singles and inclusive ranges):
2026-10-12; 2026-11-03; 2026-11-11; 2026-11-26..2026-11-27;
2026-12-24..2027-01-01; 2027-01-18; 2027-02-15..2027-02-19; 2027-03-26;
2027-04-19..2027-04-23; 2027-05-31; 2027-06-18.

Half-days are NORMAL school days -- do not exclude them.

Algorithm:
1. School-day test: a date is a school day if it is Mon-Fri AND not in
   the expanded closure set. Use UTC date methods (`new Date(iso)` then
   `getUTCDay()` / a UTC day-stepper) so there is no timezone off-by-one.
2. For each quarter, `schoolDays(Q)` = the ordered school days in
   `[WINDOWS[Q][0], WINDOWS[Q][1]]`.
3. Lessons in topic order: sort topicKeys by (unit asc, then the numeric
   part after the dot asc) -- matches `buildLessonsArray`.
4. Slots: group lessons by `unit + '/' + worksheetKey`. Each group is
   ONE slot (a combined worksheet -- e.g. 4.3/4.4/4.5 -- is one slot).
   Slot order within a quarter = the order of each group's first topic.
5. Per quarter: with `N` slots and `D = schoolDays(Q).length` (N <= D
   for every quarter here), place slot `i` (0-based) at
   `dayIndex = Math.round(i * (D - 1) / (N - 1))` for `N > 1`, or `0`
   for `N === 1`. Then enforce STRICTLY increasing indices: if
   `dayIndex <= prevIndex`, set `dayIndex = prevIndex + 1` (clamp to
   `D - 1`). This spreads slots evenly across the quarter window, last
   slot on or before the quarter close date.
6. Every topic in a slot gets that slot's date for BOTH `periods.B` and
   `periods.E` (D4: B and E share one schedule for SY26-27).
7. Write `lesson-schedule.json` back: same `{ schemaVersion, generatedAt,
   lessons }` shape, `generatedAt` bumped to now, 2-space indent, LF,
   trailing newline. Preserve each lesson entry's other fields
   (`unit`, `topicKey`, `worksheetKey`, `combinedWith`) verbatim --
   only `periods` is rewritten.

Run it (`node scripts/build-sy2627-schedule.mjs`) so the committed
`lesson-schedule.json` carries the SY26-27 dates. NOTE: U1-U5 are
currently null and U6-U9 currently carry STALE SY25-26 dates -- the
generator overwrites ALL 77.

## 5. roster-server/data/lesson-schedule.json

Regenerated by Section 4. After running the generator, sanity-check:
every lesson has non-null B and E dates; each date is a weekday and not
a closure; dates are non-decreasing in topic order; each lesson's date
sits inside its unit's home quarter window.

## 6. Tests

Update existing -- every `computeQuarterFromLessons({ quarterBand, ... })`
call in `roster-server/tests/lesson-grade.test.js` and `grade.test.js`
becomes `computeQuarterFromLessons({ quarterKey, config, ... })`. Import
`PHASE3_CONFIG` for `config`. Pick the `quarterKey` matching the units
each fixture intends. Keep every existing assertion passing.

New -- `roster-server/tests/quarters-by-date.test.js`:
- `quarterOfDate`: a date in each window -> that quarter; the exact
  start and end dates -> that quarter; one day before Q1.start and one
  day after Q4.end -> null; non-string / empty -> null.
- `quarterOfLesson`: a dated entry -> the date's quarter even when that
  differs from its unit band; a null-date entry -> `quarterOfUnit`.
- `computeQuarterFromLessons` date-driven: with a small fixture
  schedule, a lesson whose date falls in Q2 is counted in Q2 even if its
  unit is a Q1 unit; a null-date lesson falls back to its unit band.
- the regenerated `lesson-schedule.json`: load it; assert all 77
  lessons have non-null B/E; every date is Mon-Fri and not a closure;
  dates non-decreasing in topic order; each lesson's date is within its
  unit's home quarter window.

Full check before handing back: `npm --prefix roster-server test` green;
report the count.

## 7. Out of scope (do NOT change)

- The Desk (`ap_stats_roadmap_square_mode.html`) and `start-here.html`.
  The Desk calendar's unit-based quarter dividers are a visual aid and
  are intentionally left alone -- the teacher's correction was about the
  GRADE computation, which is server-side. A date-aligned calendar
  divider is a separate later task.
- `class.js` -- it only echoes `config.quarters` in its response;
  adding `start`/`end` is additive and needs no class.js edit.
- The PC path / `quarterOfUnit` / `pcAnchor` / the gradebook model
  (ceiling, weights, cap). Quarter ASSIGNMENT is the only change.
