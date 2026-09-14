// donow.test.js — tests for GET /donow
// Injects a fake in-memory ledgerDb + an inline fixture manifest (CONTRACT 2 shape).
// NO network, NO real Supabase, NO dependency on data/work-manifest.json existing.
// Uses Node's built-in http + fetch (Node 18+) to test the Express app.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../server.js';
import { computeDonow } from '../donow.js';
import { signToken } from '../token.js';

// ── Fixture manifest (CONTRACT 2 schema, inline) ──────────────────────────────
// Two units: U1 (two lessons, pc) and U2 (one lesson, pc).
// Enough variety to test all nextTask / earlierGapFlag / state cases.

const FIXTURE_MANIFEST = {
  generatedFrom: 'data/skill-map.json',
  units: [
    {
      unit: 'U1',
      lessons: [
        {
          lesson: '1.1',
          activities: [
            {
              activity: 'worksheet',
              source:   'worksheet',
              itemIds:  ['WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3'],
              count:    3
            },
            {
              activity: 'quiz',
              source:   'curriculum_quiz',
              itemIds:  ['U1-L1-Q01', 'U1-L1-Q02'],
              count:    2
            }
          ]
        },
        {
          lesson: '1.2',
          activities: [
            {
              activity: 'worksheet',
              source:   'worksheet',
              itemIds:  ['WS-U1L2-Q1', 'WS-U1L2-Q2'],
              count:    2
            }
          ]
        }
      ],
      pc: {
        activity: 'progress-check',
        source:   'pc',
        itemIds:  ['U1-PC-MCQ-A-Q01', 'U1-PC-MCQ-A-Q02', 'U1-PC-MCQ-B-Q01'],
        count:    3
      }
    },
    {
      unit: 'U2',
      lessons: [
        {
          lesson: '2.1',
          activities: [
            {
              activity: 'worksheet',
              source:   'worksheet',
              itemIds:  ['WS-U2L1-Q1', 'WS-U2L1-Q2'],
              count:    2
            }
          ]
        }
      ],
      pc: {
        activity: 'progress-check',
        source:   'pc',
        itemIds:  ['U2-PC-MCQ-A-Q01'],
        count:    1
      }
    }
  ],
  index: {
    'WS-U1L1-Q1':      { unit: 'U1', lesson: '1.1', activity: 'worksheet' },
    'WS-U1L1-Q2':      { unit: 'U1', lesson: '1.1', activity: 'worksheet' },
    'WS-U1L1-Q3':      { unit: 'U1', lesson: '1.1', activity: 'worksheet' },
    'U1-L1-Q01':       { unit: 'U1', lesson: '1.1', activity: 'quiz' },
    'U1-L1-Q02':       { unit: 'U1', lesson: '1.1', activity: 'quiz' },
    'WS-U1L2-Q1':      { unit: 'U1', lesson: '1.2', activity: 'worksheet' },
    'WS-U1L2-Q2':      { unit: 'U1', lesson: '1.2', activity: 'worksheet' },
    'U1-PC-MCQ-A-Q01': { unit: 'U1', lesson: null,  activity: 'progress-check' },
    'U1-PC-MCQ-A-Q02': { unit: 'U1', lesson: null,  activity: 'progress-check' },
    'U1-PC-MCQ-B-Q01': { unit: 'U1', lesson: null,  activity: 'progress-check' },
    'WS-U2L1-Q1':      { unit: 'U2', lesson: '2.1', activity: 'worksheet' },
    'WS-U2L1-Q2':      { unit: 'U2', lesson: '2.1', activity: 'worksheet' },
    'U2-PC-MCQ-A-Q01': { unit: 'U2', lesson: null,  activity: 'progress-check' }
  }
};

// All item IDs in manifest order (for all-done tests).
const ALL_ITEM_IDS = Object.keys(FIXTURE_MANIFEST.index);

// Sync loader — returns the fixture directly (no I/O).
async function fakeLoadManifest() {
  return FIXTURE_MANIFEST;
}

// ── Fake in-memory roster db (minimal — only needed for createApp signature) ───

function createFakeRosterDb() {
  return {
    async insertRoster()   { return { data: null, error: { message: 'not used in donow tests' } }; },
    async findByUsername() { return { data: null, error: { message: 'not used in donow tests' } }; }
  };
}

