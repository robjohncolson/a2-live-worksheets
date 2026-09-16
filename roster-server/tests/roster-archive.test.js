// roster-archive.test.js -- integration coverage for reversible roster archive.
// Mirrors roster-edit.test.js: an in-memory db, createApp(), a real HTTP server,
// and fetch. Each ROSTER_ARCHIVE_SPEC invariant is named A1-A6 below.

import http from 'node:http';

import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../db.js';
import { createApp } from '../server.js';

const TEACHER_SECRET = 'roster-archive-teacher';
const ACTIVE_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVE_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
const SECTION = 'C';
const PASSWORD = 'testpass1';

const ANSWER_KEY = {
  generatedFrom: 'roster-archive.test.js',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
  },
};

function createArchiveFakeDb() {
  const store = new Map();
  const listRosterCalls = [];
  const setRosterStatusCalls = [];
  const childTables = {
    item_ledger: [],
    remediation_assignment: [],
    roster_alias: [],
  };
  let statusUpdateCounter = 0;

  return {
    store,
    listRosterCalls,
    setRosterStatusCalls,
    childTables,

    seedRoster(rows) {
      for (const row of rows) store.set(row.student_id, structuredClone(row));
    },

    async insertRoster() {
      return { data: null, error: null };
    },

    async findByUsername(username) {
      const normalized = String(username).toLowerCase();
      const data = [...store.values()].find((row) => row.login_username === normalized) || null;
      return { data: data ? structuredClone(data) : null, error: null };
    },

    async findByStudentId(studentId) {
      const data = store.get(studentId) || null;
      return { data: data ? structuredClone(data) : null, error: null };
    },

    async findTeacherUsername() {
      return { data: null, error: null };
    },

    async getRoleByStudentId(studentId) {
      return store.get(studentId)?.role === 'teacher' ? 'teacher' : 'student';
    },

    async getSpriteHueByStudentId() {
      return null;
    },

    async getSchoologyUidMap() {
      return {};
    },

    async listRoster(section, opts = {}) {
      listRosterCalls.push({ section: section || null, opts: { ...opts } });

      let rows = [...store.values()];
      if (section) rows = rows.filter((row) => row.section === section);
      if (opts.includeArchived !== true) {
        rows = rows.filter((row) => row.status !== 'archived');
      }

      return { data: structuredClone(rows), error: null };
    },

    async setRosterStatus(studentId, status) {
      setRosterStatusCalls.push({ studentId, status });
      if (status !== 'active' && status !== 'archived') {
        return { data: null, error: { code: 'BAD_STATUS', message: 'unsupported roster status' } };
      }

      const row = store.get(studentId);
      if (!row) return { data: null, error: null };

      statusUpdateCounter += 1;
      row.status = status;
      row.updated_at = new Date(Date.parse('2026-09-01T00:00:00.000Z') + statusUpdateCounter * 1000).toISOString();
      return { data: { student_id: studentId, status }, error: null };
    },

    async listReviewMarksByStudents() {
      return { data: [], error: null };
    },

    async listReviewMarksByStudent() {
      return { data: [], error: null };
    },
  };
}

class ArchiveTestServer {
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
    const options = {
      method,
      headers: { connection: 'close', 'content-type': 'application/json', ...headers },
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    const response = await fetch(`${this.baseUrl}${path}`, options);
    return { status: response.status, body: await response.json() };
  }
}

async function seedArchiveFixture(db) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const common = {
    section: SECTION,
    role: 'student',
    status: 'active',
    password_hash: passwordHash,
    password_cipher: null,
    must_change_password: false,
    email: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };

  db.seedRoster([
    {
      ...common,
      student_id: ACTIVE_ID,
      login_username: 'active_student',
      real_name: 'Active Student',
    },
    {
      ...common,
      student_id: ARCHIVE_ID,
      login_username: 'archive_student',
      real_name: 'Archive Student',
    },
  ]);

  db.childTables.item_ledger.push(
    {
      ledger_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      student_id: ACTIVE_ID,
      source: 'curriculum_quiz',
      item_id: 'U1-L1-Q01',
      response: 'B',
      score: null,
      attempt: 1,
      evidence_tier: 'practice',
      recorded_at: '2026-08-31T12:00:00.000Z',
    },
    {
      ledger_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      student_id: ARCHIVE_ID,
      source: 'curriculum_quiz',
      item_id: 'U1-L1-Q01',
      response: 'B',
      score: null,
      attempt: 1,
      evidence_tier: 'practice',
      recorded_at: '2026-08-31T12:01:00.000Z',
    },
  );

  db.childTables.remediation_assignment.push({ student_id: ARCHIVE_ID, skill: '1.A' });
  db.childTables.roster_alias.push({ student_id: ARCHIVE_ID, alias: 'archive-student' });
}

