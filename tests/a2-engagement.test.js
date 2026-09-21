// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { blooketScore, flashcardScore, combine, dayPoints } from '../lib/a2-engagement.js';
import { resolveTeacherSecret } from '../scripts/a2-daily-engagement.mjs';

const config = JSON.parse(readFileSync(new URL('../data/a2-engagement-config.json', import.meta.url), 'utf8'));
const script = fileURLToPath(new URL('../scripts/a2-daily-engagement.mjs', import.meta.url));
const roots = [];

function tempRoot() {
  const root = mkdtempSync(resolve(tmpdir(), 'a2-engagement-test-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('daily engagement arithmetic', () => {
  it('ships editable defaults', () => {
    expect(config).toEqual({ pointsPerDay: 10, accuracyWeight: 0.7, participationWeight: 0.3, questionsForFullParticipation: 20, cap: 1 });
  });

  it.each([
    [18, 20, 0.93], [5, 10, 0.5], [40, 40, 1], [0, 20, 0.3], [0, 0, 0]
  ])('scores %s correct of %s answered', (correct, answered, expected) => {
    expect(blooketScore({ correct, answered }, config)).toBeCloseTo(expected);
  });

  it('uses teacher participation settings', () => {
    expect(blooketScore({ correct: 5, answered: 10 }, {
      ...config, accuracyWeight: 0.5, participationWeight: 0.5, questionsForFullParticipation: 10
    })).toBe(0.75);
  });

  it.each([[9, 10, 0.9], [10, 10, 1], [0, 0, 0], [0, 10, 0], [11, 10, 1], [-1, 10, 0]])(
    'returns raw flashcard ratio %s/%s', (correct, total, expected) => {
      expect(flashcardScore({ correct, total })).toBe(expected);
    }
  );

  it.each([
    [0.9, 0.6, 1], [0.5, 0.4, 0.7], [0.3, null, 0.3], [null, 0.3, 0.3],
    [null, null, null], [undefined, undefined, null], [0, null, 0], [0, 0, 0]
  ])('combines %s and %s', (a, b, expected) => {
    const actual = combine(a, b, 1);
    if (expected === null) expect(actual).toBeNull();
    else expect(actual).toBeCloseTo(expected);
  });

  it('caps only the both-present case as specified', () => {
    expect(combine(0.8, 0.4, 0.9)).toBe(0.9);
    expect(combine(1, null, 0.9)).toBe(1);
  });

  it.each([[null, null], [0, 0], [0.0249, 0], [0.025, 0.5], [0.0749, 0.5], [0.075, 1], [0.93, 9.5], [1, 10]])(
    'rounds %s to %s points', (score, expected) => expect(dayPoints(score, config)).toBe(expected)
  );
});

function student(studentId, realName, best = null) {
  return { studentId, realName, username: 'fictional_' + studentId, runs: [], best };
}

function fixture(students, players, aliases = {}) {
  const root = tempRoot();
  mkdirSync(resolve(root, 'roster-local/blooket'), { recursive: true });
  writeFileSync(resolve(root, 'roster-local/blooket/2026-09-21-PeriodC.json'), JSON.stringify({ players }));
  writeFileSync(resolve(root, 'roster-local/blooket-aliases.json'), JSON.stringify(aliases));
  writeFileSync(resolve(root, 'flashcards.json'), JSON.stringify({ ok: true, section: 'PeriodC', date: '2026-09-21', students }));
  return root;
}

function run(root, extra = []) {
  return spawnSync(process.execPath, [script, '--section', 'PeriodC', '--date', '2026-09-21',
    '--offline', 'flashcards.json', '--url', 'http://127.0.0.1:1', ...extra], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ROSTER_TEACHER_SECRET: 'fictional-secret' }
  });
}

function csv(root) {
  return readFileSync(resolve(root, 'roster-local/engagement/2026-09-21-PeriodC.csv'), 'utf8');
}

function unresolved(root) {
  return JSON.parse(readFileSync(resolve(root, 'roster-local/engagement/2026-09-21-PeriodC.unmatched.json'), 'utf8')).unmatched;
}

