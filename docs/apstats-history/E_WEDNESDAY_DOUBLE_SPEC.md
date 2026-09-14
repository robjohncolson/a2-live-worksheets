# E_WEDNESDAY_DOUBLE_SPEC.md — two topics on Period E's Wednesday double block

**Decided by the teacher 2026-09-11.** Period B meets Mon/Tue/Thu/Fri (four single blocks). Period E meets
Mon/Wed/Fri, and Wednesday is E's 90-minute double block. Both sections get 240 instructional minutes a week, but
the calendar generator assigns **one topic per meeting**, so E gets 3 topics/week to B's 4 and falls a topic further
behind every week. Under the current rule E finishes the pacing list on **Apr 30, 2027** — 11 days before the May 11
exam, with no slack — while B finishes Mar 2.

**Fix:** on E's Wednesday double block, teach **two consecutive topics**. That is the same minutes-per-topic B gets
(one topic per single block; two per double block). It is NOT the packing that was rejected on 2026-09-05
(`SCHEDULE_PACKING_SPEC.md` stacked up to three short videos into one *single* block; one topic per single block
stays law). Nothing here touches grading weights; due dates move for E only, and only forward.

## 1. The rule (generator)

In `generateSchedule` (`ap_stats_roadmap_square_mode.html`, ~line 9988), when placing Period E on a day:

1. The day is a Wednesday (`dow === 3`) **and** the period's `doubleDay` equals that weekday (`E.doubleDay: 3` —
   the field already exists on every period def and is currently ignored). B has `doubleDay: null` → never doubles.
2. The date is **on/after `doubleFrom`** (new period-def field, `E.doubleFrom: [2026,8,14]` — Mon Sep 14, so the
   past Wednesdays Sep 2 / Sep 9, already taught single, are never rewritten).
