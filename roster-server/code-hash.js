import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_FILES = [
  'grade.js',
  'scoring.js',
  'lesson-grade.js',
  'grade-config.js',
  'gradebook-grid.js',
];

export function codeHash() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const hash = crypto.createHash('sha256');
  for (const name of ENGINE_FILES) {
    hash.update(name, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(readFileSync(resolve(dir, name)));
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

export const GRADE_ENGINE_FILES = Object.freeze([...ENGINE_FILES]);
