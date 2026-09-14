import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const V6_PATH = resolve(__dirname, '../.v6-frq-decomp-block.js');

function loadV6(fakeWindow) {
  const src = readFileSync(V6_PATH, 'utf8');

  new Function('window', src)(fakeWindow);

  return fakeWindow.__studyGuideV6__;
}

function makeFakeWindow(decomps) {
  return {
    FRQ_DECOMPOSITIONS: decomps || {}
  };
}

function makeState() {
  const state = { units: {} };
  let unit;

  for (unit = 1; unit <= 9; unit += 1) {
    state.units[unit] = {};
  }

  return state;
}

function makeHelpers(overrides = {}) {
  return {
    formulasViewed: [],
    mcqDrills: {},
    confirmed: false,
    activeDrillQuestionId: null,
    ...overrides
  };
}

const sampleDecomp = {
  unit: 1,
  topic: 'test topic',
  skills: [
    {
      id: 'u1-frq-a',
      name: 'Skill A',
      whyItMatters: 'x',
      supportingFormulas: ['zscore'],
      supportingMcqIds: ['U1-L10-Q02']
    },
    {
      id: 'u1-frq-b',
      name: 'Skill B',
      whyItMatters: 'y',
      supportingFormulas: ['empirical-rule', 'zscore'],
      supportingMcqIds: ['U1-L10-Q05']
    }
  ],
  maxPenalty: 0.50
};

let fakeWindow;
let api;
let state;

beforeEach(() => {
  fakeWindow = makeFakeWindow({
    'U1-PC-FRQ-Q02': sampleDecomp
  });
  api = loadV6(fakeWindow);
  state = makeState();
});

describe('getFrqDecomposition', () => {
  it('returns null when window.FRQ_DECOMPOSITIONS is undefined', () => {
    const localApi = loadV6({});

    expect(localApi.getFrqDecomposition('U1-PC-FRQ-Q02')).toBeNull();
  });

  it('returns null when FRQ_DECOMPOSITIONS is empty and questionId is not found', () => {
    const localApi = loadV6(makeFakeWindow({}));

    expect(localApi.getFrqDecomposition('missing-question')).toBeNull();
  });

  it('returns the entry when questionId matches', () => {
    expect(api.getFrqDecomposition('U1-PC-FRQ-Q02')).toEqual(sampleDecomp);
  });

  it('returns null when questionId is an empty string', () => {
    expect(api.getFrqDecomposition('')).toBeNull();
  });

  it('returns null when questionId is not a string', () => {
    expect(api.getFrqDecomposition(42)).toBeNull();
  });
});

describe('recordHelperUsed', () => {
  it('initializes frqHelpers if absent from unit state', () => {
    api.recordHelperUsed(1, 'formula', 'zscore', state);

    expect(state.units[1].frqHelpers).toEqual({
      formulasViewed: ['zscore'],
      mcqDrills: {},
      confirmed: false,
      activeDrillQuestionId: null
    });
  });

  it('deduplicates formulasViewed when the same formula is recorded twice', () => {
    api.recordHelperUsed(1, 'formula', 'zscore', state);
    api.recordHelperUsed(1, 'formula', 'zscore', state);

    expect(state.units[1].frqHelpers.formulasViewed).toEqual(['zscore']);
  });

  it('keeps mcq-correct as a single correct entry when recorded twice', () => {
    api.recordHelperUsed(1, 'mcq-correct', 'U1-L10-Q02', state);
    api.recordHelperUsed(1, 'mcq-correct', 'U1-L10-Q02', state);

    expect(state.units[1].frqHelpers.mcqDrills).toEqual({
      'U1-L10-Q02': 'correct'
    });
  });

  it('does not let mcq-wrong overwrite an existing correct entry', () => {
    api.recordHelperUsed(1, 'mcq-correct', 'U1-L10-Q02', state);
    api.recordHelperUsed(1, 'mcq-wrong', 'U1-L10-Q02', state);

    expect(state.units[1].frqHelpers.mcqDrills['U1-L10-Q02']).toBe('correct');
  });

  it('does not let mcq-correct overwrite an existing wrong entry', () => {
    api.recordHelperUsed(1, 'mcq-wrong', 'U1-L10-Q02', state);
    api.recordHelperUsed(1, 'mcq-correct', 'U1-L10-Q02', state);

    expect(state.units[1].frqHelpers.mcqDrills['U1-L10-Q02']).toBe('wrong');
  });

  it('accumulates multiple different formulaIds in formulasViewed', () => {
    api.recordHelperUsed(1, 'formula', 'zscore', state);
    api.recordHelperUsed(1, 'formula', 'empirical-rule', state);

    expect(state.units[1].frqHelpers.formulasViewed).toEqual(['zscore', 'empirical-rule']);
  });

  it('initializes confirmed as false and leaves it unchanged', () => {
    api.recordHelperUsed(1, 'mcq-correct', 'U1-L10-Q02', state);

    expect(state.units[1].frqHelpers.confirmed).toBe(false);
  });
});

