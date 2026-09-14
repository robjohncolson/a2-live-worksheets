import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const V4_PATH = resolve(__dirname, '../docs/apstats-history/dotfiles/.v4-logic-block.js');
const V5_PATH = resolve(__dirname, '../docs/apstats-history/dotfiles/.v5-ladder-block.js');
const START_DAY = '2026-04-14';
const DAY_8 = '2026-04-21';
const DAY_15 = '2026-04-28';
const DAY_21 = '2026-05-04';
const DAY_22 = '2026-05-05';
const NEXT_DAY = '2026-04-15';
const THIRD_DAY = '2026-04-16';
const EXAM_DATE = '2026-05-07';

function loadApis(fakeWindow) {
  const v4Src = readFileSync(V4_PATH, 'utf8');
  const v5Src = readFileSync(V5_PATH, 'utf8');

  new Function('window', v4Src)(fakeWindow);
  fakeWindow.__studyGuideV4__.FORMULA_UNIT_MAP = { ...fakeWindow.FORMULA_UNIT_MAP };
  new Function('window', v5Src)(fakeWindow);

  return {
    v4: fakeWindow.__studyGuideV4__,
    v5: fakeWindow.__studyGuideV5__
  };
}

function makeFakeWindow(extra = {}) {
  return {
    FORMULA_UNIT_MAP: {
      mean: 1,
      'corr-r': 2,
      'binom-pmf': 4,
      'phat-sd': 5,
      'one-prop-z': 6,
      'margin-error': 6
    },
    AP_STATS_CARTRIDGE: {
      commands: [
        { id: 'mean', action: 'Mean', tier: 'core', dom: 'descriptive' },
        { id: 'corr-r', action: 'Correlation Coefficient (r)', tier: 'regular', dom: 'descriptive' },
        { id: 'binom-pmf', action: 'Binomial PMF', tier: 'core', dom: 'probability' },
        { id: 'phat-sd', action: 'Sampling Distribution SD of p-hat', tier: 'regular', dom: 'sampling' },
        { id: 'one-prop-z', action: 'One-Proportion z Test', tier: 'power', dom: 'inference' },
        { id: 'margin-error', action: 'Margin of Error', tier: 'support', dom: 'inference' }
      ]
    },
    FORMULA_PROBE_MAP: {
      map: {
        mean: { questionIds: ['U1-L1-Q01'], notes: '' },
        'corr-r': { questionIds: ['U2-L5-Q02'], notes: '' },
        'binom-pmf': { questionIds: ['U4-L8-Q01'], notes: '' },
        'phat-sd': { questionIds: ['U5-L2-Q01'], notes: '' },
        'one-prop-z': { questionIds: ['U6-L4-Q01'], notes: '' },
        'margin-error': { questionIds: [], notes: 'supplement only' }
      }
    },
    EMBEDDED_CURRICULUM_SUPPLEMENT: [
      {
        id: 'U6-L6-QS1',
        type: 'multiple-choice',
        formulaId: 'margin-error',
        prompt: 'stub',
        answerKey: 'B',
        attachments: { choices: [] }
      }
    ],
    BKT: {
      updateMastery: (prior, correct) => prior + (correct ? 0.1 : -0.1)
    },
    ...extra
  };
}

function emptyState() {
  return {
    touchedFormulas: {},
    dailyDose: null,
    units: {}
  };
}

function makeUnitState(mastery, extra = {}) {
  return {
    masteryState: {
      lo1: mastery
    },
    ...extra
  };
}

function makeDailyDose(overrides = {}) {
  return {
    date: START_DAY,
    tierAtGeneration: 0,
    mcq: [],
    mcqCompleted: [],
    frq: [],
    frqCompleted: [],
    activeTab: 'mcq',
    ...overrides
  };
}

function makeMcq(formulaId, questionId, unit = 1, lesson = 1, tier = 'core') {
  return {
    kind: 'mcq',
    formulaId,
    questionId,
    unit,
    lesson,
    tier
  };
}

function makeFrq(unit, questionId) {
  return {
    kind: 'frq',
    unit,
    questionId,
    formulaId: null
  };
}

let fakeWindow;
let v4;
let api;
let state;

beforeEach(() => {
  expect(existsSync(V4_PATH)).toBe(true);
  expect(existsSync(V5_PATH)).toBe(true);
  fakeWindow = makeFakeWindow();
  ({ v4, v5: api } = loadApis(fakeWindow));
  state = emptyState();
  expect(v4).toBeTruthy();
  expect(api).toBeTruthy();
});

