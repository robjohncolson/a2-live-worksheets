# Grading Model v3 -- BUILD spec

Designed s121 (2026-05-27). Replaces the Phase 6 `mean(lessonGrade)`
quarter grade with a two-track max/mean conditional model that
rewards either AP-mastery or sustained engagement, and gates each
track behind a 40% floor on the other to prevent single-track
gaming.

## Goal

Give every student a defensible path to 100% while preserving
autonomy:

- AP-bound students can lead with **Progress Checks** (the
  AP-aligned mastery signal, retakable until the quarter closes)
- Engagement-driven students can lead with **Work** (lessons,
  quizzes, posters, Blooket -- the daily/weekly effort signal)
- Either track can drive the grade; the other is the safety net

The grade represents either demonstrated mastery OR sustained
engagement, whichever is higher -- but ONLY if the student has
shown minimum engagement on the other track too. Pure single-track
gaming (e.g. retake PCs ad nauseam while skipping every other
assignment) is bounded.

## Non-goals

- Replacing Schoology's weighted-category gradebook display.
  Schoology continues to show per-category weighted averages for
  student visibility; v3 overrides the FINAL marking-period grade
  via `gp_override`.
- Tracking PC attempt history. v3 treats each PC as a single
  cell that the latest attempt overwrites; the previous score is
  lost. Multi-attempt history is a separate concern (out of
  scope).
- Re-architecting the Phase 6 due-date logic. v3 reuses
  "due-by-today" gating with un-attempted-due-counted-as-0; only
  the aggregation formula changes.
- Algorithmic spec for poster scoring. v3 defines `Posters` as a
  per-unit category populated from a Supabase score; the
  computation (peer rubric + role completion + small-group
  handicap) is sub-spec'd separately.
- Algorithmic spec for Blooket data capture. v3 defines `Blooket`
  as a per-Blooket score equal to `correct / total_questions`;
  the capture pipeline (Blooket CSV export -> roster-server
  endpoint) is sub-spec'd separately.

## The model

```python
def quarter_grade(pc_avg, work_avg):
    """Compute the v3 quarter grade from PC and Work track averages.

    Both arguments on [0, 1]. Returns the quarter grade on [0, 1].
    """
    if pc_avg >= 0.40 and work_avg >= 0.40:
        return max(pc_avg, work_avg)
    return max(0.7 * pc_avg, 0.7 * work_avg, (pc_avg + work_avg) / 2)


def pc_avg(student, quarter):
    """Mean of PCs due-by-today in this quarter, un-attempted = 0."""
    # PCs in this quarter: 1 per unit. Q1=U1+U2+U3 (3 PCs),
    # Q2=U4+U5 (2), Q3=U6+U7 (2), Q4=U8+U9 (2).
    ...


def work_avg(student, quarter):
    """Weighted blend of work-track components, un-attempted = 0."""
    return (
        0.30 * lessons_avg(student, quarter)
      + 0.30 * quizzes_avg(student, quarter)
      + 0.30 * posters_avg(student, quarter)
      + 0.10 * blooket_avg(student, quarter)
    )


def year_grade(student):
    """Mean of 4 quarter grades, each itself max/mean conditional."""
    return mean(quarter_grade(pc_avg(student, q),
                              work_avg(student, q)) for q in [1, 2, 3, 4])
```

Each component (lessons/quizzes/posters/blooket) is the mean of
its per-assignment scores due-by-today in the quarter, with
un-attempted-due-counted-as-0. Same convention as Phase 6.

## Worked examples

