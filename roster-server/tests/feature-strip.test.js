import { describe, expect, it } from 'vitest';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { combineV3, quarterGradeV3 } from '../lesson-grade.js';

describe('Algebra 2 feature strip', () => {
  it('retains the two-track gates and single-track fallback', () => {
    expect(quarterGradeV3(0.9, 0.6)).toBe(0.9);
    expect(quarterGradeV3(1, 0)).toBe(0.7);
    expect(combineV3(null, 0.8)).toBe(0.8);
    expect(combineV3(null, null)).toBeNull();
  });

  it.each([false, true])('ignores retired source rows with useV3=%s', useV3 => {
    const config = { ...PHASE3_CONFIG, useV3 };
    const options = { asOf: '2026-10-01T12:00:00Z', lessonSchedule: {} };
    const retired = [
      { source: 'pc', item_id: 'U1-PC-Q1', score: 1, response: 'A' },
      { source: 'trainer', item_id: 'TI84-histogram', score: 1 },
    ];
    expect(computeGrade(retired, {}, config, options)).toEqual(computeGrade([], {}, config, options));
  });

  it('keeps the school-year dates and excludes retired config tracks', () => {
    expect(Object.values(PHASE3_CONFIG.quarters).map(q => [q.start, q.end])).toEqual([
      ['2026-09-02', '2026-11-06'], ['2026-11-09', '2027-01-22'],
      ['2027-01-25', '2027-04-14'], ['2027-04-15', '2027-06-17'],
    ]);
    expect(PHASE3_CONFIG).not.toHaveProperty('trainer');
    expect(PHASE3_CONFIG).not.toHaveProperty('pcTrack');
    expect(PHASE3_CONFIG.v3WorkWeights).not.toHaveProperty('posters');
  });
});
