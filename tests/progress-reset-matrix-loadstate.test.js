// tests/progress-reset-matrix-loadstate.test.js — PROGRESS_RESET_FIX_SPEC.md
// §3 matrix rows for D1 (tri-state load state + classification), D2 (failure
// handling + banner + retry), D7 (order-independent reconcile), and D5
// (rProg honest-unknown). Uses the REAL extracted renderDoNowGrades /
// _renderGradeStatus / _scheduleGradeRetry / rProg via composeRenderHarness
// and composeRProgHarness (tests/fixtures/incident-progress-reset/
// matrix-harness.js) — a controllable fetch double + a manual setTimeout
// double, since neither vitest's fake timers nor real Node timers reach a
// JSDOM window's own timer functions (the window is not globalThis).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  composeRenderHarness,
  composeRProgHarness,
  seedGradeCache,
  extractFn,
  DESK,
} from './fixtures/incident-progress-reset/matrix-harness.js';

function okRes(json) {
  return { ok: true, status: 200, json: async () => json };
}
function statusRes(status) {
  return { ok: false, status, json: async () => ({}) };
}

describe('matrix row: 401 -> auth', () => {
  it('classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.resolve(statusRes(401)),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'auth', status: 401 });
    expect(h.bannerVisible()).toBe(true);
    expect(h.bannerText()).toMatch(/sign-in needs a refresh/i);
    // roster identity untouched — nothing in the classify path mutates it.
    expect(h.win.rosterClient.current()).toEqual({ username: 'student-a' });
  });

  it('source pin: the auth branch never calls a session-clear/sign-out path', () => {
    const body = extractFn(DESK, 'renderDoNowGrades');
    expect(body).not.toMatch(/rosterClient\.(signOut|logout|clear)/);
    expect(body).not.toMatch(/removeItem\(['"]a2_roster/);
  });
});

describe('matrix row: 403 -> auth (classified identically to 401)', () => {
  it('classifies unavailable/auth', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.resolve(statusRes(403)),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'auth', status: 403 });
    expect(h.bannerText()).toMatch(/sign-in needs a refresh/i);
  });
});

describe('matrix row: 500 -> server', () => {
  it('classifies unavailable/server, shows the Retry banner, restores from cache, and schedules a retry', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl: () => Promise.resolve(statusRes(500)),
    });
    seedGradeCache(h.win, { studentId: 'sid-a', origin: 'https://roster.test' }, { ok: true, lessons: [{ lessonKey: '1.1', Cws: 90, blooket: 95 }], quarters: {} });

    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'server', status: 500 });
    expect(h.bannerVisible()).toBe(true);
    expect(h.bannerText()).toMatch(/temporarily unavailable/i);
    expect(h.win._gradeLessonsCache).toEqual([{ lessonKey: '1.1', Cws: 90, blooket: 95 }]); // restored, not stranded
    expect(h.timers.length).toBe(1);
    expect(h.timers[0].delay).toBe(15000);
  });
});

describe('matrix row: malformed JSON / {ok:false} on a 200 -> server (never "available")', () => {
  it('malformed JSON (res.json() throws) is classified server, not network', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'server', status: 200 });
  });

  it('{ok:false} on a 200 is classified server, not treated as available', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.resolve(okRes({ ok: false })),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'server', status: 200 });
  });
});

describe('matrix row: timeout / null-res -> network', () => {
  it('a thrown/rejected fetch is classified network', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.reject(new Error('timeout')),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'network', status: null });
  });

  it('a null response (unreachable) is classified network', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.resolve(null),
    });
    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'network', status: null });
  });
});

describe('matrix row: offline then recovery', () => {
  it('network unavailable, then a later live success -> available, clears the error, hides the banner, resets retries, writes the latch', async () => {
    let calls = 0;
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('down'));
        return Promise.resolve(okRes({ ok: true, lessons: [{ lessonKey: '1.2', Cws: 79, blooket: 85 }], quarters: {} }));
      },
    });

    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLoadError).toEqual({ kind: 'network', status: null });
    expect(h.win._gradeRetryCount).toBe(1);
    expect(h.timers.length).toBe(1);

    await h.render(); // the "later live success"
    expect(h.win._gradeLoadState).toBe('available');
    expect(h.win._gradeLoadError).toBeNull();
    expect(h.bannerVisible()).toBe(false);
    expect(h.win._gradeRetryCount).toBe(0);
    expect(h.timers[0].cleared).toBe(true); // the pending retry timer was cancelled

    const latch = h.rawLatch();
    expect(latch.topics['1.2']).toEqual({ ws: true, bl: true });
  });
});

