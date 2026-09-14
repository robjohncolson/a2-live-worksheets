/**
 * M2a: mobile ID-only flashcard CSV fallback for combined lessons.
 * Executes the REAL inline helpers from mobile-home.html under cold-boot
 * ordering (rebuild-then-load) so a poisoned early-return would fail the suite.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const TOPIC_MAP = JSON.parse(readFileSync(resolve(repo, 'tests/fixtures/a2/topic-csv.json'), 'utf8'));

function loadEngine() {
  const win = {};
  runInContext(
    readFileSync(resolve(repo, 'flashcards.js'), 'utf8'),
    createContext({ window: win, globalThis: win, self: win, Math, String, Number, Array, Object, parseInt, isFinite, JSON }),
  );
  return win.Flashcards;
}
const FC = loadEngine();

/**
 * Extract the REAL mobile-home helper block and evaluate it in a sandbox with
 * a mock fetch that serves the committed topic→csv map.
 * Boot order under test: _fcRebuildTopicCsvMapFromLessons then _fcLoadTopicCsvMap
 * (mirrors _bootLessons).
 */
function loadRealHelpers({ fetchFails = false } = {}) {
  // Slice from the map declaration through _fcCsvPath (inclusive).
  const start = HOME.indexOf('var _fcTopicCsvMap = null');
  const endMark = 'function _fcLoadTags()';
  const end = HOME.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error('could not locate mobile-home map helpers');
  const body = HOME.slice(start, end);

  const sandbox = {
    FC,
    fetch: (url) => {
      if (fetchFails) return Promise.reject(new Error('network'));
      if (String(url).includes('blooket-topic-csv.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => TOPIC_MAP,
        });
      }
      return Promise.resolve({ ok: false, json: async () => null });
    },
    Promise,
    Object,
    String,
    Array,
    console,
  };
  const ctx = createContext(sandbox);
  runInContext(body, ctx, { filename: 'mobile-home-helpers.js' });
  return {
    rebuild: ctx._fcRebuildTopicCsvMapFromLessons,
    load: ctx._fcLoadTopicCsvMap,
    csvPath: ctx._fcCsvPath,
    getMap: () => ctx._fcTopicCsvMap,
    getStaticLoaded: () => ctx._fcTopicCsvMapStaticLoaded,
  };
}

describe('M2a mobile flashcard ID-only fallback (real helpers + boot order)', () => {
  let h;
  beforeEach(() => {
    h = loadRealHelpers();
  });

  it('cold-boot rebuild-then-load still fetches static map (no poison early-return)', async () => {
    // _bootLessons order: rebuild first (seeds partial/{}), then load static.
    h.rebuild([{ id: '1.1', worksheet: 'u1_lesson1_live.html' }]);
    expect(h.getStaticLoaded()).toBe(false); // rebuild must not mark static loaded
    await h.load();
    expect(h.getStaticLoaded()).toBe(true);
    // Static entry for combined lesson survives rebuild partial.
    expect(h.csvPath({ id: '3.6' })).toBe('u3_l6_l7_blooket.csv');
    // Derived worksheet overlay still present.
    expect(h.csvPath({ id: '1.1' })).toBe('u1_l1_blooket.csv');
  });

  it('3.6 ID-only resolves to u3_l6_l7_blooket.csv (not u3_l6_)', async () => {
    await h.load();
    const path = h.csvPath({ id: '3.6' });
    expect(path).toBe('u3_l6_l7_blooket.csv');
    expect(existsSync(resolve(repo, 'tests/fixtures/a2', path))).toBe(true);
  });

  it('3.6 with worksheet uses worksheet path (primary untouched)', async () => {
    await h.load();
    const path = h.csvPath({ id: '3.6', worksheet: 'u3_lesson6-7_live.html' });
    expect(path).toBe('u3_l6_l7_blooket.csv');
  });

  it('unknown topic → null (explicit no-deck, no silent invent)', async () => {
    await h.load();
    expect(h.csvPath({ id: '99.9' })).toBeNull();
    expect(h.csvPath({ id: 'nope' })).toBeNull();
  });

  it('map covers all lessons-index combined-mismatch cases via REAL helper', async () => {
    await h.load();
    const li = JSON.parse(readFileSync(resolve(repo, 'tests/fixtures/a2/lessons-index.json'), 'utf8')).lessons;
    for (const L of li) {
      const viaWs = L.worksheet ? FC.csvPathFromWorksheet(L.worksheet) : null;
      const viaId = h.csvPath({ id: L.id });
      if (viaWs) {
        // ID-only path must agree with worksheet-derived path when map has the id
        expect(viaId).toBe(viaWs);
      }
    }
  });

  it('second load after static is warm is a no-op (cached)', async () => {
    await h.load();
    const first = h.getMap();
    await h.load();
    expect(h.getMap()).toBe(first);
  });

  it('mobile-home embeds loaded-vs-partial flag + static merge policy', () => {
    expect(HOME).toContain('blooket-topic-csv.json');
    expect(HOME).toContain('_fcTopicCsvMapStaticLoaded');
    expect(HOME).toContain('never invent a wrong solo CSV');
    expect(HOME).not.toMatch(
      /return m \? \('u' \+ m\[1\] \+ '_l' \+ m\[2\]\.replace\(\/-\/g, '_l'\) \+ '_blooket\.csv'\) : null/,
    );
  });
});

describe('M2a blooket presence/required split', () => {
  it('synthetic required/bonus split preserves presence while excluding bonus from due work', () => {
    const bl = JSON.parse(readFileSync(resolve(repo, 'tests/fixtures/a2/blooket-lessons.json'), 'utf8'));
    const xw = JSON.parse(readFileSync(resolve(repo, 'tests/fixtures/a2/crosswalk.json'), 'utf8')).map;
    expect(bl.topics).toHaveLength(4);
    expect(bl.allTopics).toHaveLength(4);
    expect(bl.requiredTopics).toHaveLength(3);
    expect(bl.bonusTopics).toHaveLength(1);
    expect(bl.requiredTopics.length + bl.bonusTopics.length).toBe(bl.topics.length);
    for (const t of bl.requiredTopics) expect(xw[t].status).toBe('core');
    for (const t of bl.bonusTopics) expect(xw[t].status).toBe('bonus');
    // Bonus stays in presence (UI) but not required (Due)
    expect(bl.topics).toContain('2.9');
    expect(bl.bonusTopics).toContain('2.9');
    expect(bl.requiredTopics).not.toContain('2.9');
  });
});
