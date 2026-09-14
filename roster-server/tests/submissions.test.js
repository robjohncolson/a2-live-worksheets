// submissions.test.js — the offline-grading-mesh hub reconcile (Phase 4):
// verifySubmissionRecord (server-side student-sig verification) + the
// /submissions/archive routes (verify + append-only archive, teacher-gated, §0.10).

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import express from 'express';
import http from 'http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySubmissionRecord } from '../snapshot-verify.js';
import { receiptInternals } from '../receipts.js';
import { mountSubmissions } from '../submissions.js';

const { canonicalize, stringifyResponse } = receiptInternals;
const TEACHER_SECRET = 'test-teacher-secret';
const SID_A = '00000000-0000-4000-8000-00000000000a';
const SID_B = '00000000-0000-4000-8000-00000000000b';

let savedSecret;
beforeAll(() => { savedSecret = process.env.ROSTER_TEACHER_SECRET; process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET; });
afterAll(() => { if (savedSecret === undefined) delete process.env.ROSTER_TEACHER_SECRET; else process.env.ROSTER_TEACHER_SECRET = savedSecret; });

function genKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { privateKey, x: publicKey.export({ format: 'jwk' }).x };
}
function ahOf(response) { return crypto.createHash('sha256').update(stringifyResponse(response), 'utf8').digest('hex').slice(0, 16); }
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

// Self-sign a submission exactly as a student device would (canonical t:'submission').
function signSubmission(privateKey, { sid = SID_A, src = 'worksheet', i = 'WS-U1L1-Q1', response = 'mean', a = 1, e = 'practice', ts = 1000, extra = {} } = {}) {
  const payload = { v: 1, t: 'submission', sid, src, i, a, e, ah: ahOf(response), ts, ...extra };
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  const sig = crypto.sign(null, bytes, privateKey);
  return {
    student_id: sid, source: src, item_id: i, response, attempt: a,
    recorded_at: new Date(ts).toISOString(),
    receipt_id: crypto.createHash('sha256').update(bytes).digest('hex'),
    receipt_compact: b64url(bytes) + '.' + b64url(sig),
  };
}

// verifySubmissionRecord reads camelCase (studentId/itemId), like verifyRecord — the
// route maps the snake_case row into that shape; the direct tests do the same here.
function rec(row) {
  return { studentId: row.student_id, itemId: row.item_id, source: row.source, response: row.response, receipt_id: row.receipt_id, receipt_compact: row.receipt_compact };
}

describe('verifySubmissionRecord (server-side, §0.1b/§0.2)', () => {
  const stu = genKey();
  const keys = [{ pubkey: stu.x, sid: SID_A, revoked: false }];

  it('accepts a genuine self-signed submission whose sid matches the registered key', () => {
    expect(verifySubmissionRecord(rec(signSubmission(stu.privateKey)), keys).ok).toBe(true);
  });

  it('rejects an unregistered / wrong key', () => {
    const other = genKey();
    expect(verifySubmissionRecord(rec(signSubmission(other.privateKey)), keys).ok).toBe(false);
  });

  it('rejects a REVOKED key', () => {
    const revoked = [{ pubkey: stu.x, sid: SID_A, revoked: true }];
    expect(verifySubmissionRecord(rec(signSubmission(stu.privateKey)), revoked).ok).toBe(false);
  });

  it('rejects impersonation: payload.sid ≠ the signing key’s registered sid (§0.2)', () => {
    // stu's key is registered to SID_A; sign a submission claiming SID_B.
    const vr = verifySubmissionRecord(rec(signSubmission(stu.privateKey, { sid: SID_B })), keys);
    expect(vr.ok).toBe(false);
    expect(vr.breaks.some((b) => b.kind === 'sub-impersonation')).toBe(true);
  });

  it('rejects a submission carrying grade fields (structurally not a submission, §0.1b)', () => {
    const sc = verifySubmissionRecord(rec(signSubmission(stu.privateKey, { extra: { sc: 1 } })), keys);
    expect(sc.breaks.some((b) => b.kind === 'sub-has-grade-fields')).toBe(true);
    const g = verifySubmissionRecord(rec(signSubmission(stu.privateKey, { extra: { g: 'self' } })), keys);
    expect(g.breaks.some((b) => b.kind === 'sub-has-grade-fields')).toBe(true);
  });

  it('rejects a t:ledger receipt (wrong type) + tampered response + forged item', () => {
    expect(verifySubmissionRecord(rec(signSubmission(stu.privateKey, { extra: { t: 'ledger' } })), keys).ok).toBe(false);
    const tampered = signSubmission(stu.privateKey); tampered.response = 'DIFFERENT';
    expect(verifySubmissionRecord(rec(tampered), keys).ok).toBe(false);
    const forged = signSubmission(stu.privateKey); forged.item_id = 'WS-U9L9-Q9';
    expect(verifySubmissionRecord(rec(forged), keys).ok).toBe(false);
  });
});

