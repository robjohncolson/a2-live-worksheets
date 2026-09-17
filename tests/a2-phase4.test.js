import { vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { runInContext } from 'node:vm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import '../lib/a2-answers.js';

const lessons = JSON.parse(readFileSync('content/a2/lessons.json', 'utf8'));
it('keeps answers out of student prompts and provides every lesson-check answer', () => {
  const forbiddenText = ['\\answer{', '\\te{', 'Answer key', '\\begin{align'];
  for (const lesson of lessons) {
    for (const item of [...lesson.tryIts, ...lesson.lessonCheck]) {
      for (const text of forbiddenText) {
        expect(item.prompt, `${lesson.key}: ${item.registryId}`).not.toContain(text);
      }
    }
    for (const item of lesson.lessonCheck) {
      expect(typeof item.answer, `${lesson.key}: ${item.registryId}`).toBe('string');
      expect(item.answer.trim(), `${lesson.key}: ${item.registryId}`).not.toBe('');
    }
  }
});
describe('shared interval normalizer', () => {
  it.each(['(-inf, 4]', '(−∞,4]', '( -infinity, 4 ]', '(−\\infty,4]'])('accepts %s', value => {
    expect(A2Answers.answerMatches('(-inf,4]', value)).toBe(true);
  });
  it('preserves excluded endpoints and does not grant substring partial credit', () => {
    expect(A2Answers.answerMatches('(-inf,4]', '(-inf,4)')).toBe(false);
    expect(A2Answers.answerMatches('[-5,5];[-1,2]', '[-5,5]')).toBe(false);
    expect(A2Answers.answerMatches('1', '')).toBe(false);
  });
});
it('ships six traced items, five verbatim Try-Its and a clean 14-card traced deck', () => {
  expect(lessons[0].sections).toEqual({ C: '2026-09-24', D: '2026-09-25', G: '2026-09-25' });
  expect(lessons[0].lessonCheck.map(item => item.registryId)).toEqual([18,21,22,23,27,32].map(n => '1-1-savvas-q' + n));
  expect(lessons[0].tryIts.map(item => item.n)).toEqual([1,2,3,4,5]);
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/lint-blooket-deck.mjs', '--csv', lessons[0].deck], { encoding: 'utf8' }));
  expect(report.findings).toEqual([]); expect(report.decks[0].cards).toBe(14);
  const sources = JSON.parse(readFileSync('content/a2/1-1/deck.sources.json', 'utf8'));
  expect(Object.values(sources).every(id => /^1-1-savvas-concept-/.test(id))).toBe(true);
});
it('teacher offline queue keeps different students separate and the latest tap for each', async () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  try {
    dom.window.eval(readFileSync('offline-queue.js', 'utf8'));
    const queue = dom.window.OfflineQueue;
    await queue.enqueue({ source: 'try-it', itemId: 'TI-1-1-1', studentId: 'a', score: 1, ts: 1 });
    await queue.enqueue({ source: 'try-it', itemId: 'TI-1-1-1', studentId: 'b', score: 2, ts: 1 });
    await queue.enqueue({ source: 'try-it', itemId: 'TI-1-1-1', studentId: 'a', score: 0, ts: 2 });
    expect((await queue.all()).map(row => [row.studentId,row.score])).toEqual([['a',0],['b',2]]);
  } finally { dom.window.close(); }
});
it('publishes the Topic 1 keep lessons with traced Try-Its, six answerable check items, and a clean 14-card deck each', () => {
  expect(lessons.map(lesson => lesson.key)).toEqual(['1-1', '1-2', '1-5', '1-6']);
  for (const lesson of lessons) {
    expect(lesson.tryIts.map(item => item.n)).toEqual(lesson.tryIts.map((_, i) => i + 1));
    for (const item of lesson.tryIts) expect(item.registryId).toBe(`${lesson.key}-savvas-try-it-${item.n}-lesson-${lesson.key}`);
    expect(lesson.lessonCheck).toHaveLength(6);
    for (const item of [...lesson.tryIts, ...lesson.lessonCheck]) if (item.image) expect(existsSync(item.image), item.image).toBe(true);
    for (const item of lesson.lessonCheck) {
      // Every accepted answer round-trips through the shared normalizer.
      for (const accepted of item.answer.split('|')) expect(A2Answers.answerMatches(item.answer, accepted), item.registryId).toBe(true);
      if (item.type === 'mc') { expect(item.choices).toHaveLength(4); expect(item.choices.map(c => c[0])).toContain(item.answer); }
    }
    const report = JSON.parse(execFileSync(process.execPath, ['scripts/lint-blooket-deck.mjs', '--csv', lesson.deck], { encoding: 'utf8' }));
    expect(report.findings, lesson.key).toEqual([]); expect(report.decks[0].cards).toBe(14);
    expect(lesson.topicAssessmentKey).toBe('T1');
  }
});
it('accepts the student spellings the check hints describe', () => {
  const byId = Object.fromEntries(lessons.flatMap(lesson => lesson.lessonCheck.map(item => [item.registryId, item.answer])));
  expect(A2Answers.answerMatches(byId['1-2-check-q1'], 'x^2 - 3')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-2-check-q3'], '2 - x^2')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-2-check-q6'], '[-2, 2]')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-5-check-q3'], '(-inf,-2) U (2,inf)')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-5-check-q3'], '(-∞,-2)∪(2,∞)')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-5-check-q3'], '(-2,2)')).toBe(false);
  expect(A2Answers.answerMatches(byId['1-5-check-q5'], '2; 10')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-5-check-q6'], '4.303')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-6-check-q1'], '(3.5, -0.25)')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-6-check-q5'], '(3/2, 1, 1/2)')).toBe(true);
  expect(A2Answers.answerMatches(byId['1-6-check-q4'], '(2,3)')).toBe(false);
});
it('schedules two-week lesson windows on each section’s meeting days in order', () => {
  const meetingDays = { C: [1, 2, 4], D: [1, 3, 5], G: [2, 3, 4, 5] };
  for (const section of ['C', 'D', 'G']) {
    const dates = lessons.map(lesson => lesson.sections[section]);
    for (const date of dates) expect(meetingDays[section], `${section} ${date}`).toContain(new Date(date + 'T12:00:00Z').getUTCDay());
    expect([...dates].sort()).toEqual(dates);
    for (let i = 1; i < dates.length; i++) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
      expect(gap, `${section} ${dates[i - 1]} -> ${dates[i]}`).toBeGreaterThanOrEqual(10);
      expect(gap).toBeLessThanOrEqual(18); // a holiday can pull a due date earlier
    }
  }
});
it('supporting IXL skills are https links, prerequisites first, and never graded', () => {
  for (const lesson of lessons) {
    const skills = lesson.supportingSkills || [];
    for (const item of skills) {
      expect(item.name).toBeTruthy();
      expect(item.url).toMatch(/^https:\/\/www\.ixl\.com\//);
      expect(['prereq', 'core']).toContain(item.level);
    }
    const firstCore = skills.findIndex(item => item.level === 'core');
    expect(skills.slice(firstCore < 0 ? skills.length : firstCore).some(item => item.level === 'prereq')).toBe(false);
  }
  expect(lessons[0].supportingSkills.map(item => item.name)).toEqual(['Graph inequalities on number lines', 'Domain and range']);
  // The server's lesson schedule has no IXL item, so a jam cannot reach the ledger.
  expect(readFileSync('roster-server/a2-lessons.js', 'utf8')).not.toMatch(/ixl|supportingSkills/i);
});
it('keeps the calendar directly after Do Now and moves section selection into User', () => {
  const dom = new JSDOM(readFileSync('desk.html', 'utf8'), { url: 'https://desk.test', runScripts: 'outside-only' });
  try {
    const win = dom.window, doc = win.document;
    expect(doc.querySelector('#a2-lessons, #a2-today')).toBeNull();
    expect(doc.getElementById('donow-card').nextElementSibling.classList.contains('cal-outer')).toBe(true);
    expect(doc.querySelector('#a2-profile')).not.toBeNull();
    expect(doc.querySelector('#my-gradebook-overlay #a2-gradebook-scores')).not.toBeNull();
    const item = doc.querySelector('#menu-student #menu-a2-section');
    expect(item.textContent).toBe('My section…');
    expect(item.getAttribute('onclick')).toContain('openA2Profile()');
    const html = readFileSync('desk.html', 'utf8');
    const start = html.indexOf('function updateStudentMenu()');
    const source = html.slice(start, html.indexOf('\n}\n', start) + 2);
    let identity = null, viewing = false;
    win.rosterClient = { current: () => identity };
    win.getStudentEmail = () => '';
    win._viewAsContext = () => viewing;
    runInContext(source, dom.getInternalVMContext(), { filename: pathToFileURL(resolve('desk.html')).href });
    win.updateStudentMenu();
    expect(item.classList.contains('disabled')).toBe(true);
    expect(item.hidden).toBe(false);
    identity = { username: 'student', section: 'C' };
    win.updateStudentMenu();
    expect(item.getAttribute('aria-disabled')).toBe('false');
    win.localStorage.setItem('a2_user_role', 'teacher');
    win.updateStudentMenu();
    expect(item.hidden).toBe(true);
    win.localStorage.removeItem('a2_user_role');
    viewing = true;
    win.updateStudentMenu();
    expect(item.hidden).toBe(true);
  } finally { dom.window.close(); }
});
it('refresh exposes statuses without tiles, retains gradebook scores, and adds one due line', async () => {
  const html = '<div id="donow-card" class="donow-todo"><div id="donow-msg">Do Now</div></div><div id="a2-gradebook-scores"></div><dialog id="a2-profile"><form id="a2-profile-form"><select></select></form><p id="a2-profile-message"></p></dialog>';
  const dom = new JSDOM(html, { url: 'https://desk.test/desk.html', runScripts: 'outside-only' });
  try {
    const win = dom.window;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const dated = [{ ...lessons[0], sections: { C: today } }];
    const status = { tryIts: { scored: 1, total: 5, points: 2, scores: [{ n: 1, itemId: 'TI-1-1-1', score: 2 }] }, lessonCheck: 100, flashcardPassed: true };
    let identity = { username: 'student', section: 'PeriodC' };
    win.fetch = async () => ({ json: async () => dated });
    win.A2Client = { request: async path => path === '/lessons' ? { lessons: dated } : status, changed() {} };
    win.rosterClient = { current: () => identity, token: () => 't' };
    win.SCHEDULE_DEFS = { 'SY26-27': { range: { start: [2000, 0, 1] } } };
    runInContext(readFileSync('a2-desk.js', 'utf8'), dom.getInternalVMContext(), { filename: pathToFileURL(resolve('a2-desk.js')).href });
    await win.A2Desk.refresh();
    expect(win.A2Desk.getLesson('1.1').key).toBe('1-1');
    expect(win.A2Desk.getStatus('1-1')).toEqual(status);
    expect(win.A2Desk.getStatus('1.1')).toEqual(status);
    expect(win.A2Desk.getStatus('missing')).toBeUndefined();
    expect(win.document.getElementById('a2-gradebook-scores').textContent).toContain('Try-It 1: 2/2');
    win.A2Desk.paintDueLine();
    expect(win.document.querySelectorAll('[data-a2-due]')).toHaveLength(1);
    expect(win.document.getElementById('donow-msg').textContent).toContain('(due ' + today + ')');
    win.SCHEDULE_DEFS['SY26-27'].range.start = [2999, 0, 1];
    win.A2Desk.paintDueLine();
    expect(win.document.querySelector('[data-a2-due]')).toBeNull();
    identity = null;
    expect(win.A2Desk.getStatus('1-1')).toBeUndefined();
    await win.A2Desk.refresh();
    expect(win.document.getElementById('a2-gradebook-scores').textContent).toBe('');
  } finally { dom.window.close(); }
});
it('signed-out check renders registry items but cannot submit', async () => {
  const dom = new JSDOM(readFileSync('check.html', 'utf8'), { url: 'https://desk.test/check.html?lesson=1-1', runScripts: 'outside-only' });
  try {
    const win = dom.window;
    win.fetch = async () => ({ json: async () => lessons }); win.rosterClient = { token: () => null };
    win.eval(readFileSync('lib/a2-answers.js','utf8')); win.eval(readFileSync('check.js','utf8'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(win.document.querySelectorAll('fieldset')).toHaveLength(6);
    expect(win.document.querySelectorAll('input[data-answer]')).toHaveLength(5);
    expect(win.document.getElementById('submit').disabled).toBe(true);
    expect(win.document.getElementById('wall').textContent).toContain('Sign in');
  } finally { dom.window.close(); }
});
it('the teacher gradebook renders an editable topic-assessment column', async () => {
  const dom = new JSDOM(readFileSync('teacher-dashboard.html', 'utf8'), { url: 'https://desk.test/teacher-dashboard.html', runScripts: 'dangerously',
    beforeParse(win) { win.fetch = async url => ({ ok: true, json: async () => String(url).includes('content/a2/') ? lessons : { ok: true, students: [] } }); } });
  try {
    const win = dom.window;
    const payload = { students: [{ studentId: 'student-c', realName: 'C Student', section: 'C', gradebook: {
      weights: { Assessments: 50, Assignments: 40, Engagement: 10 }, quarters: { Q1: { columns: [{ key: 'TA-T1', kind: 'topic_assessment',
        title: 'Topic assessment T1', category: 'Assessments', maxPoints: 100, topicKeys: [] }], cells: { 'TA-T1': 78 }, schoologyTotal: 78, v3Total: 78 } }
    } }] };
    win.renderGradebook(payload);
    const input = win.document.querySelector('.a2-topic-score');
    expect(input.value).toBe('78'); expect(input.min).toBe('0'); expect(input.max).toBe('100');
    expect(input.dataset.itemId).toBe('TA-T1');
    expect(input.closest('tr').dataset.studentId).toBe('student-c');
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally { dom.window.close(); }
});


it.each([
  ['read-only', 'live'],
  ['view-as', 'live'],
  ['read-only', 'empty'],
  ['view-as', 'offline'],
])('refresh loads lesson metadata in %s mode with a %s overlay without student writes', async (mode, overlay) => {
  const dom = new JSDOM('<div id="donow-msg"><span data-a2-due>Existing due line</span></div><div id="a2-gradebook-scores">Existing scores</div><form id="a2-profile-form"></form>', {
    url: 'https://desk.test/desk.html', runScripts: 'outside-only',
  });
  try {
    const win = dom.window;
    const live = [{ ...lessons[0], title: 'Live lesson title' }];
    win.__WS_READ_ONLY__ = mode === 'read-only';
    win._viewAsContext = () => mode === 'view-as' ? { studentId: 'viewed-student' } : null;
    win.rosterClient = { current: () => ({ username: 'teacher', section: 'PeriodC' }), token: () => 'teacher-token', updateSection: vi.fn() };
    win.fetch = vi.fn(async () => ({ json: async () => lessons }));
    win.A2Client = { request: vi.fn(async path => {
      if (path !== '/lessons') throw new Error('Unexpected student request: ' + path);
      if (overlay === 'offline') throw new Error('Offline');
      return { lessons: overlay === 'empty' ? [] : live };
    }), changed: vi.fn() };
    win.applyA2Pacing = vi.fn();
    win.renderDoNowGrades = vi.fn();
    win.renderMyGradebook = vi.fn();
    win.setP = vi.fn();
    win.rCal = vi.fn();
    win.ROSTER_SERVICE_URL = 'https://roster.test';
    win.localStorage.setItem('sentinel', 'unchanged');
    const storageWrite = vi.spyOn(win.Storage.prototype, 'setItem');
    const storageRemove = vi.spyOn(win.Storage.prototype, 'removeItem');
    const storageClear = vi.spyOn(win.Storage.prototype, 'clear');
    const before = win.document.body.innerHTML;
    runInContext(readFileSync('a2-desk.js', 'utf8'), dom.getInternalVMContext(), { filename: pathToFileURL(resolve('a2-desk.js')).href });
    await win.A2Desk.refresh();
    const expected = overlay === 'live' ? live : lessons;
    expect(win.fetch).toHaveBeenCalledWith('content/a2/lessons.json');
    expect(win.A2Client.request.mock.calls.every(args => args.length === 1 && args[0] === '/lessons')).toBe(true);
    expect(win.A2Desk.getLesson('1.1')).toEqual(expected[0]);
    expect(win.applyA2Pacing).toHaveBeenCalledWith(expected);
    expect(win.A2Desk.getStatus('1.1')).toBeUndefined();
    expect(win.document.body.innerHTML).toBe(before);
    expect(win.renderDoNowGrades).not.toHaveBeenCalled();
    expect(win.renderMyGradebook).not.toHaveBeenCalled();
    expect(win.rosterClient.updateSection).not.toHaveBeenCalled();
    expect(win.setP).not.toHaveBeenCalled();
    expect(win.rCal).not.toHaveBeenCalled();
    expect(win.A2Client.changed).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(storageClear).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});
