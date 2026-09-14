// desk-namefinder-footer.test.js — the name-finder "dial" (the username wheel)
// footer polish: the redundant "I know my username" link is gone, and the
// "I'm not on the list" escape hatch shows on EVERY dial screen (incl. the
// first) instead of being gated behind the first arrow press (_nfPressed).
// Typing-your-username is still reachable for teachers/returning students via
// the Escape key, so _nfGotoSignin must stay defined. GUESTS ARE RETIRED
// (2026-06-25): "I'm not on the list" now opens SELF-SIGNUP (_nfCreate, which
// captures a real name) — never an anonymous guest.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

// Brace-match a named function's full source (the worksheet-test extraction pattern).
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

const dial = fnBody(DESK, '_nfRenderDial');
const keydown = fnBody(DESK, '_nfKeydown');

describe('Name-finder dial footer — polish', () => {
  it('slices the dial cleanly (guards against a future reorder)', () => {
    expect(DESK.indexOf('function _nfRenderDial')).toBeGreaterThan(-1);
    expect(DESK.indexOf('function _nfRenderDial')).toBeLessThan(DESK.indexOf('function _nfPick'));
  });

  it('drops the redundant "I know my username" link', () => {
    expect(dial).not.toContain('I know my username');
    expect(dial).not.toContain('_nfGotoSignin');   // the link is gone from the dial
  });

  it('shows "I\'m not on the list" on the dial, wired to SELF-SIGNUP (guests retired)', () => {
    expect(dial).toContain("I\\'m not on the list");
    // Off-roster students self-sign-up (real name); there is no guest off-ramp.
    expect(dial).toContain('_nfCreate()');
    expect(dial).not.toContain('_nfGuestSignIn');
    expect(dial).not.toContain('_nfRenderNotFound');
  });

  it('no longer gates the escape hatch behind the first press', () => {
    // the old behavior wrapped the link in `(_nfPressed ? … : '')`; the gate is
    // fully removed so the link renders on every dial screen, including the first.
    expect(dial).not.toContain('_nfPressed');
    expect(DESK).not.toContain('_nfPressed');       // dead state retired everywhere
  });

  it('keeps typing-your-username reachable via the Escape key (teachers/returning)', () => {
    // the function still exists AND the keydown handler still routes Escape to it.
    expect(DESK).toContain('function _nfGotoSignin()');
    // load-bearing assertion: anchored to the _nfKeydown body, newline-tolerant.
    expect(keydown).toMatch(/Escape/);
    expect(keydown).toMatch(/_nfGotoSignin\(\)/);
  });

  it('the dial escape hatch leads to self-signup, never to guest (guests retired)', () => {
    // "I'm not on the list" opens the real-name self-signup modal — no anonymous
    // Guest_ identity can be minted from the dial anymore.
    expect(dial).toContain('_nfCreate()');
    expect(dial).not.toContain('_nfGuestSignIn');
    expect(dial).not.toContain("setItem('a2_guest_active'");
  });
});

// Behavioral: actually RENDER the dial at two different depths and prove the
// "I'm not on the list" anchor appears in BOTH — i.e. it is UNCONDITIONAL, not
// merely present in the source (a re-gate behind a different flag would slip
// past a substring scan but fail here).
describe('Name-finder dial — escape hatch renders on every screen', () => {
  const HELPERS = ['_nfEsc', '_nfFriendly', '_nfRangeKey', '_nfBuckets', '_nfRenderDial']
    .map((n) => fnBody(DESK, n)).join('\n');

  function renderDialHTML({ roster, lo, hi, stack }) {
    const content = { innerHTML: '' };
    const document = { getElementById: (id) => (id === 'nf-content' ? content : null) };
    const body =
      'var _nfRoster, _nfStack, _nfLo, _nfHi, _nfState, _nfPicked;\n'
      + 'function _nfSelectName(){}\n'   // only called on a singleton; not exercised here
      + HELPERS + '\n'
      + '_nfRoster = ROSTER; _nfLo = LO; _nfHi = HI; _nfStack = STACK;\n'
      + '_nfRenderDial();';
    // eslint-disable-next-line no-new-func
    new Function('document', 'ROSTER', 'LO', 'HI', 'STACK', body)(document, roster, lo, hi, stack);
    return content.innerHTML;
  }

  const ROSTER = Array.from({ length: 10 }, (_, i) =>
    ({ realName: 'Name' + String.fromCharCode(65 + i) + ' Last', username: 'user_' + i }));
  // Guests retired: the hatch now wires to self-signup (_nfCreate), not guest.
  const hatch = /<a [^>]*onclick="_nfCreate\(\);return false;"[^>]*>/;

  it('first screen (no presses yet) shows the "not on the list" anchor', () => {
    const html = renderDialHTML({ roster: ROSTER, lo: 0, hi: 9, stack: [] });
    expect(html).toMatch(hatch);
    expect(html).not.toContain('I know my username');
  });

  it('drilled-in screen (after a press) ALSO shows it', () => {
    const html = renderDialHTML({ roster: ROSTER, lo: 0, hi: 2, stack: [{ lo: 0, hi: 9 }] });
    expect(html).toMatch(hatch);
    expect(html).toContain('_nfBack');     // back link present once there's history
  });
});
