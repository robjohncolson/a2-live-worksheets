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
    // Past Nov 6 the year plan fills the calendar: the Topic 1 assessment day, then
    // planned windows for the unpublished lessons through 5-6 in June.
    const cellOn = (month, day, col) => S.find(row => row[0] === 2026 + (month < 8 ? 1 : 0) && row[1] === month && row[2] === day)[col];
    expect(cellOn(10, 9, 3)).toMatchObject({ kind: 'assessment', t: 'TA-1', u: 1 });   // C: Mon Nov 9
    expect(cellOn(10, 10, 3)).toMatchObject({ t: '2.1', planned: true });               // C: Tue Nov 10 opens 2-1
    expect(cellOn(10, 16, 3)).toMatchObject({ t: '2.1', planned: true });               // C: 2-1 due Nov 16
    expect(cellOn(10, 6, 5)).toMatchObject({ t: '1.6' });                                // G: 1-6 due Fri Nov 6
    expect(cellOn(10, 9, 5)).toBe(NC);                                                    // G does not meet Mondays
    expect(cellOn(10, 10, 5)).toMatchObject({ kind: 'assessment', t: 'TA-1' });        // G: Tue Nov 10
    expect(cellOn(5, 10, 3)).toMatchObject({ t: '5.6', planned: true });                // C: 5-6 due Jun 10, 2027
    expect(cellOn(5, 14, 3)).toMatchObject({ kind: 'assessment', t: 'TA-5' });         // C: Mon Jun 14, 2027
    expect(cellOn(5, 15, 3)).toBe(NC);                                                    // Topics 6-7 do not fit two-week windows
    // Published cells stay live; planned cells and assessment days are inert.
    const live = win.document.querySelector('#cg .dc[data-topic="1.1"]');
    expect(live && live.onclick).toBeTruthy();
    expect(live.getAttribute('role')).toBe('button');
    win.eval('_calPageOffset = 8'); win.rCal();          // page to the week of Nov 9
    const planned = win.document.querySelector('#cg .dc.cell-planned');
    expect(planned).toBeTruthy();
    expect(planned.onclick).toBeNull(); expect(planned.dataset.topic).toBeUndefined();
    expect(planned.dataset.planned).toBe('2.1'); expect(planned.textContent).toContain('planned');
    const assessment = win.document.querySelector('#cg .dc.cell-assess');
    expect(assessment).toBeTruthy(); expect(assessment.onclick).toBeNull();
    expect(assessment.textContent).toContain('Topic 1 Assessment');
    expect(win._orderedPeriodTopics()).not.toContain('2.1');
    expect(win._orderedPeriodTopics()).toContain('1.1');
    expect(win._prevTopicInSequence('1.2')).toBe('1.1');
    expect(win.document.getElementById('legend-bar').textContent).toContain('Planned (not yet published)');
    // Day log: Sep 17 landed for C (filled dot) and is planned for C on Sep 21 (hollow); the
    // goal (1.1 window, due Sep 24) is untouched. G's entry only shows on G.
    await vi.waitFor(() => expect(win.eval('A2_DAY_LOG').entries.length).toBeGreaterThan(0), { interval: 50, timeout: 5000 });
    win.eval('_calPageOffset = 0'); win.rCal();
    const dayLog = JSON.parse(readFileSync('content/a2/day-log.json', 'utf8'));
    expect(dayLog.entries.some(e => e.date === '2026-09-17' && e.section === 'C' && e.note)).toBe(true);
    const sep17 = [...win.document.querySelectorAll('#cg .dc')].find(c => c.dataset.dts && new Date(+c.dataset.dts).getDate() === 17 && new Date(+c.dataset.dts).getMonth() === 8);
    expect(sep17.classList.contains('cell-logged')).toBe(true);
    expect(sep17.getAttribute('aria-label')).toContain('Landed: Group Jam');
    expect(sep17.dataset.topic).toBe('1.1');
    win.eval('_calPageOffset = 1'); win.rCal();          // the focus window may be one week; page to Sep 21
    const sep21 = [...win.document.querySelectorAll('#cg .dc')].find(c => c.dataset.dts && new Date(+c.dataset.dts).getDate() === 21 && new Date(+c.dataset.dts).getMonth() === 8);
    expect(sep21.classList.contains('cell-log-plan')).toBe(true);
    expect(win.a2DayLogFor(new win.Date(2026, 8, 17), 'G')[0].note).toContain('PS2');
    expect(win.a2DayLogFor(new win.Date(2026, 8, 17), 'D')).toEqual([]);
    expect(cellOn(8, 24, 3)).toMatchObject({ t: '1.1' });
  } finally { desk.window.close(); }
}, 10000);

it('the teacher pacing control closes a lesson early for one section and asks the Desk to re-read pacing', async () => {
  const dom = new JSDOM('<div id="body"></div>', { runScripts: 'outside-only' });
  try {
    const win = dom.window, body = win.document.getElementById('body');
    const request = vi.fn(async () => ({ ok: true, unscheduled: ['7-3'] }));
    const refresh = vi.fn(), changed = vi.fn();
    win.A2Client = { request, changed }; win.A2Desk = { refresh };
    win.cP = 'G'; win.tdy = () => new win.Date(2026, 10, 12);
    const html = readFileSync('desk.html', 'utf8');
    const source = html.slice(html.indexOf('function _appendTeacherPacingControl('), html.indexOf('function showResourcePanel('));
    runInContext(source, dom.getInternalVMContext(), { filename: pathToFileURL(resolve('desk.html')).href });
    win._appendTeacherPacingControl(body, '2-1', { sections: { C: '2026-11-19', D: '2026-11-20', G: '2026-11-20' } });
    const select = body.querySelector('select'), date = body.querySelector('input[type=date]'), button = body.querySelector('button');
    expect(select.value).toBe('G');                       // defaults to the calendar's current section
    expect(date.value).toBe('2026-11-12');                // and to today
    expect(body.textContent).toContain('now due 2026-11-20');
    select.value = 'C'; select.onchange();
    expect(body.textContent).toContain('now due 2026-11-19');
    button.click();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith('/teacher/pacing/reflow', { section: 'C', lesson: '2-1', due: '2026-11-12' }, 'PUT');
    expect(changed).toHaveBeenCalled();
    expect(body.querySelector('[role=status]').textContent).toContain('Still off the calendar: 7-3');
  } finally { dom.window.close(); }
});

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
