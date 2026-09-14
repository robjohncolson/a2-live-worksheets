// lesson-unlock-revoke.test.js -- tests for POST /teacher/lesson-unlock/revoke
// and the DAL's revokeUnlock method (Wave A of P6 BUILD).
// Pure fake-db + http loopback; NO network/Supabase.
// Mirrors lesson-unlock-endpoints.test.js harness exactly.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { createLessonUnlockDb } from '../lesson-unlock-db.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
  },
};

// -- Fake roster db ----------------------------------------------------------

function createFakeRosterDb(roster, { error = null, roleMap = {} } = {}) {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster(section) {
      if (error) return { data: null, error };
      const rows = section ? roster.filter(r => r.section === section) : roster.slice();
      return { data: rows, error: null };
    },
    async findByStudentId(studentId) {
      if (error) return { data: null, error };
      const row = roster.find(r => r.student_id === studentId) || null;
      return { data: row, error: null };
    },
    async getRoleByStudentId(studentId) {
      if (roleMap[studentId] !== undefined) return roleMap[studentId];
      return 'student';
    },
  };
}

// -- Fake ledger db ----------------------------------------------------------

function createFakeLedgerDb(rowsByStudent = {}) {
  return {
    async getLedgerByStudent(studentId) { return { data: rowsByStudent[studentId] || [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

// -- Fake lessonUnlockDb with revokeUnlock support ---------------------------

function createFakeRevokableLessonUnlockDb({ failWith42P01 = false, revokeThrows = false } = {}) {
  var unlocks = new Map();  // key: 'studentUsername|lessonKey' -> row
  return {
    _unlocks: unlocks,
    async upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason }) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var key = studentUsername + '|' + lessonKey;
      var row = {
        id: unlocks.size + 1,
        student_username: studentUsername,
        lesson_key: lessonKey,
        unlocked_by: unlockedBy,
        reason: reason || null,
        status: 'active',
        unlocked_at: new Date().toISOString(),
      };
      unlocks.set(key, row);
      return { data: row, error: null };
    },
    async listActiveForStudent(studentUsername) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var rows = [];
      unlocks.forEach(function(v) {
        if (v.student_username === studentUsername && v.status === 'active') rows.push(v);
      });
      return { data: rows, error: null };
    },
    async revokeUnlock({ studentUsername, lessonKey, revokedBy }) {
      if (revokeThrows) throw new Error('simulated DB throw');
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var key = studentUsername + '|' + lessonKey;
      var row = unlocks.get(key);
      // Only revoke if the row exists and is currently active.
      if (!row || row.status !== 'active') return { data: null, error: null };
      var tag = 'revoked by ' + (revokedBy || 'teacher');
      row.reason = row.reason ? (row.reason + ' | ' + tag) : tag;
      row.status = 'revoked';
      return { data: Object.assign({}, row), error: null };
    },
  };
}

// -- TestServer + startServer ------------------------------------------------

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => ({ 'U1-L1-Q01': { skill: '1.A' } });

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() {
    return new Promise(r => this.server.listen(0, '127.0.0.1', () => {
      this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r();
    }));
  }
  stop() { return new Promise(r => this.server.close(r)); }
  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
  async post(path, bodyObj, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(bodyObj),
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
}

async function startServer({
  roster = [],
  ledger = {},
  loadAnswerKey = okAnswerKey,
  rosterOpts = {},
  lessonUnlockDb = undefined,
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, okSkillMap, realBkt, null, null, null, null, null, null, lessonUnlockDb);
  const server = new TestServer(app);
  await server.start();
  return { server, rosterDb, ledgerDb };
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

// Fixture rows
const FIXTURE_STUDENT = {
  student_id: 'stu_abc123',
  login_username: 'papaya-otter',
  real_name: 'Jane Doe',
  section: 'PeriodB',
};

const FIXTURE_TEACHER_ROW = {
  student_id: 'stu_teacher',
  login_username: 'apple-fox',
  real_name: 'Mr. Colson',
  section: 'PeriodB',
};

// -- POST /teacher/lesson-unlock/revoke -------------------------------------

describe('POST /teacher/lesson-unlock/revoke', () => {

  it('401 without teacher auth (no secret + no token)', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with valid teacher secret -> envelope { ok:true, row: {..., status:"revoked"} }', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    // Pre-seed an active unlock.
    lessonUnlockDb._unlocks.set('papaya-otter|1.7', {
      id: 1,
      student_username: 'papaya-otter',
      lesson_key: '1.7',
      unlocked_by: 'apple-fox',
      reason: null,
      status: 'active',
      unlocked_at: new Date().toISOString(),
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.row).toBeDefined();
    expect(r.body.row.status).toBe('revoked');
    expect(r.body.row.lesson_key).toBe('1.7');
  });

  it('200 with valid Bearer token (role="teacher") -> same envelope shape', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    lessonUnlockDb._unlocks.set('papaya-otter|5.3', {
      id: 2,
      student_username: 'papaya-otter',
      lesson_key: '5.3',
      unlocked_by: 'apple-fox',
      reason: 'absent',
      status: 'active',
      unlocked_at: new Date().toISOString(),
    });
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT, FIXTURE_TEACHER_ROW],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      lessonUnlockDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '5.3',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.row.status).toBe('revoked');
  });

  it('400 when studentUsername is missing', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('required');
  });

  it('400 when lessonKey is missing', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('required');
  });

  it('400 when lessonKey is malformed (e.g. "u1-l7")', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    for (const bad of ['u1-l7', 'banana', '1.', '.7', '1-7']) {
      const r = await srv.post('/teacher/lesson-unlock/revoke', {
        studentUsername: 'papaya-otter', lessonKey: bad,
      }, { 'x-teacher-secret': TEACHER });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/lessonKey/);
    }
  });

  it('404 when no active unlock exists for (student, lesson)', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    // No unlock seeded -- the DAL returns { data: null, error: null }.
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('no active unlock');
  });

  it('404 when the row exists but is already revoked', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    // Seed a row that is already revoked -- the fake only returns data when status='active'.
    lessonUnlockDb._unlocks.set('papaya-otter|1.7', {
      id: 1,
      student_username: 'papaya-otter',
      lesson_key: '1.7',
      unlocked_by: 'apple-fox',
      reason: 'revoked by apple-fox',
      status: 'revoked',
      unlocked_at: new Date().toISOString(),
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
  });

  it('503 when the table is missing (error.code === "42P01")', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('lesson_unlock not provisioned');
  });

  it('500 when the DAL throws', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb({ revokeThrows: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
  });

  it('revokedBy derivation: valid Bearer token resolves to rosterRow.login_username', async () => {
    const lessonUnlockDb = createFakeRevokableLessonUnlockDb();
    lessonUnlockDb._unlocks.set('papaya-otter|1.7', {
      id: 1,
      student_username: 'papaya-otter',
      lesson_key: '1.7',
      unlocked_by: 'apple-fox',
      reason: null,
      status: 'active',
      unlocked_at: new Date().toISOString(),
    });
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT, FIXTURE_TEACHER_ROW],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      lessonUnlockDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    const r = await srv.post('/teacher/lesson-unlock/revoke', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    // The reason on the row should include the resolved username, not 'teacher-secret'.
    expect(r.body.row.reason).toContain('apple-fox');
  });

});

