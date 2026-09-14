// nudge-inbox.test.js -- GET /teacher/nudge-inbox (2026-09-09).
//
// Why this route exists: student-initiated messages ("I did the 1.10 quiz but
// can't see the grade") were only visible inside ONE student's drawer, so the
// teacher found two of them a fortnight late. The inbox lists every
// student->teacher row across the class so the dashboard can badge unread ones.
//
// Pure fake-db + http loopback; NO network/Supabase. Mirrors nudge-history.test.js.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: { 'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' } },
};

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername() { return { data: null, error: null }; },
    async listRoster() { return { data: [], error: null }; },
    async findByStudentId() { return { data: null, error: null }; },
    async getRoleByStudentId() { return 'student'; },
  };
}

function createFakeLedgerDb() {
  return {
    async getLedgerByStudent() { return { data: [], error: null }; },
    async insertLedgerRow() { return { data: {}, error: null }; },
  };
}

function createFakeNudgesDb({ rows = [], error = null, throwOnList = false, withInbox = true } = {}) {
  var calledWith = null;
  var db = {
    _calledWith() { return calledWith; },
    async insertNudges() { return { data: [], error: null }; },
    async insertReply() { return { data: {}, error: null }; },
    async listForTeacher() { return { data: [], error: null }; },
    async listForStudent() { return { data: [], error: null }; },
    async markDelivered() { return { data: {}, error: null }; },
    async findParent() { return { data: null, error: null }; },
    async listConversation() { return { data: [], error: null }; },
  };
  if (withInbox) {
    db.listStudentInbox = async function (args) {
      calledWith = args;
      if (throwOnList) throw new Error('DAL threw');
      if (error) return { data: null, error };
      return { data: rows, error: null };
    };
  }
  return db;
}

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

async function startServer({ nudgesDb } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const app = createApp(createFakeRosterDb(), createFakeLedgerDb(), fakeLoadManifest, okAnswerKey, okSkillMap, realBkt, null, null, null, null, null, nudgesDb);
  const server = new TestServer(app);
  await server.start();
  return server;
}

let srv;
afterEach(async () => {
  if (srv) { await srv.stop(); srv = null; }
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_TEACHER_SECRET;
});

const AUTH = { 'x-teacher-secret': TEACHER };

const ROWS = [
  {
    id: 9, nudge_id: 'dm:peach_whale:1756259220000', parent_nudge_id: null,
    sender_username: 'peach_whale', recipient_username: 'apple-fox',
    text: 'I have done the quiz for 1.10, but I can\'t see the grade.',
    direction: 'student', section: 'PeriodE',
    created_at: '2026-08-27T01:47:00.000Z', delivered_at: null,
  },
  {
    id: 4, nudge_id: 'nudge_1:reply:222', parent_nudge_id: 'nudge_1',
    sender_username: 'melon_otter', recipient_username: 'apple-fox',
    text: 'x'.repeat(2500),
    direction: 'student', section: 'PeriodE',
    created_at: '2026-08-20T18:46:00.000Z', delivered_at: '2026-08-20T18:46:00.000Z',
  },
];

describe('GET /teacher/nudge-inbox', () => {
  it('rejects a caller without teacher credentials (no db call)', async () => {
    const db = createFakeNudgesDb({ rows: ROWS });
    srv = await startServer({ nudgesDb: db });
    const r = await srv.get('/teacher/nudge-inbox');
    expect(r.status).toBe(401);
    expect(db._calledWith()).toBeNull();
  });

  it('returns 503 when nudges are not provisioned (no db, or a db without the inbox reader)', async () => {
    srv = await startServer({ nudgesDb: undefined });
    expect([404, 503]).toContain((await srv.get('/teacher/nudge-inbox', AUTH)).status);   // no db → nudge routes not mounted at all
    await srv.stop();
    srv = await startServer({ nudgesDb: createFakeNudgesDb({ withInbox: false }) });
    expect((await srv.get('/teacher/nudge-inbox', AUTH)).status).toBe(503);
  });

  it('lists student->teacher messages newest first with the allowlisted shape and a 2000-char text cap', async () => {
    const db = createFakeNudgesDb({ rows: ROWS });
    srv = await startServer({ nudgesDb: db });
    const r = await srv.get('/teacher/nudge-inbox', AUTH);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.count).toBe(2);
    expect(r.body.messages[0]).toEqual({
      nudgeId: 'dm:peach_whale:1756259220000',
      senderUsername: 'peach_whale',
      section: 'PeriodE',
      text: 'I have done the quiz for 1.10, but I can\'t see the grade.',
      createdAt: '2026-08-27T01:47:00.000Z',
      parentNudgeId: null,
    });
    expect(r.body.messages[1].parentNudgeId).toBe('nudge_1');
    expect(r.body.messages[1].text).toHaveLength(2000);
    // no raw row fields leak (recipient, delivered_at, id)
    expect(Object.keys(r.body.messages[0]).sort()).toEqual(
      ['createdAt', 'nudgeId', 'parentNudgeId', 'section', 'senderUsername', 'text']);
    // defaults: whole class, no since, limit 50
    expect(db._calledWith()).toEqual({ section: null, since: null, limit: 50 });
  });

  it('forwards section / since / limit and clamps limit to 200', async () => {
    const db = createFakeNudgesDb({ rows: [] });
    srv = await startServer({ nudgesDb: db });
    const r = await srv.get('/teacher/nudge-inbox?section=PeriodE&since=2026-08-01T00:00:00.000Z&limit=999', AUTH);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, messages: [], count: 0 });
    expect(db._calledWith()).toEqual({ section: 'PeriodE', since: '2026-08-01T00:00:00.000Z', limit: 200 });
    await srv.get('/teacher/nudge-inbox?limit=0', AUTH);
    expect(db._calledWith().limit).toBe(50);
    await srv.get('/teacher/nudge-inbox?since=2026-08-01', AUTH);
    expect(db._calledWith().since).toBe('2026-08-01T00:00:00.000Z');   // normalized, never the raw string
  });

  it('rejects an injection-shaped section and a non-ISO since with 400 (no db call)', async () => {
    const db = createFakeNudgesDb({ rows: [] });
    srv = await startServer({ nudgesDb: db });
    expect((await srv.get('/teacher/nudge-inbox?section=' + encodeURIComponent('PeriodE,or(1.eq.1)'), AUTH)).status).toBe(400);
    expect((await srv.get('/teacher/nudge-inbox?since=yesterday', AUTH)).status).toBe(400);
    expect(db._calledWith()).toBeNull();
  });

  it('maps a db error and a thrown DAL to 500 without leaking details', async () => {
    srv = await startServer({ nudgesDb: createFakeNudgesDb({ error: { code: '42P01', message: 'relation missing' } }) });
    let r = await srv.get('/teacher/nudge-inbox', AUTH);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, error: 'Database error' });
    await srv.stop();
    srv = await startServer({ nudgesDb: createFakeNudgesDb({ throwOnList: true }) });
    r = await srv.get('/teacher/nudge-inbox', AUTH);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, error: 'Database error' });
  });
});
