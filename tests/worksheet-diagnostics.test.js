import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const html = read('lib/worksheet-hydration.js');
const hydrate = html;
const windows = [];
const ledger = Array.from({ length: 37 }, (_, i) => ({ item_id: 'WS-U1L1-Q' + (i + 1), response: 'PRIVATE ANSWER ' + i, score: 1 }));
function boot({ loadStatus = 200, reportStatus = 200, fetchOverride, stored = [] } = {}) {
  // Synthetic URL exercises the retained watchdog parser; no AP page is read.
  const dom = new JSDOM('<body>' + ledger.map(r => '<input class="blank" data-question-id="' + r.item_id + '">').join('') + '</body>', { url: 'https://example.com/u1_lesson1_live.html', runScripts: 'outside-only' });
  const w = dom.window; windows.push(w);
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout;
  w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'student-a', username: 'test_student', token: 'SECRET_TOKEN' }));
  w.localStorage.setItem('a2_worksheet_diagnostics.v1', JSON.stringify(stored));
  w.ROSTER_SERVICE_URL = 'https://roster.example.com';
  const reports = [];
  w.fetch = vi.fn(async (url, options) => {
    if (String(url).includes('/student/worksheet-diagnostics')) { reports.push(JSON.parse(options.body)); return { ok: reportStatus === 200, status: reportStatus, json: async () => ({ ok: true }) }; }
    if (fetchOverride) return fetchOverride(url, options);
    return { ok: loadStatus === 200, status: loadStatus, json: async () => ({ ok: true, rows: ledger }) };
  });
  w.eval(read('roster-client.js')); w.eval(read('worksheet-diagnostics.js')); w.eval(read('gradebook-client.js'));
  w.gbWsPrefix = () => 'WS-U1L1'; w._markRestored = () => {}; w.eval(hydrate);
  return { w, reports };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const w of windows.splice(0)) w.close(); vi.clearAllTimers(); vi.useRealTimers(); });
describe('automatic worksheet reports', () => {
  it('reports the actual 37-answer restoration, not just a successful grade fetch', async () => {
    const { w, reports } = boot(); await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    expect(reports.at(-1)).toMatchObject({ studentId: 'student-a', worksheet: 'WS-U1L1', outcome: 'loaded', saved: 37, matched: 37, restored: 37, filled: 37 });
    expect(JSON.stringify(reports)).not.toMatch(/PRIVATE ANSWER|SECRET_TOKEN|test_student/);
    expect(w.localStorage.getItem('a2_worksheet_diagnostics.v1')).toBe('[]');
  });
  it('distinguishes protected edits from restored saved answers', async () => {
    const { w, reports } = boot(); const field = w.document.querySelector('input'); field.value = 'NEW PRIVATE ANSWER'; field.dispatchEvent(new w.Event('input', { bubbles: true }));
    await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    expect(reports.at(-1)).toMatchObject({ saved: 37, matched: 36, restored: 36, edited: 1, filled: 37 });
    expect(JSON.stringify(reports)).not.toContain('NEW PRIVATE ANSWER');
  });
  it.each([401, 403, 503])('reports HTTP %s instead of pretending the worksheet is empty', async status => {
    const { w, reports } = boot({ loadStatus: status }); await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    expect(reports[0]).toMatchObject({ outcome: status === 503 ? 'network' : 'auth', httpStatus: status, matched: 0 });
  });
  it('reports hung downloads as timeouts', async () => {
    const { w, reports } = boot({ fetchOverride: () => new Promise(() => {}) }); const done = w.hydratePriorAnswers();
    await vi.advanceTimersByTimeAsync(10000); await done; await vi.advanceTimersByTimeAsync(0);
    expect(reports[0].outcome).toBe('timeout');
  });
  it('reports worksheet initialization failures without relying on the failed worksheet code', async () => {
    const { w, reports } = boot(); await vi.advanceTimersByTimeAsync(20000);
    expect(reports[0]).toMatchObject({ outcome: 'client-error', worksheet: 'WS-U1L1' });
  });
  it('keeps failed delivery locally and retries after reconnect', async () => {
    const { w, reports } = boot({ reportStatus: 503 }); await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    const pending = JSON.parse(w.localStorage.getItem('a2_worksheet_diagnostics.v1')); expect(pending).toHaveLength(1); expect(JSON.stringify(pending)).not.toMatch(/SECRET_TOKEN|PRIVATE ANSWER/);
    w.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }); w.dispatchEvent(new w.Event('online')); await vi.advanceTimersByTimeAsync(0);
    expect(w.localStorage.getItem('a2_worksheet_diagnostics.v1')).toBe('[]');
  });
  it('replays a stored report after reload and drops unknown stored fields before transmission', async () => {
    const stored = [{ ownerId: 'student-a', studentId: 'student-a', deviceId: 'a'.repeat(24), reportId: 'b'.repeat(24), worksheet: 'WS-U1L1', observedAt: Date.now(), outcome: 'auth', build: 'test', fields: 37, downloaded: 0, saved: 0, matched: 0, restored: 0, filled: 0, edited: 0, answer: 'DO NOT SEND', token: 'DO NOT SEND' }];
    const { w, reports } = boot({ stored });
    await vi.advanceTimersByTimeAsync(0);
    expect(reports).toHaveLength(1);
    expect(JSON.stringify(reports)).not.toContain('DO NOT SEND');
    expect(w.localStorage.getItem('a2_worksheet_diagnostics.v1')).toBe('[]');
  });
  it('does not discard a report on an HTTP 200 without a positive storage acknowledgement', async () => {
    const { w } = boot({ reportStatus: 503 });
    await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    w.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false }) });
    w.dispatchEvent(new w.Event('online')); await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(w.localStorage.getItem('a2_worksheet_diagnostics.v1'))).toHaveLength(1);
  });
  it('does not send another account\'s queued reports', async () => {
    const { w } = boot({ reportStatus: 503 }); await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'student-b', token: 'other' })); w.fetch.mockClear();
    w.dispatchEvent(new w.Event('online')); await vi.advanceTimersByTimeAsync(0);
    expect(w.fetch).not.toHaveBeenCalled(); expect(JSON.parse(w.localStorage.getItem('a2_worksheet_diagnostics.v1'))).toHaveLength(1);
  });
  it('keeps teacher target and report owner separate', async () => {
    const { w, reports } = boot(); w.__VIEW_AS_STUDENT_ID__ = 'viewed-student'; await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(0);
    expect(reports[0].studentId).toBe('viewed-student'); expect(reports[0]).not.toHaveProperty('mode');
  });
  it('bounds retries and pending storage', async () => {
    const { w } = boot({ reportStatus: 503 }); await w.hydratePriorAnswers(); await vi.advanceTimersByTimeAsync(200000);
    expect(w.fetch.mock.calls.filter(c => c[0].includes('/student/worksheet-diagnostics'))).toHaveLength(4);
    for (let i = 0; i < 30; i++) w.worksheetDiagnostics.finish(w.worksheetDiagnostics.begin('WS-U1L1'), new Map());
    expect(JSON.parse(w.localStorage.getItem('a2_worksheet_diagnostics.v1')).length).toBeLessThanOrEqual(20);
  });
  
});
