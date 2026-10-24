// Node mastery (KNOWLEDGE_TREE_SPEC.md WP-1 1.3): deck-rules node/lesson, migration
// 0047 on PGlite, PUT /class-log/mastery, GET /teacher/mastery and `ready` on
// GET /teacher/decks, plus the createApp middleware order for the new routes.
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createCardDeckStore, deckReady, mountTeacherDecks } from '../card-decks.js';
import { createNodeMasteryStore, masterySummary, mountClassLogMastery, mountTeacherMastery, validateMasteryPut, isKnown } from '../node-mastery.js';
import { deckContentHash, validateItems } from '../deck-rules.js';
import { createApp } from '../server.js';

// The Supabase calls node-mastery.js and card-decks.js make, over PGlite: select with
// eq/in/order/range, and rpc calling the real a2 functions the way PostgREST does
// (jsonb arguments travel as JSON text).
function fakeSupabase(pg) {
  return {
    async rpc(name, args) {
      try {
        if (name === 'put_card_decks') {
          const { rows } = await pg.query('select a2.put_card_decks($1::jsonb) as result', [JSON.stringify(args.p_decks)]);
          return { data: rows[0].result, error: null };
        }
        const { rows } = await pg.query(`select a2.${name}($1, $2, $3::jsonb) as result`, [args.p_device, args.p_course, JSON.stringify(args.p_nodes)]);
        return { data: rows[0].result, error: null };
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    },
    from(table) {
      const where = []; const params = []; const orders = []; let range = null; let columns = '*';
      const builder = {
        select(cols = '*') { columns = cols; return builder; },
        eq(col, value) { params.push(value); where.push(`${col} = $${params.length}`); return builder; },
        in(col, values) { params.push(values); where.push(`${col} = any($${params.length})`); return builder; },
        order(col) { orders.push(col); return builder; },
        range(from, to) { range = [from, to]; return builder; },
        async run() {
          try {
            let sql = `select ${columns} from ${table}` + (where.length ? ` where ${where.join(' and ')}` : '') + (orders.length ? ` order by ${orders.join(', ')}` : '');
            if (range) sql += ` limit ${range[1] - range[0] + 1} offset ${range[0]}`;
            const { rows } = await pg.query(sql, params);
            return { data: rows, error: null };
          } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
        },
        then(resolve, reject) { return builder.run().then(resolve, reject); },
      };
      return builder;
    },
  };
}

const TOKEN = 'class-log-test-token-0123456789abcdef';
const phone = { Authorization: 'Bearer ' + TOKEN };
const teacher = { 'x-teacher-secret': 'mastery-teacher' };
const migration = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const CARD_C = '11111111-1111-4111-8111-111111111111';
const CARD_G = '22222222-2222-4222-8222-222222222222';
const hex = n => n.toString(16).padStart(12, '0');
let pg, listener, base, decks, mastery;

beforeAll(async () => {
  pg = new PGlite({ parsers: { 1082: x => x, 1083: x => x, 1184: x => x } });
  await pg.exec('create role anon; create role authenticated; create role service_role; create schema a2; set search_path to a2; set timezone to UTC');
  for (const name of ['0041_observer_cards.sql', '0042_observer_cards_unique.sql', '0046_card_decks.sql', '0047_node_mastery.sql']) await pg.exec(migration(name));
  await pg.exec(migration('0047_node_mastery.sql')); // idempotent
});
afterAll(async () => { await pg.close(); });

beforeEach(async () => {
  vi.stubEnv('TEACHER_KEY', 'mastery-teacher');
  await pg.exec('truncate a2.observer_cards cascade; truncate a2.node_mastery');
  await pg.exec(`insert into a2.observer_cards (id, date, course, section, title, body) values
    ('${CARD_C}', '2026-10-26', 'algebra2', 'C', 'Steps', '## Preparing'),
    ('${CARD_G}', '2026-10-26', 'algebra2', 'G', 'Steps', '## Preparing')`);
  const client = fakeSupabase(pg);
  decks = createCardDeckStore(client);
  mastery = createNodeMasteryStore(client, { page: 2 });
  const app = express();
  mountClassLogMastery(app, { store: mastery, env: { CLASS_LOG_TOKEN: TOKEN } });
  app.use(express.json());
  mountTeacherDecks(app, { store: decks, mastery, db: { getRoleByStudentId: async () => 'student' } });
  mountTeacherMastery(app, { store: mastery, db: { getRoleByStudentId: async () => 'student' } });
  listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  base = 'http://127.0.0.1:' + listener.address().port;
});
afterEach(async () => {
  listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve));
  vi.unstubAllEnvs();
});

