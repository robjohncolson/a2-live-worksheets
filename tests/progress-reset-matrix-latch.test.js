// tests/progress-reset-matrix-latch.test.js — PROGRESS_RESET_FIX_SPEC.md §3
// matrix rows for the D3 durable server-completion latch (the fix's durable
// core) + D4 fail-open + D6 alias migration, using the REAL extracted
// _latchServerComplete WRITE path (composeLatchHarness), not just the
// localStorage shape seeded directly.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { composeLatchHarness, makeFakeStorage, DESK } from './fixtures/incident-progress-reset/matrix-harness.js';
import { composeOracles } from './fixtures/incident-progress-reset/oracles.js';
import { studentA } from './fixtures/incident-progress-reset/index.js';

const TODAY = new Date(2026, 6, 20);
const PAST = new Date(2026, 6, 10);

describe('matrix row: affected-account shape (ledger Cws>=60, no worksheet DESK_DONE row)', () => {
  it('_latchServerComplete from a live payload sets ws:true, and _isLessonComplete completes on a COLD cache', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    expect(o.serverEvidencePresent()).toBe(false); // nothing latched yet

    // A live /grade success for 1.2: Cws clears the worksheet gate, blooket
    // clears the blooket gate — exactly the "ledger-only, no DESK_DONE row"
    // shape the incident brief describes.
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);

    expect(o.serverCompleteFor('1.2')).toEqual({ ws: true, bl: true });
    // Cold cache: _gradeLessonsCache was never warmed (no setGradeCache call).
    expect(o.isLessonComplete('1.2', {})).toBe(true);
  });
});

describe('matrix row: fresh device (no local marks; live /grade writes the latch; durable on a cold cache)', () => {
  it('completion survives a subsequent cold-cache read on the same device (Invariant 4)', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    // Zero local marks anywhere — a brand-new device/browser profile.
    expect(o.marksFor(o.getStudentEmail())).toEqual({});

    o.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);

    // First read.
    expect(o.isLessonComplete('1.2', {})).toBe(true);
    // Second, independent read — the in-memory _gradeLessonsCache is STILL
    // cold (nothing ever warmed it this session); only the durable
    // localStorage latch supplies the evidence both times.
    expect(o.isLessonComplete('1.2', {})).toBe(true);
  });
});

describe('matrix row: cleared storage (latch + cache both erased)', () => {
  it('_serverEvidencePresent is false, and the gate fails OPEN rather than relocking', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    // Nothing seeded — the "cleared" state.
    expect(o.serverEvidencePresent()).toBe(false);
    expect(o.isLessonUnlocked('1.4', PAST, '1.3', TODAY, {}, true)).toBe(true); // fail open, not stranded
  });
});

describe('matrix row: wrong-user cache (a latch keyed to a DIFFERENT studentId is ignored)', () => {
  it('serverCompleteFor never reads a foreign studentId key', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', origin: 'https://roster.test' });
    // Write directly under a DIFFERENT student's key — simulates a shared
    // device / browser profile mixing two students' localStorage.
    o.win.localStorage.setItem(
      'a2_server_complete_v1:sid-other',
      JSON.stringify({ v: 1, origin: 'https://roster.test', updatedAt: new Date().toISOString(), topics: { '1.2': { ws: true, bl: true } } })
    );
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: false, bl: false }); // never a false-credit
    expect(o.serverEvidencePresent()).toBe(false); // the foreign key doesn't count as evidence either
  });
});

describe('matrix row: wrong-backend cache (origin mismatch is rejected as evidence, never deleted)', () => {
  it('a latch written against a different roster-server origin is ignored but left on disk (Invariant 7)', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', origin: 'https://roster-prod.test' });
    const key = 'a2_server_complete_v1:sid-a';
    o.win.localStorage.setItem(key, JSON.stringify({
      v: 1, origin: 'https://roster-OLD-staging.test', updatedAt: new Date().toISOString(), topics: { '1.2': { ws: true, bl: true } },
    }));
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: false, bl: false });
    expect(o.win.localStorage.getItem(key)).not.toBeNull(); // never erased
    expect(JSON.parse(o.win.localStorage.getItem(key)).origin).toBe('https://roster-OLD-staging.test'); // untouched
  });

  it('a grade-cache envelope written against a different origin is rejected but left on disk', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', origin: 'https://roster-prod.test' });
    const key = 'a2_grade_cache_v1:sid-a';
    o.win.localStorage.setItem(key, JSON.stringify({
      v: 2, origin: 'https://roster-OLD-staging.test', savedAt: new Date().toISOString(), data: { ok: true, lessons: [] },
    }));
    expect(o.loadGradeCache()).toBeNull();
    expect(o.win.localStorage.getItem(key)).not.toBeNull();
  });
});