// -- lesson-unlock-db.revokeUnlock (DAL unit tests) -------------------------

describe('lesson-unlock-db.revokeUnlock', () => {

  // Build a minimal fake Supabase client that exercises the two-step logic.
  function makeFakeClient(rows = []) {
    // Store is an array of row objects; each has an id.
    var store = rows.map(r => Object.assign({}, r));

    function chainSelect(filtered) {
      return {
        maybeSingle() {
          return Promise.resolve({
            data: filtered.length > 0 ? filtered[0] : null,
            error: null,
          });
        },
        single() {
          return Promise.resolve({
            data: filtered.length > 0 ? filtered[0] : null,
            error: null,
          });
        },
      };
    }

    function eqChain(arr, field, value, afterUpdate = false) {
      var filtered = arr.filter(r => r[field] === value);
      return {
        eq(f2, v2) { return eqChain(filtered, f2, v2, afterUpdate); },
        select() { return chainSelect(filtered); },
        single() {
          return Promise.resolve({
            data: filtered.length > 0 ? filtered[0] : null,
            error: null,
          });
        },
      };
    }

    return {
      from(table) {
        return {
          select() {
            return {
              eq(f, v) {
                return {
                  eq(f2, v2) {
                    return {
                      eq(f3, v3) {
                        var filtered = store.filter(r =>
                          r[f] === v && r[f2] === v2 && r[f3] === v3
                        );
                        return {
                          maybeSingle() {
                            return Promise.resolve({
                              data: filtered.length > 0 ? filtered[0] : null,
                              error: null,
                            });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(patch) {
            // Supports the N-eq chain that revokeUnlock now uses for
            // optimistic concurrency (Codex P6 MAJOR fold). Each .eq()
            // returns a fresh chain accumulator so id + status + unlocked_at
            // can all be filtered before the .select().maybeSingle()/single().
            function makeUpdateChain(eqFilters) {
              return {
                eq(f, v) {
                  return makeUpdateChain(eqFilters.concat([[f, v]]));
                },
                select() {
                  function rowMatchesAll(r) {
                    return eqFilters.every(function (pair) {
                      return r[pair[0]] === pair[1];
                    });
                  }
                  // Capture the matched set BEFORE applying the patch -- the
                  // patch may change fields that an eq filter checks (e.g.
                  // status='active' -> 'revoked' would make the row stop
                  // matching its own filter after the patch).
                  var matched = store.filter(rowMatchesAll);
                  matched.forEach(function (r) {
                    Object.assign(r, patch);
                  });
                  return {
                    single() {
                      return Promise.resolve({
                        data: matched.length > 0 ? Object.assign({}, matched[0]) : null,
                        error: null,
                      });
                    },
                    maybeSingle() {
                      return Promise.resolve({
                        data: matched.length > 0 ? Object.assign({}, matched[0]) : null,
                        error: null,
                      });
                    },
                  };
                },
              };
            }
            return makeUpdateChain([]);
          },
        };
      },
    };
  }

  it('reason composition: existing reason + revokedBy -> appended correctly', async () => {
    var existing = {
      id: 1,
      student_username: 'papaya-otter',
      lesson_key: '1.7',
      unlocked_by: 'apple-fox',
      reason: 'absent during lesson',
      status: 'active',
    };
    var client = makeFakeClient([existing]);
    var dal = createLessonUnlockDb(client);
    var result = await dal.revokeUnlock({
      studentUsername: 'papaya-otter',
      lessonKey: '1.7',
      revokedBy: 'mr.colson',
    });
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data.reason).toBe('absent during lesson | revoked by mr.colson');
    expect(result.data.status).toBe('revoked');
  });

  it('reason composition with null prior reason -> "revoked by mr.colson"', async () => {
    var existing = {
      id: 2,
      student_username: 'papaya-otter',
      lesson_key: '5.3',
      unlocked_by: 'apple-fox',
      reason: null,
      status: 'active',
    };
    var client = makeFakeClient([existing]);
    var dal = createLessonUnlockDb(client);
    var result = await dal.revokeUnlock({
      studentUsername: 'papaya-otter',
      lessonKey: '5.3',
      revokedBy: 'mr.colson',
    });
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data.reason).toBe('revoked by mr.colson');
  });

  it('already-revoked row is NOT returned (SELECT scopes to status="active")', async () => {
    var alreadyRevoked = {
      id: 3,
      student_username: 'papaya-otter',
      lesson_key: '8.2',
      unlocked_by: 'apple-fox',
      reason: 'revoked by apple-fox',
      status: 'revoked',
    };
    var client = makeFakeClient([alreadyRevoked]);
    var dal = createLessonUnlockDb(client);
    var result = await dal.revokeUnlock({
      studentUsername: 'papaya-otter',
      lessonKey: '8.2',
      revokedBy: 'mr.colson',
    });
    // No active row -> data should be null, no error.
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  // Codex P6 MAJOR fold: TOCTOU guard. The UPDATE chain must include the
  // status + unlocked_at filters so a concurrent upsertUnlock landing
  // between Step 1 (SELECT) and Step 2 (UPDATE) is detected.
  it('TOCTOU guard: UPDATE chain includes id + status + unlocked_at filters', async () => {
    var updateEqs = [];
    var fakeClient = {
      from: function () {
        return {
          select: function () {
            return { eq: function () { return { eq: function () { return { eq: function () { return {
              maybeSingle: function () {
                return Promise.resolve({
                  data: { id: 99, status: 'active', unlocked_at: 'T1', reason: 'orig' },
                  error: null,
                });
              },
            }; }, }; }, }; }, };
          },
          update: function () {
            function chain() {
              return {
                eq: function (f, v) { updateEqs.push([f, v]); return chain(); },
                select: function () {
                  return {
                    maybeSingle: function () {
                      return Promise.resolve({ data: { id: 99 }, error: null });
                    },
                  };
                },
              };
            }
            return chain();
          },
        };
      },
    };
    var dal = createLessonUnlockDb(fakeClient);
    await dal.revokeUnlock({ studentUsername: 'x', lessonKey: '1.7', revokedBy: 'y' });
    expect(updateEqs).toContainEqual(['id', 99]);
    expect(updateEqs).toContainEqual(['status', 'active']);
    expect(updateEqs).toContainEqual(['unlocked_at', 'T1']);
  });

  it('TOCTOU outcome: stale unlocked_at -> 0 updated rows -> data null', async () => {
    // Simulates a concurrent upsertUnlock landing between Step 1 and Step 2:
    // SELECT sees unlocked_at='T1'; by the time UPDATE runs, the store row
    // already carries 'T2'. The eq('unlocked_at', 'T1') filter then matches 0
    // rows and revokeUnlock returns null (route translates to 404, UI refreshes).
    var selectSnapshot = { id: 1, status: 'active', unlocked_at: 'T1', reason: 'first' };
    var storeRow = { id: 1, status: 'active', unlocked_at: 'T2', reason: 'concurrent overwrite' };
    var fakeClient = {
      from: function () {
        return {
          select: function () {
            return { eq: function () { return { eq: function () { return { eq: function () { return {
              maybeSingle: function () {
                return Promise.resolve({ data: selectSnapshot, error: null });
              },
            }; }, }; }, }; }, };
          },
          update: function (patch) {
            function chain(filters) {
              return {
                eq: function (f, v) { return chain(filters.concat([[f, v]])); },
                select: function () {
                  return {
                    maybeSingle: function () {
                      var ok = filters.every(function (pair) {
                        return storeRow[pair[0]] === pair[1];
                      });
                      return Promise.resolve({
                        data: ok ? Object.assign({}, storeRow, patch) : null,
                        error: null,
                      });
                    },
                  };
                },
              };
            }
            return chain([]);
          },
        };
      },
    };
    var dal = createLessonUnlockDb(fakeClient);
    var result = await dal.revokeUnlock({ studentUsername: 'x', lessonKey: '1.7', revokedBy: 'y' });
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

});
