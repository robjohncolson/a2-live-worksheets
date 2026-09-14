// admin-snapshot.test.js — GET /admin/snapshot (teacher-gated) + its pure builders.
// Mirrors the receipts.test harness (createApp + fake db/ledgerDb + TestServer + an
// enabled Ed25519 issuer). The HTTP response is fed straight into verifySnapshot to
// prove the emitted mirror is self-verifying end-to-end. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { initReceipts, issueLedgerReceipt } from '../receipts.js';
import {
  buildStudentEntry, buildEpoch, epochRoot, receiptRootOf, rowToRecord,
  SNAPSHOT_SCHEMA, BUNDLE_SCHEMA
} from '../admin-snapshot.js';
import { verifySnapshot } from '../snapshot-verify.js';

const KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';
const PUB = 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc';

let TS = 1_700_000_000_000;
function mintRow(sid, itemId, { score = 1, response = 'A', source = 'worksheet' } = {}) {
  TS += 60_000;
  const r = issueLedgerReceipt({ studentId: sid, source, itemId, score, attempt: 1, evidenceTier: 'practice', response });
  return {
    student_id: sid, source, item_id: itemId, response, score, attempt: 1,
    evidence_tier: 'practice', recorded_at: new Date(TS).toISOString(),
    receipt_id: r.receiptId, receipt_compact: r.compact
  };
}

beforeEach(() => {
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = KEY;
  initReceipts();
});
afterEach(() => {
  delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  initReceipts();
});

describe('admin-snapshot pure builders', () => {
  it('epochRoot is deterministic and order-independent', () => {
    const a = epochRoot({ s2: 'h2', s1: 'h1' });
    const b = epochRoot({ s1: 'h1', s2: 'h2' });
    expect(a).toBe(b);
    expect(a).not.toBe(epochRoot({ s1: 'h1', s2: 'hX' }));
  });

  it('receiptRootOf returns null on empty or duplicate ids, stable otherwise', () => {
    expect(receiptRootOf([])).toBeNull();
    expect(receiptRootOf(['a', 'a'])).toBeNull();
    expect(receiptRootOf(['b', 'a'])).toBe(receiptRootOf(['a', 'b']));
  });

  it('carries rubric detail into the snapshot for repeat-safe feedback backfills', () => {
    expect(rowToRecord({ score: 1, frq_result: { missing: [], matched: ['context'] } }, 'sid').frq_result)
      .toEqual({ missing: [], matched: ['context'] });
    expect(rowToRecord({ score: 0.5 }, 'sid').frq_result).toBeNull();
  });
  it('rowToRecord maps snake_case row to camelCase import record + keeps the receipt', () => {
    const row = mintRow('sid-1', 'WS-U1L1-Q1');
    const rec = rowToRecord(row, 'sid-1');
    expect(rec).toMatchObject({ studentId: 'sid-1', source: 'worksheet', itemId: 'WS-U1L1-Q1', score: 1, attempt: 1 });
    expect(rec.receipt_compact).toBe(row.receipt_compact);
  });

  it('buildStudentEntry produces a chain head, transcript root, and an import bundle', () => {
    const roster = { student_id: 'sid-1', login_username: 'amy', real_name: 'Amy A', section: 'P1', role: 'student' };
    const rows = [mintRow('sid-1', 'WS-U1L1-Q1'), mintRow('sid-1', 'WS-U1L1-Q2', { score: 0.5 })];
    const entry = buildStudentEntry(roster, rows);
    expect(entry.bundle.schema).toBe(BUNDLE_SCHEMA);
    expect(entry.bundle.records).toHaveLength(2);
    expect(entry.commitsHead).toBeTruthy();
    expect(entry.transcriptRoot).toBeTruthy();
    expect(entry.recordCount).toBe(2);
  });

  it('buildEpoch signs an anchor over the heads when the issuer is enabled', () => {
    const roster = { student_id: 'sid-1', login_username: 'amy', role: 'student' };
    const entry = buildStudentEntry(roster, [mintRow('sid-1', 'WS-U1L1-Q1')]);
    const epoch = buildEpoch([entry], { asOfDateNY: '2026-06-29' });
    expect(epoch.root).toBe(epochRoot({ 'sid-1': entry.commitsHead }));
    expect(epoch.receipt_compact).toBeTruthy();
  });
});

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() { return new Promise((r) => this.server.listen(0, '127.0.0.1', () => { this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r(); })); }
  stop() { return new Promise((r) => this.server.close(r)); }
  async req(method, path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method, headers });
    return { status: res.status, body: await res.json() };
  }
}

