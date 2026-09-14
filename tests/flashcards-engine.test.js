// flashcards-engine.test.js — the shared flashcards.js pure engine (used by the
// native mobile launcher flashcards) + a PARITY block that extracts the Desk's inline
// _bf*/_ft* functions and asserts flashcards.js produces byte-identical output, so the
// grade-critical logic (scoring + the BL-…-DESK_DONE item-id) can never drift.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function loadEngine() {
  const win = {};
  runInContext(readFileSync(resolve(repo, 'flashcards.js'), 'utf8'),
    createContext({ window: win, globalThis: win, self: win, Math, String, Number, Array, Object, parseInt, isFinite, JSON }));
  return win.Flashcards;
}

// Extract a Desk inline function body by brace-matching + instantiate it.
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
function deskFn(name, deps = '') {
  return new Function(deps + '\nreturn (' + fnBody(DESK, name) + ');')();
}

const SAMPLE_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"What is the mean?","average","median","mode","range",20,1',
  '2,"Std dev measures?","center","spread, mostly","shape","n",20,2',
  '3,"Skip me — no choices","only one",,,,20,1',    // dropped (< 2 choices)
  'x,"header-ish row",a,b,,,,',                       // dropped (non-numeric Q#)
  '4,"Correct out of range","a","b","c","d",20,9',   // correctIdx clamps to 0
].join('\n');

let FC;
beforeAll(() => { FC = loadEngine(); });

