// lesson-grade-v3.test.js — pure-function unit tests for the v3 grading model.
// Tests quarterGradeV3 (the boundary worked-examples table), workAvgV3
// (present-track renormalization), and computeQuarterV3 (aggregation + the
// null-track gating + ceiling). NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  quarterGradeV3,
  workAvgV3,
  V3_WORK_WEIGHTS,
  computeQuarterV3,
} from '../lesson-grade.js';
import { computeGrade } from '../grade.js';

// ── quarterGradeV3 — the worked-examples table from GRADING_MODEL_V3_BUILD.md ──

describe('quarterGradeV3 — boundary worked examples (spec §Worked examples)', () => {
  // [pcAvg, workAvg, expected quarter grade on [0,1]]
  const CASES = [
    [1.00, 1.00, 1.000], // both ≥ .40 → max — full mastery + engagement
    [1.00, 0.40, 1.000], // PC-led; min Work cleared
    [0.40, 1.00, 1.000], // Work-led; min PC cleared
    [1.00, 0.39, 0.700], // Work < .40 → PC-only ceiling
    [1.00, 0.00, 0.700], // pure PC gamer — capped
    [0.39, 1.00, 0.700], // PC < .40 → symmetric ceiling
    [0.00, 1.00, 0.700], // pure work, no PC — capped
    [0.80, 0.39, 0.595], // mean wins (Work helping)
    [0.39, 0.80, 0.595], // symmetric
    [0.50, 0.50, 0.500], // above floor; either track
    [0.30, 0.30, 0.300], // both gates failed; mean dominates
    [0.00, 0.00, 0.000], // honest zero
    [0.70, 0.60, 0.700], // typical "trying" student
    [0.40, 0.40, 0.400], // exact floor on both
  ];

  for (const [pc, work, expected] of CASES) {
    it(`PC=${pc}, Work=${work} → ${(expected * 100).toFixed(1)}%`, () => {
      expect(quarterGradeV3(pc, work)).toBeCloseTo(expected, 6);
    });
  }

  it('the two 40% cliffs are ~30 points each when the other track is 100%', () => {
    expect(quarterGradeV3(1.0, 0.39)).toBeCloseTo(0.70, 6);
    expect(quarterGradeV3(1.0, 0.40)).toBeCloseTo(1.00, 6);
    expect(quarterGradeV3(0.39, 1.0)).toBeCloseTo(0.70, 6);
    expect(quarterGradeV3(0.40, 1.0)).toBeCloseTo(1.00, 6);
  });
});

// ── workAvgV3 — renormalize over present tracks ───────────────────────────────

