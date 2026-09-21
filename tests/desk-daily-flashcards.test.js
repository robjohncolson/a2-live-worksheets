// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../gradebook-client.js', import.meta.url), 'utf8');
const queueSource = readFileSync(new URL('../offline-queue.js', import.meta.url), 'utf8');
function loadClient(instant, fetch) {
  const events = {};
  const timers = new Map();
  let timerId = 0;
  const window = { Date, ROSTER_SERVICE_URL: 'https://fixture.invalid/',
    rosterClient: { token: () => 'fixture-token', studentId: () => 'one' },
    navigator: { onLine: true },
    addEventListener: (name, fn) => { (events[name] ||= []).push(fn); },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id) };
  const context = vm.createContext({ window, console, Intl, fetch,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } } });
  vm.runInContext(queueSource, context);
  vm.runInContext(client, context);
  return { window, events, async tick() {
    const pending = [...timers.values()]; timers.clear();
    for (const fn of pending) await fn();
  } };
}

it.each([
  ['2026-09-22T03:59:00Z', '2026-09-21'],
  ['2026-09-22T04:00:00Z', '2026-09-22'],
  ['2026-11-01T05:30:00Z', '2026-11-01'],
  ['2026-11-01T06:30:00Z', '2026-11-01'],
])('sends uncapped counts and New York date for %s through authenticated daily path', async (instant, expected) => {
  const fetch = vi.fn(async () => ({ ok: true }));
  const { window } = loadClient(instant, fetch);
  const record = window.gradebookClient.recordFlashcardRun;
  expect(await record('1.1', 'quick', 8, 8)).toEqual({ ok: true });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://fixture.invalid/flashcards/daily');
  expect(options.headers.Authorization).toBe('Bearer fixture-token');
  expect(JSON.parse(options.body)).toEqual({ studentId: 'one', lesson: '1-1', date: expected, timestamp: Date.parse(instant), mode: 'quick', correct: 8, total: 8 });
  window.__WS_READ_ONLY__ = true;
  expect((await record('1.1', 'quick', 8, 8)).reason).toBe('read-only');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('wires raw daily recording on both surfaces', () => {
  const desk = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../mobile-home.html', import.meta.url), 'utf8');
  expect(desk).toContain("recordFlashcardRun(_bfState.topic, 'quick', _bfState.score");
  expect(desk).toContain("recordFlashcardRun(topic, 'full',");
  expect(mobile).toContain('recordFlashcardRun(topic, mode, correct, total)');
  const engine = {};
  vm.runInNewContext(readFileSync(new URL('../flashcards.js', import.meta.url), 'utf8'), engine);
  expect(engine.Flashcards.quickScorePct(8, 10)).toBe(80);
  expect(engine.Flashcards.quickPassed(8, 10)).toBe(true);
});

it('queues every offline run with original time, and reconnect replays only its owner', async () => {
  const fetch = vi.fn(async () => ({ ok: true }));
  const harness = loadClient('2026-09-22T03:59:00Z', fetch);
  const { window, events, tick } = harness;
  window.navigator.onLine = false;
  await window.gradebookClient.recordFlashcardRun('1.1', 'quick', 8, 8);
  await window.gradebookClient.recordFlashcardRun('1.1', 'quick', 1, 8);
  expect(fetch).not.toHaveBeenCalled();
  expect(await window.OfflineQueue.all()).toHaveLength(2);
  window.navigator.onLine = true;
  window.rosterClient.studentId = () => 'other';
  await window.gradebookClient.syncOfflineQueue();
  expect(fetch).not.toHaveBeenCalled();
  window.rosterClient.studentId = () => 'one';
  for (const fn of events.online) fn();
  await tick();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ date: '2026-09-21', timestamp: Date.parse('2026-09-22T03:59:00Z') });
  expect(await window.OfflineQueue.all()).toHaveLength(0);
});

it('keeps a queued run for its owner when another student signs in while the send waits', async () => {
  let release, started;
  const sending = new Promise(resolve => { started = resolve; });
  const fetch = vi.fn(() => new Promise(resolve => { release = resolve; started(); }));
  const { window } = loadClient('2026-09-21T16:00:00Z', fetch);
  const initial = window.gradebookClient.recordFlashcardRun('1.1', 'quick', 8, 8);
  await sending;
  let picked;
  const selected = new Promise(resolve => { picked = resolve; });
  window.rosterClient.studentId = () => { picked(); return 'one'; };
  const drain = window.gradebookClient.syncOfflineQueue();
  await selected;
  window.rosterClient.studentId = () => 'two';
  window.rosterClient.token = () => 'second-token';
  release({ ok: false, status: 503 });
  await initial;
  await drain;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await window.OfflineQueue.all()).toHaveLength(1);
  expect((await window.OfflineQueue.all())[0].studentId).toBe('one');
  window.rosterClient.studentId = () => 'one';
  window.rosterClient.token = () => 'owner-token';
  fetch.mockResolvedValue({ ok: true });
  await window.gradebookClient.syncOfflineQueue();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer owner-token');
  expect(JSON.parse(fetch.mock.calls[1][1].body).studentId).toBe('one');
  expect(await window.OfflineQueue.all()).toHaveLength(0);
});

it.each(['network', 'auth', 'server'])('retries a failed %s POST after a fresh token is stored', async failure => {
  const fetch = vi.fn(async () => {
    if (failure === 'network') throw new Error('offline');
    return { ok: false, status: failure === 'auth' ? 401 : 503 };
  });
  const { window, events, tick } = loadClient('2026-09-21T16:00:00Z', fetch);
  expect((await window.gradebookClient.recordFlashcardRun('1.1', 'quick', 8, 8)).queued).toBe(true);
  expect(await window.OfflineQueue.all()).toHaveLength(1);
  fetch.mockImplementation(async () => ({ ok: true }));
  window.rosterClient.token = () => 'fresh-token';
  for (const fn of events.storage) fn({ key: 'a2_roster.v1' });
  await tick();
  expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer fresh-token');
  expect(await window.OfflineQueue.all()).toHaveLength(0);
});
