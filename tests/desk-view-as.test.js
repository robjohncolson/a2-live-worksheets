/**
 * tests/desk-view-as.test.js
 *
 * P2 -- Teacher to Student Console: View-as (TEACHER_STUDENT_CONSOLE_SPEC.md
 * Section 7, TEACHER_STUDENT_CONSOLE_P2_BUILD.md Section 3).
 *
 * The teacher opens the Desk in a new tab with ?viewAsUserId=<sid>; the
 * Desk's bootstrap hydrates a per-tab sessionStorage object
 * (a2_view_as_context) and renders the Desk as that student, READ-ONLY.
 *
 * Source assertions + Node `vm` runtime of the real helpers, matching
 * tests/preview-as-student.test.js's pattern verbatim.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');
const dashHtml = readFileSync(resolve(REPO_ROOT, 'teacher-dashboard.html'), 'utf-8');

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

const KEY = 'a2_view_as_context';

const FIXTURE_CTX = {
  studentId: 'stu_abc123',
  username: 'papaya-otter',
  realName: 'Jane Doe',
  section: 'C',
  readOnly: true,
  enteredAt: 1700000000000,
};

// ============================================================================
// 1. Structure pins
// ============================================================================

describe('view-as -- structure', () => {
  it('view-as banner div exists in the body markup, hidden by default', () => {
    expect(html).toMatch(/id="view-as-banner"[^>]*style="display:none"/);
  });

  it('banner has the four expected slots: label, name, meta, readonly, exit', () => {
    const m = /id="view-as-banner"[\s\S]*?<\/div>/.exec(html);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/id="view-as-banner-name"/);
    expect(m[0]).toMatch(/id="view-as-banner-meta"/);
    expect(m[0]).toMatch(/id="view-as-exit"/);
    expect(m[0]).toMatch(/READ-ONLY/);
  });

  it('CSS rule .view-as-active shifts body padding to make room for the banner', () => {
    expect(html).toMatch(/body\.view-as-active\s*\{\s*padding-top:\s*40px;?\s*\}/);
  });

  it('_deskIsTeacher honours both preview-as-student AND view-as flags', () => {
    const b = fnBody(html, '_deskIsTeacher');
    expect(b).toMatch(/sessionStorage\.getItem\('a2_preview_as_student'\)\s*===\s*'1'/);
    expect(b).toMatch(/sessionStorage\.getItem\('a2_view_as_context'\)/);
  });

  it('renderDoNow fetch is routed through _maybeViewAsFetch', () => {
    const b = fnBody(html, 'renderDoNow');
    expect(b).toMatch(/_maybeViewAsFetch\(\s*['"]\/donow['"]/);
  });

  it('renderDoNowGrades fetch is routed through _maybeViewAsFetch', () => {
    const b = fnBody(html, 'renderDoNowGrades');
    expect(b).toMatch(/_maybeViewAsFetch\(/);
    expect(b).toMatch(/\/grade/);
  });

  

  it('recordProgress short-circuits when view-as is active', () => {
    const b = fnBody(html, 'recordProgress');
    expect(b).toMatch(/_viewAsContext\(\)/);
  });

  it('recordLinkVisit short-circuits when view-as is active', () => {
    const b = fnBody(html, 'recordLinkVisit');
    expect(b).toMatch(/_viewAsContext\(\)/);
  });

  it('_viewAsBootstrap IIFE references the /teacher/student/:id/profile endpoint', () => {
    expect(html).toMatch(/_viewAsBootstrap[\s\S]*?\/teacher\/student\/[\s\S]*?\/profile/);
  });
});

// ============================================================================
// 2. _viewAsContext reader
// ============================================================================

function loadViewAsContext(session) {
  const sandbox = { sessionStorage: session, JSON };
  createContext(sandbox);
  runInContext(fnBody(html, '_viewAsContext') + '\nthis.__f = _viewAsContext;', sandbox);
  return sandbox.__f;
}

describe('view-as -- _viewAsContext reader', () => {
  it('returns null when sessionStorage is empty', () => {
    const f = loadViewAsContext(mockStorage({}));
    expect(f()).toBe(null);
  });

  it('returns the parsed object when sessionStorage holds a valid context', () => {
    const f = loadViewAsContext(mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }));
    const ctx = f();
    expect(ctx).toBeTruthy();
    expect(ctx.studentId).toBe('stu_abc123');
    expect(ctx.realName).toBe('Jane Doe');
    expect(ctx.section).toBe('C');
  });

  it('returns null on malformed JSON', () => {
    const f = loadViewAsContext(mockStorage({ [KEY]: '{not valid json' }));
    expect(f()).toBe(null);
  });

  it('returns null when the parsed object lacks studentId', () => {
    const f = loadViewAsContext(mockStorage({ [KEY]: JSON.stringify({ username: 'x' }) }));
    expect(f()).toBe(null);
  });

  it('returns null when sessionStorage.getItem throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    const f = loadViewAsContext(throwing);
    expect(f()).toBe(null);
  });
});

// ============================================================================
// 3. _deskIsTeacher extension
// ============================================================================

function loadDeskIsTeacher(session, local) {
  const sandbox = { sessionStorage: session, localStorage: local };
  createContext(sandbox);
  runInContext(fnBody(html, '_deskIsTeacher') + '\nthis.__f = _deskIsTeacher;', sandbox);
  return sandbox.__f;
}

describe('view-as -- _deskIsTeacher extension', () => {
  it('returns true for teacher with no view-as flag', () => {
    const f = loadDeskIsTeacher(mockStorage({}), mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(true);
  });

  it('returns false when view-as flag is set (even for a teacher)', () => {
    const f = loadDeskIsTeacher(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(false);
  });

  it('returns false when preview-as-student flag is set (existing s108 behavior intact)', () => {
    const f = loadDeskIsTeacher(
      mockStorage({ a2_preview_as_student: '1' }),
      mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(false);
  });

  it('returns false for non-teacher with neither flag', () => {
    const f = loadDeskIsTeacher(mockStorage({}), mockStorage({}));
    expect(f()).toBe(false);
  });
});

// ============================================================================
// 4. _maybeViewAsFetch URL rewriting
// ============================================================================

function loadMaybeViewAsFetch(session, token) {
  const sandbox = {
    sessionStorage: session,
    JSON,
    Object,
    encodeURIComponent,
    window: { rosterClient: token ? { token: () => token } : null },
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_viewAsContext') + '\n' +
    fnBody(html, '_maybeViewAsFetch') + '\n' +
    'this.__f = _maybeViewAsFetch;',
    sandbox);
  return sandbox.__f;
}

describe('view-as -- _maybeViewAsFetch URL rewriting', () => {
  it('pass-through when view-as is inactive (no rewrite, preserves headers)', () => {
    const f = loadMaybeViewAsFetch(mockStorage({}), null);
    const r = f('/donow', { 'Authorization': 'Bearer student-tok' });
    expect(r.endpoint).toBe('/donow');
    expect(r.headers['Authorization']).toBe('Bearer student-tok');
  });

  it('/donow -> /teacher/student/:id/donow when view-as is active', () => {
    const f = loadMaybeViewAsFetch(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      'TEACHER_TOK');
    const r = f('/donow', { 'Authorization': 'Bearer student-tok' });
    expect(r.endpoint).toBe('/teacher/student/stu_abc123/donow');
    expect(r.headers['Authorization']).toBe('Bearer TEACHER_TOK');
  });

  it('/grade?token=X -> /teacher/student/:id/grade (no ?token) when active', () => {
    const f = loadMaybeViewAsFetch(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      'TEACHER_TOK');
    const r = f('/grade?token=student-tok', {});
    expect(r.endpoint).toBe('/teacher/student/stu_abc123/grade');
    expect(r.endpoint).not.toMatch(/\?token=/);
    expect(r.headers['Authorization']).toBe('Bearer TEACHER_TOK');
  });

  it('unknown endpoint pass-through (no rewrite) even when view-as is active', () => {
    const f = loadMaybeViewAsFetch(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      'TEACHER_TOK');
    const r = f('/some/other/endpoint', {});
    expect(r.endpoint).toBe('/some/other/endpoint');
    // Teacher token still injected when active (defensive).
    expect(r.headers['Authorization']).toBe('Bearer TEACHER_TOK');
  });

  it('handles missing teacher token gracefully (no Authorization header)', () => {
    const f = loadMaybeViewAsFetch(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      null);
    const r = f('/donow', {});
    expect(r.endpoint).toBe('/teacher/student/stu_abc123/donow');
    expect(r.headers['Authorization']).toBeUndefined();
  });

  it('encodeURIComponent on studentId (defensive against special chars)', () => {
    const ctx = Object.assign({}, FIXTURE_CTX, { studentId: 'stu/abc 123' });
    const f = loadMaybeViewAsFetch(
      mockStorage({ [KEY]: JSON.stringify(ctx) }),
      'TEACHER_TOK');
    const r = f('/donow', {});
    expect(r.endpoint).toMatch(/stu%2Fabc(%20|\+)123/);
  });
});

// ============================================================================
// 5. _renderViewAsBanner
// ============================================================================

function makeFakeDoc(banner, name, meta) {
  const body = { classList: { add: () => {}, remove: () => {} } };
  return {
    body,
    getElementById: (id) => {
      if (id === 'view-as-banner') return banner;
      if (id === 'view-as-banner-name') return name;
      if (id === 'view-as-banner-meta') return meta;
      return null;
    },
  };
}

function loadRenderBanner(session, doc) {
  const sandbox = { sessionStorage: session, JSON, document: doc };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_viewAsContext') + '\n' +
    fnBody(html, '_renderViewAsBanner') + '\n' +
    'this.__r = _renderViewAsBanner;',
    sandbox);
  return sandbox.__r;
}

describe('view-as -- _renderViewAsBanner', () => {
  it('hides the banner when no view-as context', () => {
    const banner = { style: { display: 'flex' } };
    const name = { textContent: 'stale' };
    const meta = { textContent: 'stale' };
    loadRenderBanner(mockStorage({}), makeFakeDoc(banner, name, meta))();
    expect(banner.style.display).toBe('none');
  });

  it('shows the banner with realName + meta when view-as is active', () => {
    const banner = { style: { display: 'none' } };
    const name = { textContent: '' };
    const meta = { textContent: '' };
    loadRenderBanner(
      mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }),
      makeFakeDoc(banner, name, meta))();
    expect(banner.style.display).toBe('flex');
    expect(name.textContent).toBe('Jane Doe');
    expect(meta.textContent).toContain('@papaya-otter');
    expect(meta.textContent).toContain('C');
  });

  it('falls back to username when realName missing', () => {
    const banner = { style: { display: 'none' } };
    const name = { textContent: '' };
    const meta = { textContent: '' };
    const ctx = { studentId: 'x', username: 'falconer' };
    loadRenderBanner(
      mockStorage({ [KEY]: JSON.stringify(ctx) }),
      makeFakeDoc(banner, name, meta))();
    expect(name.textContent).toBe('falconer');
  });

  it('tolerates a missing banner element (no throw)', () => {
    const doc = {
      body: { classList: { add: () => {}, remove: () => {} } },
      getElementById: () => null,
    };
    expect(() =>
      loadRenderBanner(mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }), doc)()
    ).not.toThrow();
  });
});

// ============================================================================
// 6. _exitViewAs
// ============================================================================

describe('view-as -- _exitViewAs', () => {
  it('removes the sessionStorage key', () => {
    const ss = mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) });
    const sandbox = {
      sessionStorage: ss,
      URL: globalThis.URL,
      window: {
        location: { href: 'https://x/?viewAsUserId=stu_abc123&keep=1', reload: () => {} },
      },
    };
    createContext(sandbox);
    runInContext(fnBody(html, '_exitViewAs') + '\nthis.__f = _exitViewAs;', sandbox);
    sandbox.__f();
    expect(ss.getItem(KEY)).toBe(null);
  });
});

// ============================================================================
// 7. _applyViewAsReadOnly
// ============================================================================

function loadApplyReadOnly(session, doc) {
  const sandbox = { sessionStorage: session, JSON, document: doc };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_viewAsContext') + '\n' +
    fnBody(html, '_applyViewAsReadOnly') + '\n' +
    'this.__f = _applyViewAsReadOnly;',
    sandbox);
  return sandbox.__f;
}

describe('view-as -- _applyViewAsReadOnly', () => {
  it('no-op when view-as is inactive', () => {
    const input = { setAttribute: () => { throw new Error('should not run'); }, style: {} };
    const doc = {
      querySelectorAll: () => [input],
      getElementById: () => null,
    };
    expect(() => loadApplyReadOnly(mockStorage({}), doc)()).not.toThrow();
  });

  it('disables all native inputs + textareas when active', () => {
    const captured = [];
    function makeInput() {
      return { setAttribute: (k, v) => { captured.push({ k, v, ref: 'input' }); }, style: {} };
    }
    const inputs = [makeInput(), makeInput(), makeInput()];
    const doc = {
      querySelectorAll: (sel) => sel === 'input, textarea' ? inputs : [],
      getElementById: () => null,
    };
    loadApplyReadOnly(mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }), doc)();
    expect(captured.filter(c => c.k === 'disabled' && c.v === 'true').length).toBe(3);
  });

  it('hides sign-out + change-password menu items', () => {
    const signOut = { style: { display: 'block' } };
    const changePw = { style: { display: 'block' } };
    const doc = {
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (id === 'menu-sign-out') return signOut;
        if (id === 'menu-change-password') return changePw;
        return null;
      },
    };
    loadApplyReadOnly(mockStorage({ [KEY]: JSON.stringify(FIXTURE_CTX) }), doc)();
    expect(signOut.style.display).toBe('none');
    expect(changePw.style.display).toBe('none');
  });
});

// ============================================================================
// 7b. _wireViewAsWorksheetLinks — worksheet anchors carry viewAsUserId
// ============================================================================

function loadWireLinks(viewAsCtx) {
  const handlers = [];
  const sandbox = {
    _viewAsContext: () => viewAsCtx,
    URL: globalThis.URL,
    window: {
      __viewAsLinksWired: undefined,
      location: { href: 'https://a2.example.test/a2-live-worksheets/desk.html' },
    },
    document: {
      addEventListener: (type, fn, capture) => { handlers.push({ type, fn, capture }); },
    },
  };
  createContext(sandbox);
  // Use the sandbox's _viewAsContext stub (do NOT pull in the real sessionStorage
  // reader here) so the test drives active/inactive directly.
  runInContext(
    fnBody(html, '_wireViewAsWorksheetLinks') + '\n' +
    'this.__f = _wireViewAsWorksheetLinks;',
    sandbox);
  sandbox.__f();
  return { handlers, sandbox };
}

function fakeAnchor(href) {
  return { getAttribute: () => href, href };
}
function fakeEvent(anchor) {
  return { target: { closest: (sel) => (sel === 'a[href]' ? anchor : null) } };
}

describe('view-as -- _wireViewAsWorksheetLinks', () => {
  it('installs nothing when view-as is inactive', () => {
    const { handlers } = loadWireLinks(null);
    expect(handlers.length).toBe(0);
  });

  it('installs capturing click + auxclick listeners when view-as is active', () => {
    const { handlers } = loadWireLinks({ studentId: 'stu_abc123' });
    expect(handlers.find(h => h.type === 'click' && h.capture === true)).toBeTruthy();
    expect(handlers.find(h => h.type === 'auxclick' && h.capture === true)).toBeTruthy();
  });

  it('appends viewAsUserId to A2 lesson-check links', () => {
    const { handlers } = loadWireLinks({ studentId: 'stu_abc123' });
    const onClick = handlers.find(h => h.type === 'click').fn;
    const base = 'https://a2.example.test/a2-live-worksheets/';
    for (const f of ['check.html?lesson=1-1', 'check.html?lesson=1-1&resume=1']) {
      const a = fakeAnchor(base + f);
      onClick(fakeEvent(a));
      expect(a.href).toContain('viewAsUserId=stu_abc123');
    }
  });

  it('does NOT touch supporting-skill or teacher links', () => {
    const { handlers } = loadWireLinks({ studentId: 'stu_abc123' });
    const onClick = handlers.find(h => h.type === 'click').fn;
    for (const href of [
      'https://a2.example.test/a2-live-worksheets/start-here.html',
      'https://www.ixl.com/math/algebra-2/domain-and-range',
      'https://external.example.test/check.html?lesson=1-1',
      'https://a2.example.test/a2-live-worksheets/start-here.html?next=check.html',
      'teacher-dashboard.html',
    ]) {
      const a = fakeAnchor(href);
      onClick(fakeEvent(a));
      expect(a.href).toBe(href);
      expect(a.href).not.toContain('viewAsUserId');
    }
  });

  it('does not double-append if the param is already present', () => {
    const { handlers } = loadWireLinks({ studentId: 'stu_abc123' });
    const onClick = handlers.find(h => h.type === 'click').fn;
    const url = 'https://a2.example.test/a2-live-worksheets/check.html?lesson=1-1&viewAsUserId=stu_OTHER';
    const a = fakeAnchor(url);
    onClick(fakeEvent(a));
    // Existing param is preserved (no second viewAsUserId appended).
    expect(a.href).toBe(url);
    expect((a.href.match(/viewAsUserId/g) || []).length).toBe(1);
  });

  it('ignores a click that is not on an anchor', () => {
    const { handlers } = loadWireLinks({ studentId: 'stu_abc123' });
    const onClick = handlers.find(h => h.type === 'click').fn;
    expect(() => onClick({ target: { closest: () => null } })).not.toThrow();
  });
});

// ============================================================================
// 8. teacher-dashboard.html drawer wiring
// ============================================================================

describe('view-as -- dashboard drawer wiring', () => {
  it('the "View as student" button is no longer disabled in P2', () => {
    expect(dashHtml).toMatch(/id="tsc-action-view-as"[^>]*title="Open this student/);
    // No "disabled" attribute on the view-as button.
    const m = /<button[^>]*id="tsc-action-view-as"[^>]*>/.exec(dashHtml);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/\sdisabled\b/);
  });

  it('_openViewAsTab opens a new tab with the viewAsUserId query param', () => {
    let openedUrl = null;
    const sandbox = {
      window: { open: (url) => { openedUrl = url; return null; } },
      encodeURIComponent,
    };
    createContext(sandbox);
    runInContext(fnBody(dashHtml, '_openViewAsTab') + '\nthis.__f = _openViewAsTab;', sandbox);
    sandbox.__f('stu_xyz');
    expect(openedUrl).toMatch(/desk\.html\?viewAsUserId=stu_xyz/);
  });

  it('_openViewAsTab no-ops when studentId is empty/null', () => {
    let opened = 0;
    const sandbox = {
      window: { open: () => { opened += 1; return null; } },
      encodeURIComponent,
    };
    createContext(sandbox);
    runInContext(fnBody(dashHtml, '_openViewAsTab') + '\nthis.__f = _openViewAsTab;', sandbox);
    sandbox.__f(null);
    sandbox.__f('');
    sandbox.__f(undefined);
    expect(opened).toBe(0);
  });

  it('openTscDrawer captures studentId into the module-scope variable', () => {
    // Verify the line is present in the source (the variable is module-scope
    // in the IIFE, not addressable by name from outside).
    expect(dashHtml).toMatch(/_tscCurrentStudentId\s*=\s*stub\s*&&\s*stub\.studentId/);
  });
});

// ============================================================================
// 9. Pre-hydration race guard (Codex BLOCKER fold)
// ============================================================================

describe('view-as -- pre-hydration race guard', () => {
  it('CSS rule hides body while html.view-as-loading class is set', () => {
    expect(html).toMatch(/html\.view-as-loading\s+body\s*\{\s*visibility:\s*hidden;?\s*\}/);
  });

  it('bootstrap sets the loading class synchronously BEFORE the await fetch', () => {
    // The class-add must appear BEFORE the first `await fetch` in the
    // bootstrap IIFE -- otherwise the body could render the teacher's data
    // in the brief window between bootstrap-start and fetch-return.
    const m = /_viewAsBootstrap[\s\S]*?\}\)\(\);/.exec(html);
    expect(m).toBeTruthy();
    const body = m[0];
    const addIdx = body.indexOf("classList.add('view-as-loading')");
    const fetchIdx = body.indexOf('await fetch(');
    expect(addIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeLessThan(fetchIdx);
  });

  it('bootstrap removes the loading class in finally when not reloading', () => {
    const m = /_viewAsBootstrap[\s\S]*?\}\)\(\);/.exec(html);
    expect(m).toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/finally\s*\{[\s\S]*?willReload[\s\S]*?classList\.remove\('view-as-loading'\)/);
  });

  it('bootstrap tracks willReload + only triggers location.reload on success', () => {
    const m = /_viewAsBootstrap[\s\S]*?\}\)\(\);/.exec(html);
    expect(m).toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/var\s+willReload\s*=\s*false/);
    expect(body).toMatch(/willReload\s*=\s*true;\s*[\r\n]+\s*window\.location\.reload\(\)/);
  });
});

// ============================================================================
// 10. Write-helper short-circuits (Codex BLOCKER fold)
// ============================================================================

describe('view-as -- write-helper short-circuits', () => {
  for (const name of [
    'studentMark',
    '_bfSaveProgress',
    '_bfClearProgress',
    'openBlooketFlashcards',
    'closeBlooketFlashcards',
    'recordProgress',
    'recordLinkVisit',
  ]) {
    it(`${name} short-circuits on _viewAsContext (typeof-guarded)`, () => {
      const b = fnBody(html, name);
      expect(b).toMatch(/typeof\s+_viewAsContext\s*===\s*['"]function['"]\s*&&\s*_viewAsContext\(\)/);
    });
  }
});

// ============================================================================
// 11. _bfSaveProgress behavioral -- localStorage write blocked in view-as
// ============================================================================

function loadBfSaveProgress(viewAsCtx) {
  const captured = [];
  const sandbox = {
    JSON,
    Array,
    Object,
    localStorage: {
      getItem: () => '{}',
      setItem: (k, v) => { captured.push({ k, v }); },
      removeItem: () => {},
    },
    _viewAsContext: () => viewAsCtx,
    _bfStorageKey: () => 'a2_desk_bf_progress_teacher@x',
    _bfState: { topic: 't', deck: [1, 2, 3], idx: 0, score: { correct: 0, wrong: 0 } },
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_bfSaveProgress') + '\nthis.__f = _bfSaveProgress;', sandbox);
  return { f: sandbox.__f, captured };
}

describe('view-as -- _bfSaveProgress behavioral', () => {
  it('writes localStorage when view-as is inactive', () => {
    const { f, captured } = loadBfSaveProgress(null);
    f();
    expect(captured.length).toBe(1);
    expect(captured[0].k).toBe('a2_desk_bf_progress_teacher@x');
  });

  it('does NOT write localStorage when view-as is active (Codex BLOCKER fold)', () => {
    const { f, captured } = loadBfSaveProgress({ studentId: 'stu_jane', readOnly: true });
    f();
    expect(captured.length).toBe(0);
  });
});

// ============================================================================
// 12. Inactive-path fetch shape preserved (Codex MINOR fold)
// ============================================================================

describe('view-as -- typeof-guard fallback preserves inactive-path fetch shape', () => {
  it('renderDoNow fallback constructs /donow with Bearer student token', () => {
    const b = fnBody(html, 'renderDoNow');
    // The fallback object literal must spell out the original endpoint + headers.
    expect(b).toMatch(/\{\s*endpoint:\s*['"]\/donow['"][\s\S]{0,80}'Authorization':\s*'Bearer\s*'\s*\+\s*token/);
  });

  it('renderDoNowGrades fallback constructs /grade?token= with empty headers', () => {
    const b = fnBody(html, 'renderDoNowGrades');
    expect(b).toMatch(/\{\s*endpoint:\s*['"]\/grade\?token=['"]\s*\+\s*encodeURIComponent\s*\(\s*token\s*\)[\s\S]{0,40}headers:\s*\{\s*\}/);
  });

  
});
