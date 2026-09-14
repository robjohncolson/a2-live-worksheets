// tests/fixtures/incident-progress-reset/matrix-harness.js
//
// PROGRESS_RESET_FIX_SPEC.md §3 matrix coverage (Implementer B —
// tests/progress-reset-matrix-*.test.js). Purely ADDITIVE alongside
// oracles.js (owned by Implementer A's inverted incident tests): this file
// never imports from or mutates oracles.js's composeOracles, it only reuses
// its DESK source string + extractFn brace-matcher (both already exported)
// to build three more-specialized JSDOM+vm sandboxes the matrix suites need
// that composeOracles does not expose:
//
//   1. composeLatchHarness  — everything composeOracles has PLUS the real
//      WRITE side of the D3 latch (_persistServerComplete/_latchServerComplete)
//      and the D2 grade-cache read/write pair, so matrix tests can prove the
//      Cws>=60 / blooket>=80 threshold derivation and the monotonic merge,
//      not just seed the localStorage shape directly. Also supports
//      opts.sharedStorage (a tiny Map-backed getItem/setItem/removeItem
//      double) so two independently-composed sandboxes can be wired to the
//      SAME storage — the multi-tab row's actual mechanism.
//   2. composeRenderHarness — extracts the real renderDoNowGrades (D1/D2/D7)
//      + _renderGradeStatus + _scheduleGradeRetry, with a controllable
//      fetch double and a manual setTimeout double (real Node/vitest fake
//      timers don't reach a JSDOM window's own timers, since the window is
//      not globalThis).
//   3. composeRProgHarness  — extracts the real rProg (D5) with the
//      surrounding calendar/pace machinery stubbed to inert/empty values
//      (S=[] so the day-loop body never runs and never touches OFF/EX/PO/NC).
//
// All three reuse the SAME real, unmodified source text pulled straight out
// of desk.html via extractFn — no re-implementation
// of the functions under test.

import { DESK, extractFn, marksKey } from './oracles.js';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';

export { DESK, extractFn, marksKey };

function baseWindow(opts) {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' +
      '<div id="donow-grades"></div>' +
      '<div id="donow-grade-status"></div>' +
      '<div id="donow-helper"></div>' +
      '<div id="pb"></div><div id="pl"></div>' +
    '</body></html>',
    { url: 'https://desk.test' }
  );
  const win = dom.window;
  win.rosterClient = {
    current: () => (opts.username ? { username: opts.username } : null),
    studentId: () => (opts.studentId !== undefined ? opts.studentId : (opts.username || null)),
  };
  win.ROSTER_SERVICE_URL = opts.origin !== undefined ? opts.origin : '';
  if (opts.legacyEmailKey) {
    win.localStorage.setItem('a2_desk_student_email', opts.legacyEmailKey);
  }
  if (opts.viewAs) {
    win._viewAsContext = () => ({ studentId: opts.studentId || 'viewed-student' });
  }
  if (opts.sharedStorage) {
    // Simulates "same browser origin, different tab": both sandboxes read/
    // write the SAME backing store instead of each JSDOM instance's own
    // isolated localStorage.
    Object.defineProperty(win, 'localStorage', { value: opts.sharedStorage, configurable: true });
  }
  return win;
}

// A tiny Map-backed Storage double — getItem/setItem/removeItem is the whole
// surface every extracted function under test actually calls.
export function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    has: (k) => store.has(k), // test-only convenience, not part of the real Storage API
  };
}

export function seedLatch(win, opts, topics) {
  const studentId = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
  if (!studentId) return;
  const key = 'a2_server_complete_v1:' + studentId;
  const origin = opts.origin !== undefined ? opts.origin : '';
  win.localStorage.setItem(key, JSON.stringify({
    v: 1, origin, updatedAt: new Date().toISOString(), topics: topics || {},
  }));
}

export function seedGradeCache(win, opts, payload, envelopeOpts) {
  envelopeOpts = envelopeOpts || {};
  const studentId = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
  if (!studentId) return;
  const key = 'a2_grade_cache_v1:' + studentId;
  if (envelopeOpts.legacyBare) {
    win.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: payload }));
    return;
  }
  const origin = envelopeOpts.origin !== undefined ? envelopeOpts.origin : (opts.origin !== undefined ? opts.origin : '');
  win.localStorage.setItem(key, JSON.stringify({ v: 2, origin, savedAt: new Date().toISOString(), data: payload }));
}

