// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeLessonGrades, computeQuarterV3 } from '../lesson-grade.js';
import { computeGrade } from '../grade.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';

const band = { E: 100, P: 70, I: 35 };
const row = (suffix, score, source = 'frq') => ({ item_id: 'WS-U1L1-' + suffix, source, score });
const lesson = (rows, opts) => computeLessonGrades(rows, band, {}, null, opts).get('1.1');

describe('exit-ticket bonus', () => {
  it.each([[1, 5], [0.75, 5], [0.74, 3], [0.25, 3], [0.24, 1], [0, 1]])(
    'raw %s earns +%s without lowering perfect reflections', (score, bonus) => {
      const result = lesson([row('reflect1', 1), row('exitTicket', score)]);
      expect(result.exitBonus).toBe(bonus);
      expect(result.lessonGrade).toBe(100 + bonus);
      expect(result.lessonGradeNoQuiz).toBe(100 + bonus);
      expect(result.exitCounted).toBe(false);
    });

  it.each([null, undefined, '', 'not a score'])('ungraded exit %s adds zero', score => {
    const result = lesson([row('reflect1', 1), row('exitTicket', score)]);
    expect(result.exitBonus).toBe(0);
    expect(result.lessonGrade).toBe(100);
    expect(result.lessonGradeNoQuiz).toBe(100);
  });

  it('absent exit adds zero', () => {
    const result = lesson([row('reflect1', 0.5)]);
    expect(result.exitBonus).toBe(0);
    expect(result.exitCounted).toBe(false);
    expect(result.lessonGrade).toBe(70);
  });

  it.each([[1, 105], [0.5, 73], [0, 36]])('exit-only raw %s still supplies W plus bonus', (score, grade) => {
    const result = lesson([row('exitTicket', score)]);
    expect(result.W).toBe(grade - result.exitBonus);
    expect(result.lessonGrade).toBe(grade);
    expect(result.lessonGradeNoQuiz).toBe(grade);
    expect(result.exitCounted).toBe(true);
    expect(result.Cws).toBeNull();
  });

  it('keeps the exit in W when it helps and awards the bonus on top', () => {
    const result = lesson([row('reflect1', 0), row('exitTicket', 1)]);
    expect(result.W).toBe(67.5);
    expect(result.exitCounted).toBe(true);
    expect(result.lessonGrade).toBe(72.5);
    expect(result.lessonGradeNoQuiz).toBe(72.5);
  });

  it('falls back to blanks and quiz when the exit is the only FRQ', () => {
    const rows = [row('Q1', 1, 'worksheet'), row('exitTicket', 0),
      { item_id: 'U1-L1-Q1', source: 'curriculum_quiz', response: 'a' }];
    const result = computeLessonGrades(rows, band, { 'U1-L1-Q1': { answerKey: 'a' } }, null,
      { worksheetBlankCounts: { '1.1': 1 } }).get('1.1');
    expect(result.Cws).toBe(100);
    expect(result.Q).toBe(100);
    expect(result.lessonGrade).toBe(101);
    expect(result.lessonGradeNoQuiz).toBe(101);
  });

  it('keeps Cws unchanged and clamps only the lesson to 105 and quarter to 100', () => {
    const rows = [row('Q1', 1, 'worksheet'), row('reflect1', 1), row('exitTicket', 1)];
    const map = computeLessonGrades(rows, band, {}, null, { worksheetBlankCounts: { '1.1': 1 } });
    expect(map.get('1.1').Cws).toBe(100);
    expect(map.get('1.1').lessonGrade).toBe(105);
    const config = { quarters: { Q1: { units: [1], start: '2026-09-02', end: '2026-11-06' } },
      v3LessonsByDate: true,
      v3WorkWeights: { lessons: 1, quizzes: 0, blooket: 0 } };
    const quarter = computeQuarterV3({ quarterKey: 'Q1', config, lessonMap: map,
      schedule: { '1.1': { unit: 1, periods: { C: '2026-09-08' } } },
      todayDateStr: '2026-09-20', section: 'C' });
    expect(quarter.workAvg).toBe(105);
    expect(quarter.quarterGrade).toBe(100);
  });

});

// Synthetic inputs replace the AP whole-grade snapshot. Legacy WS IDs above
// exercise the retained lesson calculator, not the district grading policy.
const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/exit-ticket-without-golden.json', import.meta.url), 'utf8'));

describe.each(['district', 'v3'])('A2 %s exit-ticket isolation', formula => {
  it.each(['C', 'D', 'G'])('ignores legacy exit tickets in section %s', section => {
    const production = resolveProductionGradeInputs('SY2627');
    const config = { ...production.config,
      useDistrictFormula: formula === 'district', useV3: formula === 'v3' };
    const opts = { ...fixture.opts, section, asOf: new Date(fixture.opts.asOf) };

    for (const sample of fixture.cases) {
      const withoutExits = computeGrade(sample.rows, {}, config, opts);
      const withExits = computeGrade([...sample.rows, ...fixture.legacyExitRows], {}, config, opts);
      expect(withoutExits.formula, sample.name).toBe(formula);
      expect(withoutExits.items, sample.name).toHaveLength(4);
      expect(withoutExits.quarters.Q1.lessonsDue, sample.name).toBe(1);
      // Compare the entire response, including denominators, ceilings and items.
      // No filtering before computation: the real A2 adapter must ignore exits.
      expect(withExits, sample.name).toEqual(withoutExits);
      if (formula === 'district') {
        expect(withoutExits.quarters.Q1.quarterGrade, sample.name)
          .toBeCloseTo(sample.districtGrade, 10);
      }
      if (formula === 'v3' && sample.name === 'missing topic assessment') {
        expect(withoutExits.quarters.Q1.masteryAvg).toBe(0);
        expect(withoutExits.quarters.Q1.workAvg).toBe(100);
        expect(withoutExits.quarters.Q1.quarterGrade).toBe(70);
      }
    }
  });
});