function fakeRosterDb(students) {
  return {
    async listRoster(section) { return { data: section ? students.filter((s) => s.section === section) : students, error: null }; },
    async findByStudentId(id) { return { data: students.find((s) => s.student_id === id) || null, error: null }; },
    async getRoleByStudentId(id) { const s = students.find((x) => x.student_id === id); return s ? s.role : 'student'; }
  };
}
function fakeLedgerDb(byStudent) {
  return { async getLedgerByStudent(sid) { return { data: byStudent[sid] || [], error: null }; } };
}

describe('GET /admin/snapshot', () => {
  let srv;
  afterEach(async () => { if (srv) { await srv.stop(); srv = null; } });

  async function start() {
    process.env.ROSTER_TEACHER_SECRET = 'teach-secret';
    process.env.ROSTER_TOKEN_SECRET = `tok-${crypto.randomBytes(8).toString('hex')}`;
    const students = [
      { student_id: 'sid-1', login_username: 'amy', real_name: 'Amy A', section: 'P1', role: 'student' },
      { student_id: 'sid-2', login_username: 'ben', real_name: 'Ben B', section: 'P1', role: 'student' },
      { student_id: 'sid-t', login_username: 'teach', real_name: 'Teacher', section: 'P1', role: 'teacher' }
    ];
    const ledger = {
      'sid-1': [mintRow('sid-1', 'WS-U1L1-Q1'), mintRow('sid-1', 'WS-U1L1-Q2', { score: 0 })],
      'sid-2': [mintRow('sid-2', 'WS-U1L1-Q1', { score: 0.5 })]
    };
    const app = createApp(fakeRosterDb(students), fakeLedgerDb(ledger));
    srv = new TestServer(app);
    await srv.start();
  }

  it('rejects without the teacher secret', async () => {
    await start();
    const { status } = await srv.req('GET', '/admin/snapshot');
    expect(status).toBe(401);
  });

  it('emits a self-verifying snapshot (students only, signed epoch anchor)', async () => {
    await start();
    const { status, body } = await srv.req('GET', '/admin/snapshot', { 'x-teacher-secret': 'teach-secret' });
    expect(status).toBe(200);
    expect(body.schema).toBe(SNAPSHOT_SCHEMA);
    expect(body.issuer.pubkey).toBe(PUB);
    expect(body.students).toHaveLength(2);            // the teacher row is excluded
    expect(body.students.every((s) => s.bundle.schema === BUNDLE_SCHEMA)).toBe(true);
    expect(body.epoch.root).toBeTruthy();
    expect(body.epoch.receipt_compact).toBeTruthy();

    // End-to-end: the emitted mirror verifies against its own issuer pubkey.
    const report = verifySnapshot(body);
    expect(report.ok).toBe(true);
    expect(report.totals.records).toBe(3);
    expect(report.totals.verifiedReceipts).toBe(3);
    expect(report.epochOk).toBe(true);
  });

  it('carries the ?prev= chain link into the epoch anchor', async () => {
    await start();
    const { body } = await srv.req('GET', '/admin/snapshot?prev=deadbeef', { 'x-teacher-secret': 'teach-secret' });
    expect(body.epoch.prev).toBe('deadbeef');
  });
});
