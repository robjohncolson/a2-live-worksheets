// receipt-verify-binding.test.js — the §0 fix for ANDROID Phase 6 (QR sync).
//
// verifyReceipt() only proves "a trusted issuer signed SOME bytes". The gossip/QR
// ingest path used to accept a row if verifyReceipt(row.receipt_compact).ok — so a
// harvested valid signature could be re-stapled onto a row with a forged score/item/id
// and would pass (the signatures were decorative, and computeGrade grades off the
// UNSIGNED top-level row.score/item_id). ReceiptVerify.verifyLedgerRow() closes that:
// the signature must cover THIS row's grade-bearing fields + its content-address id.
//
// Signs with a real device WebCrypto key (like receipt-sign-interop.test.js) registered
// as a PRODUCTION issuer, so it exercises the true verifyReceipt path.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY_SRC = readFileSync(resolve(repo, 'receipt-verify.js'), 'utf8');
const SIGN_SRC = readFileSync(resolve(repo, 'receipt-sign.js'), 'utf8');

function load() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, self: win,
    crypto: webcrypto, atob, btoa, Buffer,
    TextEncoder, TextDecoder, Uint8Array, Map, Array, Object, String, Number, JSON, Promise, console,
    URLSearchParams, location: { search: '', hash: '' },
  });
  runInContext(VERIFY_SRC, ctx);
  runInContext(SIGN_SRC, ctx);
  return { RV: win.ReceiptVerify, RS: win.ReceiptSign };
}

describe('verifyLedgerRow — payload binding (§0)', () => {
  let RV, RS, privateKey;
  const sid = 'stu-42', item = 'WS-U5L2-Q1', src = 'frq';

  // Build a signed row exactly as the server does: row columns AND the receipt payload
  // come from the same {source,itemId,score,attempt,sid}, so a legit row always matches.
  async function signedRow(rowOverrides = {}, payloadOverrides = {}) {
    const payload = { v: 1, t: 'ledger', sid, src, i: item, a: 1, e: 'practice', ah: 'abcd1234', ts: 1000, sc: 1, ...payloadOverrides };
    const { receiptId, compact } = await RS.signPayload(privateKey, payload);
    return {
      source: src, item_id: item, score: 1, attempt: 1, student_id: sid,
      receipt_id: receiptId, receipt_compact: compact, ...rowOverrides,
    };
  }

  beforeAll(async () => {
    ({ RV, RS } = load());
    const k = await RS.generateKey();
    privateKey = k.privateKey;
    // Trust this device key as a PRODUCTION issuer (no test:true).
    RV.ISSUERS.push({ name: 'Test Device', pubkey: k.publicKeyX, kind: 'desk' });
  });

  it('accepts a legit row whose fields match the signed payload', async () => {
    expect(await RV.verifyLedgerRow(await signedRow())).toBe(true);
  });

  it('rejects a re-stapled forged SCORE (valid signature, edited row.score)', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ score: 5 }))).toBe(false);
  });

  it('rejects a forged item_id (a real score aimed at a different lesson)', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ item_id: 'WS-U9L9-Q9' }))).toBe(false);
  });

  it('rejects a forged source', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ source: 'pc' }))).toBe(false);
  });

  it('rejects a mismatched receipt_id (replay under a chosen id → G-Set bloat)', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ receipt_id: 'deadbeefcafe' }))).toBe(false);
  });

  it('rejects reassigning the grade to another student (forged student_id)', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ student_id: 'stu-victim' }))).toBe(false);
  });

  it('rejects a row with no receipt at all', async () => {
    expect(await RV.verifyLedgerRow({ source: src, item_id: item, score: 1, receipt_id: 'x' })).toBe(false);
  });

  it('rejects a tampered compact (broken signature bytes)', async () => {
    const row = await signedRow();
    row.receipt_compact = row.receipt_compact.slice(0, -4) + 'AAAA';
    expect(await RV.verifyLedgerRow(row)).toBe(false);
  });

  it('rejects a receipt signed by an UNTRUSTED key', async () => {
    const other = await RS.generateKey();
    const payload = { v: 1, t: 'ledger', sid, src, i: item, a: 1, e: 'practice', ah: 'abcd1234', ts: 1000, sc: 1 };
    const { receiptId, compact } = await RS.signPayload(other.privateKey, payload);
    const row = { source: src, item_id: item, score: 1, student_id: sid, receipt_id: receiptId, receipt_compact: compact };
    expect(await RV.verifyLedgerRow(row)).toBe(false);
  });

  it('does NOT honor TEST issuer keys on the ingest path (includeTestKeys forced false)', async () => {
    const testKey = await RS.generateKey();
    RV.ISSUERS.push({ name: 'Test-only', pubkey: testKey.publicKeyX, kind: 'desk', test: true });
    const payload = { v: 1, t: 'ledger', sid, src, i: item, a: 1, e: 'practice', ah: 'abcd1234', ts: 1000, sc: 1 };
    const { receiptId, compact } = await RS.signPayload(testKey.privateKey, payload);
    const row = { source: src, item_id: item, score: 1, student_id: sid, receipt_id: receiptId, receipt_compact: compact };
    expect(await RV.verifyLedgerRow(row)).toBe(false);
  });

  it('accepts an ungraded row (no sc in the receipt, no score on the row)', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ score: null }, { sc: undefined }))).toBe(true);
  });

  it('rejects a row claiming a score its ungraded receipt does not carry', async () => {
    expect(await RV.verifyLedgerRow(await signedRow({ score: 1 }, { sc: undefined }))).toBe(false);
  });
});
