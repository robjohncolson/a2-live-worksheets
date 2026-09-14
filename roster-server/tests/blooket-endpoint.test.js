// blooket-endpoint.test.js -- POST /class/blooket (Unit A6 of
// BLOOKET_IMPORT_P2_BUILD.md). Teacher-gated; computes blooketScore per entry
// and writes source='blooket' rows via the same insertLedgerRow the
// /ledger/record route uses. Asserts: 200 records the right itemId+score, 401
// without the secret, 503 on a pre-migration check-constraint reject, malformed
// entries collected (not fatal). Mirrors class.test.js's createFakeDb +
// TestServer pattern. NO network/Supabase.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { blooketScore } from '../scoring.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: { 'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' } },
};
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => ({ 'U1-L1-Q01': { skill: '1.A' } });
const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });

function createFakeRosterDb(roster) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      const rows = section ? roster.filter(r => r.section === section) : roster.slice();
      return { data: rows, error: null };
    },
  };
}

// Fake ledger db that captures every insertLedgerRow call. insertError lets a
// test simulate a DB reject (e.g. the pre-migration check-constraint violation).
function createCapturingLedgerDb({ insertError = null, insertThrow = null } = {}) {
  const inserts = [];
  return {
    _inserts: inserts,
    async getLedgerByStudent() { return { data: [], error: null }; },
    async insertLedgerRow(args) {
      inserts.push(args);
      if (insertThrow) throw insertThrow;
      if (insertError) return { data: null, error: insertError };
      return { data: { ledger_id: 'lid-' + inserts.length, evidence_tier: args.evidenceTier }, error: null };
    },
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise(r => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise(r => this.server.close(r)); }
  async post(path, body, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { parsed = null; }
    return { status: res.status, body: parsed };
  }
}

async function startServer({ roster = [], ledgerDb } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  delete process.env.TEACHER_KEY;   // keep the simple-key default unset for 'wrong secret → 401'
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt);
  const server = new TestServer(app);
  await server.start();
  return { server, rosterDb, ledgerDb };
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.TEACHER_KEY;
});

describe('POST /class/blooket -- auth', () => {
  it('401 without x-teacher-secret', async () => {
    const ctx = await startServer({ ledgerDb: createCapturingLedgerDb() });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', { lessonKey: '1.2', total: 30, entries: [] });
    expect(r.status).toBe(401);
    expect(ctx.ledgerDb._inserts).toHaveLength(0);
  });

  it('401 with a wrong secret', async () => {
    const ctx = await startServer({ ledgerDb: createCapturingLedgerDb() });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', { lessonKey: '1.2', total: 30, entries: [] }, { 'x-teacher-secret': 'bogus' });
    expect(r.status).toBe(401);
  });
});

describe('POST /class/blooket -- happy path records rows', () => {
  it('writes source=blooket rows with the right itemId + computed score', async () => {
    const ledgerDb = createCapturingLedgerDb();
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;

    const r = await srv.post('/class/blooket', {
      lessonKey: '1.2', total: 30,
      entries: [
        { studentId: 's1', correct: 30, attempted: 30 }, // -> 1.0
        { studentId: 's2', correct: 20, attempted: 25 }, // -> 0.6667
      ],
    }, { 'x-teacher-secret': TEACHER });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.itemId).toBe('BLOOKET-U1L2');
    expect(r.body.recorded).toBe(2);
    expect(r.body.skipped).toBe(0);
    expect(r.body.errors).toEqual([]);

    expect(ledgerDb._inserts).toHaveLength(2);
    const [a, b] = ledgerDb._inserts;
    expect(a).toMatchObject({ studentId: 's1', source: 'blooket', itemId: 'BLOOKET-U1L2', unit: 'U1', attempt: 1, evidenceTier: 'practice' });
    expect(a.score).toBeCloseTo(blooketScore(30, 30, 30), 6);
    expect(a.response).toEqual({ correct: 30, attempted: 30, total: 30 });
    expect(b.score).toBeCloseTo(blooketScore(20, 25, 30), 6);
  });

  it('builds a combined itemId for a dashed lessonKey ("4.1-2" -> BLOOKET-U4L1-2)', async () => {
    const ledgerDb = createCapturingLedgerDb();
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: '4.1-2', total: 20, entries: [{ studentId: 's1', correct: 10, attempted: 20 }],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.itemId).toBe('BLOOKET-U4L1-2');
    expect(ledgerDb._inserts[0].itemId).toBe('BLOOKET-U4L1-2');
  });

  it('accepts a "U"-prefixed lessonKey ("U1.2")', async () => {
    const ledgerDb = createCapturingLedgerDb();
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: 'U1.2', total: 30, entries: [{ studentId: 's1', correct: 15, attempted: 15 }],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.itemId).toBe('BLOOKET-U1L2');
  });
});

describe('POST /class/blooket -- validation', () => {
  it('400 on a bad lessonKey', async () => {
    const ctx = await startServer({ ledgerDb: createCapturingLedgerDb() });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', { lessonKey: 'garbage', total: 30, entries: [] }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
  });

  it('400 on a non-positive total', async () => {
    const ctx = await startServer({ ledgerDb: createCapturingLedgerDb() });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', { lessonKey: '1.2', total: 0, entries: [] }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
  });

  it('400 when entries is not an array', async () => {
    const ctx = await startServer({ ledgerDb: createCapturingLedgerDb() });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', { lessonKey: '1.2', total: 30, entries: 'nope' }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
  });

  it('a malformed entry is collected in errors, not fatal -- good rows still record', async () => {
    const ledgerDb = createCapturingLedgerDb();
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: '1.2', total: 30,
      entries: [
        { studentId: 's1', correct: 30, attempted: 30 }, // good
        { correct: 5, attempted: 5 },                    // no studentId -> skipped
        { studentId: 's3', correct: -2, attempted: 5 },  // negative correct -> skipped
        { studentId: 's4', correct: 'x', attempted: 5 }, // NaN correct -> skipped
      ],
    }, { 'x-teacher-secret': TEACHER });

    expect(r.status).toBe(200);
    expect(r.body.recorded).toBe(1);
    expect(r.body.skipped).toBe(3);
    expect(r.body.errors).toHaveLength(3);
    // only the one good row was written
    expect(ledgerDb._inserts).toHaveLength(1);
    expect(ledgerDb._inserts[0].studentId).toBe('s1');
  });
});

describe('POST /class/blooket -- pre-migration 503', () => {
  it('503 when the DB rejects the blooket source (check_violation 23514)', async () => {
    const ledgerDb = createCapturingLedgerDb({
      insertError: { code: '23514', message: 'new row for relation "item_ledger" violates check constraint "item_ledger_source_check"' },
    });
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: '1.2', total: 30, entries: [{ studentId: 's1', correct: 30, attempted: 30 }],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('blooket source not provisioned');
  });

  it('503 when the insert THROWS the check-constraint error', async () => {
    const err = new Error('violates check constraint item_ledger_source_check');
    const ledgerDb = createCapturingLedgerDb({ insertThrow: err });
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: '1.2', total: 30, entries: [{ studentId: 's1', correct: 30, attempted: 30 }],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
  });

  it('500 (not 503) on an unrelated DB error', async () => {
    const ledgerDb = createCapturingLedgerDb({
      insertError: { code: '08006', message: 'connection failure' },
    });
    const ctx = await startServer({ ledgerDb });
    srv = ctx.server;
    const r = await srv.post('/class/blooket', {
      lessonKey: '1.2', total: 30, entries: [{ studentId: 's1', correct: 30, attempted: 30 }],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(500);
  });
});
