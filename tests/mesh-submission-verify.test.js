// mesh-submission-verify.test.js — the retained academic receipt domain-separated
// verification (OFFLINE_GRADING_MESH_SPEC §0.1-0.3). Two lanes, two trust sets:
//   - verifyLedgerRow: GRADES lane; now REQUIRES payload.t === 'ledger' (§0.1a),
//     verified against the issuer trust set (ReceiptVerify.ISSUERS).
//   - verifySubmissionRow: SUBMISSIONS lane; requires payload.t === 'submission',
//     NO grade fields, verified against the STUDENT trust set only (§0.1b), with
//     the pubkey→sid binding as the impersonation gate (§0.2) and revocation (§0.3).
//
// Signs with real device WebCrypto keys registered into the two DISJOINT sets.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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

const sid = 'stu-42', item = 'WS-U5L2-reflect1', src = 'frq';

describe('verifyLedgerRow — grades lane now type-gated (§0.1a)', () => {
  let RV, RS, issuerKey;
  async function signedRow(payloadOverrides = {}, rowOverrides = {}) {
    const payload = { v: 1, t: 'ledger', sid, src, i: item, a: 1, e: 'practice', ah: 'abcd1234', ts: 1000, sc: 1, ...payloadOverrides };
    const { receiptId, compact } = await RS.signPayload(issuerKey, payload);
    return { source: src, item_id: item, score: 1, student_id: sid, receipt_id: receiptId, receipt_compact: compact, ...rowOverrides };
  }
  beforeAll(async () => {
    ({ RV, RS } = load());
    const k = await RS.generateKey();
    issuerKey = k.privateKey;
    RV.ISSUERS.push({ name: 'Test Issuer', pubkey: k.publicKeyX, kind: 'desk' });
  });

  it('still accepts a genuine t:ledger grade row', async () => {
    expect(await RV.verifyLedgerRow(await signedRow())).toBe(true);
  });

  it('REJECTS a trusted-issuer receipt of a non-grade type dressed as a grade', async () => {
    // e.g. a review or a future submission receipt harvested and re-stapled as a grade.
    expect(await RV.verifyLedgerRow(await signedRow({ t: 'review' }))).toBe(false);
    expect(await RV.verifyLedgerRow(await signedRow({ t: 'submission' }))).toBe(false);
    expect(await RV.verifyLedgerRow(await signedRow({ t: 'epoch' }))).toBe(false);
  });
});

describe('registerStudentKeys / registerIssuerKeys — disjointness (§0.1c)', () => {
  let RV;
  beforeEach(() => {
    ({ RV } = load());
  });

  it('adds student keys with one-sid-per-pubkey and never un-revokes on refresh (§0.3, §0.5)', () => {
    const r1 = RV.registerStudentKeys([{ pubkey: 'PKA', sid: 'stu-1' }, { pubkey: 'PKB', sid: 'stu-2' }]);
    expect(r1.added).toBe(2);
    // A refresh that flips revoked → stays revoked; a re-bind to another sid is refused.
    const r2 = RV.registerStudentKeys([
      { pubkey: 'PKA', sid: 'stu-1', revoked: true },     // revoke propagates
      { pubkey: 'PKB', sid: 'stu-999' },                  // re-bind attempt → conflict
    ]);
    expect(r2.updated).toBe(1);
    expect(r2.conflicts).toBe(1);
    const a = RV.STUDENT_KEYS.find((k) => k.pubkey === 'PKA');
    const b = RV.STUDENT_KEYS.find((k) => k.pubkey === 'PKB');
    expect(a.revoked).toBe(true);
    expect(b.sid).toBe('stu-2');                          // NOT re-bound
    // A later refresh cannot un-revoke.
    RV.registerStudentKeys([{ pubkey: 'PKA', sid: 'stu-1', revoked: false }]);
    expect(RV.STUDENT_KEYS.find((k) => k.pubkey === 'PKA').revoked).toBe(true);
  });

  it('refuses to add a student key that is already an issuer key, and vice-versa', () => {
    RV.ISSUERS.push({ name: 'Issuer', pubkey: 'SHARED', kind: 'desk' });
    const s = RV.registerStudentKeys([{ pubkey: 'SHARED', sid: 'stu-1' }]);
    expect(s.added).toBe(0);
    expect(s.conflicts).toBe(1);
    RV.registerStudentKeys([{ pubkey: 'STUONLY', sid: 'stu-1' }]);
    const iss = RV.registerIssuerKeys(['STUONLY', 'FRESH'], { name: 'Roster' });
    expect(iss.conflicts).toBe(1);                        // STUONLY refused
    expect(iss.added).toBe(1);                            // FRESH added
    expect(RV.ISSUERS.some((i) => i.pubkey === 'STUONLY')).toBe(false);
  });
});

