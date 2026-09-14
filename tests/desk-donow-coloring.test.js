/**
 * tests/desk-donow-coloring.test.js
 *
 * DN3b — 4-state calendar completion coloring in desk.html.
 * Frozen contract: DESK_DONOW_DN3_BUILD.md (DN3b section).
 *
 * Source assertions + Node `vm` runtime of the real helpers
 * (donowLessonCovers / donowCellState / paintDonowCells). No jsdom needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
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

// ─── Source wiring ───────────────────────────────────────────────────────────

describe('DN3b — wiring', () => {
  it('CSS defines the 3 overlay states (+ reduced-motion)', () => {
    expect(html).toMatch(/\.dc-partial\s*\{[^}]*box-shadow/);
    expect(html).toMatch(/\.dc-done\s*\{[^}]*box-shadow/);
    expect(html).toMatch(/\.dc-ahead\s*\{[^}]*box-shadow/);
    expect(html).toMatch(/prefers-reduced-motion[^}]*\.dc-ahead\s*\{\s*animation:\s*none/);
  });

  it('rCal tags lesson cells with data-topic + data-dts and repaints', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/dataset\.topic\s*=\s*inf\.t/);
    expect(b).toMatch(/dataset\.dts\s*=\s*\+dt/);
    expect(b).toMatch(/paintDonowCells\(\)/);
  });

  it('renderDoNow stashes _donowData and repaints (typeof-guarded → DN3a stays decoupled)', () => {
    const b = fnBody(html, 'renderDoNow');
    expect(b).toMatch(/_donowData\s*=\s*data/);
    expect(b).toMatch(/typeof\s+paintDonowCells\s*===\s*'function'\s*\)\s*paintDonowCells\(\)/);
  });

  it('paintDonowCells only toggles classes (no rCal rebuild → no flicker)', () => {
    const b = fnBody(html, 'paintDonowCells');
    expect(b).not.toMatch(/rCal\(/);
    expect(b).toMatch(/classList\.remove\('dc-partial', 'dc-done', 'dc-ahead'\)/);
    expect(b).not.toMatch(/'cal-current'/);  // CALENDAR_FOCUS -- rCal owns the class now
  });
});

// ─── Runtime: the matching + roll-up logic ───────────────────────────────────

function loadHelpers(donow) {
  const sandbox = { tdy: () => new Date(2026, 5, 15), document: { querySelectorAll: () => [] }, console };
  createContext(sandbox);
  runInContext(
    'var _donowData = ' + JSON.stringify(donow || null) + ';\n' +
    fnBody(html, 'donowLessonCovers') + '\n' +
    fnBody(html, 'donowCellState') + '\n' +
    fnBody(html, 'paintDonowCells') + '\n' +
    'this.__c = donowLessonCovers; this.__s = donowCellState; this.__p = paintDonowCells;' +
    'this.__set = function (d) { _donowData = d; };', sandbox);
  return sandbox;
}

describe('DN3b runtime — donowLessonCovers (combined-lesson rule)', () => {
  const { __c: covers } = loadHelpers();

  it('exact match', () => { expect(covers('1.2', '1.2')).toBe(true); });
  it('combined U4 worksheet: manifest "4.1-2" covers cell "4.1"', () => {
    expect(covers('4.1-2', '4.1')).toBe(true);
  });
  it('"1.1" does NOT match "1.10" (no false prefix)', () => {
    expect(covers('1.10', '1.1')).toBe(false);
    expect(covers('1.1', '1.10')).toBe(false);
  });
  it('different lesson → false', () => { expect(covers('1.3', '1.2')).toBe(false); });
  it('null-safe', () => { expect(covers(null, '1.2')).toBe(false); expect(covers('1.2', '')).toBe(false); });
});

describe('DN3b runtime — donowCellState (worst-wins roll-up)', () => {
  it('no data → "" (grey)', () => {
    expect(loadHelpers().__s('1.2')).toBe('');
  });
  it('no matching lesson → "" (grey)', () => {
    const s = loadHelpers({ lessons: [{ lesson: '9.9', lessonState: 'done' }] });
    expect(s.__s('1.2')).toBe('');
  });
  it('matched lesson state "none" → "" grey, NOT partial (Codex BLOCKER repro)', () => {
    const s = loadHelpers({ lessons: [{ lesson: '1.2', lessonState: 'none' }] });
    expect(s.__s('1.2')).toBe('');
  });
  it('fresh student: ALL lessons "none" → every cell "" (calendar stays grey, not all-amber)', () => {
    const all = ['1.1', '1.2', '4.1-2', '9.9'].map(l => ({ lesson: l, lessonState: 'none' }));
    const s = loadHelpers({ lessons: all });
    expect(s.__s('1.1')).toBe('');
    expect(s.__s('4.1')).toBe('');
  });
  it('unknown lessonState value → treated as not-started ("")', () => {
    const s = loadHelpers({ lessons: [{ lesson: '1.2', lessonState: 'weird' }] });
    expect(s.__s('1.2')).toBe('');
  });
  it('partial → "partial"', () => {
    const s = loadHelpers({ lessons: [{ lesson: '1.2', lessonState: 'partial' }] });
    expect(s.__s('1.2')).toBe('partial');
  });
  it('all matching done → "done"', () => {
    const s = loadHelpers({ lessons: [{ lesson: '1.2', lessonState: 'done' }] });
    expect(s.__s('1.2')).toBe('done');
  });
  it('combined parts mixed (done + none) → "partial" (not falsely "done")', () => {
    const s = loadHelpers({ lessons: [
      { lesson: '4.1-2', lessonState: 'done' },
      { lesson: '4.1-3', lessonState: 'none' },
    ] });
    expect(s.__s('4.1')).toBe('partial');
  });
  it('any partial across matches wins', () => {
    const s = loadHelpers({ lessons: [
      { lesson: '4.1-2', lessonState: 'done' },
      { lesson: '4.1-5', lessonState: 'partial' },
    ] });
    expect(s.__s('4.1')).toBe('partial');
  });
});

describe('DN3b runtime — paintDonowCells (overlay incl. ahead)', () => {
  function cell(topic, dts) {
    const classes = new Set();
    return {
      dataset: { topic, dts: String(dts) },
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        has: x => classes.has(x),
      },
      _classes: classes,
    };
  }
  // tdy() = Jun 15 2026. past = Jun 1; future = Jul 1.
  const PAST = +new Date(2026, 5, 1), FUTURE = +new Date(2026, 6, 1);

  function paintWith(donow, cells) {
    const sandbox = {
      tdy: () => new Date(2026, 5, 15),
      document: { querySelectorAll: () => cells },
      console,
    };
    createContext(sandbox);
    runInContext(
      'var _donowData = ' + JSON.stringify(donow) + ';\n' +
      fnBody(html, 'donowLessonCovers') + '\n' +
      fnBody(html, 'donowCellState') + '\n' +
      fnBody(html, 'paintDonowCells') + '\nthis.__p = paintDonowCells;', sandbox);
    sandbox.__p();
  }

  it('partial lesson → .dc-partial', () => {
    const c = cell('1.2', PAST);
    paintWith({ lessons: [{ lesson: '1.2', lessonState: 'partial' }] }, [c]);
    expect(c._classes.has('dc-partial')).toBe(true);
    expect(c._classes.has('dc-done')).toBe(false);
  });

  it('done & past date → .dc-done (not ahead)', () => {
    const c = cell('1.2', PAST);
    paintWith({ lessons: [{ lesson: '1.2', lessonState: 'done' }] }, [c]);
    expect(c._classes.has('dc-done')).toBe(true);
    expect(c._classes.has('dc-ahead')).toBe(false);
  });

  it('done & FUTURE class-date → .dc-ahead (the D6 reward)', () => {
    const c = cell('5.7', FUTURE);
    paintWith({ lessons: [{ lesson: '5.7', lessonState: 'done' }] }, [c]);
    expect(c._classes.has('dc-ahead')).toBe(true);
    expect(c._classes.has('dc-done')).toBe(false);
  });

  it('done & class-date == today → .dc-done (boundary is strictly future)', () => {
    const TODAY = +new Date(2026, 5, 15); // == tdy() in paintWith
    const c = cell('5.7', TODAY);
    paintWith({ lessons: [{ lesson: '5.7', lessonState: 'done' }] }, [c]);
    expect(c._classes.has('dc-done')).toBe(true);
    expect(c._classes.has('dc-ahead')).toBe(false);
  });

  it('matched "none" → no overlay class (BLOCKER repro at the paint layer)', () => {
    const c = cell('1.2', PAST);
    paintWith({ lessons: [{ lesson: '1.2', lessonState: 'none' }] }, [c]);
    expect(c._classes.has('dc-partial')).toBe(false);
    expect(c._classes.has('dc-done')).toBe(false);
    expect(c._classes.has('dc-ahead')).toBe(false);
  });

  it('clears stale overlay when state regresses to none', () => {
    const c = cell('1.2', PAST);
    c.classList.add('dc-done');
    paintWith({ lessons: [{ lesson: '9.9', lessonState: 'done' }] }, [c]); // no match for 1.2
    expect(c._classes.has('dc-done')).toBe(false);
    expect(c._classes.has('dc-partial')).toBe(false);
  });

  it('never throws on a malformed cell', () => {
    const bad = { dataset: { topic: '1.2' }, classList: { remove() {}, add() {} } };
    expect(() => paintWith({ lessons: [{ lesson: '1.2', lessonState: 'done' }] }, [bad])).not.toThrow();
  });
});
