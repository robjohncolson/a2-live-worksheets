# WITHDRAWN 2026-09-05 — the teacher reverted schedule packing (pace too fast). Do not run. Kept for the record.

# Codex prompt — build the packed SY26-27 schedule (rule A), relabel the calendar to the Fall-2026 CED, then the per-day DOK sheets — 2026-09-05

Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs` (Windows; forward slashes; `python`, `node`, `pdflatex`,
`pdfinfo` on PATH; run everything from the repo root). **Plan first, then implement, in this order: Part 1 → Part 2 → Part 3.**
Write the plan to `state/schedule-packing-PLAN.md` and STOP for the teacher's OK before Part 1's first commit if your
packed calendar differs from the simulation in `SCHEDULE_PACKING_SPEC.md` §2 (rule A: B core done 2027-01-07, E 2027-02-12,
15 doubled days) by more than a day or two. **Never push.** Commit per part; report hashes.

Teacher decisions already made (do not re-open): rule **A** (≤ 3 videos and ≤ 30 min per day); the DOK sheet on a doubled
day covers **all** of that day's videos (one sheet per class day); freed days stay as slack; calendar labels use the NEW
CED topic numbers and unit colours. The DOK-3 is never AI-graded.

## Read first
`SCHEDULE_PACKING_SPEC.md` (all), `DOK_DAY_SHEETS_SPEC.md` (all), `APS_DOK_LADDER_SPEC.md` §1–§2 and §6, `SCHEDULE_HANDOFF.md`
§0–§2, `dok/README.md`, `data/video-minutes.json`, `2026-crosswalk.json`. Code: `ap_stats_roadmap_square_mode.html` from
`function d(t,n,u,due,as,db)` (~line 9885) through `loadYear` (~10230) — `injectPcPosterEvents`, `SY2627_PACING_B/E`,
`SCHEDULE_DEFS["SY26-27"]`, `generateSchedule`, `rCal` (~22969) and `rProg`; `scripts/build-lesson-schedule-sy2627.mjs`;
`roster-server/lesson-grade.js` `deriveQuarterBands` (majority rule, 2026-09-05) and the m2b goldens; `dok/build_ladder.py`;
the three DOK test files; `tests/desk-dok-ladder-row.test.js`. Simulation reference: the orchestrator's sim (reproduce it —
slice `function d(`…`function generateSchedule(` from the Desk into `node:vm` with `R/OFF/EX/PO/NC` stubbed; the Desk's own
values are `R="review",OFF="off",EX="exam",PO="post",NC="noclass"`).

## Part 1 — packing + calendar relabel (packing spec §4.1–§4.3, §4.5)
1. `scripts/measure-video-minutes.mjs` (ffprobe over `media/*.mp4`, keyed `unit-lesson__idx__id.mp4` → topic) that
   regenerates `data/video-minutes.json`; keep the committed file identical unless `media/` changed.
2. `scripts/pack-pacing-sy2627.mjs`: reads the pacing arrays, `data/video-minutes.json`, `2026-crosswalk.json`; emits the
   GROUPED pacing arrays (rule from `SCHEDULE_DEFS["SY26-27"].packing = { maxVideos: 3, maxMinutes: 30 }`) as a reviewable
   rewrite of the `SY2627_PACING_B/E` literals in the Desk (never across a NEW unit, never across a PC/Poster/orientation
   item, order preserved). Groups are literal arrays inside the pacing list so the teacher can hand-edit later.
3. `generateSchedule`: a group occupies one meeting day; the cell carries `group: [...]` (each member a full `d()` cell) and
   `t` = the group key `1.1+1.2+1.3`, `n` = the joined NEW-CED labels. `rCal`/`rProg`/resource panel/Do Now/due-chip code
   paths that read `inf.t` must handle a group (open the resource panel for the group → list every member's resources in
   order; the Do Now lists every member as due that day). Grep every consumer of `.t` on calendar cells before you change
   the shape; add `isGroup(inf)` + `groupTopics(inf)` helpers and use them everywhere.
4. Relabel: pacing `n` → `"<newTopic> · <newLabel>"` from the crosswalk (fold notation for shared new topics, e.g.
   `1.10 · Investigative Question & Data Collection (3.1)`), pacing `u` → NEW unit; `rProg` and cell colours by NEW unit;
   bonus topics get the ★ tier. `lessons[].unit` in the JSON stays OLD. Add the test: no SY26-27 cell text matches
   `/^[6-9]\.\d/`.
5. Generator: flatten groups (every member gets the group's date), emit `dayGroups: { B: [[...]], E: [[...]] }`, keep the
   fixture core-order invariant, regenerate BOTH `data/lesson-schedule.json` and `roster-server/data/lesson-schedule.json`,
   regenerate m2b goldens (`UPDATE_M2B_GOLDEN=1`) and the grade-engine bundle (`node scripts/build-grade-engine.mjs`).
   Run: roster-server full suite, root `npx vitest run tests/grade-engine-bundle-parity.test.js tests/phase4-structure.test.js
   tests/desk-*.test.js tests/calendar-*.test.js tests/schedule*.test.js`, `python -m pytest tests/ -q` (Schoology sync
   reads the schedule). Report the packed unit-end dates per period against the spec's table.
6. Commit Part 1 as two commits: (a) scripts + data, (b) Desk + generator + goldens + tests.

## Part 2 — `dok/build_ladder.py` for day-groups (day-sheets spec §1, §3, §5)
`topics`/`worksheets` lists with the single-topic form still valid; slug (`+` → `_`) for every file name; header "Topics
1.1–1.3 (CED 1.1–1.3)"; one `\qrcode` + link per worksheet on the board; `tether_lines` over a list (dedupe); manifest keyed by
group key with `topics`; `index.html` "today" from `dayGroups`; loader ignores `dok/archive/`; coverage test keyed by
`dayGroups.B` with the subset rule and the B/E agreement assertion; registry test for `topics`/part `topic`/last-part rule;
emission test for a fixture group; single-topic YAMLs must emit byte-identical `.tex` (assert against the committed tex).
`tests/desk-dok-ladder-row.test.js`: the Desk row resolves the group sheet. Commit Part 2.

## Part 3 — author the 15 group sheets (day-sheets spec §2, §4, §6.3)
For each group in `dayGroups.B` order (the first, `1.1+1.2+1.3`, is taught 2026-09-08): archive the members' per-topic
YAML/registry/tex/pdf under `dok/archive/…` (`git mv`), then write ONE group problem from that archived material — one stem,
one first take, (a) from the first topic, (b) from the second, (c) on the last (or `integrates: true`), rules callout with
one rule per topic, load inside the 10-minute finish window, no leaks in callout/visual, every number recomputed in Python,
`scoring` E/P/I on (c). Build, compile, `pdfinfo` (2/1/≤3), open the PDFs and look; `--validate` + all three DOK suites
green; commit per 3–5 groups. Update `dok/README.md` ("doubled days") and append a "Group sheets" section to
`dok/AUDIT_2026-09.md` with the same criteria table as the audit. Do not touch the 31 single-topic sheets.

## Rules
- Never push. Never edit `roster-server/grade-config.js` weights or gates. Never change `altUrl`s. Never propose AI grading.
- If a consumer of calendar cells cannot be adapted safely (e.g. the offline pack or the Schoology sync assumes one
  topic per day), STOP and report rather than special-case it.
- Final report: packed unit-end dates per period; day count 87 → N; list of the 15 groups; test counts; commit hashes.
