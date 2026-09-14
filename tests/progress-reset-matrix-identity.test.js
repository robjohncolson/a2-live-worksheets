// tests/progress-reset-matrix-identity.test.js — PROGRESS_RESET_FIX_SPEC.md
// §3 matrix rows for D6 (marks-bucket alias migration), D4 (render-before-
// resolve fail-open), D8 (view-as read-only), and the multi-tab / mobile-home
// non-regression rows that don't need a fresh harness.
//
// Reuses oracles.js's composeOracles (owned by Implementer A's inverted
// incident tests) unmodified, plus composeLatchHarness / makeFakeStorage
// from matrix-harness.js where the row needs the D3 write path or shared
// storage.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeOracles, marksKey } from './fixtures/incident-progress-reset/oracles.js';
import { composeLatchHarness, makeFakeStorage, DESK } from './fixtures/incident-progress-reset/matrix-harness.js';
import { studentA } from './fixtures/incident-progress-reset/index.js';

const TODAY = new Date(2026, 6, 20);
const PAST = new Date(2026, 6, 10);

describe('matrix row: identity transition legacy -> synthesized', () => {
  it('marks under the bare-username bucket are unioned into username@roster.local by _migrateMarksAliases', () => {
    const o = composeOracles({ username: 'student-a' }); // no legacyEmailKey -> synthesis path
    o.win.localStorage.setItem(marksKey('student-a'), JSON.stringify({ '1.2|worksheet': { ts: 'real-ts' } }));
    expect(o.migrateMarksAliases()).toBe(true);
    expect(o.marksFor('student-a@roster.local')['1.2|worksheet'].ts).toBe('real-ts');
  });

  it('_marksAliasKeys returns the ordered unique alias set for the current session', () => {
    const o = composeOracles({ username: 'student-a', legacyEmailKey: 'legacy@example.com' });
    expect(o.marksAliasKeys()).toEqual(['legacy@example.com', 'student-a', 'student-a@roster.local']);
  });

  it('_marksAliasKeys de-dupes when the legacy key equals the synthesized email', () => {
    const o = composeOracles({ username: 'student-a', legacyEmailKey: 'student-a@roster.local' });
    expect(o.marksAliasKeys()).toEqual(['student-a@roster.local', 'student-a']);
  });
});

describe('matrix row: legacy free-text email survives a sign-in overwrite (incident review H1 fix)', () => {
  // Every Desk sign-in tail overwrites 'a2_desk_student_email' with the
  // new roster username BEFORE calling _migrateMarksAliases (7176->7188 in
  // submitSignIn and mirrored in the other two tails). Without capturing the
  // PRIOR legacy value first, a genuine pre-roster free-text-email marks
  // bucket becomes permanently unreachable — _marksAliasKeys can only ever
  // see the CURRENT (already-overwritten) legacy key. The fix: capture the
  // prior value before the write and pass it through as _migrateMarksAliases'
  // optional extraLegacyKey argument.
  it('passing the captured prior legacy value recovers the pre-roster bucket', () => {
    const o = composeOracles({ username: 'student-a', legacyEmailKey: 'legacy@example.com' });
    o.win.localStorage.setItem(marksKey('legacy@example.com'), JSON.stringify({ '1.2|worksheet': { ts: 'pre-roster' } }));

    // Mirror the real sign-in tail: capture, THEN overwrite.
    const priorLegacy = o.win.localStorage.getItem('a2_desk_student_email');
    expect(priorLegacy).toBe('legacy@example.com');
    o.win.localStorage.setItem('a2_desk_student_email', 'student-a');

    expect(o.migrateMarksAliases(priorLegacy)).toBe(true);
    expect(o.marksFor('student-a')['1.2|worksheet'].ts).toBe('pre-roster');
  });

  it('regression pin: without the captured prior value, the overwritten legacy bucket is stranded', () => {
    const o = composeOracles({ username: 'student-a', legacyEmailKey: 'legacy@example.com' });
    o.win.localStorage.setItem(marksKey('legacy@example.com'), JSON.stringify({ '1.2|worksheet': { ts: 'pre-roster' } }));
    o.win.localStorage.setItem('a2_desk_student_email', 'student-a'); // overwrite, no capture
    expect(o.migrateMarksAliases()).toBe(false); // legacy@example.com is no longer reachable
    expect(o.marksFor('student-a')['1.2|worksheet']).toBeUndefined();
  });
});

describe('matrix row: guest -> roster (no cross-identity leak)', () => {
  it('migration only touches the CURRENT identity\'s aliases — a different student\'s bucket is never read', () => {
    const o = composeOracles({ username: 'student-a' });
    // A completely different student's bucket, sitting in the same localStorage
    // (shared device / browser profile scenario).
    o.win.localStorage.setItem(marksKey('student-b@roster.local'), JSON.stringify({ '1.2|worksheet': { ts: 'not-mine' } }));
    o.migrateMarksAliases();
    const myMarks = o.marksFor('student-a@roster.local');
    expect(myMarks['1.2|worksheet']).toBeUndefined(); // never pulled in
  });
});

