// student-dm.test.js -- tests for POST /student/nudge and
// GET /student/nudge-history (Phase 13 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure fake-db + http loopback;
// NO network/Supabase. Mirrors nudge-history.test.js harness.

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

function createFakeRosterDb(roster, { error = null, roleMap = {}, teacherRow = null } = {}) {
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
    async findTeacherUsername() {
      if (error) return { data: null, error };
      if (teacherRow === false) return { data: null, error: null };  // explicit null case
      if (teacherRow) return { data: teacherRow, error: null };
      // Default: return the first row in roster with role='teacher', or null.
      const found = roster.find(r => r.role === 'teacher') || null;
      return { data: found, error: null };
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

// -- Fake nudgesDb (with insertStudentDm + listConversation) -------------------

function createFakeNudgesDb({
  conversationRows = [],
  fail42P01 = false,
  throwOnInsert = false,
  throwOnList = false,
  error = null,
} = {}) {
  var insertedDm = null;
  var listCalledWith = null;
  return {
    _insertedDm() { return insertedDm; },
    _listCalledWith() { return listCalledWith; },
    async insertNudges() { return { data: [], error: null }; },
    async insertReply() { return { data: {}, error: null }; },
    async insertStudentDm(args) {
      if (throwOnInsert) throw new Error('DAL threw unexpectedly');
      if (fail42P01) return { data: null, error: { code: '42P01', message: 'table missing' } };
      if (error) return { data: null, error };
      insertedDm = args;
      return { data: { ...args, id: 1 }, error: null };
    },
    async listForTeacher() { return { data: [], error: null }; },
    async listForStudent() { return { data: [], error: null }; },
    async markDelivered() { return { data: {}, error: null }; },
    async findParent() { return { data: null, error: null }; },
    async listConversation(args) {
      listCalledWith = args;
      if (throwOnList) throw new Error('DAL threw unexpectedly');
      if (fail42P01) return { data: null, error: { code: '42P01', message: 'table missing' } };
      if (error) return { data: null, error };
      return { data: conversationRows, error: null };
    },
    async listConversationGuest(args) {
      listCalledWith = args;
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

// -- Fixtures ------------------------------------------------------------------

const FIXTURE_TEACHER_ROW = {
  student_id: 'stu_teacher',
  login_username: 'apple-fox',
  real_name: 'Mr. Colson',
  section: 'PeriodB',
  role: 'teacher',
};

const FIXTURE_STUDENT = {
  student_id: 'stu_abc123',
  login_username: 'papaya-otter',
  real_name: 'Jane Doe',
  section: 'PeriodB',
  role: 'student',
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

// -- POST /student/nudge -------------------------------------------------------

describe('POST /student/nudge endpoint', () => {
  it('401 without Bearer token', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/student/nudge', { text: 'hello' });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('401 with bogus token', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/student/nudge', { text: 'hello' }, { Authorization: 'Bearer bogus-token-xyz' });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
  });

  it('200 with valid student token -> nudge row inserted with correct fields', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: 'Hi teacher!' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.nudgeId).toMatch(/^student-dm-stu_abc123-/);
    const inserted = nudgesDb._insertedDm();
    expect(inserted).not.toBeNull();
    expect(inserted.senderUsername).toBe('papaya-otter');
    expect(inserted.recipientUsername).toBe('apple-fox');
    expect(inserted.text).toBe('Hi teacher!');
  });

  it('inserted row has direction=student + parent_nudge_id=null', async () => {
    // The route calls nudgesDb.insertStudentDm which hardcodes
    // direction='student' and parent_nudge_id=null in nudge-db.js.
    // We verify the args object passed to insertStudentDm has no
    // parentNudgeId field (the DAL owns those columns).
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: 'test msg' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    // The route does NOT pass parentNudgeId; the DAL sets it to null.
    const inserted = nudgesDb._insertedDm();
    expect(inserted.senderUsername).toBe('papaya-otter');
    expect(inserted.nudgeId).toBeDefined();
  });

  it('400 when text is missing', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', {}, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/text required/);
  });

  it('400 when text is whitespace-only', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: '   ' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('text > 280 chars is truncated to 280', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const longText = 'x'.repeat(350);
    const r = await srv.post('/student/nudge', { text: longText }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    const inserted = nudgesDb._insertedDm();
    expect(inserted.text.length).toBe(280);
  });

  it('503 when nudges_log table missing (42P01)', async () => {
    const nudgesDb = createFakeNudgesDb({ fail42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: 'hello' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('nudges_log not provisioned');
  });

  it('503 when no teacher in roster (findTeacherUsername returns null)', async () => {
    const nudgesDb = createFakeNudgesDb();
    // teacherRow=false forces findTeacherUsername to return { data: null, error: null }.
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      nudgesDb,
      rosterOpts: { teacherRow: false },
    });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: 'hello' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('no teacher available');
  });

  it('500 when DAL throws', async () => {
    const nudgesDb = createFakeNudgesDb({ throwOnInsert: true });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge', { text: 'hello' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('Database error');
  });

  it('section comes from the STUDENT roster row (not body)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    // Body contains no section field.
    const r = await srv.post('/student/nudge', { text: 'check section' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    const inserted = nudgesDb._insertedDm();
    expect(inserted.section).toBe('PeriodB');  // from FIXTURE_STUDENT.section
  });

  it('recipient_username comes from findTeacherUsername (not body)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    // Body intentionally omits recipientUsername; route must derive it server-side.
    const r = await srv.post('/student/nudge', { text: 'check recipient' }, { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    const inserted = nudgesDb._insertedDm();
    expect(inserted.recipientUsername).toBe('apple-fox');  // from FIXTURE_TEACHER_ROW.login_username
  });
});

// -- GET /student/nudge-history ------------------------------------------------

describe('GET /student/nudge-history endpoint', () => {
  it('401 without Bearer token', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: SAMPLE_ROWS });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get('/student/nudge-history');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('200 with valid student token -> dyad rows returned', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: SAMPLE_ROWS });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentUsername).toBe('papaya-otter');
    expect(r.body.teacherUsername).toBe('apple-fox');
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.rows).toHaveLength(2);
  });

  it('limit clamping: >100 -> 100', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history?limit=999', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(100);
  });

  it('limit fallback: NaN -> 20', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history?limit=banana', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(20);
  });

  it('offset clamping: negative -> 0', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history?offset=-5', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.offset).toBe(0);
  });

  it('dyad lookup uses student username from token + resolved teacher username', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    const calledWith = nudgesDb._listCalledWith();
    expect(calledWith.studentUsername).toBe('papaya-otter');
    expect(calledWith.teacherUsername).toBe('apple-fox');
  });

  it('400 if resolved usernames have invalid characters (defensive)', async () => {
    // Build a roster where the student has an invalid username character.
    const badStudent = { ...FIXTURE_STUDENT, login_username: 'bad,username' };
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, badStudent], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/invalid characters/);
  });

  it('503 when table missing (42P01)', async () => {
    const nudgesDb = createFakeNudgesDb({ fail42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/nudge-history', { Authorization: `Bearer ${token}` });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('nudges_log not provisioned');
  });
});

