import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'teacher-dashboard.html'), 'utf8');
const source = readFileSync(resolve(root, 'teacher-worksheet-diagnostics.js'), 'utf8');
const windows = [];
const row = (extra = {}) => ({ studentId: 'student', realName: 'Test Student', username: 'test_login', deviceId: 'abcdef1234', worksheet: 'WS-U1L1', mode: 'student', outcome: 'loaded', downloaded: 37, saved: 37, matched: 37, restored: 37, edited: 0, filled: 37, fields: 40, build: 'test-build', observedAt: Date.now(), receivedAt: Date.now(), ...extra });
async function boot(fetch, credentials = true, rosterFetch = async () => ({ ok: true, json: async () => ({ ok: true, students: [] }) })) {
  const dom = new JSDOM(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), { runScripts: 'outside-only', url: 'https://example.com', pretendToBeVisual: true });
  const w = dom.window; windows.push(w); w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.setInterval = setInterval; w.fetch = (url, options) => url.endsWith('/roster/list') ? rosterFetch(url, options) : fetch(url, options);
  w.eval(source); w.installWorksheetDiagnosticsPanel({ url: () => 'https://roster.example.com', headers: () => credentials ? { Authorization: 'Bearer teacher' } : {} });
  await vi.advanceTimersByTimeAsync(0); return w;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { windows.splice(0).forEach(w => w.close()); vi.clearAllTimers(); vi.useRealTimers(); });
describe('teacher worksheet report panel', () => {
  it('loads on boot and hides teacher previews until explicitly included', async () => {
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row(), row({ mode: 'teacher-preview', outcome: 'auth' })] }) }));
    const body = w.document.getElementById('worksheet-diagnostics-rows'); expect(body.children).toHaveLength(1); expect(body.textContent).toContain('showing saved: 37');
    const toggle = w.document.getElementById('worksheet-diagnostics-previews'); toggle.checked = true; toggle.dispatchEvent(new w.Event('change')); expect(body.children).toHaveLength(2); expect(body.textContent).toContain('TEACHER PREVIEW');
  });
  it('lists students without reports, filters by ID and preserves selection on refresh', async () => {
    const rosterFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, students: [
      { studentId: 'other', realName: 'Alex', section: 'PeriodE' },
      { studentId: 'student', realName: 'Alex', section: 'PeriodB' },
      { studentId: 'absent', realName: 'Zoe', section: 'PeriodB' },
      { studentId: 'archived', realName: 'Old', status: 'archived' }
    ] }) });
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row(), row({ studentId: 'other' })] }) }), true, rosterFetch);
    const select = w.document.getElementById('worksheet-diagnostics-student');
    const body = w.document.getElementById('worksheet-diagnostics-rows');
    expect([...select.options].map(o => o.value)).toEqual(['', 'other', 'student', 'absent']);
    select.value = 'student'; select.dispatchEvent(new w.Event('change')); expect(body.children).toHaveLength(1);
    w.document.getElementById('worksheet-diagnostics-refresh').click(); await vi.advanceTimersByTimeAsync(0);
    expect(select.value).toBe('student'); expect(body.children).toHaveLength(1);
    select.value = 'absent'; select.dispatchEvent(new w.Event('change')); expect(body.children).toHaveLength(0);
    expect(w.document.getElementById('worksheet-diagnostics-meta').textContent).toContain('No matching browser reports yet');
    select.value = ''; select.dispatchEvent(new w.Event('change')); expect(body.children).toHaveLength(2);
  });
  it('keeps reports usable when the roster request fails', async () => {
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row()] }) }), true, async () => { throw new Error('offline'); });
    expect(w.document.getElementById('worksheet-diagnostics-rows').children).toHaveLength(1);
    expect(w.document.getElementById('worksheet-diagnostics-roster-status').textContent).toContain('Student names unavailable');
  });
  it('uses the configured live service on a fresh hosted dashboard while honoring explicit choices', () => {
    const start = html.indexOf('(function wireUrlDropdown()');
    const end = html.indexOf('})();', start) + 5;
    const dom = new JSDOM(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), { runScripts: 'outside-only', url: 'https://example.com/' });
    const w = dom.window; windows.push(w);
    w.$ = id => w.document.getElementById(id);
    w.URL_KEY = 'a2_teacher_service_url'; w.GLOBAL_OVERRIDE_KEY = 'a2_roster_service_url_override';
    w.ROSTER_SERVICE_URL = 'https://a2-live-worksheets-production.up.railway.app'; w.FALLBACK_SVC = w.ROSTER_SERVICE_URL;
    w.eval(html.slice(start, end));
    expect(w.$('svc-url').value).toBe(w.ROSTER_SERVICE_URL);
    w.localStorage.setItem(w.URL_KEY, 'http://localhost:8091');
    w.eval(html.slice(start, end));
    expect(w.$('svc-url').value).toBe('http://localhost:8091');
  });
  it('does not fetch without credentials', async () => { const f = vi.fn(); await boot(f, false); await vi.advanceTimersByTimeAsync(120000); expect(f).not.toHaveBeenCalled(); });
  it.each([401, 503])('stops automatic polling after %s and retries manually', async status => {
    const f = vi.fn().mockResolvedValue({ ok: false, status }); const w = await boot(f); await vi.advanceTimersByTimeAsync(120000); expect(f).toHaveBeenCalledTimes(1);
    w.document.getElementById('worksheet-diagnostics-refresh').click(); await vi.advanceTimersByTimeAsync(0); expect(f).toHaveBeenCalledTimes(2);
  });
  it('keeps the fetched section label, escapes student names and filters locally', async () => {
    let finish; const f = vi.fn(() => new Promise(r => { finish = r; })); const w = await boot(f);
    w.document.getElementById('section-filter').value = 'PeriodE';
    finish({ ok: true, json: async () => ({ ok: true, rows: [row({ realName: '<img src=x onerror=alert(1)>' })] }) }); await vi.advanceTimersByTimeAsync(0);
    expect(w.document.getElementById('worksheet-diagnostics-rows').querySelector('img')).toBeNull(); expect(w.document.getElementById('worksheet-diagnostics-meta').textContent).not.toContain('PeriodE');
    const input = w.document.getElementById('worksheet-diagnostics-search'); input.value = 'nobody'; input.dispatchEvent(new w.Event('input')); expect(w.document.getElementById('worksheet-diagnostics-rows').children).toHaveLength(0);
  });
  it('distinguishes missing display, true empty history and recovered failures', async () => {
    const w = await boot(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row({ matched: 0 }), row({ outcome: 'empty', saved: 0, matched: 0 }), row({ lastFailure: { outcome: 'auth' } })] }) }));
    const text = w.document.getElementById('worksheet-diagnostics-rows').textContent; expect(text).toContain('Check display'); expect(text).toContain('Server confirmed no saved answers'); expect(text).toContain('Recovered after Sign-in rejected');
  });
});
