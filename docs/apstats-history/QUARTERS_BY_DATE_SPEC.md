# QUARTERS_BY_DATE_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 108). The teacher's
> correction: a grading quarter is a CALENDAR WINDOW, not a band of
> units. Today `roster-server/grade-config.js` defines quarters as unit
> bands (Q1 = units 1-3, ...) and `quarterOfUnit()` assigns a lesson's
> quarter by its unit number. This feature makes quarter assignment
> date-driven, and -- because that is meaningless without per-lesson
> dates -- lays out the real SY26-27 lesson schedule (today every
> `periods` date in `lesson-schedule.json` is null). Next: freeze a
> *_BUILD.md contract -> Sonnet on roster-server + planner on the Desk.

## 1. Problem

`roster-server/lesson-grade.js` `computeQuarterFromLessons` already
date-FILTERS lessons (a lesson is "due" when `entry.periods[period] <=
today`), but the quarter a lesson BELONGS to is still chosen by its unit
(`grade-config.js` `quarters.Q1.units = [1,2,3]`, etc.). A quarter at
Lynn Public Schools is a calendar window with a fixed close date. When
unit pacing lines up with the quarter windows the two agree; whenever a
unit spills across a quarter boundary they diverge and lessons land in
the wrong quarter's grade.

Two coupled halves -- this feature needs both:

- Part A -- lay out the SY26-27 lesson schedule. `lesson-schedule.json`
  has 77 lessons; every `periods.{B,E}` date is null. "Quarter by date"
  is meaningless until lessons have dates. Adding the dates also (by
  design) activates the Desk's date-based sequential lesson gate.
- Part B -- make quarter assignment date-driven.

## 2. Goal / non-goals

Goal: each lesson is assigned to the quarter whose calendar window
contains its scheduled date; the SY26-27 schedule carries real dates.

Non-goals:

- Progress Checks stay unit-scoped. A PC (`U{N}-PC-Q{n}`) has no lesson
  date; its quarter stays `quarterOfUnit(unit)`. Untouched.
- No per-period divergence for SY26-27. Periods B and E receive
  identical dates (a single schedule). Real per-period pacing is a later
  teacher edit -- the data model already supports it.
- Not a gradebook-model change. The completion ceiling, the PC->P
  curve, the `ws:W:Q` weights, the cap/uncap -- all unchanged. Only
  quarter ASSIGNMENT changes.
- `gradingWindowStart` (`2026-09-01`) needs no change -- the first
  SY26-27 lesson (2026-09-09) is already after it.

## 3. The SY26-27 calendar (authoritative input)

From the teacher's Lynn Public Schools SY26-27 forecast. Quarter windows
-- a lesson dated within a window belongs to that quarter; a window
starts the day after the previous quarter's close:

| Quarter | Window (inclusive) |
|---------|--------------------|
| Q1 | 2026-09-09 .. 2026-11-13 |
| Q2 | 2026-11-14 .. 2027-01-29 |
| Q3 | 2027-01-30 .. 2027-04-09 |
| Q4 | 2027-04-10 .. 2027-06-23 |

Non-school days (excluded when placing lesson dates) -- all weekends
plus: 2026-10-12 (Columbus Day), 2026-11-03 (Election Day / in-service),
2026-11-11 (Veterans Day), 2026-11-26..27 (Thanksgiving), 2026-12-24 ..
2027-01-01 (Winter Break), 2027-01-18 (MLK), 2027-02-15..19 (February
Recess), 2027-03-26 (Good Friday), 2027-04-19..23 (Spring Recess),
2027-05-31 (Memorial Day), 2027-06-18 (Juneteenth).

Half-days (2026-09-23, 2026-10-07, 2026-11-25, 2026-12-09, 2027-01-13,
2027-02-03, 2027-03-03, 2027-03-17, 2027-04-14, 2027-05-12, 2027-06-16)
ARE school days -- students attend -- so a lesson date may fall on one.

The calendar is a teacher-provided forecast; the quarter close dates are
config values (Part B, D2) so a later correction is a one-line edit.

## 4. Part A -- the SY26-27 schedule layout