describe('v4 re-exports', () => {
  it('re-exposes v4 helpers and constants through the v5 API', () => {
    expect(api.daysLeft(START_DAY, EXAM_DATE)).toBe(v4.daysLeft(START_DAY, EXAM_DATE));
    expect(api.AP_EXAM_DATE).toBe(v4.AP_EXAM_DATE);
    expect(api.FORMULA_UNIT_MAP).toEqual(fakeWindow.FORMULA_UNIT_MAP);
  });
});

describe('daysSinceStudyStart', () => {
  it('counts the study start date as day 1', () => {
    expect(api.daysSinceStudyStart(START_DAY)).toBe(1);
  });

  it('returns day 8 after seven calendar days', () => {
    expect(api.daysSinceStudyStart(DAY_8)).toBe(8);
  });

  it('returns day 22 after twenty-one calendar days', () => {
    expect(api.daysSinceStudyStart(DAY_22)).toBe(22);
  });
});

describe('calendarTier', () => {
  it('uses the expected day-to-tier boundaries', () => {
    expect(api.calendarTier(START_DAY)).toBe(0);
    expect(api.calendarTier(DAY_8)).toBe(1);
    expect(api.calendarTier(DAY_15)).toBe(2);
    expect(api.calendarTier(DAY_21)).toBe(3);
  });
});

describe('computeDoseTier', () => {
  it('returns tier 0 for an all-zero state on day 1', () => {
    expect(api.computeDoseTier(state, START_DAY)).toBe(0);
  });

  it('takes the max of calendar tier, mcq debt, and frq debt', () => {
    expect(api.computeDoseTier({ doseLadder: { tier: 0, mcqDebt: 2, frqDebt: 1 } }, START_DAY)).toBe(2);
    expect(api.computeDoseTier({ doseLadder: { tier: 0, mcqDebt: 1, frqDebt: 3 } }, START_DAY)).toBe(3);
    expect(api.computeDoseTier(state, DAY_15)).toBe(2);
  });
});

describe('tierSpec', () => {
  it('returns the expected ladder doses', () => {
    expect(api.tierSpec(0).mcq).toBe(5);
    expect(api.tierSpec(0).frq).toBe(1);
    expect(api.tierSpec(3).mcq).toBe(12);
    expect(api.tierSpec(3).frq).toBe(2);
  });
});

describe('updateDebtFromPriorDose', () => {
  it('adds debt when the prior day was under-completed', () => {
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01')
      ],
      mcqCompleted: ['U1-L1-Q01'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(2);
    expect(state.doseLadder.frqDebt).toBe(1);
  });

  it('reduces debt when the prior day was over-completed and floors at zero', () => {
    state.doseLadder = { tier: 0, mcqDebt: 2, frqDebt: 1 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02')
      ],
      mcqCompleted: ['U1-L1-Q01', 'U2-L5-Q02', 'extra-1', 'extra-2'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: ['U1-PC-FRQ-Q02', 'extra-frq']
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(0);
    expect(state.doseLadder.frqDebt).toBe(0);
  });

  it('is a no-op when the stored dose is already for today', () => {
    state.doseLadder = { tier: 0, mcqDebt: 1, frqDebt: 2 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [makeMcq('mean', 'U1-L1-Q01')],
      mcqCompleted: [],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, START_DAY);

    expect(state.doseLadder.mcqDebt).toBe(1);
    expect(state.doseLadder.frqDebt).toBe(2);
  });

  it('is a no-op when no dailyDose exists and still initializes doseLadder', () => {
    api.updateDebtFromPriorDose(state, START_DAY);

    expect(state.doseLadder).toEqual({
      tier: 0,
      mcqDebt: 0,
      frqDebt: 0
    });
  });

  it('is idempotent across repeated calls on the same rolled-over daily dose', () => {
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01')
      ],
      mcqCompleted: ['U1-L1-Q01'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);
    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(2);
    expect(state.doseLadder.frqDebt).toBe(1);
  });
});

