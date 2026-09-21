// teacher-endpoints.test.js — tests for GET /teacher/student/:studentId/profile,
// /grade, and /recent (Phase 1 of TEACHER_STUDENT_CONSOLE_SPEC.md).
// Teacher-gated (x-teacher-secret). Pure fake-db + http loopback; NO network/Supabase.
// Mirrors class.test.js harness verbatim (lines 1-80).

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// Only the content catalog is synthetic; preserve other filesystem reads.
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, readFile: async (path, ...args) => {
    if (!String(path).endsWith('/data/teacher-question-catalog.json')) return actual.readFile(path, ...args);
    return JSON.stringify({ questions: {
      'U1-L2-Q01': { prompt: 'Expand 2(x + 3).', attachments: { choices: ['2x + 6', '2x + 3', 'x + 6'] } },
      'WS-U1L1-r1': { prompt: 'Explain how to distribute a negative coefficient.' },
    } });
  } };
});

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');
  realBkt = globalThis.BKT;
});

const TEACHER = 'teacher-secret-fixture';

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'inline synthetic Algebra 2 diagnostics',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1' },
    'U2-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2' },
  },
};

// Fake roster db.
// Exposes insertRoster, findByUsername, listRoster (used by /class/*),
// findByStudentId (single-student lookup), and getRoleByStudentId.
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

// Fake ledger db indexed by student_id.
function createFakeLedgerDb(rowsByStudent, { error = null, throwForStudentId = null } = {}) {
  const store = { ...rowsByStudent };
  return {
    _store: store,
    async getLedgerByStudent(studentId) {
      if (throwForStudentId === studentId) throw new Error('boom for ' + studentId);
      if (error) return { data: null, error };
      return { data: store[studentId] || [], error: null };
    },
    async insertLedgerRow() { store._written = true; return { data: {}, error: null }; },
  };
}

