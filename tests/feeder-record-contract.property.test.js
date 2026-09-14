// feeder-record-contract.property.test.js — TYPECHECK_HARDENING_SPEC.md P4 (prop 12).
// fast-check over gradebookClient.record()'s FROZEN contract: the example suites
// (tests/gradebook-client.test.js) pin each case one at a time; this sweeps the full
// cross-product of hostile environments × junk inputs and asserts the contract holds
// EVERYWHERE:
//   - record() ALWAYS resolves (never throws, never rejects), to {ok: boolean, …}
//   - ok:false always carries a reason from the FROZEN whitelist
//     ('no-identity' | 'network' | 'server' | 'auth' | 'bad-args' | 'read-only')
//   - guard ORDER is behavior: bad-args → read-only → IDENTITY → offline-capture.
//     In particular read-only NEVER touches the queue or the network (an
//     impersonating teacher's action must never be captured/attributed), and
//     no-identity/bad-args never issue a fetch AND never enqueue — in OFFLINE
//     MODE too (Codex P4 blocker: an unattributed queued record would later be
//     POSTed under whatever token is current at drain time → cross-student
//     attribution on a shared device).
//   - a successful offline capture is ATTRIBUTED: the enqueued record carries a
//     non-empty studentId.
//   - queued:true is HONEST: it is only ever returned when the offline queue
//     actually captured the write (a failing enqueue must not report a lost write
//     as saved — that would silently drop a grade behind a "Saved offline" toast).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'gradebook-client.js'), 'utf8');
const OFFLINE_SRC = readFileSync(resolve(import.meta.dirname, '..', 'offline-queue.js'), 'utf8');

const REASONS = new Set(['no-identity', 'network', 'server', 'auth', 'bad-args', 'read-only']);

