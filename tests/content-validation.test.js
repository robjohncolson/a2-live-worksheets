// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { lintDeck } from '../scripts/lib/blooket-lint.mjs';

const ROOT = resolve(__dirname, '..');
const flashcardsPath = resolve(ROOT, 'flashcards.js');
const sandbox = createContext({ window: {}, Math, JSON });
runInContext(readFileSync(flashcardsPath, 'utf8'), sandbox, { filename: pathToFileURL(flashcardsPath).href });
const FC = sandbox.window.Flashcards;
const lessons = JSON.parse(readFileSync(resolve(ROOT, 'content/a2/lessons.json'), 'utf8'));
const decks = lessons.filter(lesson => typeof lesson.deck === 'string' && lesson.deck.length > 0);

describe('published A2 deck content', () => {
  it('resolves every declared lesson deck to a nonempty, structurally valid CSV', () => {
    expect(decks.length).toBeGreaterThan(0);
    expect(new Set(lessons.map(lesson => lesson.key)).size).toBe(lessons.length);
    for (const lesson of decks) {
      expect(lesson.deck).toBe(`content/a2/${lesson.key}/deck.csv`);
      const rows = FC.parseCsv(readFileSync(resolve(ROOT, lesson.deck), 'utf8').replace(/^\uFEFF/, ''));
      const questions = rows.filter(row => /^\d+$/.test(row[0]));
      const cards = FC.rowsToDeck(rows);
      expect(cards.length, lesson.deck).toBeGreaterThan(0);
      expect(cards.length, lesson.deck).toBe(questions.length);
      expect(new Set(cards.map(card => card.qnum)).size).toBe(cards.length);
      for (const row of questions) {
        expect(row.length).toBeGreaterThanOrEqual(8);
        expect(row[1].trim()).not.toBe('');
        expect(row.slice(2, 6).every(choice => choice.trim().length > 0)).toBe(true);
        expect(Number(row[6])).toBeGreaterThan(0);
        expect(['1', '2', '3', '4']).toContain(row[7].trim());
      }
    }
  });

  it('keeps difficulty tags attached to existing A2 decks and questions', () => {
    const tags = JSON.parse(readFileSync(resolve(ROOT, 'data/blooket-difficulty.json'), 'utf8'));
    expect(tags).toBeTypeOf('object');
    expect(Array.isArray(tags)).toBe(false);
    for (const [path, entries] of Object.entries(tags)) {
      expect(decks.some(lesson => lesson.deck === path), path).toBe(true);
      const cards = FC.rowsToDeck(FC.parseCsv(readFileSync(resolve(ROOT, path), 'utf8')));
      for (const [qnum, tag] of Object.entries(entries)) {
        expect(cards.some(card => String(card.qnum) === qnum)).toBe(true);
        expect(['easy', 'med', 'hard']).toContain(tag.difficulty);
      }
    }
  });
});

describe('inline CSV fixtures use the student parser and authoring linter', () => {
  it('handles commas, escaped quotes, embedded newlines and CRLF', () => {
    const csv = 'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct\r\n1,"For f(x), read ""domain""\nand choose.",inputs,outputs,intercepts,slopes,20,1\r\n';
    const deck = FC.rowsToDeck(FC.parseCsv(csv));
    expect(deck).toEqual([{ qnum: 1, q: 'For f(x), read "domain"\nand choose.', choices: ['inputs', 'outputs', 'intercepts', 'slopes'], correctIdx: 0 }]);
    expect(lintDeck('a2-inline.csv', deck)).toEqual([]);
  });

  it('skips header, empty-prompt and insufficient-choice rows', () => {
    const csv = 'Question #,Question,Answer 1\n1,,a,b,c,d,20,1\n2,Find the domain,only,,,,20,1\n3,Find the range,inputs,outputs,,,20,2\n';
    expect(FC.rowsToDeck(FC.parseCsv(csv))).toEqual([
      { qnum: 3, q: 'Find the range', choices: ['inputs', 'outputs'], correctIdx: 1 },
    ]);
  });

  it('flags duplicate and order-dependent choices in an invalid CSV', () => {
    const csv = '1,Find the domain,inputs,inputs,all of the above,outputs,20,1\n';
    const findings = lintDeck('a2-invalid.csv', FC.rowsToDeck(FC.parseCsv(csv)));
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some(finding => finding.code === 'permutationUnsafe')).toBe(true);
    expect(findings.every(finding => finding.csv === 'a2-invalid.csv' && finding.qnum === 1)).toBe(true);
  });
});