function makeRow(studentId, itemId, response, { source = 'curriculum_quiz', score, unit, attempt = 1, recorded_at } = {}) {
  return {
    student_id: studentId, source, item_id: itemId, response,
    score: score === undefined ? null : score, unit, attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => ({
  'U1-L1-Q01': { skill: '1.A' },
  'U1-L1-Q02': { skill: '1.A' },
  'U2-L1-Q01': { skill: '2.B' },
});

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
  roster = [], ledger = {},
  loadAnswerKey = okAnswerKey, loadSkillMap = okSkillMap, bkt,
  rosterOpts = {}, ledgerOpts = {},
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TEACHER_SECRET = TEACHER;
  process.env.NODE_ENV = 'test';
  const rosterDb = createFakeRosterDb(roster, rosterOpts);
  const ledgerDb = createFakeLedgerDb(ledger, ledgerOpts);
  const app = createApp(rosterDb, ledgerDb, fakeLoadManifest, loadAnswerKey, loadSkillMap, bkt === undefined ? realBkt : bkt, null, null, { useDistrictFormula: true, bonusOnlyThrough: null });
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
  section: 'C',
};

// ── GET /teacher/student/:studentId/profile ───────────────────────────────────

describe('GET /teacher/student/:studentId/profile', () => {
  it('401 without teacher secret or token', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with valid teacher secret — correct envelope shape', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('C');
    expect(r.body.role).toBe('student');
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/no-such-student/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it("200 with role='student' by default", async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('student');
  });

  it("200 with role='teacher' when getRoleByStudentId returns 'teacher'", async () => {
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      rosterOpts: { roleMap: { stu_abc123: 'teacher' } },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('teacher');
  });

  it('500 when db.findByStudentId returns an error', async () => {
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      rosterOpts: { error: { message: 'db down' } },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/profile', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('Database error');
  });
});

// ── GET /teacher/student/:studentId/grade ─────────────────────────────────────

describe('GET /teacher/student/:studentId/grade', () => {
  it('401 without teacher auth', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 → envelope shape with quarters/units/completion populated for fixture ledger', async () => {
    const ledger = {
      stu_abc123: [makeRow('stu_abc123', 'TA-U1', 'Polynomial assessment', {
        source: 'topic-assessment', score: 75, recorded_at: '2026-09-03T12:00:00Z',
      })],
    };
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('C');
    expect(r.body.asOf).toBeDefined();
    expect(r.body.quarters).toBeDefined();
    expect(r.body.units).toBeDefined();
    expect(r.body.completion).toBeDefined();
    expect(r.body.config).toBeDefined();
    expect(r.body.config.C).toBe(85);
    expect(r.body.config.feederWeights).toBeDefined();
    expect(r.body.config.frqBand).toBeDefined();
    expect(r.body.config.quarters).toBeDefined();
    expect(r.body.formula).toBe('district');
    expect(r.body.quarters.Q1.quarterGrade).toBe(75);
    expect(r.body.quarters.Q1.categoryBreakdown.assessments).toMatchObject({ earned: 75, possible: 100 });
    expect(r.body.items).toContainEqual(expect.objectContaining({ itemId: 'TA-U1', points: 75, maxPoints: 100 }));
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/unknown-id/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('200 with empty ledger → quarters/units present but zero-valued', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.units).toEqual({});
    expect(r.body.quarters).toBeDefined();
  });

  it('lessonSchedule + section are threaded to computeGrade (section from roster)', async () => {
    // A fake lesson schedule — format matches what grade.js expects.
    const fakeSchedule = {
      '1.1': { unit: 1, worksheetKey: '1', periods: { C: '2026-09-03', D: '2026-09-04', G: '2026-09-02' } },
    };
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    // Re-create with a lessonSchedule injected (need to rebuild the server manually).
    await ctx.server.stop();

    process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    process.env.NODE_ENV = 'test';
    const rosterDb = createFakeRosterDb([FIXTURE_STUDENT]);
    const ledgerDb = createFakeLedgerDb({});
    const { createApp: ca } = await import('../server.js');
    // Match startServer: Vitest disables district grading by default.
    const app = ca(rosterDb, ledgerDb, fakeLoadManifest, okAnswerKey, okSkillMap, realBkt, undefined, fakeSchedule, { useDistrictFormula: true, bonusOnlyThrough: null });
    const server = new TestServer(app);
    await server.start();
    srv = server;

    const r = await server.get('/teacher/student/stu_abc123/grade', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.formula).toBe('district');
    expect(r.body.section).toBe('C');
    expect(r.body.items).toEqual([]);
    expect(r.body.lessons[0].due.C).toBe('2026-09-03');
  });
});

// ── GET /teacher/student/:studentId/recent ────────────────────────────────────

describe('GET /teacher/student/:studentId/recent', () => {
  function makeTimestampedRow(studentId, itemId, recorded_at) {
    return makeRow(studentId, itemId, 'X', { source: 'curriculum_quiz', score: 0, unit: 'U1', recorded_at });
  }

  it('401 without teacher auth', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with default limit=20 → at most 20 submissions', async () => {
    // Build 30 rows with distinct timestamps
    const rows = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submissions.length).toBeLessThanOrEqual(20);
    expect(r.body.submissions).toHaveLength(20);
  });

  it('200 with limit=5 → at most 5 submissions ordered by recordedAt desc', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=5', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(5);
    // Newest first
    const dates = r.body.submissions.map(s => s.recordedAt);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("200 with limit='banana' → falls back to 20", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=banana', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(20);
  });

  it('200 with limit=999 → clamped to 100', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
      return makeTimestampedRow('stu_abc123', `U1-L1-Q${String(i + 1).padStart(2, '0')}`, d);
    });
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=999', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(100);
  });

  it('404 when studentId is unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/no-such/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('each submission object has the camelCase keys per BUILD §2.2.3', async () => {
    const recorded_at = '2026-05-22T14:01:00.000Z';
    const rows = [
      {
        student_id: 'stu_abc123',
        source: 'worksheet',
        item_id: 'U6-L3-Q05',
        response: '0.45',
        score: 1,
        unit: '6',
        attempt: 1,
        recorded_at,
      },
    ];
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { stu_abc123: rows } });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions).toHaveLength(1);
    const sub = r.body.submissions[0];
    expect(sub.recordedAt).toBe(recorded_at);
    expect(sub.itemId).toBe('U6-L3-Q05');
    expect(sub.source).toBe('worksheet');
    expect(sub.response).toBe('0.45');
    expect(sub.score).toBe(1);
    expect(sub.unit).toBe('6');
    expect(sub.attempt).toBe(1);
    // No snake_case keys on the submission object
    expect(sub.recorded_at).toBeUndefined();
    expect(sub.item_id).toBeUndefined();
  });

  it('200 with studentId and username in the response envelope', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: {} });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.studentId).toBe('stu_abc123');
    expect(r.body.username).toBe('papaya-otter');
    expect(r.body.realName).toBe('Jane Doe');
    expect(r.body.section).toBe('C');
    expect(r.body.submissions).toEqual([]);
  });
});

