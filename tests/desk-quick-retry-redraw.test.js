// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

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

function card(qnum) {
  return {
    qnum,
    q: 'Question ' + qnum,
    choices: ['Right', 'Wrong'],
    correctIdx: 0
  };
}

describe('Desk quick-retry redraw', () => {
  it('keeps the signed-off zero cool-down and the legacy reshuffle fallback', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_RETRY_COOLDOWN_MS\s*=\s*0\s*;[^\n]*changing this needs teacher sign-off — see FLASHCARD_V2_BUILD\.md/);
    expect(fnBody(DESK, '_bfFinish')).toMatch(
      /_bfState\.deck\s*=\s*_bfShuffle\s*\(\s*_bfState\.deck\s*\)/
    );
  });

  it('persists qnum-only pool and seen lists in the additive resume record', () => {
    const save = fnBody(DESK, '_bfSaveProgress');
    expect(save).toMatch(/poolQnums\s*:\s*Array\.isArray\(_bfState\.poolQnums\)/);
    expect(save).toMatch(/seenQnums\s*:\s*Array\.isArray\(_bfState\.seenQnums\)/);
    expect(save).toMatch(/primedQnums\s*:\s*Array\.isArray\(_bfState\.primedQnums\)/);
    expect(save).not.toMatch(/allCards\s*:/);

    const start = fnBody(DESK, '_bfStartQuick');
    expect(start).toMatch(/_bfState\.allCards\s*=\s*allCards\.slice\(\)/);
    expect(start).toMatch(/_bfState\.poolQnums/);
    expect(start).toMatch(/_bfState\.seenQnums/);
    expect(start).toMatch(/Array\.isArray\(resumed\.primedQnums\)/);
    expect(start).toMatch(/_bfState\.primedQnums\s*=\s*\[\]/);
  });

  it('orders the full pool hard, med, easy, then untagged without trimming', () => {
    const orderByDifficulty = new Function(
      'return (' + fnBody(DESK, '_bfOrderByDifficulty') + ');'
    )();
    const cards = [card(1), card(2), card(3), card(4), card(5), card(6)];
    const ordered = orderByDifficulty(cards, {
      '1': { difficulty: 'easy' },
      '2': { difficulty: 'med' },
      '4': { difficulty: 'hard' },
      '5': { difficulty: 'easy' },
      '6': { difficulty: 'hard' }
    });
    expect(ordered.map(function (item) { return item.qnum; })).toEqual([4, 6, 2, 1, 5, 3]);
  });

  it('keeps three misses and refills with seven never-seen cards in pool order', () => {
    const buildRetryDeck = new Function(
      'return (' + fnBody(DESK, '_bfBuildRetryDeck') + ');'
    )();
    const allCards = Array.from({ length: 28 }, function (_, index) { return card(index + 1); });
    const currentDeck = allCards.slice(0, 10);
    const misses = [2, 5, 9].map(function (qnum) { return { qnum }; });
    const poolQnums = allCards.map(function (item) { return item.qnum; });
    const seenQnums = currentDeck.map(function (item) { return item.qnum; });

    const retryDeck = buildRetryDeck(currentDeck, misses, poolQnums, seenQnums, allCards);

    expect(retryDeck.map(function (item) { return item.qnum; })).toEqual([
      2, 5, 9, 11, 12, 13, 14, 15, 16, 17
    ]);
    expect(new Set(retryDeck.map(function (item) { return item.qnum; })).size).toBe(10);
  });

  it('signals the literal legacy reshuffle path when the unseen pool is exhausted', () => {
    const buildRetryDeck = new Function(
      'return (' + fnBody(DESK, '_bfBuildRetryDeck') + ');'
    )();
    const currentDeck = Array.from({ length: 10 }, function (_, index) { return card(index + 1); });
    const poolQnums = currentDeck.map(function (item) { return item.qnum; });

    expect(buildRetryDeck(
      currentDeck,
      [{ qnum: 2 }, { qnum: 5 }, { qnum: 9 }],
      poolQnums,
      poolQnums,
      currentDeck
    )).toBeNull();
    expect(fnBody(DESK, '_bfFinish')).toMatch(
      /else\s*\{\s*(?:_bfState\.primedQnums\s*=\s*\[\]\s*;\s*)?_bfState\.deck\s*=\s*_bfShuffle\(_bfState\.deck\)/
    );
  });

  it('logs retained redraw misses as primed and fresh refill cards as clean', async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-question"></div>
      <div id="bf-choices"></div>
      <div id="bf-progress"></div>
      <div id="bf-feedback"></div>
      <button id="bf-next"></button>
      <div id="bf-result"></div>
    </body>`);
    const allCards = Array.from({ length: 17 }, function (_, index) {
      return card(index + 1);
    });
    const state = {
      topic: '4.1',
      btn: {},
      deck: allCards.slice(0, 10),
      idx: 10,
      score: 0,
      answered: true,
      finishId: null,
      advanceId: null,
      finished: false,
      roundId: 'desk-old-round',
      seq: 10,
      cardStart: 1000,
      misses: [2, 5, 9].map(function (qnum) { return { qnum, q: 'Question ' + qnum, correctAnswer: 'Right' }; }),
      perm: [0, 1],
      primedQnums: [],
      poolQnums: allCards.map(function (item) { return item.qnum; }),
      seenQnums: allCards.slice(0, 10).map(function (item) { return item.qnum; }),
      allCards,
      lastFinishAt: null
    };
    const logged = [];
    const factory = new Function(
      'document', '_bfState', 'BLOOKET_PASS_THRESHOLD', '_mayScore',
      '_bfWorksheetUrl', 'BLOOKET_RETRY_COOLDOWN_MS', '_fcFlag',
      '_bfLoadAllCardsForRetry', '_bfShuffle', '_bfMergeSeenQnums',
      '_srsRoundId', '_bfSaveProgress', '_bfRenderCard', '_srsAppendLog',
      '_srsCsvFor', '_srsStemHash', 'Date', 'setTimeout', '_bfNext',
      fnBody(DESK, '_bfBuildRetryDeck') + '\n'
        + fnBody(DESK, '_bfFinish') + '\n'
        + fnBody(DESK, '_bfAnswer') + '\n'
        + 'return { finish: _bfFinish, answer: _bfAnswer };'
    );
    const api = factory(
      dom.window.document,
      state,
      0.80,
      function () { return true; },
      function () { return null; },
      0,
      function () { return true; },
      async function () { return true; },
      function (deck) { return deck.slice(); },
      function (seen) { return seen.slice(); },
      function () { return 'desk-new-round'; },
      function () {},
      function () {},
      function (entries) { logged.push(entries[0]); },
      function () { return 'u4_l1_l2_blooket.csv'; },
      function () { return 'feedbeef'; },
      { now() { return 2000; } },
      function () { return 1; },
      function () {}
    );

    await api.finish();
    const retry = Array.from(dom.window.document.querySelectorAll('#bf-result button'))
      .find(function (button) { return button.textContent === 'Try again (new shuffle)'; });
    expect(retry).toBeTruthy();
    await retry.onclick();

    expect(state.primedQnums).toEqual([2, 5, 9]);
    api.answer(0);
    state.idx = 3;
    state.answered = false;
    api.answer(0);

    expect(logged.map(function (entry) { return entry.missIndex; })).toEqual([1, 0]);
  });
});
