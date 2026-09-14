// gradebook-grid.test.js — pure-function unit tests for the in-app "1:1 Schoology
// gradebook" deriver. Tests column generation (opener-no-quiz, combined dedup,
// PC/Poster per unit), cell extraction (Follow-Along = lessonGradeNoQuiz, the v3
// Lessons-track value, with Cws fallback), category averages, the Schoology
// category-weighted total, the v3 passthrough, and the reconciliation breakdown.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  buildGradebookColumns,
  buildGradebookRow,
  buildGradebook,
  schoologyWeightedTotal,
  reconcileQuarter,
  SCHOOLOGY_CATEGORY_WEIGHTS,
} from '../gradebook-grid.js';

// A synthetic computeGrade() result: one quarter (Q1 band [1]) with an opener
// (1.1: no quiz, has blooket), a full lesson (1.2: quiz + blooket), and a combined
// pair (1.3/1.4 sharing worksheet "3-4", quiz only on 1.4). lessonGradeNoQuiz is
// the v3 Lessons-track value (blanks + reflections), distinct from Cws so we can
// tell which the Follow-Along cell uses.
function gradeObj() {
  return {
    units: { U1: { pcRawPct: 80 } },
    quarters: { Q1: { units: [1], quarterGrade: 90, pcAvg: 90, workAvg: 70 } },
    lessons: [
      { lessonKey: '1.1', unit: 1, worksheetKey: '1', Cws: 88, lessonGradeNoQuiz: 84, Q: null, quizTotal: 0, blooket: 95, hasBlooket: true, blooketBonus: false },
      { lessonKey: '1.2', unit: 1, worksheetKey: '2', Cws: 90, lessonGradeNoQuiz: 86, Q: 78, quizTotal: 3, blooket: 100, hasBlooket: true, blooketBonus: false },
      { lessonKey: '1.3', unit: 1, worksheetKey: '3-4', Cws: 70, lessonGradeNoQuiz: 66, Q: null, quizTotal: 0, blooket: null, hasBlooket: false, blooketBonus: false },
      { lessonKey: '1.4', unit: 1, worksheetKey: '3-4', Cws: 70, lessonGradeNoQuiz: 66, Q: 65, quizTotal: 4, blooket: null, hasBlooket: false, blooketBonus: false },
    ],
  };
}

describe('buildGradebookColumns', () => {
  const cols = buildGradebookColumns(gradeObj(), 'Q1');
  const keys = cols.map((c) => c.key);

  it('opener (1.1) gets Follow-Along + Blooket but NO quiz', () => {
    expect(keys).toContain('FA:1.1');
    expect(keys).toContain('BL:1.1');
    expect(keys).not.toContain('QUIZ:1.1');
  });

  it('combined worksheet (1.3/1.4) shares ONE Follow-Along, quiz only on 1.4', () => {
    expect(keys.filter((k) => k === 'FA:1.3-4').length).toBe(1);
    expect(keys).toContain('QUIZ:1.4');
    expect(keys).not.toContain('QUIZ:1.3');
    expect(keys).not.toContain('BL:1.3-4');
  });

  

  it('maps component kinds to Schoology categories', () => {
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['FA:1.2'].category).toBe('Lesson');
    expect(byKey['QUIZ:1.2'].category).toBe('Quizzes');
    expect(byKey['BL:1.2'].category).toBe('Blooket');
  });

  it('core Blooket column is unlabeled (not bonus)', () => {
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['BL:1.2'].title).toBe('1.2 Blooket');
    expect(byKey['BL:1.2'].blooketBonus).toBe(false);
  });
});

