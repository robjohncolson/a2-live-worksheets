// lesson-unlock-endpoints.test.js -- tests for POST /teacher/lesson-unlock,
// GET /student/lesson-unlocks, GET /teacher/student/:id/lesson-unlocks
// (Phase 5 of TEACHER_STUDENT_CONSOLE_SPEC.md).
// Pure fake-db + http loopback; NO network/Supabase.
// Mirrors nudge-endpoints.test.js harness exactly.

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

// ── Fake roster db ─────────────────────────────────────────────────────────────

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

// ── Fake ledger db ─────────────────────────────────────────────────────────────

function createFakeLedgerDb(rowsByStudent = {}) {
  return {
    async getLedgerByStudent(studentId) { return { data: rowsByStudent[studentId] || [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

// ── Fake lessonUnlockDb ────────────────────────────────────────────────────────

function createFakeLessonUnlockDb({ failWith42P01 = false } = {}) {
  var unlocks = new Map();   // key: 'studentUsername|lessonKey' -> row
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
        reason: reason,
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
  };
}

// ── TestServer + startServer ───────────────────────────────────────────────────

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
  roster = [], ledger = {},
  loadAnswerKey = okAnswerKey,
  rosterOpts = {},
  lessonUnlockDb = undefined,
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger);
  // createApp(db, ledgerDb, loadManifest, loadAnswerKey, loadSkillMap, bkt,
  //           remediationDb, lessonSchedule, configOverrides, worksheetBlankCounts,
  //           pollArchiveDb, nudgesDbOverride, lessonUnlockDbOverride)
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

// Fixture student
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

// ── POST /teacher/lesson-unlock ───────────────────────────────────────────────

describe('POST /teacher/lesson-unlock', () => {
  it('401 without teacher auth', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter', lessonKey: '1.7',
    });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with teacher secret + body -> upsert row; response carries the row', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter',
      lessonKey: '1.7',
      unlockedBy: 'apple-fox',
      reason: 'caught up',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.row).toBeDefined();
    expect(r.body.row.lesson_key).toBe('1.7');
    expect(r.body.row.student_username).toBe('papaya-otter');
    expect(lessonUnlockDb._unlocks.size).toBe(1);
  });

  it('200 with token-auth (Bearer teacher token)', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT, FIXTURE_TEACHER_ROW],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      lessonUnlockDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter',
      lessonKey: '5.3',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // unlockedBy must be derived from the token (apple-fox), not the body.
    expect(r.body.row.unlocked_by).toBe('apple-fox');
  });

  it('401 with student-role token', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      rosterOpts: { roleMap: { stu_abc123: 'student' } },
      lessonUnlockDb,
    });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter',
      lessonKey: '1.7',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
  });

  it('400 when studentUsername or lessonKey missing', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    // Missing lessonKey
    const r1 = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter',
    }, { 'x-teacher-secret': TEACHER });
    expect(r1.status).toBe(400);
    expect(r1.body.ok).toBe(false);
    // Missing studentUsername
    const r2 = await srv.post('/teacher/lesson-unlock', {
      lessonKey: '1.7',
    }, { 'x-teacher-secret': TEACHER });
    expect(r2.status).toBe(400);
    expect(r2.body.ok).toBe(false);
  });

  it('200 same (student, lesson) twice -> upsert (UNIQUE constraint respected -- Map has only 1 row)', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter', lessonKey: '1.7', unlockedBy: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    const r2 = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter', lessonKey: '1.7', unlockedBy: 'apple-fox', reason: 'update',
    }, { 'x-teacher-secret': TEACHER });
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    // Fake Map uses 'studentUsername|lessonKey' as key -- second upsert overwrites, not adds.
    expect(lessonUnlockDb._unlocks.size).toBe(1);
  });

  it('503 when lessonUnlockDb returns 42P01', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter', lessonKey: '1.7', unlockedBy: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('lesson_unlock not provisioned');
  });

  it('reason truncated to 500 chars server-side', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const longReason = 'x'.repeat(600);
    const r = await srv.post('/teacher/lesson-unlock', {
      studentUsername: 'papaya-otter', lessonKey: '1.7', unlockedBy: 'apple-fox', reason: longReason,
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    const storedRow = lessonUnlockDb._unlocks.get('papaya-otter|1.7');
    expect(storedRow.reason.length).toBeLessThanOrEqual(500);
  });

  // Codex MAJOR fold P5: lesson-key format validation.
  it('400 when lessonKey is malformed (typo or wrong format)', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    for (const bad of ['u1-l7', 'banana', '1', '1.', '.7', '1.7.3', '1-7', 'abc.def']) {
      const r = await srv.post('/teacher/lesson-unlock', {
        studentUsername: 'papaya-otter', lessonKey: bad, unlockedBy: 'apple-fox',
      }, { 'x-teacher-secret': TEACHER });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/lessonKey/);
    }
  });

  it('200 for well-formed lesson keys (1.7, 5.3, 12.45)', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    for (const good of ['1.7', '5.3', '12.45']) {
      const r = await srv.post('/teacher/lesson-unlock', {
        studentUsername: 'papaya-otter', lessonKey: good, unlockedBy: 'apple-fox',
      }, { 'x-teacher-secret': TEACHER });
      expect(r.status).toBe(200);
    }
  });
});

// ── GET /student/lesson-unlocks ───────────────────────────────────────────────

describe('GET /student/lesson-unlocks', () => {
  it('401 without token', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.get('/student/lesson-unlocks');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('200 with student token -> returns lessonKeys array + rows array', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    // Seed an unlock directly into the fake.
    lessonUnlockDb._unlocks.set('papaya-otter|1.7', {
      id: 1, student_username: 'papaya-otter', lesson_key: '1.7',
      unlocked_by: 'apple-fox', reason: null, status: 'active',
      unlocked_at: new Date().toISOString(),
    });
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/lesson-unlocks', { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.lessonKeys)).toBe(true);
    expect(r.body.lessonKeys).toContain('1.7');
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.rows).toHaveLength(1);
  });

  it('200 with empty unlocks -> empty arrays', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/lesson-unlocks', { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.lessonKeys).toEqual([]);
    expect(r.body.rows).toEqual([]);
  });

  it('503 when 42P01', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/student/lesson-unlocks', { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('lesson_unlock not provisioned');
  });
});

// ── GET /teacher/student/:id/lesson-unlocks ───────────────────────────────────

describe('GET /teacher/student/:id/lesson-unlocks', () => {
  it('401 without teacher auth', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/lesson-unlocks');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with teacher secret -> returns target student\'s unlocks', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    // Seed a unlock for the target student.
    lessonUnlockDb._unlocks.set('papaya-otter|1.7', {
      id: 1, student_username: 'papaya-otter', lesson_key: '1.7',
      unlocked_by: 'apple-fox', reason: null, status: 'active',
      unlocked_at: new Date().toISOString(),
    });
    const r = await srv.get('/teacher/student/stu_abc123/lesson-unlocks', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.lessonKeys).toContain('1.7');
    expect(r.body.studentUsername).toBe('papaya-otter');
  });

  it('404 when studentId unknown', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_unknown/lesson-unlocks', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('503 when 42P01', async () => {
    const lessonUnlockDb = createFakeLessonUnlockDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], lessonUnlockDb });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/lesson-unlocks', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('lesson_unlock not provisioned');
  });
});