// -- db.findTeacherUsername helper (DAL unit) ----------------------------------

describe('db.findTeacherUsername helper', () => {
  it('builds the right query: .from(roster).select(...).eq(role,teacher).order(...).limit(1).maybeSingle()', async () => {
    var calls = [];
    var stubClient = {
      from(table) {
        calls.push({ method: 'from', args: [table] });
        var chain = {
          select(cols) { calls.push({ method: 'select', args: [cols] }); return chain; },
          eq(col, val) { calls.push({ method: 'eq', args: [col, val] }); return chain; },
          order(col, opts) { calls.push({ method: 'order', args: [col, opts] }); return chain; },
          limit(n) { calls.push({ method: 'limit', args: [n] }); return chain; },
          async maybeSingle() { calls.push({ method: 'maybeSingle', args: [] }); return { data: null, error: null }; },
        };
        return chain;
      },
    };
    var { createDb } = await import('../db.js');
    var db = createDb(stubClient);
    await db.findTeacherUsername();
    expect(calls.find(c => c.method === 'from').args[0]).toBe('roster');
    expect(calls.find(c => c.method === 'eq').args).toEqual(['role', 'teacher']);
    expect(calls.find(c => c.method === 'limit').args[0]).toBe(1);
    expect(calls.find(c => c.method === 'maybeSingle')).toBeDefined();
    const selectCall = calls.find(c => c.method === 'select');
    expect(selectCall.args[0]).toContain('login_username');
  });

  it('returns the single teacher row when one exists', async () => {
    const expectedRow = { login_username: 'apple-fox', real_name: 'Mr. Colson', section: 'PeriodB', student_id: 'stu_teacher' };
    var stubClient = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() { return { data: expectedRow, error: null }; },
        };
      },
    };
    var { createDb } = await import('../db.js');
    var db = createDb(stubClient);
    var result = await db.findTeacherUsername();
    expect(result.data).toEqual(expectedRow);
    expect(result.error).toBeNull();
  });

  it('returns data:null when no teacher row exists', async () => {
    var stubClient = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() { return { data: null, error: null }; },
        };
      },
    };
    var { createDb } = await import('../db.js');
    var db = createDb(stubClient);
    var result = await db.findTeacherUsername();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ============================================================================
