// Do Now opens the academic ledger; cached evidence remains identity scoped.
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const paintFn = DESK.slice(DESK.indexOf('function _paintDoNowReadiness'), DESK.indexOf('async function renderDoNowGrades'));

describe('Do Now card — single My Ledger entry', () => {
  

  it('makes the whole card open My Ledger (openMyGradebook) on click', () => {
    expect(paintFn).toContain('openMyGradebook()');
    expect(paintFn).toContain("card.setAttribute('role', 'button')");
    // the click decision is delegated to the testable _donowOpensLedger predicate
    expect(paintFn).toContain('_donowOpensLedger(e.target, card)');
  });

  it('removed the redundant Do Now chips (My Ledger / Class Gradebook / My Gradebook)', () => {
    expect(DESK).not.toContain('receiptsChip');
    expect(DESK).not.toContain('cgChip');
    expect(DESK).not.toContain('gbChip');           // My Gradebook chip folded into the Ledger
  });

  

  it('moved "how grades work" to a Help menu', () => {
    expect(DESK).toMatch(/data-menu="help"/);
    expect(DESK).toMatch(/menu-help[\s\S]{0,200}openGradeHelp/);
  });
});

// Behavioral: the card has role="button" for keyboard/a11y, so a naive
// closest('[role="button"]') guard matches the CARD ITSELF and swallows every
// click (the card led nowhere). _donowOpensLedger must return true for a plain
// card click and false only for a genuinely interactive child.
function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

describe('Do Now card — a click opens My Ledger (not swallowed by its own role=button)', () => {
  // eslint-disable-next-line no-new-func
  const _donowOpensLedger = new Function(fnBody(DESK, '_donowOpensLedger') + '\nreturn _donowOpensLedger;')();
  const card = { _isCard: true };
  const targetClosest = (hit) => ({ closest: () => hit });

  it('plain card click opens the ledger (closest resolves to the card itself)', () => {
    // the regression: e.target.closest('[role="button"]') walks up to the card.
    expect(_donowOpensLedger(targetClosest(card), card)).toBe(true);
  });

  it('click on a real interactive child (link / grade pill) does NOT open the ledger', () => {
    const childLink = { tag: 'a' };
    expect(_donowOpensLedger(targetClosest(childLink), card)).toBe(false);
  });

  it('click on a plain child with no interactive ancestor opens the ledger', () => {
    expect(_donowOpensLedger(targetClosest(null), card)).toBe(true);
  });

  it('defensive: a target without closest() still opens the ledger', () => {
    expect(_donowOpensLedger({}, card)).toBe(true);
  });
});

describe('Do Now academic evidence and receipts', () => {
  it('opens the ledger once per click or keyboard action after repeated paints', () => {
    const dom = new JSDOM('<div id="donow-card"><a href="#lesson">Lesson</a></div>');
    try {
      const { window } = dom;
      const open = vi.fn();
      const paint = new Function('document', 'openMyGradebook',
        fnBody(DESK, '_donowOpensLedger') + '\n' + fnBody(DESK, '_paintDoNowReadiness')
          + '\nreturn _paintDoNowReadiness;')(window.document, open);
      paint();
      paint();
      const card = window.document.getElementById('donow-card');
      card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(open).toHaveBeenCalledTimes(1);
      card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      card.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(open).toHaveBeenCalledTimes(3);
      card.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(open).toHaveBeenCalledTimes(3);
      expect(card.getAttribute('role')).toBe('button');
    } finally {
      dom.window.close();
    }
  });

  it('uses only the current student and server origin for persisted academic evidence', () => {
    const records = new Map();
    const storage = { getItem: key => records.get(key) || null };
    let studentId = 'student-c';
    const rosterClient = { studentId: () => studentId };
    const window = { rosterClient, ROSTER_SERVICE_URL: 'https://roster.example' };
    const hasEvidence = new Function('window', 'rosterClient', 'localStorage', '_gradeLessonsCache',
      fnBody(DESK, '_serverCompleteKey') + '\n' + fnBody(DESK, '_serverEvidencePresent')
        + '\nreturn _serverEvidencePresent;')(window, rosterClient, storage, null);
    records.set('a2_server_complete_v1:student-c', JSON.stringify({
      v: 1, origin: window.ROSTER_SERVICE_URL, topics: { '1.1': true },
    }));
    expect(hasEvidence()).toBe(true);
    studentId = 'student-d';
    expect(hasEvidence()).toBe(false);
    studentId = 'student-c';
    window.ROSTER_SERVICE_URL = 'https://another-roster.example';
    expect(hasEvidence()).toBe(false);
    studentId = null;
    expect(hasEvidence()).toBe(false);
  });

  it('counts compact academic receipts while ignoring incomplete cache rows', () => {
    const receipts = [
      { id: 'check', src: 'lesson-check', i: 'LC-1-1', compact: 'check.signature' },
      null, { id: 'unfinished', src: 'try-it' },
      { id: 'deck', src: 'blooket', i: 'BL-U1-L1-DESK_DONE', compact: 'deck.signature' },
    ];
    let raw = JSON.stringify(receipts);
    const read = new Function('window',
      fnBody(DESK, '_readDeskReceipts') + '\nreturn _readDeskReceipts;')({
        localStorage: { getItem: key => key === 'desk_receipts_v1' ? raw : null },
      });
    expect(read()).toEqual([receipts[0], receipts[3]]);
    expect(read()).toHaveLength(2);
    raw = 'invalid JSON';
    expect(read()).toEqual([]);
    raw = '{}';
    expect(read()).toEqual([]);
  });
});
