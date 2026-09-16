/**
 * A2 mobile explicit-deck and ID-only CSV fallback.
 * Executes the REAL inline helpers from mobile-home.html under cold-boot
 * ordering (rebuild-then-load) so a poisoned early-return would fail the suite.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const TOPIC_MAP = { map: { '1.1': 'content/a2/1-1/deck.csv', '1.2': 'content/a2/1-2/deck.csv' } };

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
 * a mock fetch that serves an inline topic→csv map.
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

describe('A2 mobile CSV fallback with real helpers', () => {
  let h;
  beforeEach(() => { h = loadRealHelpers(); });

  it('cold-boot rebuild does not prevent loading the static ID map', async () => {
    h.rebuild([{ id: '1.1', key: '1-1', deck: 'content/a2/1-1/deck.csv' }]);
    expect(h.getStaticLoaded()).toBe(false);
    await h.load();
    expect(h.getStaticLoaded()).toBe(true);
    expect(h.csvPath({ id: '1.1' })).toBe('content/a2/1-1/deck.csv');
    expect(h.csvPath({ id: '1.2' })).toBe('content/a2/1-2/deck.csv');
  });

  it('prefers an explicit lesson deck over stale map and legacy worksheet paths', async () => {
    await h.load();
    expect(h.csvPath({ id: '1.1', deck: 'content/a2/1-1/revised.csv',
      worksheet: 'u1_lesson1_live.html' })).toBe('content/a2/1-1/revised.csv');
  });

  it('keeps the retained worksheet-derived fallback ahead of the static map', async () => {
    // Synthetic protocol URL; no AP worksheet is read or restored.
    h.rebuild([{ id: '1.1', worksheet: 'u1_lesson1_live.html' }]);
    await h.load();
    expect(h.csvPath({ id: '1.1' })).toBe('u1_l1_blooket.csv');
  });

  it('does not invent a deck for an unknown or unpublished lesson', async () => {
    await h.load();
    expect(h.csvPath({ id: '99.9' })).toBeNull();
    expect(h.csvPath({ key: 'future-lesson' })).toBeNull();
    expect(h.csvPath(null)).toBeNull();
  });

  it('retains an explicit playable A2 deck when the static map is offline', async () => {
    const offline = loadRealHelpers({ fetchFails: true });
    await offline.load();
    expect(offline.csvPath({ id: '1.1', deck: 'content/a2/1-1/deck.csv' }))
      .toBe('content/a2/1-1/deck.csv');
    const cards = FC.rowsToDeck(FC.parseCsv('1,"Solve x + 2 = 5","2","3",,,20,2'));
    expect(cards).toEqual([{ qnum: 1, q: 'Solve x + 2 = 5', choices: ['2', '3'], correctIdx: 1 }]);
  });

  it('reuses the loaded map without rebuilding it', async () => {
    await h.load();
    const first = h.getMap();
    await h.load();
    expect(h.getMap()).toBe(first);
  });
});
