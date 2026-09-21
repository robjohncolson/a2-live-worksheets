import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { issueLedgerReceipt } from './receipts.js';

const stores = new WeakMap();

// One roster process serves both entry and imports. Scope locks to its database.
export async function serializeStudent(ledgerDb, studentId, action) {
  if (!stores.has(ledgerDb)) stores.set(ledgerDb, new Map());
  const locks = stores.get(ledgerDb);
  const next = (locks.get(studentId) || Promise.resolve()).catch(() => {}).then(action);
  locks.set(studentId, next);
  try { return await next; }
  finally { if (locks.get(studentId) === next) locks.delete(studentId); }
}

export function migrationError(error) {
  const message = String(error?.message || '');
  return ['42P01', 'PGRST205'].includes(error?.code) && message.includes('a2_tryit_assignments')
    || error?.code === '23514' && message.includes('item_ledger_source_check');
}

export function scoreWriteError(error) {
  if (migrationError(error)) return Object.assign(new Error(
    'Run migration 0040_a2_teacher_entry.sql (or the A2 bootstrap) in Supabase before saving scores.'), { status: 503 });
  return error;
}

function academicResponse(response) {
  const { requestId, clientTimestamp, version, receiptResponse, ...academic } = response || {};
  return academic;
}

// Match jsonb object key order before signing, so a database round trip does
// not turn an unchanged response into a different receipt hash.
function storageResponse(value) {
  if (Array.isArray(value)) return value.map(storageResponse);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b)
    || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return Object.fromEntries(keys.map(key => [key, storageResponse(value[key])]));
}

export function receiptMatchesRow(row) {
  try {
    const payload = JSON.parse(Buffer.from(row.receipt_compact.split('.')[0], 'base64url'));
    const signedResponse = row.response?.receiptResponse;
    if (signedResponse && !isDeepStrictEqual(academicResponse(signedResponse), academicResponse(row.response))) return false;
    const hash = createHash('sha256').update(JSON.stringify(signedResponse || row.response)).digest('hex').slice(0, 16);
    return payload.sid === row.student_id && payload.src === row.source && payload.i === row.item_id
      && payload.a === row.attempt && (payload.sc ?? null) === (row.score == null ? null : Number(row.score)) && payload.ah === hash;
  } catch { return false; }
}

export async function repairScoreReceipt(ledgerDb, row, username) {
  if (receiptMatchesRow(row)) return row.receipt_compact;
  const receipt = issueLedgerReceipt({ studentId: row.student_id, username, source: row.source,
    itemId: row.item_id, score: row.score, response: row.response?.receiptResponse || row.response, attempt: row.attempt,
    evidenceTier: row.evidence_tier || 'practice', ts: Date.parse(row.recorded_at), nonce: 'a2-score' });
  if (receipt && ledgerDb.updateLedgerReceipt) {
    const saved = await ledgerDb.updateLedgerReceipt(row.ledger_id,
      { receiptId: receipt.receiptId, receiptCompact: receipt.compact });
    if (saved?.error) throw scoreWriteError(saved.error);
    row.receipt_id = receipt.receiptId;
    row.receipt_compact = receipt.compact;
  }
  return receipt?.compact || null;
}

export function checkScoreVersion(existing, requestId, expectedVersion) {
  if (existing && requestId && existing.response?.requestId === requestId) return;
  const version = existing?.response?.version || 0;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== version) {
    throw Object.assign(new Error('score-changed'), { status: 409,
      current: { score: existing?.score ?? null, version, requestId: existing?.response?.requestId } });
  }
}

export function checkStoredScore(row, score) {
  if ((row.score == null ? null : Number(row.score)) === score) return;
  throw Object.assign(new Error('Correction did not take effect. Run migration 0040_a2_teacher_entry.sql in Supabase.'),
    { status: 503, current: { score: row.score, version: row.response?.version || 0 } });
}

// Caller holds serializeStudent across reading, deciding, and writing.
export async function saveTeacherScore(ledgerDb, existing, input, expectedVersion) {
  const versioned = input.source !== 'lesson-check';
  if (versioned) checkScoreVersion(existing, input.response.requestId, expectedVersion);
  const duplicate = !!existing && input.response.requestId && input.response.requestId === existing.response?.requestId;
  if (duplicate) {
    checkStoredScore(existing, input.score);
    return { row: existing, receipt: await repairScoreReceipt(ledgerDb, existing, input.username), duplicate: true, unchanged: true };
  }
  const unchanged = !!existing && (existing.score == null ? null : Number(existing.score)) === input.score
    && isDeepStrictEqual(academicResponse(existing.response), academicResponse(input.response));
  const version = (existing?.response?.version || 0) + 1;
  let response = storageResponse({ ...academicResponse(input.response), requestId: input.response.requestId,
    ...(versioned ? { version } : {}) });
  let receiptCompact = null, receiptId = null;
  if (unchanged) {
    receiptCompact = await repairScoreReceipt(ledgerDb, existing, input.username);
    receiptId = existing.receipt_id;
    // Preserve the exact signed response while advancing transport metadata.
    response = storageResponse({ ...response, receiptResponse: existing.response.receiptResponse || existing.response });
  }
  const recordedAt = unchanged ? existing.recorded_at : new Date().toISOString();
  const saved = await ledgerDb.insertLedgerRow({ ...input, response, recordedAt, receiptId, receiptCompact });
  if (saved.error) throw scoreWriteError(saved.error);
  const row = { student_id: input.studentId, source: input.source, item_id: input.itemId,
    attempt: input.attempt, response, recorded_at: recordedAt, evidence_tier: input.evidenceTier,
    receipt_id: receiptId, receipt_compact: receiptCompact, ...saved.data };
  const receipt = await repairScoreReceipt(ledgerDb, row, input.username);
  checkStoredScore(row, input.score);
  return { row, receipt, unchanged };
}
