// sprite-hue.test.js -- integration tests for r3 U1: sprite_hue column + endpoint.
// Covers:
//   - getSpriteHueByStudentId (happy path, degrade-to-null on error/missing row)
//   - updateSpriteHue (happy path, null write)
//   - POST /roster/verify returns spriteHue field
//   - PATCH /roster/:studentId/sprite-hue: happy path, 401, 403-cross-student,
//     400-bad-range, pre-migration 503 safe-degrade
// Uses createFakeDb() + TestServer pattern from roster-edit.test.js.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { createDb } from '../db.js';
import { signToken } from '../token.js';

// ── Fake in-memory db ────────────────────────────────────────────────────────
// Mirrors roster-edit.test.js createFakeDb() with sprite_hue added.

function createFakeDb({ spriteHueOverride } = {}) {
  const store = new Map();
  let idCounter = 0;

  function makeId() {
    idCounter += 1;
    return `fake-uuid-${idCounter}`;
  }

  // updateSpriteHue calls recorded for payload inspection.
  const updateSpriteHueCalls = [];

  return {
    store,
    updateSpriteHueCalls,

    async insertRoster({ realName, section, loginUsername, passwordHash, email, passwordCipher }) {
      const studentId = makeId();
      const row = {
        student_id:           studentId,
        login_username:       loginUsername,
        password_hash:        passwordHash,
        password_cipher:      passwordCipher ?? null,
        must_change_password: true,
        real_name:            realName,
        section,
        email:                email || null,
        role:                 'student',
        sprite_hue:           null,
        status:               'active',
        created_at:           new Date().toISOString(),
        updated_at:           new Date().toISOString()
      };
      store.set(studentId, row);
      return { data: row, error: null };
    },

    async findByUsername(username) {
      const lower = username.toLowerCase();
      const row = [...store.values()].find(r => r.login_username === lower);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      return { data: row, error: null };
    },

    async findByStudentId(studentId) {
      const row = store.get(studentId) || null;
      return { data: row, error: null };
    },

    async getRoleByStudentId(studentId) {
      const row = store.get(studentId);
      if (!row) return 'student';
      return row.role === 'teacher' ? 'teacher' : 'student';
    },

    async getSpriteHueByStudentId(studentId) {
      // Support a test-injected override (for degrade-to-null tests).
      if (spriteHueOverride !== undefined) return spriteHueOverride;
      const row = store.get(studentId);
      if (!row) return null;
      const hue = row.sprite_hue;
      if (typeof hue !== 'number') return null;
      return hue;
    },

    async updatePassword({ studentId, passwordHash, passwordCipher }) {
      const row = store.get(studentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      row.password_hash        = passwordHash;
      row.password_cipher      = passwordCipher ?? null;
      row.must_change_password = false;
      return { data: { student_id: studentId }, error: null };
    },

    async updateStudent({ studentId, realName, section }) {
      const row = store.get(studentId);
      if (!row) return { data: null, error: null };
      if (realName !== undefined) row.real_name = realName;
      if (section  !== undefined) row.section   = section;
      row.updated_at = new Date().toISOString();
      return {
        data: {
          student_id:     row.student_id,
          real_name:      row.real_name,
          section:        row.section,
          login_username: row.login_username
        },
        error: null
      };
    },

    async updateSpriteHue({ studentId, spriteHue }) {
      updateSpriteHueCalls.push({ studentId, spriteHue });
      const row = store.get(studentId);
      if (!row) return { data: null, error: null };
      row.sprite_hue = spriteHue;
      row.updated_at = new Date().toISOString();
      return {
        data: { student_id: row.student_id, sprite_hue: row.sprite_hue },
        error: null
      };
    },

    async listRoster(section) {
      const rows = [...store.values()]
        .filter(r => !section || r.section === section)
        .map(r => ({
          student_id:           r.student_id,
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
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let db;
let srv;
let teacherSecret;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = makeSecret('token');
  process.env.ROSTER_PW_ENC_KEY     = 'a'.repeat(64);
  process.env.NODE_ENV              = 'test';

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
});

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedStudent(realName = 'Test Student', section = 'PeriodB') {
  const { body } = await srv.request('POST', '/roster/enroll', {
    headers: { 'x-teacher-secret': teacherSecret },
    body: { realName, section, password: 'testpass1' }
  });
  expect(body.ok).toBe(true);
  return body; // { ok, studentId, username, realName, section }
}

// Sign in via /roster/verify and return the full response body.
async function signIn(username, password = 'testpass1') {
  const { body } = await srv.request('POST', '/roster/verify', {
    body: { username, password }
  });
  expect(body.ok).toBe(true);
  return body; // { ok, studentId, token, realName, section, spriteHue, ... }
}

// Bearer auth header for a valid token.
function bearerHeader(token) {
  return { 'Authorization': `Bearer ${token}` };
}

// ── db helpers: getSpriteHueByStudentId ──────────────────────────────────────

describe('db.getSpriteHueByStudentId', () => {
  it('returns null when student has no hue set', async () => {
    const enrolled = await seedStudent();
    const result = await db.getSpriteHueByStudentId(enrolled.studentId);
    expect(result).toBeNull();
  });

  it('returns the integer hue after it has been set', async () => {
    const enrolled = await seedStudent();
    const row = db.store.get(enrolled.studentId);
    row.sprite_hue = 180;

    const result = await db.getSpriteHueByStudentId(enrolled.studentId);
    expect(result).toBe(180);
  });

  it('returns null for an unknown studentId (no row)', async () => {
    const result = await db.getSpriteHueByStudentId('no-such-uuid');
    expect(result).toBeNull();
  });

  it('degrades to null when the live db throws (real createDb, error client)', async () => {
    // Stub a Supabase client whose .maybeSingle() rejects to simulate the
    // pre-migration "column does not exist" error path.
    const errorClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    throw new Error('column "sprite_hue" of relation "roster" does not exist');
                  }
                };
              }
            };
          }
        };
      }
    };

    const liveDb = createDb(errorClient);
    const result = await liveDb.getSpriteHueByStudentId('any-id');
    expect(result).toBeNull();
  });

  it('degrades to null when the db returns a non-null error object', async () => {
    const errorResultClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: { code: '42703', message: 'undefined column' } };
                  }
                };
              }
            };
          }
        };
      }
    };

    const liveDb = createDb(errorResultClient);
    const result = await liveDb.getSpriteHueByStudentId('any-id');
    expect(result).toBeNull();
  });
});