// ── Token-based teacher auth (Codex MAJOR fold) ────────────────────────────
// Proves requireTeacher Path B (Authorization: Bearer <token> whose role
// resolves to 'teacher') grants access to all three endpoints, and that a
// student-role token is rejected.

describe('Token-based teacher auth (Authorization: Bearer)', () => {
  const TEACHER_ROW = {
    student_id: 'stu_teacher',
    login_username: 'apple-fox',
    real_name: 'Mr. Colson',
    section: 'C',
  };

  for (const endpoint of ['profile', 'grade', 'recent']) {
    it(`200 with valid teacher token on /${endpoint}`, async () => {
      const ctx = await startServer({
        roster: [FIXTURE_STUDENT, TEACHER_ROW],
        rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
      });
      srv = ctx.server;
      const token = signToken('stu_teacher');
      const r = await srv.get(`/teacher/student/stu_abc123/${endpoint}`, {
        'Authorization': `Bearer ${token}`,
      });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
    });

    it(`401 with student-role token on /${endpoint}`, async () => {
      const ctx = await startServer({
        roster: [FIXTURE_STUDENT, TEACHER_ROW],
        rosterOpts: { roleMap: { stu_teacher: 'teacher' } },
        // stu_abc123 has no roleMap entry -> defaults to 'student'.
      });
      srv = ctx.server;
      const token = signToken('stu_abc123');
      const r = await srv.get(`/teacher/student/stu_abc123/${endpoint}`, {
        'Authorization': `Bearer ${token}`,
      });
      expect(r.status).toBe(401);
      expect(r.body.ok).toBe(false);
      expect(r.body.error).toBe('forbidden');
    });
  }
});

// ── Edge cases (Codex MINOR fold) ──────────────────────────────────────────
// limit=Infinity used to fall through to the default 20; now clamps to 100.
// Equal recorded_at timestamps used to swap unpredictably (comparator returned
// 1 on equality); now preserves relative order via V8 stable sort.

describe('Edge cases on /recent (Codex MINOR fold)', () => {
  it('limit=Infinity clamps to 100 (not falls to default 20)', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeRow('stu_abc123', `Q${i}`, 'A', {
      recorded_at: new Date(Date.now() - i * 1000).toISOString(),
    }));
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      ledger: { stu_abc123: rows },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent?limit=Infinity', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions.length).toBe(100);
  });

  it('equal recorded_at preserves relative order (stable sort)', async () => {
    const sameTs = '2026-05-22T14:00:00Z';
    const rows = [
      makeRow('stu_abc123', 'Q1', 'A', { recorded_at: sameTs }),
      makeRow('stu_abc123', 'Q2', 'A', { recorded_at: sameTs }),
      makeRow('stu_abc123', 'Q3', 'A', { recorded_at: sameTs }),
    ];
    const ctx = await startServer({
      roster: [FIXTURE_STUDENT],
      ledger: { stu_abc123: rows },
    });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/recent', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.submissions.length).toBe(3);
    // V8 stable sort + comparator returning 0 on equality keeps input order.
    expect(r.body.submissions.map(s => s.itemId)).toEqual(['Q1', 'Q2', 'Q3']);
  });
});

// ── Wave 2A: GET /teacher/student/:studentId/donow ────────────────────────────

