// teacher-app-offline.test.js — pins the teacher-app.html offline grade loop wiring
// (offline-grading mesh Phase 3b). Source-level structure guards (the loop is
// runtime-only in the APK; the grading MATH is unit-tested in submission-grader.test.js).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teacher-app.html'), 'utf8');

describe('teacher-app — offline grade loop wiring', () => {
  it('loads the mesh scripts the offline loop needs', () => {
    for (const s of ['student-key.js', 'ledger-store.js', 'submission-store.js', 'ledger-gossip.js', 'grade-engine.bundle.js', 'submission-grader.js']) {
      expect(APP, `missing <script src="${s}">`).toContain(`src="${s}"`);
    }
  });

  it('has the Offline grading card + its three buttons', () => {
    expect(APP).toContain('id="offline-card"');
    expect(APP).toContain('id="btn-offline-sync"');
    expect(APP).toContain('id="btn-offline-grade"');
    expect(APP).toContain('id="btn-offline-push"');
    expect(APP).toContain('setSection(\'offline-card\', true)');
  });

  it('fetches the TEACHER full key (not the redacted student one) and caches it', () => {
    expect(APP).toContain("fetch(base + '/grade/answer-key'");
    expect(APP).toContain('x-teacher-secret');
    expect(APP).toContain('a2_teacher_fullkey_v1');
  });

  it('auto-grades via planAutoGrades (max-score + never-downgrade) and signs with sub', () => {
    expect(APP).toContain('SubmissionGrader.planAutoGrades');
    expect(APP).toContain('SubmissionGrader.buildGradeFields');
    expect(APP).toContain('ReceiptSign.signLedgerReceipt');
    // never emit a grade that doesn't verify on the grades lane
    expect(APP).toContain('_verifyGrade(row)');
  });

  it('assigns the attempt from existing grades (§0.4) and skips already-graded FRQs (§0.7)', () => {
    // the teacher-assigned attempt uses the existing GRADE attempts, not the submission's
    expect(APP).toContain('existingAttempts: attemptsByKey[akey]');
    expect(APP).toContain('_signAndEmit(autoPlans, keyPack, attemptsByKey)');
    // the FRQ queue excludes submissions already covered by a grade (no silent re-downgrade)
    expect(APP).toContain('_pendingOfflineFrqs(subs, covered)');
    expect(APP).toContain('SubmissionStore.isCovered(s, covered)');
  });

  it('verifies submissions on the STUDENT trust set before grading', () => {
    expect(APP).toContain('ReceiptVerify.verifySubmissionRow');
    expect(APP).toContain('StudentKey.syncTrustSet');
  });

  it('runs a two-lane Nearby round with the flood cap on the subs lane', () => {
    expect(APP).toContain('LedgerGossip.runLanes');
    expect(APP).toContain("lane: 'grades'");
    expect(APP).toContain("lane: 'subs'");
    expect(APP).toContain('SubmissionStore.floodCapVerify(SubmissionStore.suppressingVerify');
  });

  it('best-effort archives verified submissions to the server (Phase 4 durability, decoupled from grading)', () => {
    expect(APP).toContain('function _archiveSubmissions');
    expect(APP).toContain("'/submissions/archive'");
    expect(APP).toContain('_archiveSubmissions(subs)');
  });
});
