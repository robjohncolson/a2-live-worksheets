// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import '../lib/a2-tomorrow.js';

const html = readFileSync('desk.html', 'utf8');
const start = html.indexOf('function _showA2TeacherDayPanel(');
const source = html.slice(start, html.indexOf('function _appendTeacherPacingControl(', start));
const prep = JSON.parse(readFileSync('content/a2/lesson-prep.json', 'utf8')).lessons;
const skills = JSON.parse(readFileSync('content/a2/lesson-skills.json', 'utf8')).lessons;

it('the Tomorrow fold uses the day-log lesson and its assigned work when the calendar is ahead', async () => {
  const dom = new JSDOM('<div id="resource-header"></div><div id="resource-body"></div><div id="resource-overlay"></div>', { runScripts: 'outside-only' });
  try {
    const win = dom.window;
    const dayLog = JSON.parse(readFileSync('content/a2/day-log.json', 'utf8'));
    // C's calendar window is 1-6 on Oct 26; the logged class is still 1-3.
    const entry = dayLog.entries.find(row => row.date === '2026-10-26' && row.section === 'C');
    expect(entry.lesson).toBe('1-3');
    const log = { entries: [entry], resources: {} };
    let received;
    let rendered;
    Object.assign(win, {
      cP: 'C', A2_DAY_LOG: log, A2_LESSON_PREP: prep,
      _a2IsoFromDs: () => '2026-10-26',
      a2LessonSkills: key => skills[key.replace('.', '-')] || [],
      _appendA2TeacherPrep: () => {}, _appendTeacherPacingControl: () => {},
      _lastResourcePanel: null,
      A2Tomorrow: { fill(window, fold, input) {
        received = input;
        rendered = globalThis.A2Tomorrow.fill(window, fold, input);
        return rendered;
      } },
    });
    win.eval(source);
    win._showA2TeacherDayPanel({ t: '1.6', n: 'Linear Systems' }, 'Oct 26', { title: 'Linear Systems' }, '1-6',
      win.document.getElementById('resource-header'), win.document.getElementById('resource-body'));
    await rendered;
    expect(received.lesson).toBe('1-3');
    expect(received.prep).toBe(prep['1-3']);
    expect(received.lessonSkills).toBe(skills['1-3']);
    const fold = [...win.document.querySelectorAll('details')].find(node => node.firstChild.textContent === 'Tomorrow (draft)');
    expect(fold.textContent).toContain('Group Jam: LSG');
    expect(fold.textContent).not.toContain('Group Jam: BW5');
  } finally { dom.window.close(); }
});