// A minimal manifest with one unit + one lesson so computeDonow produces a
// meaningful nextTask (instead of null from an empty manifest).
const FIXTURE_MANIFEST = {
  generatedFrom: 'fixture',
  units: [
    {
      unit: 'U1',
      lessons: [
        {
          lesson: 'L1',
          activities: [
            { activity: 'try-it', source: 'try-it', itemIds: ['TI-U1-L1-1', 'TI-U1-L1-2'] },
            { activity: 'lesson-check', source: 'lesson-check', itemIds: ['LC-U1-L1'] },
          ],
        },
      ],
    },
  ],
};

const okManifest = async () => FIXTURE_MANIFEST;

describe('GET /teacher/student/:studentId/donow', () => {
  it('401 without teacher auth', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/stu_abc123/donow');
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('200 with teacher secret — response has ok, nextTask, lessons, units, earlierGapFlag', async () => {
    // Build server with a richer manifest so nextTask is populated.
    await (async () => {
      process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
      process.env.ROSTER_TEACHER_SECRET = TEACHER;
      process.env.NODE_ENV = 'test';
      const rosterDb = createFakeRosterDb([FIXTURE_STUDENT]);
      const ledgerDb = createFakeLedgerDb({});
      const app = createApp(rosterDb, ledgerDb, okManifest, okAnswerKey, okSkillMap, realBkt, null, null, null, null, null);
      const server = new TestServer(app);
      await server.start();
      srv = server;
    })();
    const r = await srv.get('/teacher/student/stu_abc123/donow', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body).toHaveProperty('nextTask');
    expect(r.body).toHaveProperty('lessons');
    expect(r.body).toHaveProperty('units');
    expect(r.body).toHaveProperty('earlierGapFlag');
    // nextTask points to the first activity since ledger is empty.
    expect(r.body.nextTask).not.toBeNull();
    expect(r.body.nextTask.unit).toBe('U1');
    expect(r.body.nextTask.activity).toBe('try-it');
  });

  it('200 with token-auth (Bearer) — same envelope', async () => {
    const TEACHER_ROW = { student_id: 'stu_teacher2', login_username: 'mango-fox', real_name: 'Mr. T', section: 'C' };
    process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    process.env.NODE_ENV = 'test';
    const rosterDb = createFakeRosterDb([FIXTURE_STUDENT, TEACHER_ROW], { roleMap: { stu_teacher2: 'teacher' } });
    const ledgerDb = createFakeLedgerDb({});
    const app = createApp(rosterDb, ledgerDb, okManifest, okAnswerKey, okSkillMap, realBkt, null, null, null, null, null);
    const server = new TestServer(app);
    await server.start();
    srv = server;
    const token = signToken('stu_teacher2');
    const r = await srv.get('/teacher/student/stu_abc123/donow', { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body).toHaveProperty('nextTask');
  });

  it('401 with student-role token', async () => {
    const ctx = await startServer({ roster: [FIXTURE_STUDENT] });
    srv = ctx.server;
    const token = signToken('stu_abc123');
    const r = await srv.get('/teacher/student/stu_abc123/donow', { 'Authorization': `Bearer ${token}` });
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('forbidden');
  });

  it('404 when studentId unknown', async () => {
    const ctx = await startServer({ roster: [] });
    srv = ctx.server;
    const r = await srv.get('/teacher/student/no-such/donow', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('student not found');
  });

  it('200 with empty ledger — nextTask is the first lesson activity', async () => {
    process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
    process.env.ROSTER_TEACHER_SECRET = TEACHER;
    process.env.NODE_ENV = 'test';
    const rosterDb = createFakeRosterDb([FIXTURE_STUDENT]);
    const ledgerDb = createFakeLedgerDb({});
    const app = createApp(rosterDb, ledgerDb, okManifest, okAnswerKey, okSkillMap, realBkt, null, null, null, null, null);
    const server = new TestServer(app);
    await server.start();
    srv = server;
    const r = await srv.get('/teacher/student/stu_abc123/donow', { 'x-teacher-secret': TEACHER });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.lessons)).toBe(true);
    // With an empty ledger every activity is 'none', so nextTask is the first one.
    expect(r.body.nextTask).not.toBeNull();
    expect(r.body.earlierGapFlag).toBe(false);
  });
});


describe('teacher skill evidence', () => {
  const path = '/teacher/student/stu_abc123/recent?skill=1.A';
  const headers = { 'x-teacher-secret': TEACHER };
  it('requires teacher auth and refuses student tokens', async () => {
    ({ server: srv } = await startServer({ roster: [FIXTURE_STUDENT] }));
    expect((await srv.get(path)).status).toBe(401);
    expect((await srv.get(path, { Authorization: 'Bearer ' + signToken(FIXTURE_STUDENT.student_id) })).status).toBe(401);
  });
  it('includes every contributing attempt beyond 100 recent rows, matching the diagnostic exactly', async () => {
    const sid = FIXTURE_STUDENT.student_id;
    const rows = [
      makeRow(sid, 'U1-L2-Q01', 'B', { recorded_at: '2026-09-01T00:00:00Z' }),
      makeRow(sid, 'U1-L2-Q01', 'A', { attempt: 2, recorded_at: '2026-09-02T00:00:00Z' }),
      makeRow(sid, 'WS-U1L1-r1', 'Saved explanation', { source: 'frq', score: .5 }),
      makeRow(sid, 'WS-U1L1-r1', 'Ungraded', { source: 'frq', score: null }),
      makeRow(sid, 'WS-U1L1-r1', 'Plain worksheet', { source: 'worksheet', score: 1 }),
      ...Array.from({ length: 110 }, () => makeRow(sid, 'U2-L1-Q01', 'A')),
    ];
    const key = { answerKey: { ...FIXTURE_ANSWER_KEY.answerKey, 'U1-L2-Q01': { answerKey: 'B' } } };
    const map = { 'U1-L2-Q01': { skill: '1.A' }, 'WS-U1L1-r1': { skill: '1.A' }, 'U2-L1-Q01': { skill: '2.B' } };
    const ctx = await startServer({ roster: [FIXTURE_STUDENT], ledger: { [sid]: rows }, loadAnswerKey: async () => key, loadSkillMap: async () => map });
    srv = ctx.server;
    const { body, status } = await srv.get(path + '&limit=1', headers);
    expect(status).toBe(200);
    expect(body.submissions).toHaveLength(3);
    expect(body.submissions.map(r => r.correct)).toEqual([true, false, true]);
    expect(body.submissions[0].question.prompt).toContain('Expand 2(x + 3)');
    expect(body.submissions[0].question.attachments.choices).toHaveLength(3);
    expect(body.submissions[2].question.prompt).toContain('negative coefficient');
    expect(body.submissions[2].response).toBe('Saved explanation');
    const { computeMastery } = await import('../mastery.js');
    expect(body.summary).toEqual(computeMastery(rows, key.answerKey, map, realBkt).skills['1.A']);
    expect(ctx.ledgerDb._store._written).toBeUndefined();
  });
  it('keeps correct-only tentative flags and explicitly returns missing question text', async () => {
    const sid = FIXTURE_STUDENT.student_id;
    ({ server: srv } = await startServer({ roster: [FIXTURE_STUDENT], ledger: { [sid]: [makeRow(sid, 'U1-L1-Q01', 'B')] } }));
    const { body } = await srv.get(path, headers);
    expect(body.flagged).toBe(true);
    expect(body.summary).toEqual({ observations: 1, correct: 1, pKnow: .607 });
    expect(body.submissions[0].question).toBeNull();
  });
  it('distinguishes unavailable inputs from no evidence and rejects malformed skills', async () => {
    ({ server: srv } = await startServer({ roster: [FIXTURE_STUDENT], loadSkillMap: async () => null }));
    expect((await srv.get(path, headers)).status).toBe(503);
    expect((await srv.get(path.replace('1.A', '%3Cimg%3E'), headers)).status).toBe(400);
  });
  it('returns an empty evidence view for an unobserved skill', async () => {
    ({ server: srv } = await startServer({ roster: [FIXTURE_STUDENT] }));
    const { body } = await srv.get(path, headers);
    expect(body.submissions).toEqual([]);
    expect(body.summary.observations).toBe(0);
    expect(body.flagged).toBe(false);
  });
});
