// tests/progress-reset-matrix-cleared-storage.test.js — PROGRESS_RESET_FIX_SPEC.md
// RC clarification case (incident-2026-07-20 progress-reset fix): localStorage
// completely cleared (no latch, no grade cache, no marks) AND /grade
// simultaneously unavailable — covering BOTH a 500 response and a thrown
// fetch. Pins the end-to-end truthful-unknown behavior through the REAL
// extracted code, reusing composeRenderHarness / composeRProgHarness /
// composeLatchHarness (tests/fixtures/incident-progress-reset/matrix-
// harness.js) the same way tests/progress-reset-matrix-loadstate.test.js and
// tests/progress-reset-matrix-latch.test.js do — no re-implementation of the
// functions under test.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  composeRenderHarness,
  composeRProgHarness,
  composeLatchHarness,
} from './fixtures/incident-progress-reset/matrix-harness.js';

const TODAY = new Date(2026, 6, 20);
const PAST = new Date(2026, 6, 10);

function statusRes(status) {
  return { ok: false, status, json: async () => ({}) };
}
function okRes(json) {
  return { ok: true, status: 200, json: async () => json };
}
function allLocalStorageKeys(win) {
  const keys = [];
  for (let i = 0; i < win.localStorage.length; i++) keys.push(win.localStorage.key(i));
  return keys;
}

describe.each([
  ['500 response', () => Promise.resolve(statusRes(500)), 'server', 500],
  ['thrown fetch', () => Promise.reject(new Error('network down')), 'network', null],
])('matrix row: cleared storage + /grade unavailable via %s', (_label, fetchImpl, kind, status) => {
  it('(1)(2)(3) classifies unavailable, shows the truthful banner, restores/persists nothing', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl,
    });
    // RC's clarification case: nothing seeded anywhere — no latch, no grade
    // cache, no marks, a genuinely fresh localStorage.
    expect(allLocalStorageKeys(h.win).length).toBe(0);

    await h.render();

    // (1) tri-state _gradeLoadState ends 'unavailable' with the correct kind.
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind, status });

    // (2) the status banner renders the truthful saved-work message (never
    // the auth-specific "sign-in needs a refresh" copy, and never silent).
    expect(h.bannerVisible()).toBe(true);
    expect(h.bannerText()).toMatch(/Grades are temporarily unavailable — your work is saved\./);
    expect(h.bannerText()).not.toMatch(/sign-in needs a refresh/i);

    // (3) nothing existed to restore -> _gradeLessonsCache stays null, and
    // NOTHING is persisted: no latch write, no grade-cache write.
    expect(h.win._gradeLessonsCache).toBeNull();
    expect(h.rawLatch()).toBeNull();
    expect(h.rawGradeCache()).toBeNull();
    expect(allLocalStorageKeys(h.win).length).toBe(0); // localStorage stays fully empty
    expect(allLocalStorageKeys(h.win).some((k) => k.startsWith('a2_server_complete_v1:'))).toBe(false);
    expect(allLocalStorageKeys(h.win).some((k) => k.startsWith('a2_grade_cache_v1:'))).toBe(false);
  });
});

describe('matrix row: cleared storage — no fabricated completion, no lockout from uncertainty', () => {
  it('(4) serverCompleteFor / isLessonComplete never fabricate completion on cleared storage', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    // Nothing seeded — the cleared-storage state.
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: false, bl: false });
    expect(o.isLessonComplete('1.2', {})).toBe(false);
  });

  it('(5) navigation fails OPEN — no lock from uncertainty', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    expect(o.isLessonUnlocked('1.4', PAST, '1.3', TODAY, {}, true)).toBe(true);
  });
});

describe('matrix row: cleared storage — rProg honest-unknown', () => {
  it('(6) renders the truthful unavailable label, never "N of M lessons done"', () => {
    const r = composeRProgHarness({
      username: 'student-a', studentId: 'sid-a',
      pace: { total: 5, done: 0, expected: 2 },
      loadState: 'unavailable',
      // gradeCache omitted -> stays null, matching the cleared-storage cold cache.
    });
    const label = r.run();
    expect(label).toBe('Progress temporarily unavailable — your work is saved.');
    expect(label).not.toMatch(/\d+ of \d+ lessons done/);
  });
});

describe('matrix row: cleared storage recovers — CONTROL (a subsequent live success)', () => {
  it('(7) flips to available, writes the latch, and the strict gate resumes', async () => {
    let calls = 0;
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('down')); // the cleared-storage outage
        return Promise.resolve(okRes({
          ok: true,
          lessons: [{ lessonKey: '1.2', Cws: 79, blooket: 85 }],
          quarters: {},
        }));
      },
    });

    await h.render(); // first: cleared storage, network down
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.rawLatch()).toBeNull();

    await h.render(); // second: the live success
    expect(h.win._gradeLoadState).toBe('available');
    const latch = h.rawLatch();
    expect(latch).not.toBeNull();
    expect(latch.topics['1.2']).toEqual({ ws: true, bl: true });

    // Strict gate resumes: reading the REAL localStorage the render harness
    // just wrote (shared, not re-seeded) through the real gate functions —
    // with genuine evidence now present but a DIFFERENT, never-confirmed
    // predecessor lesson, the gate goes back to LOCKED. This proves recovery
    // doesn't leave the fail-open behavior stuck on: fail-open was specific
    // to the "no evidence exists anywhere" cleared-storage state, not a
    // permanent relaxation once any evidence shows up.
    const gate = composeLatchHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      sharedStorage: h.win.localStorage,
    });
    expect(gate.serverEvidencePresent()).toBe(true); // real evidence now exists
    expect(gate.isLessonComplete('1.3', {})).toBe(false); // 1.3 was never confirmed
    expect(gate.isLessonUnlocked('1.4', PAST, '1.3', TODAY, {}, true)).toBe(false); // strict again
  });
});
