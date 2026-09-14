// tests/progress-reset-matrix-identity-switch.test.js — incident-2026-07-20
// release-gate review follow-up (findings B1, B2, B3, LANE-C, and the LANE D
// Retry-button spec mismatch). All four are variations on ONE root cause: an
// in-place identity switch (sign-in as a different student without an
// intervening Sign Out / reload, or a live roster session established by a
// sibling same-origin app) must never let stale identity-scoped state —
// module-global /grade caches, a pending stale-token auto-retry, or a
// diverged legacy marks key — bleed into the newly-active identity's gating,
// greying, or Do Now paint.
//
// Uses the real extracted `_resetGradeStateForIdentitySwitch` (runtime) plus
// source pins on the three sign-in tails, the boot sequence, and the Retry
// button wiring (all cheap + robust to incidental refactors, same idiom as
// the existing "source pin" rows in progress-reset-matrix-loadstate.test.js).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';
import { DESK, extractFn } from './fixtures/incident-progress-reset/oracles.js';

function composeResetHarness() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://desk.test' });
  const win = dom.window;
  const timers = [];
  let nextId = 1;
  win.setTimeout = (fn, delay) => { const id = nextId++; timers.push({ id, fn, delay }); return id; };
  win.clearTimeout = (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; };
  const ctx = createContext(win);
  const script = [
    // Simulates warm, in-flight state left behind by a PREVIOUS student
    // (student X) on a shared device, right before student Y signs in.
    "var _gradeLessonsCache = [{ lessonKey: '1.1', Cws: 90, blooket: 95 }];",
    "var _gradeGradebookCache = { quarters: {} };",
    "var _gradeQuartersCache = { Q1: {} };",
    "var _gradeLoadState = 'unavailable';",
    "var _gradeLoadError = { kind: 'network', status: null };",
    "var _gradeRetryCount = 1;",
    "var _gradeRetryTimer = setTimeout(function () {}, 15000);", // X's stale-token retry, armed
    "var _gradeLastRenderedState = 'unavailable';",
    extractFn(DESK, '_resetGradeStateForIdentitySwitch'),
    "window.__reset = _resetGradeStateForIdentitySwitch;",
  ].join('\n');
  runInContext(script, ctx);
  return { win, timers };
}

describe('_resetGradeStateForIdentitySwitch (incident review B1/B2/LANE-C)', () => {
  it('clears every module-global /grade cache the new identity must not inherit', () => {
    const { win } = composeResetHarness();
    win.__reset();
    expect(win._gradeLessonsCache).toBeNull();
    expect(win._gradeGradebookCache).toBeNull();
    expect(win._gradeQuartersCache).toBeNull();
  });

  it('resets the tri-state load fields to the boot default (D1 unknown, no stale error)', () => {
    const { win } = composeResetHarness();
    win.__reset();
    expect(win._gradeLoadState).toBe('unknown');
    expect(win._gradeLoadError).toBeNull();
    expect(win._gradeLastRenderedState).toBe('unknown');
  });

  it('cancels a pending stale-token retry timer so it can never fire under the new identity', () => {
    const { win, timers } = composeResetHarness();
    expect(win._gradeRetryTimer).not.toBeNull();
    win.__reset();
    expect(win._gradeRetryTimer).toBeNull();
    expect(win._gradeRetryCount).toBe(0);
    expect(timers[0].cleared).toBe(true);
  });
});

describe('source pin: all three sign-in tails call _resetGradeStateForIdentitySwitch before migrating marks', () => {
  it.each(['submitSignIn', '_nfSubmitPassword', '_applySignedUpSession'])('%s resets grade state on every successful sign-in', (fnName) => {
    const body = extractFn(DESK, fnName);
    expect(body).toMatch(/_resetGradeStateForIdentitySwitch\s*\(\s*\)/);
    // Must run before the Do Now refresh so a stale retry can never race a
    // freshly-scheduled one for the new identity.
    const resetIdx = body.indexOf('_resetGradeStateForIdentitySwitch(');
    const renderIdx = body.search(/renderDoNow\s*\(\s*\)/);
    expect(resetIdx).toBeGreaterThan(-1);
    expect(renderIdx).toBeGreaterThan(resetIdx);
  });

  it.each(['submitSignIn', '_nfSubmitPassword', '_applySignedUpSession'])('%s captures the PRIOR legacy key before overwriting it, and feeds it to _migrateMarksAliases (H1)', (fnName) => {
    const body = extractFn(DESK, fnName);
    const captureIdx = body.search(/localStorage\.getItem\(\s*'a2_desk_student_email'\s*\)/);
    const overwriteIdx = body.indexOf("localStorage.setItem('a2_desk_student_email'");
    const migrateIdx = body.indexOf('_migrateMarksAliases(');
    expect(captureIdx).toBeGreaterThan(-1);
    expect(overwriteIdx).toBeGreaterThan(captureIdx); // captured BEFORE the overwrite
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(body.slice(migrateIdx, migrateIdx + 40)).not.toMatch(/_migrateMarksAliases\(\s*\)/); // called WITH the captured value, not bare
  });
});

describe('source pin: boot reconciles the legacy key to the live roster session before migrating (B3)', () => {
  it('boot writes the legacy key from rosterClient.current().username before calling _migrateMarksAliases', () => {
    // Anchor on the D6 boot-migration comment (unique in the file) rather
    // than `loadRegistry();`, which also appears inside an unrelated
    // function earlier in the file and would make the region far too wide.
    const start = DESK.indexOf('PROGRESS_RESET_FIX_SPEC D6 — the roster session is already restored');
    expect(start).toBeGreaterThan(-1);
    const migrateIdx = DESK.indexOf('_migrateMarksAliases();', start);
    expect(migrateIdx).toBeGreaterThan(start);
    expect(migrateIdx - start).toBeLessThan(2000); // tight window, not "anywhere later in the file"
    const region = DESK.slice(start, migrateIdx);
    // A sibling same-origin app can sign a DIFFERENT roster identity in
    // without touching this Desk-only legacy key; boot must reconcile it
    // from the live session BEFORE the migration union runs, so a stale
    // legacy key never becomes the migration's (wrong) primary identity.
    expect(region).toMatch(/rosterClient\.current\s*\(\s*\)/);
    expect(region).toMatch(/localStorage\.setItem\(\s*'a2_desk_student_email'/);
  });
});

describe('source pin: Retry button re-calls renderDoNowGrades directly (D2 spec / LANE D)', () => {
  it('_renderGradeStatus\'s Retry handler resolves baseUrl/token and calls renderDoNowGrades, not just renderDoNow', () => {
    const body = extractFn(DESK, '_renderGradeStatus');
    const retryIdx = body.indexOf("btn.textContent = 'Retry'");
    expect(retryIdx).toBeGreaterThan(-1);
    const region = body.slice(retryIdx);
    expect(region).toMatch(/renderDoNowGrades\s*\(/);
  });
});
