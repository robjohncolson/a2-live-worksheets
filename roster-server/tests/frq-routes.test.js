import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import http from 'node:http';
import { createStudentSlidingWindow, mountLedger } from '../ledger.js';

const bundle = {
  schoolYear: 'SY2627',
  sourceDigest: `sha256:${'b'.repeat(64)}`,
  worksheets: {
    'WS-U1L1': {
      items: {
        reflect1: { promptBeforeAnswer: 'before', promptAfterAnswer: 'after' },
        reflect2: { promptBeforeAnswer: 'before', promptAfterAnswer: 'after' },
      },
    },
  },
};

function createLegacyDb() {
  const writes = [];
  return {
    writes,
    async insertLedgerRow(value) {
      writes.push(value);
      return { data: { ledger_id: `legacy-${writes.length}`, evidence_tier: value.evidenceTier }, error: null };
    },
    async getLedgerByStudent() { return { data: [], error: null }; },
  };
}

function createFrqDb() {
  const drafts = [];
  const appeals = [];
  const applies = [];
  return {
    drafts,
    appeals,
    applies,
    statusRows: [],
    appealResult: { queued: true, appeal_count: 1, reason: 'queued' },
    async recordFrqDraft(value) {
      drafts.push(value);
      return { data: [{ ledger_id: 'frq-ledger-1', status: 'queued', response_version: 2 }] };
    },
    async getFrqStatusRows(studentId, itemIds) {
      return { data: this.statusRows.filter((row) => itemIds.includes(row.item_id)), studentId };
    },
    async queueFrqAppeal(value) {
      appeals.push(value);
      return { data: [this.appealResult] };
    },
    async applyFrqVerdict(value) {
      applies.push(value);
      return { data: [{
        ledger_id: value.ledgerId,
        applied: true,
        stale: false,
        score: value.score,
      }] };
    },
    async updateFrqReceiptIfScore() { return { matched: true, error: null }; },
  };
}

class TestServer {
  constructor(app) {
    this.server = http.createServer(app);
  }

  async start() {
    await new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
  }

  async stop() {
    await new Promise((resolve) => this.server.close(resolve));
  }

  async request(method, path, { body, headers = {} } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
}

let mode;
let legacyDb;
let frqDb;
let server;

function auth() {
  return { Authorization: 'Bearer token-a' };
}

function record(body = {}) {
  return server.request('POST', '/ledger/record', {
    body: {
      token: 'token-a',
      source: 'frq',
      itemId: 'WS-U1L1-reflect1',
      response: 'A sufficiently long reflection answer.',
      ...body,
    },
  });
}

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  process.env.TEACHER_KEY = 'teacher-key';
  process.env.FRQ_CANARY_STUDENTS = '*';
  mode = 'off';
  legacyDb = createLegacyDb();
  frqDb = createFrqDb();
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  mountLedger(app, {
    db: legacyDb,
    rosterDb: {},
    verifyToken: (token) => token === 'token-a' ? 'student-a' : null,
    frqDb,
    frqBundle: bundle,
    frqMode: () => mode,
  });
  server = new TestServer(app);
  await server.start();
});

afterEach(async () => {
  await server.stop();
  delete process.env.TEACHER_KEY;
  delete process.env.FRQ_CANARY_STUDENTS;
  delete process.env.FRQ_RECORD_MAX_PER_MINUTE;
  delete process.env.FRQ_APPEAL_MAX_PER_MINUTE;
  delete process.env.FRQ_STATUS_MAX_PER_MINUTE;
});

