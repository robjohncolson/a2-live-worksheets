// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import {
  buildGradebookColumns, buildGradebookRow, buildGradebook,
  schoologyWeightedTotal, reconcileQuarter, SCHOOLOGY_CATEGORY_WEIGHTS,
} from '../gradebook-grid.js';

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

describe('A2 gradebook identity, categories, and totals', () => {
  const grade = computeGrade(a2Rows(80, 10, 1, 100), {}, A2_CONFIG, A2_OPTS);
  const grid = buildGradebook(grade);
  const q1 = grid.quarters.Q1;

  it('keeps all four feeder IDs and their raw point scales', () => {
    expect(q1.columns.map(column => column.key).sort()).toEqual(
      ['LC-U1-L1', 'TI-U1-L1-1', 'BL-U1-L1-DESK_DONE', 'TA-U1'].sort());
    const columns = Object.fromEntries(q1.columns.map(column => [column.key, column]));
    expect(columns['LC-U1-L1']).toMatchObject({ category: 'Assessments', maxPoints: 10, topicKeys: ['1.1'] });
    expect(columns['TA-U1']).toMatchObject({ category: 'Assessments', maxPoints: 100 });
    expect(columns['TI-U1-L1-1']).toMatchObject({ category: 'Assignments', maxPoints: 2 });
    expect(columns['BL-U1-L1-DESK_DONE']).toMatchObject({ category: 'Engagement', maxPoints: 1 });
    expect(q1.cells).toEqual({ 'LC-U1-L1': 10, 'TI-U1-L1-1': 1, 'BL-U1-L1-DESK_DONE': 1, 'TA-U1': 80 });
  });

  it('keeps district weights and category-weighted totals', () => {
    expect(SCHOOLOGY_CATEGORY_WEIGHTS).toEqual({ Assessments: 50, Assignments: 40, Engagement: 10 });
    expect(grid.weights).toEqual(SCHOOLOGY_CATEGORY_WEIGHTS);
    expect(q1.categoryAverages).toMatchObject({ Assignments: 50, Engagement: 100 });
    expect(q1.categoryAverages.Assessments).toBeCloseTo(90 / 110 * 100, 8);
    expect(q1.schoologyTotal).toBeCloseTo(90 / 110 * 50 + 30, 8);
    expect(q1.quarterGrade).toBeCloseTo(q1.schoologyTotal, 8);
    expect(q1.reconciliation.delta).toBeCloseTo(0, 8);
  });

  it('standalone column and row helpers preserve the same cells and totals', () => {
    const columns = buildGradebookColumns(grade, 'Q1');
    const row = buildGradebookRow(grade, columns);
    expect(columns).toEqual(q1.columns);
    expect(row.cells).toEqual(q1.cells);
    expect(row.schoologyTotal).toBe(q1.schoologyTotal);
  });

  it.each(['C', 'D', 'G'])('uses %s lesson-day boundaries and late missing work', section => {
    const date = A2_SCHEDULE['1.1'].periods[section];
    const onDay = computeGrade([], {}, A2_CONFIG, {
      ...A2_OPTS, section, items: [], asOf: date + 'T16:00:00Z',
    });
    expect(buildGradebook(onDay).quarters.Q1.columns.every(column => !column.due)).toBe(true);
    const overdue = computeGrade([], {}, A2_CONFIG, { ...A2_OPTS, section, items: [] });
    const quarter = buildGradebook(overdue).quarters.Q1;
    expect(quarter.columns.every(column => column.due)).toBe(true);
    expect(Object.values(quarter.cells).every(value => value === null)).toBe(true);
    expect(quarter.quarterGrade).toBe(0);
    expect(quarter.schoologyTotal).toBeNull();
  });

  it('late submitted work keeps its identity and closes the missing-work gap', () => {
    const rows = a2Rows(null, 10, null, null);
    const missing = buildGradebook(computeGrade(rows, {}, A2_CONFIG, A2_OPTS)).quarters.Q1;
    expect(missing.schoologyTotal).toBe(100);
    expect(missing.quarterGrade).toBeLessThan(missing.schoologyTotal);
    const lateRows = a2Rows(100, 10, 2, 100).map(row => ({ ...row, recorded_at: '2026-10-01T16:00:00Z' }));
    const late = buildGradebook(computeGrade(lateRows, {}, A2_CONFIG,
      { ...A2_OPTS, asOf: '2026-10-02T16:00:00Z' })).quarters.Q1;
    expect(late.columns.map(column => column.key)).toEqual(missing.columns.map(column => column.key));
    expect(late.quarterGrade).toBeCloseTo(100, 8);
    expect(late.reconciliation.delta).toBeCloseTo(0, 8);
  });

  it('deduplicates a shared deck within the quarter', () => {
    const schedule = { ...A2_SCHEDULE,
      '1.2': { ...A2_SCHEDULE['1.1'], worksheetKey: '1' },
    };
    const result = buildGradebook(computeGrade([], {}, A2_CONFIG, { ...A2_OPTS, lessonSchedule: schedule }));
    expect(result.quarters.Q1.columns.filter(column => column.key === 'BL-U1-L1-DESK_DONE')).toHaveLength(1);
  });
});

