// nudge-history.test.js -- tests for GET /teacher/nudge-history (Phase 7
// of TEACHER_STUDENT_CONSOLE_SPEC.md). Pure fake-db + http loopback;
// NO network/Supabase. Mirrors nudge-endpoints.test.js harness.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

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

// -- Fake roster db ------------------------------------------------------------

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

// -- Fake ledger db -------------------------------------------------------------

function createFakeLedgerDb(rowsByStudent = {}) {
  return {
    async getLedgerByStudent(studentId) { return { data: rowsByStudent[studentId] || [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

// -- Fake nudgesDb (with listConversation) --------------------------------------

function createFakeNudgesDb({
  conversationRows = [],
  fail42P01 = false,
  throwOnList = false,
  error = null,
} = {}) {
  var calledWith = null;
  return {
    _calledWith() { return calledWith; },
    async insertNudges() { return { data: [], error: null }; },
    async insertReply() { return { data: {}, error: null }; },
    async listForTeacher() { return { data: [], error: null }; },
    async listForStudent() { return { data: [], error: null }; },
    async markDelivered() { return { data: {}, error: null }; },
    async findParent() { return { data: null, error: null }; },
    async listConversation(args) {
      calledWith = args;
      if (throwOnList) throw new Error('DAL threw unexpectedly');
      if (fail42P01) return { data: null, error: { code: '42P01', message: 'table missing' } };
      if (error) return { data: null, error };
      return { data: conversationRows, error: null };
    },
  };
}

// -- TestServer + startServer ---------------------------------------------------

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
}

async function startServer({
  roster = [],
  ledger = {},
  nudgesDb = undefined,
  rosterOpts = {},
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt, null, null, null, null, null, nudgesDb);
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

const FIXTURE_TEACHER_ROW = {
  student_id: 'stu_teacher',
  login_username: 'apple-fox',
  real_name: 'Mr. Colson',
  section: 'PeriodB',
};

const FIXTURE_STUDENT = {
  student_id: 'stu_abc123',
  login_username: 'papaya-otter',
  real_name: 'Jane Doe',
  section: 'PeriodB',
};

const SAMPLE_ROWS = [
  {
    id: 2,
    nudge_id: 'nudge_1:reply:111',
    parent_nudge_id: 'nudge_1',
    sender_username: 'papaya-otter',
    recipient_username: 'apple-fox',
    text: 'On it!',
    direction: 'student',
    section: 'PeriodB',
    created_at: '2026-05-24T10:01:00.000Z',
    delivered_at: '2026-05-24T10:01:00.000Z',
  },
  {
    id: 1,
    nudge_id: 'nudge_1',
    parent_nudge_id: null,
    sender_username: 'apple-fox',
    recipient_username: 'papaya-otter',
    text: 'Please try problem 3',
    direction: 'teacher',
    section: 'PeriodB',
    created_at: '2026-05-24T10:00:00.000Z',
    delivered_at: '2026-05-24T10:00:00.000Z',
  },
];

// -- GET /teacher/nudge-history ------------------------------------------------

describe('GET /teacher/nudge-history endpoint', () => {
  it('401 without teacher auth (no secret + no token)', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: SAMPLE_ROWS });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/nudge-history?studentUsername=papaya-otter');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with valid teacher secret -> envelope shape', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: SAMPLE_ROWS });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentUsername).toBe('papaya-otter');
    expect(r.body.limit).toBe(20);
    expect(r.body.offset).toBe(0);
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.rows).toHaveLength(2);
  });

  it('200 with valid teacher Bearer token -> teacherUsername derived from login_username', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: SAMPLE_ROWS });
    const ctx = await startServer({
      roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      nudgesDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter',
      { 'Authorization': `Bearer ${token}` }
    );
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.teacherUsername).toBe('apple-fox');
    expect(r.body.studentUsername).toBe('papaya-otter');
  });

  it('400 when studentUsername is missing', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/nudge-history', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/studentUsername/);
  });

  it('400 when studentUsername is empty string', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/nudge-history?studentUsername=', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('400 when studentUsername contains a comma (injection guard)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya,evil',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('400 when studentUsername contains a paren (injection guard)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya(evil',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('400 when studentUsername contains a dot (injection guard)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya.evil',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('400 when studentUsername contains a quote (injection guard)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      "/teacher/nudge-history?studentUsername=papaya'evil",
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('200 with valid studentUsername containing letters + numbers + _ + -', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=student_name-99&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.rows).toHaveLength(0);
  });

  it('limit clamping: ?limit=999 -> request lands with limit=100', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&limit=999&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(100);
  });

  it('limit fallback: ?limit=banana -> request lands with limit=20', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&limit=banana&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(20);
  });

  it('limit fallback: ?limit=0 -> request lands with limit=20', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&limit=0&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(20);
  });

  it('limit fallback: negative limit -> request lands with limit=20', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&limit=-5&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(20);
  });

  it('offset clamping: ?offset=-5 -> 0', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&offset=-5&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.offset).toBe(0);
  });

  it('offset fallback: ?offset=banana -> 0', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&offset=banana&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(200);
    expect(r.body.offset).toBe(0);
  });

  it('503 when the table is missing (error.code === 42P01)', async () => {
    const nudgesDb = createFakeNudgesDb({ fail42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('nudges_log not provisioned');
  });

  it('500 when the DAL throws', async () => {
    const nudgesDb = createFakeNudgesDb({ throwOnList: true });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=apple-fox',
      { 'x-teacher-secret': TEACHER }
    );
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('Database error');
  });

  it('DAL is called with the resolved teacherUsername (NOT a body value)', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({
      roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      nudgesDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    // Pass a different teacherUsername in the query; the DAL must receive the
    // one resolved from the token (apple-fox), not any query value.
    const r = await srv.get(
      '/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=INJECTED',
      { 'Authorization': `Bearer ${token}` }
    );
    expect(r.status).toBe(200);
    expect(nudgesDb._calledWith().teacherUsername).toBe('apple-fox');
    expect(nudgesDb._calledWith().studentUsername).toBe('papaya-otter');
  });
});