// One synthetic page environment per property run. Everything the client touches
// is generated: identity, service URL, fetch behavior, queue presence/behavior,
// read-only flag. Counters record what the client actually did.
function bootClient(env) {
  const counts = { fetch: 0, enqueue: 0, recs: [] };
  const win = {};
  win.window = win;

  if (env.serviceUrl) win.ROSTER_SERVICE_URL = 'https://svc.test';

  const sid = 'sid' in env ? env.sid : 'sid-1';
  if (env.roster !== 'absent') {
    win.rosterClient = {
      token: env.token === 'throws' ? () => { throw new Error('storage exploded'); } : () => env.token,
      studentId: sid === 'throws' ? () => { throw new Error('session exploded'); } : () => sid,
    };
  }

  // NOTE: gradebook-client calls BARE fetch — it must be a vm GLOBAL, not just
  // a window property (window.fetch alone leaves the online paths dead).
  const doFetch = (...args) => {
    counts.fetch += 1;
    switch (env.fetch) {
      case 'ok': return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, ledgerId: 'L1' }) });
      case 'okfalse': return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: false }) });
      case 'http500': return Promise.resolve({ ok: false, status: 500, json: async () => ({ ok: false }) });
      case 'http401': return Promise.resolve({ ok: false, status: 401, json: async () => ({ ok: false }) });
      case 'badjson': return Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
      default: return Promise.reject(new Error('network down'));
    }
  };
  win.fetch = doFetch;

  if (env.queue !== 'absent') {
    win.OfflineQueue = {
      isOffline: () => env.queue === 'offline',
      enqueue: (rec) => {
        counts.enqueue += 1;
        counts.recs.push(rec);
        if (env.enqueueFails) return Promise.reject(new Error('quota exceeded'));
        return Promise.resolve({ id: 1, rec });
      },
    };
  }

  if (env.readOnly) win.__WS_READ_ONLY__ = true;

  const ctx = createContext({
    window: win, fetch: doFetch, console: { warn: () => {}, log: () => {} },
    JSON, Promise, Map, String, Number, Object, Array, Date, isFinite, encodeURIComponent,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  runInContext(SRC, ctx);
  return { client: win.gradebookClient, counts };
}

const envArb = fc.record({
  roster: fc.constantFrom('present', 'absent'),
  token: fc.constantFrom(null, '', 'tok-1', 'throws'),
  sid: fc.constantFrom(null, '', 'sid-1', 'throws'),
  serviceUrl: fc.boolean(),
  fetch: fc.constantFrom('ok', 'okfalse', 'http500', 'http401', 'badjson', 'reject'),
  queue: fc.constantFrom('absent', 'online', 'offline'),
  enqueueFails: fc.boolean(),
  readOnly: fc.boolean(),
});

const junk = fc.oneof(
  fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant(0),
  fc.string(), fc.integer(), fc.boolean(), fc.constant([]),
);
const optsArb = fc.oneof(
  { weight: 3, arbitrary: fc.record({                       // plausible-to-valid shapes
    source: fc.constantFrom('worksheet', 'curriculum_quiz', '', undefined),
    itemId: fc.constantFrom('WS-U1L1-Q1', 'BL-U4-L1-2-DESK_DONE', '', undefined),
    response: fc.constantFrom('ans', null, undefined, 42),
    score: fc.constantFrom(0, 55, 100, undefined),
    attempt: fc.constantFrom(1, 2, undefined),
    unit: fc.constantFrom('U1', undefined),
    topic: fc.constantFrom('1.1', undefined),
  }, { requiredKeys: [] }) },
  { weight: 1, arbitrary: junk },                           // outright garbage
);

const validArgs = (o) => !!(o && typeof o === 'object' && o.source && o.itemId && o.response !== undefined);

describe('feeder record() contract (prop 12) — frozen result shape under any environment', () => {
  it('always resolves to {ok: boolean}; ok:false carries a whitelisted reason; queued only with ok semantics', async () => {
    await fc.assert(fc.asyncProperty(envArb, optsArb, async (env, opts) => {
      const { client } = bootClient(env);
      const res = await client.record(opts);              // must never reject
      expect(typeof res.ok).toBe('boolean');
      if (!res.ok) expect(REASONS.has(res.reason), `unknown reason "${res.reason}"`).toBe(true);
      if (res.ok) expect(res.reason).toBeUndefined();
      if ('queued' in res && res.queued != null) expect(typeof res.queued).toBe('boolean');
    }), { numRuns: 250 });
  });

  it('guard order: bad-args wins over everything (and issues no fetch, no enqueue)', async () => {
    await fc.assert(fc.asyncProperty(envArb, junk, async (env, opts) => {
      fc.pre(!validArgs(opts));
      const { client, counts } = bootClient(env);
      const res = await client.record(opts);
      expect(res).toMatchObject({ ok: false, reason: 'bad-args' });
      expect(counts.fetch).toBe(0);
      expect(counts.enqueue).toBe(0);
    }));
  });

  it('read-only (view-as) wins over offline/identity for valid args: never fetches, never enqueues', async () => {
    await fc.assert(fc.asyncProperty(envArb, async (env) => {
      const { client, counts } = bootClient({ ...env, readOnly: true });
      const res = await client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' });
      expect(res).toMatchObject({ ok: false, reason: 'read-only' });
      expect(counts.fetch).toBe(0);
      expect(counts.enqueue).toBe(0);                     // impersonated writes are never captured
    }));
  });

  it('no-identity never issues a fetch and never enqueues (online path)', async () => {
    await fc.assert(fc.asyncProperty(envArb, async (env) => {
      const { client, counts } = bootClient({ ...env, token: env.token === 'tok-1' ? null : env.token, queue: env.queue === 'offline' ? 'online' : env.queue, readOnly: false });
      const res = await client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' });
      if (res.reason === 'no-identity') {
        expect(counts.fetch).toBe(0);
        expect(counts.enqueue).toBe(0);
      }
    }));
  });

  it('queued:true is HONEST — returned only when the queue actually captured the write', async () => {
    await fc.assert(fc.asyncProperty(envArb, async (env) => {
      const { client, counts } = bootClient({ ...env, readOnly: false });
      const res = await client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' });
      if (res.queued === true) {
        expect(counts.enqueue, 'claimed queued but never called enqueue').toBeGreaterThanOrEqual(1);
        expect(env.enqueueFails, 'claimed queued but the enqueue FAILED — the write was lost').toBe(false);
      }
    }), { numRuns: 250 });
  });

  it('offline-mode capture: a SUCCESSFUL enqueue reports {ok:true, queued:true}; a FAILED one must not claim success', async () => {
    // happy capture (pins the existing behavior)
    const good = bootClient({ token: 'tok-1', serviceUrl: true, fetch: 'ok', queue: 'offline', enqueueFails: false, readOnly: false });
    await expect(good.client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' }))
      .resolves.toMatchObject({ ok: true, queued: true });
    expect(good.counts.fetch).toBe(0);                    // offline pack never touches the network
    // broken queue: the write was NOT captured — saying "queued" would lose a grade
    const bad = bootClient({ token: 'tok-1', serviceUrl: true, fetch: 'ok', queue: 'offline', enqueueFails: true, readOnly: false });
    const res = await bad.client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' });
    expect(res.queued, 'a failed capture must not be reported as queued').not.toBe(true);
    expect(res.ok, 'a lost write must not be reported as ok').toBe(false);
  });

  it('OFFLINE MODE + missing identity: no-op {ok:false, no-identity} — an unattributed record must never enter the queue', async () => {
    // Codex P4 blocker: the offline capture used to run BEFORE the identity check.
    // An unattributed queued record is later POSTed by syncOfflineQueue() under
    // whatever token is current at drain time → cross-student attribution on a
    // shared device. Identity (token AND studentId) must gate the capture.
    await fc.assert(fc.asyncProperty(
      envArb,
      fc.constantFrom('roster-absent', 'token-null', 'token-empty', 'token-throws', 'sid-null', 'sid-empty', 'sid-throws'),
      async (env, how) => {
        const broken = { ...env, queue: 'offline', readOnly: false };
        if (how === 'roster-absent') broken.roster = 'absent';
        if (how === 'token-null') { broken.roster = 'present'; broken.token = null; }
        if (how === 'token-empty') { broken.roster = 'present'; broken.token = ''; }
        if (how === 'token-throws') { broken.roster = 'present'; broken.token = 'throws'; }
        if (how.startsWith('sid-')) { broken.roster = 'present'; broken.token = 'tok-1'; }
        if (how === 'sid-null') broken.sid = null;
        if (how === 'sid-empty') broken.sid = '';
        if (how === 'sid-throws') broken.sid = 'throws';
        const { client, counts } = bootClient(broken);
        const res = await client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' });
        expect(res).toMatchObject({ ok: false, reason: 'no-identity' });
        expect(counts.fetch).toBe(0);
        expect(counts.enqueue, 'an unattributed record entered the queue').toBe(0);
      },
    ), { numRuns: 200 });
  });

  it('a successful offline capture is ATTRIBUTED: the enqueued record carries the non-empty studentId', async () => {
    const { client, counts } = bootClient({ roster: 'present', token: 'tok-1', sid: 'sid-1', serviceUrl: true, fetch: 'ok', queue: 'offline', enqueueFails: false, readOnly: false });
    await expect(client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'x' }))
      .resolves.toMatchObject({ ok: true, queued: true });
    expect(counts.recs).toHaveLength(1);
    expect(counts.recs[0].studentId, 'queued record must carry its owner').toBe('sid-1');
  });
});

