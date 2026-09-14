// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const MODULE_URL = new URL('./flashcard-srs.js', import.meta.url);
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

  return window.FlashcardSrs;
}

function logEntry(overrides = {}) {
  return {
    topic: '4.1-2',
    qnum: 1,
    correct: true,
    latencyMs: 13000,
    wasTimeout: false,
    missIndex: 0,
    ts: 86400000,
    mode: 'full',
    csv: 'u4_l1_l2_blooket.csv',
    surface: 'desk',
    roundId: 'desk-1-abcd',
    seq: 0,
    ...overrides
  };
}

let FlashcardSrs;

beforeAll(async () => {
  delete globalThis.FlashcardSrs;
  await import('./flashcard-srs.js');
  FlashcardSrs = globalThis.FlashcardSrs;
});

describe('flashcard SRS module loading', () => {
  it('attaches the complete API and constants to globalThis', () => {
    expect(FlashcardSrs).toBeDefined();
    expect(FlashcardSrs.EASY_MS).toBe(12000);
    expect(FlashcardSrs.MAX_INTERVAL_DAYS).toBe(45);
    expect(FlashcardSrs.EASE_START).toBe(2500);
    expect(FlashcardSrs.EASE_MIN).toBe(1300);
    expect(FlashcardSrs.EASE_MAX).toBe(3000);
    expect(FlashcardSrs.EASE_DELTA).toEqual({
      again: -320,
      hard: -140,
      good: 0,
      easy: 100
    });
    expect(typeof FlashcardSrs.foldLog).toBe('function');
  });

  it('populates module.exports in a CommonJS context', () => {
    const api = loadCommonJsApi();

    expect(api.cardId('deck.csv', 4)).toBe('deck.csv#4');
    expect(typeof api.applyGrade).toBe('function');
  });

  it('attaches window.FlashcardSrs in a browser-like script context', () => {
    const api = loadBrowserApi();

    expect(api).toBeDefined();
    expect(typeof api.dueCards).toBe('function');
  });
});

