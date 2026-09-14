// teacher-auth.test.js -- WI-2f tests for the requireTeacher middleware and
// all teacher-gated endpoints. Verifies:
//   - x-teacher-secret still authorizes (fallback intact)
//   - a verified teacher token authorizes
//   - a verified student token is rejected (401)
//   - a bogus/expired token is rejected (401)
//   - pre-migration: no role in fake db -> token path -> non-teacher; secret still works
//   - /roster/verify returns role
//   - auth matrix for ALL 9 teacher-gated endpoints (class.js + remediation.js)
//   - /remediation/complete dual-auth (student self-token OR teacher)
//
// No network, no Supabase. Uses Node http + fetch (Node 18+).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// -- Fake DB -------------------------------------------------------------------
//
// Two modes:
//   roleMode = 'normal'  -> getRoleByStudentId returns the stored role
//   roleMode = 'absent'  -> simulates pre-migration (column missing); always 'student'

function createFakeDb({ roleMode = 'normal' } = {}) {
  // id -> { role, ... }
  const store = new Map();

  return {
    store,
    _setRole(studentId, role) {
      const row = store.get(studentId);
      if (row) row.role = role;
    },

    async insertRoster({ realName, section, loginUsername, passwordHash, email, passwordCipher }) {
      const key = loginUsername.toLowerCase();
      // Check for dupe by username
      const dup = [...store.values()].find(r => r.login_username === key);
      if (dup) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      const row = {
        student_id:           `id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        login_username:       key,
        password_hash:        passwordHash,
        password_cipher:      passwordCipher ?? null,
        must_change_password: true,
        real_name:            realName,
        section:              section,
        email:                email || null,
        role:                 'student',
        status:               'active',
        created_at:           new Date().toISOString(),
      };
      store.set(row.student_id, row);
      return { data: row, error: null };
    },

    async findByUsername(username) {
      const key = username.toLowerCase();
      const row = [...store.values()].find(r => r.login_username === key);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
      return { data: row, error: null };
    },

    async findByStudentId(studentId) {
      const row = store.get(studentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
      return { data: row, error: null };
    },

    async getRoleByStudentId(studentId) {
      // Pre-migration simulation: no role column -> degrade to 'student'.
      if (roleMode === 'absent') return 'student';
      const row = store.get(studentId);
      if (!row) return 'student';
      return row.role === 'teacher' ? 'teacher' : 'student';
    },

    async updatePassword({ studentId, passwordHash, passwordCipher }) {
      const row = store.get(studentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
      row.password_hash = passwordHash;
      row.password_cipher = passwordCipher ?? null;
      row.must_change_password = false;
      return { data: { student_id: studentId }, error: null };
    },

    async listRoster(section) {
      const rows = [...store.values()]
        .filter(r => !section || r.section === section)
        .map(r => ({
          student_id:          r.student_id,
          real_name:           r.real_name,
          login_username:      r.login_username,
          section:             r.section,
          password_cipher:     r.password_cipher,
          must_change_password: r.must_change_password,
          created_at:          r.created_at,
        }));
      return { data: rows, error: null };
    },
  };
}

// -- Minimal stubs for non-roster deps -----------------------------------------

const EMPTY_ANSWER_KEY = {
  generatedFrom: 'fixture',
  answerKey: {},
};
async function fakeLoadAnswerKey() { return EMPTY_ANSWER_KEY; }
async function fakeLoadManifest() { return { generatedFrom: 'fixture', units: [] }; }
async function fakeLoadSkillMap() { return {}; }

// Minimal BKT: enough for class/mastery to mount without crashing.
const fakeBkt = {
  DEFAULT_PARAMS: { pInit: 0.3, pLearn: 0.1, pSlip: 0.1, pGuess: 0.25 },
  updateMastery(prior, correct) {
    const p = typeof prior === 'number' ? prior : 0.3;
    return correct ? Math.min(0.99, p + 0.25) : Math.max(0.01, p - 0.2);
  },
};

// Minimal in-memory ledger db (needed for class.js routes to mount).
function createFakeLedgerDb() {
  return {
    async getLedgerByStudent(_studentId) {
      return { data: [], error: null };
    },
    async insertLedgerRow() {
      return { data: {}, error: null };
    },
  };
}

// Minimal in-memory remediation db (needed for remediation.js routes to mount).
function createFakeRemediationDb() {
  const store = new Map();
  return {
    store,

    async insertAssignment({ studentId, unit, skill, sourceAttempt, assignedRefs, proposedBy, unlocks, notes }) {
      const id = `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = {
        assignment_id:   id,
        student_id:      studentId,
        unit:            unit,
        skill:           skill,
        source_attempt:  sourceAttempt ?? null,
        assigned_refs:   Array.isArray(assignedRefs) ? assignedRefs : [],
        status:          'proposed',
        proposed_by:     proposedBy || 'teacher',
        approved_by:     null,
        assigned_at:     null,
        completed_at:    null,
        completed_score: null,
        recheck_item_id: null,
        unlocks:         unlocks ?? null,
        notes:           notes ?? null,
        created_at:      new Date().toISOString(),
      };
      store.set(id, row);
      return { data: row, error: null };
    },

    async getAssignmentById(assignmentId) {
      const row = store.get(assignmentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: row, error: null };
    },

    async updateAssignmentStatus({ assignmentId, status, approvedBy, assignedAt, completedAt, completedScore, recheckItemId, notes }) {
      const row = store.get(assignmentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      row.status = status;
      if (approvedBy !== undefined) row.approved_by = approvedBy;
      if (assignedAt !== undefined) row.assigned_at = assignedAt;
      if (completedAt !== undefined) row.completed_at = completedAt;
      if (completedScore !== undefined) row.completed_score = completedScore;
      if (recheckItemId !== undefined) row.recheck_item_id = recheckItemId;
      if (notes !== undefined) row.notes = notes;
      return { data: row, error: null };
    },

    async listAssignmentsForStudent(studentId) {
      const rows = [...store.values()].filter(r => r.student_id === studentId);
      return { data: rows, error: null };
    },

    async listAssignmentsForSection({ section, status }) {
      let rows = [...store.values()];
      if (status) rows = rows.filter(r => r.status === status);
      if (section) rows = rows.filter(r => (r.__rosterMeta || {}).section === section);
      return { data: rows, error: null };
    },

    async findAssignment({ studentId, skill, statuses }) {
      let rows = [...store.values()].filter(r => r.student_id === studentId && r.skill === skill);
      if (Array.isArray(statuses) && statuses.length) {
        rows = rows.filter(r => statuses.includes(r.status));
      }
      return { data: rows, error: null };
    },
  };
}

// -- TestServer helper ---------------------------------------------------------

class TestServer {
  constructor(app) {
    this.server = http.createServer(app);
    this.baseUrl = null;
  }

  start() {
    return new Promise(resolve => {
      this.server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
        resolve();
      });
    });
  }

  stop() {
    return new Promise(resolve => this.server.close(resolve));
  }

  async request(method, path, { body, headers = {} } = {}) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }
}