| PC_avg | Work_avg | Branch | Computed | Quarter Grade | Notes |
|---|---|---|---|---|---|
| 1.00 | 1.00 | both >= 40 -> max | max(1.0, 1.0) | **100%** | Full mastery + full engagement |
| 1.00 | 0.40 | both >= 40 -> max | max(1.0, 0.4) | **100%** | PC-led; min Work cleared |
| 0.40 | 1.00 | both >= 40 -> max | max(0.4, 1.0) | **100%** | Work-led; min PC cleared |
| 1.00 | 0.39 | Work < 40 -> soft | max(0.70, 0.27, 0.695) | **70%** | PC-only -- ceiling kicks in |
| 1.00 | 0.00 | Work < 40 -> soft | max(0.70, 0.00, 0.50) | **70%** | Pure PC gamer -- capped |
| 0.39 | 1.00 | PC < 40 -> soft | max(0.27, 0.70, 0.695) | **70%** | Work-only -- symmetric ceiling |
| 0.00 | 1.00 | PC < 40 -> soft | max(0.00, 0.70, 0.50) | **70%** | Pure work, no PC attempts -- capped |
| 0.80 | 0.39 | Work < 40 -> soft | max(0.56, 0.27, 0.595) | **59.5%** | Mean wins (Work is helping) |
| 0.39 | 0.80 | PC < 40 -> soft | max(0.27, 0.56, 0.595) | **59.5%** | Symmetric |
| 0.50 | 0.50 | both >= 40 -> max | max(0.5, 0.5) | **50%** | Above floor; either track |
| 0.30 | 0.30 | both < 40 -> soft | max(0.21, 0.21, 0.30) | **30%** | Both gates failed; mean dominates |
| 0.00 | 0.00 | both < 40 -> soft | max(0, 0, 0) | **0%** | Honest zero |
| 0.70 | 0.60 | both >= 40 -> max | max(0.7, 0.6) | **70%** | Typical "trying" student |

**Two cliffs at the 40% gates.** Each gate is a ~30-point cliff
when the OTHER track is near 100%. Defensible because the cliff
PUNISHES the gaming pattern (high one track + below-floor other
track) and REWARDS clearing the engagement bar:

- PC=100, Work=39 -> 70% ; PC=100, Work=40 -> 100% (30-point gain)
- PC=39, Work=100 -> 70% ; PC=40, Work=100 -> 100% (30-point gain)

The cliff is the message: "Clear 40% on the other track to
unlock the full max-of-two."

## Pedagogical defensibility

| Gaming pattern | v3 outcome | Pedagogical message |
|---|---|---|
| Skip PCs entirely, ace Work | 70% cap | "You have to at least attempt the mastery check" |
| Skip Work entirely, ace PCs via retakes | 70% cap | "You have to at least engage with the course" |
| Do nothing | 0% | Honest |
| Genuine effort in both (above gates) | max-of-two | Whichever path is stronger sets the grade |
| AP-bound + minimal compliance work | 100% | Path preserved -- learn AP, do enough work to clear gate |
| Engagement-driven + minimal PC attempts | 100% | Path preserved -- daily effort wins, attempt PCs at D-level |

40% on a single PC is approximately D-level. A student who SHOWS
UP to a PC and answers honestly will almost always clear 40%. The
PC gate therefore mostly punishes total PC-avoidance, not
PC-flunking. Similarly, 40% Work_avg is roughly "40% of
assignments turned in at any level" -- a low bar that any engaged
student clears.

## Schoology integration

### Category configuration (one-time setup in Grade Setup)

| Category | Weight | Schoology Category ID (Sec 1) | Source |
|---|---|---|---|
| Lesson | 15% | 93077673 | Follow-along worksheets, one per topic |
| Quizzes | 15% | (rename "Tests" -> "Quizzes") | curriculum.js Blooket-style MC, one per topic |
| Posters | 15% | (NEW) | One per unit (9/year); peer-graded gallery walk |
| Blooket | 5% | (rename "Classwork" -> "Blooket") | In-class Blooket sessions, one per lesson |
| Progress Check | 50% | 93077674 | One per unit (9/year); retakable until quarter close |

Weights sum to 100%. **Weight Categories: ENABLED.**

One-time teacher actions in Schoology Grade Setup:
1. Check the `Weight Categories` checkbox
2. Set the weights: Lesson=15, Quizzes=15, Posters=15, Blooket=5,
   Progress Check=50
3. Rename `Tests` -> `Quizzes`
4. Rename `Classwork` -> `Blooket`
5. Create a NEW category `Posters` (15% weight)

