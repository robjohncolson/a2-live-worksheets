// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
let dom;
afterEach(() => dom?.window.close());
async function boot(mode = 'tryits', ledger = []) {
  dom = new JSDOM(read('teacher-tryits.html'), { url: 'https://desk.test/teacher-tryits.html?mode=' + mode, runScripts: 'outside-only' });
  const win = dom.window, doc = win.document;
  const writes = [];
  let offline = false;
  win.A2Client = { changed: vi.fn(), request: vi.fn(async (path, body) => {
    if (path === '/teacher/lessons') return { lessons: [{ key: '1-1', title: 'Test lesson', topicAssessmentKey: 'T1', sections: { C: '2026-09-25' }, tryIts: [{ n: 1, prompt: 'Test prompt' }, { n: 2, prompt: 'Next prompt' }] }] };
    if (path === '/roster/list') return { students: [{ studentId: 'synthetic-c', section: 'C', username: 'Synthetic learner' }, { studentId: 'synthetic-d', section: 'D', username: 'Other section' }] };
    if (path.startsWith('/lesson-status/')) return { tryIts: { scores: [] } };
    if (path.startsWith('/ledger/student/')) return { rows: ledger };
    if (path === '/teacher/tryits/collected') return { assignedDate: '2026-09-21' };
    if (path === '/ledger/record') { if (offline) throw new Error('offline'); writes.push(JSON.parse(JSON.stringify(body))); return { ok: true, version: body.expectedVersion + 1 }; }
    throw new Error('Unexpected endpoint');
  }) };
  win.eval(read('offline-queue.js'));
  win.eval([...doc.scripts].find(script => script.textContent.includes('async function pacing()')).textContent);
  await vi.waitFor(() => expect(doc.querySelector('.student-card')).not.toBeNull());
  return { win, doc, writes, setOffline: value => { offline = value; } };
}
const button = (doc, score, question = 0) => [...doc.querySelectorAll('.score-controls')][question].querySelector('[aria-label$=": ' + score + ' points"]');
it('offers one-tap 10/8/0, all other integer scores, stable item IDs and section collection', async () => {
  const { doc, win, writes } = await boot();
  expect(doc.querySelectorAll('.student-card')).toHaveLength(1);
  for (const score of [10, 8, 0]) {
    button(doc, score).click();
    await vi.waitFor(() => expect(writes.at(-1)?.score).toBe(score));
  }
  expect(writes.every(row => row.studentId === 'synthetic-c' && row.itemId === 'TI-1-1-1' && row.attempt === 1 && row.maxPoints === 10)).toBe(true);
  expect(writes.map(row => row.expectedVersion)).toEqual([0, 1, 2]);
  expect(writes.every(row => row.clientTimestamp === undefined)).toBe(true);
  const select = doc.querySelector('.score-controls select');
  expect([...select.options].map(option => option.value)).toEqual(['', '1', '2', '3', '4', '5', '6', '7', '9']);
  select.value = '7'; select.dispatchEvent(new win.Event('change'));
  await vi.waitFor(() => expect(writes.at(-1)?.score).toBe(7));
  doc.getElementById('collection').click();
  await vi.waitFor(() => expect(doc.getElementById('collection-status').textContent).toContain('2026-09-21'));
  expect(win.A2Client.request).toHaveBeenCalledWith('/teacher/tryits/collected', { lesson: '1-1', section: 'C' }, 'PUT', '');
});
it('saves a two-question quiz total and restores the question scores', async () => {
  const { doc, writes } = await boot('quizzes', [{ source: 'quiz', item_id: 'QZ-1-1', score: 18, attempt: 1, response: { questionScores: [10, 8] } }]);
  expect(button(doc, 10).getAttribute('aria-pressed')).toBe('true');
  expect(button(doc, 8, 1).getAttribute('aria-pressed')).toBe('true');
  button(doc, 0, 1).click();
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ source: 'quiz', itemId: 'QZ-1-1', score: 10, maxPoints: 20, questionScores: [10, 0], attempt: 1 });
});
it('waits for both quiz questions, then queues and replays the latest score offline', async () => {
  const { doc, win, writes, setOffline } = await boot('quizzes');
  setOffline(true);
  button(doc, 10).click();
  expect(writes).toHaveLength(0);
  button(doc, 8, 1).click();
  await vi.waitFor(async () => expect((await win.OfflineQueue.all())[0]?.score).toBe(18));
  button(doc, 0).click();
  await vi.waitFor(async () => expect((await win.OfflineQueue.all())[0]?.score).toBe(8));
  expect(await win.OfflineQueue.all()).toHaveLength(1);
  setOffline(false); win.dispatchEvent(new win.Event('online'));
  await vi.waitFor(() => expect(writes.at(-1)?.score).toBe(8));
  await vi.waitFor(async () => expect(await win.OfflineQueue.all()).toHaveLength(0));
});
it('collection failures remain retryable and never claim assignment', async () => {
  const { doc, win } = await boot();
  win.A2Client.request.mockRejectedValueOnce(new Error('Service unavailable'));
  doc.getElementById('collection').click();
  await vi.waitFor(() => expect(doc.getElementById('message').textContent).toContain('collection was not saved'));
  expect(doc.getElementById('collection').disabled).toBe(false);
  expect(doc.getElementById('collection-status').textContent).toBe('Not collected');
});

