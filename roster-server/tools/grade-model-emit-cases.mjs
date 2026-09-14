import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  quarterGradeV3,
  workAvgV3,
  V3_WORK_WEIGHTS,
  V3_GATES,
} from '../lesson-grade.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..', '..');
const outPath = resolve(rootDir, 'formal', 'grade-model', 'cases.json');

function makePrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function maybeTrack(rng) {
  if (rng() < 0.18) return null;
  return Math.round(rng() * 10000) / 10000;
}

function randomWorkFromTracks(rng) {
  return workAvgV3({
    lessons: maybeTrack(rng),
    quizzes: maybeTrack(rng),
    blooket: maybeTrack(rng),
  }, V3_WORK_WEIGHTS);
}

function combineV3(pcAvg, workAvg, gates = V3_GATES) {
  if (pcAvg == null && workAvg == null) return null;
  if (pcAvg == null) return workAvg;
  if (workAvg == null) return pcAvg;
  return quarterGradeV3(pcAvg, workAvg, gates);
}

function to100(x) {
  return x == null ? null : Math.round(x * 1000) / 10;
}

const rng = makePrng(0x5eedc0de);
const edgeValues = [null, 0, 0.001, 0.3999, 0.4, 0.4001, 0.5, 0.7, 0.9999, 1];
const cases = [];

for (const pc of edgeValues) {
  for (const work of edgeValues) {
    cases.push({ pc, work, expected: to100(combineV3(pc, work)) });
  }
}

while (cases.length < 1000) {
  const pc = maybeTrack(rng);
  const work = rng() < 0.5 ? maybeTrack(rng) : randomWorkFromTracks(rng);
  cases.push({ pc, work, expected: to100(combineV3(pc, work)) });
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(cases, null, 2)}\n`);

console.log(`Wrote ${cases.length} cases to formal/grade-model/cases.json`);
