// tests/incident-progress-reset-donow-hydration.test.js — INCIDENT I5 repro
// (Lane I5b): even when /donow hydration runs cleanly (no auth/HTTP problem
// at all), it only ever seeds the EXACT DESK_DONE shape the server reports
// (selfDoneArtifacts). Both students' /donow payloads carry a 'blooket'
// artifact for lessons past 1.1 but never a 'worksheet' one — the worksheet
// completion for those lessons lives ONLY in the ledger-derived /grade Cws
// score, not as a DESK_DONE row (per the incident brief: "worksheet LEDGER
// evidence exists for later lessons WITHOUT worksheet DESK_DONE rows"). So on
// a cold /grade cache, donow hydration ALONE is not sufficient to complete
// those lessons — the durable D3 latch (PROGRESS_RESET_FIX_SPEC.md), seeded
// by a prior live /grade success, is what closes this gap and survives the
// cold cache.
//
// Uses the real extracted _hydrateMarksFromDonow / _isLessonComplete /
// _isLessonUnlocked via composeOracles (JSDOM+vm, same template as
// tests/desk-calendar-sync.test.js).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { DESK, extractFn, composeOracles } from './fixtures/incident-progress-reset/oracles.js';
import { studentA, studentB } from './fixtures/incident-progress-reset/index.js';
import { createContext, runInContext } from 'vm';
import { JSDOM } from 'jsdom';

describe('INCIDENT I5 — donow hydration seeds only the reported artifacts (never worksheet for 1.2/1.3)', () => {
  it('hydrates 1.1 worksheet+blooket, but only blooket for 1.2/1.3 — worksheet marks stay undefined', () => {
    const o = composeOracles({ username: studentA.username });
    const changed = o.hydrateMarksFromDonow(studentA.donow);
    expect(changed).toBe(true);
    const marks = o.marksFor(studentA.email);

    expect(marks['1.1|worksheet'] && marks['1.1|worksheet'].ts).toBeTruthy();
    expect(marks['1.1|blooket'] && marks['1.1|blooket'].ts).toBeTruthy();
    expect(marks['1.2|blooket'] && marks['1.2|blooket'].ts).toBeTruthy();
    expect(marks['1.3|blooket'] && marks['1.3|blooket'].ts).toBeTruthy();
    // The asymmetry that drives the incident: no worksheet DESK_DONE row for
    // 1.2/1.3, even though the ledger has scored worksheet evidence for them.
    expect(marks['1.2|worksheet']).toBeUndefined();
    expect(marks['1.3|worksheet']).toBeUndefined();
  });

  it('FIXED: with the D3 latch seeded (as a prior live /grade success would leave it), donow hydration + the latch complete 1.2 and 1.3 for Student A on a cold cache', () => {
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    o.hydrateMarksFromDonow(studentA.donow);
    o.seedLatch({ '1.2': { ws: true }, '1.3': { ws: true } }); // the missing worksheet signal
    const marks = o.marksFor(studentA.email);
    // FIXED (was BUG pre-2026-07-21): _getCwsForTopic is still unreachable
    // (the in-memory cache is cold), but the durable latch supplies wsDone
    // for both lessons, so completion no longer depends on a warm cache.
    expect(o.isLessonComplete('1.2', marks)).toBe(true);
    expect(o.isLessonComplete('1.3', marks)).toBe(true);
  });

  it('FIXED: the next legit lesson UNLOCKS on donow hydration + the latch (cold cache) for both students', () => {
    const TODAY = new Date(2026, 6, 20);
    const PAST = new Date(2026, 6, 10);

    const oa = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    oa.hydrateMarksFromDonow(studentA.donow);
    oa.seedLatch({ '1.2': { ws: true }, '1.3': { ws: true } });
    const marksA = oa.marksFor(studentA.email);
    expect(oa.isLessonUnlocked(studentA.nextLegitLesson, PAST, '1.3', TODAY, marksA, true)).toBe(true);

    const ob = composeOracles({ username: studentB.username, studentId: 'sid-b' });
    ob.hydrateMarksFromDonow(studentB.donow);
    ob.seedLatch({ '1.2': { ws: true }, '1.3': { ws: true }, '1.4': { ws: true } });
    const marksB = ob.marksFor(studentB.email);
    expect(ob.isLessonUnlocked(studentB.nextLegitLesson, PAST, '1.4', TODAY, marksB, true)).toBe(true);
  });

  it('the fail-open gate (D4) alone — with NO latch and a cold cache — also unlocks, but for a different reason (indeterminate server state, not real evidence)', () => {
    // This is the safety net for the "render before /grade ever resolved"
    // case (Invariant 3): the server hasn't spoken at all yet, so the gate
    // must not strand the student, even without any latched evidence.
    const TODAY = new Date(2026, 6, 20);
    const PAST = new Date(2026, 6, 10);
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' }); // no seedLatch
    o.hydrateMarksFromDonow(studentA.donow);
    const marks = o.marksFor(studentA.email);
    expect(o.serverEvidencePresent()).toBe(false); // no evidence at all
    expect(o.isLessonUnlocked(studentA.nextLegitLesson, PAST, '1.3', TODAY, marks, true)).toBe(true); // fails open
  });
});

describe('INCIDENT I5 — regression guards on _hydrateMarksFromDonow (so the fixture never seeds the wrong bucket)', () => {
  function makeCtxWithViewAs(email, viewAsActive) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://desk.test' });
    const win = dom.window;
    win.getStudentEmail = () => email;
    win._viewAsContext = () => viewAsActive;
    const ctx = createContext(win);
    runInContext(extractFn(DESK, '_hydrateMarksFromDonow') + '\nwindow.__h = _hydrateMarksFromDonow;', ctx);
    return { win, hydrate: win.__h };
  }

  it('short-circuits false in view-as (never seeds the teacher\'s marks from a viewed student)', () => {
    const { hydrate } = makeCtxWithViewAs('teacher@roster.local', true);
    expect(hydrate(studentA.donow)).toBe(false);
  });

  it('short-circuits false with no email (signed out)', () => {
    const { hydrate } = makeCtxWithViewAs(null, false);
    expect(hydrate(studentA.donow)).toBe(false);
  });
});
