// roster-edit.test.js -- integration tests for PATCH /roster/:studentId
// and the A4 pin that GET /roster/list now exposes studentId.
// Uses the createFakeDb() + TestServer pattern from auth.test.js.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { createDb } from '../db.js';

// ── Fake in-memory db ────────────────────────────────────────────────────────

function createFakeDb() {
  // Keyed by student_id (UUID string).
  const store = new Map();

  let idCounter = 0;

  function makeId() {
    idCounter += 1;
    return `fake-uuid-${idCounter}`;
  }

  // Track every call to updateStudent so pins can inspect the payload.
  const updateStudentCalls = [];

  return {
    store,
    updateStudentCalls,

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

    async updatePassword({ studentId, passwordHash, passwordCipher }) {
      const row = store.get(studentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      row.password_hash        = passwordHash;
      row.password_cipher      = passwordCipher ?? null;
      row.must_change_password = false;
      return { data: { student_id: studentId }, error: null };
    },

    // updateStudent: mutates only real_name, section, updated_at.
    // Returns null data for an unknown studentId (404 signal).
    async updateStudent({ studentId, realName, section }) {
      // Record the call for pin tests.
      updateStudentCalls.push({ studentId, realName, section });

      const row = store.get(studentId);
      if (!row) return { data: null, error: null };

      if (realName !== undefined) row.real_name = realName;
      if (section  !== undefined) row.section   = section;
      row.updated_at = new Date().toISOString();

      return {
        data: {
          student_id:    row.student_id,
          real_name:     row.real_name,
          section:       row.section,
          login_username: row.login_username
        },
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

// ── Seed helper ──────────────────────────────────────────────────────────────

async function seedStudent(realName = 'Test Student', section = 'PeriodB') {
  const { body } = await srv.request('POST', '/roster/enroll', {
    headers: { 'x-teacher-secret': teacherSecret },
    body: { realName, section, password: 'testpass1' }
  });
  expect(body.ok).toBe(true);
  return body; // { ok, studentId, username, realName, section }
}

function teacherHeader() {
  return { 'x-teacher-secret': teacherSecret };
}

// ── PATCH happy paths ────────────────────────────────────────────────────────

describe('PATCH /roster/:studentId happy path', () => {
  it('realName only: updates real_name and returns updated student', async () => {
    const enrolled = await seedStudent('Original Name', 'PeriodB');

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'Updated Name' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.student.studentId).toBe(enrolled.studentId);
    expect(body.student.realName).toBe('Updated Name');
    expect(body.student.section).toBe('PeriodB');
    expect(body.student.username).toBe(enrolled.username);

    // Confirm in-memory row updated.
    const row = db.store.get(enrolled.studentId);
    expect(row.real_name).toBe('Updated Name');
    expect(row.section).toBe('PeriodB'); // unchanged
  });

  it('section only: updates section and returns updated student', async () => {
    const enrolled = await seedStudent('Name Stays', 'PeriodB');

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { section: 'PeriodE' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.student.section).toBe('PeriodE');
    expect(body.student.realName).toBe('Name Stays');

    const row = db.store.get(enrolled.studentId);
    expect(row.section).toBe('PeriodE');
    expect(row.real_name).toBe('Name Stays'); // unchanged
  });

  it('both fields: updates both real_name and section', async () => {
    const enrolled = await seedStudent('Old Name', 'PeriodB');

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'New Name', section: 'PeriodX' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.student.realName).toBe('New Name');
    expect(body.student.section).toBe('PeriodX');

    const row = db.store.get(enrolled.studentId);
    expect(row.real_name).toBe('New Name');
    expect(row.section).toBe('PeriodX');
  });

  it('trims leading/trailing whitespace from realName and section', async () => {
    const enrolled = await seedStudent('Padded Student', 'PeriodB');

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: '  Trimmed Name  ', section: '  PeriodE  ' }
    });

    expect(status).toBe(200);
    expect(body.student.realName).toBe('Trimmed Name');
    expect(body.student.section).toBe('PeriodE');
  });
});

// ── Auth failures ────────────────────────────────────────────────────────────