describe('workAvgV3 — present-track renormalization', () => {
  it('only lessons + quizzes present → plain mean of the two', () => {
    // (0.30·L + 0.30·Q) / 0.60 = (L + Q) / 2
    expect(workAvgV3({ lessons: 0.90, quizzes: 0.60, posters: null, blooket: null }))
      .toBeCloseTo(0.75, 6);
  });

  

  it('a single present track returns that track verbatim', () => {
    expect(workAvgV3({ lessons: 0.42, quizzes: null, posters: null, blooket: null }))
      .toBeCloseTo(0.42, 6);
  });

  it('no track present → null', () => {
    expect(workAvgV3({ lessons: null, quizzes: null, posters: null, blooket: null })).toBe(null);
    expect(workAvgV3(null)).toBe(null);
  });

  it('weights sum to 1.0 (sanity)', () => {
    const sum = Object.values(V3_WORK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

// ── computeQuarterV3 — aggregation + gating + ceiling ─────────────────────────

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [2], start: '2026-12-01', end: '2027-01-31', pcAnchor: { p85: 45, p100: 64 } },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}

describe('computeQuarterV3 — aggregation', () => {
  it('early quarter (PC not due) → quarter grade = workAvg, pcAvg null', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future
    };
    // Only 1.1 is due. Cws=80, W=100 → noQuiz = (1·80 + 2·100)/3 = 93.333; Q=60.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: 100, Q: 60, lessonGrade: 80 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    // lessonsAvg = 0.93333, quizzesAvg = 0.60 → workAvg = mean = 0.76667 → 76.7
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBeCloseTo(76.7, 1);
    expect(r.quarterGrade).toBeCloseTo(76.7, 1);
    expect(r.lessonsDue).toBe(1);
    expect(r.lessonsTotal).toBe(2);
    expect(r.pcDue).toBe(false);   // PCs not open yet (the unit's last lesson is future)
  });

  

  

  it('recorded PC for a not-yet-due unit does NOT leak in (no 100% for skipping due work)', () => {
    // Q1 lessons all future-dated → nothing due; a PC score is recorded anyway.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } },
      '1.2': { unit: 1, periods: { B: '2026-11-25', E: '2026-11-25' } },
    };
    const lessonMap = lessonMapOf({}); // no work
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 100 },
    });
    // PC's unit isn't due (lessons future) → pcAvg null; no due work → workAvg null.
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBe(null);
    expect(r.quarterGrade).toBe(null); // NOT 100 — the anti-gaming floor is not bypassed
  });

  

  it('stale prior-cohort lesson date does NOT resurrect a phantom 0 PC (window filter)', () => {
    // Only a pre-window (SY25-26) lesson exists for the unit; the cohort window
    // starts 2026-09-01. The lessons track drops it AND the PC proxy must too —
    // else pcAvg=0 forces quarterGrade=0 instead of the Phase-6-consistent null.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-04-15', E: '2026-04-15' } },
    };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: new Map(), schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      gradingWindowStart: '2026-09-01',
    });
    expect(r.pcAvg).toBe(null);        // phantom NOT resurrected (was 0 before the fix)
    expect(r.workAvg).toBe(null);
    expect(r.quarterGrade).toBe(null); // matches Phase 6 (was 0 before the fix)
  });

  

  it('exclude-quiz flag OFF folds the quiz into the Lessons track', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: 0, lessonGrade: 50 },
    });
    const cfgOff = { ...CFG, v3LessonsExcludeQuiz: false };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: cfgOff, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    // lessonsAvg uses lessonGrade=50 → 0.50 (not the noQuiz 100).
    expect(r.workAvg).toBeCloseTo(25.0, 1); // mean(0.50 lessons, 0.0 quizzes) = 0.25
  });

  it('buckets a lesson by its CALENDAR DATE (quarterOfLesson), not its old-unit band', () => {
    // SY2627 (2026-09-03): the real schedule teaches old units in CED order, so
    // an old unit straddles quarters. A unit-1 lesson due in Q2 counts in Q2
    // (the pre-SY2627 "pack-left" unit-band rule put it in Q1).
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } }, // Q2 calendar window
    };
    const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 } });
    const byDate = { ...CFG, v3LessonsByDate: true }; // the live SY2627 config
    const q1 = computeQuarterV3({
      quarterKey: 'Q1', config: byDate, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    const q2 = computeQuarterV3({
      quarterKey: 'Q2', config: byDate, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    expect(q1.lessonsTotal).toBe(0); // NOT Q1 — the December date wins over the old-unit band
    expect(q2.lessonsTotal).toBe(1); // Dec 1 is in Q2's calendar window
  });

  it('WITHOUT v3LessonsByDate (the frozen SY2526 config) the old unit→quarter band still applies', () => {
    // Historical grades must not move: a config snapshot that predates the flag
    // keeps bucketing a unit-1 lesson in Q1 regardless of its date.
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-12-01', E: '2026-12-01' } },
    };
    const lessonMap = lessonMapOf({ '1.1': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 } });
    const q1 = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    const q2 = computeQuarterV3({
      quarterKey: 'Q2', config: CFG, lessonMap, schedule,
      todayDateStr: '2027-01-01', section: 'PeriodB', unitPcData: {},
    });
    expect(q1.lessonsTotal).toBe(1);
    expect(q2.lessonsTotal).toBe(0);
  });

  it('empty quarter (nothing scheduled/due) → all null', () => {
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: new Map(), schedule: {},
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
    });
    expect(r.quarterGrade).toBe(null);
    expect(r.pcAvg).toBe(null);
    expect(r.workAvg).toBe(null);
    expect(r.ceiling).toBe(null);
    expect(r.lessonsTotal).toBe(0);
  });

  it('ceiling assumes remaining/un-attempted items score 100', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 50, W: 50, Q: 50, lessonGrade: 50 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 60 },
    });
    // ceiling ≥ current grade, and ≤ 100
    expect(r.ceiling).not.toBe(null);
    expect(r.ceiling).toBeGreaterThanOrEqual(r.quarterGrade);
    expect(r.ceiling).toBeLessThanOrEqual(100);
  });
});

