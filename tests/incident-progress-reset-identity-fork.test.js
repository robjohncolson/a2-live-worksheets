// tests/incident-progress-reset-identity-fork.test.js — INCIDENT I5 repro
// (Lane I5b), bug (b): getStudentEmail() (L4989) forks between a legacy
// free-text localStorage key ('a2_desk_student_email', bare username)
// and a SYNTHESIZED key (rosterClient.username + '@roster.local'). Any local
// marks written under one identity used to be invisible to code reading the
// other — the local marks bucket is 'a2_desk_marks_' + getStudentEmail()
// (L5011). If a student's browser ever held marks under the bare-username
// form (an older build, or a manual localStorage edit) and a later build only
// takes the synthesized-email path, previously-Done lessons silently
// relocked even though nothing was deleted — the data just became
// unreachable under the new key.
//
// PROGRESS_RESET_FIX_SPEC.md D6 fixes this with `_migrateMarksAliases()`: a
// one-time-per-identity, additive union of every alias marks bucket into the
// CURRENT identity's primary bucket. Existing entries always win; nothing is
// ever deleted.
//
// Uses the real extracted getStudentEmail + _migrateMarksAliases via
// composeOracles (same JSDOM+vm sandbox as tests/desk-calendar-sync.test.js's
// makeCtx template).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { composeOracles, marksKey } from './fixtures/incident-progress-reset/oracles.js';
import { studentA } from './fixtures/incident-progress-reset/index.js';

describe('INCIDENT I5 — getStudentEmail synthesis (no legacy key)', () => {
  it('synthesizes username@roster.local from rosterClient.current() (L5001-5003)', () => {
    const o = composeOracles({ username: studentA.username });
    expect(o.getStudentEmail()).toBe(studentA.email);
  });
});

describe('PROGRESS_RESET_FIX_SPEC D6 — _migrateMarksAliases unions a bare-username bucket into the synthesized-email identity', () => {
  it('FIXED: marks pre-seeded under "a2_desk_marks_student-a" are unioned into the synthesized bucket after migration', () => {
    const o = composeOracles({ username: studentA.username }); // no legacyEmailKey → synthesis path
    // Simulates local Done marks that were written under the BARE-username
    // key (the fork) — e.g. an older Desk build, or a device that never held
    // the legacy 'a2_desk_student_email' key.
    const bareBucket = marksKey(studentA.username); // 'a2_desk_marks_student-a'
    o.win.localStorage.setItem(bareBucket, JSON.stringify({
      '1.2|worksheet': { ts: 'real-ts' },
      '1.2|blooket': { ts: 'real-ts' },
    }));

    const email = o.getStudentEmail();
    expect(email).toBe(studentA.email); // synthesis path, NOT the bare key

    const changed = o.migrateMarksAliases();
    expect(changed).toBe(true);

    const synthesizedMarks = o.marksFor(email);
    const bareMarks = JSON.parse(o.win.localStorage.getItem(bareBucket));

    // FIXED (was BUG pre-2026-07-21): the marks are now visible under the
    // identity the gate actually reads, AND the alias bucket is untouched
    // (never deleted — additive union only).
    expect(synthesizedMarks['1.2|worksheet'].ts).toBe('real-ts');
    expect(synthesizedMarks['1.2|blooket'].ts).toBe('real-ts');
    expect(bareMarks['1.2|worksheet'].ts).toBe('real-ts'); // alias bucket preserved
  });

  it('FIXED: _isLessonComplete("1.2") reads complete once the migration has unioned the bare-username bucket', () => {
    const o = composeOracles({ username: studentA.username });
    const bareBucket = marksKey(studentA.username);
    o.win.localStorage.setItem(bareBucket, JSON.stringify({
      '1.2|worksheet': { ts: 'real-ts' },
      '1.2|blooket': { ts: 'real-ts' },
    }));
    o.migrateMarksAliases();
    const email = o.getStudentEmail();
    const marksAsGateSeesThem = o.marksFor(email); // now populated by the migration
    // Cold cache too (no /grade evidence) — the migration ALONE (no latch
    // needed) restores completion, because the local marks were real all along.
    expect(o.isLessonComplete('1.2', marksAsGateSeesThem)).toBe(true);
  });

  it('additive safety: a pre-existing entry in the primary bucket is NOT overwritten by the alias union', () => {
    const o = composeOracles({ username: studentA.username });
    const email = studentA.email; // synthesized identity
    const primaryBucket = marksKey(email);
    const bareBucket = marksKey(studentA.username);
    // Primary already has its OWN (different) entry for 1.2|worksheet.
    o.win.localStorage.setItem(primaryBucket, JSON.stringify({
      '1.2|worksheet': { ts: 'primary-ts' },
    }));
    // The alias bucket has a DIFFERENT value for the same key, plus a new key.
    o.win.localStorage.setItem(bareBucket, JSON.stringify({
      '1.2|worksheet': { ts: 'alias-ts-should-not-win' },
      '1.3|blooket': { ts: 'alias-ts-new-key' },
    }));

    o.migrateMarksAliases();
    const marks = o.marksFor(email);

    expect(marks['1.2|worksheet'].ts).toBe('primary-ts'); // existing wins, never overwritten
    expect(marks['1.3|blooket'].ts).toBe('alias-ts-new-key'); // new key still unioned in
  });

  it('idempotent: a second call within the same identity is a no-op (per-identity-per-load guard)', () => {
    const o = composeOracles({ username: studentA.username });
    const bareBucket = marksKey(studentA.username);
    o.win.localStorage.setItem(bareBucket, JSON.stringify({ '1.2|worksheet': { ts: 'real-ts' } }));

    expect(o.migrateMarksAliases()).toBe(true);  // first call migrates
    expect(o.migrateMarksAliases()).toBe(false); // second call for the SAME identity is a no-op
  });
});

describe('INCIDENT I5 — CONTROL: legacy key present → marks were never lost, only mis-addressed', () => {
  it('when getStudentEmail resolves the SAME identity the marks were written under, completion is restored', () => {
    // L4998-4999: the legacy 'a2_desk_student_email' key short-circuits
    // getStudentEmail before the synthesis path ever runs. Seed it with the
    // SAME value the marks bucket below is keyed on.
    const o = composeOracles({ username: studentA.username, legacyEmailKey: studentA.email });
    const matchedBucket = marksKey(studentA.email);
    o.win.localStorage.setItem(matchedBucket, JSON.stringify({
      '1.2|worksheet': { ts: 'real-ts' },
      '1.2|blooket': { ts: 'real-ts' },
    }));

    const email = o.getStudentEmail();
    expect(email).toBe(studentA.email); // legacy short-circuit, matches the seeded bucket
    const marks = o.marksFor(email);
    expect(o.isLessonComplete('1.2', marks)).toBe(true); // proves the data was intact all along
  });
});