// ── Fake in-memory ledger db ──────────────────────────────────────────────────
// Mirrors the pattern from ledger.test.js.

function createFakeLedgerDb(initialRows = []) {
  // store keyed by "studentId|source|itemId|attempt"
  const store = new Map();

  for (const row of initialRows) {
    const key = `${row.student_id}|${row.source}|${row.item_id}|${row.attempt ?? 1}`;
    store.set(key, row);
  }

  return {
    store,

    async insertLedgerRow({ studentId, source, itemId, unit, topic, skill, response, score, evidenceTier, attempt }) {
      const key = `${studentId}|${source}|${itemId}|${attempt ?? 1}`;
      const row = {
        ledger_id:     `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        student_id:    studentId,
        source,
        item_id:       itemId,
        unit:          unit   || null,
        topic:         topic  || null,
        skill:         skill  || null,
        response,
        score:         score  ?? null,
        evidence_tier: evidenceTier,
        attempt:       attempt ?? 1,
        recorded_at:   new Date().toISOString(),
        graded_at:     null
      };
      store.set(key, row);
      return { data: { ledger_id: row.ledger_id, evidence_tier: row.evidence_tier }, error: null };
    },

    async getLedgerByStudent(studentId) {
      const rows = [...store.values()].filter(r => r.student_id === studentId);
      return { data: rows, error: null };
    }
  };
}

// ── Lightweight test server ───────────────────────────────────────────────────
// Same pattern as ledger.test.js.

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

  async request(method, path, { headers = {} } = {}) {
    const opts = { method, headers };
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  }
}

// ── Test context ──────────────────────────────────────────────────────────────
// We build a fresh server for each test case. Tests that need specific ledger
// rows call startServer(rows) which generates a matched studentId + token.
//
// IMPORTANT: rows must be built AFTER studentId is known.
// Use makeRow(ctx.studentId, itemId) where ctx = await startServer(...) or
// use the withRows() helper below.

let srv;

// Start a fresh server. Returns { srv, studentId, token }.
// initialRows should be built using the returned studentId — but since we
// need the id before rows can be built, use the factory pattern:
//
//   const ctx = await startServer();                   // empty ledger
//   const ctx = await startServerWithItems([ids...]);  // pre-loaded rows
async function startServer(initialRows = []) {
  const tokenSecret   = `token-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TOKEN_SECRET = tokenSecret;
  process.env.NODE_ENV            = 'test';

  const studentId = `uuid-donow-${randomBytes(8).toString('hex')}`;
  const token     = signToken(studentId);

  const rosterDb  = createFakeRosterDb();
  const ledgerDb  = createFakeLedgerDb(initialRows);
  const app       = createApp(rosterDb, ledgerDb, fakeLoadManifest);
  const server    = new TestServer(app);
  await server.start();

  return { server, studentId, token };
}

// Start a server pre-loaded with rows for itemIds (all belonging to studentId).
// Score defaults to null — set score=0 to test D3 (score-not-gated).
async function startServerWithItems(itemIds, score = null) {
  // We need the studentId first so rows can reference it.
  // Build with empty store, then note: we need to pre-populate.
  // Strategy: pre-generate studentId, build rows, then start server.
  const tokenSecret = `token-${randomBytes(16).toString('hex')}`;
  process.env.ROSTER_TOKEN_SECRET = tokenSecret;
  process.env.NODE_ENV            = 'test';

  const studentId = `uuid-donow-${randomBytes(8).toString('hex')}`;
  const token     = signToken(studentId);

  const rows = itemIds.map(id => makeRow(studentId, id, score));

  const rosterDb  = createFakeRosterDb();
  const ledgerDb  = createFakeLedgerDb(rows);
  const app       = createApp(rosterDb, ledgerDb, fakeLoadManifest);
  const server    = new TestServer(app);
  await server.start();

  return { server, studentId, token };
}

// Build a fake ledger row for a given studentId + itemId.
function makeRow(studentId, itemId, score = null) {
  return {
    student_id:    studentId,
    source:        'worksheet',
    item_id:       itemId,
    score,
    attempt:       1,
    recorded_at:   new Date().toISOString()
  };
}

beforeEach(async () => {
  const ctx = await startServer();
  srv = ctx.server;
  // Store ctx on srv so tests can access studentId/token.
  srv._ctx = ctx;
});

afterEach(async () => {
  await srv.stop();
  delete process.env.ROSTER_TOKEN_SECRET;
});

// ── Request helpers ───────────────────────────────────────────────────────────

function getDonow(server, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return server.request('GET', '/donow', { headers });
}

function getDonowQueryToken(server, token) {
  const path = token ? `/donow?token=${encodeURIComponent(token)}` : '/donow';
  return server.request('GET', path, {});
}

// ── §2 test cases ─────────────────────────────────────────────────────────────

// ── 401 — no token ────────────────────────────────────────────────────────────

describe('GET /donow — auth (401)', () => {

  it('no Authorization header and no ?token= → 401 {ok:false}', async () => {
    const { status, body } = await getDonow(srv, null);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('garbage Bearer token → 401 {ok:false}', async () => {
    const { status, body } = await getDonow(srv, 'garbage.notvalid');
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('expired / tampered token → 401 {ok:false}', async () => {
    const { token } = srv._ctx;
    const parts = token.split('.');
    const { status, body } = await getDonow(srv, `${parts[0]}.invalidsig`);
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('?token= with garbage value → 401 {ok:false}', async () => {
    const { status, body } = await getDonowQueryToken(srv, 'not-a-real-token');
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

// ── ?token= query param auth works ───────────────────────────────────────────

describe('GET /donow — ?token= query param auth', () => {

  it('valid token via ?token= query param → 200 {ok:true}', async () => {
    const { token } = srv._ctx;
    const { status, body } = await getDonowQueryToken(srv, token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

// ── nextTask = earliest incomplete ───────────────────────────────────────────
// Manifest order: U1/1.1/worksheet → U1/1.1/quiz → U1/1.2/worksheet
//                 → U1/pc → U2/2.1/worksheet → U2/pc

describe('GET /donow — nextTask is earliest incomplete', () => {

  it('empty ledger → nextTask is U1 lesson 1.1 worksheet (first in manifest)', async () => {
    const { token } = srv._ctx;
    const { status, body } = await getDonow(srv, token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.nextTask).not.toBeNull();
    expect(body.nextTask.unit).toBe('U1');
    expect(body.nextTask.lesson).toBe('1.1');
    expect(body.nextTask.activity).toBe('worksheet');
    expect(body.nextTask.reason).toBe('earliest-incomplete');
  });

  it('nextTask.progress reflects partial completion', async () => {
    const ctx = await startServerWithItems(['WS-U1L1-Q1', 'WS-U1L1-Q2']);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.nextTask.unit).toBe('U1');
      expect(body.nextTask.lesson).toBe('1.1');
      expect(body.nextTask.activity).toBe('worksheet');
      expect(body.nextTask.progress.done).toBe(2);
      expect(body.nextTask.progress.total).toBe(3);
    } finally {
      await ctx.server.stop();
    }
  });

  it('completing U1/1.1/worksheet → nextTask advances to U1/1.1/quiz', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3'
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.nextTask.unit).toBe('U1');
      expect(body.nextTask.lesson).toBe('1.1');
      expect(body.nextTask.activity).toBe('quiz');
    } finally {
      await ctx.server.stop();
    }
  });

  it('completing U1/1.1 entirely → nextTask advances to U1/1.2/worksheet', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02'
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.nextTask.unit).toBe('U1');
      expect(body.nextTask.lesson).toBe('1.2');
      expect(body.nextTask.activity).toBe('worksheet');
    } finally {
      await ctx.server.stop();
    }
  });

  it('completing all U1 lessons → nextTask is U1 pc (pc comes after lessons)', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02',
      'WS-U1L2-Q1', 'WS-U1L2-Q2'
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.nextTask.unit).toBe('U1');
      expect(body.nextTask.lesson).toBeNull();
      expect(body.nextTask.activity).toBe('progress-check');
    } finally {
      await ctx.server.stop();
    }
  });

  it('completing U1 entirely → nextTask advances to U2/2.1/worksheet', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02',
      'WS-U1L2-Q1', 'WS-U1L2-Q2',
      'U1-PC-MCQ-A-Q01', 'U1-PC-MCQ-A-Q02', 'U1-PC-MCQ-B-Q01'
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.nextTask.unit).toBe('U2');
      expect(body.nextTask.lesson).toBe('2.1');
      expect(body.nextTask.activity).toBe('worksheet');
    } finally {
      await ctx.server.stop();
    }
  });
});

// ── none / partial / done states ─────────────────────────────────────────────

describe('GET /donow — activity states (none / partial / done)', () => {

  it('empty ledger → all activities are state:"none"', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    for (const lesson of body.lessons) {
      for (const act of lesson.activities) {
        expect(act.state).toBe('none');
        expect(act.done).toBe(0);
      }
    }
    for (const unit of body.units) {
      expect(unit.pc.state).toBe('none');
    }
  });

  it('partial completion → state:"partial" and done/total correct', async () => {
    const ctx = await startServerWithItems(['WS-U1L1-Q1']); // 1 of 3
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
      const ws   = u1l1.activities.find(a => a.activity === 'worksheet');
      expect(ws.state).toBe('partial');
      expect(ws.done).toBe(1);
      expect(ws.total).toBe(3);
    } finally {
      await ctx.server.stop();
    }
  });

  it('full completion of an activity → state:"done"', async () => {
    const ctx = await startServerWithItems(['WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3']);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
      const ws   = u1l1.activities.find(a => a.activity === 'worksheet');
      expect(ws.state).toBe('done');
      expect(ws.done).toBe(3);
      expect(ws.total).toBe(3);
    } finally {
      await ctx.server.stop();
    }
  });

  it('lessonState is "none" when all activities are none', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
    expect(u1l1.lessonState).toBe('none');
  });

  it('lessonState is "partial" when worksheet done but quiz not started', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3' // worksheet done, quiz not started
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
      expect(u1l1.lessonState).toBe('partial');
    } finally {
      await ctx.server.stop();
    }
  });

  it('lessonState is "done" when all activities are done', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02'
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
      expect(u1l1.lessonState).toBe('done');
    } finally {
      await ctx.server.stop();
    }
  });
});

