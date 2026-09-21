import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FLASHCARD_STATE_MAX_BYTES } from '../flashcard-state.js';
import { mountFlashcardState } from '../flashcard-state.js';
import { mountPasswordGate } from '../starting-password.js';
import { signToken } from '../token.js';
import { getTeacherKey } from '../teacher-auth.js';

let server, url, rows, students, revision;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T16:00:00Z'));
  process.env.ROSTER_TOKEN_SECRET = 'daily-fixture-token';
  rows = new Map();
  revision = 0;
  students = [
    { student_id: 'one', section: 'PeriodC' },
    { student_id: 'two', section: 'C' },
    { student_id: 'other', section: 'PeriodD' },
    { student_id: 'archived', section: 'PeriodC', status: 'archived' },
    { student_id: 'teacher', section: 'PeriodC', role: 'teacher' },
  ].map(row => ({ status: 'active', role: 'student', password_hash: 'fixture-hash',
    real_name: 'Fictional Learner', login_username: row.student_id, ...row }));
  const db = {
    async findByStudentId(id) { return { data: students.find(row => row.student_id === id) }; },
    async listRoster() { return { data: students }; },
    async getRoleByStudentId(id) { return students.find(row => row.student_id === id)?.role; },
  };
  const store = {
    async get(id) { return structuredClone(rows.get(id) || null); },
    async put(id, state, base) {
      if ((rows.get(id)?.updated_at || null) !== base) return null;
      const row = { state: structuredClone(state), updated_at: new Date(++revision * 1000).toISOString() };
      rows.set(id, row);
      return row;
    },
  };
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  mountPasswordGate(app, db);
  mountFlashcardState(app, { db, store });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  url = 'http://127.0.0.1:' + server.address().port;
});
afterEach(() => { vi.useRealTimers(); return new Promise(resolve => server.close(resolve)); });