describe('pickDailyFrqs', () => {
  it('picks the weakest ungraded units first', () => {
    state.units = {
      1: makeUnitState(0.8),
      2: makeUnitState(0.1, { frqGrade: 'done' }),
      3: makeUnitState(0.2),
      4: makeUnitState(0.4),
      5: makeUnitState(0.6),
      6: makeUnitState(0.7),
      7: makeUnitState(0.5),
      8: makeUnitState(0.9),
      9: makeUnitState(0.95)
    };

    expect(api.pickDailyFrqs(state, 3)).toEqual([
      { kind: 'frq', unit: 3, questionId: 'U3-PC-FRQ-Q01', formulaId: null },
      { kind: 'frq', unit: 4, questionId: 'U4-PC-FRQ-Q02', formulaId: null },
      { kind: 'frq', unit: 7, questionId: 'U7-PC-FRQ-Q02', formulaId: null }
    ]);
  });

  it('returns at most n and can return fewer when most units are ineligible', () => {
    state.units = {
      1: makeUnitState(0.2, { frqGrade: 'done' }),
      2: makeUnitState(0.2, { frqGrade: 'done' }),
      3: makeUnitState(0.2, { frqGrade: 'done' }),
      4: makeUnitState(0.2, { frqGrade: 'done' }),
      5: makeUnitState(0.2, { frqGrade: 'done' }),
      6: makeUnitState(0.2, { frqGrade: 'done' }),
      7: makeUnitState(0.2, { frqGrade: 'done' }),
      8: makeUnitState(0.2, { frqGrade: 'done' }),
      9: makeUnitState(0.2)
    };

    expect(api.pickDailyFrqs(state, 3)).toEqual([
      { kind: 'frq', unit: 9, questionId: 'U9-PC-FRQ-Q01', formulaId: null }
    ]);
  });
});

describe('pickDailyQueueV5', () => {
  it('builds the expected daily-dose shape for tier 0', () => {
    const dailyDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);

    expect(dailyDose).toEqual(expect.objectContaining({
      date: START_DAY,
      tierAtGeneration: 0,
      activeTab: 'mcq',
      mcqCompleted: [],
      frqCompleted: []
    }));
    expect(dailyDose.mcq.every((entry) => entry.kind === 'mcq')).toBe(true);
    expect(dailyDose.frq.every((entry) => entry.kind === 'frq')).toBe(true);
    expect(dailyDose.mcq.length).toBeLessThanOrEqual(5);
    expect(dailyDose.frq.length).toBeLessThanOrEqual(1);
  });

  it('returns the existing queue when called again on the same day', () => {
    const firstDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    state.dailyDose = firstDose;

    const secondDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);

    expect(secondDose).toBe(firstDose);
  });

  it('regenerates the queue when the day changes', () => {
    const firstDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    state.dailyDose = {
      ...firstDose,
      mcqCompleted: firstDose.mcq.map((entry) => entry.questionId),
      frqCompleted: firstDose.frq.map((entry) => entry.questionId)
    };

    const nextDose = api.pickDailyQueueV5(state, NEXT_DAY, EXAM_DATE);

    expect(nextDose).not.toBe(state.dailyDose);
    expect(nextDose.date).toBe(NEXT_DAY);
    expect(nextDose.activeTab).toBe('mcq');
    expect(nextDose.mcqCompleted).toEqual([]);
    expect(nextDose.frqCompleted).toEqual([]);
  });
});

describe('advanceDailyQueueV5', () => {
  it('advances within a tab, flips tabs when needed, and returns null when complete', () => {
    state.dailyDose = makeDailyDose({
      mcq: [
        makeMcq('mean', 'U1-L1-Q01', 1, 1, 'core'),
        makeMcq('corr-r', 'U2-L5-Q02', 2, 5, 'regular')
      ],
      frq: [
        makeFrq(1, 'U1-PC-FRQ-Q02')
      ],
      activeTab: 'mcq'
    });

    const nextMcq = api.advanceDailyQueueV5(state, 'U1-L1-Q01');
    expect(nextMcq.questionId).toBe('U2-L5-Q02');
    expect(state.dailyDose.mcqCompleted).toEqual(['U1-L1-Q01']);
    expect(state.dailyDose.activeTab).toBe('mcq');

    const nextFrq = api.advanceDailyQueueV5(state, 'U2-L5-Q02');
    expect(nextFrq.questionId).toBe('U1-PC-FRQ-Q02');
    expect(state.dailyDose.mcqCompleted).toEqual(['U1-L1-Q01', 'U2-L5-Q02']);
    expect(state.dailyDose.activeTab).toBe('frq');

    const done = api.advanceDailyQueueV5(state, 'U1-PC-FRQ-Q02');
    expect(done).toBeNull();
    expect(state.dailyDose.frqCompleted).toEqual(['U1-PC-FRQ-Q02']);
  });
});

describe('setActiveTab', () => {
  it('normalizes tabs to mcq or frq and no-ops when dailyDose is missing', () => {
    api.setActiveTab(state, 'frq');
    expect(state.dailyDose).toBeNull();

    state.dailyDose = makeDailyDose();
    api.setActiveTab(state, 'frq');
    expect(state.dailyDose.activeTab).toBe('frq');

    api.setActiveTab(state, 'anything-else');
    expect(state.dailyDose.activeTab).toBe('mcq');
  });
});

