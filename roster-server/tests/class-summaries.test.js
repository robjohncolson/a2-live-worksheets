import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  mountClassSummaries, mountTeacherSummaries, createClassSummaryStore, validateSummary, rangeDays,
} from '../class-summaries.js';

// Minimal Supabase query-builder fake over PGlite, covering exactly the calls
// class-summaries.js makes (select/gte/lte/order, upsert with onConflict).
// jsonb values go over the wire as JSON text, the way PostgREST receives them.
function fakeSupabase(pg) {
  return { from(table) {
    const where = []; const params = []; const orders = [];
    let op = 'select', columns = '*', payload = null, conflict = null, limit = '';
    const cmp = sign => (col, value) => { params.push(value); where.push(`${col} ${sign} $${params.length}`); return builder; };
    const builder = {
      select(cols = '*') { columns = cols; return builder; },
      gte: cmp('>='), lte: cmp('<='),
      order(col) { orders.push(col); return builder; },
      range(start, end) { limit = ` offset ${start} limit ${end - start + 1}`; return builder; },
      upsert(row, options) { op = 'upsert'; payload = row; conflict = options.onConflict; return builder; },
      async run() {
        try {
          if (op === 'select') {
            const sql = `select ${columns} from ${table}` + (where.length ? ` where ${where.join(' and ')}` : '')
              + (orders.length ? ` order by ${orders.join(', ')}` : '') + limit;
            return { data: (await pg.query(sql, params)).rows, error: null };
          }
          const keys = Object.keys(payload);
          const values = keys.map(key => (Array.isArray(payload[key]) ? JSON.stringify(payload[key]) : payload[key]));
          const sql = `insert into ${table} (${keys.join(', ')}) values (${keys.map((_, i) => '$' + (i + 1)).join(', ')})`
            + ` on conflict (${conflict}) do update set ${keys.map(key => `${key} = excluded.${key}`).join(', ')}`;
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
const teacher = { 'x-teacher-secret': 'summaries-teacher' };
const MIGRATION = readFileSync(new URL('../migrations/0043_class_summaries.sql', import.meta.url), 'utf8');
let pg, server, base, clock, store;

async function listen(app) {
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  return { listener, url: 'http://127.0.0.1:' + listener.address().port };
}
async function close(listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }

beforeAll(async () => {
  // Keep date/timestamptz as Postgres text, the way PostgREST returns strings.
  pg = new PGlite({ parsers: { 1082: x => x, 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2;');
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // idempotent
  await pg.exec('set search_path to a2');
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'summaries-teacher');
  await pg.exec('truncate a2.class_summaries');
  clock = new Date('2026-10-21T20:00:00.000Z');
  store = createClassSummaryStore(fakeSupabase(pg));
  const app = express();
  const now = () => { clock = new Date(clock.getTime() + 1000); return clock; };
  mountClassSummaries(app, { store, env: { CLASS_LOG_TOKEN: TOKEN }, now });
  mountTeacherSummaries(app, { store, db: { getRoleByStudentId: async () => 'student' } });
  ({ listener: server, url: base } = await listen(app));
});
afterEach(async () => { await close(server); vi.unstubAllEnvs(); });

const summary = (over = {}) => ({
  date: '2026-10-21', course: 'algebra2', section: 'C', model: 'deepseek-chat',
  markdown: '## What landed\n\nSlope as rate.', landed: ['slope as rate'], studentQuestions: ['why negative?'],
  promises: ['post the key'], nextPrep: ['bring graph paper'],
  transcriptPath: 'sessions/2026-10-21/C.txt', summaryPath: 'sessions/2026-10-21/C.md', ...over,
});
async function postRaw(text, headers = auth, url = base) {
  const response = await fetch(url + '/class-log/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  const body = await response.text();
  return { status: response.status, text: body, body: body ? JSON.parse(body) : null, cache: response.headers.get('cache-control') };
}
const post = (body, headers, url) => postRaw(JSON.stringify(body), headers, url);
async function list(query, headers = teacher, url = base) {
  const response = await fetch(url + '/teacher/summaries' + query, { headers });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') };
}
const count = async () => (await pg.query('select count(*)::int as n from a2.class_summaries')).rows[0].n;

describe('auth', () => {
  it('answers 503 when CLASS_LOG_TOKEN is not configured, before parsing', async () => {
    const app = express();
    mountClassSummaries(app, { store, env: {} });
    const other = await listen(app);
    try {
      const response = await post(summary(), auth, other.url);
      expect(response.status).toBe(503);
      expect((await postRaw('{not json', {}, other.url)).status).toBe(503);
    } finally { await close(other.listener); }
    expect(await count()).toBe(0);
  });
  it.each([
    [{}], [{ Authorization: 'Bearer wrong' }], [{ Authorization: TOKEN }], [{ Authorization: 'Bearer ' + TOKEN + 'x' }],
    [{ Authorization: 'Basic ' + TOKEN }], [teacher],
  ])('401 with no body for %j', async headers => {
    const response = await post(summary(), headers);
    expect(response.status).toBe(401); expect(response.text).toBe('');
    expect(await count()).toBe(0);
  });
  it('does not let the class-log bearer into GET /teacher/summaries', async () => {
    const response = await list('?from=2026-10-01&to=2026-10-31', auth);
    expect(response.status).toBe(403);
    expect(response.cache).toBe('no-store');
    expect((await list('?from=2026-10-01&to=2026-10-31', {})).status).toBe(403);
    expect((await list('?from=2026-10-01&to=2026-10-31', { 'x-teacher-secret': 'nope' })).status).toBe(403);
  });
});

describe('POST /class-log/summaries', () => {
  it('stores the row and answers {ok:true}', async () => {
    const response = await post(summary());
    expect(response).toMatchObject({ status: 200, body: { ok: true }, cache: 'no-store' });
    const { rows } = await pg.query('select * from a2.class_summaries');
    expect(rows).toEqual([{
      date: '2026-10-21', course: 'algebra2', section: 'C', model: 'deepseek-chat', markdown: '## What landed\n\nSlope as rate.',
      landed: ['slope as rate'], student_questions: ['why negative?'], promises: ['post the key'], next_prep: ['bring graph paper'],
      transcript_path: 'sessions/2026-10-21/C.txt', summary_path: 'sessions/2026-10-21/C.md', recorded_at: expect.any(String),
    }]);
  });
  it('missing lists become [], missing optional text becomes null', async () => {
    const body = { date: '2026-10-21', course: 'apstats', section: ' B ', markdown: 'x' };
    expect((await post(body)).status).toBe(200);
    const { rows } = await pg.query('select * from a2.class_summaries');
    expect(rows[0]).toMatchObject({
      section: 'B', model: null, landed: [], student_questions: [], promises: [], next_prep: [], transcript_path: null, summary_path: null,
    });
  });
  it('upsert replaces the row for the same (date, course, section)', async () => {
    await post(summary());
    const first = (await pg.query('select recorded_at from a2.class_summaries')).rows[0].recorded_at;
    expect((await post(summary({ markdown: 'second', landed: [], model: null }))).body).toEqual({ ok: true });
    const { rows } = await pg.query('select markdown, landed, model, recorded_at from a2.class_summaries');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ markdown: 'second', landed: [], model: null });
    expect(rows[0].recorded_at).not.toBe(first);
    await post(summary({ section: 'D' }));
    await post(summary({ course: 'apstats' }));
    await post(summary({ date: '2026-10-22' }));
    expect(await count()).toBe(4);
  });
  const items = n => Array.from({ length: n }, (_, i) => 'item ' + i);
  it.each([
    [[], /object/], [[summary()], /object/],
    [summary({ date: '2026-02-30' }), /date/], [summary({ date: '2026-10-1' }), /date/], [summary({ date: undefined }), /date/],
    [summary({ course: 'geometry' }), /course/], [summary({ course: undefined }), /course/],
    [summary({ section: '' }), /section/], [summary({ section: '  ' }), /section/], [summary({ section: 3 }), /section/],
    [summary({ section: 'é'.repeat(17) }), /section.*16/],
    [summary({ model: 7 }), /model/], [summary({ model: '😀'.repeat(65) }), /model.*64/],
    [summary({ markdown: '' }), /markdown/], [summary({ markdown: ' \n' }), /markdown/], [summary({ markdown: ['x'] }), /markdown/],
    [summary({ markdown: '漢'.repeat(40001) }), /markdown.*40000/],
    [summary({ landed: 'x' }), /landed.*array/], [summary({ studentQuestions: { a: 1 } }), /studentQuestions.*array/],
    [summary({ promises: items(41) }), /promises.*40 items/], [summary({ nextPrep: [1] }), /nextPrep\[0\].*string/],
    [summary({ landed: ['ok', null] }), /landed\[1\]/], [summary({ studentQuestions: ['ñ'.repeat(401)] }), /studentQuestions\[0\].*400/],
    [summary({ transcriptPath: 'ü'.repeat(201) }), /transcriptPath.*200/], [summary({ summaryPath: 5 }), /summaryPath/],
  ])('400 on invalid body %#', async (body, reason) => {
    const response = await post(body);
    expect(response.status).toBe(400); expect(response.body.error).toMatch(reason);
    expect(await count()).toBe(0);
  });
  it('accepts multibyte text exactly at every limit', async () => {
    const full = n => Array.from({ length: 40 }, () => n.repeat(400));
    const response = await post(summary({
      section: 'é'.repeat(16), model: '😀'.repeat(64), markdown: '漢'.repeat(40000),
      landed: full('ñ'), studentQuestions: full('😀'), promises: full('ü'), nextPrep: full('漢'),
      transcriptPath: 'ü'.repeat(200), summaryPath: '😀'.repeat(200),
    }));
    expect(response).toMatchObject({ status: 200, body: { ok: true } });
    const { rows } = await pg.query('select * from a2.class_summaries');
    expect([...rows[0].markdown]).toHaveLength(40000);
    expect(rows[0].student_questions).toHaveLength(40);
    expect([...rows[0].student_questions[39]]).toHaveLength(400);
    expect([...rows[0].summary_path]).toHaveLength(200);
  });
  it('top-level JSON that is not an object or array is bad_json (strict parser)', async () => {
    for (const text of ['"x"', 'null', '42']) expect(await postRaw(text)).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    expect(() => validateSummary(null)).toThrow(/object/);
    expect(() => validateSummary('x')).toThrow(/object/);
  });
  it('validateSummary trims list items and drops blank ones', () => {
    const row = validateSummary(summary({ landed: [' a ', '', '  '], nextPrep: null }));
    expect(row.landed).toEqual(['a']);
    expect(row.next_prep).toEqual([]);
    expect(validateSummary(summary({ transcriptPath: '  ' })).transcript_path).toBeNull();
  });
  it('maps parser errors to short JSON, after auth', async () => {
    expect(await postRaw('{not json', {})).toMatchObject({ status: 401, text: '' });
    expect(await postRaw('{not json')).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    const big = JSON.stringify(summary({ markdown: 'x'.repeat(1.1 * 1024 * 1024) }));
    expect(await postRaw(big, { Authorization: 'Bearer nope' })).toMatchObject({ status: 401, text: '' });
    expect(await postRaw(big)).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
  });
});

describe('GET /teacher/summaries', () => {
  beforeEach(async () => {
    for (const [date, course, section] of [
      ['2026-10-22', 'algebra2', 'G'], ['2026-10-21', 'algebra2', 'D'], ['2026-10-21', 'algebra2', 'C'],
      ['2026-10-23', 'apstats', 'B'], ['2026-09-30', 'algebra2', 'C'], ['2026-11-02', 'algebra2', 'C'],
    ]) expect((await post(summary({ date, course, section }))).status).toBe(200);
  });
  it('returns the range inclusive, ordered by date then section, in the POST body shape', async () => {
    const response = await list('?from=2026-10-21&to=2026-10-23');
    expect(response.status).toBe(200);
    expect(response.cache).toBe('no-store');
    expect(response.body.from).toBe('2026-10-21');
    expect(response.body.to).toBe('2026-10-23');
    expect(response.body.summaries.map(s => [s.date, s.section])).toEqual([
      ['2026-10-21', 'C'], ['2026-10-21', 'D'], ['2026-10-22', 'G'], ['2026-10-23', 'B'],
    ]);
    const { recordedAt, ...rest } = response.body.summaries[0];
    expect(recordedAt).toEqual(expect.any(String));
    expect(rest).toEqual(summary());
    expect((await list('?from=2026-10-24&to=2026-10-31')).body.summaries).toEqual([]);
    expect((await list('?from=2026-10-21&to=2026-10-21')).body.summaries).toHaveLength(2);
  });
  it('allows exactly 62 days and rejects 63', async () => {
    expect(rangeDays('2026-09-01', '2026-11-01')).toBe(62);
    const ok = await list('?from=2026-09-01&to=2026-11-01');
    expect(ok.status).toBe(200);
    expect(ok.body.summaries).toHaveLength(5);
    const tooLong = await list('?from=2026-09-01&to=2026-11-02');
    expect(tooLong.status).toBe(400); expect(tooLong.body.error).toMatch(/62/);
  });
  it.each([
    [''], ['?from=2026-10-01'], ['?to=2026-10-31'], ['?from=2026-10-01&to=2026-02-30'], ['?from=today&to=2026-10-31'],
    ['?from=2026-10-31&to=2026-10-01'], ['?from=2026-10-01&to=2026-10-31&to=2026-11-01'],
  ])('400 on bad range %j', async query => {
    expect((await list(query)).status).toBe(400);
  });
});

describe('storage failures', () => {
  it('503 without details when the table is missing (migration not yet run)', async () => {
    await pg.exec('drop table a2.class_summaries');
    try {
      const posted = await post(summary());
      expect(posted.status).toBe(503);
      expect(posted.text).not.toMatch(/class_summaries|relation|exist/);
      const listed = await list('?from=2026-10-01&to=2026-10-31');
      expect(listed.status).toBe(503);
      expect(listed.text).not.toMatch(/class_summaries|relation|exist/);
    } finally { await pg.exec(MIGRATION); }
  });
  it('503 without details when the store throws', async () => {
    const failing = { upsertSummary: vi.fn(), listRange: vi.fn() };
    for (const fn of Object.values(failing)) fn.mockRejectedValue(new Error('private database detail'));
    const app = express();
    mountClassSummaries(app, { store: failing, env: { CLASS_LOG_TOKEN: TOKEN } });
    mountTeacherSummaries(app, { store: failing, db: {} });
    const other = await listen(app);
    try {
      for (const response of [await post(summary(), auth, other.url), await list('?from=2026-10-01&to=2026-10-31', teacher, other.url)]) {
        expect(response.status).toBe(503);
        expect(response.text).not.toMatch(/private|stack|Error/);
      }
    } finally { await close(other.listener); }
  });

  it('rejects U+0000 in text and list fields with 400 and writes nothing', async () => {
    for (const body of [{ markdown: 'a\u0000b' }, { landed: ['a\u0000b'] }, { section: 'D\u0000' }, { model: 'm\u0000' }]) {
      const res = await post({ ...summary(), ...body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await count()).toBe(0);
  });

  it('pages through a range larger than one page without truncation', async () => {
    for (let i = 0; i < 1203; i++) expect((await post({ ...summary(), section: 'S' + String(i).padStart(4, '0') })).status).toBe(200);
    const res = await list('?from=2026-01-01&to=2026-12-31'.replace('2026-01-01', '2026-10-01').replace('2026-12-31', '2026-11-30'));
    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(1203);
    expect(res.body.summaries[0].section).toBe('S0000');
    expect(res.body.summaries[1202].section).toBe('S1202');
  });
});
