import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGIC_PATH = resolve(__dirname, '../docs/apstats-history/dotfiles/.v4-logic-block.js');

function loadLogic(fakeWindow) {
  const src = readFileSync(LOGIC_PATH, 'utf8');
  new Function('window', src)(fakeWindow);
  return fakeWindow.__studyGuideV4__;
}

function makeFakeWindow(extra = {}) {
  return {
    AP_STATS_CARTRIDGE: {
      commands: [
        { id: 'phat-sd', action: 'Sampling Distribution SD of p-hat', tier: 'core', dom: 'inf-proportions' },
        { id: 'corr-r', action: 'Correlation Coefficient (r)', tier: 'regular', dom: 'descriptive' },
        { id: 'slope-t', action: 'Regression slope t statistic', tier: 'power', dom: 'regression' },
        { id: 'margin-error', action: 'Margin of Error', tier: 'support', dom: 'inference' }
      ]
    },
    FORMULA_PROBE_MAP: {
      map: {
        'phat-sd': { questionIds: ['U5-L5-Q01'], notes: '' },
        'corr-r': { questionIds: ['U2-L5-Q02'], notes: '' },
        'slope-t': { questionIds: ['U9-L5-Q02'], notes: '' },
        'margin-error': { questionIds: [], notes: 'GAP (use supplement)' }
      }
    },
    EMBEDDED_CURRICULUM_SUPPLEMENT: [
      { id: 'U7-L2-QS1', type: 'multiple-choice', formulaId: 'margin-error', prompt: 'stub', answerKey: 'B', attachments: { choices: [] } }
    ],
    BKT: {
      updateMastery: (prior, correct) => correct ? Math.min(0.99, prior + 0.2) : Math.max(0.01, prior - 0.1),
      DEFAULT_PARAMS: { pInit: 0.3 }
    },
    ...extra
  };
}

function emptyState() {
  return { touchedFormulas: {}, dailyDose: null, units: {} };
}

const TODAY = '2026-04-13';
const EXAM_DATE = '2026-05-07';

let api;
let state;

beforeEach(() => {
  expect(existsSync(LOGIC_PATH)).toBe(true);
  api = loadLogic(makeFakeWindow());
  state = emptyState();
  expect(api).toBeTruthy();
});

describe('daysLeft', () => {
  it('returns the number of days until the exam', () => {
    expect(api.daysLeft('2026-04-13', '2026-05-07')).toBe(24);
  });

  it('floors same-day inputs to one day', () => {
    expect(api.daysLeft('2026-05-07', '2026-05-07')).toBe(1);
  });

  it('floors past-due inputs to one day', () => {
    expect(api.daysLeft('2026-05-08', '2026-05-07')).toBe(1);
  });

  it('floors invalid dates to one day', () => {
    expect(api.daysLeft('garbage', '2026-05-07')).toBe(1);
  });
});

describe('computeDailyDose', () => {
  it('rounds up the remaining work per day', () => {
    expect(api.computeDailyDose(81, 24)).toBe(4);
  });

  it('returns the exact dose when one day remains', () => {
    expect(api.computeDailyDose(5, 1)).toBe(5);
  });

  it('clamps to the maximum dose', () => {
    expect(api.computeDailyDose(500, 1)).toBe(12);
  });

  it('clamps to the minimum dose', () => {
    expect(api.computeDailyDose(10, 100)).toBe(3);
  });

  it('keeps the minimum floor even when nothing remains', () => {
    expect(api.computeDailyDose(0, 24)).toBe(3);
  });
});

describe('formulaWeight', () => {
  it('uses the default BKT init mastery for untouched formulas', () => {
    const weight = api.formulaWeight('phat-sd', state);
    expect(weight).toBeCloseTo(0.266, 3);
  });

  it('uses the touched formula mastery when present', () => {
    state.touchedFormulas['phat-sd'] = { firstTouchedAt: TODAY, lastMastery: 0.8 };
    const weight = api.formulaWeight('phat-sd', state);
    expect(weight).toBeCloseTo(0.076, 3);
  });

  it('returns zero for unknown formulas', () => {
    expect(api.formulaWeight('nonexistent-formula', state)).toBe(0);
  });
});

describe('formulaMastery', () => {
  it('returns the BKT init value for untouched formulas', () => {
    expect(api.formulaMastery('phat-sd', state)).toBe(0.3);
  });

  it('returns the last touched mastery when present', () => {
    state.touchedFormulas['phat-sd'] = { firstTouchedAt: TODAY, lastMastery: 0.65 };
    expect(api.formulaMastery('phat-sd', state)).toBe(0.65);
  });
});