describe('verifySubmissionRow — submissions lane (§0.1b, §0.2, §0.3)', () => {
  let RV, RS, stuKey, stuPub, issuerKey, issuerPub;

  // A submission row exactly as a student device would build + self-sign it.
  async function signedSub(payloadOverrides = {}, rowOverrides = {}, key = stuKey) {
    const response = payloadOverrides.response !== undefined ? payloadOverrides.response : 'subtract 3 from both sides of the equation';
    const ah = (await RV.sha256HexText(typeof response === 'string' ? response : JSON.stringify(response))).slice(0, 16);
    const payload = { v: 1, t: 'submission', sid, src, i: item, a: 1, e: 'practice', ah, ts: 5000, ...payloadOverrides };
    delete payload.response;
    const { receiptId, compact } = await RS.signPayload(key, payload);
    return { source: src, item_id: item, student_id: sid, response, receipt_id: receiptId, receipt_compact: compact, ...rowOverrides };
  }

  beforeAll(async () => {
    ({ RV, RS } = load());
    const sk = await RS.generateKey();
    stuKey = sk.privateKey; stuPub = sk.publicKeyX;
    const ik = await RS.generateKey();
    issuerKey = ik.privateKey; issuerPub = ik.publicKeyX;
    RV.ISSUERS.push({ name: 'Issuer', pubkey: issuerPub, kind: 'desk' });
    RV.registerStudentKeys([{ pubkey: stuPub, sid }]);
  });

  it('accepts a genuine self-signed submission whose sid matches the registered key', async () => {
    expect(await RV.verifySubmissionRow(await signedSub())).toBe(true);
  });

  it('rejects an impersonation: a submission whose sid ≠ the signing key’s registered sid (§0.2)', async () => {
    // stuKey is registered to `sid`; sign a payload claiming a victim sid + row to match.
    const row = await signedSub({ sid: 'stu-victim' }, { student_id: 'stu-victim' });
    expect(await RV.verifySubmissionRow(row)).toBe(false);
  });

  it('rejects a submission signed by an unregistered student key', async () => {
    const other = await RS.generateKey();
    expect(await RV.verifySubmissionRow(await signedSub({}, {}, other.privateKey))).toBe(false);
  });

  it('rejects a submission signed by a REVOKED key (§0.3)', async () => {
    const rk = await RS.generateKey();
    RV.registerStudentKeys([{ pubkey: rk.publicKeyX, sid }]);
    const good = await signedSub({}, {}, rk.privateKey);
    expect(await RV.verifySubmissionRow(good)).toBe(true);          // works before revoke
    RV.registerStudentKeys([{ pubkey: rk.publicKeyX, sid, revoked: true }]);
    expect(await RV.verifySubmissionRow(good)).toBe(false);         // dead after revoke
  });

  it('rejects tampered response cargo (ah no longer matches the row response)', async () => {
    const row = await signedSub();
    row.response = 'a DIFFERENT answer swapped under the signature';
    expect(await RV.verifySubmissionRow(row)).toBe(false);
  });

  it('rejects a forged item_id / source / receipt_id', async () => {
    expect(await RV.verifySubmissionRow(await signedSub({}, { item_id: 'WS-U9L9-Q9' }))).toBe(false);
    expect(await RV.verifySubmissionRow(await signedSub({}, { source: 'worksheet' }))).toBe(false);
    expect(await RV.verifySubmissionRow(await signedSub({}, { receipt_id: 'deadbeef' }))).toBe(false);
  });

  it('rejects a submission that carries grade fields — it is structurally not a grade (§0.1b)', async () => {
    expect(await RV.verifySubmissionRow(await signedSub({ sc: 1 }))).toBe(false);
    expect(await RV.verifySubmissionRow(await signedSub({ g: 'self' }))).toBe(false);
  });

  it('rejects a t:ledger receipt on the submissions lane (wrong type)', async () => {
    expect(await RV.verifySubmissionRow(await signedSub({ t: 'ledger' }))).toBe(false);
  });

  it('rejects a submission that a trusted ISSUER key signed (lanes never share keys §0.1b)', async () => {
    // Even a valid issuer signature must not validate a submission — the submissions
    // verifier only consults STUDENT_KEYS.
    const row = await signedSub({}, {}, issuerKey);
    expect(await RV.verifySubmissionRow(row)).toBe(false);
  });

  it('rejects a submission row with no student_id', async () => {
    const row = await signedSub();
    delete row.student_id;
    expect(await RV.verifySubmissionRow(row)).toBe(false);
  });
});
