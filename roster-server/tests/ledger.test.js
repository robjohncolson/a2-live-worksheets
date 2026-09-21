// ledger.test.js — tests for /ledger/record and /ledger/student/:id routes
// Injects a fake in-memory ledgerDb — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { createLedgerDb } from '../ledger-db.js';
import { verifyReviewGrant } from '../receipts.js';

// ── Fake in-memory roster db (minimal — only needed for createApp) ────────────

function createFakeRosterDb() {
  return {
    async findByStudentId(studentId) { return { data: { student_id: studentId, must_change_password: false, password_hash: 'fixture-password-hash' }, error: null }; },
    async insertRoster() { return { data: null, error: { message: 'not used in ledger tests' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used in ledger tests' } }; },
    // Powers the teacher view-as path in GET /ledger/student/:id: a sid that
    // starts with 'uuid-teacher' is a teacher; everyone else is a student.
    async getRoleByStudentId(studentId) {
      return (typeof studentId === 'string' && studentId.startsWith('uuid-teacher'))
        ? 'teacher' : 'student';
    }
  };
}

// ── Fake in-memory ledger db ─────────────────────────────────────────────────

function createFakeLedgerDb() {
  // store keyed by "studentId|source|itemId|attempt"
  const store = new Map();

  return {
    store,

    async insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt }) {
      const key = `${studentId}|${source}|${itemId}|${attempt}`;

      const row = {
        ledger_id:     `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        student_id:    studentId,
        source,
        item_id:       itemId,
        unit:          unit   || null,
        topic:         topic  || null,
        skill:         skill  || null,
        response,
        score:         score  ?? null,
        evidence_tier: evidenceTier,
        attempt,
        recorded_at:   new Date().toISOString(),
        graded_at:     null
      };

      store.set(key, row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },

    async getLedgerByStudent(studentId, opts) {
      const prefix = opts && opts.prefix;
      let rows = [...store.values()].filter(r => r.student_id === studentId);
      if (prefix) {
        rows = rows.filter(r => typeof r.item_id === 'string' && r.item_id.startsWith(prefix));
      }
      // Newest first — sort by recorded_at descending
      rows.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
      return { data: rows, error: null };
    }
  };
}

// ── Lightweight test server ───────────────────────────────────────────────────

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
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Constants / helpers ───────────────────────────────────────────────────────

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalize(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    if (payload[key] !== undefined) sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function makeReviewGrant(overrides = {}) {
  const payload = {
    v: 1,
    t: 'review-grant',
    sid: validStudentId,
    item: 'U4-L3-Q01#rev',
    credit: 2 / 3,
    exp: Date.now() + 60_000,
    ts: Date.now(),
    n: randomBytes(4).toString('hex'),
    ...overrides
  };
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  const sig = sign(null, bytes, reviewGrantPrivateKey);
  return `${b64url(bytes)}.${b64url(sig)}`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let rosterDb;
let ledgerDb;
let srv;
let teacherSecret;
let tokenSecret;
let proctorSecret;
let validStudentId;
let validToken;
let teacherStudentId;
let teacherToken;
let reviewGrantPrivateKey;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret   = makeSecret('token');
  proctorSecret = makeSecret('proctor');

  process.env.ROSTER_TEACHER_SECRET  = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET    = tokenSecret;
  process.env.ROSTER_PROCTOR_SECRET  = proctorSecret;
  process.env.NODE_ENV               = 'test';

  const reviewGrantKeys = generateKeyPairSync('ed25519');
  reviewGrantPrivateKey = reviewGrantKeys.privateKey;
  process.env.REVIEW_GRANT_PUBKEY = reviewGrantKeys.publicKey.export({ format: 'jwk' }).x;

  // A valid studentId + token for use in happy-path tests
  validStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
  validToken = signToken(validStudentId, 'fixture-password-hash');

  // A teacher studentId + token (the fake rosterDb maps 'uuid-teacher*' -> teacher).
  teacherStudentId = `uuid-teacher-${randomBytes(8).toString('hex')}`;
  teacherToken = signToken(teacherStudentId, 'fixture-password-hash');

  rosterDb  = createFakeRosterDb();
  ledgerDb  = createFakeLedgerDb();
  const app = createApp(rosterDb, ledgerDb);
  srv       = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_PROCTOR_SECRET;
  delete process.env.REVIEW_GRANT_PUBKEY;
});

// ── POST /ledger/record ───────────────────────────────────────────────────────

describe('POST /ledger/record', () => {

  function record(overrides = {}, headers = {}) {
    return srv.request('POST', '/ledger/record', {
      body: {
        token:    validToken,
        source:   'worksheet',
        itemId:   'WS-U4L1-Q1',
        response: { answer: 'random' },
        ...overrides
      },
      headers
    });
  }

  // ── FRQ durable floor (2026-08-19) ─────────────────────────────────────────
  // Drafts (score undefined) never null a stored grade; a weaker regrade never
  // lowers it; a stronger one raises it. Other sources are untouched.

  function frqRow() {
    const key = `${validStudentId}|frq|WS-U4L1-reflect1|1`;
    return ledgerDb.store.get(key);
  }

  it('FRQ floor: a draft save after a graded write keeps the stored score (text still updates)', async () => {
    let r = await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'first answer text', score: 1 });
    expect(r.status).toBe(200);
    r = await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'edited draft text', score: undefined });
    expect(r.status).toBe(200);
    expect(frqRow().score).toBe(1);
    expect(frqRow().response).toBe('edited draft text');
  });

  it('FRQ floor: a weaker regrade never lowers; a stronger one raises', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'a', score: 0.5 });
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'b', score: 0 });
    expect(frqRow().score).toBe(0.5);
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'c', score: 1 });
    expect(frqRow().score).toBe(1);
  });

  it('FRQ floor: a first-ever null then a first grade records normally', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'draft', score: undefined });
    expect(frqRow().score).toBeNull();
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'draft', score: 0 });
    expect(frqRow().score).toBe(0);
  });

  it('FRQ floor does not apply to worksheet rows (verbatim rescore semantics unchanged)', async () => {
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q9', response: { answer: 'x' }, score: 1 });
    await record({ source: 'worksheet', itemId: 'WS-U4L1-Q9', response: { answer: 'y' }, score: 0 });
    expect(ledgerDb.store.get(`${validStudentId}|worksheet|WS-U4L1-Q9|1`).score).toBe(0);
  });

  // ── POST /ledger/frq-regrade (teacher-gated) ───────────────────────────────
  function regrade(body, headers = {}) {
    return srv.request('POST', '/ledger/frq-regrade', { body, headers });
  }
  const TEACHER = { 'x-teacher-secret': process.env.TEACHER_KEY || 'apteacher2627' };

  it('frq-regrade: 401 without teacher auth', async () => {
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 1 });
    expect(r.status).toBe(401);
  });

  it('frq-regrade: 404 when the row does not exist (never creates rows)', async () => {
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect9', score: 1 }, TEACHER);
    expect(r.status).toBe(404);
    expect(ledgerDb.store.has(`${validStudentId}|frq|WS-U4L1-reflect9|1`)).toBe(false);
  });

  it('frq-regrade: grades a null row, keeps its response, floors a lower regrade, raises a higher one', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'my reflection text', score: undefined });
    let r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0.5 }, TEACHER);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, applied: true, score: 0.5 });
    expect(frqRow().score).toBe(0.5);
    expect(frqRow().response).toBe('my reflection text');
    r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0 }, TEACHER);
    expect(r.body).toMatchObject({ ok: true, applied: false, score: 0.5 });
    expect(frqRow().score).toBe(0.5);
    r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 1 }, TEACHER);
    expect(r.body).toMatchObject({ ok: true, applied: true, score: 1 });
    expect(frqRow().score).toBe(1);
  });

  it('frq-regrade: rejects scores outside {1, 0.5, 0}', async () => {
    await record({ source: 'frq', itemId: 'WS-U4L1-reflect1', response: 'text', score: undefined });
    const r = await regrade({ studentId: validStudentId, itemId: 'WS-U4L1-reflect1', score: 0.7 }, TEACHER);
    expect(r.status).toBe(400);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('verifyReviewGrant accepts a grant signed by the configured quiz public key', () => {
    const compact = makeReviewGrant();
    const payload = verifyReviewGrant(compact);

    expect(payload).toMatchObject({
      v: 1,
      t: 'review-grant',
      sid: validStudentId,
      item: 'U4-L3-Q01#rev',
      credit: 2 / 3
    });
  });

  it('quiz_review requires a valid grant and records the grant credit', async () => {
    const grant = makeReviewGrant({ credit: 1 / 3 });
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(1 / 3);
  });

  it('quiz_review ignores a client-supplied score when a valid grant is present', async () => {
    const grant = makeReviewGrant({ credit: 2 / 3 });
    const { status } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      score: 1,
      grant
    });

    expect(status).toBe(200);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(2 / 3);
  });

  it('quiz_review without a grant returns 400', async () => {
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      score: 1
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_review with an expired grant returns 400', async () => {
    const grant = makeReviewGrant({ exp: Date.now() - 1 });
    const { status, body } = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_review with sid or item mismatch returns 400', async () => {
    const sidMismatch = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant: makeReviewGrant({ sid: 'other-student' })
    });
    const itemMismatch = await record({
      source: 'quiz_review',
      itemId: 'U4-L3-Q01#rev',
      response: { appeal: 'reviewed' },
      grant: makeReviewGrant({ item: 'U4-L3-Q02#rev' })
    });

    expect(sidMismatch.status).toBe(400);
    expect(sidMismatch.body).toEqual({ ok: false, error: 'review grant required' });
    expect(itemMismatch.status).toBe(400);
    expect(itemMismatch.body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('quiz_exception also requires a valid review grant', async () => {
    const { status, body } = await record({
      source: 'quiz_exception',
      itemId: 'U4-L3-Q01#exc',
      response: { exception: true },
      score: 1
    });

    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'review grant required' });
    expect([...ledgerDb.store.values()]).toHaveLength(0);
  });

  it('happy path: returns ok:true, a ledgerId string, and default tier "practice"', async () => {
    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.ledgerId).toBe('string');
    expect(body.ledgerId.length).toBeGreaterThan(0);
    expect(body.evidenceTier).toBe('practice');
  });

  it('resolves the token to the correct studentId before writing', async () => {
    await record();

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe(validStudentId);
  });

  it('defaults attempt to 1 when not supplied', async () => {
    await record();

    const rows = [...ledgerDb.store.values()];
    expect(rows[0].attempt).toBe(1);
  });

  // ── Token auth (401) ────────────────────────────────────────────────────────

  it('missing token → 401 {ok:false, error:"invalid token"}', async () => {
    const { status, body } = await srv.request('POST', '/ledger/record', {
      body: { source: 'worksheet', itemId: 'Q1', response: {} }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid token');
  });

  it('invalid/garbage token → 401 {ok:false, error:"invalid token"}', async () => {
    const { status, body } = await record({ token: 'garbage.notavalidtoken' });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid token');
  });

  // ── Required field validation (400) ────────────────────────────────────────

  it('missing source → 400', async () => {
    const { status, body } = await record({ source: undefined });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing itemId → 400', async () => {
    const { status, body } = await record({ itemId: undefined });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing response → 400', async () => {
    // response omitted from body entirely
    const { status, body } = await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'Q1' }
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('explicit JSON null response is accepted', async () => {
    const { status, body } = await record({ response: null });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBeNull();
  });

  // ── Proctor secret → evidence_tier (decision L-C) ──────────────────────────

  it('correct x-proctor-secret header → evidenceTier:"proctored"', async () => {
    const { status, body } = await record({}, { 'x-proctor-secret': proctorSecret });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('proctored');
  });

  it('wrong x-proctor-secret header → evidenceTier:"practice" (not proctored)', async () => {
    const { status, body } = await record({}, { 'x-proctor-secret': 'wrong-secret' });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('practice');
  });

  it('absent x-proctor-secret header → evidenceTier:"practice"', async () => {
    const { status, body } = await record();

    expect(status).toBe(200);
    expect(body.evidenceTier).toBe('practice');
  });

  // ── Integrity: body evidenceTier is IGNORED (decision L-C) ─────────────────

  it('body evidenceTier:"proctored" WITHOUT the header is still stored as "practice"', async () => {
    // Client tries to self-certify as proctored in the body — must be ignored
    const { status, body } = await record({ evidenceTier: 'proctored' });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.evidenceTier).toBe('practice');

    // Verify what was actually written to the store
    const rows = [...ledgerDb.store.values()];
    expect(rows[0].evidence_tier).toBe('practice');
  });

  it('body evidence_tier:"proctored" WITHOUT the header is still stored as "practice"', async () => {
    // Snake-case variant — same integrity rule
    const { status, body } = await record({ evidence_tier: 'proctored' });

    expect(status).toBe(200);
    expect(body.evidenceTier).toBe('practice');

    const rows = [...ledgerDb.store.values()];
    expect(rows[0].evidence_tier).toBe('practice');
  });

  // ── Upsert on duplicate (student, source, itemId, attempt) ─────────────────

  it('duplicate (student, source, item, attempt) upserts — not duplicates', async () => {
    await record({ itemId: 'Q-DUPE', response: { answer: 'first' } });
    await record({ itemId: 'Q-DUPE', response: { answer: 'second' } });

    // The fake db overwrites on the same key
    const key = `${validStudentId}|worksheet|Q-DUPE|1`;
    const stored = ledgerDb.store.get(key);
    expect(stored).toBeDefined();
    expect(stored.response).toEqual({ answer: 'second' });

    // Only one row for that key
    expect(ledgerDb.store.size).toBe(1);
  });

  it('different attempt numbers are stored as separate rows', async () => {
    await record({ itemId: 'Q-ATT', attempt: 1 });
    await record({ itemId: 'Q-ATT', attempt: 2 });

    expect(ledgerDb.store.size).toBe(2);
  });

  // ── DB error mapping: pre-migration 503 vs generic 500 ─────────────────────

  it('23514 check_violation → 503 "source not provisioned" (not a silent 500)', async () => {
    // The source CHECK rejects a value its migration hasn't provisioned yet
    // (e.g. 'blooket' before 0013). Must surface as a friendly 503 — a generic
    // 500 is exactly how study_guide_diagnostic died silently for weeks.
    ledgerDb.insertLedgerRow = async () => ({
      data: null,
      error: { code: '23514', message: 'new row for relation "item_ledger" violates check constraint "item_ledger_source_check"' }
    });

    const { status, body } = await record({ source: 'blooket' });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("source 'blooket' not provisioned (run the latest item_ledger migration)");
  });

  it('non-23514 db error still → 500 {ok:false, error:"Database error"}', async () => {
    ledgerDb.insertLedgerRow = async () => ({
      data: null,
      error: { code: 'XX000', message: 'internal error' }
    });

    const { status, body } = await record();

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Database error');
  });
});

describe('createLedgerDb', () => {
  it('includes a fresh recorded_at timestamp in the upsert payload', async () => {
    let upsertRows = null;
    let upsertOpts = null;
    const client = {
      from(table) {
        expect(table).toBe('item_ledger');
        return {
          upsert(rows, opts) {
            upsertRows = rows;
            upsertOpts = opts;
            return {
              select(cols) {
                expect(cols).toBe('ledger_id, evidence_tier, score');
                return {
                  async single() {
                    return { data: { ledger_id: 'ledger-1', evidence_tier: 'practice' }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const db = createLedgerDb(client);
    await db.insertLedgerRow({
      studentId: 'stu-1',
      source: 'blooket',
      itemId: 'BL-U1-L1-DESK_DONE',
      response: 'done',
      score: 1,
      evidenceTier: 'practice',
      attempt: 1,
    });

    expect(upsertOpts).toEqual({ onConflict: 'student_id,source,item_id,attempt' });
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0].recorded_at).toEqual(expect.any(String));
    expect(new Date(upsertRows[0].recorded_at).toISOString()).toBe(upsertRows[0].recorded_at);
  });
});

// ── GET /ledger/student/:studentId ────────────────────────────────────────────

describe('GET /ledger/student/:studentId', () => {

  function getStudent(studentId, headers = {}) {
    return srv.request('GET', `/ledger/student/${studentId}`, { headers });
  }

  it('valid teacher secret → 200 {ok:true, rows:[]}  (empty store)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': teacherSecret
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(0);
  });

  it('returns rows written for that student', async () => {
    // Write one record first
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'Q1', response: { a: 1 } }
    });

    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': teacherSecret
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('Q1');
  });

  it('missing x-teacher-secret → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId);

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('wrong x-teacher-secret → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId, {
      'x-teacher-secret': 'wrong-secret'
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });
});

// ── GET /ledger/student/:studentId — token auth + prefix filter (P-A-B §3) ───

describe('GET /ledger/student/:studentId — token auth + prefix filter', () => {

  function getStudent(studentId, { headers = {}, query = '' } = {}) {
    const qs = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    return srv.request('GET', `/ledger/student/${studentId}${qs}`, { headers });
  }

  // ── 1. No auth → 401 ───────────────────────────────────────────────────────
  it('no auth headers AND no token → 401 {ok:false, error:"forbidden"}', async () => {
    const { status, body } = await getStudent(validStudentId);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  // ── 2. Teacher secret still works (unchanged behavior) ─────────────────────
  it('teacher secret → 200 (unchanged behavior)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  // ── 3. Student token where sid == :studentId → 200 (self-fetch) ────────────
  it('valid student token (Bearer) where sid == :studentId → 200', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('valid student token via ?token= query where sid == :studentId → 200', async () => {
    const { status, body } = await getStudent(validStudentId, {
      query: `token=${encodeURIComponent(validToken)}`
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  // ── 4. Cross-student token → 403 (clearer than 401) ────────────────────────
  it('valid token but sid != :studentId → 403 {ok:false, error:"cross-student"}', async () => {
    const otherStudentId = `uuid-other-${randomBytes(8).toString('hex')}`;
    const { status, body } = await getStudent(otherStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');
  });

  it('garbage token → 401 (verifyToken returns null, treat as no auth)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': 'Bearer not.a.token' }
    });
    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  // ── 4b. Teacher token may read ANY student (view-as worksheets) ────────────
  it('a teacher token reading a DIFFERENT student → 200 with that student\'s rows', async () => {
    // Seed a row owned by validStudentId.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U1L2-Q1', response: 'their answer' }
    });
    // Teacher (different sid) fetches that student's ledger with their OWN token.
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('WS-U1L2-Q1');
    expect(body.rows[0].response).toBe('their answer');
  });

  it('a teacher token honors the prefix filter when reading another student', async () => {
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U1L2-Q1', response: 'a' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U9L1-Q1', response: 'b' }
    });
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
      query: 'prefix=WS-U1L2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].item_id).toBe('WS-U1L2-Q1');
  });

  it('a NON-teacher token reading a different student is still 403 (no widening)', async () => {
    const otherStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
    const { status, body } = await getStudent(otherStudentId, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');
  });

  // ── 5. prefix filter narrows results ───────────────────────────────────────
  it('?prefix=WS-U4L1-2 returns only matching rows', async () => {
    // Seed three rows: one matching, two not.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Q1', response: 'a' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Q2', response: 'b' }
    });
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U5L1-Q1', response: 'c' }
    });

    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(2);
    for (const r of body.rows) {
      expect(r.item_id.startsWith('WS-U4L1-2')).toBe(true);
    }
  });

  // ── 6. Bad prefix → 400 (rejects wildcards / injection attempts) ───────────
  it('?prefix=WS-U4L1-2% → 400 {ok:false, error:"bad prefix"}', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2%25'      // encoded `%`
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('bad prefix');
  });

  it('?prefix=WS_FOO → 400 (underscore is a SQL LIKE wildcard, must be rejected)', async () => {
    // Supabase .like() treats `_` as a single-char wildcard. Allowing it in the
    // prefix would silently widen the filter (WS-U_ matching WS-U4, WS-U5...).
    // Real item_ids only use [A-Za-z0-9-], so the sanitizer rejects underscore
    // along with every other non-[A-Za-z0-9-] char. Pins the strict-prefix contract.
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS_FOO'
    });
    expect(status).toBe(400);
    expect(body.error).toBe('bad prefix');
  });

  it('?prefix=WS$U4 → 400 (special char rejected)', async () => {
    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS%24U4'   // encoded `$`
    });
    expect(status).toBe(400);
    expect(body.error).toBe('bad prefix');
  });

  // ── 7. Most-recent-first ordering preserved ────────────────────────────────
  it('rows are returned newest-first by recorded_at', async () => {
    // Seed three rows with slight time offsets via separate inserts.
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qa', response: 'first' }
    });
    // Wait a hair so recorded_at differs (the fake stamps Date.now()-ish per call).
    await new Promise((r) => setTimeout(r, 5));
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qb', response: 'second' }
    });
    await new Promise((r) => setTimeout(r, 5));
    await srv.request('POST', '/ledger/record', {
      body: { token: validToken, source: 'worksheet', itemId: 'WS-U4L1-2-Qc', response: 'third' }
    });

    const { status, body } = await getStudent(validStudentId, {
      headers: { 'x-teacher-secret': teacherSecret },
      query: 'prefix=WS-U4L1-2'
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(3);
    // Newest first
    const times = body.rows.map(r => r.recorded_at);
    const sortedDesc = [...times].sort().reverse();
    expect(times).toEqual(sortedDesc);
  });
});
