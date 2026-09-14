// remediation.test.js — tests for the Phase 4b /remediation/* routes.
// Injects fake remediationDb + rosterDb + ledgerDb + answer-key / skill-map /
// bkt loaders. NO network. Uses Node's http + fetch (Node 18+) like the other
// roster-server suites.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

// ── Fakes ────────────────────────────────────────────────────────────────────

function makeTableMissingError() {
  return { code: '42P01', message: 'relation "remediation_assignment" does not exist' };
}

function createFakeRemediationDb({ tableMissing = false } = {}) {
  const store = new Map(); // assignmentId → row
  const state = { tableMissing };

  function maybeMissing() {
    return state.tableMissing ? { data: null, error: makeTableMissingError() } : null;
  }

  return {
    store,
    state, // tests can flip tableMissing mid-test

    async insertAssignment({ studentId, unit, skill, sourceAttempt, assignedRefs, proposedBy, unlocks, notes }) {
      const miss = maybeMissing(); if (miss) return miss;
      const id = `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = {
        assignment_id:    id,
        student_id:       studentId,
        unit:             unit,
        skill:            skill,
        source_attempt:   sourceAttempt ?? null,
        assigned_refs:    Array.isArray(assignedRefs) ? assignedRefs : [],
        status:           'proposed',
        proposed_by:      proposedBy || 'system',
        approved_by:      null,
        assigned_at:      null,
        completed_at:     null,
        completed_score:  null,
        recheck_item_id:  null,
        unlocks:          unlocks ?? null,
        notes:            notes ?? null,
        created_at:       new Date().toISOString(),
      };
      store.set(id, row);
      return { data: row, error: null };
    },

    async getAssignmentById(assignmentId) {
      const miss = maybeMissing(); if (miss) return miss;
      const row = store.get(assignmentId);
      if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: row, error: null };
    },

    async updateAssignmentStatus({ assignmentId, status, approvedBy, assignedAt, completedAt, completedScore, recheckItemId, notes }) {
      const miss = maybeMissing(); if (miss) return miss;
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

    async listAssignmentsForStudent(studentId, { status } = {}) {
      const miss = maybeMissing(); if (miss) return miss;
      const rows = [...store.values()].filter(r => r.student_id === studentId && (!status || r.status === status));
      rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { data: rows, error: null };
    },

    async listAssignmentsForSection({ section, status }) {
      const miss = maybeMissing(); if (miss) return miss;
      // The fake doesn't actually join to roster — sections are emulated via
      // the fakeRosterDb store; tests that filter by section seed both stores
      // so the row's nested roster.section matches the filter.
      let rows = [...store.values()];
      if (status) rows = rows.filter(r => r.status === status);
      if (section) {
        rows = rows.filter(r => {
          const meta = r.__rosterMeta; // tests stamp this on insert when seeding
          return meta && meta.section === section;
        });
      }
      // shape: emulate the real wrapper's nested roster shape so the route
      // can pass it through (the route doesn't introspect roster — it just
      // returns rows verbatim).
      const out = rows.map(r => ({ ...r, roster: r.__rosterMeta || null }));
      out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { data: out, error: null };
    },

    async findAssignment({ studentId, skill, statuses }) {
      const miss = maybeMissing(); if (miss) return miss;
      let rows = [...store.values()].filter(r => r.student_id === studentId && r.skill === skill);
      if (Array.isArray(statuses) && statuses.length) {
        rows = rows.filter(r => statuses.includes(r.status));
      }
      rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { data: rows, error: null };
    },
  };
}

function createFakeRosterDb(section = 'SUMMER26') {
  const rows = [];
  return {
    rows,
    async insertRoster() { return { data: null, error: { message: 'not used' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used' } }; },
    async listRoster(filterSection) {
      const out = filterSection ? rows.filter(r => r.section === filterSection) : rows;
      return { data: out, error: null };
    },
    seed(studentId, realName, username, sec = section) {
      rows.push({ student_id: studentId, real_name: realName, login_username: username, section: sec, created_at: new Date().toISOString() });
    },
  };
}

function createFakeLedgerDb() {
  const byStudent = new Map();
  return {
    byStudent,
    async insertLedgerRow() { return { data: null, error: { message: 'not used' } }; },
    async getLedgerByStudent(studentId) {
      return { data: byStudent.get(studentId) || [], error: null };
    },
    seed(studentId, rows) {
      byStudent.set(studentId, rows);
    },
  };
}

// Minimal answer-key + skill-map + bkt for propose-from-mastery tests.
// Shapes match what scoring.js's answerKeyMapOrNull / skillMapValidOrNull
// validate (per Phase 2/3 contracts):
//   answer-key doc: { answerKey: { '<itemId>': { answerKey: '<letter>' } } }
//   skill-map doc:  { '<itemId>': { skill: '<code>' } }   (flat map)
async function fakeLoadAnswerKey() {
  return {
    answerKey: {
      'CR-U3-Q1': { answerKey: 'A', unit: 3 },
      'CR-U3-Q2': { answerKey: 'B', unit: 3 },
    },
  };
}

async function fakeLoadSkillMap() {
  return {
    'CR-U3-Q1': { skill: '3.A' },
    'CR-U3-Q2': { skill: '3.A' },
  };
}

// Minimal BKT just sufficient for computeMastery to flag weak skills. mastery.js
// calls bkt.updateMastery(prior, correct) and reads bkt.DEFAULT_PARAMS.pInit.
// For tests we substitute a micro-engine that drops pKnow below θ=0.65 on
// consistent wrong answers so the FAKE student (Alice, 2 wrong on 3.A) gets
// flagged weak.
const fakeBkt = {
  DEFAULT_PARAMS: { pInit: 0.3, pLearn: 0.1, pSlip: 0.1, pGuess: 0.25 },
  updateMastery(prior, correct) {
    const p = typeof prior === 'number' ? prior : 0.3;
    if (correct) return Math.min(0.99, p + 0.25);
    return Math.max(0.01, p - 0.2);
  },
};

// ── Test server harness ──────────────────────────────────────────────────────

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
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

function makeSecret(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let rosterDb;
let ledgerDb;
let remediationDb;
let srv;
let teacherSecret;
let tokenSecret;
let validStudentId;
let validToken;
let otherStudentId;
let otherToken;

beforeEach(async () => {
  teacherSecret = makeSecret('teacher');
  tokenSecret = makeSecret('token');
  process.env.ROSTER_TEACHER_SECRET = teacherSecret;
  process.env.ROSTER_TOKEN_SECRET = tokenSecret;
  process.env.NODE_ENV = 'test';

  validStudentId = `uuid-student-${randomBytes(8).toString('hex')}`;
  validToken = signToken(validStudentId);
  otherStudentId = `uuid-other-${randomBytes(8).toString('hex')}`;
  otherToken = signToken(otherStudentId);

  rosterDb = createFakeRosterDb();
  rosterDb.seed(validStudentId, 'Alice', 'alice_aardvark', 'SUMMER26');
  rosterDb.seed(otherStudentId, 'Bob', 'bob_bear', 'SUMMER26');
  ledgerDb = createFakeLedgerDb();
  remediationDb = createFakeRemediationDb();

  const app = createApp(
    rosterDb,
    ledgerDb,
    null, // no loadManifest needed
    fakeLoadAnswerKey,
    fakeLoadSkillMap,
    fakeBkt,
    remediationDb
  );
  srv = new TestServer(app);
  await srv.start();
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
});

// ── POST /remediation/propose ────────────────────────────────────────────────

describe('POST /remediation/propose', () => {
  function propose(body, headers = {}) {
    return srv.request('POST', '/remediation/propose', {
      body: { studentId: validStudentId, unit: 'U3', skill: '3.A', ...body },
      headers: { 'x-teacher-secret': teacherSecret, ...headers },
    });
  }

  it('happy path: 200, returns assignmentId + status=proposed', async () => {
    const { status, body } = await propose({});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.assignmentId).toBe('string');
    expect(body.status).toBe('proposed');
    expect(body.assignment.skill).toBe('3.A');
    expect(body.assignment.unit).toBe('U3');
  });

  it('missing teacher secret → 401', async () => {
    const { status, body } = await propose({}, { 'x-teacher-secret': '' });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('wrong teacher secret → 401', async () => {
    const { status, body } = await propose({}, { 'x-teacher-secret': 'wrong' });
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('missing studentId → 400', async () => {
    const { status, body } = await propose({ studentId: undefined });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('missing skill → 400', async () => {
    const { status, body } = await propose({ skill: undefined });
    expect(status).toBe(400);
  });

  it('missing unit → 400', async () => {
    const { status, body } = await propose({ unit: undefined });
    expect(status).toBe(400);
  });

  it('assignedRefs array is stored as jsonb-shape array', async () => {
    const { body } = await propose({ assignedRefs: ['item-1', 'item-2'] });
    expect(Array.isArray(body.assignment.assigned_refs)).toBe(true);
    expect(body.assignment.assigned_refs).toEqual(['item-1', 'item-2']);
  });

  it('proposedBy defaults to "teacher" when not supplied', async () => {
    const { body } = await propose({});
    expect(body.assignment.proposed_by).toBe('teacher');
  });

  it('table-missing → 503 with clear reason', async () => {
    remediationDb.state.tableMissing = true;
    const { status, body } = await propose({});
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('remediation table not yet provisioned');
  });
});

// ── POST /remediation/approve ────────────────────────────────────────────────

describe('POST /remediation/approve', () => {
  async function seedProposed() {
    const ins = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A', proposedBy: 'system' });
    return ins.data.assignment_id;
  }

  it('happy path: proposed → assigned, sets assigned_at + approved_by', async () => {
    const id = await seedProposed();
    const { status, body } = await srv.request('POST', '/remediation/approve', {
      body: { assignmentId: id, approvedBy: 'teacher@school.edu' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('assigned');
    expect(typeof body.assignedAt).toBe('string');
    const row = remediationDb.store.get(id);
    expect(row.approved_by).toBe('teacher@school.edu');
  });

  it('missing teacher secret → 401', async () => {
    const id = await seedProposed();
    const { status } = await srv.request('POST', '/remediation/approve', { body: { assignmentId: id } });
    expect(status).toBe(401);
  });

  it('unknown assignmentId → 404', async () => {
    const { status, body } = await srv.request('POST', '/remediation/approve', {
      body: { assignmentId: 'no-such-id' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
  });

  it('approving an already-assigned row → 409', async () => {
    const id = await seedProposed();
    // First approve (success)
    await srv.request('POST', '/remediation/approve', {
      body: { assignmentId: id },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    // Second approve (conflict)
    const { status, body } = await srv.request('POST', '/remediation/approve', {
      body: { assignmentId: id },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('assigned');
  });

  it('missing assignmentId → 400', async () => {
    const { status } = await srv.request('POST', '/remediation/approve', {
      body: {},
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(400);
  });

  it('table-missing → 503', async () => {
    remediationDb.state.tableMissing = true;
    const { status, body } = await srv.request('POST', '/remediation/approve', {
      body: { assignmentId: 'x' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });
});

// ── POST /remediation/complete ───────────────────────────────────────────────

describe('POST /remediation/complete', () => {
  async function seedAssigned(studentId = validStudentId) {
    const ins = await remediationDb.insertAssignment({ studentId, unit: 'U3', skill: '3.A', proposedBy: 'system' });
    const id = ins.data.assignment_id;
    await remediationDb.updateAssignmentStatus({ assignmentId: id, status: 'assigned', assignedAt: new Date().toISOString() });
    return id;
  }

  it('happy path via student token: 200, status=completed, sets completed_at', async () => {
    const id = await seedAssigned();
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { token: validToken, assignmentId: id, completedScore: 90, recheckItemId: 'PC-U3-Q1' },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('completed');
    expect(typeof body.completedAt).toBe('string');
    const row = remediationDb.store.get(id);
    expect(row.completed_score).toBe(90);
    expect(row.recheck_item_id).toBe('PC-U3-Q1');
  });

  it('happy path via teacher secret: 200 even without a token', async () => {
    const id = await seedAssigned();
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { assignmentId: id },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('no token and no teacher secret → 401', async () => {
    const id = await seedAssigned();
    const { status } = await srv.request('POST', '/remediation/complete', {
      body: { assignmentId: id },
    });
    expect(status).toBe(401);
  });

  it('token for a DIFFERENT student → 403', async () => {
    const id = await seedAssigned(); // belongs to validStudentId
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { token: otherToken, assignmentId: id }, // attacker
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
  });

  it('row not in assigned status → 409', async () => {
    const ins = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    const id = ins.data.assignment_id; // still 'proposed'
    const { status } = await srv.request('POST', '/remediation/complete', {
      body: { token: validToken, assignmentId: id },
    });
    expect(status).toBe(409);
  });

  it('unknown assignmentId → 404', async () => {
    const { status } = await srv.request('POST', '/remediation/complete', {
      body: { token: validToken, assignmentId: 'no-such-id' },
    });
    expect(status).toBe(404);
  });

  it('missing assignmentId → 400', async () => {
    const { status } = await srv.request('POST', '/remediation/complete', {
      body: { token: validToken },
    });
    expect(status).toBe(400);
  });
});

// ── POST /remediation/waive ──────────────────────────────────────────────────

describe('POST /remediation/waive', () => {
  it('happy path: status=waived', async () => {
    const ins = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    const id = ins.data.assignment_id;
    const { status, body } = await srv.request('POST', '/remediation/waive', {
      body: { assignmentId: id, notes: 'covered by other work' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('waived');
    expect(remediationDb.store.get(id).notes).toBe('covered by other work');
  });

  it('missing teacher secret → 401', async () => {
    const { status } = await srv.request('POST', '/remediation/waive', { body: { assignmentId: 'x' } });
    expect(status).toBe(401);
  });

  it('unknown assignmentId → 404', async () => {
    const { status } = await srv.request('POST', '/remediation/waive', {
      body: { assignmentId: 'no-such-id' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(404);
  });
});

// ── GET /remediation/student ─────────────────────────────────────────────────

describe('GET /remediation/student', () => {
  it('happy path: returns only this student\'s rows', async () => {
    await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    await remediationDb.insertAssignment({ studentId: otherStudentId, unit: 'U3', skill: '3.B' });
    const { status, body } = await srv.request('GET', `/remediation/student?token=${encodeURIComponent(validToken)}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.assignments)).toBe(true);
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].student_id).toBe(validStudentId);
  });

  it('missing token → 401', async () => {
    const { status } = await srv.request('GET', '/remediation/student');
    expect(status).toBe(401);
  });

  it('garbage token → 401', async () => {
    const { status } = await srv.request('GET', '/remediation/student?token=not-a-real-token');
    expect(status).toBe(401);
  });

  it('table-missing → 503', async () => {
    remediationDb.state.tableMissing = true;
    const { status, body } = await srv.request('GET', `/remediation/student?token=${encodeURIComponent(validToken)}`);
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });
});

