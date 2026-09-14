// grade.test.js — tests for GET /grade (Gradebook Phase 3).
// Fake in-memory ledgerDb + inline fixture answer-key. NO network/Supabase.
// Mirrors rollup.test.js's harness.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { PHASE3_CONFIG, pcRawToP, quarterOfUnit, unitNumber } from '../grade-config.js';

// ── Fixture answer key (build-answer-key.mjs output shape) ────────────────────
const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    // cr-quiz (feeder Q)
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1', topic: '1.1' },
    'U2-L1-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2', topic: '2.1' },
    // PC (feeder P) — answer-key.json carries 347 such *-PC-* MCQ keys
    'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
    'U1-PC-MCQ-A-Q02': { answerKey: 'D', type: 'multiple-choice', unit: '1' },
    'U2-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '2' },
    'U1-PC-FRQ-Q01':   { answerKey: null, type: 'free-response', unit: '1' }, // ungradable
  },
};

function createFakeRosterDb() {
  return {
    async insertRoster() { return { data: null, error: { message: 'unused' } }; },
    async findByUsername() { return { data: null, error: { message: 'unused' } }; },
  };
}

function createFakeLedgerDb(rows, { error = null } = {}) {
  const store = [...rows];
  return {
    _store: store,
    async getLedgerByStudent(studentId) {
      if (error) return error === 'throw' ? Promise.reject(new Error('boom')) : { data: null, error };
      return { data: store.filter(r => r.student_id === studentId), error: null };
    },
    async insertLedgerRow() { store.push({ _written: true }); return { data: {}, error: null }; },
  };
}

function makeRow(itemId, response, { source = 'curriculum_quiz', unit, score, attempt = 1, recorded_at } = {}) {
  return {
    student_id: 'PLACEHOLDER',
    source, item_id: itemId, response, unit,
    score: score === undefined ? null : score,
    attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;

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
    return { status: res.status, body: await res.json() };
  }
}