// -- nudge-db.listConversation (DAL unit) --------------------------------------

describe('nudge-db.listConversation (DAL unit)', () => {
  it('.or() filter string includes both direction branches with correct usernames', async () => {
    var capturedOrArg = null;
    var fakeClient = {
      from() {
        return {
          select() { return this; },
          or(arg) { capturedOrArg = arg; return this; },
          order() { return this; },
          range() { return { data: [], error: null }; },
        };
      },
    };
    var { createNudgesDb } = await import('../nudge-db.js');
    var dal = createNudgesDb(fakeClient);
    await dal.listConversation({ teacherUsername: 'apple-fox', studentUsername: 'papaya-otter' });
    expect(capturedOrArg).toContain('direction.eq.teacher');
    expect(capturedOrArg).toContain('direction.eq.student');
    expect(capturedOrArg).toContain('sender_username.eq.apple-fox');
    expect(capturedOrArg).toContain('recipient_username.eq.papaya-otter');
    expect(capturedOrArg).toContain('sender_username.eq.papaya-otter');
    expect(capturedOrArg).toContain('recipient_username.eq.apple-fox');
  });

  it('limit + offset map to .range(offset, offset + limit - 1)', async () => {
    var capturedRange = null;
    var fakeClient = {
      from() {
        return {
          select() { return this; },
          or() { return this; },
          order() { return this; },
          range(from, to) { capturedRange = { from, to }; return { data: [], error: null }; },
        };
      },
    };
    var { createNudgesDb } = await import('../nudge-db.js');
    var dal = createNudgesDb(fakeClient);
    await dal.listConversation({ teacherUsername: 'apple-fox', studentUsername: 'papaya-otter', limit: 10, offset: 20 });
    expect(capturedRange).toEqual({ from: 20, to: 29 });
  });

  it('empty list returns data:[] error:null', async () => {
    var fakeClient = {
      from() {
        return {
          select() { return this; },
          or() { return this; },
          order() { return this; },
          range() { return { data: [], error: null }; },
        };
      },
    };
    var { createNudgesDb } = await import('../nudge-db.js');
    var dal = createNudgesDb(fakeClient);
    var result = await dal.listConversation({ teacherUsername: 'apple-fox', studentUsername: 'papaya-otter' });
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });
});

// Codex P7 MAJOR fold: pin the LIVE db.findByStudentId projection.
// The original P3/P5/P6/P7 routes all derive the caller's login_username
// from `(await db.findByStudentId(sid)).data.login_username`. The fake
// roster DBs in every test file return a full row, but the live adapter
// at roster-server/db.js only projected `student_id, section` until this
// commit. The bug shipped invisibly for three phases. This test pins the
// shape so a future "select narrowing" cannot silently regress identity
// derivation again.
describe('db.findByStudentId live projection (real createDb)', () => {
  it('SELECT projection includes student_id + section + login_username + real_name', async () => {
    var captured = { selectCols: null, eqCol: null, eqVal: null, table: null };
    var stubClient = {
      from(table) {
        captured.table = table;
        return {
          select(cols) {
            captured.selectCols = cols;
            return {
              eq(col, val) {
                captured.eqCol = col;
                captured.eqVal = val;
                return {
                  async maybeSingle() {
                    return { data: { student_id: val, section: 'PeriodB', login_username: 'mr.colson', real_name: 'Mr Colson' }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
    var { createDb } = await import('../db.js');
    var liveDb = createDb(stubClient);
    var result = await liveDb.findByStudentId('sid-123');
    expect(captured.table).toBe('roster');
    expect(captured.eqCol).toBe('student_id');
    expect(captured.eqVal).toBe('sid-123');
    // The projection MUST include login_username + real_name. Without these,
    // every Console route that derives the caller's identity from the
    // Bearer token silently fails with 400 in production.
    expect(captured.selectCols).toContain('student_id');
    expect(captured.selectCols).toContain('section');
    expect(captured.selectCols).toContain('login_username');
    expect(captured.selectCols).toContain('real_name');
    // And the row populates correctly.
    expect(result.data.login_username).toBe('mr.colson');
    expect(result.data.real_name).toBe('Mr Colson');
  });
});
