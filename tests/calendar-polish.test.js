/**
 * tests/calendar-polish.test.js
 *
 * Thread 2 (CALENDAR_POLISH) -- calendar grid polish in
 * desk.html. Frozen contract: CALENDAR_POLISH_BUILD.md.
 *
 * Source assertions + Node `vm` runtime of the real helpers
 * (quarterOfDate / paintDonowCells), matching tests/desk-donow-coloring.test.js.
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

// --- C1: done lessons greyscale ---------------------------------------------

describe('C1 -- done lessons render greyscale', () => {
  it('a .dc-done greyscale rule exists, excluding today + current', () => {
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale/);
  });
  it('.dc-ahead keeps its celebratory pulse (not greyscaled)', () => {
    expect(html).toMatch(/\.dc-ahead\s*\{[^}]*box-shadow[^}]*\}/);
    expect(html).toMatch(/dcAheadPulse/);
  });
});

// --- C2: current lesson emphasis (CALENDAR_FOCUS -- rCal owns cal-current) ---

describe('C2 -- current lesson emphasis', () => {
  it('.cal-current CSS rule exists', () => {
    expect(html).toMatch(/\.cal-current\s*\{[^}]*outline/);
  });
  it('paintDonowCells no longer touches cal-current (rCal owns it now)', () => {
    const b = fnBody(html, 'paintDonowCells');
    // the quoted class literal -- a comment mentioning .cal-current is fine.
    expect(b).not.toMatch(/'cal-current'/);
  });
  it('rCal marks one cell -- the calNextUpTopic lesson -- as cal-current', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/calNextUpTopic\(/);
    expect(b).toMatch(/inf\.t\s*===\s*_nextUpTopic/);
    expect(b).toMatch(/classList\.add\('cal-current'\)/);
  });

  // behavioral: calNextUpTopic skips non-lesson (review) cells + done lessons.
  function loadCalNextUp() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(
      fnBody(html, 'localLessonState') + '\n' +
      fnBody(html, 'calNextUpTopic') + '\nthis.__n = calNextUpTopic;', sandbox);
    return sandbox.__n;
  }
  it('calNextUpTopic -- first not-done lesson; skips review cells; null when all done', () => {
    const n = loadCalNextUp();
    const done = { '1.1|worksheet': { ts: 'y' } };
    expect(n(['1.1', '1.2', '1.3'], done)).toBe('1.2');           // 1.1 done -> 1.2
    expect(n(['1.1', 'REVIEW', '1.2'], done)).toBe('1.2');        // review cell skipped
    expect(n(['1.1', '1.2'], {})).toBe('1.1');                    // fresh -> first lesson
    const allDone = { '1.1|w': { ts: 'y' }, '1.2|w': { ts: 'y' } };
    expect(n(['1.1', '1.2', 'REVIEW'], allDone)).toBe(null);      // all done -> null
    expect(n(['1.1'], { '1.1|worksheet': { visitedAt: 'x' } })).toBe('1.1');  // partial counts
  });
});

// --- C3: Q1-Q4 quarter dividers ---------------------------------------------

describe('C3 -- Q1-Q4 quarter markers (F2: date-driven)', () => {
  it('.cal-qband CSS rule exists', () => {
    expect(html).toMatch(/\.cal-qband\s*\{/);
  });
  it('rCal emits a .cal-qband divider, date-driven via quarterOfDate', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/cal-qband/);
    expect(b).toMatch(/QUARTER_BAND_LABEL/);  // label keeps the unit list
    expect(b).toMatch(/quarterOfDate\(/);     // F2: position is date-driven
    expect(b).not.toMatch(/unitQuarter\(/);   // ...not the unit band
  });

  function loadQuarterOfDate() {
    const sandbox = {};
    createContext(sandbox);
    // quarterOfDate reads the QUARTER_WINDOWS const -- load both.
    const winSrc = /const QUARTER_WINDOWS = \[[\s\S]*?\n\];/.exec(html)[0];
    runInContext(winSrc + '\n' + fnBody(html, 'quarterOfDate') +
      '\nthis.__q = quarterOfDate;', sandbox);
    return sandbox.__q;
  }
  it('quarterOfDate maps calendar dates to the right quarter', () => {
    const q = loadQuarterOfDate();
    // JS Date month arg is 0-indexed: month 8 = September.
    // SY2627 real LEHS marking periods (mirrors roster-server grade-config.js).
    expect(q(new Date(2026, 8, 2))).toBe(1);    // Sep 2 2026 -- Q1 opens (first day)
    expect(q(new Date(2026, 10, 6))).toBe(1);   // Nov 6 2026 -- Q1 closes
    expect(q(new Date(2026, 10, 7))).toBe(0);   // Nov 7 2026 -- weekend between quarters
    expect(q(new Date(2026, 10, 9))).toBe(2);   // Nov 9 2026 -- Q2 opens
    expect(q(new Date(2027, 0, 22))).toBe(2);   // Jan 22 2027 -- Q2 closes
    expect(q(new Date(2027, 0, 25))).toBe(3);   // Jan 25 2027 -- Q3 opens
    expect(q(new Date(2027, 3, 14))).toBe(3);   // Apr 14 2027 -- Q3 closes
    expect(q(new Date(2027, 3, 15))).toBe(4);   // Apr 15 2027 -- Q4 opens
    expect(q(new Date(2027, 5, 17))).toBe(4);   // Jun 17 2027 -- Q4 closes
    expect(q(new Date(2026, 8, 1))).toBe(0);    // Sep 1 2026 -- before Q1
    expect(q(new Date(2027, 6, 1))).toBe(0);    // Jul 1 2027 -- after Q4
  });
});

// --- C4: per-cell direct-link icons removed ---------------------------------

describe('C4 -- per-cell direct-link icons removed', () => {
  it('htm() no longer builds a link-row', () => {
    const b = fnBody(html, 'htm');
    expect(b).not.toMatch(/link-row/);
    expect(b).not.toMatch(/linkHtml/);
  });
  it('the .link-row CSS rules are gone', () => {
    expect(html).not.toMatch(/\.link-row\s*\{/);
  });
});

// --- C5: CALENDAR_FOCUS synthwave next-up + local-done greyscale ------------

describe('C5 -- CALENDAR_FOCUS: synthwave next-up + local-done greyscale', () => {
  // A1: done-greyscale rule covers BOTH .dc-done and .dc-localdone, with grayscale + opacity
  it('A1 -- greyscale rule covers .dc-done AND .dc-localdone with grayscale + opacity', () => {
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity/);
    expect(html).toMatch(/\.dc-localdone:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity/);
  });
  // A2: .dc-done and .dc-localdone both DEFINE a box-shadow ring in green #1f8b3b
  it('A2 -- .dc-done and .dc-localdone both have a box-shadow green ring (var(--ok))', () => {
    expect(html).toMatch(/\.dc-done\s*\{[^}]*box-shadow[^}]*var\(--ok\)/);
    expect(html).toMatch(/\.dc-localdone\s*\{[^}]*box-shadow[^}]*var\(--ok\)/);
  });
  // A3: .dc-partial and .dc-localpartial both DEFINE a box-shadow ring in amber #d99a00
  it('A3 -- .dc-partial and .dc-localpartial both have a box-shadow amber ring (#d99a00)', () => {
    expect(html).toMatch(/\.dc-partial\s*\{[^}]*box-shadow[^}]*#d99a00/);
    expect(html).toMatch(/\.dc-localpartial\s*\{[^}]*box-shadow[^}]*#d99a00/);
  });
  // A4: .cal-current uses synthwave magenta #ff2e97, a box-shadow, AND animation: calCurrentPulse
  it('A4 -- .cal-current has var(--accent), box-shadow, and animation: calCurrentPulse', () => {
    expect(html).toMatch(/\.cal-current\s*\{[^}]*var\(--accent\)/s);
    expect(html).toMatch(/\.cal-current\s*\{[^}]*box-shadow/s);
    expect(html).toMatch(/\.cal-current\s*\{[^}]*animation:\s*calCurrentPulse/s);
  });
  // A5: @keyframes calCurrentPulse exists
  it('A5 -- @keyframes calCurrentPulse block exists', () => {
    expect(html).toMatch(/@keyframes\s+calCurrentPulse/);
  });
  // A6: the OLD plain .cal-current rule is gone
  it('A6 -- old plain .cal-current with outline: 3px solid var(--accent is gone', () => {
    expect(html).not.toMatch(/\.cal-current\s*\{\s*outline:\s*3px solid var\(--accent/);
  });
  // A7: prefers-reduced-motion disables .cal-current animation
  it('A7 -- prefers-reduced-motion media query disables .cal-current animation', () => {
    expect(html).toMatch(/prefers-reduced-motion[^{]*\{[^}]*\.cal-current\s*\{[^}]*animation:\s*none/);
  });
  // A8: localLessonState rolls a topic up from the STUDENT completion marks
  // (a2_desk_marks_), where recordProgress() stamps `ts` on a Done --
  // NOT from REGISTRY readiness. Behavioral test of the real helper.
  function loadLocalLessonState() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(fnBody(html, 'localLessonState') + '\nthis.__s = localLessonState;', sandbox);
    return sandbox.__s;
  }
  it('A8 -- localLessonState: done from a Done mark, partial from a visit-only mark', () => {
    const s = loadLocalLessonState();
    // a Done mark carries `ts` (recordProgress); a visit-only mark (recordLinkVisit) does not.
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x', ts: 'y', score: null } })).toBe('done');
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' } })).toBe('partial');
    expect(s('1.2', {})).toBe('');
    expect(s('1.2', { '9.9|worksheet': { ts: 'y' } })).toBe('');   // a different topic
    expect(s('1.2', { '1.20|worksheet': { ts: 'y' } })).toBe('');  // prefix is exact: 1.2 != 1.20
    // No registry in this sandbox → localLessonState fails OPEN to the lenient
    // "any artifact Done -> done" path. The STRICT (registry-aware) behavior is
    // pinned by A8c below.
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' }, '1.2|blooket': { visitedAt: 'x', ts: 'y' } })).toBe('done');
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' }, '1.2|quiz': { visitedAt: 'x' } })).toBe('partial');
  });
  // A8c: with the registry present, 'done' requires the lesson's GATE artifacts
  // (worksheet + Blooket) — the quiz ALONE must NOT mark a lesson done (the
  // reported bug: a quiz-only 1.2 greyed out + unlocked 1.3).
  it('A8c -- localLessonState is STRICT when the registry has gate artifacts', () => {
    const sandbox = {};
    createContext(sandbox);
    runInContext(
      'function getRegistryEntry(t){ return t === "1.2" ? { urls: { worksheet: "w", blooket: "b" } } : { urls: {} }; }\n' +
      fnBody(html, '_isLessonComplete') + '\n' +
      fnBody(html, 'localLessonState') + '\nthis.__s = localLessonState;', sandbox);
    const s = sandbox.__s;
    expect(s('1.2', { '1.2|quiz': { ts: 'y' } })).toBe('partial');                              // quiz alone ≠ done
    expect(s('1.2', { '1.2|worksheet': { ts: 'y' } })).toBe('done');                         // worksheet but no Blooket
    expect(s('1.2', { '1.2|worksheet': { ts: 'y' }, '1.2|blooket': { ts: 'y' } })).toBe('done'); // both gate artifacts
    expect(s('9.9', { '9.9|quiz': { ts: 'y' } })).toBe('done');                                  // no gate artifacts → any-done
  });
  // A8b: the recede class is wired to localLessonState, NOT the REGISTRY `worst`
  it('A8b -- rCal derives the recede class from localLessonState(inf.t, _gateMarks), not REGISTRY worst', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/localLessonState\(\s*inf\.t\s*,\s*_gateMarks\s*\)/);
    expect(b).toMatch(/_localState\s*===\s*'done'\s*\?\s*'dc-localdone'/);
    expect(b).not.toMatch(/worst\s*===\s*'ready'\s*\?\s*'dc-localdone'/);
  });
  // A9: .dc-ahead is preserved -- @keyframes dcAheadPulse exists; greyscale rule does NOT mention .dc-ahead
  it('A9 -- .dc-ahead preserved; greyscale rule does not mention .dc-ahead', () => {
    expect(html).toMatch(/@keyframes\s+dcAheadPulse/);
    expect(html).not.toMatch(/\.dc-ahead[^{]*:not\(\.cell-today\)/);
  });
});

// --- C5b: CROSS-DEVICE grey-out (synced /grade score completes a lesson) -----
// The 2026-06-03 follow-on to 0dea2ae's strict gating: a lesson finished on the
// HOME computer must grey + unlock on the WORK computer too. The local Done-click
// marks (a2_desk_marks_) don't sync across devices, but the /grade scores
// follow the LOGIN. So _isLessonComplete now counts an artifact done when the
// local .ts mark exists OR the SYNCED score clears the same bar the Done button
// uses (worksheet Cws >= 60, Blooket >= 80). The quiz is NOT in the gate, so the
// quiz-alone-completes bug stays fixed. The strict local-only behavior (A8c) is
// preserved when the synced helpers are absent (isolated vm load).
describe('C5b -- cross-device grey-out from the synced /grade score', () => {
  // Load _isLessonComplete WITH stubbed synced helpers + the registry — the way
  // the real Desk has it once the /grade cache is warm. cws / blooket are the
  // synced scores (omit → the helper returns null, i.e. no synced signal).
  function loadIsLessonComplete(opts) {
    opts = opts || {};
    const sandbox = {};
    createContext(sandbox);
    const cwsLit = typeof opts.cws === 'number' ? String(opts.cws) : 'null';
    const blLit = typeof opts.blooket === 'number' ? String(opts.blooket) : 'null';
    runInContext(
      'function getRegistryEntry(t){ return t === "1.2" ? { urls: { worksheet: "w", blooket: "b" } } : { urls: {} }; }\n' +
      'var DESK_WORKSHEET_DONE_THRESHOLD = 60;\n' +
      'function _getCwsForTopic(t){ return ' + cwsLit + '; }\n' +
      'function _blooketScoreFor(t){ return ' + blLit + '; }\n' +
      fnBody(html, '_isLessonComplete') + '\nthis.__c = _isLessonComplete;', sandbox);
    return sandbox.__c;
  }

  it('A8d -- synced worksheet+Blooket scores complete the lesson with NO local marks', () => {
    const c = loadIsLessonComplete({ cws: 85, blooket: 80 });
    expect(c('1.2', {})).toBe(true);              // both synced scores clear the bar
  });
  it('A8d -- worksheet synced but Blooket below 80 is NOT complete', () => {
    const c = loadIsLessonComplete({ cws: 85, blooket: 60 });
    expect(c('1.2', {})).toBe(true);              // Flashcards never block completion
  });
  it('A8d -- worksheet synced below 60 is NOT complete even with Blooket synced', () => {
    const c = loadIsLessonComplete({ cws: 59, blooket: 90 });
    expect(c('1.2', {})).toBe(false);             // Cws 59 < 60
  });
  it('A8d -- a local Done mark still completes when the synced score is absent', () => {
    const c = loadIsLessonComplete({});           // _getCwsForTopic/_blooketScoreFor → null
    expect(c('1.2', { '1.2|worksheet': { ts: 'y' }, '1.2|blooket': { ts: 'y' } })).toBe(true);
  });
  it('A8d -- mixed sources: local worksheet Done + synced Blooket completes', () => {
    const c = loadIsLessonComplete({ blooket: 80 });
    expect(c('1.2', { '1.2|worksheet': { ts: 'y' } })).toBe(true);
  });
  it('A8d -- the quiz is NOT in the gate: a quiz mark never completes on its own', () => {
    const c = loadIsLessonComplete({});           // no worksheet/Blooket signal at all
    expect(c('1.2', { '1.2|quiz': { ts: 'y' } })).toBe(false);
  });

  // The repaint that makes the synced greying actually appear: rCal runs before
  // the /grade cache warms, so we repaint after it loads. Greying is a
  // flicker-free class toggle; a lock change (a synced score unlocking the next
  // lesson) escalates to ONE rCal rebuild — only when the unlock state flips.
  it('paintLocalDoneCells repaints greying flicker-free (class toggles)', () => {
    const b = fnBody(html, 'paintLocalDoneCells');
    expect(b).toMatch(/querySelectorAll\('#cg \.dc\[data-topic\]'\)/);
    expect(b).toMatch(/localLessonState\(/);
    expect(b).toMatch(/dc-localdone/);
    expect(b).toMatch(/dc-localpartial/);
    expect(b).toMatch(/cal-current/);
  });
  it('paintLocalDoneCells escalates to rCal ONLY when a lesson lock flips', () => {
    const b = fnBody(html, 'paintLocalDoneCells');
    // detects a stale lock via the same gate rCal uses...
    expect(b).toMatch(/_isLessonUnlocked\(/);
    expect(b).toMatch(/cell-locked/);
    expect(b).toMatch(/lockChanged/);
    // ...and the rCal rebuild is GUARDED by that flip (not unconditional —
    // renderDoNowGrades runs on every visibilitychange, so an unconditional
    // rCal here would reintroduce per-poll flicker).
    expect(b).toMatch(/lockChanged\s*&&\s*typeof rCal === 'function'\)\s*rCal\(\)/);
  });
  it('renderDoNowGrades repaints local-done cells after the grade cache loads', () => {
    const b = fnBody(html, 'renderDoNowGrades');
    expect(b).toMatch(/_gradeLessonsCache = Array\.isArray/);
    expect(b).toMatch(/paintLocalDoneCells\(\)/);
  });
  it('_orderedPeriodTopics is shared by rCal and paintLocalDoneCells (one next-up source)', () => {
    expect(fnBody(html, 'rCal')).toMatch(/calNextUpTopic\(_orderedPeriodTopics\(\)/);
    expect(fnBody(html, 'paintLocalDoneCells')).toMatch(/_orderedPeriodTopics\(\)/);
  });
});

// --- CALENDAR_COMPACT -- focus window so the calendar never buries the board ---

describe('Calendar compaction -- always show a focus window', () => {
  it('rCal defines CAL_FOCUS_WEEKS = 2', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/CAL_FOCUS_WEEKS\s*=\s*2/);
  });

  it('rCal slices W down to the focus window', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/W\s*=\s*W\.slice\(/);
  });

  it('rCal anchors the window on the today-week index when in school', () => {
    const b = fnBody(html, 'rCal');
    // Source pin: the function scans W looking for the week whose days
    // include today, then uses that index as the focus anchor.
    expect(b).toMatch(/_todayWk\s*=\s*i/);
  });

  it('rCal clamps the start so the window always has CAL_FOCUS_WEEKS rows', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/Math\.max\(0,\s*Math\.min\(/);
  });

  it('rCal falls back by date when today has no week (pre/post-school)', () => {
    const b = fnBody(html, 'rCal');
    // Pre-school: t < W[0].m -> start 0. Post-school: -> last window.
    expect(b).toMatch(/t\s*<\s*W\[0\]\.m/);
    // After CALENDAR_NAV the compaction uses _origLen (a snapshot of W.length
    // taken before the slice) so _displayStart can be referenced after.
    expect(b).toMatch(/_origLen\s*-\s*CAL_FOCUS_WEEKS/);
  });
});

// --- CALENDAR_NAV -- prev/next arrows above the compacted grid ---

describe('Calendar nav -- prev/next arrows page the focus window', () => {
  it('has a .cal-nav bar styled in CSS', () => {
    expect(html).toMatch(/\.cal-nav\s*\{[^}]*display:\s*flex/);
  });

  it('has the press-feedback style (black background on :active / .cal-nav-active)', () => {
    expect(html).toMatch(/\.cal-nav-btn:active[^{]*,\s*\.cal-nav-btn\.cal-nav-active\s*\{[^}]*background:\s*var\(--black\)/);
  });

  it('hides one arrow at an edge via visibility:hidden (slot preserved)', () => {
    expect(html).toMatch(/\.cal-nav-btn\.cal-nav-hidden\s*\{[^}]*visibility:\s*hidden/);
  });

  it('renders two button elements with ids cal-prev and cal-next', () => {
    expect(html).toMatch(/id=["']cal-prev["'][^>]*onclick=["']calStep\(-1\)/);
    expect(html).toMatch(/id=["']cal-next["'][^>]*onclick=["']calStep\(1\)/);
  });

  it('defines _calPageOffset and calStep at module scope', () => {
    expect(html).toMatch(/let\s+_calPageOffset\s*=\s*0/);
    expect(html).toMatch(/function\s+calStep\s*\(\s*dir\s*\)/);
  });

  it('calStep pages by the current window size (_calStepWeeks) and re-runs rCal', () => {
    const b = fnBody(html, 'calStep');
    expect(b).toMatch(/_calPageOffset\s*\+=\s*dir\s*\*\s*_calStepWeeks/);
    expect(b).toMatch(/rCal\(\)/);
  });

  it("rCal applies _calPageOffset on top of today's anchor", () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/_todayAnchor\s*\+\s*_calPageOffset/);
  });

  it('rCal toggles cal-nav-hidden on the prev arrow at the left edge', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/_np\.classList\.toggle\(\s*['"]cal-nav-hidden['"]\s*,\s*_displayStart\s*<=\s*0/);
  });

  it('rCal toggles cal-nav-hidden on the next arrow at the right edge', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/_nn\.classList\.toggle\(\s*['"]cal-nav-hidden['"]\s*,\s*_displayStart\s*\+\s*CAL_FOCUS_WEEKS\s*>=\s*_origLen/);
  });
});
