// snapshot-verify.test.js — the zero-trust verifier catches the tamper cases that
// matter for a grade mirror: a flipped score, a dropped record, a corrupted anchor,
// and a forged signature. Builds a real signed snapshot via the admin-snapshot pure
// builders (issuer enabled), then mutates clones. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initReceipts, issueLedgerReceipt, getReceiptIssuer } from '../receipts.js';
import { buildStudentEntry, buildEpoch } from '../admin-snapshot.js';
import { verifySnapshot } from '../snapshot-verify.js';

const KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';
// A DIFFERENT issuer key, for the "forged receipt" case.
const OTHER_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';

let TS = 1_700_000_000_000;
function mintRow(sid, itemId, { score = 1, response = 'A' } = {}) {
  TS += 60_000;
  const r = issueLedgerReceipt({ studentId: sid, source: 'worksheet', itemId, score, attempt: 1, evidenceTier: 'practice', response });
  return {
    student_id: sid, source: 'worksheet', item_id: itemId, response, score, attempt: 1,
    evidence_tier: 'practice', recorded_at: new Date(TS).toISOString(),
    receipt_id: r.receiptId, receipt_compact: r.compact
  };
}

function freshSnapshot() {
  const roster1 = { student_id: 'sid-1', login_username: 'amy', section: 'P1', role: 'student' };
  const roster2 = { student_id: 'sid-2', login_username: 'ben', section: 'P1', role: 'student' };
  const e1 = buildStudentEntry(roster1, [mintRow('sid-1', 'WS-U1L1-Q1'), mintRow('sid-1', 'WS-U1L1-Q2', { score: 0.5 })]);
  const e2 = buildStudentEntry(roster2, [mintRow('sid-2', 'WS-U1L1-Q1', { score: 0 })]);
  const students = [e1, e2];
  const epoch = buildEpoch(students, { asOfDateNY: '2026-06-29' });
  return { schema: 'apstats-ledger-snapshot/v1', asOfDateNY: '2026-06-29', issuer: getReceiptIssuer(), students, epoch };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

beforeEach(() => { process.env.RECEIPT_ISSUER_PRIVATE_KEY = KEY; initReceipts(); });
afterEach(() => { delete process.env.RECEIPT_ISSUER_PRIVATE_KEY; initReceipts(); });

describe('verifySnapshot', () => {
  it('passes a clean snapshot (every signature, head, and the epoch anchor)', () => {
    const r = verifySnapshot(freshSnapshot());
    expect(r.ok).toBe(true);
    expect(r.totals.records).toBe(3);
    expect(r.totals.verifiedReceipts).toBe(3);
    expect(r.epochOk).toBe(true);
    expect(r.breaks).toHaveLength(0);
  });

  it('requires an issuer pubkey', () => {
    const s = freshSnapshot();
    delete s.issuer;
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/pubkey/);
  });

  it('catches a flipped score (signature still valid, binding broken)', () => {
    const s = clone(freshSnapshot());
    s.students[0].bundle.records[1].score = 1; // Q2 was signed at 0.5 -> tampered to 1
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.breaks.some((b) => b.kind === 'score-tampered')).toBe(true);
  });

  it('catches a forged attempt (signature valid, attempt binding broken)', () => {
    // Mirror of the score-tamper: latestPerItem picks the highest attempt, so an unbound
    // attempt let a tampered backup replay a signed score under a forged attempt.
    const s = clone(freshSnapshot());
    s.students[0].bundle.records[1].attempt = 99; // signed a=1 -> forged to 99
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.breaks.some((b) => b.kind === 'attempt-tampered')).toBe(true);
  });

  it('catches a flipped primitive response via the answer-hash bind', () => {
    const s = clone(freshSnapshot());
    s.students[0].bundle.records[0].response = 'B'; // signed ah was for 'A'
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.breaks.some((b) => b.kind === 'response-tampered')).toBe(true);
  });

  it('catches a dropped record (head + epoch anchor no longer recompute)', () => {
    const s = clone(freshSnapshot());
    s.students[0].bundle.records.pop();
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.breaks.some((b) => b.kind === 'head-mismatch')).toBe(true);
    expect(r.epochOk).toBe(false);
  });

  it('catches a corrupted epoch root', () => {
    const s = clone(freshSnapshot());
    s.epoch.root = 'f'.repeat(64);
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.epochOk).toBe(false);
    expect(r.breaks.some((b) => b.kind.startsWith('epoch-'))).toBe(true);
  });

  it('catches a receipt forged by a different key', () => {
    // Re-sign one record's receipt with OTHER_KEY; it will fail against the snapshot issuer.
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = OTHER_KEY; initReceipts();
    const forged = issueLedgerReceipt({ studentId: 'sid-1', source: 'worksheet', itemId: 'WS-U1L1-Q1', score: 1, attempt: 1, evidenceTier: 'practice', response: 'A' });
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = KEY; initReceipts();

    const s = clone(freshSnapshot());
    s.students[0].bundle.records[0].receipt_compact = forged.compact;
    const r = verifySnapshot(s);
    expect(r.ok).toBe(false);
    expect(r.breaks.some((b) => b.kind === 'bad-signature')).toBe(true);
  });
});