describe('POST /ledger/record FRQ mode matrix', () => {
  it.each(['off', 'shadow'])('%s preserves the legacy client-score write path', async (selectedMode) => {
    mode = selectedMode;
    const result = await record({ score: 1 });
    expect(result.status).toBe(200);
    expect(legacyDb.writes).toHaveLength(1);
    expect(legacyDb.writes[0].score).toBe(1);
    expect(frqDb.drafts).toHaveLength(0);
    expect(result.body.clientScoreIgnored).toBeUndefined();
  });

  it('authoritative validates item/attempt/size, trims and hashes server-side, and ignores score', async () => {
    mode = 'authoritative';
    expect((await record({ itemId: 'WS-U1L1-nope' })).body).toEqual({ error: 'unknown item' });
    expect((await record({ attempt: 2 })).status).toBe(400);
    expect((await record({ response: 'x'.repeat(8 * 1024 + 1) })).status).toBe(400);

    const result = await record({ response: '  A sufficiently long reflection answer.  ', score: 1 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      applied: false,
      status: 'queued',
      responseVersion: 2,
      clientScoreIgnored: true,
    });
    expect(legacyDb.writes).toHaveLength(0);
    expect(frqDb.drafts[0]).toMatchObject({
      studentId: 'student-a',
      itemId: 'WS-U1L1-reflect1',
      response: 'A sufficiently long reflection answer.',
    });
    expect(frqDb.drafts[0].responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(frqDb.drafts[0].readyAt) - Date.now()).toBeLessThanOrEqual(2_000);
  });

  it('uses twenty-second readiness for a draft and two seconds for requestGrade', async () => {
    mode = 'authoritative';
    await record();
    const draftDelay = Date.parse(frqDb.drafts[0].readyAt) - Date.now();
    expect(draftDelay).toBeGreaterThan(18_000);
    await record({ requestGrade: true });
    const requestedDelay = Date.parse(frqDb.drafts[1].readyAt) - Date.now();
    expect(requestedDelay).toBeLessThanOrEqual(2_000);
  });

  it('returns graded without mutating through the legacy path', async () => {
    mode = 'authoritative';
    frqDb.recordFrqDraft = async (value) => {
      frqDb.drafts.push(value);
      return { data: [{ ledger_id: 'graded-id', status: 'graded', response_version: 7 }] };
    };
    const result = await record({ score: 0 });
    expect(result.body).toMatchObject({ ok: true, applied: false, status: 'graded', clientScoreIgnored: true });
    expect(legacyDb.writes).toHaveLength(0);
  });

  it('fails closed without a legacy insert or receipt when authoritative storage is degraded', async () => {
    mode = 'authoritative';
    frqDb.recordFrqDraft = async () => ({ degraded: true, error: { code: '42883' } });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await record({ score: 1 });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'grading storage unavailable', retryable: true });
    expect(legacyDb.writes).toHaveLength(0);
    expect(result.body.receipt).toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  it('keeps non-canary students on the legacy record path', async () => {
    mode = 'authoritative';
    process.env.FRQ_CANARY_STUDENTS = 'student-b';
    const result = await record({ score: 1 });
    expect(result.status).toBe(200);
    expect(legacyDb.writes).toHaveLength(1);
    expect(frqDb.drafts).toHaveLength(0);
  });

  it('rate-limits authoritative records per student', async () => {
    mode = 'authoritative';
    process.env.FRQ_RECORD_MAX_PER_MINUTE = '2';
    expect((await record()).status).toBe(200);
    expect((await record()).status).toBe(200);
    const limited = await record();
    expect(limited.status).toBe(429);
    expect(limited.body.retryable).toBe(true);
    expect(frqDb.drafts).toHaveLength(2);
  });
});

describe('FRQ per-student ingress windows', () => {
  it('sweeps expired identities and never evicts a live identity count at the hard cap', () => {
    const allow = createStudentSlidingWindow(() => 2, {
      sweepThreshold: 1,
      maxKeys: 2,
    });

    expect(allow('student-a', 0)).toBe(true);
    expect(allow('student-a', 0)).toBe(true);
    expect(allow('student-b', 0)).toBe(true);
    expect(allow('student-c', 0)).toBe(false);
    expect(allow('student-a', 0)).toBe(false);

    expect(allow('student-c', 60_001)).toBe(true);
  });
});

