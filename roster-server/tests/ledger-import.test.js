// ledger-import.test.js — POST /ledger/import (offline work batch import).
// Pure-helper unit tests + a fake-db integration test. No network, no Supabase.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { createApp } from '../server.js';
import { normalizeImportBody, validateImportRecord } from '../ledger-import.js';

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('normalizeImportBody', () => {
  it('flattens a single export bundle and inherits studentId from student', () => {
    const out = normalizeImportBody({
      student: { studentId: 'stu-1' },
      records: [{ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean', score: 1 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].studentId).toBe('stu-1');
    expect(out[0].itemId).toBe('WS-U1L1-Q1');
  });

  it('lets a record override the bundle studentId', () => {
    const out = normalizeImportBody({
      student: { studentId: 'stu-1' },
      records: [{ studentId: 'stu-2', source: 'quiz', itemId: 'Q1', response: 'a' }],
    });
    expect(out[0].studentId).toBe('stu-2');
  });

  it('accepts a bare array of records', () => {
    const out = normalizeImportBody([{ studentId: 'stu-1', source: 'worksheet', itemId: 'i1', response: 'x' }]);
    expect(out).toHaveLength(1);
  });

  it('accepts a {bundles:[...]} multi-student shape', () => {
    const out = normalizeImportBody({
      bundles: [
        { student: { studentId: 's1' }, records: [{ source: 'worksheet', itemId: 'i1', response: 'x' }] },
        { student: { studentId: 's2' }, records: [{ source: 'worksheet', itemId: 'i2', response: 'y' }] },
      ],
    });
    expect(out.map((r) => r.studentId)).toEqual(['s1', 's2']);
  });

  it('returns [] for junk', () => {
    expect(normalizeImportBody(null)).toEqual([]);
    expect(normalizeImportBody({})).toEqual([]);
    expect(normalizeImportBody({ records: 'nope' })).toEqual([]);
  });

  it('an unsigned bundle (student:null) yields unattributed records → rejected on validate', () => {
    const out = normalizeImportBody({ student: null, records: [{ source: 'worksheet', itemId: 'i1', response: 'x' }] });
    expect(out).toHaveLength(1);
    expect(out[0].studentId).toBeFalsy(); // no studentId to attribute to
    expect(validateImportRecord(out[0]).reason).toMatch(/studentId/); // can't import unattributed work
  });
});

describe('validateImportRecord', () => {
  const base = { studentId: 's1', source: 'worksheet', itemId: 'i1', response: 'x' };
  it('accepts a complete record', () => {
    expect(validateImportRecord({ ...base, score: 1 }).ok).toBe(true);
  });
  it('accepts a missing/optional score', () => {
    expect(validateImportRecord(base).ok).toBe(true);
  });
  it('rejects missing required fields', () => {
    expect(validateImportRecord({ ...base, studentId: undefined }).reason).toMatch(/studentId/);
    expect(validateImportRecord({ ...base, source: undefined }).reason).toMatch(/source/);
    expect(validateImportRecord({ ...base, itemId: undefined }).reason).toMatch(/itemId/);
    expect(validateImportRecord({ ...base, response: undefined }).reason).toMatch(/response/);
  });
  it('rejects an out-of-range score', () => {
    expect(validateImportRecord({ ...base, score: 2 }).reason).toMatch(/score/);
    expect(validateImportRecord({ ...base, score: -1 }).reason).toMatch(/score/);
  });
});

// ── Fake dbs + harness (mirrors ledger.test.js) ───────────────────────────────

function createFakeRosterDb() {
  return {
    async getRoleByStudentId(sid) {
      return (typeof sid === 'string' && sid.startsWith('uuid-teacher')) ? 'teacher' : 'student';
    },
  };
}

function createFakeLedgerDb() {
  const store = new Map(); // key: studentId|source|itemId|attempt
  return {
    store,
    async insertLedgerRow({ studentId, source, itemId, response, score, evidenceTier, attempt }) {
      const key = `${studentId}|${source}|${itemId}|${attempt}`;
      const row = {
        ledger_id: `ledger-${store.size}-${key}`,
        student_id: studentId, source, item_id: itemId,
        response, score: score ?? null, evidence_tier: evidenceTier, attempt,
      };
      store.set(key, row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },
    async updateLedgerReceipt() { return { error: null }; },
    async getLedgerByStudent() { return { data: [], error: null }; },
    async getLedgerByItem() { return { data: [], error: null }; },
  };
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); }
  start() { return new Promise((r) => this.server.listen(0, () => { this.port = this.server.address().port; r(); })); }
  stop() { return new Promise((r) => this.server.close(r)); }
  async post(path, body, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
}

describe('POST /ledger/import', () => {
  let srv, ledgerDb;
  const TEACHER = { 'x-teacher-secret': 'apteacher2627' }; // default getTeacherKey()

  beforeEach(async () => {
    ledgerDb = createFakeLedgerDb();
    srv = new TestServer(createApp(createFakeRosterDb(), ledgerDb));
    await srv.start();
  });
  afterEach(async () => { await srv.stop(); });

  const bundle = (sid = 'stu-1') => ({
    schema: 'apstats-offline-export/v1',
    student: { studentId: sid, username: 'mango_tiger' },
    records: [
      { source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'mean', score: 1, attempt: 1 },
      { source: 'worksheet', itemId: 'WS-U1L1-Q2', response: 'median', score: 0.5, attempt: 1 },
    ],
  });

  it('rejects a non-teacher with 401', async () => {
    const { status } = await srv.post('/ledger/import', bundle());
    expect(status).toBe(401);
  });

  it('imports a bundle for a teacher and tags evidence_tier=practice', async () => {
    const { status, body } = await srv.post('/ledger/import', bundle(), TEACHER);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, imported: 2, skipped: 0, total: 2 });
    const rows = [...ledgerDb.store.values()];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.evidence_tier === 'practice')).toBe(true);
    expect(rows.every((r) => r.student_id === 'stu-1')).toBe(true);
  });

  it('is idempotent: re-importing the same bundle does not duplicate rows', async () => {
    await srv.post('/ledger/import', bundle(), TEACHER);
    const after1 = ledgerDb.store.size;
    const { body } = await srv.post('/ledger/import', bundle(), TEACHER);
    expect(body.imported).toBe(2);            // it re-imports (upsert)
    expect(ledgerDb.store.size).toBe(after1); // but no new rows
  });

  it('skips invalid records and reports per-row errors', async () => {
    const b = bundle();
    b.records.push({ source: 'worksheet', response: 'x' });      // missing itemId
    b.records.push({ source: 'quiz', itemId: 'Q9', response: 'a', score: 5 }); // bad score
    const { status, body } = await srv.post('/ledger/import', b, TEACHER);
    expect(status).toBe(200);
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(2);
    expect(body.errors).toHaveLength(2);
  });

  it('400s an empty import', async () => {
    const { status } = await srv.post('/ledger/import', { records: [] }, TEACHER);
    expect(status).toBe(400);
  });
});
