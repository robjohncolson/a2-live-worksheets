// auth.test.js — integration tests for enroll/verify/resolve routes
// Injects a fake in-memory db — NO network, NO real Supabase.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { verifyToken } from '../token.js';

// ── Fake in-memory db ────────────────────────────────────────────────────────

function createFakeDb() {
  const store = new Map(); // loginUsername.toLowerCase() → row

  return {
    store,

    async insertRoster({ realName, section, loginUsername, passwordHash, email, passwordCipher }) {
      const key = loginUsername.toLowerCase();

      if (store.has(key)) {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' }
        };
      }

      const row = {
        student_id:           `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        login_username:       loginUsername,
        password_hash:        passwordHash,
        password_cipher:      passwordCipher ?? null,
        must_change_password: true,
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
      const key = username.toLowerCase();
      const row = store.get(key);

      if (!row) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      }

      return { data: row, error: null };
    },

    async updatePassword({ studentId, passwordHash, passwordCipher }) {
      const row = [...store.values()].find(r => r.student_id === studentId);

      if (!row) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      }

      row.password_hash = passwordHash;
      row.password_cipher = passwordCipher ?? null;
      row.must_change_password = false;

      return { data: { student_id: studentId }, error: null };
    },

    async listRoster(section) {
      const rows = [...store.values()]
        .filter(r => !section || r.section === section)
        .map(r => ({
          real_name:            r.real_name,
          login_username:       r.login_username,
          section:              r.section,
          password_cipher:      r.password_cipher,
          must_change_password: r.must_change_password,
          created_at:           r.created_at
        }));

      return { data: rows, error: null };
    }
  };
}

// ── Lightweight test server ──────────────────────────────────────────────────

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
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let db;
let srv;
let teacherSecret;
let tokenSecret;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret = makeSecret('token');

  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = tokenSecret;
  process.env.ROSTER_PW_ENC_KEY     = 'a'.repeat(64);
  process.env.NODE_ENV              = 'test';
  // requireTeacher now also accepts the simple key (default 'apteacher2627'); these
  // 'wrong secret → 401' assertions depend on TEACHER_KEY being unset (so it stays
  // the default and the random/bogus secrets here never accidentally match it).
  delete process.env.TEACHER_KEY;

  db  = createFakeDb();
  const app = createApp(db);
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_PW_ENC_KEY;
  delete process.env.TEACHER_KEY;
});

// ── /health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with ok:true, service:"roster", and a time string', async () => {
    const { status, body } = await srv.request('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('roster');
    expect(typeof body.time).toBe('string');
  });
});

// ── /roster/enroll ───────────────────────────────────────────────────────────

describe('POST /roster/enroll', () => {
  async function enroll(overrides = {}) {
    return srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Alice Smith', section: 'SUMMER26', password: 'hunter2', ...overrides }
    });
  }

  it('happy path: returns studentId and username on success', async () => {
    const { status, body } = await enroll();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.studentId).toBe('string');
    expect(body.studentId.length).toBeGreaterThan(0);
    expect(typeof body.username).toBe('string');
    expect(body.username).toMatch(/^[a-z]+_[a-z]+/); // fruit_animal format
    expect(body.realName).toBe('Alice Smith');
    expect(body.section).toBe('SUMMER26');
  });

  it('stores a bcrypt hash — not plaintext — and hash passes bcrypt.compare', async () => {
    await enroll({ realName: 'Bob Jones', password: 'mypassword' });

    const rows = [...db.store.values()];
    const row  = rows.find(r => r.real_name === 'Bob Jones');
    expect(row).toBeDefined();

    // Must be a bcrypt hash (never plaintext)
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toBe('mypassword');

    const matches = await bcrypt.compare('mypassword', row.password_hash);
    expect(matches).toBe(true);
  });

  it('returns 401 {ok:false,error:"forbidden"} when x-teacher-secret header is missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      body: { realName: 'Carol', section: 'SUMMER26', password: 'pass' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('returns 401 {ok:false,error:"forbidden"} when teacher secret is wrong', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': makeSecret('wrong') },
      body: { realName: 'Dave', section: 'SUMMER26', password: 'pass' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
  });

  it('returns 400 when required fields are missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Eve' } // missing section and password
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('response body never contains the word "password" or "hash"', async () => {
    const { body } = await enroll({ realName: 'Frank' });
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('hash');
  });
});

// ── /roster/verify ───────────────────────────────────────────────────────────

describe('POST /roster/verify', () => {
  async function enrollOne(realName = 'Test Student', password = 'testpass') {
    const { body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName, section: 'SUMMER26', password }
    });
    return body; // { ok, studentId, username, realName, section }
  }

  it('correct credentials → 200 with token and studentId', async () => {
    const enrolled = await enrollOne('Grace Lee', 'correctpass');
    expect(enrolled.ok).toBe(true);

    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'correctpass' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.studentId).toBe(enrolled.studentId);
    expect(typeof body.token).toBe('string');
    expect(body.realName).toBe('Grace Lee');
    expect(body.section).toBe('SUMMER26');
  });

  it('returned token is accepted by verifyToken() and resolves to the correct studentId', async () => {
    const enrolled = await enrollOne('Henry Park', 'mypass');
    const { body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'mypass' }
    });

    expect(body.ok).toBe(true);
    const resolvedId = verifyToken(body.token);
    expect(resolvedId).toBe(enrolled.studentId);
  });

  it('wrong password → 401 "Invalid username or password" (generic message)', async () => {
    const enrolled = await enrollOne('Irene Kim', 'rightpass');
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'wrongpass' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid username or password');
  });

  it('unknown username → 401 with THE SAME generic message (no user enumeration)', async () => {
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: 'totally_unknown_user', password: 'anypass' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid username or password');
  });

  it('lookup is case-insensitive on username', async () => {
    const enrolled = await enrollOne('Jack Wu', 'casepass');

    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username.toUpperCase(), password: 'casepass' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 400 when username or password is missing', async () => {
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: 'someone' } // missing password
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('response body never contains "hash" or "password_hash"', async () => {
    const enrolled = await enrollOne('Kate Ng', 'safepass');
    const { body } = await srv.request('POST', '/roster/verify', {
      body: { username: enrolled.username, password: 'safepass' }
    });

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('password_hash');
    expect(bodyStr).not.toContain('hash');
  });
});

// ── /roster/resolve ──────────────────────────────────────────────────────────

describe('POST /roster/resolve', () => {
  it('valid token resolves to studentId', async () => {
    const { body: enrollBody } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Leon Ray', section: 'SUMMER26', password: 'resolvepass' }
    });
    const { body: verifyBody } = await srv.request('POST', '/roster/verify', {
      body: { username: enrollBody.username, password: 'resolvepass' }
    });

    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: { token: verifyBody.token }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.studentId).toBe(enrollBody.studentId);
  });

  it('invalid/garbage token returns 401', async () => {
    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: { token: 'garbage.token' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('missing token field returns 401', async () => {
    const { status, body } = await srv.request('POST', '/roster/resolve', {
      body: {}
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

// ── TR1: enroll/verify additive deltas ───────────────────────────────────────

describe('TR1 enroll/verify deltas', () => {
  async function enroll(realName = 'Mara Vix', password = 'default-pw-1') {
    const { body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName, section: 'TR1SEC', password }
    });
    return body;
  }

  it('enroll stores a password_cipher and must_change_password=true', async () => {
    const e = await enroll('Nina Olu', 'startpass');
    const row = [...db.store.values()].find(r => r.real_name === 'Nina Olu');
    expect(row.must_change_password).toBe(true);
    expect(typeof row.password_cipher).toBe('string');
    expect(row.password_cipher.startsWith('v1:')).toBe(true);
    expect(row.password_cipher).not.toContain('startpass');
  });

  it('fresh account: verify returns mustChangePassword:true and no hash leak', async () => {
    const e = await enroll('Omar Pax', 'firstpass');
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: e.username, password: 'firstpass' }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mustChangePassword).toBe(true);
    const s = JSON.stringify(body);
    expect(s).not.toContain('password_hash');
    expect(s).not.toContain('hash');
  });
});

// ── TR1: POST /roster/change-password ────────────────────────────────────────

describe('POST /roster/change-password', () => {
  async function enrollAndSignIn(password = 'default-pw-1') {
    const { body: e } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Pat Quill', section: 'TR1SEC', password }
    });
    const { body: v } = await srv.request('POST', '/roster/verify', {
      body: { username: e.username, password }
    });
    return { username: e.username, token: v.token };
  }

  it('missing token → 401 invalid token', async () => {
    const { status, body } = await srv.request('POST', '/roster/change-password', {
      body: { newPassword: 'whatever1' }
    });
    expect(status).toBe(401);
    expect(body.error).toBe('invalid token');
  });

  it('garbage token → 401 invalid token', async () => {
    const { status, body } = await srv.request('POST', '/roster/change-password', {
      body: { token: 'garbage.token', newPassword: 'whatever1' }
    });
    expect(status).toBe(401);
    expect(body.error).toBe('invalid token');
  });

  it('short newPassword → 400', async () => {
    const { token } = await enrollAndSignIn();
    const { status, body } = await srv.request('POST', '/roster/change-password', {
      body: { token, newPassword: 'abc' }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('happy path: 200, then old password fails and new works, flag cleared', async () => {
    const { username, token } = await enrollAndSignIn('orig-pass');

    const cp = await srv.request('POST', '/roster/change-password', {
      body: { token, newPassword: 'brand-new-pass' }
    });
    expect(cp.status).toBe(200);
    expect(cp.body.ok).toBe(true);
    // Contract: response never echoes a password or any hash material.
    const cpRaw = JSON.stringify(cp.body);
    expect(cpRaw).not.toContain('hash');
    expect(cpRaw).not.toContain('password');
    expect(cpRaw).not.toContain('brand-new-pass');

    const oldTry = await srv.request('POST', '/roster/verify', {
      body: { username, password: 'orig-pass' }
    });
    expect(oldTry.status).toBe(401);

    const newTry = await srv.request('POST', '/roster/verify', {
      body: { username, password: 'brand-new-pass' }
    });
    expect(newTry.status).toBe(200);
    expect(newTry.body.ok).toBe(true);
    expect(newTry.body.mustChangePassword).toBe(false);
  });
});

// ── TR1: GET /roster/list (teacher-gated) ────────────────────────────────────

describe('GET /roster/list', () => {
  async function seed(realName, section, password) {
    await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName, section, password }
    });
  }

  it('missing teacher secret → 401 forbidden', async () => {
    const { status, body } = await srv.request('GET', '/roster/list');
    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  it('wrong teacher secret → 401 forbidden', async () => {
    const { status } = await srv.request('GET', '/roster/list', {
      headers: { 'x-teacher-secret': makeSecret('wrong') }
    });
    expect(status).toBe(401);
  });

  it('returns students with the decrypted current password', async () => {
    await seed('Rosa Tann', 'LISTSEC', 'rosapass1');

    const { status, body } = await srv.request('GET', '/roster/list?section=LISTSEC', {
      headers: { 'x-teacher-secret': teacherSecret }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const rosa = body.students.find(s => s.realName === 'Rosa Tann');
    expect(rosa).toBeDefined();
    expect(typeof rosa.username).toBe('string');
    expect(rosa.currentPassword).toBe('rosapass1');
    expect(rosa.mustChangePassword).toBe(true);
    // currentPassword is the ONLY intentional plaintext; raw storage fields and
    // the AES blob must never appear in the response.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('password_cipher');
    expect(raw).not.toContain('v1:');
  });

  it('section filter narrows the result', async () => {
    await seed('Sam Uli', 'SECA', 'pwa1234');
    await seed('Tia Vale', 'SECB', 'pwb1234');

    const { body } = await srv.request('GET', '/roster/list?section=SECB', {
      headers: { 'x-teacher-secret': teacherSecret }
    });
    expect(body.students.every(s => s.section === 'SECB')).toBe(true);
    expect(body.students.some(s => s.realName === 'Tia Vale')).toBe(true);
    expect(body.students.some(s => s.realName === 'Sam Uli')).toBe(false);
  });

  it('reflects the new password after a change', async () => {
    await seed('Uma Wynn', 'CHGSEC', 'before-pw');
    const { body: list1 } = await srv.request('GET', '/roster/list?section=CHGSEC', {
      headers: { 'x-teacher-secret': teacherSecret }
    });
    const uma = list1.students.find(s => s.realName === 'Uma Wynn');
    const { body: v } = await srv.request('POST', '/roster/verify', {
      body: { username: uma.username, password: 'before-pw' }
    });
    await srv.request('POST', '/roster/change-password', {
      body: { token: v.token, newPassword: 'after-pw-9' }
    });

    const { body: list2 } = await srv.request('GET', '/roster/list?section=CHGSEC', {
      headers: { 'x-teacher-secret': teacherSecret }
    });
    const uma2 = list2.students.find(s => s.realName === 'Uma Wynn');
    expect(uma2.currentPassword).toBe('after-pw-9');
    expect(uma2.mustChangePassword).toBe(false);
  });
});

// ── 2026-05-20: GET /roster/section/:section (PUBLIC) ───────────────────────
// Student-facing sign-in dropdown. Returns username + realName + section
// only; NO password info; NO email; NO mustChangePassword. No auth required.

describe('GET /roster/section/:section (public)', () => {
  async function seedPub(realName, section, password) {
    await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName, section, password }
    });
  }

  it('returns 200 + students array with NO password info', async () => {
    await seedPub('Pub Pierce', 'PUBSEC1', 'pubpass11');
    const { status, body } = await srv.request('GET', '/roster/section/PUBSEC1');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.students)).toBe(true);
    const p = body.students.find(s => s.realName === 'Pub Pierce');
    expect(p).toBeDefined();
    expect(typeof p.username).toBe('string');
    expect(p.section).toBe('PUBSEC1');
    // No sensitive fields anywhere in the response.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('cipher');
    expect(raw).not.toContain('hash');
    expect(raw).not.toContain('email');
    expect(raw).not.toContain('mustChangePassword');
    expect(raw).not.toContain('createdAt');
    expect(raw).not.toContain('v1:');
  });

  it('does NOT require x-teacher-secret (publicly accessible)', async () => {
    await seedPub('Norma Open', 'PUBSEC2', 'normapass1');
    // No auth header.
    const { status } = await srv.request('GET', '/roster/section/PUBSEC2');
    expect(status).toBe(200);
  });

  it('section param scopes the result (other sections excluded)', async () => {
    await seedPub('Anya A', 'PUBSEC_A', 'pwA-12345');
    await seedPub('Bob B', 'PUBSEC_B', 'pwB-12345');
    const { body } = await srv.request('GET', '/roster/section/PUBSEC_A');
    expect(body.students.every(s => s.section === 'PUBSEC_A')).toBe(true);
    expect(body.students.some(s => s.realName === 'Anya A')).toBe(true);
    expect(body.students.some(s => s.realName === 'Bob B')).toBe(false);
  });

});