describe('identity helpers', () => {
  it('builds card ids and stable normalized djb2 stem hashes', () => {
    expect(FlashcardSrs.cardId('u4.csv', 7)).toBe('u4.csv#7');
    expect(FlashcardSrs.stemHash('abc')).toBe('0b885c8b');
    expect(FlashcardSrs.stemHash('  A  B\nC  ')).toBe(
      FlashcardSrs.stemHash('a b c')
    );
    expect(FlashcardSrs.stemHash('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('uses UTC day indices', () => {
    expect(FlashcardSrs.dayIndex(0)).toBe(0);
    expect(FlashcardSrs.dayIndex(86400000 - 1)).toBe(0);
    expect(FlashcardSrs.dayIndex(86400000)).toBe(1);
    expect(FlashcardSrs.dayIndex(-1)).toBe(-1);
  });

  it('uses round and sequence ids before the legacy dedupe key', () => {
    expect(FlashcardSrs.entryKey(logEntry({ roundId: 'mobile-7-abcd', seq: 3 }))).toBe(
      'mobile-7-abcd#3'
    );
    expect(FlashcardSrs.entryKey({
      ts: 99,
      csv: '',
      topic: '4.1-2',
      qnum: 8
    })).toBe('99#4.1-2#8');
  });
});

describe('gradeOfOutcome', () => {
  it('honors every explicit review grade before all outcome fields', () => {
    ['again', 'hard', 'good', 'easy'].forEach((review) => {
      expect(FlashcardSrs.gradeOfOutcome({
        review,
        correct: false,
        wasTimeout: true,
        missIndex: 3,
        latencyMs: 999999
      })).toBe(review);
    });
  });

  it('maps timeout and incorrect outcomes to again', () => {
    expect(FlashcardSrs.gradeOfOutcome({
      correct: true,
      wasTimeout: true,
      missIndex: 0,
      latencyMs: 1
    })).toBe('again');
    expect(FlashcardSrs.gradeOfOutcome({
      correct: false,
      wasTimeout: false,
      missIndex: 0,
      latencyMs: 1
    })).toBe('again');
  });

  it('maps a correct retry to hard before considering latency', () => {
    expect(FlashcardSrs.gradeOfOutcome({
      correct: true,
      wasTimeout: false,
      missIndex: 1,
      latencyMs: 1
    })).toBe('hard');
  });

  it('maps clean correct outcomes at the easy boundary and above it', () => {
    expect(FlashcardSrs.gradeOfOutcome({
      correct: true,
      wasTimeout: false,
      missIndex: 0,
      latencyMs: 12000
    })).toBe('easy');
    expect(FlashcardSrs.gradeOfOutcome({
      correct: true,
      wasTimeout: false,
      missIndex: 0,
      latencyMs: 12001
    })).toBe('good');
  });

  it('ignores invalid review labels and applies the normal mapping', () => {
    expect(FlashcardSrs.gradeOfOutcome({
      review: 'perfect',
      correct: true,
      wasTimeout: false,
      missIndex: 0,
      latencyMs: 12001
    })).toBe('good');
  });
});

describe('applyGrade', () => {
  it('matches the pinned good, good, good, easy, again, hard interval table', () => {
    const grades = ['good', 'good', 'good', 'easy', 'again', 'hard'];
    const days = [10, 11, 14, 22, 49, 49];
    const expected = [
      { intervalDays: 1, dueDay: 11, ease: 2500, reps: 1, lapses: 0 },
      { intervalDays: 3, dueDay: 14, ease: 2500, reps: 2, lapses: 0 },
      { intervalDays: 8, dueDay: 22, ease: 2500, reps: 3, lapses: 0 },
      { intervalDays: 27, dueDay: 49, ease: 2600, reps: 4, lapses: 0 },
      { intervalDays: 0, dueDay: 49, ease: 2280, reps: 0, lapses: 1 },
      { intervalDays: 1, dueDay: 50, ease: 2140, reps: 1, lapses: 1 }
    ];
    let card = FlashcardSrs.newCard('feedbeef');

    grades.forEach((grade, index) => {
      const ts = (index + 1) * 1000;
      card = FlashcardSrs.applyGrade(card, grade, days[index], ts);

      expect(card).toMatchObject(expected[index]);
      expect(card.lastGrade).toBe(grade);
      expect(card.lastTs).toBe(ts);
      expect(card.stemHash).toBe('feedbeef');
    });
  });

  it('returns a new card and never mutates its input', () => {
    const card = FlashcardSrs.newCard('aabbccdd');
    const snapshot = { ...card };
    const result = FlashcardSrs.applyGrade(card, 'good', 2, 1234);

    expect(result).not.toBe(card);
    expect(card).toEqual(snapshot);
  });

  it('uses the UTC day timestamp when applyGrade is called with three arguments', () => {
    const result = FlashcardSrs.applyGrade(
      FlashcardSrs.newCard(),
      'good',
      7
    );

    expect(result.lastTs).toBe(7 * 86400000);
    expect(Number.isFinite(result.lastTs)).toBe(true);
    expect(result.stemHash).toBe(null);
  });

  it('clamps ease at both bounds', () => {
    const low = FlashcardSrs.applyGrade({
      ...FlashcardSrs.newCard('low'),
      ease: 1310
    }, 'again', 0, 1);
    const high = FlashcardSrs.applyGrade({
      ...FlashcardSrs.newCard('high'),
      ease: 2950
    }, 'easy', 0, 1);

    expect(low.ease).toBe(1300);
    expect(high.ease).toBe(3000);
  });

  it('caps all non-again intervals at 45 days', () => {
    ['hard', 'good', 'easy'].forEach((grade) => {
      const card = {
        ...FlashcardSrs.newCard(grade),
        ease: 3000,
        intervalDays: 44,
        reps: 4
      };
      const result = FlashcardSrs.applyGrade(card, grade, 20, 1);

      expect(result.intervalDays).toBe(45);
      expect(result.dueDay).toBe(65);
    });
  });

  it('keeps ease and interval values in range across representative inputs', () => {
    const grades = ['again', 'hard', 'good', 'easy'];

    [1300, 1750, 2500, 3000].forEach((ease) => {
      [0, 1, 12, 45].forEach((intervalDays) => {
        grades.forEach((grade) => {
          const card = {
            ...FlashcardSrs.newCard('range'),
            ease,
            intervalDays,
            reps: 3
          };
          const result = FlashcardSrs.applyGrade(card, grade, 30, 55);

          expect(result.ease).toBeGreaterThanOrEqual(1300);
          expect(result.ease).toBeLessThanOrEqual(3000);
          expect(result.intervalDays).toBeGreaterThanOrEqual(grade === 'again' ? 0 : 1);
          expect(result.intervalDays).toBeLessThanOrEqual(45);
        });
      });
    });
  });

  it('keeps seeded pseudo-random grade results within all scheduling bounds', () => {
    const grades = ['again', 'hard', 'good', 'easy'];
    let seed = 0x5eed1234;

    function nextInt(limit) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    }

    for (let i = 0; i < 200; i += 1) {
      const todayDay = nextInt(10000);
      const grade = grades[nextInt(grades.length)];
      const card = {
        ...FlashcardSrs.newCard(),
        ease: 1000 + nextInt(2501),
        intervalDays: nextInt(91),
        reps: nextInt(6)
      };
      const result = FlashcardSrs.applyGrade(card, grade, todayDay);

      expect(result.ease).toBeGreaterThanOrEqual(1300);
      expect(result.ease).toBeLessThanOrEqual(3000);
      expect(result.intervalDays).toBeGreaterThanOrEqual(0);
      expect(result.intervalDays).toBeLessThanOrEqual(45);
      expect(result.dueDay).toBeGreaterThanOrEqual(todayDay);
    }
  });
});

describe('foldLog', () => {
  it('is replay-idempotent across incremental folds and duplicate entries', () => {
    const first = logEntry({
      roundId: 'desk-1-abcd',
      seq: 1,
      ts: 86400000,
      qnum: 1,
      correct: true,
      latencyMs: 13000
    });
    const second = logEntry({
      roundId: 'desk-1-abcd',
      seq: 0,
      ts: 86400000,
      qnum: 2,
      correct: false
    });
    const third = logEntry({
      roundId: 'mobile-2-efgh',
      seq: 0,
      ts: 172800000,
      qnum: 1,
      correct: true,
      latencyMs: 1000
    });
    const a = [first, second];
    const b = [third];
    const allAtOnce = FlashcardSrs.foldLog(a.concat(b));
    const incremental = FlashcardSrs.foldLog(b, {
      state: FlashcardSrs.foldLog(a)
    });
    const withDuplicates = FlashcardSrs.foldLog(a.concat(a, b, b));

    expect(incremental).toEqual(allAtOnce);
    expect(withDuplicates).toEqual(allAtOnce);
    expect(FlashcardSrs.foldLog(a.concat(b), { state: allAtOnce })).toEqual(allAtOnce);
  });

  it('accepts a Set of prior entry keys without mutating prior state', () => {
    const entry = logEntry();
    const prior = {
      cards: {},
      seen: new Set([FlashcardSrs.entryKey(entry)])
    };
    const result = FlashcardSrs.foldLog([entry], { state: prior });

    expect(result).toEqual({ cards: {}, seen: ['desk-1-abcd#0'] });
    expect(prior.seen).toBeInstanceOf(Set);
  });

  it('folds legacy entries without round ids exactly once using topic as csv fallback', () => {
    const legacy = {
      topic: '4.1-2',
      qnum: 6,
      correct: true,
      latencyMs: 15000,
      wasTimeout: false,
      missIndex: 0,
      ts: 259200000
    };
    const once = FlashcardSrs.foldLog([legacy]);
    const replayed = FlashcardSrs.foldLog([legacy, { ...legacy }]);

    expect(once).toEqual(replayed);
    expect(Object.keys(once.cards)).toEqual(['4.1-2#6']);
    expect(once.cards['4.1-2#6']).toMatchObject({
      intervalDays: 1,
      dueDay: 4,
      reps: 1,
      lastGrade: 'good',
      lastTs: 259200000
    });
    expect(once.seen).toEqual(['259200000#4.1-2#6']);
  });

  it('only lets quick, full, and review modes affect cards', () => {
    const entries = [
      logEntry({ roundId: 'quick', mode: 'quick', qnum: 1 }),
      logEntry({ roundId: 'full', mode: 'full', qnum: 2 }),
      logEntry({ roundId: 'review', mode: 'review', qnum: 3, review: 'hard' }),
      logEntry({ roundId: 'other', mode: 'preview', qnum: 4 })
    ];
    const state = FlashcardSrs.foldLog(entries);

    expect(Object.keys(state.cards).sort()).toEqual([
      'u4_l1_l2_blooket.csv#1',
      'u4_l1_l2_blooket.csv#2',
      'u4_l1_l2_blooket.csv#3'
    ]);
    expect(state.seen).toHaveLength(4);
  });
});

describe('dueCards and summarize', () => {
  it('orders due cards by due day, lapses descending, then card id', () => {
    const state = {
      cards: {
        'z.csv#1': { dueDay: 2, lapses: 1, reps: 1 },
        'b.csv#1': { dueDay: 1, lapses: 2, reps: 1 },
        'a.csv#1': { dueDay: 1, lapses: 2, reps: 1 },
        'c.csv#1': { dueDay: 1, lapses: 0, reps: 1 },
        'future.csv#1': { dueDay: 4, lapses: 9, reps: 3 }
      }
    };

    expect(FlashcardSrs.dueCards(state, 2)).toEqual([
      'a.csv#1',
      'b.csv#1',
      'c.csv#1',
      'z.csv#1'
    ]);
    expect(FlashcardSrs.dueCards(state, 2, 2)).toEqual([
      'a.csv#1',
      'b.csv#1'
    ]);
    expect(FlashcardSrs.dueCards(state, 2, 0)).toEqual([]);
  });

  it('summarizes due, learned, and total cards', () => {
    const state = {
      cards: {
        due: { dueDay: 5, reps: 4 },
        learned: { dueDay: 8, reps: 2 },
        introduced: { dueDay: 9, reps: 1 }
      }
    };

    expect(FlashcardSrs.summarize(state, 5)).toEqual({
      due: 1,
      learned: 1,
      total: 3
    });
  });
});

describe('purity boundary', () => {
  it('contains no runtime, storage, network, grade, or completion dependencies', () => {
    expect(SOURCE).not.toMatch(
      /Date\.now|Math\.random|localStorage|document\.|fetch\(|gradebookClient|_blooketCommit|_studentMarkSave|DESK_DONE/
    );
  });
});

describe('foldMastery and readiness labels', () => {
  function masteryBkt(calls = []) {
    return {
      DEFAULT_PARAMS: {
        pInit: 0.3,
        pTransit: 0,
        pSlip: 0.1,
        pGuess: 0.25
      },
      updateMastery(prior, correct, params) {
        calls.push({ prior, correct, pGuess: params.pGuess });
        return correct ? prior + 0.1 : prior - 0.1;
      }
    };
  }

  it('ignores review entries and answer-primed retries', () => {
    const calls = [];
    const folded = FlashcardSrs.foldMastery([
      logEntry({ mode: 'review', review: 'easy', correct: true, nChoices: 4 }),
      logEntry({ mode: 'quick', missIndex: 1, correct: true, nChoices: 4, seq: 1 }),
      logEntry({ mode: 'quick', missIndex: 0, correct: true, nChoices: 4, seq: 2 }),
      logEntry({ mode: 'full', missIndex: 0, correct: false, nChoices: 4, seq: 3 }),
      logEntry({ csv: 'review-only.csv', mode: 'review', seq: 4 })
    ], { bkt: masteryBkt(calls) });
    const readiness = folded.byCsv['u4_l1_l2_blooket.csv'];

    expect(calls).toHaveLength(2);
    expect(readiness).toMatchObject({
      objectiveCorrects: 1,
      latestClean: false,
      ready: false,
      n: 2
    });
    expect(folded.byCsv['review-only.csv']).toBeUndefined();
  });

  it('sets spacedCorrect at the exact 24-hour boundary, but not one millisecond before', () => {
    const start = 10 * 86400000;
    const before = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 86400000 - 1, seq: 1, nChoices: 4 })
    ], { bkt: masteryBkt() });
    const boundary = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 86400000, seq: 1, nChoices: 4 })
    ], { bkt: masteryBkt() });

    expect(before.byCsv['u4_l1_l2_blooket.csv'].spacedCorrect).toBe(false);
    expect(boundary.byCsv['u4_l1_l2_blooket.csv'].spacedCorrect).toBe(true);
  });

  it('automatically uses pGuess 0.5 when every objective card has two choices', () => {
    const calls = [];

    FlashcardSrs.foldMastery([
      logEntry({ nChoices: 2, seq: 0 }),
      logEntry({ nChoices: 2, seq: 1 })
    ], { bkt: masteryBkt(calls) });

    expect(calls.map((call) => call.pGuess)).toEqual([0.5, 0.5]);
  });

  it('derives pGuess from every csv entry before filtering objective evidence', () => {
    const calls = [];

    FlashcardSrs.foldMastery([
      logEntry({ nChoices: 2, missIndex: 0, seq: 0 }),
      logEntry({ nChoices: 4, missIndex: 1, seq: 1 })
    ], { bkt: masteryBkt(calls) });

    expect(calls.map((call) => call.pGuess)).toEqual([0.25]);
  });

  it('requires three objective corrects, a spaced correct, and a clean latest entry', () => {
    const start = 20 * 86400000;
    const lessThanThree = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 86400000, seq: 1, nChoices: 4 })
    ], { bkt: masteryBkt() });
    const notSpaced = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 1000, seq: 1, nChoices: 4 }),
      logEntry({ ts: start + 2000, seq: 2, nChoices: 4 })
    ], { bkt: masteryBkt() });
    const latestWrong = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 1000, seq: 1, nChoices: 4 }),
      logEntry({ ts: start + 86400000, seq: 2, nChoices: 4 }),
      logEntry({ ts: start + 86400001, seq: 3, nChoices: 4, correct: false })
    ], { bkt: masteryBkt() });
    const ready = FlashcardSrs.foldMastery([
      logEntry({ ts: start, seq: 0, nChoices: 4 }),
      logEntry({ ts: start + 1000, seq: 1, nChoices: 4 }),
      logEntry({ ts: start + 86400000, seq: 2, nChoices: 4 })
    ], { bkt: masteryBkt() });

    expect(lessThanThree.byCsv['u4_l1_l2_blooket.csv'].ready).toBe(false);
    expect(notSpaced.byCsv['u4_l1_l2_blooket.csv'].ready).toBe(false);
    expect(latestWrong.byCsv['u4_l1_l2_blooket.csv'].ready).toBe(false);
    expect(ready.byCsv['u4_l1_l2_blooket.csv'].ready).toBe(true);
    expect(FlashcardSrs.readinessLabel(ready.byCsv['u4_l1_l2_blooket.csv'])).toBe('Ready');
    expect(FlashcardSrs.readinessLabel({ ready: false, objectiveCorrects: 1 })).toBe('Getting there');
    expect(FlashcardSrs.readinessLabel(null)).toBe('Not yet');
  });
});
