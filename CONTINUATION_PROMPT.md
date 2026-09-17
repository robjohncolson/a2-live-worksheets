# Continuation Prompt — Algebra 2 Desk calendar and year plan

Written 2026-09-17 after an audit-only session (no code changed). Paste into the next
Claude Code / Codex session after `git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`,
`A2_FORK_BASELINE.md` and `docs/a2-lesson-targets.md` first.

## The question that started this

"The calendar is empty. We now have a tentative schedule for the entire year, centered on
Precalculus prerequisites and the SAT."

The schedule is not a date list. It is the section selection already recorded in
`docs/a2-lesson-targets.md` and `data/a2-lesson-targets.json`:

- Bare-minimum Topics 1-4 (17 of 25 sections): `1-1, 1-2, 1-5, 1-6, 2-1, 2-2, 2-3, 2-6, 2-7,
  3-1, 3-2, 3-4, 3-5, 4-2, 4-3, 4-4, 4-5`.
- Bridge material: `5-1, 5-5, 5-6, 6-1, 6-2, 6-3, 6-6, 7-1, 7-2`, ideally `7-3`.
- Ultra-compressed fallback (9 sections, probably too compressed): `1-1, 1-6, 2-2, 2-3, 2-6,
  3-2, 3-5, 4-3, 4-5`.

## Finding 1: the calendar is empty by design past Nov 6

Nothing is broken today. Every calendar cell comes from a *published* lesson with a
`sections` date, and only 1-1, 1-2, 1-5, 1-6 are published (dated through 2026-11-06).

Every path that puts a cell on the calendar:

1. `a2-desk.js:60-63` fetches `content/a2/lessons.json`, then overlays live pacing from the
   server `/lessons` route (`roster-server/a2-routes.js:59-61`, `overlayLessons` in
   `roster-server/a2-lessons.js:8`). Verified 2026-09-17: the production Railway server
   returns exactly the four committed lessons and dates.
2. `desk.html` `applyA2Pacing` (~line 6989) builds each section's queue: one cell per meeting
   day from the previous due date through this lesson's due date. No date, no cells.
3. `desk.html` `generateSchedule` (~line 7080) walks every weekday Sep 2 to Jun 17 and shifts
   from that queue. When the queue runs dry the cell is `NC`, rendered as a dimmed date
   (~line 14207). That is the blank stretch after Nov 6: about 30 teaching weeks.
4. `teacher-tryits.html` is the only pacing editor, and `validatePacing`
   (`roster-server/a2-lessons.js:23-27`) rejects any lesson key not in the published model.
   An unpublished lesson cannot be put on the calendar at all.
5. Dormant / stale paths: `_mergeRegistryData` (`desk.html` ~line 2307) would load a server
   `calendar` array into B/E columns (AP layout; would corrupt G), but
   `scripts/build-a2-roadmap-data.mjs` never emits one. `calendar.html` still redirects with
   `period=B|E`, so `calendar.html?period=G` lands on Section C.

`tests/a2-calendar.test.js` passes (4 tests) and pins the current behaviour.

## Finding 2: the plan does not fit at two-week windows

After 1-6 there are 32 calendar weeks left (about 30 teaching weeks). The plan still has 13
lessons in Topics 2-4 plus 9-10 bridge lessons: 22-23 lessons. At two weeks each that is
44-46 weeks. Meeting days per section (district closures removed, quarters from
`roster-server/grade-config.js`):

| Section | Q1 | Q2 | Q3 | Q4 | Total |
|---|---|---|---|---|---|
| C (Mon/Tue/Thu) | 25 | 27 | 32 | 24 | 108 |
| D (Mon/Wed/Fri) | 26 | 26 | 31 | 23 | 106 |
| G (Tue/Wed/Thu/Fri) | 37 | 35 | 41 | 33 | 146 |

With 27 lessons, C and D get about 4 meeting days per lesson. That matches the 3-period
Klimsara cadence in `../Lesson_planning/CLAUDE.md` (three teaching periods per lesson plus
an assessment day), not the two-week windows in `docs/a2-lesson-targets.md`. Note 1-1 was
already extended to almost four weeks.

## What ../Lesson_planning offers

It is last year's repo (SY25-26, Topics 3-6). Reusable assets:

- Finished LaTeX student and teacher packets (`tex/L{NN}_P{N}_*.tex`) for 3-5, 4-3, 4-4,
  4-5, 5-1, 5-4, 5-5, 6-3, 6-4, 6-5. That covers 8 of the 13 remaining plan lessons plus
  5-1 and 5-5 in the bridge, so authoring those in `content/a2/` is transcription.
- A Savvas question bank (`questionbank/registry.jsonl`) with per-item IDs and DOK tags,
  which is what lesson checks should draw from (the Topic 1 assessment has no DOK 3 item).
- `DOKframework.txt` and the Klimsara 3-period template (Do Now, Launch, Explore 35-40 min,
  Share, Exit).
- Its `A2LessonSelection.txt` chose 5-4, 6-4, 6-5, which the new plan marks `later`. The
  two selections disagree; the department has adopted neither.

## Proposed plan (needs the teacher's decision on step 1 before coding)

1. **Decide the cadence.** Recommended: four meeting days per lesson for C and D, about five
   for G, with the topic assessment taking one day. Two weeks per lesson cannot reach the
   bridge material.
2. **Decouple the calendar from publishing.** Add a `sections` date map to
   `data/a2-lesson-targets.json` for every keep, brief and bridge lesson. Have
   `applyA2Pacing` and `scripts/build-a2-roadmap-data.mjs` draw unpublished lessons as
   planned cells (dimmed, no check link, no due-date zeros). Grading stays keyed to the
   published model so nothing counts as missing. Extend `validatePacing` so the pacing tool
   accepts any targeted lesson.
3. **Generate the dates by script** from the cadence and the closures in `SCHEDULE_DEFS`
   (`desk.html`) / `lynn-public-schools-2026-2027.md`, writing both the JSON and the pacing
   table in `docs/a2-lesson-targets.md`. Update `roster-server/grade-config.js` quarters
   (currently Q1 = units 1-3, Q2 = 4-5, Q3 = 6-7, Q4 = 8-9), which the new plan contradicts.
4. **Publish next lessons in plan order**, starting with those that already exist in
   Lesson_planning tex (4-3, 4-4, 4-5, 5-1, 5-5) once Topics 2 and 3 are authored.
   Remember the regeneration commands in `CLAUDE.md` after editing `lessons.json`.
5. **Small fixes while in there:** `calendar.html` period mapping (C/D/G), and the dead B/E
   branch in `_mergeRegistryData`.

## Verification checklist for whoever implements

- `npx vitest run` at root, `npm test` from `roster-server/`, `pytest tests/` at root.
- `tests/a2-lesson-targets.test.js` refuses to publish a `later` lesson; keep that.
- `node scripts/bump-build.mjs` before committing any Desk change (PWA cache).
