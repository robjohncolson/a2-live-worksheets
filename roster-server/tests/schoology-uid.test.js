// schoology-uid.test.js -- grade-pipeline P4b: roster.schoology_uid bridge.
// Covers:
//   - db.getSchoologyUidMap (map for mapped rows, {} on empty / error / throw)
//   - db.updateSchoologyUid (payload shape, {data:null} on no-match)
//   - PATCH /roster/:studentId/schoology-uid (teacher-gated):
//       200 set string + numeric coerce, 200 clear null, 400 missing key,
//       400 bad type, 401 no/wrong secret, 404 unknown student,
//       503 pre-migration (42703), 500 other DB error
// Uses the createFakeDb() + TestServer pattern from roster-edit.test.js,
// extended with updateSchoologyUid + getSchoologyUidMap.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { createDb } from '../db.js';

// -- Fake in-memory db --------------------------------------------------------
// Mirrors roster-edit.test.js createFakeDb() with schoology_uid support.

function createFakeDb() {
  const store = new Map();
  let idCounter = 0;

  function makeId() {
    idCounter += 1;
    return `fake-uuid-${idCounter}`;
  }

  // updateSchoologyUid calls recorded for payload inspection.
  const updateSchoologyUidCalls = [];

  return {
    store,
    updateSchoologyUidCalls,

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
        schoology_uid:        null,
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

    async updateSchoologyUid({ studentId, schoologyUid }) {
      updateSchoologyUidCalls.push({ studentId, schoologyUid });
      const row = store.get(studentId);
      if (!row) return { data: null, error: null };
      row.schoology_uid = schoologyUid;
      row.updated_at = new Date().toISOString();
      return {
        data: { student_id: row.student_id, schoology_uid: row.schoology_uid },
        error: null
      };
    },

    async getSchoologyUidMap(studentIds) {
      if (!Array.isArray(studentIds) || studentIds.length === 0) return {};
      const out = {};
      for (const sid of studentIds) {
        const row = store.get(sid);
        if (row && row.schoology_uid != null) out[sid] = row.schoology_uid;
      }
      return out;
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

// -- Lightweight test server --------------------------------------------------

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

// -- Helpers ------------------------------------------------------------------

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

// -- Lifecycle ----------------------------------------------------------------

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

// -- Seed helper --------------------------------------------------------------

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

// -- db.getSchoologyUidMap -----------------------------------------------------

describe('db.getSchoologyUidMap (real createDb)', () => {
  // Stub client whose .in() resolves with the given { data, error }.
  function stubClient(result, capture = {}) {
    return {
      from(table) {
        capture.table = table;
        return {
          select(cols) {
            capture.selectCols = cols;
            return {
              async in(col, vals) {
                capture.inCol = col;
                capture.inVals = vals;
                return result;
              }
            };
          }
        };
      }
    };
  }

  it('returns {} for empty / non-array input (no DB call)', async () => {
    const liveDb = createDb(stubClient({ data: [], error: null }));
    expect(await liveDb.getSchoologyUidMap([])).toEqual({});
    expect(await liveDb.getSchoologyUidMap(null)).toEqual({});
    expect(await liveDb.getSchoologyUidMap(undefined)).toEqual({});
  });

  it('builds { student_id: uid } only for rows with a non-null schoology_uid', async () => {
    const capture = {};
    const liveDb = createDb(stubClient({
      data: [
        { student_id: 's1', schoology_uid: '8405518810' },
        { student_id: 's2', schoology_uid: null },
        { student_id: 's3', schoology_uid: '7000000001' },
      ],
      error: null
    }, capture));

    const map = await liveDb.getSchoologyUidMap(['s1', 's2', 's3']);
    expect(map).toEqual({ s1: '8405518810', s3: '7000000001' });
    expect(capture.table).toBe('roster');
    expect(capture.selectCols).toBe('student_id, schoology_uid');
    expect(capture.inCol).toBe('student_id');
    expect(capture.inVals).toEqual(['s1', 's2', 's3']);
  });

  it('degrades to {} when the db returns an error (42703 pre-migration)', async () => {
    const liveDb = createDb(stubClient({
      data: null,
      error: { code: '42703', message: 'column "schoology_uid" does not exist' }
    }));
    expect(await liveDb.getSchoologyUidMap(['s1'])).toEqual({});
  });

  it('degrades to {} when the client throws', async () => {
    const throwClient = {
      from() {
        return {
          select() {
            return {
              async in() { throw new Error('connection reset'); }
            };
          }
        };
      }
    };
    const liveDb = createDb(throwClient);
    expect(await liveDb.getSchoologyUidMap(['s1'])).toEqual({});
  });
});

// -- db.updateSchoologyUid -----------------------------------------------------

describe('db.updateSchoologyUid (real createDb)', () => {
  // Stub client recording the .update() payload; .maybeSingle() resolves data.
  function stubClient(rowOrNull, capture = {}) {
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
                        return { data: rowOrNull, error: null };
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

  it('builds a payload of exactly schoology_uid + updated_at', async () => {
    const capture = {};
    const liveDb = createDb(stubClient({ student_id: 'sid-1', schoology_uid: '8405518810' }, capture));
    await liveDb.updateSchoologyUid({ studentId: 'sid-1', schoologyUid: '8405518810' });

    expect(capture.table).toBe('roster');
    expect(capture.eqCol).toBe('student_id');
    expect(capture.eqVal).toBe('sid-1');
    expect(capture.selectCols).toBe('student_id, schoology_uid');
    expect(capture.payload.schoology_uid).toBe('8405518810');
    expect(typeof capture.payload.updated_at).toBe('string');
    expect(Object.keys(capture.payload).sort()).toEqual(['schoology_uid', 'updated_at']);
  });

  it('passes a null schoologyUid through to clear the mapping', async () => {
    const capture = {};
    const liveDb = createDb(stubClient({ student_id: 'sid-2', schoology_uid: null }, capture));
    const { data } = await liveDb.updateSchoologyUid({ studentId: 'sid-2', schoologyUid: null });
    expect(capture.payload.schoology_uid).toBeNull();
    expect(data.schoology_uid).toBeNull();
  });

  it('returns { data: null } when no row matched (404 signal)', async () => {
    const liveDb = createDb(stubClient(null));
    const { data, error } = await liveDb.updateSchoologyUid({ studentId: 'ghost', schoologyUid: '1' });
    expect(data).toBeNull();
    expect(error).toBeNull();
  });
});

// -- PATCH /roster/:studentId/schoology-uid happy paths -----------------------

describe('PATCH /roster/:studentId/schoology-uid happy path', () => {
  it('sets a string uid and returns 200 { ok:true, schoologyUid }', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schoologyUid).toBe('8405518810');
    expect(db.store.get(enrolled.studentId).schoology_uid).toBe('8405518810');
  });

  it('coerces a numeric uid to its string form', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: 8405518810 }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schoologyUid).toBe('8405518810');
    expect(db.store.get(enrolled.studentId).schoology_uid).toBe('8405518810');
  });

  it('trims a string uid before storing', async () => {
    const enrolled = await seedStudent();

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '  7000000001  ' }
    });

    expect(status).toBe(200);
    expect(body.schoologyUid).toBe('7000000001');
  });

  it('clears the mapping with null', async () => {
    const enrolled = await seedStudent();
    db.store.get(enrolled.studentId).schoology_uid = '8405518810';

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: null }
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schoologyUid).toBeNull();
    expect(db.store.get(enrolled.studentId).schoology_uid).toBeNull();
  });
});