// ── earlierGapFlag ────────────────────────────────────────────────────────────

describe('GET /donow — earlierGapFlag', () => {

  it('empty ledger → earlierGapFlag false (nothing touched)', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    expect(body.earlierGapFlag).toBe(false);
  });

  it('student only touched the very first activity → earlierGapFlag false', async () => {
    const ctx = await startServerWithItems(['WS-U1L1-Q1']); // only first item
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.earlierGapFlag).toBe(false);
    } finally {
      await ctx.server.stop();
    }
  });

  it('U1/1.1/worksheet skipped, U1/1.1/quiz touched → earlierGapFlag true', async () => {
    // Quiz is later in order than worksheet; worksheet still incomplete → gap.
    const ctx = await startServerWithItems(['U1-L1-Q01']); // quiz touched, worksheet not
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.earlierGapFlag).toBe(true);
    } finally {
      await ctx.server.stop();
    }
  });

  it('U1/1.1 fully done, U1/1.2 skipped, U2/2.1 touched → earlierGapFlag true', async () => {
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02',
      // U1/1.2 NOT done
      'WS-U2L1-Q1' // skipped ahead to U2
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.earlierGapFlag).toBe(true);
    } finally {
      await ctx.server.stop();
    }
  });

  it('sequential completion with no gaps → earlierGapFlag false', async () => {
    // All of U1/1.1 done, currently partial into U1/1.2. No skip.
    const ctx = await startServerWithItems([
      'WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3',
      'U1-L1-Q01', 'U1-L1-Q02',
      'WS-U1L2-Q1' // partial into U1/1.2
    ]);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.earlierGapFlag).toBe(false);
    } finally {
      await ctx.server.stop();
    }
  });
});

