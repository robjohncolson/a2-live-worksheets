// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../teacher-dashboard.html', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../teacher-workspace.js', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const doms = [];
const tick = () => new Promise(r => setTimeout(r, 20));
const response = data => ({ ok: true, status: 200, json: async () => data });
// Legacy WS IDs and worksheet filenames below are synthetic protocol fixtures.
const saved = { itemId: 'WS-U1L1-Q1', source: 'worksheet', recordedAt: '2026-09-10T14:00:00Z', score: 1, response: '<img src=x onerror=alert(1)>' };
const student = { studentId: 's1', username: 'apple_cat', realName: 'Same Name', section: 'PeriodC', schoologyUid: '123', savedWork: { available: true, recent: [saved], pendingGrading: 0 }, gradebook: { quarters: {} } };
async function make({ embedded = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html.replace(/<script[^>]*src=[\s\S]*?<\/script>/g, ''), { url: 'https://example.test/teacher-dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  doms.push(dom);
  const w = dom.window;
  if (embedded) {
    Object.defineProperty(w, 'parent', { configurable: true, value: { postMessage: vi.fn() } });
  }
  const fetchMock = vi.fn(async url => {
    if (url === 'data/work-manifest.json') return response({ units: [{ lessons: [{ lesson: '1.1', activities: [{ activity: 'worksheet', itemIds: [saved.itemId] }] }] }] });
    if (url.includes('/recent?')) return response({ ok: true, submissions: [saved] });
    if (url.includes('/grade')) return response({ ok: true, quarters: {}, units: {}, students: [student] });
    if (url.includes('/roster/list')) return response({ ok: true, students: [{ ...student, currentPassword: 'private-fixture' }] });
    return response({ ok: true, rows: [], messages: [], heatmap: {} });
  });
  w.fetch = fetchMock;
  w.rosterClient = { token: () => null, current: () => ({ role: 'teacher' }) };
  await tick(); w.eval(workspace); await tick();
  w.teacherWorkspace.loaded({ ok: true, students: [student, { ...student, studentId: 's2', username: 'pear_cat' }] });
  return { w, doc: w.document, errors, fetchMock };
}
afterEach(() => { doms.splice(0).forEach(d => d.window.close()); });
describe('integrated teacher workspace', () => {
  it('organizes tools, filters duplicate names by identity and opens one student panel', async () => {
    const { w, doc, errors } = await make();
    expect(errors).toEqual([]);
    expect(doc.querySelectorAll('[data-workspace-tab]')).toHaveLength(4);
    expect(doc.querySelector('#workspace-class-details #gb-tbody')).not.toBeNull();
    const buttons = doc.querySelectorAll('#workspace-roster .student-name');
    buttons[1].click(); await tick();
    expect(w._tscCurrentStudentId).toBe('s2');
    expect(doc.getElementById('tsc-drawer').getAttribute('aria-hidden')).toBe('false');
    expect(doc.querySelector('[data-student-tab=overview]').getAttribute('aria-pressed')).toBe('true');
    w.closeTscDrawer();
    doc.getElementById('workspace-search').value = 'apple';
    doc.getElementById('workspace-search').dispatchEvent(new w.Event('input'));
    expect(doc.querySelectorAll('#workspace-roster .student-name')).toHaveLength(1);
  });
  it('opens the same panel from pacing, grades, roster management, triage and messages', async () => {
    const { w, doc, fetchMock } = await make();
    const payload = { ok: true, students: [student] };
    w.lastGradesPayload = payload; w.lastPacingPayload = payload;
    w._summerScheduleData = { lessons: [] };
    w.renderPacingOverview(payload); w.renderGradesTable(payload);
    w.managedStudents = [student]; w.renderManagedStudents();
    w.renderTriage({ heatmap: { A: { weak: 1, total: 1, pctWeak: 100 } }, students: [{ ...student, weakSkills: ['A'] }] });
    w.renderStudentInbox([{ senderUsername: student.username, text: 'hello', createdAt: saved.recordedAt }]);
    for (const selector of ['#pacing-tbody', '#grades-tbody', '#manage-students-tbody', '#triage-list', '#inbox-list']) {
      const name = doc.querySelector(selector + ' .student-name');
      expect(name, selector).not.toBeNull();
      name.click(); await tick(); expect(w._tscCurrentStudentId).toBe('s1'); w.closeTscDrawer();
    }
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/lesson-unlocks'))).toBe(false);
  });
  it('loads through the public button, opts into metadata and uses the selected period', async () => {
    const { w, doc, fetchMock } = await make();
    w.rosterClient.token = () => 'teacher-fixture';
    const select = doc.getElementById('workspace-period');
    expect([...select.options].map(option => option.value)).toEqual(['', 'PeriodC', 'PeriodD', 'PeriodG']);
    select.value = 'PeriodG';
    select.dispatchEvent(new w.Event('change'));
    expect(select.disabled).toBe(true);
    await tick();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/class/grades?section=PeriodG&includeSavedWork=1'))).toBe(true);
    expect(select.disabled).toBe(false);
  });
  it('saves an explicitly entered Schoology link for the selected ID only', async () => {
    const { w, doc, fetchMock } = await make();
    doc.querySelectorAll('#workspace-roster .student-name')[1].click(); await tick();
    const form = doc.querySelector('#workspace-account form');
    form.querySelector('input').value = '987654';
    form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    const call = fetchMock.mock.calls.find(([, options]) => options && options.method === 'PATCH');
    expect(call[0]).toContain('/roster/s2/schoology-uid');
    expect(JSON.parse(call[1].body)).toEqual({ schoologyUid: '987654' });
  });
  it('distinguishes failed data, pending grading, missing grade and a real zero', async () => {
    const { w, doc, fetchMock } = await make();
    const s = { ...student, savedWork: { available: true, recent: [], pendingGrading: 2 }, gradebook: { quarters: { Q1: { columns: [{ key: 'missing', title: 'Due lesson', due: true }, { key: 'zero', due: true }, { key: 'unknown' }], cells: { missing: null, zero: 0 } } } } };
    w.teacherWorkspace.loaded({ ok: true, students: [s] });
    expect(doc.getElementById('workspace-attention-list').textContent).toContain('2 response(s) awaiting grading');
    expect(doc.getElementById('workspace-attention-list').textContent).toContain('1 due items without a grade');
    w.teacherWorkspace.failed();
    expect(doc.getElementById('workspace-feed').textContent).toContain('unavailable');
    expect(doc.getElementById('workspace-feed').textContent).not.toContain('No saved submissions');
  });
  it('shows safe saved responses and opens a read-only worksheet separately from the student app', async () => {
    const { w, doc, fetchMock } = await make();
    doc.querySelector('#workspace-roster .student-name').click(); await tick();
    expect(doc.querySelector('#tsc-recent-list pre').textContent).toBe(saved.response);
    expect(doc.querySelector('#tsc-recent-list img')).toBeNull();
    doc.querySelector('#tsc-recent-list button').click();
    expect(doc.querySelector('#workspace-worksheet iframe').getAttribute('src')).toBe('u1_lesson1_live.html?viewAsUserId=s1');
    expect(doc.getElementById('tsc-action-view-as').textContent).toBe('View student app');
    w.closeTscDrawer();
    expect(doc.querySelector('#workspace-worksheet iframe')).toBeNull();
  });
  it('fetches passwords only on explicit reveal and removes them on close', async () => {
    const { w, doc, fetchMock } = await make();
    doc.querySelector('#workspace-roster .student-name').click(); await tick();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/roster/list'))).toBe(false);
    Array.from(doc.querySelectorAll('#workspace-account button')).find(b => b.textContent === 'Reveal current sign-in password').click(); await tick();
    expect(doc.getElementById('workspace-account').textContent).toContain('private-fixture');
    w.closeTscDrawer(); expect(doc.body.textContent).not.toContain('private-fixture');
  });
  it('embeds the dashboard, gates teachers and routes deprecated review to recent work', () => {
    const block = desk.slice(desk.indexOf('var _teacherWorkspaceFocus'), desk.indexOf('var _GRADE_CHECKIN_KEY'));
    expect(block).toContain("typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()");
    expect(block).toContain('teacher-dashboard.html?workspace=1&view=');
    expect(block).not.toContain('window.open');
    expect(block).not.toContain('teacher-classroom.html');
    expect(block).not.toContain('teacher-code-generator.html');
    expect(block).toContain('event.source !== frame.contentWindow');
    expect(desk).toContain("function openNightlyReview() {\n    openTeacherTools('recent');");
  });
});


describe('skill evidence navigation', () => {
  function evidence(skill, answer = '<img src=x onerror=alert(1)>') {
    return { ok: true, skill, summary: { observations: 1, correct: 1 }, flagged: true, frqThreshold: .5,
      submissions: [{ ...saved, source: 'curriculum_quiz', correct: true, response: answer, expectedAnswer: 'B',
        question: { prompt: 'What is the domain of f(x) = x squared?', attachments: { choices: [{ key: 'B', value: 'All real numbers' }], table: [['Input'], ['Any real number']] } } }] };
  }
  it('opens the clicked skill and exact student, showing the question, choices and saved answer safely', async () => {
    const { w, doc, fetchMock } = await make();
    const original = w.fetch;
    const evidenceFetch = vi.fn(url => url.includes('recent?skill=') ? Promise.resolve(response(evidence('2.B'))) : original(url));
    w.fetch = evidenceFetch;
    w.renderTriage({ heatmap: { '2.B': { weak: 1, total: 1, pctWeak: 100 } }, students: [{ ...student, studentId: 's2', weakSkills: ['2.B'] }] });
    doc.querySelector('#triage-list .student-name').click(); await tick();
    expect(evidenceFetch.mock.calls.some(([url]) => url.includes('/student/s2/recent?skill=2.B'))).toBe(true);
    const pane = doc.getElementById('workspace-evidence');
    expect(pane.hidden).toBe(false);
    expect(pane.textContent).toContain('What is the domain of f(x) = x squared?');
    expect(pane.textContent).toContain('B. All real numbers');
    expect(pane.textContent).toContain(saved.response);
    expect(pane.textContent).toContain('Counted correct');
    expect(pane.textContent).toContain('tentative flag');
    expect(pane.querySelector('img')).toBeNull();
    w.teacherWorkspace.recent({ ok: true, submissions: [saved] });
    expect(pane.hidden).toBe(false);
    expect(pane.textContent).toContain('What is the domain');
  });
  it('ignores stale evidence after switching students and provides a retry on failure', async () => {
    const { w, doc, fetchMock } = await make();
    const original = w.fetch; let finish;
    w.fetch = vi.fn(url => url.includes('recent?skill=') ? new Promise(resolve => { finish = resolve; }) : original(url));
    w.openTscDrawer(student, '2.B'); await tick();
    w.openTscDrawer({ ...student, studentId: 's2' });
    finish(response(evidence('2.B', 'Old student answer'))); await tick();
    expect(doc.getElementById('workspace-evidence').textContent).not.toContain('Old student answer');
    w.fetch = vi.fn(url => url.includes('recent?skill=') ? Promise.reject(new Error('offline')) : original(url));
    w.openTscDrawer(student, '2.B'); await tick();
    expect(doc.getElementById('workspace-evidence').textContent).toContain('Could not load');
    w.fetch = vi.fn(url => url.includes('recent?skill=') ? Promise.resolve(response(evidence('2.B'))) : original(url));
    doc.querySelector('#workspace-evidence button').click(); await tick();
    expect(doc.getElementById('workspace-evidence').textContent).toContain('Counted correct');
  });
  it('shows missing prompts and FRQ scores without hiding the saved response', async () => {
    const { w, doc, fetchMock } = await make(); const original = w.fetch;
    const payload = evidence('1.A'); payload.submissions[0] = { ...saved, source: 'frq', correct: true, score: .5, question: null };
    w.fetch = vi.fn(url => url.includes('recent?skill=') ? Promise.resolve(response(payload)) : original(url));
    w.openTscDrawer(student, '1.A'); await tick();
    expect(doc.getElementById('workspace-evidence').textContent).toContain('Question text unavailable');
    expect(doc.getElementById('workspace-evidence').textContent).toContain('Saved FRQ score: 50%');
    expect(doc.getElementById('workspace-evidence').textContent).toContain(saved.response);
  });
});


describe('teacher receipt scan launcher', () => {
  it('sends the scan action handled by the Desk verifier bridge', async () => {
    const { w, doc } = await make({ embedded: true });
    const post = w.parent.postMessage;
    const scan = Array.from(doc.querySelectorAll('button')).find(button => button.textContent === 'Verify receipt (scan)');
    expect(scan).toBeTruthy();
    scan.click();
    expect(post).toHaveBeenCalledWith({ type: 'teacher-workspace', action: 'scan' }, w.location.origin);
    expect(desk).toContain("if (event.data.action === 'scan') { openVerifyQR(); return; }");
  });
});


describe('teacher workspace tools', () => {
  it('sends the embedded checkin action handled by the Desk bridge', async () => {
    const { w, doc } = await make({ embedded: true });
    const checkin = Array.from(doc.querySelectorAll('#workspace-tool-buttons button')).find(button => button.textContent === 'Grade check-in');
    expect(checkin).toBeTruthy();
    checkin.click();
    expect(w.parent.postMessage).toHaveBeenCalledWith({ type: 'teacher-workspace', action: 'checkin' }, w.location.origin);
    expect(desk).toContain("if (event.data.action === 'checkin') { destroyTeacherTools(); openGradeCheckin(); }");
  });

  it('opens the local paste verifier and never targets inherited AP tools', async () => {
    const { w, doc } = await make({ embedded: true });
    const buttons = Array.from(doc.querySelectorAll('#workspace-tool-buttons button'));
    const paste = buttons.find(button => button.textContent === 'Verify receipt (paste)');
    expect(paste).toBeTruthy();
    paste.click();
    expect(doc.querySelector('#workspace-tool iframe').getAttribute('src')).toBe('verify.html');
    expect(doc.querySelector('#workspace-tool iframe').src).toBe(new URL('verify.html', w.location.href).href);
    for (const button of buttons) {
      button.click();
      for (const frame of doc.querySelectorAll('#workspace-tool iframe')) {
        expect(frame.src).not.toContain('robjohncolson.github.io/curriculum_render');
      }
    }
  });
});


it.each([
  'content/a2/1-1/images/1-1_savvas_q18-22_graph.png',
  '../lesson diagrams/graph.png?version=2',
  'https://images.example.org/algebra/graph.png?version=2',
])('preserves the question image path %s', async image => {
  const { w, doc } = await make();
  const original = w.fetch;
  const evidenceFetch = vi.fn(url => url.includes('recent?skill=')
    ? Promise.resolve(response({ ok: true, skill: '2.B',
      summary: { observations: 1, correct: 1 }, flagged: false, frqThreshold: .5,
      submissions: [{ ...saved, correct: true,
        question: { prompt: 'Read the graph.', attachments: { image } },
      }] })) : original(url));
  w.fetch = evidenceFetch;
  w.openTscDrawer(student, '2.B');
  await vi.waitFor(() => {
    const img = doc.querySelector('#workspace-evidence img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(image);
  }, { timeout: 1000, interval: 20 });
  expect(evidenceFetch.mock.calls.some(([url]) => url.includes('/student/s1/recent?skill=2.B'))).toBe(true);
});
