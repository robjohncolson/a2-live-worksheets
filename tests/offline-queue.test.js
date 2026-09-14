/**
 * Tests for offline-queue.js (OFFLINE_MODE_SPEC §4.A).
 * Runs the real IIFE in a vm context (jsdom has no IndexedDB → exercises the
 * in-memory fallback, so the durable API is fully testable here).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'offline-queue.js'), 'utf8');

function loadFresh(extra = {}) {
  // fresh window each time so the in-memory store doesn't leak across tests
  const win = { Date, ...extra };
  const ctx = createContext({ window: win, globalThis: win });
  runInContext(SRC, ctx);
  return win.OfflineQueue;
}

const rec = (over = {}) => ({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean', score: 1, attempt: 1, ts: 1000, ...over });

describe('OfflineQueue pure helpers', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('keyOf is source|itemId|attempt with attempt defaulting to 1', () => {
    expect(Q.keyOf({ source: 'quiz', itemId: 'Q1' })).toBe('quiz|Q1|1');
    expect(Q.keyOf({ source: 'quiz', itemId: 'Q1', attempt: 2 })).toBe('quiz|Q1|2');
  });

  it('mergeRecord dedups by key and keeps the newer ts', () => {
    let list = [];
    list = Q.mergeRecord(list, rec({ response: 'old', ts: 1000 }));
    list = Q.mergeRecord(list, rec({ response: 'new', ts: 2000 }));
    expect(list).toHaveLength(1);
    expect(list[0].response).toBe('new');
  });

  it('mergeRecord does NOT clobber a newer record with an older replay', () => {
    let list = [Q.mergeRecord([], rec({ response: 'new', ts: 5000 }))[0]];
    list = Q.mergeRecord(list, rec({ response: 'stale', ts: 1000 }));
    expect(list[0].response).toBe('new');
  });

  it('mergeRecord keeps different attempts as separate rows', () => {
    let list = [];
    list = Q.mergeRecord(list, rec({ attempt: 1 }));
    list = Q.mergeRecord(list, rec({ attempt: 2 }));
    expect(list).toHaveLength(2);
  });

  it('toBundle produces the export schema with identity + records', () => {
    const b = Q.toBundle([rec()], { studentId: 's1', username: 'mango' }, { appBuild: 'b1', now: 42 });
    expect(b.schema).toBe('apstats-offline-export/v1');
    expect(b.student.studentId).toBe('s1');
    expect(b.appBuild).toBe('b1');
    expect(b.generatedAt).toBe(42);
    expect(b.records).toHaveLength(1);
  });

  it('isOffline reflects window.OFFLINE_MODE', () => {
    expect(loadFresh().isOffline()).toBe(false);
    expect(loadFresh({ OFFLINE_MODE: true }).isOffline()).toBe(true);
    expect(loadFresh({ OFFLINE_MODE: '1' }).isOffline()).toBe(true);
  });
});

describe('OfflineQueue durable API (in-memory fallback)', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('enqueue persists and all() reads back', async () => {
    await Q.enqueue(rec());
    const items = await Q.all();
    expect(items).toHaveLength(1);
    expect(items[0].itemId).toBe('WS-U1L1-Q1');
  });

  it('enqueue dedups by key (latest-wins), not append', async () => {
    await Q.enqueue(rec({ response: 'a', ts: 1000 }));
    await Q.enqueue(rec({ response: 'b', ts: 2000 }));
    const items = await Q.all();
    expect(items).toHaveLength(1);
    expect(items[0].response).toBe('b');
  });

  it('enqueue defaults ts when absent (still dedups)', async () => {
    await Q.enqueue({ source: 'quiz', itemId: 'Q1', response: 'x' });
    const items = await Q.all();
    expect(items).toHaveLength(1);
    expect(typeof items[0].ts).toBe('number');
  });

  it('drain sends each record and deletes only the ones that succeed', async () => {
    await Q.enqueue(rec({ itemId: 'A', ts: 1 }));
    await Q.enqueue(rec({ itemId: 'B', ts: 2 }));
    const seen = [];
    const result = await Q.drain((r) => { seen.push(r.itemId); return { ok: r.itemId === 'A' }; });
    expect(seen.sort()).toEqual(['A', 'B']);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    const left = await Q.all();
    expect(left).toHaveLength(1);
    expect(left[0].itemId).toBe('B'); // B failed → stays queued
  });

  it('drain tolerates a throwing sender (counts as failed, stays queued)', async () => {
    await Q.enqueue(rec({ itemId: 'A' }));
    const result = await Q.drain(() => { throw new Error('network'); });
    expect(result.failed).toBe(1);
    expect(await Q.all()).toHaveLength(1);
  });

  it('clear empties the queue', async () => {
    await Q.enqueue(rec());
    await Q.clear();
    expect(await Q.all()).toHaveLength(0);
  });

  it('drain does NOT delete a record a concurrent edit replaced mid-send (no data loss)', async () => {
    await Q.enqueue(rec({ itemId: 'A', response: 'old', ts: 1000 }));
    // sender is slow: while it "sends" the old record, the student edits the same
    // item, enqueuing a newer record for the same key.
    const sender = async (r) => {
      if (r.response === 'old') {
        await Q.enqueue(rec({ itemId: 'A', response: 'new', ts: 2000 }));
      }
      return { ok: true };
    };
    const result = await Q.drain(sender);
    const left = await Q.all();
    expect(left).toHaveLength(1);          // the newer edit survived
    expect(left[0].response).toBe('new');  // not clobbered by the delete
    expect(result.sent).toBe(0);           // the stale send did not clear the key
  });
});


describe('repeated server failures preserve and park answers', () => {
  it('parks after 12 server failures, exports flagged work, and a fresh edit resets it', async () => {
    const Q = loadFresh();
    const row = { source: 'quiz', itemId: 'park-me', response: 'A', ts: 1 };
    await Q.enqueue(row);
    let calls = 0;
    const sender = async () => { calls++; return { ok: false, status: 500 }; };
    for (let i = 0; i < 12; i++) await Q.drain(sender);
    expect(await Q.parked()).toEqual([expect.objectContaining({ serverFailures: 12, lastServerError: { status: 500, at: expect.any(Number) }, response: 'A' })]);
    expect(await Q.drain(sender)).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(calls).toBe(12);
    expect(Q.toBundle(await Q.all(), {}).records[0]).toMatchObject({ parked: true, response: 'A' });
    await Q.enqueue({ ...row, ts: 2, response: 'B' });
    expect(await Q.parked()).toEqual([]);
    expect((await Q.all())[0]).toMatchObject({ serverFailures: 0, response: 'B' });
    expect((await Q.all())[0].lastServerError).toBeUndefined();
    await Q.drain(sender); expect(calls).toBe(13);
  });
  it('401, 429, unreachable sends and ownership/auth refusal do not consume attempts', async () => {
    const Q = loadFresh();
    await Q.enqueue({ source: 'quiz', itemId: 'recoverable', ts: 1 });
    for (const result of [{ok:false,status:401}, {ok:false,status:429}, {ok:false,status:500,reason:'no-identity'}, {ok:false,status:503,reason:'auth-expired'}]) {
      await Q.drain(async () => result);
    }
    await Q.drain(async () => { throw new Error('offline'); });
    expect((await Q.all())[0].serverFailures).toBe(0);
    expect((await Q.all())[0].lastServerError).toBeUndefined();
  });
  it('a failed older send does not charge a newer edit', async () => {
    const Q = loadFresh();
    await Q.enqueue({ source: 'quiz', itemId: 'race', ts: 1 });
    await Q.drain(async () => {
      await Q.enqueue({ source: 'quiz', itemId: 'race', ts: 2, response: 'new' });
      return { ok: false, status: 500 };
    });
    expect((await Q.all())[0]).toMatchObject({ ts: 2, serverFailures: 0, response: 'new' });
  });
});