// ── computeQuarterV3 — Blooket make-up track (BLOOKET_MAKEUP_BUILD.md) ─────────
//
// The Blooket is now a real per-lesson grade an absent student can make up via
// the Desk flashcards. The track's denominator = due lessons that HAVE a Blooket
// (`blooketLessons`); a missing-but-due Blooket counts as 0 (mirrors lessons/
// quizzes). r.blooket carries the resolved score (game, else flashcard make-up,
// else null→0). The blooketAvg folds into workAvg — it is NOT returned directly,
// so these assert via r.workAvg.
//
// Blooket weight is 10% (V3_WORK_WEIGHTS.blooket), lessons + quizzes 30% each.
// With lessons=100, quizzes=100 the arithmetic is:
//   no Blooket in denominator → workAvg = (.30+.30)/.60          = 100.0
//   Blooket due, 0 evidence   → workAvg = (.30+.30+.10·0)/.70    =  85.7
//   Blooket made up (80%)     → workAvg = (.30+.30+.10·0.8)/.70  =  97.1
describe('computeQuarterV3 — Blooket make-up track', () => {
  // 1.1 is due; 1.2 is future-dated so the unit's PC is NOT due → pcAvg stays
  // null → quarterGrade == workAvg (keeps the Blooket effect easy to read).
  const SCHEDULE = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } }, // due
    '1.2': { unit: 1, periods: { B: '2026-11-20', E: '2026-11-20' } }, // future
  };
  // Perfect lessons + quizzes on the one due lesson (Cws/W → noQuiz 100; Q 100).
  function mapWith(blooket) {
    const lesson = { Cws: 100, W: 100, Q: 100, lessonGrade: 100 };
    if (blooket != null) lesson.blooket = blooket;
    return lessonMapOf({ '1.1': lesson });
  }
  function run(blooketLessons, blooket) {
    return computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: mapWith(blooket), schedule: SCHEDULE,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
      blooketLessons,
    });
  }

  it('a due lesson NOT in blooketLessons is excluded from the Blooket denominator', () => {
    const r = run([], null); // no Blooket-bearing lessons
    expect(r.pcAvg).toBe(null);             // PC not due (1.2 future)
    expect(r.workAvg).toBeCloseTo(100.0, 1); // mean(lessons 100, quizzes 100) only
    expect(r.quarterGrade).toBeCloseTo(100.0, 1);
  });

  it('a due Blooket-bearing lesson with NO evidence counts as 0 (drops workAvg)', () => {
    const r = run(['1.1'], null); // 1.1 has a Blooket, student has no game/flashcard
    // blooketAvg = 0 → workAvg = (.30·1 + .30·1 + .10·0)/.70 = 85.7
    expect(r.workAvg).toBeCloseTo(85.7, 1);
    expect(r.workAvg).toBeLessThan(100); // strictly below the no-Blooket case
  });

  it('the flashcard make-up (r.blooket=80) lifts workAvg above the 0 case', () => {
    const zero = run(['1.1'], null);
    const made = run(['1.1'], 80); // flashcard pass pinned at 80%
    // blooketAvg = 0.8 → workAvg = (.30·1 + .30·1 + .10·0.8)/.70 = 97.1
    expect(made.workAvg).toBeCloseTo(97.1, 1);
    expect(made.workAvg).toBeGreaterThan(zero.workAvg); // make-up helps
    expect(made.workAvg).toBeLessThan(100);             // but never a full 100 (no game)
  });

  it('back-compat: omitting blooketLessons leaves the Blooket track null (no tank)', () => {
    // Older callers that never pass blooketLessons → empty set → blooketAvg null
    // → renormalized away. Even a lesson with a recorded r.blooket is ignored.
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap: mapWith(80), schedule: SCHEDULE,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: {},
      // blooketLessons omitted entirely
    });
    expect(r.workAvg).toBeCloseTo(100.0, 1); // Blooket excluded → lessons+quizzes only
  });

  it('exposes workTracks + blooketDue/Done/Todo for the grade coach', () => {
    const made = run(['1.1'], 80);   // 1.1 has a Blooket, made up to 80
    expect(made.workTracks).toBeTruthy();
    expect(made.workTracks.lessons).toBeCloseTo(100, 1);
    expect(made.workTracks.quizzes).toBeCloseTo(100, 1);
    expect(made.workTracks.blooket).toBeCloseTo(80, 1);
    expect(made.blooketDue).toBe(1);
    expect(made.blooketDone).toBe(1);
    expect(made.blooketTodo).toEqual([]);

    const todo = run(['1.1'], null); // due Blooket, not done → a make-up opportunity
    expect(todo.workTracks.blooket).toBeCloseTo(0, 1);
    expect(todo.blooketDue).toBe(1);
    expect(todo.blooketDone).toBe(0);
    expect(todo.blooketTodo).toEqual(['1.1']);

    const none = run([], null);      // no Blooket-bearing lesson in the denominator
    expect(none.workTracks.blooket).toBe(null);
    expect(none.blooketDue).toBe(0);
    expect(none.blooketTodo).toEqual([]);
  });

  it('counts an ahead-of-schedule Blooket-only lesson (make-up before the due date)', () => {
    // A FUTURE-dated lesson whose ONLY work is a passed flashcard make-up
    // (blooket 80, no worksheet/quiz → lessonGrade null). The earned 80 must
    // still count — mirrors the lessons track's "if the work is done, count it"
    // rule. Pre-fix this was dropped (the Blooket track iterated dueLessons, and
    // lessonGrade — which gates an undated lesson into dueLessons — excludes blooket).
    const futureSchedule = {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2027-09-01', E: '2027-09-01' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: null, W: null, Q: null, lessonGrade: null, blooket: 80 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule: futureSchedule,
      todayDateStr: '2026-09-10', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1'],
    });
    expect(r.blooketDue).toBe(1);
    expect(r.blooketDone).toBe(1);
    expect(r.blooketTodo).toEqual([]);
    expect(r.workTracks.blooket).toBeCloseTo(80, 1);
    // The lessons/quizzes tracks must NOT get a phantom 0 from this lesson — it's
    // not in dueLessons, so they stay null (only the Blooket track sees it).
    expect(r.workTracks.lessons).toBe(null);
    expect(r.workTracks.quizzes).toBe(null);
    expect(r.workAvg).toBeCloseTo(80, 1); // Blooket alone → workAvg = 80
  });
});

