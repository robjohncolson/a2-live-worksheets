// @ts-check
// grade-config.js — the ONE Phase-3 config constant block.
// Every §7 pilot-tunable knob lives here and nowhere else (GRADEBOOK_PHASE3_BUILD.md
// §1–§3 + §5). Changing a number here re-tunes the model with zero code edits;
// because Phase 3 resolves grades at rollup time, a tweak retro-fixes history.

// Keep diagnostics outside the frozen grading configuration and grade artifacts.
export const TEACHER_DIAGNOSTIC_CONFIG = {
  misconceptions: {
    minAssessmentsPerStudent: 2,
    minDaysApart: 3,
    classShare: 0.33,
    classMinLessons: 2,
    windowDays: 42,
  },
};

import { A2_CATEGORIES, A2_FEEDERS } from './district-grade.js';
// PHASE 3: district policy is the default grade.
export const PHASE3_CONFIG = {
  bonusOnlyThrough: '2026-09-18', // Inclusive school-timezone due date; null disables.
  a2Categories: A2_CATEGORIES,
  a2Feeders: A2_FEEDERS,
  useDistrictFormula: process.env.USE_DISTRICT_FORMULA !== 'false',
  meetingDays: { C: [1, 2, 4], D: [1, 3, 5], G: [2, 3, 4, 5] },
  
  C: 85,

  // Feeder weights for B = (wW·W + wQ·Q) / (present weights).
  // follow-along worksheet : cr-quiz = 1 : 2.
  // Used by the unit-level grade path (grade.js units{}) — unchanged.
  feederWeights: { W: 1, Q: 2 },

  // Feeder weights for the lesson-level B = (ws*Cws + W*W + Q*Q) / (present weights).
  // Spec D1: ws:W:Q = 1:2:3 (worksheet blanks : FRQ : quiz).
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },

  // AI-graded FRQ band → numeric. DN2b records score ∈ {1,0.5,0} (E/P/I);
  // Phase 3 remaps that to the teacher's E/P/I numeric band.
  frqBand: { E: 100, P: 70, I: 35 },

  // An frq row counts as "demonstrated" for the diagnostic BKT when its
  // numeric score (E=1/P=0.5/I=0) is at least this (E and P = evidence).
  // Grade-side frq uses frqBand directly; this is the diagnostic binary only.
  frqDiagnosticCorrectThreshold: 0.5,

  // Units per quarter follow the SY26-27 year plan (data/a2-lesson-targets.json,
  // scripts/build-a2-year-plan.mjs, two calendar weeks per lesson): Topic 1 in Q1,
  // Topic 2 in Q2, Topics 3-4 in Q3, Topic 5 in Q4 (6-7 are unscheduled and fall
  // back to Q4). Grades bucket lessons by due DATE (quarterOfLesson); this list is
  // only the fallback for an undated lesson and the dashboard's unit labels.
  quarters: {
    Q1: { units: [1],       start: '2026-09-02', end: '2026-11-06' },
    Q2: { units: [2],       start: '2026-11-09', end: '2027-01-22' },
    Q3: { units: [3, 4],    start: '2027-01-25', end: '2027-04-14' },
    Q4: { units: [5, 6, 7], start: '2027-04-15', end: '2027-06-17' },
  },

  // IANA timezone for computing "today" in the date filter (Phase 6).
  // Server clock in this timezone determines which lessons are "due".
  schoolTz: 'America/New_York',

  // Phase 6 (2026-05-20 fold): cohort-aware grading window. Any lesson
  // whose due dates are ENTIRELY BEFORE this date is excluded from the
  // active band — those are stale entries left over from a prior school
  // year (e.g. SY25-26's April-2026 dates lingering when SY26-27 begins).
  // A lesson with even ONE period date >= this start (or NULL dates =
  // not-yet-scheduled-for-this-cohort) stays in the band.
  // Update this once per year at cohort cutover.
  gradingWindowStart: '2026-09-01',

  // Diagnostic weak-skill flag cutoff (pKnow < θ ⇒ weak). GRADE-INDEPENDENT —
  // θ never enters any grade arithmetic (GRADEBOOK_GRADING_SPEC.md §3).
  diagnosticTheta: 0.65,

  useV3: process.env.USE_V3_GRADING === 'true',

  // v3: exclude the curriculum-quiz feeder from the Lessons track. In v3's
  // 5-category model Quizzes is its own 15% track, so counting quizzes inside
  // Lessons too would double-count. Default true (the defensible reading; the
  // spec prose is ambiguous on this one point — see GRADING_MODEL_V3_BUILD.md).
  v3LessonsExcludeQuiz: true,

  // v3 Work-track weights (renormalized over present tracks) — formerly a
  // hardcoded const in lesson-grade.js (GRADE_SIMULATION FINDING F2). Now a
  // pilot-tunable knob; these defaults are byte-identical to the old constant.
  v3WorkWeights: { lessons: 3 / 7, quizzes: 3 / 7, blooket: 1 / 7 },

  v3Gates: { floor: 0.40, ceiling: 0.70 },

  // Perverse-incentive fixes the grade simulator found (GRADE_FIX_F1_F3_BUILD.md).
  // ENABLED 2026-06-16. Each is a real grade change, simulator-verified.
  // F1-B: an un-taken quiz on a not-scheduled-due lesson stays absent, not 0.
  v3FixQuizZero: true,
  // F3: doing some-but-not-all worksheet blanks can't drop a lesson below FRQ-only.
  v3FixCwsReveal: true,
  // F1-A: how an ahead-of-schedule (worked, not-yet-due) lesson counts in the
  // Lessons track — 'count-all' (legacy) | 'not-until-due' | 'only-helps'.
  // 'not-until-due' chosen: it fully fixes the F1 incentive AND stays monotonic.
  // 'only-helps' scored marginally higher but the simulator proved it VIOLATES
  // A3 monotonicity (raising a due lesson can evict an above-avg early lesson and
  // lower the grade — FINDING F4). Monotonicity wins. (only-helps stays available
  // for experimentation but must not ship.)
  v3AheadOfScheduleLessons: 'not-until-due',

  // SY2627 (2026-09-03): the v3 Lessons track buckets lessons by CALENDAR DATE
  // (quarterOfLesson) instead of the static old-unit band. The real schedule
  // teaches old units in Fall-2026 CED order, so an old unit straddles
  // quarters. Absent (false) in the frozen SY2526 config → that year keeps
  // unit banding and its grades do not move.
  v3LessonsByDate: true,

  // SY2627 (teacher 2026-09-03): a lesson is due once its lesson DAY HAS ENDED
  // (11:59 PM schoolTz) — a missing worksheet is not a 0 until the next day.
  // Absent in the frozen SY2526 config → due from the start of the lesson day.
  dueAfterLessonDay: true,

  // SY2627 (teacher 2026-09-03): early-completion bonus — +perLesson points on
  // the quarter grade for each scheduled-due lesson whose worksheet work was all
  // submitted by 11:59 PM on its due date, capped at `cap` per quarter (0 = off,
  // omit = uncapped). "Submitted" = the worksheet reached minComplete (80%) of
  // its blanks by the deadline (worksheetCoverageReachedAt) — one blank never
  // qualifies, and a later edit/regrade of a row cannot revoke it. The cap and
  // minComplete are placeholders the teacher has not confirmed. Absent → no bonus.
  v3EarlyBonus: { perLesson: 1, cap: 5, minComplete: 0.8 },

};

// unitNumber("U4") | "4" | 4 → 4 ; anything unparseable → null.
export function unitNumber(u) {
  if (u == null) return null;
  const m = String(u).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Which quarter a unit belongs to ("Q1".."Q4"), or null if outside the bands.
export function quarterOfUnit(unitNum, cfg = PHASE3_CONFIG) {
  for (const q of Object.keys(cfg.quarters)) {
    if (cfg.quarters[q].units.includes(unitNum)) return q;
  }
  return null;
}

// Which quarter a calendar date falls in ('Q1'..'Q4'), or null if the
// date is outside every quarter window. Boundaries inclusive. ISO
// YYYY-MM-DD strings compare correctly lexicographically.
export function quarterOfDate(dateStr, cfg = PHASE3_CONFIG) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  for (const q of Object.keys(cfg.quarters)) {
    const w = cfg.quarters[q];
    if (w.start && w.end && dateStr >= w.start && dateStr <= w.end) return q;
  }
  return null;
}



if (PHASE3_CONFIG.useDistrictFormula && PHASE3_CONFIG.useV3) {
  console.warn('[grade] Both district and v3 enabled; district formula wins.');
}
