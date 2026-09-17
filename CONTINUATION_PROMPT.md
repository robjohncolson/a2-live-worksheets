# Continuation Prompt — Algebra 2 Desk calendar and year plan

Updated 2026-09-17 after the implementation session. Paste into the next Claude Code /
Codex session after `git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`, `A2_FORK_BASELINE.md`
and `docs/a2-lesson-targets.md` first.

## Where things stand

The calendar is no longer empty past Nov 6. The five steps of the 2026-09-17 audit plan are
implemented:

1. **Cadence: two calendar weeks per lesson (teacher decision, 2026-09-17).**
   `scripts/build-a2-year-plan.mjs` (mode `weeks`, `weeks: 2`) dates every keep and bridge
   lesson in plan order; a window closes on the Friday of its second week, closures shorten
   it, and a window that would open on Thursday/Friday opens the next Monday. The year reaches
   5-6 (June 4-10) plus the Topic 5 assessment; **6-1 through 7-3 do not fit** and are listed
   in `pacing.unscheduled`. `--mode fit` and `--cadence C=n,D=n,G=n` remain for comparison.
2. **Calendar decoupled from publishing.** `data/a2-lesson-targets.json` carries `pacing`,
   `assessments` and per-lesson `sections`/`days`. `applyA2Pacing(lessons, plan)` in
   `desk.html` draws unpublished scheduled lessons as `planned` cells (dimmed, dashed,
   no click, no chips, excluded from next-up / gate / pace) and each topic's assessment day as
   a `kind: 'assessment'` cell. `a2-desk.js` fetches the plan and passes the server pacing
   overlay. `validatePacing(lessons, changes, targets)` accepts any non-`later` lesson;
   `/lessons` and `/teacher/lessons` return `{ lessons, pacing }`; `teacher-tryits.html`
   lists planned lessons in the pacing editor. Grading still reads only the published model.
3. **Dates by script**, from `SCHEDULE_DEFS` in `desk.html` (single source for closures).
   `docs/a2-lesson-targets.md` holds the generated table between `pacing-table` markers.
   `roster-server/grade-config.js` quarter unit bands are now Q1 [1], Q2 [2], Q3 [3,4],
   Q4 [5,6,7].
4. **Publishing next lessons** is unchanged: author 2-1 next (plan order), then run
   `node scripts/build-a2-year-plan.mjs` so its published dates replace the planned ones.
   Pre-existing tex in `../Lesson_planning` covers 3-5, 4-3, 4-4, 4-5, 5-1, 5-5.
5. **Small fixes:** `calendar.html` maps B→C, E→D, accepts G; the AP `calendar` branch in
   `_mergeRegistryData` is removed.

## Open items

- Topics 6-7 (the bridge material) do not fit at two weeks per lesson. The teacher can now
  close a lesson early from its Desk panel ("Teacher pacing": `PUT /teacher/pacing/reflow`,
  `lib/a2-year-plan.js` `reflowSection`), which re-dates the rest of that section; enough early
  finishes pull 6-1 onward onto the calendar.
- 2-6 has a two-day window (Dec 21-23) because of winter recess; the teacher may want to move
  its due date into January from the pacing tool.
- Brief lessons (1-3, 1-4, 2-4, 2-5, 3-3, 3-7, 4-1) are unscheduled (`--brief-days 1` dates them).
- Assessment dates come from the JSON, overridden by `TA-<topic>` pacing rows written by
  re-flow; the pacing editor still lists lessons only.
- Publish 2-1 onward in plan order.

## Verification checklist

- `npx vitest run` at root (new: `tests/a2-year-plan.test.js`; extended:
  `tests/a2-calendar.test.js`), `npm test` from `roster-server/` (new:
  `roster-server/tests/a2-year-plan.test.js`), `pytest tests/` at root.
- `node scripts/build-a2-year-plan.mjs --check` must print "a2 year plan is current".
- `tests/a2-lesson-targets.test.js` refuses to publish a `later` lesson; keep that.
- `node scripts/bump-build.mjs` before committing any Desk change (PWA cache).
