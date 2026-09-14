// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk due-today deck — static contract', () => {
  // moved to journeys/j6-review-mode.journey.test.js — J6 all-ON flags show the due chip and Review; Good updates the folded store, advances, and Again stays practice-only (supersedes desk-due-today “renders the chip only behind dueTodayDeck in renderDoNowGrades” and desk-review-mode “adds the Review button only inside the reviewMode flag gate” / “logs one good review entry, applies it, saves, and advances”)

  it('adds the per-csv due suffix immediately after the Blooket score chip', () => {
    const panel = fnBody(DESK, 'showResourcePanel');
    expect(panel).toMatch(/_fcFlag\('dueTodayDeck'\)/);
    expect(panel).toMatch(/_blDueSummary\.byCsv\[_blCsv\]/);
    expect(panel).toContain("' · ' + _blDue + ' due'");
    expect(panel).toMatch(/_scoreChip\(_blScore, 80\) \+ _blDueText \+ '<span class="desk-quiz-done-slot"/);
  });

  it('shares one cached fold and invalidates it whenever the SRS log changes', () => {
    const fold = fnBody(DESK, '_srsFoldedState');
    const start = fnBody(DESK, '_rvStart');
    const append = fnBody(DESK, '_srsAppendLog');
    expect(fold).toMatch(/FlashcardStore\.createStore/);
    expect(fold).toMatch(/store\.load\(\)/);
    expect(fold).toMatch(/store\.readSrsLog\(\)/);
    expect(fold).toMatch(/FlashcardSrs\.foldLog/);
    expect(start).toMatch(/_srsFoldedState\(\)/);
    expect(append).toMatch(/_srsFoldCache\s*=\s*null/);
    expect(append).toContain("sessionStorage.removeItem('a2_fc_due_snapshot')");
  });

  it('_rvStartMixed caps at 20, fetches once per csv, and skips bonus or optional lessons', () => {
    const body = fnBody(DESK, '_rvStartMixed');
    const plans = fnBody(DESK, '_srsCoreDeckPlans');
    expect(body).toMatch(/FlashcardSrs\.dueCards\([^;]+todayDay\)/);
    expect(body).toMatch(/allowedDueIds\.slice\(0,\s*20\)/);
    expect(body).toMatch(/Promise\.all\(plans\.map/);
    expect(plans).toMatch(/_bfCsvPath\(topicId\)/);
    expect(plans).toMatch(/status\s*===\s*'bonus'/);
    expect(plans).toMatch(/status\s*===\s*'optional'/);
    expect(plans).toContain('cedLabel(topicId).text');
    expect(body).toMatch(/_rvState\.mixed\s*=\s*true/);
    expect(body).toContain('Review due — practice, not graded');
  });

  it('shows a per-card lesson label and logs mixed ratings with that card own topic and csv', () => {
    const render = fnBody(DESK, '_rvRenderCard');
    const rate = fnBody(DESK, '_rvRate');
    expect(render).toMatch(/_rvState\.mixed\s*&&\s*card\._rvLabel/);
    expect(render.indexOf('question.appendChild(label)')).toBeLessThan(render.indexOf('question.appendChild(stem)'));
    expect(rate).toMatch(/card\._rvTopic/);
    expect(rate).toMatch(/card\._rvCsv/);
    expect(rate).toMatch(/FlashcardSrs\.cardId\(entryCsv, card\.qnum\)/);
  });
});

