/**
 * tests/desk-student-dm.test.js
 *
 * P13 -- Teacher to Student Console: student-initiated DM modal.
 * (TEACHER_STUDENT_CONSOLE_P13_BUILD.md section 3.5).
 *
 * Covers:
 *   - DOM presence pins (modal, menu item, required elements).
 *   - CSS rule presence.
 *   - _openStudentDmModal / _closeStudentDmModal behaviour.
 *   - ESC key handler + backdrop-click close.
 *   - _sendStudentDm: empty guard, POST body, success path, error paths.
 *   - _fetchStudentDmHistory: fetch call + render.
 *   - _buildSdmHistoryLi: row rendering for both directions.
 *
 * The server endpoint (Wave A) is stubbed via a fake fetch.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

// ---------------------------------------------------------------------------
// Utility: extract a named function body from source.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Utility: minimal mock DOM element.
// ---------------------------------------------------------------------------
function mockEl(overrides) {
  return Object.assign({
    style: { display: 'none' },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    },
    textContent: '',
    value: '',
    disabled: false,
    innerHTML: '',
    children: { length: 0 },
    appendChild: function (child) { return child; },
    focus: function () {},
    querySelectorAll: function () { return []; },
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// 1. DOM structure pins
// ---------------------------------------------------------------------------

describe('student DM modal -- DOM structure', () => {
  it('#student-dm-modal exists in source', () => {
    expect(html).toMatch(/id="student-dm-modal"/);
  });

  it('#student-dm-modal is hidden by default (style="display:none")', () => {
    expect(html).toMatch(/id="student-dm-modal"\s+style="display:none"/);
  });

  it('#sdm-text textarea is present', () => {
    expect(html).toMatch(/id="sdm-text"/);
  });

  it('#sdm-send button is present', () => {
    expect(html).toMatch(/id="sdm-send"/);
  });

  it('#sdm-cancel button is present', () => {
    expect(html).toMatch(/id="sdm-cancel"/);
  });

  it('#sdm-history-list is present', () => {
    expect(html).toMatch(/id="sdm-history-list"/);
  });

  it('#sdm-status element is present', () => {
    expect(html).toMatch(/id="sdm-status"/);
  });

  it('#menu-message-teacher menu item exists in the File menu', () => {
    expect(html).toMatch(/id="menu-message-teacher"/);
    // Confirm it lives inside the File menu dropdown.
    const fileMenuMatch = html.match(/id="menu-file"[\s\S]*?<\/div>\s*<\/span>/);
    expect(fileMenuMatch).toBeTruthy();
    expect(fileMenuMatch[0]).toMatch(/id="menu-message-teacher"/);
  });

  it('.sdm-panel CSS rule is defined in the source', () => {
    expect(html).toMatch(/\.sdm-panel\s*\{/);
  });

  it('.sdm-backdrop CSS rule is defined', () => {
    expect(html).toMatch(/\.sdm-backdrop\s*\{/);
  });

  it('all five DM handler functions are defined in the source', () => {
    expect(() => fnBody(html, '_openStudentDmModal')).not.toThrow();
    expect(() => fnBody(html, '_closeStudentDmModal')).not.toThrow();
    expect(() => fnBody(html, '_fetchStudentDmHistory')).not.toThrow();
    expect(() => fnBody(html, '_buildSdmHistoryLi')).not.toThrow();
    expect(() => fnBody(html, '_sendStudentDm')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Open / close behaviour
// ---------------------------------------------------------------------------

function makeOpenCloseSandbox(modalDisplay) {
  const els = {
    'student-dm-modal': mockEl({ style: { display: modalDisplay || 'none' } }),
    'sdm-text': mockEl({ value: 'old text' }),
    'sdm-status': mockEl({ textContent: 'old status', classList: { _classes: new Set(['is-error']), add(c) { this._classes.add(c); }, remove(c) { this._classes.delete(c); }, contains(c) { return this._classes.has(c); } } }),
    'sdm-send': mockEl({ disabled: true }),
    'sdm-history-list': mockEl({ innerHTML: '', children: { length: 0 }, appendChild: function (c) { return c; } }),
  };
  const fetches = [];
  const sandbox = {
    JSON, String, Array, Promise,
    document: { getElementById: (id) => els[id] || null },
    window: {
      ROSTER_SERVICE_URL: null,   // not signed in -> history will show "Not signed in."
      rosterClient: null,
    },
    fetch: (url, opts) => { fetches.push({ url, opts }); return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) }); },
    setTimeout: (fn) => fn(),   // synchronous for tests
  };
  createContext(sandbox);
  const code =
    // The Desk defines _sdmHistoryEpoch at module scope; without it the eval'd
    // _fetchStudentDmHistory rejects ("_sdmHistoryEpoch is not defined") as an
    // unhandled rejection that fails the suite's exit code. The fetch-cycle
    // sandbox further down already defines it.
    'var _sdmHistoryEpoch = 0;\n' +
    fnBody(html, '_closeStudentDmModal') + '\n' +
    fnBody(html, '_fetchStudentDmHistory') + '\n' +
    fnBody(html, '_buildSdmHistoryLi') + '\n' +
    fnBody(html, '_openStudentDmModal') + '\n' +
    'this.__open = _openStudentDmModal;\n' +
    'this.__close = _closeStudentDmModal;\n';
  runInContext(code, sandbox);
  return { open: sandbox.__open, close: sandbox.__close, els };
}

describe('student DM modal -- open / close', () => {
  it('_openStudentDmModal sets display to block', () => {
    const { open, els } = makeOpenCloseSandbox('none');
    open();
    expect(els['student-dm-modal'].style.display).toBe('block');
  });

  it('_openStudentDmModal clears the textarea', () => {
    const { open, els } = makeOpenCloseSandbox('none');
    open();
    expect(els['sdm-text'].value).toBe('');
  });

  it('_openStudentDmModal clears status text + removes error/success classes', () => {
    const { open, els } = makeOpenCloseSandbox('none');
    open();
    expect(els['sdm-status'].textContent).toBe('');
    expect(els['sdm-status'].classList.contains('is-error')).toBe(false);
  });

  it('_openStudentDmModal re-enables the Send button', () => {
    const { open, els } = makeOpenCloseSandbox('none');
    open();
    expect(els['sdm-send'].disabled).toBe(false);
  });

  it('_closeStudentDmModal sets display to none', () => {
    const { open, close, els } = makeOpenCloseSandbox('none');
    open();
    close();
    expect(els['student-dm-modal'].style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 3. _sendStudentDm behaviour
// ---------------------------------------------------------------------------

function makeSendSandbox({ textValue, fetchStatus, fetchBody, base, token }) {
  const fetches = [];
  const els = {
    'sdm-text': mockEl({ value: textValue }),
    'sdm-status': mockEl({ textContent: '', classList: { _classes: new Set(), add(c) { this._classes.add(c); }, remove(c) { this._classes.delete(c); }, contains(c) { return this._classes.has(c); } } }),
    'sdm-send': mockEl({ disabled: false }),
    'sdm-history-list': mockEl({ innerHTML: '', children: { length: 0 }, appendChild: function (c) { return c; } }),
  };
  const sandbox = {
    JSON, String, Array, Promise,
    document: { getElementById: (id) => els[id] || null },
    window: {
      ROSTER_SERVICE_URL: base !== undefined ? base : 'https://roster.test',
      rosterClient: token !== undefined ? { token: () => token } : { token: () => 'TOK' },
    },
    fetch: (url, opts) => {
      fetches.push({ url, opts });
      const status = fetchStatus !== undefined ? fetchStatus : 200;
      const body = fetchBody !== undefined ? fetchBody : { ok: true, nudgeId: 'x', rows: [] };
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        json: async () => body,
      });
    },
    _fetchStudentDmHistory: () => {},   // stub so send doesn't re-issue a history fetch
    setTimeout: (fn) => fn(),
  };
  createContext(sandbox);
  runInContext(
    fnBody(html, '_sendStudentDm') + '\n' +
    'this.__f = _sendStudentDm;\n',
    sandbox
  );
  return { f: sandbox.__f, fetches, els };
}

describe('student DM modal -- _sendStudentDm', () => {
  it('empty textarea: no fetch issued + is-error class added', async () => {
    const { f, fetches, els } = makeSendSandbox({ textValue: '' });
    await f();
    expect(fetches.length).toBe(0);
    expect(els['sdm-status'].classList.contains('is-error')).toBe(true);
    expect(els['sdm-status'].textContent).toMatch(/Type a message/);
  });

  it('whitespace-only textarea: no fetch issued', async () => {
    const { f, fetches } = makeSendSandbox({ textValue: '   ' });
    await f();
    expect(fetches.length).toBe(0);
  });

  it('valid text: POSTs to /student/nudge with { text }', async () => {
    const { f, fetches } = makeSendSandbox({ textValue: 'Hello teacher' });
    await f();
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/student\/nudge$/);
    const body = JSON.parse(fetches[0].opts.body);
    expect(body.text).toBe('Hello teacher');
  });

  it('200 ok: status reads "Sent." + textarea cleared + button re-enabled', async () => {
    const { f, els } = makeSendSandbox({ textValue: 'hi', fetchStatus: 200, fetchBody: { ok: true } });
    await f();
    expect(els['sdm-status'].textContent).toBe('Sent.');
    expect(els['sdm-status'].classList.contains('is-success')).toBe(true);
    expect(els['sdm-text'].value).toBe('');
    expect(els['sdm-send'].disabled).toBe(false);
  });

  it('503 response: is-error + button re-enabled', async () => {
    const { f, els } = makeSendSandbox({ textValue: 'hi', fetchStatus: 503, fetchBody: { ok: false, error: 'no teacher' } });
    await f();
    expect(els['sdm-status'].classList.contains('is-error')).toBe(true);
    expect(els['sdm-send'].disabled).toBe(false);
    expect(els['sdm-status'].textContent).toMatch(/no teacher/);
  });

  it('401 response: is-error + button re-enabled', async () => {
    const { f, els } = makeSendSandbox({ textValue: 'hi', fetchStatus: 401, fetchBody: { ok: false, error: 'unauthorized' } });
    await f();
    expect(els['sdm-status'].classList.contains('is-error')).toBe(true);
    expect(els['sdm-send'].disabled).toBe(false);
  });

  it('not signed in (no token): is-error + no fetch', async () => {
    const { f, fetches, els } = makeSendSandbox({ textValue: 'hi', base: 'https://x', token: null });
    await f();
    expect(fetches.length).toBe(0);
    expect(els['sdm-status'].classList.contains('is-error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. _fetchStudentDmHistory behaviour
// ---------------------------------------------------------------------------

function makeHistorySandbox({ rows, fetchOk, base, token }) {
  const fetches = [];
  const listItems = [];
  const listEl = {
    innerHTML: '',
    children: { length: 0 },
    appendChild: function (c) { listItems.push(c); return c; },
  };
  // Minimal createElement so _buildSdmHistoryLi can construct nodes.
  function makeNode(tag) {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      _children: [],
      appendChild: function (c) { this._children.push(c); return c; },
    };
  }
  const sandbox = {
    JSON, String, Array, Promise,
    document: {
      getElementById: (id) => id === 'sdm-history-list' ? listEl : null,
      createElement: (tag) => makeNode(tag),
    },
    window: {
      ROSTER_SERVICE_URL: base !== undefined ? base : 'https://roster.test',
      rosterClient: token !== undefined ? { token: () => token } : { token: () => 'TOK' },
    },
    fetch: (url, opts) => {
      fetches.push({ url, opts });
      const body = (fetchOk !== false) ? { ok: true, rows: rows || [] } : { ok: false };
      return Promise.resolve({
        ok: fetchOk !== false,
        status: fetchOk !== false ? 200 : 500,
        json: async () => body,
      });
    },
  };
  sandbox.encodeURIComponent = encodeURIComponent;
  createContext(sandbox);
  // Codex P13 MAJOR fold: _fetchStudentDmHistory references the module-scope
  // _sdmHistoryEpoch counter so concurrent fetches can be discriminated.
  // Declare it in the sandbox alongside the function bodies.
  // Guest-chat fold: _fetchStudentDmHistory now routes through _studentNudgeFetch
  // (token endpoint OR un-authed guest-alias endpoint), so inject that helper and
  // its two dependencies. _studentNudgeGuestAlias reads localStorage, which is
  // absent here -> its try/catch returns null, so these token/no-token tests take
  // the roster path exactly as before.
  runInContext(
    'var _sdmHistoryEpoch = 0;\n' +
    fnBody(html, '_studentNudgeToken') + '\n' +
    fnBody(html, '_studentNudgeGuestAlias') + '\n' +
    fnBody(html, '_studentNudgeFetch') + '\n' +
    fnBody(html, '_buildSdmHistoryLi') + '\n' +
    fnBody(html, '_fetchStudentDmHistory') + '\n' +
    'this.__f = _fetchStudentDmHistory;\n',
    sandbox
  );
  return { f: sandbox.__f, fetches, listEl, listItems };
}

describe('student DM modal -- _fetchStudentDmHistory', () => {
  it('calls GET /student/nudge-history?limit=20', async () => {
    const { f, fetches } = makeHistorySandbox({ rows: [] });
    await f();
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/student\/nudge-history\?limit=20/);
  });

  it('0 rows -> empty-state "No messages yet."', async () => {
    const { f, listEl } = makeHistorySandbox({ rows: [] });
    await f();
    expect(listEl.innerHTML).toMatch(/No messages yet/);
  });

  it('rows present -> appended as <li> elements in order', async () => {
    const rows = [
      { direction: 'student', created_at: '2026-05-24T10:00:00', sender_username: 'alice', text: 'hi' },
      { direction: 'teacher', created_at: '2026-05-24T10:01:00', sender_username: 'teach', text: 'hey' },
    ];
    const { f, listItems } = makeHistorySandbox({ rows });
    await f();
    expect(listItems.length).toBe(2);
  });

  it('not signed in: no fetch + shows "Not signed in."', async () => {
    const { f, fetches, listEl } = makeHistorySandbox({ rows: [], base: 'https://x', token: null });
    await f();
    expect(fetches.length).toBe(0);
    expect(listEl.innerHTML).toMatch(/Not signed in/);
  });
});

// ---------------------------------------------------------------------------
// 5. _buildSdmHistoryLi rendering
// ---------------------------------------------------------------------------

function makeBuildLiSandbox() {
  const created = [];
  const sandbox = {
    document: {
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          _children: [],
          appendChild: function (c) { this._children.push(c); return c; },
        };
        created.push(el);
        return el;
      },
    },
  };
  createContext(sandbox);
  runInContext(fnBody(html, '_buildSdmHistoryLi') + '\nthis.__f = _buildSdmHistoryLi;', sandbox);
  return { f: sandbox.__f, created };
}

describe('student DM modal -- _buildSdmHistoryLi', () => {
  it('teacher-direction row gets ">>" arrow with sdm-from-teacher class', () => {
    const { f } = makeBuildLiSandbox();
    const li = f({ direction: 'teacher', created_at: '2026-05-24T10:00:00', sender_username: 'teach', text: 'Good work!' });
    // Arrow span is first child.
    const arrow = li._children[0];
    expect(arrow.textContent).toBe('<<');
    expect(arrow.className).toMatch(/sdm-from-teacher/);
  });

  it('student-direction row gets ">>" arrow with sdm-from-student class', () => {
    const { f } = makeBuildLiSandbox();
    const li = f({ direction: 'student', created_at: '2026-05-24T10:05:00', sender_username: 'alice', text: 'Thanks!' });
    const arrow = li._children[0];
    expect(arrow.textContent).toBe('>>');
    expect(arrow.className).toMatch(/sdm-from-student/);
  });

  it('student-direction row shows "me" as the sender label in meta', () => {
    const { f } = makeBuildLiSandbox();
    const li = f({ direction: 'student', created_at: '2026-05-24T10:05:00', sender_username: 'alice', text: 'msg' });
    // Block is second child; meta is block's first child.
    const block = li._children[1];
    const meta = block._children[0];
    expect(meta.textContent).toMatch(/me/);
  });

  it('teacher-direction row shows sender_username in meta', () => {
    const { f } = makeBuildLiSandbox();
    const li = f({ direction: 'teacher', created_at: '2026-05-24T10:00:00', sender_username: 'mrcolson', text: 'hey' });
    const block = li._children[1];
    const meta = block._children[0];
    expect(meta.textContent).toMatch(/mrcolson/);
  });

  it('text node gets the row text content', () => {
    const { f } = makeBuildLiSandbox();
    const li = f({ direction: 'student', created_at: '2026-05-24T10:05:00', sender_username: 'alice', text: 'Hello world' });
    const block = li._children[1];
    const textEl = block._children[1];
    expect(textEl.textContent).toBe('Hello world');
  });
});

// ============================================================================
// Codex P13 fold regressions (MAJOR + MINOR + ASCII)
// ============================================================================

import { readFileSync as _rfs } from 'fs';
import { resolve as _resolve } from 'path';

describe('Codex P13 fold regressions', () => {
  const DESK_PATH = _resolve(__dirname, '..', 'desk.html');
  const DESK_HTML = _rfs(DESK_PATH, 'utf-8');

  // MAJOR: history-fetch race guard. _sdmHistoryEpoch is bumped on every
  // call; the awaits re-check before rendering so stale resolutions are
  // discarded. Without this, a slow first fetch could overwrite the rows
  // a newer second fetch already rendered.
  it('MAJOR: _fetchStudentDmHistory tracks _sdmHistoryEpoch', () => {
    expect(DESK_HTML).toMatch(/var\s+_sdmHistoryEpoch\s*=\s*0/);
  });
  it('MAJOR: _fetchStudentDmHistory captures + increments the epoch on entry', () => {
    expect(DESK_HTML).toMatch(/var\s+epoch\s*=\s*\+\+_sdmHistoryEpoch/);
  });
  it('MAJOR: stale-epoch early returns happen after each await', () => {
    // The fold inserts at least 3 guards: after fetch, after json, in catch.
    var guards = DESK_HTML.match(/if\s*\(\s*epoch\s*!==\s*_sdmHistoryEpoch\s*\)\s*return/g);
    expect(guards).not.toBeNull();
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });

  // MINOR (ASCII): the P13 banner comment is now ASCII-only. Spot-check the
  // header line near _openStudentDmModal.
  it('MINOR ASCII: P13 banner comment uses ASCII hyphens, not box-drawing chars', () => {
    // Find the P13 banner. Must NOT contain U+2500 (BOX DRAWINGS LIGHT HORIZONTAL).
    var p13Section = DESK_HTML.match(/-- P13:.*?\n/);
    expect(p13Section).not.toBeNull();
    // Verify the surrounding lines are ASCII (no U+2500 in the P13 banner region).
    var idx = DESK_HTML.indexOf('-- P13: student-initiated DM modal');
    expect(idx).toBeGreaterThan(-1);
    var region = DESK_HTML.slice(idx, idx + 120);
    expect(region).not.toMatch(/[─-╿]/);   // box-drawing range
  });
});
