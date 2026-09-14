// admin-restore.test.js — POST /admin/restore: faithful disaster recovery. The case
// the recovery drill caught (a *-DESK_DONE worksheet row with a 0..100 score that
// /ledger/import would DROP) must restore byte-for-byte; tampered/unsigned rows must be
// refused. Mirrors the receipts.test harness. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { initReceipts, issueLedgerReceipt, getReceiptIssuer } from '../receipts.js';
import { buildStudentEntry, buildEpoch } from '../admin-snapshot.js';

const KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';

let TS = 1_700_000_000_000;
// A snapshot-shaped record (camelCase itemId + the original signed receipt).
function rec(sid, item, { score = 1, response = 'A', tier = 'practice', source = 'worksheet' } = {}) {
  const r = issueLedgerReceipt({ studentId: sid, source, itemId: item, score, attempt: 1, evidenceTier: tier, response });
  TS += 60_000;
  return {
    studentId: sid, source, itemId: item, response, score, attempt: 1,
    recorded_at: new Date(TS).toISOString(), receipt_id: r.receiptId, receipt_compact: r.compact
  };
}

function fakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async findByStudentId() { return { data: null, error: null }; },
    async getRoleByStudentId() { return 'student'; },
    async listRoster() { return { data: [], error: null }; }
  };
}
function fakeLedgerDb() {
  const inserted = [];
  const receipts = {};
  return {
    inserted, receipts,
    async insertLedgerRow(args) {
      const ledger_id = `L${inserted.length + 1}`;
      inserted.push({ ledger_id, ...args });
      return { data: { ledger_id, evidence_tier: args.evidenceTier }, error: null };
    },
    async updateLedgerReceipt(ledgerId, { receiptId, receiptCompact }) {
      receipts[ledgerId] = { receiptId, receiptCompact };
      return { error: null };
    },
    async getLedgerByStudent() { return { data: [], error: null }; }
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() { return new Promise((r) => this.server.listen(0, '127.0.0.1', () => { this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r(); })); }
  stop() { return new Promise((r) => this.server.close(r)); }
  async post(path, body, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
}

let srv, ledgerDb;
function bundle(sid, records) { return { bundles: [{ student: { studentId: sid }, records }] }; }
const TEACHER = { 'x-teacher-secret': 'teach-secret' };

beforeEach(() => {
  process.env.ROSTER_TEACHER_SECRET = 'teach-secret';
  process.env.ROSTER_TOKEN_SECRET = `tok-${crypto.randomBytes(8).toString('hex')}`;
});
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  initReceipts();
});

async function start({ key = KEY } = {}) {
  if (key) process.env.RECEIPT_ISSUER_PRIVATE_KEY = key; else delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  initReceipts();
  ledgerDb = fakeLedgerDb();
  const app = createApp(fakeRosterDb(), ledgerDb);
  srv = new TestServer(app);
  await srv.start();
}

