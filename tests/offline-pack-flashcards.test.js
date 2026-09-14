import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(repo, 'scripts/build-offline-pack.mjs'), 'utf8');

describe('offline pack flashcard assets', () => {
  it('ships flashcards.js as a root file', () => {
    const start = source.indexOf('const ROOT_FILES = [');
    const rootFiles = source.slice(start, source.indexOf('];', start));
    expect(rootFiles).toContain("'flashcards.js'");
  });

  it('collects every repo-root _blooket.csv deck', () => {
    expect(source).toContain('const BLOOKET_RE = /_blooket\\.csv$/;');
    expect(source).toContain('const blooket = all.filter((f) => BLOOKET_RE.test(f));');
    expect(source).toContain('...grading, ...blooket');
  });
});
