# SCHEDULE_PACKING_SPEC.md — double up short-video days, and relabel the calendar to the Fall-2026 CED

**Purpose:** the SY26-27 calendar places ONE topic per meeting day, so a 5-minute video day (1.1) costs a whole period and
Q1 closes with only CED Unit 1 banked. The teacher's rule: **up to 3 videos on a day**. This spec measures the videos,
simulates packing against the real calendar, recommends a rule, and defines the build. It also fixes the calendar's
labels, which still speak in the OLD 9-unit codes.

> **Status: REVERTED 2026-09-05 (same day).** The teacher stopped the build: the 30-minute cap counted video RUNTIME only —
> pauses, follow-along work, questions and practice make a three-video day far longer than a period — and judged the
> existing one-topic-per-day pace better. **Do not re-propose packing.** Codex's paused build (Parts 1–3, incl. the
> archive move of 35 sheets) is preserved on branch `codex-packing-paused` (local, never pushed) for the record. The
> measurements (`data/video-minutes.json`) stay; the calendar RELABEL to NEW CED codes (§4.3) is still wanted as a
> standalone task. Historical text below is unchanged. **Owner:** teacher. **Workflow:** analysis (this doc, §1–§2)
> → teacher picks a rule (§3) → implement (§4). Grade-affecting only through due dates (lesson-schedule.json is regenerated).

## 0. What already exists