async function request(path, method = 'GET', body, id, teacher = false) {
  const response = await fetch(url + path, { method,
    headers: { 'Content-Type': 'application/json',
      ...(id ? { Authorization: 'Bearer ' + signToken(id, 'fixture-hash') } : {}),
      ...(teacher ? { 'x-teacher-secret': getTeacherKey() } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const run = (override = {}, id = 'one') => request('/flashcards/daily', 'POST', {
  lesson: '1-1', date: '2026-09-21', mode: 'quick', correct: 8, total: 9, ...override,
}, id);
const daily = (query = 'section=PeriodC&date=2026-09-21') => request('/teacher/flashcards/daily?' + query, 'GET', null, null, true);

it('stores raw accuracy, keeps the best same-day run, filters dates and includes all active section students', async () => {
  expect((await run()).status).toBe(200);
  await run({ correct: 8, total: 8 });
  await run({ correct: 1, total: 10 });
  await run({ mode: 'full', correct: 9, total: 10 });
  await run({ date: '2026-09-20', correct: 10, total: 10 });
  const result = await daily();
  expect(result.status).toBe(200);
  expect(result.body.students.map(s => s.studentId)).toEqual(['one', 'two']);
  expect(result.body.students[0].runs).toHaveLength(2);
  expect(result.body.students[0].best).toEqual({ correct: 8, total: 8, mode: 'quick' });
  expect(result.body.students[1]).toMatchObject({ runs: [], best: null });
  expect(rows.get('one').state.dailyRuns).toHaveLength(3);
});

it('requires teacher auth and validates section, date and raw counts', async () => {
  expect((await request('/teacher/flashcards/daily?section=PeriodC&date=2026-09-21')).status).toBe(401);
  expect((await request('/teacher/flashcards/daily?section=PeriodC&date=2026-09-21', 'GET', null, 'one')).status).toBe(401);
  for (const query of ['', 'section=PeriodC', 'date=2026-09-21', 'section=C&date=2026-09-21',
    'section=PeriodC&date=2026-02-30', 'section=PeriodC&date=invalid']) {
    expect((await daily(query)).status).toBe(400);
  }
  for (const bad of [{ correct: 11 }, { total: 0 }, { correct: 1.5 }, { mode: 'fake' }, { date: '2026-02-30' }]) {
    expect((await run(bad)).status).toBe(400);
  }
});

it('rejects a body owner different from the authenticated student without storing a run', async () => {
  expect((await run({ studentId: 'one' }, 'two')).status).toBe(400);
  expect(rows.size).toBe(0);
  expect((await run({ studentId: 'one' })).status).toBe(200);
  expect(rows.has('one')).toBe(true);
  expect(rows.has('two')).toBe(false);
});

it('blocks unsigned, archived, must-change and password-stale writes', async () => {
  expect((await request('/flashcards/daily', 'POST', {})).status).toBe(401);
  expect((await run({}, 'archived')).status).toBe(401);
  students[0].must_change_password = true;
  expect((await run()).status).toBe(403);
  students[0].must_change_password = false;
  students[0].password_hash = 'changed-hash';
  expect((await run()).status).toBe(401);
  expect(rows.size).toBe(0);
});

it('preserves practice and raw results across concurrent writes and rejects raw injection through practice sync', async () => {
  await request('/flashcards/state', 'PUT', { state: { e: ['practice'], dailyRuns: [{ forged: true }] }, baseUpdatedAt: null }, 'one');
  expect(rows.get('one').state).toEqual({ e: ['practice'] });
  const old = rows.get('one').updated_at;
  const writes = await Promise.all([run(), run({ mode: 'full' })]);
  expect(writes.map(r => r.status)).toEqual([200, 200]);
  expect(rows.get('one').state.e).toEqual(['practice']);
  expect((await request('/flashcards/state', 'PUT', { state: {}, baseUpdatedAt: old }, 'one')).status).toBe(409);
  expect((await request('/flashcards/state', 'PUT', { state: { e: [] }, baseUpdatedAt: rows.get('one').updated_at }, 'one')).status).toBe(200);
  expect(rows.get('one').state.dailyRuns).toHaveLength(2);
});

it('replays an offline client run the next day under its original New York date', async () => {
  vi.setSystemTime(new Date('2026-09-22T03:59:00Z'));
  const window = { Date, ROSTER_SERVICE_URL: url, navigator: { onLine: false },
    rosterClient: { token: () => signToken('one', 'fixture-hash'), studentId: () => 'one' },
    setTimeout: () => 1, clearTimeout: () => {} };
  const context = vm.createContext({ window, Date, Intl, fetch, console });
  for (const file of ['offline-queue.js', 'gradebook-client.js']) {
    vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context);
  }
  await window.gradebookClient.recordFlashcardRun('1.1', 'quick', 8, 8);
  expect(rows.size).toBe(0);
  vi.setSystemTime(new Date('2026-09-22T04:01:00Z'));
  window.navigator.onLine = true;
  expect((await window.gradebookClient.syncOfflineQueue()).sent).toBe(1);
  expect((await daily()).body.students[0].runs[0]).toMatchObject({ date: '2026-09-21', timestamp: Date.parse('2026-09-22T03:59:00Z') });
  expect((await daily('section=PeriodC&date=2026-09-22')).body.students[0].best).toBeNull();
});

it('creates and repairs a practice envelope readable by the real fromWire', async () => {
  const context = {};
  vm.runInNewContext(readFileSync(new URL('../../lib/flashcard-sync.js', import.meta.url), 'utf8'), context);
  await run();
  expect(context.FlashcardSync.fromWire(rows.get('one').state).entries).toEqual([]);
  delete rows.get('one').state.v;
  delete rows.get('one').state.e;
  await run();
  expect(context.FlashcardSync.fromWire(rows.get('one').state).entries).toEqual([]);
  const practice = { v: 1, e: [], email: 'fictional@example.test', csvs: ['deck'], tombstones: { old: 1 }, savedAt: 42 };
  rows.get('one').state = { ...practice };
  await run();
  const { dailyRuns, ...rest } = rows.get('one').state;
  expect(rest).toEqual(practice);
});

it('accepts at most seven calendar days back including DST and rejects unknown lessons', async () => {
  for (const date of ['2026-09-22', '2026-09-13']) expect((await run({ date })).status).toBe(400);
  expect((await run({ date: '2026-09-14' })).status).toBe(200);
  expect((await run({ lesson: '99-99' })).status).toBe(400);
  vi.setSystemTime(new Date('2026-11-02T04:30:00Z')); // Still Nov 1 in New York, after fall-back.
  expect((await run({ date: '2026-10-25' })).status).toBe(200);
  expect((await run({ date: '2026-10-24' })).status).toBe(400);
  expect((await run({ date: '2026-11-02' })).status).toBe(400);
});

it('retains only the 60 most recent dates without trimming practice', async () => {
  const dailyRuns = Array.from({ length: 65 }, (_, i) => ({ lesson: '1-1', mode: 'quick', correct: 1, total: 2,
    date: new Date(Date.parse('2026-09-20') - i * 86400000).toISOString().slice(0, 10) }));
  rows.set('one', { state: { v: 1, e: [], savedAt: 42, dailyRuns }, updated_at: new Date(0).toISOString() });
  expect((await run()).status).toBe(200);
  expect(rows.get('one').state.dailyRuns).toHaveLength(60);
  expect(rows.get('one').state.dailyRuns.some(r => r.date === '2026-09-21')).toBe(true);
  expect(rows.get('one').state.dailyRuns.some(r => r.date === dailyRuns.at(-1).date)).toBe(false);
  expect(rows.get('one').state.savedAt).toBe(42);
});

it('checks the complete stored byte size on daily and practice writes', async () => {
  const state = { v: 1, e: [], padding: '' };
  state.padding = 'x'.repeat(FLASHCARD_STATE_MAX_BYTES - Buffer.byteLength(JSON.stringify(state)));
  rows.set('one', { state, updated_at: new Date(0).toISOString() });
  expect((await run()).status).toBe(413);
  expect(rows.get('one').state).toEqual(state);
  rows.clear();
  await run();
  const before = structuredClone(rows.get('one'));
  expect((await request('/flashcards/state', 'PUT', { state, baseUpdatedAt: before.updated_at }, 'one')).status).toBe(413);
  expect(rows.get('one')).toEqual(before);
});