// ── db helpers: updateSpriteHue ──────────────────────────────────────────────

describe('db.updateSpriteHue', () => {
  it('writes sprite_hue to the row and returns { data, error }', async () => {
    const enrolled = await seedStudent();

    const { data, error } = await db.updateSpriteHue({ studentId: enrolled.studentId, spriteHue: 240 });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.sprite_hue).toBe(240);

    // Confirm in-memory row updated.
    const row = db.store.get(enrolled.studentId);
    expect(row.sprite_hue).toBe(240);
  });

  it('writes null to clear a previously set hue', async () => {
    const enrolled = await seedStudent();
    const row = db.store.get(enrolled.studentId);
    row.sprite_hue = 100;

    const { data, error } = await db.updateSpriteHue({ studentId: enrolled.studentId, spriteHue: null });
    expect(error).toBeNull();
    expect(row.sprite_hue).toBeNull();
  });

  it('passes the correct payload to the real db (live createDb stub)', async () => {
    // Stub client that records the .update() payload.
    const capture = {};
    const stubClient = {
      from(table) {
        capture.table = table;
        return {
          update(payload) {
            capture.payload = payload;
            return {
              eq(col, val) {
                capture.eqCol = col;
                capture.eqVal = val;
                return {
                  select(cols) {
                    capture.selectCols = cols;
                    return {
                      async maybeSingle() {
                        return { data: { student_id: val, sprite_hue: payload.sprite_hue }, error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    };

    const liveDb = createDb(stubClient);
    await liveDb.updateSpriteHue({ studentId: 'sid-99', spriteHue: 42 });

    expect(capture.table).toBe('roster');
    expect(capture.eqCol).toBe('student_id');
    expect(capture.eqVal).toBe('sid-99');
    expect(capture.payload.sprite_hue).toBe(42);
    expect(typeof capture.payload.updated_at).toBe('string');
    // Only sprite_hue + updated_at -- no other columns.
    expect(Object.keys(capture.payload).sort()).toEqual(['sprite_hue', 'updated_at']);
  });
});

// ── POST /roster/verify returns spriteHue ────────────────────────────────────

describe('POST /roster/verify spriteHue field', () => {
  it('returns spriteHue: null when no hue is set', async () => {
    const enrolled = await seedStudent();
    const session = await signIn(enrolled.username);

    expect(Object.prototype.hasOwnProperty.call(session, 'spriteHue')).toBe(true);
    expect(session.spriteHue).toBeNull();
  });

  it('returns spriteHue: <integer> when hue has been written', async () => {
    const enrolled = await seedStudent();
    const row = db.store.get(enrolled.studentId);
    row.sprite_hue = 75;

    const session = await signIn(enrolled.username);
    expect(session.spriteHue).toBe(75);
  });

  it('returns spriteHue: null when getSpriteHueByStudentId degrades (null override)', async () => {
    // Rebuild srv with a db whose getSpriteHueByStudentId always returns null.
    await srv.stop();
    const degradedDb = createFakeDb({ spriteHueOverride: null });
    const app = createApp(degradedDb);
    srv = new TestServer(app);
    await srv.start();

    // Enroll + sign in using the degraded db.
    const { body: enrollBody } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { realName: 'Degrade Student', section: 'PeriodB', password: 'testpass1' }
    });
    expect(enrollBody.ok).toBe(true);

    const { body: verifyBody } = await srv.request('POST', '/roster/verify', {
      body: { username: enrollBody.username, password: 'testpass1' }
    });
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.spriteHue).toBeNull();
  });

  it('does not break the existing verify response fields', async () => {
    const enrolled = await seedStudent('Field Pin Student', 'PeriodE');
    const session = await signIn(enrolled.username);

    expect(session.ok).toBe(true);
    expect(typeof session.studentId).toBe('string');
    expect(typeof session.token).toBe('string');
    expect(session.realName).toBe('Field Pin Student');
    expect(session.section).toBe('PeriodE');
    expect(typeof session.mustChangePassword).toBe('boolean');
    expect(typeof session.role).toBe('string');
    // spriteHue is the additive field.
    expect(Object.prototype.hasOwnProperty.call(session, 'spriteHue')).toBe(true);
  });
});

// ── GET /roster/:studentId/sprite-hue (cross-device read) ───────────────────

describe('GET /roster/:studentId/sprite-hue', () => {
  it('returns the current hue for the student-own token', async () => {
    const enrolled = await seedStudent();
    db.store.get(enrolled.studentId).sprite_hue = 145;
    const session = await signIn(enrolled.username);

    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token)
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBe(145);
  });

  it('returns spriteHue: null when no hue is set', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token)
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBeNull();
  });

  it('honors hue 0 (a valid pick, not "unset")', async () => {
    const enrolled = await seedStudent();
    db.store.get(enrolled.studentId).sprite_hue = 0;
    const session = await signIn(enrolled.username);

    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token)
    });

    expect(status).toBe(200);
    expect(body.spriteHue).toBe(0);
  });

  it('token via ?token= query param also works', async () => {
    const enrolled = await seedStudent();
    db.store.get(enrolled.studentId).sprite_hue = 99;
    const session = await signIn(enrolled.username);

    const path = `/roster/${enrolled.studentId}/sprite-hue?token=${encodeURIComponent(session.token)}`;
    const { status, body } = await srv.request('GET', path);

    expect(status).toBe(200);
    expect(body.spriteHue).toBe(99);
  });

  it('no token -> 401', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('invalid token -> 401', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: { 'Authorization': 'Bearer not.a.valid.token' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('studentA token cannot read studentB hue -> 403 cross-student', async () => {
    const enrolledA = await seedStudent('Student A', 'PeriodB');
    const enrolledB = await seedStudent('Student B', 'PeriodB');
    db.store.get(enrolledB.studentId).sprite_hue = 222;
    const sessionA = await signIn(enrolledA.username);

    const { status, body } = await srv.request('GET', `/roster/${enrolledB.studentId}/sprite-hue`, {
      headers: bearerHeader(sessionA.token)
    });

    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');
  });

  it('degrades to spriteHue: null (200, not 500) when the lookup throws', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    db.getSpriteHueByStudentId = async () => { throw new Error('column "sprite_hue" does not exist'); };

    const { status, body } = await srv.request('GET', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token)
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBeNull();
  });
});

// ── PATCH /roster/:studentId/sprite-hue happy path ──────────────────────────

describe('PATCH /roster/:studentId/sprite-hue happy path', () => {
  it('sets hue 0 and returns 200 { ok:true, spriteHue:0 }', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 0 }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBe(0);

    const row = db.store.get(enrolled.studentId);
    expect(row.sprite_hue).toBe(0);
  });

  it('sets hue 359 (upper boundary)', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 359 }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBe(359);
  });

  it('sets hue 180 (mid-range)', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 180 }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBe(180);
  });

  it('sets hue to null (clears hue)', async () => {
    const enrolled = await seedStudent();
    const row      = db.store.get(enrolled.studentId);
    row.sprite_hue = 100;
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: null }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBeNull();
    expect(db.store.get(enrolled.studentId).sprite_hue).toBeNull();
  });

  it('token via ?token= query param also works', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const path = `/roster/${enrolled.studentId}/sprite-hue?token=${encodeURIComponent(session.token)}`;
    const { status, body } = await srv.request('PATCH', path, {
      body: { spriteHue: 99 }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.spriteHue).toBe(99);
  });
});

