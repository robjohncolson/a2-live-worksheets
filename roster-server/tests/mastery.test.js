// mastery.test.js — tests for GET /mastery (Gradebook Phase 3 diagnostic).
// Uses the REAL bundled bkt.js (validates AS-IS reuse) + a fake-bkt path.
// Fake in-memory ledgerDb + inline fixtures. NO network/Supabase.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { signToken } from '../token.js';

let realBkt;
beforeAll(async () => {
  await import('../bkt.js');           // UMD side-effect (study-guide pattern)
  realBkt = globalThis.BKT;
});

const FIXTURE_ANSWER_KEY = {
  generatedFrom: 'curriculum_render/data/curriculum.js (READ-ONLY)',
  answerKey: {
    'U1-L1-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q02': { answerKey: 'C', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q03': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
    'U2-L1-Q01': { answerKey: 'D', type: 'multiple-choice', unit: '2' },
    'U1-PC-MCQ-A-Q01': { answerKey: 'A', type: 'multiple-choice', unit: '1' },
    'U1-L1-Q09': { answerKey: 'A', type: 'multiple-choice', unit: '1' }, // skill unresolved
  },
};

// id → skill (build-skill-map.mjs shape). null skill = unresolved (excluded).
const FIXTURE_SKILL_MAP = {
  'U1-L1-Q01': { skill: '1.A', confidence: 0.9, provenance: 'ai-constrained' },
  'U1-L1-Q02': { skill: '1.A', confidence: 0.9, provenance: 'ai-constrained' },
  'U1-L1-Q03': { skill: '1.A', confidence: 0.9, provenance: 'ai-constrained' },
  'U2-L1-Q01': { skill: '2.B', confidence: 0.9, provenance: 'ai-constrained' },
  'U1-PC-MCQ-A-Q01': { skill: '1.C', confidence: 0.9, provenance: 'ai-constrained' },
  'U1-L1-Q09': { skill: null, confidence: 0, provenance: 'unresolved' },
  'WS-U1L1-r1': { skill: '1.D', confidence: 0.9, provenance: 'frq-xref' },
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
function makeRow(itemId, response, { source = 'curriculum_quiz', score, attempt = 1, recorded_at } = {}) {
  return {
    student_id: 'PLACEHOLDER', source, item_id: itemId, response,
    score: score === undefined ? null : score, attempt,
    recorded_at: recorded_at || new Date().toISOString(),
  };
}

const fakeLoadManifest = async () => ({ generatedFrom: 'x', units: [] });
const okAnswerKey = async () => FIXTURE_ANSWER_KEY;
const okSkillMap = async () => FIXTURE_SKILL_MAP;

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
    // An unmounted route returns Express's default HTML 404, not JSON.
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
}

async function startServer(rows = [], {
  loadAnswerKey = okAnswerKey, loadSkillMap = okSkillMap, bkt = realBkt, ledgerOpts = {},
} = {}) {
  process.env.ROSTER_TOKEN_SECRET = `tok-${randomBytes(16).toString('hex')}`;
  process.env.NODE_ENV = 'test';
  const studentId = `uuid-mastery-${randomBytes(8).toString('hex')}`;
  const token = signToken(studentId);
  const ledgerDb = createFakeLedgerDb(rows.map(r => ({ ...r, student_id: studentId })), ledgerOpts);
  const app = createApp(createFakeRosterDb(), ledgerDb, fakeLoadManifest, loadAnswerKey, loadSkillMap, bkt);
  const server = new TestServer(app);
  await server.start();
  return { server, studentId, token, ledgerDb };
}

let srv;
afterEach(async () => { if (srv) { await srv.stop(); srv = null; } delete process.env.ROSTER_TOKEN_SECRET; });

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('GET /mastery — auth', () => {
  it('401 without a token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status } = await srv.get('/mastery');
    expect(status).toBe(401);
  });
  it('401 with an invalid token', async () => {
    const ctx = await startServer(); srv = ctx.server;
    const { status } = await srv.get('/mastery?token=garbage');
    expect(status).toBe(401);
  });
});