async function call(method, path, { body, text, headers = teacher } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: text ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const out = await response.text();
  return { status: response.status, text: out, body: out ? JSON.parse(out) : null };
}
const node = (n, over = {}) => ({ nodeId: hex(n), lesson: '1-3', p: 0.2, asked: 0, again: 0, knownAt: null, updatedAt: '2026-10-25T20:30:00.000Z', ...over });
const put = (nodes, over = {}) => call('PUT', '/class-log/mastery', { body: { device: 's24', course: 'algebra2', nodes, ...over }, headers: phone });
const treeItem = (n, over = {}) => ({ id: hex(n), type: 'anchor', front: `Front ${n}`, back: `Back ${n}`, order: n, after: [], minute: null, node: hex(n), lesson: '1-3', ...over });

describe('deck-rules: node and lesson', () => {
  const plain = n => ({ id: `item-${String(n).padStart(4, '0')}`, type: 'anchor', front: `Front ${n}`, back: `Back ${n}`, order: n, after: [], minute: null });
  it('keeps node and lesson when present and leaves nodeless items exactly as before', () => {
    const out = validateItems(Array.from({ length: 8 }, (_, i) => treeItem(i + 1, { lesson: ' 1-3 ' })));
    expect(out[0]).toEqual(treeItem(1));
    const old = validateItems(Array.from({ length: 8 }, (_, i) => plain(i + 1)));
    expect(Object.keys(old[0])).toEqual(['id', 'type', 'front', 'back', 'order', 'after', 'minute']);
  });
  it('refuses a bad node, a long lesson, and a deck with node on only some items', () => {
    const list = Array.from({ length: 8 }, (_, i) => treeItem(i + 1));
    expect(() => validateItems(list.map((it, i) => (i === 0 ? { ...it, node: 'ABCDEF123456' } : it)))).toThrow(/node must be 12 lowercase hex/);
    expect(() => validateItems(list.map((it, i) => (i === 0 ? { ...it, node: hex(1) + '0' } : it)))).toThrow(/node must be 12/);
    expect(() => validateItems(list.map((it, i) => (i === 0 ? { ...it, lesson: 'x'.repeat(17) } : it)))).toThrow(/lesson must be at most 16/);
    expect(() => validateItems(list.map((it, i) => (i === 0 ? { ...it, node: undefined } : it)))).toThrow(/node must be on every item or on none \(7 of 8/);
  });
  it('hash: a nodeless deck keeps its pre-tree hash, even with lesson on its items; node and lesson change it', () => {
    const items = validateItems(Array.from({ length: 8 }, (_, i) => plain(i + 1)));
    const canon = items.map(item => [item.id, item.type, item.front, item.back, item.order, item.after, item.minute]);
    const before = createHash('sha256').update(JSON.stringify([canon, null])).digest('hex').slice(0, 32);
    expect(deckContentHash(items)).toBe(before);
    const withLesson = validateItems(Array.from({ length: 8 }, (_, i) => ({ ...plain(i + 1), lesson: '1-3' })));
    expect(withLesson[0]).not.toHaveProperty('lesson');
    expect(deckContentHash(withLesson)).toBe(before);
    expect(deckContentHash(items.map(item => ({ ...item, lesson: '1-3' })))).toBe(before);
    const tree = validateItems(Array.from({ length: 8 }, (_, i) => treeItem(i + 1)));
    expect(deckContentHash(tree)).toBe(deckContentHash(validateItems(Array.from({ length: 8 }, (_, i) => treeItem(i + 1)))));
    expect(deckContentHash(tree)).not.toBe(deckContentHash(tree.map(item => ({ ...item, lesson: '1-2' }))));
  });
});

describe('validateMasteryPut and the summary', () => {
  it('normalizes, defaults the device, keeps the newest repeat of a node', () => {
    const out = validateMasteryPut({ course: 'algebra2', nodes: [node(1, { p: 0.5 }), node(1, { p: 0.9, updatedAt: '2026-10-25T21:00:00Z' }), node(2)] });
    expect(out.device).toBe('s24');
    expect(out.nodes).toEqual([node(1, { p: 0.9, updatedAt: '2026-10-25T21:00:00.000Z' }), node(2)]);
  });
  it('accepts an empty lesson (a node whose deck item had none)', () => {
    expect(validateMasteryPut({ course: 'algebra2', nodes: [node(1, { lesson: '' })] }).nodes[0].lesson).toBe('');
    expect(validateMasteryPut({ course: 'algebra2', nodes: [node(1, { lesson: '  ' })] }).nodes[0].lesson).toBe('');
  });
  it('refuses bad shapes and limits', () => {
    const bad = (over, pattern) => expect(() => validateMasteryPut({ course: 'algebra2', nodes: [node(1, over)] })).toThrow(pattern);
    bad({ nodeId: 'xyz' }, /nodeId/); bad({ p: 1.2 }, /p must be/); bad({ p: '0.5' }, /p must be/);
    bad({ asked: -1 }, /asked/); bad({ again: 1.5 }, /again/); bad({ lesson: 'x'.repeat(17) }, /lesson/); bad({ lesson: null }, /lesson must be a string/);
    bad({ updatedAt: null }, /updatedAt/); bad({ knownAt: 'yesterday' }, /knownAt/);
    expect(() => validateMasteryPut({ course: 'geometry', nodes: [node(1)] })).toThrow(/course/);
    expect(() => validateMasteryPut({ course: 'algebra2', nodes: [] })).toThrow(/non-empty/);
    expect(() => validateMasteryPut({ course: 'algebra2', nodes: Array.from({ length: 201 }, (_, i) => node(i)) })).toThrow(/at most 200/);
  });
  it('a lesson named __proto__, constructor or toString is just a key', () => {
    const rows = ['__proto__', 'constructor', 'toString', '__proto__'].map((lesson, i) => ({ ...node(i, { lesson, p: 0.95 - i * 0.1 }), device: 's24' }));
    const out = masterySummary(rows);
    expect(Object.keys(out)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(out['__proto__']).toMatchObject({ nodes: 2, known: 1 });
    expect(out.constructor).toMatchObject({ nodes: 1, known: 0 });
    expect(JSON.parse(JSON.stringify(out))['__proto__'].nodes).toBe(2);
  });
  it('known allows for float4 rounding; the summary counts and lists the three weakest', () => {
    expect(isKnown(0.8999999762)).toBe(true);
    expect(isKnown(0.89)).toBe(false);
    const rows = [0.95, 0.2, 0.5, 0.2, 0.9].map((p, i) => ({ ...node(i, { p }), device: 's24' }));
    expect(masterySummary(rows)).toEqual({ '1-3': { nodes: 5, known: 2, weakest: [
      { nodeId: hex(1), device: 's24', p: 0.2 }, { nodeId: hex(3), device: 's24', p: 0.2 }, { nodeId: hex(2), device: 's24', p: 0.5 }] } });
  });
});

describe('PUT /class-log/mastery', () => {
  it('upserts; a newer updatedAt replaces a row, an older or equal one does not', async () => {
    expect((await put([node(1), node(2)])).body).toEqual({ ok: true, written: 2 });
    expect((await put([node(1, { p: 0.785, asked: 1, updatedAt: '2026-10-25T21:00:00Z' }), node(2, { p: 0.6 })])).body).toEqual({ ok: true, written: 1 });
    expect((await put([node(1, { p: 0.1, updatedAt: '2026-10-25T20:59:00Z' })])).body).toEqual({ ok: true, written: 0 });
    const { rows } = await pg.query('select node_id, p, asked from a2.node_mastery order by node_id');
    expect(rows.map(row => [row.node_id, Math.round(row.p * 1000) / 1000, row.asked])).toEqual([[hex(1), 0.785, 1], [hex(2), 0.2, 0]]);
  });
  it('per device and course: the same node on another device is its own row', async () => {
    await put([node(1)]);
    expect((await put([node(1)], { device: 'tablet' })).body.written).toBe(1);
    expect((await put([node(1)], { course: 'apstats' })).body.written).toBe(1);
    expect((await pg.query('select count(*)::int as n from a2.node_mastery')).rows[0].n).toBe(3);
  });
  it('401 without the bearer, 400 on shape, 503 without details on a storage failure', async () => {
    expect((await call('PUT', '/class-log/mastery', { body: { course: 'algebra2', nodes: [node(1)] }, headers: {} })).status).toBe(401);
    expect((await put([node(1, { p: 2 })])).status).toBe(400);
    const app = express();
    mountClassLogMastery(app, { store: { putNodes: async () => { throw new Error('detail'); } }, env: { CLASS_LOG_TOKEN: TOKEN } });
    const other = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
    try {
      const response = await fetch(`http://127.0.0.1:${other.address().port}/class-log/mastery`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...phone }, body: JSON.stringify({ course: 'algebra2', nodes: [node(1)] }) });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Mastery service unavailable' }));
    } finally { other.closeAllConnections(); await new Promise(resolve => other.close(resolve)); }
  });
});

