// submissions.js — the offline-grading-mesh hub reconcile (Phase 4).
// OFFLINE_GRADING_MESH_SPEC.md §4, §0.10. Two routes:
//
//   POST /submissions/archive  — a device with internet uploads the raw student
//        SUBMISSIONS it gossiped. The server VERIFIES each self-signed t:'submission'
//        against the student trust set (migration 0027) and archives the valid ones
//        (append-only, idempotent by receipt_id). Forged/tampered rows are rejected.
//   GET  /submissions/archive?section=  — teacher audit of archived raw work.
//
// CRITICAL (§0.10): archiving is DECOUPLED from grading. This NEVER writes item_ledger
// or a score, so the server can never re-grade a submission that already carries a
// teacher grade nor mint a competing score. Teacher-signed GRADES reach the ledger via
// the EXISTING /admin/restore (the teacher device key is a trusted issuer) — unchanged.

import { requireTeacher } from './teacher-auth.js';
import { verifySubmissionRecord } from './snapshot-verify.js';

const MAX_RECORDS = 5000;   // per upload (mirrors ledger-import)

function isArchiveMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  if (['42P01', 'PGRST205'].includes(code)) return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('submission_archive') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'));
}
function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'submission archive not provisioned (run migration 0028)' });
}

// Accept a bundle { submissions:[...] } or a bare array. Each row is the stored
// submission shape { student_id, source, item_id, response, attempt, recorded_at,
// receipt_id, receipt_compact }.
function normalizeBody(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.submissions)) return body.submissions;
  if (body && Array.isArray(body.rows)) return body.rows;
  return [];
}

export function mountSubmissions(app, { db }) {

  // ── POST /submissions/archive ───────────────────────────────────────────────
  // Teacher-gated: only a trusted device uploads (the archive is class-wide). The
  // per-row STUDENT-signature verification is the real integrity gate, but gating the
  // route keeps a random client from probing.
  app.post('/submissions/archive', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (typeof db.listStudentKeys !== 'function' || typeof db.insertSubmissionArchive !== 'function') return notProvisioned(res);

    const rows = normalizeBody(req.body).slice(0, MAX_RECORDS);
    if (!rows.length) return res.status(400).json({ ok: false, error: 'no submissions' });

    // Load the student trust set once (pubkey→sid, revoked).
    let keys;
    try { keys = await db.listStudentKeys(); } catch (e) { keys = { error: e }; }
    if (keys && keys.error) {
      if (isArchiveMissing(keys.error)) return notProvisioned(res);
      console.error('POST /submissions/archive keys error:', keys.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const studentKeys = (keys.data || []).map((k) => ({ pubkey: k.pubkey, sid: k.student_id, revoked: !!k.revoked }));

    let archived = 0, duplicate = 0, rejected = 0;
    for (const row of rows) {
      if (!row || !row.student_id || !row.item_id || !row.source || !row.receipt_compact) { rejected += 1; continue; }
      // studentId in the record must match the signed payload + the signing key's sid.
      const vr = verifySubmissionRecord({
        studentId: row.student_id, itemId: row.item_id, source: row.source,
        response: row.response, receipt_id: row.receipt_id, receipt_compact: row.receipt_compact,
      }, studentKeys);
      if (!vr.ok) { rejected += 1; continue; }
      try {
        const ins = await db.insertSubmissionArchive({
          receiptId: row.receipt_id, studentId: row.student_id, source: row.source, itemId: row.item_id,
          response: row.response, attempt: row.attempt, recordedAt: row.recorded_at, receiptCompact: row.receipt_compact,
        });
        if (ins && ins.error) {
          if (isArchiveMissing(ins.error)) return notProvisioned(res);
          console.error('POST /submissions/archive insert error:', ins.error);
          rejected += 1;
          continue;
        }
        // upsert-ignoreDuplicates returns null data on an ON CONFLICT DO NOTHING —
        // so an honest count distinguishes a NEW archive from an idempotent re-upload.
        if (ins && ins.data) archived += 1; else duplicate += 1;
      } catch (e) {
        if (isArchiveMissing(e)) return notProvisioned(res);
        rejected += 1;
      }
    }
    return res.json({ ok: true, archived, duplicate, rejected, received: rows.length });
  });

  // ── GET /submissions/archive?section= (teacher audit) ───────────────────────
  app.get('/submissions/archive', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (typeof db.listRoster !== 'function' || typeof db.listSubmissionArchive !== 'function') return notProvisioned(res);

    const section = (req.query.section && String(req.query.section).trim()) || null;
    let rosterRes;
    try { rosterRes = await db.listRoster(section); } catch (e) { rosterRes = { error: e }; }
    if (rosterRes && rosterRes.error) {
      console.error('GET /submissions/archive roster error:', rosterRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const studentIds = (Array.isArray(rosterRes.data) ? rosterRes.data : [])
      .filter((r) => r && r.student_id && r.role !== 'teacher').map((r) => r.student_id);

    let arch;
    try { arch = await db.listSubmissionArchive(studentIds); } catch (e) { arch = { error: e }; }
    if (arch && arch.error) {
      if (isArchiveMissing(arch.error)) return notProvisioned(res);
      console.error('GET /submissions/archive list error:', arch.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({ ok: true, submissions: arch.data || [] });
  });
}