// ── Drain-time ownership (P4 blocker #2) ────────────────────────────────────────
// The queued studentId is only worth storing if the DRAIN honors it: _postRecord
// attributes by the CURRENT session token, so syncOfflineQueue must refuse to
// post any record the signed-in student does not own — it stays queued for the
// owner's next session (or the teacher export path). Uses the REAL offline-queue.js
// (in-memory store in the vm) so drain's delete-on-ok semantics are the shipped ones.

function bootSharedDevice() {
  const counts = { fetch: 0, bodies: [] };
  let identity = { token: 'tok-A', sid: 'sid-A' };
  const win = {};
  win.window = win;
  win.ROSTER_SERVICE_URL = 'https://svc.test';
  win.rosterClient = { token: () => identity.token, studentId: () => identity.sid };
  const doFetch = (url, init) => {
    counts.fetch += 1;
    counts.bodies.push(init && init.body);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, ledgerId: 'L1' }) });
  };
  win.fetch = doFetch;
  const ctx = createContext({
    window: win, fetch: doFetch, console: { warn: () => {}, log: () => {} },
    JSON, Promise, Map, String, Number, Object, Array, Date, isFinite, encodeURIComponent,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  runInContext(OFFLINE_SRC, ctx);                       // the REAL queue (memory fallback)
  runInContext(SRC, ctx);
  return {
    win, counts,
    client: win.gradebookClient, queue: win.OfflineQueue,
    setIdentity: (token, sid) => { identity = { token, sid }; },
  };
}

describe('shared-device drain ownership — a queued record only drains under its OWNER\'s session', () => {
  it('another student signed in: the owner\'s queued record is NOT posted and STAYS queued', async () => {
    const dev = bootSharedDevice();
    dev.win.OFFLINE_MODE = true;                        // student A works offline
    await expect(dev.client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'a', score: 1 }))
      .resolves.toMatchObject({ ok: true, queued: true });
    dev.win.OFFLINE_MODE = false;

    dev.setIdentity('tok-B', 'sid-B');                  // student B signs in before the drain
    const r = await dev.client.syncOfflineQueue();
    expect(dev.counts.fetch, 'A\'s record must NOT be posted under B\'s token').toBe(0);
    expect(r.sent).toBe(0);
    expect(await dev.queue.all(), 'A\'s record must stay queued for A').toHaveLength(1);
  });

  it('the owner signs back in: their record drains, posts under THEIR token, and clears', async () => {
    const dev = bootSharedDevice();
    dev.win.OFFLINE_MODE = true;
    await dev.client.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'a', score: 1 });
    dev.win.OFFLINE_MODE = false;

    dev.setIdentity('tok-B', 'sid-B');
    await dev.client.syncOfflineQueue();                // B: nothing drains
    dev.setIdentity('tok-A', 'sid-A');                  // A returns
    const r = await dev.client.syncOfflineQueue();
    expect(r.sent).toBe(1);
    expect(dev.counts.fetch).toBe(1);
    expect(dev.counts.bodies[0]).toContain('"token":"tok-A"');
    expect(await dev.queue.all()).toHaveLength(0);
  });

  it('a legacy queued record with NO studentId never drains (no POST, stays queued)', async () => {
    const dev = bootSharedDevice();
    await dev.queue.enqueue({ source: 'worksheet', itemId: 'WS-LEGACY-Q1', response: 'x' });   // pre-fix capture: unowned
    const r = await dev.client.syncOfflineQueue();
    expect(dev.counts.fetch, 'an unowned record must never be posted').toBe(0);
    expect(r.sent).toBe(0);
    expect(await dev.queue.all()).toHaveLength(1);
  });
});