// ── BKT rollup over skill-map tags ────────────────────────────────────────────
describe('GET /mastery — BKT diagnostic', () => {
  it('folds BKT per skill; θ=0.65 weak flag; AS-IS engine', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'B'),  // 1.A correct
      makeRow('U1-L1-Q02', 'C'),  // 1.A correct
      makeRow('U1-L1-Q03', 'A'),  // 1.A correct  → pKnow rises well above θ
      makeRow('U2-L1-Q01', 'X'),  // 2.B incorrect → stays low → weak
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status, body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.theta).toBe(0.65);
    expect(body.skills['1.A']).toMatchObject({ observations: 3, correct: 3 });
    expect(body.skills['1.A'].pKnow).toBeGreaterThan(0.65);
    expect(body.skills['2.B']).toMatchObject({ observations: 1, correct: 0 });
    expect(body.skills['2.B'].pKnow).toBeLessThan(0.65);
    expect(body.weakSkills).toContain('2.B');
    expect(body.weakSkills).not.toContain('1.A');
    expect(body.totalObservations).toBe(4);
  });

  it('one correct alone stays below θ (BKT skeptical) → still weak', async () => {
    const ctx = await startServer([makeRow('U1-L1-Q01', 'B')]); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    // pInit 0.3 → 1 correct ≈ 0.607 < 0.65
    expect(body.skills['1.A'].pKnow).toBeLessThan(0.65);
    expect(body.skills['1.A'].pKnow).toBeGreaterThan(0.3);
    expect(body.weakSkills).toContain('1.A');
  });

  it('unresolved skill (skill:null) is EXCLUDED from the rollup', async () => {
    const rows = [
      makeRow('U1-L1-Q01', 'B'),   // 1.A
      makeRow('U1-L1-Q09', 'A'),   // skill:null → excluded
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.totalObservations).toBe(1);
    expect(Object.keys(body.skills)).toEqual(['1.A']);
  });

  it('frq score≥0.5 = correct evidence; worksheet (no key) skipped', async () => {
    const rows = [
      makeRow('WS-U1L1-r1', 'good', { source: 'frq', score: 1 }),    // 1.D correct
      makeRow('WS-U1L1-x',  'typed', { source: 'worksheet' }),       // no key/skill → skip
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.totalObservations).toBe(1);
    expect(body.skills['1.D'].correct).toBe(1);
  });

  it('null/ungraded FRQ score is NOT folded as a (false) BKT observation', async () => {
    const rows = [
      makeRow('U1-L1-Q01',  'B'),                                       // 1.A, counts
      makeRow('WS-U1L1-r1', 'x', { source: 'frq', score: null }),       // excluded (no signal)
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.skills['1.D']).toBeUndefined();
    expect(body.skills['1.A']).toMatchObject({ observations: 1, correct: 1 });
    expect(body.totalObservations).toBe(1);
  });

  it('full chronological STREAM: every retry on an item is folded (not latest-only)', async () => {
    // Same item, three attempts: wrong, wrong, right. The diagnostic must fold
    // all 3 observations (not collapse to the latest attempt like /grade does).
    const rows = [
      makeRow('U1-L1-Q01', 'Z', { attempt: 1, recorded_at: '2026-05-01T10:00:00.000Z' }),
      makeRow('U1-L1-Q01', 'Z', { attempt: 2, recorded_at: '2026-05-02T10:00:00.000Z' }),
      makeRow('U1-L1-Q01', 'B', { attempt: 3, recorded_at: '2026-05-03T10:00:00.000Z' }),
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.skills['1.A']).toMatchObject({ observations: 3, correct: 1 });
    expect(body.totalObservations).toBe(3);
    // Two wrongs before the recovery ⇒ posterior far below a lone correct
    // (≈0.607) — i.e. retries genuinely move pKnow.
    expect(body.skills['1.A'].pKnow).toBeLessThan(0.607);
    expect(body.weakSkills).toContain('1.A');
  });

  it('pc rows scored vs key contribute to BKT', async () => {
    const ctx = await startServer([makeRow('U1-PC-MCQ-A-Q01', 'A', { source: 'pc' })]);
    srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.skills['1.C']).toMatchObject({ observations: 1, correct: 1 });
  });

  it('empty ledger → empty skills, no weak skills', async () => {
    const ctx = await startServer([]); srv = ctx.server;
    const { body } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(body.skills).toEqual({});
    expect(body.weakSkills).toEqual([]);
    expect(body.totalObservations).toBe(0);
  });

  it('malformed rows tolerated (no throw / no 500)', async () => {
    const rows = [
      { student_id: 'x', source: 'curriculum_quiz' }, // no item_id
      makeRow('U1-L1-Q01', null),                     // null resp → incorrect (still scored)
    ];
    const ctx = await startServer(rows); srv = ctx.server;
    const { status } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(status).toBe(200);
  });
});

