import http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { initReceipts } from '../receipts.js';

const TEACHER = 'teacher-secret-fixture';
const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';

function makeRosterDb(roster) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      return {
        data: section ? roster.filter((row) => row.section === section) : roster.slice(),
        error: null
      };
    }
  };
}

function makeLedgerDb(rowsByStudent) {
  return {
    rowsByStudent,
    async getLedgerByStudent(studentId) {
      return { data: rowsByStudent[studentId] || [], error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      for (const rows of Object.values(rowsByStudent)) {
        const row = rows.find((entry) => entry.ledger_id === ledgerId);
        if (!row) continue;
        row.receipt_id = receiptId;
        row.receipt_compact = receiptCompact;
        return { error: null };
      }
      return { error: null };
    },
    async insertLedgerRow() { return { data: {}, error: null }; }
  };
}

function row(studentId, itemId, overrides = {}) {
  return {
    ledger_id: `${studentId}-${itemId}`,
    student_id: studentId,
    source: 'curriculum_quiz',
    item_id: itemId,
    response: 'A',
    score: null,
    evidence_tier: 'practice',
    attempt: 1,
    recorded_at: '2026-06-01T10:00:00.000Z',
    ...overrides
  };
}

class TestServer {
  constructor(app) {
    this.server = http.createServer(app);
    this.baseUrl = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  async post(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers });
    return { status: res.status, body: await res.json() };
  }
}

describe('POST /class/backfill-receipts', () => {
  let srv;

  afterEach(async () => {
    if (srv) await srv.stop();
    srv = null;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    initReceipts();
  });

  async function start(roster, rowsByStudent) {
    process.env.NODE_ENV = 'test';
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    const ledgerDb = makeLedgerDb(rowsByStudent);
    const app = createApp(
      makeRosterDb(roster),
      ledgerDb,
      async () => ({ units: [] }),
      async () => ({ answerKey: {} }),
      null,
      null
    );
    srv = new TestServer(app);
    await srv.start();
    return ledgerDb;
  }

  it('requires teacher auth', async () => {
    await start([{ student_id: 's1', login_username: 'alpha', section: 'P1' }], {
      s1: [row('s1', 'U1-L1-Q01')]
    });

    expect((await srv.post('/class/backfill-receipts')).status).toBe(401);
  });

  it('backfills only receiptless rows and is idempotent on a second run', async () => {
    const existingReceipt = 'eyJ0IjoibGVkZ2VyIn0.signature';
    const ledgerDb = await start(
      [
        { student_id: 's1', login_username: 'alpha', section: 'P1' },
        { student_id: 's2', login_username: 'beta', section: 'P1' },
        { student_id: 's3', login_username: 'gamma', section: 'P2' }
      ],
      {
        s1: [
          row('s1', 'U1-L1-Q01'),
          row('s1', 'U1-L1-Q02', { receipt_id: 'existing', receipt_compact: existingReceipt })
        ],
        s2: [row('s2', 'U2-L1-Q01')],
        s3: [row('s3', 'U1-L1-Q01')]
      }
    );

    const first = await srv.post('/class/backfill-receipts?section=P1', { 'x-teacher-secret': TEACHER });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      studentsProcessed: 2,
      receiptsBackfilled: 2,
      errors: []
    });
    expect(ledgerDb.rowsByStudent.s1[0].receipt_compact).toBeTruthy();
    expect(ledgerDb.rowsByStudent.s1[1].receipt_compact).toBe(existingReceipt);
    expect(ledgerDb.rowsByStudent.s2[0].receipt_compact).toBeTruthy();
    expect(ledgerDb.rowsByStudent.s3[0].receipt_compact).toBeUndefined();

    const second = await srv.post('/class/backfill-receipts?section=P1', { 'x-teacher-secret': TEACHER });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      ok: true,
      studentsProcessed: 2,
      receiptsBackfilled: 0,
      errors: []
    });
  });
});