it('shows a conflict without Saved and uses the current version only on another tap', async () => {
  const ledger = [{ source: 'try-it', item_id: 'TI-1-1-1', score: 8, attempt: 1, response: { version: 1 } }];
  const { doc, win, writes } = await boot('tryits', ledger);
  ledger[0] = { ...ledger[0], score: 10, response: { version: 2 } };
  win.A2Client.request.mockRejectedValueOnce(Object.assign(new Error('score-changed'), { status: 409 }));
  button(doc, 0).click();
  await vi.waitFor(() => expect(doc.getElementById('message').textContent).toContain('Current score: 10'));
  expect(doc.getElementById('message').textContent).not.toContain('Saved');
  await vi.waitFor(async () => expect(await win.OfflineQueue.all()).toHaveLength(0));
  expect(writes).toHaveLength(0);
  button(doc, 0).click();
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ expectedVersion: 2, score: 0 });
  await vi.waitFor(() => expect(doc.getElementById('message').textContent).toBe('Saved'));
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('serializes rapid taps and refreshes the next POST from the acknowledgement', async () => {
  const { doc, win } = await boot();
  const first = deferred(), second = deferred(), posts = [];
  const original = win.A2Client.request.getMockImplementation();
  win.A2Client.request.mockImplementation((path, body, ...rest) => {
    if (path !== '/ledger/record') return original(path, body, ...rest);
    posts.push({ ...body });
    return posts.length === 1 ? first.promise : second.promise;
  });
  button(doc, 10).click();
  await vi.waitFor(() => expect(posts).toHaveLength(1));
  button(doc, 8).click();
  await vi.waitFor(async () => expect((await win.OfflineQueue.all())[0]?.score).toBe(8));
  expect(posts).toHaveLength(1);
  first.resolve({ ok: true, version: 1 });
  await vi.waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]).toMatchObject({ score: 8, expectedVersion: 1 });
  expect(doc.getElementById('message').textContent).not.toBe('Saved');
  second.resolve({ ok: true, version: 2 });
  await vi.waitFor(() => expect(doc.getElementById('message').textContent).toBe('Saved'));
  await vi.waitFor(async () => expect(await win.OfflineQueue.all()).toHaveLength(0));
});

it('recovers a lost committed response without discarding the newer tap', async () => {
  const ledger = [], { doc, win } = await boot('tryits', ledger);
  const first = deferred(), posts = [];
  const original = win.A2Client.request.getMockImplementation();
  win.A2Client.request.mockImplementation((path, body, ...rest) => {
    if (path !== '/ledger/record') return original(path, body, ...rest);
    posts.push({ ...body });
    if (posts.length === 1) {
      ledger.push({ source: body.source, item_id: body.itemId, score: body.score, attempt: 1,
        response: { requestId: body.requestId, version: 1 } });
      return first.promise;
    }
    if (body.expectedVersion !== 1) return Promise.reject(Object.assign(new Error('score-changed'), { status: 409 }));
    return Promise.resolve({ ok: true, version: 2 });
  });
  button(doc, 10).click();
  await vi.waitFor(() => expect(posts).toHaveLength(1));
  button(doc, 0).click();
  await vi.waitFor(async () => expect((await win.OfflineQueue.all())[0]?.score).toBe(0));
  first.reject(new Error('Response lost'));
  await vi.waitFor(() => expect(posts).toHaveLength(3));
  expect(posts[2]).toMatchObject({ score: 0, expectedVersion: 1, requestId: posts[1].requestId });
  await vi.waitFor(async () => expect(await win.OfflineQueue.all()).toHaveLength(0));
  expect(doc.getElementById('message').textContent).toBe('Saved');
});

it('never claims Saved for replaced offline taps or repeated migration failures', async () => {
  const { doc, win, setOffline } = await boot();
  setOffline(true);
  button(doc, 10).click(); button(doc, 8).click();
  await vi.waitFor(() => expect(doc.getElementById('message').textContent).toContain('Queued'));
  await vi.waitFor(async () => expect((await win.OfflineQueue.all())[0]?.score).toBe(8));
  const original = win.A2Client.request.getMockImplementation();
  win.A2Client.request.mockImplementation((path, ...args) => path === '/ledger/record'
    ? Promise.reject(Object.assign(new Error('Run migration 0040_a2_teacher_entry.sql'), { status: 503 }))
    : original(path, ...args));
  for (let retry = 0; retry < 2; retry++) {
    win.dispatchEvent(new win.Event('online'));
    await vi.waitFor(() => expect(doc.getElementById('message').textContent).toContain('Queued: Run migration 0040'));
    expect(await win.OfflineQueue.all()).toHaveLength(1);
    expect(doc.getElementById('message').textContent).not.toContain('Saved');
  }
});
