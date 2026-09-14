// tests/incident-progress-reset-cache-relock.test.js — INCIDENT I5 repro (Lane
// I5b), bug (a): renderDoNowGrades used to treat an HTTP-error /grade response
// (401/500) as neither "live" nor "offline", so it silently returned with
// _gradeLessonsCache left at its cold (null) default — no error UI, no
// offline-cache restore. Every downstream oracle that reads the synced
// ledger (_getCwsForTopic / _blooketScoreFor via _isLessonComplete /
// _isLessonUnlocked / localLessonState) then saw "no synced evidence",
// which relocked any lesson whose only completion signal was server-side
// (ledger Cws with no matching worksheet DESK_DONE row — exactly Student
// A/B's asymmetry per the incident brief).
//
// PROGRESS_RESET_FIX_SPEC.md (2026-07-21) fixes this with a tri-state load
// state (D1) that classifies EVERY failure kind (not just a thrown fetch),
// runs the evidence-restore branch on all of them (D2), and — the durable
// core — a per-student server-completion latch (D3) that survives a cold
// cache entirely, plus a fail-open gate (D4) for indeterminate server state.
//
// Part 1: SOURCE PINS on renderDoNowGrades proving the FIXED branch shape.
// Part 2: BEHAVIORAL — the real extracted oracles (composeOracles) with the
// D3 latch seeded (as a prior live /grade success would have written it),
// showing completion now survives a cold _gradeLessonsCache.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { DESK, extractFn } from './fixtures/incident-progress-reset/oracles.js';
import { composeOracles } from './fixtures/incident-progress-reset/oracles.js';
import { studentA } from './fixtures/incident-progress-reset/index.js';

describe('PROGRESS_RESET_FIX_SPEC — renderDoNowGrades: every failure kind is classified + restored (source pins)', () => {
  const body = extractFn(DESK, 'renderDoNowGrades');

  it('classifies 401/403 as auth, other non-ok as server, and a null/thrown fetch as network', () => {
    expect(body).toMatch(/_gradeLoadState = 'unavailable'; _gradeLoadError = \{ kind: 'network', status: null \}/);
    expect(body).toMatch(/res\.status === 401 \|\| res\.status === 403/);
    expect(body).toMatch(/kind: 'auth', status: res\.status/);
    expect(body).toMatch(/kind: 'server', status: res\.status/);
  });

  it('the evidence-restore branch runs on ANY unavailable classification, not just a thrown fetch', () => {
    // D2: gated on _gradeLoadState === 'unavailable' (every kind), not a
    // network-only flag like the old _gradeOffline.
    expect(body).toMatch(/else if \(_gradeLoadState === 'unavailable'\)/);
    expect(body).toMatch(/_phase2ReDeriveGrade\(\)\)\s*\|\|\s*_loadGradeCache\(\)/);
    expect(body).not.toMatch(/_gradeOffline/); // the old network-only flag is gone
  });

  it('a live success latches durable server-completion (D3) — never from restored/derived data', () => {
    expect(body).toMatch(/_latchServerComplete\s*\(\s*data\.lessons\s*\)/);
    // The latch call sits inside the `if (data)` (live-success) branch, not
    // the `else if` (restore) branch below it.
    const liveIdx = body.indexOf('if (data) {');
    const latchIdx = body.indexOf('_latchServerComplete(');
    const restoreIdx = body.indexOf("else if (_gradeLoadState === 'unavailable')");
    expect(liveIdx).toBeGreaterThan(-1);
    expect(latchIdx).toBeGreaterThan(liveIdx);
    expect(latchIdx).toBeLessThan(restoreIdx);
  });

  it('the honest-unknown path renders the status banner + rProg BEFORE the silent bail (no more silent return)', () => {
    const idxStatus = body.indexOf("if (typeof _renderGradeStatus === 'function') _renderGradeStatus();");
    const idxReturn = body.indexOf('if (!data) {');
    const idxAssign = body.indexOf('_gradeLessonsCache = Array.isArray');
    expect(idxStatus).toBeGreaterThan(-1);
    expect(idxReturn).toBeGreaterThan(-1);
    expect(idxAssign).toBeGreaterThan(-1);
    // The status render + honest-unknown block both precede the (still cold)
    // cache assignment — no data means no cache mutation either way.
    expect(idxStatus).toBeLessThan(idxReturn);
    expect(idxReturn).toBeLessThan(idxAssign);
  });
});

describe('PROGRESS_RESET_FIX_SPEC — the D3 latch keeps completion durable on a cold cache', () => {
  it('FIXED: _isLessonComplete("1.2") is true on a cold cache once the latch is seeded (as a prior live /grade would)', () => {
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    o.hydrateMarksFromDonow(studentA.donow); // seeds 1.1 ws+bl, 1.2 bl, 1.3 bl marks
    // Seed the latch the way a PRIOR successful /grade (before the cache went
    // cold — e.g. a fresh tab, a cleared _gradeLessonsCache) would have left it.
    o.seedLatch({ '1.1': { ws: true, bl: true }, '1.2': { ws: true, bl: true }, '1.3': { ws: true, bl: true } });
    const marks = o.marksFor(studentA.email);
    // FIXED (was BUG pre-2026-07-21): the cache is still cold (_gradeLessonsCache
    // stays null — no restore ran in this unit), but the durable latch alone
    // supplies wsDone, so 1.2 now reads complete.
    expect(o.isLessonComplete('1.2', marks)).toBe(true);
  });

  it('FIXED: the next legit lesson (1.4) is UNLOCKED for Student A on a cold cache once the latch is seeded', () => {
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    o.hydrateMarksFromDonow(studentA.donow);
    o.seedLatch({ '1.1': { ws: true, bl: true }, '1.2': { ws: true, bl: true }, '1.3': { ws: true, bl: true } });
    const marks = o.marksFor(studentA.email);
    const TODAY = new Date(2026, 6, 20);
    const PAST = new Date(2026, 6, 10);
    // FIXED: 1.3 (the predecessor of 1.4) now reads complete from the latch,
    // so the sequential gate unlocks 1.4 — the incident's lockout half, fixed.
    expect(o.isLessonUnlocked(studentA.nextLegitLesson, PAST, '1.3', TODAY, marks, true)).toBe(true);
  });

  it('FIXED (rProg proxy): "N of M lessons done" now counts all 3 latched lessons, not just the donow-hydrated one', () => {
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    o.hydrateMarksFromDonow(studentA.donow);
    o.seedLatch({ '1.1': { ws: true, bl: true }, '1.2': { ws: true, bl: true }, '1.3': { ws: true, bl: true } });
    const marks = o.marksFor(studentA.email);
    const doneCount = studentA.orderedTopics.filter((t) => o.localLessonState(t, marks) === 'done').length;
    // FIXED: 1.1 (donow ws+bl), 1.2 and 1.3 (latch supplies the missing ws
    // signal) all read 'done' — the actual amount of completed work.
    expect(doneCount).toBe(3);
  });

  it('the fail-open gate (D4) is a SEPARATE safety net for when there is no evidence at all — not needed here', () => {
    // With the latch seeded, _serverEvidencePresent() is already true, so
    // D4's fail-open never triggers for this fixture — the strict gate is
    // satisfied on real (latched) evidence, not by falling open blindly.
    const o = composeOracles({ username: studentA.username, studentId: 'sid-a' });
    o.seedLatch({ '1.1': { ws: true, bl: true }, '1.2': { ws: true, bl: true }, '1.3': { ws: true, bl: true } });
    expect(o.serverEvidencePresent()).toBe(true);
  });
});
