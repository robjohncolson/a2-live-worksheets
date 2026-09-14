// @vitest-environment node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../start-here.html', import.meta.url), 'utf8');
const handout = readFileSync(new URL('../open-house.html', import.meta.url), 'utf8');

it('keeps every grading-table cell and all four rules verbatim in Start Here', () => {
  const start = new JSDOM(source);
  const page = new JSDOM(handout);
  const rows = [...page.window.document.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(4);
  expect(page.window.document.querySelector('table').outerHTML).toBe(start.window.document.querySelector('table').outerHTML);
  for (const row of rows) {
    expect(row.cells).toHaveLength(4);
    for (const cell of row.cells) expect(source).toContain(cell.textContent);
    const sentences = row.cells[3].textContent.match(/[^.!?]+[.!?]/g);
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) expect(source).toContain(sentence.trim());
  }
  start.window.close();
  page.window.close();
});

it('copies the average day and every policy sentence from Start Here', () => {
  const page = new JSDOM(handout);
  const start = new JSDOM(source);
  expect(page.window.document.querySelector('main > p').outerHTML).toBe(start.window.document.querySelector('section p').outerHTML);
  for (const paragraph of page.window.document.querySelectorAll('main > p')) {
    for (const sentence of paragraph.textContent.match(/[^.!?]+[.!?]/g)) {
      expect(source).toContain(sentence.trim());
    }
  }
  expect(page.window.document.body.textContent).toContain('Add/drop is open through Friday, Sep 18. Work due on or before Sep 18 can only raise your grade: I count it only when it helps, and I never count it against you. After Sep 18, due work you have not attempted counts as zero.');
  expect(start.window.document.body.textContent.match(/Quarters? close/gi)).toHaveLength(1);
  page.window.close();
  start.window.close();
});

it('regenerates reproducibly from the current Start Here', () => {
  execFileSync(process.execPath, ['scripts/build-open-house.mjs'], { cwd: new URL('..', import.meta.url) });
  expect(readFileSync(new URL('../open-house.html', import.meta.url), 'utf8')).toBe(handout);
});

it('provides print-first caregiver navigation without printed contacts or URLs', () => {
  const page = new JSDOM(handout);
  const doc = page.window.document;
  expect(doc.querySelector('h1').textContent).toBe('Algebra 2 — how the class and the grade work');
  expect(doc.querySelectorAll('aside p')).toHaveLength(3);
  expect(doc.querySelector('aside').textContent).toContain('Questions: ask me at Open House or message through ParentSquare');
  expect(handout).toMatch(/@page\s*\{\s*size: Letter; margin: 0\.6in;/);
  expect(handout).toContain('nav, button { display: none !important; }');
  expect(doc.querySelectorAll('a')).toHaveLength(1);
  expect(doc.querySelector('nav a').outerHTML).toBe(new JSDOM(source).window.document.querySelector('nav a').outerHTML);
  expect(doc.querySelector('main').textContent).not.toMatch(/https?:|www\.|@|\b(?:Mr|Ms|Mrs)\.|Colson|\d{3}[-. ]\d{3}[-. ]\d{4}/i);
  expect(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).toContain('href="open-house.html">Open House handout</a>');
  expect(readFileSync(new URL('../desk.html', import.meta.url), 'utf8')).toContain("window.open('open-house.html','_blank','noopener')\">Print Open House handout");
  page.window.close();
});
