// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { CED_SOURCE } from './fixtures/ced2026-labels.js';

const read = file => readFileSync(new URL(pathToFileURL(resolve(__dirname, '..', file)).href), 'utf8');
const opened = [];
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()));
const published = [{ key: '1-1', topic: 1, title: 'Key Features of Functions',
  sections: { C: '2026-09-24', D: '2026-09-25', G: '2026-09-25' },
  deck: 'content/a2/1-1/flashcards.csv',
  supportingSkills: [{ name: 'Domain and range', url: 'https://www.ixl.com/math/algebra-2/domain-and-range' }],
}];

function bootMobile({ live = { lessons: published }, offline = false, status = 200, signedIn = false } = {}) {
  const fetch = vi.fn(async url => {
    if (String(url) === 'content/a2/lessons.json') return { ok: true, json: async () => published };
    if (String(url) === 'https://roster.test/lessons') {
      if (offline) throw new Error('offline');
      return { ok: status === 200, status, json: async () => live };
    }
    if (String(url).includes('/grade')) return { ok: true, json: async () => ({
      ok: true, lessons: [{ lessonKey: '1-1', lessonGrade: 84 }], quarters: {},
    }) };
    return { ok: false, status: 404, json: async () => null, text: async () => '' };
  });
  const dom = new JSDOM(read('mobile-home.html'), {
    runScripts: 'dangerously', url: 'https://school.test/mobile-home.html',
    beforeParse(window) {
      window.eval(CED_SOURCE);
      window.ROSTER_SERVICE_URL = 'https://roster.test';
      window.rosterClient = {
        token: () => signedIn ? 'session' : null,
        current: () => signedIn ? { username: 'a2-student', role: 'student' } : null,
      };
      window.fetch = fetch;
    },
  });
  opened.push(dom);
  return { win: dom.window, fetch };
}

describe('published A2 mobile lessons', () => {
  it('keeps check/deck identities, supporting links and recorded grade', async () => {
    const snapshot = JSON.stringify(published);
    const { win } = bootMobile({ signedIn: true });
    await vi.waitFor(() => expect(win.document.querySelector('.done-badge')?.textContent).toContain('84%'));
    const card = win.document.querySelector('.lesson');
    expect(card.querySelector('.title').textContent).toContain('1-1 · Key Features of Functions');
    expect(card.querySelector('a.ws').getAttribute('href')).toBe('check.html?lesson=1-1');
    expect(card.querySelector('button.fc').textContent).toContain('Flashcards');
    expect(card.querySelector('a.ixl').getAttribute('href')).toBe(published[0].supportingSkills[0].url);
    expect(JSON.stringify(published)).toBe(snapshot);
  });

  it.each([
    { offline: true }, { status: 503 }, { live: { lessons: [] } }, { live: { invalid: true } },
  ])('retains bundled published lessons when the live response cannot replace them: %j', async options => {
    const { win, fetch } = bootMobile(options);
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url === 'https://roster.test/lessons')).toBe(true));
    // Let the response/rejection and fallback continuation settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(win.document.querySelectorAll('.lesson')).toHaveLength(1);
    expect(win.document.querySelector('a.ws').getAttribute('href')).toBe('check.html?lesson=1-1');
    expect(win.document.querySelector('a[href*="lesson=1-2"]')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url === 'content/a2/lessons.json')).toBe(true);
  });

  it('uses refreshed A2 titles while preserving published lesson links', async () => {
    const live = { lessons: [{ ...published[0], title: 'Updated function lesson' }] };
    const { win } = bootMobile({ live });
    await vi.waitFor(() => expect(win.document.querySelector('.title')?.textContent).toContain('Updated function lesson'));
    expect(win.document.querySelectorAll('.lesson')).toHaveLength(1);
    expect(win.document.querySelector('a.ws').getAttribute('href')).toBe('check.html?lesson=1-1');
  });
});

describe('A2 entry pages', () => {
  it('explains district categories, minimums and retained work types', () => {
    const dom = new JSDOM(read('start-here.html'));
    opened.push(dom);
    const text = dom.window.document.body.textContent;
    expect(text).toContain('Assessments 50%, Assignments 40%, Engagement 10%');
    expect(text).toContain('4 Assessments, 10 Assignments, and 10 Engagement');
    for (const label of ['Try-Its', 'Daily Blooket', 'flashcard check', 'Quiz', 'Assignments', 'Assessments', 'Engagement']) expect(text).toContain(label);
    expect(text).toContain('Real effort but wrong, or right with no work: 8 (80%).');
    expect(text).toContain('Each question follows the Try-It rule: real effort but wrong, or right with no work, earns 80%.');
    expect(text).toContain('higher score and add half of your lower score');
    expect(text).toContain('Schoology has one Bonus column');
    expect(dom.window.document.querySelector('a[href="desk.html"]')).not.toBeNull();
  });

  it('identifies the landing page as Algebra 2 and links to the Desk', () => {
    const dom = new JSDOM(read('index.html'));
    opened.push(dom);
    expect(dom.window.document.title).toContain('Algebra 2');
    expect(dom.window.document.querySelector('a[href="desk.html"]')).not.toBeNull();
  });
});