describe('GET /ledger/frq-config and /ledger/frq-status', () => {
  it('requires a bearer token and computes the per-student canary flag in every mode', async () => {
    expect((await server.request('GET', '/ledger/frq-config')).status).toBe(401);

    for (const selectedMode of ['off', 'shadow']) {
      mode = selectedMode;
      const result = await server.request('GET', '/ledger/frq-config', { headers: auth() });
      expect(result.body).toMatchObject({ mode: selectedMode, pollMs: 2_000, authoritative: false });
    }

    mode = 'authoritative';
    process.env.FRQ_CANARY_STUDENTS = 'student-b, student-a';
    let result = await server.request('GET', '/ledger/frq-config', { headers: auth() });
    expect(result.body.authoritative).toBe(true);
    process.env.FRQ_CANARY_STUDENTS = 'student-b';
    result = await server.request('GET', '/ledger/frq-config', { headers: auth() });
    expect(result.body.authoritative).toBe(false);
    process.env.FRQ_CANARY_STUDENTS = '*';
    result = await server.request('GET', '/ledger/frq-config', { headers: auth() });
    expect(result.body.authoritative).toBe(true);
  });

  it('derives states and returns only the allowlisted, sanitized status shape', async () => {
    mode = 'authoritative';
    frqDb.statusRows = [
      {
        ledger_id: 'ledger-graded',
        item_id: 'WS-U1L1-reflect1',
        response: 'SECRET RESPONSE',
        score: 0.5,
        graded_at: '2030-01-01T00:00:00Z',
        receipt_id: 'receipt-id',
        receipt_compact: 'receipt-compact',
        frq_response_hash: 'hash-one',
        frq_result: {
          score: 0.5,
          feedback: 'Useful feedback.',
          matched: ['one'],
          missing: ['two'],
          revisedTextUsed: true,
          responseHash: 'must-not-leak',
          lastAppealText: 'must-not-leak',
        },
        frq_rubric_version: 'SY2627:digest',
        frq_appeal_count: 3,
        frq_claim_token: 'must-not-leak',
        frq_claim_owner: 'must-not-leak',
        frq_last_error: 'must-not-leak',
      },
      {
        ledger_id: 'ledger-retry',
        item_id: 'WS-U1L1-reflect2',
        response: 'A pending response long enough.',
        score: null,
        frq_response_hash: 'hash-two',
        frq_ready_at: '2000-01-01T00:00:00Z',
        frq_next_attempt_at: '2999-01-01T00:00:00Z',
      },
    ];

    const result = await server.request('GET', '/ledger/frq-status?prefix=WS-U1L1', { headers: auth() });
    expect(result.status).toBe(200);
    expect(result.body.items['WS-U1L1-reflect1']).toMatchObject({
      status: 'graded',
      score: 0.5,
      responseHash: 'hash-one',
      receiptId: 'receipt-id',
      receiptCompact: 'receipt-compact',
      receipt: { receiptId: 'receipt-id', compact: 'receipt-compact' },
      appealCount: 3,
      appealLimit: 3,
      result: { score: 0.5, feedback: 'Useful feedback.', matched: ['one'], missing: ['two'], revisedTextUsed: true },
    });
    expect(result.body.items['WS-U1L1-reflect2'].status).toBe('retrying');
    expect(result.body.items['WS-U1L1-reflect2'].estimatedWaitMs).toBe(3_000);
    const serialized = JSON.stringify(result.body);
    for (const secret of ['SECRET RESPONSE', 'must-not-leak', 'frq_claim_token', 'frq_claim_owner', 'frq_last_error']) {
      expect(serialized).not.toContain(secret);
    }
    expect((await server.request('GET', '/ledger/frq-status?prefix=WS-NOPE', { headers: auth() })).status).toBe(400);
  });

  it('lazily derives a response hash for a pre-migration graded row without mutating it', async () => {
    const legacyRow = {
      item_id: 'WS-U1L1-reflect1',
      response: '  A legacy response graded before Phase 2.  ',
      score: 0.5,
      graded_at: '2030-01-01T00:00:00Z',
      frq_response_hash: null,
      frq_result: null,
    };
    frqDb.statusRows = [legacyRow];

    const result = await server.request('GET', '/ledger/frq-status?prefix=WS-U1L1', { headers: auth() });
    const expectedHash = createHash('sha256')
      .update('A legacy response graded before Phase 2.', 'utf8')
      .digest('hex');

    expect(result.status).toBe(200);
    expect(result.body.items['WS-U1L1-reflect1']).toMatchObject({
      status: 'graded',
      score: 0.5,
      responseHash: expectedHash,
      result: null,
    });
    expect(legacyRow.frq_response_hash).toBeNull();
  });

  it('exposes a sanitized last appeal without leaking another student row', async () => {
    const appealedAt = '2030-01-02T03:04:05.000Z';
    frqDb.statusRows = [
      {
        student_id: 'student-a',
        item_id: 'WS-U1L1-reflect1',
        response: 'The authenticated student response.',
        score: 0.5,
        graded_at: '2030-01-02T03:05:00.000Z',
        frq_response_hash: 'student-a-response-hash',
        frq_last_appeal: {
          text: 'Please reconsider my comparison to the rubric.',
          revisedText: 'Private revised answer.',
          hash: 'private-dedup-hash',
          at: appealedAt,
          outcome: 'maintained',
        },
      },
      {
        student_id: 'student-b',
        item_id: 'WS-U1L1-reflect2',
        response: 'Another student response.',
        score: 1,
        graded_at: '2030-01-02T03:05:00.000Z',
        frq_response_hash: 'student-b-response-hash',
        frq_last_appeal: {
          text: 'OTHER STUDENT APPEAL',
          at: appealedAt,
          outcome: 'raised',
        },
      },
    ];

    const result = await server.request('GET', '/ledger/frq-status?prefix=WS-U1L1', { headers: auth() });

    expect(result.status).toBe(200);
    expect(result.body.items['WS-U1L1-reflect1'].lastAppeal).toEqual({
      text: 'Please reconsider my comparison to the rubric.',
      at: appealedAt,
      outcome: 'maintained',
    });
    expect(result.body.items['WS-U1L1-reflect2']).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('Private revised answer.');
    expect(JSON.stringify(result.body)).not.toContain('private-dedup-hash');
    expect(JSON.stringify(result.body)).not.toContain('OTHER STUDENT APPEAL');
  });

  it.each([
    [9, 'draft'],
    [10, 'draft'],
    [19, 'draft'],
    [20, 'queued'],
  ])('uses PostgreSQL-compatible code-point length for %s emoji', async (count, expectedStatus) => {
    frqDb.statusRows = [{
      item_id: 'WS-U1L1-reflect1',
      response: '😀'.repeat(count),
      score: null,
      frq_ready_at: '2000-01-01T00:00:00Z',
    }];
    const result = await server.request('GET', '/ledger/frq-status?prefix=WS-U1L1', { headers: auth() });
    expect(result.body.items['WS-U1L1-reflect1'].status).toBe(expectedStatus);
  });

  it('shares a lighter per-student read budget across config and status', async () => {
    process.env.FRQ_STATUS_MAX_PER_MINUTE = '2';
    expect((await server.request('GET', '/ledger/frq-config', { headers: auth() })).status).toBe(200);
    expect((await server.request('GET', '/ledger/frq-config', { headers: auth() })).status).toBe(200);
    expect((await server.request('GET', '/ledger/frq-status?prefix=WS-U1L1', { headers: auth() })).status).toBe(429);
  });
});

