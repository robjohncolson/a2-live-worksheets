// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const MODULE_URL = new URL('./bkt.js', import.meta.url);
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

  return window.BKT;
}

let BKT;

beforeAll(async () => {
  delete globalThis.BKT;
  await import('./bkt.js');
  BKT = globalThis.BKT;
});

describe('bkt module loading', () => {
  it('attaches the API to globalThis when imported in vitest', () => {
    expect(BKT).toBeDefined();
    expect(typeof BKT.updateMastery).toBe('function');
    expect(BKT.DEFAULT_PARAMS).toEqual({
      pInit: 0.3,
      pTransit: 0.0,
      pSlip: 0.1,
      pGuess: 0.25
    });
  });

  it('populates module.exports in a CommonJS context', () => {
    const api = loadCommonJsApi();

    expect(api).toBeDefined();
    expect(typeof api.predictCorrect).toBe('function');
    expect(typeof api.expectedInfoGain).toBe('function');
  });

  it('attaches window.BKT in a browser-like script context', () => {
    const api = loadBrowserApi();

    expect(api).toBeDefined();
    expect(typeof api.initMasteryState).toBe('function');
  });
});

describe('updateMastery', () => {
  it('increases mastery after a correct answer', () => {
    expect(BKT.updateMastery(0.5, true)).toBeGreaterThan(0.5);
  });

  it('decreases mastery after an incorrect answer', () => {
    expect(BKT.updateMastery(0.5, false)).toBeLessThan(0.5);
  });

  it('keeps a high-mastery state resilient after a likely slip', () => {
    expect(BKT.updateMastery(0.99, false)).toBeGreaterThan(0.9);
  });

  it('keeps a low-mastery state skeptical after a likely guess', () => {
    expect(BKT.updateMastery(0.01, true)).toBeLessThan(0.1);
  });

  it('is monotonic for correct evidence as the prior increases', () => {
    expect(BKT.updateMastery(0.4, true)).toBeLessThan(BKT.updateMastery(0.6, true));
  });

  it('approaches zero asymptotically after repeated incorrect observations with no transit', () => {
    let afterTen = 0.5;
    let afterTwenty = 0.5;

    for (let i = 0; i < 10; i += 1) {
      afterTen = BKT.updateMastery(afterTen, false, { pTransit: 0 });
    }

    afterTwenty = afterTen;

    for (let i = 0; i < 10; i += 1) {
      afterTwenty = BKT.updateMastery(afterTwenty, false, { pTransit: 0 });
    }

    expect(afterTen).toBeLessThan(0.1);
    expect(afterTwenty).toBeLessThan(0.05);
    expect(afterTwenty).toBeGreaterThan(0);
  });

  it('returns valid numbers at mastery extremes', () => {
    const zeroPrior = BKT.updateMastery(0, true);
    const fullPrior = BKT.updateMastery(1, false);

    expect(Number.isFinite(zeroPrior)).toBe(true);
    expect(Number.isFinite(fullPrior)).toBe(true);
    expect(Number.isNaN(zeroPrior)).toBe(false);
    expect(Number.isNaN(fullPrior)).toBe(false);
  });
});

describe('expectedInfoGain', () => {
  it('is higher for uncertain LOs than for already-certain LOs', () => {
    const loIds = ['VAR-1.B', 'VAR-1.C'];
    const uncertainState = {
      'VAR-1.B': 0.5,
      'VAR-1.C': 0.5
    };
    const confidentState = {
      'VAR-1.B': 0.95,
      'VAR-1.C': 0.95
    };

    expect(BKT.expectedInfoGain(uncertainState, loIds)).toBeGreaterThan(
      BKT.expectedInfoGain(confidentState, loIds)
    );
  });
});

describe('uncertainty', () => {
  it('peaks around 0.5 and is zero at certainty', () => {
    expect(BKT.uncertainty(0.5)).toBeGreaterThan(BKT.uncertainty(0.1));
    expect(BKT.uncertainty(0.5)).toBeGreaterThan(BKT.uncertainty(0.9));
    expect(BKT.uncertainty(0)).toBe(0);
    expect(BKT.uncertainty(1)).toBe(0);
  });
});

describe('initMasteryState', () => {
  it('returns pInit for every unique LO across overlapping nodes', () => {
    const nodes = [
      { loIds: ['VAR-1.B', 'VAR-1.C'] },
      { loIds: ['VAR-1.C', 'VAR-1.D'] },
      { loIds: ['VAR-1.D', 'VAR-1.E'] }
    ];
    const state = BKT.initMasteryState(nodes);

    expect(state).toEqual({
      'VAR-1.B': 0.3,
      'VAR-1.C': 0.3,
      'VAR-1.D': 0.3,
      'VAR-1.E': 0.3
    });
  });
});

describe('predictCorrect', () => {
  it('matches the boundary and midpoint formulas', () => {
    expect(BKT.predictCorrect(0)).toBe(BKT.DEFAULT_PARAMS.pGuess);
    expect(BKT.predictCorrect(1)).toBe(1 - BKT.DEFAULT_PARAMS.pSlip);
    expect(BKT.predictCorrect(0.5)).toBeCloseTo(
      (0.5 * (1 - BKT.DEFAULT_PARAMS.pSlip)) +
      (0.5 * BKT.DEFAULT_PARAMS.pGuess),
      12
    );
  });
});
