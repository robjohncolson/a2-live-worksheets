// receipt-binding-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (props 7, 8).
// fast-check over ReceiptVerify.verifyLedgerRow — the boundary that makes signed receipts
// NON-decorative. receipt-verify-binding.test.js checks point tampers by example; this
// generalizes (NO tampered grade field passes) and pins Codex's P2 distinction:
//
//   A `receipt_id` collision with DIFFERENT content is a TAMPER caught HERE at the
//   verify boundary — it is NOT an ordinary LWW conflict for the store to merge. The
//   G-Set content-addresses by receipt_id assuming same id ⇒ identical bytes; verify is
//   what enforces that assumption before a row becomes a trusted grade input.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function load() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, self: win, crypto: webcrypto, atob, btoa, Buffer,
    TextEncoder, TextDecoder, Uint8Array, Map, Array, Object, String, Number, JSON, Promise, console,
    URLSearchParams, location: { search: '', hash: '' },
  });
  runInContext(readFileSync(resolve(repo, 'receipt-verify.js'), 'utf8'), ctx);
  runInContext(readFileSync(resolve(repo, 'receipt-sign.js'), 'utf8'), ctx);
  return { RV: win.ReceiptVerify, RS: win.ReceiptSign };
}

let RV, RS, privateKey;
const sid = 'stu-42', item = 'WS-U5L2-Q1', src = 'frq';

async function signLedger(payloadOver = {}) {
  const payload = { v: 1, t: 'ledger', sid, src, i: item, a: 1, e: 'practice', ah: 'abcd1234', ts: 1000, sc: 1, ...payloadOver };
  const { receiptId, compact } = await RS.signPayload(privateKey, payload);
  return { receiptId, compact };
}
const LEGIT = { source: src, item_id: item, score: 1, attempt: 1, student_id: sid };
const rowFrom = (receiptId, compact, over = {}) => ({ ...LEGIT, receipt_id: receiptId, receipt_compact: compact, ...over });

beforeAll(async () => {
  ({ RV, RS } = load());
  const k = await RS.generateKey();
  privateKey = k.privateKey;
  RV.ISSUERS.push({ name: 'Test Device', pubkey: k.publicKeyX, kind: 'desk' }); // production issuer (no test:true)
});

describe('verifyLedgerRow — signature binding (prop 7)', () => {
  it('accepts the legit row; rejects ANY tamper of a bound grade field (incl. attempt)', async () => {
    // verifyLedgerRow binds all of these to the signed payload (receipt-verify.js §0).
    const { receiptId, compact } = await signLedger();
    expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact))).toBe(true);
    await fc.assert(fc.asyncProperty(
      fc.constantFrom('score', 'item_id', 'source', 'student_id', 'attempt'),
      fc.oneof(fc.integer({ min: 2, max: 100 }), fc.string({ minLength: 1, maxLength: 12 })),
      async (field, val) => {
        if (String(LEGIT[field]) === String(val)) return;   // a no-op "tamper" is not a tamper
        expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { [field]: val }))).toBe(false);
      },
    ), { numRuns: 50 });
  });

  it('binds `attempt`: a forged attempt (resurrecting an older signed score) is rejected', async () => {
    // Was a documented gap (Codex P2 review) — now a hard bind. latestPerItem picks the
    // highest attempt, so an unbound attempt let a student make an older signed high score
    // beat a later low one. The score is still bound (no fabrication), but this closes the
    // "latest attempt wins" bypass. Default-1 means an omitted attempt still matches a=1.
    const { receiptId, compact } = await signLedger({ a: 1 });
    expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { attempt: 1 }))).toBe(true);
    expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { attempt: undefined }))).toBe(true); // omitted → 1
    await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 100 }), async (forgedA) => {
      expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { attempt: forgedA }))).toBe(false);
    }), { numRuns: 20 });
  });

  it('same receipt_id + different content ⇒ verify FAILS (tamper is caught here, not merged as LWW)', async () => {
    const { receiptId, compact } = await signLedger({ sc: 1 });
    expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { score: 1 }))).toBe(true);
    await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 100 }), async (forgedScore) => {
      // A harvested valid signature re-stapled to an edited score, kept under its real
      // receipt_id so the G-Set would dedup it against the honest row — verify rejects it.
      expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact, { score: forgedScore }))).toBe(false);
    }), { numRuns: 25 });
  });

  it('a row with no receipt, or a corrupted signature, never verifies', async () => {
    const { receiptId, compact } = await signLedger();
    expect(await RV.verifyLedgerRow({ ...LEGIT, receipt_id: 'x' })).toBe(false);        // no compact
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (n) => {
      const corrupt = compact.slice(0, -n) + 'A'.repeat(n);
      if (corrupt === compact) return;
      expect(await RV.verifyLedgerRow(rowFrom(receiptId, corrupt))).toBe(false);
    }), { numRuns: 15 });
  });
});

describe('domain separation (prop 8)', () => {
  it('a t:submission receipt is NEVER accepted as a ledger grade row', async () => {
    // Same signer, same fields — only the domain tag differs. The grade lane must not
    // ingest a submission-lane receipt (t==='ledger' is required).
    const { receiptId, compact } = await signLedger({ t: 'submission' });
    expect(await RV.verifyLedgerRow(rowFrom(receiptId, compact))).toBe(false);
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 10 }).filter((t) => t !== 'ledger'), async (tag) => {
      const r = await signLedger({ t: tag });
      expect(await RV.verifyLedgerRow(rowFrom(r.receiptId, r.compact))).toBe(false);
    }), { numRuns: 20 });
  });
});
