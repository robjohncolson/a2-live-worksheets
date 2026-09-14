2026-09-12: the daily/pairing program is deprecated; only misconception-generated sheets are active ? see DOK_DEPRECATE_DAILY_SPEC.md.

# DOK_DAY_SHEETS_SPEC.md — one DOK-3 sheet per CLASS DAY, covering every video taught that day

> **2026-09-12: Self-paced bonus sheets.** The flow is superseded by [DOK_SELF_PACED_SPEC.md](DOK_SELF_PACED_SPEC.md): work from the printed sheet, turn it in whenever finished, and score the final part E / P / I by hand.

> **2026-09-12:** Still PARKED; all current sheets use the self-contained printed-rules flow in [DOK_VIDEO_FREE_SPEC.md](DOK_VIDEO_FREE_SPEC.md).

**Purpose:** `SCHEDULE_PACKING_SPEC.md` (rule A, chosen 2026-09-05) puts up to three videos on one day. The DOK ladder was
built one sheet per topic. Teacher decision 2026-09-05: on a doubled day the sheet must **cover all of that day's videos**,
not one of them. This spec redefines the unit of authoring from the topic to the calendar day-group, keeps everything
else in `APS_DOK_LADDER_SPEC.md` (the flow, the three editions, the rules, the human channel), and says what happens to
the 35 per-topic sheets that get absorbed.

> **Status: PARKED 2026-09-05** — the packing it depends on was reverted the same day (see `SCHEDULE_PACKING_SPEC.md`);
> one topic per day stays, so the per-topic ladder stands. Kept for the record; Codex's partial implementation lives on
> branch `codex-packing-paused`. **Depends on:** the packing build (§4 of the packing spec) landing
> first, because the day-groups are read from `data/lesson-schedule.json`. **Workflow:** spec → Codex builds (plan first)
> → orchestrator reviews and pushes. Still grade-inert; still never AI-graded.

## 0. What changes and what does not

| Stays | Changes |
|---|---|
| The class flow: board slide at the bell → first take → video(s) + follow-along(s) → finish (a)(b)(c) → turn in | The **key** of a sheet: a calendar day-group (`1.1+1.2+1.3`) instead of a topic (`1.1`) |
| One problem per sheet: one stem, one first take, parts (a)(b)(c) laddered DOK 1→2→3, one starred DOK-3 | Parts are **spread across the day's topics in teaching order**: (a) from the first video, (b) from the middle/second, (c) from the last — or (c) integrates all of them (§2) |
| Three editions, page budgets (student 2 / board 1 / teacher ≤ 3), every gate and test class in the ladder spec | The board slide lists **every** video/follow-along of the day with a QR each (up to three) |
| Registry row shape, scoring E/P/I on (c), sentence frames, `tether` | `worksheet` → `worksheets: [...]`; header prints the topic range and the NEW CED numbers; tether = union of the topics' tethers |
| Single-topic days keep their existing sheet, byte-identical (31 of them) | The 35 topics that fall inside a group lose their standalone sheet from the live set (archived, §4) and gain 15 group sheets |

## 1. Keys, names, files

- **Group key** = the day's topic keys joined with `+` in teaching order: `1.1+1.2+1.3`, `1.9+3.1+3.2`, `5.7+7.1`.
  A single-topic day's key is just the topic (`1.6`) — nothing renames.
- **File slug** = the key with `+` → `_`: `dok/lessons/1.1_1.2_1.3.yaml`, `dok/registry/1.1_1.2_1.3.jsonl`,
  `dok/tex/aps_1.1_1.2_1.3_{student,board,teacher}.tex`, `dok/pdf/aps_1.1_1.2_1.3_*.pdf`. (Filenames must stay
  pdflatex-, URL- and Windows-safe; `+` is not.)
- **Registry ids** = `aps-1.1_1.2_1.3-d3-1`; the row's `topic` field holds the group key and `topics: ["1.1","1.2","1.3"]`.
- **Source of truth for groups**: `data/lesson-schedule.json` gains `dayGroups: { B: [[...],...], E: [[...],...] }`
  (emitted by the packing generator, one array per class day, topics in order). The DOK coverage test reads it; groups
  are the same for B and E under rule A (the sim confirmed both periods pack identically), and the test asserts that —
  if a future edit makes them differ, the sheet key follows Period B and the test flags the divergence for a human.

## 2. The problem on a doubled day

The DOK-3 shape does not change: **identify → describe → adjudicate.** What changes is what each rung draws on.

- **Stem**: one context that the day's topics all touch. For `1.1+1.2+1.3`: one small survey dataset (what can we learn
  from it / which columns are variables / a frequency table of one column).
