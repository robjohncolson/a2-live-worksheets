// lib/flashcard-sync.test.js — pure merge/wire tests + a fake-fetch client harness.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import FlashcardSync from './flashcard-sync.js';
import FlashcardSrs from './flashcard-srs.js';

const EMAIL = 'kid';

function entry(over) {
  return Object.assign({
    roundId: 'desk-1-aaaa', seq: 0, csv: 'u4_l1_l2_blooket.csv', qnum: 3, correct: true,
    ts: 1_700_000_000_000, mode: 'quick', missIndex: 0, wasTimeout: false, latencyMs: 1200,
    topic: '4.1-2', surface: 'desk', nChoices: 4, chosenIdx: 1, stemHash: 'abcd1234',
    displayedPerm: [1, 0, 3, 2]
  }, over || {});
}

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map)
  };
}

// Minimal in-memory model of roster-server's /flashcards/state routes.
function fakeServer(opts) {
  const o = opts || {};
  let row = o.row || null;           // { state, updatedAt }
  let stampCounter = 100;
  const calls = [];
  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers && init.headers.Authorization, keepalive: !!init.keepalive });
    const respond = (status, json) => ({ status, json: async () => json });
    if (o.forceStatus) return respond(o.forceStatus, o.forceJson || {});
    if (!/\/flashcards\/state$/.test(url)) return respond(404, {});
    if (init.method === 'GET') {
      if (init.headers.Authorization !== 'Bearer tok') return respond(401, { ok: false, error: 'forbidden' });
      if (!row) return respond(200, { ok: true, found: false });
      return respond(200, { ok: true, found: true, state: row.state, updatedAt: row.updatedAt });
    }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      if (body.token !== 'tok') return respond(401, { ok: false, error: 'invalid token' });
      if (JSON.stringify(body.state).length > 262144) return respond(413, { ok: false, error: 'state too large' });
      if (row && row.updatedAt !== body.baseUpdatedAt) return respond(409, { ok: false, error: 'stale', updatedAt: row.updatedAt });
      stampCounter += 1;
      row = { state: body.state, updatedAt: 'stamp-' + stampCounter };
      return respond(200, { ok: true, updatedAt: row.updatedAt });
    }
    return respond(405, {});
  });
  return { fetch, calls, get row() { return row; }, set row(v) { row = v; } };
}

function client(server, storage, extra) {
  return FlashcardSync.createSyncClient(Object.assign({
    fetch: server.fetch,
    baseUrl: 'https://roster.example',
    token: () => 'tok',
    email: () => EMAIL,
    storage,
    now: () => 1_700_000_100_000,
    setTimeout: (fn) => { fn(); return 1; },   // immediate for tests unless overridden
    clearTimeout: () => {}
  }, extra || {}));
}

