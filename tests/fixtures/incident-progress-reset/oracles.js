// tests/fixtures/incident-progress-reset/oracles.js
//
// Shared harness for the INCIDENT I5 repro suite. Extracts the REAL gate
// functions out of desk.html (same brace-matching
// idiom as tests/desk-calendar-sync.test.js's `extractFn` / tests/calendar-
// polish.test.js's `fnBody`) and composes them into ONE JSDOM+vm sandbox so
// they share the same module-level `_gradeLessonsCache` variable and the
// same real `localStorage` the way the live Desk page does.
//
// Functions composed (all real, unmodified source pulled from the HTML):
//   - getStudentEmail            (L4989)
//   - _hydrateMarksFromDonow     (L5023)
//   - localLessonState           (L5072)
//   - _isLessonComplete          (L6320)
//   - _isLessonUnlocked          (L6404)
//   - _getCwsForTopic            (L6498)
//   - _blooketScoreFor           (L6516)
//
// PROGRESS_RESET_FIX_SPEC (2026-07-21 durable fix) additions:
//   - _marksAliasKeys / _migrateMarksAliases (D6 identity-fork migration)
//   - _serverCompleteKey / _serverCompleteFor / _serverEvidencePresent (D3/D4
//     durable server-completion latch — the fix's durable core). Composed
//     unconditionally (every composeOracles call gets them), which is safe for
//     the CONTROL suite (incident-progress-reset-warm-control.test.js): with no
//     latch seeded, _serverCompleteFor fails closed ({ws:false,bl:false}) and
//     _serverEvidencePresent mirrors the prior cold/warm _gradeLessonsCache
//     signal, so the control's CANARY (cold vs warm disagree) is unaffected.
//
// Stubbed collaborators (typeof-guarded or required by signature, matching
// the injection style of tests/desk-lesson-gate.test.js / calendar-
// polish.test.js C5b):
//   - getRegistryEntry(topic) -> every 'N.N' topic has BOTH a worksheet and
//     a blooket resource (matches the real U1 registry shape for 1.1-1.5).
//   - DESK_WORKSHEET_DONE_THRESHOLD = 60 (real constant, L6438 area / desk-
//     calendar-sync.test.js pin).
//   - _deskIsTeacher() -> false (student-only fixture; no lesson_unlock
//     override helpers are injected, so _isLessonUnlocked's typeof-guarded
//     _isTopicLessonUnlocked branch is skipped, same as production when
//     no override has been fetched).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

export function extractFn(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}

export const marksKey = (email) => 'a2_desk_marks_' + email;

