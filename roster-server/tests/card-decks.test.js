import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { mountCardDecks, mountTeacherDecks, createCardDeckStore, decksEtag, deckStats } from '../card-decks.js';
import { validateItems, validateResults, validateDeckPut, deckContentHash, itemId, rosterNameHits, DECK_LIMITS } from '../deck-rules.js';

// Minimal Supabase query-builder fake over PGlite, covering exactly the calls
// card-decks.js makes (select/eq/in/order/range/maybeSingle, upsert with
// onConflict and ignoreDuplicates, delete+eq, .select() returning rows, and rpc
// calling the real a2 function from 0046 the way PostgREST does).
// jsonb values go over the wire as JSON text, the way PostgREST receives them.
// Running the real migrations keeps the constraints and the trigger honest.
function fakeSupabase(pg) {
  return { async rpc(name, args) {
    try {
      const { rows } = await pg.query(`select a2.${name}($1::jsonb) as result`, [JSON.stringify(args.p_decks)]);
      return { data: rows[0].result, error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  }, from(table) {
    const where = []; const params = []; const orders = [];
    let op = 'select', columns = '*', payload = null, conflict = null, ignore = false, single = false, returning = null, range = null;
    const builder = {
      select(cols = '*') { if (op === 'select') columns = cols; else returning = cols; return builder; },
      eq(col, value) { params.push(value); where.push(`${col} = $${params.length}`); return builder; },
      in(col, values) { params.push(values); where.push(`${col} = any($${params.length})`); return builder; },
      order(col) { orders.push(col); return builder; },
      range(from, to) { range = [from, to]; return builder; },
      maybeSingle() { single = true; return builder; },
      upsert(rows, options) { op = 'upsert'; payload = rows; conflict = options.onConflict; ignore = options.ignoreDuplicates === true; return builder; },
      delete() { op = 'delete'; return builder; },
      async run() {
        try {
          const clause = where.length ? ` where ${where.join(' and ')}` : '';
          if (op === 'select') {
            let sql = `select ${columns} from ${table}${clause}` + (orders.length ? ` order by ${orders.join(', ')}` : '');
            if (range) sql += ` limit ${range[1] - range[0] + 1} offset ${range[0]}`;
            const { rows } = await pg.query(sql, params);
            if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
            return { data: single ? rows[0] || null : rows, error: null };
          }
          if (op === 'delete') {
            const { rows } = await pg.query(`delete from ${table}${clause}` + (returning ? ` returning ${returning}` : ''), params);
            return { data: returning ? rows : null, error: null };
          }
          const list = Array.isArray(payload) ? payload : [payload];
          const keys = Object.keys(list[0]);
          const values = []; const tuples = [];
          for (const row of list) {
            tuples.push('(' + keys.map(key => {
              const value = row[key];
              values.push(value && typeof value === 'object' ? JSON.stringify(value) : value);
              return '$' + values.length;
            }).join(', ') + ')');
          }
          let sql = `insert into ${table} (${keys.join(', ')}) values ${tuples.join(', ')} on conflict (${conflict}) `;
          sql += ignore ? 'do nothing' : `do update set ${keys.map(key => `${key} = excluded.${key}`).join(', ')}`;
          if (returning) sql += ` returning ${returning}`;
          const { rows } = await pg.query(sql, values);
          return { data: returning ? rows : null, error: null };
        } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      },
      then(resolve, reject) { return builder.run().then(resolve, reject); },
    };
    return builder;
  } };
}

const TOKEN = 'class-log-test-token-0123456789abcdef';
const auth = { Authorization: 'Bearer ' + TOKEN };
const teacher = { 'x-teacher-secret': 'decks-teacher' };
const migration = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
let pg, server, base, clock, store;

async function listen(app) {
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  return { listener, url: 'http://127.0.0.1:' + listener.address().port };
}
async function close(listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }

// One database for the file; each test starts empty.
beforeAll(async () => {
  pg = new PGlite({ parsers: { 1082: x => x, 1083: x => x, 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2; set search_path to a2; set timezone to UTC');
  for (const name of ['0041_observer_cards.sql', '0042_observer_cards_unique.sql']) await pg.exec(migration(name));
  await pg.exec(migration('0046_card_decks.sql'));
  await pg.exec(migration('0046_card_decks.sql')); // idempotent
});
afterAll(async () => { await pg.close(); });

const CARD_C = '11111111-1111-4111-8111-111111111111';
const CARD_G = '22222222-2222-4222-8222-222222222222';
const CARD_ALL = '33333333-3333-4333-8333-333333333333';
const MISSING = '99999999-9999-4999-8999-999999999999';

beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'decks-teacher');
  await pg.exec('truncate a2.observer_cards cascade; truncate a2.deck_results');
  await pg.exec(`insert into a2.observer_cards (id, date, course, section, title, body) values
    ('${CARD_C}', '2026-10-22', 'algebra2', 'C', 'Three pieces', '## Preparing'),
    ('${CARD_G}', '2026-10-22', 'algebra2', 'G', 'Three pieces', '## Preparing'),
    ('${CARD_ALL}', '2026-10-23', 'algebra2', null, 'All sections', '## Preparing')`);
  clock = new Date('2026-10-21T23:00:00.000Z');
  store = createCardDeckStore(fakeSupabase(pg), { page: 3 });
  const app = express();
  const now = () => { clock = new Date(clock.getTime() + 1000); return clock; };
  mountCardDecks(app, { store, env: { CLASS_LOG_TOKEN: TOKEN }, now });
  mountTeacherDecks(app, { store, now, db: { getRoleByStudentId: async () => 'student' } });
  ({ listener: server, url: base } = await listen(app));
});
afterEach(async () => { await close(server); vi.unstubAllEnvs(); });

const item = (n, over = {}) => ({ id: `item-${String(n).padStart(4, '0')}`, type: 'anchor', front: `Front ${n}`, back: `Back ${n}`, order: n, after: [], minute: null, ...over });
const items = (count = 10) => Array.from({ length: count }, (_, i) => item(i + 1));
async function call(method, path, { body, text, headers = teacher } = {}) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: text ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const out = await response.text();
  return { status: response.status, text: out, body: out ? JSON.parse(out) : null, etag: response.headers.get('etag'), cache: response.headers.get('cache-control') };
}
const putDecks = (decks, headers) => call('PUT', '/teacher/decks', { body: { decks }, headers });
const getDecks = (date = '2026-10-22', headers = auth) => call('GET', '/class-log/decks?date=' + date, { headers });
const results = (rows, over = {}) => ({ device: 's24', cardId: CARD_C, section: 'C', date: '2026-10-22', results: rows, ...over });
const grade = (session, n, g, at = '2026-10-22T13:00:00.000Z') => ({ session, itemId: item(n).id, grade: g, at, latencyMs: 1200 });
const postResults = (body, headers = auth) => call('POST', '/class-log/deck-results', { body, headers });

describe('deck-rules', () => {
  it('accepts a valid deck and normalizes it (unknown keys dropped, text trimmed, defaults)', () => {
    const raw = items(8).map(i => ({ ...i, extra: 1 }));
    raw[0].front = '  Spaced  ';
    delete raw[1].after; delete raw[1].minute;
    const out = validateItems(raw);
    expect(out[0].front).toBe('Spaced');
    expect(out[1]).toEqual({ ...item(2) });
    expect(out[0]).not.toHaveProperty('extra');
  });
  it('enforces count, sizes and types', () => {
    expect(() => validateItems(items(7))).toThrow(/8 to 14 entries \(got 7\)/);
    expect(() => validateItems(items(15))).toThrow(/8 to 14/);
    expect(() => validateItems(items(14))).not.toThrow();
    const long = items(8); long[0].front = 'é'.repeat(DECK_LIMITS.front);
    expect(() => validateItems(long)).not.toThrow();
    long[0].front += 'x';
    expect(() => validateItems(long)).toThrow(/front must be at most 240/);
    const back = items(8); back[2].back = 'x'.repeat(321);
    expect(() => validateItems(back)).toThrow(/back must be at most 320/);
    const bad = (over, re) => { const list = items(8); Object.assign(list[3], over); expect(() => validateItems(list)).toThrow(re); };
    bad({ type: 'joke' }, /type must be one of/);
    bad({ id: 'short' }, /id must be 8-40/);
    bad({ id: 'x'.repeat(41) }, /id must be 8-40/);
    bad({ id: 'has space ok' }, /id must be/);
    bad({ order: 1.5 }, /order must be an integer/);
    bad({ front: '  ' }, /front is required/);
    bad({ back: 'a\u0000b' }, /U\+0000/);
    bad({ minute: 3 }, /minute is for steps only/);
    bad({ type: 'step', minute: -1 }, /a step needs minute, an integer 0-180/);
    bad({ type: 'step', minute: 181 }, /a step needs minute/);
    bad({ type: 'step', minute: 2.5 }, /a step needs minute/);
    bad({ type: 'step', minute: null }, /a step needs minute/);
    bad({ type: 'step', minute: undefined }, /a step needs minute/);
    bad({ after: 'item-0001' }, /after must be an array/);
    bad({ after: ['item-0001', 'item-0001'] }, /must not repeat/);
    bad({ after: ['item-0004'] }, /must not include the item itself/);
    const step = items(8); Object.assign(step[3], { type: 'step', minute: 5 });
    expect(validateItems(step)[3].minute).toBe(5);
  });
  it('rejects duplicate ids, unknown after ids and cycles in after', () => {
    const dup = items(8); dup[5].id = dup[4].id;
    expect(() => validateItems(dup)).toThrow(/duplicate item id item-0005/);
    const unknown = items(8); unknown[2].after = ['item-9999'];
    expect(() => validateItems(unknown)).toThrow(/after names unknown id item-9999/);
    const cycle = items(8); cycle[0].after = ['item-0003']; cycle[2].after = ['item-0002']; cycle[1].after = ['item-0001'];
    expect(() => validateItems(cycle)).toThrow(/after has a cycle: item-0001 -> item-0003 -> item-0002 -> item-0001/);
    const dag = items(8); dag[3].after = ['item-0001', 'item-0002']; dag[4].after = ['item-0004', 'item-0001'];
    expect(() => validateItems(dag)).not.toThrow();
  });
  it('ids are the first 12 hex of sha256(type + front) and stable; the content hash ignores generatedAt', () => {
    expect(itemId('trap', 'x < 1 or x <= 1?')).toMatch(/^[0-9a-f]{12}$/);
    expect(itemId('trap', 'x < 1 or x <= 1?')).toBe(itemId('trap', 'x < 1 or x <= 1?'));
    expect(itemId('trap', 'a')).not.toBe(itemId('cue', 'a'));
    expect(itemId('anchor', 'Slope of piece A?')).toBe('2ee558e944c8'); // fixed: the phone and old files rely on it
    const a = validateDeckPut({ decks: [{ cardId: CARD_C, items: items(), model: 'm', generatedAt: '2026-10-21T20:00:00Z' }] })[0];
    const b = validateDeckPut({ decks: [{ cardId: CARD_C.toUpperCase(), items: items(), model: 'm', generatedAt: '2026-10-21T21:00:00Z' }] })[0];
    expect(a.contentHash).toBe(b.contentHash);
    expect(b.cardId).toBe(CARD_C);
    expect(deckContentHash(a.items, 'other')).not.toBe(a.contentHash);
  });
  it('validateDeckPut: shape, limits and one deck per card', () => {
    expect(() => validateDeckPut([])).toThrow(/body must be an object/);
    expect(() => validateDeckPut({ decks: [] })).toThrow(/non-empty/);
    expect(() => validateDeckPut({ decks: Array.from({ length: 21 }, () => ({ cardId: CARD_C, items: items() })) })).toThrow(/at most 20 decks/);
    expect(() => validateDeckPut({ decks: [{ cardId: 'nope', items: items() }] })).toThrow(/deck 0: cardId/);
    expect(() => validateDeckPut({ decks: [{ cardId: CARD_C, items: items(3) }] })).toThrow(/deck 0: items must have 8 to 14/);
    expect(() => validateDeckPut({ decks: [{ cardId: CARD_C, items: items(), generatedAt: 'yesterday' }] })).toThrow(/generatedAt/);
    expect(() => validateDeckPut({ decks: [{ cardId: CARD_C, items: items() }, { cardId: CARD_C, items: items() }] })).toThrow(/more than one deck/);
  });
  it('validateResults: shape, limits, defaults and exact repeats removed', () => {
    const body = validateResults({ cardId: CARD_C, section: ' C ', date: '2026-10-22',
      results: [grade(1, 1, 'again', '2026-10-22T09:00:00-04:00'), grade(1, 1, 'again', '2026-10-22T13:00:00Z'), { ...grade(1, 2, 'got_it'), latencyMs: undefined }] });
    expect(body).toEqual({ device: 's24', cardId: CARD_C, section: 'C', date: '2026-10-22', results: [
      { session: 1, itemId: 'item-0001', grade: 'again', at: '2026-10-22T13:00:00.000Z', latencyMs: 1200 },
      { session: 1, itemId: 'item-0002', grade: 'got_it', at: '2026-10-22T13:00:00.000Z', latencyMs: null },
    ] });
    const bad = (over, re) => expect(() => validateResults({ ...results([grade(1, 1, 'again')]), ...over })).toThrow(re);
    bad({ cardId: 'x' }, /cardId/);
    bad({ section: '' }, /section/);
    bad({ date: '2026-02-30' }, /date/);
    bad({ results: [] }, /non-empty/);
    bad({ results: Array.from({ length: 201 }, (_, i) => grade(1, 1, 'again', new Date(Date.UTC(2026, 9, 22, 0, 0, i)).toISOString())) }, /at most 200/);
    bad({ results: [{ ...grade(1, 1, 'again'), grade: 'meh' }] }, /grade must be again or got_it/);
    bad({ results: [{ ...grade(0, 1, 'again') }] }, /session must be an integer/);
    bad({ results: [{ ...grade(1, 1, 'again'), at: null }] }, /at must be an ISO/);
    bad({ results: [{ ...grade(1, 1, 'again'), latencyMs: -5 }] }, /latencyMs/);
    bad({ results: [{ ...grade(1, 1, 'again'), itemId: 'x' }] }, /itemId/);
  });
  it('rosterNameHits finds whole-word, case-sensitive first names only', () => {
    const list = [item(1, { front: 'Ask Maria to explain', back: 'ok' }), item(2, { front: 'Mariano?', back: 'maria lower' }), item(3, { back: '(Jo) said it' })];
    expect(rosterNameHits(list, ['Maria', 'Jo', ' '])).toEqual([{ id: 'item-0001', name: 'Maria' }, { id: 'item-0003', name: 'Jo' }]);
    expect(rosterNameHits(list, [])).toEqual([]);
  });
  it('deckStats counts sessions per device and the top three missed items', () => {
    const list = validateItems(items(8));
    const rows = [
      ...[1, 1, 1].map(() => ({ device: 's24', session: 1, item_id: 'item-0005', grade: 'again' })),
      { device: 's24', session: 2, item_id: 'item-0003', grade: 'again' }, { device: 's24', session: 2, item_id: 'item-0002', grade: 'again' },
      { device: 's24', session: 2, item_id: 'item-0004', grade: 'again' }, { device: 'tab', session: 1, item_id: 'item-0001', grade: 'got_it' },
      { device: 's24', session: 2, item_id: 'gone-item-1', grade: 'again' },
    ];
    expect(deckStats(list, rows)).toEqual({
      results: { sessions: 3, asked: 8, again: 7 },
      missed: [
        { itemId: 'item-0005', type: 'anchor', front: 'Front 5', again: 3 },
        { itemId: 'item-0002', type: 'anchor', front: 'Front 2', again: 1 },
        { itemId: 'item-0003', type: 'anchor', front: 'Front 3', again: 1 },
      ],
    });
    expect(deckStats(list, [])).toEqual({ results: { sessions: 0, asked: 0, again: 0 }, missed: [] });
  });
});

describe('auth', () => {
  it('503 when CLASS_LOG_TOKEN is not configured, before parsing', async () => {
    const app = express();
    mountCardDecks(app, { store, env: {} });
    const other = await listen(app);
    try {
      expect((await fetch(other.url + '/class-log/decks?date=2026-10-22', { headers: auth })).status).toBe(503);
      const post = await fetch(other.url + '/class-log/deck-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
      expect(post.status).toBe(503);
    } finally { await close(other.listener); }
  });
  it.each([[{}], [{ Authorization: 'Bearer wrong' }], [{ Authorization: TOKEN }], [teacher]])('401 with no body for %j', async headers => {
    expect(await getDecks('2026-10-22', headers)).toMatchObject({ status: 401, text: '', cache: 'no-store' });
    expect(await call('POST', '/class-log/deck-results', { text: '{not json', headers })).toMatchObject({ status: 401, text: '' });
    expect((await pg.query('select count(*)::int as n from a2.deck_results')).rows[0].n).toBe(0);
  });
  it('teacher routes refuse the class-log bearer and a wrong secret', async () => {
    for (const headers of [auth, {}, { 'x-teacher-secret': 'nope' }]) {
      expect(await putDecks([{ cardId: CARD_C, items: items() }], headers)).toMatchObject({ status: 403, cache: 'no-store' });
      expect((await call('GET', '/teacher/decks?date=2026-10-22', { headers })).status).toBe(403);
      expect((await call('DELETE', '/teacher/decks?cardId=' + CARD_C, { headers })).status).toBe(403);
    }
    expect((await pg.query('select count(*)::int as n from a2.card_decks')).rows[0].n).toBe(0);
  });
});

describe('PUT /teacher/decks', () => {
  it('writes, copies date/course/section from the card, then leaves an identical push alone', async () => {
    const first = await putDecks([{ cardId: CARD_C, items: items(), model: 'deepseek-chat', generatedAt: '2026-10-21T20:00:00-04:00' },
      { cardId: CARD_ALL, items: items(12) }]);
    expect(first).toMatchObject({ status: 200, body: { ok: true, written: 2, unchanged: 0 }, cache: 'no-store' });
    const { rows } = await pg.query('select * from a2.card_decks order by date');
    expect(rows[0]).toMatchObject({ card_id: CARD_C, date: '2026-10-22', course: 'algebra2', section: 'C', model: 'deepseek-chat', generated_at: '2026-10-22 00:00:00+00' });
    expect(rows[0].items).toHaveLength(10);
    expect(rows[0].items[0]).toEqual(item(1));
    expect(rows[1]).toMatchObject({ card_id: CARD_ALL, section: null, model: null, generated_at: null });
    const stamp = rows[0].updated_at;
    // Same content, new generatedAt: unchanged, row untouched.
    const again = await putDecks([{ cardId: CARD_C, items: items(), model: 'deepseek-chat', generatedAt: '2026-10-21T22:00:00Z' }]);
    expect(again.body).toEqual({ ok: true, written: 0, unchanged: 1 });
    expect((await pg.query(`select updated_at, generated_at from a2.card_decks where card_id = '${CARD_C}'`)).rows[0])
      .toEqual({ updated_at: stamp, generated_at: '2026-10-22 00:00:00+00' });
    // A real change writes.
    const changed = items(); changed[0].back = 'Changed';
    expect((await putDecks([{ cardId: CARD_C, items: changed, model: 'deepseek-chat' }])).body).toEqual({ ok: true, written: 1, unchanged: 0 });
    expect((await pg.query(`select items->0->>'back' as back from a2.card_decks where card_id = '${CARD_C}'`)).rows[0].back).toBe('Changed');
  });
  it('a missing card is 404 and writes nothing, even for the other decks', async () => {
    const response = await putDecks([{ cardId: CARD_C, items: items() }, { cardId: MISSING, items: items() }]);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe(`Card not found: ${MISSING}`);
    expect((await pg.query('select count(*)::int as n from a2.card_decks')).rows[0].n).toBe(0);
  });
  it('400 on a bad deck with the reason; 503 without details on a storage failure', async () => {
    const bad = items(); bad[1].after = ['item-9999'];
    expect(await putDecks([{ cardId: CARD_C, items: bad }])).toMatchObject({ status: 400, body: { error: 'deck 0: item item-0002: after names unknown id item-9999' } });
    const app = express();
    const broken = { putDecks: async () => { throw Object.assign(new Error('function a2.put_card_decks does not exist (secret detail)'), { code: '42883' }); } };
    mountTeacherDecks(app, { store: broken, db: {} });
    const other = await listen(app);
    try {
      const response = await fetch(other.url + '/teacher/decks', { method: 'PUT', headers: { ...teacher, 'Content-Type': 'application/json' }, body: JSON.stringify({ decks: [{ cardId: CARD_C, items: items() }] }) });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Card deck service unavailable' }));
    } finally { await close(other.listener); }
  });
  it('the 0046 trigger bumps updated_at on a direct SQL update; deleting the card deletes the deck', async () => {
    await putDecks([{ cardId: CARD_C, items: items() }]);
    await pg.exec(`update a2.card_decks set updated_at = '2000-01-01' where card_id = '${CARD_C}'`);
    expect((await pg.query(`select updated_at from a2.card_decks where card_id = '${CARD_C}'`)).rows[0].updated_at).not.toBe('2000-01-01 00:00:00+00');
    await pg.exec(`delete from a2.observer_cards where id = '${CARD_C}'`);
    expect((await pg.query('select count(*)::int as n from a2.card_decks')).rows[0].n).toBe(0);
  });
  it('is one transaction: a failure on a later deck leaves the earlier decks unwritten', async () => {
    const good = { card_id: CARD_C, items: items(), model: null, generated_at: null, content_hash: 'h1' };
    const bad = { card_id: CARD_G, items: {}, model: null, generated_at: null, content_hash: 'h2' }; // fails the items check
    await expect(pg.query('select a2.put_card_decks($1::jsonb)', [JSON.stringify([good, bad])])).rejects.toThrow(/card_decks_items_check|check constraint/);
    expect((await pg.query('select count(*)::int as n from a2.card_decks')).rows[0].n).toBe(0);
    // An existing deck is not touched by a failed PUT either.
    expect((await putDecks([{ cardId: CARD_C, items: items() }])).body).toEqual({ ok: true, written: 1, unchanged: 0 });
    const before = (await pg.query('select items, updated_at from a2.card_decks')).rows[0];
    await expect(pg.query('select a2.put_card_decks($1::jsonb)', [JSON.stringify([{ ...good, content_hash: 'h3', items: items(9) }, bad])])).rejects.toThrow();
    expect((await pg.query('select items, updated_at from a2.card_decks')).rows[0]).toEqual(before);
  });
  it('put_card_decks: P0002 card_not_found for a missing card, non-array input refused, service_role only', async () => {
    await expect(pg.query('select a2.put_card_decks($1::jsonb)', [JSON.stringify([{ card_id: MISSING, items: items(), content_hash: 'h' }])]))
      .rejects.toMatchObject({ code: 'P0002', message: `card_not_found:${MISSING}` });
    await expect(pg.query("select a2.put_card_decks('{}'::jsonb)")).rejects.toMatchObject({ code: '22023' });
    expect((await pg.query("select a2.put_card_decks('[]'::jsonb) as r")).rows[0].r).toEqual({ written: 0, unchanged: 0 });
    const grants = await pg.query("select has_function_privilege('anon', 'a2.put_card_decks(jsonb)', 'execute') as anon, has_function_privilege('service_role', 'a2.put_card_decks(jsonb)', 'execute') as svc");
    expect(grants.rows[0]).toEqual({ anon: false, svc: true });
  });
  it('rewrites a deck whose card moved section even with the same content (hash and copied fields compared)', async () => {
    await putDecks([{ cardId: CARD_C, items: items() }]);
    await pg.exec(`update a2.card_decks set section = 'X' where card_id = '${CARD_C}'`);
    expect((await putDecks([{ cardId: CARD_C, items: items() }])).body).toEqual({ ok: true, written: 1, unchanged: 0 });
    expect((await pg.query('select section from a2.card_decks')).rows[0].section).toBe('C');
  });
  it('the database refuses an items value that is not an array', async () => {
    await expect(pg.exec(`insert into a2.card_decks (card_id, date, course, items, content_hash) values ('${CARD_G}', '2026-10-22', 'algebra2', '{}', 'h')`)).rejects.toThrow();
  });
});

describe('GET /class-log/decks and ETag', () => {
  it('an empty day has an empty-<hash> tag that differs per date and 304s on it', async () => {
    const a = await getDecks('2026-10-22');
    expect(a).toMatchObject({ status: 200, body: { date: '2026-10-22', decks: [] }, cache: 'no-cache' });
    expect(a.etag).toMatch(/^"empty-[0-9a-f]{16}"$/);
    expect((await getDecks('2026-10-24')).etag).not.toBe(a.etag);
    expect((await call('GET', '/class-log/decks?date=2026-10-22', { headers: { ...auth, 'If-None-Match': a.etag } })).status).toBe(304);
  });
  it('returns the day decks in the phone shape; exact or W/ match gives 304; edits change the tag', async () => {
    await putDecks([{ cardId: CARD_G, items: items(), model: 'm', generatedAt: '2026-10-21T20:00:00Z' }, { cardId: CARD_C, items: items(11) }, { cardId: CARD_ALL, items: items() }]);
    const first = await getDecks();
    expect(first.status).toBe(200);
    expect(first.body.decks.map(d => [d.cardId, d.section, d.items.length])).toEqual([[CARD_C, 'C', 11], [CARD_G, 'G', 10]]);
    expect(Object.keys(first.body.decks[1]).sort()).toEqual(['cardId', 'course', 'generatedAt', 'items', 'model', 'section', 'updatedAt']);
    expect(first.body.decks[1]).toMatchObject({ course: 'algebra2', model: 'm', generatedAt: '2026-10-21 20:00:00+00' });
    expect(first.etag).toMatch(/^"2-[0-9a-f]{16}"$/);
    for (const tag of [first.etag, 'W/' + first.etag, ' ' + first.etag + ' ']) {
      expect((await call('GET', '/class-log/decks?date=2026-10-22', { headers: { ...auth, 'If-None-Match': tag } }))).toMatchObject({ status: 304, text: '' });
    }
    expect((await call('GET', '/class-log/decks?date=2026-10-22', { headers: { ...auth, 'If-None-Match': '*' } })).status).toBe(200);
    // Unchanged push keeps the tag; a real change and a hand edit each change it.
    await putDecks([{ cardId: CARD_G, items: items(), model: 'm' }]);
    expect((await getDecks()).etag).toBe(first.etag);
    const changed = items(); changed[9].front = 'New';
    await putDecks([{ cardId: CARD_G, items: changed, model: 'm' }]);
    const second = await getDecks();
    expect(second.etag).not.toBe(first.etag);
    await pg.exec(`update a2.card_decks set model = 'hand' where card_id = '${CARD_C}'`);
    expect((await getDecks()).etag).not.toBe(second.etag);
  });
  it('a deleted deck changes the tag; 400 on a bad date; 503 without details on a storage failure', async () => {
    await putDecks([{ cardId: CARD_C, items: items() }]);
    const before = (await getDecks()).etag;
    expect(await call('DELETE', '/teacher/decks?cardId=' + CARD_C.toUpperCase())).toMatchObject({ status: 200, body: { ok: true, deleted: 1 } });
    expect(await call('DELETE', '/teacher/decks?cardId=' + CARD_C)).toMatchObject({ status: 200, body: { ok: true, deleted: 0 } });
    expect((await call('DELETE', '/teacher/decks?cardId=nope')).status).toBe(400);
    expect((await getDecks()).etag).not.toBe(before);
    expect((await getDecks('2026-13-01')).status).toBe(400);
    const app = express();
    mountCardDecks(app, { store: { listByDate: async () => { throw new Error('boom detail'); } }, env: { CLASS_LOG_TOKEN: TOKEN } });
    const other = await listen(app);
    try {
      const response = await fetch(other.url + '/class-log/decks?date=2026-10-22', { headers: auth });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Card deck service unavailable' }));
    } finally { await close(other.listener); }
  });
  it('decksEtag is order-independent and content-sensitive', () => {
    const a = { card_id: 'a', items: [1], content_hash: 'x' }, b = { card_id: 'b', items: [2], content_hash: 'y' };
    expect(decksEtag('2026-10-22', [a, b])).toBe(decksEtag('2026-10-22', [b, a]));
    expect(decksEtag('2026-10-22', [a, b])).not.toBe(decksEtag('2026-10-22', [a, { ...b, content_hash: 'z' }]));
    expect(decksEtag('2026-10-22', [a])).not.toBe(decksEtag('2026-10-23', [a]));
  });
});

describe('POST /class-log/deck-results', () => {
  it('inserts, ignores duplicates on the unique key, and takes the date from the card', async () => {
    const first = await postResults(results([grade(1, 1, 'again'), grade(1, 2, 'got_it'), grade(1, 1, 'got_it', '2026-10-22T13:01:00Z')], { date: '2026-10-21' }));
    expect(first).toMatchObject({ status: 200, body: { ok: true, inserted: 3 }, cache: 'no-store' });
    const second = await postResults(results([grade(1, 1, 'again', '2026-10-22T09:00:00-04:00'), grade(2, 1, 'got_it')]));
    expect(second.body).toEqual({ ok: true, inserted: 1 });
    const { rows } = await pg.query('select card_id, device, section, date, session, item_id, grade, at, latency_ms, received_at from a2.deck_results order by id');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ card_id: CARD_C, device: 's24', section: 'C', date: '2026-10-22', session: 1, item_id: 'item-0001', grade: 'again', at: '2026-10-22 13:00:00+00', latency_ms: 1200 });
  });
  it('404 for an unknown card, 400 on shape', async () => {
    expect(await postResults(results([grade(1, 1, 'again')], { cardId: MISSING }))).toMatchObject({ status: 404, body: { error: 'Card not found' } });
    expect(await postResults(results([{ ...grade(1, 1, 'again'), grade: 'meh' }]))).toMatchObject({ status: 400, body: { error: 'results[0].grade must be again or got_it' } });
    expect((await pg.query('select count(*)::int as n from a2.deck_results')).rows[0].n).toBe(0);
  });
  it('accepts 200 results in one POST; parser errors are short JSON after auth', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...grade(1, (i % 14) + 1, i % 3 ? 'got_it' : 'again', new Date(Date.UTC(2026, 9, 22, 13, 0, i)).toISOString()), latencyMs: 3600000 }));
    expect((await postResults(results(many, { device: 'd'.repeat(32), section: 'é'.repeat(16) }))).body).toEqual({ ok: true, inserted: 200 });
    expect(await call('POST', '/class-log/deck-results', { text: '{not json', headers: auth })).toMatchObject({ status: 400, body: { ok: false, error: 'bad_json' } });
    const big = JSON.stringify({ ...results([]), pad: 'x'.repeat(130 * 1024) });
    expect(await call('POST', '/class-log/deck-results', { text: big, headers: auth })).toMatchObject({ status: 413, body: { ok: false, error: 'too_large' } });
  });
  it('503 without details on a storage failure', async () => {
    const app = express();
    mountCardDecks(app, { store: { getCard: async () => ({ id: CARD_C, date: '2026-10-22' }), insertResults: async () => { throw new Error('detail'); } }, env: { CLASS_LOG_TOKEN: TOKEN } });
    const other = await listen(app);
    try {
      const response = await fetch(other.url + '/class-log/deck-results', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(results([grade(1, 1, 'again')])) });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Card deck service unavailable' }));
    } finally { await close(other.listener); }
  });
});

