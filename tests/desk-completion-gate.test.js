// desk-completion-gate.test.js — the Desk worksheet "Done" button is gated
// on real completion (>= DESK_WORKSHEET_DONE_THRESHOLD% of blanks+reflections
// filled, OR every reflection rated E), NOT a 5-minute visit timer. (The
// threshold lives on the Desk now — 60% — not the worksheet's own 80% flag.) The gate applies only to
// the instrumented u*_lesson*_live.html worksheets; off-pattern worksheets
// (e.g. the U6 conceptual driller) keep the legacy timer. The completion
// store is student-scoped so a shared browser never leaks one student's
// progress to the next. After a valid Done click the button latches
// "Completed" (greyed out).
//
// Static parse of the Desk HTML source + real-execution smoke tests of the
// pure-ish _wsCompletionFor helper.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('Desk: worksheet completion gate', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: _wsCompletionFor exists, reads a2_ws_completion, is student-scoped', () => {
    expect(DESK).toMatch(/function\s+_wsCompletionFor\s*\(/);
    const body = fnBody(DESK, '_wsCompletionFor');
    expect(body).toMatch(/a2_ws_completion/);
    // Student-scoped: resolves the per-student sub-object via getStudentEmail().
    expect(body).toMatch(/getStudentEmail\s*\(\s*\)/);
  });

  it('02: _doneBtn takes (artifact, worksheetUrl)', () => {
    expect(DESK).toMatch(/function\s+_doneBtn\s*\(\s*artifact\s*,\s*worksheetUrl\s*\)/);
  });

  it('03: marked-done label is "Completed", not "Saved"', () => {
    const body = fnBody(DESK, '_doneBtn');
    expect(body).toMatch(/&#10003;\s*Completed/);
    expect(body, 'the old "Saved" label must be gone from _doneBtn').not.toMatch(/&#10003;\s*Saved/);
  });

  it('04: _doneBtn has an artifact==="worksheet" completion-gate branch', () => {
    const body = fnBody(DESK, '_doneBtn');
    expect(body).toMatch(/artifact\s*===\s*['"]worksheet['"]/);
    expect(body).toMatch(/_wsCompletionFor\s*\(\s*worksheetUrl\s*\)/);
    // Gate keys on the DESK threshold (vs DESK_WORKSHEET_DONE_THRESHOLD), not the
    // worksheet's own 80% `eligible` flag. Uses the HIGHER of the local fill % and
    // the synced ledger Cws (cross-device), or all reflections rated E.
    expect(body).toMatch(/_effPct >= DESK_WORKSHEET_DONE_THRESHOLD/);
    expect(body).toMatch(/reflectionsAllE === true/);
    expect(body).toMatch(/_getCwsForTopic/);
  });

  it('05: the completion gate only applies to instrumented u*_lesson*_live.html worksheets', () => {
    const body = fnBody(DESK, '_doneBtn');
    // The pattern guard — off-pattern worksheets (e.g. edgar driller) must
    // NOT be routed through the completion gate; they fall to the timer.
    expect(body).toMatch(/\^u\\d\+_lesson\.\+_live\\\.html\$/);
    // The _wsCompletionFor call sits INSIDE the pattern-guard block.
    const guardIdx = body.indexOf('u\\d+_lesson');
    const compIdx = body.indexOf('_wsCompletionFor');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(compIdx).toBeGreaterThan(guardIdx);
  });

  it('06: worksheet branch is BEFORE the deskDoneGateMs timer (instrumented worksheet skips it)', () => {
    const body = fnBody(DESK, '_doneBtn');
    const wsIdx = body.indexOf("artifact === 'worksheet'");
    const gateIdx = body.indexOf('deskDoneGateMs');
    expect(wsIdx, 'worksheet branch present').toBeGreaterThan(-1);
    expect(gateIdx, 'deskDoneGateMs still present').toBeGreaterThan(-1);
    expect(wsIdx, 'worksheet branch must precede the timer').toBeLessThan(gateIdx);
  });

  it('07: incomplete worksheet shows a disabled "Done (N%)" button', () => {
    const body = fnBody(DESK, '_doneBtn');
    expect(body).toMatch(/Done\s*\(['"]?\s*\+\s*pctN/);
    expect(body).toMatch(/disabled/);
  });

  it('08: the worksheet _doneBtn call site passes u.worksheet', () => {
    expect(DESK).toMatch(/_doneBtn\s*\(\s*['"]worksheet['"]\s*,\s*u\.worksheet\s*\)/);
  });

  it('09: _studentMarkSave optimistic latch text is "Completed"', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    expect(body).toMatch(/btn\.textContent\s*=\s*['"]✓ Completed['"]/);
    expect(body, 'old "Saved" latch must be gone').not.toMatch(/['"]✓ Saved['"]/);
  });

  it('10: quiz (and off-pattern worksheets) still use the deskDoneGateMs timer', () => {
    expect(DESK).toMatch(/function\s+deskDoneGateMs\s*\(/);
    const body = fnBody(DESK, '_doneBtn');
    // deskDoneGateMs no longer takes an artifact arg — worksheet uses the
    // completion gate, Blooket the flashcard quiz, and the video has no Done
    // button at all, so quiz is the only artifact that reaches this timer.
    expect(body).toMatch(/var\s+gateMs\s*=\s*deskDoneGateMs\s*\(\s*\)/);
  });

  // ── _wsCompletionFor real-execution smoke tests ───────────────────────────
  // _wsCompletionFor closes over `localStorage` and `getStudentEmail`; we
  // extract its source and instantiate it with injected fakes.
  function makeWsCompletionFor(storeRaw, studentKey = 'stu@roster.local') {
    const src = fnBody(DESK, '_wsCompletionFor');
    const fakeLocalStorage = {
      getItem: (k) => (k === 'a2_ws_completion' ? storeRaw : null)
    };
    const getStudentEmail = () => studentKey;
    // eslint-disable-next-line no-new-func
    return new Function('localStorage', 'getStudentEmail', 'return (' + src + ');')(
      fakeLocalStorage, getStudentEmail
    );
  }

  it('11: _wsCompletionFor smoke — resolves a per-student entry by URL basename', () => {
    const store = JSON.stringify({
      'stu@roster.local': { 'u4_lesson1-2_live.html': { pct: 0.9, eligible: true } }
    });
    const fn = makeWsCompletionFor(store);
    const entry = fn('https://x.github.io/follow-alongs/u4_lesson1-2_live.html');
    expect(entry).toEqual({ pct: 0.9, eligible: true });
  });

  it('12: _wsCompletionFor smoke — strips ?query and #hash before lookup', () => {
    const store = JSON.stringify({
      'stu@roster.local': { 'u8_lesson1_live.html': { pct: 0.5, eligible: false } }
    });
    const fn = makeWsCompletionFor(store);
    expect(fn('u8_lesson1_live.html?v=2#top')).toEqual({ pct: 0.5, eligible: false });
  });

  it('13: _wsCompletionFor smoke — one student CANNOT see another student\'s completion', () => {
    // The MAJOR shared-browser bug: student A finishes, student B must NOT
    // inherit eligibility. _wsCompletionFor scopes by getStudentEmail().
    const store = JSON.stringify({
      'alice@roster.local': { 'u4_lesson1-2_live.html': { pct: 1, eligible: true } }
    });
    // Looking up as Bob — Alice's entry must be invisible.
    const fnBob = makeWsCompletionFor(store, 'bob@roster.local');
    expect(fnBob('u4_lesson1-2_live.html')).toBeNull();
    // Alice still sees her own.
    const fnAlice = makeWsCompletionFor(store, 'alice@roster.local');
    expect(fnAlice('u4_lesson1-2_live.html')).toEqual({ pct: 1, eligible: true });
  });

  it('14: _wsCompletionFor smoke — no signed-in student → null', () => {
    const store = JSON.stringify({
      'stu@roster.local': { 'u4_lesson1-2_live.html': { eligible: true } }
    });
    const fn = makeWsCompletionFor(store, null);
    expect(fn('u4_lesson1-2_live.html')).toBeNull();
  });

  it('15: _wsCompletionFor smoke — missing file → null', () => {
    const fn = makeWsCompletionFor(JSON.stringify({
      'stu@roster.local': { 'other.html': { eligible: true } }
    }));
    expect(fn('u9_lesson5_live.html')).toBeNull();
  });

  it('16: _wsCompletionFor smoke — malformed JSON → null (never throws)', () => {
    const fn = makeWsCompletionFor('{not json');
    expect(fn('u4_lesson1-2_live.html')).toBeNull();
  });

  it('17: _wsCompletionFor smoke — empty / missing URL → null', () => {
    const fn = makeWsCompletionFor(JSON.stringify({
      'stu@roster.local': { 'u4_lesson1-2_live.html': { eligible: true } }
    }));
    expect(fn('')).toBeNull();
    expect(fn(null)).toBeNull();
    expect(fn(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stale-panel fix: a storage event on a2_ws_completion re-renders the
// open resource panel so the Done (N%) button reflects live worksheet
// progress without forcing the student to close + reopen the panel.
// ---------------------------------------------------------------------------

describe('stale-panel fix -- storage event re-renders the open resource panel', () => {
  it('Desk has a window storage listener gated on a2_ws_completion', () => {
    expect(DESK).toMatch(/addEventListener\(\s*['"]storage['"]/);
    expect(DESK).toMatch(/e\.key\s*!==?\s*['"]a2_ws_completion['"]/);
  });

  it('the listener re-invokes showResourcePanel with the cached inf + dateStr', () => {
    // The listener must use _lastResourcePanel (the cached render context)
    // so it can call showResourcePanel(inf, dateStr) again with the same args.
    expect(DESK).toMatch(/showResourcePanel\(\s*_lastResourcePanel\.inf\s*,\s*_lastResourcePanel\.dateStr\s*\)/);
  });

  it('the listener is gated on the panel being visible (display !== "none")', () => {
    // The listener must check the resource-overlay display before re-rendering
    // -- a closed panel should not pop open on a worksheet write.
    var stalePanelBlock = [...DESK.matchAll(/addEventListener\(\s*['"]storage['"][\s\S]*?\}\);/g)].find(match => match[0].includes('a2_ws_completion'));
    expect(stalePanelBlock).toBeDefined();
    expect(stalePanelBlock[0]).toMatch(/resource-overlay/);
    expect(stalePanelBlock[0]).toMatch(/display/);
  });
});