// ── 1. Latch harness: composeOracles' full oracle set + the real D3 WRITE
// side + the real D2 cache read/write pair. ────────────────────────────────
export function composeLatchHarness(opts) {
  opts = opts || {};
  const win = baseWindow(opts);
  const ctx = createContext(win);

  const script = [
    "function getRegistryEntry(t){",
    "  if (t && /^\\d+\\.\\d+$/.test(t)) return { urls: { worksheet: 'w', blooket: 'b' } };",
    "  return { urls: {} };",
    "}",
    "var DESK_WORKSHEET_DONE_THRESHOLD = 60;",
    "function _deskIsTeacher(){ return false; }",
    "var _gradeLessonsCache = " + (opts.initialGradeCache ? JSON.stringify(opts.initialGradeCache) : 'null') + ";",
    "var _marksAliasMigratedFor = null;",
    extractFn(DESK, 'getStudentEmail'),
    extractFn(DESK, '_hydrateMarksFromDonow'),
    extractFn(DESK, 'localLessonState'),
    extractFn(DESK, '_getCwsForTopic'),
    extractFn(DESK, '_blooketScoreFor'),
    extractFn(DESK, '_marksAliasKeys'),
    extractFn(DESK, '_migrateMarksAliases'),
    extractFn(DESK, '_gradeCacheKey'),
    extractFn(DESK, '_persistGradeCache'),
    extractFn(DESK, '_loadGradeCache'),
    extractFn(DESK, '_serverCompleteKey'),
    extractFn(DESK, '_persistServerComplete'),
    extractFn(DESK, '_latchServerComplete'),
    extractFn(DESK, '_serverCompleteFor'),
    extractFn(DESK, '_serverEvidencePresent'),
    extractFn(DESK, '_isLessonComplete'),
    extractFn(DESK, '_isLessonUnlocked'),
    "window.__isLessonComplete = _isLessonComplete;",
    "window.__isLessonUnlocked = _isLessonUnlocked;",
    "window.__hydrateMarksFromDonow = _hydrateMarksFromDonow;",
    "window.__localLessonState = localLessonState;",
    "window.__getStudentEmail = getStudentEmail;",
    "window.__serverCompleteFor = _serverCompleteFor;",
    "window.__serverEvidencePresent = _serverEvidencePresent;",
    "window.__migrateMarksAliases = _migrateMarksAliases;",
    "window.__marksAliasKeys = _marksAliasKeys;",
    "window.__latchServerComplete = _latchServerComplete;",
    "window.__persistGradeCache = _persistGradeCache;",
    "window.__loadGradeCache = _loadGradeCache;",
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
    latchServerComplete: win.__latchServerComplete,
    persistGradeCache: win.__persistGradeCache,
    loadGradeCache: win.__loadGradeCache,
    setGradeCache(lessons) { win._gradeLessonsCache = lessons || null; },
    marksFor(email) {
      try { return JSON.parse(win.localStorage.getItem(marksKey(email)) || '{}'); }
      catch (_) { return {}; }
    },
    rawLatch() {
      const sid = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
      if (!sid) return null;
      try { return JSON.parse(win.localStorage.getItem('a2_server_complete_v1:' + sid) || 'null'); }
      catch (_) { return null; }
    },
  };
}