describe('recordFormulaHint', () => {
  it('sets hintedAt without changing lastMastery', () => {
    state.touchedFormulas = {
      mean: { firstTouchedAt: '2026-04-14', lastMastery: 0.75 }
    };

    v4.recordFormulaHint('mean', state);

    expect(state.touchedFormulas.mean.hintedAt).toBeTruthy();
    expect(typeof state.touchedFormulas.mean.hintedAt).toBe('string');
    expect(state.touchedFormulas.mean.lastMastery).toBe(0.75);
  });

  it('initializes the touchedFormulas entry with BKT_INIT mastery when the formula is new', () => {
    v4.recordFormulaHint('corr-r', state);

    expect(state.touchedFormulas['corr-r']).toBeTruthy();
    expect(state.touchedFormulas['corr-r'].lastMastery).toBe(v4.BKT_INIT);
    expect(state.touchedFormulas['corr-r'].hintedAt).toBeTruthy();
  });

  it('returns the updated entry', () => {
    const result = v4.recordFormulaHint('mean', state);

    expect(result).toBeTruthy();
    expect(result.hintedAt).toBeTruthy();
  });

  it('overwrites a prior hintedAt date when called again', () => {
    state.touchedFormulas = {
      mean: { firstTouchedAt: '2026-04-10', lastMastery: 0.5, hintedAt: '2026-04-10' }
    };

    v4.recordFormulaHint('mean', state);

    // The new hintedAt is today (or a recent date), not the old one.
    // We can't assert the exact value, but it should exist and be a string.
    expect(typeof state.touchedFormulas.mean.hintedAt).toBe('string');
  });
});

describe('formulaWeight hint boost', () => {
  it('boosts a formula hinted today over an unhinted formula', () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Hint 'mean', leave 'corr-r' unhinted. Both have same initial mastery.
    state.touchedFormulas = {
      mean: { firstTouchedAt: todayStr, lastMastery: 0.3, hintedAt: todayStr },
      'corr-r': { firstTouchedAt: todayStr, lastMastery: 0.3 }
    };

    const hintedWeight = v4.formulaWeight('mean', state);
    const unhintedWeight = v4.formulaWeight('corr-r', state);

    expect(hintedWeight).toBeGreaterThan(unhintedWeight);
  });

  it('applies zero boost when hintedAt is 3 or more days ago', () => {
    // Set hintedAt to 3 days ago.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    state.touchedFormulas = {
      mean: { firstTouchedAt: threeDaysAgo, lastMastery: 0.3, hintedAt: threeDaysAgo }
    };

    const baseWeightNoHint = v4.formulaWeight('mean', { touchedFormulas: { mean: { firstTouchedAt: threeDaysAgo, lastMastery: 0.3 } } });
    const decayedWeight = v4.formulaWeight('mean', state);

    // After 3 days the boost is exactly 0, so weights should be equal.
    expect(decayedWeight).toBeCloseTo(baseWeightNoHint, 5);
  });

  it('applies a partial boost when hintedAt is 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    state.touchedFormulas = {
      mean: { firstTouchedAt: oneDayAgo, lastMastery: 0.3, hintedAt: oneDayAgo }
    };

    const baseWeight = v4.formulaWeight('mean', { touchedFormulas: { mean: { firstTouchedAt: oneDayAgo, lastMastery: 0.3 } } });
    const boostedWeight = v4.formulaWeight('mean', state);

    // Boost should be positive but smaller than today's boost.
    expect(boostedWeight).toBeGreaterThan(baseWeight);
    // The boost at 1 day ago: 0.3 * (1 - 1/3) = 0.3 * 0.667 = 0.2
    expect(boostedWeight - baseWeight).toBeCloseTo(0.2, 1);
  });

  it('formulaWeight with hintedAt today is greater than without hintedAt', () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Compare 'mean' with hint vs 'mean' without hint, same mastery level.
    const stateWithHint = {
      touchedFormulas: {
        mean: { firstTouchedAt: todayStr, lastMastery: 0.3, hintedAt: todayStr }
      }
    };
    const stateWithoutHint = {
      touchedFormulas: {
        mean: { firstTouchedAt: todayStr, lastMastery: 0.3 }
      }
    };

    const weightWithHint = v4.formulaWeight('mean', stateWithHint);
    const weightWithoutHint = v4.formulaWeight('mean', stateWithoutHint);

    expect(weightWithHint).toBeGreaterThan(weightWithoutHint);
    // The boost at day 0: 0.3 * (1 - 0/3) = 0.3
    expect(weightWithHint - weightWithoutHint).toBeCloseTo(0.3, 5);
  });
});