describe('GET /teacher/decks', () => {
  it('returns the decks with result counts and the top missed items (paged results)', async () => {
    const list = items(); list[4] = { ...list[4], type: 'trap', front: '2f(x) is horizontal' };
    await putDecks([{ cardId: CARD_C, items: list }, { cardId: CARD_G, items: items() }]);
    await postResults(results([grade(1, 5, 'again'), grade(1, 5, 'again', '2026-10-22T13:02:00Z'), grade(1, 2, 'got_it'), grade(2, 3, 'again'), grade(2, 5, 'got_it')]));
    await postResults(results([grade(1, 5, 'again')], { device: 'tablet' }));
    const response = await call('GET', '/teacher/decks?date=2026-10-22');
    expect(response).toMatchObject({ status: 200, cache: 'no-store' });
    const [c, g] = response.body.decks;
    expect(c).toMatchObject({ cardId: CARD_C, section: 'C', results: { sessions: 3, asked: 6, again: 4 } });
    expect(c.missed).toEqual([{ itemId: 'item-0005', type: 'trap', front: '2f(x) is horizontal', again: 3 }, { itemId: 'item-0003', type: 'anchor', front: 'Front 3', again: 1 }]);
    expect(g).toMatchObject({ cardId: CARD_G, results: { sessions: 0, asked: 0, again: 0 }, missed: [] });
    expect(c.items).toHaveLength(10);
  });
  it('400 on a bad date; 503 without details on a storage failure', async () => {
    expect((await call('GET', '/teacher/decks?date=nope')).status).toBe(400);
    const app = express();
    mountTeacherDecks(app, { store: { listByDate: async () => [], listResults: async () => { throw new Error('detail'); } }, db: {} });
    const other = await listen(app);
    try {
      const response = await fetch(other.url + '/teacher/decks?date=2026-10-22', { headers: teacher });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Card deck service unavailable' }));
    } finally { await close(other.listener); }
  });
});