The Schoology category IDs for Sec 1 are listed above; Sec 2
(course 7945275798) has parallel category IDs harvested at
runtime by the sync.

### Grade flow

Schoology displays its native weighted-category average for
each student each marking period. This number is INFORMATIONAL,
NOT the official grade.

The OFFICIAL quarter grade is `quarter_grade(pc_avg, work_avg)`
computed in Supabase per the v3 formula. The sync writes this
value to Schoology's `gp_override` cell per student per marking
period. The override flows through to PowerSchool SIS via the
`sync_to_sis_wrapper[sync_to_sis_option]` checkbox (s121 user
decision: SIS sync ON).

### Why override instead of pure category weights

Schoology's native weighted-category average is a LINEAR formula
(sum of weight*category_avg). v3 is NOT linear -- it's a
max/mean conditional with floors. Schoology cannot natively
compute this. Three architectural options were considered:

| Option | Trade-off |
|---|---|
| (a) Push only final grade, no per-assignment | Loses student visibility into per-assignment grades. Rejected. |
| (b) Push per-assignment + override final | Students see per-assignment grades AND the official override. **Adopted.** |
| (c) Compute everything in Schoology via custom formula | Schoology has no custom-formula engine. Not feasible. |

Option (b) is the only one that preserves both student visibility
and the v3 formula. The teacher explains once at the start of the
year: "Your Schoology grade shows per-assignment scores and a
weighted-category average. Your OFFICIAL quarter grade is the
override at the top of the gradebook -- it's computed differently;
see the syllabus."

### Override cell selector

Per the s120 P0 fixture (`tests/fixtures/schoology-gradebook-apstats-sec1.html`):
- Cell id pattern: `#grader-grid-cell-gp_override-<row_index>`
- Cell pattern (overall override): `#grader-grid-cell-overall_override-<row_index>`
- The sync writes per-quarter overrides to `gp_override` (each
  marking period has its own override column visible when the MP
  is selected)
- The sync writes per-year override to `overall_override` (the
  final-grade override; only relevant in Q4)

### Sync sequence per run

```
1. Load Supabase: roster, per-assignment scores, lesson schedule
2. Compute per-(student, quarter): pc_avg, work_avg, quarter_grade
3. Connect to Schoology gradebook via tools/schoology-sync.py
4. For each section (Sec 1, Sec 2):
   a. PUSH per-assignment scores to their assignment columns
      (auto-create assignments via the Add Assignment form if
       missing; categorize by lesson_key -> kind -> category)
   b. WRITE override per (student, MP):
      cell selector: #grader-grid-cell-gp_override-<row_index>
      value:          quarter_grade(pc_avg_q, work_avg_q)
   c. WRITE year-final override (Q4 only):
      cell selector: #grader-grid-cell-overall_override-<row_index>
      value:          mean(quarter_grade(Q1..Q4))
5. Log to schoology_sync_log with counts + errors
```

## Phase 6 update

`roster-server/lesson-grade.js` currently computes `quarterGrade`
as `mean(lessonGrade) over lessons due-by-today` per the s120
Phase 6 work. v3 supersedes this:

```js
// Before (Phase 6):
quarterGrade = mean(
    lessonGrade(student, lesson)
    for lesson in lessonSchedule
    if lesson.quarter == q and lesson.dueDate <= today
);

// After (v3):
pcAvg = mean(
    pcScore(student, unit)
    for unit in unitsInQuarter(q)
    if pcDueDate(unit) <= today
);
workAvg = (
    0.30 * lessonsAvg(student, q)
  + 0.30 * quizzesAvg(student, q)
  + 0.30 * postersAvg(student, q)
  + 0.10 * blooketAvg(student, q)
);
quarterGrade = (
    max(pcAvg, workAvg)               if pcAvg >= 0.40 and workAvg >= 0.40
    else max(0.7*pcAvg, 0.7*workAvg, (pcAvg + workAvg) / 2)
);
```

