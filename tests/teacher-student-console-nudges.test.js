// teacher-student-console-nudges.test.js -- Wave B of P7 BUILD section 3.4.
// Tests the Nudge History drawer section in teacher-dashboard.html.
//
// Strategy: two layers.
//   1. Static source analysis (node env) -- verifies DOM markup, CSS rules, and
//      JS function signatures are present verbatim in the file.
//   2. JSDOM behavioral tests -- loads the page with runScripts:'dangerously',
//      stubs fetch, and exercises fetch wiring, render, and drawer switching.
//
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH_PATH = resolve(repo, 'teacher-dashboard.html');
const DASH = existsSync(DASH_PATH) ? readFileSync(DASH_PATH, 'utf8') : null;

// ---------------------------------------------------------------------------
// JSDOM helper -- mirrors teacher-student-console-unlocks.test.js pattern.
// ---------------------------------------------------------------------------

function makeDom(fetchMock) {
  if (!DASH) throw new Error('teacher-dashboard.html not found');

  const cleaned = DASH
    .replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');

  const dom = new JSDOM(cleaned, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const { window } = dom;

  // Stubs required at script-eval time.
  window.rosterClient = { token: () => null, current: () => null };
  window.fetch = fetchMock || vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });

  return dom;
}

// Two sample nudge rows for tests (one teacher-direction, one student-direction).
const SAMPLE_NUDGE_ROWS = [
  {
    id: 1,
    direction: 'teacher',
    sender_username: 'mr.colson',
    recipient_username: 'apple-bird',
    text: 'Great work on that problem!',
    created_at: '2026-05-20T10:00:00Z',
    delivered_at: '2026-05-20T10:00:01Z',
  },
  {
    id: 2,
    direction: 'student',
    sender_username: 'apple-bird',
    recipient_username: 'mr.colson',
    text: 'Thank you, I have a question about Q3.',
    created_at: '2026-05-20T10:05:00Z',
    delivered_at: '2026-05-20T10:05:01Z',
  },
];

// ---------------------------------------------------------------------------
// 1. Nudge History DOM presence (static analysis)
// ---------------------------------------------------------------------------

