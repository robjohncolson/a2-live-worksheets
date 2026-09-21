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
  for (let i = src.indexOf('{', match.index); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk review mode — static contract', () => {
  it('loads the SRS, store, flags and shared daily-draw engine', () => {
    for (const lib of ['flashcard-srs', 'flashcard-store', 'flashcard-flags']) {
      expect(DESK).toContain(`<script src="lib/${lib}.js" onerror=""></script>`);
    }
    expect(DESK).toMatch(/<script[^>]+src=["']flashcards\.js["']/);
  });

  it('loads flags at boot and resolves them with roster, section, URL, and storage context', () => {
    expect(DESK).toMatch(/var\s+_fcFlags\s*=\s*\{\s*flags\s*:\s*\{\s*\}\s*\}/);
    expect(DESK).toMatch(/_fcLoadFlags\s*\(\s*\)/);
    const load = fnBody(DESK, '_fcLoadFlags');
    expect(load).toMatch(/FlashcardFlags\.loadFlags\s*\(\s*fetchImpl\s*,\s*build\s*\)/);
    const resolveFlag = fnBody(DESK, '_fcFlag');
    expect(resolveFlag).toMatch(/FlashcardFlags\.resolveFlag/);
    expect(resolveFlag).toMatch(/username\s*:/);
    expect(resolveFlag).toMatch(/section\s*:/);
    expect(resolveFlag).toMatch(/location\.search/);
    expect(resolveFlag).toMatch(/localStorage/);
    // First-render race repaint refreshes ONLY the due chip in place; it must NOT
    // re-run renderDoNowGrades (its fetch/classify path is incident-pinned).
    expect(load).toMatch(/_srsRenderDueChip\s*\(\s*dueHost\s*,\s*_srsDueSnapshot\s*\(\s*\)\s*\)/);
    expect(load).not.toMatch(/=\s*renderDoNowGrades\s*\(|await\s+renderDoNowGrades\s*\(|^\s*renderDoNowGrades\s*\(/m);

    const bootFlags = DESK.lastIndexOf("if (typeof _fcLoadFlags === 'function') _fcLoadFlags()");
    const bootRegistry = DESK.lastIndexOf('loadRegistry();');
    expect(bootFlags).toBeGreaterThan(-1);
    expect(bootFlags).toBeLessThan(bootRegistry);
  });

  // moved to journeys/j6-review-mode.journey.test.js — J6 all-ON flags show the due chip and Review; Good updates the folded store, advances, and Again stays practice-only (supersedes desk-due-today “renders the chip only behind dueTodayDeck in renderDoNowGrades” and desk-review-mode “adds the Review button only inside the reviewMode flag gate” / “logs one good review entry, applies it, saves, and advances”)

  it('keeps every review function free of grading and completion tokens', () => {
    const forbidden = /_blooketCommit|_studentMarkSave|gradebookClient|recordProgress|DESK_DONE|_bfSaveProgress|_bfClearProgress/;
    const reviewFunctions = [
      '_rvRestoreActions',
      '_rvStart',
      '_rvStartMixed',
      '_rvRenderCard',
      '_rvAnswer',
      '_rvRate',
      '_rvFinish',
      '_rvKeydownHandler'
    ];
    const declared = [...DESK.matchAll(/^(?:async )?function\s+(_rv\w+)\s*\(/gm)]
      .map((match) => match[1]);
    expect(reviewFunctions).toEqual(declared);
    for (const name of reviewFunctions) {
      expect(fnBody(DESK, name), name).not.toMatch(forbidden);
    }
  });

  it('_bfCloseUI clears review state and removes its keyboard handler', () => {
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/_rvState\.queue\s*=\s*\[\]/);
    expect(body).toMatch(/_rvState\.current\s*=\s*null/);
    expect(body).toMatch(/removeEventListener\s*\(\s*['"]keydown['"]\s*,\s*_rvKeydownHandler\s*\)/);
  });
});

function rateHarness(options = {}) {
  const append = vi.fn();
  const save = vi.fn();
  const render = vi.fn();
  const finish = vi.fn();
  const applied = vi.fn((card, grade, today, ts) => ({
    ...(card || {}), lastGrade: grade, dueDay: today + 1, lastTs: ts
  }));
  const current = {
    qnum: 7,
    q: 'What is sampling variability?',
    choices: ['Spread across samples', 'A population value'],
    correctIdx: 0,
    _rvCorrect: true,
    _rvChosenIdx: 0
  };
  const queue = options.queue || [{ qnum: 8 }, { qnum: 9 }, { qnum: 10 }, { qnum: 11 }];
  const state = {
    topic: '4.1', csv: 'u4_l1_l2_blooket.csv', queue: queue.slice(), idx: 0,
    ratings: 0, roundId: 'desk-1000-abcd', seq: 0, cardStart: 1200,
    current, stage: 'rate', store: { save },
    folded: { cards: {}, seen: [] },
    deckCardsByCsv: options.deckCardsByCsv || {
      'u4_l1_l2_blooket.csv': [current].concat(queue)
    }
  };
  const FlashcardSrs = {
    stemHash: () => 'feedbeef',
    cardId: (csv, qnum) => csv + '#' + qnum,
    newCard: (stemHash) => ({ stemHash }),
    dayIndex: () => 42,
    applyGrade: applied
  };
  const FlashcardStore = { createStore: vi.fn() };
  const factory = new Function(
    '_rvState', 'FlashcardSrs', 'FlashcardStore', '_srsAppendLog',
    '_rvRenderCard', '_rvFinish', '_viewAsContext', 'window', 'Date',
    fnBody(DESK, '_rvRate') + '\nreturn _rvRate;'
  );
  const rate = factory(
    state, FlashcardSrs, FlashcardStore, append, render, finish,
    () => null, { __WS_READ_ONLY__: false }, { now: () => 2000 }
  );
  return { rate, state, current, append, save, render, finish, applied };
}

describe('Desk review mode — executed rating flow', () => {
  it('filters this lesson from the full ordered due list before applying the 20-card cap', async () => {
    const csv = 'u4_l1_l2_blooket.csv';
    const otherDue = Array.from({ length: 25 }, (_, i) => 'a_other.csv#' + (i + 1));
    const dueCards = vi.fn(() => otherDue.concat(csv + '#7'));
    const state = {};
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-header"></div><div id="bf-result"></div><div id="bf-overlay"></div>
    </body>`);
    const factory = new Function(
      '_viewAsContext', 'window', 'FlashcardSrs', 'FlashcardStore', '_bfCsvPath',
      'fetch', '_bfRowsToDeck', '_bfParseCsv', '_srsFoldedState', '_srsCsvFor',
      'Date', '_rvState', '_srsRoundId', 'document', '_bfShowQuizUI',
      '_rvRenderCard', '_rvKeydownHandler',
      'cedLabel',
      fnBody(DESK, '_rvStart') + '\nreturn _rvStart;'
    );
    const start = factory(
      () => null,
      { __WS_READ_ONLY__: false },
      { dueCards, dayIndex: () => 42 },
      {},
      () => csv,
      vi.fn(async () => ({ ok: true, text: async () => 'csv' })),
      () => [{ qnum: 7, q: 'Target', choices: ['A', 'B'], correctIdx: 0 }],
      () => [],
      () => ({
        store: { save: vi.fn() }, log: [], folded: { cards: {}, seen: [] }
      }),
      () => csv,
      { now: () => 42 * 86400000 },
      state,
      () => 'desk-round',
      dom.window.document,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      loadCedLabels().cedLabel
    );

    await start(null, '4.1');

    expect(dueCards).toHaveBeenCalledWith(expect.anything(), 42);
    expect(state.queue.map((card) => card.qnum)).toEqual([7]);
  });

  // moved to journeys/j6-review-mode.journey.test.js — J6 all-ON flags show the due chip and Review; Good updates the folded store, advances, and Again stays practice-only (supersedes desk-due-today “renders the chip only behind dueTodayDeck in renderDoNowGrades” and desk-review-mode “adds the Review button only inside the reviewMode flag gate” / “logs one good review entry, applies it, saves, and advances”)

  it('re-queues Again after a three-card gap', () => {
    const h = rateHarness();
    h.current._rvCorrect = false;
    h.current._rvChosenIdx = -1;
    h.rate('again');
    expect(h.state.queue).toEqual([
      { qnum: 8 }, { qnum: 9 }, { qnum: 10 }, h.current, { qnum: 11 }
    ]);
    expect(h.append.mock.calls[0][0][0]).toMatchObject({
      correct: false, chosenIdx: -1, review: 'again'
    });
  });

  it('pads a one-card waiting queue so Again does not repeat immediately', () => {
    const h = rateHarness({
      queue: [{ qnum: 8 }],
      deckCardsByCsv: {
        'u4_l1_l2_blooket.csv': [
          { qnum: 7 }, { qnum: 8 }, { qnum: 9 }, { qnum: 10 }
        ]
      }
    });
    h.current._rvCorrect = false;
    h.current._rvChosenIdx = -1;

    h.rate('again');

    expect(h.state.queue.slice(0, 3).map((card) => card.qnum)).toEqual([8, 9, 10]);
    expect(h.state.queue[3]).toBe(h.current);
  });

  it('renders the real minimum next-due day for this lesson', () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-question"></div><div id="bf-choices"></div><div id="bf-progress"></div>
      <div id="bf-feedback"></div><div id="bf-actions"></div><div id="bf-result"></div>
    </body>`);
    const state = {
      stage: 'rate', current: { qnum: 7 }, ratings: 4, mixed: false,
      csv: 'u4_l1_l2_blooket.csv', deckCardsByCsv: {},
      folded: {
        cards: {
          'u4_l1_l2_blooket.csv#7': { dueDay: 47 },
          'u4_l1_l2_blooket.csv#8': { dueDay: 45 },
          'a_other.csv#1': { dueDay: 42 }
        }
      }
    };
    const factory = new Function(
      '_rvState', 'document', 'FlashcardSrs', 'Date',
      fnBody(DESK, '_rvFinish') + '\nreturn _rvFinish;'
    );
    const finish = factory(
      state,
      dom.window.document,
      { dayIndex: () => 42 },
      { now: () => 42 * 86400000 }
    );

    finish();

    expect(dom.window.document.querySelector('.bf-result-pass').textContent)
      .toBe('4 reviewed · next due in 3 days');
  });

  it('replaces the action row with exactly two rating buttons after answering', () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-choices">
        <button class="bf-choice">A</button>
        <button class="bf-choice">B</button>
        <button class="bf-choice">I'm not sure</button>
      </div>
      <div id="bf-feedback"></div>
      <div id="bf-actions"><button>Next</button><button>Cancel</button></div>
    </body>`);
    const state = {
      stage: 'answer',
      current: { qnum: 1, q: 'Stem', choices: ['Right', 'Wrong'], correctIdx: 0 }
    };
    const rate = vi.fn();
    const factory = new Function(
      '_rvState', 'document', '_rvRate',
      fnBody(DESK, '_rvAnswer') + '\nreturn _rvAnswer;'
    );
    const answer = factory(state, dom.window.document, rate);
    answer(0);
    const buttons = [...dom.window.document.querySelectorAll('#bf-actions button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual(['Good', 'Easy']);
    expect(dom.window.document.querySelectorAll('#bf-choices button:disabled')).toHaveLength(3);
    expect(dom.window.document.querySelector('#bf-choices button').classList.contains('bf-correct')).toBe(true);
  });
});
