import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server.js';
import { signToken } from '../../token.js';
import { PHASE3_CONFIG } from '../../grade-config.js';
import { loadA2Lessons, lessonScheduleFromModel } from '../../a2-lessons.js';

const TEACHER = 'district-http-teacher-fixture';
const roster = ['C', 'D', 'G'].map(section => ({
  student_id: `district-${section}`, login_username: `district-${section}`,
  real_name: `District ${section}`, section, role: 'student',
}));
const modelSchedule = lessonScheduleFromModel(loadA2Lessons());
// The authored model currently skips 1-3/1-4. These two synthetic lessons
// complete the requested six-lesson fixture without publishing any content.
const syntheticSchedule = lessonScheduleFromModel([3, 4].map(number => ({
  key: `1-${number}`, topic: 1,
  sections: number === 3
    ? { C: '2026-10-12', D: '2026-10-12', G: '2026-10-13' }
    : { C: '2026-10-19', D: '2026-10-21', G: '2026-10-21' },
  tryIts: Array.from({ length: 5 }, (_, index) => ({ n: index + 1 })),
})));
const schedule = Object.fromEntries([1, 2, 3, 4, 5, 6].map(number => {
  const key = `1-${number}`;
  return [key, modelSchedule[key] || syntheticSchedule[key]];
}));

let server;
let baseUrl;
let ledger;

beforeEach(() => {
  vi.stubEnv('ROSTER_TOKEN_SECRET', 'district-http-token-fixture');
  vi.stubEnv('TEACHER_KEY', TEACHER);
  // Keep sockets and timers real; only grading's school calendar is controlled.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T17:00:00Z'));
  ledger = Object.fromEntries(roster.map(student => [student.student_id, []]));
});

