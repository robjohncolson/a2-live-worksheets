// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const MODULE_URL = new URL('./flashcard-flags.js', import.meta.url);
const DATA_URL = new URL('../data/flashcard-flags.json', import.meta.url);
const SOURCE = readFileSync(MODULE_URL, 'utf8');

function makeFlags(overrides) {
  return {
    version: 1,
    flags: {
      reviewMode: {
        enabled: false,
        allowUsernames: [],
        allowSections: [],
        urlParam: 'fcReview',
        ...(overrides || {})
      }
    }
  };
}

function makeStorage(values) {
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    }
  };
}

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

  return window.FlashcardFlags;
}

let FlashcardFlags;

beforeAll(async () => {
  delete globalThis.FlashcardFlags;
  await import('./flashcard-flags.js');
  FlashcardFlags = globalThis.FlashcardFlags;
});

describe('flashcard-flags module loading', () => {
  it('attaches the API to globalThis when imported in vitest', () => {
    expect(FlashcardFlags).toBeDefined();
    expect(typeof FlashcardFlags.resolveFlag).toBe('function');
    expect(typeof FlashcardFlags.resolveAll).toBe('function');
    expect(typeof FlashcardFlags.loadFlags).toBe('function');
  });

  it('populates module.exports in a CommonJS context', () => {
    expect(typeof loadCommonJsApi().resolveFlag).toBe('function');
  });

  it('attaches window.FlashcardFlags in a browser-like context', () => {
    expect(typeof loadBrowserApi().resolveAll).toBe('function');
  });
});

describe('resolveFlag', () => {
  it('uses the enabled value when no earlier rule matches', () => {
    expect(FlashcardFlags.resolveFlag(makeFlags({ enabled: true }), 'reviewMode', {})).toBe(true);
    expect(FlashcardFlags.resolveFlag(makeFlags({ enabled: false }), 'reviewMode', {})).toBe(false);
  });

  it('enables a flag for an allowed username', () => {
    const flags = makeFlags({ allowUsernames: ['ada'] });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', { username: 'ada' })).toBe(true);
    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', { username: 'grace' })).toBe(false);
  });

  it('enables a flag for an allowed section', () => {
    const flags = makeFlags({ allowSections: ['period-2'] });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', { section: 'period-2' })).toBe(true);
    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', { section: 'period-3' })).toBe(false);
  });

  it('lets a URL =1 override enable the flag', () => {
    const flags = makeFlags({ enabled: false });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', {
      search: '?unrelated=1&fcReview=1'
    })).toBe(true);
  });

  it('ignores URL =0 and continues through the remaining resolution rules', () => {
    const flags = makeFlags({
      enabled: true,
      allowUsernames: ['ada'],
      allowSections: ['period-2']
    });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', {
      search: '?fcReview=0',
      username: 'ada',
      section: 'period-2'
    })).toBe(true);
  });

  it('lets the kill switch beat a URL =1 and allow-list matches', () => {
    const flags = makeFlags({
      enabled: true,
      allowUsernames: ['ada'],
      allowSections: ['period-2'],
      killSwitchKey: 'a2_fc_review_off'
    });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', {
      search: '?fcReview=1',
      username: 'ada',
      section: 'period-2',
      storage: makeStorage({ a2_fc_review_off: '1' })
    })).toBe(false);
  });

  it('only treats the exact kill-switch value 1 as enabled', () => {
    const flags = makeFlags({
      enabled: true,
      killSwitchKey: 'a2_fc_review_off'
    });

    expect(FlashcardFlags.resolveFlag(flags, 'reviewMode', {
      storage: makeStorage({ a2_fc_review_off: '0' })
    })).toBe(true);
  });

  it('returns false for unknown flags and malformed JSON', () => {
    expect(FlashcardFlags.resolveFlag(makeFlags(), 'missingFlag', {})).toBe(false);
    expect(FlashcardFlags.resolveFlag(null, 'reviewMode', {})).toBe(false);
    expect(FlashcardFlags.resolveFlag({}, 'reviewMode', {})).toBe(false);
    expect(FlashcardFlags.resolveFlag('{not json', 'reviewMode', {})).toBe(false);
    expect(FlashcardFlags.resolveFlag({ flags: { reviewMode: null } }, 'reviewMode', {})).toBe(false);
  });
});

