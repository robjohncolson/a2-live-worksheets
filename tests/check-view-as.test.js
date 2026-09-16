import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi } from 'vitest';

const lessons = JSON.parse(readFileSync('content/a2/lessons.json', 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function openCheck({ role = 'teacher', token = 'teacher-token', status = 200 } = {}) {
  const dom = new JSDOM(readFileSync('check.html', 'utf8'), {
    url: 'https://desk.test/check.html?lesson=1-1&viewAsUserId=student-c',
    runScripts: 'outside-only',
  });
  const win = dom.window;
  win.ROSTER_SERVICE_URL = 'https://roster.test';
  win.rosterClient = { token: () => token, current: () => role ? { role } : null };
  win.fetch = vi.fn(async url => {
    if (url === 'content/a2/lessons.json') return { ok: true, json: async () => lessons };
    return { ok: status === 200, status, json: async () => status === 200 ? {
      ok: true, studentId: 'student-c', realName: '<b>Student C</b>',
      lessons: [{ lessonKey: '1.1', lessonCheck: 80 }],
    } : { ok: false, error: 'forbidden' } };
  });
  win.eval(readFileSync('a2-client.js', 'utf8'));
  win.eval(readFileSync('lib/a2-answers.js', 'utf8'));
  win.eval(readFileSync('check.js', 'utf8'));
  return dom;
}

describe('lesson check teacher view-as', () => {
  it('renders read-only items and authenticated student status without ledger writes', async () => {
    const dom = openCheck();
    try {
      await tick();
      const win = dom.window;
      const doc = win.document;
      expect(doc.querySelectorAll('fieldset')).toHaveLength(6);
      expect([...doc.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
      expect(doc.getElementById('submit')).toBeNull();
      expect(doc.getElementById('retake')).toBeNull();
      const banner = doc.getElementById('view-as-banner');
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toBe('Viewing as <b>Student C</b>');
      expect(banner.querySelector('b')).toBeNull();
      expect(doc.getElementById('message').textContent).toBe('Lesson check best: 8.00/10.');
      expect(win.fetch).toHaveBeenCalledWith('https://roster.test/teacher/student/student-c/grade', {
        method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer teacher-token' },
      });
      doc.getElementById('check').dispatchEvent(new win.Event('submit', { cancelable: true }));
      await tick();
      expect(win.fetch.mock.calls.some(([url]) => url.includes('/ledger/record'))).toBe(false);
      expect(win.localStorage.getItem('a2_lesson_changed')).toBeNull();
      win.rosterClient.token = () => null;
      win.dispatchEvent(new win.Event('roster-session-changed'));
      expect(banner.hidden).toBe(true);
      expect(doc.getElementById('message').textContent).toBe('');
      expect(doc.getElementById('wall').textContent).toContain('Sign in');
    } finally { dom.window.close(); }
  });

  it.each([
    { role: null, token: null },
    { role: 'student', token: 'student-token' },
    { role: 'teacher', token: null },
  ])('requires a teacher session: %j', async session => {
    const dom = openCheck(session);
    try {
      await tick();
      const win = dom.window;
      expect(win.document.querySelectorAll('fieldset')).toHaveLength(6);
      expect([...win.document.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
      expect(win.document.getElementById('submit')).toBeNull();
      expect(win.document.getElementById('wall').textContent).toContain('Sign in');
      win.document.getElementById('check').dispatchEvent(new win.Event('submit', { cancelable: true }));
      await tick();
      expect(win.fetch.mock.calls.map(([url]) => url)).toEqual(['content/a2/lessons.json']);
    } finally { dom.window.close(); }
  });

  it.each([401, 403])('falls back to sign-in on rejected teacher access (%s)', async status => {
    const dom = openCheck({ status });
    try {
      await tick();
      const win = dom.window;
      expect(win.document.getElementById('wall').textContent).toContain('Sign in');
      expect(win.document.getElementById('view-as-banner').hidden).toBe(true);
      expect(win.document.getElementById('submit')).toBeNull();
      win.document.getElementById('check').dispatchEvent(new win.Event('submit', { cancelable: true }));
      await tick();
      expect(win.fetch.mock.calls.some(([url]) => url.includes('/ledger/record'))).toBe(false);
    } finally { dom.window.close(); }
  });
});
