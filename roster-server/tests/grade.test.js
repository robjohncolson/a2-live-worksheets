// grade.test.js — tests for GET /grade (Gradebook Phase 3).
// Fake in-memory ledgerDb + inline fixture answer-key. NO network/Supabase.
// Mirrors rollup.test.js's harness.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG, quarterOfUnit, unitNumber } from '../grade-config.js';

// ── Fixture answer key (build-answer-key.mjs output shape) ────────────────────
const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'inline-a2',
  answerKey: { 'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.1' } },
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
  const app = createApp(
    createFakeRosterDb(), ledgerDb, fakeLoadManifest, loadAnswerKey,
    undefined, undefined, undefined, {},
    { useDistrictFormula: true, useV3: false, bonusOnlyThrough: null },
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

  it('quarterOfUnit follows an explicit topic configuration', () => {
    const config = { quarters: { Q1: { units: [1] }, Q2: { units: [2] } } };
    expect(quarterOfUnit(1, config)).toBe('Q1');
    expect(quarterOfUnit(2, config)).toBe('Q2');
    expect(quarterOfUnit(3, config)).toBeNull();
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


const A2_CONFIG = {
  ...PHASE3_CONFIG, useDistrictFormula: true, useV3: false,
  bonusOnlyThrough: null, dueAfterLessonDay: true,
  quarters: { Q1: { units: [1], start: '2026-09-02', end: '2026-11-06' } },
};
const A2_SCHEDULE = { '1.1': {
  unit: 1, topicKey: '1.1', worksheetKey: '1', tryItCount: 1,
  periods: { C: '2026-09-24', D: '2026-09-25', G: '2026-09-25' },
} };
const A2_ASSESSMENT = { itemId: 'TA-U1', source: 'topic-assessment', dueDate: '2026-09-25' };
const A2_OPTS = { lessonSchedule: A2_SCHEDULE, section: 'PeriodC',
  asOf: '2026-09-28T16:00:00Z', items: [A2_ASSESSMENT] };
const a2Rows = (mastery, check, work, deck = 10) => [
  { item_id: 'TA-U1', source: 'topic-assessment', score: mastery },
  { item_id: 'LC-U1-L1', source: 'quiz', score: check },
  { item_id: 'TI-U1-L1-1', source: 'try-it', score: work },
  { item_id: 'BL-U1-L1-DESK_DONE', source: 'daily-engagement', score: deck },
].filter(row => row.score != null).map(row => ({ ...row, recorded_at: '2026-09-25T16:00:00Z' }));

describe('A2 district grading', () => {
  it('uses 50/40/10 weights, 4/10/10 minima, and raw 20/100/10/10 points', () => {
    const grade = computeGrade(a2Rows(80, 20, 5), {}, A2_CONFIG, A2_OPTS);
    const quarter = grade.quarters.Q1;
    expect(grade.formula).toBe('district');
    expect(quarter.quarterGrade).toBeCloseTo(100 / 120 * 50 + 50 * 0.4 + 100 * 0.1, 8);
    expect(quarter.categoryBreakdown.assessments).toMatchObject({ earned: 100, possible: 120, count: 2, minimum: 4, minimumMet: false });
    expect(quarter.categoryBreakdown.assignments).toMatchObject({ earned: 5, possible: 10, minimum: 10, minimumMet: false });
    expect(quarter.categoryBreakdown.engagement).toMatchObject({ earned: 10, possible: 10, minimum: 10, minimumMet: false });
  });

  it('meets category minima with four quizzes, ten Try-Its, and ten imported days', () => {
    const schedule = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
      const lesson = index + 1;
      return ['1.' + lesson, { unit: 1, periods: { C: '2026-09-24' }, items: [
        ...(index < 4 ? [{ itemId: 'LC-U1-L' + lesson, source: 'quiz' }] : []),
        { itemId: 'TI-U1-L' + lesson + '-1', source: 'try-it' },
        { itemId: 'BL-U1-L' + lesson + '-DESK_DONE', source: 'daily-engagement' },
      ] }];
    }));
    const rows = Object.values(schedule).flatMap(lesson => lesson.items.map(item => ({
      item_id: item.itemId, source: item.source,
      score: item.source === 'quiz' ? 20 : 10,
      recorded_at: '2026-09-24T16:00:00Z',
    })));
    const quarter = computeGrade(rows, {}, A2_CONFIG, {
      ...A2_OPTS, lessonSchedule: schedule, items: [],
    }).quarters.Q1;
    expect(quarter.quarterGrade).toBeCloseTo(100, 8);
    for (const category of Object.values(quarter.categoryBreakdown)) expect(category.minimumMet).toBe(true);
  });

  it('unassigned work stays absent after the planned lesson day', () => {
    const onDay = computeGrade([], {}, A2_CONFIG, { ...A2_OPTS, items: [], asOf: '2026-09-24T16:00:00Z' });
    const afterDay = computeGrade([], {}, A2_CONFIG, { ...A2_OPTS, items: [], asOf: '2026-09-25T16:00:00Z' });
    expect(onDay.quarters.Q1.quarterGrade).toBeNull();
    expect(afterDay.quarters.Q1.quarterGrade).toBeNull();
    expect(afterDay.quarters.Q1.lessonsDue).toBe(0);
  });

  it('uses latest teacher scores for every active source', () => {
    const earlier = a2Rows(100, 10, 2, 100);
    const later = a2Rows(50, 5, 1, 79).map(row => ({ ...row, attempt: 2, recorded_at: '2026-09-26T16:00:00Z' }));
    const grade = computeGrade([...earlier, ...later], {}, A2_CONFIG, A2_OPTS);
    const points = Object.fromEntries(grade.items.map(item => [item.itemId, item.points]));
    expect(points).toEqual({ 'TA-U1': 50, 'LC-U1-L1': 5, 'TI-U1-L1-1': 1, 'BL-U1-L1-DESK_DONE': 10 });
  });

  it('ignores unsupported sources instead of manufacturing grade credit', () => {
    const rows = [
      { item_id: 'LC-U1-L1', source: 'unknown', score: 10 },
      { item_id: 'unrelated', source: 'worksheet', score: 100 },
    ];
    expect(computeGrade(rows, {}, A2_CONFIG, A2_OPTS).quarters.Q1.quarterGrade).toBeNull();
  });
});

describe('GET /grade — A2 response contract', () => {
  it('accepts a bearer token and returns district gradebook fields even with no schedule', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status, body } = await srv.get('/grade', { Authorization: 'Bearer ' + ctx.token });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, formula: 'district', units: {}, lessons: [], items: [] });
    expect(body.asOf).toEqual(expect.any(String));
    expect(body.gradebook.weights).toEqual({ Assessments: 50, Assignments: 40, Engagement: 10 });
    for (const quarter of Object.values(body.quarters)) expect(quarter.quarterGrade).toBeNull();
  });

  it('tolerates malformed ledger fields without a server error', async () => {
    const ctx = await startServer([
      { source: 'quiz' },
      { source: 'try-it', item_id: 'TI-U1-L1-1', score: 'not-a-number' },
    ]); srv = ctx.server;
    expect((await srv.get('/grade?token=' + ctx.token)).status).toBe(200);
  });
});