describe('matrix row: delayed success reconcile (D7)', () => {
  it('an unavailable render followed by an available render forces a full rCal even when the cache was already warm from a restore', async () => {
    let calls = 0;
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve(statusRes(500));
        return Promise.resolve(okRes({ ok: true, lessons: [{ lessonKey: '1.2', Cws: 79, blooket: 85 }], quarters: {} }));
      },
    });
    // Seed a real cache so the FIRST (failed) render already warms
    // _gradeLessonsCache via the evidence-restore branch — isolating D7's
    // unavailable->available escalation from the simpler cold->warm one.
    seedGradeCache(h.win, { studentId: 'sid-a', origin: 'https://roster.test' }, { ok: true, lessons: [{ lessonKey: '1.1', Cws: 90, blooket: 95 }], quarters: {} });

    await h.render();
    expect(h.win._gradeLessonsCache).not.toBeNull(); // warm already, from the restore
    expect(h.win._gradeLastRenderedState).toBe('unavailable');

    h.win.__rCalCalls = 0; // isolate the SECOND render's rCal call
    await h.render();
    expect(h.win._gradeLoadState).toBe('available');
    expect(h.win.__rCalCalls).toBe(1); // D7 fired even though the cache was NOT cold this time
  });
});

describe('matrix row: rProg honest-unknown (D5)', () => {
  it('signed-in, zero done, no evidence, cold cache: "loading" state -> "Progress loading…", never "0 of N"', () => {
    const r = composeRProgHarness({
      username: 'student-a', studentId: 'sid-a',
      pace: { total: 5, done: 0, expected: 2 },
      loadState: 'loading',
    });
    const label = r.run();
    expect(label).toMatch(/Progress loading/);
    expect(label).not.toMatch(/\d+ of \d+ lessons done/);
  });

  it('"unavailable" state -> "Progress temporarily unavailable — your work is saved.", never "0 of N"', () => {
    const r = composeRProgHarness({
      username: 'student-a', studentId: 'sid-a',
      pace: { total: 5, done: 0, expected: 2 },
      loadState: 'unavailable',
    });
    const label = r.run();
    expect(label).toMatch(/temporarily unavailable/);
    expect(label).not.toMatch(/\d+ of \d+ lessons done/);
  });

  it('with real evidence present (a warm cache), the honest-unknown label does NOT show — the normal pace label renders', () => {
    const r = composeRProgHarness({
      username: 'student-a', studentId: 'sid-a',
      pace: { total: 5, done: 3, expected: 2 },
      loadState: 'available',
      gradeCache: [{ lessonKey: '1.1', Cws: 90, blooket: 95 }],
    });
    const label = r.run();
    expect(label).toMatch(/\d+ of \d+ lessons done/);
  });
});

describe('matrix row: auto-retry cap (<=3 per page load, 15s/30s/60s, no stacking while pending)', () => {
  it('does not stack a second scheduled retry while one is still pending', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.reject(new Error('down')),
    });
    await h.render();
    expect(h.timers.length).toBe(1);
    expect(h.win._gradeRetryCount).toBe(1);

    await h.render(); // _gradeRetryTimer is still set from the first call
    expect(h.timers.length).toBe(1); // no new timer scheduled
    expect(h.win._gradeRetryCount).toBe(1); // count unchanged
  });

  it('backs off 15s/30s/60s and stops scheduling after 3 retries', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a',
      fetchImpl: () => Promise.reject(new Error('down')),
    });
    await h.render();
    h.win._gradeRetryTimer = null; // simulate the 15s timer having fired

    await h.render();
    h.win._gradeRetryTimer = null; // simulate the 30s timer having fired

    await h.render();
    h.win._gradeRetryTimer = null; // simulate the 60s timer having fired

    await h.render(); // cap reached — no 4th timer

    expect(h.timers.map((t) => t.delay)).toEqual([15000, 30000, 60000]);
    expect(h.win._gradeRetryCount).toBe(3);
  });
});

describe('matrix row: evidence-restore never latches or re-persists the cache', () => {
  it('a restored/derived payload (state stays unavailable) does not call _latchServerComplete or _persistGradeCache', async () => {
    const h = composeRenderHarness({
      username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test',
      fetchImpl: () => Promise.resolve(statusRes(500)),
    });
    seedGradeCache(h.win, { studentId: 'sid-a', origin: 'https://roster.test' }, { ok: true, lessons: [{ lessonKey: '1.2', Cws: 79, blooket: 85 }], quarters: {} });

    await h.render();
    expect(h.win._gradeLoadState).toBe('unavailable');
    expect(h.win._gradeLessonsCache).toEqual([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]); // restored + painted
    expect(h.rawLatch()).toBeNull(); // but never latched — a restore is not a live confirmation
  });

  it('source pin: _latchServerComplete / _persistGradeCache sit ONLY inside the live-success `if (data) {` branch', () => {
    const body = extractFn(DESK, 'renderDoNowGrades');
    const liveIdx = body.indexOf('if (data) {');
    const restoreIdx = body.indexOf("else if (_gradeLoadState === 'unavailable')");
    const latchIdx = body.indexOf('_latchServerComplete(');
    const persistIdx = body.indexOf('_persistGradeCache(data)');
    expect(liveIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(liveIdx);
    expect(persistIdx).toBeGreaterThan(liveIdx);
    expect(persistIdx).toBeLessThan(restoreIdx);
    expect(latchIdx).toBeGreaterThan(liveIdx);
    expect(latchIdx).toBeLessThan(restoreIdx);
  });
});