describe('GET /teacher/mastery', () => {
  it('a failure while building the summary is a short 503, not an unhandled rejection', async () => {
    const app = express();
    mountTeacherMastery(app, { store: { list: async () => [{ device: 's24', course: 'algebra2', node_id: hex(1), lesson: '1-3', get p() { throw new Error('detail'); } }] }, db: {} });
    const other = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
    try {
      const response = await fetch(`http://127.0.0.1:${other.address().port}/teacher/mastery`, { headers: teacher });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'Mastery service unavailable' }));
    } finally { other.closeAllConnections(); await new Promise(resolve => other.close(resolve)); }
  });
  it('returns the rows (paged) and the per-lesson summary; lesson narrows it; teacher only', async () => {
    await put([node(1, { p: 0.95, knownAt: '2026-10-25T20:30:00Z' }), node(2, { p: 0.3 }), node(3, { p: 0.5, lesson: '1-2' })]);
    const all = await call('GET', '/teacher/mastery?course=algebra2');
    expect(all.status).toBe(200);
    expect(all.body.rows.map(row => row.nodeId)).toEqual([hex(3), hex(1), hex(2)]);
    expect(all.body.rows[1]).toMatchObject({ device: 's24', course: 'algebra2', lesson: '1-3', asked: 0, again: 0, knownAt: '2026-10-25 20:30:00+00' });
    expect(all.body.lessons['1-3']).toMatchObject({ nodes: 2, known: 1 });
    expect(all.body.lessons['1-3'].weakest[0].nodeId).toBe(hex(2));
    const one = await call('GET', '/teacher/mastery?lesson=1-2');
    expect(one.body).toMatchObject({ course: 'algebra2', lesson: '1-2', lessons: { '1-2': { nodes: 1, known: 0 } } });
    expect((await call('GET', '/teacher/mastery?course=geometry')).status).toBe(400);
    // Phone-pushed lesson keys that are Object.prototype names, and an empty one.
    await put([node(7, { lesson: '__proto__' }), node(8, { lesson: 'constructor' }), node(9, { lesson: '' })]);
    const odd = await call('GET', '/teacher/mastery');
    expect(odd.status).toBe(200);
    expect(odd.body.lessons['__proto__']).toMatchObject({ nodes: 1 });
    expect(odd.body.lessons.constructor).toMatchObject({ nodes: 1 });
    expect(odd.body.lessons['']).toMatchObject({ nodes: 1 });
    expect((await call('GET', '/teacher/mastery?lesson=__proto__')).body.rows.map(row => row.nodeId)).toEqual([hex(7)]);
    expect((await call('GET', '/teacher/mastery', { headers: phone })).status).toBe(403);
  });
});