describe('offline daily engagement CLI', () => {
  it('matches aliases, unique first names and reordered names; preserves zero and absence; quotes CSV', () => {
    const root = fixture([
      student('a', 'Avery Example', { correct: 6, total: 10, mode: 'quick' }),
      student('b', 'Blair Sample', { correct: 9, total: 10, mode: 'full' }),
      student('c', 'Casey Fiction'), student('d', 'Drew Imaginary'),
      student('e', 'Ellis Placeholder'), student('f', 'Finley "F", Pretend')
    ], [
      { name: 'rocket', correct: 18, answered: 20 },
      { name: 'Casey', correct: 0, answered: 0 },
      { name: 'Placeholder Ellis', correct: 5, answered: 10 },
      { name: 'comet', correct: 20, answered: 20 },
      { name: 'unknown nickname', correct: 10, answered: 20 }
    ], { rocket: 'a', comet: 'fictional_f' });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('scored: 5, absent: 1, unmatched: 1');
    expect(csv(root)).toBe([
      'realName,username,blooketPct,flashcardPct,combinedPct,points,note',
      'Avery Example,fictional_a,93,60,100,10,',
      'Blair Sample,fictional_b,,90,90,9,',
      'Casey Fiction,fictional_c,0,,0,0,',
      'Drew Imaginary,fictional_d,,,,,absent',
      'Ellis Placeholder,fictional_e,50,,50,5,',
      '"Finley ""F"", Pretend",fictional_f,100,,100,10,', ''
    ].join('\r\n'));
    expect(unresolved(root)).toEqual([{ name: 'unknown nickname', correct: 10, answered: 20, reason: 'unmatched' }]);
  });

  it('does not guess ambiguous first names, fuzzy full names, surnames, or invalid aliases', () => {
    const root = fixture([
      student('a', 'Robin Fiction'), student('b', 'Robin Sample'),
      student('c', 'Taylor Example'), student('d', 'Tayler Example')
    ], ['Robin', 'Taylor Example', 'Fiction', 'bad-alias'].map(name => ({ name, correct: 1, answered: 1 })),
    { 'bad-alias': 'missing-id' });
    expect(run(root).stdout.trim()).toBe('scored: 0, absent: 4, unmatched: 4');
    expect(unresolved(root).map(item => item.reason)).toEqual(['ambiguous', 'ambiguous', 'unmatched', 'unmatched']);
  });

  it('requires duplicate source entries to be resolved without summing or guessing', () => {
    const root = fixture([student('a', 'Robin Fiction', { correct: 5, total: 10, mode: 'quick' })], [
      { name: 'Robin', correct: 20, answered: 20 }, { name: 'Robin Fiction', correct: 1, answered: 20 }
    ]);
    expect(run(root).stdout.trim()).toBe('scored: 1, absent: 0, unmatched: 2');
    expect(csv(root)).toContain('Robin Fiction,fictional_a,,50,50,5,Blooket duplicate; resolve source entries');
    expect(unresolved(root)).toHaveLength(2);
  });

  it.each([
    ['--section', '../escape'], ['--date', '2026-02-30'], ['--date', '../../escape']
  ])('rejects invalid section/date without leaking arguments', (...extra) => {
    const root = fixture([], []);
    const result = run(root, extra);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('escape');
  });

  it('rejects a response for another section or date', () => {
    const root = fixture([], []);
    writeFileSync(resolve(root, 'flashcards.json'), JSON.stringify({ ok: true, section: 'PeriodD', date: '2026-09-21', students: [] }));
    expect(run(root).status).toBe(1);
    writeFileSync(resolve(root, 'flashcards.json'), JSON.stringify({ ok: true, section: 'PeriodC', date: '2026-09-20', students: [] }));
    expect(run(root).status).toBe(1);
  });

  it('does not print malformed input contents or secrets', () => {
    const root = fixture([], []);
    writeFileSync(resolve(root, 'flashcards.json'), '{fictional-private-name fictional-secret');
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain('fictional-');
  });

  it('rejects invalid counts instead of silently producing a grade', () => {
    const root = fixture([student('a', 'Robin Fiction')], [{ name: 'Robin', correct: 21, answered: 20 }]);
    expect(run(root).status).toBe(1);
  });
});

describe('teacher secret lookup without network', () => {
  it('prefers the local dotenv value over the ambient environment', () => {
    const root = tempRoot();
    mkdirSync(resolve(root, 'roster-server'));
    writeFileSync(resolve(root, 'roster-server/.env'), 'ROSTER_TEACHER_SECRET="fictional-current" # comment\n');
    expect(resolveTeacherSecret(root, { ROSTER_TEACHER_SECRET: 'fictional-stale' })).toBe('fictional-current');
  });

  it('falls back to the environment when the dotenv file is absent', () => {
    expect(resolveTeacherSecret(tempRoot(), { ROSTER_TEACHER_SECRET: 'fictional-fallback' })).toBe('fictional-fallback');
    expect(resolveTeacherSecret(tempRoot(), {})).toBeNull();
  });
});
