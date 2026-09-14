// frq-tickets-pg.test.js -- migration-0031 SQL state-machine tests. PGlite is
// deliberately single-session: these tests cover RPC semantics and adversarial
// completion order, but do not claim to prove SKIP LOCKED or multi-session lock
// races. The deployment gate must run those against real PostgreSQL.

import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createFrqLedgerDb } from '../frq-ledger-db.js';
import {
  FRQ_STUDENT_ID,
  createFrqDb,
  resetFrqDb,
  pgRecordFrqDraft,
  pgClaimFrqTickets,
  pgApplyFrqVerdict,
  pgFailFrqClaim,
  pgFrqRow,
  pgSetAppealPending,
  pgSetFrqTimes,
  deriveFrqState,
  createPgliteFrqClient,
} from './fixtures/pg-frq.js';

const BASE_MS = Date.parse('2030-01-02T03:04:05.000Z');
const at = (offsetMs = 0) => new Date(BASE_MS + offsetMs).toISOString();
const PAST_AT = '2000-01-01T00:00:00.000Z';
const FUTURE_AT = '2999-01-01T00:00:00.000Z';
const longResponse = (label) => `${label}: this response is comfortably longer than twenty chars.`;
const hashFor = (label) => `sha256:${label}`;
const numeric = (value) => value == null ? null : Number(value);

let db;

it('the worker DB adapter and SQL RPC retain rubric elements without a new migration', async () => {
  const draft = await recordTicket('WS-U1L1-elements');
  const claim = await claimOne('worker-elements');
  const adapter = createFrqLedgerDb(createPgliteFrqClient(db));
  const result = resultFor(claim.frq_response_hash, {
    matched: ['Names the variable'], missing: ['Explains the context'], suggestion: 'Add context',
  });
  await adapter.applyFrqVerdict({ ledgerId: draft.ledger_id, claimToken: claim.frq_claim_token,
    responseVersion: claim.frq_response_version, score: 0.5, result, rubricVersion: 'test', gradedAt: at() });
  const row = await pgFrqRow(db, draft.ledger_id);
  const { responseHash, ...storedResult } = result;
  expect(row.frq_result).toEqual(storedResult);
});

beforeAll(async () => {
  db = await createFrqDb();
}, 60000);

beforeEach(async () => {
  await resetFrqDb(db);
});

afterAll(async () => {
  if (db) await db.close();
});

async function recordTicket(itemId, {
  response = longResponse(itemId),
  responseHash = hashFor(itemId),
  readyAt = PAST_AT,
} = {}) {
  return pgRecordFrqDraft(db, {
    studentId: FRQ_STUDENT_ID,
    itemId,
    response,
    responseHash,
    readyAt,
  });
}

async function claimOne(worker, leaseMs = 120000) {
  const claims = await pgClaimFrqTickets(db, { worker, limit: 8, leaseMs });
  expect(claims).toHaveLength(1);
  return claims[0];
}

async function databaseNowMs() {
  const result = await db.query('select statement_timestamp() as now');
  return new Date(result.rows[0].now).getTime();
}

function resultFor(responseHash, extra = {}) {
  return {
    responseHash,
    score: extra.score ?? 0.5,
    feedback: extra.feedback || 'Specific feedback.',
    matched: [],
    missing: [],
    suggestion: 'Keep going.',
    provider: 'oracle',
    model: 'real-sql-test',
    ...extra,
  };
}

async function queueAppeal(itemId, appealText, requestedAt) {
  const result = await db.query(
    `select * from queue_frq_appeal($1::uuid, $2::text, $3::text, $4::timestamptz)`,
    [FRQ_STUDENT_ID, itemId, appealText, requestedAt],
  );
  return result.rows[0];
}

async function queueRevisedAppeal(itemId, appealText, requestedAt, revisedText) {
  const result = await db.query(
    `select * from queue_frq_appeal(
      $1::uuid, $2::text, $3::text, $4::timestamptz, $5::text
    )`,
    [FRQ_STUDENT_ID, itemId, appealText, requestedAt, revisedText],
  );
  return result.rows[0];
}