// -- Lifecycle -----------------------------------------------------------------

let db;
let ledgerDb;
let remediationDb;
let srv;
let teacherSecret;

function makeSecret() {
  return `ts-${randomBytes(16).toString('hex')}`;
}

// Enroll a student directly (bypassing bcrypt cost for speed in tests).
async function seedStudent(db, { username = 'apple_fox', password = 'pass1234', role = 'student', realName = 'Test Student', section = 'P1' } = {}) {
  const hash = await bcrypt.hash(password, 1);
  const result = await db.insertRoster({
    realName,
    section,
    loginUsername: username,
    passwordHash: hash,
    email: null,
    passwordCipher: null,
  });
  if (result.error) throw new Error('seedStudent failed: ' + JSON.stringify(result.error));
  const studentId = result.data.student_id;
  // Elevate role if requested.
  if (role === 'teacher') db._setRole(studentId, 'teacher');
  return { studentId, username, password, role, realName, section };
}

// Issue a signed token for a studentId directly (no HTTP round trip).
function mintToken(studentId) {
  return signToken(studentId);
}

// Build a test app that mounts ALL routes: roster (server.js), class.js, and
// remediation.js. Passing ledgerDb + remediationDb satisfies the mount guards
// in createApp so the class and remediation endpoints are reachable.
function buildApp(rosterDb, remDb) {
  return createApp(
    rosterDb,
    ledgerDb,
    fakeLoadManifest,
    fakeLoadAnswerKey,
    fakeLoadSkillMap,
    fakeBkt,
    remDb,
  );
}

