import { issueLedgerReceipt, recordReceiptPersistFailure } from './receipts.js';

let receiptPersistenceNotProvisionedLogged = false;

function rowReceiptArgs(row, username, ts) {
  return {
    studentId: row.student_id,
    username,
    source: row.source,
    itemId: row.item_id,
    score: row.score,
    attempt: row.attempt,
    evidenceTier: row.evidence_tier,
    response: row.response,
    ts
  };
}

function parsedRecordedAt(row) {
  const parsed = Date.parse(row && row.recorded_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

function handleReceiptPersistenceError(err, ledgerId, errors) {
  if (isReceiptPersistenceNotProvisioned(err)) {
    if (!receiptPersistenceNotProvisionedLogged) {
      receiptPersistenceNotProvisionedLogged = true;
      console.info('receipt persistence not provisioned; continuing without stored receipt columns');
    }
    return;
  }

  recordReceiptPersistFailure();
  errors.push({ ledgerId, error: err && err.message ? err.message : String(err || 'Receipt persistence failed') });
}

export async function backfillStudentReceipts(rows, ledgerDb, username) {
  const errors = [];
  let receiptsBackfilled = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      if (!row || row.receipt_compact) continue;

      const issued = issueLedgerReceipt(rowReceiptArgs(row, username, parsedRecordedAt(row)));
      if (!issued) continue;

      row.receipt_id = issued.receiptId;
      row.receipt_compact = issued.compact;
      receiptsBackfilled += 1;

      if (!ledgerDb || typeof ledgerDb.updateLedgerReceipt !== 'function' || !row.ledger_id) continue;

      try {
        const result = await ledgerDb.updateLedgerReceipt(row.ledger_id, {
          receiptId: issued.receiptId,
          receiptCompact: issued.compact
        });
        if (result && result.error) {
          handleReceiptPersistenceError(result.error, row.ledger_id, errors);
        }
      } catch (err) {
        handleReceiptPersistenceError(err, row.ledger_id, errors);
      }
    } catch (err) {
      errors.push({
        ledgerId: row && row.ledger_id,
        itemId: row && row.item_id,
        error: err && err.message ? err.message : String(err || 'Backfill failed')
      });
    }
  }

  return { receiptsBackfilled, errors };
}
