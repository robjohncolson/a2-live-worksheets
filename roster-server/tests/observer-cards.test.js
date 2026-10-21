import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  mountObserverCards, mountTeacherCards, createObserverCardStore, cardsEtag, checkClassLogToken, validateOutcome, validateCard,
} from '../observer-cards.js';

// Minimal Supabase query-builder fake over PGlite, covering exactly the calls
// observer-cards.js makes (select/eq/is/order/maybeSingle, insert, update+eq,
// upsert with onConflict). Running the real migrations keeps the constraints,
// the unique index and the updated_at trigger honest.
function fakeSupabase(pg) {
  return { from(table) {
    const where = []; const params = []; const orders = [];
    let op = 'select', columns = '*', payload = null, conflict = null, single = false;
    const builder = {
      select(cols = '*') { columns = cols; return builder; },
      eq(col, value) { params.push(value); where.push(`${col} = $${params.length}`); return builder; },
      is(col, value) { expect(value).toBeNull(); where.push(`${col} is null`); return builder; },
      order(col) { orders.push(col); return builder; },
      maybeSingle() { single = true; return builder; },
      insert(row) { op = 'insert'; payload = row; return builder; },
      update(fields) { op = 'update'; payload = fields; return builder; },
      upsert(row, options) { op = 'upsert'; payload = row; conflict = options.onConflict; return builder; },
      async run() {
        try {
          if (op === 'select') {
            const sql = `select ${columns} from ${table}` + (where.length ? ` where ${where.join(' and ')}` : '')
              + (orders.length ? ` order by ${orders.join(', ')}` : '');
            const { rows } = await pg.query(sql, params);
            if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
            return { data: single ? rows[0] || null : rows, error: null };
          }
          const keys = Object.keys(payload); const values = keys.map(key => payload[key]);
          if (op === 'update') {
            const sets = keys.map((key, i) => `${key} = $${i + 1}`);
            const shifted = where.map(clause => clause.replace(/\$(\d+)/g, (_, n) => '$' + (Number(n) + keys.length)));
            await pg.query(`update ${table} set ${sets.join(', ')} where ${shifted.join(' and ')}`, [...values, ...params]);
            return { data: null, error: null };
          }
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
const migration = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const UNIQUE_INDEX = "create unique index if not exists observer_cards_day_key on observer_cards (date, course, coalesce(section, ''))";
let pg, server, base, clock, store;

async function listen(app) {
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  return { listener, url: 'http://127.0.0.1:' + listener.address().port };
}
async function close(listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }

// One database for the file (PGlite start-up dominates); each test starts empty.
beforeAll(async () => {
  // Keep date/time/timestamptz as Postgres text, the way PostgREST returns strings.
  pg = new PGlite({ parsers: { 1082: x => x, 1083: x => x, 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  for (const name of ['0041_observer_cards.sql', '0042_observer_cards_unique.sql']) {
    await pg.exec(migration(name));
    await pg.exec(migration(name)); // idempotent
  }
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'cards-teacher');
  await pg.exec('truncate observer_cards cascade');
  clock = new Date('2026-10-21T11:00:00.000Z');
  store = createObserverCardStore(fakeSupabase(pg));
  // Same order as createApp: phone routes before any app-wide parser; no global parser here.
  const app = express();
  const now = () => { clock = new Date(clock.getTime() + 1000); return clock; };
  mountObserverCards(app, { store, env: { CLASS_LOG_TOKEN: TOKEN }, now });
  mountTeacherCards(app, { store, now, db: { getRoleByStudentId: async () => 'student' } });
  ({ listener: server, url: base } = await listen(app));
});
afterEach(async () => { await close(server); vi.unstubAllEnvs(); });

const card = (over = {}) => ({
  date: '2026-10-21', course: 'algebra2', section: 'C', lesson: '1-3', title: 'Which graph is it?',
  mode: 'whiteboards', minutes: 8, frame: 'I chose ___ because ___.', body: '## Prompt\n\nSketch it.', ...over,
});
const teacher = { 'x-teacher-secret': 'cards-teacher' };
async function putRaw(text, headers = teacher, url = base) {
  const response = await fetch(url + '/teacher/cards', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
  const body = await response.text();
  return { status: response.status, text: body, body: body ? JSON.parse(body) : null };
}
const putCards = (cards, headers) => putRaw(JSON.stringify(cards), headers);
async function getCards(date = '2026-10-21', headers = auth, url = base) {
  const response = await fetch(url + '/class-log/cards?date=' + date, { headers });
  const text = await response.text();
  return { status: response.status, etag: response.headers.get('etag'), cache: response.headers.get('cache-control'),
    type: response.headers.get('content-type'), text, body: text ? JSON.parse(text) : null };
}
async function postRaw(id, text, headers = auth, url = base) {
  const response = await fetch(url + `/class-log/cards/${id}/outcome`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: text,
  });
  const body = await response.text();
  return { status: response.status, text: body, body: body ? JSON.parse(body) : null };
}
const postOutcome = (id, body, headers) => postRaw(id, JSON.stringify(body), headers);
const count = async () => (await pg.query('select count(*)::int as n from observer_cards')).rows[0].n;
async function cardId(section = 'C') {
  await putCards([card({ section })]);
  return (await pg.query('select id from observer_cards where section = $1', [section])).rows[0].id;
}

describe('bearer auth', () => {
  it('answers 503 when CLASS_LOG_TOKEN is not configured', async () => {
    const app = express();
    mountObserverCards(app, { store, env: {} });
    const other = await listen(app);
    try {
      expect((await getCards('2026-10-21', auth, other.url)).status).toBe(503);
      expect((await postRaw('x', '{}', auth, other.url)).status).toBe(503);
    } finally { await close(other.listener); }
  });
  it.each([
    [{}], [{ Authorization: 'Bearer wrong' }], [{ Authorization: TOKEN }], [{ Authorization: 'Bearer ' + TOKEN + 'x' }],
    [{ Authorization: 'Bearer ' + TOKEN + ' extra' }], [{ Authorization: 'Basic ' + TOKEN }],
  ])('401 with no body for %j', async headers => {
    const response = await getCards('2026-10-21', headers);
    expect(response.status).toBe(401); expect(response.text).toBe('');
    const outcome = await postOutcome('00000000-0000-4000-8000-000000000000', { section: 'C', ran: true, at: null }, headers);
    expect(outcome.status).toBe(401); expect(outcome.text).toBe('');
  });
  it('accepts the right token, with any case of "bearer"', async () => {
    const response = await getCards();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ date: '2026-10-21', cards: [] });
    expect(response.cache).toBe('no-cache');
    expect(response.type).toBe('application/json; charset=utf-8');
    expect((await getCards('2026-10-21', { Authorization: 'bEaReR ' + TOKEN })).status).toBe(200);
    expect((await getCards('2026-10-21', { Authorization: 'bearer ' + TOKEN })).status).toBe(200);
  });
  it('denies array or non-string Authorization values', () => {
    const req = value => ({ get: () => value });
    const env = { CLASS_LOG_TOKEN: TOKEN };
    expect(checkClassLogToken(req(['Bearer ' + TOKEN]), env)).toBe('denied');
    expect(checkClassLogToken(req(undefined), env)).toBe('denied');
    expect(checkClassLogToken(req(42), env)).toBe('denied');
    expect(checkClassLogToken(req('Bearer ' + TOKEN), env)).toBe('ok');
    expect(checkClassLogToken(req('Bearer ' + TOKEN), {})).toBe('unconfigured');
  });
  it('does not let the class-log bearer into PUT /teacher/cards', async () => {
    expect((await putCards([card()], auth)).status).toBe(403);
    expect(await count()).toBe(0);
  });
  it('rejects a bad date with 400', async () => {
    for (const date of ['2026-02-30', '2026-10-1', 'today', '']) expect((await getCards(date)).status).toBe(400);
  });
});

describe('GET /class-log/cards and ETag', () => {
  it('uses the fixed empty ETag for a day with no cards and 304s on it', async () => {
    expect((await getCards()).etag).toBe('"empty"');
    const again = await getCards('2026-10-21', { ...auth, 'If-None-Match': '"empty"' });
    expect(again.status).toBe(304); expect(again.text).toBe('');
  });
  it('returns full rows; only an exact If-None-Match gives 304', async () => {
    await putCards([card(), card({ section: null, title: 'Course-wide' }), card({ date: '2026-10-22' })]);
    const response = await getCards();
    expect(response.status).toBe(200);
    expect(response.body.cards).toHaveLength(2);
    expect(response.body.cards[0]).toEqual(expect.objectContaining({
      id: expect.any(String), date: '2026-10-21', course: 'algebra2', lesson: '1-3', mode: 'whiteboards',
      minutes: 8, frame: 'I chose ___ because ___.', body: '## Prompt\n\nSketch it.', source: 'desk', updated_at: expect.any(String),
    }));
    expect(response.body.cards.map(c => c.section)).toEqual(['C', null]);
    const etag = response.etag;
    expect(etag).toMatch(/^"2-[0-9a-f]{16}"$/);
    expect((await getCards('2026-10-21', { ...auth, 'If-None-Match': etag })).status).toBe(304);
    // The proxy/compression layer weakens the tag on the wire; the phone sends W/"..." back.
    expect((await getCards('2026-10-21', { ...auth, 'If-None-Match': 'W/' + etag })).status).toBe(304);
    for (const value of ['*', `"other", ${etag}`, `${etag}, "other"`, '"stale"', 'W/"stale"']) {
      const fresh = await getCards('2026-10-21', { ...auth, 'If-None-Match': value });
      expect(fresh.status, value).toBe(200);
      expect(fresh.body.cards, value).toHaveLength(2);
      expect(fresh.etag).toBe(etag);
    }
  });
  it('changes on a Desk edit, keeps for an unchanged push', async () => {
    await putCards([card()]);
    const before = (await getCards()).etag;
    await putCards([card()]);
    expect((await getCards()).etag).toBe(before);
    await putCards([card({ title: 'Edited' })]);
    const after = await getCards();
    expect(after.etag).not.toBe(before);
    expect(after.body.cards[0].title).toBe('Edited');
  });
  it('changes on a direct SQL title edit even when updated_at is untouched', async () => {
    await putCards([card()]);
    const before = (await getCards()).etag;
    await pg.exec('alter table observer_cards disable trigger observer_cards_touch_updated_at');
    try {
      const stamp = (await pg.query('select updated_at from observer_cards')).rows[0].updated_at;
      await pg.exec("update observer_cards set title = 'Hand edit'");
      expect((await pg.query('select updated_at from observer_cards')).rows[0].updated_at).toBe(stamp);
      expect((await getCards()).etag).not.toBe(before);
    } finally { await pg.exec('alter table observer_cards enable trigger observer_cards_touch_updated_at'); }
  });
  it('changes when a row that is not the newest is edited', async () => {
    await putCards([card({ section: 'C' })]);
    await putCards([card({ section: 'D' })]);
    await pg.exec('alter table observer_cards disable trigger observer_cards_touch_updated_at');
    try {
      const before = (await getCards()).etag;
      await pg.exec("update observer_cards set frame = 'New frame' where section = 'C'");
      expect((await getCards()).etag).not.toBe(before);
    } finally { await pg.exec('alter table observer_cards enable trigger observer_cards_touch_updated_at'); }
  });
  it('0042 trigger bumps updated_at on a direct SQL update', async () => {
    await putCards([card()]);
    await pg.exec("update observer_cards set updated_at = '2020-01-01 00:00:00+00'");
    expect((await pg.query('select updated_at from observer_cards')).rows[0].updated_at).not.toMatch(/^2020/);
  });
  it('changes when a card is deleted', async () => {
    await putCards([card(), card({ section: 'D' })]);
    const before = (await getCards()).etag;
    await pg.exec("delete from observer_cards where section = 'D'");
    expect((await getCards()).etag).not.toBe(before);
    await pg.exec('delete from observer_cards');
    expect((await getCards()).etag).toBe('"empty"');
  });
  it('ETag is order-independent and content-sensitive', () => {
    const a = { id: 'a', title: 'A', updated_at: 't1' }, b = { id: 'b', title: 'B', updated_at: 't2' };
    expect(cardsEtag([a, b])).toBe(cardsEtag([b, a]));
    expect(cardsEtag([a, b])).not.toBe(cardsEtag([a, { ...b, title: 'B2' }]));
    expect(cardsEtag([a, b])).not.toBe(cardsEtag([a, { ...b, id: 'c' }]));
  });
});

describe('POST /class-log/cards/:id/outcome', () => {
  it.each([
    [{ ran: true, at: null }, /section/], [{ section: ' ', ran: true }, /section/], [{ section: 7, ran: true }, /section/],
    [{ section: 'C', ran: 'yes' }, /ran/], [{ section: 'C', ran: true, at: '8:05' }, /HH:MM/], [{ section: 'C', ran: true, at: '24:00' }, /HH:MM/],
    [{ section: 'C', ran: true, device: '' }, /device/], [{ section: 'é'.repeat(17), ran: true }, /16/],
    [{ section: 'C', ran: true, device: '😀'.repeat(33) }, /32/], [[], /object/],
  ])('400 on bad body %j', async (body, reason) => {
    const response = await postOutcome(await cardId(), body);
    expect(response.status).toBe(400); expect(response.body.error).toMatch(reason);
  });
  it('accepts multibyte section and device at the limits', async () => {
    const id = await cardId();
    expect((await postOutcome(id, { section: 'é'.repeat(16), ran: true, at: null, device: '😀'.repeat(32) })).status).toBe(200);
  });
  it('404 for an unknown or malformed card id', async () => {
    expect((await postOutcome('00000000-0000-4000-8000-000000000000', { section: 'C', ran: true, at: '08:05' })).status).toBe(404);
    expect((await postOutcome('not-a-uuid', { section: 'C', ran: true, at: '08:05' })).status).toBe(404);
  });
  it('upserts on (card, section, device), takes date from the card, and accepts at for skipped', async () => {
    const id = await cardId();
    expect(await postOutcome(id, { section: 'C', ran: true, at: '08:05' })).toMatchObject({ status: 200, body: { ok: true } });
    expect((await postOutcome(id, { section: 'C', ran: false, at: '08:40' })).status).toBe(200);
    expect((await postOutcome(id, { section: 'C', ran: true, at: null, device: 'pixel' })).status).toBe(200);
    const { rows } = await pg.query('select date, section, ran, at, device from observer_card_outcomes order by device');
    expect(rows).toEqual([
      { date: '2026-10-21', section: 'C', ran: true, at: null, device: 'pixel' },
      { date: '2026-10-21', section: 'C', ran: false, at: '08:40:00', device: 's24' },
    ]);
  });
  it('validateOutcome defaults device to s24', () => {
    expect(validateOutcome({ section: 'G', ran: false, at: null })).toEqual({ section: 'G', ran: false, at: null, device: 's24' });
  });
});

describe('body parsing (route-local, after auth)', () => {
  const big = JSON.stringify({ section: 'C', ran: true, pad: 'x'.repeat(70 * 1024) });
  it('401/503 before parsing junk or oversize bodies', async () => {
    expect(await postRaw('x', '{not json', {})).toMatchObject({ status: 401, text: '' });
    expect(await postRaw('x', big, { Authorization: 'Bearer nope' })).toMatchObject({ status: 401, text: '' });
    const app = express(); mountObserverCards(app, { store, env: {} });
    const other = await listen(app);
    try { expect((await postRaw('x', '{not json', {}, other.url)).status).toBe(503); }
    finally { await close(other.listener); }
  });
  it('maps parser errors to short JSON with a valid token', async () => {
    expect(await postRaw('x', '{not json')).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    expect(await postRaw('x', big)).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
  });
  it('teacher route: 403 before parsing, then bad_json / too_large', async () => {
    expect((await putRaw('{not json', {})).status).toBe(403);
    expect(await putRaw('{not json')).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    const huge = JSON.stringify([card({ body: 'x'.repeat(2.1 * 1024 * 1024) })]);
    expect(await putRaw(huge)).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
    expect((await putRaw(huge, {})).status).toBe(403);
  });
});

describe('PUT /teacher/cards', () => {
  it('requires a teacher', async () => {
    expect((await putCards([card()], {})).status).toBe(403);
    expect((await putCards([card()], { 'x-teacher-secret': 'nope' })).status).toBe(403);
  });
  it.each([
    [{}, /array/], [[], /array/], [[card({ id: 'x' })], /id/], [[card({ date: '2026-13-01' })], /date/],
    [[card({ date: '2026-02-30' })], /date/], [[card({ course: 'geometry' })], /course/], [[card({ mode: 'dance' })], /mode/],
    [[card({ minutes: 2.5 })], /minutes/], [[card({ minutes: 0 })], /minutes/], [[card({ minutes: 181 })], /minutes/],
    [[card({ title: ' ' })], /title/], [[card({ body: '' })], /body/], [[card({ source: 'phone' })], /source/],
    [[card({ section: 123 })], /section/], [[card({ lesson: 13 })], /lesson/], [[card({ frame: ['x'] })], /frame/],
    [[card(), card()], /duplicate/],
    [[card({ section: 'é'.repeat(17) })], /section.*16/], [[card({ lesson: 'ü'.repeat(33) })], /lesson.*32/],
    [[card({ title: '😀'.repeat(201) })], /title.*200/], [[card({ frame: 'ñ'.repeat(501) })], /frame.*500/],
    [[card({ body: '漢'.repeat(4001) })], /body.*4000/],
    [Array.from({ length: 501 }, (_, i) => card({ section: 'S' + i })), /500/],
  ])('400 on invalid body %#', async (body, reason) => {
    const response = await putCards(body);
    expect(response.status).toBe(400); expect(response.body.error).toMatch(reason);
    expect(await count()).toBe(0);
  });
  it('accepts multibyte text exactly at every limit', async () => {
    const response = await putCards([card({
      section: 'é'.repeat(16), lesson: 'ü'.repeat(32), title: '😀'.repeat(200), frame: 'ñ'.repeat(500), body: '漢'.repeat(4000),
    })]);
    expect(response.body).toEqual({ ok: true, written: 1, unchanged: 0 });
    const { rows } = await pg.query('select title, body from observer_cards');
    expect([...rows[0].title]).toHaveLength(200);
    expect([...rows[0].body]).toHaveLength(4000);
  });
  it('inserts, then leaves unchanged content (and updated_at) alone, then writes a real change', async () => {
    expect((await putCards([card(), card({ section: 'D' })])).body).toEqual({ ok: true, written: 2, unchanged: 0 });
    const stamp = async () => (await pg.query("select updated_at from observer_cards where section = 'C'")).rows[0].updated_at;
    const first = await stamp();
    const etag = (await getCards()).etag;
    expect((await putCards([card(), card({ section: 'D' })])).body).toEqual({ ok: true, written: 0, unchanged: 2 });
    expect(await stamp()).toBe(first);
    expect((await getCards()).etag).toBe(etag);
    expect((await putCards([card({ minutes: 9 }), card({ section: 'D' })])).body).toEqual({ ok: true, written: 1, unchanged: 1 });
    expect(await stamp()).not.toBe(first);
    expect(await count()).toBe(2);
  });
  it('upserts the course-wide (NULL section) card instead of duplicating it', async () => {
    const wide = card({ section: null, title: 'All sections' });
    expect((await putCards([wide])).body.written).toBe(1);
    expect((await putCards([wide])).body).toEqual({ ok: true, written: 0, unchanged: 1 });
    expect((await putCards([{ ...wide, title: 'All sections, edited' }])).body.written).toBe(1);
    expect((await pg.query('select title from observer_cards where section is null')).rows).toEqual([{ title: 'All sections, edited' }]);
    await putCards([card()]);
    expect(await count()).toBe(2);
  });
  it('0042 index blocks a second course-wide row for the same day', async () => {
    await putCards([card({ section: null })]);
    await expect(pg.exec("insert into observer_cards (date, course, title, body) values ('2026-10-21', 'algebra2', 'Dup', 'x')"))
      .rejects.toMatchObject({ code: '23505' });
  });
  it('a lost insert race (23505) falls back to the update path: 200, one row', async () => {
    const insertCard = store.insertCard;
    store.insertCard = async row => {
      // Another push wins between our find and our insert.
      await insertCard({ ...row, title: 'Racer' });
      await insertCard(row); // throws the real unique violation
    };
    try {
      const response = await putCards([card({ section: null, title: 'Mine' })]);
      expect(response).toMatchObject({ status: 200, body: { ok: true, written: 1, unchanged: 0 } });
      expect((await pg.query('select title from observer_cards')).rows).toEqual([{ title: 'Mine' }]);
    } finally { store.insertCard = insertCard; }
  });
  it('if duplicates ever exist (pre-0042), updates the most recently updated one and answers 200', async () => {
    await pg.exec('drop index observer_cards_day_key');
    try {
      await pg.exec(`insert into observer_cards (date, course, title, body, updated_at) values
        ('2026-10-21', 'algebra2', 'Old', 'x', '2026-10-01 00:00:00+00'),
        ('2026-10-21', 'algebra2', 'New', 'x', '2026-10-02 00:00:00+00')`);
      const response = await putCards([card({ section: null, title: 'Pushed' })]);
      expect(response).toMatchObject({ status: 200, body: { ok: true, written: 1 } });
      expect((await pg.query('select title from observer_cards order by title')).rows).toEqual([{ title: 'Old' }, { title: 'Pushed' }]);
    } finally { await pg.exec('truncate observer_cards cascade'); await pg.exec(UNIQUE_INDEX); }
  });
  it('database failures answer 503 without details', async () => {
    const failing = { listByDate: vi.fn(), getCard: vi.fn(), upsertOutcome: vi.fn(), findCard: vi.fn(), updateCard: vi.fn(), insertCard: vi.fn() };
    for (const fn of Object.values(failing)) fn.mockRejectedValue(new Error('private database detail'));
    const app = express();
    mountObserverCards(app, { store: failing, env: { CLASS_LOG_TOKEN: TOKEN } });
    mountTeacherCards(app, { store: failing, db: {} });
    const other = await listen(app);
    try {
      const responses = [
        await getCards('2026-10-21', auth, other.url),
        await postRaw('00000000-0000-4000-8000-000000000000', JSON.stringify({ section: 'C', ran: true }), auth, other.url),
        await putRaw(JSON.stringify([card()]), teacher, other.url),
      ];
      for (const response of responses) {
        expect(response.status).toBe(503);
        expect(response.text).not.toMatch(/private|stack|Error/);
      }
    } finally { await close(other.listener); }
  });
  it('validateCard normalizes defaults and blank optional text', () => {
    expect(validateCard({ date: '2026-10-21', course: 'apstats', title: ' T ', body: 'B', frame: ' ', section: '' })).toEqual({
      date: '2026-10-21', course: 'apstats', section: null, lesson: null, title: 'T', mode: 'whiteboards', minutes: 10,
      frame: null, body: 'B', source: 'desk',
    });
  });
});

describe('GET /teacher/cards (the Desk draft script)', () => {
  async function teacherCards(query, headers = teacher, url = base) {
    const response = await fetch(url + '/teacher/cards' + query, { headers });
    const text = await response.text();
    return { status: response.status, cache: response.headers.get('cache-control'), etag: response.headers.get('etag'), text, body: text ? JSON.parse(text) : null };
  }
  it('returns the same {date, cards} rows as the phone GET', async () => {
    await putCards([card({ section: 'C' }), card({ section: null, title: 'All' }), card({ date: '2026-10-22', section: 'G' })]);
    const desk = await teacherCards('?date=2026-10-21');
    expect(desk.status).toBe(200);
    expect(desk.cache).toBe('no-store');
    expect(desk.body).toEqual((await getCards('2026-10-21')).body);
    expect(desk.body.cards.map(row => row.section)).toEqual(['C', null]);
    expect((await teacherCards('?date=2026-10-23')).body).toEqual({ date: '2026-10-23', cards: [] });
  });
  it('refuses the class-log bearer and a wrong secret; 400 on a bad date', async () => {
    expect((await teacherCards('?date=2026-10-21', auth)).status).toBe(403);
    expect((await teacherCards('?date=2026-10-21', {})).status).toBe(403);
    expect((await teacherCards('?date=2026-10-21', { 'x-teacher-secret': 'nope' })).status).toBe(403);
    expect((await teacherCards('?date=2026-02-30')).status).toBe(400);
    expect((await teacherCards('')).status).toBe(400);
  });
  it('503 without details on a storage failure', async () => {
    const failing = { listByDate: vi.fn().mockRejectedValue(new Error('private database detail')) };
    const app = express();
    mountTeacherCards(app, { store: failing, db: {} });
    const other = await listen(app);
    try {
      const response = await teacherCards('?date=2026-10-21', teacher, other.url);
      expect(response.status).toBe(503);
      expect(response.text).not.toMatch(/private/);
    } finally { await close(other.listener); }
  });
});
