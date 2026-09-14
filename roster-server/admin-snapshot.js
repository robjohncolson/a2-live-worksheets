// admin-snapshot.js — GET /admin/snapshot (teacher-gated): emit the ENTIRE signed
// ledger plus each student's commit-chain `head`, in the apstats-offline-export/v1
// bundle shape so /ledger/import can replay it verbatim. Read-only. A daily git
// pull of this (the "mirror") is what makes the gradebook survive Supabase loss.
//
// The chain you already build (signed blobs -> session commits chained by prev ->
// transcript roots) proves INTEGRITY but is recomputed from a Supabase-only
// item_ledger, so it doesn't survive Supabase vanishing. This endpoint is the
// replication source; issueEpochReceipt seals the whole class each day (the anchor).
//
// No new migration. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import { requireTeacher } from './teacher-auth.js';
import { buildCommits } from './commits.js';
import { getReceiptIssuer, issueEpochReceipt } from './receipts.js';
import { todayInTz } from './lesson-grade.js';

export const SNAPSHOT_SCHEMA = 'apstats-ledger-snapshot/v1';
export const BUNDLE_SCHEMA = 'apstats-offline-export/v1';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

// Order-independent root over receipt ids (mirrors transcript.js receiptRoot and
// commits.js commitRoot). Null on no ids or duplicate ids.
export function receiptRootOf(ids) {
  if (!ids.length) return null;
  if (new Set(ids).size !== ids.length) return null;
  return sha256Hex(ids.slice().sort().join('\n'));
}

// One ledger DB row (snake_case) -> an /ledger/import-compatible record (camelCase
// itemId), carrying its ORIGINAL receipt so the mirror is self-verifying on its own.
export function rowToRecord(row, sid) {
  return {
    studentId: row.student_id || sid,
    source: row.source,
    itemId: row.item_id,
    unit: row.unit ?? undefined,
    topic: row.topic ?? undefined,
    skill: row.skill ?? undefined,
    response: row.response,
    score: row.score ?? null,
    frq_result: row.frq_result ?? null,
    attempt: row.attempt ?? 1,
    recorded_at: row.recorded_at,
    receipt_id: row.receipt_id || undefined,
    receipt_compact: row.receipt_compact || undefined
  };
}

// commits.js wants [{id,compact,i,src,sc,ts}] from receipt-bearing rows only
// (mirrors GET /commits exactly, so the recomputed head matches that endpoint's).
function commitInputs(rows) {
  return rows
    .filter((x) => x.receipt_id && x.receipt_compact)
    .map((x) => ({
      id: x.receipt_id,
      compact: x.receipt_compact,
      i: x.item_id,
      src: x.source,
      sc: x.score,
      ts: Date.parse(x.recorded_at) || 0
    }));
}

// One review_marks DB row (snake_case) → a self-verifying snapshot record (carries its
// ORIGINAL signed receipt so the mirror verifies + restores reviews on its own).
export function reviewToRecord(mark) {
  return {
    ledgerId: mark.ledger_id,
    studentId: mark.student_id,
    teacher: mark.teacher_username ?? undefined,
    seenAt: mark.seen_at,
    comment: mark.comment ?? null,
    receipt_id: mark.receipt_id || undefined,
    receipt_compact: mark.receipt_compact || undefined
  };
}

// Build one student's snapshot entry (pure): roster row + their ledger rows in.
// reviewMarks (optional) are the student's review_marks rows — carried so reviews
// are backed up + restorable (NIGHTLY_REVIEW_SPEC §8); absent → an empty reviews list.
export function buildStudentEntry(rosterRow, ledgerRows, reviewMarks) {
  const sid = rosterRow.student_id;
  const username = rosterRow.login_username || undefined;
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const records = rows.map((r) => rowToRecord(r, sid));
  const reviews = (Array.isArray(reviewMarks) ? reviewMarks : []).map(reviewToRecord);
  const { head } = buildCommits(commitInputs(rows), { sid, u: username });
  const transcriptRoot = receiptRootOf(rows.filter((r) => r.receipt_id).map((r) => r.receipt_id));
  let lastActivityAt = null;
  for (const r of rows) {
    if (r.recorded_at && (!lastActivityAt || r.recorded_at > lastActivityAt)) lastActivityAt = r.recorded_at;
  }
  return {
    studentId: sid,
    username,
    realName: rosterRow.real_name ?? null,
    section: rosterRow.section ?? null,
    recordCount: records.length,
    reviewCount: reviews.length,
    lastActivityAt,
    commitsHead: head || null,
    transcriptRoot,
    bundle: {
      schema: BUNDLE_SCHEMA,
      student: { studentId: sid, username },
      records,
      reviews
    }
  };
}

