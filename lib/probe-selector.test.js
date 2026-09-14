// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const MODULE_URL = new URL('./probe-selector.js', import.meta.url);
const SOURCE = readFileSync(MODULE_URL, 'utf8');

function loadCommonJsApi() {
  const context = createContext({
    module: { exports: {} },
    exports: {},
    globalThis: {}
  });

  runInContext(SOURCE, context);

  return context.module.exports;
}

function loadBrowserApi() {
  const window = {};
  const context = createContext({
    window,
    self: window,
    globalThis: window
  });

  runInContext(SOURCE, context);

  return window.ProbeSelector;
}

function mcq(id, type = 'multiple-choice') {
  return { id, type, prompt: id, attachments: { choices: [] } };
}

const mockCurriculum = [
  mcq('U1-L1-Q01'),
  mcq('U1-L2-Q01'),
  mcq('U1-L3-Q01'),
  mcq('U1-L4-Q01'),
  mcq('U1-L5-Q01'),
  mcq('U1-L6-Q01'),
  mcq('U2-L1-Q01'),
  mcq('U1-L7-FRQ1', 'free-response')
];

const mockTagMap = {
  questions: {
    'U1-L1-Q01': { unit: 1, lesson: 1, primaryLoId: 'VAR-1.A', secondaryLoIds: [] },
    'U1-L2-Q01': { unit: 1, lesson: 2, primaryLoId: 'VAR-1.A', secondaryLoIds: [] },
    'U1-L3-Q01': { unit: 1, lesson: 3, primaryLoId: 'VAR-1.B', secondaryLoIds: [] },
    'U1-L4-Q01': { unit: 1, lesson: 4, primaryLoId: 'VAR-1.C', secondaryLoIds: [] },
    'U1-L5-Q01': { unit: 1, lesson: 5, primaryLoId: 'VAR-1.D', secondaryLoIds: [] },
    'U2-L1-Q01': { unit: 2, lesson: 1, primaryLoId: 'DAT-2.A', secondaryLoIds: [] }
  }
};

const stubBkt = {
  expectedInfoGain(state, loIds) {
    return loIds.reduce((sum, loId) => sum + (1 - (state[loId] ?? 0.5)), 0);
  }
};

function selectProbes(ProbeSelector, overrides = {}) {
  return ProbeSelector.selectProbes({
    unit: 1,
    count: 3,
    masteryState: {},
    tagMap: mockTagMap,
    curriculum: mockCurriculum,
    alreadyAnswered: new Set(),
    BKT: stubBkt,
    ...overrides
  });
}

let ProbeSelector;

beforeAll(async () => {
  delete globalThis.ProbeSelector;
  await import('./probe-selector.js');
  ProbeSelector = globalThis.ProbeSelector;
});

describe('probe-selector module loading', () => {
  it('attaches the API to globalThis when imported', () => {
    expect(ProbeSelector).toBeDefined();
    expect(typeof ProbeSelector.selectProbes).toBe('function');
  });

  it('populates module.exports in a CommonJS context', () => {
    const api = loadCommonJsApi();

    expect(api).toBeDefined();
    expect(typeof api.selectProbes).toBe('function');
  });

  it('attaches window.ProbeSelector in a browser-like script context', () => {
    const api = loadBrowserApi();

    expect(api).toBeDefined();
    expect(typeof api.selectProbes).toBe('function');
  });
});

describe('selectProbes', () => {
  it('returns exactly count probes when enough candidates exist', () => {
    expect(selectProbes(ProbeSelector, { count: 3 })).toHaveLength(3);
  });

  it('spreads tied picks across different primary LOs', () => {
    const picks = selectProbes(ProbeSelector, {
      masteryState: {
        'VAR-1.A': 0.5,
        'VAR-1.B': 0.5,
        'VAR-1.C': 0.5,
        'VAR-1.D': 0.5
      }
    });
    const primaryLos = picks.map((pick) => mockTagMap.questions[pick.question.id].primaryLoId);

    expect(new Set(primaryLos).size).toBe(3);
  });

  it('puts the low-mastery LO first when it has the highest information gain', () => {
    const picks = selectProbes(ProbeSelector, {
      masteryState: {
        'VAR-1.A': 0.1,
        'VAR-1.B': 0.9,
        'VAR-1.C': 0.9,
        'VAR-1.D': 0.9
      }
    });

    expect(mockTagMap.questions[picks[0].question.id].primaryLoId).toBe('VAR-1.A');
  });

  it('never returns already answered questions', () => {
    const picks = selectProbes(ProbeSelector, {
      count: 4,
      alreadyAnswered: new Set(['U1-L1-Q01', 'U1-L3-Q01'])
    });
    const ids = picks.map((pick) => pick.question.id);

    expect(ids.includes('U1-L1-Q01')).toBe(false);
    expect(ids.includes('U1-L3-Q01')).toBe(false);
  });

  it('returns all available candidates when fewer are tagged than requested', () => {
    const picks = ProbeSelector.selectProbes({
      unit: 3,
      count: 5,
      masteryState: {},
      tagMap: {
        questions: {
          'U3-L1-Q01': { unit: 3, lesson: 1, primaryLoId: 'INF-3.A', secondaryLoIds: [] },
          'U3-L2-Q01': { unit: 3, lesson: 2, primaryLoId: 'INF-3.B', secondaryLoIds: [] }
        }
      },
      curriculum: [mcq('U3-L1-Q01'), mcq('U3-L2-Q01')],
      alreadyAnswered: new Set(),
      BKT: stubBkt
    });

    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((pick) => pick.question.id)).size).toBe(2);
  });

  it('is deterministic for identical inputs', () => {
    const first = selectProbes(ProbeSelector, { count: 4 }).map((pick) => pick.question.id);
    const second = selectProbes(ProbeSelector, { count: 4 }).map((pick) => pick.question.id);

    expect(second).toEqual(first);
  });

  it('returns an empty array when the requested unit has no MCQs', () => {
    expect(selectProbes(ProbeSelector, { unit: 9 })).toEqual([]);
  });

  it('skips untagged questions without throwing', () => {
    const picks = selectProbes(ProbeSelector, { count: 6 });
    const ids = picks.map((pick) => pick.question.id);

    expect(ids.includes('U1-L6-Q01')).toBe(false);
    expect(picks).toHaveLength(5);
  });
});
