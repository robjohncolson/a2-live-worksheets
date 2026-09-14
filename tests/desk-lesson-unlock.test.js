/**
 * tests/desk-lesson-unlock.test.js
 *
 * P5 -- Teacher to Student Console: lesson unlock (override gate)
 * (TEACHER_STUDENT_CONSOLE_SPEC.md §9 + P5_BUILD.md §3).
 *
 * The Desk caches a per-student lesson_unlock list and consults it
 * inside _isLessonUnlocked. In view-as mode the teacher can fire an
 * override modal that POSTs /teacher/lesson-unlock and optimistically
 * updates the per-tab sessionStorage cache.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

function mockStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// ============================================================================
// 1. Structure pins
// ============================================================================

describe('lesson-unlock -- structure', () => {
  it('view-as banner has Override gate button', () => {
    expect(html).toMatch(/id="view-as-override-gate"/);
  });

  it('override modal markup is present, hidden by default', () => {
    expect(html).toMatch(/id="override-gate-modal"\s+style="display:none"/);
    expect(html).toMatch(/id="ogm-student-name"/);
    expect(html).toMatch(/id="ogm-lesson-key"/);
    expect(html).toMatch(/id="ogm-reason"/);
    expect(html).toMatch(/id="ogm-status"/);
    expect(html).toMatch(/id="ogm-cancel"/);
    expect(html).toMatch(/id="ogm-confirm"/);
  });

  it('modal CSS rules are present', () => {
    expect(html).toMatch(/#override-gate-modal\s+\.ogm-panel\s*\{/);
    expect(html).toMatch(/#override-gate-modal\s+\.ogm-backdrop/);
  });

  it('lesson access no longer requires a teacher override', () => {
    const b = fnBody(html, '_isLessonUnlocked');
    expect(b).toMatch(/return true/);
    expect(b).not.toMatch(/_isTopicLessonUnlocked\s*\(/);
  });
  it('helpers are defined', () => {
    expect(() => fnBody(html, '_readLessonUnlocks')).not.toThrow();
    expect(() => fnBody(html, '_isTopicLessonUnlocked')).not.toThrow();
    expect(() => fnBody(html, '_refreshLessonUnlocks')).not.toThrow();
    expect(() => fnBody(html, '_showOverrideGateModal')).not.toThrow();
    expect(() => fnBody(html, '_hideOverrideGateModal')).not.toThrow();
    expect(() => fnBody(html, '_confirmOverrideGate')).not.toThrow();
  });
});

// ============================================================================
// 2. _readLessonUnlocks
// ============================================================================

function loadReadUnlocks(localItems, sessionItems, viewAsCtx) {
  const sandbox = {
    JSON, Array,
    localStorage: mockStorage(localItems || {}),
    sessionStorage: mockStorage(sessionItems || {}),
    _viewAsContext: () => viewAsCtx,
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_readLessonUnlocks') + '\nthis.__f = _readLessonUnlocks;', sandbox);
  return sandbox.__f;
}

describe('lesson-unlock -- _readLessonUnlocks', () => {
  it('returns [] when no cache', () => {
    const f = loadReadUnlocks();
    expect(f()).toEqual([]);
  });

  it('returns parsed array from localStorage in normal mode', () => {
    const f = loadReadUnlocks({ a2_lesson_unlocks: '["1.7","5.3"]' });
    expect(f()).toEqual(['1.7', '5.3']);
  });

  it('returns [] on malformed JSON', () => {
    const f = loadReadUnlocks({ a2_lesson_unlocks: '{not valid' });
    expect(f()).toEqual([]);
  });

  it('reads sessionStorage when in view-as mode', () => {
    const f = loadReadUnlocks(
      { a2_lesson_unlocks: '["should-not-use"]' },
      { a2_view_as_lesson_unlocks: '["target-1.7"]' },
      { studentId: 'stu_x', username: 'alice' }
    );
    expect(f()).toEqual(['target-1.7']);
  });

  it('view-as mode falls back to [] when sessionStorage empty', () => {
    const f = loadReadUnlocks(
      { a2_lesson_unlocks: '["ignored"]' },
      {},
      { studentId: 'stu_x', username: 'alice' }
    );
    expect(f()).toEqual([]);
  });
});

// ============================================================================
// 3. _isTopicLessonUnlocked
// ============================================================================

function loadIsTopicUnlocked(unlocks) {
  const sandbox = {
    JSON, Array,
    localStorage: mockStorage({ a2_lesson_unlocks: JSON.stringify(unlocks) }),
    sessionStorage: mockStorage({}),
    _viewAsContext: () => null,
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_readLessonUnlocks') + '\n' +
    fnBody(html, '_isTopicLessonUnlocked') + '\n' +
    'this.__f = _isTopicLessonUnlocked;',
    sandbox);
  return sandbox.__f;
}

describe('lesson-unlock -- _isTopicLessonUnlocked', () => {
  it('true when topic in cache', () => {
    expect(loadIsTopicUnlocked(['1.7', '5.3'])('1.7')).toBe(true);
  });

  it('false when topic absent', () => {
    expect(loadIsTopicUnlocked(['1.7'])('5.3')).toBe(false);
  });

  it('false when cache empty', () => {
    expect(loadIsTopicUnlocked([])('1.7')).toBe(false);
  });

  it('false for falsy topic', () => {
    expect(loadIsTopicUnlocked(['1.7'])('')).toBe(false);
    expect(loadIsTopicUnlocked(['1.7'])(null)).toBe(false);
  });
});

// ============================================================================
// 4. _isLessonUnlocked extension
// ============================================================================

function loadIsLessonUnlocked(unlocks, role) {
  const sandbox = {
    JSON, Array, Math, Date,
    localStorage: mockStorage({
      a2_user_role: role || '',
      a2_lesson_unlocks: JSON.stringify(unlocks),
    }),
    sessionStorage: mockStorage({}),
    _deskIsTeacher: () => (role === 'teacher'),
    _viewAsContext: () => null,
    _isLessonComplete: () => false,
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_readLessonUnlocks') + '\n' +
    fnBody(html, '_isTopicLessonUnlocked') + '\n' +
    fnBody(html, '_isLessonUnlocked') + '\n' +
    'this.__f = _isLessonUnlocked;',
    sandbox);
  return sandbox.__f;
}

describe('lesson-unlock -- _isLessonUnlocked override path', () => {
  it('unlocked when topic in override list (even with incomplete prev + future date)', () => {
    const f = loadIsLessonUnlocked(['5.3'], 'student');
    const futureDate = new Date(Date.now() + 86400000);  // tomorrow
    const today = new Date();
    expect(f('5.3', futureDate, '5.2', today, {}, true)).toBe(true);
  });

  it('open without an override even when previous work is incomplete', () => {
    const f = loadIsLessonUnlocked([], 'student');
    const futureDate = new Date(Date.now() + 86400000);
    const today = new Date();
    expect(f('5.3', futureDate, '5.2', today, {}, true)).toBe(true);
  });

  it('teacher mode -> always unlocked (independent of cache)', () => {
    const f = loadIsLessonUnlocked([], 'teacher');
    const today = new Date();
    expect(f('5.3', new Date(Date.now() + 86400000), '5.2', today, {}, true)).toBe(true);
  });

  it('not signed in -> always unlocked', () => {
    const f = loadIsLessonUnlocked([], 'student');
    expect(f('5.3', new Date(), '5.2', new Date(), {}, false)).toBe(true);
  });
});

// ============================================================================
// 5. _showOverrideGateModal / _hideOverrideGateModal
// ============================================================================

function makeModalEls() {
  return {
    'override-gate-modal': { style: { display: 'none' } },
    'ogm-student-name': { textContent: 'stale' },
    'ogm-lesson-key': { value: 'stale' },
    'ogm-reason': { value: 'stale' },
    'ogm-status': { textContent: 'stale' },
    'ogm-confirm': { disabled: true },
  };
}

describe('lesson-unlock -- _showOverrideGateModal', () => {
  it('reveals modal + prefills student name + clears reason + clears status', () => {
    const els = makeModalEls();
    const sandbox = {
      document: { getElementById: (id) => els[id] || null },
      _viewAsContext: () => ({ studentId: 'stu_x', username: 'alice', realName: 'Alice Anderson' }),
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_showOverrideGateModal') + '\nthis.__f = _showOverrideGateModal;', sandbox);
    sandbox.__f('1.7');
    expect(els['override-gate-modal'].style.display).toBe('block');
    expect(els['ogm-student-name'].textContent).toBe('Alice Anderson');
    expect(els['ogm-lesson-key'].value).toBe('1.7');
    expect(els['ogm-reason'].value).toBe('');
    expect(els['ogm-status'].textContent).toBe('');
    expect(els['ogm-confirm'].disabled).toBe(false);
  });

  it('no-op when not in view-as mode', () => {
    const els = makeModalEls();
    const sandbox = {
      document: { getElementById: (id) => els[id] || null },
      _viewAsContext: () => null,
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_showOverrideGateModal') + '\nthis.__f = _showOverrideGateModal;', sandbox);
    sandbox.__f('1.7');
    expect(els['override-gate-modal'].style.display).toBe('none');
  });
});

// ============================================================================
// 6. _confirmOverrideGate
// ============================================================================

function loadConfirm({ lessonKey, fetchOk = true, fetchBody, viewAs, token = 'TOK' }) {
  const fetches = [];
  const els = {
    'override-gate-modal': { style: { display: 'block' } },
    'ogm-student-name': { textContent: '' },
    'ogm-lesson-key': { value: lessonKey },
    'ogm-reason': { value: 'because reason' },
    'ogm-status': { textContent: '' },
    'ogm-confirm': { disabled: false },
  };
  const sessStore = mockStorage({});
  const sandbox = {
    JSON, String, Array, Math, Date, setTimeout: (fn) => fn(),
    document: { getElementById: (id) => els[id] || null },
    _viewAsContext: () => viewAs,
    _hideOverrideGateModal: () => { els['override-gate-modal'].style.display = 'none'; },
    sessionStorage: sessStore,
    window: {
      ROSTER_SERVICE_URL: 'https://x',
      rosterClient: { token: () => token },
    },
    fetch: (url, opts) => {
      fetches.push({ url, opts });
      return Promise.resolve({
        ok: fetchOk,
        status: fetchOk ? 200 : 500,
        json: async () => (fetchBody !== undefined ? fetchBody : { ok: fetchOk, row: {} }),
      });
    },
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_confirmOverrideGate') + '\nthis.__f = _confirmOverrideGate;', sandbox);
  return { f: sandbox.__f, fetches, els, sessStore };
}

describe('lesson-unlock -- _confirmOverrideGate', () => {
  it('no-op when lesson key empty (status updated)', async () => {
    const { f, fetches, els } = loadConfirm({
      lessonKey: '   ',
      viewAs: { studentId: 'stu_x', username: 'alice' },
    });
    await f();
    expect(fetches.length).toBe(0);
    expect(els['ogm-status'].textContent).toMatch(/Enter a lesson/);
  });

  it('POSTs /teacher/lesson-unlock with studentUsername + lessonKey + reason', async () => {
    const { f, fetches } = loadConfirm({
      lessonKey: '1.7',
      viewAs: { studentId: 'stu_x', username: 'alice' },
    });
    await f();
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/teacher\/lesson-unlock$/);
    const body = JSON.parse(fetches[0].opts.body);
    expect(body.studentUsername).toBe('alice');
    expect(body.lessonKey).toBe('1.7');
    expect(body.reason).toBe('because reason');
  });

  it('on success: optimistically updates sessionStorage cache', async () => {
    const { f, sessStore } = loadConfirm({
      lessonKey: '1.7',
      viewAs: { studentId: 'stu_x', username: 'alice' },
    });
    await f();
    const stored = JSON.parse(sessStore.getItem('a2_view_as_lesson_unlocks') || '[]');
    expect(stored).toContain('1.7');
  });

  it('on failure response: shows error status and re-enables confirm', async () => {
    const { f, els } = loadConfirm({
      lessonKey: '1.7',
      viewAs: { studentId: 'stu_x', username: 'alice' },
      fetchOk: false,
      fetchBody: { ok: false, error: 'forbidden' },
    });
    await f();
    expect(els['ogm-status'].textContent).toMatch(/Error/);
    expect(els['ogm-confirm'].disabled).toBe(false);
  });

  it('no-op when not in view-as mode', async () => {
    const { f, fetches } = loadConfirm({
      lessonKey: '1.7',
      viewAs: null,
    });
    await f();
    expect(fetches.length).toBe(0);
  });
});