describe('schoologyWeightedTotal', () => {
  it('renormalizes only over present district categories', () => {
    expect(schoologyWeightedTotal({ Assessments: 80, Assignments: 100 }, SCHOOLOGY_CATEGORY_WEIGHTS))
      .toBeCloseTo(80 / 0.9, 1);
  });
  it('returns null without category evidence', () => {
    expect(schoologyWeightedTotal({}, SCHOOLOGY_CATEGORY_WEIGHTS)).toBeNull();
  });
});
describe('reconcileQuarter — explains the Schoology vs v3 gap', () => {
  it('max branch: both tracks >= 40 -> v3 takes the higher, Schoology averages', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: 90, workAvg: 70 } } }, 'Q1', 78.3, 90);
    expect(r.branch).toBe('max');
    expect(r.delta).toBeCloseTo(11.7, 1); // 90 - 79.3
    expect(r.reason).toMatch(/higher/);
  });

  it('ceiling branch: a track below 40 -> v3 caps', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: 100, workAvg: 20 } } }, 'Q1', 60, 70);
    expect(r.branch).toBe('ceiling');
    expect(r.reason).toMatch(/40 floor/);
  });

  it('work-only branch: mastery null -> v3 = Work', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: null, workAvg: 70 } } }, 'Q1', 70, 70);
    expect(r.branch).toBe('work-only');
    expect(r.delta).toBe(0);
  });

  it('none branch: no tracks AND no grade', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: null, workAvg: null } } }, 'Q1', null, null);
    expect(r.branch).toBe('none');
    expect(r.delta).toBe(null);
  });

  it('non-v3 branch: a grade exists but no track breakdown (Phase-6 / v3-off)', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: null, workAvg: null } } }, 'Q1', 80, 75);
    expect(r.branch).toBe('non-v3'); // NOT 'none' — would self-contradict the shown grade
    expect(r.reason).toMatch(/unavailable/);
    expect(r.delta).toBeCloseTo(-5, 1);
  });

  it('boundary: branches on the UNROUNDED fractions, not the rounded 40.0', () => {
    // Unrounded pcAvg 0.3996 rounds to exactly 40.0, but the engine used the
    // ceiling path (0.3996 < 0.40). The reason must match the engine, not say 'max'.
    const r = reconcileQuarter(
      { quarters: { Q1: { pcAvg: 40.0, workAvg: 80, pcAvgRaw: 0.3996, workAvgRaw: 0.80 } } },
      'Q1', 82, 60);
    expect(r.branch).toBe('ceiling'); // would have been 'max' on the rounded value
    expect(r.reason).toMatch(/40 floor/);
    expect(r.reason).not.toMatch(/takes the higher/);
  });

  it('ceiling tie: lists every cap source that achieved the max', () => {
    // pc 0.90, work 0.36 -> a=0.63, m=0.63 (tie between 70% of mastery and the mean).
    const r = reconcileQuarter(
      { quarters: { Q1: { pcAvg: 90, workAvg: 36, pcAvgRaw: 0.90, workAvgRaw: 0.36 } } },
      'Q1', 70, 63);
    expect(r.branch).toBe('ceiling');
    expect(r.reason).toContain('the mean of the two tracks');
  });
});

