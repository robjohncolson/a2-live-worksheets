/**
 * Tests for ledger-store.js (ANDROID_PHASE2_LEDGER_MERGE_SPEC §1.B).
 * Runs the real IIFE in a vm context (jsdom has no IndexedDB → exercises the
 * in-memory fallback, so the durable API is fully testable here).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'ledger-store.js'), 'utf8');

function loadFresh(extra = {}) {
  // fresh window each time so the in-memory store + cached singleton don't leak
  const win = { Date, ...extra };
  const ctx = createContext({ window: win, globalThis: win });
  runInContext(SRC, ctx);
  return win.LedgerStore;
}

const signedRow = (over = {}) => ({
  item_id: 'WS-U1L1-Q1', source: 'worksheet', score: 1, attempt: 1,
  recorded_at: '2026-09-20T12:00:00Z',
  receipt_id: 'abc123', receipt_compact: 'payload.sig', ...over,
});

describe('LedgerStore pure helpers', () => {
  let S;
  beforeEach(() => { S = loadFresh(); });

  it('keyOf is content-addressed by receipt_id when present', () => {
    expect(S.keyOf({ receipt_id: 'deadbeef' })).toBe('r:deadbeef');
  });

  it('keyOf falls back to source|item|attempt for pre-0018 rows', () => {
    expect(S.keyOf({ source: 'frq', item_id: 'WS-U1L1-reflect1' })).toBe('k:frq|WS-U1L1-reflect1|1');
    expect(S.keyOf({ source: 'frq', item_id: 'X', attempt: 3 })).toBe('k:frq|X|3');
  });

  it('tsOf prefers numeric ts, then recorded_at, then 0', () => {
    expect(S.tsOf({ ts: 5000 })).toBe(5000);
    expect(S.tsOf({ recorded_at: '2026-09-20T00:00:00Z' })).toBe(Date.parse('2026-09-20T00:00:00Z'));
    expect(S.tsOf({})).toBe(0);
  });

  it('mergeRow dedups identical receipt_ids (idempotent union)', () => {
    let list = [];
    list = S.mergeRow(list, signedRow());
    list = S.mergeRow(list, signedRow()); // same receipt_id
    expect(list).toHaveLength(1);
  });

  it('mergeRow keeps distinct receipt_ids', () => {
    let list = [];
    list = S.mergeRow(list, signedRow({ receipt_id: 'a' }));
    list = S.mergeRow(list, signedRow({ receipt_id: 'b' }));
    expect(list).toHaveLength(2);
  });

  it('mergeRow on a fallback-key collision keeps the newer signed-ts', () => {
    let list = [];
    list = S.mergeRow(list, { source: 'frq', item_id: 'X', score: 0.5, recorded_at: '2026-09-20T00:00:00Z' });
    list = S.mergeRow(list, { source: 'frq', item_id: 'X', score: 1.0, recorded_at: '2026-09-21T00:00:00Z' });
    expect(list).toHaveLength(1);
    expect(list[0].score).toBe(1.0);
  });

  it('mergeAll folds a batch (union + dedup)', () => {
    const rows = [signedRow({ receipt_id: 'a' }), signedRow({ receipt_id: 'b' }), signedRow({ receipt_id: 'a' })];
    expect(S.mergeAll([], rows)).toHaveLength(2);
  });
});

describe('LedgerStore durable API', () => {
  let S;
  beforeEach(() => { S = loadFresh(); });

  it('put then all round-trips a row', async () => {
    await S.put(signedRow());
    const rows = await S.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].item_id).toBe('WS-U1L1-Q1');
  });

  it('put is idempotent on receipt_id', async () => {
    await S.put(signedRow());
    await S.put(signedRow());
    expect(await S.all()).toHaveLength(1);
  });

  it('putAll merges a batch and clear empties it', async () => {
    await S.putAll([signedRow({ receipt_id: 'a' }), signedRow({ receipt_id: 'b' })]);
    expect(await S.all()).toHaveLength(2);
    await S.clear();
    expect(await S.all()).toHaveLength(0);
  });

  it('put never lets an older write clobber a newer stored record', async () => {
    await S.put({ source: 'frq', item_id: 'X', score: 1.0, recorded_at: '2026-09-21T00:00:00Z' });
    await S.put({ source: 'frq', item_id: 'X', score: 0.2, recorded_at: '2026-09-20T00:00:00Z' }); // older
    const rows = await S.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(1.0);
  });
});

describe('LedgerStore.pull', () => {
  let S;
  beforeEach(() => { S = loadFresh(); });

  const okFetch = (rows) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, rows }) });

  it('pulls rows from /ledger/student and merges them in', async () => {
    const res = await S.pull(null, {
      studentId: 'stu_1', token: 't0k', serverUrl: 'https://roster.example',
      fetchImpl: okFetch([signedRow({ receipt_id: 'a' }), signedRow({ receipt_id: 'b' })]),
    });
    expect(res.offline).toBe(false);
    expect(res.added).toBe(2);
    expect(await S.all()).toHaveLength(2);
  });

  it('builds the URL from the roster client identity', async () => {
    let seenUrl = null;
    const client = { current: () => ({ studentId: 'stu_9' }), token: () => 'TKN' };
    await S.pull(client, {
      serverUrl: 'https://roster.example',
      fetchImpl: (url) => { seenUrl = url; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows: [] }) }); },
    });
    expect(seenUrl).toContain('/ledger/student/stu_9');
    expect(seenUrl).toContain('token=TKN');
  });

  it('offline (thrown fetch) is swallowed and keeps the local replica', async () => {
    await S.put(signedRow({ receipt_id: 'keep' }));
    const res = await S.pull(null, {
      studentId: 'stu_1', token: 't', serverUrl: 'x',
      fetchImpl: () => Promise.reject(new Error('network down')),
    });
    expect(res.offline).toBe(true);
    expect(await S.all()).toHaveLength(1); // unchanged
  });

  it('a non-ok HTTP response adds nothing', async () => {
    const res = await S.pull(null, {
      studentId: 'stu_1', token: 't', serverUrl: 'x',
      fetchImpl: () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }),
    });
    expect(res.added).toBe(0);
    expect(await S.all()).toHaveLength(0);
  });

  it('no identity → no-op (no fetch attempted)', async () => {
    let called = false;
    const res = await S.pull(null, { fetchImpl: () => { called = true; return Promise.resolve({ ok: true, json: () => ({}) }); } });
    expect(called).toBe(false);
    expect(res.reason).toBe('no-identity');
  });
});

describe('LedgerStore.verifyAll', () => {
  let S;
  beforeEach(() => { S = loadFresh(); });

  // Fake ReceiptVerify: a compact starting with 'good.' verifies; 'bad.' does not.
  const fakeRV = {
    verifyReceipt: (compact) => Promise.resolve(
      /^good\./.test(compact) ? { ok: true, issuer: { name: 'The Desk' } } : { ok: false }
    ),
  };

  it('counts verified / tampered / unverified', async () => {
    await S.putAll([
      signedRow({ receipt_id: 'a', receipt_compact: 'good.sig' }),
      signedRow({ receipt_id: 'b', receipt_compact: 'bad.sig' }),
      signedRow({ receipt_id: 'c', receipt_compact: null }),
    ]);
    const r = await S.verifyAll({ receiptVerify: fakeRV });
    expect(r).toMatchObject({ verified: 1, tampered: 1, unverified: 1, total: 3, available: true });
  });

  it('tags each row with a _verify state', async () => {
    await S.put(signedRow({ receipt_id: 'a', receipt_compact: 'good.sig' }));
    const r = await S.verifyAll({ receiptVerify: fakeRV });
    expect(r.rows[0]._verify.state).toBe('verified');
    expect(r.rows[0]._verify.issuer).toBe('The Desk');
  });

  it('reports unavailable when no verifier is present', async () => {
    await S.put(signedRow());
    const r = await S.verifyAll({ receiptVerify: null });
    expect(r.available).toBe(false);
    expect(r.unverified).toBe(1);
  });
});