afterEach(async () => {
  if (server) {
    const closing = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closing;
    server = null;
  }
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function start(lessonSchedule = schedule) {
  const db = {
    async listRoster(section) {
      return { data: roster.filter(row => !section || row.section === section), error: null };
    },
    async findByStudentId(id) {
      return { data: roster.find(row => row.student_id === id) || null, error: null };
    },
    async getRoleByStudentId() { return 'student'; },
  };
  const ledgerDb = {
    async getLedgerByStudent(id) { return { data: ledger[id] || [], error: null }; },
    async updateLedgerReceipt() { return { error: null }; },
  };
  // Deliberately no configOverrides: HTTP routes must select production defaults.
  const app = createApp(db, ledgerDb, undefined, async () => ({ answerKey: {} }),
    undefined, undefined, null, lessonSchedule);
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

function record(item, score, attempt = 1) {
  return { source: item.source, item_id: item.itemId, score, attempt,
    recorded_at: `2026-09-03T12:00:0${attempt}Z` };
}

function fill(scores, lessonSchedule = schedule) {
  for (const student of roster) {
    ledger[student.student_id] = Object.values(lessonSchedule).flatMap(lesson =>
      lesson.items.map(item => record(item, scores[item.source])));
  }
}

async function get(path, headers) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  expect(response.status, path).toBe(200);
  const body = await response.json();
  expect(body.ok, path).toBe(true);
  return body;
}

// Every policy assertion also checks parity across all three HTTP consumers.
async function grades(section = 'C') {
  const id = `district-${section}`;
  const student = await get('/grade', { authorization: `Bearer ${signToken(id)}` });
  const teacher = await get(`/teacher/student/${id}/grade`, { 'x-teacher-secret': TEACHER });
  const classroom = await get('/class/grades', { 'x-teacher-secret': TEACHER });
  expect(classroom.students.map(row => row.section).sort()).toEqual(['C', 'D', 'G']);
  const grid = classroom.students.find(row => row.studentId === id);
  for (const response of [student, teacher, grid]) {
    expect(response.formula).toBe('district');
    expect(response.quarters).toEqual(student.quarters);
    expect(response.items).toEqual(student.items);
  }
  expect(grid.gradebook).toEqual(student.gradebook);
  expect(grid.gradebook.weights).toEqual({ Assessments: 50, Assignments: 40, Engagement: 10 });
  return student;
}

describe('production district formula through HTTP', () => {
  it('uses district=true with v3 absent, and defaults to district when both flags are unset', async () => {
    expect(process.env.USE_DISTRICT_FORMULA).toBe('true');
    expect(process.env.USE_V3_GRADING).toBeUndefined();
    expect(PHASE3_CONFIG.useDistrictFormula).toBe(true);
    expect(PHASE3_CONFIG.useV3).toBe(false);
    await start();
    await grades();
    vi.stubEnv('USE_DISTRICT_FORMULA', undefined);
    vi.resetModules();
    const { PHASE3_CONFIG: defaults } = await import('../../grade-config.js');
    expect(defaults.useDistrictFormula).toBe(true);
    expect(defaults.useV3).toBe(false);
  });

  it.each(['C', 'D', 'G'])('applies 50/40/10 weights in section %s without minimum-count padding', async section => {
    fill({ 'lesson-check': 8, 'try-it': 1, flashcard: 0 });
    await start();
    const grade = await grades(section);
    expect(grade.lessons.map(lesson => lesson.lessonKey)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']);
    expect(grade.quarters.Q1.quarterGrade).toBeCloseTo(60, 10); // .5*80 + .4*50 + .1*0
    expect(grade.quarters.Q1.categoryBreakdown).toMatchObject({
      assessments: { score: 80, count: 6, minimum: 4, minimumMet: true },
      assignments: { score: 50, count: 27, minimum: 10, minimumMet: true },
      engagement: { score: 0, count: 6, minimum: 10, minimumMet: false },
    });
  });

  it('reports unmet minima without lowering perfect work or adding phantom denominators', async () => {
    vi.setSystemTime(new Date('2026-09-26T17:00:00Z'));
    fill({ 'lesson-check': 10, 'try-it': 2, flashcard: 100 });
    await start();
    const grade = await grades();
    expect(grade.quarters.Q1.quarterGrade).toBe(100);
    expect(grade.quarters.Q1.categoryBreakdown).toMatchObject({
      assessments: { count: 1, possible: 10, minimum: 4, minimumMet: false },
      assignments: { count: 5, possible: 10, minimum: 10, minimumMet: false },
      engagement: { count: 1, possible: 1, minimum: 10, minimumMet: false },
    });
  });

  it.each([false, true])('minimum flags switch at exactly 4/10/10 (at threshold: %s)', async atThreshold => {
    const boundary = structuredClone(schedule);
    // Synthetic distinct decks let the six-lesson fixture reach ten engagements.
    boundary['1-1'].items.push(...[7, 8, 9, 10].map(n => ({
      source: 'flashcard', itemId: `BL-U1-L${n}-DESK_DONE`,
    })));
    const remaining = { 'lesson-check': atThreshold ? 4 : 3,
      'try-it': atThreshold ? 10 : 9, flashcard: atThreshold ? 10 : 9 };
    for (const lesson of Object.values(boundary)) {
      lesson.items = lesson.items.filter(item => remaining[item.source]-- > 0);
    }
    fill({ 'lesson-check': 10, 'try-it': 2, flashcard: 100 }, boundary);
    await start(boundary);
    const grade = await grades();
    expect(grade.quarters.Q1.quarterGrade).toBe(100);
    for (const [category, minimum] of Object.entries({ assessments: 4, assignments: 10, engagement: 10 })) {
      expect(grade.quarters.Q1.categoryBreakdown[category]).toMatchObject({
        count: atThreshold ? minimum : minimum - 1, minimum, minimumMet: atThreshold,
      });
    }
  });

  it.each(['C', 'D', 'G'])('counts missing work only after section %s finishes its lesson day', async section => {
    await start();
    const day = modelSchedule['1-1'].periods[section];
    const midnight = Date.parse(`${day}T04:00:00Z`);
    for (const instant of [midnight - 1, midnight, midnight + 86400000 - 1]) {
      vi.setSystemTime(new Date(instant));
      const grade = await grades(section);
      expect(grade.quarters.Q1.quarterGrade).toBeNull();
      expect(grade.items.every(item => !item.due)).toBe(true);
    }
    vi.setSystemTime(new Date(midnight + 86400000));
    const grade = await grades(section);
    expect(grade.quarters.Q1.quarterGrade).toBe(0);
    expect(grade.quarters.Q1.categoryBreakdown).toMatchObject({
      assessments: { earned: 0, possible: 10 }, assignments: { earned: 0, possible: 10 },
      engagement: { earned: 0, possible: 1 },
    });
    expect(grade.items.filter(item => item.due)).toHaveLength(7);
    expect(grade.gradebook.quarters.Q1.cells['LC-1-1']).toBeNull();
    expect(grade.gradebook.quarters.Q1.schoologyTotal).toBeNull();
  });

  it('keeps the best check, improves Try-Its by rescore, and counts a passed deck once', async () => {
    vi.setSystemTime(new Date('2026-09-26T17:00:00Z'));
    fill({ 'lesson-check': 8, 'try-it': 1, flashcard: 79 });
    await start();
    expect((await grades()).quarters.Q1.quarterGrade).toBeCloseTo(60, 10);
    const check = { source: 'lesson-check', itemId: 'LC-1-1' };
    const tryIt = { source: 'try-it', itemId: 'TI-1-1-1' };
    const deck = { source: 'flashcard', itemId: 'BL-U1-L1-DESK_DONE' };
    ledger['district-C'].push(record(check, 10, 2), record(check, 4, 3),
      record(tryIt, 2, 2), record(deck, 80, 2), record(deck, 100, 3));
    const grade = await grades();
    expect(grade.quarters.Q1.quarterGrade).toBeCloseTo(84, 10); // 50 + 24 + 10
    expect(grade.gradebook.quarters.Q1.cells).toMatchObject({
      'LC-1-1': 10, 'TI-1-1-1': 2, 'BL-U1-L1-DESK_DONE': 1,
    });
    expect(grade.quarters.Q1.categoryBreakdown.engagement).toMatchObject({ earned: 1, possible: 1, count: 1 });
    // Try-Its use the latest teacher rescore, unlike best-score lesson checks.
    ledger['district-C'].push(record(tryIt, 0, 3));
    expect((await grades()).gradebook.quarters.Q1.cells['TI-1-1-1']).toBe(0);
  });

  it('treats September 18 as only-raise and September 19 as required', async () => {
    const bonusSchedule = structuredClone(schedule);
    for (const [key, date] of Object.entries({ '1-1': '2026-09-18', '1-2': '2026-09-19' })) {
      bonusSchedule[key].periods = { C: date, D: date, G: date };
    }
    vi.setSystemTime(new Date('2026-09-20T17:00:00Z'));
    fill({ 'lesson-check': 5, 'try-it': 1, flashcard: 100 }, { '1-2': bonusSchedule['1-2'] });
    await start(bonusSchedule);
    const baseline = await grades();
    expect(baseline.quarters.Q1.quarterGrade).toBeCloseTo(55, 10);
    expect(baseline.quarters.Q1.categoryBreakdown.assessments).toMatchObject({
      earned: 5, possible: 10, bonusWindowExcluded: 1,
    });
    ledger['district-C'].push(...bonusSchedule['1-1'].items.map(item => record(item, 0)));
    const lower = await grades();
    expect(lower.quarters.Q1.quarterGrade).toBeCloseTo(55, 10);
    expect(lower.quarters.Q1.categoryBreakdown.assessments.bonusWindowIgnored).toEqual({ count: 1, itemIds: ['LC-1-1'] });
    ledger['district-C'].push(...bonusSchedule['1-1'].items.map(item =>
      record(item, { 'lesson-check': 10, 'try-it': 2, flashcard: 100 }[item.source], 2)));
    const raised = await grades();
    expect(raised.quarters.Q1.quarterGrade).toBeCloseTo(0.5 * 75 + 0.4 * (1600 / 22) + 10, 10);
    expect(raised.quarters.Q1.quarterGrade).toBeGreaterThan(baseline.quarters.Q1.quarterGrade);
    // A second student leaves September 19 missing: its denominator is required.
    ledger['district-D'] = [];
    const missing = await grades('D');
    expect(missing.quarters.Q1.quarterGrade).toBe(0);
    expect(missing.quarters.Q1.categoryBreakdown.assessments).toMatchObject({
      earned: 0, possible: 10, count: 1, bonusWindowExcluded: 1,
    });
  });
});