// ── GET /remediation/list ────────────────────────────────────────────────────

describe('GET /remediation/list', () => {
  it('happy path: teacher list across both students', async () => {
    await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    await remediationDb.insertAssignment({ studentId: otherStudentId, unit: 'U3', skill: '3.B' });
    const { status, body } = await srv.request('GET', '/remediation/list', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
    expect(body.assignments).toHaveLength(2);
  });

  it('section filter actually restricts the result set (Codex MAJOR-4)', async () => {
    // Seed two rows in different sections. The fake's listAssignmentsForSection
    // filters via row.__rosterMeta — stamp it post-insert to emulate the real
    // Supabase fk-inner-join filter applied to roster.section. This test
    // would have caught a regression where ?section= is silently ignored.
    const a = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    const b = await remediationDb.insertAssignment({ studentId: otherStudentId, unit: 'U3', skill: '3.B' });
    remediationDb.store.get(a.data.assignment_id).__rosterMeta = { real_name: 'Alice', login_username: 'alice_aardvark', section: 'SUMMER26' };
    remediationDb.store.get(b.data.assignment_id).__rosterMeta = { real_name: 'Bob', login_username: 'bob_bear', section: 'PERIOD-X' };

    const { body: insideSection } = await srv.request('GET', '/remediation/list?section=SUMMER26', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(insideSection.assignments).toHaveLength(1);
    expect(insideSection.assignments[0].assignment_id).toBe(a.data.assignment_id);
    expect(insideSection.assignments[0].roster.section).toBe('SUMMER26');

    const { body: otherSec } = await srv.request('GET', '/remediation/list?section=PERIOD-X', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(otherSec.assignments).toHaveLength(1);
    expect(otherSec.assignments[0].assignment_id).toBe(b.data.assignment_id);
  });

  it('status filter applies', async () => {
    const a = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    await remediationDb.updateAssignmentStatus({ assignmentId: a.data.assignment_id, status: 'assigned' });
    await remediationDb.insertAssignment({ studentId: otherStudentId, unit: 'U3', skill: '3.B' }); // stays 'proposed'

    const { body } = await srv.request('GET', '/remediation/list?status=assigned', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].status).toBe('assigned');
  });

  it('missing teacher secret → 401', async () => {
    const { status } = await srv.request('GET', '/remediation/list');
    expect(status).toBe(401);
  });
});

// ── GET /remediation/unlocks ─────────────────────────────────────────────────

describe('GET /remediation/unlocks', () => {
  it('no pending assigned rows → unlocked:true, empty pending', async () => {
    const { status, body } = await srv.request('GET', `/remediation/unlocks?token=${encodeURIComponent(validToken)}&skill=3.A`);
    expect(status).toBe(200);
    expect(body.unlocked).toBe(true);
    expect(body.pending).toEqual([]);
  });

  it('one assigned row pending → unlocked:false, pending lists it', async () => {
    const ins = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    await remediationDb.updateAssignmentStatus({ assignmentId: ins.data.assignment_id, status: 'assigned' });
    const { body } = await srv.request('GET', `/remediation/unlocks?token=${encodeURIComponent(validToken)}&skill=3.A`);
    expect(body.unlocked).toBe(false);
    expect(body.pending).toContain(ins.data.assignment_id);
  });

  it('completed assigned rows do NOT block → unlocked:true', async () => {
    const ins = await remediationDb.insertAssignment({ studentId: validStudentId, unit: 'U3', skill: '3.A' });
    await remediationDb.updateAssignmentStatus({ assignmentId: ins.data.assignment_id, status: 'assigned' });
    await remediationDb.updateAssignmentStatus({ assignmentId: ins.data.assignment_id, status: 'completed' });
    const { body } = await srv.request('GET', `/remediation/unlocks?token=${encodeURIComponent(validToken)}&skill=3.A`);
    expect(body.unlocked).toBe(true);
  });

  it('missing skill → 400', async () => {
    const { status } = await srv.request('GET', `/remediation/unlocks?token=${encodeURIComponent(validToken)}`);
    expect(status).toBe(400);
  });

  it('missing token → 401', async () => {
    const { status } = await srv.request('GET', '/remediation/unlocks?skill=3.A');
    expect(status).toBe(401);
  });
});

// ── POST /remediation/propose-from-mastery ───────────────────────────────────

describe('POST /remediation/propose-from-mastery', () => {
  beforeEach(() => {
    // Seed Alice's ledger with two wrong answers on skill 3.A → her pKnow
    // drops below θ → weak skill.
    ledgerDb.seed(validStudentId, [
      { source: 'curriculum_quiz', item_id: 'CR-U3-Q1', response: 'B', skill: '3.A', recorded_at: '2026-05-10T10:00:00Z', attempt: 1 },
      { source: 'curriculum_quiz', item_id: 'CR-U3-Q2', response: 'A', skill: '3.A', recorded_at: '2026-05-10T10:01:00Z', attempt: 1 },
    ]);
  });

  it('happy path: proposes one remediation for Alice\'s weak 3.A skill', async () => {
    const { status, body } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.proposed)).toBe(true);
    expect(body.proposed.length).toBeGreaterThan(0);
    const aliceRow = body.proposed.find(r => r.studentId === validStudentId && r.skill === '3.A');
    expect(aliceRow).toBeDefined();
    expect(typeof aliceRow.assignmentId).toBe('string');
  });

  it('idempotent: second call skips already-proposed pairs', async () => {
    await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    const { body } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(body.proposed).toEqual([]);
    expect(body.skipped.length).toBeGreaterThan(0);
    expect(body.skipped[0].existingStatus).toBe('proposed');
  });

  it('dryRun: returns the would-be inserts without writing', async () => {
    const sizeBefore = remediationDb.store.size;
    const { body } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26', dryRun: true },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(body.dryRun).toBe(true);
    expect(remediationDb.store.size).toBe(sizeBefore);
    expect(body.proposed.length).toBeGreaterThan(0);
  });

  it('missing teacher secret → 401', async () => {
    const { status } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
    });
    expect(status).toBe(401);
  });

  it('missing section → 400', async () => {
    const { status } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: {},
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(400);
  });

  it('unit guess derives from skill code (3.A → U3)', async () => {
    await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    // The fake remediationDb store should now hold a row with unit='U3'.
    const rows = [...remediationDb.store.values()].filter(r => r.skill === '3.A' && r.student_id === validStudentId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].unit).toBe('U3');
  });
});

