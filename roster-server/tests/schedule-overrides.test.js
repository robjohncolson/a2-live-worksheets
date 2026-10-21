import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  mountScheduleOverrides, mountTeacherSchedule, createScheduleStore, scheduleEtag, schedulePayload, validateSchedulePut,
} from '../schedule-overrides.js';

// Minimal Supabase query-builder fake over PGlite, covering exactly the calls
// schedule-overrides.js makes (select/gte/lte/eq/order/range, upsert of an array
// with onConflict, delete+eq+select). Identifiers are quoted ("end" is reserved).
function fakeSupabase(pg) {
  return { from(table) {
    const where = []; const params = []; const orders = [];
    let op = 'select', payload = null, conflict = null, limit = '', returning = false;
    const cmp = sign => (col, value) => { params.push(value); where.push(`"${col}" ${sign} $${params.length}`); return builder; };
    const builder = {
      select() { if (op === 'delete') returning = true; return builder; },
      eq: cmp('='), gte: cmp('>='), lte: cmp('<='),
      order(col) { orders.push(`"${col}"`); return builder; },
      range(start, end) { limit = ` offset ${start} limit ${end - start + 1}`; return builder; },
      upsert(rows, options) { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; conflict = options.onConflict; return builder; },
      delete() { op = 'delete'; return builder; },
      async run() {
        try {
          const clause = where.length ? ` where ${where.join(' and ')}` : '';
          if (op === 'select') {
            const sql = `select * from ${table}${clause}` + (orders.length ? ` order by ${orders.join(', ')}` : '') + limit;
            return { data: (await pg.query(sql, params)).rows, error: null };
          }
          if (op === 'delete') {
            const { rows } = await pg.query(`delete from ${table}${clause}${returning ? ' returning date' : ''}`, params);
            return { data: returning ? rows : null, error: null };
          }
          for (const row of payload) {
            const keys = Object.keys(row);
            const sql = `insert into ${table} (${keys.map(k => `"${k}"`).join(', ')}) values (${keys.map((_, i) => '$' + (i + 1)).join(', ')})`
              + ` on conflict (${conflict.split(',').map(k => `"${k}"`).join(', ')}) do update set ${keys.map(k => `"${k}" = excluded."${k}"`).join(', ')}`;
            await pg.query(sql, keys.map(k => row[k]));
          }
          return { data: null, error: null };
        } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      },
      then(resolve, reject) { return builder.run().then(resolve, reject); },
    };
    return builder;
  } };
}

const TOKEN = 'class-log-test-token-0123456789abcdef';
const auth = { Authorization: 'Bearer ' + TOKEN };
const teacher = { 'x-teacher-secret': 'schedule-teacher' };
const MIGRATION = readFileSync(new URL('../migrations/0044_schedule_overrides.sql', import.meta.url), 'utf8');
let pg, server, base, clock, store;

async function listen(app) {
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  return { listener, url: 'http://127.0.0.1:' + listener.address().port };
}
async function close(listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }

beforeAll(async () => {
  // Keep date/time/timestamptz as Postgres text, the way PostgREST returns strings.
  pg = new PGlite({ parsers: { 1082: x => x, 1083: x => x, 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2;');
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // idempotent
  await pg.exec('set search_path to a2');
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'schedule-teacher');
  await pg.exec('truncate a2.schedule_overrides, a2.schedule_days_off');
  clock = new Date('2026-10-20T23:00:00.000Z');
  store = createScheduleStore(fakeSupabase(pg), { page: 2 }); // tiny pages exercise the paging loop
  const app = express();
  const now = () => { clock = new Date(clock.getTime() + 1000); return clock; };
  mountScheduleOverrides(app, { store, env: { CLASS_LOG_TOKEN: TOKEN } });
  mountTeacherSchedule(app, { store, now, db: { getRoleByStudentId: async () => 'student' } });
  ({ listener: server, url: base } = await listen(app));
});
afterEach(async () => { await close(server); vi.unstubAllEnvs(); });

const SAT = [
  { date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', note: 'SAT day' },
  ...['B', 'C', 'E', 'G'].map(section => ({ date: '2026-10-21', section, cancelled: true, note: 'SAT day' })),
];
async function putRaw(text, headers = teacher, url = base) {
  const response = await fetch(url + '/teacher/schedule-overrides', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  const body = await response.text();
  return { status: response.status, text: body, body: body ? JSON.parse(body) : null, cache: response.headers.get('cache-control') };
}
const put = (body, headers, url) => putRaw(JSON.stringify(body), headers, url);
async function getSchedule(query = '?from=2026-10-20&to=2026-11-02', headers = auth, url = base) {
  const response = await fetch(url + '/class-log/schedule' + query, { headers });
  const text = await response.text();
  return { status: response.status, etag: response.headers.get('etag'), cache: response.headers.get('cache-control'), text, body: text ? JSON.parse(text) : null };
}
async function del(query, headers = teacher) {
  const response = await fetch(base + '/teacher/schedule-overrides' + query, { method: 'DELETE', headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const count = async table => (await pg.query(`select count(*)::int as n from a2.${table}`)).rows[0].n;

describe('auth', () => {
  it('503 when CLASS_LOG_TOKEN is not configured', async () => {
    const app = express();
    mountScheduleOverrides(app, { store, env: {} });
    const other = await listen(app);
    try {
      const response = await getSchedule(undefined, auth, other.url);
      expect(response.status).toBe(503);
      expect(response.cache).toBe('no-store');
    } finally { await close(other.listener); }
  });
  it.each([[{}], [{ Authorization: 'Bearer wrong' }], [{ Authorization: TOKEN }], [teacher]])('401 with no body for %j', async headers => {
    const response = await getSchedule(undefined, headers);
    expect(response.status).toBe(401); expect(response.text).toBe('');
  });
  it('teacher routes refuse the class-log bearer and a wrong secret', async () => {
    for (const headers of [auth, {}, { 'x-teacher-secret': 'nope' }]) {
      const response = await put({ overrides: SAT }, headers);
      expect(response.status).toBe(403);
      expect(response.cache).toBe('no-store');
      expect((await del('?date=2026-10-21&section=D', headers)).status).toBe(403);
    }
    expect(await count('schedule_overrides')).toBe(0);
  });
});

describe('PUT /teacher/schedule-overrides', () => {
  it('stores overrides and days off; GET returns the phone shape', async () => {
    const response = await put({ overrides: SAT, daysOff: ['2026-10-26', { date: '2026-10-27', note: 'PD' }] });
    expect(response).toMatchObject({ status: 200, body: { ok: true, written: 7, unchanged: 0 } });
    const got = await getSchedule();
    expect(got.status).toBe(200);
    expect(got.cache).toBe('no-cache');
    expect(got.body).toEqual({
      from: '2026-10-20', to: '2026-11-02',
      overrides: [
        { date: '2026-10-21', section: 'B', start: null, end: null, cancelled: true, note: 'SAT day' },
        { date: '2026-10-21', section: 'C', start: null, end: null, cancelled: true, note: 'SAT day' },
        { date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', cancelled: false, note: 'SAT day' },
        { date: '2026-10-21', section: 'E', start: null, end: null, cancelled: true, note: 'SAT day' },
        { date: '2026-10-21', section: 'G', start: null, end: null, cancelled: true, note: 'SAT day' },
      ],
      daysOff: ['2026-10-26', '2026-10-27'],
    });
  });
  it('writes only rows whose content changed; the ETag holds across an identical push', async () => {
    await put({ overrides: SAT, daysOff: ['2026-10-26'] });
    const before = await getSchedule();
    const stamps = (await pg.query('select section, updated_at from a2.schedule_overrides order by section')).rows;
    expect((await put({ overrides: SAT, daysOff: ['2026-10-26'] })).body).toEqual({ ok: true, written: 0, unchanged: 6 });
    expect((await pg.query('select section, updated_at from a2.schedule_overrides order by section')).rows).toEqual(stamps);
    expect((await getSchedule()).etag).toBe(before.etag);
    const changed = SAT.map(row => (row.section === 'D' ? { ...row, end: '12:05' } : row));
    expect((await put({ overrides: changed, daysOff: [{ date: '2026-10-26', note: 'Veterans' }] })).body).toEqual({ ok: true, written: 2, unchanged: 4 });
    const after = await getSchedule();
    expect(after.etag).not.toBe(before.etag);
    expect(after.body.overrides.find(row => row.section === 'D').end).toBe('12:05');
  });
  it('turns a cancelled section back into a meeting and back', async () => {
    await put({ overrides: [{ date: '2026-10-21', section: 'G', cancelled: true }] });
    await put({ overrides: [{ date: '2026-10-21', section: 'G', start: '10:32', end: '11:12' }] });
    expect((await getSchedule()).body.overrides).toEqual([{ date: '2026-10-21', section: 'G', start: '10:32', end: '11:12', cancelled: false, note: null }]);
  });
  it.each([
    [{}, /empty/],
    [[], /object/],
    [{ overrides: 'x' }, /arrays/],
    [{ overrides: [{ date: '2026-02-30', section: 'D', start: '11:20', end: '12:00' }] }, /date/],
    [{ overrides: [{ date: '2026-10-21', section: '', start: '11:20', end: '12:00' }] }, /section/],
    [{ overrides: [{ date: '2026-10-21', section: 'x'.repeat(17), start: '11:20', end: '12:00' }] }, /16/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', start: '11:20' }] }, /HH:MM/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', start: '24:00', end: '24:30' }] }, /HH:MM/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', start: '12:00', end: '11:20' }] }, /before/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', start: '11:20', end: '11:20' }] }, /before/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', cancelled: true, start: '11:20', end: '12:00' }] }, /cancelled/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', cancelled: 'yes' }] }, /boolean/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', cancelled: true, note: 'n'.repeat(201) }] }, /200/],
    [{ overrides: [{ date: '2026-10-21', section: 'D', cancelled: true, source: 'phone' }] }, /source/],
    [{ overrides: [SAT[1], SAT[1]] }, /duplicate/],
    [{ daysOff: ['2026-10-26', '2026-10-26'] }, /duplicate/],
    [{ daysOff: ['10/26/2026'] }, /date/],
    [{ daysOff: Array.from({ length: 201 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)) }, /200/],
  ])('400 for %j', async (body, message) => {
    const response = await put(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(message);
    expect(await count('schedule_overrides') + await count('schedule_days_off')).toBe(0);
  });
  it('accepts exactly 200 rows', async () => {
    const daysOff = Array.from({ length: 199 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    expect((await put({ overrides: [SAT[0]], daysOff })).body).toEqual({ ok: true, written: 200, unchanged: 0 });
  });
  it('short JSON on a bad body, never a stack', async () => {
    expect(await putRaw('{not json')).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    const big = JSON.stringify({ overrides: [{ date: '2026-10-21', section: 'D', cancelled: true, note: 'x'.repeat(300 * 1024) }] });
    expect(await putRaw(big)).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
  });
});

describe('GET /class-log/schedule', () => {
  it('validates the range (real dates, ordered, at most 31 days)', async () => {
    for (const query of ['', '?from=2026-10-20', '?from=2026-10-20&to=2026-02-30', '?from=2026-10-22&to=2026-10-21', '?from=2026-10-01&to=2026-11-01']) {
      expect((await getSchedule(query)).status).toBe(400);
    }
    expect((await getSchedule('?from=2026-10-01&to=2026-10-31')).status).toBe(200);
  });
  it('filters to the range and answers "empty" with no rows', async () => {
    await put({ overrides: SAT, daysOff: ['2026-11-26'] });
    const got = await getSchedule('?from=2026-10-22&to=2026-11-01');
    expect(got.body).toEqual({ from: '2026-10-22', to: '2026-11-01', overrides: [], daysOff: [] });
    expect(got.etag).toMatch(/^"empty-[0-9a-f]{16}"$/);
  });
  it('304 on a matching If-None-Match, with or without W/', async () => {
    await put({ overrides: SAT });
    const first = await getSchedule();
    expect(first.etag).toMatch(/^"5\.0-[0-9a-f]{16}"$/);
    for (const tag of [first.etag, 'W/' + first.etag]) {
      const response = await fetch(base + '/class-log/schedule?from=2026-10-20&to=2026-11-02', { headers: { ...auth, 'If-None-Match': tag } });
      expect(response.status).toBe(304);
      expect(response.headers.get('etag')).toBe(first.etag);
    }
    for (const tag of ['*', `${first.etag}, "x"`, '"other"']) {
      const response = await fetch(base + '/class-log/schedule?from=2026-10-20&to=2026-11-02', { headers: { ...auth, 'If-None-Match': tag } });
      expect(response.status).toBe(200);
    }
  });
  it('a different range never 304s on the tag of another range, with identical rows or none', async () => {
    await put({ overrides: SAT });
    const conditional = async (query, tag) => (await fetch(base + '/class-log/schedule' + query, { headers: { ...auth, 'If-None-Match': tag } })).status;
    const first = await getSchedule('?from=2026-10-20&to=2026-11-02');
    const shifted = await getSchedule('?from=2026-10-21&to=2026-11-03');
    expect(shifted.body.overrides).toEqual(first.body.overrides);
    expect(shifted.etag).not.toBe(first.etag);
    expect(await conditional('?from=2026-10-21&to=2026-11-03', first.etag)).toBe(200);
    expect(await conditional('?from=2026-10-21&to=2026-11-03', shifted.etag)).toBe(304);
    const emptyA = await getSchedule('?from=2026-11-04&to=2026-11-10');
    const emptyB = await getSchedule('?from=2026-11-05&to=2026-11-11');
    expect(emptyA.body.overrides).toEqual([]);
    expect(emptyB.etag).not.toBe(emptyA.etag);
    expect(await conditional('?from=2026-11-05&to=2026-11-11', emptyA.etag)).toBe(200);
    expect(await conditional('?from=2026-11-05&to=2026-11-11', 'W/' + emptyB.etag)).toBe(304);
  });
  it('a hand edit in SQL (which the trigger stamps) changes the ETag', async () => {
    await put({ overrides: SAT });
    const before = (await getSchedule()).etag;
    await pg.exec("update a2.schedule_overrides set note = 'moved' where section = 'B'");
    expect((await getSchedule()).etag).not.toBe(before);
  });
});

describe('GET /teacher/schedule-overrides (the Desk strip)', () => {
  it('returns the phone payload to a teacher and refuses the phone bearer', async () => {
    await put({ overrides: SAT, daysOff: ['2026-10-26'] });
    const response = await fetch(base + '/teacher/schedule-overrides?from=2026-10-20&to=2026-11-02', { headers: teacher });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual((await getSchedule()).body);
    expect((await fetch(base + '/teacher/schedule-overrides?from=2026-10-20&to=2026-11-02', { headers: auth })).status).toBe(403);
    expect((await fetch(base + '/teacher/schedule-overrides?from=2026-10-20&to=2026-12-02', { headers: teacher })).status).toBe(400);
  });
});

describe('DELETE /teacher/schedule-overrides', () => {
  it('removes one override, or the day off when section is omitted', async () => {
    await put({ overrides: SAT, daysOff: ['2026-10-21'] });
    expect((await del('?date=2026-10-21&section=G')).body).toEqual({ ok: true, deleted: 1 });
    expect((await del('?date=2026-10-21&section=G')).body).toEqual({ ok: true, deleted: 0 });
    expect(await count('schedule_overrides')).toBe(4);
    expect((await del('?date=2026-10-21')).body).toEqual({ ok: true, deleted: 1 });
    expect(await count('schedule_days_off')).toBe(0);
    expect(await count('schedule_overrides')).toBe(4);
  });
  it('400 for a bad date or section', async () => {
    expect((await del('?date=2026-02-30')).status).toBe(400);
    expect((await del('?date=2026-10-21&section=')).status).toBe(400);
    expect((await del('?date=2026-10-21&section=' + 'x'.repeat(17))).status).toBe(400);
    const nul = await del('?date=2026-10-21&section=D%00');
    expect(nul.status).toBe(400);
    expect(nul.body.error).toMatch(/section/);
  });
});

describe('storage failures', () => {
  it('503 without details, before the migration has run', async () => {
    const failing = createScheduleStore({ from() { const b = { select: () => b, gte: () => b, lte: () => b, order: () => b, range: () => b, eq: () => b, delete: () => b, upsert: () => b,
      then: resolve => resolve({ data: null, error: { code: '42P01', message: 'relation "a2.schedule_overrides" does not exist' } }) }; return b; } });
    const app = express();
    mountScheduleOverrides(app, { store: failing, env: { CLASS_LOG_TOKEN: TOKEN } });
    mountTeacherSchedule(app, { store: failing, db: {} });
    const other = await listen(app);
    try {
      const got = await getSchedule(undefined, auth, other.url);
      expect(got.status).toBe(503);
      expect(got.text).toBe(JSON.stringify({ error: 'Schedule service unavailable' }));
      const put503 = await put({ overrides: SAT }, teacher, other.url);
      expect(put503.status).toBe(503);
      expect(put503.text).not.toMatch(/relation/);
      const response = await fetch(other.url + '/teacher/schedule-overrides?date=2026-10-21', { method: 'DELETE', headers: teacher });
      expect(response.status).toBe(503);
      expect((await fetch(other.url + '/teacher/schedule-overrides?from=2026-10-21&to=2026-10-21', { headers: teacher })).status).toBe(503);
    } finally { await close(other.listener); }
  });
});

describe('pure helpers', () => {
  it('schedulePayload trims seconds and maps days off to dates', () => {
    expect(schedulePayload('a', 'b', [{ date: '2026-10-21', section: 'D', start: '11:20:00', end: '12:00:00', cancelled: false, note: null, source: 'desk' }], [{ date: '2026-10-26', note: null }]))
      .toEqual({ from: 'a', to: 'b', overrides: [{ date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', cancelled: false, note: null }], daysOff: ['2026-10-26'] });
  });
  it('scheduleEtag is order-independent and content-sensitive', () => {
    const a = { date: '2026-10-21', section: 'C', cancelled: true }, b = { date: '2026-10-21', section: 'D', cancelled: false, start: '11:20:00' };
    const tag = (o, d, from = '2026-10-20', to = '2026-11-02') => scheduleEtag(from, to, o, d);
    expect(tag([a, b], [])).toBe(tag([b, a], []));
    expect(tag([a, b], [])).not.toBe(tag([a, { ...b, start: '11:25:00' }], []));
    expect(tag([], [{ date: '2026-10-26' }])).toMatch(/^"0\.1-/);
    expect(tag([a, b], [])).not.toBe(tag([a, b], [], '2026-10-21'));
    expect(tag([], [])).not.toBe(tag([], [], '2026-10-20', '2026-11-03'));
  });
  it('validateSchedulePut trims sections and nulls blank notes', () => {
    expect(validateSchedulePut({ overrides: [{ date: '2026-10-21', section: ' D ', start: '11:20', end: '12:00', note: '  ' }] }).overrides[0])
      .toEqual({ date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', cancelled: false, note: null, source: 'desk' });
  });
});
