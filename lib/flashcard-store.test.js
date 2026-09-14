// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const MODULE_URL = new URL('./flashcard-store.js', import.meta.url);
const SRS_MODULE_URL = new URL('./flashcard-srs.js', import.meta.url);
const SOURCE = readFileSync(MODULE_URL, 'utf8');
const SRS_SOURCE = readFileSync(SRS_MODULE_URL, 'utf8');

function loadApi() {
  const context = createContext({
    module: { exports: {} },
    exports: {},
    globalThis: {}
  });

  runInContext(SOURCE, context);
  return context.module.exports;
}

function loadSrsApi() {
  const context = createContext({
    module: { exports: {} },
    exports: {},
    globalThis: {}
  });

  runInContext(SRS_SOURCE, context);
  return context.module.exports;
}

function createStorage(seed = {}) {
  const values = { ...seed };
  let writes = 0;

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
      writes += 1;
    },
    removeItem(key) {
      delete values[key];
    },
    read(key) {
      return values[key];
    },
    writes() {
      return writes;
    }
  };
}

function createCard(lastTs, stemHash = 'deadbeef') {
  return {
    ease: 2500,
    intervalDays: 3,
    dueDay: 42,
    reps: 2,
    lapses: 0,
    lastGrade: 'good',
    lastTs,
    stemHash
  };
}

function createPassport(email, state, log = []) {
  return {
    format: 'apstats-flashcards',
    version: 1,
    exportedAt: '2026-08-18T00:00:00.000Z',
    email,
    payload: { state, log }
  };
}

const FlashcardStore = loadApi();

