/**
 * tests/nudge-toast-stack.test.js
 *
 * T2 of TEACHER_STUDENT_CONSOLE_P6_BUILD.md (section 3.5).
 * Behavioral tests for the stacked nudge toast surface.
 *
 * Mirrors tests/desk-view-as.test.js's vm harness pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'node:url';
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

// ---------------------------------------------------------------------------
// Fake DOM helpers
// ---------------------------------------------------------------------------

// Build a minimal fake toast element (mirrors what the template content produces).
function makeToastEl(nudgeId) {
  const handlers = {};
  const children = [];
  // Simple fake element with querySelector support.
  function makeEl(tag, cls) {
    return {
      _tag: tag,
      _cls: cls || '',
      textContent: '',
      value: '',
      disabled: false,
      style: {},
      setAttribute: function() {},
      getAttribute: function() { return null; },
      _listeners: {},
      addEventListener: function(evt, fn) { this._listeners[evt] = fn; },
      click: function() { if (this._listeners['click']) this._listeners['click'](); },
      parentNode: null,
      removeChild: function(child) {
        const idx = this._children ? this._children.indexOf(child) : -1;
        if (idx !== -1) this._children.splice(idx, 1);
      },
      _children: [],
    };
  }
  const toast = makeEl('div', 'nudge-toast');
  const fromEl = makeEl('strong', 'nt-from-name');
  const textEl = makeEl('p', 'nt-text');
  const closeBtn = makeEl('button', 'nt-close');
  const sendBtn = makeEl('button', 'nt-send');
  const textarea = makeEl('textarea', '');
  const replyDiv = makeEl('div', 'nt-reply');
  replyDiv._children = [textarea];
  toast._children = [fromEl, textEl, closeBtn, replyDiv, sendBtn];

  toast.querySelector = function(sel) {
    if (sel === '.nt-from-name') return fromEl;
    if (sel === '.nt-text') return textEl;
    if (sel === '.nt-close') return closeBtn;
    if (sel === '.nt-send') return sendBtn;
    if (sel === '.nt-reply textarea') return textarea;
    return null;
  };

  return { toast, fromEl, textEl, closeBtn, sendBtn, textarea };
}

// Build a fake container that tracks appended children.
function makeContainer() {
  const appended = [];
  return {
    appended,
    appendChild: function(el) {
      el.parentNode = this;
      appended.push(el);
      this._children = appended;
    },
    removeChild: function(el) {
      const idx = appended.indexOf(el);
      if (idx !== -1) appended.splice(idx, 1);
    },
    get childCount() { return appended.length; },
    _children: appended,
  };
}

// Build a fake <template> with a .content.firstElementChild.cloneNode factory.
// Each call to cloneNode produces a fresh fake toast element.
function makeTemplate() {
  const clones = [];
  return {
    _clones: clones,
    content: {
      firstElementChild: {
        cloneNode: function(deep) {
          const { toast, fromEl, textEl, closeBtn, sendBtn, textarea } = makeToastEl();
          // Give each clone a unique _id for tracking.
          const idx = clones.length;
          toast._cloneIdx = idx;
          clones.push({ toast, fromEl, textEl, closeBtn, sendBtn, textarea });
          return toast;
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Core sandbox builder
// ---------------------------------------------------------------------------

function buildSandbox({ warnLines, chimeCalls } = {}) {
  const warns = warnLines || [];
  const chimes = chimeCalls || [];
  const container = makeContainer();
  const template = makeTemplate();

  const ids = {
    'nudge-toast-stack': container,
    'nudge-toast-template': template,
  };

  const sandbox = {
    document: {
      getElementById: (id) => ids[id] || null,
    },
    _playNudgeChime: function() { chimes.push(Date.now()); },
    window: {
      ROSTER_SERVICE_URL: null,
      rosterClient: null,
    },
    fetch: null,
    JSON,
    String,
    Math,
    Date,
    Infinity,
    Array,
    Map,
    console: {
      warn: function() { warns.push(Array.from(arguments).join(' ')); },
      log: function() {},
    },
    Promise,
    setTimeout: function(fn) { fn(); },
  };
  createContext(sandbox);

  const code = [
    'var MAX_NUDGE_STACK = 4;',
    'var _activeNudges = new Map();',
    fnBody(html, '_showNudgeToast'),
    fnBody(html, '_hideNudgeToast'),
    fnBody(html, '_hideNudgeToastById'),
    fnBody(html, '_sendNudgeReplyForId'),
    fnBody(html, '_sendNudgeReply'),
    'this.__show = _showNudgeToast;',
    'this.__hide = _hideNudgeToast;',
    'this.__hideById = _hideNudgeToastById;',
    'this.__sendById = _sendNudgeReplyForId;',
    'this.__send = _sendNudgeReply;',
    'this.__nudges = _activeNudges;',
    'this.__container = document.getElementById("nudge-toast-stack");',
    'this.__template = document.getElementById("nudge-toast-template");',
  ].join('\n');

  runInContext(code, sandbox, { filename: pathToFileURL(resolve(REPO_ROOT, 'desk.html')).href });
  return sandbox;
}

// ============================================================================
// 1. Stack DOM presence (source-level)
// ============================================================================

describe('Stack DOM presence', () => {
  it('the container #nudge-toast-stack exists in the HTML source and is empty by default', () => {
    // The element has no pre-populated children (it starts empty, toasts appended by JS).
    expect(html).toMatch(/id="nudge-toast-stack"/);
    // No inline children between the tags.
    const m = html.match(/<div id="nudge-toast-stack"[^>]*>([\s\S]*?)<\/div>/);
    expect(m).toBeTruthy();
    // Content between tags should be blank / whitespace only.
    expect(m[1].trim()).toBe('');
  });

  it('the template #nudge-toast-template exists and is a <template> element', () => {
    expect(html).toMatch(/<template\s+id="nudge-toast-template"/);
  });
});

// ============================================================================
// 2. _showNudgeToast appends to stack
// ============================================================================

describe('_showNudgeToast appends to stack', () => {
  it('first call -> 1 child in the container', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'a', text: 'hello', fromUsername: 'mr.colson' });
    expect(sb.__container.appended.length).toBe(1);
  });

  it('second call (different nudgeId) -> 2 children, both visible', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'a', text: 'first', fromUsername: 'mr.colson' });
    sb.__show({ nudgeId: 'b', text: 'second', fromUsername: 'mr.colson' });
    expect(sb.__container.appended.length).toBe(2);
  });

  it('both toasts show their respective text and fromUsername', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'a', text: 'msg-A', fromUsername: 'colson' });
    sb.__show({ nudgeId: 'b', text: 'msg-B', fromUsername: 'jones' });
    const clones = sb.__template._clones;
    expect(clones[0].textEl.textContent).toBe('msg-A');
    expect(clones[0].fromEl.textContent).toBe('colson');
    expect(clones[1].textEl.textContent).toBe('msg-B');
    expect(clones[1].fromEl.textContent).toBe('jones');
  });

  it('_activeNudges.size === 2 after two distinct nudges', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'a', text: 't1', fromUsername: 'x' });
    sb.__show({ nudgeId: 'b', text: 't2', fromUsername: 'x' });
    expect(sb.__nudges.size).toBe(2);
  });
});

// ============================================================================
// 3. Idempotency
// ============================================================================

describe('Idempotency', () => {
  it('calling _showNudgeToast twice with the SAME nudgeId -> only 1 child', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'X', text: 'once', fromUsername: 'teacher' });
    sb.__show({ nudgeId: 'X', text: 'again', fromUsername: 'teacher' });
    expect(sb.__container.appended.length).toBe(1);
    expect(sb.__nudges.size).toBe(1);
  });
});

// ============================================================================
// 4. Per-toast close + reply
// ============================================================================

describe('Per-toast close + reply', () => {
  it('clicking .nt-close on toast A removes toast A but leaves toast B intact', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'A', text: 'ta', fromUsername: 'teacher' });
    sb.__show({ nudgeId: 'B', text: 'tb', fromUsername: 'teacher' });
    expect(sb.__nudges.size).toBe(2);
    // Click close on the first clone (toast A).
    sb.__template._clones[0].closeBtn.click();
    expect(sb.__nudges.size).toBe(1);
    expect(sb.__nudges.has('A')).toBe(false);
    expect(sb.__nudges.has('B')).toBe(true);
  });

  it('after send on toast B, toast B is removed but toast A is still visible', async () => {
    const sentMessages = [];
    const sb = buildSandbox();
    sb.window.ROSTER_SERVICE_URL = 'https://roster.test';
    sb.window.rosterClient = { token: () => 'TOK' };
    sb.fetch = async (url, opts) => {
      expect(url).toBe('https://roster.test/student/nudge-reply');
      expect(opts.headers.Authorization).toBe('Bearer TOK');
      sentMessages.push(JSON.parse(opts.body));
      return { ok: true };
    };

    sb.__show({ nudgeId: 'A', text: 'ta', fromUsername: 'teacher' });
    sb.__show({ nudgeId: 'B', text: 'tb', fromUsername: 'teacher' });

    // Fill in reply text for toast B (2nd clone).
    sb.__template._clones[1].textarea.value = 'reply text';
    // Trigger send for toast B directly.
    await sb.__sendById('B');

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].parentNudgeId).toBe('B');
    expect(sentMessages[0].text).toBe('reply text');
    // B removed, A still present.
    expect(sb.__nudges.has('B')).toBe(false);
    expect(sb.__nudges.has('A')).toBe(true);
  });
});

// ============================================================================
// 5. Overflow drops oldest
// ============================================================================

describe('Overflow drops oldest', () => {
  it('pushing 5 nudges -> stack size = MAX_NUDGE_STACK (4)', () => {
    const warns = [];
    const sb = buildSandbox({ warnLines: warns });
    sb.__show({ nudgeId: '1', text: 't1', fromUsername: 'x' });
    sb.__show({ nudgeId: '2', text: 't2', fromUsername: 'x' });
    sb.__show({ nudgeId: '3', text: 't3', fromUsername: 'x' });
    sb.__show({ nudgeId: '4', text: 't4', fromUsername: 'x' });
    sb.__show({ nudgeId: '5', text: 't5', fromUsername: 'x' });
    expect(sb.__nudges.size).toBe(4);
    expect(sb.__container.appended.length).toBe(4);
  });

  it('the 1st (oldest) nudge is dropped; nudges 2-5 remain', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: '1', text: 't1', fromUsername: 'x' });
    sb.__show({ nudgeId: '2', text: 't2', fromUsername: 'x' });
    sb.__show({ nudgeId: '3', text: 't3', fromUsername: 'x' });
    sb.__show({ nudgeId: '4', text: 't4', fromUsername: 'x' });
    sb.__show({ nudgeId: '5', text: 't5', fromUsername: 'x' });
    expect(sb.__nudges.has('1')).toBe(false);
    expect(sb.__nudges.has('2')).toBe(true);
    expect(sb.__nudges.has('3')).toBe(true);
    expect(sb.__nudges.has('4')).toBe(true);
    expect(sb.__nudges.has('5')).toBe(true);
  });

  it('a console.warn line is emitted naming the dropped nudgeId', () => {
    const warns = [];
    const sb = buildSandbox({ warnLines: warns });
    sb.__show({ nudgeId: 'drop-me', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'keep-2', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'keep-3', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'keep-4', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'keep-5', text: 't', fromUsername: 'x' });
    expect(warns.some(w => w.includes('drop-me'))).toBe(true);
  });
});

// ============================================================================
// 6. Backward-compatible no-arg helpers
// ============================================================================

describe('Backward-compatible no-arg helpers', () => {
  it('_hideNudgeToast() with no args clears every toast', () => {
    const sb = buildSandbox();
    sb.__show({ nudgeId: 'a', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'b', text: 't', fromUsername: 'x' });
    expect(sb.__nudges.size).toBe(2);
    sb.__hide();
    expect(sb.__nudges.size).toBe(0);
  });

  it('_sendNudgeReply() with no args targets the oldest visible toast', async () => {
    const sentMessages = [];
    const sb = buildSandbox();
    sb.window.ROSTER_SERVICE_URL = 'https://roster.test';
    sb.window.rosterClient = { token: () => 'TOK' };
    sb.fetch = async (url, opts) => {
      expect(url).toBe('https://roster.test/student/nudge-reply');
      expect(opts.headers.Authorization).toBe('Bearer TOK');
      sentMessages.push(JSON.parse(opts.body));
      return { ok: true };
    };

    // Two toasts; oldest is 'first'.
    sb.__show({ nudgeId: 'first', text: 't', fromUsername: 'teacher' });
    sb.__show({ nudgeId: 'second', text: 't', fromUsername: 'teacher' });

    // Fill in reply text on the OLDEST toast (first clone).
    sb.__template._clones[0].textarea.value = 'oldest reply';

    await sb.__send();

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].parentNudgeId).toBe('first');
    expect(sentMessages[0].text).toBe('oldest reply');
  });
});

// ============================================================================
// 7. Chime plays per arrival
// ============================================================================

describe('Chime plays per arrival', () => {
  it('each _showNudgeToast call invokes _playNudgeChime once', () => {
    const chimes = [];
    const sb = buildSandbox({ chimeCalls: chimes });
    sb.__show({ nudgeId: 'a', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'b', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'c', text: 't', fromUsername: 'x' });
    expect(chimes.length).toBe(3);
  });

  it('idempotent (duplicate nudgeId) does NOT play another chime', () => {
    const chimes = [];
    const sb = buildSandbox({ chimeCalls: chimes });
    sb.__show({ nudgeId: 'dup', text: 't', fromUsername: 'x' });
    sb.__show({ nudgeId: 'dup', text: 't', fromUsername: 'x' });
    expect(chimes.length).toBe(1);
  });
});

// ============================================================================
// 8. Server roster log fetch
// ============================================================================

describe('Server roster log fetch', () => {
  it('when ROSTER_SERVICE_URL + token are set, _sendNudgeReplyForId POSTs to /student/nudge-reply', async () => {
    const fetches = [];
    const sb = buildSandbox();
    sb.window.ROSTER_SERVICE_URL = 'https://roster.example.com';
    sb.window.rosterClient = { token: () => 'TOK' };
    sb.fetch = (url, opts) => {
      fetches.push({ url, opts });
      return Promise.resolve({ json: async () => ({ ok: true }) });
    };

    sb.__show({ nudgeId: 'r1', text: 'hello', fromUsername: 'mr.colson' });
    sb.__template._clones[0].textarea.value = 'reply body';
    await sb.__sendById('r1');

    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toBe('https://roster.example.com/student/nudge-reply');
    expect(fetches[0].opts.method).toBe('POST');
    const body = JSON.parse(fetches[0].opts.body);
    expect(body.parentNudgeId).toBe('r1');
    expect(body.recipientUsername).toBe('mr.colson');
    expect(body.text).toBe('reply body');
    expect(fetches[0].opts.headers['Authorization']).toBe('Bearer TOK');
  });

  it('skips the fetch when ROSTER_SERVICE_URL is not set', async () => {
    const fetches = [];
    const sb = buildSandbox();
    // ROSTER_SERVICE_URL is null (default in buildSandbox).
    sb.fetch = (url, opts) => { fetches.push({ url, opts }); return Promise.resolve({}); };

    sb.__show({ nudgeId: 'r2', text: 'hi', fromUsername: 'teacher' });
    sb.__template._clones[0].textarea.value = 'a reply';
    await sb.__sendById('r2');

    expect(fetches.length).toBe(0);
  });
});

describe('retained roster reply boundaries', () => {
  it('uses literal sender/message text and does not send a blank reply', async () => {
    const sb = buildSandbox();
    const fetchMock = vi.fn();
    sb.fetch = fetchMock;
    sb.window.ROSTER_SERVICE_URL = 'https://roster.test';
    sb.window.rosterClient = { token: () => 'TOK' };
    sb.__show({ nudgeId: 'safe', fromUsername: '<img src=x>', text: '<b>Review functions</b>' });
    const toast = sb.__template._clones[0];
    expect(toast.fromEl.textContent).toBe('<img src=x>');
    expect(toast.textEl.textContent).toBe('<b>Review functions</b>');
    toast.textarea.value = '   ';
    await sb.__sendById('safe');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sb.__nudges.has('safe')).toBe(true);
  });

  it('bounds reply text and contains fetch errors without disturbing other messages', async () => {
    const sb = buildSandbox();
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    sb.fetch = fetchMock;
    sb.window.ROSTER_SERVICE_URL = 'https://roster.test';
    sb.window.rosterClient = { token: () => 'TOK' };
    sb.__show({ nudgeId: 'reply', fromUsername: 'teacher', text: 'Review functions' });
    sb.__show({ nudgeId: 'other', fromUsername: 'teacher', text: 'Keep this message' });
    sb.__template._clones[0].textarea.value = '  ' + 'x'.repeat(300) + '  ';
    await expect(sb.__sendById('reply')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      parentNudgeId: 'reply', recipientUsername: 'teacher', text: 'x'.repeat(280),
    });
    expect(sb.__nudges.has('other')).toBe(true);
  });
});
