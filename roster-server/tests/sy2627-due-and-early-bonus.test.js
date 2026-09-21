// Synthetic A2 schedules: retained early-completion helpers and production formula boundaries.
import { describe, it, expect } from 'vitest';
import {
  computeQuarterV3,
  isDateDue,
  endOfDayEpochInTz,
  lessonCompletedAt,
  worksheetCoverageReachedAt,
} from '../lesson-grade.js';
import { buildGradebookRow, buildGradebook } from '../gradebook-grid.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { computeGrade } from '../grade.js';

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  useDistrictFormula: false,
  v3LessonsByDate: true,
  v3AheadOfScheduleLessons: 'not-until-due', // production setting
  dueAfterLessonDay: true,
  v3EarlyBonus: { perLesson: 1, cap: 5, minComplete: 0.8 },
  schoolTz: 'America/New_York',
  quarters: {
    Q1: { units: [1], start: '2026-09-02', end: '2026-11-06' },
    Q2: { units: [2], start: '2026-11-09', end: '2027-01-22' },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}
// A 5-blank worksheet with every blank stamped at `ts` (fully done at ts).
function lesson(value, ts, opts = {}) {
  const blanks = opts.blankCount !== undefined ? opts.blankCount : 5;
  const stamps = Array.isArray(opts.stamps) ? opts.stamps : (ts ? Array(blanks).fill(ts) : []);
  return {
    Cws: value, W: null, Q: null, lessonGrade: value,
    blankCount: blanks,
    worksheetItems: stamps.map((t, i) => ({ itemId: 'b' + i, score: 1, ts: t })),
    frqItems: [],
  };
}
function q1(lessonMap, schedule, todayDateStr, config = CFG, section = 'PeriodC') {
  return computeQuarterV3({
    quarterKey: 'Q1', config, lessonMap, schedule, todayDateStr,
    section,
    quizLessons: [], blooketLessons: [], // isolate the Lessons track
  });
}

describe('isDateDue — due after the lesson day ends (11:59 PM)', () => {
  it('with dueAfterLessonDay the lesson date itself is NOT yet due; the next day is', () => {
    expect(isDateDue('2026-09-08', '2026-09-08', CFG)).toBe(false);
    expect(isDateDue('2026-09-08', '2026-09-09', CFG)).toBe(true);
  });
  it('without the flag (compatibility) the lesson date is due from the start of the day', () => {
    expect(isDateDue('2026-09-08', '2026-09-08', {})).toBe(true);
    expect(isDateDue('2026-09-08', '2026-09-07', {})).toBe(false);
  });
  it('null / missing dates are never due', () => {
    expect(isDateDue(null, '2026-09-09', CFG)).toBe(false);
    expect(isDateDue('2026-09-08', null, CFG)).toBe(false);
  });
  it('the live config sets dueAfterLessonDay', () => {
    expect(PHASE3_CONFIG.dueAfterLessonDay).toBe(true);
  });
});

describe('endOfDayEpochInTz — the 11:59 PM deadline instant', () => {
  it('Sept 9 2026 23:59:59 in New York is 03:59:59Z on Sept 10 (EDT)', () => {
    expect(new Date(endOfDayEpochInTz('2026-09-09', 'America/New_York')).toISOString())
      .toBe('2026-09-10T03:59:59.000Z');
  });
  it('Jan 12 2027 23:59:59 in New York is 04:59:59Z on Jan 13 (EST)', () => {
    expect(new Date(endOfDayEpochInTz('2027-01-12', 'America/New_York')).toISOString())
      .toBe('2027-01-13T04:59:59.000Z');
  });
});