describe('computeEffectivePenalty', () => {
  it('returns 0 when frqHelpers is null', () => {
    expect(api.computeEffectivePenalty(null, sampleDecomp)).toBe(0);
  });

  it('returns 0 when decomposition is null', () => {
    expect(api.computeEffectivePenalty(makeHelpers(), null)).toBe(0);
  });

  it('returns 0 when formulasViewed and mcqDrills are both empty', () => {
    expect(api.computeEffectivePenalty(makeHelpers(), sampleDecomp)).toBe(0);
  });

  it('adds 0.05 for a formula used in supportingFormulas', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({ formulasViewed: ['empirical-rule'] }),
      sampleDecomp
    );

    expect(penalty).toBe(0.05);
  });

  it('adds 0 for a formula not present in any supportingFormulas list', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({ formulasViewed: ['mean'] }),
      sampleDecomp
    );

    expect(penalty).toBe(0);
  });

  it('counts a shared formulaId across skills only once', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({ formulasViewed: ['zscore'] }),
      sampleDecomp
    );

    expect(penalty).toBe(0.05);
  });

  it('adds 0.10 for a correct MCQ drill', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({
        mcqDrills: {
          'U1-L10-Q02': 'correct'
        }
      }),
      sampleDecomp
    );

    expect(penalty).toBe(0.10);
  });

  it('adds 0.15 for a wrong MCQ drill', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({
        mcqDrills: {
          'U1-L10-Q02': 'wrong'
        }
      }),
      sampleDecomp
    );

    expect(penalty).toBe(0.15);
  });

  it('accumulates penalties across formulas and MCQ drills', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({
        formulasViewed: ['empirical-rule'],
        mcqDrills: {
          'U1-L10-Q02': 'correct',
          'U1-L10-Q05': 'wrong'
        }
      }),
      sampleDecomp
    );

    expect(penalty).toBeCloseTo(0.30, 10);
  });

  it('caps the total penalty at maxPenalty', () => {
    const penalty = api.computeEffectivePenalty(
      makeHelpers({
        formulasViewed: ['zscore', 'empirical-rule'],
        mcqDrills: {
          q1: 'correct',
          q2: 'wrong',
          q3: 'wrong',
          q4: 'wrong'
        }
      }),
      sampleDecomp
    );

    expect(penalty).toBe(0.50);
  });
});

describe('computeEffectivePenalty — session 82 always-scored simplification', () => {
  it('computeEffectivePenalty signature takes only frqHelpers and decomposition', () => {
    // The function must accept exactly 2 params — no mode argument.
    expect(api.computeEffectivePenalty.length).toBe(2);
  });

  it('computeEffectivePenalty always computes penalty from helpers — no mode early return', () => {
    const helpers = makeHelpers({
      formulasViewed: ['zscore'],
      mcqDrills: { 'U1-L10-Q02': 'correct' }
    });

    // zscore penalty: 0.05, correct drill: 0.10 = 0.15 total
    const penalty = api.computeEffectivePenalty(helpers, sampleDecomp);
    expect(penalty).toBeCloseTo(0.15, 10);
  });

  it('backwards-compat: passing a third arg is silently ignored', () => {
    const helpers = makeHelpers({ formulasViewed: ['zscore'] });

    // Passing 'practice' as the old mode arg must NOT return 0 — the mode is ignored.
    const withThirdArg = api.computeEffectivePenalty(helpers, sampleDecomp, 'practice');
    const withoutArg = api.computeEffectivePenalty(helpers, sampleDecomp);

    expect(withThirdArg).toBe(withoutArg);
    expect(withThirdArg).toBeGreaterThan(0);
  });
});