describe('M2d teacher dashboard bonus Blooket labeling', () => {
  function gradeWithBonus() {
    return {
      units: { U2: { pcRawPct: null } },
      quarters: { Q1: { units: [2], quarterGrade: null, pcAvg: null, workAvg: null } },
      lessons: [
        // core with blooket
        { lessonKey: '2.1', unit: 2, worksheetKey: '1', Cws: null, lessonGradeNoQuiz: null, Q: null, quizTotal: 0, blooket: null, hasBlooket: true, blooketBonus: false },
        // enrichment (crosswalk bonus) with blooket — must never read as required
        { lessonKey: '2.9', unit: 2, worksheetKey: '9', Cws: null, lessonGradeNoQuiz: null, Q: null, quizTotal: 0, blooket: null, hasBlooket: true, blooketBonus: true },
      ],
    };
  }

  it('bonus topic Blooket column is labeled (bonus) and flagged', () => {
    const cols = buildGradebookColumns(gradeWithBonus(), 'Q1');
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['BL:2.9'].title).toBe('2.9 Blooket (bonus)');
    expect(byKey['BL:2.9'].blooketBonus).toBe(true);
  });

  it('core topic Blooket column stays unlabeled', () => {
    const cols = buildGradebookColumns(gradeWithBonus(), 'Q1');
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['BL:2.1'].title).toBe('2.1 Blooket');
    expect(byKey['BL:2.1'].blooketBonus).toBe(false);
  });

  it('M2d CONTRACT: student-facing gradebook payload carries "(bonus)" title', () => {
    // My Gradebook + My Ledger render the shared column.title — the "(bonus)"
    // suffix is student-visible by design (honest labeling; user-approved).
    const gb = buildGradebook(gradeWithBonus());
    const cols = gb.quarters.Q1.columns;
    const bonusCol = cols.find((c) => c.key === 'BL:2.9');
    expect(bonusCol).toBeTruthy();
    expect(bonusCol.title).toBe('2.9 Blooket (bonus)');
    expect(bonusCol.blooketBonus).toBe(true);
    const coreCol = cols.find((c) => c.key === 'BL:2.1');
    expect(coreCol.title).toBe('2.1 Blooket');
    expect(coreCol.title).not.toMatch(/bonus/i);
  });
});

describe('buildGradebookColumns — date-gating `due` flag', () => {
  const schedule = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-15', E: '2026-09-15' } },
    '1.3': { unit: 1, periods: { B: '2026-10-01', E: '2026-10-01' } },
    '1.4': { unit: 1, periods: { B: '2026-10-01', E: '2026-10-01' } },
  };

  it('stamps due true/false from the calendar date when opts are given', () => {
    const cols = buildGradebookColumns(gradeObj(), 'Q1', { lessons: schedule, section: 'PeriodE', todayStr: '2026-09-20' });
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['FA:1.1'].due).toBe(true);    // 09-09 <= 09-20
    expect(byKey['FA:1.2'].due).toBe(true);    // 09-15 <= 09-20
    expect(byKey['FA:1.3-4'].due).toBe(false); // latest 10-01 > 09-20
    expect(byKey['QUIZ:1.4'].due).toBe(false); // 10-01 > 09-20
  });

  it('omits the due field entirely when no schedule/today is given (degrade to show-all)', () => {
    const cols = buildGradebookColumns(gradeObj(), 'Q1');
    expect('due' in cols[0]).toBe(false);
  });

  it('buildGradebook threads the date-gating opts into every quarter column', () => {
    const gb = buildGradebook(gradeObj(), { lessonSchedule: schedule, section: 'PeriodE', todayStr: '2026-09-20' });
    const cols = gb.quarters.Q1.columns;
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey['FA:1.1'].due).toBe(true);
    expect(byKey['QUIZ:1.4'].due).toBe(false);
  });
});