// ── PATCH 401: missing / invalid token ──────────────────────────────────────

describe('PATCH /roster/:studentId/sprite-hue 401', () => {
  it('no Authorization header and no ?token= -> 401', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      body: { spriteHue: 100 }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('malformed Bearer token -> 401', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: { 'Authorization': 'Bearer not.a.valid.token.at.all' },
      body: { spriteHue: 100 }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('expired / tampered token -> 401', async () => {
    const enrolled = await seedStudent();

    // Sign a token with a DIFFERENT secret to simulate a tampered token.
    const oldSecret = process.env.ROSTER_TOKEN_SECRET;
    process.env.ROSTER_TOKEN_SECRET = makeSecret('other');
    const badToken = signToken(enrolled.studentId);
    process.env.ROSTER_TOKEN_SECRET = oldSecret;

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(badToken),
      body: { spriteHue: 100 }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

// ── PATCH 403: cross-student attempt ────────────────────────────────────────

describe('PATCH /roster/:studentId/sprite-hue 403 cross-student', () => {
  it('token for studentA cannot update studentB spriteHue -> 403', async () => {
    const enrolledA = await seedStudent('Student A', 'PeriodB');
    const enrolledB = await seedStudent('Student B', 'PeriodB');
    const sessionA  = await signIn(enrolledA.username);

    // StudentA's token used against studentB's path.
    const { status, body } = await srv.request('PATCH', `/roster/${enrolledB.studentId}/sprite-hue`, {
      headers: bearerHeader(sessionA.token),
      body: { spriteHue: 100 }
    });

    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('cross-student');

    // StudentB's row is unchanged.
    expect(db.store.get(enrolledB.studentId).sprite_hue).toBeNull();
  });
});

// ── PATCH 400: bad spriteHue value ──────────────────────────────────────────

describe('PATCH /roster/:studentId/sprite-hue 400 validation', () => {
  async function expectBad(spriteHue) {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue }
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  }

  it('360 (out of range) -> 400', () => expectBad(360));
  it('-1 (below range) -> 400', () => expectBad(-1));
  it('1000 -> 400', () => expectBad(1000));
  it('float 1.5 -> 400', () => expectBad(1.5));
  it('"180" (string) -> 400', () => expectBad('180'));
  it('true (boolean) -> 400', () => expectBad(true));
  it('{} (object) -> 400', () => expectBad({}));

  it('empty body (no spriteHue field) -> 400', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: {}
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('body present but spriteHue key missing -> 400', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { somethingElse: 1 }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});

// ── PATCH 503: pre-migration safe-degrade ───────────────────────────────────

describe('PATCH /roster/:studentId/sprite-hue 503 pre-migration', () => {
  it('responds 503 when updateSpriteHue returns a 42703 column-missing error', async () => {
    // Replace the updateSpriteHue method to simulate pre-migration DB state.
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    db.updateSpriteHue = async () => ({
      data: null,
      error: { code: '42703', message: 'column "sprite_hue" of relation "roster" does not exist' }
    });

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 90 }
    });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('sprite_hue not provisioned');
  });

  it('responds 503 when updateSpriteHue throws synchronously', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    db.updateSpriteHue = async () => {
      throw new Error('column "sprite_hue" does not exist');
    };

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 90 }
    });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('sprite_hue not provisioned');
  });

  it('getSpriteHueByStudentId degrades to null on a column-missing throw (real createDb)', async () => {
    const throwClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    throw new Error('42703: column sprite_hue does not exist');
                  }
                };
              }
            };
          }
        };
      }
    };

    const liveDb = createDb(throwClient);
    // Must not throw -- returns null.
    const hue = await liveDb.getSpriteHueByStudentId('any-id');
    expect(hue).toBeNull();
  });
});

// ── PATCH 500: unrelated DB failures must NOT be mislabelled 503 ─────────────
// The 503 path is reserved for the specific pre-migration "sprite_hue column
// missing" condition. A generic throw or an unrelated DB error must surface
// as a real 500 (Codex r3 review, MINOR -- tightened detection).

describe('PATCH /roster/:studentId/sprite-hue 500 (unrelated failures)', () => {
  it('responds 500 (not 503) when updateSpriteHue throws an unrelated error', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    db.updateSpriteHue = async () => { throw new Error('connection reset by peer'); };

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 90 }
    });

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).not.toBe('sprite_hue not provisioned');
  });

  it('responds 500 (not 503) when updateSpriteHue returns an unrelated error object', async () => {
    const enrolled = await seedStudent();
    const session  = await signIn(enrolled.username);

    db.updateSpriteHue = async () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    });

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/sprite-hue`, {
      headers: bearerHeader(session.token),
      body: { spriteHue: 90 }
    });

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).not.toBe('sprite_hue not provisioned');
  });
});
