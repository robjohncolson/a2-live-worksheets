import crypto from 'node:crypto';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import {
  getReceiptIssuer,
  initReceipts,
  issueLedgerReceipt,
  receiptInternals
} from '../receipts.js';

const V1_TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';
const V11_TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';
const V11_TEST_PUBLIC_KEY = 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc';

function decodeCompact(compact) {
  const [payloadB64, sigB64] = compact.split('.');
  return {
    bytes: Buffer.from(payloadB64, 'base64url'),
    sig: Buffer.from(sigB64, 'base64url'),
    payload: JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  };
}

function createFakeRosterDb({ usernameByStudentId = {} } = {}) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async findByStudentId(studentId) {
      const loginUsername = usernameByStudentId[studentId];
      return {
        data: loginUsername ? { student_id: studentId, login_username: loginUsername } : null,
        error: null
      };
    },
    async listRoster() { return { data: [], error: null }; }
  };
}

function createFakeLedgerDb() {
  const store = [];
  let updateMode = 'store';
  return {
    store,
    setUpdateMode(mode) {
      updateMode = mode;
    },
    async insertLedgerRow(args) {
      const row = {
        ledger_id: `ledger-${store.length + 1}`,
        evidence_tier: args.evidenceTier,
        ...args
      };
      store.push(row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      if (updateMode === '42703') return { error: { code: '42703' } };
      if (updateMode === 'throw') throw new Error('receipt write failed');
      const row = store.find(r => r.ledger_id === ledgerId);
      if (row) {
        row.receipt_id = receiptId;
        row.receipt_compact = receiptCompact;
      }
      return { error: null };
    },
    async getLedgerByStudent() {
      return { data: store, error: null };
    }
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

  async request(method, path, { body, headers = {} } = {}) {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    return { status: res.status, body: await res.json() };
  }
}

describe('receipt contract vectors', () => {
  afterEach(() => {
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    vi.restoreAllMocks();
    initReceipts();
  });

  it('reproduces the frozen v1 verdict vector byte-for-byte', () => {
    const privateKey = receiptInternals.createPrivateKey(V1_TEST_PRIVATE_KEY);
    const signed = receiptInternals.signPayload(privateKey, {
      ah: '3a1f0c9b2d4e5f60',
      n: 'a1b2c3d4',
      q: 'U4-L3-Q01',
      s: 'E',
      t: 'verdict',
      ts: 1781234567890,
      u: 'Apple_Monkey',
      v: 1
    });

    expect(signed.canonical).toBe('{"ah":"3a1f0c9b2d4e5f60","n":"a1b2c3d4","q":"U4-L3-Q01","s":"E","t":"verdict","ts":1781234567890,"u":"Apple_Monkey","v":1}');
    expect(signed.receiptId).toBe('ecceb8d3a527a91214b2d479f779cceb58b60e97e897508b5161e3a8b297b622');
    expect(signed.sig).toBe('fxr2OUgg98CHgo8zrNkqT5DAdxa7emYOlN82z1elKBorO8HqUH0K4Z7AH-FDr7EeLPGF6Xeg2FT-dEOMlxuPCw');
  });

  it('reproduces the frozen v1.1 ledger vector byte-for-byte', () => {
    const privateKey = receiptInternals.createPrivateKey(V11_TEST_PRIVATE_KEY);
    const signed = receiptInternals.signPayload(privateKey, {
      a: 1,
      ah: '3a1f0c9b2d4e5f60',
      e: 'practice',
      i: 'WS-U4L3-Q2',
      n: 'a1b2c3d4',
      sc: 0.5,
      sid: '00000000-0000-4000-8000-000000000000',
      src: 'worksheet',
      t: 'ledger',
      ts: 1781234567890,
      u: 'Apple_Monkey',
      v: 1
    });

    expect(signed.canonical).toBe('{"a":1,"ah":"3a1f0c9b2d4e5f60","e":"practice","i":"WS-U4L3-Q2","n":"a1b2c3d4","sc":0.5,"sid":"00000000-0000-4000-8000-000000000000","src":"worksheet","t":"ledger","ts":1781234567890,"u":"Apple_Monkey","v":1}');
    expect(signed.receiptId).toBe('8ebc92c7a13899a5f7be6b6959fb77e65a379984db907e419f2422a23a6e6d96');
    expect(signed.sig).toBe('h2UL76wqlGpAOtUKLrCT0_XZidjYYf_ToVEujCB4ge9WrEaXgUUs4mNhHUf6JPJxorOhVw03DDaTVYZE2k7WCw');
  });

  it('omits sc from score-less ledger payloads', () => {
    const canonical = receiptInternals.canonicalize({
      v: 1,
      t: 'ledger',
      sid: 's1',
      src: 'pc',
      i: 'PC-U1',
      sc: undefined,
      a: 1,
      e: 'practice',
      ah: '0000000000000000',
      ts: 1781234567890,
      n: 'a1b2c3d4'
    });

    expect(canonical).toBe('{"a":1,"ah":"0000000000000000","e":"practice","i":"PC-U1","n":"a1b2c3d4","sid":"s1","src":"pc","t":"ledger","ts":1781234567890,"v":1}');
  });
});

describe('roster-server receipt integration', () => {
  let srv;
  let token;
  let studentId;
  let proctorSecret;
  let ledgerDb;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ROSTER_TOKEN_SECRET = `token-${crypto.randomBytes(12).toString('hex')}`;
    process.env.ROSTER_TEACHER_SECRET = `teacher-${crypto.randomBytes(12).toString('hex')}`;
    proctorSecret = `proctor-${crypto.randomBytes(12).toString('hex')}`;
    process.env.ROSTER_PROCTOR_SECRET = proctorSecret;
    studentId = '00000000-0000-4000-8000-000000000000';
    token = signToken(studentId);
  });

  afterEach(async () => {
    if (srv) {
      await srv.stop();
      srv = null;
    }
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.ROSTER_TOKEN_SECRET;
    delete process.env.ROSTER_TEACHER_SECRET;
    delete process.env.ROSTER_PROCTOR_SECRET;
    vi.restoreAllMocks();
    initReceipts();
  });

  async function start({ receiptKey, username } = {}) {
    if (receiptKey) process.env.RECEIPT_ISSUER_PRIVATE_KEY = receiptKey;
    else delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    ledgerDb = createFakeLedgerDb();
    const app = createApp(createFakeRosterDb({
      usernameByStudentId: username ? { [studentId]: username } : {}
    }), ledgerDb);
    srv = new TestServer(app);
    await srv.start();
  }

  function record(overrides = {}, headers = {}) {
    return srv.request('POST', '/ledger/record', {
      body: {
        token,
        source: 'worksheet',
        itemId: 'WS-U4L3-Q2',
        response: 'A',
        score: 0.5,
        ...overrides
      },
      headers
    });
  }

  it('leaves /ledger/record response shape unchanged when disabled', async () => {
    await start();

    const { body } = await record();

    expect(body).toEqual({
      ok: true,
      ledgerId: 'ledger-1',
      evidenceTier: 'practice'
    });
    expect(getReceiptIssuer()).toEqual({ enabled: false });
    expect(ledgerDb.store[0].receipt_compact).toBeUndefined();
  });

  it('exposes issuer metadata when enabled', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const { status, body } = await srv.request('GET', '/receipts/issuer');

    expect(status).toBe(200);
    // pubkeys = the issuer-key trust set (Phase 4 §2); just the current key with no retired env.
    expect(body).toEqual({ enabled: true, name: 'The A2 Desk', alg: 'Ed25519', v: 1, pubkey: V11_TEST_PUBLIC_KEY, pubkeys: [V11_TEST_PUBLIC_KEY] });
  });

  it('issues practice ledger receipts with server-known sid, tier, and attempt', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const { status, body } = await record({ attempt: 3 });
    const decoded = decodeCompact(body.receipt.compact);

    expect(status).toBe(200);
    expect(body.receipt.receiptId).toBeTruthy();
    expect(decoded.payload.sid).toBe(studentId);
    expect(decoded.payload.e).toBe('practice');
    expect(decoded.payload.a).toBe(3);
    expect(decoded.payload.sc).toBe(0.5);
  });

  it('adds the roster username to ledger receipts when the resolver has one', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY, username: 'Apple_Monkey' });

    const { status, body } = await record();
    const decoded = decodeCompact(body.receipt.compact);

    expect(status).toBe(200);
    expect(decoded.payload.u).toBe('Apple_Monkey');
  });

  it('omits the roster username from ledger receipts when the resolver has none', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const { status, body } = await record();
    const decoded = decodeCompact(body.receipt.compact);

    expect(status).toBe(200);
    expect(decoded.payload.u).toBeUndefined();
  });

  it('issues proctored receipts only from the proctor header', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const { body } = await record({ evidenceTier: 'practice', attempt: 2 }, { 'x-proctor-secret': proctorSecret });
    const decoded = decodeCompact(body.receipt.compact);

    expect(body.evidenceTier).toBe('proctored');
    expect(decoded.payload.e).toBe('proctored');
    expect(decoded.payload.a).toBe(2);
  });

  it('persists issued ledger receipts for later student fetch', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const recorded = await record();
    const fetched = await srv.request('GET', `/ledger/student/${studentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    expect(recorded.status).toBe(200);
    expect(fetched.status).toBe(200);
    expect(fetched.body.rows).toHaveLength(1);
    expect(fetched.body.rows[0].receipt_id).toBe(recorded.body.receipt.receiptId);
    expect(fetched.body.rows[0].receipt_compact).toBe(recorded.body.receipt.compact);
  });

  it('keeps /ledger/record successful when receipt persistence hits pre-migration 42703', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });
    ledgerDb.setUpdateMode('42703');

    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ledgerId).toBe('ledger-1');
    expect(body.evidenceTier).toBe('practice');
    expect(body.receipt.receiptId).toBeTruthy();
    expect(body.receipt.compact).toBeTruthy();
  });

  it('keeps /ledger/record successful when receipt persistence throws', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });
    ledgerDb.setUpdateMode('throw');

    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ledgerId).toBe('ledger-1');
    expect(body.evidenceTier).toBe('practice');
    expect(body.receipt.receiptId).toBeTruthy();
    expect(body.receipt.compact).toBeTruthy();
  });

  it('reports receipt health when receipts are enabled', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });

    const { status, body } = await srv.request('GET', '/health');

    expect(status).toBe(200);
    expect(body.receipts).toEqual({
      enabled: true,
      pubkey: V11_TEST_PUBLIC_KEY,
      persistFailures: 0
    });
  });

  it('reports receipt health when receipts are disabled', async () => {
    await start();

    const { status, body } = await srv.request('GET', '/health');

    expect(status).toBe(200);
    expect(body.receipts).toEqual({
      enabled: false,
      persistFailures: 0
    });
  });

  it('counts non-42703 receipt persistence errors but not pre-migration 42703', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });
    ledgerDb.setUpdateMode('42703');
    await record();

    let health = await srv.request('GET', '/health');
    expect(health.body.receipts.persistFailures).toBe(0);

    ledgerDb.setUpdateMode('throw');
    await record();

    health = await srv.request('GET', '/health');
    expect(health.body.receipts.persistFailures).toBe(1);
  });

  it('never lets signing failures break the parent request', async () => {
    await start({ receiptKey: V11_TEST_PRIVATE_KEY });
    vi.spyOn(crypto, 'sign').mockImplementation(() => {
      throw new Error('sign failed');
    });

    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      ledgerId: 'ledger-1',
      evidenceTier: 'practice'
    });
  });

  it('issues directly callable ledger receipts that verify', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = V11_TEST_PRIVATE_KEY;
    initReceipts();

    const receipt = issueLedgerReceipt({
      studentId,
      source: 'worksheet',
      itemId: 'WS-U4L3-Q2',
      score: 0.5,
      attempt: 1,
      evidenceTier: 'practice',
      response: 'A'
    });
    const decoded = decodeCompact(receipt.compact);
    const publicKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: V11_TEST_PUBLIC_KEY },
      format: 'jwk'
    });

    expect(crypto.verify(null, decoded.bytes, publicKey, decoded.sig)).toBe(true);
  });

  it('carries sub/kv + a deterministic nonce for the offline-grading mesh (§0.7, §0.8, §0.10)', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = V11_TEST_PRIVATE_KEY;
    initReceipts();
    const args = {
      studentId, source: 'worksheet', itemId: 'WS-U1L1-Q1', score: 1, attempt: 1,
      evidenceTier: 'practice', response: 'mean', sub: 'subReceipt123', kv: 'kv-2026-06', nonce: 'abcd1234'
    };
    const r1 = issueLedgerReceipt(args);
    const payload = JSON.parse(Buffer.from(r1.compact.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(payload.sub).toBe('subReceipt123');
    expect(payload.kv).toBe('kv-2026-06');
    expect(payload.n).toBe('abcd1234');
    // Deterministic nonce (+ an explicit ts) → a re-mint is byte-identical (dedup).
    const r2 = issueLedgerReceipt({ ...args, ts: 42 });
    const r3 = issueLedgerReceipt({ ...args, ts: 42 });
    expect(r3.compact).toBe(r2.compact);
    expect(r3.receiptId).toBe(r2.receiptId);
  });
});