- **(a) DOK 1** uses the FIRST topic's skill (e.g. identify the statistical question and the individuals).
- **(b) DOK 2** uses the SECOND (e.g. classify the variables; build the relative-frequency table).
- **(c) DOK 3** uses the LAST topic, or a judgment that needs two of them (e.g. which claim this table can support and
  what the counts-vs-percents choice hides). If the group has three topics and (c) only reaches the last, the rules
  callout must still name the middle topic's rule so the sheet reads as one day, not two.
- **First take** stays answerable from the stem before any video.
- **Rules callout** carries each topic's one rule, in teaching order, ≤ 5 lines total.
- **Board slide**: "Today: 1.1 · 1.2 · 1.3" + one QR/link per follow-along in order, and the footer "Watch all three,
  then finish (a)–(c)."
- **Load** stays inside the ~10-minute finish window (the audit's budget: (a) one line, (b) two or three sentences or one
  short computation, (c) three to five sentences). A group sheet is NOT three sheets' worth of work.
- **Teacher key**: tether = union of the topics' LO/EK lines (deduplicated), `questions_to_ask` may be tagged by topic.

## 3. Registry / YAML deltas (everything else per `APS_DOK_LADDER_SPEC.md` §2)

```yaml
topic: "1.1+1.2+1.3"                 # group key
topics: ["1.1", "1.2", "1.3"]         # teaching order; single-topic days: one element
ced2026: { unit: 1, topics: ["1.1", "1.2", "1.3"], label: "What Can We Learn from Data? · Variables · Tables (1 categorical)" }
worksheets: ["u1_lesson1_live.html", "u1_lesson2_live.html", "u1_lesson3_live.html"]
minutes: { first_take: 5, video_worksheet: 26, finish: 10, turn_in: 2 }   # video minutes come from data/video-minutes.json
```
Registry row: `"topic": "1.1+1.2+1.3"`, `"topics": [...]`, parts carry `"topic": "1.2"` so the audit can check each rung
against its own video. `build_ladder.py`: accept `topics`/`worksheets` (list) with `worksheet` (string) as the
single-topic form; `header_line` prints "Topics 1.1–1.3 (CED 1.1–1.3)"; the board renders one `\qrcode` per worksheet;
`tether_lines` takes a list; `manifest.json` keys by group key and lists `topics`; `index.html` "today" resolves by
`dayGroups`.

## 4. What happens to the 35 absorbed per-topic sheets

They are **archived, not deleted**: `git mv dok/lessons/1.1.yaml dok/archive/lessons/1.1.yaml` (same for registry rows,
tex, pdf). The loader ignores `archive/`. The audited content is the raw material for the group sheet — the author starts
from the three archived problems and writes ONE that keeps the best judgment among them. `dok/index.html` links the
archived per-topic sheets under "extra practice" for the group's row (teacher-only column, same gate as the Desk row).

## 5. Tests (extend the existing three suites)

- **Coverage** (`tests/dok-coverage.test.js`): every array in `dayGroups.B` has exactly one live sheet keyed by its
  group key; no live sheet's key is a strict subset of a group (a leftover per-topic sheet inside a group is a failure);
  `dayGroups.B` and `dayGroups.E` agree topic-for-topic (or the test names the divergence).
- **Registry** (`tests/dok-registry.test.js`): `topics` present and in the schedule's order; every part's `topic` ∈ `topics`;
  the last part's `topic` is the group's last topic (the DOK-3 lands on the day's last video) unless `integrates: true`.
- **Emission** (`tests/test_dok_build.py`): a fixture group YAML emits a board with N QR codes and N worksheet links, a
  header with the topic range, and a student sheet that still fits 2 pages; single-topic YAMLs are byte-identical to today.
- **Desk** (`tests/desk-dok-ladder-row.test.js`): the teacher-only row on a grouped day links the GROUP sheet, resolved
  from `dayGroups`, not the topic's archived one.

## 6. Build order and sizing

1. Packing build (packing spec §4) → `lesson-schedule.json` with `dayGroups`, calendar relabelled.
2. `build_ladder.py` list-aware + slug + manifest/index changes + tests (½ day).
3. Author the 15 group sheets from the archived material, in Period-B date order (the first, `1.1+1.2+1.3`, is due
   Sep 8): ~30–40 min each → one Codex round with the same gates and review as the ladder rounds; archive the 35.
4. Desk row + `dok/README.md` ("doubled days") + `dok/AUDIT` addendum for the 15 new problems.

### TL;DR
The sheet follows the calendar day, not the topic. Group key `1.1+1.2+1.3`, one problem whose rungs walk the day's videos
in order and whose DOK-3 lands on the last one, a board slide with a QR per follow-along, 35 per-topic sheets archived and
mined for 15 new ones, and the coverage test keyed by the schedule's day-groups.