describe('POST /admin/restore (faithful)', () => {
  it('rejects without the teacher secret', async () => {
    await start();
    const { status } = await srv.post('/admin/restore', bundle('sid-1', [rec('sid-1', 'WS-U1L1-Q1')]));
    expect(status).toBe(401);
  });

  it('503s when the issuer is disabled (can\'t verify, so won\'t restore)', async () => {
    await start({ key: null });
    const { status, body } = await srv.post('/admin/restore', bundle('sid-1', [{ studentId: 'sid-1', source: 'worksheet', itemId: 'X', response: 'A', score: 1 }]), TEACHER);
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
  });

  it('restores an out-of-range (0..100) DESK_DONE score byte-for-byte', async () => {
    await start();
    const r = rec('sid-1', 'BL-U1-L1-DESK_DONE', { score: 100, response: 'done' });
    const { status, body } = await srv.post('/admin/restore', bundle('sid-1', [r]), TEACHER);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, restored: 1, skipped: 0 });
    // score preserved AS-IS (NOT clamped/dropped like /ledger/import would)
    expect(ledgerDb.inserted).toHaveLength(1);
    expect(ledgerDb.inserted[0].score).toBe(100);
    // original timestamp preserved (so recomputed commit heads match)
    expect(ledgerDb.inserted[0].recordedAt).toBe(r.recorded_at);
    // ORIGINAL receipt preserved, not re-issued
    expect(ledgerDb.receipts.L1.receiptCompact).toBe(r.receipt_compact);
  });

  it('preserves evidence_tier from the SIGNED payload (proctored stays proctored)', async () => {
    await start();
    const r = rec('sid-1', 'PC-U1', { score: 1, tier: 'proctored', source: 'pc' });
    await srv.post('/admin/restore', bundle('sid-1', [r]), TEACHER);
    expect(ledgerDb.inserted[0].evidenceTier).toBe('proctored');
  });

  it('refuses a tampered-score record (signature no longer binds it)', async () => {
    await start();
    const r = rec('sid-1', 'WS-U1L1-Q1', { score: 1 });
    r.score = 0.5; // tamper after signing
    const { body } = await srv.post('/admin/restore', bundle('sid-1', [r]), TEACHER);
    expect(body).toMatchObject({ ok: true, restored: 0, skipped: 1 });
    expect(body.errors[0].reason).toBe('score-tampered');
    expect(ledgerDb.inserted).toHaveLength(0);
  });

  it('refuses an unsigned record', async () => {
    await start();
    const r = rec('sid-1', 'WS-U1L1-Q1');
    delete r.receipt_compact;
    const { body } = await srv.post('/admin/restore', bundle('sid-1', [r]), TEACHER);
    expect(body).toMatchObject({ restored: 0, skipped: 1 });
    expect(body.errors[0].reason).toBe('unsigned');
    expect(ledgerDb.inserted).toHaveLength(0);
  });

  it('restores the good rows and skips the bad ones in a mixed batch', async () => {
    await start();
    const good1 = rec('sid-1', 'BL-U1-L1-DESK_DONE', { score: 100, response: 'done' });
    const good2 = rec('sid-1', 'WS-U1L1-Q1', { score: 0.5 });
    const bad = rec('sid-1', 'WS-U1L1-Q2', { score: 1 }); bad.score = 0; // tampered
    const { body } = await srv.post('/admin/restore', bundle('sid-1', [good1, good2, bad]), TEACHER);
    expect(body).toMatchObject({ ok: true, total: 3, restored: 2, skipped: 1 });
    expect(ledgerDb.inserted.map((x) => x.score).sort()).toEqual([0.5, 100]);
  });
});

describe('POST /admin/verify (read-only, dashboard card)', () => {
  afterEach(async () => { if (srv) { await srv.stop(); srv = null; } });

  // buildStudentEntry wants DB-shaped (snake_case) rows; rec() is snapshot-shaped.
  function snakeRow(sid, item, opts) {
    const r = rec(sid, item, opts);
    return {
      student_id: r.studentId, source: r.source, item_id: r.itemId, response: r.response,
      score: r.score, attempt: r.attempt, evidence_tier: 'practice', recorded_at: r.recorded_at,
      receipt_id: r.receipt_id, receipt_compact: r.receipt_compact
    };
  }
  function builtSnapshot() {
    const e = buildStudentEntry({ student_id: 'sid-1', login_username: 'amy', role: 'student' },
      [snakeRow('sid-1', 'WS-U1L1-Q1'), snakeRow('sid-1', 'BL-U1-L1-DESK_DONE', { score: 100, response: 'done' })]);
    const students = [e];
    return { schema: 'apstats-ledger-snapshot/v1', issuer: getReceiptIssuer(), students, epoch: buildEpoch(students, { asOfDateNY: '2026-06-29' }) };
  }

  it('rejects without the teacher secret', async () => {
    await start();
    const { status } = await srv.post('/admin/verify', {}, {});
    expect(status).toBe(401);
  });

  it('verifies a good snapshot (incl. an out-of-range score)', async () => {
    await start();
    const { status, body } = await srv.post('/admin/verify', builtSnapshot(), TEACHER);
    expect(status).toBe(200);
    expect(body.report.ok).toBe(true);
    expect(body.report.totals.records).toBe(2);
    expect(body.report.epochOk).toBe(true);
  });

  it('flags a tampered snapshot', async () => {
    await start();
    const snap = builtSnapshot();
    snap.students[0].bundle.records[0].score = 0.25; // signed at 1
    const { body } = await srv.post('/admin/verify', snap, TEACHER);
    expect(body.report.ok).toBe(false);
    expect(body.report.breaks.some((b) => b.kind === 'score-tampered')).toBe(true);
  });
});
