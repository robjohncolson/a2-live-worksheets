import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import { generateKeyPairSync } from 'node:crypto';
import { mountA2 } from '../a2-routes.js';
import { loadA2Lessons, lessonScheduleFromModel, overlayLessons, validatePacing } from '../a2-lessons.js';
import { computeGrade } from '../grade.js';
import { buildGradebook } from '../gradebook-grid.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { initReceipts } from '../receipts.js';
import { signToken } from '../token.js';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let app, rows, pacing, rescores, student, token, lesson, date, server, baseUrl;
function request() {
  return Object.fromEntries(['get', 'put', 'post'].map(method => [method, path => {
    const options = { method: method.toUpperCase(), headers: {} };
    const chain = {
      set(key, value) { options.headers[key] = value; return chain; },
      send(body) { options.body = JSON.stringify(body); options.headers['Content-Type'] = 'application/json'; return chain; },
      then(resolve, reject) {
        return fetch(baseUrl + path, options).then(async response => ({ status: response.status, body: await response.json() })).then(resolve, reject);
      },
    };
    return chain;
  }]));
}
beforeEach(async () => {
  vi.stubEnv('ROSTER_TOKEN_SECRET', 'phase4-test-secret');
  vi.stubEnv('TEACHER_KEY', 'phase4-teacher');
  const keys = generateKeyPairSync('ed25519');
  vi.stubEnv('RECEIPT_ISSUER_PRIVATE_KEY', keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  initReceipts();
  rows = []; pacing = {}; rescores = {}; date = '2026-09-13';
  student = { student_id: 'student-c', section: 'C', login_username: 'student-c', status: 'active' };
  token = signToken(student.student_id); lesson = loadA2Lessons()[0];
  const db = { findByStudentId: async id => ({ data: id === student.student_id ? student : null }),
    getRoleByStudentId: async () => 'student', updateStudent: async values => { student.section = values.section; return {}; } };
  const ledgerDb = {
    getLedgerByStudent: async () => ({ data: rows }),
    insertLedgerRow: async row => {
      const saved = { ledger_id: String(rows.length + 1), student_id: row.studentId, source: row.source, item_id: row.itemId,
        score: row.score, response: row.response, attempt: row.attempt, recorded_at: date + 'T12:00:00.000Z' };
      rows.push(saved); return { data: saved };
    },
    updateLedgerReceipt: async (id, receipt) => { Object.assign(rows.find(row => row.ledger_id === id), { receipt_compact: receipt.receiptCompact }); return {}; },
  };
  const store = { getPacing: async () => pacing, putPacing: async changes => Object.assign(pacing, changes),
    getRescores: async () => rescores, requestRescore: async (_id, item) => { rescores[item] = date + 'T13:00:00.000Z'; } };
  app = express(); app.use(express.json());
  mountA2(app, { db, ledgerDb, config: PHASE3_CONFIG, store, now: () => date });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs(); initReceipts(); });
const auth = r => r.set('Authorization', 'Bearer ' + token);
const teacher = r => r.set('x-teacher-secret', 'phase4-teacher');
const write = (source, itemId, score, requestId = Math.random().toString()) => teacher(request(app).post('/ledger/record'))
  .send({ studentId: student.student_id, source, itemId, score, requestId });

describe('A2 trusted writes and status', () => {
  it('scores all six registry items, ignores a forged score, keeps the best and retains signed attempts', async () => {
    const answers = Object.fromEntries(lesson.lessonCheck.map(item => [item.registryId, item.answer.split('|')[0]]));
    answers[lesson.lessonCheck[0].registryId] = 'wrong'; answers[lesson.lessonCheck[1].registryId] = 'wrong';
    const first = await auth(request(app).post('/ledger/record')).send({ source: 'lesson-check', itemId: 'LC-1-1', answers, score: 10, requestId: 'first' });
    expect(first.status).toBe(200); expect(first.body.correct).toBe(4); expect(first.body.score).toBeCloseTo(20 / 3);
    for (const item of lesson.lessonCheck) answers[item.registryId] = item.answer.split('|')[0];
    const second = await auth(request(app).post('/ledger/record')).send({ source: 'lesson-check', itemId: 'LC-1-1', answers, requestId: 'second' });
    expect(second.body.bestScore).toBe(10); expect(second.body.attempt).toBe(2);
    expect(rows.every(row => row.receipt_compact?.includes('.'))).toBe(true);
    const status = await auth(request(app).get('/lesson-status/1-1'));
    expect(status.body.lessonCheck).toBe(100);
    const schedule = lessonScheduleFromModel(overlayLessons([lesson], { '1-1': { sections: { C: '2026-09-10' } } }));
    const grade = computeGrade(rows, {}, { ...PHASE3_CONFIG, useDistrictFormula: true }, { lessonSchedule: schedule, section: 'C', asOf: new Date('2026-09-14T16:00:00Z') });
    expect(grade.quarters.Q1.quarterGrade).toBeNull();
    expect(buildGradebook(grade).quarters.Q1.cells['LC-1-1']).toBeUndefined();
    expect(grade.lessons[0].lessonCheck).toBeNull();
    const repeated = await auth(request(app).post('/ledger/record')).send({ source: 'lesson-check', itemId: 'LC-1-1', answers, requestId: 'second' });
    expect(repeated.body.duplicate).toBe(true); expect(rows).toHaveLength(2);
  });
  it('requires sign-in and all responses; students cannot enter teacher scores', async () => {
    expect((await request(app).get('/lesson-status/1-1')).status).toBe(401);
    expect((await auth(request(app).post('/ledger/record')).send({ source: 'try-it', itemId: 'TI-1-1-1', score: 2 })).status).toBe(403);
    expect((await auth(request(app).post('/ledger/record')).send({ source: 'lesson-check', itemId: 'LC-1-1', answers: {}, requestId: 'bad' })).status).toBe(400);
  });
  it('Try-It replacement can lower a score and rescore flags clear after later scoring', async () => {
    expect((await write('try-it', 'TI-1-1-1', 2)).status).toBe(200);
    expect((await auth(request(app).post('/ledger/rescore')).send({ itemId: 'TI-1-1-1' })).body.rescoreRequested).toBe(true);
    expect((await auth(request(app).get('/lesson-status/1-1'))).body.tryIts.scores[0].rescoreRequested).toBe(true);
    date = '2026-09-14'; await write('try-it', 'TI-1-1-1', 0);
    const status = (await auth(request(app).get('/lesson-status/1-1'))).body;
    expect(status.tryIts.points).toBe(0); expect(status.tryIts.scores[0].rescoreRequested).toBe(false);
    expect(rows).toHaveLength(2);
  });
  it('topic retakes replace instead of best-wins and close Try-It rescoring', async () => {
    await write('topic-assessment', 'TA-T1', 100); await write('topic-assessment', 'TA-T1', 65);
    expect(rows).toHaveLength(2);
    const grade = computeGrade(rows, {}, { ...PHASE3_CONFIG, useDistrictFormula: true }, { asOf: new Date('2026-09-14T16:00:00Z') });
    expect(grade.quarters.Q1.quarterGrade).toBeNull(); // Pre-Sep-19 work is Bonus only.
    expect((await write('try-it', 'TI-1-1-1', 2)).status).toBe(409);
  });
  it('rejects invalid scores and writes after the original quarter closes', async () => {
    expect((await write('try-it', 'TI-1-1-1', 1.5)).status).toBe(400);
    expect((await write('topic-assessment', 'TA-T1', 101)).status).toBe(400);
    await write('topic-assessment', 'TA-T1', 70); date = '2026-11-10';
    expect((await write('topic-assessment', 'TA-T1', 80)).status).toBe(409);
  });
  it('serializes concurrent attempts and deduplicates retry requests', async () => {
    await Promise.all([write('try-it', 'TI-1-1-1', 1, 'a'), write('try-it', 'TI-1-1-1', 2, 'b')]);
    expect(rows.map(row => row.attempt)).toEqual([1, 2]);
    await write('try-it', 'TI-1-1-1', 1, 'a'); expect(rows).toHaveLength(2);
  });
});
describe('pacing and profile', () => {
  it('teacher-only edits overlay dates and links without changing registry content', async () => {
    const changes = { lessons: [{ key: '1-1', sections: { C: '2026-09-14', D: '2026-09-16' }, onenoteUrl: 'https://example.com/notes' }] };
    expect((await auth(request(app).put('/teacher/lessons')).send(changes)).status).toBe(403);
    expect((await teacher(request(app).put('/teacher/lessons')).send(changes)).status).toBe(200);
    const published = (await request(app).get('/lessons')).body.lessons[0];
    expect(published.sections.C).toBe('2026-09-14'); expect(published.lessonCheck).toEqual(lesson.lessonCheck);
    expect(() => validatePacing([lesson], [{ key: '1-1', sections: { C: '2026-02-30' } }])).toThrow();
    expect(() => validatePacing([lesson], [{ key: '1-1', onenoteUrl: 'javascript:alert(1)' }])).toThrow();
  });
  it('teacher re-flow closes a lesson early for one section and shifts later lessons and assessments', async () => {
    const body = { section: 'C', lesson: '1-1', due: '2026-09-17' };
    expect((await auth(request(app).put('/teacher/pacing/reflow')).send(body)).status).toBe(403);
    expect((await teacher(request(app).put('/teacher/pacing/reflow')).send({ ...body, section: 'B' })).status).toBe(400);
    const response = await teacher(request(app).put('/teacher/pacing/reflow')).send(body);
    expect(response.status).toBe(200);
    const byKey = Object.fromEntries(response.body.lessons.map(item => [item.key, item]));
    expect(byKey['1-1'].sections).toEqual({ C: '2026-09-17', D: '2026-09-25', G: '2026-09-25' });
    expect(byKey['1-2'].sections.C).toBe('2026-10-01');          // opens Mon Sep 21, closes Fri Oct 2 -> last C day Thu Oct 1
    expect(byKey['1-2'].sections.D).toBe('2026-10-09');          // other sections untouched
    expect(pacing['TA-1'].sections.C < '2026-11-09').toBe(true); // Topic 1 assessment moves up with 1-6
    expect(pacing['2-1'].sections.C).toBeTruthy();               // planned lessons re-dated too
    expect(response.body.pacing['2-1']).toEqual(pacing['2-1']);
    expect((await request(app).get('/lessons')).body.lessons[0].sections.C).toBe('2026-09-17');
  });
  it('updates the signed-in student section only', async () => {
    expect((await auth(request(app).put('/student/section')).send({ section: 'G', studentId: 'other' })).status).toBe(200);
    expect(student.section).toBe('G');
    expect((await auth(request(app).put('/student/section')).send({ section: 'B' })).status).toBe(400);
  });
});
it('provisions pacing and roster-cascading rescore storage with RLS', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create role anon; create role authenticated; create role service_role; create table roster(student_id uuid primary key);');
    await pg.exec(readFileSync(new URL('../migrations/0038_a2_lessons.sql', import.meta.url), 'utf8'));
    const result = await pg.query("select relname from pg_class where relrowsecurity and relname like 'a2_%'");
    expect(result.rows.map(row => row.relname).sort()).toEqual(['a2_lesson_pacing', 'a2_rescore_requests']);
  } finally { await pg.close(); }
});

