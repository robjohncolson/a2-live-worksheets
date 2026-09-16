/** @vitest-environment node */
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import bcrypt from '../../roster-server/node_modules/bcryptjs/index.js';
import { JSDOM } from 'jsdom';
import { createApp } from '../../roster-server/server.js';
import { bootDesk } from './harness.js';
import { createFakeRoster } from './fake-roster.js';
import { loadA2Lessons, lessonScheduleFromModel } from '../../roster-server/a2-lessons.js';
import { PHASE3_CONFIG } from '../../roster-server/grade-config.js';

it('C student signs in, completes 4/6 then 6/6, sees best 10/10 in the Desk and gradebook, and bonus-window district grade 100', async () => {
  vi.stubEnv('ROSTER_TOKEN_SECRET', 'a2-journey-test');
  const lesson = loadA2Lessons()[0];
  const rows = [];
  const user = { studentId: 'stu-c', username: 'c_otter', realName: 'C Otter', section: 'C', role: 'student', password: '1234' };
  const rosterRow = { student_id: user.studentId, login_username: user.username, real_name: user.realName,
    section: 'C', status: 'active', password_hash: bcrypt.hashSync('1234', 4), must_change_password: false };
  const db = { findByUsername: async () => ({ data: rosterRow }), findByStudentId: async () => ({ data: rosterRow }),
    getRoleByStudentId: async () => 'student', getSpriteHueByStudentId: async () => null };
  const store = { getPacing: async () => ({ '1-1': { sections: { C: '2026-09-10' } } }), getRescores: async () => ({}) };
  const ledgerDb = { a2Store: store, getLedgerByStudent: async () => ({ data: rows }),
    insertLedgerRow: async row => { const saved = { ledger_id: String(rows.length + 1), student_id: row.studentId, item_id: row.itemId,
      source: row.source, score: row.score, response: row.response, attempt: row.attempt, recorded_at: '2026-09-13T12:00:00Z' }; rows.push(saved); return { data: saved }; } };
  const app = createApp(db, ledgerDb, async () => ({ units: [] }), async () => ({ answerKey: {} }), async () => ({}), null, null,
    lessonScheduleFromModel([lesson]), { ...PHASE3_CONFIG, useDistrictFormula: true }, null, null, null, null, null, {});
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const fake = createFakeRoster({ users: [user] });
  const proxyPaths = new Set(['/roster/verify', '/grade', '/lessons', '/lesson-status/1-1', '/ledger/record']);
  const adapter = { state: fake.state, handles: () => true, fetch: (url, init) => {
    const parsed = new URL(url);
    return (proxyPaths.has(parsed.pathname) || parsed.pathname.startsWith('/lesson-status/')) ? fetch(base + parsed.pathname + parsed.search, init) : fake.fetch(url, init);
  } };
  let desk, check;
  try {
    desk = await bootDesk({ roster: adapter, now: '2026-09-13T16:00:00Z' });
    await desk.signIn(user.username);
    await desk.window.A2Desk.refresh();
    expect(desk.window.rosterClient.current().section).toBe('C');
    expect(desk.document.querySelector('[data-lesson="1-1"] a').getAttribute('href')).toBe('check.html?lesson=1-1');
    check = new JSDOM(readFileSync('check.html', 'utf8'), { url: 'https://desk.test/check.html?lesson=1-1', runScripts: 'outside-only' });
    const win = check.window;
    win.ROSTER_SERVICE_URL = base;
    win.rosterClient = { token: () => desk.window.rosterClient.token() };
    win.fetch = (url, init) => String(url).startsWith('content/') ? Promise.resolve({ json: async () => [lesson] }) : fetch(url, init);
    for (const file of ['a2-client.js', 'lib/a2-answers.js', 'check.js']) win.eval(readFileSync(file, 'utf8'));
    await desk.waitFor(() => win.document.querySelectorAll('fieldset').length === 6);
    function fill(correctCount) {
      lesson.lessonCheck.forEach((item, i) => {
        if (item.type === 'mc') win.document.querySelector('input[value="A"]').checked = true;
        else win.document.getElementById(item.registryId).value = i < correctCount - 1 ? item.answer.split('|')[0] : 'wrong';
      });
      win.document.getElementById('check').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    }
    fill(4); await desk.waitFor(() => rows.length === 1);
    expect(rows[0].score).toBeCloseTo(20 / 3);
    await desk.waitFor(() => !win.document.getElementById('submit').disabled);
    win.document.getElementById('retake').click(); fill(6);
    await desk.waitFor(() => rows.length === 2);
    expect(rows[1].score).toBe(10);
    await desk.window.A2Desk.refresh();
    expect(desk.document.querySelector('[data-lesson="1-1"]').textContent).toContain('Lesson check 100%');
    desk.window.openMyGradebook();
    expect(desk.document.getElementById('my-gradebook-body').textContent).toContain('10.0 / 10');
    const grade = await (await fetch(base + '/grade', { headers: { Authorization: 'Bearer ' + desk.window.rosterClient.token() } })).json();
    expect(grade.quarters.Q1.quarterGrade).toBe(100);
    expect(grade.quarters.Q1.categoryBreakdown.assignments.bonusWindowExcluded).toBe(5);
    expect(grade.quarters.Q1.categoryBreakdown.assignments.possible).toBe(0);
    expect(grade.quarters.Q1.categoryBreakdown.engagement.possible).toBe(0);
  } finally {
    check?.window.close(); if (desk) await desk.teardown();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs();
  }
}, 15000);