async function startServer(rows = [], { loadAnswerKey = okAnswerKey, ledgerOpts = {} } = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-grade-${randomBytes(8).toString('hex')}`;
  const token = signToken(studentId);
  const ledgerDb = createFakeLedgerDb(rows.map(r => ({ ...r, student_id: studentId })), ledgerOpts);
  // These tests exercise the PC-mastery feeder, so enable the (production-OFF) PC
  // track explicitly — configOverrides merges onto the resolved grade config.
  const app = createApp(
    createFakeRosterDb(), ledgerDb, fakeLoadManifest, loadAnswerKey,
    undefined, undefined, undefined, undefined, { pcTrack: { enabled: true } },
  );
  const server = new TestServer(app);
  await server.start();
  return { server, studentId, token, ledgerDb };
}

let srv;
afterEach(async () => { if (srv) { await srv.stop(); srv = null; } delete process.env.ROSTER_TOKEN_SECRET; });

// ── grade-config pure math ────────────────────────────────────────────────────
describe('grade-config — frozen knobs + curves', () => {
  it('C=85 flat, weights 1:2, FRQ band 100/70/35, θ=0.65', () => {
    expect(PHASE3_CONFIG.C).toBe(85);
    expect(PHASE3_CONFIG.feederWeights).toEqual({ W: 1, Q: 2 });
    expect(PHASE3_CONFIG.frqBand).toEqual({ E: 100, P: 70, I: 35 });
    expect(PHASE3_CONFIG.diagnosticTheta).toBe(0.65);
  });

  it('quarter bands Q1=U1-2-3 Q2=U4-5 Q3=U6-7 Q4=U8-9 (Phase 6 update)', () => {
    // Q1 now includes U3 (moved from Q2).
    expect(quarterOfUnit(1)).toBe('Q1');
    expect(quarterOfUnit(2)).toBe('Q1');
    expect(quarterOfUnit(3)).toBe('Q1');
    // Q2 is now U4-5.
    expect(quarterOfUnit(4)).toBe('Q2');
    expect(quarterOfUnit(5)).toBe('Q2');
    expect(quarterOfUnit(6)).toBe('Q3');
    expect(quarterOfUnit(7)).toBe('Q3');
    expect(quarterOfUnit(8)).toBe('Q4');
    expect(quarterOfUnit(9)).toBe('Q4');
    expect(quarterOfUnit(99)).toBe(null);
  });

  

  it('unitNumber parses U-prefixed / bare / numeric', () => {
    expect(unitNumber('U4')).toBe(4);
    expect(unitNumber('4')).toBe(4);
    expect(unitNumber(7)).toBe(7);
    expect(unitNumber('garbage')).toBe(null);
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('GET /grade — auth', () => {
  it('401 without a token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status, body } = await srv.get('/grade');
    expect(status).toBe(401); expect(body.ok).toBe(false);
  });
  it('401 with an invalid token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status } = await srv.get('/grade?token=garbage');
    expect(status).toBe(401);
  });
});

// ── The grade model ───────────────────────────────────────────────────────────
describe('GET /grade — model math', () => {
  

  it('grinder: B=100, no PC → banked capped 85, unitGrade 85 (spec §2)', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'B'),                                   // Q=100
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 1 }), // W=100
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.B).toBe(100);
    expect(body.units.U1.banked).toBe(85);       // completion caps
    expect(body.units.U1.unitGrade).toBe(85);
  });

  

  

  it('missing-feeder reweighting: W-only → B=W; neither → ungraded (not 0)', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 1 }),  // W only
      makeRow('WS-U1L1-x',  'typed', { source: 'worksheet', unit: 'U1' }),   // no score → completion-only
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.W).toBe(100);
    expect(body.units.U1.Q).toBe(null);
    expect(body.units.U1.B).toBe(100);                    // W-only, renormalized
    expect(body.units.U1.banked).toBe(85);
    // worksheet fill-in is completion-only, NOT in W
    expect(body.completion.U1.worksheet).toBe(1);
    expect(body.completion.U1.frq).toBe(1);
  });

  it('quarter grade = mean of GRADED unit grades in the band (ungraded excluded)', async () => {
    const rows = [
      // U1 graded → unitGrade 85 (B=100→banked 85, no PC)
      makeRow('U1-L1-Q01', 'B'),
      // U2, U3 have zero evidence → ungraded → excluded from Q1 mean
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.unitGrade).toBe(85);
    expect(body.units.U2).toBeUndefined();
    // Q1 now covers [1, 2, 3] per Phase 6 band update.
    expect(body.quarters.Q1.units).toEqual([1, 2, 3]);
    expect(body.quarters.Q1.unitGrades).toEqual({ U1: 85, U2: null, U3: null });
    // No lesson schedule injected → falls back to old unit-mean logic.
    // Unit-mean: only U1 graded → quarterGrade = 85 (only-graded-units mean).
    expect(body.quarters.Q1.quarterGrade).toBe(85);       // mean([85]) — not (85+0)/3
    expect(body.quarters.Q2.quarterGrade).toBe(null);     // no graded units
  });

  // ── Quarter ceiling projection ───────────────────────────────────────────
  // The motivational "if you ace remaining units" projection. Null when
  // there's nothing to project from (no graded yet) or no room to grow
  // (every unit in the band already graded).

  it('quarter ceiling: 1 of 3 units graded at 85 → null without schedule (Codex MAJOR 2 fold 2026-05-20)', async () => {
    // No lesson schedule injected → lesson-level fallback can't compute the
    // ceiling because the total-lesson denominator isn't knowable without a
    // schedule. The motivational ceiling lives in the WITH-schedule path.
    const rows = [
      makeRow('U1-L1-Q01', 'B'),   // U1 Q=100
      makeRow('WS-U1L1-b1', 'x'),  // U1 W=100; combined → U1 unitGrade ≤ 85 (C cap)
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.unitGrade).toBe(85);
    expect(body.quarters.Q1.unitsGraded).toBe(1);
    expect(body.quarters.Q1.unitsTotal).toBe(3);
    // Without schedule, ceiling is null (no denominator).
    expect(body.quarters.Q1.ceiling).toBe(null);
    // But quarterGrade still works — lesson "1.1" + "1.1" (synthetic) at 85.
    expect(body.quarters.Q1.quarterGrade).toBe(85);
  });

  it('quarter ceiling: 0 units graded → ceiling null (nothing to project from)', async () => {
    const ctx = await startServer([]); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.quarters.Q1.unitsGraded).toBe(0);
    expect(body.quarters.Q1.unitsTotal).toBe(3);
    expect(body.quarters.Q1.ceiling).toBe(null);
  });

  it('quarter ceiling: every unit in band graded → ceiling null (no room to grow)', async () => {
    // Q3's band is [U6, U7]. Grade both via an extended answer-key fixture.
    const extendedKey = async () => ({
      generatedFrom: 'test',
      answerKey: {
        ...FIXTURE_ANSWER_KEY.answerKey,
        'U6-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '6' },
        'U7-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '7' },
      },
    });
    const rows = [
      makeRow('U6-L1-Q01', 'B'),
      makeRow('U7-L1-Q01', 'B'),
    ];
    const ctx = await startServer(rows, { loadAnswerKey: extendedKey });
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.quarters.Q3.unitsGraded).toBe(2);
    expect(body.quarters.Q3.unitsTotal).toBe(2);
    expect(body.quarters.Q3.ceiling).toBe(null);
  });

  it('Q1 band size 3 with U3 graded — quarterGrade=85; ceiling null without schedule (U3 moved to Q1)', async () => {
    // Q1 now covers [U1, U2, U3]. Grade U3 only. Without schedule, ceiling
    // can't be computed (no lesson denominator) but quarterGrade still works
    // off the lesson-level fallback.
    const extendedKey = async () => ({
      generatedFrom: 'test',
      answerKey: {
        ...FIXTURE_ANSWER_KEY.answerKey,
        'U3-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '3' },
      },
    });
    const rows = [
      makeRow('U3-L1-Q01', 'B'),
      makeRow('WS-U3L1-b1', 'x'),
    ];
    const ctx = await startServer(rows, { loadAnswerKey: extendedKey });
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U3.unitGrade).toBe(85);
    expect(body.quarters.Q1.unitsGraded).toBe(1);
    expect(body.quarters.Q1.unitsTotal).toBe(3);
    expect(body.quarters.Q1.quarterGrade).toBe(85);
    // No-schedule fallback: ceiling is null.
    expect(body.quarters.Q1.ceiling).toBe(null);
    // Q2 is now [U4, U5] with 0 graded.
    expect(body.quarters.Q2.unitsTotal).toBe(2);
    expect(body.quarters.Q2.unitsGraded).toBe(0);
  });

  it('null/ungraded FRQ score is excluded from W (NOT scored as I), still completion', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'graded',   { source: 'frq', unit: 'U1', score: 1 }),    // E → 100
      makeRow('WS-U1L1-r2', 'ungraded', { source: 'frq', unit: 'U1', score: null }), // excluded, NOT 35
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.W).toBe(100);            // only the graded one — not (100+35)/2
    expect(body.completion.U1.frq).toBe(2);       // both count toward completion
  });

  it('latest attempt wins (attempt 2 supersedes attempt 1)', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'X', { attempt: 1 }),  // wrong
      makeRow('U1-L1-Q01', 'B', { attempt: 2 }),  // right → wins → Q=100
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units.U1.Q).toBe(100);
  });

  it('empty ledger → empty units, all quarters null', async () => {
    const ctx = await startServer([]); srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.units).toEqual({});
    expect(body.quarters.Q1.quarterGrade).toBe(null);
    expect(body.config.C).toBe(85);
  });

  it('malformed rows tolerated (no throw / no 500)', async () => {
    const rows = [
      { student_id: 'x', source: 'curriculum_quiz' },        // no item_id
      makeRow('U1-L1-Q01', null),                            // null resp → wrong
      makeRow('WS-U1L1-r1', 'a', { source: 'frq', unit: 'U1', score: 'notanumber' }), // bad score → excluded
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(200);
  });
});

// ── Robustness ────────────────────────────────────────────────────────────────
describe('GET /grade — robustness', () => {
  it('ledger db error → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: { message: 'db down' } } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('ledger db throw → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: 'throw' } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('answer-key load failure → 500', async () => {
    const ctx = await startServer([], { loadAnswerKey: async () => { throw new Error('no key'); } });
    srv = ctx.server;
    const { status } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(500);
  });
  it('answer-key wrong shape → 500 (top-level AND corrupt per-entry, fail closed)', async () => {
    const bads = [
      null, {}, { answerKey: 'oops' }, { answerKey: ['a'] },
      { answerKey: { 'U1-L1-Q01': 42 } },                    // corrupt entry
      { answerKey: { 'U1-L1-Q01': { answerKey: { x: 1 } } } }, // answerKey not scalar|null
    ];
    for (const bad of bads) {
      const ctx = await startServer([makeRow('U1-L1-Q01', 'B')], { loadAnswerKey: async () => bad });
      srv = ctx.server;
      const { status } = await srv.get(`/grade?token=${ctx.token}`);
      expect(status).toBe(500);
      await srv.stop(); srv = null;
    }
  });
  it('read-only: /grade never writes to the ledger store', async () => {
    const rows = [makeRow('U1-L1-Q01', 'B')];
    const ctx = await startServer(rows); srv = ctx.server;
    const before = ctx.ledgerDb._store.length;
    await srv.get(`/grade?token=${ctx.token}`);
    expect(ctx.ledgerDb._store.length).toBe(before);
    expect(ctx.ledgerDb._store.some(r => r._written)).toBe(false);
  });
});

// ── Phase 6: lessons[] field + lesson-weighted quarter grade ──────────────────
// These tests inject a minimal lesson schedule so computeGrade uses the
// date-driven path. No schedule = fall-back to unit-mean (already tested above).

// Minimal fixture schedule: 2 lessons in U1, both with null dates (always-due
// when section is unknown AND no period dates → treated as not-due for now).
// For date-filter tests we use explicit dates.
const FIXTURE_SCHEDULE_PAST = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2020-01-01', E: '2020-01-01' } },
};

const FIXTURE_SCHEDULE_FUTURE = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2099-01-01', E: '2099-01-01' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
};

const FIXTURE_SCHEDULE_MIXED = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
};

async function startServerWithSchedule(rows = [], schedule = null, opts = {}) {
  const { loadAnswerKey = okAnswerKey, configOverrides = { gradingWindowStart: null } } = opts;
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-grade-p6-${randomBytes(8).toString('hex')}`;
  const token = signToken(studentId);
  const ledgerDb = createFakeLedgerDb(rows.map(r => ({ ...r, student_id: studentId })));
  // 2026-05-20: default configOverrides nulls out gradingWindowStart so the
  // test fixtures with 2020/2099 dates exercise the pure date filter without
  // also hitting the cohort-window filter. Tests that explicitly want to
  // exercise the window filter can override.
  const app = createApp(
    createFakeRosterDb(),
    ledgerDb,
    fakeLoadManifest,
    loadAnswerKey,
    undefined,
    undefined,
    undefined,
    schedule,    // Phase 6: lessonSchedule
    configOverrides
  );
  const server = new TestServer(app);
  await server.start();
  return { server, studentId, token, ledgerDb };
}