beforeEach(async () => {
  teacherSecret = makeSecret();
  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET   = makeSecret();
  process.env.ROSTER_PW_ENC_KEY     = 'a'.repeat(64);
  process.env.NODE_ENV              = 'test';

  db = createFakeDb();
  ledgerDb = createFakeLedgerDb();
  remediationDb = createFakeRemediationDb();
  const app = buildApp(db, remediationDb);
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.ROSTER_PW_ENC_KEY;
});

// -- /roster/verify returns role -----------------------------------------------

describe('POST /roster/verify -- role field', () => {
  it('returns role:"student" for a regular student', async () => {
    const s = await seedStudent(db, { username: 'verify_student', password: 'pw1234' });
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: s.username, password: s.password },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.role).toBe('student');
  });

  it('returns role:"teacher" for a teacher account', async () => {
    const t = await seedStudent(db, { username: 'verify_teacher', password: 'pw1234', role: 'teacher' });
    const { status, body } = await srv.request('POST', '/roster/verify', {
      body: { username: t.username, password: t.password },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.role).toBe('teacher');
  });

  it('sign-in still works even when getRoleByStudentId degrades (pre-migration)', async () => {
    // Use a db that simulates no role column.
    const preMigDb = createFakeDb({ roleMode: 'absent' });
    const app2 = createApp(preMigDb, null, fakeLoadManifest, fakeLoadAnswerKey);
    const srv2 = new TestServer(app2);
    await srv2.start();
    try {
      const s = await seedStudent(preMigDb, { username: 'pre_mig', password: 'pw1234' });
      const { status, body } = await srv2.request('POST', '/roster/verify', {
        body: { username: s.username, password: s.password },
      });
      // Sign-in must succeed; role degrades to 'student'.
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.role).toBe('student');
    } finally {
      await srv2.stop();
    }
  });
});

// -- POST /roster/enroll -- teacher auth ---------------------------------------