describe('recordFormulaTouch', () => {
  it('creates the first touch entry with mastery and a date', () => {
    api.recordFormulaTouch('phat-sd', true, state);

    expect(state.touchedFormulas['phat-sd']).toEqual(expect.objectContaining({
      lastMastery: expect.any(Number),
      firstTouchedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    }));
    expect(state.touchedFormulas['phat-sd'].lastMastery).toBeGreaterThan(0.3);
  });

  it('updates mastery but preserves firstTouchedAt on later touches', () => {
    api.recordFormulaTouch('phat-sd', true, state);
    const firstTouchedAt = state.touchedFormulas['phat-sd'].firstTouchedAt;
    const firstMastery = state.touchedFormulas['phat-sd'].lastMastery;

    api.recordFormulaTouch('phat-sd', false, state);

    expect(state.touchedFormulas['phat-sd'].firstTouchedAt).toBe(firstTouchedAt);
    expect(state.touchedFormulas['phat-sd'].lastMastery).not.toBe(firstMastery);
  });
});

describe('touchedFormulaCount', () => {
  it('returns zero for an empty state', () => {
    expect(api.touchedFormulaCount(state, 'core')).toBe(0);
  });

  it('counts touched formulas by tier', () => {
    api.recordFormulaTouch('phat-sd', true, state);

    expect(api.touchedFormulaCount(state, 'core')).toBe(1);
    expect(api.touchedFormulaCount(state, 'regular')).toBe(0);
  });
});

describe('pickProbeForFormula', () => {
  it('returns the mapped main-curriculum probe shape', () => {
    expect(api.pickProbeForFormula('phat-sd', state)).toEqual({
      formulaId: 'phat-sd',
      questionId: 'U5-L5-Q01',
      unit: 5,
      lesson: 5,
      tier: 'core'
    });
  });

  it('falls back to the supplement probe when needed', () => {
    expect(api.pickProbeForFormula('margin-error', state)).toEqual({
      formulaId: 'margin-error',
      questionId: 'U7-L2-QS1',
      unit: 7,
      lesson: 2,
      tier: 'support'
    });
  });

  it('returns null for unknown formulas', () => {
    expect(api.pickProbeForFormula('nonexistent-formula', state)).toBeNull();
  });
});

describe('pickDailyQueue', () => {
  it('builds a queue sized to the computed daily dose with complete entries', () => {
    const dailyDose = api.pickDailyQueue(state, TODAY, EXAM_DATE);

    expect(dailyDose.date).toBe(TODAY);
    expect(dailyDose.queue.length).toBeGreaterThanOrEqual(3);
    expect(dailyDose.queue.length).toBeLessThanOrEqual(4);
    expect(dailyDose.queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        formulaId: expect.any(String),
        questionId: expect.any(String),
        unit: expect.any(Number),
        lesson: expect.any(Number),
        tier: expect.any(String)
      })
    ]));
  });

  it('reuses the existing queue for the same day', () => {
    const existingQueue = [
      { formulaId: 'phat-sd', questionId: 'U5-L5-Q01', unit: 5, lesson: 5, tier: 'core' }
    ];
    state.dailyDose = { date: TODAY, queue: existingQueue, completed: [] };

    const dailyDose = api.pickDailyQueue(state, TODAY, EXAM_DATE);

    expect(dailyDose.queue).toEqual(existingQueue);
    expect(dailyDose.date).toBe(TODAY);
  });

  it('regenerates the queue when the day changes', () => {
    state.dailyDose = {
      date: '2026-04-12',
      queue: [{ formulaId: 'margin-error', questionId: 'U7-L2-QS1', unit: 7, lesson: 2, tier: 'support' }],
      completed: []
    };

    const dailyDose = api.pickDailyQueue(state, TODAY, EXAM_DATE);

    expect(dailyDose.date).toBe(TODAY);
    expect(dailyDose.queue.length).toBeGreaterThanOrEqual(3);
    expect(dailyDose.queue.length).toBeLessThanOrEqual(4);
  });
});

describe('coverage floor invariant', () => {
  it('prioritizes untouched core or regular formulas before power or support', () => {
    const dailyDose = api.pickDailyQueue(state, TODAY, EXAM_DATE);

    expect(['phat-sd', 'corr-r']).toContain(dailyDose.queue[0].formulaId);
    expect(['slope-t', 'margin-error']).not.toContain(dailyDose.queue[0].formulaId);
  });

  it('allows power or support formulas once core and regular formulas are touched', () => {
    api.recordFormulaTouch('phat-sd', true, state);
    api.recordFormulaTouch('corr-r', true, state);
    state.dailyDose = null;

    const dailyDose = api.pickDailyQueue(state, TODAY, EXAM_DATE);
    const formulaIds = dailyDose.queue.map((entry) => entry.formulaId);

    expect(formulaIds.some((formulaId) => formulaId === 'slope-t' || formulaId === 'margin-error')).toBe(true);
  });
});
