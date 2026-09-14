// student-keys.test.js — the offline-grading mesh's STUDENT trust set
// (OFFLINE_GRADING_MESH_SPEC §0.1-0.3, §0.5). Route behavior against an in-memory
// fake db + a pglite block that runs the REAL migration 0027 to prove the schema,
// FK, and terminal-revocation semantics.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import express from 'express';
import http from 'http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountStudentKeys } from '../student-keys.js';
import { mountReceipts, initReceipts, setPersistedTrustedPubkeys, getReceiptIssuer } from '../receipts.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';
const TEACHER_SECRET = 'test-teacher-secret';
const SID_A = '00000000-0000-4000-8000-00000000000a';
const SID_B = '00000000-0000-4000-8000-00000000000b';
// Two syntactically valid (43-char base64url, real Ed25519) pubkeys.
const PK_A = 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4';
const PK_B = 'DRfEbaWByfatxMq26iHrw4wxt4MIpypZlbB3GeBFSO4';

// A stand-in roster token: the fake verifyToken maps the token string → sid.
// student-keys.js imports verifyToken from token.js, which HMACs with ROSTER_TOKEN_SECRET.
import { signToken } from '../token.js';

let savedKey, savedSecret, savedTokenSecret;
beforeAll(() => {
  savedKey = process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  savedSecret = process.env.ROSTER_TEACHER_SECRET;
  savedTokenSecret = process.env.ROSTER_TOKEN_SECRET;
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
  process.env.ROSTER_TOKEN_SECRET = 'test-token-secret';
  initReceipts();
  setPersistedTrustedPubkeys([]);
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.RECEIPT_ISSUER_PRIVATE_KEY; else process.env.RECEIPT_ISSUER_PRIVATE_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.ROSTER_TEACHER_SECRET; else process.env.ROSTER_TEACHER_SECRET = savedSecret;
  if (savedTokenSecret === undefined) delete process.env.ROSTER_TOKEN_SECRET; else process.env.ROSTER_TOKEN_SECRET = savedTokenSecret;
  initReceipts();
});

function makeWorld() {
  const roster = {
    [SID_A]: { student_id: SID_A, login_username: 'apple_fox', real_name: 'Ana', section: 'PeriodX', role: 'student' },
    [SID_B]: { student_id: SID_B, login_username: 'berry_owl', real_name: 'Ben', section: 'PeriodX', role: 'student' },
  };
  const keys = new Map();   // pubkey → row
  const db = {
    async findByStudentId(sid) { return { data: roster[sid] || null, error: null }; },
    async getRoleByStudentId(sid) { return roster[sid] ? roster[sid].role : 'student'; },
    async findTeacherUsername() { return { data: { login_username: 'teach' }, error: null }; },
    async findStudentKey(pubkey) { return { data: keys.get(pubkey) || null, error: null }; },
    async insertStudentKey({ pubkey, studentId, label }) {
      if (keys.has(pubkey)) return { data: null, error: { code: '23505' } };
      const row = { pubkey, student_id: studentId, label: label ?? null, revoked: false };
      keys.set(pubkey, row);
      return { data: row, error: null };
    },
    async listStudentKeys() { return { data: Array.from(keys.values()), error: null }; },
    async revokeStudentKey({ pubkey }) {
      const row = keys.get(pubkey);
      if (!row) return { data: null, error: null };
      row.revoked = true; row.revoked_at = 'now';
      return { data: row, error: null };
    },
    // trusted-issuers stubs so the disjointness mirror can run
    async addTrustedIssuer() { return { data: {}, error: null }; },
    async listTrustedIssuers() { return { data: [], error: null }; },
    async revokeTrustedIssuer() { return { data: {}, error: null }; },
  };
  return { db, roster, keys };
}

import { requireTeacher } from '../teacher-auth.js';
function makeServer(world) {
  const app = express();
  app.use(express.json());
  mountStudentKeys(app, { db: world.db });
  mountReceipts(app, { db: world.db, requireTeacher });
  return http.createServer(app);
}