// ── all done → nextTask null ──────────────────────────────────────────────────

describe('GET /donow — all complete → nextTask null', () => {

  it('all items in fixture manifest done → nextTask is null', async () => {
    const ctx = await startServerWithItems(ALL_ITEM_IDS);
    try {
      const { status, body } = await getDonow(ctx.server, ctx.token);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.nextTask).toBeNull();
    } finally {
      await ctx.server.stop();
    }
  });

  it('all items done → earlierGapFlag is false', async () => {
    const ctx = await startServerWithItems(ALL_ITEM_IDS);
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      expect(body.earlierGapFlag).toBe(false);
    } finally {
      await ctx.server.stop();
    }
  });
});

// ── done = row-exists, NOT score-gated (D3) ───────────────────────────────────
// A row with score=0 still counts as "done".

describe('GET /donow — done is row-exists, not score-gated (D3)', () => {

  it('score=0 row still counts as done (not score-gated)', async () => {
    // Pass score=0 explicitly to startServerWithItems
    const ctx = await startServerWithItems(
      ['WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3'],
      0 // score=0 for all
    );
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l1 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.1');
      const ws   = u1l1.activities.find(a => a.activity === 'worksheet');
      // Done should be 3, state should be "done" — score=0 is still attempted.
      expect(ws.done).toBe(3);
      expect(ws.state).toBe('done');
    } finally {
      await ctx.server.stop();
    }
  });

  it('score=0 rows advance nextTask past the completed activity', async () => {
    const ctx = await startServerWithItems(
      ['WS-U1L1-Q1', 'WS-U1L1-Q2', 'WS-U1L1-Q3'],
      0
    );
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      // nextTask should be the quiz, not the worksheet (which is now fully "done")
      expect(body.nextTask.activity).toBe('quiz');
    } finally {
      await ctx.server.stop();
    }
  });

  it('score=null row still counts as done', async () => {
    // null is the default score in makeRow; startServerWithItems uses score=null by default
    const ctx = await startServerWithItems(['WS-U1L2-Q1', 'WS-U1L2-Q2']); // score=null
    try {
      const { body } = await getDonow(ctx.server, ctx.token);
      const u1l2 = body.lessons.find(l => l.unit === 'U1' && l.lesson === '1.2');
      const ws   = u1l2.activities.find(a => a.activity === 'worksheet');
      expect(ws.done).toBe(2);
      expect(ws.state).toBe('done');
    } finally {
      await ctx.server.stop();
    }
  });
});

