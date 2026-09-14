// submission-capture.test.js — self-sign raw work into the submissions lane
// (OFFLINE_GRADING_MESH §3, §0.2), end-to-end with the REAL signer + verifier:
// a captured submission verifies via verifySubmissionRow (student trust set) and is
// REJECTED by verifyLedgerRow (grades lane). @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['receipt-verify.js', 'receipt-sign.js', 'submission-store.js', 'submission-capture.js']
  .map((f) => readFileSync(resolve(repo, f), 'utf8'));

function load() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, self: win, crypto: webcrypto,
    atob, btoa, Buffer, escape, unescape, decodeURIComponent,
    TextEncoder, TextDecoder, Uint8Array, Map, Array, Object, String, Number, JSON, Promise, isFinite, Date, console, URLSearchParams,
    location: { search: '', hash: '' },
  });
  files.forEach((src) => runInContext(src, ctx));
  return win;
}

describe('SubmissionCapture — build + sign + verify (§0.2)', () => {
  let win, RS, RV, SC, Store, stuKey, stuPub;
  const sid = 'stu-42';

  beforeAll(async () => {
    win = load();
    RS = win.ReceiptSign; RV = win.ReceiptVerify; SC = win.SubmissionCapture; Store = win.SubmissionStore;
    const k = await RS.generateKey();
    stuKey = k.privateKey; stuPub = k.publicKeyX;
    RV.registerStudentKeys([{ pubkey: stuPub, sid }]);
  });

  it('buildPayload carries no grade fields and binds the response by ah', async () => {
    const p = await SC.buildPayload(RS, { sid, source: 'frq', itemId: 'WS-U5L2-reflect1', response: 'my answer', attempt: 1 }, 5000);
    expect(p.t).toBe('submission');
    expect('sc' in p).toBe(false);
    expect('g' in p).toBe(false);
    expect(p.ah).toBe(await RS.answerHash('my answer'));
    expect(p.sid).toBe(sid);
  });

  it('signOne produces a row that verifySubmissionRow ACCEPTS and verifyLedgerRow REJECTS', async () => {
    const row = await SC.signOne(stuKey, { sid, source: 'frq', itemId: 'WS-U5L2-reflect1', response: 'the CLT needs n>=30', attempt: 1 }, { receiptSign: RS, store: Store, now: 5000 });
    expect(row.student_id).toBe(sid);
    expect(row.receipt_id).toBeTruthy();
    // Accepted on the submissions lane (student trust set).
    expect(await RV.verifySubmissionRow(row)).toBe(true);
    // Rejected on the grades lane: t:'submission' is not t:'ledger' (§0.1a) AND the
    // signer isn't a trusted ISSUER.
    expect(await RV.verifyLedgerRow(row)).toBe(false);
    // It was stored.
    const all = await Store.all();
    expect(all.some((r) => r.receipt_id === row.receipt_id)).toBe(true);
  });

  it('a peer that swaps the response fails verifySubmissionRow (ah bind)', async () => {
    const row = await SC.signOne(stuKey, { sid, source: 'frq', itemId: 'WS-U5L2-reflect1', response: 'original', attempt: 2 }, { receiptSign: RS, store: Store, now: 6000 });
    const tampered = { ...row, response: 'SWAPPED' };
    expect(await RV.verifySubmissionRow(tampered)).toBe(false);
  });

  it('signPendingWork unlocks once, signs a batch, and forces self-attribution', async () => {
    const fakeStudentKey = { unlock: () => Promise.resolve(stuKey) };
    const res = await SC.signPendingWork(sid, [
      { source: 'frq', itemId: 'WS-U5L2-reflect1', response: 'a', attempt: 3 },
      { source: 'frq', itemId: 'WS-U5L2-reflect2', response: 'b', attempt: 1, sid: 'stu-EVIL' }, // sid ignored
    ], { studentKey: fakeStudentKey, receiptSign: RS, store: Store, now: 7000 });
    expect(res.signed.length).toBe(2);
    expect(res.failed.length).toBe(0);
    // Both rows are attributed to the caller sid, not the injected one.
    expect(res.signed.every((r) => r.student_id === sid)).toBe(true);
    for (const row of res.signed) expect(await RV.verifySubmissionRow(row)).toBe(true);
  });

  it('signPendingWork degrades cleanly with no identity / no work', async () => {
    expect((await SC.signPendingWork(null, [{ source: 'frq', itemId: 'x', response: 'y' }])).reason).toBe('no-identity');
    const empty = await SC.signPendingWork(sid, [], { studentKey: { unlock: () => Promise.resolve(stuKey) } });
    expect(empty.signed.length).toBe(0);
  });
});