// ── /submissions/archive routes ─────────────────────────────────────────────
function makeWorld() {
  const roster = { [SID_A]: { student_id: SID_A, role: 'student', section: 'PeriodX' } };
  const archive = new Map();
  const studentKeys = [];   // filled by the test
  const db = {
    async getRoleByStudentId() { return 'student'; },
    async findTeacherUsername() { return { data: { login_username: 't' } }; },
    async listRoster() { return { data: Object.values(roster), error: null }; },
    async listStudentKeys() { return { data: studentKeys.map((k) => ({ pubkey: k.pubkey, student_id: k.sid, revoked: k.revoked })), error: null }; },
    async insertSubmissionArchive(row) {
      if (archive.has(row.receiptId)) return { data: null, error: null };   // ON CONFLICT DO NOTHING → null
      archive.set(row.receiptId, row);
      return { data: { receipt_id: row.receiptId }, error: null };
    },
    async listSubmissionArchive(ids) { return { data: Array.from(archive.values()).filter((r) => ids.includes(r.studentId)), error: null }; },
  };
  return { db, archive, studentKeys };
}
function server(world) {
  const app = express();
  app.use(express.json());
  mountSubmissions(app, { db: world.db });
  return http.createServer(app);
}
async function call(srv, method, path, { body, secret } = {}) {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => srv.close(r));
  return { status: res.status, body: json };
}

describe('POST /submissions/archive', () => {
  it('401s without the teacher secret', async () => {
    const w = makeWorld();
    expect((await call(server(w), 'POST', '/submissions/archive', { body: { submissions: [] } })).status).toBe(401);
  });

  it('verifies + archives valid submissions, rejects forged ones, and is idempotent', async () => {
    const w = makeWorld();
    const stu = genKey();
    w.studentKeys.push({ pubkey: stu.x, sid: SID_A, revoked: false });
    const good = signSubmission(stu.privateKey, { i: 'WS-U1L1-Q1' });
    const good2 = signSubmission(stu.privateKey, { i: 'WS-U1L1-Q2', response: '0' });
    const forged = signSubmission(genKey().privateKey, { i: 'WS-U1L1-Q3' });   // untrusted key
    const res = await call(server(w), 'POST', '/submissions/archive', { secret: TEACHER_SECRET, body: { submissions: [good, good2, forged] } });
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(2);
    expect(res.body.rejected).toBe(1);
    expect(w.archive.size).toBe(2);
    // idempotent re-upload → counted as duplicate, NOT archived (honest count)
    const again = await call(server(w), 'POST', '/submissions/archive', { secret: TEACHER_SECRET, body: { submissions: [good] } });
    expect(again.body.archived).toBe(0);
    expect(again.body.duplicate).toBe(1);
    expect(w.archive.size).toBe(2);   // no new row
  });

  it('503s when the archive table is not provisioned', async () => {
    const w = makeWorld();
    delete w.db.insertSubmissionArchive;
    expect((await call(server(w), 'POST', '/submissions/archive', { secret: TEACHER_SECRET, body: { submissions: [{ x: 1 }] } })).status).toBe(503);
  });
});

describe('GET /submissions/archive', () => {
  it('teacher-gated audit returns the archived rows', async () => {
    const w = makeWorld();
    w.archive.set('r1', { receiptId: 'r1', studentId: SID_A, item_id: 'WS-U1L1-Q1' });
    expect((await call(server(w), 'GET', '/submissions/archive')).status).toBe(401);
    const res = await call(server(w), 'GET', '/submissions/archive', { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.submissions.length).toBe(1);
  });
});

// ── pglite: the REAL migration 0028 ─────────────────────────────────────────
describe('migration 0028 submission_archive (real schema via pglite)', () => {
  const migDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  let pg;
  const S = '00000000-0000-4000-8000-0000000000e1';
  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    pg = new PGlite();
    await pg.exec(`create table roster (student_id uuid primary key default gen_random_uuid(), login_username text, section text, role text default 'student', created_at timestamptz default now());`);
    await pg.exec(await readFile(resolve(migDir, '0028_submission_archive.sql'), 'utf8'));
    await pg.query('insert into roster (student_id, login_username) values ($1, $2)', [S, 'cherry_cat']);
  }, 60000);
  afterAll(async () => { if (pg) await pg.close(); });

  it('is content-addressed by receipt_id (idempotent) and cascades on student delete', async () => {
    await pg.query('insert into submission_archive (receipt_id, student_id, source, item_id, receipt_compact) values ($1,$2,$3,$4,$5)', ['rid1', S, 'worksheet', 'WS-U1L1-Q1', 'p.s']);
    // re-insert same receipt_id → PK conflict (idempotency is enforced app-side via upsert-ignore)
    await expect(pg.query('insert into submission_archive (receipt_id, student_id, source, item_id, receipt_compact) values ($1,$2,$3,$4,$5)', ['rid1', S, 'worksheet', 'WS-U1L1-Q1', 'p.s'])).rejects.toThrow();
    await pg.query('delete from roster where student_id = $1', [S]);
    const after = await pg.query('select count(*)::int as n from submission_archive');
    expect(after.rows[0].n).toBe(0);   // on delete cascade
  });
});