// Builds one JSDOM+vm sandbox with all seven real oracles composed together,
// sharing a single `_gradeLessonsCache` (starts null == cold, matching the
// real module-level default at renderDoNowGrades's home scope).
//
// opts.username — what window.rosterClient.current() returns (drives the
//   real getStudentEmail() synthesis path, L5001-5003).
// opts.legacyEmailKey — if set, pre-seeds the legacy
//   'a2_desk_student_email' localStorage key (the L4998 short-circuit)
//   BEFORE getStudentEmail's synthesis path is ever consulted.
// opts.studentId — what window.rosterClient.studentId() returns (drives
//   _gradeCacheKey/_serverCompleteKey — PROGRESS_RESET_FIX_SPEC D3). Defaults
//   to opts.username when omitted (convenient default identity for the latch).
// opts.origin — what window.ROSTER_SERVICE_URL resolves to (drives the D2/D3
//   envelope origin check). Left undefined (-> '') when omitted.
export function composeOracles(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://desk.test' });
  const win = dom.window;

  win.rosterClient = {
    current: () => (opts.username ? { username: opts.username } : null),
    studentId: () => (opts.studentId !== undefined ? opts.studentId : (opts.username || null)),
  };
  if (opts.origin !== undefined) win.ROSTER_SERVICE_URL = opts.origin;
  if (opts.legacyEmailKey) {
    win.localStorage.setItem('a2_desk_student_email', opts.legacyEmailKey);
  }

  const ctx = createContext(win);

  const script = [
    // Stubs (student-only fixture: every 'N.N' dot-topic has both a
    // worksheet and a blooket resource, matching the real U1 registry).
    "function getRegistryEntry(t){",
    "  if (t && /^\\d+\\.\\d+$/.test(t)) return { urls: { worksheet: 'w', blooket: 'b' } };",
    "  return { urls: {} };",
    "}",
    "var DESK_WORKSHEET_DONE_THRESHOLD = 60;",
    "function _deskIsTeacher(){ return false; }",
    "var _gradeLessonsCache = null;", // cold by default; tests set window._gradeLessonsCache to warm
    "var _marksAliasMigratedFor = null;", // PROGRESS_RESET_FIX_SPEC D6 per-identity-per-load guard
    // Real extracted source, unmodified.
    extractFn(DESK, 'getStudentEmail'),
    extractFn(DESK, '_hydrateMarksFromDonow'),
    extractFn(DESK, 'localLessonState'),
    extractFn(DESK, '_getCwsForTopic'),
    extractFn(DESK, '_blooketScoreFor'),
    extractFn(DESK, '_marksAliasKeys'),
    extractFn(DESK, '_migrateMarksAliases'),
    extractFn(DESK, '_serverCompleteKey'),
    extractFn(DESK, '_serverCompleteFor'),
    extractFn(DESK, '_serverEvidencePresent'),
    extractFn(DESK, '_isLessonComplete'),
    extractFn(DESK, '_isLessonUnlocked'),
    // Export handles onto window for the test to call.
    "window.__isLessonComplete = _isLessonComplete;",
    "window.__isLessonUnlocked = _isLessonUnlocked;",
    "window.__hydrateMarksFromDonow = _hydrateMarksFromDonow;",
    "window.__localLessonState = localLessonState;",
    "window.__getStudentEmail = getStudentEmail;",
    "window.__serverCompleteFor = _serverCompleteFor;",
    "window.__serverEvidencePresent = _serverEvidencePresent;",
    "window.__migrateMarksAliases = _migrateMarksAliases;",
    "window.__marksAliasKeys = _marksAliasKeys;",
    "window.__serverCompleteKey = _serverCompleteKey;",
  ].join('\n');

  runInContext(script, ctx);

  return {
    win,
    isLessonComplete: win.__isLessonComplete,
    isLessonUnlocked: win.__isLessonUnlocked,
    hydrateMarksFromDonow: win.__hydrateMarksFromDonow,
    localLessonState: win.__localLessonState,
    getStudentEmail: win.__getStudentEmail,
    serverCompleteFor: win.__serverCompleteFor,
    serverEvidencePresent: win.__serverEvidencePresent,
    migrateMarksAliases: win.__migrateMarksAliases,
    marksAliasKeys: win.__marksAliasKeys,
    // Warms/cools the shared _gradeLessonsCache the same way
    // renderDoNowGrades does at L8453 (`_gradeLessonsCache = data.lessons`).
    setGradeCache(lessons) { win._gradeLessonsCache = lessons || null; },
    marksFor(email) {
      try { return JSON.parse(win.localStorage.getItem(marksKey(email)) || '{}'); }
      catch (_) { return {}; }
    },
    // PROGRESS_RESET_FIX_SPEC D3 — seeds the durable server-completion latch
    // directly (bypassing the live-fetch-only _latchServerComplete), matching
    // the exact shape/key _serverCompleteKey / _serverCompleteFor read.
    // topics: { '<topic>': { ws?: true, bl?: true } }.
    seedLatch(topics) {
      const studentId = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
      if (!studentId) return;
      const key = 'a2_server_complete_v1:' + studentId;
      const origin = opts.origin !== undefined ? opts.origin : '';
      win.localStorage.setItem(key, JSON.stringify({
        v: 1, origin, updatedAt: new Date().toISOString(), topics: topics || {},
      }));
    },
  };
}
