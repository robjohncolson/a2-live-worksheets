import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { scoreWorksheetAnswer } from '../ledger.js';

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'not used' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used' } }; },
  };
}

function createFakeLedgerDb() {
  const store = new Map();
  return {
    store,
    async insertLedgerRow(row) {
      const key = `${row.studentId}|${row.source}|${row.itemId}|${row.attempt}`;
      const stored = {
        ledger_id: `ledger-${store.size + 1}`,
        student_id: row.studentId,
        source: row.source,
        item_id: row.itemId,
        response: row.response,
        score: row.score ?? null,
        evidence_tier: row.evidenceTier,
        attempt: row.attempt,
      };
      store.set(key, stored);
      return { data: { ledger_id: stored.ledger_id, evidence_tier: stored.evidence_tier }, error: null };
    },
  };
}

class TestServer {
  constructor(app) {
    this.server = http.createServer(app);
    this.baseUrl = null;
  }

  start() {
    return new Promise(resolve => {
      this.server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
        resolve();
      });
    });
  }

  stop() {
    return new Promise(resolve => this.server.close(resolve));
  }

  async post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
}

let ledgerDb;
let srv;
let validStudentId;
let validToken;

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ROSTER_TOKEN_SECRET = `token-${randomBytes(16).toString('hex')}`;
  validStudentId = `student-${randomBytes(8).toString('hex')}`;
  validToken = signToken(validStudentId);
  ledgerDb = createFakeLedgerDb();
  const worksheetKey = {
    worksheetKey: {
      'WS-U7L1-Q1': 'means|mean',
      'WS-U7L1-Q2': '12.49',
    },
  };
  const app = createApp(
    createFakeRosterDb(),
    ledgerDb,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    worksheetKey
  );
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TOKEN_SECRET;
});

function record(overrides = {}) {
  return srv.post('/ledger/record', {
    token: validToken,
    source: 'worksheet',
    itemId: 'WS-U7L1-Q1',
    response: 'mean',
    score: 0,
    ...overrides,
  });
}

describe('worksheet server-side recompute', () => {
  it('matches live worksheet checkAnswer semantics', () => {
    expect(scoreWorksheetAnswer('means|mean', 'Mean!')).toBe(1);
    expect(scoreWorksheetAnswer('means|mean', 'sample mean')).toBe(0.5);
    expect(scoreWorksheetAnswer('means|mean', 'median')).toBe(0);
    expect(scoreWorksheetAnswer('12.49', '12.49')).toBe(1);
  });

  it('stores the recomputed score for keyed worksheet items', async () => {
    const { status, body } = await record({ response: 'wrong', score: 1 });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const row = [...ledgerDb.store.values()][0];
    expect(row.score).toBe(0);
  });

  it('keeps client score for worksheet items not in the key', async () => {
    const { status, body } = await record({
      itemId: 'WS-UNKNOWN-Q1',
      response: 'wrong',
      score: 1,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const row = [...ledgerDb.store.values()][0];
    expect(row.score).toBe(1);
  });
});