describe('matrix row: additive union (existing primary entries win, alias bucket never deleted)', () => {
  it('a pre-existing primary entry is not overwritten; the alias bucket survives', () => {
    const o = composeOracles({ username: 'student-a' });
    const primaryKey = marksKey('student-a@roster.local');
    const aliasKey = marksKey('student-a');
    o.win.localStorage.setItem(primaryKey, JSON.stringify({ '1.2|worksheet': { ts: 'primary' } }));
    o.win.localStorage.setItem(aliasKey, JSON.stringify({ '1.2|worksheet': { ts: 'alias-loses' }, '1.3|blooket': { ts: 'alias-new' } }));
    o.migrateMarksAliases();
    const marks = o.marksFor('student-a@roster.local');
    expect(marks['1.2|worksheet'].ts).toBe('primary');
    expect(marks['1.3|blooket'].ts).toBe('alias-new');
    expect(JSON.parse(o.win.localStorage.getItem(aliasKey))['1.2|worksheet'].ts).toBe('alias-loses'); // alias untouched
  });
});

describe('matrix row: multi-tab storage events (localStorage is shared)', () => {
  it('a latch/marks write in "tab A" is visible to "tab B" via the shared backing store', () => {
    const shared = makeFakeStorage();
    const tabA = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', sharedStorage: shared });
    const tabB = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', sharedStorage: shared });

    tabA.latchServerComplete([{ lessonKey: '1.2', Cws: 79, blooket: 85 }]);
    expect(tabB.serverEvidencePresent()).toBe(true); // B sees A's write with no explicit hand-off
    expect(tabB.isLessonComplete('1.2', {})).toBe(true);
  });

  it('the real cross-tab storage handler is scoped to identity keys only — it never fires for evidence keys', () => {
    const start = DESK.indexOf("window.addEventListener('storage', function (_e) {");
    expect(start).toBeGreaterThan(-1);
    const region = DESK.slice(start, start + 500);
    expect(region).toMatch(/updateStudentMenu/); // what it DOES re-run
    expect(region).not.toMatch(/a2_server_complete_v1/); // never triggered by a latch write
    expect(region).not.toMatch(/a2_desk_marks_/);        // never triggered by a marks write
  });
});

describe('matrix row: render-before-resolve (no /grade has resolved yet)', () => {
  it('with _gradeLessonsCache null and no latch, the gate fails OPEN — never a false lock', () => {
    const o = composeOracles({ username: 'student-a', studentId: 'sid-a' });
    // No setGradeCache call, no seedLatch call — this IS the render-before-
    // resolve state (boot-time first paint, before /grade ever answers).
    expect(o.serverEvidencePresent()).toBe(false);
    expect(o.isLessonUnlocked(studentA.nextLegitLesson, PAST, '1.3', TODAY, {}, true)).toBe(true);
  });
});

describe('matrix row: view-as safety', () => {
  it('_migrateMarksAliases is a no-op under _viewAsContext (never writes the teacher bucket from a viewed student)', () => {
    const o = composeOracles({ username: 'teacher-t' });
    o.win._viewAsContext = () => ({ studentId: 'sid-viewed' }); // monkeypatch AFTER compose, BEFORE calling — the
    // extracted function looks up `_viewAsContext` as a free identifier at
    // CALL time, so this take effect exactly like the real Desk's global.
    o.win.localStorage.setItem(marksKey('teacher-t'), JSON.stringify({ '1.2|worksheet': { ts: 'x' } }));
    expect(o.migrateMarksAliases()).toBe(false);
    expect(o.marksFor('teacher-t@roster.local')).toEqual({});
  });

  it('_serverCompleteKey resolves null under view-as, mirroring _gradeCacheKey (D3/D8)', () => {
    const o = composeOracles({ username: 'student-a', studentId: 'sid-a' });
    o.win._viewAsContext = () => ({ studentId: 'sid-a' });
    expect(o.win.__serverCompleteKey()).toBeNull();
    expect(o.serverCompleteFor('1.2')).toEqual({ ws: false, bl: false });
  });

  it('_latchServerComplete no-ops entirely under view-as (D8: no persistence of any kind)', () => {
    const o = composeLatchHarness({ username: 'student-a', studentId: 'sid-a', viewAs: true });
    o.latchServerComplete([{ lessonKey: '1.2', Cws: 95, blooket: 95 }]);
    expect(o.win.localStorage.getItem('a2_server_complete_v1:sid-a')).toBeNull();
  });
});

describe('matrix row: mobile-home non-regression', () => {
  it('mobile-home.html does not reference any of this fix\'s new symbols — scope stays the Desk file', () => {
    const path = resolve(import.meta.dirname, '..', 'mobile-home.html');
    const src = readFileSync(path, 'utf8');
    for (const sym of ['_latchServerComplete', '_serverCompleteFor', '_renderGradeStatus', '_migrateMarksAliases', '_serverEvidencePresent', '_serverCompleteKey']) {
      expect(src).not.toContain(sym);
    }
  });
});