The `lessonsAvg / quizzesAvg / postersAvg / blooketAvg` helpers
each compute mean-of-per-assignment-due-by-today with
un-attempted-counted-as-0. The unified `lessonGrade` from Phase 6
remains the source of truth for `lessonsAvg` (each lesson's
Cws-weighted blanks:FRQ:AI score).

### Desk grade-outlook strip

The Do-Now card's grade-outlook strip currently shows the four
quarter pills with current + ceiling estimates (`[Q1: 72.0
↑85.4] [Q2: —]`). The v3 update changes only the formula behind
those numbers -- the visualization stays the same. The
`renderDoNowGrades` typeof-guarded fire-and-forget call already
exists; only the backend math swaps.

### Compatibility

Phase 6's exposed roster-server endpoints stay the same:
- `GET /class/grades?section=<X>` returns per-student quarter
  grades
- `GET /student/grades?student_id=<id>` returns per-quarter
  breakdown

The RESPONSE SHAPE may extend to include `pc_avg` and `work_avg`
fields per quarter (for Desk display + teacher introspection),
but the existing `quarterGrade` field continues to exist with the
new computation.

## Schedule impact

Each unit adds **3 PC days + 1-2 Poster days** to the year-long
schedule. Updated per `ap_stats_roadmap_square_mode.html`:

| Item | Days per unit | Year total (9 units) |
|---|---|---|
| Progress Check administration | 2 days | 18 days |
| Progress Check review | 1 day | 9 days |
| Poster (gallery walk + peer grade) | 1 long OR 2 short | 9-18 days |
| **Net schedule additions** | **4-5 days** | **36-45 days** |

PC retakes happen within the 2-day administration window AND
afterward until the quarter closes (no fixed schedule -- students
self-pace retakes during Do-Now / study-hall time).

## Sub-specs (deferred)

### Poster grading algorithm (separate sub-spec)

Per s121 user spec:
- 4 rubrics per unit, each covering 1 of 4 key unit takeaways
- Class self-organizes into 4 groups (one per rubric)
- Group minimum size: 3; max suggested: 4-5
- Smaller groups get a handicap (TBD: percentage bonus or
  fewer-role-requirement)
- Each rubric has up to 8 roles: 3 CORE (mandatory) + 5
  OPTIONAL (bonus)
- Peer-graded during gallery walk against the rubric
- Per-student score:
  - Base = group's peer-graded rubric score
  - Role bonus = per optional role taken (capped)
  - Handicap = small-group multiplier (if group < 4)

Implementation lives in `roster-server/poster-grade.js` (new).
Inputs from new Supabase tables: `poster_assignment`,
`poster_role_assignment`, `poster_peer_review`. Schoology sync
treats poster score as the per-unit assignment value.

### Blooket data capture (separate sub-spec)

Per s121 user spec:
- Per-Blooket score = `correct / total_questions`
- accuracy x min(1, attempted/total) -- algebraically simplifies
  to `correct / total` when attempted <= total
- 0 attempts -> 0 score (no participation credit)
- 30 attempts, 30 correct -> 100%
- 30 attempts, 20 correct -> 67% (poor accuracy)
- 15 attempts, 15 correct -> 50% (early walkaway penalty)

Capture pipeline:
- Blooket has no public API
- Teacher exports Blooket session CSV (Blooket dashboard ->
  Reports -> Export)
- New roster-server endpoint: `POST /blooket/upload-csv` that
  parses the CSV, matches student names to roster, computes
  per-student `correct / total`, writes to a new `blooket_score`
  table
- Schoology sync pushes Blooket scores into the `Blooket`
  category, one assignment per Blooket session

Implementation lives in `roster-server/blooket-grade.js` (new)
+ a teacher-dashboard upload UI.

## Implementation phases