// ── Quiz-bearing denominator (#2 fix) ─────────────────────────────────────────
// The Quiz track divides by due QUIZ-BEARING lessons, not all due lessons, so a
// quiz-less opener no longer drags the quiz average down. Only ever RAISES.
describe('computeQuarterV3 — quiz-bearing denominator', () => {
  it('quiz-less opener is EXCLUDED from the quiz denominator (raises vs old all-due)', () => {
    const schedule = {
      '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } }, // opener, NO quiz
      '1.2': { unit: 1, periods: { B: '2026-09-10', E: '2026-09-10' } }, // has a quiz
      '1.3': { unit: 1, periods: { B: '2026-09-30', E: '2026-09-30' } }, // future → keeps PC not-due, isolating the quiz effect
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: 100, Q: null, lessonGrade: 100 }, // opener: no quiz score
      '1.2': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },  // aced the quiz
    });
    const args = {
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    };

    // Fixed: only 1.2 is quiz-bearing → quizzesAvg = 100/1 = 100.
    const fixed = computeQuarterV3({ ...args, quizLessons: ['1.2'] });
    expect(fixed.quizDue).toBe(1);
    expect(fixed.quizDone).toBe(1);
    expect(fixed.workTracks.quizzes).toBeCloseTo(100, 1);
    expect(fixed.workAvg).toBeCloseTo(100, 1); // lessons 100 + quizzes 100

    // Old (no quizLessons → back-compat all-due denominator): 100/2 = 50, dragged.
    const old = computeQuarterV3(args);
    expect(old.workTracks.quizzes).toBeCloseTo(50, 1);
    // The fix only RAISES the grade.
    expect(fixed.quarterGrade).toBeGreaterThanOrEqual(old.quarterGrade);
    expect(fixed.quarterGrade).toBeCloseTo(100, 1);
    expect(old.quarterGrade).toBeCloseTo(75, 1);
  });

  it('an un-taken quiz on a quiz-BEARING due lesson still counts as 0 (engagement preserved)', () => {
    const schedule = {
      '1.2': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.3': { unit: 1, periods: { B: '2026-09-10', E: '2026-09-10' } },
    };
    const lessonMap = lessonMapOf({
      '1.2': { Cws: 100, W: 100, Q: 100, lessonGrade: 100 },  // took the quiz
      '1.3': { Cws: 100, W: 100, Q: null, lessonGrade: 100 }, // quiz EXISTS, not taken
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      quizLessons: ['1.2', '1.3'], // BOTH have a quiz
    });
    expect(r.quizDue).toBe(2);
    expect(r.quizDone).toBe(1);
    expect(r.quizTodo).toContain('1.3');
    expect(r.workTracks.quizzes).toBeCloseTo(50, 1); // 100/2 — the skipped quiz = 0
  });
});

