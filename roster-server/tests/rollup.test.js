// rollup.test.js — tests for GET /rollup (Gradebook Phase 2b).
// Fake in-memory ledgerDb + inline fixture answer-key. NO network/Supabase,
// NO dependency on data/answer-key.json existing. Node http + fetch.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { normalizeResponse } from '../rollup.js';

// ── Fixture answer key (build-answer-key.mjs output shape) ────────────────────
const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U1-L2-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1', topic: '1.2' },
    'U2-L1-Q01': { answerKey: 'D', type: 'multiple-choice', unit: '2', topic: '2.1' },
    // U1-L1-Q99 intentionally absent → ungradable.
  },
};

// ── Fake roster db (only needed for createApp signature) ──────────────────────
function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'unused' } }; },
    async findByUsername() { return { data: null, error: { message: 'unused' } }; },
  };
}

// ── Fake ledger db ────────────────────────────────────────────────────────────
function createFakeLedgerDb(rows, { error = null } = {}) {
  const store = [...rows];
  return {
    _store: store,
    async getLedgerByStudent(studentId) {
      if (error) return error === 'throw' ? Promise.reject(new Error('boom')) : { data: null, error };
      return { data: store.filter(r => r.student_id === studentId), error: null };
    },
    // A write method exists; /rollup must NEVER call it (read-only).
    async insertLedgerRow() { store.push({ _written: true }); return { data: {}, error: null }; },
  };
}

function makeRow(studentId, itemId, response, { source = 'curriculum_quiz', attempt = 1, recorded_at } = {}) {
  return {
    student_id: studentId,
    source,
    item_id: itemId,
    response,
    score: null,
    attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise(r => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise(r => this.server.close(r)); }
  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    return { status: res.status, body: await res.json() };
  }
}

