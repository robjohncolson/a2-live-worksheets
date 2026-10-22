import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  mountDeviceHealth, mountTeacherHealth, createDeviceHealthStore, validateHealth, healthFromRow, recordingWarnings, recordingWarnings24h,
} from '../device-health.js';

// Minimal Supabase query-builder fake over PGlite, covering exactly the calls
// device-health.js makes (select/order, upsert with onConflict, insert, delete+lt).
// jsonb values go over the wire as JSON text, the way PostgREST receives them.
function fakeSupabase(pg) {
  return { from(table) {
    const where = []; const params = []; const orders = [];
    let op = 'select', payload = null, conflict = null;
    const builder = {
      select() { return builder; },
      order(col) { orders.push(col); return builder; },
      lt(col, value) { params.push(value); where.push(`${col} < $${params.length}`); return builder; },
      upsert(row, options) { op = 'upsert'; payload = row; conflict = options.onConflict; return builder; },
      insert(row) { op = 'insert'; payload = row; return builder; },
      delete() { op = 'delete'; return builder; },
      async run() {
        try {
          const clause = where.length ? ` where ${where.join(' and ')}` : '';
          if (op === 'select') {
            return { data: (await pg.query(`select * from ${table}${clause}` + (orders.length ? ` order by ${orders.join(', ')}` : ''), params)).rows, error: null };
          }
          if (op === 'delete') { await pg.query(`delete from ${table}${clause}`, params); return { data: null, error: null }; }
          const keys = Object.keys(payload);
          const values = keys.map(key => (payload[key] && typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key]));
          let sql = `insert into ${table} (${keys.join(', ')}) values (${keys.map((_, i) => '$' + (i + 1)).join(', ')})`;
          if (op === 'upsert') sql += ` on conflict (${conflict}) do update set ${keys.map(key => `${key} = excluded.${key}`).join(', ')}`;
          await pg.query(sql, values);
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
const teacher = { 'x-teacher-secret': 'health-teacher' };
const MIGRATION = readFileSync(new URL('../migrations/0045_device_health.sql', import.meta.url), 'utf8');
let pg, server, base, clock, store;

async function listen(app) {
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  return { listener, url: 'http://127.0.0.1:' + listener.address().port };
}
async function close(listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }

beforeAll(async () => {
  pg = new PGlite({ parsers: { 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2;');
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // idempotent
  await pg.exec('set search_path to a2; set timezone to UTC');
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'health-teacher');
  await pg.exec('truncate a2.device_health, a2.device_health_log');
  clock = new Date('2026-10-21T14:00:00.000Z');
  store = createDeviceHealthStore(fakeSupabase(pg));
  const app = express();
  const now = () => clock;
  mountDeviceHealth(app, { store, env: { CLASS_LOG_TOKEN: TOKEN }, now });
  mountTeacherHealth(app, { store, now, db: { getRoleByStudentId: async () => 'student' } });
  ({ listener: server, url: base } = await listen(app));
});
afterEach(async () => { await close(server); vi.unstubAllEnvs(); });

const ping = (over = {}) => ({
  device: 's24', at: '2026-10-21T09:58:00-04:00', appVersion: '1.3.0 (abc1234)', battery: { pct: 84, charging: false },
  mode: 'OffDay', nextBlock: { date: '2026-10-21', section: 'D', start: '11:20' }, alarmAt: '2026-10-21T11:18:00-04:00',
  serviceForeground: true, queues: { uploads: 0, transcribing: 0, cardOutcomes: 0, summaryPosts: 0 },
  lastRecording: { date: '2026-10-20', section: 'G', end: '14:30' }, lastFetch: { cards: '2026-10-21T09:00:00-04:00', schedule: null },
  failures24h: 0, ...over,
});
async function postRaw(text, headers = auth, url = base) {
  const response = await fetch(url + '/class-log/health', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  const body = await response.text();
  return { status: response.status, text: body, body: body ? JSON.parse(body) : null, cache: response.headers.get('cache-control') };
}
const post = (body, headers, url) => postRaw(JSON.stringify(body), headers, url);
async function health(headers = teacher, url = base) {
  const response = await fetch(url + '/teacher/health', { headers });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') };
}
const count = async table => (await pg.query(`select count(*)::int as n from a2.${table}`)).rows[0].n;

describe('auth', () => {
  it('503 when CLASS_LOG_TOKEN is not configured, before parsing', async () => {
    const app = express();
    mountDeviceHealth(app, { store, env: {} });
    const other = await listen(app);
    try {
      expect((await post(ping(), auth, other.url)).status).toBe(503);
      expect((await postRaw('{not json', {}, other.url)).status).toBe(503);
    } finally { await close(other.listener); }
    expect(await count('device_health')).toBe(0);
  });
  it.each([[{}], [{ Authorization: 'Bearer wrong' }], [{ Authorization: TOKEN }], [teacher]])('401 with no body for %j', async headers => {
    const response = await post(ping(), headers);
    expect(response.status).toBe(401); expect(response.text).toBe('');
    expect((await postRaw('{not json', headers)).status).toBe(401);
    expect(await count('device_health')).toBe(0);
  });
  it('GET /teacher/health refuses the class-log bearer and a wrong secret', async () => {
    for (const headers of [auth, {}, { 'x-teacher-secret': 'nope' }]) {
      const response = await health(headers);
      expect(response.status).toBe(403);
      expect(response.cache).toBe('no-store');
    }
  });
});

describe('POST /class-log/health', () => {
  it('upserts the current row and appends to the log', async () => {
    expect(await post(ping())).toMatchObject({ status: 200, body: { ok: true }, cache: 'no-store' });
    clock = new Date('2026-10-21T14:10:00.000Z');
    expect((await post(ping({ battery: { pct: 80, charging: true } }))).status).toBe(200);
    expect(await count('device_health')).toBe(1);
    expect(await count('device_health_log')).toBe(2);
    const { rows } = await pg.query('select device, at, payload, received_at from a2.device_health');
    expect(rows[0]).toMatchObject({ device: 's24', at: '2026-10-21 13:58:00+00', received_at: '2026-10-21 14:10:00+00' });
    expect(rows[0].payload.battery).toEqual({ pct: 80, charging: true });
  });
  it('prunes log rows older than 30 days on insert', async () => {
    await pg.exec(`insert into a2.device_health_log (device, at, payload, received_at) values
      ('s24', null, '{}', '2026-09-20 13:59:00+00'), ('s24', null, '{}', '2026-09-21 14:01:00+00')`);
    expect((await post(ping())).status).toBe(200);
    const { rows } = await pg.query('select received_at from a2.device_health_log order by received_at');
    expect(rows.map(row => row.received_at)).toEqual(['2026-09-21 14:01:00+00', '2026-10-21 14:00:00+00']);
  });
  it('defaults the device to s24 and accepts a null at', async () => {
    const body = ping({ at: null });
    delete body.device;
    expect((await post(body)).status).toBe(200);
    expect((await pg.query('select device, at from a2.device_health')).rows).toEqual([{ device: 's24', at: null }]);
  });
  it.each([
    [[], /object/], [{ device: '' }, /device/], [{ device: 'x'.repeat(33) }, /32/], [{ device: 7 }, /device/],
    [{ at: 'yesterday' }, /at/], [{ at: 12 }, /at/], [{ note: 'a\u0000b' }, /U\+0000/],
  ])('400 for %j', async (body, message) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(message);
    expect(await count('device_health')).toBe(0);
  });
  it('413 above 8 KB, 400 on bad JSON, short and without a stack', async () => {
    expect(await post(ping({ pad: 'x'.repeat(8 * 1024) }))).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
    expect(await postRaw('{not json')).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    expect((await post(ping({ pad: 'x'.repeat(7 * 1024) }))).status).toBe(200);
  });
});

describe('GET /teacher/health', () => {
  it('lists devices with receivedAt and ageMinutes', async () => {
    await post(ping());
    clock = new Date('2026-10-21T14:12:30.000Z');
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.cache).toBe('no-store');
    expect(response.body).toEqual({ devices: [{
      device: 's24', at: '2026-10-21 13:58:00+00', receivedAt: '2026-10-21 14:00:00+00', ageMinutes: 12, payload: { ...ping(), recordingWarnings24h: 0 },
    }] });
  });
  it('serves recordingWarnings24h counted from the ping events24h lines, apart from failures24h', async () => {
    const events24h = ['10:12:00 D: transcript poor (12% usable, prompt echo in 7 of 9 parts)', '11:30:00 Mic: possibly covered (clipping for 45 s)', '11:31:00 Mic: ok'];
    expect((await post(ping({ events24h, failures24h: 0 }))).status).toBe(200);
    const { payload } = (await health()).body.devices[0];
    expect(payload.recordingWarnings24h).toBe(2);
    expect(payload.failures24h).toBe(0);
    expect(payload.events24h).toEqual(events24h);
    expect((await post(ping({ recordingWarnings24h: 1 }))).status).toBe(200);
    expect((await health()).body.devices[0].payload.recordingWarnings24h).toBe(1);
  });
  it('an empty list before the first ping', async () => {
    expect((await health()).body).toEqual({ devices: [] });
  });
});

describe('storage failures', () => {
  it('503 without details', async () => {
    const failing = { upsertCurrent: vi.fn(), appendLog: vi.fn(), pruneLog: vi.fn(), listCurrent: vi.fn() };
    for (const fn of Object.values(failing)) fn.mockRejectedValue(new Error('relation "a2.device_health" does not exist'));
    const app = express();
    mountDeviceHealth(app, { store: failing, env: { CLASS_LOG_TOKEN: TOKEN } });
    mountTeacherHealth(app, { store: failing, db: {} });
    const other = await listen(app);
    try {
      for (const response of [await post(ping(), auth, other.url), await health(teacher, other.url)]) {
        expect(response.status).toBe(503);
        expect(response.text).toBe(JSON.stringify({ error: 'Device health service unavailable' }));
      }
    } finally { await close(other.listener); }
  });
});

describe('pure helpers', () => {
  it('validateHealth keeps the whole body and normalizes at', () => {
    expect(validateHealth({ device: ' s24 ', at: '2026-10-21T09:58:00-04:00', x: 1 }))
      .toEqual({ device: 's24', at: '2026-10-21T13:58:00.000Z', payload: { device: 's24', at: '2026-10-21T09:58:00-04:00', x: 1, recordingWarnings24h: 0 } });
  });
  it('recordingWarnings counts transcript-poor and bad-mic lines; Mic: ok and failures are not warnings', () => {
    expect(recordingWarnings([
      '10:12:00 D: transcript poor (12% usable, prompt echo in 7 of 9 parts)',
      '10:13:00 Mic: possibly covered (clipping for 45 s)', '10:14:00 Mic: silent for 2 min',
      '10:15:00 Mic: ok', '10:16:00 Health: failed (no connection)', 'G: transcript poor (90% usable, 49 words)', 7, null,
    ])).toBe(4);
    expect(recordingWarnings(undefined)).toBe(0);
    expect(recordingWarnings('Mic: silent for 2 min')).toBe(0);
  });
  it('recordingWarnings24h: the phone count wins, else the events24h lines are counted, else 0', () => {
    expect(recordingWarnings24h({ recordingWarnings24h: 3, events24h: ['Mic: silent for 2 min'] })).toBe(3);
    expect(recordingWarnings24h({ recordingWarnings24h: -1, events24h: ['Mic: silent for 2 min'] })).toBe(1);
    expect(recordingWarnings24h({ recordingWarnings24h: '2' })).toBe(0);
    expect(recordingWarnings24h({})).toBe(0);
    expect(validateHealth({ events24h: ['11:05:00 C: transcript poor (30% usable)'] }).payload.recordingWarnings24h).toBe(1);
    expect(validateHealth({ x: 1 }).payload.recordingWarnings24h).toBe(0);
  });
  it('healthFromRow never reports a negative age', () => {
    expect(healthFromRow({ device: 'a', at: null, received_at: '2026-10-21T14:05:00Z', payload: {} }, new Date('2026-10-21T14:00:00Z')).ageMinutes).toBe(0);
  });
});