// Order-independent root over per-student heads ("sid:head" lines; null head -> "-").
export function epochRoot(heads) {
  const lines = Object.keys(heads).sort().map((sid) => `${sid}:${heads[sid] || '-'}`);
  return sha256Hex(lines.join('\n'));
}

// Build + sign the day's epoch anchor over the student entries (issuer must be on
// for receipt_compact to be non-null; the root is computed regardless).
export function buildEpoch(students, { asOfDateNY, prev = null, asOf = Date.now() }) {
  const heads = {};
  for (const s of students) heads[s.studentId] = s.commitsHead || null;
  const root = epochRoot(heads);
  const receipt = issueEpochReceipt({ asOf, asOfDateNY, cnt: students.length, root, prev: prev || undefined });
  return {
    asOfDateNY,
    cnt: students.length,
    heads,
    root,
    prev: prev || null,
    receipt_compact: receipt ? receipt.compact : null
  };
}

export function mountAdminSnapshot(app, { db, ledgerDb, schoolTz = 'America/New_York' }) {
  app.get('/admin/snapshot', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    try {
      const section = req.query.section || null;
      const { data: rosterData, error: rosterErr } = await db.listRoster(section, { includeArchived: true });
      if (rosterErr) {
        console.error('GET /admin/snapshot roster error:', rosterErr);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      // Students only (a teacher account is not a gradebook row).
      const rosterRows = (Array.isArray(rosterData) ? rosterData : [])
        .filter((r) => r && r.student_id && r.role !== 'teacher');

      // Fan out one ledger read per student; one bad student must not 500 the whole
      // backup (mirrors class.js fanLedger resilience).
      const students = [];
      for (const r of rosterRows) {
        let ledgerRows = [];
        try {
          const { data, error } = await ledgerDb.getLedgerByStudent(r.student_id);
          ledgerRows = error ? [] : (Array.isArray(data) ? data : []);
        } catch (_) { ledgerRows = []; }
        // Reviews ride the same backup (NIGHTLY_REVIEW_SPEC §8). Best-effort: a missing
        // review_marks table (pre-migration-0025) or a DB hiccup just yields no reviews.
        let reviewMarks = [];
        try {
          if (db && typeof db.listReviewMarksByStudent === 'function') {
            const { data, error } = await db.listReviewMarksByStudent(r.student_id);
            reviewMarks = error ? [] : (Array.isArray(data) ? data : []);
          }
        } catch (_) { reviewMarks = []; }
        students.push(buildStudentEntry(r, ledgerRows, reviewMarks));
      }

      const asOf = Date.now();
      const asOfDateNY = todayInTz(schoolTz, asOf);
      // The mirror passes yesterday's epoch root via ?prev= to chain day-over-day.
      const prev = (typeof req.query.prev === 'string' && req.query.prev) ? req.query.prev : null;
      const epoch = buildEpoch(students, { asOfDateNY, prev, asOf });

      return res.json({
        schema: SNAPSHOT_SCHEMA,
        generatedAt: asOf,
        asOfDateNY,
        section,
        issuer: getReceiptIssuer(),
        students,
        epoch
      });
    } catch (err) {
      console.error('GET /admin/snapshot error:', err);
      return res.status(500).json({ ok: false, error: 'Snapshot unavailable' });
    }
  });
}
