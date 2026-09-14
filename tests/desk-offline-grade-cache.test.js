/**
 * OFFLINE_MODE_SPEC §4.B — offline progress cache contract pins.
 * Source-level checks (matching the desk-grade-outlook fnBody style) that the
 * /grade write-through + offline restore is wired correctly and stays additive.
 *
 * PROGRESS_RESET_FIX_SPEC.md (2026-07-21) rewrote renderDoNowGrades's failure
 * handling (D1/D2): every HTTP-error kind (401/403 auth, other non-ok/{ok:false}/
 * malformed-JSON server, thrown/unreachable network) now runs the same
 * evidence-restore branch — not just a thrown fetch. The pins below were
 * updated to match; see incident-progress-reset-cache-relock.test.js for the
 * INCIDENT I5 regression coverage this rewrite fixes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DESK = readFileSync(resolve(import.meta.dirname, '..', 'desk.html'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf('function ' + name);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('could not extract ' + name);
}

describe('offline grade cache helpers', () => {
  it('defines the three cache helpers', () => {
    expect(DESK).toMatch(/function _gradeCacheKey\s*\(/);
    expect(DESK).toMatch(/function _persistGradeCache\s*\(/);
    expect(DESK).toMatch(/function _loadGradeCache\s*\(/);
  });

  it('keys the cache by signed-in studentId and NEVER caches in view-as', () => {
    const body = fnBody(DESK, '_gradeCacheKey');
    expect(body).toContain('__VIEW_AS_STUDENT_ID__'); // view-as → null key
    expect(body).toContain('return null');
    expect(body).toContain('rosterClient.studentId');
    expect(body).toContain('a2_grade_cache_v1:'); // studentId-scoped (no cross-student leak)
  });

  it('persist write-through and load restore are localStorage-backed + fail-safe', () => {
    expect(fnBody(DESK, '_persistGradeCache')).toMatch(/localStorage\.setItem/);
    expect(fnBody(DESK, '_loadGradeCache')).toMatch(/localStorage\.getItem/);
    // both wrapped so a storage error never breaks the grade path
    expect(fnBody(DESK, '_persistGradeCache')).toContain('catch');
    expect(fnBody(DESK, '_loadGradeCache')).toContain('catch');
  });
});

describe('renderDoNowGrades offline behavior', () => {
  const body = fnBody(DESK, 'renderDoNowGrades');

  it('write-through caches a live /grade payload', () => {
    expect(body).toContain('_persistGradeCache(data)');
  });

  it('restores from cache on EVERY failure kind (auth/server/network), not just a thrown fetch', () => {
    // PROGRESS_RESET_FIX_SPEC D1/D2: a thrown/unreachable fetch, a 401/403, and
    // any other non-ok response all set _gradeLoadState = 'unavailable'.
    expect(body).toMatch(/catch \(_\) \{ _gradeLoadState = 'unavailable'; _gradeLoadError = \{ kind: 'network', status: null \}; \}/);
    expect(body).toMatch(/res\.status === 401 \|\| res\.status === 403/);
    // restore gated on the unified 'unavailable' state (ANDROID Phase 2: re-derive
    // from the local signed ledger first, falling back to the last cached /grade payload)
    expect(body).toMatch(/else if \(_gradeLoadState === 'unavailable'\)/);
    expect(body).toMatch(/_phase2ReDeriveGrade\(\)\)\s*\|\|\s*_loadGradeCache\(\)/);
  });

  it('still bails (honestly) when there is neither a live nor a cached payload', () => {
    // D5: the silent `if (!data) return;` was replaced with a block that
    // paints the honest-unknown rProg label before returning.
    expect(body).toMatch(/if \(!data\) \{/);
    expect(body).toMatch(/if \(typeof rProg === 'function'\) rProg\(\);/);
  });
});
