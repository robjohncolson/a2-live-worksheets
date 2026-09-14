// Sequential access retired 2026-09-10; completion helpers still determine earned credit.
// desk-lesson-gate.test.js — the Desk calendar gates lessons sequentially:
// a lesson is locked until its PREDECESSOR TOPIC is complete (worksheet +
// Blooket Done). STRICT (§8, 2026-06-16): no date bypass, and the predecessor
// is the prior topic in sequence (_prevTopicInSequence), not the previous
// calendar cell — so gating is window-independent and cross-portion (summer
// 1.1 done → fall 1.2 unlocks). Teachers and not-signed-in visitors bypass.
// The video Done button is gone — the video shows a checkmark once the
// worksheet is done.
//
// Static parse of the Desk HTML + real-execution smoke tests of the pure
// gate helpers (LESSON_GATE_BUILD.md).
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

describe('Desk: sequential lesson gate', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: gate helpers exist', () => {
    expect(DESK).toMatch(/function\s+_deskIsTeacher\s*\(/);
    expect(DESK).toMatch(/function\s+_isLessonComplete\s*\(/);
    expect(DESK).toMatch(/function\s+_isLessonUnlocked\s*\(/);
    expect(DESK).toMatch(/function\s+_showLessonLockedDialog\s*\(/);
  });

  it('02: lesson access is open without reading completion or identity state', () => {
    const body = fnBody(DESK, '_isLessonUnlocked');
    expect(body).toMatch(/return true/);
    expect(body).not.toMatch(/_isLessonComplete\s*\(/);
    expect(body).not.toMatch(/_deskIsTeacher\s*\(/);
  });

  it('03: missing, stale, or incomplete evidence never blocks access', () => {
    const src = fnBody(DESK, '_isLessonUnlocked');
    const fn = new Function('return (' + src + ');')();
    expect(fn('1.2', null, '1.1', null, null, true)).toBe(true);
  });

  it('04: rCal applies the gate via the canonical topic-predecessor', () => {
    const body = fnBody(DESK, 'rCal');
    expect(body).toMatch(/_isLessonUnlocked\s*\(/);
    expect(body).toMatch(/cell-locked/);
    // §8: gates on _prevTopicInSequence(inf.t), NOT the buggy walk-order trail.
    expect(body).toMatch(/_prevTopicInSequence\s*\(\s*inf\.t\s*\)/);
    expect(body).not.toMatch(/_prevLessonTopic/);
    // Only dot-form topic cells are gated (Review/etc. stay click-through).
    expect(body).toMatch(/\^\\d\+\\\.\\d\+/);
    // The locked branch shows the lock dialog, not the resource panel.
    expect(body).toMatch(/_showLessonLockedDialog\s*\(/);
  });

  it('04b: the locked-cell onclick captures per-iteration consts (no closure bug)', () => {
    const body = fnBody(DESK, 'rCal');
    // The three values are captured in one const statement before the onclick,
    // using the per-cell _prevTopic (canonical predecessor), not a mutating loop var.
    expect(body).toMatch(/const\s+_lockTopic\s*=\s*inf\.t\s*,\s*_lockPrev\s*=\s*_prevTopic\s*,\s*_lockDs\s*=\s*ds/);
    expect(body).toMatch(/_showLessonLockedDialog\s*\(\s*_lockTopic\s*,\s*_lockPrev\s*,\s*_lockDs\s*\)/);
  });

  it('05: _studentMarkSave re-renders the calendar so the next lesson unlocks live', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    expect(body).toMatch(/rCal\s*\(\s*\)/);
  });

  it('06: .cell-locked CSS rule exists', () => {
    expect(DESK).toMatch(/\.cell-locked\s*\{/);
  });

  // ── video shows "visited", never "done" ───────────────────────────────────
  

  it('08: the worksheet-derived "done" video tag is gone', () => {
    // _videoDoneTag (which marked a video "done" once the worksheet was done) is
    // removed — we never claim a video is done, only visited.
    expect(DESK).not.toMatch(/function\s+_videoDoneTag\s*\(/);
    expect(DESK).not.toMatch(/_videoDoneTag\s*\(\s*\)/);
  });

  // ── _isLessonComplete real-execution smoke tests ──────────────────────────
  function makeIsLessonComplete() {
    const src = fnBody(DESK, '_isLessonComplete');
    const getRegistryEntry = (topic) => {
      if (topic === 'both') return { urls: { worksheet: 'w', blooket: 'b' } };
      if (topic === 'wsonly') return { urls: { worksheet: 'w' } };
      if (topic === 'none') return { urls: {} };
      return null;
    };
    // eslint-disable-next-line no-new-func
    return new Function('getRegistryEntry', 'return (' + src + ');')(getRegistryEntry);
  }

  it('09: _isLessonComplete — worksheet + Blooket both Done → complete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', { 'both|worksheet': { ts: 1 }, 'both|blooket': { ts: 1 } })).toBe(true);
  });

  it('10: _isLessonComplete — worksheet Done but Blooket NOT → incomplete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', { 'both|worksheet': { ts: 1 } })).toBe(false);
  });

  it('11: _isLessonComplete — a lesson with no Blooket is complete on the worksheet alone', () => {
    const fn = makeIsLessonComplete();
    expect(fn('wsonly', { 'wsonly|worksheet': { ts: 1 } })).toBe(true);
  });

  it('12: _isLessonComplete — no marks at all → incomplete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', {})).toBe(false);
  });

  // ── _isLessonUnlocked real-execution smoke tests ──────────────────────────
  function makeIsLessonUnlocked({ teacher = false, complete = false } = {}) {
    const src = fnBody(DESK, '_isLessonUnlocked');
    const _deskIsTeacher = () => teacher;
    const _isLessonComplete = () => complete;
    // eslint-disable-next-line no-new-func
    return new Function('_deskIsTeacher', '_isLessonComplete', 'return (' + src + ');')(
      _deskIsTeacher, _isLessonComplete
    );
  }
  const TODAY = new Date(2026, 6, 1);
  const PAST = new Date(2026, 5, 1);
  const FUTURE = new Date(2026, 7, 1);

  it('13: _isLessonUnlocked — not signed in → unlocked (no gate without identity)', () => {
    const fn = makeIsLessonUnlocked();
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, false)).toBe(true);
  });

  it('14: _isLessonUnlocked — teacher → unlocked (bypass)', () => {
    const fn = makeIsLessonUnlocked({ teacher: true });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('15: _isLessonUnlocked — first lesson (no prevTopic) → unlocked', () => {
    const fn = makeIsLessonUnlocked();
    expect(fn('1.1', FUTURE, null, TODAY, {}, true)).toBe(true);
  });

  it('16: _isLessonUnlocked — past-due but prior incomplete → open despite incomplete prior work', () => {
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', PAST, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('17: _isLessonUnlocked — future date + prior incomplete → open', () => {
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('18: _isLessonUnlocked — future date but prior complete → unlocked', () => {
    const fn = makeIsLessonUnlocked({ complete: true });
    expect(fn('1.2', FUTURE, '1.1', TODAY, {}, true)).toBe(true);
  });

  // ── _deskIsTeacher real-execution smoke ───────────────────────────────────
  it('19: _deskIsTeacher reads a2_user_role from localStorage', () => {
    const src = fnBody(DESK, '_deskIsTeacher');
    const mk = (role) => {
      const localStorage = { getItem: (k) => (k === 'a2_user_role' ? role : null) };
      // eslint-disable-next-line no-new-func
      return new Function('localStorage', 'return (' + src + ');')(localStorage);
    };
    expect(mk('teacher')()).toBe(true);
    expect(mk('student')()).toBe(false);
    expect(mk(null)()).toBe(false);
  });

  it('20: _isLessonComplete — a lesson with neither worksheet nor blooket is vacuously complete', () => {
    // Contract edge case: a lesson with no gradeable artifact must NOT
    // permanently block the next one — both checks are vacuously satisfied.
    const fn = makeIsLessonComplete();
    expect(fn('none', {})).toBe(true);
  });

  it('21: _isLessonUnlocked — today\'s lesson opens despite incomplete prior work', () => {
    // §8: the date no longer unlocks — even the current day's lesson stays
    // locked until its predecessor is complete.
    const fn = makeIsLessonUnlocked({ complete: false });
    expect(fn('1.2', TODAY, '1.1', TODAY, {}, true)).toBe(true);
  });

  it('22: _prevTopicInSequence — canonical predecessor (deduped), null for the first', () => {
    const src = fnBody(DESK, '_prevTopicInSequence');
    // eslint-disable-next-line no-new-func
    const fn = new Function('_orderedPeriodTopics', 'return (' + src + ');')(
      () => ['1.1', '1.2', '1.2', '1.3', '1.4']   // 1.2 repeats (a multi-day lesson)
    );
    expect(fn('1.1')).toBe(null);   // first → no predecessor (always open)
    expect(fn('1.2')).toBe('1.1');
    expect(fn('1.3')).toBe('1.2');  // the duplicate 1.2 is collapsed
    expect(fn('1.4')).toBe('1.3');
    expect(fn('9.9')).toBe(null);   // unknown topic → fail open
  });

  it('23: _prevSummerTopic — summer cells gate on the INDIVIDUAL summer sequence', () => {
    // The live period-E pacing is COMBINED (1.2+1.3, 1.4+1.5, ...), but summer
    // cells carry individual topics 1.1..1.10 — they must resolve against the
    // summer schedule, NOT the combined fall sequence (the blocker the review caught).
    const src = fnBody(DESK, '_prevSummerTopic');
    const lessons = ['1.1','1.2','1.3','1.4','1.5','1.6','1.7','1.8','1.9','1.10'].map((t) => ({ topic: t }));
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'return (' + src + ');')({ _summerSchedule: { lessons } });
    expect(fn('1.1')).toBe(null);     // first summer lesson → open
    expect(fn('1.2')).toBe('1.1');
    expect(fn('1.6')).toBe('1.5');    // NOT '1.4+1.5' — gates on the prior INDIVIDUAL summer lesson
    expect(fn('1.10')).toBe('1.9');
    expect(fn('7.3')).toBe(null);     // not a summer lesson → null (caller uses the period sequence)
  });

  it('24: _prevTopicInSequence — LIVE period-E COMBINED sequence (fall cells)', () => {
    const src = fnBody(DESK, '_prevTopicInSequence');
    const E = ['1.1', '1.2+1.3', '1.4+1.5', '1.6', '1.7+1.8', '1.9+1.10', '2.1'];
    // eslint-disable-next-line no-new-func
    const fn = new Function('_orderedPeriodTopics', 'return (' + src + ');')(() => E);
    expect(fn('1.1')).toBe(null);
    expect(fn('1.2+1.3')).toBe('1.1');      // cross-portion seam: summer 1.1 → fall 1.2+1.3
    expect(fn('1.6')).toBe('1.4+1.5');
    expect(fn('2.1')).toBe('1.9+1.10');     // unit boundary: U2 gated on the last U1 cell
  });

  it('25: _isLessonComplete — a combined "A+B" is complete when BOTH parts are done (bridge)', () => {
    const src = fnBody(DESK, '_isLessonComplete');
    const getRegistryEntry = () => ({ urls: { worksheet: 'w' } });   // every topic has a worksheet
    // eslint-disable-next-line no-new-func
    const fn = new Function('getRegistryEntry', 'return (' + src + ');')(getRegistryEntry);
    // summer student's INDIVIDUAL marks satisfy the fall COMBINED cell (cross-portion)
    expect(fn('1.2+1.3', { '1.2|worksheet': { ts: 1 }, '1.3|worksheet': { ts: 1 } })).toBe(true);
    expect(fn('1.2+1.3', { '1.2|worksheet': { ts: 1 } })).toBe(false);     // only one part → not complete
    // a fall student's OWN combined mark still works
    expect(fn('1.2+1.3', { '1.2+1.3|worksheet': { ts: 1 } })).toBe(true);
  });
});
