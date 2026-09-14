import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { mountAnnouncements, createAnnouncementStore } from '../announcements.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { signToken } from '../token.js';

let server, base, rows, store, now;
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'announcement-teacher');
  vi.stubEnv('ROSTER_TOKEN_SECRET', 'announcement-token-secret');
  now = new Date('2026-09-14T03:59:59Z'); // Still Sunday in New York.
  rows = new Map();
  store = {
    get: vi.fn(async weekOf => rows.get(weekOf) || { text: null }),
    put: vi.fn(async row => { if (row.text) rows.set(row.weekOf, row); else rows.delete(row.weekOf); }),
  };
  const app = express(); app.use(express.json());
  mountAnnouncements(app, { config: PHASE3_CONFIG, store, now: () => now,
    db: { getRoleByStudentId: async id => id === 'teacher-id' ? 'teacher' : 'student' } });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  vi.unstubAllEnvs();
});
async function put(body, headers = { 'x-teacher-secret': 'announcement-teacher' }) {
  const response = await fetch(base + '/teacher/announcement', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const valid = { text: 'Bring your packet Thursday.', weekOf: '2026-09-07' };

it('allows anonymous current-week reads and returns only text:null when absent', async () => {
  const response = await fetch(base + '/announcement');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ text: null });
});
it.each([
  {}, { 'x-teacher-secret': 'wrong' }, { Authorization: 'Bearer invalid' },
])('rejects unauthenticated writes %j', async headers => {
  expect((await put(valid, headers)).status).toBe(403);
  expect(store.put).not.toHaveBeenCalled();
});
it('rejects student tokens and accepts teacher tokens without storing credentials', async () => {
  expect((await put(valid, { Authorization: 'Bearer ' + signToken('student-id') })).status).toBe(403);
  expect((await put(valid, { Authorization: 'Bearer ' + signToken('teacher-id') })).status).toBe(200);
  expect(rows.get(valid.weekOf).updatedBy).toBe('teacher-id');
});
it('trims, strips tags, flattens lines, and records the update time', async () => {
  const response = await put({ ...valid, text: '  <b>Bring</b> your packet.\n Thursday!  ' });
  expect(response).toEqual({ status: 200, body: {
    text: 'Bring your packet. Thursday!', weekOf: valid.weekOf, updatedAt: now.toISOString(),
  } });
  expect(rows.get(valid.weekOf).updatedBy).toBeNull();
});
it.each([
  ['Write student@example.org', /email/i],
  ['Call 555-1234', /phone/i],
  ['Call +1 (617) 555-0123', /phone/i],
  ['Call 5551234567', /phone/i],
  ['See https://example.org', /URL/],
  ['See www.example.org', /URL/],
  ['See example.org/path', /URL/],
  ['<a href="https://example.org">Visit</a>', /URL/],
  ['student<b>@</b>example.org', /email/i],
  ['a'.repeat(281), /280/],
  [null, /string/], [42, /string/],
])('rejects private/invalid text %j with a reason', async (text, reason) => {
  const response = await put({ ...valid, text });
  expect(response.status).toBe(400); expect(response.body.error).toMatch(reason);
  expect(store.put).not.toHaveBeenCalled();
});
it.each(['2026-09-13', '2026-02-30', '2026-9-7', 'bad', null])('rejects a non-Monday or invalid date %j', async weekOf => {
  const response = await put({ ...valid, weekOf });
  expect(response.status).toBe(400); expect(response.body.error).toMatch(/Monday/);
});
it('accepts 1 and 280 characters', async () => {
  expect((await put({ ...valid, text: 'a' })).status).toBe(200);
  expect((await put({ ...valid, text: 'a'.repeat(280) })).status).toBe(200);
});
it('selects this Monday across Sunday to Monday at school midnight', async () => {
  await put(valid);
  await put({ text: 'Next week note', weekOf: '2026-09-14' });
  expect((await (await fetch(base + '/announcement')).json()).text).toBe(valid.text);
  now = new Date('2026-09-14T04:00:00Z');
  expect((await (await fetch(base + '/announcement')).json()).text).toBe('Next week note');
  expect(store.get.mock.calls.map(call => call[0])).toEqual(['2026-09-07', '2026-09-14']);
});
it('deletes empty/whitespace text without deleting next week', async () => {
  await put(valid); await put({ ...valid, weekOf: '2026-09-14' });
  expect((await put({ ...valid, text: ' \n ' })).body).toEqual({ text: null });
  expect(await (await fetch(base + '/announcement')).json()).toEqual({ text: null });
  expect(rows.has('2026-09-14')).toBe(true);
  expect((await put({ ...valid, text: '' })).status).toBe(200);
});
it('rate limits teacher writes with the shared fixed-window limiter', async () => {
  for (let i = 0; i < 30; i++) expect((await put(valid)).status).toBe(200);
  expect((await put(valid)).status).toBe(429);
  expect((await fetch(base + '/announcement')).status).toBe(200);
});
it('returns 503 on storage failure without leaking database details', async () => {
  store.get.mockRejectedValue(new Error('private database error'));
  const response = await fetch(base + '/announcement');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Announcement service unavailable' });
  store.put.mockRejectedValue(new Error('private database error'));
  expect((await put(valid)).status).toBe(503);
});
it('migration and Supabase adapter retain one row per Monday and delete it', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync(new URL('../migrations/0039_announcements.sql', import.meta.url), 'utf8'));
    const client = { from: table => {
      expect(table).toBe('announcements');
      return {
        select: () => ({ eq: (_key, week) => ({ maybeSingle: async () => {
          const result = await db.query('select text, week_of::text, updated_at::text from announcements where week_of=$1', [week]);
          return { data: result.rows[0] || null };
        } }) }),
        upsert: async row => {
          await db.query('insert into announcements values ($1,$2,$3,$4) on conflict (week_of) do update set text=excluded.text, updated_at=excluded.updated_at, updated_by=excluded.updated_by',
            [row.week_of, row.text, row.updated_at, row.updated_by]); return {};
        },
        delete: () => ({ eq: async (_key, week) => { await db.query('delete from announcements where week_of=$1', [week]); return {}; } }),
      };
    } };
    const persistent = createAnnouncementStore(client);
    await persistent.put({ ...valid, updatedAt: now.toISOString(), updatedBy: 'teacher-id' });
    await persistent.put({ ...valid, text: 'Replacement', updatedAt: now.toISOString(), updatedBy: null });
    expect(await persistent.get(valid.weekOf)).toMatchObject({ text: 'Replacement', weekOf: valid.weekOf, updatedAt: expect.any(String) });
    expect((await db.query('select * from announcements')).rows).toHaveLength(1);
    await persistent.put({ ...valid, text: '' });
    expect(await persistent.get(valid.weekOf)).toEqual({ text: null });
  } finally { await db.close(); }
});