| Piece | Where | Role |
|---|---|---|
| Pacing lists (ordered topics + injected PC/Poster events) | `ap_stats_roadmap_square_mode.html` `SY2627_PACING_B/E` (~line 9925), `injectPcPosterEvents` | the order; ONE item per meeting day today |
| Layout | `generateSchedule(def)` (~line 10190) | walks weekdays, skips closures, pops one pacing item per meeting day per period |
| Source of truth for due dates / PCs / posters | `scripts/build-lesson-schedule-sy2627.mjs` reads the Desk block → `data/lesson-schedule.json` (+ `roster-server/data/` copy) with fixture-pinned core order | everything downstream (Desk due chips, grade engine, Schoology sync, DOK index) reads this file |
| Video lengths | the offline pack `media/` (145 re-encoded copies of the teacher's recordings) — measured with ffprobe 2026-09-05: **80 topics, 147 videos, 1,167 min; median topic ≈ 12 min; 1-video topics ≈ 5–9 min** | the packing weights |
| OLD→NEW topic map | `2026-crosswalk.json` | packing never crosses a NEW unit; labels |

## 1. Measurement (Period B, 121 meeting days before the 2027-05-11 exam)

One topic per day today:

| NEW unit | ends (B) | ends (E) |
|---|---|---|
| 1 Exploring & Collecting | Oct 5 | Oct 16 |
| 2 Probability … Sampling Dists | Nov 13 | Dec 9 |
| 3 Inference: Proportions | Jan 4 | Feb 8 |
| 4 Inference: Means | Jan 29 | Mar 19 |
| 5 Regression | Feb 12 | Apr 9 |

Q1 ends Nov 6, so Q1 banks Unit 1 only (Unit 2's PC lands Nov 9+). Core content already finishes Feb 12 (B) / Apr 9 (E),
leaving B three months of review before the exam and E one month.

## 2. Simulation — pack consecutive topics onto one day (same NEW unit, never across a PC/Poster day)

| Rule | B: unit ends 1 / 2 / 3 / 4 / 5 | B last core day | E: unit ends | E last core day | doubled days |
|---|---|---|---|---|---|
| **A: ≤ 3 videos and ≤ 30 min** | Sep 22 / Oct 16 / Nov 19 / Dec 15 / Jan 7 | Jan 7 | Sep 28 / Oct 30 / Dec 16 / Jan 27 / Feb 12 | Feb 12 | 15 |
| B: ≤ 2 videos and ≤ 25 min | Sep 28 / Oct 29 / Dec 8 / Jan 12 / Jan 28 | Jan 28 | Oct 5 / Nov 18 / Jan 15 / Feb 26 / Mar 17 | Mar 17 | 9 |

Under rule A, **Q1 banks Units 1 and 2 for both periods** (B also has Unit 3 nearly done), and Period E, the period that
meets only three days a week, finishes core by mid-February instead of April 9. The 15 doubled days under rule A
(B dates): 1.1+1.2+1.3 (Sep 8, 24 min) · 1.4+1.5 · 1.7+1.8 · 1.9+3.1+3.2 · 3.3+3.4 · 2.1+2.2+2.3 · 4.1+4.2 ·
4.3+4.4+4.5 · 4.7+4.8 · 4.10+4.11 · 5.1+5.3 · 5.4+5.5 · 8.1+8.4+8.5 · 5.7+7.1 · 2.4+2.5. No day exceeds 30 minutes of
video; most doubled days are 20–27 min, which is the follow-along slot in the daily flow (§6 of the DOK spec: 28 min).

**Recommendation: rule A.** The 3-video cap is the teacher's own number, the minute cap keeps the DOK-3 finish window
intact, and the freed days (20 per period) are worth more as PC review days and Beyond-the-Exam days in March–April
than as 7-minute lesson days in September.

## 3. Teacher decisions

1. Rule A or B (or a custom cap): **DECIDED 2026-09-05: A** (≤ 3 videos and ≤ 30 min).
2. **The DOK-3 on a doubled day. DECIDED 2026-09-05: one sheet per class DAY that covers every video taught that day** —
   see `DOK_DAY_SHEETS_SPEC.md` (group key `1.1+1.2+1.3`, rungs walk the day's topics in order, the DOK-3 lands on the
   last one; the absorbed per-topic sheets are archived and mined for the group sheet).
3. What to do with the freed days **[default: nothing scheduled — they surface as slack before each PC and after the last
   core day; the teacher drops in review/Beyond-the-Exam by hand]**. The generator reports the slack per period.
4. Calendar labels **[default: NEW CED topic numbers and NEW unit colours everywhere on the calendar; the OLD id stays
   visible only as the worksheet/DOK file name in the resource panel header, which already prints both]**.

## 4. The build

1. **Pacing groups.** A pacing entry may be an ARRAY of topic entries: `[{t:"1.1",…},{t:"1.2",…},{t:"1.3",…}]`.
   `generateSchedule` places a group on ONE meeting day; the cell carries `group:[…]` and shows "1.1 + 1.2 + 1.3".
   Groups are authored by a new script `scripts/pack-pacing-sy2627.mjs` from the measured minutes (`data/video-minutes.json`,
   committed, regenerated by `scripts/measure-video-minutes.mjs` over `media/`) under the chosen rule, and written INTO the
   pacing arrays as a reviewable diff — the teacher can hand-edit a group afterwards. The rule and caps live in the def
   (`packing: { maxVideos: 3, maxMinutes: 30 }`).
2. **Generator.** `build-lesson-schedule-sy2627.mjs` flattens groups: every topic in a group gets the group's date;
   the fixture's core ORDER invariant is unchanged (the order within a group is the pacing order). PCs/posters unchanged.
   Regenerate both copies of `lesson-schedule.json`; the m2b goldens move (expected — document it in the commit).
3. **Calendar relabel.** Pacing `n` strings and cell text use the NEW topic number (`crosswalk[t].newTopic`) with the
   NEW label; cell colour and the progress bar use the NEW unit (`crosswalk[t].newUnit`, "★" tier for bonus). `u` on the
   pacing entries becomes the NEW unit; `lessons[].unit` in the JSON stays OLD (engine + file names depend on it).
   Legend already lists the five NEW units.
4. **Downstream checks.** Desk due chips + Do Now (same date for grouped topics → the Do Now lists all of them that day);
   Schoology sync (two columns due the same day — fine); DOK `index.html` "today" row → the day's GROUP sheet (decision 2,
   `DOK_DAY_SHEETS_SPEC.md`); the DOK coverage test is re-keyed by `dayGroups`; `dok/README.md` gets the doubled-day rule.
5. **Tests.** `generateSchedule` group placement (one day, cell text, both periods); generator flattening + order invariant
   with groups; a snapshot of the packed unit-end dates per period so a later pacing edit that silently un-packs shows up;
   relabel test (no cell text matches `/^[6-9]\.\d/` on the SY26-27 calendar — there is no Unit 6–9 in the new CED).
6. **Roll-out.** Land before Sep 8 if rule A's first group (1.1+1.2+1.3 on Sep 8) is wanted on day one; otherwise the
   first doubled day can start the following week without changing anything already taught.

### TL;DR
Measured every video; packing consecutive same-unit topics under "≤ 3 videos and ≤ 30 minutes" turns 87 lesson days into
67, banks Units 1 AND 2 in Q1 for both periods, and finishes core by Jan 7 (B) / Feb 12 (E). Build = pacing groups +
generator flattening + NEW-CED calendar labels; on a doubled day ONE DOK sheet covers all of that day's videos
(`DOK_DAY_SHEETS_SPEC.md`).
