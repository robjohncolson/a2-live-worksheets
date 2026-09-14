# CALENDAR_CED2026_RELABEL_SPEC.md — the student-facing calendar speaks the Fall-2026 five-unit CED, everywhere

**Purpose:** the Desk's calendar, progress bar, and lesson cells still show the OLD nine-unit numbering ("Unit 8 · Lesson 4",
"U9", old topic ids as cell text). The course runs on the Fall-2026 CED: five units plus a "Beyond the Exam" tier. Students
must see the new numbers and unit colours on every surface they touch. This is a **display-only** change: the OLD topic key
stays the identity of every lesson under the hood (file names `u8_lesson4_live.html`, the grade engine, Schoology columns,
the DOK sheets, `data/lesson-schedule.json`), and no date, due rule, or grade moves.

> **Status:** proposed (2026-09-05, teacher: "the student-facing calendar is still using old unit conventions"). **Owner:**
> teacher. **Workflow:** spec → Codex builds (plan first) → orchestrator reviews and pushes. Zero schedule change. The
> packing work is REVERTED and must not be revived by this task.

## 0. What already exists

| Piece | Where | State |
|---|---|---|
| OLD → NEW map: `status core|bonus`, `newUnit`, `newTopic`, `newLabel`, `bonusUnit` | `2026-crosswalk.json` `map[old]`; the same data baked into the Desk's `REGISTRY.lessons[old].ced2026` and `roadmap-data.json` | authoritative; several OLD topics fold into one NEW topic (3.1+3.2 → 1.10, 3.5+3.6 → 1.13, 2.1+2.2 → 2.1, 4.1+4.2 → 2.3, 4.10+4.11 → 2.10) |
| Pacing lists: `{t:"8.4", n:"8.4 · Expected Counts", u:8}` per meeting day | `ap_stats_roadmap_square_mode.html` `SY2627_PACING_B/E` (~line 9925) | `n` and `u` are OLD; `t` must stay OLD |
| Calendar cell builder `d(t,n,u,…)`, `generateSchedule` | ~9885 / ~10190 | colour class from `u` |
| Cell render + progress bar `rCal`, `rProg` (`"U"+inf.u`, `def.units`) | ~22969, ~23302 | OLD unit for colour + progress segments |
| Unit colour tokens `--u1…--u9`, `--rev`, `--exam-bg` | Desk CSS | nine colours; SY26-27 needs five + a ★ Beyond-the-Exam tone |
| Legend `updateLegend(def)` from `def.units` | ~10328 | SY26-27 `def.units` is ALREADY the five NEW units — the legend and the cells disagree today |
| Resource-panel header | `showResourcePanel` ~11290 | already prints "Unit X · Lesson Y: <new label> · CED n.m (New Unit u)" — keep, but lead with the NEW id (§2.4) |
| PC / Poster calendar events | `injectPcPosterEvents` ~9892 | already NEW-unit keyed (`U{new}-PC1/PC2/Poster`) — unchanged |
| Baked `BAKED_REGISTRY.progressChecks` with "Unit 8/9 Progress Check" titles (~4650–4800) | Desk | SCHEDULE_HANDOFF says stale/not read — §3 asks for proof, then delete or relabel |
| Teacher dashboard quarter buttons | done 2026-09-05 (`pcUnits` → "Q1 · CED U1") | not in scope |
| Grade engine `deriveQuarterBands`, `lessons[].unit` | roster-server | OLD units by design — untouched |

## 1. Display contract (what a student sees)

1. **Cell text** on the calendar: `<newTopic> · <newLabel>` — e.g. `1.10 · Investigative Question & Data Collection`.
   For a folded topic the NEW id repeats on consecutive days; distinguish the days with a NEW-side suffix, never the OLD
   id: `1.10 · Investigative Question & Data Collection · Day 1` / `· Day 2`. Bonus topics: `★ Beyond the Exam ·
   <label>` in the ★ tone. Review / exam / off cells unchanged. **Students never see an OLD id on a cell.**