describe('POST /ledger/frq-appeal', () => {
  it('validates auth, item, length, and delegates all stateful limits to one RPC', async () => {
    mode = 'authoritative';
    process.env.FRQ_APPEAL_MAX_PER_MINUTE = '20';
    expect((await server.request('POST', '/ledger/frq-appeal', {
      body: { itemId: 'WS-U1L1-reflect1', appealText: 'Please reconsider.' },
    })).status).toBe(401);
    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(), body: { itemId: 'unknown', appealText: 'Please reconsider.' },
    })).status).toBe(400);
    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(), body: { itemId: 'WS-U1L1-reflect1', appealText: 'short' },
    })).status).toBe(400);
    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(), body: { itemId: 'WS-U1L1-reflect1', appealText: { value: 'not text' } },
    })).status).toBe(400);
    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(), body: { itemId: 'WS-U1L1-reflect1', appealText: '😀'.repeat(9) },
    })).status).toBe(400);
    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(), body: { itemId: 'WS-U1L1-reflect1', appealText: '界'.repeat(683) },
    })).status).toBe(400);

    let result = await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: { itemId: 'WS-U1L1-reflect1', appealText: '  Please reconsider this evidence.  ' },
    });
    expect(result.body).toEqual({ ok: true, queued: true, appealCount: 1 });
    expect(frqDb.appeals[0]).toMatchObject({
      studentId: 'student-a',
      itemId: 'WS-U1L1-reflect1',
      appealText: 'Please reconsider this evidence.',
      revisedText: null,
    });

    for (const [reason, status] of [
      ['duplicate', 409],
      ['not_graded', 409],
      ['cooldown', 429],
      ['limit', 429],
      ['not_found', 404],
    ]) {
      frqDb.appealResult = { queued: false, appeal_count: 3, reason };
      result = await server.request('POST', '/ledger/frq-appeal', {
        headers: auth(),
        body: { itemId: 'WS-U1L1-reflect1', appealText: `Different valid appeal ${reason}` },
      });
      expect(result.status).toBe(status);
      expect(result.body.error).toBe(reason);
    }
  });

  it('caps and canonicalizes revised answers, and ignores a hash-identical revision', async () => {
    mode = 'authoritative';
    process.env.FRQ_APPEAL_MAX_PER_MINUTE = '20';
    const stored = 'A stored answer that has already been graded.';
    frqDb.statusRows = [{
      item_id: 'WS-U1L1-reflect1',
      response: stored,
      score: 0.5,
      frq_response_hash: createHash('sha256').update(stored, 'utf8').digest('hex'),
    }];

    let result = await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: {
        itemId: 'WS-U1L1-reflect1',
        appealText: 'Please review the unchanged answer.',
        revisedText: `  ${stored}  `,
      },
    });
    expect(result.status).toBe(200);
    expect(frqDb.appeals[0].revisedText).toBeNull();

    result = await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: {
        itemId: 'WS-U1L1-reflect1',
        appealText: 'Please review my improved answer.',
        revisedText: '  A revised answer with stronger evidence.  ',
      },
    });
    expect(result.status).toBe(200);
    expect(frqDb.appeals[1].revisedText).toBe('A revised answer with stronger evidence.');

    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: {
        itemId: 'WS-U1L1-reflect1',
        appealText: 'Please review this oversized revision.',
        revisedText: '界'.repeat(2_731),
      },
    })).body.error).toBe('revisedText must be at most 8192 bytes');

    expect((await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: {
        itemId: 'WS-U1L1-reflect1',
        appealText: 'Please review this invalid revision.',
        revisedText: { answer: 'not a string' },
      },
    })).body.error).toBe('revisedText must be a string');
  });

  it.each(['off', 'shadow'])('keeps appeals inert in %s mode', async (selectedMode) => {
    mode = selectedMode;
    const result = await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: { itemId: 'WS-U1L1-reflect1', appealText: 'Please reconsider this evidence.' },
    });
    expect(result).toMatchObject({ status: 409, body: { error: 'appeals not enabled' } });
    expect(frqDb.appeals).toHaveLength(0);
  });

  it('keeps appeals inert outside the authoritative canary', async () => {
    mode = 'authoritative';
    process.env.FRQ_CANARY_STUDENTS = 'student-b';
    const result = await server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: { itemId: 'WS-U1L1-reflect1', appealText: 'Please reconsider this evidence.' },
    });
    expect(result).toMatchObject({ status: 409, body: { error: 'appeals not enabled' } });
    expect(frqDb.appeals).toHaveLength(0);
  });

  it('rate-limits appeals per student', async () => {
    mode = 'authoritative';
    process.env.FRQ_APPEAL_MAX_PER_MINUTE = '1';
    const request = () => server.request('POST', '/ledger/frq-appeal', {
      headers: auth(),
      body: { itemId: 'WS-U1L1-reflect1', appealText: 'Please reconsider this evidence.' },
    });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
    expect(frqDb.appeals).toHaveLength(1);
  });
});

