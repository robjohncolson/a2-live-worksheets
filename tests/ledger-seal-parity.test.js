/**
 * ledger-seal-parity.test.js — ANDROID Phase 4 §4 step 5 (on-device epoch sealing).
 * Proves the browser head/epoch math is byte-identical to the server, and that a
 * device-sealed epoch passes the server's zero-trust verifySnapshot.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';
import { buildCommits } from '../roster-server/commits.js';
import { epochRoot as serverEpochRoot } from '../roster-server/admin-snapshot.js';
import { verifyCompact, verifySnapshot, publicKeyFromX } from '../roster-server/snapshot-verify.js';

const REPO = resolve(import.meta.dirname, '..');

function loadCrypto() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, crypto: webcrypto,
    TextEncoder, Buffer, Promise, JSON, Object, String, Uint8Array, Array, Set, Date, console,
  });
  runInContext(readFileSync(resolve(REPO, 'receipt-sign.js'), 'utf8'), ctx);
  runInContext(readFileSync(resolve(REPO, 'ledger-seal.js'), 'utf8'), ctx);
  return { ReceiptSign: win.ReceiptSign, LedgerSeal: win.LedgerSeal };
}

// Build server-shaped receipt rows (commits.js consumes {id, ts, ...}).
function rows(specs) {
  return specs.map((s) => ({ id: s.id, compact: 'c.' + s.id, i: s.id, src: 'frq', sc: 1, ts: s.ts }));
}
const serverHead = (specs) => buildCommits(rows(specs), { sid: 'stu-1', u: 'u' }).head;

describe('LedgerSeal.buildHead — parity with server buildCommits', () => {
  let LedgerSeal;
  beforeAll(() => { LedgerSeal = loadCrypto().LedgerSeal; });

  const T = 1_700_000_000_000;
  const cases = {
    empty: [],
    'single chunk (<8)': [1, 2, 3].map((n) => ({ id: 'r' + n, ts: T + n * 1000 })),
    'two chunks (>8 in one session)': Array.from({ length: 11 }, (_, n) => ({ id: 'r' + n, ts: T + n * 1000 })),
    'two sessions (>25min gap)': [
      ...Array.from({ length: 10 }, (_, n) => ({ id: 'a' + n, ts: T + n * 1000 })),
      ...[0, 1, 2].map((n) => ({ id: 'b' + n, ts: T + 30 * 60 * 1000 + n * 1000 })),
    ],
    'unsorted input': [{ id: 'z', ts: T + 5000 }, { id: 'a', ts: T + 1000 }, { id: 'm', ts: T + 3000 }],
    'same-ts tie broken by id': [{ id: 'b', ts: T }, { id: 'a', ts: T }, { id: 'c', ts: T }],
  };

  for (const [name, specs] of Object.entries(cases)) {
    it(`head matches — ${name}`, async () => {
      const mine = await LedgerSeal.buildHead(specs.map((s) => ({ id: s.id, ts: s.ts })));
      expect(mine).toBe(serverHead(specs));
    });
  }
});

describe('LedgerSeal.epochRoot — parity with server epochRoot', () => {
  let LedgerSeal;
  beforeAll(() => { LedgerSeal = loadCrypto().LedgerSeal; });

  it('matches across present/null/empty heads', async () => {
    const heads = { 'stu-3': 'ccc', 'stu-1': 'aaa', 'stu-2': null };
    expect(await LedgerSeal.epochRoot(heads)).toBe(serverEpochRoot(heads));
    expect(await LedgerSeal.epochRoot({})).toBe(serverEpochRoot({}));
  });
});

describe('LedgerSeal.sealEpoch — a device seal verifies', () => {
  let ReceiptSign, LedgerSeal, dev;
  beforeAll(async () => {
    const m = loadCrypto(); ReceiptSign = m.ReceiptSign; LedgerSeal = m.LedgerSeal;
    dev = await ReceiptSign.generateKey();
  });

  it('produces a signed epoch receipt whose root matches epochRoot(heads)', async () => {
    const heads = { 'stu-1': 'aaa', 'stu-2': 'bbb' };
    const sealed = await LedgerSeal.sealEpoch({ heads, asOfDateNY: '2026-06-30', privateKey: dev.privateKey });
    expect(sealed.root).toBe(await LedgerSeal.epochRoot(heads));
    const payload = verifyCompact(sealed.compact, publicKeyFromX(dev.publicKeyX));
    expect(payload).toMatchObject({ t: 'epoch', iss: 'desk', d: '2026-06-30', root: sealed.root });
  });

  it('end-to-end: a device-sealed epoch passes server verifySnapshot (epochOk)', async () => {
    // Records that buildCommits turns into a head; seal over that head with the device key.
    const T = 1_700_000_000_000;
    const recs = [0, 1, 2].map((n) => ({
      studentId: 'stu-1', itemId: 'WS-U1L1-Q' + n, source: 'frq', score: 1,
      receipt_id: 'id' + n, receipt_compact: 'dummy.' + n,            // non-null so buildCommits keeps it
      recorded_at: new Date(T + n * 1000).toISOString(),
    }));
    const head = await LedgerSeal.buildHead(recs.map((r) => ({ id: r.receipt_id, ts: Date.parse(r.recorded_at) })));
    const heads = { 'stu-1': head };
    const sealed = await LedgerSeal.sealEpoch({ heads, asOfDateNY: '2026-06-30', privateKey: dev.privateKey });

    const snapshot = {
      issuer: { pubkey: dev.publicKeyX, pubkeys: [dev.publicKeyX] },
      students: [{ studentId: 'stu-1', username: 'u', commitsHead: head, transcriptRoot: null, bundle: { records: recs, reviews: [] } }],
      epoch: { root: sealed.root, receipt_compact: sealed.compact },
    };
    const report = verifySnapshot(snapshot, { pubkeys: [dev.publicKeyX] });
    expect(report.epochOk).toBe(true); // the device seal is accepted by the server's zero-trust verifier
  });
});