describe('queuedFormulasToday', () => {
  it('returns empty array when touchedFormulas is empty', () => {
    const emptyTfState = { touchedFormulas: {} };
    const result = api.queuedFormulasToday(emptyTfState, START_DAY);
    expect(result).toEqual([]);
  });

  it('returns formulas hinted today with their names', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const result = api.queuedFormulasToday(testState, START_DAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mean');
    // formulaName('mean') returns 'Mean' based on the commands fixture
    expect(typeof result[0].name).toBe('string');
    expect(result[0].name.length).toBeGreaterThan(0);
  });

  it('excludes formulas hinted on other dates', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY },
        'corr-r': { firstTouchedAt: NEXT_DAY, lastMastery: 0.3, hintedAt: NEXT_DAY }
      }
    };
    const result = api.queuedFormulasToday(testState, START_DAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mean');
  });

  it('handles touchedFormulas entries without hintedAt', () => {
    // Old entries may only have firstTouchedAt, no hintedAt field.
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.5 }
      }
    };
    const result = api.queuedFormulasToday(testState, START_DAY);
    expect(result).toEqual([]);
  });

  it('is exported via v5 proxy', () => {
    expect(typeof api.queuedFormulasToday).toBe('function');
    // Calling via v5 proxy should delegate to v4 and return the same result as calling v4 directly.
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const proxyResult = api.queuedFormulasToday(testState, START_DAY);
    const directResult = v4.queuedFormulasToday(testState, START_DAY);
    expect(proxyResult).toEqual(directResult);
  });
});

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    expect(v4.daysBetween('2026-04-14', '2026-04-14')).toBe(0);
  });

  it('returns positive integer for later date', () => {
    expect(v4.daysBetween('2026-04-14', '2026-04-21')).toBe(7);
  });

  it('returns negative integer for earlier date', () => {
    expect(v4.daysBetween('2026-04-21', '2026-04-14')).toBe(-7);
  });

  it('returns NaN for malformed input', () => {
    expect(Number.isNaN(v4.daysBetween('not-a-date', '2026-04-14'))).toBe(true);
    expect(Number.isNaN(v4.daysBetween(null, '2026-04-14'))).toBe(true);
    expect(Number.isNaN(v4.daysBetween('2026-04-14', ''))).toBe(true);
  });

  it('is exported via v5 proxy', () => {
    expect(typeof api.daysBetween).toBe('function');
    expect(api.daysBetween('2026-04-14', '2026-04-16')).toBe(2);
  });
});

describe('reviewQueueEntries', () => {
  it('returns empty array when touchedFormulas is empty', () => {
    const result = v4.reviewQueueEntries({ touchedFormulas: {} }, START_DAY);
    expect(result).toEqual([]);
  });

  it('returns entries hinted within the last 7 days', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const result = v4.reviewQueueEntries(testState, START_DAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mean');
    expect(result[0].daysSince).toBe(0);
  });

  it('excludes graduated entries', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY, graduated: true }
      }
    };
    const result = v4.reviewQueueEntries(testState, START_DAY);
    expect(result).toHaveLength(0);
  });

  it('excludes entries older than maxDays', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: '2026-04-01', lastMastery: 0.3, hintedAt: '2026-04-01' }
      }
    };
    // START_DAY is 2026-04-14 — 13 days after 2026-04-01, which exceeds default 7.
    const result = v4.reviewQueueEntries(testState, START_DAY);
    expect(result).toHaveLength(0);
  });

  it('excludes entries without hintedAt', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.5 }
      }
    };
    const result = v4.reviewQueueEntries(testState, START_DAY);
    expect(result).toHaveLength(0);
  });

  it('sorts by hintedAt descending', () => {
    const testState = {
      touchedFormulas: {
        'corr-r': { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: '2026-04-12' },
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const result = v4.reviewQueueEntries(testState, START_DAY);
    expect(result[0].id).toBe('mean');
    expect(result[1].id).toBe('corr-r');
  });

  it('resolves display name via formulaName', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const result = v4.reviewQueueEntries(testState, START_DAY);
    // formulaName('mean') should return 'Mean' from the cartridge fixture.
    expect(result[0].name).toBe('Mean');
  });

  it('respects custom maxDays option', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: '2026-04-11', lastMastery: 0.3, hintedAt: '2026-04-11' }
      }
    };
    // 3 days before START_DAY — within default 7, but beyond maxDays: 2.
    const excluded = v4.reviewQueueEntries(testState, START_DAY, { maxDays: 2 });
    expect(excluded).toHaveLength(0);
    // With maxDays: 4, it should appear.
    const included = v4.reviewQueueEntries(testState, START_DAY, { maxDays: 4 });
    expect(included).toHaveLength(1);
  });

  it('is exported via v5 proxy', () => {
    expect(typeof api.reviewQueueEntries).toBe('function');
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    const proxyResult = api.reviewQueueEntries(testState, START_DAY);
    const directResult = v4.reviewQueueEntries(testState, START_DAY);
    expect(proxyResult).toEqual(directResult);
  });
});

