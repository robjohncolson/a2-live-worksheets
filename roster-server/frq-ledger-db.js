// frq-ledger-db.js -- thin, injectable data access for migration 0031.
// The production caller supplies the same service-role Supabase client used by
// the other roster DB wrappers; importing this module never reads environment.

const MIGRATION_MISSING = new Set(['42703', '42883', 'PGRST202', 'PGRST204']);

export function createFrqLedgerDb(client) {
  const health = {
    degraded: false,
    errorCode: null,
    lastDegradedAt: null,
    lastOkAt: null,
  };
  return {
    recordFrqDraft,
    claimFrqTickets,
    applyFrqVerdict,
    failFrqClaim,
    queueFrqAppeal,
    updateFrqReceiptIfScore,
    getFrqStatusRows,
    getFrqShadowRows,
    probeHealth,
    health,
  };

  async function recordFrqDraft({ studentId, itemId, response, responseHash, readyAt }) {
    return callRpc('record_frq_draft', {
      p_student_id: studentId,
      p_item_id: itemId,
      p_response: response,
      p_response_hash: responseHash,
      p_ready_at: readyAt,
    });
  }

  async function claimFrqTickets({ worker, limit, leaseMs }) {
    return callRpc('claim_frq_tickets', {
      p_worker: worker,
      p_limit: limit,
      p_lease_ms: leaseMs,
    });
  }

  async function applyFrqVerdict({
    ledgerId,
    claimToken,
    responseVersion,
    score,
    result,
    rubricVersion,
    gradedAt,
    teacher = false,
  }) {
    return callRpc('apply_frq_verdict', {
      p_ledger_id: ledgerId,
      p_claim_token: claimToken ?? null,
      p_response_version: responseVersion,
      p_score: score,
      p_result: result,
      p_rubric_version: rubricVersion,
      p_graded_at: gradedAt,
      p_teacher: teacher,
    });
  }

  async function failFrqClaim({ ledgerId, claimToken, error, nextAttemptAt }) {
    return callRpc('fail_frq_claim', {
      p_ledger_id: ledgerId,
      p_claim_token: claimToken,
      p_error: error,
      p_next_attempt_at: nextAttemptAt,
    });
  }

  async function queueFrqAppeal({ studentId, itemId, appealText, revisedText = null }) {
    return callRpc('queue_frq_appeal', {
      p_student_id: studentId,
      p_item_id: itemId,
      p_appeal_text: appealText,
      p_revised_text: revisedText,
    });
  }

  // Migration 0031 is transactional, and this zero-row claim resolves the RPC
  // plus every ticket column in its return type without mutating a ledger row.
  async function probeHealth() {
    return callRpc('claim_frq_tickets', {
      p_worker: 'frq-health-probe',
      p_limit: 0,
      p_lease_ms: 5_000,
    }, { recoveryProbe: true });
  }

  // Receipt signing happens after the atomic verdict. Bind the delayed write to
  // the score that was signed so a later floor raise cannot receive an old receipt.
  async function updateFrqReceiptIfScore(
    ledgerId,
    expectedScore,
    receiptId,
    receiptCompact,
  ) {
    try {
      const result = await client
        .from('item_ledger')
        .update({
          receipt_id: receiptId,
          receipt_compact: receiptCompact,
        })
        .eq('ledger_id', ledgerId)
        .eq('score', expectedScore)
        .select('ledger_id');
      const handled = observeResult(result);

      if (handled && handled.degraded) {
        return { ...handled, matched: false };
      }
      if (handled && handled.error) {
        return { matched: false, error: handled.error };
      }
      return {
        matched: Boolean(handled && Array.isArray(handled.data) && handled.data.length),
        error: null,
      };
    } catch (error) {
      const handled = observeThrownError(error);
      return { ...handled, matched: false };
    }
  }

  // Narrow projection for the future self-status route. Claim tokens, owners,
  // and operational error text are intentionally absent from this boundary.
  async function getFrqStatusRows(studentId, itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return { data: [], error: null };
    }

    try {
      const result = await client
        .from('item_ledger')
        .select([
          'ledger_id',
          'student_id',
          'item_id',
          'response',
          'score',
          'graded_at',
          'receipt_id',
          'receipt_compact',
          'attempt',
          'evidence_tier',
          'frq_response_version',
          'frq_response_hash',
          'frq_ready_at',
          'frq_claimed_until',
          'frq_retry_count',
          'frq_next_attempt_at',
          'frq_result',
          'frq_rubric_version',
          'frq_appeal_count',
          'frq_appeal_pending',
          'frq_last_appeal',
        ].join(', '))
        .eq('student_id', studentId)
        .eq('source', 'frq')
        .in('item_id', itemIds);

      return observeResult(result);
    } catch (error) {
      return observeThrownError(error);
    }
  }

  // Shadow pages through deterministic graded history. It never needs claim
  // metadata and the worker never sends this row shape back to a student.
  async function getFrqShadowRows(limit, offset = 0) {
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    const boundedLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.floor(parsedLimit)) : 1;
    const boundedOffset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
    try {
      const query = client
        .from('item_ledger')
        .select([
          'ledger_id',
          'student_id',
          'item_id',
          'response',
          'score',
          'attempt',
          'evidence_tier',
          'graded_at',
          'frq_response_version',
          'frq_response_hash',
          'frq_result',
        ].join(', '))
        .eq('source', 'frq')
        .in('score', [0, 0.5, 1])
        .order('graded_at', { ascending: false })
        .order('ledger_id', { ascending: true });
      // Supabase uses the range path; the fallback keeps older injected clients bounded.
      const result = typeof query.range === 'function'
        ? await query.range(boundedOffset, boundedOffset + boundedLimit - 1)
        : await query.limit(boundedLimit);
      return observeResult(result);
    } catch (error) {
      return observeThrownError(error);
    }
  }

  async function callRpc(name, params, options) {
    try {
      const result = await client.rpc(name, params);
      return observeResult(result, options);
    } catch (error) {
      return observeThrownError(error);
    }
  }

  function observeResult(result, { recoveryProbe = false } = {}) {
    const handled = degradeMissingMigration(result);
    if (handled && handled.degraded) {
      markDegraded(handled.error);
      return handled;
    }
    if (handled && !handled.error) {
      health.lastOkAt = new Date().toISOString();
      if (recoveryProbe) {
        health.degraded = false;
        health.errorCode = null;
      }
    }
    return handled;
  }

  function observeThrownError(error) {
    const handled = handleThrownError(error);
    if (handled && handled.degraded) markDegraded(handled.error);
    return handled;
  }

  function markDegraded(error) {
    health.degraded = true;
    health.errorCode = String(error?.code || 'migration_missing');
    health.lastDegradedAt = new Date().toISOString();
  }
}

function degradeMissingMigration(result) {
  if (result && isMigrationMissing(result.error)) {
    return { degraded: true, error: result.error };
  }
  return result;
}

function handleThrownError(error) {
  if (isMigrationMissing(error)) {
    return { degraded: true, error };
  }
  throw error;
}

function isMigrationMissing(error) {
  if (!error) return false;
  const code = String(error.code || (error.cause && error.cause.code) || '');
  if (MIGRATION_MISSING.has(code)) return true;

  // Some adapters preserve the SQLSTATE only in the message.
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ');
  return /(^|\D)(42703|42883)(\D|$)/.test(message);
}