// ── Robustness ────────────────────────────────────────────────────────────────
describe('GET /mastery — robustness', () => {
  it('read-only: never writes the ledger store', async () => {
    const ctx = await startServer([makeRow('U1-L1-Q01', 'B')]); srv = ctx.server;
    const before = ctx.ledgerDb._store.length;
    await srv.get(`/mastery?token=${ctx.token}`);
    expect(ctx.ledgerDb._store.length).toBe(before);
    expect(ctx.ledgerDb._store.some(r => r._written)).toBe(false);
  });
  it('ledger db error → 500', async () => {
    const ctx = await startServer([], { ledgerOpts: { error: { message: 'down' } } });
    srv = ctx.server;
    expect((await srv.get(`/mastery?token=${ctx.token}`)).status).toBe(500);
  });
  it('skill-map load failure → 500', async () => {
    const ctx = await startServer([], { loadSkillMap: async () => { throw new Error('no map'); } });
    srv = ctx.server;
    expect((await srv.get(`/mastery?token=${ctx.token}`)).status).toBe(500);
  });
  it('skill-map malformed → 500 (top-level AND empty AND corrupt entry, fail closed)', async () => {
    const bads = [
      null, 'string', ['a'],
      {},                                       // bundled map is never empty
      { 'U1-L1-Q01': 42 },                      // corrupt entry
      { 'U1-L1-Q01': { skill: 7 } },            // skill not string|null
    ];
    for (const bad of bads) {
      const ctx = await startServer([makeRow('U1-L1-Q01', 'B')], { loadSkillMap: async () => bad });
      srv = ctx.server;
      expect((await srv.get(`/mastery?token=${ctx.token}`)).status).toBe(500);
      await srv.stop(); srv = null;
    }
  });
  it('answer-key malformed → 500 (top-level AND corrupt per-entry, fail closed)', async () => {
    const bads = [
      { answerKey: 'oops' },                                 // top-level
      { answerKey: { 'U1-L1-Q01': 42 } },                    // corrupt entry
      { answerKey: { 'U1-L1-Q01': { answerKey: ['x'] } } },  // answerKey not scalar|null
    ];
    for (const bad of bads) {
      const ctx = await startServer([makeRow('U1-L1-Q01', 'B')], { loadAnswerKey: async () => bad });
      srv = ctx.server;
      expect((await srv.get(`/mastery?token=${ctx.token}`)).status).toBe(500);
      await srv.stop(); srv = null;
    }
  });
  it('BKT engine unavailable → 500 (not mounted without bkt)', async () => {
    // bkt:null → mountMastery guard skips the route → 404 (route absent).
    const ctx = await startServer([], { bkt: null }); srv = ctx.server;
    const { status } = await srv.get(`/mastery?token=${ctx.token}`);
    expect(status).toBe(404);
  });
  it('BKT present but broken → 500', async () => {
    const ctx = await startServer([makeRow('U1-L1-Q01', 'B')], { bkt: { DEFAULT_PARAMS: { pInit: 0.3 } } });
    srv = ctx.server;
    expect((await srv.get(`/mastery?token=${ctx.token}`)).status).toBe(500);
  });
});