2. **Cell colour** = NEW unit (`--u1…--u5`), ★ tier its own tone; the legend (already NEW) and the cells therefore agree.
3. **Progress bar** (`rProg`) segments by NEW unit in NEW order (1…5, ★, Rev), labelled `U1…U5` per the legend's ids.
4. **Resource-panel header** for students: `1.10 · Investigative Question & Data Collection — CED Unit 1`, nothing else.
   The video title on screen and the worksheet file name still say "Unit 3 Lesson 1"; that is acceptable — the header
   does NOT print the OLD id to students. In **teacher mode only** the header appends the bridge: `(old 3.1: video "Unit 3
   Lesson 1", worksheet u3_lesson1)`.
5. **Do Now card, due chips, tooltips, "today" strings** — any place that prints a topic id to a student uses the NEW id
   through ONE helper (§2.1). The OLD key NEVER appears on a student surface. (Teacher decision 2026-09-05: "primarily
   show the new unit numbers first, and only for teacher show the old numberings.")
6. **Teacher mode** (signed-in `role='teacher'`, the same gate the DOK-3 links use) shows OLD ids as a secondary bridge:
   resource-header suffix in 4, and `(old 3.1)` in cell tooltips. Teacher tools, Schoology, DOK files stay OLD-keyed.

## 2. Build

1. **One helper, used everywhere**: `cedLabel(oldKey) → { id, label, unit, bonus, text }` reading
   `REGISTRY.lessons[old].ced2026` (fallback: `2026-crosswalk.json` shape), memoised; `text` is the §1.1 string. Plus
   `cedUnitClass(oldKey)` → `'u1'…'u5' | 'bonus'`. No other code path may compute a NEW label ad hoc.
2. **Pacing arrays**: leave `t` and `u` as they are (other consumers read `u` as OLD — grep before assuming) and let `d()`
   attach `ced: cedLabel(t)` to each cell at build time; `rCal`/`rProg`/tooltips render from `inf.ced`. (Rewriting the 154
   `n:` strings by hand is not required; if you do regenerate them, generate, don't type.)
3. **CSS**: add `--bonus`/`--bonus-t` tokens; keep `--u6…--u9` for the frozen SY25-26 / SUMMER26 defs (dead code, but do
   not break them).
4. **Baked `BAKED_REGISTRY.progressChecks/posters` "Unit 6–9" titles**: prove they are not read (grep + a test that the
   rendered calendar never shows them); delete them if dead, relabel if live.
5. **Audit sweep**: `grep -n "Unit [6-9]\|U[6-9]\b\|'U' *+\|\"Unit \" *+" ap_stats_roadmap_square_mode.html start-here.html
   mobile-home.html index.html` — every hit is either (a) routed through the helper, (b) teacher-only, (c) a frozen
   prior-year def, or (d) reported. List the disposition of each hit in the report.
6. **Tests** (`tests/desk-calendar-ced2026.test.js`): (i) render the SY26-27 calendar in jsdom (the existing desk tests
   show how to load the Desk) and assert no student-visible cell text matches `/\b[6-9]\.\d+\b/` or `/Unit [6-9]/`;
   (ii) folded topics get the `· Day n` suffix and no OLD id; (iii) bonus cells carry the ★ class; (iv) `rProg` segment ids ⊆ `{U1..U5, ★,
   Rev}`; (v) the resource-panel header for old `3.1` starts with `1.10 ·` and does NOT contain `3.1`/`u3_lesson1` as a student, and DOES contain `u3_lesson1` in teacher mode; (vi) the
   generator output (`data/lesson-schedule.json`) is byte-identical after the change (display-only proof).
7. **Out of scope**: dates, pacing order, `lessons[].unit`, Schoology column names, DOK file names, the grade engine,
   the teacher dashboard (done), packing.

## 3. Report
Per-surface before/after strings for old `1.1`, `3.1`, `4.10`, `9.6` (bonus), the disposition table from §2.5, the
byte-identical proof for the schedule JSON, test counts.

### TL;DR
One `cedLabel()` helper, cells/progress/tooltips/header rendered from it, five unit colours plus a ★ tone, folded topics
carry a `· Day n` suffix, the OLD key survives only in teacher mode (header bridge + tooltips) and in teacher tools.
Nothing about dates or grades changes, and a test proves the schedule file did not move.
