// smoke-student-host-matrix.test.js — static pins on the W0 host-matrix smoke script.
// The script imports playwright-core (a teacher-run tool, not a test dependency), so we
// read its SOURCE instead of importing it, and pin the flashcard asset checks textually.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'scripts/smoke-student-host-matrix.mjs'), 'utf8');

describe('student host matrix — flashcard assets (static)', () => {
  it('declares the Vercel mirror origin', () => {
    expect(SRC).toMatch(/WS_MIRROR:\s*'https:\/\/a2-live-worksheets\.vercel\.app\/'/);
  });

  it('checks flashcards.js on GH Pages', () => {
    expect(SRC).toMatch(/host: 'GH_Pages_Desk', resource: 'flashcards_js', url: LESSON\.flashcardsJs/);
  });

  it('checks flashcards.js on the Vercel mirror', () => {
    expect(SRC).toMatch(/host: 'Vercel_Mirror', resource: 'flashcards_js', url: `\$\{WS_MIRROR\}\/flashcards\.js`/);
  });
});