describe('FlashcardSync — pure merge', () => {
  it('unions by roundId#seq, is idempotent and order-independent, sorted by ts', () => {
    const a = [entry({ roundId: 'r1', seq: 0, ts: 10 }), entry({ roundId: 'r1', seq: 1, ts: 11 })];
    const b = [entry({ roundId: 'r1', seq: 1, ts: 11 }), entry({ roundId: 'r2', seq: 0, ts: 5 })];
    const ab = FlashcardSync.mergeLogs(a, b);
    const ba = FlashcardSync.mergeLogs(b, a);
    expect(ab.map(FlashcardSync.entryKey)).toEqual(['r2#0', 'r1#0', 'r1#1']);
    expect(ba.map(FlashcardSync.entryKey)).toEqual(ab.map(FlashcardSync.entryKey));
    expect(FlashcardSync.mergeLogs(ab, ab)).toHaveLength(3);
  });

  it('uses the same identity as FlashcardSrs.entryKey (incl. legacy entries without roundId)', () => {
    const legacy = { ts: 5, csv: 'u1_l1_blooket.csv', qnum: 2, correct: true, mode: 'full' };
    expect(FlashcardSync.entryKey(legacy)).toBe(FlashcardSrs.entryKey(legacy));
    expect(FlashcardSync.entryKey(entry())).toBe(FlashcardSrs.entryKey(entry()));
  });

  it('local copy wins on a key collision (keeps analysis-only fields)', () => {
    const local = [entry({ roundId: 'r1', seq: 0, displayedPerm: [3, 2, 1, 0] })];
    const remote = [entry({ roundId: 'r1', seq: 0, displayedPerm: undefined })];
    const merged = FlashcardSync.mergeLogs(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].displayedPerm).toEqual([3, 2, 1, 0]);
  });

  it('caps the merged log at the newest LOG_CAP entries', () => {
    const many = [];
    for (let i = 0; i < FlashcardSync.LOG_CAP + 50; i += 1) many.push(entry({ roundId: 'r' + i, ts: i }));
    const merged = FlashcardSync.mergeLogs(many, []);
    expect(merged).toHaveLength(FlashcardSync.LOG_CAP);
    expect(merged[0].roundId).toBe('r50');
  });

  it('hasNewEntries detects one-sided keys', () => {
    const a = [entry({ roundId: 'r1' })];
    const b = [entry({ roundId: 'r1' }), entry({ roundId: 'r2' })];
    expect(FlashcardSync.hasNewEntries(b, a)).toBe(true);
    expect(FlashcardSync.hasNewEntries(a, b)).toBe(false);
  });
});

describe('FlashcardSync — wire format', () => {
  it('round-trips every field foldLog / foldMastery read, and drops displayedPerm', () => {
    const e = entry({ review: 'good', wasTimeout: false, missIndex: 1 });
    const wire = FlashcardSync.toWire([e], { email: EMAIL, tombstones: { 'x#1': { at: 1 } }, now: 7 });
    expect(wire.v).toBe(1);
    expect(wire.csvs).toEqual(['u4_l1_l2_blooket.csv']);
    const back = FlashcardSync.fromWire(wire);
    expect(back.email).toBe(EMAIL);
    expect(back.tombstones).toEqual({ 'x#1': { at: 1 } });
    const r = back.entries[0];
    for (const k of ['roundId', 'seq', 'csv', 'qnum', 'correct', 'ts', 'mode', 'missIndex', 'wasTimeout', 'latencyMs', 'review', 'topic', 'surface', 'nChoices', 'stemHash', 'chosenIdx']) {
      expect(r[k], k).toEqual(e[k]);
    }
    expect(r).not.toHaveProperty('displayedPerm');
  });

  it('folded SRS state is identical from the original and the round-tripped log', () => {
    const log = [];
    for (let i = 0; i < 40; i += 1) {
      log.push(entry({ roundId: 'r' + (i % 5), seq: i, qnum: (i % 7) + 1, correct: i % 3 !== 0, ts: 1_700_000_000_000 + i * 60_000, missIndex: i % 4 === 0 ? 1 : 0, mode: i % 2 ? 'full' : 'quick' }));
    }
    const back = FlashcardSync.fromWire(FlashcardSync.toWire(log, { email: EMAIL }));
    const a = FlashcardSrs.foldLog(log, {});
    const b = FlashcardSrs.foldLog(back.entries, {});
    expect(b.cards).toEqual(a.cards);
    expect(b.seen).toEqual(a.seen);
  });

  it('a full 2000-entry log fits comfortably under the server cap', () => {
    const log = [];
    for (let i = 0; i < FlashcardSync.LOG_CAP; i += 1) log.push(entry({ roundId: 'desk-1787000000000-' + (i % 300).toString(36), seq: i % 60, ts: 1_700_000_000_000 + i, csv: 'u' + (1 + i % 9) + '_l' + (1 + i % 12) + '_blooket.csv' }));
    const wire = FlashcardSync.toWire(log, { email: EMAIL });
    expect(wire.e).toHaveLength(FlashcardSync.LOG_CAP);
    expect(JSON.stringify(wire).length).toBeLessThan(FlashcardSync.MAX_WIRE_CHARS);
  });

  it('drops the OLDEST entries when a pathological log would exceed the cap', () => {
    const log = [];
    for (let i = 0; i < 3000; i += 1) log.push(entry({ roundId: 'a-very-long-round-identifier-string-'.repeat(3) + i, seq: 0, ts: i, csv: 'deck-' + i + '.csv' }));
    const wire = FlashcardSync.toWire(log, { email: EMAIL });
    expect(JSON.stringify(wire).length).toBeLessThanOrEqual(FlashcardSync.MAX_WIRE_CHARS);
    expect(wire.e.length).toBeLessThan(3000);
    const back = FlashcardSync.fromWire(wire);
    expect(Math.min(...back.entries.map((e) => e.ts))).toBeGreaterThan(0);   // oldest gone
    expect(Math.max(...back.entries.map((e) => e.ts))).toBe(2999);          // newest kept
  });

  it('fromWire rejects unknown versions / shapes', () => {
    expect(FlashcardSync.fromWire(null)).toBeNull();
    expect(FlashcardSync.fromWire({ v: 2, e: [] })).toBeNull();
    expect(FlashcardSync.fromWire({ v: 1 })).toBeNull();
  });
});