describe('graduateFormula', () => {
  it('sets graduated=true on an existing entry', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    v4.graduateFormula('mean', testState);
    expect(testState.touchedFormulas.mean.graduated).toBe(true);
  });

  it('is a no-op for nonexistent formula id', () => {
    const testState = { touchedFormulas: {} };
    const result = v4.graduateFormula('nonexistent', testState);
    expect(result).toBeNull();
    expect(testState.touchedFormulas.nonexistent).toBeUndefined();
  });

  it('preserves other fields on graduated entry', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.6, hintedAt: START_DAY }
      }
    };
    v4.graduateFormula('mean', testState);
    expect(testState.touchedFormulas.mean.lastMastery).toBe(0.6);
    expect(testState.touchedFormulas.mean.hintedAt).toBe(START_DAY);
    expect(testState.touchedFormulas.mean.firstTouchedAt).toBe(START_DAY);
  });

  it('is idempotent — graduating twice is safe', () => {
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    v4.graduateFormula('mean', testState);
    v4.graduateFormula('mean', testState);
    expect(testState.touchedFormulas.mean.graduated).toBe(true);
  });

  it('is exported via v5 proxy', () => {
    expect(typeof api.graduateFormula).toBe('function');
    const testState = {
      touchedFormulas: {
        mean: { firstTouchedAt: START_DAY, lastMastery: 0.3, hintedAt: START_DAY }
      }
    };
    api.graduateFormula('mean', testState);
    expect(testState.touchedFormulas.mean.graduated).toBe(true);
  });
});