describe('migration 0031 FRQ ticket state machine (real plpgsql)', () => {
  it('moves draft -> queued -> grading -> graded on the happy path', async () => {
    const itemId = 'WS-U1L1-reflect1';
    const responseHash = hashFor(itemId);
    const draft = await recordTicket(itemId);

    expect(draft.status).toBe('queued');
    expect(Number(draft.response_version)).toBe(1);
    expect(deriveFrqState(await pgFrqRow(db, draft.ledger_id), new Date())).toBe('queued');

    const claim = await claimOne('worker-happy');
    expect(claim.ledger_id).toBe(draft.ledger_id);
    expect(claim.response).toBe(longResponse(itemId));
    expect(Number(claim.frq_response_version)).toBe(1);
    expect(claim.frq_response_hash).toBe(responseHash);
    expect(claim.is_appeal).toBe(false);
    expect(deriveFrqState(await pgFrqRow(db, draft.ledger_id), new Date())).toBe('grading');

    const verdict = await pgApplyFrqVerdict(db, {
      ledgerId: draft.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1000),
    });

    expect(verdict.applied).toBe(true);
    expect(verdict.stale).toBe(false);
    expect(verdict.previous_score).toBeNull();
    expect(numeric(verdict.score)).toBe(0.5);

    const row = await pgFrqRow(db, draft.ledger_id);
    expect(deriveFrqState(row, at(1000))).toBe('graded');
    expect(numeric(row.score)).toBe(0.5);
    expect(row.frq_claim_token).toBeNull();
    expect(row.frq_result.feedback).toBe('Specific feedback.');
    expect(numeric(row.frq_result.score)).toBe(0.5);
    expect(row.frq_result.responseHash).toBeUndefined();
    expect(row.frq_rubric_version).toBe('SY2627:test');
    expect(new Date(row.graded_at).toISOString()).toBe(at(1000));
    expect(row.receipt_id).toBeNull();
    expect(row.receipt_compact).toBeNull();
  }, 60000);

  it('keeps E4 ready_at semantics and resets work only for changed text', async () => {
    const itemId = 'WS-U1L1-readiness';
    const first = await recordTicket(itemId, { readyAt: FUTURE_AT });
    const earlierReplay = await recordTicket(itemId, { readyAt: PAST_AT });
    expect(Number(earlierReplay.response_version)).toBe(1);
    expect(new Date((await pgFrqRow(db, first.ledger_id)).frq_ready_at).toISOString()).toBe(PAST_AT);

    const claim = await claimOne('worker-readiness');
    await recordTicket(itemId, { readyAt: FUTURE_AT });
    let row = await pgFrqRow(db, first.ledger_id);
    expect(new Date(row.frq_ready_at).toISOString()).toBe(PAST_AT);
    expect(row.frq_claim_token).toBe(claim.frq_claim_token);

    const changed = await recordTicket(itemId, {
      response: longResponse('changed readiness text'),
      responseHash: 'sha256:changed-readiness',
      readyAt: FUTURE_AT,
    });
    row = await pgFrqRow(db, first.ledger_id);
    expect(Number(changed.response_version)).toBe(2);
    expect(new Date(row.frq_ready_at).toISOString()).toBe(FUTURE_AT);
    expect(row.frq_claim_token).toBeNull();
    expect(row.frq_retry_count).toBe(0);
  }, 60000);

  it('binds a terminal grade to its original response across later draft replay', async () => {
    const originalResponse = longResponse('WS-U1L1-graded-then-draft');
    const third = await recordTicket('WS-U1L1-graded-then-draft', {
      response: originalResponse,
      responseHash: 'sha256:original',
    });
    const thirdClaim = await claimOne('worker-A');
    await pgApplyFrqVerdict(db, {
      ledgerId: third.ledger_id,
      claimToken: thirdClaim.frq_claim_token,
      responseVersion: thirdClaim.frq_response_version,
      score: 1,
      result: resultFor('sha256:original', { score: 1 }),
      gradedAt: at(1000),
    });
    const replay = await recordTicket('WS-U1L1-graded-then-draft', {
      response: longResponse('student-edited-after-grade'),
      responseHash: 'sha256:edited',
      readyAt: at(2000),
    });
    const preserved = await pgFrqRow(db, third.ledger_id);
    expect(replay.status).toBe('graded');
    expect(numeric(preserved.score)).toBe(1);
    expect(preserved.response).toBe(originalResponse);
    expect(preserved.frq_response_hash).toBe('sha256:original');
    expect(Number(preserved.frq_response_version)).toBe(1);
  }, 60000);

  it('rejects a v1 verdict after an edit advances the row to v2', async () => {
    const itemId = 'WS-U1L2-stale-edit';
    const first = await recordTicket(itemId, {
      response: longResponse('version-one'),
      responseHash: 'sha256:v1',
    });
    const claim = await claimOne('worker-v1');

    const second = await recordTicket(itemId, {
      response: longResponse('version-two'),
      responseHash: 'sha256:v2',
      readyAt: PAST_AT,
    });
    expect(Number(second.response_version)).toBe(2);

    const stale = await pgApplyFrqVerdict(db, {
      ledgerId: first.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 1,
      result: resultFor('sha256:v1', { score: 1 }),
      gradedAt: at(3000),
    });
    expect(stale.applied).toBe(false);
    expect(stale.stale).toBe(true);

    const row = await pgFrqRow(db, first.ledger_id);
    expect(row.score).toBeNull();
    expect(row.response).toBe(longResponse('version-two'));
    expect(row.frq_response_hash).toBe('sha256:v2');
    expect(Number(row.frq_response_version)).toBe(2);
    expect(row.frq_claim_token).toBeNull();
    expect(deriveFrqState(row, at(3000))).toBe('queued');
  }, 60000);

  it('treats score 0 as a real terminal grade and never lowers or nulls numeric scores', async () => {
    const zero = await recordTicket('WS-U2L1-zero');
    const zeroClaim = await claimOne('worker-zero');
    const initialI = await pgApplyFrqVerdict(db, {
      ledgerId: zero.ledger_id,
      claimToken: zeroClaim.frq_claim_token,
      responseVersion: zeroClaim.frq_response_version,
      score: 0,
      result: resultFor(zeroClaim.frq_response_hash, { score: 0 }),
      gradedAt: at(1000),
    });
    expect(initialI.applied).toBe(true);
    expect(numeric(initialI.score)).toBe(0);

    const duplicateI = await pgApplyFrqVerdict(db, {
      ledgerId: zero.ledger_id,
      claimToken: zeroClaim.frq_claim_token,
      responseVersion: zeroClaim.frq_response_version,
      score: 0,
      result: resultFor(zeroClaim.frq_response_hash, { score: 0, feedback: 'losing duplicate' }),
      gradedAt: at(2000),
    });
    expect(duplicateI.applied).toBe(false);
    expect(duplicateI.stale).toBe(true);
    expect(numeric(duplicateI.score)).toBe(0);

    const replay = await recordTicket('WS-U2L1-zero', {
      response: longResponse('late scored draft'),
      responseHash: 'sha256:late',
    });
    expect(replay.status).toBe('graded');
    expect(numeric((await pgFrqRow(db, zero.ledger_id)).score)).toBe(0);
    expect(await pgClaimFrqTickets(db, {
      worker: 'worker-again', limit: 8, leaseMs: 1000,
    })).toHaveLength(0);

    const raised = await recordTicket('WS-U2L1-floor');
    const raisedClaim = await claimOne('worker-floor');
    await pgApplyFrqVerdict(db, {
      ledgerId: raised.ledger_id,
      claimToken: raisedClaim.frq_claim_token,
      responseVersion: raisedClaim.frq_response_version,
      score: 1,
      result: resultFor(raisedClaim.frq_response_hash, { score: 1 }),
      gradedAt: at(1000),
    });
    const lower = await pgApplyFrqVerdict(db, {
      ledgerId: raised.ledger_id,
      claimToken: null,
      responseVersion: raisedClaim.frq_response_version,
      score: 0.5,
      result: resultFor(raisedClaim.frq_response_hash, { score: 0.5, feedback: 'must not replace' }),
      gradedAt: at(2000),
      teacher: true,
    });
    expect(lower.applied).toBe(false);
    expect(lower.stale).toBe(false);
    const floorRow = await pgFrqRow(db, raised.ledger_id);
    expect(numeric(floorRow.score)).toBe(1);
    expect(floorRow.frq_result.feedback).not.toBe('must not replace');
  }, 60000);

  it('uses the DB clock, clamps leases, rejects reclaimed tokens, and bounds retry delay', async () => {
    await recordTicket('WS-U3L1-short', {
      response: 'too short', responseHash: 'sha256:short', readyAt: PAST_AT,
    });
    await recordTicket('WS-U3L1-future', { readyAt: FUTURE_AT });
    const eligible = await recordTicket('WS-U3L1-eligible');

    const beforeMinimumLease = await databaseNowMs();
    const firstClaim = await claimOne('worker-A', 0);
    const afterMinimumLease = await databaseNowMs();
    expect(firstClaim.ledger_id).toBe(eligible.ledger_id);
    let row = await pgFrqRow(db, eligible.ledger_id);
    const minimumExpiry = new Date(row.frq_claimed_until).getTime();
    expect(minimumExpiry).toBeGreaterThanOrEqual(beforeMinimumLease + 5000);
    expect(minimumExpiry).toBeLessThanOrEqual(afterMinimumLease + 5000);
    expect(await pgClaimFrqTickets(db, {
      worker: 'worker-B', limit: 8, leaseMs: 1000,
    })).toHaveLength(0);

    const arbitrary = await pgApplyFrqVerdict(db, {
      ledgerId: eligible.ledger_id,
      claimToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      responseVersion: firstClaim.frq_response_version,
      score: 1,
      result: resultFor(firstClaim.frq_response_hash, { score: 1 }),
      gradedAt: at(1000),
    });
    expect(arbitrary.stale).toBe(true);
    expect((await pgFrqRow(db, eligible.ledger_id)).frq_claim_token).toBe(firstClaim.frq_claim_token);

    await pgSetFrqTimes(db, eligible.ledger_id, { claimedUntil: PAST_AT });
    const reclaimed = await claimOne('worker-B', 1000);
    expect(reclaimed.frq_claim_token).not.toBe(firstClaim.frq_claim_token);

    const exactOldToken = await pgApplyFrqVerdict(db, {
      ledgerId: eligible.ledger_id,
      claimToken: firstClaim.frq_claim_token,
      responseVersion: firstClaim.frq_response_version,
      score: 1,
      result: resultFor(firstClaim.frq_response_hash, { score: 1 }),
      gradedAt: at(1100),
    });
    expect(exactOldToken.applied).toBe(false);
    expect(exactOldToken.stale).toBe(true);
    row = await pgFrqRow(db, eligible.ledger_id);
    expect(row.score).toBeNull();
    expect(row.frq_claim_token).toBe(reclaimed.frq_claim_token);
    expect(await pgFailFrqClaim(db, {
      ledgerId: eligible.ledger_id,
      claimToken: firstClaim.frq_claim_token,
      error: 'timeout',
      nextAttemptAt: FUTURE_AT,
    })).toBe(false);

    const beforeFailure = await databaseNowMs();
    expect(await pgFailFrqClaim(db, {
      ledgerId: eligible.ledger_id,
      claimToken: reclaimed.frq_claim_token,
      error: 'provider timeout\nraw payload!',
      nextAttemptAt: FUTURE_AT,
    })).toBe(true);
    const afterFailure = await databaseNowMs();
    const retrying = await pgFrqRow(db, eligible.ledger_id);
    expect(Number(retrying.frq_retry_count)).toBe(1);
    expect(retrying.frq_last_error).toBe('unknown');
    const retryAt = new Date(retrying.frq_next_attempt_at).getTime();
    expect(retryAt).toBeGreaterThanOrEqual(beforeFailure + 15 * 60 * 1000);
    expect(retryAt).toBeLessThanOrEqual(afterFailure + 15 * 60 * 1000);
    expect(await pgClaimFrqTickets(db, {
      worker: 'worker-early', limit: 8, leaseMs: 1000,
    })).toHaveLength(0);

    await pgSetFrqTimes(db, eligible.ledger_id, { nextAttemptAt: PAST_AT });
    const retried = await claimOne('worker-retry', 1000);
    expect(retried.ledger_id).toBe(eligible.ledger_id);
    expect(retried.frq_claim_token).not.toBe(reclaimed.frq_claim_token);
    expect(Number(retried.frq_retry_count)).toBe(1);

    expect(await pgFailFrqClaim(db, {
      ledgerId: eligible.ledger_id,
      claimToken: retried.frq_claim_token,
      error: 'timeout',
      nextAttemptAt: null,
    })).toBe(true);
    row = await pgFrqRow(db, eligible.ledger_id);
    expect(row.frq_last_error).toBe('timeout');
    expect(new Date(row.frq_next_attempt_at).getTime()).toBeLessThanOrEqual(await databaseNowMs());
    expect((await claimOne('worker-immediate', 1000)).ledger_id).toBe(eligible.ledger_id);
  }, 60000);

  it.each([
    [9, 'draft', false],
    [10, 'draft', false],
    [19, 'draft', false],
    [20, 'queued', true],
  ])('matches Unicode char_length for %s emoji code points', async (count, status, claimable) => {
    const ticket = await recordTicket(`WS-U3L1-emoji-${count}`, {
      response: '😀'.repeat(count),
      responseHash: hashFor(`emoji-${count}`),
    });
    expect(ticket.status).toBe(status);
    const claims = await pgClaimFrqTickets(db, { worker: `emoji-${count}`, limit: 1, leaseMs: 1000 });
    expect(claims).toHaveLength(claimable ? 1 : 0);
  }, 60000);

  it('caps an oversized lease at ten minutes', async () => {
    const ticket = await recordTicket('WS-U3L1-max-lease');
    const beforeClaim = await databaseNowMs();
    await claimOne('worker-max-lease', 999999999);
    const afterClaim = await databaseNowMs();
    const row = await pgFrqRow(db, ticket.ledger_id);
    const expiresAt = new Date(row.frq_claimed_until).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(beforeClaim + 10 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(afterClaim + 10 * 60 * 1000);
  }, 60000);

  it('keeps the claim when a verdict score is null or outside E/P/I', async () => {
    const ticket = await recordTicket('WS-U3L2-bad-verdict');
    const claim = await claimOne('worker-bad-verdict');

    for (const score of [null, 0.25]) {
      const invalid = await pgApplyFrqVerdict(db, {
        ledgerId: ticket.ledger_id,
        claimToken: claim.frq_claim_token,
        responseVersion: claim.frq_response_version,
        score,
        result: resultFor(claim.frq_response_hash, { score }),
        gradedAt: at(1000),
      });
      expect(invalid.applied).toBe(false);
      expect(invalid.stale).toBe(false);
      const row = await pgFrqRow(db, ticket.ledger_id);
      expect(row.score).toBeNull();
      expect(row.frq_claim_token).toBe(claim.frq_claim_token);
    }

    await pgFailFrqClaim(db, {
      ledgerId: ticket.ledger_id,
      claimToken: claim.frq_claim_token,
      error: 'bad_verdict',
      nextAttemptAt: null,
    });
    expect((await pgFrqRow(db, ticket.ledger_id)).frq_last_error).toBe('bad_verdict');
  }, 60000);

  it('claims numeric-score rows only as appeals, clears the request, and applies only a raise', async () => {
    const itemId = 'WS-U4L1-short-appeal';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId, {
      response: 'short graded answer', responseHash,
    });
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash, { score: 0.5 }),
      gradedAt: at(1000),
      teacher: true,
    });
    expect(await pgClaimFrqTickets(db, {
      worker: 'normal-worker', limit: 8, leaseMs: 1000,
    })).toHaveLength(0);

    await pgSetAppealPending(db, ticket.ledger_id, {
      text: 'Please reconsider the rubric evidence.',
      requestedAt: at(2000),
      version: 1,
    });
    expect(deriveFrqState(await pgFrqRow(db, ticket.ledger_id), new Date())).toBe('appeal-queued');
    const firstAppeal = await claimOne('appeal-worker', 1000);
    expect(firstAppeal.is_appeal).toBe(true);
    expect(deriveFrqState(await pgFrqRow(db, ticket.ledger_id), new Date())).toBe('appeal-grading');

    const lower = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: firstAppeal.frq_claim_token,
      responseVersion: firstAppeal.frq_response_version,
      score: 0,
      result: resultFor(responseHash, { score: 0 }),
      gradedAt: at(2100),
    });
    expect(lower.applied).toBe(false);
    let row = await pgFrqRow(db, ticket.ledger_id);
    expect(numeric(row.score)).toBe(0.5);
    expect(row.frq_appeal_pending).toBeNull();

    await pgSetAppealPending(db, ticket.ledger_id, {
      text: 'The second appeal identifies the missing match.',
      requestedAt: at(3000),
      version: 1,
    });
    const secondAppeal = await claimOne('appeal-worker', 1000);
    const raise = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: secondAppeal.frq_claim_token,
      responseVersion: secondAppeal.frq_response_version,
      score: 1,
      result: resultFor(responseHash, { score: 1 }),
      gradedAt: at(3100),
    });
    expect(raise.applied).toBe(true);
    row = await pgFrqRow(db, ticket.ledger_id);
    expect(numeric(row.score)).toBe(1);
    expect(row.frq_appeal_pending).toBeNull();
  }, 60000);

  it('does not let a reclaimed appeal token consume or clear the current appeal', async () => {
    const itemId = 'WS-U4L2-reclaimed-appeal';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1000),
      teacher: true,
    });
    const pending = { text: 'Please review.', requestedAt: at(2000), version: 1 };
    await pgSetAppealPending(db, ticket.ledger_id, pending);
    const oldClaim = await claimOne('appeal-old', 1000);
    await pgSetFrqTimes(db, ticket.ledger_id, { claimedUntil: PAST_AT });
    const currentClaim = await claimOne('appeal-current', 1000);

    const stale = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: oldClaim.frq_claim_token,
      responseVersion: oldClaim.frq_response_version,
      score: 1,
      result: resultFor(responseHash, { score: 1 }),
      gradedAt: at(3000),
    });
    expect(stale.applied).toBe(false);
    expect(stale.stale).toBe(true);
    const row = await pgFrqRow(db, ticket.ledger_id);
    expect(numeric(row.score)).toBe(0.5);
    expect(row.frq_claim_token).toBe(currentClaim.frq_claim_token);
    expect(row.frq_appeal_pending).toEqual(pending);
  }, 60000);

  it('reserves tokenless apply for teachers and still rejects a stale teacher version', async () => {
    const itemId = 'WS-U5L1-teacher';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);

    const noAuthority = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1000),
      teacher: false,
    });
    expect(noAuthority.stale).toBe(true);
    expect((await pgFrqRow(db, ticket.ledger_id)).score).toBeNull();

    const teacher = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1100),
      teacher: true,
    });
    expect(teacher.applied).toBe(true);
    expect(teacher.stale).toBe(false);

    const staleTeacher = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: Number(ticket.response_version) + 1,
      score: 1,
      result: resultFor(responseHash, { score: 1 }),
      gradedAt: at(1200),
      teacher: true,
    });
    expect(staleTeacher.applied).toBe(false);
    expect(staleTeacher.stale).toBe(true);
    expect(numeric((await pgFrqRow(db, ticket.ledger_id)).score)).toBe(0.5);
  }, 60000);

  it('refuses to attach a stale-score receipt after the score floor rises', async () => {
    const itemId = 'WS-U5L2-receipt-floor';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);
    const claim = await claimOne('worker-receipt');
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1000),
    });
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: claim.frq_response_version,
      score: 1,
      result: resultFor(responseHash, { score: 1 }),
      gradedAt: at(2000),
      teacher: true,
    });

    const wrapper = createFrqLedgerDb(createPgliteFrqClient(db));
    const staleReceipt = await wrapper.updateFrqReceiptIfScore(
      ticket.ledger_id,
      0.5,
      'receipt-stale',
      'compact.stale',
    );
    expect(staleReceipt.matched).toBe(false);
    let row = await pgFrqRow(db, ticket.ledger_id);
    expect(numeric(row.score)).toBe(1);
    expect(row.receipt_id).toBeNull();
    expect(row.receipt_compact).toBeNull();

    const currentReceipt = await wrapper.updateFrqReceiptIfScore(
      ticket.ledger_id,
      1,
      'receipt-current',
      'compact.current',
    );
    expect(currentReceipt).toEqual({ matched: true, error: null });
    row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.receipt_id).toBe('receipt-current');
    expect(row.receipt_compact).toBe('compact.current');
  }, 60000);

  it('atomically enforces appeal dedup, cooldown, and the three-appeal limit', async () => {
    const itemId = 'WS-U6L1-appeal-limits';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(),
      teacher: true,
    });

    const first = await queueAppeal(itemId, 'Please review the first appeal.', PAST_AT);
    expect(first).toMatchObject({ queued: true, appeal_count: 1, reason: 'queued' });
    const duplicate = await queueAppeal(itemId, 'Please review the first appeal.', FUTURE_AT);
    expect(duplicate).toMatchObject({ queued: false, appeal_count: 1, reason: 'duplicate' });
    const cooldown = await queueAppeal(itemId, 'A different appeal during cooldown.', FUTURE_AT);
    expect(cooldown).toMatchObject({ queued: false, appeal_count: 1, reason: 'cooldown' });

    await db.query(
      `update item_ledger set
        frq_appeal_pending = null,
        frq_last_appeal = jsonb_set(frq_last_appeal, '{at}', to_jsonb(statement_timestamp() - interval '61 seconds'))
       where ledger_id = $1::uuid`,
      [ticket.ledger_id],
    );
    const second = await queueAppeal(itemId, 'Please review the second appeal.', PAST_AT);
    expect(second).toMatchObject({ queued: true, appeal_count: 2, reason: 'queued' });
    await db.query(
      `update item_ledger set
        frq_appeal_pending = null,
        frq_last_appeal = jsonb_set(frq_last_appeal, '{at}', to_jsonb(statement_timestamp() - interval '61 seconds'))
       where ledger_id = $1::uuid`,
      [ticket.ledger_id],
    );
    const third = await queueAppeal(itemId, 'Please review the third appeal.', PAST_AT);
    expect(third).toMatchObject({ queued: true, appeal_count: 3, reason: 'queued' });
    const limited = await queueAppeal(itemId, 'Please review a forbidden fourth appeal.', FUTURE_AT);
    expect(limited).toMatchObject({ queued: false, appeal_count: 3, reason: 'limit' });

    const row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.frq_appeal_count).toBe(3);
    expect(row.frq_appeal_pending.text).toBe('Please review the third appeal.');
    expect(Number(row.frq_appeal_pending.version)).toBe(Number(ticket.response_version));
  }, 60000);

  it('retains completed-appeal dedup and cooldown state independently of pending work', async () => {
    const itemId = 'WS-U6L1-completed-appeal';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(),
      teacher: true,
    });

    const text = 'Please review this exact evidence.';
    expect(await queueAppeal(itemId, text, PAST_AT))
      .toMatchObject({ queued: true, appeal_count: 1 });
    const claim = await claimOne('completed-appeal');
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(1000),
    });

    const completed = await pgFrqRow(db, ticket.ledger_id);
    expect(completed.frq_appeal_pending).toBeNull();
    expect(completed.frq_last_appeal).toEqual({
      text,
      hash: expect.any(String),
      at: expect.any(String),
      outcome: 'maintained',
    });
    expect(await queueAppeal(itemId, text, FUTURE_AT))
      .toMatchObject({ queued: false, appeal_count: 1, reason: 'duplicate' });
    expect(await queueAppeal(itemId, '  Please   review this exact evidence.  ', FUTURE_AT))
      .toMatchObject({ queued: false, appeal_count: 1, reason: 'duplicate' });
    expect(await queueAppeal(itemId, 'A distinct appeal still inside cooldown.', FUTURE_AT))
      .toMatchObject({ queued: false, appeal_count: 1, reason: 'cooldown' });
  }, 60000);

  it('stores a canonical revised answer, clears it after apply, and never rewrites response', async () => {
    const itemId = 'WS-U6L1-revised-appeal';
    const original = longResponse('immutable original');
    const ticket = await recordTicket(itemId, { response: original });
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(hashFor(itemId)),
      gradedAt: at(),
      teacher: true,
    });

    const queued = await queueRevisedAppeal(
      itemId,
      'Please review my revised evidence.',
      PAST_AT,
      '  A revised answer with stronger statistical evidence.  ',
    );
    expect(queued).toMatchObject({ queued: true, appeal_count: 1 });
    let row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.frq_appeal_pending.revisedText)
      .toBe('A revised answer with stronger statistical evidence.');

    const claim = await claimOne('revised-appeal-worker');
    const applied = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 1,
      result: resultFor(hashFor(itemId), { score: 1, revisedTextUsed: true }),
      gradedAt: at(1000),
    });
    expect(applied.applied).toBe(true);
    row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.response).toBe(original);
    expect(row.frq_appeal_pending).toBeNull();
    expect(row.frq_result.revisedTextUsed).toBe(true);
    expect(row.frq_last_appeal).toEqual({
      text: 'Please review my revised evidence.',
      revisedText: 'A revised answer with stronger statistical evidence.',
      hash: expect.any(String),
      at: expect.any(String),
      outcome: 'raised',
    });
  }, 60000);

  it('omits revisedText when the canonical revision equals the immutable response', async () => {
    const itemId = 'WS-U6L1-identical-revision';
    const original = longResponse('identical revised answer');
    const ticket = await recordTicket(itemId, { response: original });
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(hashFor(itemId)),
      gradedAt: at(),
      teacher: true,
    });

    await queueRevisedAppeal(
      itemId,
      'Please review this unchanged answer.',
      PAST_AT,
      `  ${original}  `,
    );
    const row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.frq_appeal_pending).not.toHaveProperty('revisedText');
  }, 60000);

  it('re-runs safely and leaves exactly ONE queue_frq_appeal (defaults cover legacy calls)', async () => {
    const migration = await readFile(new URL('../migrations/0031_frq_tickets.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);

    // A 4-arg compatibility overload would make 4-argument calls ambiguous against
    // the 5-arg default signature (SQLSTATE 42725) -- the migration must DROP the
    // pre-revised-text production signature and leave only the defaulted one.
    const functions = await db.query(
      `select pronargs, pronargdefaults
         from pg_proc
        where proname = 'queue_frq_appeal'
        order by pronargs`,
    );
    expect(functions.rows.map((entry) => ({
      args: Number(entry.pronargs),
      defaults: Number(entry.pronargdefaults),
    }))).toEqual([
      { args: 5, defaults: 2 },
    ]);
    // Legacy positional call shapes still resolve (3-arg and 4-arg) via defaults.
    const threeArg = await db.query(
      'select * from queue_frq_appeal($1::uuid, $2::text, $3::text)',
      [FRQ_STUDENT_ID, 'missing-item', 'Please review this missing item.'],
    );
    expect(threeArg.rows[0].reason).toBe('not_found');
    const fourArg = await db.query(
      'select * from queue_frq_appeal($1::uuid, $2::text, $3::text, statement_timestamp())',
      [FRQ_STUDENT_ID, 'missing-item', 'Please review this missing item again.'],
    );
    expect(fourArg.rows[0].reason).toBe('not_found');
  }, 60000);

  it('serializes queueing against an in-flight appeal apply', async () => {
    const itemId = 'WS-U6L2-appeal-apply-race';
    const responseHash = hashFor(itemId);
    const ticket = await recordTicket(itemId);
    await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: null,
      responseVersion: ticket.response_version,
      score: 0.5,
      result: resultFor(responseHash),
      gradedAt: at(),
      teacher: true,
    });
    await queueAppeal(itemId, 'Please review the queued appeal.', PAST_AT);
    const claim = await claimOne('appeal-atomicity');

    const whileClaimed = await queueAppeal(
      itemId,
      'Do not replace a prompt already being graded.',
      new Date().toISOString(),
    );
    expect(whileClaimed).toMatchObject({ queued: false, appeal_count: 1, reason: 'cooldown' });

    const applied = await pgApplyFrqVerdict(db, {
      ledgerId: ticket.ledger_id,
      claimToken: claim.frq_claim_token,
      responseVersion: claim.frq_response_version,
      score: 1,
      result: resultFor(responseHash, { score: 1 }),
      gradedAt: at(121_000),
    });
    expect(applied.applied).toBe(true);
    const row = await pgFrqRow(db, ticket.ledger_id);
    expect(row.frq_appeal_pending).toBeNull();
    expect(row.frq_appeal_count).toBe(1);
  }, 60000);
});