describe('flashcard store', () => {
  it('loads a fresh versioned state when storage is empty', () => {
    const storage = createStorage();
    const store = FlashcardStore.createStore({
      storage,
      email: 'student@example.com',
      now: () => 1000
    });

    expect(store.key()).toBe('a2_fc_state_v1_student@example.com');
    expect(store.load()).toEqual({
      version: 1,
      cards: {},
      seen: [],
      tombstones: {},
      updatedAt: 0
    });
  });

  it('migrates v0 and absent-version states while preserving unknown fields in extra', () => {
    const store = FlashcardStore.createStore({
      storage: createStorage(),
      email: 'student@example.com',
      now: () => 1000
    });
    const v0 = store.migrate({
      version: 0,
      cards: { a: createCard(10) },
      legacyFlag: true
    });
    const absent = store.migrate({
      cards: { b: createCard(20) },
      seen: ['b'],
      tombstones: { old: { removedAt: 5, stemHash: 'oldhash1' } },
      updatedAt: 7,
      extra: { priorExtra: 'kept' }
    });

    expect(v0).toEqual({
      version: 1,
      cards: { a: createCard(10) },
      seen: [],
      tombstones: {},
      updatedAt: 0,
      extra: { legacyFlag: true }
    });
    expect(absent).toEqual({
      version: 1,
      cards: { b: createCard(20) },
      seen: ['b'],
      tombstones: { old: { removedAt: 5, stemHash: 'oldhash1' } },
      updatedAt: 7,
      extra: { priorExtra: 'kept' }
    });
  });

  it('guards corrupt data from normal saves and allows an explicit forced save', () => {
    const key = 'a2_fc_state_v1_student@example.com';
    const storage = createStorage({ [key]: '{not valid json' });
    const store = FlashcardStore.createStore({
      storage,
      email: 'student@example.com',
      now: () => 1234
    });
    const fresh = store.load();

    expect(fresh.cards).toEqual({});
    expect(store.save(fresh)).toEqual({ ok: false, reason: 'corrupt-guard' });
    expect(storage.read(key)).toBe('{not valid json');
    expect(store.save(fresh, { force: true })).toEqual({ ok: true });
    expect(JSON.parse(storage.read(key)).updatedAt).toBe(1234);
    expect(store.save(fresh)).toEqual({ ok: true });
  });

  it('returns a new state with the card removed and a stem-hash tombstone', () => {
    const store = FlashcardStore.createStore({
      storage: createStorage(),
      email: 'student@example.com',
      now: () => 5000
    });
    const original = {
      version: 1,
      cards: { 'u4.csv#1': createCard(100, 'a1b2c3d4') },
      seen: ['u4.csv#1'],
      tombstones: {},
      updatedAt: 40
    };
    const next = store.tombstone(original, 'u4.csv#1');

    expect(next).not.toBe(original);
    expect(next.cards).not.toHaveProperty('u4.csv#1');
    expect(next.tombstones['u4.csv#1']).toEqual({
      removedAt: 5000,
      stemHash: 'a1b2c3d4'
    });
    expect(original.cards).toHaveProperty('u4.csv#1');
  });

  it('reads the SRS log tolerantly and defaults additive fields', () => {
    const logKey = 'a2_srs_log_student@example.com';
    const storage = createStorage({
      [logKey]: JSON.stringify([
        { topic: 'U4L1', qnum: 1, ts: 10 },
        null,
        { topic: 'U4L2', mode: 'quick', surface: 'mobile', seq: 3, csv: 'u4.csv' }
      ])
    });
    const store = FlashcardStore.createStore({
      storage,
      email: 'student@example.com',
      now: () => 1000
    });

    expect(store.readSrsLog()).toEqual([
      {
        topic: 'U4L1',
        qnum: 1,
        ts: 10,
        mode: 'full',
        surface: 'desk',
        seq: 0,
        csv: null
      },
      {
        topic: 'U4L2',
        mode: 'quick',
        surface: 'mobile',
        seq: 3,
        csv: 'u4.csv'
      }
    ]);

    storage.setItem(logKey, JSON.stringify({ not: 'an array' }));
    expect(store.readSrsLog()).toEqual([]);
  });

  it('exports and imports a passport round trip after a non-mutating preview', () => {
    const state = {
      version: 1,
      cards: { 'u4.csv#1': createCard(100) },
      seen: ['u4.csv#1'],
      tombstones: { old: { removedAt: 90, stemHash: 'oldhash1' } },
      updatedAt: 80
    };
    const log = [{ roundId: 'desk-1', seq: 0, csv: 'u4.csv', qnum: 1, ts: 100 }];
    const sourceStore = FlashcardStore.createStore({
      storage: createStorage(),
      email: 'student@example.com',
      now: () => Date.UTC(2026, 7, 18)
    });
    const passport = sourceStore.exportPassport(state, log);
    const targetStorage = createStorage();
    const targetStore = FlashcardStore.createStore({
      storage: targetStorage,
      email: 'student@example.com',
      now: () => Date.UTC(2026, 7, 19)
    });

    expect(passport.exportedAt).toBe('2026-08-18T00:00:00.000Z');
    expect(passport.payload).toEqual({ state, log });
    expect(targetStore.previewImport(JSON.stringify(passport))).toEqual({
      ok: true,
      counts: { cards: 1, logEntries: 1, tombstones: 1 },
      emailMatches: true
    });
    expect(targetStorage.writes()).toBe(0);
    expect(targetStore.importPassport(JSON.stringify(passport)).ok).toBe(true);
    expect(targetStore.load().cards['u4.csv#1']).toEqual(createCard(100));
    expect(targetStore.readSrsLog()).toHaveLength(1);
  });

  it('refuses an email mismatch under every option combination without writing', () => {
    const storage = createStorage();
    const store = FlashcardStore.createStore({
      storage,
      email: 'right@example.com',
      now: () => 1000
    });
    const passport = createPassport('wrong@example.com', {
      version: 1,
      cards: {},
      tombstones: {},
      updatedAt: 0
    });

    expect(store.previewImport(passport).emailMatches).toBe(false);
    expect(store.importPassport(passport)).toEqual({
      ok: false,
      reason: 'email-mismatch',
      added: 0,
      skipped: 0
    });
    expect(store.importPassport(passport, { allowEmailMismatch: true }).ok).toBe(false);
    expect(store.importPassport(passport, { force: true }).ok).toBe(false);
    expect(store.importPassport(passport, {
      allowEmailMismatch: true,
      force: true
    })).toEqual({
      ok: false,
      reason: 'email-mismatch',
      added: 0,
      skipped: 0
    });
    expect(storage.writes()).toBe(0);
    expect(storage.read('a2_fc_state_v1_right@example.com')).toBeUndefined();
    expect(storage.read('a2_srs_log_right@example.com')).toBeUndefined();
  });

  it('round-trips a folded contract entry without stemHash as a card', () => {
    const FlashcardSrs = loadSrsApi();
    const email = 'student@example.com';
    const entry = {
      topic: '4.1-2',
      qnum: 6,
      correct: true,
      latencyMs: 13000,
      wasTimeout: false,
      missIndex: 0,
      ts: 172800000,
      mode: 'quick',
      csv: 'u4_l1_l2_blooket.csv',
      surface: 'desk',
      roundId: 'desk-172800000-abcd',
      seq: 0,
      nChoices: 4,
      chosenIdx: 2
    };
    const cardId = FlashcardSrs.cardId(entry.csv, entry.qnum);
    const sourceStorage = createStorage();
    const sourceStore = FlashcardStore.createStore({
      storage: sourceStorage,
      email,
      now: () => 172800001
    });
    const folded = FlashcardSrs.foldLog([entry]);

    expect(sourceStore.save(folded)).toEqual({ ok: true });

    const passport = sourceStore.exportPassport(sourceStore.load(), [entry]);
    const targetStore = FlashcardStore.createStore({
      storage: createStorage(),
      email,
      now: () => 172800002
    });

    expect(targetStore.importPassport(passport).ok).toBe(true);

    const imported = targetStore.load();
    expect(imported.cards).toHaveProperty(cardId);
    expect(imported.cards[cardId].stemHash).toBe(null);
    expect(imported.tombstones).not.toHaveProperty(cardId);
  });

  it('keeps later cards, tombstones unknown card shapes, and deduplicates appended logs', () => {
    const stateKey = 'a2_fc_state_v1_student@example.com';
    const logKey = 'a2_srs_log_student@example.com';
    const storage = createStorage({
      [stateKey]: JSON.stringify({
        version: 1,
        cards: {
          'u4.csv#1': createCard(100, 'first001'),
          'u4.csv#2': createCard(10, 'second01')
        },
        seen: [],
        tombstones: {},
        updatedAt: 100
      }),
      [logKey]: JSON.stringify([
        { roundId: 'desk-1', seq: 0, csv: 'u4.csv', qnum: 1, ts: 100 }
      ])
    });
    const store = FlashcardStore.createStore({
      storage,
      email: 'student@example.com',
      now: () => 500
    });
    const passport = createPassport('student@example.com', {
      version: 1,
      cards: {
        'u4.csv#1': createCard(50, 'older001'),
        'u4.csv#2': createCard(200, 'newer002'),
        'u4.csv#3': { lastTs: 300, stemHash: 'unknown3' }
      },
      seen: [],
      tombstones: {},
      updatedAt: 300
    }, [
      { roundId: 'desk-1', seq: 0, csv: 'u4.csv', qnum: 1, ts: 100 },
      { roundId: 'desk-1', seq: 1, csv: 'u4.csv', qnum: 2, ts: 200 }
    ]);

    expect(store.importPassport(passport)).toEqual({ ok: true, added: 3, skipped: 2 });

    const merged = store.load();
    expect(merged.cards['u4.csv#1'].lastTs).toBe(100);
    expect(merged.cards['u4.csv#2'].lastTs).toBe(200);
    expect(merged.cards).not.toHaveProperty('u4.csv#3');
    expect(merged.tombstones['u4.csv#3']).toEqual({
      removedAt: 500,
      stemHash: 'unknown3'
    });
    expect(store.readSrsLog().map((entry) => `${entry.roundId}#${entry.seq}`)).toEqual([
      'desk-1#0',
      'desk-1#1'
    ]);
  });

  it('deduplicates legacy log identities and caps the merged log at 2000 entries', () => {
    const storage = createStorage();
    const store = FlashcardStore.createStore({
      storage,
      email: 'student@example.com',
      now: () => 1000
    });
    const log = [];

    for (let i = 0; i < 2005; i += 1) {
      log.push({ ts: i, csv: 'u4.csv', qnum: i });
    }

    log.push({ ts: 2004, csv: 'u4.csv', qnum: 2004 });

    const passport = createPassport('student@example.com', {
      version: 1,
      cards: {},
      seen: [],
      tombstones: {},
      updatedAt: 0
    }, log);
    const result = store.importPassport(passport);
    const storedLog = store.readSrsLog();

    expect(result).toEqual({ ok: true, added: 2005, skipped: 1 });
    expect(storedLog).toHaveLength(2000);
    expect(storedLog[0].ts).toBe(5);
    expect(storedLog[1999].ts).toBe(2004);
  });

  it('loads as CommonJS and browser UMD without ambient app APIs', () => {
    const window = {};
    const context = createContext({
      window,
      self: window,
      globalThis: window
    });

    runInContext(SOURCE, context);

    expect(window.FlashcardStore).toBeDefined();
    expect(typeof window.FlashcardStore.createStore).toBe('function');
    expect(SOURCE).not.toMatch(/\b(?:localStorage|document|fetch)\b/);
    expect(SOURCE).not.toMatch(/Date\.now|Math\.random|gradebookClient/);
  });
});