describe('flashcards.js — deck pipeline', () => {
  it('parseCsv handles quoted commas + newlines', () => {
    const rows = FC.parseCsv(SAMPLE_CSV);
    // the "spread, mostly" cell keeps its comma
    const q2 = rows.find((r) => r[0] === '2');
    expect(q2[3]).toBe('spread, mostly');
  });

  it('rowsToDeck drops headers/short rows, clamps out-of-range correctIdx', () => {
    const deck = FC.rowsToDeck(FC.parseCsv(SAMPLE_CSV));
    expect(deck.map((c) => c.qnum)).toEqual([1, 2, 4]);   // 3 (one choice) + x (header) dropped
    expect(deck[0]).toMatchObject({ q: 'What is the mean?', correctIdx: 0 });
    expect(deck[1].correctIdx).toBe(1);
    expect(deck[2].correctIdx).toBe(0);                    // 9 → clamped
  });

  it('selectTop10 ranks hard>med>easy>untagged, else first-10, else all', () => {
    const cards = Array.from({ length: 14 }, (_, i) => ({ qnum: i + 1, q: 'q' + i, choices: ['a', 'b'], correctIdx: 0 }));
    const tags = { '3': { difficulty: 'hard' }, '7': { difficulty: 'hard' }, '2': { difficulty: 'easy' }, '5': { difficulty: 'med' } };
    const top = FC.selectTop10(cards, tags);
    expect(top.length).toBe(10);
    expect(top.slice(0, 3).map((c) => c.qnum)).toEqual([3, 7, 5]);   // hard, hard, med
    expect(FC.selectTop10(cards, {}).map((c) => c.qnum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // first-10
    expect(FC.selectTop10(cards.slice(0, 6), tags).length).toBe(6);  // <=10 → all
  });

  it('csvPathFromWorksheet maps the worksheet URL to the deck CSV (combined lessons keep the segment)', () => {
    expect(FC.csvPathFromWorksheet('u4_lesson1-2_live.html')).toBe('u4_l1_l2_blooket.csv');
    expect(FC.csvPathFromWorksheet('https://x/u1_lesson1_live.html')).toBe('u1_l1_blooket.csv');
    expect(FC.csvPathFromWorksheet('nope.html')).toBeNull();
  });
});

describe('flashcards.js — scoring', () => {
  it('quick: caps at 80% via the early-stop count; one-decimal percent', () => {
    expect(FC.quickPassCount(10)).toBe(8);
    expect(FC.quickScorePct(8, 10)).toBe(80);
    expect(FC.quickPassed(8, 10)).toBe(true);
    expect(FC.quickPassed(7, 10)).toBe(false);
    expect(FC.quickScorePct(2, 3)).toBe(66.7);
  });

  it('full timed: miss costs 1/3 + re-queues; 3 misses → 0 + drop; up to 100%', () => {
    const deck = [{ qnum: 1 }, { qnum: 2 }];
    let r = FC.createRound(deck);
    r = FC.recordOutcome(r, 'wrong');       // card0 miss1 → back of queue
    r = FC.recordOutcome(r, 'correct');     // card1 clean → earned 1
    r = FC.recordOutcome(r, 'correct');     // card0 (1 prior miss) → earned 2/3
    expect(FC.fullScorePct(r)).toBe(Math.round(((2 / 3 + 1) / 2 * 100) * 10) / 10);
    // strike-out path
    let s = FC.createRound([{ qnum: 9 }]);
    s = FC.recordOutcome(s, 'wrong'); s = FC.recordOutcome(s, 'timeout'); s = FC.recordOutcome(s, 'wrong');
    expect(FC.fullScorePct(s)).toBe(0);
    expect(s.status[0].resolved).toBe(true);
  });

  it('blooketItemId builds the grade-affecting BL-U{u}-L{key}-DESK_DONE (combined lessons kept)', () => {
    expect(FC.blooketItemId('4.1-2')).toEqual({ unit: 'U4', itemId: 'BL-U4-L1-2-DESK_DONE' });
    expect(FC.blooketItemId('1.10')).toEqual({ unit: 'U1', itemId: 'BL-U1-L10-DESK_DONE' });
    expect(FC.blooketItemId('garbage').itemId).toBe('BL-U?-DESK_DONE');
  });
});

// ── PARITY vs the Desk's inline copies (the divergence guard) ──────────────────
describe('flashcards.js === the Desk inline engine (parity)', () => {
  it('parseCsv / rowsToDeck / selectTop10 match _bfParseCsv / _bfRowsToDeck / _bfSelectTop10', () => {
    const deskParse = deskFn('_bfParseCsv');
    const deskRows = deskFn('_bfRowsToDeck', 'var Number=globalThis.Number;');
    const deskTop10 = deskFn('_bfSelectTop10');
    expect(FC.parseCsv(SAMPLE_CSV)).toEqual(deskParse(SAMPLE_CSV));
    expect(FC.rowsToDeck(FC.parseCsv(SAMPLE_CSV))).toEqual(deskRows(deskParse(SAMPLE_CSV)));
    const cards = Array.from({ length: 14 }, (_, i) => ({ qnum: i + 1, q: 'q', choices: ['a', 'b'], correctIdx: 0 }));
    const tags = { '3': { difficulty: 'hard' }, '5': { difficulty: 'med' } };
    // Desk _bfSelectTop10(allCards, csvFilename, tagsForFile) — filename arg is unused by the ranking.
    expect(FC.selectTop10(cards, tags)).toEqual(deskTop10(cards, 'x.csv', tags));
  });

  it('recordOutcome / roundScore match _ftRecordOutcome / _ftScore across a mixed round', () => {
    const deskCreate = deskFn('_ftCreateRound');
    const deskRecord = deskFn('_ftRecordOutcome');
    const deskScore = deskFn('_ftScore');
    const deck = [{ qnum: 1 }, { qnum: 2 }, { qnum: 3 }];
    const seq = ['wrong', 'correct', 'timeout', 'correct', 'wrong', 'correct'];
    let mine = FC.createRound(deck), desk = deskCreate(deck);
    for (const o of seq) { mine = FC.recordOutcome(mine, o, 100); desk = deskRecord(desk, o, 100); }
    expect(mine.status).toEqual(desk.status);
    expect(FC.roundScore(mine)).toBe(deskScore(desk));
  });

  it('mulberry32 / permutationFor match the Desk twins across seeds and deck sizes', () => {
    const deskRandom = deskFn('_bfMulberry32');
    const deskPermutation = deskFn(
      '_bfPermutationFor',
      'var _bfMulberry32=' + fnBody(DESK, '_bfMulberry32') + ';',
    );
    for (const seed of [0, 1, 123456789, 0xffffffff]) {
      const mine = FC.mulberry32(seed);
      const desk = deskRandom(seed);
      const mineValues = Array.from({ length: 6 }, () => mine());
      const deskValues = Array.from({ length: 6 }, () => desk());
      expect(mineValues).toEqual(deskValues);
    }
    for (const [seed, n] of [[0, 0], [1, 1], [17, 2], [42, 4], [0xffffffff, 11]]) {
      expect(FC.permutationFor(seed, n)).toEqual(deskPermutation(seed, n));
    }
  });

  it('permSeed matches _bfPermSeed for several identities and rounds', () => {
    const deskSeed = deskFn('_bfPermSeed');
    const cases = [
      ['kid@roster.local', 'desk-100-abcd', 1],
      ['student', 'mobile-999-zzzz', 27],
      ['', '', 0],
      [null, undefined, '4'],
    ];
    for (const args of cases) {
      expect(FC.permSeed(...args)).toBe(deskSeed(...args));
    }
  });

  it('isPermutationUnsafe matches _bfIsPermutationUnsafe', () => {
    const deskUnsafe = deskFn('_bfIsPermutationUnsafe');
    const cases = [
      ['mean', 'median', 'mode'],
      ['All of these', 'only A'],
      ['NONE OF THE ABOVE.', 'choice B'],
      ['all of that', 'none above'],
      [],
    ];
    for (const choices of cases) {
      expect(FC.isPermutationUnsafe(choices)).toBe(deskUnsafe(choices));
    }
  });

  it('the Desk still records via the same BL-…-DESK_DONE shape + threshold this engine encodes', () => {
    // Source pins: the Desk builds the item-id and threshold flashcards.js must match.
    expect(DESK).toContain("'-DESK_DONE'");
    expect(DESK).toMatch(/BLOOKET_PASS_THRESHOLD\s*=\s*0\.80/);
    expect(DESK).toMatch(/BLOOKET_FULLDECK_SECONDS\s*=\s*40/);
    expect(FC.PASS_THRESHOLD).toBe(0.80);
    expect(FC.FULLDECK_SECONDS).toBe(40);
  });
});