describe('POST /ledger/frq-regrade mode matrix', () => {
  it.each(['off', 'authoritative'])('%s feedbackOnly preserves the score bytes for lower and higher verdicts', async (selectedMode) => {
    mode = selectedMode;
    for (const graderScore of [0, 1]) {
      const existing = { ledger_id: 'existing', item_id: 'WS-U1L1-reflect1', source: 'frq',
        attempt: 1, score: '0.500', response: 'A sufficiently long reflection answer.', frq_result: null };
      const beforeScore = JSON.stringify(existing.score);
      legacyDb.getLedgerByStudent = async () => ({ data: [existing] });
      legacyDb.updateFrqFeedback = vi.fn(async (row, result) => {
        row.frq_result = result;
        return { data: [{ ledger_id: row.ledger_id, score: row.score }] };
      });
      const result = await server.request('POST', '/ledger/frq-regrade', {
        headers: { 'x-teacher-secret': 'teacher-key' },
        body: { studentId: 'student-a', itemId: existing.item_id, score: graderScore, feedbackOnly: true,
          responseHash: createHash('sha256').update(existing.response).digest('hex'), rubricVersion: 'version',
          feedback: 'Why', matched: ['Known'], missing: ['Context'] },
      });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ applied: true, score: '0.500' });
      expect(JSON.stringify(existing.score)).toBe(beforeScore);
      expect(existing.frq_result).toMatchObject({ score: '0.500', provider: 'ai-backfill', missing: ['Context'] });
      expect(legacyDb.writes).toEqual([]);
      expect(frqDb.applies).toEqual([]);
    }
  });
  it('feedbackOnly rejects stale text, ungraded rows and concurrent updates; skips detailed rows', async () => {
    const existing = { ledger_id: 'existing', item_id: 'WS-U1L1-reflect1', source: 'frq',
      attempt: 1, score: 1, response: 'A sufficiently long reflection answer.', frq_result: null };
    legacyDb.getLedgerByStudent = async () => ({ data: [existing] });
    legacyDb.updateFrqFeedback = vi.fn(async () => ({ data: [] }));
    const body = { studentId: 'student-a', itemId: existing.item_id, score: 0, feedbackOnly: true,
      responseHash: 'stale', rubricVersion: 'version', matched: [], missing: ['Context'] };
    const post = () => server.request('POST', '/ledger/frq-regrade', {
      headers: { 'x-teacher-secret': 'teacher-key' }, body,
    });
    expect((await post()).status).toBe(409);
    expect(legacyDb.updateFrqFeedback).not.toHaveBeenCalled();
    body.responseHash = createHash('sha256').update(existing.response).digest('hex');
    existing.score = null;
    expect((await post()).body.error).toBe('ungraded-row');
    existing.score = 1;
    existing.frq_result = { missing: [] };
    expect((await post()).body.applied).toBe(false);
    existing.frq_result = null;
    expect((await post()).body.error).toBe('stale-response');
    expect(legacyDb.writes).toEqual([]);
    expect(frqDb.applies).toEqual([]);
  });
  it.each(['off', 'authoritative'])('%s preserves bounded matched, missing and suggestion', async (selectedMode) => {
    mode = selectedMode;
    const existing = { ledger_id: 'existing', item_id: 'WS-U1L1-reflect1', source: 'frq',
      attempt: 1, score: null, response: 'A sufficiently long reflection answer.', frq_response_version: 1 };
    legacyDb.getLedgerByStudent = async () => ({ data: [existing] });
    frqDb.statusRows = [existing];
    const result = await server.request('POST', '/ledger/frq-regrade', {
      headers: { 'x-teacher-secret': 'teacher-key' },
      body: { studentId: 'student-a', itemId: existing.item_id, score: 0.5,
        responseHash: 'hash', rubricVersion: 'version', feedback: 'Why',
        matched: ['Known'], missing: Array(40).fill('x'.repeat(600)), suggestion: 's'.repeat(3000) },
    });
    expect(result.status).toBe(200);
    const detail = selectedMode === 'off' ? legacyDb.writes[0].frqResult : frqDb.applies[0].result;
    expect(detail.matched).toEqual(['Known']);
    expect(detail.missing).toHaveLength(32);
    expect(detail.missing[0]).toHaveLength(512);
    expect(detail.suggestion).toHaveLength(2048);
  });
  it('keeps legacy teacher behavior in off and shadow', async () => {
    for (const selectedMode of ['off', 'shadow']) {
      mode = selectedMode;
      legacyDb.getLedgerByStudent = async () => ({ data: [{
        ledger_id: 'existing',
        student_id: 'student-a',
        source: 'frq',
        item_id: 'WS-U1L1-reflect1',
        attempt: 1,
        response: 'Original response',
        score: null,
        evidence_tier: 'practice',
      }], error: null });
      const result = await server.request('POST', '/ledger/frq-regrade', {
        headers: { 'x-teacher-secret': 'teacher-key' },
        body: { studentId: 'student-a', itemId: 'WS-U1L1-reflect1', score: 0.5, provenance: 'ai-batch', feedback: ' Why. ' },
      });
      expect(result.status).toBe(200);
      expect(legacyDb.writes.at(-1).score).toBe(0.5);
      // 2026-09-09: the legacy path stores the verdict + feedback too
      expect(legacyDb.writes.at(-1).frqResult).toEqual({ score: 0.5, provider: 'ai-batch', model: 'external-regrade', feedback: 'Why.' });
      expect(typeof legacyDb.writes.at(-1).gradedAt).toBe('string');
    }
  });

  it('authoritative requires hash/version, returns stale 409, and preserves floor-held 200', async () => {
    mode = 'authoritative';
    frqDb.statusRows = [{
      ledger_id: 'atomic-ledger',
      student_id: 'student-a',
      item_id: 'WS-U1L1-reflect1',
      attempt: 1,
      response: 'Original response',
      score: 0.5,
      evidence_tier: 'practice',
      frq_response_version: 4,
      frq_response_hash: 'response-hash',
    }];
    const endpoint = (body) => server.request('POST', '/ledger/frq-regrade', {
      headers: { 'x-teacher-secret': 'teacher-key' },
      body: { studentId: 'student-a', itemId: 'WS-U1L1-reflect1', score: 1, ...body },
    });
    expect((await endpoint({})).status).toBe(400);

    frqDb.applyFrqVerdict = async (value) => {
      frqDb.applies.push(value);
      return { data: [{ ledger_id: value.ledgerId, applied: false, stale: true, score: 0.5 }] };
    };
    expect((await endpoint({ responseHash: 'stale', rubricVersion: 'SY2627:digest' })).status).toBe(409);

    frqDb.applyFrqVerdict = async (value) => ({
      data: [{ ledger_id: value.ledgerId, applied: false, stale: false, score: 1 }],
    });
    const floor = await endpoint({ responseHash: 'response-hash', rubricVersion: 'SY2627:digest' });
    expect(floor.status).toBe(200);
    expect(floor.body).toMatchObject({ ok: true, applied: false, score: 1 });
  });

  // 2026-09-09: the hourly batch grader now sends its feedback with the verdict; the
  // route stores it (trimmed, capped like sanitizedFrqResult) and labels the provider
  // honestly so the worksheet can say "Auto-graded from your saved answer: …why…".
  it('authoritative stores the grader feedback + provider label in the applied result', async () => {
    mode = 'authoritative';
    frqDb.statusRows = [{
      ledger_id: 'atomic-ledger',
      student_id: 'student-a',
      item_id: 'WS-U1L1-reflect1',
      attempt: 1,
      response: 'Original response',
      score: null,
      evidence_tier: 'practice',
      frq_response_version: 2,
      frq_response_hash: 'response-hash',
    }];
    frqDb.applyFrqVerdict = async (value) => {
      frqDb.applies.push(value);
      return { data: [{ ledger_id: value.ledgerId, applied: true, stale: false, score: value.score }] };
    };
    const endpoint = (body) => server.request('POST', '/ledger/frq-regrade', {
      headers: { 'x-teacher-secret': 'teacher-key' },
      body: { studentId: 'student-a', itemId: 'WS-U1L1-reflect1', score: 0.5,
              responseHash: 'response-hash', rubricVersion: 'SY2627:digest', ...body },
    });

    const batch = await endpoint({ provenance: 'ai-batch', feedback: '  Name the variable type.  ' });
    expect(batch.status).toBe(200);
    expect(frqDb.applies.at(-1).result).toMatchObject({
      score: 0.5, provider: 'ai-batch', model: 'external-regrade', feedback: 'Name the variable type.',
    });

    const teacher = await endpoint({ provenance: 'teacher', feedback: 'x'.repeat(3000) });
    expect(teacher.status).toBe(200);
    expect(frqDb.applies.at(-1).result.provider).toBe('teacher');
    expect(frqDb.applies.at(-1).result.feedback).toHaveLength(2048);

    // no provenance → 'ai-batch', matching the receipt's gradingProvenance default
    const silent = await endpoint({ feedback: 42 });
    expect(silent.status).toBe(200);
    expect(frqDb.applies.at(-1).result.provider).toBe('ai-batch');
    expect(frqDb.applies.at(-1).result).not.toHaveProperty('feedback');
  });

  it('keeps an authoritative-mode non-canary null row on the legacy teacher path', async () => {
    mode = 'authoritative';
    process.env.FRQ_CANARY_STUDENTS = 'student-b';
    legacyDb.getLedgerByStudent = async () => ({ data: [{
      ledger_id: 'legacy-null-row',
      student_id: 'student-a',
      source: 'frq',
      item_id: 'WS-U1L1-reflect1',
      attempt: 1,
      response: 'Original legacy response',
      score: null,
      evidence_tier: 'practice',
    }], error: null });

    const result = await server.request('POST', '/ledger/frq-regrade', {
      headers: { 'x-teacher-secret': 'teacher-key' },
      body: { studentId: 'student-a', itemId: 'WS-U1L1-reflect1', score: 0.5 },
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, applied: true, score: 0.5 });
    expect(legacyDb.writes.at(-1).score).toBe(0.5);
    expect(frqDb.applies).toHaveLength(0);
  });
});
