// desk-blooket-flashcards.test.js — Blooket Done now opens a flashcard
// quiz sourced from the same Blooket CSV. Single pass ≥ 80% → auto-mark
// Done. Below 80% → retry. Done click NEVER writes a Done mark without
// passing the flashcards first.
//
// Static parse of the Desk HTML source — no DOM execution.
//
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk: Blooket flashcard verification', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: BLOOKET_PASS_THRESHOLD is 0.80', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_PASS_THRESHOLD\s*=\s*0\.80/);
  });

  it('02: blooket has NO visit timer + is launched via the always-available Flashcards button', () => {
    // 2026-05-20: the 15-min visit timer was removed. 2026-06-02: the blooket Done
    // button became a persistent "Flashcards" launcher (mode picker) — the score
    // shows in a separate colored chip (FLASHCARD_TIMED_DECK_BUILD.md).
    expect(DESK, 'the BLOOKET_GATE_MS constant must be gone').not.toMatch(/BLOOKET_GATE_MS/);
    const body = fnBody(DESK, 'showResourcePanel');
    // The launcher routes to studentMark(..., 'blooket') and is always clickable.
    expect(body).toMatch(/studentMark\(this,[^\n]*blooket/);
    expect(body).toContain("var _blLabel = 'Flashcards'");
    expect(body).not.toContain('Flashcards — need 80%');
  });

  it('03: _doneBtn no longer handles blooket (it is launcher + chip in its row now)', () => {
    const body = fnBody(DESK, '_doneBtn');
    expect(body).not.toMatch(/artifact\s*===\s*['"]blooket['"]/);
    // quiz + worksheet branches are untouched.
    expect(body).toMatch(/artifact\s*===\s*['"]quiz['"]/);
    expect(body).toMatch(/artifact\s*===\s*['"]worksheet['"]/);
  });

  it('04: studentMark routes blooket to openBlooketFlashcards (NOT the inline score prompt)', () => {
    const body = fnBody(DESK, 'studentMark');
    // Branch on blooket BEFORE the quiz branch and returns early.
    expect(body).toMatch(/artifact\s*===\s*['"]blooket['"]/);
    expect(body).toMatch(/openBlooketFlashcards\s*\(\s*btn\s*,\s*topicId\s*\)/);
    // The blooket branch is BEFORE quiz (so blooket doesn't fall through).
    const blooketIdx = body.indexOf("artifact === 'blooket'");
    const quizIdx = body.indexOf("artifact === 'quiz'");
    expect(blooketIdx, 'blooket branch must be in studentMark').toBeGreaterThan(-1);
    expect(quizIdx, 'quiz branch must still be in studentMark').toBeGreaterThan(-1);
    expect(blooketIdx, 'blooket branch must precede the quiz branch').toBeLessThan(quizIdx);
  });

  it('05: openBlooketFlashcards function exists and accepts (btn, topicId)', () => {
    expect(DESK).toMatch(/async\s+function\s+openBlooketFlashcards\s*\(\s*btn\s*,\s*topicId\s*\)/);
  });

  it('06: CSV path resolver maps topic to u{U}_l{key}_blooket.csv via the registry', () => {
    expect(DESK).toMatch(/function\s+_bfCsvPath\s*\(/);
    const body = fnBody(DESK, '_bfCsvPath');
    expect(body).toMatch(/getRegistryEntry/);
    expect(body).toMatch(/_blooket\.csv/);
    // Combined-worksheet keys (1-2) must map to underscores (l1_l2).
    expect(body).toMatch(/replace\s*\(\s*\/-\/g\s*,\s*['"]_l['"]/);
  });

  it('07: CSV parser handles quoted fields with embedded commas + newlines', () => {
    expect(DESK).toMatch(/function\s+_bfParseCsv\s*\(/);
    const body = fnBody(DESK, '_bfParseCsv');
    // Tracks an inQuote flag for proper RFC-4180 parsing.
    expect(body).toMatch(/inQuote/);
    // Handles the doubled-quote escape ("") inside a quoted field.
    expect(body).toMatch(/text\[i\+1\]\s*===\s*['"]"['"]/);
  });

  it('08: deck builder skips template/header rows and reads Q# / question text / 4 answers / correct#', () => {
    expect(DESK).toMatch(/function\s+_bfRowsToDeck\s*\(/);
    const body = fnBody(DESK, '_bfRowsToDeck');
    // The Blooket CSV puts the correct-answer number in column 7 (0-indexed).
    expect(body).toMatch(/parseInt\s*\(\s*\(r\[7\]/);
    // Answers in cols 2..5.
    expect(body).toMatch(/j\s*<=\s*5/);
    // Must skip rows whose col 0 isn't a real question number (template rows).
    expect(body).toMatch(/Number\.isFinite\s*\(\s*qnum/);
  });

  it('09: deck is shuffled per-attempt (random order)', () => {
    expect(DESK).toMatch(/function\s+_bfShuffle\s*\(/);
    const body = fnBody(DESK, '_bfShuffle');
    expect(body).toMatch(/Math\.random/);
  });

  it('10: _bfAnswer scores the click and locks the choice buttons (no double-click)', () => {
    const body = fnBody(DESK, '_bfAnswer');
    expect(body).toMatch(/_bfState\.answered/);
    expect(body).toMatch(/_bfState\.score\s*\+=\s*1/);
    expect(body).toMatch(/btns\[i\]\.disabled\s*=\s*true/);
    // Visual feedback: correct + wrong CSS classes.
    expect(body).toMatch(/bf-correct/);
    expect(body).toMatch(/bf-wrong/);
  });

  it('10b: answers never finish early at eight correct', () => {
    const body = fnBody(DESK, '_bfAnswer');
    expect(body).not.toContain('BLOOKET_PASS_THRESHOLD');
    expect(body).not.toContain('_bfFinish');
    expect(body).toContain('_bfNext');
  });

  it('11: every completed run records through the daily path', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toContain('recordFlashcardRun');
    expect(body).not.toContain('_blooketCommit');
    expect(body).toContain('Try again (new shuffle)');
  });

  it('12: results have no pass threshold', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).not.toMatch(/passed|BLOOKET_PASS_THRESHOLD/);
    expect(body).toContain('You got ');
  });

  it('13: blooket row shows a launcher (not an immediate Done) + best-wins commit exists', () => {
    // The launcher label tells the student the click opens flashcards, not a mark.
    const body = fnBody(DESK, 'showResourcePanel');
    expect(body).toContain("var _blLabel = 'Flashcards'");
    // _blooketCommit implements best-wins (re-running can't lower the score).
    expect(DESK).toMatch(/async\s+function\s+_blooketCommit\s*\(/);
    const commit = fnBody(DESK, '_blooketCommit');
    expect(commit).toMatch(/score\s*>\s*floor/);              // only save a NEW best
    expect(commit).toMatch(/_studentMarkSave\s*\(\s*btn\s*,\s*topic\s*,\s*['"]blooket['"]/);
  });

  it('13b: the blooket SCORE shows as a colored chip from _blooketScoreFor (not a bare Done)', () => {
    expect(DESK).toMatch(/function\s+_blooketScoreFor\s*\(/);
    const helper = fnBody(DESK, '_blooketScoreFor');
    expect(helper).toMatch(/_gradeLessonsCache/);
    expect(helper).toMatch(/\.blooket/);
    const body = fnBody(DESK, 'showResourcePanel');
    // The chip is built from the blooket score against the 80% gate.
    expect(body).not.toMatch(/_scoreChip\(\s*_blScore\s*,\s*80\s*\)/);
    expect(body).toMatch(/_blooketScoreFor\(/);
  });

  it('14: _bfCloseUI clears _bfState (called by both close + finish; no leak)', () => {
    // 2026-05-20: close path was refactored into closeBlooketFlashcards
    // (which saves progress first) + _bfCloseUI (which clears in-memory
    // state without touching localStorage). The state-clearing lives in
    // _bfCloseUI now.
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/_bfState\.topic\s*=\s*null/);
    expect(body).toMatch(/_bfState\.deck\s*=\s*\[\]/);
  });

  it('15: flashcard modal markup exists and is default-hidden', () => {
    expect(DESK).toMatch(/id="bf-overlay"[^>]*class="dialog-overlay"[^>]*display:none/);
    expect(DESK).toMatch(/id="bf-question"/);
    expect(DESK).toMatch(/id="bf-choices"/);
    expect(DESK).toMatch(/id="bf-result"/);
  });

  // ── 2026-05-20: flashcard progress persistence ─────────────────────────────
  it('16: progress storage helpers (_bfSaveProgress/_bfLoadProgress/_bfClearProgress) exist', () => {
    expect(DESK).toMatch(/function\s+_bfSaveProgress\s*\(/);
    expect(DESK).toMatch(/function\s+_bfLoadProgress\s*\(/);
    expect(DESK).toMatch(/function\s+_bfClearProgress\s*\(/);
  });

  it('17: the quick check (_bfStartQuick) tries to resume saved progress before fetching CSV', () => {
    // The quick-mode load logic moved from openBlooketFlashcards (now the mode
    // picker) into _bfStartQuick (FLASHCARD_TIMED_DECK_BUILD.md).
    const body = fnBody(DESK, '_bfStartQuick');
    expect(body).toMatch(/_bfLoadProgress\s*\(\s*topicId\s*\)/);
    const loadIdx = body.indexOf('_bfLoadProgress');
    const fetchIdx = body.indexOf('await fetch');
    expect(loadIdx, 'load attempt before fetch').toBeLessThan(fetchIdx);
  });

  it('18: _bfNext saves progress after each advance', () => {
    const body = fnBody(DESK, '_bfNext');
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
    // Must increment idx and save together.
    expect(body).toMatch(/_bfState\.idx\s*\+=\s*1/);
  });

  it('19: closeBlooketFlashcards saves progress (Cancel preserves resume state)', () => {
    const body = fnBody(DESK, 'closeBlooketFlashcards');
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
  });

  it('20: every completed run clears saved progress', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toContain('_bfClearProgress(_bfState.topic)');
    expect(body).not.toContain('if (passed)');
  });

  it('21: storage key is scoped per student email', () => {
    const body = fnBody(DESK, '_bfStorageKey');
    expect(body).toMatch(/getStudentEmail/);
    expect(body).toMatch(/a2_desk_bf_progress_/);
  });

  it('22: load defensively returns null if saved idx is past deck length (corruption guard)', () => {
    const body = fnBody(DESK, '_bfLoadProgress');
    // Must check that idx < deck.length before returning the entry.
    expect(body).toMatch(/entry\.deck\.length/);
    expect(body).toMatch(/idx\s*\|\|\s*0\s*\)\s*>=\s*entry\.deck\.length/);
  });

  it('23: retry button clears + reshuffles + saves new shuffle (fresh start)', () => {
    const body = fnBody(DESK, '_bfFinish');
    // Retry handler must reshuffle, reset idx/score, and save.
    expect(body).toMatch(/_bfShuffle\s*\(\s*_bfState\.deck\s*\)/);
    expect(body).toMatch(/_bfSaveProgress\s*\(\s*\)/);
  });

  // ── 2026-05-20: difficulty-aware top-10 deck trim ──────────────────────────
  it('24: _bfRowsToDeck carries qnum on each card (for tag lookup)', () => {
    const body = fnBody(DESK, '_bfRowsToDeck');
    // qnum must be on the pushed card.
    expect(body).toMatch(/var card = \{ qnum: qnum/);
    expect(body).toContain('deck.push(card)');
  });

  it('25: _bfLoadDifficultyTags fetches data/blooket-difficulty.json + caches', () => {
    expect(DESK).toMatch(/async\s+function\s+_bfLoadDifficultyTags\s*\(/);
    const body = fnBody(DESK, '_bfLoadDifficultyTags');
    expect(body).toMatch(/data\/blooket-difficulty\.json/);
    expect(body).toMatch(/_bfDifficultyTags/);
    // Caches: returns existing value if already set.
    expect(body).toMatch(/_bfDifficultyTags\s*!==\s*null/);
  });

  it('26: _bfSelectTop10 function exists and targets 10 cards', () => {
    expect(DESK).toMatch(/function\s+_bfSelectTop10\s*\(/);
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/TARGET\s*=\s*10/);
  });

  it('27: _bfSelectTop10 orders hard → med → easy → untagged then slices to TARGET', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    // Buckets present.
    expect(body).toMatch(/hard\s*=\s*\[\]/);
    expect(body).toMatch(/med\s*=\s*\[\]/);
    expect(body).toMatch(/easy\s*=\s*\[\]/);
    expect(body).toMatch(/untagged\s*=\s*\[\]/);
    // Concat order: hard first, then med, then easy, then untagged.
    expect(body).toMatch(/hard\.concat\s*\(\s*med\s*,\s*easy\s*,\s*untagged\s*\)/);
    // Slice to TARGET at the end.
    expect(body).toMatch(/\.slice\s*\(\s*0\s*,\s*TARGET\s*\)/);
  });

  it('28: _bfSelectTop10 returns all cards when deck.length <= 10', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/allCards\.length\s*<=\s*TARGET/);
  });

  it('29: _bfSelectTop10 falls back to first-TARGET when tagsForFile is empty', () => {
    const body = fnBody(DESK, '_bfSelectTop10');
    expect(body).toMatch(/Object\.keys\s*\(\s*tagsForFile\s*\)\.length\s*===\s*0/);
    // The fallback returns allCards.slice(0, TARGET).
    expect(body).toMatch(/allCards\.slice\s*\(\s*0\s*,\s*TARGET\s*\)/);
  });

  it('30: the quick check uses the shared daily draw without shuffling it', () => {
    const body = fnBody(DESK, '_bfStartQuick');
    expect(body).toMatch(/Flashcards.dailyDraw\(allCards, Flashcards.localDateKey\(\) \+ '\|' \+ topicId, Flashcards.QUICK_TARGET\)/);
    expect(body).toContain('_bfState.deck = deck;');
    expect(body).not.toContain('_bfShuffle(deck)');
  });

  it('30b: the FULL timed deck (_ftStart) does NOT trim to top-10 (uses every card)', () => {
    expect(DESK).toMatch(/async\s+function\s+_ftStart\s*\(/);
    const body = fnBody(DESK, '_ftStart');
    expect(body).toMatch(/_bfRowsToDeck\s*\(\s*_bfParseCsv/);
    expect(body, 'full deck must not call _bfSelectTop10').not.toMatch(/_bfSelectTop10/);
    expect(body).toMatch(/_ftCreateRound/);
  });

  it('31: _bfSelectTop10 smoke-test — hard-first ordering on synthetic input', () => {
    // Pull the function body out of the source and run it for real.
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [];
    for (let i = 1; i <= 12; i++) allCards.push({ qnum: i, q: 'Q' + i });

    const tags = {
      '1': { difficulty: 'easy' },
      '2': { difficulty: 'easy' },
      '3': { difficulty: 'easy' },
      '4': { difficulty: 'easy' },
      '5': { difficulty: 'med' },
      '6': { difficulty: 'med' },
      '7': { difficulty: 'med' },
      '8': { difficulty: 'med' },
      '9': { difficulty: 'med' },
      '10': { difficulty: 'hard' },
      '11': { difficulty: 'hard' },
      '12': { difficulty: 'hard' }
    };

    const picked = _bfSelectTop10(allCards, 'foo.csv', tags);
    expect(picked).toHaveLength(10);

    // First 3 must be the hard cards (qnum 10, 11, 12 in some order).
    const firstThreeQnums = picked.slice(0, 3).map(c => c.qnum).sort();
    expect(firstThreeQnums).toEqual([10, 11, 12]);

    // Next 5 must be the med cards (qnum 5-9).
    const nextFiveQnums = picked.slice(3, 8).map(c => c.qnum).sort();
    expect(nextFiveQnums).toEqual([5, 6, 7, 8, 9]);

    // Last 2 are easy.
    const lastTwoQnums = picked.slice(8, 10).map(c => c.qnum).sort();
    expect(lastTwoQnums[0]).toBeGreaterThanOrEqual(1);
    expect(lastTwoQnums[1]).toBeLessThanOrEqual(4);
  });

  it('32: _bfSelectTop10 smoke-test — fewer than 10 cards returned unchanged', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [{ qnum: 1 }, { qnum: 2 }, { qnum: 3 }];
    const picked = _bfSelectTop10(allCards, 'small.csv', { '1': { difficulty: 'hard' } });
    expect(picked).toHaveLength(3);
    expect(picked.map(c => c.qnum)).toEqual([1, 2, 3]);
  });

  it('33: _bfSelectTop10 smoke-test — empty tags falls back to first-10', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const factory = new Function('return (' + src + ');');
    const _bfSelectTop10 = factory();

    const allCards = [];
    for (let i = 1; i <= 15; i++) allCards.push({ qnum: i });
    const picked = _bfSelectTop10(allCards, 'untagged.csv', {});
    expect(picked).toHaveLength(10);
    expect(picked.map(c => c.qnum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  // ── 2026-05-20: keyboard navigation in the flashcard modal ────────────────
  it('34: _bfKeydownHandler function exists', () => {
    expect(DESK).toMatch(/function\s+_bfKeydownHandler\s*\(/);
  });

  it('35: keydown handler has active-element guard (INPUT/TEXTAREA/SELECT/contentEditable)', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/tag\s*===\s*['"]INPUT['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]TEXTAREA['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]SELECT['"]/);
    expect(body).toMatch(/isContentEditable/);
  });

  it('36: keydown handler has modifier guard (ctrl/meta/alt/shift)', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/e\.ctrlKey/);
    expect(body).toMatch(/e\.metaKey/);
    expect(body).toMatch(/e\.altKey/);
    expect(body).toMatch(/e\.shiftKey/);
  });

  it('37: keydown handler maps letters a-d to choice indices 0-3', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    // Letter map present.
    expect(body).toMatch(/['"]abcd['"]\.indexOf\s*\(\s*key\s*\)/);
  });

  it('38: keydown handler maps numbers 1-4 to choice indices', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/key\s*===\s*['"]1['"]/);
    expect(body).toMatch(/parseInt\s*\(\s*key\s*,\s*10\s*\)\s*-\s*1/);
  });

  it('39: keydown handler advances on Enter when already answered + next visible', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/_bfState\.answered/);
    expect(body).toMatch(/key\s*===\s*['"]enter['"]/);
    expect(body).toMatch(/bf-next/);
    expect(body).toMatch(/nextBtn\.click/);
  });

  it('40: the quick check (_bfStartQuick) attaches the keydown listener after rendering', () => {
    const body = fnBody(DESK, '_bfStartQuick');
    expect(body).toMatch(/addEventListener\s*\(\s*['"]keydown['"]\s*,\s*_bfKeydownHandler\s*\)/);
    // Attach AFTER first render call (so initial card is showing).
    const renderIdx = body.indexOf('_bfRenderCard()');
    const attachIdx = body.indexOf("addEventListener('keydown'");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(attachIdx).toBeGreaterThan(renderIdx);
  });

  it('41: _bfCloseUI detaches keydown listener (no leak between modal opens)', () => {
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/removeEventListener\s*\(\s*['"]keydown['"]\s*,\s*_bfKeydownHandler\s*\)/);
  });

  it('42: progress text in _bfRenderCard mentions the keyboard shortcut hint', () => {
    const body = fnBody(DESK, '_bfRenderCard');
    expect(body).toMatch(/a-d\s+or\s+1-4/);
  });

  // ── difficulty JSON sanity ────────────────────────────────────────────────
  

  

  // ── 2026-05-20: _bfSelectTop10 edge-case smoke tests ──────────────────────
  it('45: _bfSelectTop10 smoke — deck with ZERO hard cards still yields 10', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const _bfSelectTop10 = new Function('return (' + src + ');')();

    const allCards = [];
    for (let i = 1; i <= 14; i++) allCards.push({ qnum: i });
    const tags = {};
    for (let i = 1; i <= 8; i++) tags[String(i)] = { difficulty: 'med' };
    for (let i = 9; i <= 14; i++) tags[String(i)] = { difficulty: 'easy' };

    const picked = _bfSelectTop10(allCards, 'nohard.csv', tags);
    expect(picked).toHaveLength(10);
    // First 8 are the med cards; last 2 come from easy.
    const firstEight = picked.slice(0, 8).map(c => c.qnum).sort((a, b) => a - b);
    expect(firstEight).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const lastTwo = picked.slice(8, 10).map(c => c.qnum);
    for (const q of lastTwo) expect(q).toBeGreaterThanOrEqual(9);
  });

  it('46: _bfSelectTop10 smoke — untagged qnums sink to the end, never dropped', () => {
    const src = fnBody(DESK, '_bfSelectTop10');
    // eslint-disable-next-line no-new-func
    const _bfSelectTop10 = new Function('return (' + src + ');')();

    const allCards = [];
    for (let i = 1; i <= 12; i++) allCards.push({ qnum: i });
    // Only 3 of 12 are tagged (all hard); the other 9 have no tag entry.
    const tags = {
      '5': { difficulty: 'hard' },
      '9': { difficulty: 'hard' },
      '11': { difficulty: 'hard' }
    };
    const picked = _bfSelectTop10(allCards, 'sparse.csv', tags);
    expect(picked).toHaveLength(10);
    // The 3 hard cards lead.
    const firstThree = picked.slice(0, 3).map(c => c.qnum).sort((a, b) => a - b);
    expect(firstThree).toEqual([5, 9, 11]);
    // The remaining 7 are untagged cards (in original order) — none of them is
    // a tagged qnum, and the deck did not shrink below 10.
    const rest = picked.slice(3).map(c => c.qnum);
    for (const q of rest) expect([5, 9, 11]).not.toContain(q);
  });

  // ── 2026-05-20: _bfKeydownHandler real-execution tests ────────────────────
  // The handler closes over `document`, `_bfState`, `_bfAnswer`. We extract its
  // source and instantiate it with injected fakes so the real branch logic runs.
  function makeKeyHandler({ overlayDisplay = 'block', activeTag = null,
                            isContentEditable = false, answered = false,
                            nextDisplay = 'inline-block',
                            deck = [{ choices: ['c0', 'c1', 'c2', 'c3'], correctIdx: 0 }] } = {}) {
    const calls = { answered: [], nextClicked: 0 };
    const fakeDoc = {
      activeElement: activeTag ? { tagName: activeTag, isContentEditable } : null,
      getElementById(id) {
        if (id === 'bf-overlay') return { style: { display: overlayDisplay } };
        if (id === 'bf-next') return { style: { display: nextDisplay }, click() { calls.nextClicked++; } };
        return null;
      }
    };
    const fakeState = { answered, idx: 0, deck };
    const fakeAnswer = (i) => calls.answered.push(i);
    const src = fnBody(DESK, '_bfKeydownHandler');
    // eslint-disable-next-line no-new-func
    const handler = new Function('document', '_bfState', '_bfAnswer',
      'return (' + src + ');')(fakeDoc, fakeState, fakeAnswer);
    return { handler, calls };
  }

  function ev(key) {
    let prevented = false;
    return { obj: { key, preventDefault() { prevented = true; } }, get prevented() { return prevented; } };
  }

  it('47: keydown smoke — letter b selects choice index 1', () => {
    const { handler, calls } = makeKeyHandler();
    const e = ev('b');
    handler(e.obj);
    expect(calls.answered).toEqual([1]);
    expect(e.prevented).toBe(true);
  });

  it('48: keydown smoke — number 3 selects choice index 2', () => {
    const { handler, calls } = makeKeyHandler();
    handler(ev('3').obj);
    expect(calls.answered).toEqual([2]);
  });

  it('49: keydown smoke — modifier key (ctrl) is a no-op', () => {
    const { handler, calls } = makeKeyHandler();
    handler({ key: 'a', ctrlKey: true, preventDefault() {} });
    expect(calls.answered).toEqual([]);
  });

  it('50: keydown smoke — focus in an INPUT is a no-op', () => {
    const { handler, calls } = makeKeyHandler({ activeTag: 'INPUT' });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([]);
  });

  it('51: keydown smoke — hidden overlay is a no-op', () => {
    const { handler, calls } = makeKeyHandler({ overlayDisplay: 'none' });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([]);
  });

  it('52: keydown smoke — Enter when answered clicks the Next button', () => {
    const { handler, calls } = makeKeyHandler({ answered: true });
    handler(ev('Enter').obj);
    expect(calls.nextClicked).toBe(1);
    expect(calls.answered).toEqual([]);
  });

  it('53: keydown smoke — d on a 3-choice card is a no-op (idx out of range)', () => {
    const { handler, calls } = makeKeyHandler({
      deck: [{ choices: ['c0', 'c1', 'c2'], correctIdx: 0 }]
    });
    handler(ev('d').obj);
    expect(calls.answered).toEqual([]);
  });

  it('54: keydown smoke — letter a still selects on that 3-choice card', () => {
    const { handler, calls } = makeKeyHandler({
      deck: [{ choices: ['c0', 'c1', 'c2'], correctIdx: 0 }]
    });
    handler(ev('a').obj);
    expect(calls.answered).toEqual([0]);
  });

  // ── 2026-08-18: quick-check answered-snapshot resume integrity ────────────
  function makeQuickResumeHarness() {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-header"></div>
      <div id="bf-overlay" style="display:block"></div>
      <div id="bf-result" style="display:none"></div>
      <div id="bf-choices"></div>
      <div id="bf-feedback"></div>
      <button id="bf-next" style="display:none"></button>
    </body>`, { url: 'https://desk.test/' });
    const state = {
      topic: null,
      btn: null,
      deck: [],
      idx: 0,
      score: 0,
      answered: false
    };
    const timedState = { topic: null, btn: null, round: null, answered: false };
    const calls = { renderIdxs: [], finishCount: 0, finishPct: null };
    const source = [
      fnBody(DESK, '_bfStorageKey'),
      fnBody(DESK, '_bfSaveProgress'),
      fnBody(DESK, '_bfLoadProgress'),
      fnBody(DESK, '_bfAnswer'),
      fnBody(DESK, '_bfCloseUI'),
      fnBody(DESK, 'closeBlooketFlashcards'),
      fnBody(DESK, '_bfStartQuick')
    ].join('\n');
    // eslint-disable-next-line no-new-func
    const makeApi = new Function(
      'document', 'window', 'location', 'localStorage',
      'getStudentEmail', '_viewAsContext', '_bfState', '_ftState',
      '_ftKeydownHandler', '_ftClearTimer', '_bfShowQuizUI',
      '_bfRenderCard', '_bfFinish', '_bfKeydownHandler',
      'BLOOKET_PASS_THRESHOLD',
      source + '\nreturn {' +
        '_bfSaveProgress: _bfSaveProgress,' +
        '_bfAnswer: _bfAnswer,' +
        '_bfStartQuick: _bfStartQuick,' +
        'closeBlooketFlashcards: closeBlooketFlashcards' +
      '};'
    );
    const api = makeApi(
      dom.window.document,
      dom.window,
      dom.window.location,
      dom.window.localStorage,
      function () { return 'student@roster.local'; },
      function () { return null; },
      state,
      timedState,
      function () {},
      function () {},
      function () {},
      function () { calls.renderIdxs.push(state.idx); },
      function () {
        calls.finishCount += 1;
        calls.finishPct = state.deck.length > 0 ? state.score / state.deck.length : 0;
      },
      function () {},
      0.80
    );
    const storageKey = 'a2_desk_bf_progress_student@roster.local';

    function saveRecord(topic, entry) {
      const saved = {};
      saved[topic] = entry;
      dom.window.localStorage.setItem(storageKey, JSON.stringify(saved));
    }

    return { api, calls, dom, saveRecord, state, storageKey };
  }

  function quickDeck(size) {
    const deck = [];
    for (let i = 0; i < size; i++) {
      deck.push({
        qnum: i + 1,
        q: 'Question ' + (i + 1),
        choices: ['Right', 'Wrong'],
        correctIdx: 0
      });
    }
    return deck;
  }

  // moved to journeys/j4-quick-check.journey.test.js — J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)
  // moved to journeys/j4-quick-check.journey.test.js — J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)
  // moved to journeys/j4-quick-check.journey.test.js — J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)

  function makeRealQuickTimerHarness() {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="bf-overlay" style="display:block"></div>
      <div id="bf-header"></div>
      <div id="bf-question"></div>
      <div id="bf-choices"></div>
      <div id="bf-progress"></div>
      <div id="bf-feedback"></div>
      <button id="bf-next" style="display:none"></button>
      <div id="bf-result" style="display:none"></div>
      <div id="bf-modepick"></div>
      <div id="bf-timer"></div>
    </body>`, { url: 'https://desk.test/' });
    const values = new Map();
    const storage = {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
      clear() { values.clear(); }
    };
    const state = {
      topic: null,
      btn: null,
      deck: [],
      idx: 0,
      score: 0,
      answered: false,
      finishId: null,
      finished: false
    };
    const timedState = { topic: null, btn: null, round: null, answered: false };
    const commit = vi.fn(async function () {});
    const rendered = [];
    const source = [
      fnBody(DESK, '_bfStorageKey'),
      fnBody(DESK, '_bfSaveProgress'),
      fnBody(DESK, '_bfLoadProgress'),
      fnBody(DESK, '_bfClearProgress'),
      fnBody(DESK, '_bfAnswer'),
      fnBody(DESK, '_bfNext'),
      fnBody(DESK, '_bfFinish'),
      fnBody(DESK, '_bfCloseUI'),
      fnBody(DESK, 'closeBlooketFlashcards'),
      fnBody(DESK, '_bfStartQuick')
    ].join('\n');
    // eslint-disable-next-line no-new-func
    const makeApi = new Function(
      'document', 'window', 'location', 'localStorage',
      'getStudentEmail', '_viewAsContext', '_bfState', '_ftState',
      '_ftKeydownHandler', '_ftClearTimer', '_bfShowQuizUI',
      '_bfRenderCard', '_bfKeydownHandler', '_blooketCommit', '_mayScore',
      'BLOOKET_PASS_THRESHOLD', 'setTimeout', 'clearTimeout',
      source + '\nreturn {' +
        '_bfAnswer: _bfAnswer,' +
        '_bfNext: _bfNext,' +
        '_bfFinish: _bfFinish,' +
        '_bfSaveProgress: _bfSaveProgress,' +
        '_bfLoadProgress: _bfLoadProgress,' +
        '_bfClearProgress: _bfClearProgress,' +
        '_bfCloseUI: _bfCloseUI,' +
        'closeBlooketFlashcards: closeBlooketFlashcards,' +
        '_bfStartQuick: _bfStartQuick' +
      '};'
    );
    const api = makeApi(
      dom.window.document,
      dom.window,
      dom.window.location,
      storage,
      function () { return 'x@roster.local'; },
      function () { return null; },
      state,
      timedState,
      function () {},
      function () {},
      function () {},
      function () { rendered.push(state.idx); },
      function () {},
      commit,
      function () { return true; },
      0.80,
      setTimeout,
      clearTimeout
    );

    function begin(topic, deck, btn) {
      state.topic = topic;
      state.btn = btn;
      state.deck = deck;
      state.idx = 0;
      state.score = 0;
      state.answered = false;
      state.finishId = null;
      state.finished = false;
    }

    return {
      api,
      begin,
      commit,
      dom,
      rendered,
      state,
      storage,
      storageKey: 'a2_desk_bf_progress_x@roster.local'
    };
  }

  // moved to journeys/j4-quick-check.journey.test.js — J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)
  // moved to journeys/j4-quick-check.journey.test.js — J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)
  // moved to journeys/j4-quick-check.journey.test.js — J4 opens a legacy snapshot without answered at its saved card (supersedes desk-blooket-flashcards it 59 “legacy snapshot without answered resumes at its saved index”)
});


// Synthetic A2 content exercises the retained parser and difficulty loader without
// requiring AP corpus counts or imposing authoring requirements on future decks.
describe('A2 CSV and difficulty inputs', () => {
  it('parses algebra cards and discards headers, blank prompts, and single-choice rows', () => {
    const source = ['_bfParseCsv', '_bfRowsToDeck'].map(name => fnBody(DESK, name)).join('\n');
    const parse = new Function(source + '\nreturn text => _bfRowsToDeck(_bfParseCsv(text));')();
    const csv = [
      'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
      '1,"Solve x + 2 = 5","2","3",,,20,2',
      '2,"","2","3",,,20,1',
      '3,"Solve x = 1","1",,,,20,1',
      '4,"Domain includes (1, 2)","True","False",,,20,1',
    ].join('\n');
    expect(parse(csv)).toEqual([
      { qnum: 1, q: 'Solve x + 2 = 5', choices: ['2', '3'], correctIdx: 1 },
      { qnum: 4, q: 'Domain includes (1, 2)', choices: ['True', 'False'], correctIdx: 0 },
    ]);
    expect(parse('')).toEqual([]);
    expect(parse('Question #,Question Text')).toEqual([]);
  });

  it('loads and caches the per-deck difficulty schema with inline A2 tags', async () => {
    const tags = { 'content/a2/1-1/deck.csv': {
      '1': { difficulty: 'easy', rationale: 'One inverse operation.' },
      '2': { difficulty: 'med', rationale: 'Compare two representations.' },
      '3': { difficulty: 'hard', rationale: 'Justify the domain restriction.' },
    } };
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ version: 1, tags }) }));
    const load = new Function('fetch', 'var _bfDifficultyTags = null;\n' +
      fnBody(DESK, '_bfLoadDifficultyTags') + '\nreturn _bfLoadDifficultyTags;')(fetch);
    expect(await load()).toEqual(tags);
    expect(await load()).toEqual(tags);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('data/blooket-difficulty.json', { cache: 'no-cache' });
  });

  it.each([
    ['empty A2 map', async () => ({ ok: true, json: async () => ({}) })],
    ['missing response', async () => ({ ok: false })],
    ['invalid JSON', async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } })],
    ['offline', async () => { throw new Error('offline'); }],
  ])('falls back to untagged cards for %s', async (_label, fetch) => {
    const load = new Function('fetch', 'var _bfDifficultyTags = null;\n' +
      fnBody(DESK, '_bfLoadDifficultyTags') + '\nreturn _bfLoadDifficultyTags;')(fetch);
    expect(await load()).toEqual({});
  });
});
