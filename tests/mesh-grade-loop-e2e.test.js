// mesh-grade-loop-e2e.test.js — the retained academic receipt loop end-to-end
// with REAL crypto: a student submission → the grader builds grade fields → the
// TEACHER key signs a t:'ledger' grade carrying `sub` → verifyLedgerRow ACCEPTS it on
// the grades lane → SubmissionStore.coveredKeys reads `sub` → the submission is
// SUPPRESSED (§0.7). Proves the whole loop's signing + suppression contract holds.
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, self: win, crypto: webcrypto,
    atob, btoa, Buffer, escape, unescape, decodeURIComponent,
    TextEncoder, TextDecoder, Uint8Array, Map, Array, Object, String, Number, Math, JSON,
    Promise, isFinite, Infinity, parseInt, Date, console, URLSearchParams,
    location: { search: '', hash: '' },
  });
  for (const f of ['receipt-verify.js', 'receipt-sign.js', 'submission-store.js', 'submission-capture.js', 'submission-grader.js']) {
    runInContext(readFileSync(resolve(repo, f), 'utf8'), ctx);
  }
  return win;
}

describe('Academic receipt grade loop — sign an auto-grade → verify → suppress', () => {
  let win, RS, RV, SC, SG, Store;
  let teacherKey, teacherPub, studentKey, studentPub;
  const sid = 'stu-1';

  beforeAll(async () => {
    win = load();
    RS = win.ReceiptSign; RV = win.ReceiptVerify; SC = win.SubmissionCapture;
    SG = win.SubmissionGrader; Store = win.SubmissionStore;
    // Teacher key = a trusted ISSUER (grades lane). Student key = the submissions lane.
    const t = await RS.generateKey(); teacherKey = t.privateKey; teacherPub = t.publicKeyX;
    RV.registerIssuerKeys([teacherPub], { name: 'Teacher device', kind: 'desk' });
    const s = await RS.generateKey(); studentKey = s.privateKey; studentPub = s.publicKeyX;
    RV.registerStudentKeys([{ pubkey: studentPub, sid }]);
  });

  it('a teacher-signed grade carrying sub verifies AND suppresses its submission', async () => {
    // Inline WS IDs and answers are synthetic protocol fixtures, not authored content.
    // 1. Student self-signs and stores a worksheet submission.
    const submission = await SC.signOne(studentKey, {
      sid, source: 'worksheet', itemId: 'WS-U1L1-Q1', response: '4', attempt: 1,
    }, { receiptSign: RS, store: Store, now: 1000 });
    expect(await RV.verifySubmissionRow(submission)).toBe(true);
    expect(await Store.all()).toEqual([submission]);

    // 2. Teacher device auto-grades it against the inline answer key.
    const inputs = { worksheetKey: { worksheetKey: { 'WS-U1L1-Q1': '4|four' } } };
    const score = SG.autoScore(submission, inputs);
    expect(score).toBe(1);

    // 3. Build grade fields (sub = submission.receipt_id, deterministic ts/n, kv) + sign with the TEACHER key.
    const fields = SG.buildGradeFields(submission, { score, keyVersion: 'kv-2026-06', existingAttempts: [] });
    expect(fields.sub).toBe(submission.receipt_id);
    const signed = await RS.signLedgerReceipt(teacherKey, fields);
    const gradeRow = {
      student_id: sid, source: 'worksheet', item_id: 'WS-U1L1-Q1', score,
      attempt: fields.a, recorded_at: new Date(fields.ts).toISOString(),
      receipt_id: signed.receiptId, receipt_compact: signed.compact,
    };

    // 4. The grade verifies on the GRADES lane (t:'ledger', teacher issuer, fields bound).
    expect(await RV.verifyLedgerRow(gradeRow)).toBe(true);
    // and the signed payload actually carries sub + kv.
    expect(signed.payload.sub).toBe(submission.receipt_id);
    expect(signed.payload.kv).toBe('kv-2026-06');

    // 5. §0.7: coveredKeys reads sub from the grade → the submission is now covered.
    const covered = Store.coveredKeys([gradeRow]);
    expect(covered[submission.receipt_id]).toBe(sid);
    expect(Store.isCovered(submission, covered)).toBe(true);

    // 6. Re-grading the SAME submission is byte-identical (§0.8 dedup).
    const signed2 = await RS.signLedgerReceipt(teacherKey, SG.buildGradeFields(submission, { score, keyVersion: 'kv-2026-06', existingAttempts: [] }));
    expect(signed2.receiptId).toBe(signed.receiptId);
    expect(signed2.compact).toBe(signed.compact);
  });

  it('the grade cannot be forged: a student key cannot sign a grade the grades lane accepts', async () => {
    const submission = await SC.signOne(studentKey, {
      sid, source: 'worksheet', itemId: 'WS-U1L1-Q2', response: '0', attempt: 1,
    }, { receiptSign: RS, store: Store, now: 2000 });
    const fields = SG.buildGradeFields(submission, { score: 1, existingAttempts: [] });
    // Sign the grade with the STUDENT key instead of the teacher key.
    const forged = await RS.signLedgerReceipt(studentKey, fields);
    const forgedRow = {
      student_id: sid, source: 'worksheet', item_id: 'WS-U1L1-Q2', score: 1,
      attempt: fields.a, recorded_at: new Date(fields.ts).toISOString(),
      receipt_id: forged.receiptId, receipt_compact: forged.compact,
    };
    // The student key isn't a trusted ISSUER → the grades lane rejects it.
    expect(await RV.verifyLedgerRow(forgedRow)).toBe(false);
  });
});
