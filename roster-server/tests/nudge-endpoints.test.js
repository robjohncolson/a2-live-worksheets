// nudge-endpoints.test.js -- tests for POST /teacher/nudge and
// POST /student/nudge-reply (Phase 3 of TEACHER_STUDENT_CONSOLE_SPEC.md).
// Pure fake-db + http loopback; NO network/Supabase.
// Mirrors teacher-endpoints.test.js harness exactly.

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

// ── Fake roster db ────────────────────────────────────────────────────────────

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

// ── Fake nudgesDb ──────────────────────────────────────────────────────────────

function createFakeNudgesDb({ failWith42P01 = false, error = null } = {}) {
  var inserted = [];
  var replies = [];
  return {
    _inserted: inserted,
    _replies: replies,
    async insertNudges(args) {
      if (failWith42P01) return { data: null, error: { code: '42P01', message: 'table missing' } };
      if (error) return { data: null, error };
      var deliveredSet = new Set(args.deliveredUsernames || []);
      var nowIso = new Date().toISOString();
      var rows = args.recipientUsernames.map(function(ru) {
        return {
          nudge_id: args.nudgeId,
          sender_username: args.senderUsername,
          recipient_username: ru,
          text: args.text,
          direction: 'teacher',
          section: args.section,
          created_at: nowIso,
          delivered_at: deliveredSet.has(ru) ? nowIso : null,
          id: inserted.length + 1,
        };
      });
      inserted.push.apply(inserted, rows);
      return { data: rows, error: null };
    },
    async insertReply(args) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      if (error) return { data: null, error };
      // Mirror what the real DAL adds: direction='student' and a generated nudge_id.
      var row = {
        ...args,
        direction: 'student',
        nudge_id: args.parentNudgeId + ':reply:' + Date.now(),
        id: replies.length + 1,
      };
      replies.push(row);
      return { data: row, error: null };
    },
    async listForTeacher() { return { data: inserted, error: null }; },
    async listForStudent() { return { data: inserted, error: null }; },
    async markDelivered() { return { data: {}, error: null }; },
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
  nudgesDb = undefined,
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger);
  // createApp(db, ledgerDb, loadManifest, loadAnswerKey, loadSkillMap, bkt,
  //           remediationDb, lessonSchedule, configOverrides, worksheetBlankCounts,
  //           pollArchiveDb, nudgesDbOverride)
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, okSkillMap, realBkt, null, null, null, null, null, nudgesDb);
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

// ── POST /teacher/nudge ───────────────────────────────────────────────────────