describe('lessonCompletedAt — the LAST worksheet/FRQ submission stamp', () => {
  it('returns the latest ts across worksheet + FRQ items', () => {
    const r = {
      worksheetItems: [{ ts: '2026-09-07T10:00:00Z' }, { ts: '2026-09-08T10:00:00Z' }],
      frqItems: [{ ts: '2026-09-08T12:00:00Z' }],
    };
    expect(new Date(lessonCompletedAt(r)).toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });
  it('null when nothing is stamped', () => {
    expect(lessonCompletedAt({ worksheetItems: [], frqItems: [] })).toBe(null);
    expect(lessonCompletedAt(null)).toBe(null);
  });
});

describe('worksheetCoverageReachedAt — the instant 80% of the blanks were in', () => {
  it('is the k-th earliest stamp, k = ceil(0.8 × blankCount)', () => {
    const r = lesson(80, null, { stamps: ['2026-09-08T10:00:00Z', '2026-09-08T11:00:00Z', '2026-09-08T12:00:00Z', '2026-09-08T13:00:00Z', '2026-09-20T12:00:00Z'] });
    expect(new Date(worksheetCoverageReachedAt(r, 0.8)).toISOString()).toBe('2026-09-08T13:00:00.000Z');
  });
  it('one answered blank of five is not coverage', () => {
    expect(worksheetCoverageReachedAt(lesson(0, null, { stamps: ['2026-09-08T10:00:00Z'] }), 0.8)).toBe(null);
  });
  it('unknown blankCount → every stamped row must be in', () => {
    const r = lesson(80, null, { blankCount: null, stamps: ['2026-09-08T10:00:00Z', '2026-09-09T10:00:00Z'] });
    expect(new Date(worksheetCoverageReachedAt(r, 0.8)).toISOString()).toBe('2026-09-09T10:00:00.000Z');
  });
  it('accepts numeric stamps and ignores FRQ rows', () => {
    const r = { blankCount: 1, worksheetItems: [{ ts: 1000 }], frqItems: [{ ts: '2099-01-01T00:00:00Z' }] };
    expect(worksheetCoverageReachedAt(r, 0.8)).toBe(1000);
  });
});

describe('computeQuarterV3 — due-after-day + early bonus', () => {
  const schedule = {
    '1.1': { unit: 1, periods: { C: '2026-09-08', D: '2026-09-09', G: '2026-09-09' } },
    '1.2': { unit: 1, periods: { C: '2026-09-10', D: '2026-09-11', G: '2026-09-10' } },
  };

  it('on the lesson day a missing worksheet is NOT a zero yet (nothing due → grade null)', () => {
    const r = q1(new Map(), schedule, '2026-09-08');
    expect(r.lessonsDue).toBe(0);
    expect(r.quarterGrade).toBe(null);
  });

  it('the day after, the missing worksheet counts as 0', () => {
    const r = q1(new Map(), schedule, '2026-09-09');
    expect(r.lessonsDue).toBe(1);
    expect(r.quarterGrade).toBe(0);
  });

  it('finished by 11:59 PM on the due day → +1 early bonus once due', () => {
    const lessonMap = lessonMapOf({ '1.1': lesson(80, '2026-09-09T03:00:00Z') }); // 11 PM EDT Sept 8
    const r = q1(lessonMap, schedule, '2026-09-09');
    expect(r.quarterGradeBase).toBe(80);
    expect(r.earlyLessons).toBe(1);
    expect(r.earlyKeys).toEqual(['1.1']);
    expect(r.earlyBonus).toBe(1);
    expect(r.quarterGrade).toBe(81);
    expect(r.ceiling).toBeGreaterThanOrEqual(81); // ceiling carries the earned bonus too
  });

  it('submitted after 11:59 PM on the due day → no bonus', () => {
    const lessonMap = lessonMapOf({ '1.1': lesson(80, '2026-09-09T04:30:00Z') }); // 12:30 AM EDT Sept 9
    const r = q1(lessonMap, schedule, '2026-09-09');
    expect(r.earlyLessons).toBe(0);
    expect(r.earlyBonus).toBe(0);
    expect(r.quarterGrade).toBe(80);
  });

  it('work on a lesson that is not yet due counts as "ahead", earns nothing yet, and does not move the grade', () => {
    const lessonMap = lessonMapOf({
      '1.1': lesson(80, '2026-09-08T20:00:00Z'),
      '1.2': lesson(40, '2026-09-08T21:00:00Z'), // early AND weak — must not drag
    });
    const r = q1(lessonMap, schedule, '2026-09-09');
    expect(r.aheadLessons).toBe(1);
    expect(r.aheadKeys).toEqual(['1.2']);
    expect(r.earlyLessons).toBe(1);
    expect(r.quarterGradeBase).toBe(80);
    expect(r.quarterGrade).toBe(81);
  });

  it('EXPLOIT CLOSED: one wrong character in one blank on the due day earns nothing', () => {
    const lessonMap = lessonMapOf({ '1.1': lesson(0, null, { stamps: ['2026-09-08T20:00:00Z'] }) });
    const r = q1(lessonMap, schedule, '2026-09-09');
    expect(r.earlyLessons).toBe(0);
    expect(r.quarterGrade).toBe(0);
  });

  it('a later edit or regrade of ONE row after the deadline does not revoke the bonus', () => {
    const early = '2026-09-08T20:00:00Z';
    const lessonMap = lessonMapOf({
      '1.1': lesson(90, null, { stamps: [early, early, early, early, '2026-09-20T12:00:00Z'] }),
    });
    const r = q1(lessonMap, schedule, '2026-09-21'); // 1.2 is also due by now and missing → base 45
    expect(r.earlyLessons).toBe(1);
    expect(r.quarterGradeBase).toBe(45);
    expect(r.quarterGrade).toBe(46);
  });

  it('a combined worksheet (4.1-2) earns ONE bonus, judged at the later topic date', () => {
    const sched = {
      '4.1': { unit: 4, worksheetKey: '1-2', combinedWith: ['4.2'], periods: { C: '2026-09-08', D: '2026-09-09', G: '2026-09-09' } },
      '4.2': { unit: 4, worksheetKey: '1-2', combinedWith: ['4.1'], periods: { C: '2026-09-10', D: '2026-09-11', G: '2026-09-10' } },
    };
    const cfg = { ...CFG, quarters: { Q1: { units: [4], start: '2026-09-02', end: '2026-11-06' } } };
    const done = lesson(100, '2026-09-10T20:00:00Z'); // 4 PM EDT Sept 10 — after 4.1's day, on 4.2's day
    const lessonMap = lessonMapOf({ '4.1': done, '4.2': done });
    const r = q1(lessonMap, sched, '2026-09-11', cfg);
    expect(r.earlyLessons).toBe(1);
    expect(r.earlyKeys).toEqual(['4.1']);
    expect(r.earlyBonus).toBe(1);
  });

  it('cap 0 switches the bonus off', () => {
    const cfg = { ...CFG, v3EarlyBonus: { perLesson: 1, cap: 0 } };
    const lessonMap = lessonMapOf({ '1.1': lesson(80, '2026-09-08T20:00:00Z') });
    const r = q1(lessonMap, schedule, '2026-09-09', cfg);
    expect(r.earlyBonus).toBe(0);
    expect(r.quarterGrade).toBe(80);
  });

  it('the bonus is capped per quarter and the grade never exceeds 100', () => {
    const sched = {};
    const map = {};
    for (let i = 1; i <= 7; i++) {
      const d = ['2026-09-08', '2026-09-10', '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-21', '2026-09-22'][i - 1];
      sched[`1.${i}`] = { unit: 1, periods: { C: d, D: d, G: d } };
      map[`1.${i}`] = lesson(100, `${d}T12:00:00Z`);
    }
    const r = q1(lessonMapOf(map), sched, '2026-09-30');
    expect(r.earlyLessons).toBe(7);
    expect(r.earlyBonus).toBe(5);
    expect(r.quarterGrade).toBe(100);
  });

  it('WITHOUT v3EarlyBonus / dueAfterLessonDay (compatibility config) nothing changes', () => {
    const frozen = { ...CFG };
    delete frozen.v3EarlyBonus;
    delete frozen.dueAfterLessonDay;
    const lessonMap = lessonMapOf({ '1.1': lesson(80, '2026-09-08T03:00:00Z') });
    const r = q1(lessonMap, schedule, '2026-09-08', frozen);
    expect(r.lessonsDue).toBe(1); // due from the start of the lesson day
    expect(r.earlyBonus).toBe(0);
    expect(r.quarterGrade).toBe(80);
  });
});

describe('buildGradebookRow — "Schoology today" counts only DUE + COMPLETED cells', () => {
  const columns = [
    { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', topicKeys: ['1.1'], due: true },
    { key: 'FA:1.2', kind: 'followalong', category: 'Lesson', topicKeys: ['1.2'], due: false },
    { key: 'BL:1.1', kind: 'blooket', category: 'Blooket', topicKeys: ['1.1'], due: true },
  ];
  const gradeObj = {
    lessons: [
      { lessonKey: '1.1', lessonGradeNoQuiz: 80, blooket: null },
      { lessonKey: '1.2', lessonGradeNoQuiz: 20 },   // done ahead of schedule
    ],
    units: {},
  };

  it('ahead work is visible in cells but excluded from the total; blanks are not zeros', () => {
    const row = buildGradebookRow(gradeObj, columns);
    expect(row.cells['FA:1.2']).toBe(20);
    expect(row.categoryAverages).toEqual({ Lesson: 80 });
    expect(row.schoologyTotal).toBe(80);
  });

  it('a column with no due stamp (no schedule) still counts — degrade to "show everything"', () => {
    const cols = columns.map(({ due, ...c }) => c);
    const row = buildGradebookRow(gradeObj, cols);
    expect(row.categoryAverages.Lesson).toBe(50);
  });
});

// Explicit formula selection makes these independent of environment flags.
const A2_SCHEDULE = {
  '1.1': { unit: 1, tryItCount: 1,
    periods: { C: '2026-09-21', D: '2026-09-23', G: '2026-09-23' } },
};
const ASSESSMENTS = [{ itemId: 'TA-U1', source: 'topic-assessment',
  periods: { C: '2026-09-21', D: '2026-09-23', G: '2026-09-23' } }];
const A2_ROWS = [
  { item_id: 'LC-U1-L1', source: 'lesson-check', score: 8 },
  { item_id: 'TI-U1-L1-1', source: 'try-it', score: 1 },
  { item_id: 'BL-U1-L1-DESK_DONE', source: 'flashcard', score: 80 },
  { item_id: 'TA-U1', source: 'topic-assessment', score: 80 },
];
function a2Grade(formula, rows, today, overrides = {}) {
  return computeGrade(rows, {}, {
    ...PHASE3_CONFIG, quarters: CFG.quarters, bonusOnlyThrough: '2026-09-18',
    useDistrictFormula: formula === 'district', useV3: formula === 'v3',
  }, {
    section: 'PeriodC', lessonSchedule: A2_SCHEDULE, items: ASSESSMENTS,
    asOf: new Date(`${today}T16:00:00Z`), ...overrides,
  });
}

// District collection/grace boundaries are covered by tests/district/engine.test.js.
describe.each(['v3'])('A2 %s due dates and quarter close', formula => {
  it.each([
    ['PeriodC', '2026-09-21', '2026-09-22'],
    ['PeriodD', '2026-09-23', '2026-09-24'],
    ['PeriodG', '2026-09-23', '2026-09-24'],
  ])('uses the section date for %s, including Wednesday meetings', (section, day, nextDay) => {
    const onDay = a2Grade(formula, [], day, { section });
    expect(onDay.formula).toBe(formula);
    expect(onDay.quarters.Q1.quarterGrade).toBeNull();
    expect(onDay.items).toHaveLength(4);
    expect(onDay.items.every(item => item.dueDate === day && !item.due)).toBe(true);
    const overdue = a2Grade(formula, [], nextDay, { section });
    expect(overdue.items.every(item => item.due && item.points === 0)).toBe(true);
    expect(overdue.quarters.Q1.quarterGrade).toBe(0);
    expect(overdue.quarters.Q1.ceiling).toBe(100);
  });
  it('holds completed future work out of the grade until the lesson day ends', () => {
    const early = a2Grade(formula, A2_ROWS, '2026-09-21');
    expect(early.items.every(item => item.attempted && !item.due)).toBe(true);
    expect(early.quarters.Q1.quarterGrade).toBeNull();
    const due = a2Grade(formula, A2_ROWS, '2026-09-22');
    // District: 80*.5 + 50*.4 + 100*.1 = 70.
    // v3: mastery 80; work (3*50 + 3*80 + 100)/7 = 70; both clear the gates.
    expect(due.quarters.Q1.quarterGrade).toBeCloseTo(formula === 'district' ? 70 : 80);
    expect(due.quarters.Q1.formula).toBe(formula);
  });
  it('keeps recovery possible through the last quarter day, then closes the ceiling', () => {
    expect(a2Grade(formula, [], '2026-11-06').quarters.Q1.ceiling).toBe(100);
    const closed = a2Grade(formula, [], '2026-11-07').quarters.Q1;
    expect(closed.quarterGrade).toBe(0);
    expect(closed.ceiling).toBe(0);
  });
  it('assigns later-quarter lessons and assessments by date instead of unit number', () => {
    const periods = { C: '2026-11-09', D: '2026-11-11', G: '2026-11-11' };
    const grade = a2Grade(formula, [], '2026-11-10', {
      lessonSchedule: { '1.1': { unit: 1, tryItCount: 1, periods } },
      items: [{ itemId: 'TA-U1', source: 'topic-assessment', periods }],
    });
    expect(grade.items).toHaveLength(4);
    expect(grade.items.every(item => item.quarter === 'Q2')).toBe(true);
    expect(grade.quarters.Q1.quarterGrade).toBeNull();
    expect(grade.quarters.Q2.quarterGrade).toBe(0);
  });
  it('uses an inclusive bonus window and includes only scores that raise the grade', () => {
    const items = [
      { itemId: 'TA-EARLY', source: 'topic-assessment', dueDate: '2026-09-18' },
      { itemId: 'TA-REGULAR', source: 'topic-assessment', dueDate: '2026-09-21' },
    ];
    const regular = { item_id: 'TA-REGULAR', source: 'topic-assessment', score: 80 };
    const options = { lessonSchedule: {}, items };
    const missing = a2Grade(formula, [regular], '2026-09-22', options);
    expect(missing.quarters.Q1.quarterGrade).toBe(80);
    expect(missing.quarters.Q1.categoryBreakdown.assessments.bonusWindowExcluded).toBe(1);
    const low = { item_id: 'TA-EARLY', source: 'topic-assessment', score: 20 };
    const ignored = a2Grade(formula, [regular, low], '2026-09-22', options);
    expect(ignored.quarters.Q1.quarterGrade).toBe(80);
    expect(ignored.quarters.Q1.categoryBreakdown.assessments.bonusWindowIgnored)
      .toEqual({ count: 1, itemIds: ['TA-EARLY'] });
    const raised = a2Grade(formula, [regular, { ...low, score: 100 }], '2026-09-22', options);
    expect(raised.quarters.Q1.quarterGrade).toBe(90);
    const closed = a2Grade(formula, [regular], '2026-11-07', options).quarters.Q1;
    expect(closed.quarterGrade).toBe(80);
    expect(closed.ceiling).toBe(80);
  });
});

it('uses D/G dates for the retained early bonus without borrowing C dates', () => {
  const schedule = { '1.1': { unit: 1,
    periods: { C: '2026-09-08', D: '2026-09-09', G: '2026-09-09' } } };
  const map = lessonMapOf({ '1.1': lesson(80, '2026-09-09T20:00:00Z') });
  expect(q1(map, schedule, '2026-09-10', CFG, 'PeriodC').earlyBonus).toBe(0);
  for (const section of ['PeriodD', 'PeriodG']) {
    const result = q1(map, schedule, '2026-09-10', CFG, section);
    expect(result.earlyBonus).toBe(1);
    expect(result.quarterGrade).toBe(81);
  }
});
