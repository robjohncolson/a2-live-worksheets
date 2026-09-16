import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const html = read('lib/worksheet-hydration.js');
const hydration = html;
const windows = [];
const rows = Array.from({ length: 37 }, (_, i) => ({ item_id: 'WS-U1L1-Q' + (i + 1), response: 'saved ' + i, score: 1 }));
const good = (data = rows) => ({ ok: true, status: 200, json: async () => ({ ok: true, rows: data }) });
function boot(fetch) {
  const dom = new JSDOM('<body>' + rows.map(r => '<input class="blank" data-question-id="' + r.item_id + '">').join('') + '<textarea id="reflect1"></textarea></body>', { url: 'https://example.com/', runScripts: 'outside-only' });
  const w = dom.window;
  windows.push(w);
  w.setTimeout = setTimeout; w.clearTimeout = clearTimeout;
  w.fetch = fetch;
  w.ROSTER_SERVICE_URL = 'https://roster.example.com';
  w.localStorage.setItem('a2_roster.v1', JSON.stringify({ token: 'old-token', studentId: 'student-a', username: 'test_student' }));
  w.localStorage.setItem('a2_desk_marks', 'keep-me');
  w.eval(read('roster-client.js'));
  w.eval(read('gradebook-client.js'));
  w.gbWsPrefix = () => 'WS-U1L1';
  w._markRestored = () => {};
  w._markAutoGraded = () => {};
  w.eval(hydration);
  return w;
}
function count(w) { return [...w.document.querySelectorAll('.blank')].filter(x => x.value).length; }
function notice(w) { return w.document.getElementById('gb-answer-recovery'); }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const w of windows.splice(0)) w.close(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('cross-device worksheet answer recovery', () => {
  it('restores all 37 answers on a fresh device without altering completion marks', async () => {
    const w = boot(vi.fn().mockResolvedValue(good()));
    await w.hydratePriorAnswers();
    expect(count(w)).toBe(37);
    expect(notice(w)).toBeNull();
    expect(w.localStorage.getItem('a2_desk_marks')).toBe('keep-me');
  });
  it.each(['network', '503', '429', 'malformed'])('recovers after %s without a reload', async mode => {
    const fetch = vi.fn();
    if (mode === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
    else if (mode === 'malformed') fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false }) });
    else fetch.mockResolvedValueOnce({ ok: false, status: Number(mode) });
    fetch.mockResolvedValue(good());
    const w = boot(fetch);
    await w.hydratePriorAnswers();
    expect(notice(w).textContent).toContain('could not be loaded');
    await vi.advanceTimersByTimeAsync(2000);
    expect(count(w)).toBe(37);
    expect(notice(w)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('stops automatic retries after three and permits manual recovery', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const w = boot(fetch);
    await w.hydratePriorAnswers();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(w.document.querySelectorAll('#gb-answer-recovery')).toHaveLength(1);
    fetch.mockResolvedValue(good());
    notice(w).querySelector('button').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(count(w)).toBe(37);
  });
  it.each([401, 403])('does not repeatedly poll a %s; same-tab sign-in restores answers', async status => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status });
    const w = boot(fetch);
    await w.hydratePriorAnswers();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(notice(w).textContent).toContain('Sign in again');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, studentId: 'student-a', username: 'test_student', token: 'fresh' }) }).mockResolvedValue(good());
    await w.rosterClient.signIn('test_student', 'test');
    await vi.advanceTimersByTimeAsync(0);
    expect(count(w)).toBe(37);
    expect(notice(w)).toBeNull();
  });
  it.each(['connection', 'body'])('bounds a hung %s and recovers on reconnect', async mode => {
    const fetch = vi.fn();
    if (mode === 'connection') fetch.mockImplementationOnce(() => new Promise(() => {}));
    else fetch.mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) });
    fetch.mockResolvedValue(good());
    const w = boot(fetch);
    const pending = w.hydratePriorAnswers();
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(notice(w)).not.toBeNull();
    w.dispatchEvent(new w.Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(count(w)).toBe(37);
  });
  it('preserves typed text and deliberately cleared blanks and reflections', async () => {
    let finish;
    const w = boot(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = w.hydratePriorAnswers();
    const inputs = w.document.querySelectorAll('.blank');
    inputs[0].value = 'my new work';
    inputs[0].dispatchEvent(new w.Event('input', { bubbles: true }));
    inputs[1].dispatchEvent(new w.Event('input', { bubbles: true }));
    w.document.querySelector('textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
    finish(good([...rows, { item_id: 'WS-U1L1-reflect1', response: 'old reflection', score: 1 }]));
    await pending;
    expect(inputs[0].value).toBe('my new work');
    expect(inputs[1].value).toBe('');
    expect(w.document.querySelector('textarea').value).toBe('');
    expect(count(w)).toBe(36);
  });
  it('discards a response when the account changes during the download', async () => {
    let finish;
    const w = boot(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = w.hydratePriorAnswers();
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'different', token: 'different' }));
    finish(good());
    await pending;
    expect(count(w)).toBe(0);
  });
  it('keeps teacher view-as targeted at the student', async () => {
    const fetch = vi.fn().mockResolvedValue(good());
    const w = boot(fetch);
    w.__VIEW_AS_STUDENT_ID__ = 'viewed-student';
    await w.hydratePriorAnswers();
    expect(fetch.mock.calls[0][0]).toContain('/ledger/student/viewed-student?');
    expect(count(w)).toBe(37);
  });
  it('treats a successful empty history as empty, without retries or a warning', async () => {
    const fetch = vi.fn().mockResolvedValue(good([]));
    const w = boot(fetch);
    await w.hydratePriorAnswers();
    await vi.advanceTimersByTimeAsync(120000);
    expect(count(w)).toBe(0);
    expect(notice(w)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('never uploads local answers based on a failed prior-answer read', async () => {
    const w = boot(vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    w.recordBlankToGradebook = vi.fn();
    w.document.querySelector('.blank').value = 'local answer';
    await w.healLocalAnswersToLedger();
    expect(w.recordBlankToGradebook).not.toHaveBeenCalled();
    expect(w.document.querySelector('.blank').value).toBe('local answer');
  });
  it('recovers after same-tab sign-in when the page initially has no session', async () => {
    const fetch = vi.fn();
    const w = boot(fetch);
    w.localStorage.removeItem('a2_roster.v1');
    await w.hydratePriorAnswers();
    expect(fetch).not.toHaveBeenCalled();
    expect(notice(w)).not.toBeNull();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, studentId: 'student-a', token: 'fresh' }) }).mockResolvedValue(good());
    await w.rosterClient.signIn('test_student', 'test');
    await vi.advanceTimersByTimeAsync(0);
    expect(count(w)).toBe(37);
  });
  it('a successful background ledger check does not cancel a failed visible restoration', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue(good());
    const w = boot(fetch);
    await w.hydratePriorAnswers();
    w.recordBlankToGradebook = vi.fn();
    await w.healLocalAnswersToLedger();
    // AI grading also reads prior answers without restoring the form.
    await w.gradebookClient.fetchPrior('WS-U1L1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(count(w)).toBe(37);
  });
  
});
