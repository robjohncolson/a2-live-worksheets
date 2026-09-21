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

describe('Desk quick flashcard misses recap', () => {
  it('_bfFinish renders the recap before the pass-only commit path', () => {
    const body = fnBody(DESK, '_bfFinish');
    const passGate = body.indexOf('if (passed');
    expect(body).toMatch(/Review your misses/);
    expect(body).toMatch(/_bfWorksheetUrl/);
    expect(body).not.toMatch(/rationale/i);
    expect(passGate).toBe(-1);
    expect(body).not.toContain('_blooketCommit');
  });

  it('_bfAnswer captures each wrong card and the resume record persists misses', () => {
    const answer = fnBody(DESK, '_bfAnswer');
    expect(answer).toMatch(/if\s*\(!isRight\)/);
    expect(answer).toMatch(/_bfState\.misses\.push\s*\(\s*\{/);
    expect(answer).toMatch(/correctAnswer\s*:\s*card\.choices\[card\.correctIdx\]/);
    expect(fnBody(DESK, '_bfSaveProgress')).toMatch(/misses\s*:/);
    expect(fnBody(DESK, '_bfStartQuick')).toMatch(/resumed\.misses/);
  });

  it('the pass result includes an idempotent Close button', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toMatch(/closeBtn\.textContent\s*=\s*['"]Close['"]/);
    expect(body).toMatch(/if\s*\(closeHandled\)\s*return/);
    expect(body).toMatch(/closeBlooketFlashcards\s*\(\s*\)/);
    expect(body).not.toContain('setTimeout');
  });

  it('_bfWorksheetFragmentUrl uses six stem words and returns null without a worksheet', () => {
    const factory = new Function(
      '_bfWorksheetUrl',
      fnBody(DESK, '_bfWorksheetFragmentUrl') + '\nreturn _bfWorksheetFragmentUrl;'
    );
    const helper = factory(function () { return 'u4_lesson1-2_live.html'; });
    expect(helper('4.1', 'One two three four five six seven eight')).toBe(
      'u4_lesson1-2_live.html#:~:text=One%20two%20three%20four%20five%20six'
    );
    const missing = factory(function () { return null; });
    expect(missing('4.1', 'Any stem')).toBeNull();

    const missingGlobal = new Function(
      fnBody(DESK, '_bfWorksheetFragmentUrl') + '\nreturn _bfWorksheetFragmentUrl;'
    )();
    expect(missingGlobal('4.1', 'Any stem')).toBeNull();
  });

  it('a stale pass timer commits but does not close a newly opened round', async () => {
    vi.useFakeTimers();
    try {
      const dom = new JSDOM(`<!doctype html><body>
        <div id="bf-overlay" style="display:block"></div>
        <div id="bf-header"></div>
        <div id="bf-question"></div>
        <div id="bf-choices"></div>
        <div id="bf-progress"></div>
        <div id="bf-feedback"></div>
        <button id="bf-next"></button>
        <div id="bf-result"></div>
      </body>`, { url: 'https://desk.test/' });
      const passedButton = { focus() {} };
      const reopenedButton = { focus() {} };
      const freshDeck = [{ qnum: 99, q: 'Fresh question', choices: ['Yes', 'No'], correctIdx: 0 }];
      const state = {
        ownerId: 'owner', topic: '4.1',
        btn: passedButton,
        deck: Array.from({ length: 10 }, function () { return {}; }),
        idx: 8,
        score: 8,
        answered: true,
        finishId: null,
        finished: false,
        roundId: 'desk-old-round',
        seq: 8,
        cardStart: 0,
        misses: []
      };
      const timedState = { topic: null, btn: null, round: null, answered: false, roundId: null };
      const commit = vi.fn(async function () {});
      const source = [
        'function _bfOwner() { return "owner"; }',
        fnBody(DESK, '_bfFinish'),
        fnBody(DESK, '_bfCloseUI'),
        fnBody(DESK, 'closeBlooketFlashcards'),
        fnBody(DESK, '_bfStartQuick')
      ].join('\n');
      const factory = new Function(
        'document', 'window', 'location', '_bfState', '_ftState',
        'BLOOKET_PASS_THRESHOLD', '_mayScore', '_bfWorksheetUrl',
        '_bfWorksheetFragmentUrl', '_bfClearProgress', '_bfShuffle',
        '_srsRoundId', '_bfSaveProgress', '_bfRenderCard', '_bfLoadProgress',
        '_bfCsvPath', 'showDialog', 'fetch', '_bfParseCsv', '_bfRowsToDeck',
        '_bfLoadDifficultyTags', '_bfSelectTop10', '_bfShowQuizUI',
        '_bfKeydownHandler', '_ftKeydownHandler', '_ftClearTimer',
        '_blooketCommit', 'setTimeout', 'clearTimeout',
        'cedLabel', 'Flashcards',
        source + '\nreturn {' +
          'finish: _bfFinish,' +
          'start: _bfStartQuick' +
        '};'
      );
      const api = factory(
        dom.window.document,
        dom.window,
        dom.window.location,
        state,
        timedState,
        0.80,
        function () { return true; },
        function () { return null; },
        function () { return null; },
        function () {},
        function (deck) { return deck; },
        function () { return 'desk-new-round'; },
        function () {},
        function () {},
        function () { return null; },
        function () { return 'fresh_blooket.csv'; },
        function () {},
        async function () {
          return { ok: true, text: async function () { return 'csv'; } };
        },
        function () { return []; },
        function () { return freshDeck; },
        async function () { return {}; },
        function (deck) { return deck; },
        function () {},
        function () {},
        function () {},
        function () {},
        commit,
        setTimeout,
        clearTimeout,
        loadCedLabels().cedLabel,
        { dailyDraw: deck => deck, localDateKey: () => '2026-09-20', QUICK_TARGET: 10 }
      );

      await api.finish();
      const closeButton = Array.from(
        dom.window.document.querySelectorAll('#bf-result button')
      ).find(function (button) { return button.textContent === 'Close'; });
      expect(closeButton).toBeTruthy();
      closeButton.click();

      await api.start(reopenedButton, '4.1');
      await vi.advanceTimersByTimeAsync(2000);

      expect(commit).not.toHaveBeenCalled();
      expect(state.roundId).toBe('desk-new-round');
      expect(state.deck).toEqual(freshDeck);
      expect(state.idx).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('_bfFinish lists two missed stems and their correct answers', async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-question"></div>
      <div id="bf-choices"></div>
      <div id="bf-progress"></div>
      <div id="bf-feedback"></div>
      <button id="bf-next"></button>
      <div id="bf-result"></div>
    </body>`);
    const state = {
      ownerId: 'owner', topic: '4.1',
      btn: {},
      deck: [{}, {}, {}, {}],
      idx: 4,
      score: 0,
      answered: true,
      finished: false,
      misses: [
        { qnum: 2, q: 'What describes sampling variability?', correctAnswer: 'It varies by sample.' },
        { qnum: 4, q: 'Which statistic is unbiased?', correctAnswer: 'The sample mean.' }
      ]
    };
    const worksheetUrl = function () { return 'u4_lesson1-2_live.html'; };
    const fragmentFactory = new Function(
      '_bfWorksheetUrl',
      fnBody(DESK, '_bfWorksheetFragmentUrl') + '\nreturn _bfWorksheetFragmentUrl;'
    );
    const fragmentUrl = fragmentFactory(worksheetUrl);
    const finishFactory = new Function(
      'document', '_bfState', 'BLOOKET_PASS_THRESHOLD', '_mayScore',
      '_bfWorksheetUrl', '_bfWorksheetFragmentUrl', '_bfClearProgress',
      'function _bfOwner() { return "owner"; } function _bfSaveProgress() {}\n' + fnBody(DESK, '_bfFinish') + '\nreturn _bfFinish;'
    );
    const finish = finishFactory(
      dom.window.document,
      state,
      0.80,
      function () { return true; },
      worksheetUrl,
      fragmentUrl, () => {}
    );

    await finish();

    const result = dom.window.document.getElementById('bf-result');
    const items = Array.from(result.querySelectorAll('li'));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('What describes sampling variability?');
    expect(items[0].textContent).toContain('Answer: It varies by sample.');
    expect(items[1].textContent).toContain('Which statistic is unbiased?');
    expect(items[1].textContent).toContain('Answer: The sample mean.');
    expect(result.querySelectorAll('a[target="_blank"][rel="noopener"]')).toHaveLength(2);
  });
});