describe('resolveAll', () => {
  it('resolves every known flag into a boolean map', () => {
    const flags = makeFlags();
    flags.flags.choicePermutation = {
      enabled: true,
      allowUsernames: [],
      allowSections: [],
      urlParam: 'fcPerm'
    };

    expect(FlashcardFlags.resolveAll(flags, { search: '?fcReview=1' })).toEqual({
      reviewMode: true,
      choicePermutation: true
    });
    expect(FlashcardFlags.resolveAll('{not json', {})).toEqual({});
  });
});

describe('loadFlags', () => {
  it('fetches the cache-busted flags file without cache and returns parsed JSON', async () => {
    const payload = makeFlags();
    const fetchImpl = vi.fn(function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve(payload);
        }
      });
    });

    await expect(FlashcardFlags.loadFlags(fetchImpl, 'build 42')).resolves.toBe(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      'data/flashcard-flags.json?v=build%2042',
      { cache: 'no-cache' }
    );
  });

  it('falls back when fetching rejects', async () => {
    const fetchImpl = function () {
      return Promise.reject(new Error('offline'));
    };

    await expect(FlashcardFlags.loadFlags(fetchImpl, '42')).resolves.toEqual({
      version: 0,
      flags: {}
    });
  });

  it('falls back when the response is unsuccessful or cannot be parsed', async () => {
    const badStatus = function () {
      return Promise.resolve({ ok: false });
    };
    const badJson = function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.reject(new Error('invalid JSON'));
        }
      });
    };

    await expect(FlashcardFlags.loadFlags(badStatus, '42')).resolves.toEqual({
      version: 0,
      flags: {}
    });
    await expect(FlashcardFlags.loadFlags(badJson, '42')).resolves.toEqual({
      version: 0,
      flags: {}
    });
  });

  it('falls back when a successful parse has no flags object', async () => {
    const malformedSuccess = function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve({ version: 1, flags: [] });
        }
      });
    };

    await expect(FlashcardFlags.loadFlags(malformedSuccess, '42')).resolves.toEqual({
      version: 0,
      flags: {}
    });
  });

  it('falls back when the injected fetch throws synchronously', async () => {
    const fetchImpl = function () {
      throw new Error('unavailable');
    };

    await expect(FlashcardFlags.loadFlags(fetchImpl, '42')).resolves.toEqual({
      version: 0,
      flags: {}
    });
  });
});

describe('data/flashcard-flags.json', () => {
  it('defines the complete frozen flag schema and rollout defaults', () => {
    const data = JSON.parse(readFileSync(DATA_URL, 'utf8'));
    const expectedParams = {
      reviewMode: 'fcReview',
      dueTodayDeck: 'fcDue',
      choicePermutation: 'fcPerm',
      readinessBadge: 'fcReady',
      quickRetryRedraw: 'fcRedraw',
      flashcardSync: 'fcSync'
    };

    expect(data.version).toBe(1);
    expect(Object.keys(data.flags)).toEqual(Object.keys(expectedParams));

    for (const [name, urlParam] of Object.entries(expectedParams)) {
      const flag = data.flags[name];

      expect(flag).toHaveProperty('enabled');
      expect(flag.allowUsernames).toEqual([]);
      expect(flag.allowSections).toEqual([]);
      expect(flag.urlParam).toBe(urlParam);
      // Teacher decision 2026-08-18: every flag ON. flashcardSync fails closed
      // client-side until TRAINER_DECK_ALLOWLIST includes ap-stats-flashcards.
      expect(flag.enabled).toBe(true);
    }

    expect(data.flags.choicePermutation.killSwitchKey).toBe('a2_fc_perm_off');
  });
});