async function startServer(rows = [], { loadAnswerKey = okAnswerKey, ledgerOpts = {} } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-rollup-${randomBytes(8).toString('hex')}`;
  const token = signToken(studentId);
  // All fixture rows belong to the test student (matches donow harness intent;
  // any caller-supplied student_id is overridden so the signed token matches).
  const ledgerDb = createFakeLedgerDb(rows.map(r => ({ ...r, student_id: studentId })), ledgerOpts);
  const app = createApp(createFakeRosterDb(), ledgerDb, fakeLoadManifest, loadAnswerKey);
  const server = new TestServer(app);
  await server.start();
  return { server, studentId, token, ledgerDb };
}

let srv;
afterEach(async () => { if (srv) await srv.stop(); delete process.env.ROSTER_TOKEN_SECRET; });

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('GET /rollup — auth', () => {
  it('401 without a token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status, body } = await srv.get('/rollup');
    expect(status).toBe(401); expect(body.ok).toBe(false);
  });
  it('401 with an invalid token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status } = await srv.get('/rollup?token=garbage');
    expect(status).toBe(401);
  });
});

// ── Scoring + aggregation ─────────────────────────────────────────────────────
describe('GET /rollup — scoring', () => {
  it('per-unit + totals from latest attempt; cr letter-compare (trim/case)', async () => {
    const sid = `uuid-rollup-fixed`;
    const rows = [
      makeRow(sid, 'U1-L1-Q01', 'B'),            // correct
      makeRow(sid, 'U1-L1-Q02', { value: 'a' }), // key C → incorrect
      makeRow(sid, 'U1-L2-Q01', ' a '),          // key A → correct (trim/case)
      makeRow(sid, 'U2-L1-Q01', 'D'),            // correct
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status, body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.units.U1).toMatchObject({ attempted: 3, graded: 3, correct: 2, crQuizPct: 66.7 });
    expect(body.units.U2).toMatchObject({ attempted: 1, graded: 1, correct: 1, crQuizPct: 100 });
    expect(body.totals).toMatchObject({ attempted: 4, graded: 4, correct: 3, ungradable: 0 });
  });

  it('latest attempt wins (attempt 2 supersedes attempt 1)', async () => {
    const sid = 'uuid-rollup-att';
    const rows = [
      makeRow(sid, 'U1-L1-Q01', 'A', { attempt: 1 }),  // wrong
      makeRow(sid, 'U1-L1-Q01', 'B', { attempt: 2 }),  // right → wins
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(body.units.U1).toMatchObject({ attempted: 1, graded: 1, correct: 1 });
  });

  it('item with no answer-key entry → ungradable (excluded from graded denominator)', async () => {
    const sid = 'uuid-rollup-ung';
    const rows = [
      makeRow(sid, 'U1-L1-Q01', 'B'),    // graded, correct
      makeRow(sid, 'U1-L1-Q99', 'Z'),    // no key → ungradable
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(body.units.U1).toMatchObject({ attempted: 2, graded: 1, correct: 1, ungradable: 1, crQuizPct: 100 });
  });

  it('only source=curriculum_quiz is aggregated (worksheet/frq/pc ignored)', async () => {
    const sid = 'uuid-rollup-src';
    const rows = [
      makeRow(sid, 'U1-L1-Q01', 'B', { source: 'curriculum_quiz' }),
      makeRow(sid, 'WS-U1L1-Q1', 'x', { source: 'worksheet' }),
      makeRow(sid, 'U1-PC-MCQ-A-Q01', 'B', { source: 'pc' }),
      makeRow(sid, 'u1-frq-z', 'x', { source: 'frq' }),
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(body.totals.attempted).toBe(1);
    expect(body.units.U1.attempted).toBe(1);
  });

  it('empty ledger → empty units, zeroed totals, null pct', async () => {
    const ctx = await startServer([]); srv = ctx.server;
    const { body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(body.units).toEqual({});
    expect(body.totals).toMatchObject({ attempted: 0, graded: 0, correct: 0, ungradable: 0, crQuizPct: null });
  });

  it('malformed rows tolerated (no throw / no 500)', async () => {
    const sid = 'uuid-rollup-mal';
    const rows = [
      { student_id: sid, source: 'curriculum_quiz' },                 // no item_id
      makeRow(sid, 'U1-L1-Q01', null),                                // null response → incorrect (graded)
      makeRow(sid, 'U1-L1-Q02', { nope: 1 }),                          // unnormalizable → incorrect (graded)
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status, body } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(status).toBe(200);
    expect(body.units.U1).toMatchObject({ attempted: 2, graded: 2, correct: 0 });
  });
});

// ── Robustness ────────────────────────────────────────────────────────────────
describe('GET /rollup — robustness', () => {
  it('ledger db error → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: { message: 'db down' } } });
    srv = ctx.server;
    const { status } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(status).toBe(500);
  });

  it('ledger db throw → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: 'throw' } });
    srv = ctx.server;
    const { status } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(status).toBe(500);
  });

  it('answer-key load failure → 500', async () => {
    const ctx = await startServer([], { loadAnswerKey: async () => { throw new Error('no key'); } });
    srv = ctx.server;
    const { status } = await srv.get(`/rollup?token=${ctx.token}`);
    expect(status).toBe(500);
  });

  it('answer-key wrong shape (parseable but invalid) → 500, not silent all-ungradable', async () => {
    for (const bad of [null, {}, { answerKey: 'oops' }, { answerKey: ['a'] }, 'string']) {
      const sid = 'x';
      const ctx = await startServer([makeRow(sid, 'U1-L1-Q01', 'B')], { loadAnswerKey: async () => bad });
      srv = ctx.server;
      const { status, body } = await srv.get(`/rollup?token=${ctx.token}`);
      expect(status).toBe(500);
      expect(body.ok).toBe(false);
      await srv.stop(); srv = null;
    }
  });

  it('read-only: /rollup never writes to the ledger store', async () => {
    const sid = 'uuid-rollup-ro';
    const rows = [makeRow(sid, 'U1-L1-Q01', 'B')];
    const ctx = await startServer(rows); srv = ctx.server;
    const before = ctx.ledgerDb._store.length;
    await srv.get(`/rollup?token=${ctx.token}`);
    expect(ctx.ledgerDb._store.length).toBe(before);
    expect(ctx.ledgerDb._store.some(r => r._written)).toBe(false);
  });
});

// ── normalizeResponse unit ────────────────────────────────────────────────────
describe('normalizeResponse', () => {
  it('handles string / number / object / array / nullish', () => {
    expect(normalizeResponse(' B ')).toBe('b');
    expect(normalizeResponse(3)).toBe('3');
    expect(normalizeResponse({ value: 'C' })).toBe('c');
    expect(normalizeResponse({ answer: 'd' })).toBe('d');
    expect(normalizeResponse(['A'])).toBe('a');
    expect(normalizeResponse(null)).toBe(null);
    expect(normalizeResponse({ nope: 1 })).toBe(null);
  });
});