describe('Nudge History DOM presence', () => {
  it('file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('#tsc-section-nudges exists with #tsc-nudges-list inside', () => {
    expect(DASH).toMatch(/id="tsc-section-nudges"/);
    expect(DASH).toMatch(/id="tsc-nudges-list"/);
  });

  it('nudges section sits between unlocks section and actions nav in DOM order', () => {
    const unlocksIdx = DASH.indexOf('id="tsc-section-unlocks"');
    const nudgesIdx = DASH.indexOf('id="tsc-section-nudges"');
    const actionsIdx = DASH.indexOf('class="tsc-actions"');
    expect(unlocksIdx).toBeGreaterThan(-1);
    expect(nudgesIdx).toBeGreaterThan(-1);
    expect(actionsIdx).toBeGreaterThan(-1);
    expect(unlocksIdx).toBeLessThan(nudgesIdx);
    expect(nudgesIdx).toBeLessThan(actionsIdx);
  });

  it('.tsc-nudges-list CSS is defined', () => {
    expect(DASH).toMatch(/\.tsc-nudges-list\s*\{/);
  });

  it('.tsc-nudge-arrow CSS is defined', () => {
    expect(DASH).toMatch(/\.tsc-nudge-arrow\s*\{/);
  });

  it('renderTscNudges function is defined', () => {
    expect(DASH).toMatch(/function\s+renderTscNudges\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 2. Fetch wiring (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Fetch wiring', () => {
  it('openTscDrawer now fires 3 fetches (grade + recent + nudge-history)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    window.openTscDrawer({
      studentId: 'stu_4fetch',
      username: 'lime-otter',
      realName: 'Four Fetch',
      section: 'PeriodC',
    });

    await new Promise(r => setTimeout(r, 20));

    // The independent inbox may also boot after credentials are supplied.
    expect(fetchMock.mock.calls.filter(([url]) => !url.includes('/nudge-inbox'))).toHaveLength(3);
    const urls = fetchMock.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/teacher/student/stu_4fetch/grade'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_4fetch/recent'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_4fetch/lesson-unlocks'))).toBe(false);
    expect(urls.some(u => u.includes('/teacher/nudge-history'))).toBe(true);
  });

  it('the nudge-history fetch URL contains studentUsername= encoded and limit=20', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    window.openTscDrawer({
      studentId: 'stu_url',
      username: 'mango-fox',
      realName: 'URL User',
      section: 'PeriodC',
    });

    await new Promise(r => setTimeout(r, 20));

    const urls = fetchMock.mock.calls.map(c => c[0]);
    const nudgeUrl = urls.find(u => u.includes('/teacher/nudge-history'));
    expect(nudgeUrl).toBeDefined();
    expect(nudgeUrl).toMatch(/studentUsername=mango-fox/);
    expect(nudgeUrl).toMatch(/limit=20/);
  });

  it('all 3 fetches carry x-teacher-secret when a secret is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    const secretInput = document.getElementById('teacher-secret');
    if (secretInput) secretInput.value = 'my-secret';

    window.openTscDrawer({
      studentId: 'stu_sec4',
      username: 'fig-dove',
      realName: 'Sec User',
      section: 'PeriodC',
    });
    await new Promise(r => setTimeout(r, 20));

    // The independent inbox may also boot after credentials are supplied.
    expect(fetchMock.mock.calls.filter(([url]) => !url.includes('/nudge-inbox'))).toHaveLength(3);
    fetchMock.mock.calls.forEach(function (call) {
      expect(call[1].headers['x-teacher-secret']).toBe('my-secret');
    });
  });

  it('503 on nudge-history fetch renders the empty state and does not break the drawer', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' }),
        });
      }
      if (url.includes('/grade')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 91.5 } }, units: {} }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({
      studentId: 'stu_503nudge',
      username: 'pear-cat',
      realName: '503 Nudge User',
      section: 'PeriodD',
    });
    await new Promise(r => setTimeout(r, 30));

    // Nudges list shows empty state.
    const list = document.getElementById('tsc-nudges-list');
    expect(list.textContent).toMatch(/No nudges yet/);
    // Drawer still functional: grade card rendered.
    const gradeCard = document.getElementById('tsc-grade-card');
    expect(gradeCard.textContent).toMatch(/91/);
  });
});

