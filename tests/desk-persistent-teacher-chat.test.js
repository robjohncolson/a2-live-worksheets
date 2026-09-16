// @vitest-environment jsdom
/**
 * tests/desk-persistent-teacher-chat.test.js
 *
 * Phases 2 and 3 of persistent teacher/student chat:
 * - student unread badge from /student/nudge-history rows
 * - retained notification filtering and history polling
 * - teacher-only Desk compose -> authenticated POST /teacher/nudge
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

const CHAT_START = html.indexOf('var STUDENT_NUDGE_LAST_SEEN_KEY');
const CHAT_END = html.indexOf('// Wire on DOMContentLoaded');
if (CHAT_START < 0 || CHAT_END < 0) throw new Error('persistent chat source block not found');
const CHAT_SRC = html.slice(CHAT_START, CHAT_END);

function makeStore() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="menu-message-teacher">
      Message teacher...<span id="menu-message-teacher-badge" hidden>0</span>
    </div>
    <div id="student-dm-modal" style="display:none">
      <textarea id="sdm-text"></textarea>
      <div id="sdm-status"></div>
      <button id="sdm-send"></button>
      <ul id="sdm-history-list"></ul>
    </div>
    <div id="teacher-nudge-modal" style="display:none">
      <p id="tnm-recipient"></p>
      <textarea id="tnm-text"></textarea>
      <div id="tnm-status"></div>
      <button id="tnm-send"></button>
    </div>`;
}

function loadChat({ role = 'student', username = 'Papaya_Fox', fetchImpl } = {}) {
  setupDom();
  const fetches = [];
  const store = makeStore();
  const session = { username, role, realName: username.replace(/_/g, ' ') };
  const sandbox = {
    document,
    console,
    JSON,
    String,
    Number,
    Date,
    Math,
    Array,
    Promise,
    Object,
    isFinite,
    localStorage: store,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => { fn(); return 1; },
    fetch: (url, opts) => {
      fetches.push({ url, opts });
      if (fetchImpl) return fetchImpl(url, opts);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, rows: [] }) });
    },
    _deskIsTeacher: () => role === 'teacher',
    DeskRoster: { realName: () => '' },

  };
  sandbox.window = {
    ROSTER_SERVICE_URL: 'https://roster.test',
    rosterClient: {
      current: () => session,
      token: () => 'TOK',
    },
  };
  createContext(sandbox);
  runInContext(CHAT_SRC + `
    this.__chat = {
      history: _fetchStudentDmHistory,
      rememberRows: _studentNudgeRememberRows,
      unreadFromRows: _studentNudgeUnreadFromRows,
      openStudentDm: _openStudentDmModal,
      onNotify: _onNudgeNotify,
      openTeacher: _openTeacherNudgeModal,
      sendTeacher: _sendTeacherNudgeFromDesk,
    };
  `, sandbox, { filename: pathToFileURL(resolve(REPO_ROOT, 'desk.html')).href });
  return { sandbox, fetches, store, chat: sandbox.__chat };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('student unread badge', () => {
  it('counts teacher rows newer than a2_nudge_last_seen', () => {
    const { chat, store } = loadChat();
    store.setItem('a2_nudge_last_seen', '2026-06-01T10:00:00.000Z');
    const rows = [
      { direction: 'teacher', created_at: '2026-06-01T09:59:00.000Z', text: 'old' },
      { direction: 'student', created_at: '2026-06-01T10:10:00.000Z', text: 'mine' },
      { direction: 'teacher', created_at: '2026-06-01T10:11:00.000Z', text: 'new' },
    ];
    expect(chat.unreadFromRows(rows)).toBe(1);
    chat.rememberRows(rows);
    const badge = document.getElementById('menu-message-teacher-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('1');
    expect(document.getElementById('menu-message-teacher').classList.contains('has-unread')).toBe(true);
  });

  it('opening Message teacher clears the badge and records last seen', () => {
    const { chat, store } = loadChat({ fetchImpl: () => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, rows: [] }),
    }) });
    chat.rememberRows([{ direction: 'teacher', created_at: '2026-06-01T10:11:00.000Z', text: 'new' }]);
    expect(document.getElementById('menu-message-teacher-badge').hidden).toBe(false);
    chat.openStudentDm();
    expect(document.getElementById('student-dm-modal').style.display).toBe('block');
    expect(document.getElementById('menu-message-teacher-badge').hidden).toBe(true);
    expect(Date.parse(store.getItem('a2_nudge_last_seen'))).toBeGreaterThanOrEqual(
      Date.parse('2026-06-01T10:11:00.000Z')
    );
  });
});

describe('nudge_notify handling', () => {
  it('filters by lowercase roster username, dedupes, sets badge, and polls once', () => {
    const { chat, fetches } = loadChat({ username: 'Papaya_Fox' });
    chat.onNotify({
      type: 'nudge_notify',
      toUsernames: ['PAPAYA_FOX'],
      fromUsername: 'Teacher_One',
      nudgeId: 'n1',
      timestamp: 1234,
    });
    chat.onNotify({
      type: 'nudge_notify',
      toUsernames: ['papaya_fox'],
      fromUsername: 'Teacher_One',
      nudgeId: 'n1',
      timestamp: 1234,
    });
    expect(document.getElementById('menu-message-teacher-badge').hidden).toBe(false);
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/student\/nudge-history\?limit=20$/);
  });

  it('ignores not-for-me notifies and refetches history when the modal is open', () => {
    const { chat, fetches } = loadChat({ username: 'Papaya_Fox' });
    chat.onNotify({ type: 'nudge_notify', toUsernames: ['banana_cat'], fromUsername: 'teacher', nudgeId: 'x' });
    expect(document.getElementById('menu-message-teacher-badge').hidden).toBe(true);
    expect(fetches.length).toBe(0);

    document.getElementById('student-dm-modal').style.display = 'block';
    chat.onNotify({ type: 'nudge_notify', toUsernames: ['papaya_fox'], fromUsername: 'teacher', nudgeId: 'y' });
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toMatch(/\/student\/nudge-history\?limit=20$/);
  });

  
});

describe('teacher Desk compose', () => {
  

  it('POSTs durable /teacher/nudge for student polling', async () => {
    const { chat, fetches } = loadChat({ role: 'teacher', username: 'Teacher_One' });
    chat.openTeacher('Papaya_Fox');
    expect(document.getElementById('teacher-nudge-modal').style.display).toBe('block');
    document.getElementById('tnm-text').value = 'Please check the latest lesson.';
    await chat.sendTeacher();
    expect(fetches.length).toBe(1);
    expect(fetches[0].url).toBe('https://roster.test/teacher/nudge');
    expect(fetches[0].opts.headers.Authorization).toBe('Bearer TOK');
    const body = JSON.parse(fetches[0].opts.body);
    expect(body.recipientUsernames).toEqual(['papaya_fox']);
    expect(body.text).toBe('Please check the latest lesson.');
    expect(body.nudgeId).toMatch(/^n_/);
  });

  it('does not open compose for a student session', () => {
    const { chat } = loadChat({ role: 'student' });
    chat.openTeacher('Papaya_Fox');
    expect(document.getElementById('teacher-nudge-modal').style.display).toBe('none');
  });
});

describe('durable chat failure and safe history rendering', () => {
  it('renders teacher names and message markup as text', async () => {
    const row = { direction: 'teacher', created_at: '2026-09-16T12:00:00Z',
      sender_username: '<img src=x>', text: '<svg onload=bad()>Review domain and range</svg>' };
    const { chat, fetches } = loadChat({ fetchImpl: async () => ({
      ok: true, json: async () => ({ ok: true, rows: [row] }),
    }) });
    await chat.history();
    const list = document.getElementById('sdm-history-list');
    expect(list.textContent).toContain(row.sender_username);
    expect(list.textContent).toContain(row.text);
    expect(list.querySelector('img, svg, script')).toBeNull();
    expect(fetches[0].opts.headers.Authorization).toBe('Bearer TOK');
  });

  it('shows a history network error and can recover on a later fetch', async () => {
    let offline = true;
    const { chat } = loadChat({ fetchImpl: async () => {
      if (offline) throw new Error('offline');
      return { ok: true, json: async () => ({ ok: true, rows: [] }) };
    } });
    await chat.history();
    expect(document.getElementById('sdm-history-list').textContent).toBe('Error loading history.');
    offline = false;
    await chat.history();
    expect(document.getElementById('sdm-history-list').textContent).toBe('No messages yet.');
  });

  it.each(['network', 'http'])('preserves a teacher draft after a %s failure', async mode => {
    const { chat } = loadChat({ role: 'teacher', fetchImpl: async () => {
      if (mode === 'network') throw new Error('offline');
      return { ok: false, status: 503, json: async () => ({ ok: false, error: '<b>Unavailable</b>' }) };
    } });
    chat.openTeacher('Papaya_Fox');
    document.getElementById('tnm-text').value = 'Review domain and range.';
    await chat.sendTeacher();
    expect(document.getElementById('tnm-text').value).toBe('Review domain and range.');
    expect(document.getElementById('tnm-send').disabled).toBe(false);
    const status = document.getElementById('tnm-status');
    expect(status.classList.contains('is-error')).toBe(true);
    expect(status.textContent).toContain(mode === 'network' ? 'offline' : '<b>Unavailable</b>');
    expect(status.querySelector('b')).toBeNull();
  });
});
