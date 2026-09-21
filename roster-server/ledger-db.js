// ledger-db.js — data-access wrapper for item_ledger around @supabase/supabase-js
// Injectable for tests: call createLedgerDb(supabaseClient) with a real or fake client.
// server.js calls createLiveLedgerDb() to get the production instance.

import { createClient } from '@supabase/supabase-js';
import { stableLedgerSort } from './scoring.js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveLedgerDb() {
  return createLedgerDb(createServiceClient());
}

// Raw service-role Supabase client from env. Lets out-of-repo tools (e.g. the
// scripts/ ingestion job) reuse roster-server's @supabase install instead of
// importing the dependency from a path where it isn't resolvable.
export function createServiceClient() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  return createClient(url, key, { db: { schema: process.env.ROSTER_DB_SCHEMA || 'a2' } });
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createLedgerDb(client) {
  return { insertLedgerRow, updateLedgerReceipt, updateFrqFeedback, getLedgerByStudent, getLedgerByItem, getRowsByLedgerIds };

  // Compare-and-set only the feedback JSON. Never include score, receipts, or
  // ticket state in this update, even when the grader suggests a higher score.
  async function updateFrqFeedback(existing, result) {
    let query = client.from('item_ledger').update({ frq_result: result })
      .eq('ledger_id', existing.ledger_id)
      .eq('source', 'frq')
      .eq('response', JSON.stringify(existing.response))
      .eq('score', existing.score);
    query = existing.frq_result == null
      ? query.is('frq_result', null)
      : query.eq('frq_result', JSON.stringify(existing.frq_result));
    return query.select('ledger_id, score');
  }

  // Upsert a ledger row on (student_id, source, item_id, attempt).
  // Returns { data, error } — data has ledger_id and evidence_tier on success.
  // [recordedAt] is OPTIONAL and only set by the faithful restore path
  // (admin-restore.js), which replays issuer-signed rows byte-for-byte and must
  // preserve the original timestamp so the recomputed commit-chain heads match.
  // Every other caller omits it and gets the original now() behavior.
  // [frqResult]/[gradedAt] are OPTIONAL (2026-09-09): the legacy /ledger/frq-regrade
  // path stores the grader's verdict + feedback alongside the score so the worksheet can
  // explain the grade. Omitted by every other caller → columns untouched.
  async function insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt, recordedAt, frqResult, gradedAt, receiptId, receiptCompact }) {
    const extra = {};
    if (receiptCompact !== undefined) {
      extra.receipt_id = receiptId;
      extra.receipt_compact = receiptCompact;
    }
    if (frqResult && typeof frqResult === 'object') {
      extra.frq_result = frqResult;
      extra.graded_at  = gradedAt || new Date().toISOString();
    }
    return client
      .from('item_ledger')
      .upsert(
        [{
          student_id:    studentId,
          source:        source,
          item_id:       itemId,
          unit:          unit        || null,
          topic:         topic       || null,
          skill:         skill       || null,
          response:      response,
          score:         score       ?? null,
          evidence_tier: evidenceTier,
          attempt:       attempt     ?? 1,
          recorded_at:   recordedAt  || new Date().toISOString(),
          ...extra
        }],
        { onConflict: 'student_id,source,item_id,attempt' }
      )
      .select('*')
      .single();
  }

  // Persist a signed receipt after the grade row is safely recorded.
  // Returns { error }; callers treat this as best-effort.
  async function updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
    const { error } = await client
      .from('item_ledger')
      .update({
        receipt_id: receiptId,
        receipt_compact: receiptCompact
      })
      .eq('ledger_id', ledgerId);
    return { error };
  }

  // Fetch all ledger rows for a student, newest first.
  // Returns { data, error } — data is an array of item_ledger rows.
  //
  // Optional opts.prefix (string) filters rows whose item_id starts with prefix.
  // Uses Supabase .like (case-sensitive); the route layer is responsible for
  // sanitizing the prefix (no wildcards allowed in user input).
  async function getLedgerByStudent(studentId, opts) {
    const prefix = opts && opts.prefix;
    let q = client
      .from('item_ledger')
      .select('*')
      .eq('student_id', studentId);
    if (prefix) {
      q = q.like('item_id', prefix + '%');
    }
    const result = await q.order('recorded_at', { ascending: false });
    if (result && Array.isArray(result.data)) {
      result.data = stableLedgerSort(result.data);
    }
    return result;
  }

  // Fetch all ledger rows for ONE item_id, newest first. Optional source filter.
  // Used by the section-scoped /class/blank class-answers view. Returns
  // { data, error } — data rows carry student_id, response, source, recorded_at.
  async function getLedgerByItem(itemId, opts) {
    const source = opts && opts.source;
    let q = client
      .from('item_ledger')
      .select('student_id, response, source, recorded_at')
      .eq('item_id', itemId);
    if (source) {
      q = q.eq('source', source);
    }
    return q.order('recorded_at', { ascending: false });
  }

  // Fetch full ledger rows for an explicit set of ledger_ids. Used by the Nightly
  // Review mark endpoint to resolve each target's student_id + binding fields (so a
  // teacher can mark items by id without trusting the client's student attribution).
  // Empty input → no query. Returns { data, error } — rows in no particular order.
  async function getRowsByLedgerIds(ledgerIds) {
    if (!Array.isArray(ledgerIds) || !ledgerIds.length) return { data: [], error: null };
    return client.from('item_ledger').select('*').in('ledger_id', ledgerIds);
  }
}