Unit -> quarter mapping (the established Phase 6 banding, retained as
each unit's home quarter): Q1 = units 1,2,3; Q2 = units 4,5; Q3 = units
6,7; Q4 = units 8,9.

Layout rule: for each quarter, take that quarter's lessons in topic
order and the ordered list of school days in the quarter window, and
spread the lessons evenly across those school days -- monotonically
increasing, the last lesson on or before the quarter close date.
Combined-worksheet topics (topics sharing a `worksheetKey`, e.g. 4.1 and
4.2) receive the SAME date. `periods.B` and `periods.E` get identical
values.

This is a defensible first-pass pacing the teacher refines by editing
`lesson-schedule.json` (plain JSON). The dates are produced by a
committed, re-runnable generator script (under `scripts/`), not
hand-typed, so the layout is correct-by-construction and auditable; the
BUILD doc fixes the exact algorithm.

## 5. Part B -- date-driven quarter assignment

`grade-config.js`:
- each `quarters.Q{n}` entry gains its window (`start`, `end` ISO date
  strings) alongside the existing `units` and `pcAnchor`.
- new helper `quarterOfDate(dateStr, cfg)` -> `'Q1'..'Q4' | null`:
  which window contains the date (boundaries inclusive).
- `quarterOfUnit` stays (PCs, and the null-date fallback).

`lesson-grade.js`:
- a lesson's quarter = `quarterOfDate(lessonDate)` when the lesson has a
  date, ELSE `quarterOfUnit(entry.unit)`. The unit-band fallback keeps a
  not-yet-dated lesson working -- graceful degradation, no code change
  when the teacher adds a future lesson.
- `lessonDate` is the section-aware `periods[period]` (or the B/E union
  when section is unknown), consistent with the existing `isDue`.
- `computeQuarterFromLessons` selects a quarter's lessons by this
  date-driven quarter, replacing the `quarterBand.includes(entry.unit)`
  band filter. The existing due-by-today filter, the
  ungraded-due-counts-as-0 rule, the ceiling math, and
  `gradingWindowStart` are all unchanged.

`server.js` (`/grade`, `/class/grades`): thread the quarter windows from
config; otherwise the per-quarter call shape is unchanged.

## 6. Desk display

The Desk's Do-Now quarter-outlook pills and `QUARTER_BAND_LABEL` (which
`start-here.html` mirrors) currently label quarters by unit band. Minor
co-change: relabel to the date window (e.g. "Q1: Sep 9 - Nov 13") or
keep the unit label -- a display-only decision finalized in the BUILD
doc. The quarter GRADES themselves come from the server and need no Desk
math change.

## 7. Testing

roster-server (`roster-server/tests/`):
- `quarterOfDate` -- each window, the boundary dates (a date exactly on
  a close date is in that quarter; the next day is the next quarter),
  out-of-year -> null.
- `computeQuarterFromLessons` date-driven -- a lesson is graded into the
  quarter its date falls in, not its unit band; a null-date lesson
  falls back to the unit band.
- the generated `lesson-schedule.json` -- every lesson has non-null B/E
  dates, each date is a school day, dates are monotonic in topic order,
  and each lesson's date sits in its unit's home quarter window.

## 8. Risks / gotchas

- Touches `roster-server/**` -> roster-server auto-deploys on push.
  This is a real grade-math change; the test bar is high.
- Side effect (intended): adding real dates activates the Desk's
  date-based sequential lesson gate -- lessons now also unlock on their
  scheduled date, not only on prior-lesson completion.
- Do not regress the PC path -- `quarterOfUnit` and the per-quarter
  `pcAnchor` stay.
- EOL: `lesson-schedule.json` and the roster-server files -- preserve
  each file's existing line endings.
- Stage own paths only.

## 9. Locked decisions

- D1. A lesson's quarter is date-driven, with a unit-band fallback for a
  null-date lesson.
- D2. Quarter close dates are `grade-config.js` config -- a calendar
  correction is a one-line edit.
- D3. SY26-27 dates are generated by a committed script, not hand-typed.
- D4. Periods B and E share one schedule (identical dates) for SY26-27.
- D5. PCs remain unit-scoped.