describe('FlashcardSync — client', () => {
  it('is not ready without token/email/baseUrl and never throws', async () => {
    const server = fakeServer();
    const c = client(server, memoryStorage(), { token: () => null });
    expect(c.ready()).toBe(false);
    await expect(c.pull()).resolves.toMatchObject({ ok: false });
    await expect(c.push()).resolves.toMatchObject({ ok: false });
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it('first pull with no server row pushes the local log (initial upload)', async () => {
    const server = fakeServer();
    const local = [entry({ roundId: 'r1' })];
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify(local) });
    const c = client(server, storage);
    const r = await c.pull();
    expect(r).toMatchObject({ ok: true, pushed: true });
    expect(server.row.state.e).toHaveLength(1);
    expect(server.calls.map((x) => x.method)).toEqual(['GET', 'PUT']);
    expect(server.calls[0].auth).toBe('Bearer tok');
    expect(server.calls[1].body.token).toBe('tok');
    expect(c.baseUpdatedAt()).toBe('stamp-101');
  });

  it('pull merges remote entries INTO local, calls onLocalChanged, and pushes back local-only entries', async () => {
    const remoteLog = [entry({ roundId: 'phone-1', surface: 'mobile', ts: 1_700_000_000_500 })];
    const server = fakeServer({ row: { state: FlashcardSync.toWire(remoteLog, { email: EMAIL }), updatedAt: 'stamp-1' } });
    const local = [entry({ roundId: 'desk-1', ts: 1_700_000_000_000 })];
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify(local) });
    const changed = vi.fn();
    const c = client(server, storage, { onLocalChanged: changed });
    const r = await c.pull();
    expect(r).toMatchObject({ ok: true, changed: true, pushed: true });
    const merged = JSON.parse(storage.getItem('a2_srs_log_' + EMAIL));
    expect(merged.map(FlashcardSync.entryKey)).toEqual(['desk-1#0', 'phone-1#0']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(server.row.state.e).toHaveLength(2);
    expect(server.calls[1].body.baseUpdatedAt).toBe('stamp-1');
  });

  it('pull with nothing new on either side neither writes local nor pushes', async () => {
    const log = [entry({ roundId: 'r1' })];
    const server = fakeServer({ row: { state: FlashcardSync.toWire(log, { email: EMAIL }), updatedAt: 's' } });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify(log) });
    const changed = vi.fn();
    const c = client(server, storage, { onLocalChanged: changed });
    const r = await c.pull();
    expect(r).toMatchObject({ ok: true, changed: false, pushed: false });
    expect(changed).not.toHaveBeenCalled();
    expect(server.calls.map((x) => x.method)).toEqual(['GET']);
  });

  it('refuses to merge a row written under a different email', async () => {
    const server = fakeServer({ row: { state: FlashcardSync.toWire([entry({ roundId: 'x' })], { email: 'someone-else' }), updatedAt: 's' } });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: '[]' });
    const c = client(server, storage);
    const r = await c.pull();
    expect(r).toMatchObject({ ok: false, reason: 'email-mismatch' });
    expect(JSON.parse(storage.getItem('a2_srs_log_' + EMAIL))).toEqual([]);
    expect(server.calls.map((x) => x.method)).toEqual(['GET']);
  });

  it('push on 409 stale re-pulls, merges and retries once', async () => {
    const server = fakeServer({ row: { state: FlashcardSync.toWire([entry({ roundId: 'other-device' })], { email: EMAIL }), updatedAt: 'stamp-9' } });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry({ roundId: 'mine' })]) });
    const c = client(server, storage);
    // Never pulled → baseUpdatedAt null → server says stale.
    const r = await c.push();
    expect(r).toMatchObject({ ok: true, retried: true });
    expect(server.row.state.e.map((t) => t[0]).sort()).toEqual(['mine', 'other-device']);
    expect(server.calls.map((x) => x.method)).toEqual(['PUT', 'GET', 'PUT']);
  });

  it('fails closed on invalid-state 400 and stays disabled for the session', async () => {
    const server = fakeServer({ forceStatus: 400, forceJson: { ok: false, error: 'invalid state' } });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const c = client(server, storage);
    await c.push();
    expect(c.isDisabled()).toBe(true);
    expect(c.disabledReason()).toBe('invalid-state');
    await c.pull();
    expect(server.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem('a2_srs_log_' + EMAIL))).toHaveLength(1);   // local untouched
  });

  it('network errors leave local untouched and do not disable', async () => {
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const c = client({ fetch: vi.fn(() => Promise.reject(new Error('offline'))) }, storage);
    await expect(c.pull()).resolves.toMatchObject({ ok: false, reason: 'network' });
    expect(c.isDisabled()).toBe(false);
  });

  it('schedulePush debounces and flush fires the pending push immediately', async () => {
    const server = fakeServer();
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const timers = [];
    const c = client(server, storage, {
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      clearTimeout: (id) => { timers[id - 1] = null; }
    });
    c.schedulePush(); c.schedulePush(); c.schedulePush();
    expect(timers.filter(Boolean)).toHaveLength(1);
    await c.flush();
    expect(server.calls.map((x) => x.method)).toEqual(['PUT']);
    expect(server.calls[0].body.state.e).toHaveLength(1);
  });

  it('pull is throttled unless forced', async () => {
    const server = fakeServer();
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: '[]' });
    const c = client(server, storage);
    await c.pull();
    const second = await c.pull();
    expect(second).toMatchObject({ throttled: true });
    await c.pull({ force: true });
    expect(server.calls.filter((x) => x.method === 'GET')).toHaveLength(2);
  });
});