describe('buildGradebookRow', () => {
  const cols = buildGradebookColumns(gradeObj(), 'Q1');
  const row = buildGradebookRow(gradeObj(), cols);

  it('Follow-Along cell = lessonGradeNoQuiz (blanks + reflections), NOT Cws', () => {
    expect(row.cells['FA:1.1']).toBe(84); // not 88 (Cws)
    expect(row.cells['FA:1.2']).toBe(86); // not 90
    expect(row.cells['FA:1.3-4']).toBe(66); // combined, shared
  });

  it('Quiz and Blooket cells retain their values', () => {
    expect(row.cells['QUIZ:1.2']).toBe(78);
    expect(row.cells['BL:1.1']).toBe(95);
  });

  it('falls back to Cws when lessonGradeNoQuiz is absent (old server)', () => {
    const g = {
      units: {}, quarters: { Q1: { units: [1], quarterGrade: null } },
      lessons: [{ lessonKey: '1.1', unit: 1, worksheetKey: '1', Cws: 88, Q: null, quizTotal: 0, blooket: null, hasBlooket: false }],
    };
    const c = buildGradebookColumns(g, 'Q1');
    const r = buildGradebookRow(g, c);
    expect(r.cells['FA:1.1']).toBe(88); // no lessonGradeNoQuiz -> Cws
  });

  it('computes category averages over present cells (Lesson uses the FA values)', () => {
    // Lesson (FA): 84, 86, 66 -> 78.7
    expect(row.categoryAverages.Lesson).toBeCloseTo(78.7, 1);
    expect(row.categoryAverages.Quizzes).toBeCloseTo(71.5, 1);
    expect(row.categoryAverages.Blooket).toBeCloseTo(97.5, 1);
  });

  
});

describe('schoologyWeightedTotal', () => {
  it('renormalizes over present categories', () => {
    expect(schoologyWeightedTotal({ Lesson: 90, Quizzes: 80 }, { Lesson: 15, Quizzes: 15, Blooket: 5 })).toBe(85);
  });
  it('returns null when no category present', () => {
    expect(schoologyWeightedTotal({}, SCHOOLOGY_CATEGORY_WEIGHTS)).toBe(null);
  });
});

describe('reconcileQuarter — explains the Schoology vs v3 gap', () => {
  it('max branch: both tracks >= 40 -> v3 takes the higher, Schoology averages', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: 90, workAvg: 70 } } }, 'Q1', 78.3, 90);
    expect(r.branch).toBe('max');
    expect(r.delta).toBeCloseTo(11.7, 1); // 90 - 79.3
    expect(r.reason).toMatch(/higher/);
    expect(r.reason).toContain('PC 90');
  });

  it('ceiling branch: a track below 40 -> v3 caps', () => {
    const r = reconcileQuarter({ quarters: { Q1: { pcAvg: 100, workAvg: 20 } } }, 'Q1', 60, 70);
    expect(r.branch).toBe('ceiling');
    expect(r.reason).toMatch(/40 floor/);
  });

  it('work-only branch: PC null -> v3 = Work', () => {
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
    // pc 0.90, work 0.36 -> a=0.63, m=0.63 (tie between 70% of PC and the mean).
    const r = reconcileQuarter(
      { quarters: { Q1: { pcAvg: 90, workAvg: 36, pcAvgRaw: 0.90, workAvgRaw: 0.36 } } },
      'Q1', 70, 63);
    expect(r.branch).toBe('ceiling');
    expect(r.reason).toContain('70% of PC');
    expect(r.reason).toContain('the mean of the two tracks');
  });
});

describe('buildGradebook', () => {
  const gb = buildGradebook(gradeObj());

  it('echoes weights and builds every quarter', () => {
    expect(gb.weights).toEqual({ Lesson: 15, Quizzes: 15, Blooket: 5 });
    expect(Object.keys(gb.quarters)).toEqual(['Q1']);
  });

  it('surfaces both totals + the reconciliation', () => {
    expect(gb.quarters.Q1.v3Total).toBe(90);
    expect(gb.quarters.Q1.schoologyTotal).toBeCloseTo(78.3, 1);
    expect(gb.quarters.Q1.reconciliation.branch).toBe('max');
    expect(gb.quarters.Q1.reconciliation.delta).toBeCloseTo(11.7, 1);
  });
});