// ── 2. renderDoNowGrades harness (D1/D2/D3/D7) ──────────────────────────────
//
// opts.fetchImpl(url, init, timeoutMs) -> Promise<{ok,status,json}|null>,
// called as the `_roadmapFetch` double. Defaults to a never-resolving-useful
// null response (network unavailable) so a harness built without an explicit
// fetchImpl fails safely rather than throwing.
export function composeRenderHarness(opts) {
  opts = opts || {};
  const win = baseWindow(opts);
  win.ROADMAP_FETCH_TIMEOUT_MS = 5000;
  win.QUARTER_BAND_LABEL = {};
  win._roadmapFetch = (url, init, timeout) => (opts.fetchImpl ? opts.fetchImpl(url, init, timeout) : Promise.resolve(null));
  if (!opts.viewAs) win._viewAsContext = () => false;
  win._coachPanelOpen = () => false;
  win.updateWalletReadinessIcon = () => {};
  win._phase2RefreshOnline = () => { win.__phase2RefreshOnlineCalls = (win.__phase2RefreshOnlineCalls || 0) + 1; };
  win._phase2ReDeriveGrade = () => (opts.phase2ReDerive ? opts.phase2ReDerive() : Promise.resolve(null));
  win.rCal = () => { win.__rCalCalls = (win.__rCalCalls || 0) + 1; };
  win.paintLocalDoneCells = () => { win.__paintCalls = (win.__paintCalls || 0) + 1; };
  win.quarterOfDate = () => null;
  win.openSignInModal = () => { win.__signInOpened = true; };
  win.openNameFinder = () => { win.__nameFinderOpened = true; };
  win.renderDoNow = () => { win.__renderDoNowCalls = (win.__renderDoNowCalls || 0) + 1; };
  win.rProg = () => { win.__rProgCalls = (win.__rProgCalls || 0) + 1; };

  // Manual timer double. vitest's fake timers patch globalThis, not a JSDOM
  // window's own timer functions, so this harness controls scheduling
  // explicitly instead. IDs start at 1 — real setTimeout never returns 0
  // either, and the source's `if (_gradeRetryTimer) return;` guard would be
  // silently broken by a falsy id.
  const timers = [];
  let nextId = 1;
  win.setTimeout = (fn, delay) => { const id = nextId++; timers.push({ id, fn, delay }); return id; };
  win.clearTimeout = (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; };

  const ctx = createContext(win);
  const script = [
    "var _gradeLessonsCache = " + (opts.initialGradeCache ? JSON.stringify(opts.initialGradeCache) : 'null') + ";",
    "var _gradeQuartersCache = null;",
    "var _gradeGradebookCache = null;",
    "var _gradeLoadState = " + JSON.stringify(opts.initialLoadState || 'unknown') + ";",
    "var _gradeLoadError = null;",
    "var _gradeRetryCount = " + (opts.initialRetryCount || 0) + ";",
    "var _gradeRetryTimer = null;",
    "var _gradeLastRenderedState = " + (opts.priorState ? JSON.stringify(opts.priorState) : 'null') + ";",
    "var DESK_WORKSHEET_DONE_THRESHOLD = 60;",
    extractFn(DESK, '_gradeCacheKey'),
    extractFn(DESK, '_persistGradeCache'),
    extractFn(DESK, '_loadGradeCache'),
    extractFn(DESK, '_serverCompleteKey'),
    extractFn(DESK, '_persistServerComplete'),
    extractFn(DESK, '_latchServerComplete'),
    extractFn(DESK, '_serverCompleteFor'),
    extractFn(DESK, '_serverEvidencePresent'),
    extractFn(DESK, '_renderGradeStatus'),
    "var GRADE_RETRY_BACKOFF_MS = [15000, 30000, 60000];",
    extractFn(DESK, '_scheduleGradeRetry'),
    extractFn(DESK, 'renderDoNowGrades'),
    "window.__renderDoNowGrades = renderDoNowGrades;",
    "window.__renderGradeStatus = _renderGradeStatus;",
  ].join('\n');
  runInContext(script, ctx);

  return {
    win,
    timers,
    async render(baseUrl, token) { return win.__renderDoNowGrades(baseUrl || 'https://roster.test', token || 'tok'); },
    renderGradeStatus: () => win.__renderGradeStatus(),
    bannerText() {
      const host = win.document.getElementById('donow-grade-status');
      return host ? host.textContent : '';
    },
    bannerVisible() {
      const host = win.document.getElementById('donow-grade-status');
      return !!(host && host.style.display && host.style.display !== 'none');
    },
    rawLatch() {
      const sid = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
      if (!sid) return null;
      try { return JSON.parse(win.localStorage.getItem('a2_server_complete_v1:' + sid) || 'null'); }
      catch (_) { return null; }
    },
    rawGradeCache() {
      const sid = opts.studentId !== undefined ? opts.studentId : (opts.username || null);
      if (!sid) return null;
      try { return JSON.parse(win.localStorage.getItem('a2_grade_cache_v1:' + sid) || 'null'); }
      catch (_) { return null; }
    },
  };
}

// ── 3. rProg harness (D5) ───────────────────────────────────────────────────
//
// S=[] means the day-scan loop body never runs, so OFF/EX/PO/NC (calendar
// constants irrelevant to D5) never need stubbing. opts.pace controls what
// the stubbed _computePace returns: { total, done, expected } or null (no
// pace at all, e.g. signed-out).
export function composeRProgHarness(opts) {
  opts = opts || {};
  const win = baseWindow(opts);
  const today = opts.today || new Date(2026, 6, 20);
  win.tdy = () => today;
  win.S = [];
  win.cP = 'A';
  win.cYear = 'Y1';
  win.SCHEDULE_DEFS = { Y1: { units: [] } };
  win._orderedPeriodTopics = () => [];
  win.localLessonState = () => 'todo';
  win.getStudentMarks = () => ({});
  win._computePace = () => (opts.pace || { total: 0, done: 0, expected: 0 });

  const ctx = createContext(win);
  const script = [
    "var _gradeLessonsCache = " + (opts.gradeCache ? JSON.stringify(opts.gradeCache) : 'null') + ";",
    "var _gradeLoadState = " + JSON.stringify(opts.loadState || 'unknown') + ";",
    extractFn(DESK, 'getStudentEmail'),
    extractFn(DESK, '_serverCompleteKey'),
    extractFn(DESK, '_serverCompleteFor'),
    extractFn(DESK, '_serverEvidencePresent'),
    extractFn(DESK, 'rProg'),
    "window.__rProg = rProg;",
  ].join('\n');
  runInContext(script, ctx);

  return {
    win,
    run() { win.__rProg(); return win.document.getElementById('pl').textContent; },
  };
}