describe('FlashcardSync — review-hardening (identity, auth, cap ping-pong, keepalive)', () => {
  it('discards a pull response that lands after a sign-in switch and never touches the new student\'s log', async () => {
    let currentEmail = 'alice';
    let release;
    const gate = new Promise((res) => { release = res; });
    const remoteForAlice = FlashcardSync.toWire([entry({ roundId: 'alice-phone' })], { email: 'alice' });
    const fetch = vi.fn(async (url, init) => {
      if (init.method === 'GET') { await gate; return { status: 200, json: async () => ({ ok: true, found: true, state: remoteForAlice, updatedAt: 's1' }) }; }
      return { status: 200, json: async () => ({ ok: true, updatedAt: 's2' }) };
    });
    const storage = memoryStorage({ a2_srs_log_alice: '[]', a2_srs_log_bob: JSON.stringify([entry({ roundId: 'bob-1' })]) });
    const c = client({ fetch }, storage, { email: () => currentEmail });
    const p = c.pull({ force: true });
    currentEmail = 'bob';                                  // switch while Alice's GET is in flight
    release();
    const r = await p;
    expect(r).toMatchObject({ ok: false, reason: 'identity-changed' });
    expect(JSON.parse(storage.getItem('a2_srs_log_bob')).map((e) => e.roundId)).toEqual(['bob-1']);
    expect(JSON.parse(storage.getItem('a2_srs_log_alice'))).toEqual([]);
    expect(fetch.mock.calls.filter((c2) => c2[1].method === 'PUT')).toHaveLength(0);
  });

  it('a sign-in switch resets per-student state (stamp, disabled flag, pending push)', async () => {
    let currentEmail = 'alice';
    const server = fakeServer({ forceStatus: 400, forceJson: { ok: false, error: 'invalid state' } });
    const storage = memoryStorage({ a2_srs_log_alice: JSON.stringify([entry()]), a2_srs_log_bob: JSON.stringify([entry({ roundId: 'b' })]) });
    const c = client(server, storage, { email: () => currentEmail });
    await c.push();
    expect(c.isDisabled()).toBe(true);
    currentEmail = 'bob';
    expect(c.ready()).toBe(true);                          // Bob is not disabled by Alice's failure
    expect(c.baseUpdatedAt()).toBeNull();
  });

  it('a 401 disables only for the rejected token; a fresh token re-enables', async () => {
    let tok = 'expired';
    const fetch = vi.fn(async (url, init) => {
      const auth = init.method === 'GET' ? init.headers.Authorization : 'Bearer ' + JSON.parse(init.body).token;
      if (auth !== 'Bearer fresh') return { status: 401, json: async () => ({ ok: false, error: 'forbidden' }) };
      return { status: 200, json: async () => (init.method === 'GET' ? { ok: true, found: false } : { ok: true, updatedAt: 's' }) };
    });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const c = client({ fetch }, storage, { token: () => tok });
    await c.pull({ force: true });
    expect(c.isDisabled()).toBe(true);
    expect(c.disabledReason()).toBe('auth');
    tok = 'fresh';
    const r = await c.pull({ force: true });
    expect(r.ok).toBe(true);
    expect(c.isDisabled()).toBe(false);
  });

  it('never overwrites a remote row it cannot read (fails closed for the session)', async () => {
    const server = fakeServer({ row: { state: { srs: { legacy: true }, xp: 3 }, updatedAt: 'legacy' } });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const c = client(server, storage);
    const r = await c.pull({ force: true });
    expect(r).toMatchObject({ ok: false, reason: 'unreadable-remote' });
    expect(c.isDisabled()).toBe(true);
    await c.push();
    expect(server.calls.map((x) => x.method)).toEqual(['GET']);
    expect(server.row.state).toEqual({ srs: { legacy: true }, xp: 3 });
  });

  it('cap-trimmed entries do not cause a redundant PUT on the next pull', async () => {
    // Local log too big for the wire → first pull uploads a trimmed set.
    const big = [];
    for (let i = 0; i < 3000; i += 1) big.push(entry({ roundId: 'a-very-long-round-identifier-string-'.repeat(3) + i, seq: 0, ts: i, csv: 'deck-' + i + '.csv' }));
    const server = fakeServer();
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify(big) });
    const c = client(server, storage);
    const first = await c.pull({ force: true });
    expect(first.pushed).toBe(true);
    const puts = () => server.calls.filter((x) => x.method === 'PUT').length;
    expect(puts()).toBe(1);
    expect(server.row.state.e.length).toBeLessThan(3000);
    const second = await c.pull({ force: true });
    expect(second).toMatchObject({ ok: true, pushed: false });
    expect(puts()).toBe(1);
  });

  it('uses keepalive only for the page-hide flush, never for a normal push', async () => {
    const server = fakeServer();
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry()]) });
    const timers = [];
    const c = client(server, storage, { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; } });
    await c.push();
    expect(server.calls[0]).toMatchObject({ method: 'PUT', keepalive: false });
    c.schedulePush();
    await c.flush();
    expect(server.calls[1]).toMatchObject({ method: 'PUT', keepalive: true });
  });
});

