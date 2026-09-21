// A2 access stays open; completion evidence controls resource status.
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

describe('Desk: A2 access and completion', () => {
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

  it('05: _studentMarkSave re-renders the calendar to refresh completion status', () => {
    const body = fnBody(DESK, '_studentMarkSave');
    expect(body).toMatch(/rCal\s*\(\s*\)/);
  });

  it('06: .cell-locked CSS rule exists', () => {
    expect(DESK).toMatch(/\.cell-locked\s*\{/);
  });

  

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

  it('10: _isLessonComplete — worksheet Done without Blooket is complete', () => {
    const fn = makeIsLessonComplete();
    expect(fn('both', { 'both|worksheet': { ts: 1 } })).toBe(true);
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


  it.each(['C', 'D', 'G'])('23: section %s uses a deduplicated A2 sequence', () => {
    const src = fnBody(DESK, '_prevTopicInSequence');
    // Meeting dates and applyA2Pacing are covered by a2-calendar.test.js.
    const topics = ['1.1', '1.1', '1.2', '1.2', '2.1'];
    const fn = new Function('_orderedPeriodTopics', 'return (' + src + ');')(() => topics);
    expect(fn('1.1')).toBe(null);
    expect(fn('1.2')).toBe('1.1');
    expect(fn('2.1')).toBe('1.2');
    expect(fn('12.4')).toBe(null);
  });

  it.each([
    [60, 80, true], [59, 80, false], [60, 79, true], [null, null, false],
  ])('24: worksheet %s and deck %s yield completion %s', (worksheet, deck, complete) => {
    const src = fnBody(DESK, '_isLessonComplete');
    const fn = new Function(
      'getRegistryEntry', '_getCwsForTopic', '_blooketScoreFor', 'return (' + src + ');'
    )(
      () => ({ urls: { worksheet: 'check.html?lesson=1-1', blooket: 'content/a2/fixture.csv' } }),
      () => worksheet, () => deck
    );
    expect(fn('1.1', {})).toBe(complete);
  });

  it('25: grouped A2 resources require evidence for every member', () => {
    const src = fnBody(DESK, '_isLessonComplete');
    const fn = new Function('getRegistryEntry', 'groupTopics', 'return (' + src + ');')(
      () => ({ urls: { worksheet: 'check.html?lesson=1-1' } }), topic => topic.split('+')
    );
    expect(fn('1.1+1.2', { '1.1|worksheet': { ts: 1 }, '1.2|worksheet': { ts: 1 } })).toBe(true);
    expect(fn('1.1+1.2', { '1.1|worksheet': { ts: 1 } })).toBe(false);
    expect(fn('1.1+1.2', { '1.1+1.2|worksheet': { ts: 1 } })).toBe(false);
  });
});
