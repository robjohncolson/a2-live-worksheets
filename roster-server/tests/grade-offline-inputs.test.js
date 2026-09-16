// Offline inputs must hide unanswered keys and reproduce retained A2 grades.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { buildRedactedKey, REDACTION_SENTINEL, mountOfflineInputs } from '../grade-offline-inputs.js';
import { computeGrade } from '../grade.js';
import { A2_CATEGORIES } from '../district-grade.js';

const ANSWER_KEY = {
  'A2-1-1-CHECK-1': { answerKey: '4', unit: 1 },
  'A2-1-1-CHECK-2': { answerKey: 'B', unit: 1 },
  'A2-1-1-CHECK-3': { answerKey: '7', unit: 1 },
  'WS-A2-1-1-reflect1': { answerKey: null, unit: 1 },
};
const CONFIG = {
  useDistrictFormula: true, useV3: false, dueAfterLessonDay: true,
  schoolTz: 'America/New_York', a2Categories: A2_CATEGORIES,
  quarters: { Q1: { units: [1], start: '2026-09-02', end: '2026-11-06' } },
  v3WorkWeights: { lessons: 3 / 7, quizzes: 3 / 7, blooket: 1 / 7 },
  v3Gates: { floor: 0.4, ceiling: 0.7 },
};
const OPTIONS = {
  section: 'PeriodC', asOf: '2026-09-25T12:00:00-04:00',
  lessonSchedule: {
    '1.1': { unit: 1, worksheetKey: '1', periods: { C: '2026-09-22', D: '2026-09-23', G: '2026-09-23' },
      items: [
        { source: 'lesson-check', itemId: 'LC-1-1' },
        { source: 'try-it', itemId: 'TI-1-1-1' },
        { source: 'flashcard', itemId: 'BL-U1-L1-DESK_DONE' },
      ] },
  },
  eventSchedule: { topicAssessments: [
    { source: 'topic-assessment', itemId: 'TA-1', dueDate: '2026-09-24' },
  ] },
  worksheetBlankCounts: {}, blooketLessons: ['1.1'], blooketPresence: ['1.1'],
  blooketRequired: ['1.1'], blooketBonusTopics: [],
};
const ROWS = [
  { source: 'lesson-check', item_id: 'LC-1-1', score: 8 },
  { source: 'try-it', item_id: 'TI-1-1-1', score: 2 },
  { source: 'flashcard', item_id: 'BL-U1-L1-DESK_DONE', score: 100 },
  { source: 'topic-assessment', item_id: 'TA-1', score: 75 },
  { source: 'worksheet', item_id: 'A2-1-1-CHECK-1', response: '4', score: 1 },
  { source: 'worksheet', item_id: 'A2-1-1-CHECK-2', response: 'A', score: 0 },
].map(row => ({ student_id: 'student-c', attempt: 1, recorded_at: '2026-09-24T16:00:00Z', ...row }));

describe('redacted A2 offline inputs', () => {
  for (const mode of ['district', 'v3']) {
    const config = { ...CONFIG, useDistrictFormula: mode === 'district', useV3: mode === 'v3' };
    for (const [name, rows] of [['empty', []], ['partial', ROWS.slice(0, 2)], ['mixed', ROWS]]) {
      it(mode + ': redacted and real inputs agree for ' + name + ' work', () => {
        const real = computeGrade(rows, ANSWER_KEY, config, OPTIONS);
        const offline = computeGrade(rows, buildRedactedKey(ANSWER_KEY, rows), config, OPTIONS);
        expect(offline).toEqual(real);
        expect(offline.formula).toBe(mode);
        expect(offline.items).toHaveLength(4);
        expect(offline.quarters.Q1.quarterGrade).not.toBeNull();
      });
    }
  }

  it('reveals only correct responses while preserving IDs, metadata and gradability', () => {
    const original = JSON.stringify(ANSWER_KEY);
    const redacted = buildRedactedKey(ANSWER_KEY, ROWS);
    expect(Object.keys(redacted)).toEqual(Object.keys(ANSWER_KEY));
    expect(redacted['A2-1-1-CHECK-1']).toEqual({ answerKey: '4', unit: 1 });
    expect(redacted['A2-1-1-CHECK-2'].answerKey).toBe(REDACTION_SENTINEL);
    expect(redacted['A2-1-1-CHECK-3'].answerKey).toBe(REDACTION_SENTINEL);
    expect(redacted['WS-A2-1-1-reflect1']).toEqual({ answerKey: null, unit: 1 });
    expect(JSON.stringify(ANSWER_KEY)).toBe(original);
  });

  it('redacts an earlier correct answer after a newer incorrect response', () => {
    const rows = [
      ROWS[4],
      { ...ROWS[4], response: '5', attempt: 2, recorded_at: '2026-09-25T16:00:00Z' },
    ];
    expect(buildRedactedKey(ANSWER_KEY, rows)['A2-1-1-CHECK-1'].answerKey).toBe(REDACTION_SENTINEL);
  });
});

describe('GET /grade/offline-inputs', () => {
  let server, baseUrl;
  const getLedgerByStudent = vi.fn(async () => ({ data: ROWS }));
  beforeAll(async () => {
    const app = express();
    mountOfflineInputs(app, {
      verifyToken: token => token === 'good' ? 'student-c' : null,
      ledgerDb: { getLedgerByStudent },
      loadAnswerKey: async () => ({ answerKey: ANSWER_KEY }),
      db: { findByStudentId: async () => ({ data: { section: 'PeriodC' } }) },
      config: CONFIG, ...OPTIONS,
    });
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = 'http://127.0.0.1:' + server.address().port;
  });
  afterAll(() => new Promise(resolve => server.close(resolve)));

  it('rejects missing and invalid tokens', async () => {
    for (const query of ['', '?token=bad']) {
      const response = await fetch(baseUrl + '/grade/offline-inputs' + query);
      expect(response.status).toBe(401);
    }
  });

  it('uses the bearer identity even when another student is requested', async () => {
    const response = await fetch(baseUrl + '/grade/offline-inputs?studentId=student-d', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(response.status).toBe(200);
    expect(getLedgerByStudent).toHaveBeenLastCalledWith('student-c');
    const body = await response.json();
    expect(body.section).toBe('PeriodC');
    expect(body.redactedKey).toEqual(buildRedactedKey(ANSWER_KEY, ROWS));
  });

  it('ships the inputs needed to reproduce a nonempty district grade', async () => {
    const response = await fetch(baseUrl + '/grade/offline-inputs?token=good');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.schedule).toEqual(OPTIONS.lessonSchedule);
    expect(body.eventSchedule).toEqual(OPTIONS.eventSchedule);
    expect(body.blooketPresence).toEqual(['1.1']);
    expect(body.blooketRequired).toEqual(['1.1']);
    expect(body.blooketBonusTopics).toEqual([]);
    const offline = computeGrade(ROWS, body.redactedKey, body.config, {
      lessonSchedule: body.schedule, eventSchedule: body.eventSchedule,
      section: body.section, asOf: OPTIONS.asOf,
      worksheetBlankCounts: body.worksheetBlankCounts,
      blooketPresence: body.blooketPresence, blooketRequired: body.blooketRequired,
      blooketBonusTopics: body.blooketBonusTopics,
    });
    expect(offline).toEqual(computeGrade(ROWS, ANSWER_KEY, CONFIG, OPTIONS));
    expect(offline.lessons[0]).toMatchObject({
      lessonKey: '1.1', lessonCheck: 80, flashcardPassed: true,
      tryIts: { scored: 1, total: 1, points: 2 },
    });
  });
});
