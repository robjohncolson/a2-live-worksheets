#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PHASE3_CONFIG } from '../grade-config.js';
import { bootGoldenApp } from '../tests/golden/boot.js';
import { stripVolatile, VOLATILE_VERSION } from '../tests/golden/volatile.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT = resolve(SERVER_DIR, 'tests', 'fixtures', 'golden-synthetic');
const AS_OF = '2026-10-15';
const RECORDED_AT = '2026-10-14T16:00:00.000Z';

const SCHEDULE = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2026-09-09', E: '2026-09-09' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2026-09-15', E: '2026-09-15' } },
  '1.5': { unit: 1, topicKey: '1.5', worksheetKey: '5', periods: { B: '2026-09-22', E: '2026-09-22' } },
  '2.1': { unit: 2, topicKey: '2.1', worksheetKey: '1', periods: { B: '2026-10-10', E: '2026-10-20' } },
  '3.1': { unit: 3, topicKey: '3.1', worksheetKey: '1', periods: { B: '2026-11-02', E: '2026-11-03' } },
};

const BLOOKET_TOPICS = ['1.1', '1.2', '1.5', '2.1', '3.1'];
const CONFIG_OVERRIDES = {
  useV3: true,
  v3AheadOfScheduleLessons: 'count-all',
};

function compareCodePoints(a, b) {
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function row(source, itemId, values = {}) {
  return {
    source,
    item_id: itemId,
    unit: values.unit ?? null,
    topic: values.topic ?? null,
    skill: values.skill ?? null,
    score: values.score ?? null,
    evidence_tier: values.evidenceTier ?? 'practice',
    attempt: values.attempt ?? 1,
    recorded_at: values.recordedAt ?? RECORDED_AT,
    graded_at: values.gradedAt ?? RECORDED_AT,
    response: values.response ?? null,
  };
}

function worksheet(unit, lesson, score = 1) {
  return row('worksheet', `WS-U${unit}L${lesson}-Q1`, { unit: `U${unit}`, score });
}

function deskDone(unit, lesson) {
  return row('worksheet', `WS-U${unit}-L${lesson}-DESK_DONE`, {
    unit: `U${unit}`,
    score: 1,
  });
}

function frq(unit, lesson, score = 1) {
  return row('frq', `WS-U${unit}L${lesson}-reflect1`, { unit: `U${unit}`, score });
}

function quiz(unit, lesson, response = 'a') {
  return row('curriculum_quiz', `U${unit}-L${lesson}-Q1`, {
    unit: `U${unit}`,
    response,
  });
}



function blooketGame(unit, lesson, score) {
  return row('blooket', `BLOOKET-U${unit}L${lesson}`, { unit: `U${unit}`, score });
}

function blooketMakeup(unit, lesson, score = 80) {
  return row('worksheet', `BL-U${unit}-L${lesson}-DESK_DONE`, {
    unit: `U${unit}`,
    score,
  });
}



function completeLesson(unit, lesson, options = {}) {
  const records = [
    worksheet(unit, lesson, options.worksheetScore ?? 1),
    frq(unit, lesson, options.frqScore ?? 1),
    quiz(unit, lesson, options.quizResponse ?? 'a'),
  ];
  if (options.blooketScore !== undefined) {
    records.push(blooketGame(unit, lesson, options.blooketScore));
  }
  return records;
}

function student(id, section, records) {
  return {
    id,
    section,
    records: records.slice().sort((a, b) => {
      const item = compareCodePoints(a.item_id, b.item_id);
      return item || compareCodePoints(a.source, b.source);
    }),
    reviews: [],
  };
}

function buildStudents() {
  const students = [
    student('synthetic-01-all-sources', 'PeriodB', [worksheet(1, 1, 1),
deskDone(1, 1),
frq(1, 1, 0.5),
quiz(1, 1, 'a'),
blooketGame(1, 1, 0.75),
blooketMakeup(1, 1, 80),
...completeLesson(2, 1, { worksheetScore: 0.5, frqScore: 0, quizResponse: 'b', blooketScore: 0.4 }),
...completeLesson(3, 1, { worksheetScore: 1, quizResponse: 'a', blooketScore: 0.9 })]),
    student('synthetic-02-floor-040', 'PeriodE', [...completeLesson(1, 1, { blooketScore: 1 }),
...completeLesson(1, 2, { blooketScore: 1 }),
...completeLesson(1, 5, { blooketScore: 1 })]),
    student('synthetic-03-ceiling-070', 'PeriodE', [worksheet(1, 1, 0),
quiz(1, 1, 'b'),
blooketGame(1, 1, 0),
worksheet(1, 2, 0),
quiz(1, 2, 'b'),
blooketGame(1, 2, 0),
worksheet(1, 5, 0),
quiz(1, 5, 'b'),
blooketGame(1, 5, 0)]),
    student('synthetic-04-weight-sensitive', 'PeriodE', [...completeLesson(1, 1, { quizResponse: 'b', blooketScore: 0.5 }),
...completeLesson(1, 2, { quizResponse: 'b', blooketScore: 0.5 }),
...completeLesson(1, 5, { quizResponse: 'b', blooketScore: 0.5 })]),
    student('synthetic-05-ahead', 'PeriodB', [...completeLesson(3, 1, { blooketScore: 0.8 })]),
    student('synthetic-06-behind', 'PeriodB', []),
    student('synthetic-07-quiz-right', 'PeriodE', [quiz(1, 1, 'a')]),
    student('synthetic-08-quiz-wrong', 'PeriodE', [quiz(1, 1, 'b')]),
    student('synthetic-09-empty-work', 'PeriodB', []),
    student('synthetic-10-blooket-game', 'PeriodE', [
      blooketGame(1, 1, 0.6),
      blooketMakeup(1, 1, 80),
    ]),
    student('synthetic-11-desk-done', 'PeriodE', [deskDone(1, 2)]),
    student('synthetic-12-blooket-makeup', 'PeriodE', [blooketMakeup(1, 1, 80)]),
    student('synthetic-13-period-b-due', 'PeriodB', [...completeLesson(2, 1, { blooketScore: 0.7 })]),
    student('synthetic-14-period-e-not-due', 'PeriodE', [...completeLesson(2, 1, { blooketScore: 0.7 })]),
    student('synthetic-15-worksheet', 'PeriodE', [worksheet(1, 5, 1)]),
    student('synthetic-16-units-1-3', 'PeriodB', [completeLesson(1, 2, { blooketScore: 0.2 })[0],
completeLesson(2, 1, { blooketScore: 0.4 })[1],
completeLesson(3, 1, { blooketScore: 0.6 })[2]]),
  ];

  return students.sort((a, b) => compareCodePoints(a.id, b.id));
}

function buildInputs() {
  const baseConfig = JSON.parse(JSON.stringify(PHASE3_CONFIG));
  baseConfig.useV3 = false;

  const answerKey = {};
  for (const [unit, lesson] of [[1, 1], [1, 2], [1, 5], [2, 1], [3, 1]]) {
    answerKey[`U${unit}-L${lesson}-Q1`] = { unit, answerKey: 'a' };
  }

  const productionGradeInputs = {
    year: 'SYNTHETIC',
    config: baseConfig,
    lessonSchedule: SCHEDULE,
    blooketPresence: BLOOKET_TOPICS,
    blooketRequired: BLOOKET_TOPICS,
    blooketBonusTopics: [],
    blooketTopics: BLOOKET_TOPICS,
  };

  return {
    schema: 'apstats-golden-synthetic-inputs/v1',
    answerKey: { schemaVersion: 1, answerKey },
    productionGradeInputs,
    lessonSchedule: SCHEDULE,
    worksheetBlankCounts: {
      '1.1': 1,
      '1.2': 1,
      '1.5': 1,
      '2.1': 1,
      '3.1': 1,
    },
    worksheetKey: null,
    configOverrides: CONFIG_OVERRIDES,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;

  const sorted = {};
  for (const key of Object.keys(value).sort(compareCodePoints)) {
    sorted[key] = stableValue(value[key]);
  }
  return sorted;
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(stableValue(value), null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function buildExpected(studentsDocIn, inputsIn) {
  // Round-trip through the EXACT bytes that will be written (stable key order):
  // the test re-reads those files, and floating-point sums over config objects
  // depend on key iteration order (0.452 vs 0.45199999999999996 was observed
  // when the builder used the in-memory objects). Same bytes in → same grades.
  const studentsDoc = JSON.parse(JSON.stringify(stableValue(studentsDocIn)));
  const inputs = JSON.parse(JSON.stringify(stableValue(inputsIn)));
  const app = await bootGoldenApp({
    studentsDoc,
    inputs,
    configOverrides: inputs.configOverrides,
    inProcess: true,
  });

  try {
    const perStudent = {};
    for (const studentEntry of studentsDoc.students) {
      perStudent[studentEntry.id] = stripVolatile(
        await app.getStudentGrade(studentEntry.id),
      );
    }
    return {
      volatileVersion: VOLATILE_VERSION,
      perStudent,
      classGrades: stripVolatile(await app.getClassGrades()),
    };
  } finally {
    await app.close();
  }
}

function parseOut(argv) {
  if (argv.length === 0) return DEFAULT_OUT;
  if (argv.length === 2 && argv[0] === '--out' && argv[1]) {
    return resolve(process.cwd(), argv[1]);
  }
  throw new Error('Usage: build-golden-synthetic.mjs [--out PATH]');
}

async function main() {
  const outDir = parseOut(process.argv.slice(2));
  const studentsDoc = {
    schema: 'apstats-golden-synthetic/v1',
    asOf: AS_OF,
    builtFrom: { generator: 'build-golden-synthetic.mjs/v1' },
    students: buildStudents(),
  };
  const inputs = buildInputs();
  const expected = await buildExpected(studentsDoc, inputs);

  await mkdir(outDir, { recursive: true });
  await writeJsonAtomic(resolve(outDir, 'students.json'), studentsDoc);
  await writeJsonAtomic(resolve(outDir, 'inputs.json'), inputs);
  await writeJsonAtomic(resolve(outDir, 'expected.json'), expected);

  const recordCount = studentsDoc.students.reduce(
    (total, entry) => total + entry.records.length,
    0,
  );
  console.log(`Synthetic golden fixture: ${studentsDoc.students.length} students, ${recordCount} records`);
  console.log(`Wrote: ${outDir}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`build-golden-synthetic: ${error.message}`);
    process.exitCode = 1;
  });
}
