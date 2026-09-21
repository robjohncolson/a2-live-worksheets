// @vitest-environment node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { bonusTotals } from '../scripts/a2-bonus-totals.mjs';

it('publishes the approved points and retry policy on every grading page', () => {
  for (const file of ['start-here.html', 'open-house.html', 'syllabus-c.html', 'syllabus-d.html', 'syllabus-g.html']) {
    const page = new JSDOM(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    const rows = new Map([...page.window.document.querySelectorAll('table.graded tbody tr')]
      .map(row => [row.cells[0].textContent, [...row.cells].slice(1).map(cell => cell.textContent).join(' ')]));
    expect(rows.get('Daily Engagement')).toContain('Engagement 10 points per class day');
    expect(rows.get('Daily Engagement')).toContain('An absent day is no item, not a zero.');
    expect(rows.get('Try-Its')).toContain('Assignments 10 points each; latest score counts.');
    expect(rows.get('Try-Its')).toContain('Right with work: 10. Real effort but wrong, or right with no work: 8 (80%). Partial work: 1–7. Not attempted: 0.');
    expect(rows.get('Try-Its')).toContain('provisional zero one week after I score that set for your section');
    expect(rows.get('Try-Its')).toContain('It is not final: you can attempt or redo it any time, and your later attempt replaces the zero.');
    expect(rows.get('Try-Its')).toContain('Nothing counts as zero before I score the set.');
    expect(rows.get('Quiz')).toContain('Assessments 20 points; latest score counts.');
    expect(rows.get('Quiz')).toContain('one short quiz per lesson');
    expect(rows.get('Quiz')).toContain('Each question follows the Try-It rule: real effort but wrong, or right with no work, earns 80%.');
    expect(rows.get('Topic assessment')).toContain('Assessments 100 points; latest score counts.');
    expect(rows.get('Topic assessment')).toContain("No topic test in Quarter 1: Topic 1's test is November 9–10.");
    expect(rows.get('IXL homework, when assigned')).toContain('Bonus Up to the award I set. When I assign IXL homework, a SmartScore of 80 counts as complete. You do not need 100.');
    expect(rows.get('Bonus')).toContain('Assignments, extra credit 0 points possible; bonus awards add up to at most 10 earned points per quarter.');
    expect(page.window.document.body.textContent).toContain('Flashcards count through daily Engagement redemption.');
    page.window.close();
  }
});

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

it('lifts the daily routine, grading rules, and first two weeks verbatim from Start Here', () => {
  const source = new JSDOM(readFileSync(new URL('../start-here.html', import.meta.url), 'utf8'));
  const sections = [...source.window.document.querySelectorAll('section')];
  for (const file of ['syllabus-c.html', 'syllabus-d.html', 'syllabus-g.html', 'open-house.html']) {
    const page = new JSDOM(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    for (const title of ['An average day', 'What gets graded', 'The first two weeks']) {
      const section = sections.find(node => node.querySelector('h2').textContent === title);
      for (const node of section.children) {
        if (node.tagName === 'H2') continue;
        expect([...page.window.document.querySelectorAll(node.tagName)].some(copy => copy.outerHTML === node.outerHTML)).toBe(true);
      }
    }
    page.window.close();
  }
  source.window.close();
});