describe('POST /teacher/nudge', () => {
  it('401 without teacher auth', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: 'Hello', senderUsername: 'teacher',
    });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with valid teacher secret + body -> one row per recipient', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1',
      recipientUsernames: ['papaya-otter'],
      text: 'Please try problem 3',
      senderUsername: 'apple-fox',
      section: 'PeriodB',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.nudgeId).toBe('nudge_1');
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.rows).toHaveLength(1);
    expect(nudgesDb._inserted).toHaveLength(1);
    expect(nudgesDb._inserted[0].recipient_username).toBe('papaya-otter');
  });

  it('400 when nudgeId / recipientUsernames / text missing', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    // Missing nudgeId
    const r1 = await srv.post('/teacher/nudge', {
      recipientUsernames: ['papaya-otter'], text: 'Hi', senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r1.status).toBe(400);
    expect(r1.body.ok).toBe(false);
    // Missing recipientUsernames
    const r2 = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: [], text: 'Hi', senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r2.status).toBe(400);
    expect(r2.body.ok).toBe(false);
    // Missing senderUsername
    const r3 = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: 'Hi',
    }, { 'x-teacher-secret': TEACHER });
    expect(r3.status).toBe(400);
    expect(r3.body.ok).toBe(false);
  });

  it('400 when text is empty / whitespace-only', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: '   ', senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('text > 280 chars is truncated server-side', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const longText = 'a'.repeat(500);
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: longText, senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    // The stored text must be truncated to 280
    expect(nudgesDb._inserted[0].text.length).toBeLessThanOrEqual(280);
  });

  it('200 with deliveredUsernames marks delivered_at set, others stay null', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_2',
      recipientUsernames: ['papaya-otter', 'kiwi-bear'],
      text: 'Check in',
      senderUsername: 'apple-fox',
      section: 'PeriodB',
      deliveredUsernames: ['papaya-otter'],
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(nudgesDb._inserted).toHaveLength(2);
    const delivered = nudgesDb._inserted.find(row => row.recipient_username === 'papaya-otter');
    const notDelivered = nudgesDb._inserted.find(row => row.recipient_username === 'kiwi-bear');
    expect(delivered.delivered_at).not.toBeNull();
    expect(notDelivered.delivered_at).toBeNull();
  });

  it('503 when nudgesDb returns 42P01', async () => {
    const nudgesDb = createFakeNudgesDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: 'Hello', senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('nudges_log not provisioned');
  });

  it('500 on other db error', async () => {
    const nudgesDb = createFakeNudgesDb({ error: { code: '99999', message: 'generic failure' } });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_1', recipientUsernames: ['papaya-otter'], text: 'Hello', senderUsername: 'apple-fox',
    }, { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('Database error');
  });

  it('200 with token-auth (Bearer teacher token)', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT, FIXTURE_TEACHER_ROW],
      rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      nudgesDb,
    });
    srv = ctx.server;
    const token = signToken('stu_teacher');
    const r = await srv.post('/teacher/nudge', {
      nudgeId: 'nudge_3', recipientUsernames: ['papaya-otter'], text: 'Good work', senderUsername: 'apple-fox',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.nudgeId).toBe('nudge_3');
  });
});

// ── POST /student/nudge-reply ─────────────────────────────────────────────────

describe('POST /student/nudge-reply', () => {
  it('401 without token', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: 'On it!',
    });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('401 with malformed token', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: 'On it!',
    }, { 'Authorization': 'Bearer this.is.not.valid' });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('401 when token resolves to unknown student', async () => {
    const nudgesDb = createFakeNudgesDb();
    // Roster has no entry for the token's studentId
    const ctx = await startServer({ roster: [], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: 'On it!',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('unauthorized');
  });

  it('400 when parentNudgeId / recipientUsername / text missing', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    // Missing parentNudgeId
    const r1 = await srv.post('/student/nudge-reply', {
      recipientUsername: 'apple-fox', text: 'On it!',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r1.status).toBe(400);
    expect(r1.body.ok).toBe(false);
    // Missing recipientUsername
    const r2 = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', text: 'On it!',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r2.status).toBe(400);
    expect(r2.body.ok).toBe(false);
    // Empty text
    const r3 = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: '   ',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r3.status).toBe(400);
    expect(r3.body.ok).toBe(false);
  });

  it('text > 280 chars truncated', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const longText = 'z'.repeat(500);
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: longText,
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(nudgesDb._replies[0].text.length).toBeLessThanOrEqual(280);
  });

  it('200 inserts a reply row with parent_nudge_id set + direction=student', async () => {
    const nudgesDb = createFakeNudgesDb();
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: 'On it!',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.row).toBeDefined();
    // The fake stores args verbatim; parentNudgeId and direction come from nudge.js
    expect(nudgesDb._replies).toHaveLength(1);
    expect(nudgesDb._replies[0].parentNudgeId).toBe('nudge_1');
    expect(nudgesDb._replies[0].direction).toBe('student');
    expect(nudgesDb._replies[0].senderUsername).toBe('papaya-otter');
  });

  it('503 when nudgesDb returns 42P01', async () => {
    const nudgesDb = createFakeNudgesDb({ failWith42P01: true });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], nudgesDb });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.post('/student/nudge-reply', {
      parentNudgeId: 'nudge_1', recipientUsername: 'apple-fox', text: 'On it!',
    }, { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('nudges_log not provisioned');
  });
});