async function bootArchiveApp() {
  process.env.NODE_ENV = 'test';
  process.env.BCRYPT_COST = '4';
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
  process.env.ROSTER_TOKEN_SECRET = 'roster-archive-token-secret';
  process.env.ROSTER_PW_ENC_KEY = 'a'.repeat(64);
  process.env.RECEIPT_ISSUER_PRIVATE_KEY = '';
  delete process.env.TEACHER_KEY;

  const db = createArchiveFakeDb();
  await seedArchiveFixture(db);

  const ledgerDb = {
    async getLedgerByStudent(studentId) {
      const rows = db.childTables.item_ledger.filter((row) => row.student_id === studentId);
      return { data: structuredClone(rows), error: null };
    },
    async getLedgerByItem() {
      return { data: [], error: null };
    },
    async getRowsByLedgerIds() {
      return { data: [], error: null };
    },
    async insertLedgerRow() {
      return { data: null, error: null };
    },
    async updateLedgerReceipt() {
      return { error: null };
    },
  };

  const app = createApp(
    db,
    ledgerDb,
    undefined,
    async () => ANSWER_KEY,
    undefined,
    undefined,
    null,
    null,
    undefined,
    null,
    null,
    null,
    null,
    null,
    null,
    undefined,
    null,
    null,
  );
  const server = new ArchiveTestServer(app);
  await server.start();
  return { db, ledgerDb, server };
}

function teacherHeader() {
  return { 'x-teacher-secret': TEACHER_SECRET };
}

