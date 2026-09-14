/**
 * tests/preview-as-student.test.js
 *
 * F1 -- Preview-as-student Desk toggle (PREVIEW_AS_STUDENT_SPEC.md).
 * A teacher flips a per-tab sessionStorage flag so the Desk's gates
 * (lesson unlock, Do-Now focus, ...) treat them as a student.
 *
 * Source assertions + Node `vm` runtime of the real helpers, matching
 * tests/calendar-polish.test.js.
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

const FLAG = 'a2_preview_as_student';

// --- Structure pins ---------------------------------------------------------

describe('preview-as-student -- structure', () => {
  it('_deskIsTeacher honours the per-tab preview flag', () => {
    const b = fnBody(html, '_deskIsTeacher');
    expect(b).toMatch(/sessionStorage\.getItem\('a2_preview_as_student'\)\s*===\s*'1'/);
    expect(b).toMatch(/return false/);
  });
  it('the Teacher menu has a Preview-as-student item wired to the toggle', () => {
    expect(html).toMatch(/id="menu-preview-as-student"[^>]*onclick="[^"]*_togglePreviewAsStudent\(\)/);
  });
  it('the indicator badge markup exists, hidden by default', () => {
    expect(html).toMatch(/id="preview-as-student-badge"[^>]*display:none/);
  });
  it('the badge has an Exit button wired to the toggle', () => {
    const m = /id="preview-as-student-badge"[\s\S]*?<\/div>/.exec(html);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/onclick="_togglePreviewAsStudent\(\)"/);
  });
  it('init calls _renderPreviewAsStudentUI (typeof-guarded)', () => {
    expect(html).toMatch(/typeof _renderPreviewAsStudentUI==='function'\s*\)\s*_renderPreviewAsStudentUI\(\)/);
  });
});

// --- _deskIsTeacher behavior ------------------------------------------------

function loadDeskIsTeacher(session, local) {
  const sandbox = { sessionStorage: session, localStorage: local };
  createContext(sandbox);
  runInContext(fnBody(html, '_deskIsTeacher') + '\nthis.__f = _deskIsTeacher;', sandbox);
  return sandbox.__f;
}

describe('preview-as-student -- _deskIsTeacher', () => {
  it('returns false when the preview flag is set, even for a teacher', () => {
    const f = loadDeskIsTeacher(
      mockStorage({ [FLAG]: '1' }),
      mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(false);
  });
  it('returns true for a teacher when the flag is absent', () => {
    const f = loadDeskIsTeacher(
      mockStorage({}),
      mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(true);
  });
  it('returns false for a non-teacher regardless of the flag', () => {
    expect(loadDeskIsTeacher(mockStorage({}), mockStorage({}))()).toBe(false);
    expect(loadDeskIsTeacher(mockStorage({ [FLAG]: '1' }), mockStorage({}))()).toBe(false);
  });
  it('a sessionStorage that throws falls through to the role check', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    const f = loadDeskIsTeacher(throwing, mockStorage({ a2_user_role: 'teacher' }));
    expect(f()).toBe(true);
  });
});

// --- toggle behavior --------------------------------------------------------

function loadToggle(session) {
  let reloaded = 0;
  const sandbox = { sessionStorage: session, location: { reload: () => { reloaded += 1; } } };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_previewAsStudentActive') + '\n' +
    fnBody(html, '_togglePreviewAsStudent') + '\n' +
    'this.__active = _previewAsStudentActive; this.__toggle = _togglePreviewAsStudent;',
    sandbox);
  return { active: sandbox.__active, toggle: sandbox.__toggle, reloaded: () => reloaded };
}

describe('preview-as-student -- toggle', () => {
  it('toggles the flag ON from a clean tab and reloads', () => {
    const ss = mockStorage({});
    const h = loadToggle(ss);
    expect(h.active()).toBe(false);
    h.toggle();
    expect(ss.getItem(FLAG)).toBe('1');
    expect(h.active()).toBe(true);
    expect(h.reloaded()).toBe(1);
  });
  it('toggles the flag OFF when already previewing and reloads', () => {
    const ss = mockStorage({ [FLAG]: '1' });
    const h = loadToggle(ss);
    expect(h.active()).toBe(true);
    h.toggle();
    expect(ss.getItem(FLAG)).toBe(null);
    expect(h.active()).toBe(false);
    expect(h.reloaded()).toBe(1);
  });

  // The flag and the rendered page must never disagree: if reload() throws,
  // the flag is rolled back to its prior value (Codex F1 review, MINOR 1).
  function toggleWithThrowingReload(ss) {
    const sandbox = {
      sessionStorage: ss,
      location: { reload: () => { throw new Error('reload blocked'); } },
    };
    createContext(sandbox);
    runInContext(
      fnBody(html, '_previewAsStudentActive') + '\n' +
      fnBody(html, '_togglePreviewAsStudent') + '\n' +
      'this.__toggle = _togglePreviewAsStudent;',
      sandbox);
    return sandbox.__toggle;
  }

  it('rolls the flag back to OFF if reload throws while entering preview', () => {
    const ss = mockStorage({});
    const toggle = toggleWithThrowingReload(ss);
    expect(() => toggle()).not.toThrow();
    expect(ss.getItem(FLAG)).toBe(null);
  });
  it('rolls the flag back to ON if reload throws while exiting preview', () => {
    const ss = mockStorage({ [FLAG]: '1' });
    const toggle = toggleWithThrowingReload(ss);
    expect(() => toggle()).not.toThrow();
    expect(ss.getItem(FLAG)).toBe('1');
  });
});

// --- _renderPreviewAsStudentUI behavior -------------------------------------

function loadRender(session, item, badge) {
  const sandbox = {
    sessionStorage: session,
    document: {
      getElementById: (id) =>
        id === 'menu-preview-as-student' ? item
        : id === 'preview-as-student-badge' ? badge
        : null,
    },
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_previewAsStudentActive') + '\n' +
    fnBody(html, '_renderPreviewAsStudentUI') + '\n' +
    'this.__r = _renderPreviewAsStudentUI;',
    sandbox);
  return sandbox.__r;
}

describe('preview-as-student -- _renderPreviewAsStudentUI', () => {
  it('shows the badge and an Exit label while previewing', () => {
    const item = { textContent: '' };
    const badge = { style: { display: 'none' } };
    loadRender(mockStorage({ [FLAG]: '1' }), item, badge)();
    expect(badge.style.display).toBe('flex');
    expect(item.textContent).toMatch(/Exit student preview/);
  });
  it('hides the badge and shows the enter label when not previewing', () => {
    const item = { textContent: '' };
    const badge = { style: { display: 'flex' } };
    loadRender(mockStorage({}), item, badge)();
    expect(badge.style.display).toBe('none');
    expect(item.textContent).toMatch(/Preview as student/);
  });
  it('tolerates a missing menu item / badge (no throw)', () => {
    expect(() => loadRender(mockStorage({ [FLAG]: '1' }), null, null)()).not.toThrow();
  });
});
