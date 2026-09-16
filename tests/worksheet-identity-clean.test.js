import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const windows = [];
const students = [
  { studentId: 'student-c', username: 'algebra_c', realName: 'Student C', section: 'C', token: 'token-c' },
  { studentId: 'student-d', username: 'algebra_d', realName: 'Student D', section: 'D', token: 'token-d' }
];

function mount() {
  const w = new JSDOM('', { url: 'https://example.test/', runScripts: 'outside-only' }).window;
  windows.push(w);
  Object.defineProperty(w.document, 'readyState', { get: () => 'complete' });
  w.ROSTER_SERVICE_URL = 'https://roster.example.test';
  w.fetch = vi.fn();
  w.eval(read('roster-client.js'));
  return w;
}

async function openForm(w) {
  // Prefill is an initialization helper: model opening a form after sign-in.
  w.document.body.innerHTML = '<div class="student-info"><input id="worksheetName"><input id="worksheetPeriod"><input id="worksheetUsername"></div>';
  w.eval(read('roster-prefill.js'));
  await new Promise(resolve => w.setTimeout(resolve, 0));
}

afterEach(() => { windows.splice(0).forEach(w => w.close()); });

describe('worksheet identity from the shared A2 session', () => {
  it('replaces stale form identity for each of two students signing in on one device', async () => {
    const w = mount();
    w.localStorage.setItem('worksheet-user', JSON.stringify({ name: 'Previous person', klass: 'G', username: 'old' }));
    for (const student of students) {
      w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ...student }) });
      expect((await w.rosterClient.signIn(student.username, 'fixture-password')).ok).toBe(true);
      await openForm(w);
      expect(w.document.getElementById('worksheetName').value).toBe(student.realName);
      expect(w.document.getElementById('worksheetPeriod').value).toBe(student.section);
      expect(w.document.getElementById('worksheetUsername').value).toBe(student.username);
      expect(JSON.parse(w.localStorage.getItem('worksheet-user'))).toEqual({
        name: student.realName, klass: student.section, username: student.username
      });
      expect(w.document.getElementById('roster-prefill-banner').textContent).toContain(student.realName);
      expect(w.rosterClient.current().studentId).toBe(student.studentId);
    }
  });

  it('publishes a changed session only after the new identity is durable', async () => {
    const w = mount();
    const observed = [];
    w.addEventListener('roster-session-changed', () => {
      observed.push({ studentId: w.rosterClient.current().studentId, token: w.rosterClient.token() });
    });
    for (const student of students) {
      w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ...student }) });
      await w.rosterClient.signIn(student.username, 'fixture-password');
    }
    expect(observed).toEqual(students.map(({ studentId, token }) => ({ studentId, token })));
  });

  it('does not treat a cached worksheet name as an authenticated roster identity', async () => {
    const w = mount();
    w.localStorage.setItem('worksheet-user', JSON.stringify({ name: 'Previous person', klass: 'C', username: 'old' }));
    await openForm(w);
    expect(w.rosterClient.current()).toBeNull();
    expect(w.rosterClient.token()).toBeNull();
    expect(w.document.getElementById('worksheetName').value).toBe('');
    expect(w.document.getElementById('roster-prefill-banner')).toBeNull();
  });
});
