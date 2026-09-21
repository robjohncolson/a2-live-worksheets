// @vitest-environment node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { bonusTotals } from '../scripts/a2-bonus-totals.mjs';

it('sums bonus awards per student for one quarter and caps the column at 10', () => {
  const entries = [
    { quarter: 1, section: 'C', student: 'A', points: 3 },
    { quarter: 1, section: 'C', student: 'A', points: 0.5 },
    { quarter: 1, section: 'C', student: 'B', points: 9 },
    { quarter: 1, section: 'C', student: 'B', points: 4 },
    { quarter: 2, section: 'C', student: 'A', points: 5 },
    { quarter: 1, section: 'G', student: 'A', points: 1 },
  ];
  expect(bonusTotals(entries, 1)).toEqual({ C: { A: 3.5, B: 10 }, G: { A: 1 } });
});

it('keeps the three section syllabi in sync with Start Here and the year plan', () => {
  execFileSync(process.execPath, ['scripts/build-a2-syllabus.mjs', '--check'], { cwd: new URL('..', import.meta.url) });
  const start = readFileSync(new URL('../start-here.html', import.meta.url), 'utf8');
  for (const [period, meets] of [['c', 'Monday, Tuesday, Thursday'], ['d', 'Monday, Wednesday, Friday'], ['g', 'Tuesday, Wednesday, Thursday, Friday']]) {
    const page = readFileSync(new URL(`../syllabus-${period}.html`, import.meta.url), 'utf8');
    expect(page).toContain(`Meets ${meets}.`);
    expect(page).toContain('Bonus is there to even out a rough quiz.');
    expect(page).toContain('I take your higher score and add half of your lower score, up to full credit.');
    expect(start).toContain(`href="syllabus-${period}.html"`);
  }
});

it('keeps the teacher name and contacts off the public syllabus pages', () => {
  for (const period of ['c', 'd', 'g']) {
    const page = readFileSync(new URL(`../syllabus-${period}.html`, import.meta.url), 'utf8');
    expect(page).not.toMatch(/https?:|www\.|\b(?:Mr|Ms|Mrs)\.|Colson|\d{3}[-. ]\d{3}[-. ]\d{4}/i);
  }
});
