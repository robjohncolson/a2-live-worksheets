# SY2627 Calendar Intake — fill this in to make the schedule real

This is the **only** input standing between the synthetic P1 fixtures and a real
SY2627 schedule. Fill in the blanks below; I drop them into `CAL` in
`scripts/build-topic-schedule-sy2627.mjs`, regenerate, and the fixture becomes the
production `topic-schedule.json`. No part of the migration needs re-discussion —
just these values. Leave a field blank and I keep the synthetic placeholder + flag it.

---

> **Sources (filled 2026-09-01):** district calendar `lynn-public-schools-2026-2027.md`
> (repo root) + LEHS weekly schedule `~/Downloads/LEHS_SY2627_Schedule_and_Calendar.xlsx`
> + teacher answers (exam date, pacing, review policy). The two calendar sources
> cross-check clean (all 47 dates agree). **Intake is COMPLETE** — the one remaining
> flagged default is §5's "2 meetings per unit Progress Check" (teacher was unsure).

## 1. Term boundaries
- **First instructional day:** `2026-09-02` (Wed — Day 1 of 180)
- **AP exam date (hard end):** `2027-05-11` (Tue) — teacher-confirmed
- (District last day: 2027-06-17 tentative; 2027-06-25 if all 5 snow days used.)

## 2. Breaks / no-school days (skipped when placing lessons)
From the district calendar (single-day closures use the same date in from/to):
- School Closed — `2026-09-04` → `2026-09-04`
- Labor Day — `2026-09-07` → `2026-09-07`
- Indigenous Peoples' Day — `2026-10-12` → `2026-10-12`
- Teacher in-service (no students) — `2026-11-03` → `2026-11-03`
- Veterans Day — `2026-11-11` → `2026-11-11`
- Thanksgiving Recess — `2026-11-26` → `2026-11-27`
- School Closed — `2026-12-24` → `2026-12-25`
- Winter Recess — `2026-12-28` → `2027-01-01`
- MLK Jr. Day — `2027-01-18` → `2027-01-18`
- February Vacation — `2027-02-15` → `2027-02-19`
- Good Friday — `2027-03-26` → `2027-03-26`
- April Vacation — `2027-04-19` → `2027-04-23`
- Memorial Day — `2027-05-31` → `2027-05-31`

**Early-release Wednesdays** (school IS in session; B never meets Wednesdays, and E
meets shortened — see §3): 2026-09-30, 10-21, 11-18, 11-25 (half-day holiday),
12-09, 12-23 (half-day holiday), 2027-01-13, 02-10, 03-03, 03-17, 04-14, 05-19.

**Quarter boundaries (LEHS marking periods — feeds `grade-config.js` `quarters[q].start/end`):**
- Q1: 2026-09-02 → 2026-11-06 (44 days)
- Q2: 2026-11-09 → 2027-01-22 (44 days)
- Q3: 2027-01-25 → 2027-04-14 (52 days)
- Q4: 2027-04-15 → 2027-06-17 (40 days)

## 3. Class-period model
- Still **two periods B and E**: **yes**.
- Cadence (from the LEHS weekly schedule — NOT the same days, and NOT the old
  "E lags B by one day" fixture model):
  - **Period B: Mon, Tue, Thu, Fri** (4 meetings/week; never Wednesday)
  - **Period E: Mon, Wed, Fri** (3 meetings/week; Wednesday is E's 90+30 lunch block)
  - Shared days: Mon + Fri. Both get 240 instructional min/week.
- Every early-release day is a Wednesday, so early releases affect **only E**.
  **Teacher confirmed (2026-09-01): E DOES meet on early-release Wednesdays, just
  shortened.** They count as normal E meeting days for scheduling.

## 4. Pacing — teacher's answer: video-driven, option (B)
- **Flat 1 class meeting per topic** (the meeting is filled with that topic's videos —
  some topics have 4 videos, some have 1). No per-unit CED budget.
- Reality rule: *"if a topic becomes confusing, we stop and then extend"* — the
  generated schedule is the plan; live adjustments shift it. The generator should
  favor slack over compression.

## 5. Review days — teacher's answer: none
- **No standing `X.review` days.** The in-class **Progress Check at the end of each
  unit serves as the review** and often takes **two class periods**.
- **FLAGGED ASSUMPTION:** budget **2 meetings per unit for the PC** (5 new units × 2
  = 10 meetings). Teacher was "unsure" — this is the recorded default, easy to change.

### Does it fit? (computed 2026-09-01, closures excluded, Sep 2 → May 10)
| Period | Meetings before the 5/11 exam | Needed (67 topics + 10 PC days) | Slack |
|---|---|---|---|
| B | **121** | 77 | **+44** |
| E (early-release Weds count — confirmed) | **91** | 77 | **+14** |

**E is still the binding constraint**: 14 spare days all year for "stop and extend"
vs B's 44. B will naturally run ahead of E (4 meetings/week vs 3); the per-period
dates in the generated schedule carry that divergence honestly.

## 6. Last year's schedule
- **Archive SY2526: yes** (teacher-confirmed 2026-09-01) — old `topic-schedule.json`
  moves to a named archive so the Desk stops showing 2026 dates.

---

## What happens after you send this
1. I set `CAL` (+ pacing) in `build-topic-schedule-sy2627.mjs`, regenerate → real `topic-schedule.json` (14 baked invariants must still pass; overflow past the exam date is a hard fail).
2. **P2 starts** (per Codex, before any live sync): add registry/special-title handling for the new `1.review`..`5.review` keys (Agent registry only has `6.review`), and land the `_mergeRegistryData()` `ced2026` one-line fix on the Desk.
3. Then rebake `roadmap-data.json`, decide live-manifest replacement (drop-in vs Do-Now-split), Supabase sync with real dates, and the Desk render — each behind its own browser-smoke gate.

See `sy2627-schedule-reframe-spec.md` for the full plan; this note is just the data hand-off.