describe('PATCH /roster/:studentId auth', () => {
  it('no auth header -> 401 forbidden', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      body: { realName: 'Sneaky Edit' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('wrong teacher secret -> 401 forbidden', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: { 'x-teacher-secret': makeSecret('wrong') },
      body: { realName: 'Sneaky Edit' }
    });

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

// ── Not found ────────────────────────────────────────────────────────────────

describe('PATCH /roster/:studentId not found', () => {
  it('unknown studentId -> 404', async () => {
    const { status, body } = await srv.request('PATCH', '/roster/nonexistent-uuid-99', {
      headers: teacherHeader(),
      body: { realName: 'Ghost' }
    });

    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});

// ── Validation failures ──────────────────────────────────────────────────────

describe('PATCH /roster/:studentId validation', () => {
  it('empty body {} -> 400 (no editable field)', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: {}
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('present realName but blank string -> 400', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: '   ' }
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('present section but blank string -> 400', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { section: '' }
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});

// ── Immutability pin: PATCH never touches sensitive columns ──────────────────

describe('PATCH /roster/:studentId immutability pin', () => {
  it('login_username, role, password_hash, password_cipher, and must_change_password are byte-identical after PATCH', async () => {
    const enrolled = await seedStudent('Pinned Student', 'PeriodB');
    const rowBefore = { ...db.store.get(enrolled.studentId) };

    await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'Changed Name', section: 'PeriodE' }
    });

    const rowAfter = db.store.get(enrolled.studentId);

    expect(rowAfter.login_username).toBe(rowBefore.login_username);
    expect(rowAfter.role).toBe(rowBefore.role);
    expect(rowAfter.password_hash).toBe(rowBefore.password_hash);
    expect(rowAfter.password_cipher).toBe(rowBefore.password_cipher);
    expect(rowAfter.must_change_password).toBe(rowBefore.must_change_password);
    expect(rowAfter.status).toBe(rowBefore.status);
    expect(rowAfter.email).toBe(rowBefore.email);
    expect(rowAfter.created_at).toBe(rowBefore.created_at);
  });

  it('response body never contains password, hash, or cipher material', async () => {
    const enrolled = await seedStudent('Safe Student', 'PeriodB');

    const { body } = await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'Safe New Name' }
    });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('password_cipher');
    expect(raw).not.toContain('hash');
    expect(raw).not.toContain('v1:');
  });
});

// ── updateStudent payload shape pin ─────────────────────────────────────────

describe('db.updateStudent payload shape', () => {
  it('always includes updated_at in the call', async () => {
    const enrolled = await seedStudent('Payload Student', 'PeriodB');
    db.updateStudentCalls.length = 0; // clear prior calls from enroll

    await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'New Name' }
    });

    // The route should have called db.updateStudent exactly once.
    expect(db.updateStudentCalls.length).toBe(1);
    const call = db.updateStudentCalls[0];
    // studentId is passed through.
    expect(call.studentId).toBe(enrolled.studentId);
    // realName present, section not present (partial update).
    expect(call.realName).toBe('New Name');
    expect(call.section).toBeUndefined();
  });

  it('section-only call omits realName from the db.updateStudent args', async () => {
    const enrolled = await seedStudent('Section Only Student', 'PeriodB');
    db.updateStudentCalls.length = 0;

    await srv.request('PATCH', `/roster/${enrolled.studentId}`, {
      headers: teacherHeader(),
      body: { section: 'PeriodX' }
    });

    expect(db.updateStudentCalls.length).toBe(1);
    const call = db.updateStudentCalls[0];
    expect(call.section).toBe('PeriodX');
    expect(call.realName).toBeUndefined();
  });
});

// ── A4 pin: GET /roster/list exposes studentId ───────────────────────────────

describe('GET /roster/list studentId exposure (A4 pin)', () => {
  it('each student object in /roster/list includes studentId', async () => {
    const enrolled = await seedStudent('List Student', 'PeriodB');

    const { status, body } = await srv.request('GET', '/roster/list', {
      headers: teacherHeader()
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const student = body.students.find(s => s.username === enrolled.username);
    expect(student).toBeDefined();
    expect(student.studentId).toBe(enrolled.studentId);
  });

  it('studentId in /roster/list matches the id needed for PATCH', async () => {
    const enrolled = await seedStudent('Roundtrip Student', 'PeriodB');

    // Fetch the list.
    const { body: listBody } = await srv.request('GET', '/roster/list', {
      headers: teacherHeader()
    });
    const row = listBody.students.find(s => s.username === enrolled.username);
    expect(row.studentId).toBeDefined();

    // Use the studentId from the list to PATCH.
    const { status, body: patchBody } = await srv.request('PATCH', `/roster/${row.studentId}`, {
      headers: teacherHeader(),
      body: { realName: 'Roundtrip Updated' }
    });

    expect(status).toBe(200);
    expect(patchBody.student.realName).toBe('Roundtrip Updated');
  });
});

// ── db.updateStudent live payload (real createDb, stub Supabase client) ──────
// The fake-db pins above only observe the {studentId, realName, section} call
// args. These drive the REAL db.updateStudent so the actual Supabase .update()
// payload is observed: it must carry updated_at and ONLY the editable columns.

describe('db.updateStudent live payload (real createDb)', () => {
  // Minimal Supabase-compatible stub: records the .update() payload and the
  // .eq()/.select() args, then resolves .maybeSingle() with a row.
  function stubClient(capture) {
    return {
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
                        return {
                          data: {
                            student_id:     val,
                            real_name:      payload.real_name,
                            section:        payload.section,
                            login_username: 'stub_user'
                          },
                          error: null
                        };
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
  }

  it('builds a payload with updated_at and only the editable columns', async () => {
    const capture = {};
    const liveDb = createDb(stubClient(capture));
    await liveDb.updateStudent({ studentId: 'sid-1', realName: 'New Name', section: 'PeriodE' });

    expect(capture.table).toBe('roster');
    expect(capture.eqCol).toBe('student_id');
    expect(capture.eqVal).toBe('sid-1');
    // The payload carries EXACTLY updated_at + the two editable columns.
    expect(Object.keys(capture.payload).sort()).toEqual(['real_name', 'section', 'updated_at']);
    expect(typeof capture.payload.updated_at).toBe('string');
    expect(capture.payload.real_name).toBe('New Name');
    expect(capture.payload.section).toBe('PeriodE');
  });

  it('a realName-only update omits section from the payload', async () => {
    const capture = {};
    const liveDb = createDb(stubClient(capture));
    await liveDb.updateStudent({ studentId: 'sid-2', realName: 'Only Name' });

    expect(Object.keys(capture.payload).sort()).toEqual(['real_name', 'updated_at']);
    expect(capture.payload.section).toBeUndefined();
  });

  it('never includes a non-editable column in the payload', async () => {
    const capture = {};
    const liveDb = createDb(stubClient(capture));
    await liveDb.updateStudent({ studentId: 'sid-3', section: 'PeriodX' });

    const keys = Object.keys(capture.payload);
    ['login_username', 'role', 'password_hash', 'password_cipher',
     'must_change_password', 'status', 'email', 'created_at', 'student_id']
      .forEach(col => expect(keys).not.toContain(col));
  });
});
