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
    const config = { quarters: { Q1: { units: [1], start: '2026-09-01', end: '2026-12-31' } },
      v3WorkWeights: { lessons: 1, quizzes: 0, posters: 0, blooket: 0 }, pcTrack: { enabled: false } };
    const quarter = computeQuarterV3({ quarterKey: 'Q1', config, lessonMap: map,
      schedule: { '1.1': { unit: 1, periods: { B: '2026-09-09' } } },
      todayDateStr: '2026-09-20', section: 'B', unitPcData: {} });
    expect(quarter.workAvg).toBe(105);
    expect(quarter.quarterGrade).toBe(100);
  });

  
});
