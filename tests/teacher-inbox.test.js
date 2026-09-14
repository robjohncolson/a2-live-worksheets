// teacher-inbox.test.js -- the student-message inbox strip on teacher-dashboard.html
// (2026-09-09). Student→teacher messages used to be visible only inside ONE
// student's drawer; two "I can't see my grade" notes went unread for two weeks.
//
// Layers:
//   1. Static source pins (endpoint, storage key, textContent-only rendering).
//   2. JSDOM behavior: render, unread badge, mark-read, XSS safety, click → drawer,
//      and the fetch URL loadStudentInbox builds.
//
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');

function makeDom(fetchMock) {
  const cleaned = DASH.replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(cleaned, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.rosterClient = { token: () => null, current: () => null };
  window.fetch = fetchMock || vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [], messages: [] }),
  });
  return dom;
}

const MSG = (over = {}) => ({
  nudgeId: 'dm:peach_whale:1',
  senderUsername: 'peach_whale',
  section: 'PeriodE',
  text: 'I have done the quiz for 1.10, but I can\'t see the grade.',
  createdAt: '2026-08-27T01:47:00.000Z',
  parentNudgeId: null,
  ...over,
});

describe('teacher-dashboard inbox — static pins', () => {
  it('has the strip markup, calls the inbox endpoint after class load, and polls', () => {
    expect(DASH).toContain('id="inbox-strip"');
    expect(DASH).toContain('id="inbox-unread"');
    expect(DASH).toContain('id="inbox-mark-read"');
    expect(DASH).toContain("'/teacher/nudge-inbox?limit=50'");
    expect(DASH).toContain("var INBOX_SEEN_KEY = 'tsc-inbox-seen-at';");
    expect(DASH).toContain('loadStudentInbox();                   // 📨 student→teacher messages');
    expect(DASH).toContain('startInboxPolling();');
    expect(DASH).toContain('var INBOX_POLL_MS = 60000;');
  });

  it('renders student text with textContent only (untrusted input) and sends teacher auth headers', () => {
    const block = DASH.slice(DASH.indexOf('function renderStudentInbox'), DASH.indexOf('function openTscDrawer'));
    expect(block).toContain('text.textContent = String(m.text || \'\');');
    expect(block.match(/innerHTML/g)).toHaveLength(1);        // only the list reset below
    expect(block).toContain("list.innerHTML = '';");
    expect(block).toContain('headers: teacherAuthHeaders()');
  });
});

