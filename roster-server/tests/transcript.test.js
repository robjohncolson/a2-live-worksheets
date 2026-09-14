import crypto from 'node:crypto';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { computeGrade } from '../grade.js';
import { receiptInternals, initReceipts } from '../receipts.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';
const TEST_PUBLIC_KEY = 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc';

const ANSWER_KEY_DOC = {
  answerKey: {
    'U1-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1', topic: '1.1' }
  }
};
const ANSWER_KEY_MAP = ANSWER_KEY_DOC.answerKey;
const CONFIG = {
  C: 85,
  feederWeights: { W: 1, Q: 2 },
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  frqBand: { E: 100, P: 70, I: 35 },
  diagnosticTheta: 0.65,
  quarters: {
    Q1: { units: [1], start: '2026-01-01', end: '2026-12-31', pcAnchor: { p85: 40, p100: 60 } }
  },
  schoolTz: 'America/New_York',
  gradingWindowStart: null,
  useV3: false,
  v3LessonsExcludeQuiz: true
};

function decodeCompact(compact) {
  const [payloadB64, sigB64] = compact.split('.');
  const bytes = Buffer.from(payloadB64, 'base64url');
  return {
    bytes,
    sig: Buffer.from(sigB64, 'base64url'),
    payload: JSON.parse(bytes.toString('utf8'))
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function receiptId(compact) {
  return sha256Hex(decodeCompact(compact).bytes);
}

function createFakeRosterDb(studentId) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async findByStudentId(sid) {
      return {
        data: sid === studentId
          ? { student_id: sid, login_username: 'Apple_Monkey', section: 'PeriodB' }
          : null,
        error: null
      };
    },
    async listRoster() { return { data: [], error: null }; }
  };
}

function createFakeLedgerDb(rows) {
  const store = rows.map((row, index) => ({ ledger_id: `ledger-${index + 1}`, ...row }));
  return {
    store,
    async getLedgerByStudent(studentId) {
      return { data: store.filter((row) => row.student_id === studentId), error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      const row = store.find((entry) => entry.ledger_id === ledgerId);
      if (row) {
        row.receipt_id = receiptId;
        row.receipt_compact = receiptCompact;
      }
      return { error: null };
    },
    async insertLedgerRow() { return { data: {}, error: null }; }
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

  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    return { status: res.status, body: await res.json() };
  }
}

describe('GET /transcript', () => {
  let srv;
  let token;
  let studentId;
  let ledgerDb;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ROSTER_TOKEN_SECRET = `token-${crypto.randomBytes(12).toString('hex')}`;
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T16:00:00Z'));
    studentId = '00000000-0000-4000-8000-000000000000';
    token = signToken(studentId);
  });

  afterEach(async () => {
    if (srv) await srv.stop();
    srv = null;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.ROSTER_TOKEN_SECRET;
    vi.useRealTimers();
    initReceipts();
  });

  async function start(rows) {
    ledgerDb = createFakeLedgerDb(rows.map((row) => ({ ...row, student_id: studentId })));
    const app = createApp(
      createFakeRosterDb(studentId),
      ledgerDb,
      async () => ({ units: [] }),
      async () => ANSWER_KEY_DOC,
      undefined,
      undefined,
      undefined,
      null,
      CONFIG
    );
    srv = new TestServer(app);
    await srv.start();
  }

  function row(overrides = {}) {
    return {
      source: 'curriculum_quiz',
      item_id: 'U1-L1-Q01',
      response: 'A',
      score: null,
      evidence_tier: 'practice',
      attempt: 1,
      recorded_at: '2026-06-01T00:00:00.000Z',
      ...overrides
    };
  }

  it('returns a verifying manifest with matching root, count, backfill, and grade', async () => {
    await start([row()]);

    const { status, body } = await srv.get('/transcript', {
      Authorization: `Bearer ${token}`
    });
    const transcript = body.transcript;
    const manifest = decodeCompact(transcript.manifest);
    const publicKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: TEST_PUBLIC_KEY },
      format: 'jwk'
    });
    const memberIds = transcript.receipts.map(receiptId);
    const root = sha256Hex([...memberIds].sort().join('\n'));
    const expectedGrade = computeGrade(ledgerDb.store, ANSWER_KEY_MAP, CONFIG, {
      asOf: Date.now(),
      lessonSchedule: null,
      section: 'PeriodB',
      worksheetBlankCounts: null,
      blooketLessons: null
    });

    expect(status).toBe(200);
    expect(crypto.verify(null, manifest.bytes, publicKey, manifest.sig)).toBe(true);
    expect(manifest.payload.t).toBe('transcript');
    expect(manifest.payload.sid).toBe(studentId);
    expect(manifest.payload.root).toBe(root);
    expect(manifest.payload.cnt).toBe(transcript.receipts.length);
    expect(transcript.count).toBe(transcript.receipts.length);
    expect(ledgerDb.store[0].receipt_compact).toBeTruthy();
    expect(manifest.payload.g).toBe(expectedGrade.quarters.Q1.quarterGrade);
  });

  it('backfills receipts for previously unreceipted rows', async () => {
    await start([row(), row({ item_id: 'U1-L1-Q01#2', response: 'B' })]);

    const { body } = await srv.get('/transcript', {
      Authorization: `Bearer ${token}`
    });

    expect(body.transcript.receipts).toHaveLength(2);
    expect(ledgerDb.store.every((entry) => entry.receipt_id && entry.receipt_compact)).toBe(true);
  });

  it('backfills a receipt signed with the row recorded_at timestamp', async () => {
    await start([row({ recorded_at: '2026-05-20T14:30:00.000Z' })]);

    await srv.get('/transcript', {
      Authorization: `Bearer ${token}`
    });

    expect(decodeCompact(ledgerDb.store[0].receipt_compact).payload.ts)
      .toBe(Date.parse('2026-05-20T14:30:00.000Z'));
  });
});
