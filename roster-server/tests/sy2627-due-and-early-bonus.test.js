// sy2627-due-and-early-bonus.test.js — teacher decisions of 2026-09-03:
//   1. "Schoology today" = category-weighted total over DUE + COMPLETED cells only.
//   2. Early-completion bonus: +1 point per scheduled-due lesson whose worksheet
//      work was all in by 11:59 PM school time on its due day, capped per quarter.
//   3. A lesson is due once its lesson DAY HAS ENDED (config.dueAfterLessonDay).
// Every rule is config-gated so the frozen SY2526 config keeps its old behavior.
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

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  v3LessonsByDate: true,
  v3AheadOfScheduleLessons: 'not-until-due', // production setting
  dueAfterLessonDay: true,
  v3EarlyBonus: { perLesson: 1, cap: 5, minComplete: 0.8 },
  schoolTz: 'America/New_York',
  pcTrack: { enabled: false },
  quarters: {
    Q1: { units: [1], start: '2026-09-02', end: '2026-11-06', pcAnchor: { p85: 40, p100: 60 } },
    Q2: { units: [2], start: '2026-11-09', end: '2027-01-22', pcAnchor: { p85: 45, p100: 64 } },
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
function q1(lessonMap, schedule, todayDateStr, config = CFG) {
  return computeQuarterV3({
    quarterKey: 'Q1', config, lessonMap, schedule, todayDateStr,
    section: 'PeriodB', unitPcData: {},
    quizLessons: [], blooketLessons: [], // isolate the Lessons track
  });
}

describe('isDateDue — due after the lesson day ends (11:59 PM)', () => {
  it('with dueAfterLessonDay the lesson date itself is NOT yet due; the next day is', () => {
    expect(isDateDue('2026-09-08', '2026-09-08', CFG)).toBe(false);
    expect(isDateDue('2026-09-08', '2026-09-09', CFG)).toBe(true);
  });
  it('without the flag (frozen SY2526) the lesson date is due from the start of the day', () => {
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
    '1.1': { unit: 1, periods: { B: '2026-09-08', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-10', E: '2026-09-11' } },
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
      '4.1': { unit: 4, worksheetKey: '1-2', combinedWith: ['4.2'], periods: { B: '2026-09-08', E: '2026-09-09' } },
      '4.2': { unit: 4, worksheetKey: '1-2', combinedWith: ['4.1'], periods: { B: '2026-09-10', E: '2026-09-11' } },
    };
    const cfg = { ...CFG, quarters: { Q1: { units: [4], start: '2026-09-02', end: '2026-11-06', pcAnchor: { p85: 40, p100: 60 } } } };
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
      const d = `2026-09-${String(7 + i).padStart(2, '0')}`;
      sched[`1.${i}`] = { unit: 1, periods: { B: d, E: d } };
      map[`1.${i}`] = lesson(100, `${d}T12:00:00Z`);
    }
    const r = q1(lessonMapOf(map), sched, '2026-09-30');
    expect(r.earlyLessons).toBe(7);
    expect(r.earlyBonus).toBe(5);
    expect(r.quarterGrade).toBe(100);
  });

  it('WITHOUT v3EarlyBonus / dueAfterLessonDay (frozen SY2526 config) nothing changes', () => {
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

// ── Progress Checks keyed by NEW CED unit (teacher decision 2026-09-03 #7) ──────
import { pcDatesFor, pcUnitsInQuarter } from '../lesson-grade.js';
import { computeGrade } from '../grade.js';



// ── Production wiring: the live SY2627 context carries the event schedule ─────
import { resolveProductionGradeInputs, loadEventScheduleWithPriority } from '../grade-contexts.js';