// Regression: the quiz surface (and Blooket surface) must SURVIVE grade.js's
// explicit quarters[qKey] serializer into the /grade + /class/grades output, or
// the dashboard "(n/m taken)" verification line silently never renders.
describe('computeGrade — quiz/blooket surface threading', () => {
  const GRADE_CFG = {
    C: 85,
    feederWeights: { W: 1, Q: 2 },
    lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
    frqBand: { E: 100, P: 70, I: 35 },
    useV3: true,
    v3LessonsExcludeQuiz: true,
    schoolTz: 'America/New_York',
    gradingWindowStart: null, // no window filter so the past-dated fixture lessons stay in-band
    quarters: { Q1: { units: [1], start: '2026-01-01', end: '2026-08-31', pcAnchor: { p85: 40, p100: 60 } } },
  };

  it('quarters[Q].quizDue/quizDone/blooketDue reach the serialized output', () => {
    const schedule = {
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-01-09', E: '2026-01-09' } }, // opener, due
      '1.2': { unit: 1, worksheetKey: '2', periods: { B: '2026-01-10', E: '2026-01-10' } }, // has a quiz, due
    };
    const answerKey = { 'U1-L2-Q01': { answerKey: 'B', unit: '1' } };
    const rows = [
      { item_id: 'U1-L2-Q01', source: 'curriculum_quiz', response: 'B', recorded_at: '2026-01-11T00:00:00Z' },
    ];
    const out = computeGrade(rows, answerKey, GRADE_CFG, { lessonSchedule: schedule, section: 'PeriodB' });
    const q1 = out.quarters.Q1;
    // The #2 fix's verification surface (previously dropped by the serializer):
    expect(typeof q1.quizDue).toBe('number');
    expect(q1.quizDone).toBe(1);   // 1.2's quiz was taken + correct
    expect(q1.quizDue).toBe(1);    // only 1.2 is quiz-bearing (opener 1.1 excluded)
    // Blooket surface stays threaded too (same serializer slot).
    expect(typeof q1.blooketDue).toBe('number');
  });
});
