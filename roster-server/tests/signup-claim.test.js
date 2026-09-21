// signup-claim.test.js — student self-signup: POST /roster/claim,
// GET /roster/open-sections, and the pure helpers (signup-config, rate-limit).
// Injects a fake in-memory db — NO network, NO real Supabase.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes, randomUUID } from 'crypto';
import { createApp } from '../server.js';
import { verifyToken } from '../token.js';
import { parseOpenSections, getOpenSections, isOpenSection } from '../signup-config.js';
import { createRateLimiter, createLoginThrottle } from '../rate-limit.js';
import { requireTeacher, getTeacherKey } from '../teacher-auth.js';

// ── Fake in-memory db (honors the mustChangePassword flag) ────────────────────

function createFakeDb() {
  const store = new Map();
  return {
    store,
    async listRoster() { return { data: [...store.values()], error: null }; },
    async findByStudentId(id) { return { data: [...store.values()].find(row => row.student_id === id), error: null }; },
    async insertRoster({ realName, section, loginUsername, passwordHash, email, passwordCipher, mustChangePassword = true, role = 'student' }) {
      const key = loginUsername.toLowerCase();
      if (store.has(key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      const row = {
        student_id:           randomUUID(),   // real uuid format (the DELETE route validates it)
        login_username:       loginUsername,
        password_hash:        passwordHash,
        password_cipher:      passwordCipher ?? null,
        must_change_password: mustChangePassword,
        role,
        real_name:            realName,
        section,
        email:                email || null,
        status:               'active',
        created_at:           new Date().toISOString()
      };
      store.set(key, row);
      return { data: row, error: null };
    },
    async findByUsername(username) {
      const row = store.get(username.toLowerCase());
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      return { data: row, error: null };
    },
    async deleteRoster(studentId) {
      for (const [k, row] of store) {
        if (row.student_id === studentId) { store.delete(k); return { data: { student_id: studentId }, error: null }; }
      }
      return { data: null, error: null }; // not found
    },
    async getRoleByStudentId() { return 'student'; },
    async getSpriteHueByStudentId() { return null; }
  };
}

// ── Lightweight test server ──────────────────────────────────────────────────

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
        resolve();
      });
    });
  }
  stop() { return new Promise((resolve) => this.server.close(resolve)); }
  async request(method, path, { body, headers = {} } = {}) {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

const validClaim = (over = {}) => ({
  realName: 'Jordan Lee',
  section:  'C',
  username: 'mango_otter',
  pin:      '1234',
  ...over
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

let db, srv;

beforeEach(async () => {
  process.env.ROSTER_TOKEN_SECRET = `token-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_PW_ENC_KEY   = 'a'.repeat(64);
  process.env.NODE_ENV            = 'test';
  delete process.env.OPEN_SIGNUP_SECTIONS;
  delete process.env.SIGNUP_CLAIM_MAX;
  delete process.env.SIGNUP_CLAIM_WINDOW_MS;
  delete process.env.TEACHER_KEY;
  delete process.env.ROSTER_TEACHER_SECRET;

  db = createFakeDb();
  srv = new TestServer(createApp(db));
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_PW_ENC_KEY;
  delete process.env.OPEN_SIGNUP_SECTIONS;
  delete process.env.SIGNUP_CLAIM_MAX;
  delete process.env.SIGNUP_CLAIM_WINDOW_MS;
  delete process.env.TEACHER_KEY;
  delete process.env.ROSTER_TEACHER_SECRET;
});

// ── GET /roster/open-sections ─────────────────────────────────────────────────

describe('GET /roster/open-sections', () => {
  it('defaults to Algebra 2 sections C, D and G', async () => {
    const res = await srv.request('GET', '/roster/open-sections');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sections).toEqual([{ value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' }, { value: 'G', label: 'Section G' }]);
  });

  it('honors OPEN_SIGNUP_SECTIONS env (value:label list)', async () => {
    process.env.OPEN_SIGNUP_SECTIONS = 'PeriodA:Period A;PeriodB:Period B';
    const res = await srv.request('GET', '/roster/open-sections');
    expect(res.body.sections).toEqual([
      { value: 'PeriodA', label: 'Period A' },
      { value: 'PeriodB', label: 'Period B' }
    ]);
  });
});

// ── POST /roster/claim ────────────────────────────────────────────────────────

describe('POST /roster/claim', () => {
  it.each(['C', 'D', 'G'])('claims and signs in to Algebra 2 section %s', async section => {
    const username = `section_${section.toLowerCase()}`;
    const claim = await srv.request('POST', '/roster/claim', {
      body: validClaim({ section, username }),
    });
    expect(claim.status).toBe(200);
    expect(claim.body.section).toBe(section);
    expect(db.store.get(username).section).toBe(section);
    const session = await srv.request('POST', '/roster/verify', {
      body: { username, password: '1234' },
    });
    expect(session.status).toBe(200);
    expect(session.body.section).toBe(section);
  });

  it('claims a username, returns a verify-shaped session, and signs in (mustChangePassword=false)', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim() });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.username).toBe('mango_otter');
    expect(res.body.realName).toBe('Jordan Lee');
    expect(res.body.section).toBe('C');
    expect(res.body.role).toBe('student');
    expect(res.body.mustChangePassword).toBe(false);
    // token resolves to the new student id
    expect(verifyToken(res.body.token)).toBe(res.body.studentId);
    // the stored row is NOT forced to change password
    expect(db.store.get('mango_otter').must_change_password).toBe(false);
  });

  it('lets the student sign in afterwards with username + the 4-digit PIN', async () => {
    await srv.request('POST', '/roster/claim', { body: validClaim() });
    const verify = await srv.request('POST', '/roster/verify', { body: { username: 'mango_otter', password: '1234' } });
    expect(verify.status).toBe(200);
    expect(verify.body.ok).toBe(true);
    expect(verify.body.mustChangePassword).toBe(false);
  });

  it('rejects a taken username with 409 username-taken (first-come-first-serve)', async () => {
    await srv.request('POST', '/roster/claim', { body: validClaim() });
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ realName: 'Someone Else' }) });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('username-taken');
  });

  it('rejects a section not in the allowlist with 403 (never trusts the client)', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ section: 'PeriodZ' }) });
    expect(res.status).toBe(403);
    expect(db.store.size).toBe(0);
  });

  it('rejects a non-4-digit PIN with 400', async () => {
    for (const pin of ['123', '12345', 'abcd', '12a4', '']) {
      const res = await srv.request('POST', '/roster/claim', { body: validClaim({ pin, username: `u_${pin || 'x'}` }) });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a missing/blank real name with 400', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ realName: '   ' }) });
    expect(res.status).toBe(400);
  });

  it('rejects a bad username charset with 400', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 'Bad Name!' }) });
    expect(res.status).toBe(400);
  });

  it('strips angle brackets from the real name so no tag can form (XSS defense-in-depth)', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ realName: 'Jo<script>rdan' }) });
    expect(res.status).toBe(200);
    expect(res.body.realName).not.toMatch(/[<>]/);
    expect(res.body.realName).toBe('Joscriptrdan');
  });

  it('rate-limits once the per-IP cap is exceeded (429)', async () => {
    process.env.SIGNUP_CLAIM_MAX = '2';
    const limited = new TestServer(createApp(createFakeDb()));
    await limited.start();
    try {
      const a = await limited.request('POST', '/roster/claim', { body: validClaim({ username: 'a_one' }) });
      const b = await limited.request('POST', '/roster/claim', { body: validClaim({ username: 'b_two', realName: 'Morgan Reed' }) });
      const c = await limited.request('POST', '/roster/claim', { body: validClaim({ username: 'c_three' }) });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
    } finally {
      await limited.stop();
    }
  });

  it('a forged X-Forwarded-For PREFIX does not reset the limiter (trust proxy is bounded to 1 hop)', async () => {
    // With trust proxy:1, req.ip is the proxy-appended (rightmost) hop. We simulate
    // Railway's edge proxy with a FIXED real-client hop and rotate a forged prefix;
    // the limiter must still bucket on the fixed hop and trip. (Under the old
    // trust proxy:true this rotated the bucket and the cap never fired.)
    process.env.SIGNUP_CLAIM_MAX = '2';
    const limited = new TestServer(createApp(createFakeDb()));
    await limited.start();
    try {
      const mk = (i) => limited.request('POST', '/roster/claim', {
        body: validClaim({ username: `xff_${i}`, realName: ['Jordan Lee', 'Morgan Reed', 'Casey Stone'][i - 1] }),
        headers: { 'X-Forwarded-For': `9.9.9.${i}, 203.0.113.7` }
      });
      const a = await mk(1);
      const b = await mk(2);
      const c = await mk(3);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
    } finally {
      await limited.stop();
    }
  });
});

// ── POST /roster/verify — brute-force lockout ──────────────────────────────────

describe('POST /roster/verify brute-force lockout', () => {
  it('locks a username after too many failed PIN attempts, then refuses even the correct PIN', async () => {
    process.env.VERIFY_LOCKOUT_MAX = '3';
    const fdb = createFakeDb();
    const app = new TestServer(createApp(fdb));
    await app.start();
    try {
      await app.request('POST', '/roster/claim', { body: validClaim({ username: 'lock_me' }) });
      for (let i = 0; i < 3; i++) {
        const r = await app.request('POST', '/roster/verify', { body: { username: 'lock_me', password: '0000' } });
        expect(r.status).toBe(401);
      }
      const locked = await app.request('POST', '/roster/verify', { body: { username: 'lock_me', password: '0000' } });
      expect(locked.status).toBe(429);
      // correct PIN is refused while locked (no enumeration of which half failed)
      const correctButLocked = await app.request('POST', '/roster/verify', { body: { username: 'lock_me', password: '1234' } });
      expect(correctButLocked.status).toBe(429);
    } finally {
      await app.stop();
      delete process.env.VERIFY_LOCKOUT_MAX;
    }
  });

  it('does NOT lock a NON-EXISTENT username (unknown-user failures are not counted)', async () => {
    process.env.VERIFY_LOCKOUT_MAX = '3';
    const app = new TestServer(createApp(createFakeDb()));
    await app.start();
    try {
      // Far more than the cap, on a username that was never claimed → always 401,
      // never 429 (so an attacker can't inflate the throttle Map with random names).
      for (let i = 0; i < 8; i++) {
        const r = await app.request('POST', '/roster/verify', { body: { username: 'ghost_user', password: '0000' } });
        expect(r.status).toBe(401);
      }
    } finally {
      await app.stop();
      delete process.env.VERIFY_LOCKOUT_MAX;
    }
  });

  it('a correct sign-in clears the failure counter (no premature lock for a fat-fingered student)', async () => {
    process.env.VERIFY_LOCKOUT_MAX = '3';
    const fdb = createFakeDb();
    const app = new TestServer(createApp(fdb));
    await app.start();
    try {
      await app.request('POST', '/roster/claim', { body: validClaim({ username: 'clear_me' }) });
      await app.request('POST', '/roster/verify', { body: { username: 'clear_me', password: '0000' } });
      await app.request('POST', '/roster/verify', { body: { username: 'clear_me', password: '0000' } });
      const good = await app.request('POST', '/roster/verify', { body: { username: 'clear_me', password: '1234' } });
      expect(good.status).toBe(200);
      // counter reset → 3 more failures are allowed before the next lock
      for (let i = 0; i < 3; i++) {
        const r = await app.request('POST', '/roster/verify', { body: { username: 'clear_me', password: '0000' } });
        expect(r.status).toBe(401);
      }
    } finally {
      await app.stop();
      delete process.env.VERIFY_LOCKOUT_MAX;
    }
  });
});

// ── POST /roster/verify — per-IP rate limit (bcrypt-DoS hardening) ─────────────

describe('POST /roster/verify per-IP rate limit', () => {
  it('caps verify attempts per IP regardless of username (429 after the cap)', async () => {
    process.env.VERIFY_IP_MAX = '3';
    const app = new TestServer(createApp(createFakeDb()));
    await app.start();
    try {
      // Distinct usernames so the per-USERNAME lockout never fires — the only 429
      // source here is the per-IP limiter. Unknown users 401; the 4th hits the cap.
      const a = await app.request('POST', '/roster/verify', { body: { username: 'ip_a', password: '0000' } });
      const b = await app.request('POST', '/roster/verify', { body: { username: 'ip_b', password: '0000' } });
      const c = await app.request('POST', '/roster/verify', { body: { username: 'ip_c', password: '0000' } });
      const d = await app.request('POST', '/roster/verify', { body: { username: 'ip_d', password: '0000' } });
      expect(a.status).not.toBe(429);
      expect(b.status).not.toBe(429);
      expect(c.status).not.toBe(429);
      expect(d.status).toBe(429);
    } finally {
      await app.stop();
      delete process.env.VERIFY_IP_MAX;
    }
  });
});

// ── POST /roster/claim — teacher elevation ─────────────────────────────────────

describe('POST /roster/claim teacher elevation', () => {
  it('creates a teacher account when the correct teacher key is given', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 't_one', teacherKey: 'apteacher2627' }) });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('teacher');
    expect(db.store.get('t_one').role).toBe('teacher');
  });

  it('rejects a wrong teacher key with 403 and creates no account', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 't_bad', teacherKey: 'nope' }) });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('invalid-teacher-key');
    expect(db.store.has('t_bad')).toBe(false);
  });

  it('rejects a non-string teacher key (no elevation via type juggling)', async () => {
    // String(true) !== getTeacherKey() → 403; never coerces to a teacher.
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 't_type', teacherKey: true }) });
    expect(res.status).toBe(403);
    expect(db.store.has('t_type')).toBe(false);
  });

  it('creates a normal student account when no teacher key is given', async () => {
    const res = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 's_one' }) });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('student');
    expect(db.store.get('s_one').role).toBe('student');
  });

  it('honors a custom TEACHER_KEY env (default key no longer elevates)', async () => {
    process.env.TEACHER_KEY = 'secret123';
    const fresh = new TestServer(createApp(db));
    await fresh.start();
    try {
      const ok = await fresh.request('POST', '/roster/claim', { body: validClaim({ username: 't_env', teacherKey: 'secret123' }) });
      expect(ok.body.role).toBe('teacher');
      const bad = await fresh.request('POST', '/roster/claim', { body: validClaim({ username: 't_env2', realName: 'Morgan Reed', teacherKey: 'apteacher2627' }) });
      expect(bad.status).toBe(403);
    } finally {
      await fresh.stop();
      delete process.env.TEACHER_KEY;
    }
  });
});

// ── DELETE /roster/:studentId ──────────────────────────────────────────────────

describe('DELETE /roster/:studentId', () => {
  it('deletes a roster account for an authorized teacher', async () => {
    const claim = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 'del_me' }) });
    const sid = claim.body.studentId;
    const res = await srv.request('DELETE', '/roster/' + sid, { headers: { 'x-teacher-secret': 'apteacher2627' } });
    expect(res.status).toBe(200);
    expect(res.body.studentId).toBe(sid);
    expect(db.store.has('del_me')).toBe(false);
  });

  it('404 for a well-formed but unknown studentId', async () => {
    const res = await srv.request('DELETE', '/roster/00000000-0000-0000-0000-000000000000', { headers: { 'x-teacher-secret': 'apteacher2627' } });
    expect(res.status).toBe(404);
  });

  it('400 for a malformed (non-uuid) studentId — not a 500', async () => {
    const res = await srv.request('DELETE', '/roster/nope-not-a-uuid', { headers: { 'x-teacher-secret': 'apteacher2627' } });
    expect(res.status).toBe(400);
  });

  it('401 without teacher auth — and the account survives', async () => {
    const claim = await srv.request('POST', '/roster/claim', { body: validClaim({ username: 'keep_me' }) });
    const res = await srv.request('DELETE', '/roster/' + claim.body.studentId);
    expect(res.status).toBe(401);
    expect(db.store.has('keep_me')).toBe(true);
  });

  it('500 when the DB delete errors (the error branch is not dead)', async () => {
    // A db whose deleteRoster returns a non-null error → 500 (a swallowed error
    // returning 200 would falsely report a deletion that did not happen).
    const errDb = createFakeDb();
    errDb.deleteRoster = async () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    const errSrv = new TestServer(createApp(errDb));
    await errSrv.start();
    try {
      const res = await errSrv.request('DELETE', '/roster/00000000-0000-0000-0000-000000000001', { headers: { 'x-teacher-secret': 'apteacher2627' } });
      expect(res.status).toBe(500);
    } finally {
      await errSrv.stop();
    }
  });

  it('also purges curriculum_render peer answers for the deleted username (best-effort cascade)', async () => {
    const fdb = createFakeDb();
    let purgedFor = null;
    // The real deleteRoster returns login_username; emulate that + the cr purge hook.
    fdb.deleteRoster = async (sid) => ({ data: { student_id: sid, login_username: 'cascade_me' }, error: null });
    fdb.deletePeerAnswers = async (username) => { purgedFor = username; return { data: null, error: null }; };
    const app = new TestServer(createApp(fdb));
    await app.start();
    try {
      const res = await app.request('DELETE', '/roster/00000000-0000-0000-0000-000000000007', { headers: { 'x-teacher-secret': 'apteacher2627' } });
      expect(res.status).toBe(200);
      expect(purgedFor).toBe('cascade_me');
    } finally {
      await app.stop();
    }
  });

  it('still 200 when the cr peer-answers purge throws (roster row is already gone)', async () => {
    const fdb = createFakeDb();
    fdb.deleteRoster = async (sid) => ({ data: { student_id: sid, login_username: 'oops' }, error: null });
    fdb.deletePeerAnswers = async () => { throw new Error('cr unreachable'); };
    const app = new TestServer(createApp(fdb));
    await app.start();
    try {
      const res = await app.request('DELETE', '/roster/00000000-0000-0000-0000-000000000008', { headers: { 'x-teacher-secret': 'apteacher2627' } });
      expect(res.status).toBe(200);
    } finally {
      await app.stop();
    }
  });
});

// ── teacher-auth: simple key works everywhere ──────────────────────────────────

describe('teacher-auth getTeacherKey / requireTeacher', () => {
  it('defaults the teacher key to apteacher2627', () => {
    delete process.env.TEACHER_KEY;
    expect(getTeacherKey()).toBe('apteacher2627');
  });

  it('requireTeacher accepts the simple teacher key as x-teacher-secret', async () => {
    delete process.env.TEACHER_KEY;
    const req = { headers: { 'x-teacher-secret': 'apteacher2627' }, query: {} };
    expect(await requireTeacher(req, {})).toBe(true);
  });

  it('requireTeacher rejects a wrong secret', async () => {
    delete process.env.TEACHER_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    const req = { headers: { 'x-teacher-secret': 'definitely-wrong' }, query: {} };
    expect(await requireTeacher(req, {})).toBe(false);
  });

  it('requireTeacher does NOT grant when no header and no token are present', async () => {
    delete process.env.TEACHER_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    expect(await requireTeacher({ headers: {}, query: {} }, {})).toBe(false);
    // An empty-string header must not match either (the `provided &&` guard).
    expect(await requireTeacher({ headers: { 'x-teacher-secret': '' }, query: {} }, {})).toBe(false);
  });

  it('still accepts the legacy ROSTER_TEACHER_SECRET when configured', async () => {
    process.env.ROSTER_TEACHER_SECRET = 'legacy-long-secret';
    const req = { headers: { 'x-teacher-secret': 'legacy-long-secret' }, query: {} };
    expect(await requireTeacher(req, {})).toBe(true);
    delete process.env.ROSTER_TEACHER_SECRET;
  });
});

// ── signup-config (pure) ───────────────────────────────────────────────────────

describe('signup-config parseOpenSections', () => {
  it('falls back to the default when env is empty/garbage', () => {
    expect(parseOpenSections(undefined)).toEqual([{ value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' }, { value: 'G', label: 'Section G' }]);
    expect(parseOpenSections('')).toEqual([{ value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' }, { value: 'G', label: 'Section G' }]);
    expect(parseOpenSections(';;')).toEqual([{ value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' }, { value: 'G', label: 'Section G' }]);
  });

  it('parses value:label pairs and keeps spaces in labels', () => {
    expect(parseOpenSections('PeriodE:Period X')).toEqual([{ value: 'PeriodE', label: 'Period X' }]);
    expect(parseOpenSections('A:Period A;B:Period B')).toEqual([
      { value: 'A', label: 'Period A' },
      { value: 'B', label: 'Period B' }
    ]);
  });

  it('uses the value as the label when no colon is given', () => {
    expect(parseOpenSections('SUMMER26')).toEqual([{ value: 'SUMMER26', label: 'SUMMER26' }]);
  });

  it('isOpenSection reflects the live env', () => {
    process.env.OPEN_SIGNUP_SECTIONS = 'PeriodE:Period X';
    expect(isOpenSection('PeriodE')).toBe(true);
    expect(isOpenSection('PeriodB')).toBe(false);
    delete process.env.OPEN_SIGNUP_SECTIONS;
    expect(getOpenSections()).toEqual([{ value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' }, { value: 'G', label: 'Section G' }]);
  });
});

// ── rate-limit (pure) ──────────────────────────────────────────────────────────

describe('rate-limit createRateLimiter', () => {
  it('allows up to max, then blocks within the window', () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 3 });
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 0)).toBe(false);
  });

  it('resets after the window elapses', () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 500)).toBe(false);
    expect(allow('ip', 1000)).toBe(true);
  });

  it('buckets per key independently', () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(allow('a', 0)).toBe(true);
    expect(allow('b', 0)).toBe(true);
    expect(allow('a', 0)).toBe(false);
  });
});

describe('rate-limit createLoginThrottle', () => {
  it('locks after maxFailures and clears on succeed', () => {
    const t = createLoginThrottle({ windowMs: 1000, maxFailures: 3 });
    expect(t.isLocked('u', 0)).toBe(false);
    t.fail('u', 0); t.fail('u', 0); t.fail('u', 0);
    expect(t.isLocked('u', 0)).toBe(true);
    t.succeed('u');
    expect(t.isLocked('u', 0)).toBe(false);
  });

  it('unlocks after the window elapses', () => {
    const t = createLoginThrottle({ windowMs: 1000, maxFailures: 1 });
    t.fail('u', 0);
    expect(t.isLocked('u', 500)).toBe(true);
    expect(t.isLocked('u', 1000)).toBe(false);
  });

  it('buckets failures per key (one victim cannot lock another account)', () => {
    const t = createLoginThrottle({ windowMs: 1000, maxFailures: 1 });
    t.fail('a', 0);
    expect(t.isLocked('a', 0)).toBe(true);
    expect(t.isLocked('b', 0)).toBe(false);
  });
});
