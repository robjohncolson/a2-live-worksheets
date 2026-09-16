// @vitest-environment jsdom
/**
 * tests/desk-modal-escape.test.js — MODAL_ESCAPE_AUDIT.md
 *
 * Every "content" modal in the Desk must be dismissable with the Escape key.
 * `_escCloseTopModal()` is the safety net for the overlays that previously had
 * NO Escape handler: the resource panel ("material for the day"), Do-Now bump,
 * generic showDialog, Blooket flashcards, the view-as override-gate, and the
 * big-QR overlay (which opens as display:flex). It closes the TOPMOST visible
 * one via its cleanup-aware close
 * fn (or a direct hide for the cleanup-free QR overlays), DEFERS when a modal
 * that self-handles Escape is visible, and never touches the sign-in WALL.
 *
 * Runs the REAL extracted functions in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// The net depends on the two small helpers; eval all three into scope.
const ESC_SRC = fnBody(html, '_escVisible') + '\n' + fnBody(html, '_escHide') + '\n' + fnBody(html, '_escCloseTopModal');
function makeEsc() {
  // eslint-disable-next-line no-eval
  return eval(ESC_SRC + '\n;_escCloseTopModal');
}

// Gap modals that close via a NAMED global fn (cleanup-aware).
const GAP_NAMED = {
  'resource-overlay': 'closeResourcePanel',
  'donow-bump-overlay': 'closeDoNowBump',
  'dialog-overlay': 'closeDialog',
  'bf-overlay': 'closeBlooketFlashcards',
  'override-gate-modal': '_hideOverrideGateModal',
};
// The remaining QR overlay opens as flex and needs no cleanup.
const GAP_DIRECT = ['big-qr-overlay'];
const SELF_HANDLED = ['day-grade-overlay', 'grade-help-overlay', 'my-gradebook-overlay', 'my-receipts-overlay', 'student-dm-modal', 'teacher-nudge-modal'];
const REMOVED_IDS = ['game-overlay', 'guest-pass-overlay', 'reconcile-qr-overlay', 'verify-qr-overlay'];
const ALL_IDS = [...Object.keys(GAP_NAMED), ...GAP_DIRECT, ...SELF_HANDLED];

let calls;
function el(id) { return document.getElementById(id); }
function setupDOM(open /* {id: display} */, z = {}) {
  document.body.innerHTML = '';
  ALL_IDS.forEach((id) => {
    const d = document.createElement('div');
    d.id = id;
    d.style.display = open[id] || 'none';
    if (z[id] != null) d.style.zIndex = String(z[id]);
    document.body.appendChild(d);
  });
}
beforeEach(() => {
  calls = [];
  Object.entries(GAP_NAMED).forEach(([id, fnName]) => {
    globalThis[fnName] = () => { calls.push(fnName); const e = el(id); if (e) e.style.display = 'none'; };
  });
});
afterEach(() => { Object.values(GAP_NAMED).forEach((fnName) => { delete globalThis[fnName]; }); });

describe('Escape net — named-close gap modals (cleanup-aware)', () => {
  Object.entries(GAP_NAMED).forEach(([id, fnName]) => {
    it(`closes ${id} via ${fnName}`, () => {
      setupDOM({ [id]: 'block' });
      expect(makeEsc()()).toBe(true);
      expect(calls).toEqual([fnName]);
      expect(el(id).style.display).toBe('none');
    });
  });
});

describe('Escape net — QR overlay (display:flex, direct hide)', () => {
  GAP_DIRECT.forEach((id) => {
    it(`detects ${id} opened as flex and hides it`, () => {
      setupDOM({ [id]: 'flex' });
      expect(makeEsc()()).toBe(true);
      expect(el(id).style.display).toBe('none');
      expect(calls).toEqual([]); // no named close fn involved
    });
  });
});

describe('Escape net — defer + no-op + stacking', () => {
  it('is a no-op when nothing is open', () => {
    setupDOM({});
    expect(makeEsc()()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('DEFERS (closes nothing) when a self-handled modal is visible, even with a gap modal under it', () => {
    // Reachable: dblclick a calendar cell → resource panel opens, then day-grade on top.
    setupDOM({ 'resource-overlay': 'block', 'day-grade-overlay': 'block' });
    expect(makeEsc()()).toBe(false);
    expect(calls).toEqual([]);                       // net did NOT close resource
    expect(el('resource-overlay').style.display).toBe('block'); // left for day-grade's own handler / next Esc
  });

  it('closes only the TOPMOST (highest z-index) gap modal when stacked', () => {
    setupDOM({ 'resource-overlay': 'block', 'dialog-overlay': 'block' }, { 'resource-overlay': 300, 'dialog-overlay': 9000 });
    makeEsc()();
    expect(calls).toEqual(['closeDialog']);
    expect(el('dialog-overlay').style.display).toBe('none');
    expect(el('resource-overlay').style.display).toBe('block'); // untouched
  });

  it('a flex QR overlay (z 100000) wins over a block dialog overlay (z 300)', () => {
    setupDOM({ 'dialog-overlay': 'block', 'big-qr-overlay': 'flex' }, { 'dialog-overlay': 300, 'big-qr-overlay': 100000 });
    makeEsc()();
    expect(el('big-qr-overlay').style.display).toBe('none');
    expect(el('dialog-overlay').style.display).toBe('block');
    expect(calls).toEqual([]);
  });
});

describe('Escape net — wiring + exclusions (structural)', () => {
  it('the global Escape handler invokes _escCloseTopModal()', () => {
    expect(html).toMatch(/querySelectorAll\('\.app-overlay'\)[\s\S]*?_escCloseTopModal\(\)/);
  });
  it('all remaining named closers and the big-QR overlay are covered', () => {
    [...Object.keys(GAP_NAMED), ...GAP_DIRECT]
      .forEach((id) => expect(ESC_SRC).toContain(`'${id}'`));
  });
  it('removed game, guest-pass, and wallet QR overlays are absent', () => {
    REMOVED_IDS.forEach((id) => {
      expect(ESC_SRC).not.toContain(id);
      expect(html).not.toContain(id);
    });
  });
  it('does NOT auto-close the sign-in WALL (signin/signup/pwchange)', () => {
    expect(ESC_SRC).not.toMatch(/signin-overlay|signup-overlay|pwchange-overlay/);
  });
  it('self-handled modals appear ONLY in the defer guard, never in the closers map', () => {
    // They must be in the selfHandled defer list...
    SELF_HANDLED.forEach((id) => expect(ESC_SRC).toContain(`'${id}'`));
    // ...but never given a close-fn mapping (which would double-fire their own handler).
    SELF_HANDLED.forEach((id) => {
      expect(ESC_SRC).not.toMatch(new RegExp(`'${id}':\\s*function`));
    });
  });
});