3. The date is **not an early-release Wednesday** (new schedule-def field `earlyRelease: [[2026,8,30],[2026,9,21],
   [2026,10,18],[2026,10,25],[2026,11,9],[2026,11,23],[2027,0,13],[2027,1,10],[2027,2,3],[2027,2,17],[2027,3,14],
   [2027,4,19]]` — the twelve dates in `sy2627-calendar-intake.md` §2; E's block is shortened, so it stays single).
4. The next two queue items are both **plain lessons** (no `kind`: not Welcome/orientation, Poster, PC, PCA, Review)
   **and in the same unit** (`u` equal, `u > 0`).

When all four hold, the two items are placed on that one day as a **group cell**; otherwise the day is single exactly
as today. Never pair across a unit boundary; never pair a lesson with an event; never pair on B.

Deterministic result on the real SY26-27 calendar (this is the acceptance fixture — the build must reproduce it):

| E Wednesday | Pair | Unit |
|---|---|---|
| 2026-09-16 | 1.4+1.5 | 1 |
| 2026-09-23 | 1.7+1.8 | 1 |
| 2026-10-07 | 3.5+3.6 | 1 |
| 2026-10-28 | 4.2+4.3 | 2 |
| 2026-12-16 | 6.2+6.3 | 3 |
| 2027-01-06 | 5.6+6.8 | 3 |
| 2027-01-20 | 8.4+8.5 | 3 |
| 2027-02-03 | 7.1+7.2 | 4 |
| 2027-02-24 | 7.7+7.8 | 4 |
| 2027-03-10 | 2.5+2.6 | 5 |

Unit-end (PC Day 2) dates after the change: E U1 Oct 16 · U2 Dec 7 · U3 Jan 29 · U4 Mar 5 · U5 Mar 22
(B unchanged: Oct 9 · Nov 19 · Jan 8 · Feb 4 · Feb 25). E's review block ends Mar 31 instead of Apr 30.
**B's column must be byte-identical before/after** in `data/lesson-schedule.json`.

## 2. The group cell (Desk data shape)

A doubled day's E cell is one cell object, exactly the shape the Spring-2026 archived calendar already used for
E's Wednesdays (`d("6.4+6.5", …, db=true)`), plus an explicit member list:

```js
{ t:"1.4+1.5", n:"1.4 · … + 1.5 · …", u:1, due:"", as:"", db:true, ced:…,
  group:[ d("1.4",…), d("1.5",…) ] }      // full member cells, teaching order
```

- `t` = member keys joined with `+` (the calendar-day identity; matches the DOK group-key convention in
  `DOK_DAY_SHEETS_SPEC.md` §1). `db:true` drives the existing `2x` badge / "double topic day" tooltip / `** Double
  topic day **` info-bar lines (already in `cls()`/`sTip()`/`htm()` at ~23455/23481/24004 — keep them).
- `group` = the two complete member cells. **Every consumer that keys on a topic id resolves through the members,
  never through the joined string.** Add one helper, `groupTopics(cell)` → `["1.4","1.5"]` for a group, `[t]` for
  a single, and use it everywhere below. Historical `"A+B"` strings without `group` (the archived SY25-26
  `_legacyS`) must keep rendering as they do today.

## 3. Consumers that must treat a group as two lessons

Codex's inventory from the parked packing branch (`git show codex-packing-paused:state/schedule-packing-consumers.md`)
is the checklist — it enumerated every `.t` reader in the Desk via an Acorn walk. The required behaviour per consumer
is the same as that inventory describes; the *placement rule* is the only thing that differs from that branch. In
short:

- **Gate / completion** (`_isLessonComplete`, `localLessonState`, `donowCellState`, `_orderedPeriodTopics`,
  `_prevTopicInSequence`, `calNextUpTopic`, `paintLocalDoneCells`, `paintDonowCells`): a group day is complete only
  when **every member** is complete; the sequence gate advances past the day only then. `_isLessonComplete` is
  CRITICAL in GitNexus (4 direct callers, 33 upstream) — run `impact` before touching it and keep the change to
  "resolve members, then apply the existing per-topic oracle".
- **Do Now** (`renderDoNow`, `_renderTodayTopics`, `_focusTodayLessonVideo`, `maybeBumpThenOpen`): both members
  listed as due today; opening the day opens the full-day resource panel.
- **Resource panel** (`showResourcePanel`, `_lessonCoachHtml`, `_lessonDateMap`): render every member's videos /
  worksheet / quiz / flashcards / status in order, keyed by each member's OLD id (unique DOM ids per member).
- **Calendar render** (`cls`, `htm`, `cellAria`, `sTip`, `rCal`, `_wkIdxForTopic`, `rProg`, `_computePace`): show
  both labels (`1.4 · 1.5`), unit colour from the members, focus matches group or member; pace/progress count
  lessons by flattened members (66 core lessons, not days).
- **Teacher override** (`_isTopicLessonUnlocked`, `_confirmOverrideGate`): posts each member's individual key to the
  existing endpoint; no joined server key ever exists.
- **Apps** (`_ti84TodayTopic`, `appLaunchUrl`): first mapped member.
- **DOK ladder row** (`desk-dok-ladder-row`): see §5.

Keep `injectPcPosterEvents` as is — pairing happens at placement time, after injection, so unit-end Poster/PC
positions are unaffected except for shifting earlier in E.

## 4. Schedule JSON (`scripts/build-lesson-schedule-sy2627.mjs`) — grade-affecting, flag it

The builder extracts the Desk's generator and walks `S`. Changes:

- The `periods`/`earlyRelease`/`doubleFrom` literals must be picked up by the extractor (`litField` on the
  SY26-27 block) so the script runs the **same** rule the students' calendar runs.
- Walking placed cells: **flatten** a group cell into its members with the **same date** (both `1.4` and `1.5`
  get `periods.E = "2026-09-16"`). The "everything in pacing landed, in order" invariant compares the flattened list
  to `pacing` (unchanged semantics). The "strictly increasing date" invariant becomes: `date < prev` fails; `date ===
  prev` is allowed **only** for members of the same group cell.
- `lessons[topic].periods.E` therefore has the ten shared dates; `lessons[*].periods.B` byte-identical to today.
- The core-order fixture check (`scripts/fixtures/topic-schedule-sy2627.fixture.json`) is order-only and stays
  green. Do **not** edit the fixture.
- Add `dayGroups: { B: [], E: [["1.4","1.5"], …] }` to the output (schemaVersion stays 2; additive), keyed exactly
  as the table in §1. `dok-coverage.test.js` and `build_ladder.py` read it (§5).
- Regenerate BOTH copies (`data/` + `roster-server/data/`) and run `--check`. roster-server auto-deploys on push:
  the E due dates that move are the feature; nothing else in the server changes. Run `cd roster-server && npm test`
  (the sy2627 due-date/early-bonus tests and the m2b invariance fixtures may need their E dates updated — update
  the *expected dates*, never the engine).
- `tools/schoology-sync.py` / `build_schoology_fixture.py` consume per-topic due dates; two topics sharing a date
  must round-trip (the parked branch's `tests/test_packed_schedule_schoology.py` is the pattern to port —
  46 lines, no live writes).

## 5. DOK sheet on a doubled day — one sheet per class day, E only

Teacher decision (2026-09-05, reaffirmed 2026-09-11): a doubled day gets **one** DOK-3 sheet that covers both
videos. `DOK_DAY_SHEETS_SPEC.md` §1–§3 define the group sheet (key `1.4+1.5`, slug `1.4_1.5`, rungs (a)/(b)
walk the topics in order, starred DOK-3 on the last or integrating both, ≤ 10-minute finish, board slide lists both
follow-alongs). Follow it with these deltas, because here **B stays per-topic**:

- The **per-topic sheets are NOT archived** (B still hands them out). Group sheets are **additive**: ten new
  `dok/lessons/<slug>.yaml` + `dok/registry/<slug>.jsonl` + built tex/pdf, one per row of the §1 table.
- `dayGroups.B` is empty and `dayGroups.E` has the pairs; the day-sheet spec's "B and E groups are equal" assertion
  is replaced by: every `dayGroups.E` pair has a group sheet or a `dok/PENDING.md` line, and every member still has
  its per-topic sheet (`dok-coverage.test.js`).
- The Desk DOK row (teacher-only) on a doubled E day links the **group** sheet; on B's single days it links the
  per-topic sheet as today. `dok/index.html` lists group sheets under an "E Wednesday (two-topic) sheets" section.
- Still the ONE human-graded channel: never AI-graded, never auto-scored (`feedback_dok3_human_channel`).
- Authoring the ten sheets is Part 3 and is allowed to lag Parts 1–2 (ship with `PENDING.md` lines if needed; the
  first pair is Sep 16, so `1.4+1.5` and `1.7+1.8` must be built in this pass).

## 6. Tests

- New `tests/desk-e-wednesday-double.test.js` executing the **real extracted** Desk functions (pattern:
  `tests/desk-calendar-ced2026.test.js` / the parked `tests/desk-packed-calendar.test.js`): reproduces the §1
  table exactly; B unchanged; no pair on early-release Wednesdays; no pair across a unit boundary or with an event;
  nothing before `doubleFrom`; group completion requires both members; resource panel renders both; override posts
  both keys; legacy `"A+B"` cells still render.
- `scripts/build-lesson-schedule-sy2627.mjs --check` green; root `npm test`, `cd roster-server && npm test`,
  `pytest tests/` green (Windows-environmental failures per `reference_windows_root_test_failures` are known —
  list them explicitly rather than "fixing" them).
- Existing calendar/opener/grade-check-in/DOK harnesses adapted for shared dates where they assert E dates.

## 7. Out of scope

- No change to B. No change to pacing lists, unit boundaries, PC/Poster placement rules, grading weights, or the
  40 % floor. No packing (≤3 videos/day) — do not revive `codex-packing-paused` wholesale; use it as a reference
  map only, and never bring across its `tools/.schoology-sync-logs` fixtures (student data).
- No calendar UI for toggling the rule; it is data in `SCHEDULE_DEFS["SY26-27"]`.