describe('teacher-dashboard inbox — JSDOM behavior', () => {
  it('renders messages newest-first, badges unread ones, and never injects HTML from student text', () => {
    const dom = makeDom();
    const w = dom.window;
    expect(typeof w.renderStudentInbox).toBe('function');
    w.document.getElementById('section-filter').value = '';
    w.localStorage.removeItem('tsc-inbox-seen-at:all');

    w.renderStudentInbox([
      MSG({ text: '<img src=x onerror="window.__pwned=1">' }),
      MSG({ nudgeId: 'dm:melon_otter:2', senderUsername: 'melon_otter', createdAt: '2026-08-20T18:46:00.000Z', text: 'How do I improve my grade?' }),
    ]);

    const strip = w.document.getElementById('inbox-strip');
    expect(strip.hidden).toBe(false);
    const items = w.document.querySelectorAll('#inbox-list li');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('unread')).toBe(true);
    expect(items[1].classList.contains('unread')).toBe(true);
    expect(items[0].getAttribute('data-username')).toBe('peach_whale');
    expect(items[0].querySelector('img')).toBeNull();
    expect(items[0].querySelector('.inbox-text').textContent).toBe('<img src=x onerror="window.__pwned=1">');
    expect(w.__pwned).toBeUndefined();
    expect(items[0].querySelector('.inbox-who').textContent).toBe('@peach_whale');   // not in a loaded roster yet

    const badge = w.document.getElementById('inbox-unread');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('2 new');
    expect(w.document.getElementById('inbox-meta').textContent).toBe('2 messages');
  });

  it('Mark all read stores the newest createdAt and clears the badge; older seen-at keeps newer rows unread', () => {
    const dom = makeDom();
    const w = dom.window;
    w._inboxSection = 'PeriodB';   // the section of the displayed fetch, not the edited input
    w.localStorage.setItem('tsc-inbox-seen-at:PeriodB', '2026-08-21T00:00:00.000Z');
    w.renderStudentInbox([
      MSG(),                                                                     // 08-27 → newer than seen-at
      MSG({ nudgeId: 'x2', senderUsername: 'melon_otter', createdAt: '2026-08-20T18:46:00.000Z' }),   // older → read
    ]);
    let items = w.document.querySelectorAll('#inbox-list li');
    expect(items[0].classList.contains('unread')).toBe(true);
    expect(items[1].classList.contains('unread')).toBe(false);
    expect(w.document.getElementById('inbox-unread').textContent).toBe('1 new');

    w.document.getElementById('inbox-mark-read').click();
    expect(w.localStorage.getItem('tsc-inbox-seen-at:PeriodB')).toBe('2026-08-27T01:47:00.000Z');
    items = w.document.querySelectorAll('#inbox-list li');
    expect(items[0].classList.contains('unread')).toBe(false);
    expect(w.document.getElementById('inbox-unread').hidden).toBe(true);

    // scoped: a different section keeps its own marker, so its messages are still new
    w._inboxSection = 'PeriodE';
    w.renderStudentInbox([MSG()]);
    expect(w.localStorage.getItem('tsc-inbox-seen-at:PeriodE')).toBeNull();
    expect(w.document.querySelector('#inbox-list li').classList.contains('unread')).toBe(true);
    expect(w.document.getElementById('inbox-unread').hidden).toBe(false);
  });

  it('shows the real name from the loaded class payload and opens that student\'s drawer on click', () => {
    const dom = makeDom();
    const w = dom.window;
    w.lastPacingPayload = { students: [{ studentId: 'stu_pw', username: 'Peach_Whale', realName: 'Elmer L.', section: 'PeriodE' }] };
    w.renderStudentInbox([MSG()]);
    const li = w.document.querySelector('#inbox-list li');
    expect(li.querySelector('.inbox-who').textContent).toBe('Elmer L.');   // case-insensitive username match
    li.click();
    expect(w.document.getElementById('tsc-drawer-title').textContent).toBe('Elmer L.');
    expect(w.document.getElementById('tsc-drawer-subtitle').textContent).toContain('@Peach_Whale');
  });

  it('an empty inbox still shows the strip with an explicit empty row', () => {
    const dom = makeDom();
    const w = dom.window;
    w.renderStudentInbox([]);
    expect(w.document.getElementById('inbox-strip').hidden).toBe(false);
    expect(w.document.querySelector('#inbox-list li.inbox-empty').textContent).toBe('No student messages yet.');
    expect(w.document.getElementById('inbox-unread').hidden).toBe(true);
  });

  it('loadStudentInbox fetches /teacher/nudge-inbox for the typed section and renders the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, messages: [MSG()], count: 1 }),
    });
    const dom = makeDom(fetchMock);
    const w = dom.window;
    w.document.getElementById('section-filter').value = 'PeriodE';
    await w.loadStudentInbox();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/teacher/nudge-inbox'));
    expect(call).toBeTruthy();
    expect(String(call[0])).toMatch(/\/teacher\/nudge-inbox\?limit=50&section=PeriodE$/);
    expect(w.document.querySelectorAll('#inbox-list li')).toHaveLength(1);
  });

  it('loadStudentInbox surfaces a failure in the strip instead of throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden', json: async () => ({ ok: false, error: 'forbidden' }) });
    const dom = makeDom(fetchMock);
    const w = dom.window;
    await expect(w.loadStudentInbox()).resolves.toBeUndefined();
    expect(w.document.getElementById('inbox-strip').hidden).toBe(false);
    expect(w.document.getElementById('inbox-meta').textContent).toContain('inbox unavailable');
  });
});


describe('inbox polling lifecycle', () => {
  it.each([401, 503])('%s stops polling until an explicit load retries it', async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ok:false,status});
    const dom = makeDom(fetchMock); const w=dom.window;
    try {
      const loading = w.loadStudentInbox(); w.startInboxPolling(); await loading;
      await vi.advanceTimersByTimeAsync(120000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(w.document.getElementById('inbox-meta').textContent).toBe('inbox unavailable ('+status+')');
      fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>({messages:[]})});
      await w.loadStudentInbox(); w.startInboxPolling();
      await vi.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { w.close(); vi.useRealTimers(); }
  });
  it('network errors keep polling', async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockRejectedValue(new Error('offline'));
    const w=makeDom(fetchMock).window;
    try { await w.loadStudentInbox();w.startInboxPolling();await vi.advanceTimersByTimeAsync(120000);expect(fetchMock).toHaveBeenCalledTimes(3); }
    finally {w.close();vi.useRealTimers();}
  });
  it.each(['teacher-token', null])('boot loads only with credentials: %s', async token => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({messages:[]})});
    const w=makeDom(fetchMock).window;
    w.rosterClient.token=()=>token;
    try {
      await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      await new Promise(resolve=>setTimeout(resolve,0));
      expect(fetchMock.mock.calls.filter(c=>String(c[0]).includes('/teacher/nudge-inbox'))).toHaveLength(token?1:0);
    } finally { w.close(); }
  });
  it('marks the fetched section even if the filter changes while loading or before mark-read', async () => {
    let reply;
    const w=makeDom(vi.fn(()=>new Promise(resolve=>{reply=resolve;}))).window;
    try {
      w.document.getElementById('section-filter').value='PeriodB';
      const loading=w.loadStudentInbox(); await Promise.resolve();
      w.document.getElementById('section-filter').value='PeriodE';
      reply({ok:true,status:200,json:async()=>({messages:[MSG()]})});await loading;
      w.document.getElementById('inbox-mark-read').click();
      expect(w.localStorage.getItem('tsc-inbox-seen-at:PeriodB')).toBe(MSG().createdAt);
      expect(w.localStorage.getItem('tsc-inbox-seen-at:PeriodE')).toBeNull();
      expect(w.document.getElementById('inbox-unread').hidden).toBe(true);
    } finally { w.close(); }
  });
});