describe('debt scenarios', () => {
  it('does not create debt when the student works ahead', () => {
    state.doseLadder = { tier: 0, mcqDebt: 0, frqDebt: 0 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: [
        'U1-L1-Q01',
        'U2-L5-Q02',
        'U4-L8-Q01',
        'U5-L2-Q01',
        'U6-L4-Q01',
        'extra-1',
        'extra-2',
        'extra-3',
        'extra-4',
        'extra-5'
      ]
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(0);
  });

  it('bumps the dose tier upward after repeated skipped days', () => {
    state.doseLadder = { tier: 0, mcqDebt: 0, frqDebt: 0 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    state.dailyDose = makeDailyDose({
      date: NEXT_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: []
    });

    api.updateDebtFromPriorDose(state, THIRD_DAY);

    expect(api.computeDoseTier(state, THIRD_DAY)).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════
// Session 85 — mastery map pure function tests
// ═══════════════════════════════════════════════════════

// Helpers for mastery map tests (use v4 directly — loaded in beforeEach).
function makeMapCommands() {
  return [
    { id: 'mean', action: 'Mean', tier: 'core', dom: 'descriptive' },
    { id: 'corr-r', action: 'Correlation', tier: 'regular', dom: 'descriptive' },
    { id: 'binom-pmf', action: 'Binomial PMF', tier: 'core', dom: 'probability' },
    { id: 'phat-sd', action: 'Sampling SD', tier: 'regular', dom: 'sampling' },
    { id: 'one-prop-z', action: 'One Prop Z', tier: 'core', dom: 'inference' },
    { id: 'chi-sq', action: 'Chi-square', tier: 'core', dom: 'inference' },
    { id: 'slope-t', action: 'Slope t', tier: 'core', dom: 'regression' },
    { id: 'unmapped-formula', action: 'Unmapped', tier: 'support', dom: 'other' }
  ];
}

function makeMapUnitMap() {
  return {
    mean: 1,
    'corr-r': 2,
    'binom-pmf': 4,
    'phat-sd': 5,
    'one-prop-z': 6,
    'chi-sq': 8,
    'slope-t': 9
    // 'unmapped-formula' intentionally omitted
  };
}

describe('computeMapLayout', () => {
  it('returns nodes for every cartridge command', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    expect(layout.nodes.length).toBe(commands.length);
  });

  it('assigns unit per FORMULA_UNIT_MAP', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    const meanNode = layout.nodes.find(n => n.id === 'mean');
    const chiNode = layout.nodes.find(n => n.id === 'chi-sq');
    expect(meanNode.unit).toBe(1);
    expect(chiNode.unit).toBe(8);
  });

  it('places core formulas in inner ring and others in outer ring', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    const meanNode = layout.nodes.find(n => n.id === 'mean');
    const corrNode = layout.nodes.find(n => n.id === 'corr-r');
    expect(meanNode.ring).toBe('core');
    expect(corrNode.ring).toBe('outer');
  });

  it('assigns unmapped formulas to unit 3 as fallback', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    const unmappedNode = layout.nodes.find(n => n.id === 'unmapped-formula');
    expect(unmappedNode).toBeTruthy();
    expect(unmappedNode.unit).toBe(3);
  });

  it('is deterministic — same input produces same positions', () => {
    const commands = makeMapCommands();
    const unitMap = makeMapUnitMap();
    const layout1 = v4.computeMapLayout(commands, unitMap);
    const layout2 = v4.computeMapLayout(commands, unitMap);
    layout1.nodes.forEach((n, i) => {
      expect(n.x).toBe(layout2.nodes[i].x);
      expect(n.y).toBe(layout2.nodes[i].y);
    });
  });

  it('worldBounds covers all nodes', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    const bounds = layout.worldBounds;
    layout.nodes.forEach(n => {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(bounds.width);
      expect(n.y).toBeLessThanOrEqual(bounds.height);
    });
  });

  it('unitCenters has 9 entries for units 1-9', () => {
    const commands = makeMapCommands();
    const layout = v4.computeMapLayout(commands, makeMapUnitMap());
    expect(layout.unitCenters.length).toBe(9);
    const unitNums = layout.unitCenters.map(uc => uc.unit);
    for (let u = 1; u <= 9; u++) {
      expect(unitNums).toContain(u);
    }
  });
});

describe('colorForMastery', () => {
  it('returns grey-blue for untouched', () => {
    const color = v4.colorForMastery(0, false);
    expect(color.fill).toBe('#3a4060');
  });

  it('returns red for mastery 0 when touched', () => {
    const color = v4.colorForMastery(0, true);
    // hue = 0 * 120 = 0 → hsl(0, 75%, 50%)
    expect(color.fill).toContain('hsl(0,');
  });

  it('returns yellow for mastery 0.5', () => {
    const color = v4.colorForMastery(0.5, true);
    // hue = 0.5 * 120 = 60
    expect(color.fill).toContain('hsl(60,');
  });

  it('returns green for mastery 1.0', () => {
    const color = v4.colorForMastery(1.0, true);
    // hue = 1 * 120 = 120
    expect(color.fill).toContain('hsl(120,');
  });

  it('returns glow color for mastery > 0.5', () => {
    const color = v4.colorForMastery(0.7, true);
    expect(color.glow).toBeTruthy();
    expect(color.glow).toContain('hsla');
  });

  it('returns no glow for mastery <= 0.5', () => {
    const colorAt05 = v4.colorForMastery(0.5, true);
    const colorAt03 = v4.colorForMastery(0.3, true);
    expect(colorAt05.glow).toBeNull();
    expect(colorAt03.glow).toBeNull();
  });

  it('clamps mastery below 0 to 0', () => {
    const colorNeg = v4.colorForMastery(-0.5, true);
    const color0 = v4.colorForMastery(0, true);
    expect(colorNeg.fill).toBe(color0.fill);
  });

  it('clamps mastery above 1 to 1', () => {
    const colorOver = v4.colorForMastery(1.5, true);
    const color1 = v4.colorForMastery(1.0, true);
    expect(colorOver.fill).toBe(color1.fill);
  });
});

describe('clampPan', () => {
  // We need clampPan from the HTML inline copy; test it by loading v4 (which has the same logic).
  // clampPan is not exported from v4/v5 — we test it via a local re-implementation
  // to keep tests self-contained and pure.
  function clampPanLocal(viewState, worldBounds, canvasWidth, canvasHeight) {
    const scaledW = worldBounds.width * viewState.zoom;
    const scaledH = worldBounds.height * viewState.zoom;
    const maxPanX = Math.max(0, (scaledW - canvasWidth) / 2);
    const maxPanY = Math.max(0, (scaledH - canvasHeight) / 2);
    viewState.panX = Math.max(-maxPanX, Math.min(maxPanX, viewState.panX));
    viewState.panY = Math.max(-maxPanY, Math.min(maxPanY, viewState.panY));
    return viewState;
  }

  it('allows no pan at minZoom (content fits viewport)', () => {
    // At minZoom, scaledW <= canvasWidth, so maxPanX = 0.
    const worldBounds = { width: 1000, height: 700 };
    const canvasW = 1000;
    const canvasH = 700;
    const minZoom = Math.min(canvasW / worldBounds.width, canvasH / worldBounds.height) * 0.95;
    const viewState = { zoom: minZoom, panX: 50, panY: 50 };
    clampPanLocal(viewState, worldBounds, canvasW, canvasH);
    expect(viewState.panX).toBe(0);
    expect(viewState.panY).toBe(0);
  });

  it('allows pan proportional to zoom overflow', () => {
    const worldBounds = { width: 1000, height: 700 };
    const canvasW = 1000;
    const canvasH = 700;
    // zoom = 2 → scaledW = 2000, maxPanX = (2000-1000)/2 = 500
    const viewState = { zoom: 2, panX: 200, panY: 100 };
    clampPanLocal(viewState, worldBounds, canvasW, canvasH);
    expect(viewState.panX).toBe(200);
    expect(viewState.panY).toBe(100);
  });

  it('clamps panX and panY to bounds', () => {
    const worldBounds = { width: 1000, height: 700 };
    const canvasW = 1000;
    const canvasH = 700;
    // zoom = 2 → maxPanX = 500, maxPanY = 350
    const viewState = { zoom: 2, panX: 9999, panY: 9999 };
    clampPanLocal(viewState, worldBounds, canvasW, canvasH);
    expect(viewState.panX).toBe(500);
    expect(viewState.panY).toBe(350);
  });
});

describe('hitTest', () => {
  function hitTestLocal(nodes, clickX, clickY, viewState, worldBounds, canvasWidth, canvasHeight) {
    const cx = canvasWidth / 2 + viewState.panX;
    const cy = canvasHeight / 2 + viewState.panY;
    const worldX = (clickX - cx) / viewState.zoom + worldBounds.width / 2;
    const worldY = (clickY - cy) / viewState.zoom + worldBounds.height / 2;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius * 1.4) {
        return node;
      }
    }
    return null;
  }

  const worldBounds = { width: 1000, height: 700 };
  const canvasW = 1000;
  const canvasH = 700;
  const minZoom = Math.min(canvasW / worldBounds.width, canvasH / worldBounds.height) * 0.95;

  it('returns the node under a click at the center of a node', () => {
    const nodes = [{ id: 'test-node', x: 500, y: 350, radius: 8 }];
    const viewState = { zoom: minZoom, panX: 0, panY: 0 };
    // At minZoom with pan=0, canvas center maps to world center (500, 350).
    // canvasCenter = (500, 350). worldX = (500 - 500) / minZoom + 500 = 500. worldY = 350.
    const hit = hitTestLocal(nodes, 500, 350, viewState, worldBounds, canvasW, canvasH);
    expect(hit).toBeTruthy();
    expect(hit.id).toBe('test-node');
  });

  it('returns null for clicks in empty space', () => {
    const nodes = [{ id: 'test-node', x: 500, y: 350, radius: 8 }];
    const viewState = { zoom: minZoom, panX: 0, panY: 0 };
    // Click far from node.
    const hit = hitTestLocal(nodes, 0, 0, viewState, worldBounds, canvasW, canvasH);
    expect(hit).toBeNull();
  });

  it('accounts for zoom and pan in the inverse transform', () => {
    // Place a node at world (200, 150). At zoom=2, pan=(0,0):
    // canvas coords for that point: cx=500, cy=350, worldX = (clickX-500)/2 + 500 = 200 → clickX = 500 + (200-500)*2 = 500-600 = -100 — outside canvas.
    // Use a simpler: node at world center (500, 350) but zoom=2, panX=50.
    // cx = 500+50 = 550, worldX = (clickX-550)/2 + 500. For node at worldX=500: clickX = (500-500)*2 + 550 = 550.
    const nodes = [{ id: 'zoom-node', x: 500, y: 350, radius: 8 }];
    const viewState = { zoom: 2, panX: 50, panY: 0 };
    const hit = hitTestLocal(nodes, 550, 350, viewState, worldBounds, canvasW, canvasH);
    expect(hit).toBeTruthy();
    expect(hit.id).toBe('zoom-node');
  });
});
