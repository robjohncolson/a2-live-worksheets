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
  const { requestId, clientTimestamp, ...academic } = response || {};
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
    const hash = createHash('sha256').update(JSON.stringify(row.response)).digest('hex').slice(0, 16);
    return payload.sid === row.student_id && payload.src === row.source && payload.i === row.item_id
      && payload.a === row.attempt && (payload.sc ?? null) === (row.score == null ? null : Number(row.score)) && payload.ah === hash;
  } catch { return false; }
}

export async function repairScoreReceipt(ledgerDb, row, username) {
  if (receiptMatchesRow(row)) return row.receipt_compact;
  const receipt = issueLedgerReceipt({ studentId: row.student_id, username, source: row.source,
    itemId: row.item_id, score: row.score, response: row.response, attempt: row.attempt,
    evidenceTier: row.evidence_tier || 'practice', ts: Date.parse(row.recorded_at), nonce: 'a2-score' });
  if (receipt && ledgerDb.updateLedgerReceipt) {
    const saved = await ledgerDb.updateLedgerReceipt(row.ledger_id,
      { receiptId: receipt.receiptId, receiptCompact: receipt.compact });
    if (saved?.error) throw scoreWriteError(saved.error);
  }
  return receipt?.compact || null;
}

export function validateClientTimestamp(timestamp) {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw Object.assign(new Error('A positive client timestamp is required'), { status: 400 });
  }
}

// Caller holds serializeStudent across reading, deciding, and writing.
export async function saveTeacherScore(ledgerDb, existing, input, clientTimestamp) {
  if (input.source !== 'lesson-check') validateClientTimestamp(clientTimestamp);
  const storedTimestamp = existing?.response?.clientTimestamp || 0;
  const superseded = !!existing && (clientTimestamp || 0) < storedTimestamp;
  const duplicate = !!existing && (clientTimestamp != null && clientTimestamp === storedTimestamp
    || input.response.requestId && input.response.requestId === existing.response?.requestId);
  const unchanged = !!existing && (existing.score == null ? null : Number(existing.score)) === input.score
    && isDeepStrictEqual(academicResponse(existing.response), academicResponse(input.response));
  if (superseded || duplicate || unchanged) {
    const receipt = superseded ? existing.receipt_compact : await repairScoreReceipt(ledgerDb, existing, input.username);
    return { row: existing, receipt, superseded, duplicate, unchanged: true };
  }
  const response = storageResponse({ ...input.response, ...(clientTimestamp != null ? { clientTimestamp } : {}) });
  const recordedAt = new Date().toISOString();
  const receipt = issueLedgerReceipt({ ...input, response, ts: Date.parse(recordedAt), nonce: 'a2-score' });
  const saved = await ledgerDb.insertLedgerRow({ ...input, response, recordedAt,
    receiptId: receipt?.receiptId || null, receiptCompact: receipt?.compact || null });
  if (saved.error) throw scoreWriteError(saved.error);
  return { row: { ...saved.data, score: input.score, attempt: input.attempt }, receipt, unchanged: false };
}