async function call(server, method, path, { body, token, secret } = {}) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = 'Bearer ' + token;
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body: json };
}

describe('POST /student-keys/register — authenticated binding (§0.2)', () => {
  it('401s without a valid token (no client-claimed sid path exists)', async () => {
    const world = makeWorld();
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { body: { pubkey: PK_A } });
    expect(res.status).toBe(401);
  });

  it('binds the pubkey to the TOKEN sid, ignoring any body sid', async () => {
    const world = makeWorld();
    const token = signToken(SID_A);
    // Even if a body carried studentId:SID_B, the route never reads it.
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token, body: { pubkey: PK_A, studentId: SID_B } });
    expect(res.status).toBe(200);
    expect(res.body.studentId).toBe(SID_A);
    expect(world.keys.get(PK_A).student_id).toBe(SID_A);
  });

  it('rejects an invalid pubkey', async () => {
    const world = makeWorld();
    const token = signToken(SID_A);
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token, body: { pubkey: 'too-short' } });
    expect(res.status).toBe(400);
  });

  it('is idempotent for the same student + key', async () => {
    const world = makeWorld();
    const token = signToken(SID_A);
    const first = await call(makeServer(world), 'POST', '/student-keys/register', { token, body: { pubkey: PK_A } });
    expect(first.body.existing).toBe(false);
    const again = await call(makeServer(world), 'POST', '/student-keys/register', { token, body: { pubkey: PK_A } });
    expect(again.status).toBe(200);
    expect(again.body.existing).toBe(true);
    expect(world.keys.size).toBe(1);
  });

  it('409s when a pubkey is already bound to a DIFFERENT student (§0.5 one-sid-per-pubkey)', async () => {
    const world = makeWorld();
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_B), body: { pubkey: PK_A } });
    expect(res.status).toBe(409);
    expect(world.keys.get(PK_A).student_id).toBe(SID_A);   // unchanged
  });

  it('403s a revoked pubkey — even for its own student (§0.3 terminal)', async () => {
    const world = makeWorld();
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    world.keys.get(PK_A).revoked = true;
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    expect(res.status).toBe(403);
  });

  it('409s a pubkey that is already a trusted ISSUER key (§0.1c disjointness)', async () => {
    const world = makeWorld();
    // Seed the ISSUER trust cache through the boot-seed path (mountReceipts calls
    // listTrustedIssuers → setPersistedTrustedPubkeys), so it survives the seed race.
    world.db.listTrustedIssuers = async () => ({ data: [{ pubkey: PK_A }], error: null });
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    expect(res.status).toBe(409);
    setPersistedTrustedPubkeys([]);
  });

  it('401s a token for a deleted account', async () => {
    const world = makeWorld();
    const token = signToken('00000000-0000-4000-8000-00000000dead');
    const res = await call(makeServer(world), 'POST', '/student-keys/register', { token, body: { pubkey: PK_A } });
    expect(res.status).toBe(401);
  });
});

describe('GET /student-keys — served trust set', () => {
  it('401s an anonymous caller; a signed-in student or teacher may read', async () => {
    const world = makeWorld();
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    expect((await call(makeServer(world), 'GET', '/student-keys')).status).toBe(401);
    const asStudent = await call(makeServer(world), 'GET', '/student-keys', { token: signToken(SID_B) });
    expect(asStudent.status).toBe(200);
    const asTeacher = await call(makeServer(world), 'GET', '/student-keys', { secret: TEACHER_SECRET });
    expect(asTeacher.status).toBe(200);
  });

  it('includes the revoked flag (an absence must not read as "not revoked")', async () => {
    const world = makeWorld();
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_B), body: { pubkey: PK_B } });
    await call(makeServer(world), 'POST', '/student-keys/revoke', { secret: TEACHER_SECRET, body: { pubkey: PK_A } });
    const res = await call(makeServer(world), 'GET', '/student-keys', { token: signToken(SID_A) });
    const byPk = Object.fromEntries(res.body.keys.map((k) => [k.pubkey, k]));
    expect(byPk[PK_A].revoked).toBe(true);
    expect(byPk[PK_A].sid).toBe(SID_A);
    expect(byPk[PK_B].revoked).toBe(false);
  });
});

