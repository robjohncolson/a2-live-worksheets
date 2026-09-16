// @vitest-environment node
// A2 lesson loading, local check links, and honest grade indicators.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const LABEL_SOURCE = ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']
  .map(file => readFileSync(resolve(repo, file), 'utf8')).join('\n');
const LESSON = { key: '1-1', title: 'Key Features of Functions', supportingSkills: [] };
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });

function boot({ published = [LESSON], live = null, offlineMode, grade = null, localFailure = false, liveFailure = false } = {}) {
  const fetch = vi.fn(async url => {
    const path = String(url);
    if (path === 'content/a2/lessons.json') {
      if (localFailure) throw new Error('Local registry unavailable');
      return { ok: true, json: async () => published };
    }
    if (path === 'https://api.test/lessons') {
      if (liveFailure) throw new Error('Service unavailable');
      return { ok: live !== null, status: live === null ? 503 : 200, json: async () => live };
    }
    if (path.includes('/grade?')) return { ok: true, json: async () => grade };
    return { ok: false, status: 404, json: async () => null, text: async () => '' };
  });
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously',
    url: 'https://a2.example.test/mobile-home.html',
    beforeParse(window) {
      window.eval(LABEL_SOURCE);
      window.OFFLINE_MODE = offlineMode;
      window.fetch = fetch;
      window.ROSTER_SERVICE_URL = 'https://api.test';
      window.rosterClient = {
        current: () => grade ? { studentId: 'a2-c', username: 'mango_fox', section: 'C' } : null,
        token: () => grade ? 'local-test-token' : null,
      };
    },
  });
  windows.push(dom.window);
  return { document: dom.window.document, fetch };
}

async function flush() {
  for (let i = 0; i < 16; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

describe('mobile A2 lesson check links', () => {
  it.each([undefined, true, '1'])('keeps a local lesson check in mode %s', async offlineMode => {
    const { document, fetch } = boot({ offlineMode });
    await flush();
    const link = document.querySelector('a.btn.ws');
    expect(link.textContent).toBe('Lesson Check');
    expect(link.getAttribute('href')).toBe('check.html?lesson=1-1');
    expect(document.querySelector('a.btn.quiz')).toBeNull();
    expect(document.querySelector('.done-badge')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('content/a2/lessons.json');
    expect(fetch).toHaveBeenCalledWith('https://api.test/lessons');
  });

  it.each([
    [{ ...LESSON, title: 'Updated lesson' }],
    { lessons: [{ ...LESSON, title: 'Updated lesson' }] },
  ])('accepts live registry payload %j', async live => {
    const { document } = boot({ live });
    await flush();
    expect(document.querySelector('.lesson .title').textContent).toContain('Updated lesson');
    expect(document.querySelectorAll('.lesson')).toHaveLength(1);
  });

  it.each([null, [], { lessons: [] }, { malformed: true }])('preserves published lessons for unusable live data %j', async live => {
    const { document } = boot({ live });
    await flush();
    expect(document.querySelector('.lesson .title').textContent).toContain(LESSON.title);
  });

  it('preserves the local lesson when the service rejects', async () => {
    const { document } = boot({ liveFailure: true });
    await flush();
    expect(document.querySelector('a.btn.ws').getAttribute('href')).toBe('check.html?lesson=1-1');
  });

  it('uses live lessons when the local registry fails', async () => {
    const { document } = boot({ localFailure: true, live: { lessons: [LESSON] } });
    await flush();
    expect(document.querySelectorAll('.lesson')).toHaveLength(1);
  });

  it('shows an empty state when both sources fail without inventing a completion', async () => {
    const { document } = boot({ localFailure: true, liveFailure: true });
    await flush();
    expect(document.querySelector('#main').textContent).toContain('No lessons found.');
    expect(document.querySelector('.done-badge')).toBeNull();
  });

  it('shows only the matching lesson grade supplied by the service', async () => {
    const { document } = boot({ grade: { ok: true, lessons: [{ lessonKey: '1-1', lessonGrade: 80 }], quarters: [] } });
    await flush();
    expect(document.querySelector('.done-badge').textContent).toContain('80%');
  });

  it.each([null, 'not-a-number'])('does not show a completion for invalid grade %s', async lessonGrade => {
    const { document } = boot({ grade: { ok: true, lessons: [{ lessonKey: '1-1', lessonGrade }], quarters: [] } });
    await flush();
    expect(document.querySelector('.done-badge')).toBeNull();
  });
});