// -- PATCH 400: validation -----------------------------------------------------

describe('PATCH /roster/:studentId/schoology-uid 400 validation', () => {
  it('missing schoologyUid key -> 400', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { somethingElse: 1 }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('empty body {} -> 400', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: {}
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  async function expectBad(schoologyUid) {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  }

  it('empty string -> 400', () => expectBad(''));
  it('whitespace-only string -> 400', () => expectBad('   '));
  it('boolean true -> 400', () => expectBad(true));
  it('object -> 400', () => expectBad({}));
});

// -- PATCH 401: auth -----------------------------------------------------------

describe('PATCH /roster/:studentId/schoology-uid 401', () => {
  it('no teacher secret -> 401', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      body: { schoologyUid: '8405518810' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('wrong teacher secret -> 401', async () => {
    const enrolled = await seedStudent();
    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: { 'x-teacher-secret': makeSecret('wrong') },
      body: { schoologyUid: '8405518810' }
    });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

// -- PATCH 404: unknown student ------------------------------------------------

describe('PATCH /roster/:studentId/schoology-uid 404', () => {
  it('unknown studentId -> 404', async () => {
    const { status, body } = await srv.request('PATCH', '/roster/nonexistent-uuid-99/schoology-uid', {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});

// -- PATCH 503: pre-migration safe-degrade -------------------------------------

describe('PATCH /roster/:studentId/schoology-uid 503 pre-migration', () => {
  it('responds 503 when updateSchoologyUid returns a 42703 column-missing error', async () => {
    const enrolled = await seedStudent();
    db.updateSchoologyUid = async () => ({
      data: null,
      error: { code: '42703', message: 'column "schoology_uid" of relation "roster" does not exist' }
    });

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('schoology_uid not provisioned');
  });

  it('responds 503 when updateSchoologyUid throws a column-missing error', async () => {
    const enrolled = await seedStudent();
    db.updateSchoologyUid = async () => {
      throw new Error('column "schoology_uid" does not exist');
    };

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('schoology_uid not provisioned');
  });
});

// -- PATCH 500: unrelated DB failures must NOT be mislabelled 503 --------------

describe('PATCH /roster/:studentId/schoology-uid 500 (unrelated failures)', () => {
  it('responds 500 when updateSchoologyUid returns an unrelated error object', async () => {
    const enrolled = await seedStudent();
    db.updateSchoologyUid = async () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    });

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).not.toBe('schoology_uid not provisioned');
  });

  it('responds 500 when updateSchoologyUid throws an unrelated error', async () => {
    const enrolled = await seedStudent();
    db.updateSchoologyUid = async () => { throw new Error('connection reset by peer'); };

    const { status, body } = await srv.request('PATCH', `/roster/${enrolled.studentId}/schoology-uid`, {
      headers: teacherHeader(),
      body: { schoologyUid: '8405518810' }
    });

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).not.toBe('schoology_uid not provisioned');
  });
});
