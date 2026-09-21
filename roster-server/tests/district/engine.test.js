import { describe, expect, it } from 'vitest';
import { computeDistrictGrade, districtGradebook } from '../../district-ledger.js';
import { PHASE3_CONFIG } from '../../grade-config.js';

const config = { ...PHASE3_CONFIG, useDistrictFormula: true };
const item = (itemId, source, more = {}) => ({ itemId, source, dueDate: '2026-09-22',
  assignedDates: { C: '2026-09-22' }, ...more });
const row = (item_id, source, score, more = {}) => ({ item_id, source, score,
  recorded_at: '2026-09-22', ...more });
const grade = (rows, items, today = '2026-09-29', cfg = config, section = 'C') =>
  computeDistrictGrade(rows, cfg, { items, section }, today);

describe('R1 district engine contract', () => {
  it('does not turn planned work into items for any section', () => {
    const items = [item('TI', 'try-it', { assignedDates: undefined })];
    expect(grade([], items).items).toEqual([]);
    expect(grade([], [item('TI', 'try-it')], undefined, config, 'D').items).toEqual([]);
  });

  it('starts a missing Try-It at assignment + seven calendar days and replaces it on attempt', () => {
    const items = [item('TI', 'try-it')];
    expect(grade([], items, '2026-09-28').quarters.Q1.quarterGrade).toBeNull();
    const missing = grade([], items);
    expect(missing.items[0]).toMatchObject({ provisional: true, points: 0, maxPoints: 10 });
    expect(missing.quarters.Q1.quarterGrade).toBe(0);
    expect(districtGradebook(missing).quarters.Q1.cells.TI).toBe(0);
    const recovered = grade([row('TI', 'try-it', 8, { recorded_at: '2026-12-01' })], items, '2026-12-01');
    expect(recovered.items[0]).toMatchObject({ provisional: false, points: 8, quarter: 'Q1' });
    expect(recovered.quarters.Q1.quarterGrade).toBe(80);
  });

  it('a recorded non-attempt waits seven days too; a real attempted zero can be explicit', () => {
    const items = [item('TI', 'try-it')];
    expect(grade([row('TI', 'try-it', 0)], items, '2026-09-28').quarters.Q1.quarterGrade).toBeNull();
    expect(grade([row('TI', 'try-it', 0)], items).items[0].provisional).toBe(true);
    expect(grade([row('TI', 'try-it', 0, { response: { attempted: true } })], items).items[0].provisional).toBe(false);
  });

  it('an in-place rescore does not move assignment dates, reset grace, or change quarters', () => {
    const original = row('TI', 'try-it', 0);
    const resaved = { ...original, updated_at: '2026-09-29' };
    expect(grade([resaved], [])).toEqual(grade([original], []));
    expect(grade([resaved], []).items[0]).toMatchObject({ assignedDate: '2026-09-22', provisional: true });
  });

  it('uses latest scores, stable IDs, and configured points for all current sources', () => {
    const items = [item('TI', 'try-it'), item('Q', 'quiz'), item('TA', 'topic-assessment'), item('DE', 'daily-engagement')];
    const rows = [row('TI', 'try-it', 10), row('TI', 'try-it', 8, { updated_at: '2026-09-24' }),
      row('Q', 'quiz', 20), row('Q', 'quiz', 16, { attempt: 2 }),
      row('TA', 'topic-assessment', 80), row('DE', 'daily-engagement', 8)];
    const result = grade(rows, items);
    expect(result.quarters.Q1.quarterGrade).toBe(80);
    expect(result.items.map(x => x.maxPoints)).toEqual([10, 20, 100, 10]);
    expect(grade([...rows, ...rows].reverse(), [...items, ...items])).toEqual(result);
    const custom = { ...config, a2Feeders: { ...config.a2Feeders, quiz: { category: 'assessments', maxPoints: 40 } } };
    expect(grade([row('Q', 'quiz', 20)], [item('Q', 'quiz')], undefined, custom).quarters.Q1.quarterGrade).toBe(50);
  });

  it('counts only imported Engagement days and removes retired sources', () => {
    const items = [item('DE', 'daily-engagement'), item('LC', 'lesson-check'), item('BL', 'flashcard')];
    expect(grade([row('LC', 'lesson-check', 10), row('BL', 'flashcard', 100)], items).items).toEqual([]);
    const result = grade([row('DE', 'daily-engagement', 0)], items);
    expect(result.items).toHaveLength(1);
    expect(result.quarters.Q1.categoryBreakdown.engagement).toMatchObject({ earned: 0, possible: 10, count: 1 });
  });

  it('sums Bonus earned only, caps by quarter, and does not meet assignment minima with bonus', () => {
    const items = [item('TI', 'try-it'), item('B1', 'bonus'), item('B2', 'bonus'),
      item('TI2', 'try-it', { dueDate: '2026-11-10', assignedDates: { C: '2026-11-10' } }),
      item('B3', 'bonus', { dueDate: '2026-11-10', assignedDates: { C: '2026-11-10' } })];
    const rows = [row('TI', 'try-it', 8), row('B1', 'bonus', 7), row('B2', 'bonus', 8),
      row('TI2', 'try-it', 8), row('B3', 'bonus', 4)];
    const result = grade(rows, items, '2026-11-11');
    expect(result.quarters.Q1.categoryBreakdown.assignments).toMatchObject({ earned: 18, possible: 10, count: 1, score: 180 });
    expect(result.quarters.Q2.categoryBreakdown.assignments).toMatchObject({ earned: 12, possible: 10, count: 1, score: 120 });
    expect(districtGradebook(result).quarters.Q1.schoologyTotal).toBe(180);
    expect(grade([row('B1', 'bonus', 7)], [item('B1', 'bonus')]).quarters.Q1.quarterGrade).toBeNull();
  });

  it('work through September 18 can only add capped Bonus and never a denominator', () => {
    const items = [item('TI', 'try-it'), item('OLD', 'try-it', { dueDate: '2026-09-18' })];
    const result = grade([row('TI', 'try-it', 8), row('OLD', 'try-it', 2)], items);
    expect(result.quarters.Q1.categoryBreakdown.assignments).toMatchObject({ earned: 10, possible: 10, count: 1 });
    expect(grade([], [items[1]]).quarters.Q1.quarterGrade).toBeNull();
  });
});