describe('matrix row: partial DESK_DONE hydration (donow gives blooket only; the latch supplies the missing worksheet signal)', () => {
  it('the real _latchServerComplete write closes the incident\'s core asymmetry for Student A', () => {
    const o = composeLatchHarness({ username: studentA.username, studentId: 'sid-a' });
    o.hydrateMarksFromDonow(studentA.donow); // seeds 1.1 ws+bl, 1.2/1.3 bl-only
    let marks = o.marksFor(studentA.email);
    expect(marks['1.2|worksheet']).toBeUndefined(); // the gap

    o.latchServerComplete([{ lessonKey: '1.2', Cws: 79 }]); // ledger worksheet evidence, no blooket field
    marks = o.marksFor(studentA.email); // hydration wrote marks; re-read is unaffected by the latch call
    expect(o.isLessonComplete('1.2', marks)).toBe(true); // donow bl + latch ws together satisfy both gates
  });
});

describe('matrix row: refresh idempotency / monotonic latch', () => {
  it('a later payload that OMITS a previously-latched topic does not clear it', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: true, bl: true });

    o.latchServerComplete([{ lessonKey: '1.3', Cws: 70, blooket: 82 }]); // 1.2 not present in this payload
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: true, bl: true }); // still true, not cleared
    expect(o.serverCompleteFor('1.3')).toEqual({ ws: true, bl: true }); // and the new topic is added
  });

  it('a later payload reporting a LOWER score for the same topic never clears the already-true flags', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 10, blooket: 5 }]); // e.g. a re-grade / correction below gate
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: true, bl: true }); // monotonic: only ever adds
  });

  it('_migrateMarksAliases is idempotent — a second call for the same identity is a no-op', () => {
    const o = composeOracles({ username: 'student-a' });
    o.win.localStorage.setItem('a2_desk_marks_student-a', JSON.stringify({ '1.2|worksheet': { ts: 'x' } }));
    expect(o.migrateMarksAliases()).toBe(true);
    expect(o.migrateMarksAliases()).toBe(false);
  });
});

describe('matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED', () => {
  it('D4 fail-open never leaks into the affirmative-server case', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a' });
    // Evidence IS present (the server has spoken for 1.1), but the immediate
    // predecessor of the target lesson (1.3) has NO evidence at all.
    o.latchServerComplete([{ lessonKey: '1.1', Cws: 90, blooket: 95 }]);
    expect(o.serverEvidencePresent()).toBe(true);
    expect(o.isLessonComplete('1.3', {})).toBe(false); // genuinely incomplete
    expect(o.isLessonUnlocked('1.4', PAST, '1.3', TODAY, {}, true)).toBe(false); // strict gate holds
  });
});

describe('matrix row: view-as read-only (D8)', () => {
  it('_serverCompleteKey is null, _latchServerComplete no-ops, _serverCompleteFor fails closed', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', viewAs: true });
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 90, blooket: 90 }]);
    expect(o.win.localStorage.getItem('a2_server_complete_v1:sid-a')).toBeNull(); // no write happened
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: false, bl: false });
  });

  it('_migrateMarksAliases is a no-op under view-as (never writes the teacher bucket from a viewed student)', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', viewAs: true });
    o.win.localStorage.setItem('a2_desk_marks_student-a', JSON.stringify({ '1.2|worksheet': { ts: 'x' } }));
    expect(o.migrateMarksAliases()).toBe(false);
    expect(o.marksFor(o.getStudentEmail())).toEqual({});
  });
});

describe('matrix row: multi-tab storage sharing (the actual mechanism)', () => {
  it('a latch written in "tab A" is visible to "tab B" via the shared localStorage backing', () => {
    const shared = makeFakeStorage();
    const tabA = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', sharedStorage: shared });
    const tabB = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', sharedStorage: shared });

    tabA.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);
    expect(tabB.serverCompleteFor('1.2')).toEqual({ ws: true, bl: true }); // B sees A's write with no explicit sync

    tabA.hydrateMarksFromDonow(studentA.donow);
    const marksInB = tabB.marksFor(tabB.getStudentEmail());
    expect(marksInB['1.1|worksheet']).toBeTruthy(); // marks are shared the same way
  });

  it('the real cross-tab storage listener only re-renders on identity keys, never on latch/marks/grade-cache keys', () => {
    // Source pin (deliberate scope decision — this listener isn't part of the
    // extracted oracle set, so this is verified at the source level rather
    // than instantiated): confirms the ONE thing that matters for "without
    // corrupting evidence" — the handler doesn't even fire for the keys this
    // fix writes, so there is no code path where re-running updateStudentMenu
    // could touch a2_server_complete_v1:*/a2_desk_marks_*/
    // a2_grade_cache_v1:*.
    const start = DESK.indexOf("window.addEventListener('storage', function (_e) {");
    const region = DESK.slice(start, start + 500);
    expect(region).toMatch(/a2_roster\.v1/);
    expect(region).toMatch(/a2_user_role/);
    expect(region).toMatch(/a2_guest_active/);
    expect(region).not.toMatch(/a2_server_complete_v1/);
    expect(region).not.toMatch(/a2_desk_marks_/);
    expect(region).not.toMatch(/a2_grade_cache_v1/);
  });
});
