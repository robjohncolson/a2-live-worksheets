// issuer-key-history.test.js — issuer-key rotation/history (ANDROID Phase 4 §2).
// Verification must trust a SET of pubkeys (current + retired) so a rotated/added
// key never invalidates already-signed receipts. Signing always uses the current key.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { initReceipts, getReceiptIssuer, getTrustedIssuerPubkeys, receiptInternals } from '../receipts.js';
import { verifyCompact, verifyRecord, publicKeyFromX } from '../snapshot-verify.js';

const { signPayload } = receiptInternals;

function makeKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey,
    der: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    x: publicKey.export({ format: 'jwk' }).x,
    pub: publicKey,
  };
}

// A signed item receipt (the shape verifyRecord binds against). Real grade
// receipts always carry t:'ledger' (issueLedgerReceipt / signLedgerReceipt) — the
// fixture must too, or verifyRecord's domain-separation check (§0.1a) rejects it.
function signedRecord(key, { sid = 'stu-1', i = 'WS-U1L1-Q1', src = 'worksheet', sc = 1 } = {}) {
  const { receiptId, compact } = signPayload(key.privateKey, { v: 1, t: 'ledger', sid, i, src, sc });
  return { studentId: sid, itemId: i, source: src, score: sc, receipt_id: receiptId, receipt_compact: compact };
}

describe('verifyCompact — key list', () => {
  const a = makeKey();
  const b = makeKey();
  const { compact } = signPayload(b.privateKey, { v: 1, hello: 'world' });

  it('rejects when no listed key signed it', () => {
    expect(verifyCompact(compact, [publicKeyFromX(a.x)])).toBeNull();
  });
  it('accepts when ANY listed key signed it (retired key still trusted)', () => {
    expect(verifyCompact(compact, [publicKeyFromX(a.x), publicKeyFromX(b.x)])).toMatchObject({ hello: 'world' });
  });
  it('still accepts a single key (back-compat)', () => {
    expect(verifyCompact(compact, publicKeyFromX(b.x))).toMatchObject({ hello: 'world' });
  });
});

describe('verifyRecord — honors a trusted key list', () => {
  const current = makeKey();
  const retired = makeKey();
  const rec = signedRecord(retired); // signed by the OLD key

  it('fails under the current key alone', () => {
    const vr = verifyRecord(rec, [publicKeyFromX(current.x)], 'stu-1');
    expect(vr.ok).toBe(false);
    expect(vr.breaks[0].kind).toBe('bad-signature');
  });
  it('passes when the retired key is in the trust set', () => {
    const vr = verifyRecord(rec, [publicKeyFromX(current.x), publicKeyFromX(retired.x)], 'stu-1');
    expect(vr.ok).toBe(true);
  });
  it('rejects a validly-signed NON-GRADE (t≠ledger) payload replayed as a grade (mesh §0.1a)', () => {
    const key = makeKey();
    // A t:'review' payload with grade-record field shape, signed by a trusted key.
    const { receiptId, compact } = signPayload(key.privateKey, { v: 1, t: 'review', sid: 'stu-1', i: 'WS-U1L1-Q1', src: 'worksheet', sc: 1 });
    const rec2 = { studentId: 'stu-1', itemId: 'WS-U1L1-Q1', source: 'worksheet', score: 1, receipt_id: receiptId, receipt_compact: compact };
    const vr = verifyRecord(rec2, [publicKeyFromX(key.x)], 'stu-1');
    expect(vr.ok).toBe(false);
    expect(vr.breaks.some((b) => b.kind === 'wrong-type')).toBe(true);
  });
});

describe('getTrustedIssuerPubkeys / getReceiptIssuer', () => {
  const saved = { priv: process.env.RECEIPT_ISSUER_PRIVATE_KEY, retired: process.env.RETIRED_ISSUER_PUBKEYS };
  const current = makeKey();
  const retired1 = makeKey();
  const retired2 = makeKey();

  beforeEach(() => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = current.der;
  });
  afterEach(() => {
    if (saved.priv === undefined) delete process.env.RECEIPT_ISSUER_PRIVATE_KEY; else process.env.RECEIPT_ISSUER_PRIVATE_KEY = saved.priv;
    if (saved.retired === undefined) delete process.env.RETIRED_ISSUER_PUBKEYS; else process.env.RETIRED_ISSUER_PUBKEYS = saved.retired;
    initReceipts();
  });

  it('with no retired env, the trust set is just the current key', () => {
    delete process.env.RETIRED_ISSUER_PUBKEYS;
    initReceipts();
    expect(getTrustedIssuerPubkeys()).toEqual([current.x]);
    expect(getReceiptIssuer().pubkeys).toEqual([current.x]);
    expect(getReceiptIssuer().pubkey).toBe(current.x); // back-compat singular
  });

  it('includes retired keys (current first), deduped', () => {
    process.env.RETIRED_ISSUER_PUBKEYS = `${retired1.x} , ${retired2.x}, ${current.x}`;
    initReceipts();
    expect(getTrustedIssuerPubkeys()).toEqual([current.x, retired1.x, retired2.x]);
    expect(getReceiptIssuer().pubkeys).toEqual([current.x, retired1.x, retired2.x]);
  });

  it('a receipt signed by a now-retired key still verifies under the trust set', () => {
    process.env.RETIRED_ISSUER_PUBKEYS = retired1.x;
    initReceipts();
    const rec = signedRecord(retired1);
    const keys = getTrustedIssuerPubkeys().map(publicKeyFromX);
    expect(verifyRecord(rec, keys, 'stu-1').ok).toBe(true);
  });
});