describe('POST /roster/enroll -- teacher auth', () => {
  const enrollBody = { realName: 'New Student', section: 'P1', password: 'pw1234' };

  it('x-teacher-secret authorizes enrollment', async () => {
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: enrollBody,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('verified teacher token authorizes enrollment', async () => {
    const t = await seedStudent(db, { username: 'teacher_tok', role: 'teacher' });
    const token = mintToken(t.studentId);
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { Authorization: `Bearer ${token}` },
      body: { realName: 'Token Student', section: 'P1', password: 'pw1234' },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('student token is rejected (401)', async () => {
    const s = await seedStudent(db, { username: 'student_tok', role: 'student' });
    const token = mintToken(s.studentId);
    const { status, body } = await srv.request('POST', '/roster/enroll', {
      headers: { Authorization: `Bearer ${token}` },
      body: enrollBody,
    });
    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  it('bogus token is rejected (401)', async () => {
    const { status } = await srv.request('POST', '/roster/enroll', {
      headers: { Authorization: 'Bearer garbage.token' },
      body: enrollBody,
    });
    expect(status).toBe(401);
  });

  it('no auth at all is rejected (401)', async () => {
    const { status } = await srv.request('POST', '/roster/enroll', {
      body: enrollBody,
    });
    expect(status).toBe(401);
  });
});

// -- GET /roster/list -- teacher auth -----------------------------------------

describe('GET /roster/list -- teacher auth', () => {
  it('x-teacher-secret authorizes listing', async () => {
    const { status } = await srv.request('GET', '/roster/list', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
  });

  it('verified teacher token authorizes listing', async () => {
    const t = await seedStudent(db, { username: 'list_teacher', role: 'teacher' });
    const token = mintToken(t.studentId);
    const { status, body } = await srv.request('GET', '/roster/list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('student token is rejected (401)', async () => {
    const s = await seedStudent(db, { username: 'list_student', role: 'student' });
    const token = mintToken(s.studentId);
    const { status } = await srv.request('GET', '/roster/list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(401);
  });

  it('bogus token is rejected (401)', async () => {
    const { status } = await srv.request('GET', '/roster/list', {
      headers: { Authorization: 'Bearer totally.bogus' },
    });
    expect(status).toBe(401);
  });

  it('token via ?token= query param also works for teacher', async () => {
    const t = await seedStudent(db, { username: 'list_teacher_q', role: 'teacher' });
    const token = mintToken(t.studentId);
    const { status } = await srv.request('GET', `/roster/list?token=${encodeURIComponent(token)}`);
    expect(status).toBe(200);
  });
});

// -- Pre-migration degrade: no role column -> token path non-teacher -----------

describe('pre-migration: role column absent', () => {
  it('x-teacher-secret still authorizes /roster/list when role column absent', async () => {
    const preMigDb = createFakeDb({ roleMode: 'absent' });
    const app2 = createApp(preMigDb, null, fakeLoadManifest, fakeLoadAnswerKey);
    const srv2 = new TestServer(app2);
    await srv2.start();
    try {
      const { status } = await srv2.request('GET', '/roster/list', {
        headers: { 'x-teacher-secret': teacherSecret },
      });
      expect(status).toBe(200);
    } finally {
      await srv2.stop();
    }
  });

  it('teacher token is rejected when role column absent (degrades to student)', async () => {
    const preMigDb = createFakeDb({ roleMode: 'absent' });
    const app2 = createApp(preMigDb, null, fakeLoadManifest, fakeLoadAnswerKey);
    const srv2 = new TestServer(app2);
    await srv2.start();
    try {
      // Even though the DB knows this is a teacher, the column is "absent".
      const t = await seedStudent(preMigDb, { username: 'premig_teacher', role: 'teacher' });
      const token = mintToken(t.studentId);
      const { status } = await srv2.request('GET', '/roster/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      // roleMode='absent' -> getRoleByStudentId always returns 'student' -> 401
      expect(status).toBe(401);
    } finally {
      await srv2.stop();
    }
  });
});

// -- Auth matrix helpers -------------------------------------------------------
//
// authMatrix(label, method, path, bodyFn?) asserts the 4 standard auth cases:
//   (a) x-teacher-secret -> authorized (2xx)
//   (b) teacher roster token -> authorized (2xx)
//   (c) student roster token -> 401
//   (d) no auth at all -> 401
//
// bodyFn(ctx) is optional; ctx = { teacherSecret, teacherToken, studentToken }.
// When the route cares about the body (POST), bodyFn supplies a minimal valid body.
// For GETs it is omitted. 2xx includes 200, 404 (wrong id but auth passed),
// 400 (bad body but auth passed) -- anything that is NOT 401 means auth passed.

function authMatrix(label, method, path, bodyFn) {
  describe(`${label} -- auth matrix`, () => {
    // Shared accounts created once per describe (via beforeEach from the outer scope).
    let teacherToken;
    let studentToken;

    beforeEach(async () => {
      const t = await seedStudent(db, { username: `mat_teacher_${Math.random().toString(36).slice(2)}`, role: 'teacher' });
      teacherToken = mintToken(t.studentId);
      const s = await seedStudent(db, { username: `mat_student_${Math.random().toString(36).slice(2)}`, role: 'student' });
      studentToken = mintToken(s.studentId);
    });

    function body(extra = {}) {
      if (!bodyFn) return undefined;
      return bodyFn({ teacherSecret, teacherToken, studentToken, ...extra });
    }

    it('(a) x-teacher-secret is authorized', async () => {
      const { status } = await srv.request(method, path, {
        headers: { 'x-teacher-secret': teacherSecret },
        body: body(),
      });
      expect(status).not.toBe(401);
    });

    it('(b) teacher roster token is authorized', async () => {
      const { status } = await srv.request(method, path, {
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: body(),
      });
      expect(status).not.toBe(401);
    });

    it('(c) student roster token is rejected (401)', async () => {
      const { status } = await srv.request(method, path, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: body(),
      });
      expect(status).toBe(401);
    });

    it('(d) no auth is rejected (401)', async () => {
      const { status } = await srv.request(method, path, {
        body: body(),
      });
      expect(status).toBe(401);
    });
  });
}

// -- Auth matrix: server.js routes (already individually tested above; pinned here for completeness) -

// /roster/enroll and /roster/list are covered by the suites above, but the
// matrix helper now gives us a uniform regression pin alongside the new routes.
authMatrix(
  'POST /roster/enroll',
  'POST',
  '/roster/enroll',
  () => ({ realName: 'Matrix Student', section: 'P1', password: 'pw1234' }),
);

authMatrix(
  'GET /roster/list',
  'GET',
  '/roster/list',
);

// -- Auth matrix: class.js routes ----------------------------------------------

authMatrix(
  'GET /class/grades',
  'GET',
  '/class/grades',
);

authMatrix(
  'GET /class/mastery',
  'GET',
  '/class/mastery',
);

// -- Auth matrix: remediation.js routes ---------------------------------------

// /remediation/propose needs a body with studentId/unit/skill.
// The studentId here is a placeholder UUID -- auth is checked before DB access.
authMatrix(
  'POST /remediation/propose',
  'POST',
  '/remediation/propose',
  () => ({ studentId: 'placeholder-uuid', unit: 'U3', skill: '3.A' }),
);

// /remediation/approve needs assignmentId. We use a non-existent id;
// the route returns 401 before hitting the DB when auth fails.
authMatrix(
  'POST /remediation/approve',
  'POST',
  '/remediation/approve',
  () => ({ assignmentId: 'placeholder-uuid' }),
);

// /remediation/waive is teacher-gated same as approve.
authMatrix(
  'POST /remediation/waive',
  'POST',
  '/remediation/waive',
  () => ({ assignmentId: 'placeholder-uuid' }),
);

// /remediation/list is teacher-gated GET.
authMatrix(
  'GET /remediation/list',
  'GET',
  '/remediation/list',
);

// /remediation/propose-from-mastery is teacher-gated; needs a section in body.
authMatrix(
  'POST /remediation/propose-from-mastery',
  'POST',
  '/remediation/propose-from-mastery',
  () => ({ section: 'P1' }),
);

// -- /remediation/complete -- dual-auth ----------------------------------------
//
// This endpoint is DIFFERENT from the others:
//   - A student self-token may complete THEIR OWN assignment (body.token).
//   - A teacher (x-teacher-secret OR teacher roster token) may complete any assignment.
//   - A student token completing ANOTHER student's assignment gets 403.
//   - No auth at all gets 401.
//
// Tests below set up a real assignment (status=assigned) owned by validStudentId.

describe('POST /remediation/complete -- dual-auth', () => {
  let validStudentId;
  let validStudentToken;
  let otherStudentId;
  let otherStudentToken;
  let teacherToken;

  // Helper: insert an assignment in 'assigned' status for a given owner.
  async function seedAssigned(ownerId) {
    const ins = await remediationDb.insertAssignment({
      studentId: ownerId,
      unit: 'U3',
      skill: '3.A',
      proposedBy: 'system',
    });
    const id = ins.data.assignment_id;
    await remediationDb.updateAssignmentStatus({
      assignmentId: id,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
    });
    return id;
  }

  beforeEach(async () => {
    const owner = await seedStudent(db, {
      username: `comp_owner_${Math.random().toString(36).slice(2)}`,
      role: 'student',
    });
    validStudentId = owner.studentId;
    validStudentToken = mintToken(validStudentId);

    const other = await seedStudent(db, {
      username: `comp_other_${Math.random().toString(36).slice(2)}`,
      role: 'student',
    });
    otherStudentId = other.studentId;
    otherStudentToken = mintToken(otherStudentId);

    const teacher = await seedStudent(db, {
      username: `comp_teacher_${Math.random().toString(36).slice(2)}`,
      role: 'teacher',
    });
    teacherToken = mintToken(teacher.studentId);
  });

  it('student self-token in body completes their own assignment (200)', async () => {
    const id = await seedAssigned(validStudentId);
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { token: validStudentToken, assignmentId: id },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('x-teacher-secret completes any assignment (200)', async () => {
    const id = await seedAssigned(validStudentId);
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      headers: { 'x-teacher-secret': teacherSecret },
      body: { assignmentId: id },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('teacher roster token completes any assignment (200)', async () => {
    const id = await seedAssigned(validStudentId);
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      body: { assignmentId: id },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('student token completing another student\'s assignment is rejected (403)', async () => {
    const id = await seedAssigned(validStudentId);
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { token: otherStudentToken, assignmentId: id },
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
  });

  it('no auth at all is rejected (401)', async () => {
    const id = await seedAssigned(validStudentId);
    const { status } = await srv.request('POST', '/remediation/complete', {
      body: { assignmentId: id },
    });
    expect(status).toBe(401);
  });
});
