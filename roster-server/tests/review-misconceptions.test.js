import { it, expect, vi } from 'vitest';
import { mountReview } from '../review.js';
import { getTeacherKey } from '../teacher-auth.js';

// Only content assets are synthetic; the review route and misconception engine are real.
vi.mock('../misconception-assets.js', () => ({
  loadMisconceptionAssets: answerKey => ({
    answerKey,
    vocabulary: { reviewed: true, tags: {
      'distribution-sign': { label: 'Loses a negative sign when distributing', skills: ['1.A'] },
    } },
    rubricMap: { reviewed: true, rubrics: {}, items: {} },
    distractorMap: { reviewed: true, items: {
      'U1-L1-Q01': { D: ['distribution-sign'] },
      'U1-L2-Q01': { A: ['distribution-sign'] },
    } },
  }),
}));

it('adds the same persistent misconception computation to the by-item review window', async () => {
  const routes = {};
  const now = Date.now();
  const db = {
    listRoster: async () => ({ data: [{ student_id: 'one', login_username: 'one', section: 'G' }] }),
    listReviewMarksByStudents: async () => ({ data: [] }),
  };
  const ledgerDb = { getLedgerByStudent: async () => ({ data: [
    { student_id: 'one', source: 'quiz', item_id: 'U1-L1-Q01', response: 'D', recorded_at: new Date(now - 6 * 86400000).toISOString() },
    { student_id: 'one', source: 'quiz', item_id: 'U1-L2-Q01', response: 'A', recorded_at: new Date(now - 86400000).toISOString() },
  ] }) };
  mountReview({ get: (path, handler) => { routes[path] = handler; }, post() {} }, {
    db, ledgerDb, loadAnswerKey: async () => ({answerKey: {'U1-L1-Q01': {answerKey: 'B', topic:'1.1'}, 'U1-L2-Q01': {answerKey:'B', topic:'1.2'}}}),
  });
  let payload;
  await routes['/class/review-by-item']({ headers: { 'x-teacher-secret': getTeacherKey() }, query: { section: 'G', days: '14' } },
    { json: value => { payload = value; }, status() { return this; } });
  expect(payload.ok).toBe(true);
  expect(payload.topMisconceptions).toEqual([{ key: 'distribution-sign',
    label: 'Loses a negative sign when distributing', students: 1 }]);
  expect(payload.frequent[0]).toMatchObject({ key: 'distribution-sign', students: 1, events: 2 });
});

it('returns frequent evidence when the review window has no persistent misconceptions', async () => {
  const routes = {};
  const db = {
    listRoster: async () => ({ data: [{ student_id: 'one', section: 'G' }] }),
    listReviewMarksByStudents: async () => ({ data: [] }),
  };
  const ledgerDb = { getLedgerByStudent: async () => ({ data: [
    { student_id: 'one', source: 'curriculum_quiz', item_id: 'U1-L4-Q01', response: 'A', recorded_at: new Date().toISOString() },
  ] }) };
  mountReview({ get: (path, handler) => { routes[path] = handler; }, post() {} }, {
    db, ledgerDb, loadAnswerKey: async () => ({ answerKey: { 'U1-L4-Q01': { answerKey: 'D', topic: '1.4' } } }),
  });
  let payload;
  await routes['/class/review-by-item']({ headers: { 'x-teacher-secret': getTeacherKey() }, query: { section: 'G', days: '14' } },
    { json: value => { payload = value; }, status() { return this; } });
  expect(payload.topMisconceptions).toEqual([]);
  expect(payload.frequent[0]).toMatchObject({ label: 'U1-L4-Q01 · chose A, correct D', students: 1, events: 1 });
});