describe('FlashcardSync — pull-time 409 reconciliation', () => {
  it('re-GETs, merges and PUTs once more when another device wrote between our GET and our PUT', async () => {
    // Server starts with device-B's entry; between our GET and PUT, B writes again.
    let row = { state: FlashcardSync.toWire([entry({ roundId: 'b-1' })], { email: EMAIL }), updatedAt: 's1' };
    let stamp = 1;
    let putsSeen = 0;
    const calls = [];
    const fetch = vi.fn(async (url, init) => {
      calls.push(init.method);
      const respond = (status, json) => ({ status, json: async () => json });
      if (init.method === 'GET') return respond(200, { ok: true, found: true, state: row.state, updatedAt: row.updatedAt });
      const body = JSON.parse(init.body);
      putsSeen += 1;
      if (putsSeen === 1) {
        // Simulate device B sneaking a write in: bump the row, reject ours as stale.
        stamp += 1;
        row = { state: FlashcardSync.toWire([entry({ roundId: 'b-1' }), entry({ roundId: 'b-2', ts: 1_700_000_000_500 })], { email: EMAIL }), updatedAt: 's' + stamp };
        return respond(409, { ok: false, error: 'stale', updatedAt: row.updatedAt });
      }
      if (row.updatedAt !== body.baseUpdatedAt) return respond(409, { ok: false, error: 'stale', updatedAt: row.updatedAt });
      stamp += 1;
      row = { state: body.state, updatedAt: 's' + stamp };
      return respond(200, { ok: true, updatedAt: row.updatedAt });
    });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry({ roundId: 'a-1', ts: 1_700_000_000_100 })]) });
    const c = client({ fetch }, storage);
    const r = await c.pull({ force: true });
    expect(r).toMatchObject({ ok: true, pushed: true });
    // GET, PUT(409), GET, PUT(200)
    expect(calls).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    const remoteKeys = FlashcardSync.fromWire(row.state).entries.map(FlashcardSync.entryKey).sort();
    expect(remoteKeys).toEqual(['a-1#0', 'b-1#0', 'b-2#0']);
    const localKeys = JSON.parse(storage.getItem('a2_srs_log_' + EMAIL)).map(FlashcardSync.entryKey).sort();
    expect(localKeys).toEqual(['a-1#0', 'b-1#0', 'b-2#0']);
  });

  it('gives up after the bounded retry (never loops) when the row keeps changing', async () => {
    let n = 0;
    const fetch = vi.fn(async (url, init) => {
      const respond = (status, json) => ({ status, json: async () => json });
      if (init.method === 'GET') return respond(200, { ok: true, found: true, state: FlashcardSync.toWire([entry({ roundId: 'x' + (n += 1) })], { email: EMAIL }), updatedAt: 'g' + n });
      return respond(409, { ok: false, error: 'stale', updatedAt: 'never' });
    });
    const storage = memoryStorage({ ['a2_srs_log_' + EMAIL]: JSON.stringify([entry({ roundId: 'mine' })]) });
    const c = client({ fetch }, storage);
    const r = await c.pull({ force: true });
    expect(r.ok).toBe(true);            // local merge still happened
    expect(r.pushed).toBe(false);
    expect(fetch.mock.calls.length).toBe(4);   // GET, PUT, GET, PUT — then stop
    expect(c.isDisabled()).toBe(false);
  });
});
