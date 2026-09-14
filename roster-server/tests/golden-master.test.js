// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootGoldenApp } from './golden/boot.js';
import { firstDiffPath } from './golden/firstDiffPath.js';
import { stripVolatile, VOLATILE_VERSION } from './golden/volatile.js';

const SYNTHETIC_DIR = new URL('./fixtures/golden-synthetic/', import.meta.url);
const LOCAL_DIR = new URL('./fixtures/golden-local/', import.meta.url);
const FIXTURE_FILES = ['students.json', 'inputs.json', 'expected.json'];

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

function defineOracleTests(describeOracle, label, fixture) {
  describeOracle(label, () => {
    let app;

    beforeAll(async () => {
      app = await bootGoldenApp({
        studentsDoc: fixture.studentsDoc,
        inputs: fixture.inputs,
        configOverrides: fixture.inputs.configOverrides,
      });
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it('uses the current volatile-field contract', () => {
      expect(
        fixture.expected.volatileVersion,
        'stripVolatile changed; regenerate the golden fixture',
      ).toBe(VOLATILE_VERSION);
    });

    it('matches GET /grade for every fixture student', async () => {
      const fixtureIds = fixture.studentsDoc.students
        .map((student) => student.id)
        .sort(compareCodePoints);
      const expectedIds = Object.keys(fixture.expected.perStudent).sort(compareCodePoints);
      expect(expectedIds).toEqual(fixtureIds);

      for (const student of fixture.studentsDoc.students) {
        const actual = stripVolatile(await app.getStudentGrade(student.id));
        expectGoldenEqual(
          actual,
          fixture.expected.perStudent[student.id],
          `GET /grade for ${student.id}`,
        );
      }
    });

    it('matches GET /class/grades', async () => {
      const actual = stripVolatile(await app.getClassGrades());
      expectGoldenEqual(actual, fixture.expected.classGrades, 'GET /class/grades');
    });
  });
}

const syntheticFixture = loadFixture(SYNTHETIC_DIR);
defineOracleTests(describe, 'synthetic grade HTTP golden master', syntheticFixture);

const localReady = FIXTURE_FILES.every((filename) => existsSync(new URL(filename, LOCAL_DIR)));
const localFixture = localReady ? loadFixture(LOCAL_DIR) : null;
const describeLocal = localReady ? describe : describe.skip;
defineOracleTests(
  describeLocal,
  localReady
    ? 'local real-data grade HTTP golden master'
    : 'local real-data golden master unavailable; build with node scripts/build-golden-fixture.mjs --accept',
  localFixture,
);

if (localReady) {
  describe('local real-data fixture privacy contract', () => {
    it('keeps identities pseudonymous and responses narrowly bounded', () => {
      expect(JSON.stringify(localFixture.studentsDoc)).not.toContain('@');

      for (const student of localFixture.studentsDoc.students) {
        expect(student.id).toMatch(/^gm-[0-9a-f]{12}$/);
        for (const record of student.records) {
          const mayKeepResponse = record.source === 'curriculum_quiz' || (
            record.source === 'pc' &&
            /^U\d+-PC-/i.test(record.item_id) &&
            !/-PAPER$/i.test(record.item_id)
          );
          if (!mayKeepResponse) {
            expect(record.response, `${student.id} ${record.item_id}`).toBeNull();
            continue;
          }
          if (record.response !== null) {
            expect(record.response, `${student.id} ${record.item_id}`).toMatch(
              /^[a-z0-9][a-z0-9 .,\/-]{0,7}$/,
            );
          }
        }
      }
    });
  });
}

async function firstPerturbedDifference({ studentsDoc, inputs, configOverrides }) {
  const app = await bootGoldenApp({ studentsDoc, inputs, configOverrides });
  try {
    for (const student of studentsDoc.students) {
      const actual = stripVolatile(await app.getStudentGrade(student.id));
      const path = firstDiffPath(actual, syntheticFixture.expected.perStudent[student.id]);
      if (path !== null) return { studentId: student.id, path };
    }
    return null;
  } finally {
    await app.close();
  }
}

function expectReadableDifference(difference, label) {
  expect(difference, `${label} must change at least one synthetic student`).not.toBeNull();
  expect(
    difference.path,
    `${label} first difference for ${difference.studentId} must be a readable JSON path`,
  ).toMatch(/^\$(?:\.|\[)/);
}

describe('synthetic golden master has teeth', () => {
  it('detects an isolated v3WorkWeights perturbation', async () => {
    const difference = await firstPerturbedDifference({
      studentsDoc: syntheticFixture.studentsDoc,
      inputs: syntheticFixture.inputs,
      configOverrides: {
        ...syntheticFixture.inputs.configOverrides,
        v3WorkWeights: { lessons: 0.05, quizzes: 0.75, posters: 0.10, blooket: 0.10 },
      },
    });
    expectReadableDifference(difference, 'v3WorkWeights perturbation');
  });

  

  

  it('detects an isolated Blooket make-up score perturbation', async () => {
    const studentsDoc = structuredClone(syntheticFixture.studentsDoc);
    const target = studentsDoc.students.find(
      (student) => student.id === 'synthetic-12-blooket-makeup',
    );
    const record = target.records.find(
      (entry) => entry.item_id === 'BL-U1-L1-DESK_DONE',
    );
    record.score = 79;

    const difference = await firstPerturbedDifference({
      studentsDoc,
      inputs: syntheticFixture.inputs,
      configOverrides: syntheticFixture.inputs.configOverrides,
    });
    expectReadableDifference(difference, 'Blooket make-up score perturbation');
  });

  it('detects an isolated quiz-credit answer-key perturbation', async () => {
    const inputs = structuredClone(syntheticFixture.inputs);
    inputs.answerKey.answerKey['U1-L1-Q1'].answerKey = 'b';

    const difference = await firstPerturbedDifference({
      studentsDoc: syntheticFixture.studentsDoc,
      inputs,
      configOverrides: syntheticFixture.inputs.configOverrides,
    });
    expectReadableDifference(difference, 'quiz-credit perturbation');
  });
});
