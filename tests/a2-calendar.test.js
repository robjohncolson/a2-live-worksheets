import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bootDesk } from './journeys/harness.js';
import { loadCedLabels } from './fixtures/ced2026-labels.js';
import { JSDOM } from 'jsdom';
import { runInContext } from 'node:vm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const roadmap = JSON.parse(readFileSync('roadmap-data.json', 'utf8'));
const lessons = JSON.parse(readFileSync('content/a2/lessons.json', 'utf8'));
const targets = JSON.parse(readFileSync('data/a2-lesson-targets.json', 'utf8'));

it('roadmap-data.json is the generator output for the current lesson targets and published lessons', () => {
  const fresh = JSON.parse(execFileSync(process.execPath, ['scripts/build-a2-roadmap-data.mjs', '--print'], { encoding: 'utf8' }));
  expect({ ...roadmap, generatedAt: null }).toEqual({ ...fresh, generatedAt: null });
  expect(Object.keys(roadmap.lessons)).toHaveLength(targets.lessons.length);
  for (const lesson of lessons) {
    const entry = roadmap.lessons[lesson.key.replace('-', '.')];
    expect(entry.published, lesson.key).toBe(true);
    expect(entry.ced2026).toMatchObject({ status: 'core', newUnit: lesson.topic, newLabel: lesson.title });
    expect(entry.urls.check).toBe('check.html?lesson=' + lesson.key);
    expect(Object.keys(entry.periods)).toEqual(['C', 'D', 'G']);
  }
});

it('labels Algebra 2 topics from the roadmap overlay instead of the inherited AP crosswalk, through topic 12', () => {
  const sandbox = loadCedLabels(roadmap);
  expect(sandbox.cedLabel('1.2').text).toBe('1.2 · Transformations of Functions');
  expect(sandbox.cedLabel('6.1')).toMatchObject({ unit: 6, text: '6.1 · Key Features of Exponential Functions', mapped: true });
  expect(sandbox.cedLabel('12.4')).toMatchObject({ unit: 12, mapped: true });
  // Without the overlay the AP label would leak through for the same key.
  expect(loadCedLabels().cedLabel('1.2').text).not.toContain('Transformations');
});

it('the Desk calendar fills each section from the two-week lesson windows and shows the unit strip', async () => {
  const desk = await bootDesk({ now: '2026-09-16T16:00:00Z' });
  try {
    await desk.window.A2Desk.refresh();
    const win = desk.window;
    // Pacing can finish after refresh resolves while the full suite is loading.
    await vi.waitFor(() => {
      expect(win.eval('S').some(row => row.slice(3, 6).some(cell => cell && cell.t))).toBe(true);
    }, { interval: 50, timeout: 5000 });
    expect(typeof win.applyA2Pacing).toBe('function');
    // Section C: 1-1 runs on every C meeting day (Mon/Tue/Thu) through Sep 24, skipping Sep 7 (Labor Day).
    const S = win.eval('S'), NC = win.eval('NC');
    const rows = S.filter(row => row[0] === 2026 && row[1] === 8 && row[2] <= 25 && row[3] && row[3].t);
    const dates = rows.map(row => row[2]);
    expect(dates).toContain(3); expect(dates).toContain(24); expect(dates).not.toContain(7);
    expect(rows.every(row => row[3].t === '1.1')).toBe(true);
    const sep28 = S.find(row => row[0] === 2026 && row[1] === 8 && row[2] === 28);
    expect(sep28[3].t).toBe('1.2');            // C's 1-2 window opens the Monday after 1-1 is due
    const oct8 = S.find(row => row[0] === 2026 && row[1] === 9 && row[2] === 8);
    expect(oct8[3].t).toBe('1.2');            // C's 1-2 window ends Oct 8
    expect(oct8[4]).toBe(NC);              // D does not meet on Thursdays
    expect(oct8[5].t).toBe('1.2');            // G meets Thursdays
    const grid = win.document.getElementById('cg').textContent;
    expect(grid).toContain('Key Features of Functions');
    expect(grid).not.toContain('Variables');   // AP label must not leak
    expect(win.document.getElementById('pb').textContent).toContain('U1');
  } finally { desk.window.close(); }
}, 10000);

it('calendar chips use lesson statuses without lesson tiles and isolate view-as scores', () => {
  const dom = new JSDOM('<div id="cell"></div>', { runScripts: 'outside-only' });
  try {
    const win = dom.window, cell = win.document.getElementById('cell');
    const status = { tryIts: { scored: 2, total: 5, points: 3, scores: [] }, lessonCheck: 100, flashcardPassed: true };
    const getStatus = vi.fn(() => status);
    win.A2Desk = { getStatus };
    runInContext(readFileSync('a2-client.js', 'utf8'), dom.getInternalVMContext(), { filename: pathToFileURL(resolve('a2-client.js')).href });
    const html = readFileSync('desk.html', 'utf8');
    const source = html.slice(html.indexOf('function renderA2LessonChips('), html.indexOf('function renderA2Categories('));
    runInContext(source, dom.getInternalVMContext(), { filename: pathToFileURL(resolve('desk.html')).href });
    win.renderA2LessonChips(cell, '1.1');
    expect(getStatus).toHaveBeenCalledWith('1.1');
    expect([...cell.children].map(item => item.textContent)).toEqual(win.A2Client.chips(status));
    cell.textContent = '';
    win.__WS_READ_ONLY__ = true;
    win._gradeLessonsCache = [{ lessonKey: '1.1', ...status, lessonCheck: 50 }];
    getStatus.mockClear();
    win.renderA2LessonChips(cell, '1.1');
    expect(getStatus).not.toHaveBeenCalled();
    expect(cell.textContent).toContain('Lesson check 50%');
    cell.textContent = '';
    win._gradeLessonsCache = [];
    win.renderA2LessonChips(cell, '1.1');
    expect(cell.children).toHaveLength(0);
  } finally { dom.window.close(); }
});