describe('GET /teacher/decks: ready', () => {
  it('counts the deck items whose node is known on the device (s24 by default, ?device= otherwise)', async () => {
    const treeDeck = Array.from({ length: 8 }, (_, i) => treeItem(i + 1));
    const plainDeck = Array.from({ length: 8 }, (_, i) => ({ ...treeItem(i + 1), node: undefined, lesson: undefined, id: `item-${i + 100}` }));
    expect((await call('PUT', '/teacher/decks', { body: { decks: [{ cardId: CARD_C, items: treeDeck }, { cardId: CARD_G, items: plainDeck }] } })).status).toBe(200);
    expect((await call('GET', '/teacher/decks?date=2026-10-26')).body.decks.map(d => d.ready)).toEqual([0, 0]);
    await put([node(1, { p: 0.979 }), node(2, { p: 0.9 }), node(3, { p: 0.745 })]);
    await put([node(4, { p: 0.99 })], { device: 'tablet' });
    const body = (await call('GET', '/teacher/decks?date=2026-10-26')).body;
    expect(body.device).toBe('s24');
    expect(body.decks.map(d => [d.section, d.ready])).toEqual([['C', 2], ['G', 0]]);
    expect((await call('GET', '/teacher/decks?date=2026-10-26&device=tablet')).body.decks[0].ready).toBe(1);
  });
  it('a mastery failure (before 0047) leaves the decks loading with ready null', async () => {
    await call('PUT', '/teacher/decks', { body: { decks: [{ cardId: CARD_C, items: Array.from({ length: 8 }, (_, i) => treeItem(i + 1)) }] } });
    const app = express();
    mountTeacherDecks(app, { store: decks, mastery: { list: async () => { throw new Error('relation does not exist'); } }, db: {} });
    const other = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
    try {
      const response = await fetch(`http://127.0.0.1:${other.address().port}/teacher/decks?date=2026-10-26`, { headers: teacher });
      expect(response.status).toBe(200);
      expect((await response.json()).decks[0]).toMatchObject({ cardId: CARD_C, ready: null });
    } finally { other.closeAllConnections(); await new Promise(resolve => other.close(resolve)); }
    expect(deckReady([{ node: hex(1) }, {}], [{ node_id: hex(1), p: 0.95 }])).toBe(1);
    expect(deckReady([{ node: hex(1) }], null)).toBeNull();
  });
});

