import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mountFlashcardState, FLASHCARD_STATE_MAX_BYTES } from '../flashcard-state.js';
import { signToken } from '../token.js';

let app, rows, store, server, baseUrl;
beforeEach(async () => {
  process.env.ROSTER_TOKEN_SECRET = 'flashcard-state-test-secret';
  rows = new Map();
  let revision = 0;
  store = {
    async get(id) { return rows.get(id) || null; },
    async put(id, state, baseUpdatedAt) {
      const old = rows.get(id);
      if ((old?.updated_at || null) !== baseUpdatedAt) return null;
      const row = { state: structuredClone(state), updated_at: new Date(++revision * 1000).toISOString() };
      rows.set(id, row);
      return row;
    },
  };
  app = express();
  app.use(express.json({ limit: '8mb' }));
  mountFlashcardState(app, {
    db: { async findByStudentId(id) { return { data: ['alpha', 'beta'].includes(id) ? { student_id: id } : null }; } },
    store,
  });
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
afterEach(() => new Promise(resolve => server.close(resolve)));

// The server suite uses real loopback HTTP and native fetch, with no test client dependency.
function request() {
  return Object.fromEntries(['get', 'put'].map(method => [method, path => {
    const options = { method: method.toUpperCase(), headers: {} };
    const chain = {
      set(key, value) { options.headers[key] = value; return chain; },
      send(body) { options.body = JSON.stringify(body); options.headers['Content-Type'] = 'application/json'; return chain; },
      then(resolve, reject) {
        return fetch(baseUrl + path, options).then(async response => ({
          status: response.status, body: await response.json(), headers: Object.fromEntries(response.headers),
        })).then(resolve, reject);
      },
    };
    return chain;
  }]));
}

const get = id => request(app).get('/flashcards/state').set('Authorization', 'Bearer ' + signToken(id));
const put = (id, state, baseUpdatedAt = null) => request(app).put('/flashcards/state')
  .set('Authorization', 'Bearer ' + signToken(id)).send({ state, baseUpdatedAt });

describe('GET/PUT /flashcards/state', () => {
  it('requires a valid token and an existing roster identity for reads and writes', async () => {
    for (const method of ['get', 'put']) {
      expect((await request(app)[method]('/flashcards/state')).status).toBe(401);
      expect((await request(app)[method]('/flashcards/state').set('Authorization', 'Bearer invalid')).status).toBe(401);
      expect((await request(app)[method]('/flashcards/state').set('Authorization', 'Bearer ' + signToken('deleted'))).status).toBe(401);
    }
    expect(rows.size).toBe(0);
  });

  it('round trips an opaque blob without allowing studentId or query identity overrides', async () => {
    expect((await get('alpha')).body).toEqual({ ok: true, found: false });
    const state = { v: 1, email: 'alpha', e: [], tombstones: { card: 12 }, extra: { future: true } };
    const saved = await put('alpha', state);
    expect(saved.status).toBe(200);
    const loaded = await get('alpha');
    expect(loaded.body).toEqual({ ok: true, found: true, state, updatedAt: saved.body.updatedAt });
    expect(loaded.headers['cache-control']).toBe('no-store');
    expect((await get('beta')).body).toEqual({ ok: true, found: false });
    const attack = await request(app).put('/flashcards/state?studentId=alpha')
      .set('Authorization', 'Bearer ' + signToken('beta'))
      .send({ studentId: 'alpha', state: { own: true }, baseUpdatedAt: null });
    expect(attack.status).toBe(200);
    expect((await get('alpha')).body.state).toEqual(state);
  });

  it('rejects stale writes, including concurrent first writes, and accepts a merged retry', async () => {
    const first = await put('alpha', { first: 1 });
    expect((await put('alpha', { lost: 1 })).status).toBe(409);
    const writes = await Promise.all([
      put('alpha', { device: 'one' }, first.body.updatedAt),
      put('alpha', { device: 'two' }, first.body.updatedAt),
    ]);
    expect(writes.map(result => result.status).sort()).toEqual([200, 409]);
    const current = await get('alpha');
    expect((await put('alpha', { merged: true }, current.body.updatedAt)).status).toBe(200);
    expect((await get('alpha')).body.state).toEqual({ merged: true });
    const creates = await Promise.all([put('beta', { a: 1 }), put('beta', { b: 1 })]);
    expect(creates.map(result => result.status).sort()).toEqual([200, 409]);
  });

  it('validates JSON objects and enforces the 256 KiB cap in UTF-8 bytes', async () => {
    for (const state of [null, [], 'text', 3]) expect((await put('alpha', state)).status).toBe(400);
    const fitting = { text: 'x'.repeat(FLASHCARD_STATE_MAX_BYTES - 11) };
    expect(Buffer.byteLength(JSON.stringify(fitting))).toBe(FLASHCARD_STATE_MAX_BYTES);
    expect((await put('alpha', fitting)).status).toBe(200);
    expect((await put('beta', { text: fitting.text + 'x' })).status).toBe(413);
    expect((await put('beta', { text: 'é'.repeat(FLASHCARD_STATE_MAX_BYTES / 2) })).status).toBe(413);
    expect((await put('beta', {}, 'bad timestamp')).status).toBe(400);
  });

  it('returns 503 on storage failure without claiming a successful write', async () => {
    store.get = async () => { throw new Error('missing migration'); };
    store.put = async () => { throw new Error('unavailable'); };
    expect((await get('alpha')).status).toBe(503);
    expect((await put('alpha', {})).status).toBe(503);
    expect(rows.size).toBe(0);
  });
});
