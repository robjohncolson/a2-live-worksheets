#!/usr/bin/env node
// Copies the files roster-server shares with the browser into roster-server/,
// because Railway deploys roster-server as its root (see data/lineage.json).
// Pinned byte-identical by roster-server/tests/deployment.test.js.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER_SHARED = [
  ['lib/a2-answers.js', 'roster-server/lib/a2-answers.js'],
  ['content/a2/lessons.json', 'roster-server/data/a2-lessons.json'],
  ['data/a2-lesson-targets.json', 'roster-server/data/a2-lesson-targets.json'],
  ['data/a2-school-year.json', 'roster-server/data/a2-school-year.json'],
  ['lib/a2-year-plan.js', 'roster-server/lib/a2-year-plan.js'],
];

for (const [from, to] of SERVER_SHARED) {
  mkdirSync(dirname(resolve(ROOT, to)), { recursive: true });
  copyFileSync(resolve(ROOT, from), resolve(ROOT, to));
  console.log(`${from} -> ${to}`);
}
