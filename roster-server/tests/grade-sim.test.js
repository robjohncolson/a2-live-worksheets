// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

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

// All trajectories use current A2 ledger sources; no shared AP simulation world.
const scoreArb = fc.tuple(
  fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  fc.option(fc.integer({ min: 0, max: 10 }), { nil: null }),
  fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
  fc.constantFrom(null, 0, 79, 80, 100),
);
const configurations = [
  ['district', A2_CONFIG],
  ['v3', { ...A2_CONFIG, useDistrictFormula: false, useV3: true }],
];

describe.each(configurations)('A2 %s trajectories', (_formula, config) => {
  const gradeOf = scores => {
    const rows = a2Rows(...scores).map(row => _formula === 'district' && row.source === 'try-it'
      ? { ...row, score: row.score * 5, response: { attempted: true } } : row);
    return computeGrade(rows, {}, config, A2_OPTS).quarters.Q1;
  };

  it('keeps grades bounded and below their ceiling', () => {
    fc.assert(fc.property(scoreArb, scores => {
      const quarter = gradeOf(scores);
      if (quarter.quarterGrade === null) { expect(quarter.ceiling).toBeNull(); return; }
      expect(quarter.quarterGrade).toBeGreaterThanOrEqual(0);
      expect(quarter.quarterGrade).toBeLessThanOrEqual(100 + 1e-8);
      expect(quarter.ceiling + 1e-8).toBeGreaterThanOrEqual(quarter.quarterGrade);
      expect(quarter.ceiling).toBeLessThanOrEqual(100 + 1e-8);
    }), { numRuns: 600 });
  });

  it('raising a present score never lowers the grade', () => {
    fc.assert(fc.property(scoreArb, fc.integer({ min: 0, max: 3 }), (scores, pick) => {
      if (scores[pick] == null || gradeOf(scores).quarterGrade === null) return;
      const improved = [...scores];
      improved[pick] = [100, 10, 2, 100][pick];
      expect(gradeOf(improved).quarterGrade + 1e-8).toBeGreaterThanOrEqual(gradeOf(scores).quarterGrade);
    }), { numRuns: 600 });
  });

  it('perfect on-pace work reaches 100 and empty due work is zero', () => {
    expect(gradeOf([100, 10, 2, 100]).quarterGrade).toBeCloseTo(100, 8);
    expect(gradeOf([null, null, null, null]).quarterGrade).toBe(_formula === 'district' ? null : 0);
  });

  it('counts scored district work immediately and preserves v3 scheduling', () => {
    const opts = { ...A2_OPTS, lessonSchedule: { ...A2_SCHEDULE,
      '1.2': { unit: 1, worksheetKey: '2', tryItCount: 1, periods: { C: '2026-10-01' } },
    } };
    const rows = a2Rows(100, 10, 2);
    const before = computeGrade(rows, {}, config, opts).quarters.Q1.quarterGrade;
    const after = computeGrade([...rows,
      { item_id: 'TI-U1-L2-1', source: 'try-it', score: 0.4, recorded_at: '2026-09-28T16:00:00Z' },
    ], {}, config, opts).quarters.Q1.quarterGrade;
    if (_formula === 'district') expect(after).toBeLessThan(before);
    else expect(after).toBeCloseTo(before, 8);
  });
});

describe('A2 v3 single-track archetypes', () => {
  const config = configurations[1][1];
  it.each([
    ['assessment only', [100, 0, 0, 0], 70],
    ['work only', [0, 10, 2, 100], 70],
    ['mastery below floor', [39, 10, 2, 100], 70],
    ['mastery at floor', [40, 10, 2, 100], 100],
  ])('%s gives %s', (_name, scores, expected) => {
    expect(computeGrade(a2Rows(...scores), {}, config, A2_OPTS).quarters.Q1.quarterGrade).toBeCloseTo(expected, 8);
  });
});