describe('computeEffectiveScore', () => {
  it('returns full credit for E with zero penalty', () => {
    expect(api.computeEffectiveScore('E', 0)).toEqual({
      raw: 'E',
      rawNumeric: 1.0,
      effective: 1.0,
      penaltyPct: 0,
      breakdown: []
    });
  });

  it('applies a 10 percent penalty to E', () => {
    expect(api.computeEffectiveScore('E', 0.10)).toEqual({
      raw: 'E',
      rawNumeric: 1.0,
      effective: 0.90,
      penaltyPct: 10,
      breakdown: []
    });
  });

  it('computes the effective score for P with a 0.20 penalty', () => {
    const result = api.computeEffectiveScore('P', 0.20);

    expect(result.rawNumeric).toBe(0.6);
    expect(result.effective).toBe(0.48);
    expect(result.penaltyPct).toBe(20);
  });

  it('computes the effective score for I with a 0.30 penalty', () => {
    const result = api.computeEffectiveScore('I', 0.30);

    expect(result.rawNumeric).toBe(0.2);
    expect(result.effective).toBe(0.14);
    expect(result.penaltyPct).toBe(30);
  });

  it('returns null score values for paper mode', () => {
    expect(api.computeEffectiveScore('paper', 0.50)).toEqual({
      raw: 'paper',
      rawNumeric: null,
      effective: null,
      penaltyPct: 0,
      breakdown: []
    });
  });

  it('treats an unknown score as I', () => {
    expect(api.computeEffectiveScore('X', 0.10)).toEqual({
      raw: 'I',
      rawNumeric: 0.2,
      effective: 0.18,
      penaltyPct: 10,
      breakdown: []
    });
  });

  it('rounds penaltyPct to the nearest integer', () => {
    expect(api.computeEffectiveScore('E', 0.333).penaltyPct).toBe(33);
  });

  it('always returns an empty breakdown array', () => {
    expect(api.computeEffectiveScore('P', 0.25).breakdown).toEqual([]);
  });
});

describe('session 89 workstream B — skill.penalty stripped', () => {
  const JSON_PATH = resolve(__dirname, '../data/frq-decompositions.json');
  const rawDecomps = JSON.parse(readFileSync(JSON_PATH, 'utf8'));

  it('frq-decompositions.json parses as valid JSON', () => {
    expect(typeof rawDecomps).toBe('object');
    expect(rawDecomps).not.toBeNull();
  });

  it('every skill in frq-decompositions.json does NOT have a penalty field', () => {
    const keys = Object.keys(rawDecomps);

    for (const questionId of keys) {
      const { skills } = rawDecomps[questionId];

      if (Array.isArray(skills)) {
        for (const skill of skills) {
          expect(
            Object.prototype.hasOwnProperty.call(skill, 'penalty'),
            `skill ${skill.id} in ${questionId} should not have penalty`
          ).toBe(false);
        }
      }
    }
  });

  it('all 9 FRQ question keys are present', () => {
    const expected = [
      'U1-PC-FRQ-Q02',
      'U2-PC-FRQ-Q02',
      'U3-PC-FRQ-Q01',
      'U4-PC-FRQ-Q02',
      'U5-PC-FRQ-Q02',
      'U6-PC-FRQ-Q01',
      'U7-PC-FRQ-Q02',
      'U8-PC-FRQ-Q01',
      'U9-PC-FRQ-Q01'
    ];

    for (const key of expected) {
      expect(Object.prototype.hasOwnProperty.call(rawDecomps, key), `key ${key} should exist`).toBe(true);
    }
  });

  it('total skill count across all FRQs is 31', () => {
    let total = 0;

    for (const questionId of Object.keys(rawDecomps)) {
      const { skills } = rawDecomps[questionId];

      if (Array.isArray(skills)) {
        total += skills.length;
      }
    }

    expect(total).toBe(31);
  });

  it('every skill has a non-empty whyItMatters string', () => {
    for (const questionId of Object.keys(rawDecomps)) {
      const { skills } = rawDecomps[questionId];

      if (Array.isArray(skills)) {
        for (const skill of skills) {
          expect(typeof skill.whyItMatters).toBe('string');
          expect(skill.whyItMatters.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