describe('createApp: mastery routes', () => {
  let app;
  async function start() {
    app = createApp({ getRoleByStudentId: async () => 'student' });
    return new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  }
  it('503 unconfigured, 401 without the token, short parser errors with it; the teacher route refuses the bearer', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('CORS_ORIGINS', '');
    vi.stubEnv('CLASS_LOG_TOKEN', '');
    let server = await start();
    const at = path => `http://127.0.0.1:${server.address().port}${path}`;
    const send = (headers, text) => fetch(at('/class-log/mastery'), { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: text });
    try { expect((await send({}, '{bad')).status).toBe(503); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    vi.stubEnv('CLASS_LOG_TOKEN', TOKEN);
    server = await start();
    try {
      const denied = await send({}, '{bad');
      expect([denied.status, await denied.text()]).toEqual([401, '']);
      const junk = await send(phone, '{bad');
      expect([junk.status, await junk.text()]).toEqual([400, JSON.stringify({ ok: false, error: 'bad_json' })]);
      const big = await send(phone, JSON.stringify({ pad: 'x'.repeat(70 * 1024) }));
      expect([big.status, await big.text()]).toEqual([413, JSON.stringify({ ok: false, error: 'too_large' })]);
      expect((await fetch(at('/teacher/mastery'), { headers: phone })).status).toBe(403);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  });
});