// ── Table-missing degrade coverage (Codex MAJOR-3) ──────────────────────────
// Codex flagged that only 3/8 endpoints had explicit 42P01 → 503 tests; we
// now pin the contract on EVERY endpoint so a regression in respondTableMissing
// can't slip through unnoticed.

describe('table-missing 42P01 → 503 coverage (every endpoint)', () => {
  beforeEach(() => {
    remediationDb.state.tableMissing = true;
  });

  it('POST /remediation/complete → 503', async () => {
    const { status, body } = await srv.request('POST', '/remediation/complete', {
      body: { token: validToken, assignmentId: 'x' },
    });
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });

  it('POST /remediation/waive → 503', async () => {
    const { status, body } = await srv.request('POST', '/remediation/waive', {
      body: { assignmentId: 'x' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });

  it('GET /remediation/list → 503', async () => {
    const { status, body } = await srv.request('GET', '/remediation/list', {
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });

  it('GET /remediation/unlocks → 503', async () => {
    const { status, body } = await srv.request('GET', `/remediation/unlocks?token=${encodeURIComponent(validToken)}&skill=3.A`);
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });

  it('POST /remediation/propose-from-mastery → 503 (table-missing on findAssignment OR insert)', async () => {
    // Seed Alice's ledger so computeMastery would flag 3.A weak — the route
    // proceeds into findAssignment / insertAssignment, which then return 42P01.
    ledgerDb.seed(validStudentId, [
      { source: 'curriculum_quiz', item_id: 'CR-U3-Q1', response: 'B', skill: '3.A', recorded_at: '2026-05-10T10:00:00Z', attempt: 1 },
      { source: 'curriculum_quiz', item_id: 'CR-U3-Q2', response: 'A', skill: '3.A', recorded_at: '2026-05-10T10:01:00Z', attempt: 1 },
    ]);
    const { status, body } = await srv.request('POST', '/remediation/propose-from-mastery', {
      body: { section: 'SUMMER26' },
      headers: { 'x-teacher-secret': teacherSecret },
    });
    expect(status).toBe(503);
    expect(body.error).toContain('remediation table not yet provisioned');
  });
});

// ── No-regression guard: existing endpoints still work alongside Phase 4b ───

describe('Phase 4b mount is additive: prior routes survive', () => {
  it('GET /health still returns ok', async () => {
    const { status, body } = await srv.request('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('roster');
  });
});
