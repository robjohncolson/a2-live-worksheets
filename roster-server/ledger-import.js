// ledger-import.js — POST /ledger/import: teacher-gated batch import of
// offline-captured work. This is the server side of the
// "do work offline -> email me a file -> I import it" loop (OFFLINE_MODE_SPEC §4.D).
//
// Reuses ledgerDb.insertLedgerRow, which upserts on
// (student_id, source, item_id, attempt) — so re-importing the SAME bundle is
// idempotent (no duplicate rows). Imported work is tagged evidence_tier='practice'
// (it is self-reported on a disconnected device; it is NEVER 'proctored').
//
// No new migration: it writes the same item_ledger as /ledger/record.

import { requireTeacher } from './teacher-auth.js';
import { issueLedgerReceipt, recordReceiptPersistFailure } from './receipts.js';

const MAX_RECORDS = 5000; // sane ceiling for one import call

// The source CHECK rejects a value whose migration hasn't run (mirrors ledger.js).
function isSourceNotProvisioned(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '23514') return true; // check_violation
  return msg.includes('item_ledger_source_check');
}

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

// Flatten the accepted body shapes into one flat record list.
// Accepts: a single export bundle { student:{studentId}, records:[...] },
//          { bundles:[ bundle, ... ] }, or a bare array of records.
// A record inherits its enclosing bundle's studentId if it doesn't carry its own.
export function normalizeImportBody(body) {
  const out = [];
  const pushBundle = (b) => {
    if (!b || typeof b !== 'object') return;
    const sid = b.student && b.student.studentId;
    const recs = Array.isArray(b.records) ? b.records : [];
    for (const r of recs) {
      if (r && typeof r === 'object') out.push({ ...r, studentId: r.studentId || sid });
    }
  };
  if (Array.isArray(body)) {
    for (const r of body) { if (r && typeof r === 'object') out.push({ ...r }); }
  } else if (body && Array.isArray(body.bundles)) {
    for (const b of body.bundles) pushBundle(b);
  } else if (body && Array.isArray(body.records)) {
    pushBundle(body);
  }
  return out;
}

export function validateImportRecord(rec) {
  if (!rec || typeof rec !== 'object') return { ok: false, reason: 'not an object' };
  if (!rec.studentId || typeof rec.studentId !== 'string') return { ok: false, reason: 'missing studentId' };
  if (!rec.source || typeof rec.source !== 'string') return { ok: false, reason: 'missing source' };
  if (!rec.itemId || typeof rec.itemId !== 'string') return { ok: false, reason: 'missing itemId' };
  if (rec.response === undefined) return { ok: false, reason: 'missing response' };
  if (rec.score !== undefined && rec.score !== null) {
    const s = Number(rec.score);
    if (!Number.isFinite(s) || s < 0 || s > 1) return { ok: false, reason: 'score out of range' };
  }
  return { ok: true };
}

export function mountLedgerImport(app, { db, ledgerDb, resolveUsername }) {
  app.post('/ledger/import', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'teacher only' });
    }

    const records = normalizeImportBody(req.body);
    if (!records.length) {
      return res.status(400).json({ ok: false, error: 'no records to import' });
    }
    if (records.length > MAX_RECORDS) {
      return res.status(413).json({ ok: false, error: `too many records (max ${MAX_RECORDS})` });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];
    let provisioningWarning = false;

    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];
      const v = validateImportRecord(rec);
      if (!v.ok) { skipped += 1; errors.push({ index: i, reason: v.reason }); continue; }

      const score = (rec.score === undefined ? null : rec.score);
      const attempt = rec.attempt ?? 1;

      const { data, error } = await ledgerDb.insertLedgerRow({
        studentId: rec.studentId,
        source: rec.source,
        itemId: rec.itemId,
        unit: rec.unit,
        topic: rec.topic,
        skill: rec.skill,
        response: rec.response,
        score,
        evidenceTier: 'practice', // offline = self-reported, never proctored
        attempt,
      });

      if (error) {
        skipped += 1;
        if (isSourceNotProvisioned(error)) {
          provisioningWarning = true;
          errors.push({ index: i, reason: `source '${rec.source}' not provisioned (run its item_ledger migration)` });
        } else {
          console.error('Import insert error:', error);
          errors.push({ index: i, reason: 'database error' });
        }
        continue;
      }
      imported += 1;

      // Best-effort: re-issue + persist a server receipt so imported rows match
      // the /ledger/record contract (a verifiable chain). Never fails the import.
      try {
        let username;
        if (typeof resolveUsername === 'function') {
          try { username = await resolveUsername(rec.studentId); } catch (_) { username = undefined; }
        }
        const receipt = issueLedgerReceipt({
          studentId: rec.studentId,
          username,
          source: rec.source,
          itemId: rec.itemId,
          score,
          attempt,
          evidenceTier: data.evidence_tier,
          response: rec.response,
          gradingProvenance: 'offline-import',
        });
        if (receipt && data.ledger_id && ledgerDb && typeof ledgerDb.updateLedgerReceipt === 'function') {
          const pr = await ledgerDb.updateLedgerReceipt(data.ledger_id, {
            receiptId: receipt.receiptId,
            receiptCompact: receipt.compact,
          });
          if (pr && pr.error && !isReceiptPersistenceNotProvisioned(pr.error)) recordReceiptPersistFailure();
        }
      } catch (_) { /* best-effort */ }
    }

    return res.json({ ok: true, total: records.length, imported, skipped, errors, ...(provisioningWarning ? { provisioningWarning: true } : {}) });
  });
}