describe('POST /student-keys/revoke — teacher only', () => {
  it('401s a student and 404s an unknown pubkey', async () => {
    const world = makeWorld();
    expect((await call(makeServer(world), 'POST', '/student-keys/revoke', { token: signToken(SID_A), body: { pubkey: PK_A } })).status).toBe(401);
    expect((await call(makeServer(world), 'POST', '/student-keys/revoke', { secret: TEACHER_SECRET, body: { pubkey: PK_A } })).status).toBe(404);
  });

  it('revokes a registered key', async () => {
    const world = makeWorld();
    await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } });
    const res = await call(makeServer(world), 'POST', '/student-keys/revoke', { secret: TEACHER_SECRET, body: { pubkey: PK_A } });
    expect(res.status).toBe(200);
    expect(world.keys.get(PK_A).revoked).toBe(true);
  });
});

describe('503 when migration 0027 is not provisioned', () => {
  it('register/get/revoke all 503 when the DAOs are absent', async () => {
    const world = makeWorld();
    delete world.db.findStudentKey; delete world.db.insertStudentKey;
    delete world.db.listStudentKeys; delete world.db.revokeStudentKey;
    expect((await call(makeServer(world), 'POST', '/student-keys/register', { token: signToken(SID_A), body: { pubkey: PK_A } })).status).toBe(503);
    expect((await call(makeServer(world), 'GET', '/student-keys', { token: signToken(SID_A) })).status).toBe(503);
    expect((await call(makeServer(world), 'POST', '/student-keys/revoke', { secret: TEACHER_SECRET, body: { pubkey: PK_A } })).status).toBe(503);
  });
});

// ── pglite: the REAL migration 0027 SQL ─────────────────────────────────────────
describe('migration 0027 student_keys (real schema via pglite)', () => {
  const migDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  let pg;
  const S = '00000000-0000-4000-8000-0000000000d1';

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    pg = new PGlite();
    await pg.exec(`create table roster (student_id uuid primary key default gen_random_uuid(), login_username text, section text, real_name text, role text default 'student', created_at timestamptz default now());`);
    await pg.exec(await readFile(resolve(migDir, '0027_student_keys.sql'), 'utf8'));
    await pg.query('insert into roster (student_id, login_username, section) values ($1, $2, $3)', [S, 'cherry_cat', 'PeriodX']);
  }, 60000);
  afterAll(async () => { if (pg) await pg.close(); });

  it('is idempotent to re-run', async () => {
    await pg.exec(await readFile(resolve(migDir, '0027_student_keys.sql'), 'utf8'));
    expect(true).toBe(true);
  });

  it('binds a key, enforces the pubkey PK, and cascades on student delete', async () => {
    await pg.query('insert into student_keys (pubkey, student_id) values ($1, $2)', [PK_A, S]);
    const dup = pg.query('insert into student_keys (pubkey, student_id) values ($1, $2)', [PK_A, S]);
    await expect(dup).rejects.toThrow();                    // pubkey primary key
    const bad = pg.query('insert into student_keys (pubkey, student_id) values ($1, $2)', [PK_B, '00000000-0000-4000-8000-0000000000ff']);
    await expect(bad).rejects.toThrow();                    // FK to roster
    const before = await pg.query('select count(*)::int as n from student_keys');
    expect(before.rows[0].n).toBe(1);
    await pg.query('delete from roster where student_id = $1', [S]);
    const after = await pg.query('select count(*)::int as n from student_keys');
    expect(after.rows[0].n).toBe(0);                        // on delete cascade
  });
});