// ── response shape ────────────────────────────────────────────────────────────

describe('GET /donow — response shape', () => {

  it('response has ok, nextTask, lessons, units, earlierGapFlag keys', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    expect(typeof body.ok).toBe('boolean');
    expect('nextTask' in body).toBe(true);
    expect(Array.isArray(body.lessons)).toBe(true);
    expect(Array.isArray(body.units)).toBe(true);
    expect(typeof body.earlierGapFlag).toBe('boolean');
  });

  it('lessons array contains entries for each lesson in manifest', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    // Fixture has 3 lessons: 1.1, 1.2, 2.1
    expect(body.lessons).toHaveLength(3);
    expect(body.lessons.map(l => l.lesson)).toEqual(['1.1', '1.2', '2.1']);
  });

  it('units array contains entries for each unit that has a pc', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    // Fixture has U1 and U2, both with pc
    expect(body.units).toHaveLength(2);
    expect(body.units.map(u => u.unit)).toEqual(['U1', 'U2']);
    for (const u of body.units) {
      expect(typeof u.pc.done).toBe('number');
      expect(typeof u.pc.total).toBe('number');
      expect(['none', 'partial', 'done']).toContain(u.pc.state);
    }
  });

  it('nextTask has unit, lesson, activity, source, progress, reason when not null', async () => {
    const { token } = srv._ctx;
    const { body } = await getDonow(srv, token);
    const nt = body.nextTask;
    expect(nt).not.toBeNull();
    expect(typeof nt.unit).toBe('string');
    expect('lesson' in nt).toBe(true);
    expect(typeof nt.activity).toBe('string');
    expect(typeof nt.source).toBe('string');
    expect(typeof nt.progress.done).toBe('number');
    expect(typeof nt.progress.total).toBe('number');
    expect(nt.reason).toBe('earliest-incomplete');
  });
});

// ── existing routes still work (additive — no regression) ────────────────────

