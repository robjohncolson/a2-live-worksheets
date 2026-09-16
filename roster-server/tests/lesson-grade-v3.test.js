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
} from '../lesson-grade.js';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

// ── quarterGradeV3 — the worked-examples table from GRADING_MODEL_V3_BUILD.md ──

describe('quarterGradeV3 — boundary worked examples (spec §Worked examples)', () => {
  // [pcAvg, workAvg, expected quarter grade on [0,1]]
  const CASES = [
    [1.00, 1.00, 1.000], // both ≥ .40 → max — full mastery + engagement
    [1.00, 0.40, 1.000], // Mastery-led; min Work cleared
    [0.40, 1.00, 1.000], // Work-led; min Mastery cleared
    [1.00, 0.39, 0.700], // Work < .40 → Mastery-only ceiling
    [1.00, 0.00, 0.700], // pure Mastery gamer — capped
    [0.39, 1.00, 0.700], // Mastery < .40 → symmetric ceiling
    [0.00, 1.00, 0.700], // pure work, no Mastery — capped
    [0.80, 0.39, 0.595], // mean wins (Work helping)
    [0.39, 0.80, 0.595], // symmetric
    [0.50, 0.50, 0.500], // above floor; either track
    [0.30, 0.30, 0.300], // both gates failed; mean dominates
    [0.00, 0.00, 0.000], // honest zero
    [0.70, 0.60, 0.700], // typical "trying" student
    [0.40, 0.40, 0.400], // exact floor on both
  ];

  for (const [pc, work, expected] of CASES) {
    it(`Mastery=${pc}, Work=${work} → ${(expected * 100).toFixed(1)}%`, () => {
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
    expect(workAvgV3({ lessons: 0.90, quizzes: 0.60, blooket: null }))
      .toBeCloseTo(0.75, 6);
  });

  

  it('a single present track returns that track verbatim', () => {
    expect(workAvgV3({ lessons: 0.42, quizzes: null, blooket: null }))
      .toBeCloseTo(0.42, 6);
  });

  it('no track present → null', () => {
    expect(workAvgV3({ lessons: null, quizzes: null, blooket: null })).toBe(null);
    expect(workAvgV3(null)).toBe(null);
  });

  it('weights sum to 1.0 (sanity)', () => {
    const sum = Object.values(V3_WORK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

// ── computeQuarterV3 — aggregation + gating + ceiling ─────────────────────────


const A2_CONFIG = {
  ...PHASE3_CONFIG, useDistrictFormula: true, useV3: false,
  bonusOnlyThrough: null, dueAfterLessonDay: true,
  quarters: { Q1: { units: [1], start: '2026-09-02', end: '2026-11-06' } },
};
const A2_SCHEDULE = { '1.1': {
  unit: 1, topicKey: '1.1', worksheetKey: '1', tryItCount: 1,
  periods: { C: '2026-09-24', D: '2026-09-25', G: '2026-09-25' },
} };
const A2_ASSESSMENT = { itemId: 'TA-U1', source: 'topic-assessment', dueDate: '2026-09-25' };
const A2_OPTS = { lessonSchedule: A2_SCHEDULE, section: 'PeriodC',
  asOf: '2026-09-28T16:00:00Z', items: [A2_ASSESSMENT] };
const a2Rows = (mastery, check, work, deck = 100) => [
  { item_id: 'TA-U1', source: 'topic-assessment', score: mastery },
  { item_id: 'LC-U1-L1', source: 'lesson-check', score: check },
  { item_id: 'TI-U1-L1-1', source: 'try-it', score: work },
  { item_id: 'BL-U1-L1-DESK_DONE', source: 'flashcard', score: deck },
].filter(row => row.score != null).map(row => ({ ...row, recorded_at: '2026-09-25T16:00:00Z' }));

const v3Config = { ...A2_CONFIG, useDistrictFormula: false, useV3: true };
const v3 = (rows, opts = {}) => computeGrade(rows, {}, v3Config, { ...A2_OPTS, ...opts }).quarters.Q1;

describe('A2 v3 integration — topic assessment and work tracks', () => {
  it.each([
    [100, 10, 2, 100, 100],
    [100, 0, 0, 0, 70],
    [0, 10, 2, 100, 70],
    [40, 10, 2, 100, 100],
    [39, 10, 2, 100, 70],
  ])('mastery %s, check %s, Try-It %s, deck %s gives %s', (mastery, check, work, deck, expected) => {
    const result = v3(a2Rows(mastery, check, work, deck));
    expect(result.formula).toBe('v3');
    expect(result.quarterGrade).toBeCloseTo(expected, 8);
    expect(result.ceiling).toBeGreaterThanOrEqual(result.quarterGrade);
  });

  it('a missing due assessment is zero and caps perfect work at 70', () => {
    const result = v3(a2Rows(null, 10, 2));
    expect(result.masteryAvg).toBe(0);
    expect(result.workAvg).toBeCloseTo(100, 8);
    expect(result.quarterGrade).toBeCloseTo(70, 8);
  });

  it('a future assessment is absent, so only the work track grades', () => {
    const result = v3(a2Rows(null, 8, 1, 0), {
      items: [{ ...A2_ASSESSMENT, dueDate: '2026-10-02' }],
    });
    expect(result.masteryAvg).toBeNull();
    expect(result.workAvg).toBeCloseTo((80 * 3 + 50 * 3) / 7, 8);
    expect(result.quarterGrade).toBe(result.workAvg);
  });

  it('uses the configured work blend of checks, Try-Its, and passed decks', () => {
    const result = v3(a2Rows(0, 8, 1, 100));
    expect(result.workAvg).toBeCloseTo((80 * 3 + 50 * 3 + 100) / 7, 8);
  });

  it('clamps raw feeder scores before combining tracks', () => {
    const high = v3(a2Rows(300, 50, 20, 200));
    expect(high.quarterGrade).toBeCloseTo(100, 8);
    const low = v3(a2Rows(-1, -1, -1, -1));
    expect(low.quarterGrade).toBe(0);
  });

  it('has no grade before any work is due and ignores prior-quarter scores', () => {
    expect(v3([], { asOf: '2026-09-23T16:00:00Z' }).quarterGrade).toBeNull();
    const stale = a2Rows(100, 10, 2).map(row => ({ ...row, recorded_at: '2026-08-01T16:00:00Z' }));
    expect(v3(stale).quarterGrade).toBe(0);
  });

  it('district selection takes precedence and has no v3 floor or cap', () => {
    const result = computeGrade(a2Rows(100, 0, 0, 0), {},
      { ...A2_CONFIG, useV3: true }, A2_OPTS);
    expect(result.formula).toBe('district');
    expect(result.quarters.Q1.quarterGrade).toBeCloseTo(100 / 110 * 100 * 0.5, 8);
  });

  it('the ceiling covers recovery during the quarter and closes with it', () => {
    expect(v3([]).ceiling).toBeCloseTo(100, 8);
    const closed = v3([], { asOf: '2026-11-07T16:00:00Z' });
    expect(closed.ceiling).toBe(closed.quarterGrade);
  });
});
