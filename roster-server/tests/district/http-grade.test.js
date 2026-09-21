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
  const collected = () => ({ '1-1': {
    unit: 1, periods: { C: '2026-09-22', D: '2026-09-23', G: '2026-09-24' },
    assignedDates: { C: '2026-09-22', D: '2026-09-23', G: '2026-09-24' },
    items: [
      { itemId: 'TI-1', source: 'try-it' },
      { itemId: 'Q-1', source: 'quiz' },
      { itemId: 'DE-1', source: 'daily-engagement' },
    ],
  } });

  it('uses the production default without exposing unassigned work', async () => {
    expect(PHASE3_CONFIG.useDistrictFormula).toBe(true);
    expect(PHASE3_CONFIG.useV3).toBe(false);
    await start();
    const grade = await grades();
    expect(grade.items).toEqual([]);
    expect(grade.quarters.Q1.quarterGrade).toBeNull();
  });

  it.each(['C', 'D', 'G'])('applies 50/40/10 on all HTTP surfaces for %s', async section => {
    const lessons = collected();
    fill({ 'try-it': 5, quiz: 16, 'daily-engagement': 0 }, lessons);
    await start(lessons);
    const grade = await grades(section);
    expect(grade.quarters.Q1.quarterGrade).toBeCloseTo(60);
    expect(grade.quarters.Q1.categoryBreakdown).toMatchObject({
      assessments: { possible: 20, count: 1, minimum: 4, minimumMet: false },
      assignments: { possible: 10, count: 1, minimum: 10, minimumMet: false },
      engagement: { possible: 10, count: 1, minimum: 10, minimumMet: false },
    });
  });

  it.each(['C', 'D', 'G'])('exposes a provisional zero exactly seven days after collection in %s', async section => {
    const lessons = collected();
    lessons['1-1'].items = [{ itemId: 'TI-1', source: 'try-it' }];
    await start(lessons);
    const collectedAt = Date.parse(lessons['1-1'].assignedDates[section] + 'T04:00:00Z');
    vi.setSystemTime(new Date(collectedAt + 7 * 86400000 - 1));
    expect((await grades(section)).quarters.Q1.quarterGrade).toBeNull();
    vi.setSystemTime(new Date(collectedAt + 7 * 86400000));
    const grade = await grades(section);
    expect(grade.quarters.Q1.quarterGrade).toBe(0);
    expect(grade.items[0]).toMatchObject({ provisional: true, attempted: false });
    expect(grade.gradebook.quarters.Q1.cells['TI-1']).toBe(0);
    expect(grade.gradebook.quarters.Q1.columns[0].provisional).toBe(true);
    ledger[`district-${section}`].push(record(lessons['1-1'].items[0], 8));
    const recovered = await grades(section);
    expect(recovered.quarters.Q1.quarterGrade).toBe(80);
    expect(recovered.items[0].provisional).toBe(false);
  });

  it('uses latest scores and does not invent absent Engagement days', async () => {
    const lessons = collected();
    ledger['district-C'] = [record(lessons['1-1'].items[0], 10),
      record(lessons['1-1'].items[0], 8, 2), record(lessons['1-1'].items[1], 20),
      record(lessons['1-1'].items[1], 16, 2)];
    await start(lessons);
    const grade = await grades();
    expect(grade.quarters.Q1.quarterGrade).toBe(80);
    expect(grade.quarters.Q1.categoryBreakdown.engagement.possible).toBe(0);
    expect(grade.items).toHaveLength(2);
  });
});