| Phase | Scope | Ship gate |
|---|---|---|
| **v3.0** Spec lock | This document + schedule update | User approves spec |
| **v3.1** Phase 6 swap | `lesson-grade.js` rewrite + Desk strip update | All existing tests green; new test pinpoints the v3 formula at the boundary cases |
| **v3.2** Schoology config | Teacher renames + adds categories + enables Weight Categories | Sec 1 + Sec 2 both configured; verified via gradesetup screenshot |
| **v3.3** Override push | Sync writes `gp_override` per (student, MP) | One section's overrides land in Schoology, visually verified |
| **v3.4** Poster sub-spec | `poster-grade.js` + Supabase tables + teacher UI | First unit's poster cycle ends with a Schoology-visible per-student score |
| **v3.5** Blooket sub-spec | `blooket-grade.js` + CSV upload + teacher UI | First Blooket session uploaded and per-student score lands in the Blooket category |
| **v3.6** Full sync E2E | All 5 categories + override end-to-end for one section | End-of-Q1 grades match between Desk and Schoology |

v3.1 - v3.3 are the load-bearing phases. v3.4 - v3.5 are
independent and can land in any order after v3.3.

## Test plan

### v3 formula unit tests (Phase 6 / v3.1)

```js
describe('quarter_grade v3 model', () => {
  // Above-floor symmetric cases
  it('PC=100, Work=40 -> 100', () => { /* max-of-two kicks in */ });
  it('PC=40, Work=100 -> 100', () => { /* symmetric */ });
  it('PC=70, Work=60 -> 70', () => { /* max-of-two, mid-range */ });

  // Below-floor PC-only ceiling
  it('PC=100, Work=0 -> 70', () => { /* 70% PC ceiling */ });
  it('PC=100, Work=30 -> 70', () => { /* flat ceiling */ });

  // Below-floor Work-only ceiling (symmetric)
  it('PC=0, Work=100 -> 70', () => { /* 70% Work ceiling */ });
  it('PC=30, Work=100 -> 70', () => { /* flat ceiling */ });

  // Below-floor mean-wins cases
  it('PC=80, Work=39 -> 59.5', () => { /* mean = 59.5 beats both 70%s */ });
  it('PC=39, Work=80 -> 59.5', () => { /* symmetric */ });

  // Both-below-floor
  it('PC=30, Work=30 -> 30', () => { /* mean wins */ });
  it('PC=0, Work=0 -> 0', () => { /* honest zero */ });

  // Edge: exact floor
  it('PC=40, Work=40 -> 40', () => { /* both at exact floor */ });
});
```

### Schoology override push integration test (v3.3)

Per-section end-to-end: create a test student row, push synthetic
per-assignment grades, write the override, re-read the gradebook
DOM, assert the override cell shows the expected value.

## Open questions resolved this session

- **5 categories vs 4**: 5 (Lesson / Quizzes / Posters / Blooket /
  PC). Path 1 from s121 brainstorm.
- **Quiz granularity**: per-topic, ~63 quizzes/year, ~0.24% each.
- **PC retake mechanic**: latest attempt overwrites the cell.
- **Below-floor formula**: `max(0.7*PC, 0.7*Work, mean(PC, Work))`.
- **Symmetric floors**: both PC >= 40% and Work >= 40% required
  for max-of-two to apply.
- **Tests as "Quizzes"**: yes (rename in Schoology). The
  "tests" concept reabsorbs into PCs as the unit-level
  summative.

## Open questions for follow-up

- **Poster small-group handicap formula**: percentage bonus or
  reduced-role-requirement? Sub-spec the poster algorithm.
- **Blooket CSV format from real exports**: column names,
  encoding, sample data needed before parser ships.
- **Year-final grade with mid-year transfers**: a student who
  joins the class in Q3 -- year_grade = mean of available
  quarters or proportional? Out of scope for v3.0; revisit when
  needed.
- **What happens if a PC is rescheduled mid-quarter**: which
  quarter does it count toward? v3 uses lesson-schedule.json's
  `quarter` field -- if reschedule moves the PC to a different
  quarter, that field updates and the math follows.

## Migration plan (Phase 6 -> v3)

Phase 6's `quarterGrade = mean(lessonGrade)` is currently live in
production. v3 changes the formula but keeps the response shape.
Migration steps:

1. Land v3 formula in `lesson-grade.js` behind a feature flag
   (`USE_V3_GRADING=true` env var); default off
2. Verify against synthetic data + a real student in a test
   environment
3. Flip the flag in production; monitor for divergence reports
4. Remove the flag + Phase 6 code path after one full quarter
   cycle of v3 in production

The Desk's grade-outlook strip continues to display the same UI;
only the underlying numbers change.

## Implementation decisions (v3.1 — resolved s122, 2026-05-29)

The v3.1 swap landed in `roster-server/lesson-grade.js` (`computeQuarterV3` +
`quarterGradeV3` / `workAvgV3`), gated by `config.useV3` (env `USE_V3_GRADING`,
default OFF) at a single point in `grade.js::computeGrade` — so `/grade`
(student) and `/class/grades` (teacher) share one gate. The teacher signed off
on every decision below (s122), each of which the spec above left ambiguous.

1. **Lessons track EXCLUDES the curriculum-quiz feeder** (`v3LessonsExcludeQuiz:
   true`). Quizzes is its own 15% track, so counting quizzes inside Lessons too
   would double-count. `lessonsAvg` = the {blanks, FRQ} blend (weights 1:2);
   `quizzesAvg` = the curriculum-quiz correctness. Set the flag `false` to fold
   the quiz back into Lessons (the literal reading of the older "unified
   lessonGrade is source of truth" sentence).

2. **`pcAvg` uses RAW PC%** (correct/graded), NOT the Phase 6 `pcRawToP`
   graduated-trust anchor curve. The worked examples ("40% PC ≈ D-level") only
   hold for raw scores. PCs are therefore meaningfully harder than the Phase 6
   ramp — intended; AP-readiness is the aim and the two-track max model lets
   engagement carry the grade.

3. **`pcAvg` counts only PCs DUE-BY-TODAY.** A unit's PC is "due" once that
   unit's last lesson is due-by-today (proxy; the real PC date is +1–2 days).
   due+attempted → raw score (clamped to [0,1]); due+un-attempted → 0; not-due
   → skipped (an un-due PC must not leak into `pcAvg`, or a recorded-but-not-due
   PC with no due work would bypass the 70% single-track ceiling). The due check
   respects `gradingWindowStart`, so stale prior-cohort dates can't resurrect a
   phantom 0.

4. **Posters + Blooket have no data source yet** (v3.4 / v3.5). They are `null`
   (absent) and excluded from `workAvg`, which renormalizes over present tracks
   — so today `workAvg = mean(lessonsAvg, quizzesAvg)`. When those tracks ship,
   the full 0.30/0.30/0.30/0.10 blend applies automatically.

5. **Quarter bucketing is unit→quarter band, NOT calendar date.** Pack-left
   front-loads teaching dates, so a unit's lessons may be taught in an earlier
   calendar quarter than its report-card quarter. v3 buckets BOTH lessons and
   PCs by `quarterOfUnit`, so a unit's work + PC land in the same quarter
   ("unit → quarter mapping only buckets grades"). Phase 6's date-driven
   `quarterOfLesson` is unchanged (used only when `useV3` is off). The
   `quarters-by-date.test.js` "date in home-quarter window" data check was
   retired (pack-left intentionally violates it). `isDue` still uses the real
   teaching date.

6. **Null-track gating.** Until BOTH tracks have due assignments, the present
   track alone sets the grade (early-quarter work isn't capped at 70% just
   because the PC isn't scheduled yet). `quarterGrade` / `ceiling` are null only
   when nothing is due in either track.

`quarterGrade`, `ceiling`, `pcAvg`, `workAvg` are returned on the 0–100 scale
(`quarterGrade` shape unchanged from Phase 6; `pcAvg`/`workAvg` are new and are
null on the Phase 6 path). An adversarial review (s122, 21 agents) folded 4 real
defects before sign-off: the `unitPcDue` window filter, recorded-PC due-gating,
the raw-% clamp, and doc comments. Tests pin all 14 worked examples plus the
aggregation, gating, and bucketing cases.
