// desk-viewas-grade-cache.test.js — the offline grade cache must be LIVE-ONLY in
// view-as. Regression for the 2026-06-25 bug where a teacher viewing a student saw
// their OWN cached grades (the cache key fell back to the teacher's studentId on a
// slow/offline /teacher/student/:id/grade fetch). _gradeCacheKey() must return null
// whenever view-as is active (Desk _viewAsContext OR worksheet __VIEW_AS_STUDENT_ID__),
// so there is no write-through (no pollution) and no restore (numbers stay blank
// until the impersonated student's live data loads).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const KEY_SRC = fnBody(DESK, '_gradeCacheKey');

function gradeCacheKey({ vasContext = null, vasWorksheet = undefined, teacherSid = null }) {
  const rosterClient = { studentId: () => teacherSid };
  const windowStub = { __VIEW_AS_STUDENT_ID__: vasWorksheet, rosterClient };
  const _viewAsContext = () => vasContext;
  // eslint-disable-next-line no-new-func
  const run = new Function('window', '_viewAsContext', 'rosterClient',
    KEY_SRC + '\nreturn _gradeCacheKey();');
  return run(windowStub, _viewAsContext, rosterClient);
}

describe('_gradeCacheKey — live-only in view-as', () => {
  it('normal mode keys by the signed-in studentId', () => {
    expect(gradeCacheKey({ teacherSid: 'stu-123' })).toBe('a2_grade_cache_v1:stu-123');
  });

  it('Desk view-as (active _viewAsContext) returns null — no cache key', () => {
    expect(gradeCacheKey({ vasContext: { studentId: 'elmer-1' }, teacherSid: 'teacher-9' })).toBeNull();
  });

  it('worksheet view-as (__VIEW_AS_STUDENT_ID__) returns null — no cache key', () => {
    expect(gradeCacheKey({ vasWorksheet: 'elmer-1', teacherSid: 'teacher-9' })).toBeNull();
  });

  it('the source documents the view-as guard intent', () => {
    expect(KEY_SRC).toMatch(/_viewAsContext\(\)\)\s*return null/);
  });
});
