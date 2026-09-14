// grade-answer-key.test.js — the TEACHER-gated full-key endpoint (offline-grading
// mesh Phase 3b) that the teacher device uses to auto-grade offline. Students never
// hit it (they get the redacted key). Also pins the §0.10 keyVersion hash.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import express from 'express';
import http from 'http';
import { mountAnswerKey, keyVersionHash } from '../grade-answer-key.js';

const TEACHER_SECRET = 'test-teacher-secret';

let savedSecret;
beforeAll(() => { savedSecret = process.env.ROSTER_TEACHER_SECRET; process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET; });
afterAll(() => { if (savedSecret === undefined) delete process.env.ROSTER_TEACHER_SECRET; else process.env.ROSTER_TEACHER_SECRET = savedSecret; });

const ANSWER_KEY_DOC = { answerKey: {
  'U1-L2-Q01': { answerKey: 'D', type: 'multiple-choice', unit: '1' },
  'U1-PC-MCQ-A-Q05': { answerKey: 'B', type: 'multiple-choice', unit: '1' },
} };
const WORKSHEET_KEY = { worksheetKey: { 'WS-U1L1-Q1': 'means|mean', 'WS-U1L1-Q2': '0|zero' } };

function makeServer(over = {}) {
  const app = express();
  app.use(express.json());
  const db = { async getRoleByStudentId() { return 'student'; } };
  mountAnswerKey(app, {
    db,
    worksheetKey: WORKSHEET_KEY,
    loadAnswerKey: async () => ANSWER_KEY_DOC,
    lessonSchedule: { some: 'schedule' },
    config: { PASSING: 60 },
    worksheetBlankCounts: { 'WS-U1L1': 16 },
    ...over,
  });
  return http.createServer(app);
}
async function call(server, { secret } = {}) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const headers = {};
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}/grade/answer-key`, { headers });
  const body = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body };
}

describe('GET /grade/answer-key', () => {
  it('401s without the teacher secret (students never get the full key)', async () => {
    expect((await call(makeServer())).status).toBe(401);
  });

  it('returns the FULL unredacted answer + worksheet keys + a version for a teacher', async () => {
    const res = await call(makeServer(), { secret: TEACHER_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.answerKey['U1-L2-Q01'].answerKey).toBe('D');   // unredacted
    expect(res.body.answerKey['U1-PC-MCQ-A-Q05'].answerKey).toBe('B'); // PC included (teacher)
    expect(res.body.worksheetKey['WS-U1L1-Q1']).toBe('means|mean');
    expect(res.body.keyVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(res.body.schedule).toEqual({ some: 'schedule' });
    expect(res.body.config).toEqual({ PASSING: 60 });
  });

  it('500s when the answer key is malformed', async () => {
    const res = await call(makeServer({ loadAnswerKey: async () => ({ nope: true }) }), { secret: TEACHER_SECRET });
    expect(res.status).toBe(500);
  });
});

describe('keyVersionHash (§0.10)', () => {
  it('is deterministic + order-independent, and changes when a key changes', () => {
    const a = keyVersionHash(ANSWER_KEY_DOC.answerKey, WORKSHEET_KEY.worksheetKey);
    const b = keyVersionHash({ ...ANSWER_KEY_DOC.answerKey }, { ...WORKSHEET_KEY.worksheetKey });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    const changed = keyVersionHash({ ...ANSWER_KEY_DOC.answerKey, 'U1-L2-Q01': { answerKey: 'A' } }, WORKSHEET_KEY.worksheetKey);
    expect(changed).not.toBe(a);
    // the same served payload the endpoint returns → the same version the teacher stamps
    const wsChanged = keyVersionHash(ANSWER_KEY_DOC.answerKey, { 'WS-U1L1-Q1': 'different' });
    expect(wsChanged).not.toBe(a);
  });
});