describe('GET /donow — existing routes unaffected', () => {

  it('GET /health still works after donow is mounted', async () => {
    const { status, body } = await srv.request('GET', '/health', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('roster');
  });
});

// ── selfDone (cross-device grey-out, CALENDAR_SYNC_BUILD.md) ──────────────────
// A DESK_DONE self-attest row → that topic's selfDone=true, so the calendar
// greys on EVERY device for the signed-in student (the client hydrates a local
// mark from it). Per-resource/lenient: ANY Done click sets it.
describe('computeDonow — selfDone (per-resource DESK_DONE → cross-device grey-out)', () => {
  it('marks a topic selfDone when a DESK_DONE row exists (keyed by row.topic)', () => {
    const rows = [{ item_id: 'WS-U1-L1-DESK_DONE', topic: '1.1', source: 'worksheet' }];
    const out = computeDonow(rows, FIXTURE_MANIFEST);
    expect(out.lessons.find(l => l.lesson === '1.1').selfDone).toBe(true);
    expect(out.lessons.find(l => l.lesson === '1.2').selfDone).toBe(false);
  });

  it('falls back to parsing the itemId when the topic field is absent', () => {
    const rows = [{ item_id: 'CR-U1-L1-DESK_DONE' }]; // no topic field
    const out = computeDonow(rows, FIXTURE_MANIFEST);
    expect(out.lessons.find(l => l.lesson === '1.1').selfDone).toBe(true);
  });

  it('a real (non-DESK_DONE) ledger row does NOT set selfDone', () => {
    const rows = [{ item_id: 'WS-U1L1-Q1', topic: '1.1', source: 'worksheet' }];
    const out = computeDonow(rows, FIXTURE_MANIFEST);
    expect(out.lessons.find(l => l.lesson === '1.1').selfDone).toBe(false);
  });

  it('every lesson carries a boolean selfDone (default false with no rows)', () => {
    const out = computeDonow([], FIXTURE_MANIFEST);
    for (const l of out.lessons) expect(typeof l.selfDone).toBe('boolean');
    expect(out.lessons.every(l => l.selfDone === false)).toBe(true);
  });

  it('records WHICH artifacts were self-done (WS-→worksheet, CR-→quiz, BL-→blooket)', () => {
    const rows = [
      { item_id: 'WS-U1-L1-DESK_DONE', topic: '1.1', source: 'worksheet' },
      { item_id: 'CR-U1-L1-DESK_DONE', topic: '1.1', source: 'curriculum_quiz' },
      { item_id: 'BL-U1-L1-DESK_DONE', topic: '1.1', source: 'worksheet' }, // blooket flashcard pass
    ];
    const out = computeDonow(rows, FIXTURE_MANIFEST);
    const l11 = out.lessons.find(l => l.lesson === '1.1');
    expect(l11.selfDone).toBe(true);
    expect([...l11.selfDoneArtifacts].sort()).toEqual(['blooket', 'quiz', 'worksheet']);
  });

  it('selfDoneArtifacts is an empty array when nothing is self-done', () => {
    const out = computeDonow([], FIXTURE_MANIFEST);
    expect(out.lessons.every(l => Array.isArray(l.selfDoneArtifacts) && l.selfDoneArtifacts.length === 0)).toBe(true);
  });

  it('combined-topic lessons each get their own selfDone (no upsert collision)', () => {
    // Guards the client fix: combined topics ("4.1-2") must write UNIQUE
    // DESK_DONE itemIds so two of them don't collide on upsert and overwrite
    // each other's topic. Here both rows carry distinct topics → both selfDone.
    const manifest = { units: [{ unit: 'U4', lessons: [
      { lesson: '4.1-2', activities: [{ activity: 'worksheet', source: 'worksheet', itemIds: ['WS-U4L1-2-Q1'] }] },
      { lesson: '4.7-8', activities: [{ activity: 'worksheet', source: 'worksheet', itemIds: ['WS-U4L7-8-Q1'] }] },
    ] }] };
    const rows = [
      { item_id: 'WS-U4-L1-2-DESK_DONE', topic: '4.1-2', source: 'worksheet' },
      { item_id: 'WS-U4-L7-8-DESK_DONE', topic: '4.7-8', source: 'worksheet' },
    ];
    const out = computeDonow(rows, manifest);
    expect(out.lessons.find(l => l.lesson === '4.1-2').selfDone).toBe(true);
    expect(out.lessons.find(l => l.lesson === '4.7-8').selfDone).toBe(true);
  });
});