describe('GET /grade — Phase 6 lessons[] field', () => {
  it('response includes lessons[] array (present even when empty)', async () => {
    const ctx = await startServerWithSchedule([], FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { status, body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(200);
    expect(Array.isArray(body.lessons)).toBe(true);
  });

  it('lessons[] entries include lessonKey, unit, worksheetKey, due, lessonGrade, W, Q, items', async () => {
    const ctx = await startServerWithSchedule([], FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const l = body.lessons[0];
    expect(l).toHaveProperty('lessonKey');
    expect(l).toHaveProperty('unit');
    expect(l).toHaveProperty('worksheetKey');
    expect(l).toHaveProperty('due');
    expect(l).toHaveProperty('lessonGrade');
    expect(l).toHaveProperty('W');
    expect(l).toHaveProperty('Q');
    expect(l).toHaveProperty('items');
    expect(l.items).toHaveProperty('frq');
    expect(l.items).toHaveProperty('quiz');
    expect(l.items).toHaveProperty('worksheet');
  });

  it('FRQ item in 1.1 → lessonGrade for 1.1 is 35 (I score)', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'weak', { source: 'frq', unit: 'U1', score: 0 }),
    ];
    const ctx = await startServerWithSchedule(rows, FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const l11 = body.lessons.find(l => l.lessonKey === '1.1');
    expect(l11).toBeDefined();
    expect(l11.lessonGrade).toBe(35);
    expect(l11.W).toBe(35);
    expect(l11.Q).toBe(null);
  });

  
});

describe('GET /grade — Phase 6 lesson-weighted quarterGrade', () => {
  it('quarter new fields present: lessonsDue, lessonsGraded, lessonsTotal', async () => {
    const ctx = await startServerWithSchedule([], FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1).toHaveProperty('lessonsDue');
    expect(q1).toHaveProperty('lessonsGraded');
    expect(q1).toHaveProperty('lessonsTotal');
  });

  it('all lessons due, none graded → quarterGrade = 0 (0/due count), ceiling non-null', async () => {
    // Both lessons are in the past (due), but no scored data → rawQuarter = 0/2 = 0.
    const ctx = await startServerWithSchedule([], FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1.lessonsDue).toBe(2);
    expect(q1.lessonsGraded).toBe(0);
    // rawQuarter=0, banked=0, P_quarter=0 → quarterGrade = max(0,0) = 0.
    expect(q1.quarterGrade).toBe(0);
    // ceiling: remaining=0, unattempted=2, best=(0+2*100)/2=100.
    expect(q1.ceiling).toBe(100);
  });

  it('all lessons future → quarterGrade null, lessonsDue=0', async () => {
    const ctx = await startServerWithSchedule([], FIXTURE_SCHEDULE_FUTURE);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1.lessonsDue).toBe(0);
    expect(q1.quarterGrade).toBe(null);
    expect(q1.ceiling).toBe(null);
  });

  it('1 due+graded at 35, 1 due+ungraded → quarterGrade = 35/2 = 17.5', async () => {
    // 1.1 is past, 1.2 is past; only 1.1 has a graded FRQ.
    const rows = [
      makeRow('WS-U1L1-r1', 'weak', { source: 'frq', unit: 'U1', score: 0 }), // 1.1 → 35
    ];
    const ctx = await startServerWithSchedule(rows, FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1.lessonsDue).toBe(2);
    expect(q1.lessonsGraded).toBe(1);
    // rawQuarter = 35/2 = 17.5; banked = min(17.5, 85) = 17.5.
    expect(q1.quarterGrade).toBe(17.5);
  });

  it('1 due+graded at 35, 1 future → quarterGrade = 35/1 = 35', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'weak', { source: 'frq', unit: 'U1', score: 0 }), // 1.1 → 35
    ];
    const ctx = await startServerWithSchedule(rows, FIXTURE_SCHEDULE_MIXED);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1.lessonsDue).toBe(1);
    expect(q1.lessonsGraded).toBe(1);
    // rawQuarter = 35/1 = 35; ceiling = (35 + 1*100)/2 = 67.5.
    expect(q1.quarterGrade).toBe(35);
    expect(q1.ceiling).toBe(67.5);
  });

  it('all due graded at 100 → banked at 85 (C cap still applies)', async () => {
    // Both lessons past; grade them both at E (100).
    const rows = [
      makeRow('WS-U1L1-r1', 'e', { source: 'frq', unit: 'U1', score: 1 }), // 1.1 → 100
      makeRow('WS-U1L2-r1', 'e', { source: 'frq', unit: 'U1', score: 1 }), // 1.2 → 100
    ];
    const ctx = await startServerWithSchedule(rows, FIXTURE_SCHEDULE_PAST);
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    const q1 = body.quarters.Q1;
    expect(q1.lessonsDue).toBe(2);
    expect(q1.lessonsGraded).toBe(2);
    // rawQuarter=100, banked=85, P=0 → quarterGrade=85.
    expect(q1.quarterGrade).toBe(85);
    // Ceiling is null: remaining=0, unattempted=0.
    expect(q1.ceiling).toBe(null);
  });

  // ── gradingWindowStart filter (2026-05-20 hotfix) ──────────────────────────
  // Lessons whose dates are ENTIRELY before the window start are excluded
  // from the band — those are stale prior-year entries from a finished
  // cohort. Lessons with null dates OR with at least one period date >=
  // window start stay in the band.

  it('gradingWindowStart filter: lessons with BOTH dates before window are excluded from band', async () => {
    // FIXTURE_SCHEDULE_PAST = 2020-01-01 dates (5+ years before any plausible
    // window start). With window start at 2026-09-01, both lessons drop out.
    const rows = [makeRow('U1-L1-Q01', 'B')];
    const ctx = await startServerWithSchedule(rows, FIXTURE_SCHEDULE_PAST, {
      configOverrides: { gradingWindowStart: '2026-09-01' },
    });
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    // Both fixture lessons (2020-01-01) excluded → empty band.
    expect(body.quarters.Q1.lessonsTotal).toBe(0);
    expect(body.quarters.Q1.lessonsDue).toBe(0);
    expect(body.quarters.Q1.quarterGrade).toBe(null);
    expect(body.quarters.Q1.ceiling).toBe(null);
    // And the lessons[] array also excludes them.
    expect(body.lessons.length).toBe(0);
  });

  it('gradingWindowStart filter: lessons with null dates STAY in the band', async () => {
    // U1-L1, U1-L2 with null dates → in band (not yet scheduled for this
    // cohort, but still counted toward the band total).
    const NULL_SCHEDULE = {
      '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: null, E: null } },
      '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: null, E: null } },
    };
    const ctx = await startServerWithSchedule([], NULL_SCHEDULE, {
      configOverrides: { gradingWindowStart: '2026-09-01' },
    });
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.quarters.Q1.lessonsTotal).toBe(2);
    expect(body.quarters.Q1.lessonsDue).toBe(0);   // null dates = not yet due
    expect(body.quarters.Q1.quarterGrade).toBe(null);
    // Lessons[] includes the entries (with null due dates).
    expect(body.lessons.length).toBe(2);
  });

  it('gradingWindowStart filter: lessons with ONE in-window date STAY in the band', async () => {
    // Edge case: B is stale (2020), E is fresh (2027). Lesson must remain
    // because at least one period covers the new cohort.
    const MIXED = {
      '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2027-09-15' } },
    };
    const ctx = await startServerWithSchedule([], MIXED, {
      configOverrides: { gradingWindowStart: '2026-09-01' },
    });
    srv = ctx.server;
    const { body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(body.quarters.Q1.lessonsTotal).toBe(1);
    expect(body.lessons.length).toBe(1);
  });

  it('no lesson schedule → graceful degrade to lesson-level math without date filter (no crash, Codex MAJOR 2 fold 2026-05-20)', async () => {
    // null schedule still uses LESSON-LEVEL aggregation — just without the
    // date filter and without zero-fill for missing lessons. The frozen
    // contract said missing schedule disables ONLY the date filter, not the
    // entire lesson-weighted shape.
    const rows = [makeRow('U1-L1-Q01', 'B')];
    const ctx = await startServerWithSchedule(rows, null);
    srv = ctx.server;
    const { status, body } = await srv.get(`/grade?token=${ctx.token}`);
    expect(status).toBe(200);
    // 1 quiz correct → lesson "1.1" lessonGrade=100 (Q only, W:Q renormalized).
    // raw_quarter = 100/1 = 100. banked = min(100, 85) = 85.
    expect(body.quarters.Q1.quarterGrade).toBe(85);
    // With null schedule, lessons[] is empty (no schedule to enumerate from)
    // and lessonsDue/lessonsTotal are null (not knowable without a schedule).
    expect(Array.isArray(body.lessons)).toBe(true);
    expect(body.lessons.length).toBe(0);
    expect(body.quarters.Q1.lessonsTotal).toBe(null);
    expect(body.quarters.Q1.lessonsDue).toBe(null);
  });
});
