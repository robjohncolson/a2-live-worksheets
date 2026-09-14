// desk-donow-ledger.test.js — the Do Now card is now colored by the SAME
// readiness the My Ledger uses and is itself a one-tap entry into My Ledger; the
// redundant chips (My Ledger / Class Gradebook / My Gradebook) were removed and
// "how grades work" moved to a Help menu. "My Gradebook" (score breakdown · vs
// Schoology) is folded into the My Ledger window as a collapsible section.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const paintFn = DESK.slice(DESK.indexOf('function _paintDoNowReadiness'), DESK.indexOf('async function renderDoNowGrades'));

describe('Do Now card — readiness color + single My Ledger entry', () => {
  

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