describe('Desk due-today deck — executed behavior', () => {
  it('_srsDueSummary folds store state plus log and returns total and per-csv counts', () => {
    const load = vi.fn(() => ({ version: 1, cards: {}, seen: [], tombstones: {}, updatedAt: 0 }));
    const readSrsLog = vi.fn(() => [{ csv: 'u1_l1_blooket.csv', qnum: 1 }]);
    const createStore = vi.fn(() => ({ load, readSrsLog }));
    const foldLog = vi.fn(() => ({
      cards: {
        'u1_l1_blooket.csv#1': { dueDay: 77, reps: 0 },
        'u1_l1_blooket.csv#2': { dueDay: 76, reps: 0 },
        'u2_l3_blooket.csv#9': { dueDay: 77, reps: 0 }
      },
      seen: []
    }));
    const FlashcardStore = { createStore };
    const FlashcardSrs = {
      dayIndex: vi.fn(() => 77),
      foldLog,
      summarize: vi.fn((state) => ({
        due: Object.keys(state.cards).length,
        learned: 0,
        total: Object.keys(state.cards).length
      })),
      dueCards: vi.fn((state) => Object.keys(state.cards))
    };
    const factory = new Function(
      'FlashcardStore', 'FlashcardSrs', 'localStorage', 'getStudentEmail',
      '_viewAsContext', 'window', 'Date', 'REGISTRY', '_bfCsvPath', '_srsCsvFor', 'cedHelpers',
      'cedHelpers.configureCedLabels(() => REGISTRY); const cedLabel = cedHelpers.cedLabel;\n' +
      'var _srsFoldCache = null;\n' +
        fnBody(DESK, '_srsFoldedState') + '\n' +
        fnBody(DESK, '_srsCoreDeckPlans') + '\n' +
        fnBody(DESK, '_srsDueSummary') + '\nreturn _srsDueSummary;'
    );
    const summarize = factory(
      FlashcardStore,
      FlashcardSrs,
      {},
      () => 'student@roster.local',
      () => null,
      { __WS_READ_ONLY__: false },
      { now: () => 77 * 86400000 },
      { lessons: { '1.1': {}, '2.3': {} } },
      (topic) => topic === '1.1' ? 'u1_l1_blooket.csv' : 'u2_l3_blooket.csv',
      (topic) => topic === '1.1' ? 'u1_l1_blooket.csv' : 'u2_l3_blooket.csv',
      loadCedLabels()
    );

    expect(summarize()).toEqual({
      due: 3,
      byCsv: { 'u1_l1_blooket.csv': 2, 'u2_l3_blooket.csv': 1 },
      todayDay: 77
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(readSrsLog).toHaveBeenCalledTimes(1);
    expect(foldLog).toHaveBeenCalledTimes(1);
  });

  it('recomputes the folded-state day on cache hits after midnight', () => {
    let now = 77 * 86400000;
    const createStore = vi.fn(() => ({
      load: () => ({ version: 1, cards: {}, seen: [], tombstones: {} }),
      readSrsLog: () => []
    }));
    const factory = new Function(
      'FlashcardStore', 'FlashcardSrs', 'localStorage', 'getStudentEmail',
      '_viewAsContext', 'window', 'Date',
      'var _srsFoldCache = null;\n' + fnBody(DESK, '_srsFoldedState') +
        '\nreturn _srsFoldedState;'
    );
    const foldedState = factory(
      { createStore },
      { dayIndex: (ts) => Math.floor(ts / 86400000), foldLog: () => ({ cards: {}, seen: [] }) },
      {},
      () => 'student@roster.local',
      () => null,
      { __WS_READ_ONLY__: false },
      { now: () => now }
    );

    expect(foldedState().todayDay).toBe(77);
    now = 78 * 86400000;
    expect(foldedState().todayDay).toBe(78);
    expect(createStore).toHaveBeenCalledTimes(1);
  });

  it('excludes bonus and optional csvs from the due summary used by the chip', () => {
    const folded = {
      cards: {
        'a_bonus.csv#1': { dueDay: 40, reps: 0 },
        'b_optional.csv#1': { dueDay: 40, reps: 0 },
        'z_core.csv#1': { dueDay: 40, reps: 0 },
        'z_core.csv#2': { dueDay: 41, reps: 0 }
      }
    };
    const factory = new Function(
      'FlashcardSrs', '_srsFoldedState', 'REGISTRY', '_bfCsvPath', '_srsCsvFor', 'Date', 'cedHelpers',
      'cedHelpers.configureCedLabels(() => REGISTRY); const cedLabel = cedHelpers.cedLabel;\n' +
      fnBody(DESK, '_srsCoreDeckPlans') + '\n' +
        fnBody(DESK, '_srsDueSummary') + '\nreturn _srsDueSummary;'
    );
    const summarize = factory(
      {
        dayIndex: () => 42,
        summarize: (state) => ({ due: Object.keys(state.cards).length, learned: 0, total: Object.keys(state.cards).length }),
        dueCards: (state) => Object.keys(state.cards)
      },
      () => ({ folded }),
      {
        lessons: {
          '1.1': { ced2026: { status: 'bonus' } },
          '1.2': { optional: true },
          '1.3': { ced2026: { status: 'core', newUnit: 1, newTopic: '1.3', newLabel: 'Core lesson' } }
        }
      },
      (topic) => ({ '1.1': 'a_bonus.csv', '1.2': 'b_optional.csv', '1.3': 'z_core.csv' })[topic],
      (topic) => ({ '1.1': 'a_bonus.csv', '1.2': 'b_optional.csv', '1.3': 'z_core.csv' })[topic],
      { now: () => 42 * 86400000 },
      loadCedLabels()
    );

    expect(summarize()).toEqual({
      due: 2,
      byCsv: { 'z_core.csv': 2 },
      todayDay: 42
    });
  });

  it('filters bonus cards before the mixed cap and uses the shared CED-2026 label', async () => {
    const bonusDue = Array.from({ length: 25 }, (_, i) => 'a_bonus.csv#' + (i + 1));
    const orderedDue = bonusDue.concat(['z_core.csv#1', 'z_core.csv#2']);
    const dueCards = vi.fn(() => orderedDue);
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'core deck' }));
    const state = {};
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-header"></div><div id="bf-result"></div><div id="bf-overlay"></div>
    </body>`);
    const factory = new Function(
      '_viewAsContext', 'window', 'FlashcardSrs', '_srsFoldedState', 'REGISTRY',
      '_bfCsvPath', '_srsCsvFor', 'Date', 'fetch', '_bfRowsToDeck', '_bfParseCsv',
      '_rvState', '_srsRoundId', 'document', '_bfShowQuizUI', '_rvRenderCard',
      '_rvKeydownHandler', 'cedHelpers',
      'cedHelpers.configureCedLabels(() => REGISTRY); const cedLabel = cedHelpers.cedLabel;\n' +
      fnBody(DESK, '_srsCoreDeckPlans') + '\n' +
        fnBody(DESK, '_rvStartMixed') + '\nreturn _rvStartMixed;'
    );
    const startMixed = factory(
      () => null,
      { __WS_READ_ONLY__: false },
      { dueCards, dayIndex: () => 42 },
      () => ({ folded: { cards: {} }, store: { save: vi.fn() } }),
      {
        lessons: {
          '1.1': { ced2026: { status: 'bonus', newLabel: 'Bonus' } },
          '1.2': { ced2026: { status: 'core', newUnit: 1, newTopic: '1.2', newLabel: 'Collecting Data' } }
        }
      },
      (topic) => topic === '1.1' ? 'a_bonus.csv' : 'z_core.csv',
      (topic) => topic === '1.1' ? 'a_bonus.csv' : 'z_core.csv',
      { now: () => 42 * 86400000 },
      fetchImpl,
      () => [
        { qnum: 1, q: 'Core one', choices: ['A', 'B'], correctIdx: 0 },
        { qnum: 2, q: 'Core two', choices: ['A', 'B'], correctIdx: 1 }
      ],
      () => [],
      state,
      () => 'desk-round',
      dom.window.document,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      loadCedLabels()
    );

    await startMixed();

    expect(dueCards).toHaveBeenCalledWith(expect.anything(), 42);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('z_core.csv');
    expect(state.queue.map((card) => card.qnum)).toEqual([1, 2]);
    expect(state.queue.every((card) => card._rvLabel === '1.2 · Collecting Data')).toBe(true);
  });

  it('_srsDueSnapshot returns due zero under view-as before touching cache state', () => {
    const getStudentEmail = vi.fn();
    const factory = new Function(
      '_viewAsContext', 'window', 'getStudentEmail',
      fnBody(DESK, '_srsDueSnapshot') + '\nreturn _srsDueSnapshot;'
    );
    const snapshot = factory(() => ({ studentId: 'student-1' }), {}, getStudentEmail);

    expect(snapshot()).toEqual({ due: 0 });
    expect(getStudentEmail).not.toHaveBeenCalled();
  });

  it('keys snapshots by day and discards the previous day cache entry', () => {
    let day = 42;
    const values = new Map();
    const sessionStorage = {
      getItem: vi.fn((key) => values.has(key) ? values.get(key) : null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key))
    };
    const dueSummary = vi.fn(() => ({ due: 1, byCsv: { 'core.csv': 1 }, todayDay: day }));
    const factory = new Function(
      '_viewAsContext', 'window', 'getStudentEmail', 'FlashcardSrs', 'Date',
      'sessionStorage', '_srsDueSummary',
      fnBody(DESK, '_srsDueSnapshot') + '\nreturn _srsDueSnapshot;'
    );
    const snapshot = factory(
      () => null,
      { __WS_READ_ONLY__: false },
      () => 'student@roster.local',
      { dayIndex: () => day },
      { now: () => day * 86400000 },
      sessionStorage,
      dueSummary
    );

    expect(snapshot().todayDay).toBe(42);
    day = 43;
    expect(snapshot().todayDay).toBe(43);
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('a2_fc_due_snapshot_42');
    expect(values.get('a2_fc_due_snapshot')).toBe('a2_fc_due_snapshot_43');
    expect(dueSummary).toHaveBeenCalledTimes(2);
  });

  it('_srsDueSummary returns only due zero when libraries are unavailable', () => {
    const factory = new Function(
      'FlashcardSrs', '_srsFoldedState',
      fnBody(DESK, '_srsDueSummary') + '\nreturn _srsDueSummary;'
    );
    expect(factory(undefined, () => null)()).toEqual({ due: 0 });
  });

  it('does not append the chip when due is zero', () => {
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
    const startMixed = vi.fn();
    const factory = new Function(
      'document', '_rvStartMixed',
      fnBody(DESK, '_srsRenderDueChip') + '\nreturn _srsRenderDueChip;'
    );
    const renderChip = factory(dom.window.document, startMixed);
    const host = dom.window.document.getElementById('host');

    renderChip(host, { due: 0 });

    expect(host.children).toHaveLength(0);
    expect(startMixed).not.toHaveBeenCalled();
  });
});