// Codex P13 fold regressions (MINOR: do not mask DB errors as empty thread)
// ============================================================================

describe('Codex P13 MINOR fold: GET /student/nudge-history surfaces DB errors', () => {
  // Source-level assertion: the route reads teacherErr2 from findTeacherUsername
  // and translates it to a 500, instead of silently returning {ok:true, rows:[]}.
  // (Full integration coverage requires ROSTER_TOKEN_SECRET env-var setup which
  // is out of scope for this regression test; the source-level pin is enough
  // to prevent the bug from recurring.)
  it('teacher-lookup DB error path branches to 500 (source-level pin)', async () => {
    var { readFileSync } = await import('fs');
    var { resolve } = await import('path');
    var nudgeSrc = readFileSync(resolve(__dirname, '..', 'nudge.js'), 'utf-8');
    // Find the GET /student/nudge-history handler.
    var idx = nudgeSrc.indexOf("app.get('/student/nudge-history'");
    expect(idx).toBeGreaterThan(-1);
    // The handler body must include `teacherErr2` extraction + a 500 branch
    // ABOVE the "no teacher -> empty thread" early-return.
    var slice = nudgeSrc.slice(idx, idx + 3000);
    expect(slice).toMatch(/teacherErr2/);
    // The teacherErr2 check must lead to res.status(500) BEFORE the no-teacher
    // empty-thread short-circuit.
    var errIdx = slice.indexOf('teacherErr2');
    var emptyIdx = slice.indexOf('no teacher -> empty thread');
    expect(errIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(errIdx);   // err check happens FIRST
    // The status(500) for teacher-lookup error must be present.
    var errCheck = slice.slice(errIdx, emptyIdx);
    expect(errCheck).toMatch(/status\(500\)/);
  });
});

describe('GET /student/nudge-history-guest (un-authed; a guest reads teacher messages by alias)', () => {
  it('returns the teacher->guest thread, matching BOTH alias case-variants', async () => {
    // The guest avatar is mounted Title-case (getGuestIdentity) and the server
    // never lowercases recipients, so the stored recipient is Title-case. The
    // endpoint queries the verbatim alias AND its lowercase form so either case
    // is found.
    const rows = [{ direction: 'teacher', sender_username: 'apple-fox', recipient_username: 'Guest_Mango_Turtle', text: 'please sign in', created_at: '2026-06-21T00:00:00Z' }];
    const nudgesDb = createFakeNudgesDb({ conversationRows: rows });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.get('/student/nudge-history-guest?guestUsername=Guest_Mango_Turtle');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.studentUsername).toBe('Guest_Mango_Turtle');  // verbatim echoed back
    const called = nudgesDb._listCalledWith();
    expect(called.teacherUsername).toBe('apple-fox');
    expect(called.studentUsernames).toEqual(['Guest_Mango_Turtle', 'guest_mango_turtle']);
  });
  it('an all-lowercase alias collapses to a single de-duped variant', async () => {
    const nudgesDb = createFakeNudgesDb({ conversationRows: [] });
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    await srv.get('/student/nudge-history-guest?guestUsername=guest_mango_turtle');
    expect(nudgesDb._listCalledWith().studentUsernames).toEqual(['guest_mango_turtle']);
  });
  it('rejects a NON-guest username (real students must use the token endpoint)', async () => {
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb: createFakeNudgesDb() });
    srv = ctx.server;
    expect((await srv.get('/student/nudge-history-guest?guestUsername=papaya-otter')).status).toBe(400);
  });
  it('rejects a missing guestUsername', async () => {
    const ctx = await startServer({ roster: [FIXTURE_TEACHER_ROW, FIXTURE_STUDENT], nudgesDb: createFakeNudgesDb() });
    srv = ctx.server;
    expect((await srv.get('/student/nudge-history-guest')).status).toBe(400);
  });
  it('no teacher -> 200 with an empty thread (graceful)', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb: createFakeNudgesDb() });  // no teacher
    srv = ctx.server;
    const r = await srv.get('/student/nudge-history-guest?guestUsername=Guest_Berry_Sloth');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.rows).toEqual([]);
  });
});