describe('createFrqLedgerDb migration degradation contract', () => {
  it('forwards the optional revised text under the new RPC parameter name', async () => {
    const calls = [];
    const wrapper = createFrqLedgerDb({
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [{ queued: true, appeal_count: 1, reason: 'queued' }], error: null };
      },
    });

    await wrapper.queueFrqAppeal({
      studentId: FRQ_STUDENT_ID,
      itemId: 'WS-U1L1-revised-rpc',
      appealText: 'Please review the revised answer.',
      revisedText: 'Canonical revised answer.',
    });
    expect(calls).toEqual([{
      name: 'queue_frq_appeal',
      params: {
        p_student_id: FRQ_STUDENT_ID,
        p_item_id: 'WS-U1L1-revised-rpc',
        p_appeal_text: 'Please review the revised answer.',
        p_revised_text: 'Canonical revised answer.',
      },
    }]);
  });

  it('returns degraded results for both missing RPCs (42883) and missing columns (42703)', async () => {
    const preMigrationDb = await createFrqDb({ applyFrqMigration: false });
    try {
      const wrapper = createFrqLedgerDb(createPgliteFrqClient(preMigrationDb));
      const missingFunction = await wrapper.recordFrqDraft({
        studentId: FRQ_STUDENT_ID,
        itemId: 'WS-U1L1-before-migration',
        response: longResponse('before migration'),
        responseHash: 'sha256:before',
        readyAt: at(),
      });
      expect(missingFunction.degraded).toBe(true);
      expect(missingFunction.error.code).toBe('42883');

      const missingColumn = await wrapper.getFrqStatusRows(
        FRQ_STUDENT_ID,
        ['WS-U1L1-before-migration'],
      );
      expect(missingColumn.degraded).toBe(true);
      expect(missingColumn.error.code).toBe('42703');
    } finally {
      await preMigrationDb.close();
    }
  }, 60000);

  it('recognizes literal PostgREST schema-cache envelopes', async () => {
    const missingFunction = {
      code: 'PGRST202',
      message: 'Could not find the function a2.record_frq_draft in the schema cache',
      details: 'Searched for the function with the supplied parameters.',
      hint: 'Reload the schema cache.',
    };
    const missingColumn = {
      code: 'PGRST204',
      message: "Could not find the 'frq_result' column of 'item_ledger' in the schema cache",
      details: null,
      hint: null,
    };
    const selectBuilder = {
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: null, error: missingColumn })
          .then(onFulfilled, onRejected);
      },
    };
    const wrapper = createFrqLedgerDb({
      rpc: async () => ({ data: null, error: missingFunction }),
      from: () => selectBuilder,
    });

    const rpcResult = await wrapper.recordFrqDraft({
      studentId: FRQ_STUDENT_ID,
      itemId: 'WS-U1L1-schema-cache',
      response: longResponse('schema cache'),
      responseHash: 'sha256:schema-cache',
      readyAt: PAST_AT,
    });
    expect(rpcResult).toEqual({ degraded: true, error: missingFunction });
    expect(wrapper.health).toMatchObject({
      degraded: true,
      errorCode: 'PGRST202',
    });
    expect(wrapper.health.lastDegradedAt).toEqual(expect.any(String));

    const selectResult = await wrapper.getFrqStatusRows(
      FRQ_STUDENT_ID,
      ['WS-U1L1-schema-cache'],
    );
    expect(selectResult).toEqual({ degraded: true, error: missingColumn });
    expect(wrapper.health).toMatchObject({
      degraded: true,
      errorCode: 'PGRST204',
    });
  });

  it('marks every query path degraded and clears only after a representative probe', async () => {
    const missingFunction = { code: 'PGRST202', message: 'missing RPC' };
    const missingColumn = { code: 'PGRST204', message: 'missing FRQ column' };
    let rpcResponse = { data: null, error: missingFunction };
    let queryResponse = { data: null, error: missingColumn };
    const queryBuilder = () => ({
      update() { return this; },
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      order() { return this; },
      limit() { return this; },
      then(onFulfilled, onRejected) {
        return Promise.resolve(queryResponse).then(onFulfilled, onRejected);
      },
    });
    const wrapper = createFrqLedgerDb({
      rpc: async () => rpcResponse,
      from: () => queryBuilder(),
    });

    await wrapper.queueFrqAppeal({
      studentId: FRQ_STUDENT_ID,
      itemId: 'WS-U1L1-health',
      appealText: 'Please reconsider this evidence.',
    });
    expect(wrapper.health.degraded).toBe(true);
    const firstDegradedAt = wrapper.health.lastDegradedAt;

    rpcResponse = { data: [], error: null };
    await wrapper.probeHealth();
    expect(wrapper.health).toMatchObject({ degraded: false, errorCode: null });
    expect(wrapper.health.lastOkAt).toEqual(expect.any(String));
    expect(wrapper.health.lastDegradedAt).toBe(firstDegradedAt);

    await wrapper.getFrqStatusRows(FRQ_STUDENT_ID, ['WS-U1L1-health']);
    expect(wrapper.health).toMatchObject({ degraded: true, errorCode: 'PGRST204' });
    await wrapper.probeHealth();
    expect(wrapper.health.degraded).toBe(false);

    await wrapper.getFrqShadowRows(1);
    expect(wrapper.health.degraded).toBe(true);
    await wrapper.probeHealth();

    const receiptResult = await wrapper.updateFrqReceiptIfScore(
      '00000000-0000-4000-8000-000000000099',
      1,
      'receipt-id',
      'receipt-compact',
    );
    expect(receiptResult).toMatchObject({ degraded: true, matched: false });
    expect(wrapper.health.degraded).toBe(true);
  });

  it('does not degrade or swallow unrelated PostgREST failures', async () => {
    const resultError = { code: '23505', message: 'duplicate key', details: null, hint: null };
    const ordinary = createFrqLedgerDb({
      rpc: async () => ({ data: null, error: resultError }),
    });
    expect(await ordinary.claimFrqTickets({ worker: 'worker', limit: 1, leaseMs: 5000 }))
      .toEqual({ data: null, error: resultError });
    expect(ordinary.health.degraded).toBe(false);

    const thrown = createFrqLedgerDb({
      rpc: async () => { throw Object.assign(new Error('network down'), { code: 'ECONNRESET' }); },
    });
    await expect(thrown.claimFrqTickets({ worker: 'worker', limit: 1, leaseMs: 5000 }))
      .rejects.toMatchObject({ code: 'ECONNRESET' });
  });
});
