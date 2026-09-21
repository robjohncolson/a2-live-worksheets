/**
 * tests/desk-donow-speedbump.test.js
 *
 * DN3c — D5 one-calendar collapse + D1 soft speed-bump in
 * desk.html. Frozen contract: DESK_DONOW_DN3_BUILD.md
 * ('## DN3c'). Source assertions + Node `vm` runtime. No jsdom.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
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

// ─────────────────────────────────────────────────────────────────────────────
// D5 — one school-year calendar (SUMMER26/year-switcher collapsed)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3c — D5 one-calendar collapse', () => {
  it('computeDefaultYear() returns SY26-27 unconditionally (no summer/date branch)', () => {
    const b = fnBody(html, 'computeDefaultYear');
    expect(b).toMatch(/return\s*"SY26-27"\s*;/);
    // Strip // comments before checking for branch LOGIC (the explanatory
    // comment legitimately mentions SUMMER26 as kept-dead-code).
    const code = b.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/SUMMER26/);
    expect(code).not.toMatch(/new Date\(/);
    expect(code).not.toMatch(/\?/); // no ternary branch
    // runtime
    const sb = {};
    createContext(sb);
    runInContext(fnBody(html, 'computeDefaultYear') + '\nthis.__y = computeDefaultYear();', sb);
    expect(sb.__y).toBe('SY26-27');
  });

  it('init ignores ?year= and the persisted ap-roadmap-year override', () => {
    // The init IIFE forces py = computeDefaultYear(); the old override read is gone.
    expect(html).not.toMatch(/var py=ps\.get\('year'\)\|\|localStorage\.getItem\('ap-roadmap-year'\)/);
    expect(html).toMatch(/DN3c \/ D5: ONE calendar[\s\S]{0,160}var py=computeDefaultYear\(\);/);
  });

  it('the View menu no longer offers year switching (no data-year items)', () => {
    expect(html).not.toMatch(/data-year="SUMMER26"/);
    expect(html).not.toMatch(/data-year="SY25-26"/);
    expect(html).not.toMatch(/onclick="loadYear\('(SUMMER26|SY25-26)'\)/);
    expect(html).toMatch(/menu-dd-item disabled" title="One school-year calendar/);
  });

  it('countdown retains Today and School Days without exam labels', () => {
    const b = fnBody(html, 'rCD');
    expect(b).not.toMatch(/isSummer/);
    expect(html).not.toMatch(/Exam Day|Days to Exam|examDate/);
    expect(html).toMatch(/id="cd-today"/);
    expect(html).toMatch(/id="cd-school"/);
    expect(html).toContain('Today');
    expect(html).toContain('School Days');
  });

  

  it('the #ib-year info-bar label is NOT a year-switcher (Codex escape-hatch fix)', () => {
    const span = html.match(/<span id="ib-year"[^>]*>/)[0];
    expect(span).not.toMatch(/onclick/);
    expect(span).not.toMatch(/cursor:\s*pointer/);
  });

  it('cycleYear() is inert (no loadYear / no SCHEDULE_DEFS cycling)', () => {
    const b = fnBody(html, 'cycleYear');
    expect(b).not.toMatch(/loadYear\s*\(/);
    expect(b).not.toMatch(/Object\.keys\(SCHEDULE_DEFS\)/);
    // runtime: calling it does nothing / does not throw
    const sb = { loadYear: () => { throw new Error('cycleYear must not loadYear'); }, console };
    createContext(sb);
    runInContext(fnBody(html, 'cycleYear') + '\nthis.__c = cycleYear;', sb);
    expect(() => sb.__c()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1 — soft speed-bump
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3c — D1 speed-bump wiring', () => {
  it('the bump overlay exists with Continue + Show-my-Do-Now, never a hard gate', () => {
    expect(html).toMatch(/id="donow-bump-overlay"/);
    expect(html).toMatch(/id="donow-bump-continue"/);
    expect(html).toMatch(/id="donow-bump-goto"/);
  });

  it('calendar cell click routes through maybeBumpThenOpen (not showResourcePanel directly)', () => {
    expect(html).toMatch(/c\.onclick=\(\)=>\{hTip\(\);maybeBumpThenOpen\(inf,ds\)\;\}/);
  });
});

// ─── D1 runtime ──────────────────────────────────────────────────────────────

function makeBump({ donow, brokenDom, doNowLocalState } = {}) {
  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, { id, style: { display: 'none' }, classList: { add() {}, remove() {} },
                    scrollIntoView() {}, onclick: null });
    }
    return els.get(id);
  }
  el('donow-bump-overlay'); el('donow-bump-continue'); el('donow-bump-goto'); el('donow-card');

  const opened = [];
  const getById = brokenDom
    ? () => { throw new Error('DOM boom'); }
    : el;
  const sandbox = {
    _donowData: donow || null,
    document: { getElementById: getById },
    setTimeout: (fn) => fn(),
    showResourcePanel: (inf, ds) => opened.push({ inf, ds }),
    getStudentMarks: () => ({}),
    localLessonState: () => (doNowLocalState != null ? doNowLocalState : null),
    console,
  };
  createContext(sandbox);
  runInContext(
    'var _bumpAcked = false;\n' +
    fnBody(html, 'donowLessonCovers') + '\n' +
    fnBody(html, 'closeDoNowBump') + '\n' +
    fnBody(html, 'maybeBumpThenOpen') + '\n' +
    'this.__m = maybeBumpThenOpen; this.__getAck = function(){return _bumpAcked;};', sandbox);
  return { run: sandbox.__m, el, opened, getAck: sandbox.__getAck };
}

describe('DN3c — D1 speed-bump runtime', () => {
  it('no earlierGapFlag → opens directly, no bump', () => {
    const b = makeBump({ donow: { earlierGapFlag: false, nextTask: { lesson: '1.2' } } });
    b.run({ t: '5.7' }, 'Jul 1');
    expect(b.opened).toHaveLength(1);
    expect(b.el('donow-bump-overlay').style.display).toBe('none');
  });

  it('earlierGapFlag + clicking your actual Do Now → opens directly (no nag)', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    b.run({ t: '1.2' }, 'Sep 3');
    expect(b.opened).toHaveLength(1);
    expect(b.el('donow-bump-overlay').style.display).toBe('none');
  });

  it('earlierGapFlag + clicking a far-ahead lesson → bump shown, NOT opened yet', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    b.run({ t: '5.7' }, 'Jul 1');
    expect(b.opened).toHaveLength(0);
    expect(b.el('donow-bump-overlay').style.display).toBe('block');
  });

  it('BUG B: earlierGapFlag but the Do Now is marked DONE locally → no bump (honors local completion)', () => {
    // Server flag lags; the student already finished the Do Now (greyed cell).
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } }, doNowLocalState: 'done' });
    b.run({ t: '5.7' }, 'Jul 1');   // far-ahead lesson, but 1.2 is locally done
    expect(b.opened).toHaveLength(1);                               // opened directly
    expect(b.el('donow-bump-overlay').style.display).toBe('none');  // NO nag
  });

  it('Continue anyway → acks (no repeat nag this session) + opens', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    b.run({ t: '5.7' }, 'Jul 1');
    b.el('donow-bump-continue').onclick();      // user clicks Continue
    expect(b.getAck()).toBe(true);
    expect(b.opened).toHaveLength(1);
    // second far-ahead click is no longer nagged
    b.run({ t: '6.1' }, 'Oct 1');
    expect(b.opened).toHaveLength(2);
    expect(b.el('donow-bump-overlay').style.display).toBe('none');
  });

  it('Show my Do Now → also acks (no re-nag this session — D1 once-per-session)', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    b.run({ t: '5.7' }, 'Jul 1');
    expect(b.el('donow-bump-overlay').style.display).toBe('block');
    b.el('donow-bump-goto').onclick();          // user chooses "Show my Do Now"
    expect(b.getAck()).toBe(true);
    // a later far-ahead click is not nagged again
    b.run({ t: '6.1' }, 'Oct 1');
    expect(b.opened).toHaveLength(1);            // opened directly, no second bump
    expect(b.el('donow-bump-overlay').style.display).toBe('none');
  });

  it('combined-lesson Do Now (manifest 4.1-2) clicking cell 4.1 → no bump', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '4.1-2' } } });
    b.run({ t: '4.1' }, 'Jul 8');
    expect(b.opened).toHaveLength(1);
  });

  it('inf=null is handled gracefully (guarded, no throw)', () => {
    const b = makeBump({ donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    expect(() => b.run(null, 'x')).not.toThrow();
  });

  it('never blocks: an internal throw still opens the lesson (catch-net)', () => {
    const b = makeBump({ brokenDom: true, donow: { earlierGapFlag: true, nextTask: { lesson: '1.2' } } });
    expect(() => b.run({ t: '5.7' }, 'Jul 1')).not.toThrow();
    expect(b.opened).toHaveLength(1); // catch → open() fallback fired
  });
});