// ---------------------------------------------------------------------------
// 3. Render (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Render', () => {
  it('0 rows -> empty-state "No nudges yet."', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, rows: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_0nudge', username: 'kiwi-wolf', realName: 'No Nudge', section: 'PeriodD' });
    await new Promise(r => setTimeout(r, 20));

    const list = document.getElementById('tsc-nudges-list');
    expect(list.textContent).toMatch(/No nudges yet/);
  });

  it('2 rows (one teacher, one student) -> 2 li items with correct arrow and direction classes', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, rows: SAMPLE_NUDGE_ROWS }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_2nudge', username: 'mango-seal', realName: 'Two Nudge', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));

    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(2);

    // First row is teacher direction.
    const arrow0 = items[0].querySelector('.tsc-nudge-arrow');
    expect(arrow0).not.toBeNull();
    expect(arrow0.classList.contains('tsc-nudge-teacher')).toBe(true);
    expect(arrow0.classList.contains('tsc-nudge-student')).toBe(false);
    expect(arrow0.textContent).toBe('>>');

    // Second row is student direction.
    const arrow1 = items[1].querySelector('.tsc-nudge-arrow');
    expect(arrow1).not.toBeNull();
    expect(arrow1.classList.contains('tsc-nudge-student')).toBe(true);
    expect(arrow1.classList.contains('tsc-nudge-teacher')).toBe(false);
    expect(arrow1.textContent).toBe('<<');
  });

  it('each row meta line shows the created_at ISO prefix (YYYY-MM-DD HH:MM) and sender_username', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, rows: SAMPLE_NUDGE_ROWS }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_meta', username: 'oak-seal', realName: 'Meta User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));

    const items = document.querySelectorAll('#tsc-nudges-list li');
    const meta0 = items[0].querySelector('.tsc-nudge-meta');
    expect(meta0.textContent).toMatch(/2026-05-20 10:00/);
    expect(meta0.textContent).toMatch(/mr\.colson/);

    const meta1 = items[1].querySelector('.tsc-nudge-meta');
    expect(meta1.textContent).toMatch(/2026-05-20 10:05/);
    expect(meta1.textContent).toMatch(/apple-bird/);
  });

  it('text content is set via textContent (XSS-safe: injected angle-brackets are not rendered as HTML)', async () => {
    const xssRow = [
      {
        id: 99,
        direction: 'teacher',
        sender_username: '<evil>',
        recipient_username: 'student',
        text: '<script>alert(1)</script>',
        created_at: '2026-05-21T09:00:00Z',
        delivered_at: null,
      },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, rows: xssRow }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_xss', username: 'fig-owl', realName: 'XSS User', section: 'PeriodD' });
    await new Promise(r => setTimeout(r, 20));

    // The script tag must NOT have been injected as a real element.
    const scripts = document.querySelectorAll('#tsc-nudges-list script');
    expect(scripts.length).toBe(0);

    // The raw text should appear as text content.
    const list = document.getElementById('tsc-nudges-list');
    expect(list.textContent).toMatch(/<script>/);
  });
});

// ---------------------------------------------------------------------------
// 4. Drawer switching clears stale nudges (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Drawer switching clears stale nudges', () => {
  it('opening student B clears student A nudge rows synchronously, before B fetch settles', async () => {
    // Fetch A: 2 nudge rows. Fetch B: deferred -- only resolves when manually settled.
    let resolveBNudges = null;
    const bNudgesPromise = new Promise((resolve) => { resolveBNudges = resolve; });

    let nudgeCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        nudgeCallCount++;
        if (nudgeCallCount === 1) {
          // Student A: respond immediately with two nudge rows.
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, rows: SAMPLE_NUDGE_ROWS }),
          });
        }
        // Student B: defer until the test resolves it.
        return bNudgesPromise;
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    // Open student A and wait for its nudges to render.
    window.openTscDrawer({ studentId: 'stu_A', username: 'apple-otter', realName: 'Student A', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const listBeforeB = document.getElementById('tsc-nudges-list');
    // Student A's 2 nudges should be visible.
    expect(listBeforeB.querySelectorAll('li.tsc-nudge-empty').length).toBe(0);
    expect(listBeforeB.querySelectorAll('li').length).toBe(2);

    // Open student B. The drawer's nudge-history fetch is deferred.
    // Synchronously after the call returns, the nudges-list MUST already
    // be cleared so the user does not see A's nudges under B's header.
    window.openTscDrawer({ studentId: 'stu_B', username: 'lime-otter', realName: 'Student B', section: 'PeriodG' });
    const listAfterB = document.getElementById('tsc-nudges-list');
    expect(listAfterB.children.length).toBe(0);

    // Settle B's fetch with a single-row nudge payload; verify the new row appears.
    resolveBNudges({
      ok: true,
      json: async () => ({
        ok: true,
        rows: [{
          id: 99,
          direction: 'teacher',
          sender_username: 'mr.colson',
          recipient_username: 'lime-otter',
          text: 'Welcome to the session!',
          created_at: '2026-05-24T08:00:00Z',
          delivered_at: '2026-05-24T08:00:01Z',
        }],
      }),
    });
    await new Promise(r => setTimeout(r, 30));

    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.tsc-nudge-text').textContent).toBe('Welcome to the session!');
  });
});