describe('roster archive HTTP contract', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await bootArchiveApp();
  });

  afterEach(async () => {
    if (ctx?.server) await ctx.server.stop();
    ctx = null;
    vi.restoreAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.BCRYPT_COST;
    delete process.env.ROSTER_TEACHER_SECRET;
    delete process.env.ROSTER_TOKEN_SECRET;
    delete process.env.ROSTER_PW_ENC_KEY;
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    delete process.env.TEACHER_KEY;
  });

  it('A1: archive and unarchive change only roster.status + updated_at and preserve every child table', async () => {
    const beforeChildren = structuredClone(ctx.db.childTables);
    const beforeArchive = structuredClone(ctx.db.store.get(ARCHIVE_ID));

    const archived = await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/archive`, {
      headers: teacherHeader(),
    });
    expect(archived).toMatchObject({
      status: 200,
      body: { ok: true, studentId: ARCHIVE_ID, status: 'archived' },
    });

    const afterArchive = structuredClone(ctx.db.store.get(ARCHIVE_ID));
    const archiveChangedKeys = Object.keys(afterArchive)
      .filter((key) => JSON.stringify(afterArchive[key]) !== JSON.stringify(beforeArchive[key]))
      .sort();
    expect(archiveChangedKeys).toEqual(['status', 'updated_at']);
    expect(ctx.db.childTables).toEqual(beforeChildren);

    const beforeUnarchive = structuredClone(afterArchive);
    const unarchived = await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/unarchive`, {
      headers: teacherHeader(),
    });
    expect(unarchived).toMatchObject({
      status: 200,
      body: { ok: true, studentId: ARCHIVE_ID, status: 'active' },
    });

    const afterUnarchive = structuredClone(ctx.db.store.get(ARCHIVE_ID));
    const unarchiveChangedKeys = Object.keys(afterUnarchive)
      .filter((key) => JSON.stringify(afterUnarchive[key]) !== JSON.stringify(beforeUnarchive[key]))
      .sort();
    expect(unarchiveChangedKeys).toEqual(['status', 'updated_at']);
    expect(ctx.db.childTables).toEqual(beforeChildren);
  });

  it('A2: archived students disappear from class surfaces but remain manageable and snapshotted', async () => {
    await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/archive`, { headers: teacherHeader() });

    ctx.db.listRosterCalls.length = 0;
    const grades = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    expect(grades.status).toBe(200);
    expect(grades.body.students.map((student) => student.studentId)).toEqual([ACTIVE_ID]);
    expect(ctx.db.listRosterCalls.at(-1)?.opts.includeArchived).not.toBe(true);

    ctx.db.listRosterCalls.length = 0;
    const review = await ctx.server.request('GET', `/class/review-queue?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    expect(review.status).toBe(200);
    expect(review.body.students.map((student) => student.studentId)).toEqual([ACTIVE_ID]);
    expect(ctx.db.listRosterCalls.at(-1)?.opts.includeArchived).not.toBe(true);

    ctx.db.listRosterCalls.length = 0;
    const picker = await ctx.server.request('GET', `/roster/section/${SECTION}`);
    expect(picker.status).toBe(200);
    expect(picker.body.students.map((student) => student.username)).toEqual(['active_student']);
    expect(ctx.db.listRosterCalls.at(-1)?.opts.includeArchived).not.toBe(true);

    ctx.db.listRosterCalls.length = 0;
    const roster = await ctx.server.request('GET', '/roster/list', { headers: teacherHeader() });
    expect(roster.status).toBe(200);
    expect(roster.body.students.map((student) => student.studentId)).toEqual([ACTIVE_ID, ARCHIVE_ID]);
    expect(roster.body.students.find((student) => student.studentId === ARCHIVE_ID)).toMatchObject({
      status: 'archived',
    });
    expect(ctx.db.listRosterCalls.at(-1)?.opts.includeArchived).toBe(true);

    ctx.db.listRosterCalls.length = 0;
    const snapshot = await ctx.server.request('GET', '/admin/snapshot', { headers: teacherHeader() });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.students.map((student) => student.studentId)).toEqual([ACTIVE_ID, ARCHIVE_ID]);
    expect(ctx.db.listRosterCalls.at(-1)?.opts.includeArchived).toBe(true);
  });

  

  it('A3: archive -> unarchive restores a byte-identical class-grade row', async () => {
    const baseline = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    const baselineStudent = baseline.body.students.find((student) => student.studentId === ARCHIVE_ID);
    expect(baselineStudent).toBeDefined();

    await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/archive`, { headers: teacherHeader() });
    const whileArchived = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    expect(whileArchived.body.students.some((student) => student.studentId === ARCHIVE_ID)).toBe(false);

    await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/unarchive`, { headers: teacherHeader() });
    const restored = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    const restoredStudent = restored.body.students.find((student) => student.studentId === ARCHIVE_ID);

    expect(JSON.stringify(restoredStudent)).toBe(JSON.stringify(baselineStudent));
  });

  it('A6: explicit active status preserves the same class grades as legacy active rows', async () => {
    const before = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    expect(before.status).toBe(200);
    expect(before.body.students.map(student => student.studentId)).toEqual([ACTIVE_ID, ARCHIVE_ID]);
    for (const row of ctx.db.store.values()) delete row.status;
    const after = await ctx.server.request('GET', `/class/grades?section=${SECTION}`, {
      headers: teacherHeader(),
    });
    expect(after.status).toBe(200);
    expect(after.body.students).toEqual(before.body.students);
  });

  it('A4: archived login gets the friendly 403 while active login is unchanged', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    const active = await ctx.server.request('POST', '/roster/verify', {
      body: { username: 'active_student', password: PASSWORD },
    });
    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ ok: true, studentId: ACTIVE_ID, realName: 'Active Student' });
    expect(compareSpy).toHaveBeenCalledTimes(1);

    await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/archive`, { headers: teacherHeader() });
    const archived = await ctx.server.request('POST', '/roster/verify', {
      body: { username: 'archive_student', password: PASSWORD },
    });
    expect(archived).toEqual({
      status: 403,
      body: { ok: false, error: 'account archived — ask your teacher' },
    });
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['archive', 'unarchive'])('A5: POST /roster/:studentId/%s is teacher-gated', async (action) => {
    const response = await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/${action}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, error: 'forbidden' });
  });

  it('A5: archive and unarchive are idempotent 200 operations', async () => {
    for (const expectedStatus of ['archived', 'archived', 'active', 'active']) {
      const action = expectedStatus === 'archived' ? 'archive' : 'unarchive';
      const response = await ctx.server.request('POST', `/roster/${ARCHIVE_ID}/${action}`, {
        headers: teacherHeader(),
      });
      expect(response).toEqual({
        status: 200,
        body: { ok: true, studentId: ARCHIVE_ID, status: expectedStatus },
      });
      expect(ctx.db.store.get(ARCHIVE_ID).status).toBe(expectedStatus);
    }
  });

  it.each(['archive', 'unarchive'])('unknown studentId -> 404 for %s', async (action) => {
    const response = await ctx.server.request('POST', `/roster/${UNKNOWN_ID}/${action}`, {
      headers: teacherHeader(),
    });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ ok: false, error: 'Student not found' });
  });

  it.each(['archive', 'unarchive'])('malformed studentId -> 400 for %s', async (action) => {
    const response = await ctx.server.request('POST', `/roster/not-a-uuid/${action}`, {
      headers: teacherHeader(),
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, error: 'Invalid studentId' });
    expect(ctx.db.setRosterStatusCalls).toEqual([]);
  });

  it('only archive/unarchive can write status; PATCH cannot smuggle a transition', async () => {
    const response = await ctx.server.request('PATCH', `/roster/${ARCHIVE_ID}`, {
      headers: teacherHeader(),
      body: { status: 'disabled' },
    });
    expect(response.status).toBe(400);
    expect(ctx.db.store.get(ARCHIVE_ID).status).toBe('active');
    expect(ctx.db.setRosterStatusCalls).toEqual([]);
  });
});

describe('real db archive query payloads', () => {
  it('A1: setRosterStatus sends exactly status + updated_at to roster', async () => {
    const capture = {};
    const client = {
      from(table) {
        capture.table = table;
        return {
          update(payload) {
            capture.payload = payload;
            return {
              eq(column, value) {
                capture.eq = [column, value];
                return {
                  select(columns) {
                    capture.select = columns;
                    return {
                      async maybeSingle() {
                        return { data: { student_id: value, status: payload.status }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const db = createDb(client);
    const result = await db.setRosterStatus(ARCHIVE_ID, 'archived');

    expect(result).toEqual({ data: { student_id: ARCHIVE_ID, status: 'archived' }, error: null });
    expect(capture.table).toBe('roster');
    expect(capture.eq).toEqual(['student_id', ARCHIVE_ID]);
    expect(capture.select).toContain('student_id');
    expect(capture.select).toContain('status');
    expect(Object.keys(capture.payload).sort()).toEqual(['status', 'updated_at']);
    expect(capture.payload.status).toBe('archived');
    expect(typeof capture.payload.updated_at).toBe('string');
  });

  it('setRosterStatus rejects unsupported statuses before opening a query', async () => {
    const from = vi.fn();
    const db = createDb({ from });

    const result = await db.setRosterStatus(ARCHIVE_ID, 'disabled');

    expect(result).toEqual({
      data: null,
      error: { code: 'BAD_STATUS', message: 'Invalid roster status' },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('A2/A6: listRoster filters archived by default and includeArchived is the sole bypass', async () => {
    const sourceRows = [
      { student_id: ACTIVE_ID, status: 'active', section: SECTION },
      { student_id: ARCHIVE_ID, status: 'archived', section: SECTION },
    ];
    const calls = [];
    const client = {
      from(table) {
        const call = { table, filters: [], orders: [] };
        calls.push(call);

        const builder = {
          eq(column, value) {
            call.filters.push(['eq', column, value]);
            return this;
          },
          neq(column, value) {
            call.filters.push(['neq', column, value]);
            return this;
          },
          order(column, options) {
            call.orders.push([column, options]);
            return this;
          },
          then(resolve, reject) {
            let data = sourceRows.slice();
            for (const [operator, column, value] of call.filters) {
              if (operator === 'eq') data = data.filter((row) => row[column] === value);
              if (operator === 'neq') data = data.filter((row) => row[column] !== value);
            }
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };

        return {
          select(columns) {
            call.columns = columns;
            return builder;
          },
        };
      },
    };

    const db = createDb(client);
    const defaultResult = await db.listRoster(SECTION);
    const managementResult = await db.listRoster(SECTION, { includeArchived: true });

    expect(defaultResult.data.map((row) => row.student_id)).toEqual([ACTIVE_ID]);
    expect(managementResult.data.map((row) => row.student_id)).toEqual([ACTIVE_ID, ARCHIVE_ID]);
    expect(calls[0].columns).toMatch(/(?:^|,\s*)status(?:\s*,|$)/);
    expect(calls[0].filters).toContainEqual(['neq', 'status', 'archived']);
    expect(calls[1].filters).not.toContainEqual(['neq', 'status', 'archived']);
  });
});

