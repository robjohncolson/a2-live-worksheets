// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deriveQuarterBands, quarterOfLesson, computeQuarterFromLessons } from '../lesson-grade.js';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

// Synthetic A2 topics: placement follows section dates, not an AP unit map.
const config = { quarters: {
  Q1: { units: [1, 2], start: '2026-09-02', end: '2026-11-06' },
  Q2: { units: [3], start: '2026-11-09', end: '2027-01-22' },
  Q3: { units: [4], start: '2027-01-25', end: '2027-04-14' },
  Q4: { units: [5], start: '2027-04-15', end: '2027-06-17' },
} };
const configured = { Q1: [1, 2], Q2: [3], Q3: [4], Q4: [5] };

describe('A2 quarter bands', () => {
  it('falls back to explicit configured bands without a schedule', () => {
    expect(deriveQuarterBands(config, null, 'C')).toEqual(configured);
    expect(deriveQuarterBands(config, {}, 'D')).toEqual(configured);
  });

  it.each(['C', 'D', 'G'])('uses the majority of lessons for %s, with unique sorted placement', period => {
    const schedule = {
      '3.1': { unit: 3, periods: { [period]: '2026-10-01' } },
      '3.2': { unit: 3, periods: { [period]: '2026-10-02' } },
      '3.3': { unit: 3, periods: { [period]: '2026-11-12' } },
      '1.1': { unit: 1, periods: { [period]: '2027-05-03' } },
    };
    const bands = deriveQuarterBands(config, schedule, period);
    expect(bands).toEqual({ Q1: [2, 3], Q2: [], Q3: [4], Q4: [1, 5] });
    expect(Object.values(bands).flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('breaks ties in favor of the earlier quarter', () => {
    const schedule = {
      '4.1': { unit: 4, periods: { C: '2026-11-05' } },
      '4.2': { unit: 4, periods: { C: '2026-11-12' } },
    };
    expect(deriveQuarterBands(config, schedule, 'C').Q1).toContain(4);
  });

  it('does not borrow another section date when the requested section is unscheduled', () => {
    const schedule = { '1.1': { unit: 1, periods: { C: null, D: '2027-02-01', G: '2027-05-04' } } };
    expect(deriveQuarterBands(config, schedule, 'C').Q1).toContain(1);
    expect(deriveQuarterBands(config, schedule, 'D').Q3).toContain(1);
    expect(deriveQuarterBands(config, schedule, 'G').Q4).toContain(1);
  });

  it('unknown section falls back to an available A2 section date', () => {
    const schedule = { '1.1': { unit: 1, periods: { C: null, D: '2027-02-01' } } };
    expect(deriveQuarterBands(config, schedule, null).Q3).toContain(1);
  });

  it('computeGrade and quarterOfLesson agree for an unknown section with a D-only date', () => {
    const entry = { unit: 1, periods: { D: '2027-02-01' } };
    const schedule = { '1.1': entry };
    const cfg = { ...PHASE3_CONFIG, ...config, useDistrictFormula: false,
      useV3: true, v3LessonsByDate: true, a2Items: [], gradingWindowStart: '2026-09-02' };
    const grade = computeGrade([], {}, cfg, {
      lessonSchedule: schedule, section: 'unknown', asOf: new Date('2027-02-02T17:00:00Z'),
    });
    const quarter = quarterOfLesson(entry, null, cfg);
    expect(quarter).toBe('Q3');
    expect(grade.quarters[quarter].units).toContain(1);
    expect(grade.quarters[quarter].lessonsTotal).toBe(1);
    expect(grade.quarters[quarter].lessonsDue).toBe(1);
    expect(grade.quarters.Q1.units).not.toContain(1);
    expect(grade.quarters.Q1.lessonsTotal).toBe(0);
    expect(computeQuarterFromLessons({ quarterKey: quarter, config: cfg,
      lessonMap: new Map(), schedule, section: 'unknown', todayDateStr: '2027-02-02',
      gradingWindowStart: cfg.gradingWindowStart }).lessonsDue).toBe(1);
  });

  it.each([
    [{ C: '2026-10-01', D: '2027-02-01', B: '2027-05-03' }, 'Q1'],
    [{ D: '2027-02-01', G: '2027-05-03', B: '2026-10-01' }, 'Q3'],
    [{ G: '2027-05-03', B: '2026-10-01' }, 'Q4'],
    [{ B: '2026-11-12', E: '2027-02-01' }, 'Q2'],
    [{ E: '2027-02-01' }, 'Q3'],
  ])('uses C/D/G/B/E fallback precedence for %j', (periods, quarter) => {
    const entry = { unit: 1, periods };
    expect(quarterOfLesson(entry, null, config)).toBe(quarter);
    expect(deriveQuarterBands(config, { '1.1': entry }, null)[quarter]).toContain(1);
  });

  it('ignores dates before the active grading window even inside a configured quarter', () => {
    const schedule = { '4.1': { unit: 4, periods: { C: '2026-09-03', D: '2026-09-04', G: '2026-09-04' } } };
    expect(deriveQuarterBands(config, schedule, 'C', '2026-09-20').Q3).toContain(4);
  });

  it('an early-release Wednesday remains a dated D/G meeting', () => {
    const schedule = { '3.1': { unit: 3, periods: { C: null, D: '2026-09-16', G: '2026-09-16' }, earlyRelease: true } };
    expect(deriveQuarterBands(config, schedule, 'D').Q1).toContain(3);
    expect(deriveQuarterBands(config, schedule, 'G').Q1).toContain(3);
  });
});
