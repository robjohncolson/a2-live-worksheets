// @vitest-environment node

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootGoldenApp } from './golden/boot.js';
import { firstDiffPath } from './golden/firstDiffPath.js';
import { stripVolatile, VOLATILE_VERSION } from './golden/volatile.js';

const SYNTHETIC_DIR = new URL('./fixtures/golden-synthetic/', import.meta.url);

function compareCodePoints(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function loadJson(directory, filename) {
  return JSON.parse(readFileSync(new URL(filename, directory), 'utf8'));
}

function loadFixture(directory) {
  return {
    studentsDoc: loadJson(directory, 'students.json'),
    inputs: loadJson(directory, 'inputs.json'),
    expected: loadJson(directory, 'expected.json'),
  };
}

function expectGoldenEqual(actual, expected, label) {
  const difference = firstDiffPath(actual, expected);
  expect(
    difference,
    `${label} differs at ${difference ?? '$'}; regenerate only after reviewing the grade change`,
  ).toBeNull();
}

const fixture = loadFixture(SYNTHETIC_DIR);

// Compare the stable public grade contract, with readable paths on failure.
// Six decimals ignore floating-point representation without hiding point changes.
function rounded(value) {
  return value == null ? value : Math.round(value * 1e6) / 1e6;
}

function gradeProjection(response) {
  const grade = stripVolatile(response);
  return {
    formula: grade.formula,
    yearGrade: rounded(grade.yearGrade),
    quarters: Object.fromEntries(Object.entries(grade.quarters).map(([key, quarter]) => [key, {
      quarterGrade: rounded(quarter.quarterGrade),
      ceiling: rounded(quarter.ceiling),
      ...(grade.formula === 'v3' && key === 'Q1' ? {
        masteryAvg: rounded(quarter.masteryAvg), workAvg: rounded(quarter.workAvg),
      } : {}),
    }])),
    categories: Object.fromEntries(Object.entries(grade.quarters.Q1.categoryBreakdown).map(([key, value]) => [key, [
      rounded(value.score), value.earned, value.possible, value.count, value.minimum, value.minimumMet,
    ]])),
    cells: grade.gradebook.quarters.Q1.cells,
  };
}

function defineOracleTests(mode) {
  describe(`synthetic A2 ${mode} HTTP golden master`, () => {
    let app;
    const expected = fixture.expected.perMode[mode];

    beforeAll(async () => {
      app = await bootGoldenApp({
        studentsDoc: fixture.studentsDoc,
        inputs: fixture.inputs,
        configOverrides: fixture.inputs.modes[mode],
        inProcess: true,
      });
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it('uses the current volatile-field contract and covers every fixture identity', () => {
      expect(fixture.expected.volatileVersion).toBe(VOLATILE_VERSION);
      expect(Object.keys(expected).sort(compareCodePoints)).toEqual(
        fixture.studentsDoc.students.map(student => student.id).sort(compareCodePoints),
      );
    });

    it.each(fixture.studentsDoc.students)('matches GET /grade for $id ($section)', async student => {
      const actual = await app.getStudentGrade(student.id);
      expect(actual.ok).toBe(true);
      expectGoldenEqual(gradeProjection(actual), expected[student.id], `${mode}: ${student.id}`);
      expect(actual.gradebook.weights).toEqual({ Assessments: 50, Assignments: 40, Engagement: 10 });
      if (mode === 'district') {
        expect(actual.items.map(item => item.maxPoints)).toEqual(student.records.length ? [10, 100] : []);
        return;
      }
      expect(actual.items).toHaveLength(4);
      expect(actual.items.every(item => item.due && item.quarter === 'Q1')).toBe(true);
      expect(actual.items.map(item => item.maxPoints)).toEqual([10, 2, 1, 100]);
      expect(actual.items.map(item => item.dueDate)).toEqual(Array(4).fill(
        fixture.inputs.lessonSchedule['1.1'].periods[student.section],
      ));
    });

    it('matches GET /class/grades for the same C/D/G roster', async () => {
      const actual = await app.getClassGrades();
      expect(actual.ok).toBe(true);
      expect(actual.students).toHaveLength(fixture.studentsDoc.students.length);
      const projected = Object.fromEntries(actual.students.map(student => [student.studentId, gradeProjection(student)]));
      expectGoldenEqual(projected, expected, `${mode}: GET /class/grades`);
      for (const student of actual.students) {
        expect(student.section).toBe(fixture.studentsDoc.students.find(row => row.id === student.studentId).section);
      }
    });
  });
}

for (const mode of ['district', 'v3']) defineOracleTests(mode);

async function firstPerturbedDifference({ mode, studentId, configOverrides = {}, studentsDoc = fixture.studentsDoc }) {
  const app = await bootGoldenApp({
    studentsDoc, inputs: fixture.inputs, inProcess: true,
    configOverrides: { ...fixture.inputs.modes[mode], ...configOverrides },
  });
  try {
    const actual = gradeProjection(await app.getStudentGrade(studentId));
    return { studentId, actual, path: firstDiffPath(actual, fixture.expected.perMode[mode][studentId]) };
  } finally {
    await app.close();
  }
}

function expectReadableDifference(difference, expectedGrade) {
  expect(difference.path, `${difference.studentId} must change a public grade value`).toMatch(/^\$(?:\.|\[)/);
  expect(difference.actual.quarters.Q1.quarterGrade).toBeCloseTo(expectedGrade, 6);
}

describe('A2 golden master has teeth', () => {
  it.each([
    ['floor', { v3Gates: { floor: 0.5, ceiling: 0.7 } }],
    ['cap', { v3Gates: { floor: 0.4, ceiling: 0.6 } }],
    ['weights', { v3WorkWeights: { lessons: 0.2, quizzes: 0.6, blooket: 0.2 } }],
  ])('detects an isolated v3 %s perturbation', async (name, configOverrides) => {
    const oracle = fixture.expected.perturbations[name];
    const difference = await firstPerturbedDifference({ mode: 'v3', studentId: oracle.studentId, configOverrides });
    expectReadableDifference(difference, oracle.quarterGrade);
  });

  it('retired flashcard changes cannot alter district grades', async () => {
    const studentsDoc = structuredClone(fixture.studentsDoc);
    const oracle = fixture.expected.perturbations.flashcard;
    const student = studentsDoc.students.find(row => row.id === oracle.studentId);
    student.records.find(row => row.source === 'flashcard').score = 79;
    const difference = await firstPerturbedDifference({ mode: 'district', studentId: student.id, studentsDoc });
    expect(difference.path).toBeNull();
  });

  it('counts missing work only after its section lesson day, including Wednesday', async () => {
    const studentsDoc = structuredClone(fixture.studentsDoc);
    studentsDoc.asOf = '2026-09-23';
    studentsDoc.students = studentsDoc.students.filter(student => ['a2-missing', 'a2-floor'].includes(student.id));
    for (const student of studentsDoc.students) student.records = [];
    for (const mode of ['district', 'v3']) {
      const app = await bootGoldenApp({ studentsDoc, inputs: fixture.inputs,
        configOverrides: fixture.inputs.modes[mode], inProcess: true });
      try {
        for (const student of studentsDoc.students) {
          const actual = await app.getStudentGrade(student.id);
          expect(actual.quarters.Q1.quarterGrade).toBeNull();
          expect(actual.items.every(item => !item.due)).toBe(true);
        }
      } finally {
        await app.close();
      }
    }
  });
});
