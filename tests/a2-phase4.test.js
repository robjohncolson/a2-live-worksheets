import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
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
  expect(lessons[0].sections).toBeNull();
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
it('the Desk lesson tile links the supporting IXL skills for signed-out and today views', async () => {
  const html = '<div id="a2-today"></div><div id="a2-lessons"></div><div id="a2-gradebook-scores"></div><dialog id="a2-profile"><form id="a2-profile-form"><select></select></form><p id="a2-profile-message"></p></dialog>';
  const dom = new JSDOM(html, { url: 'https://desk.test/desk.html', runScripts: 'outside-only' });
  try {
    const win = dom.window;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const dated = lessons.map(lesson => ({ ...lesson, sections: { C: today } }));
    win.fetch = async () => ({ json: async () => dated });
    win.A2Client = { request: async path => (path === '/lessons' ? { lessons: dated } : { tryIts: { scores: [] } }), chips: () => [], changed() {} };
    win.rosterClient = { current: () => ({ section: 'PeriodC' }), token: () => 't' };
    win.eval(readFileSync('a2-desk.js', 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 20));
    const tileLinks = [...win.document.querySelectorAll('.a2-lesson-tile .a2-skills a')];
    expect(tileLinks.map(a => a.textContent)).toEqual(['Graph inequalities on number lines (prerequisite)', 'Domain and range']);
    expect(tileLinks.every(a => a.target === '_blank' && a.rel === 'noopener' && a.href.startsWith('https://www.ixl.com/'))).toBe(true);
    expect(win.document.querySelectorAll('#a2-today .a2-skills a')).toHaveLength(2);
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
