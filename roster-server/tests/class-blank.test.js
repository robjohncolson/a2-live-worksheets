// class-blank.test.js — GET /class/blank/:itemId (student-facing class-answers view).
// Mounts /class routes onto a bare Express app with fakes + a fake verifyToken,
// so the new endpoint is tested in isolation (no Supabase, no real tokens).

import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import express from 'express';
import { mountClass } from '../class.js';

// --- fixtures ---------------------------------------------------------------
const ROSTER = [
  { student_id: 'stu-1', section: 'B', real_name: 'Ana Smith' },   // the requester
  { student_id: 'stu-2', section: 'B', real_name: 'Ben Jones' },
  { student_id: 'stu-3', section: 'B', real_name: 'Cara' },        // single name
  { student_id: 'stu-9', section: 'E', real_name: 'Zoe Other' },   // different section — excluded
];

// getLedgerByItem returns NEWEST-FIRST (the real query orders by recorded_at desc);
// the route keeps the FIRST (latest) row per student. Fixtures are newest-first.
const LEDGER = {
  'WS-U6L1-2-Q1': [
    { student_id: 'stu-2', response: '0.728', recorded_at: '2026-01-03' },
    { student_id: 'stu-1', response: '0.73', recorded_at: '2026-01-02' },        // latest for stu-1
    { student_id: 'stu-3', response: '0.728', recorded_at: '2026-01-02' },
    { student_id: 'stu-9', response: '9.99', recorded_at: '2026-01-02' },        // section E → excluded
    { student_id: 'stu-7', response: 'ghost', recorded_at: '2026-01-02' },       // not in roster → excluded
    { student_id: 'stu-1', response: 'OLD-ANSWER', recorded_at: '2026-01-01' },  // older stu-1 → ignored
  ],
  // A student whose LATEST answer is blank (they cleared it) is excluded.
  'WS-U6L1-2-Q2': [
    { student_id: 'stu-1', response: '   ', recorded_at: '2026-01-05' },         // latest = blank → excluded
    { student_id: 'stu-2', response: 'kept', recorded_at: '2026-01-02' },
    { student_id: 'stu-1', response: 'stale', recorded_at: '2026-01-01' },       // not surfaced
  ],
};

function makeApp({ verify } = {}) {
  const app = express();
  app.use(express.json());
  const db = {
    async findByStudentId(sid) { return { data: ROSTER.find(r => r.student_id === sid) || null, error: null }; },
    async listRoster(section) { return { data: ROSTER.filter(r => r.section === section), error: null }; },
  };
  const ledgerDb = {
    async getLedgerByItem(itemId) { return { data: (LEDGER[itemId] || []).slice(), error: null }; },
  };
  mountClass(app, {
    db, ledgerDb,
    loadAnswerKey: async () => ({}), loadSkillMap: async () => ({}), bkt: {},
    verifyToken: verify || ((t) => (t === 'good' ? 'stu-1' : null)),
  });
  return app;
}

class TestServer {
  constructor(app) { this.server = http.createServer(app); this.baseUrl = null; }
  start() { return new Promise(r => this.server.listen(0, '127.0.0.1', () => { this.baseUrl = `http://127.0.0.1:${this.server.address().port}`; r(); })); }
  stop() { return new Promise(r => this.server.close(r)); }
  async get(path, headers = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    let body = null; try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
}

let srv;
afterEach(async () => { if (srv) { await srv.stop(); srv = null; } });
async function start(opts) { srv = new TestServer(makeApp(opts)); await srv.start(); return srv; }

// --- tests ------------------------------------------------------------------
describe('GET /class/blank/:itemId — auth', () => {
  it('401 without a token', async () => {
    const s = await start();
    const { status, body } = await s.get('/class/blank/WS-U6L1-2-Q1');
    expect(status).toBe(401);
    expect(body.error).toBe('forbidden');
  });

  it('401 with an invalid token', async () => {
    const s = await start();
    const { status } = await s.get('/class/blank/WS-U6L1-2-Q1', { Authorization: 'Bearer nope' });
    expect(status).toBe(401);
  });

  it('accepts ?token= as well as the Authorization header', async () => {
    const s = await start();
    const viaQuery = await s.get('/class/blank/WS-U6L1-2-Q1?token=good');
    expect(viaQuery.status).toBe(200);
  });
});

describe('GET /class/blank/:itemId — section-scoped answers + friendly labels', () => {
  it('returns the latest answer per IN-SECTION student with first-name + last-initial labels', async () => {
    const s = await start();
    const { status, body } = await s.get('/class/blank/WS-U6L1-2-Q1', { Authorization: 'Bearer good' });
    expect(status).toBe(200);
    expect(body.section).toBe('B');

    const byLabel = Object.fromEntries(body.responses.map(r => [r.label, r.answer]));
    expect(byLabel['Ana S.']).toBe('0.73');     // latest, not OLD-ANSWER
    expect(byLabel['Ben J.']).toBe('0.728');
    expect(byLabel['Cara']).toBe('0.728');       // single name kept as-is

    // excludes the other section (Zoe) + the non-roster ghost
    const labels = body.responses.map(r => r.label);
    expect(labels).not.toContain('Zoe O.');
    expect(body.total).toBe(3);
  });

  it('excludes a student whose LATEST answer is blank', async () => {
    const s = await start();
    const { body } = await s.get('/class/blank/WS-U6L1-2-Q2', { Authorization: 'Bearer good' });
    expect(body.total).toBe(1);
    expect(body.responses[0]).toEqual({ answer: 'kept', label: 'Ben J.' });
  });

  it('never leaks full names, scores, usernames, or other sections', async () => {
    const s = await start();
    const { body } = await s.get('/class/blank/WS-U6L1-2-Q1', { Authorization: 'Bearer good' });
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/Smith|Jones|Other/);     // no full last names
    expect(json).not.toMatch(/stu-\d/);                // no student ids
    expect(json).not.toMatch(/"score"/);               // no scores
    body.responses.forEach(r => {
      expect(Object.keys(r).sort()).toEqual(['answer', 'label']);  // exactly these two fields
    });
  });

  it('400 on a malformed itemId', async () => {
    const s = await start();
    const { status } = await s.get('/class/blank/' + encodeURIComponent('../secret'), { Authorization: 'Bearer good' });
    expect(status).toBe(400);
  });

  it('empty (200) when an item has no answers', async () => {
    const s = await start();
    const { status, body } = await s.get('/class/blank/WS-U6L1-2-Q99', { Authorization: 'Bearer good' });
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.responses).toEqual([]);
  });

  it('200 empty when the requester has no section', async () => {
    const s = await start({ verify: (t) => (t === 'good' ? 'stu-nosection' : null) });
    const { status, body } = await s.get('/class/blank/WS-U6L1-2-Q1', { Authorization: 'Bearer good' });
    expect(status).toBe(200);
    expect(body.responses).toEqual([]);
  });
});
