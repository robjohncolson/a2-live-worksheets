// teacher-student-console-unlocks.test.js -- T3 of P6 BUILD section 4.4.
// Tests the Lesson Unlocks drawer section in teacher-dashboard.html.
//
// Strategy: two layers.
//   1. Static source analysis (node env) -- verifies DOM markup and JS function
//      signatures are present verbatim in the file.
//   2. JSDOM behavioral tests -- loads the page with runScripts:'dangerously',
//      stubs fetch, and exercises fetch wiring, render, and revoke flow.
//
// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH_PATH = resolve(repo, 'teacher-dashboard.html');
const DASH = existsSync(DASH_PATH) ? readFileSync(DASH_PATH, 'utf8') : null;

// ---------------------------------------------------------------------------
// JSDOM helper -- mirrors the pattern from teacher-student-console-drawer.test.js
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

// Synthetic unlock rows; later lesson keys do not require published content.
const SAMPLE_ROWS = [
  {
    lesson_key: '1-1',
    unlocked_at: '2026-05-20T10:00:00Z',
    unlocked_by: 'mr.colson',
    reason: 'absent during lesson',
    status: 'active',
  },
  {
    lesson_key: '1-2',
    unlocked_at: '2026-05-22T14:30:00Z',
    unlocked_by: 'mr.colson',
    reason: null,
    status: 'active',
  },
];

// ---------------------------------------------------------------------------
// 1. Lesson Unlocks section DOM presence (static analysis)
// ---------------------------------------------------------------------------

describe('Lesson Unlocks section DOM presence', () => {
  it('file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('#tsc-section-unlocks exists with #tsc-unlocks-list inside', () => {
    expect(DASH).toMatch(/id="tsc-section-unlocks"/);
    expect(DASH).toMatch(/id="tsc-unlocks-list"/);
  });

  it('unlocks section sits between recent section and actions nav in DOM order', () => {
    const recentIdx = DASH.indexOf('id="tsc-section-recent"');
    const unlocksIdx = DASH.indexOf('id="tsc-section-unlocks"');
    const actionsIdx = DASH.indexOf('class="tsc-actions"');
    expect(recentIdx).toBeGreaterThan(-1);
    expect(unlocksIdx).toBeGreaterThan(-1);
    expect(actionsIdx).toBeGreaterThan(-1);
    expect(recentIdx).toBeLessThan(unlocksIdx);
    expect(unlocksIdx).toBeLessThan(actionsIdx);
  });

  it('.tsc-unlocks-list CSS is defined', () => {
    expect(DASH).toMatch(/\.tsc-unlocks-list\s*\{/);
  });

  it('.tsc-unlock-revoke CSS is defined', () => {
    expect(DASH).toMatch(/\.tsc-unlock-revoke\s*\{/);
  });

  it('renderTscUnlocks function is defined', () => {
    expect(DASH).toMatch(/function\s+renderTscUnlocks\s*\(/);
  });

  it('revokeUnlock function is defined', () => {
    expect(DASH).toMatch(/function\s+revokeUnlock\s*\(/);
  });

  it('retained unlock section is hidden', () => {
    expect(DASH).toMatch(/id="tsc-section-unlocks"[^>]*\bhidden\b/);
  });
});

// ---------------------------------------------------------------------------
// 2. Fetch wiring (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Fetch wiring', () => {
  it('openTscDrawer fires 3 fetches without the retired lesson-unlocks route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    window.openTscDrawer({
      studentId: 'stu_3fetch',
      username: 'apple-bird',
      realName: 'Three Fetch',
      section: 'PeriodC',
    });

    await new Promise(r => setTimeout(r, 20));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/teacher/student/stu_3fetch/grade'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_3fetch/recent'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_3fetch/lesson-unlocks'))).toBe(false);
    expect(urls.some(u => u.includes('/teacher/nudge-history'))).toBe(true);
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

    window.openTscDrawer({ studentId: 'stu_sec2', username: 'lime-fish', realName: 'Sec User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));

    fetchMock.mock.calls.forEach(function (call) {
      expect(call[1].headers['x-teacher-secret']).toBe('my-secret');
    });
  });

  it('opening the drawer keeps unlock markup hidden and renders the empty state without fetching unlocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 88.0 } }, units: {}, submissions: [], rows: [] }),
    });
    const { window } = makeDom(fetchMock);
    const document = window.document;

    expect(document.getElementById('tsc-section-unlocks').hidden).toBe(true);
    window.openTscDrawer({ studentId: 'stu_empty', username: 'kiwi-frog', realName: 'Empty User', section: 'PeriodD' });
    await new Promise(r => setTimeout(r, 30));

    expect(document.getElementById('tsc-section-unlocks').hidden).toBe(true);
    expect(document.getElementById('tsc-unlocks-list').textContent).toMatch(/No active overrides/);
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/88/);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/lesson-unlocks'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Render active unlocks (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Render active unlocks', () => {
  it('provided unlock data renders 2 li items with lesson_key, date, unlocked_by', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_2unlock', username: 'mango-seal', realName: 'Two Unlock', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    window.renderTscUnlocks({ ok: true, rows: SAMPLE_ROWS });

    const items = document.querySelectorAll('#tsc-unlocks-list li');
    expect(items.length).toBe(2);

    // First item should have lesson_key=1-1.
    const keyEl0 = items[0].querySelector('.tsc-unlock-key');
    expect(keyEl0.textContent).toBe('1-1');

    // Second item should have lesson_key=1-2.
    const keyEl1 = items[1].querySelector('.tsc-unlock-key');
    expect(keyEl1.textContent).toBe('1-2');

    // First item meta shows date prefix, unlocked_by, and reason.
    const meta0 = items[0].querySelector('.tsc-unlock-meta');
    expect(meta0.textContent).toMatch(/2026-05-20/);
    expect(meta0.textContent).toMatch(/mr\.colson/);
    expect(meta0.textContent).toMatch(/absent during lesson/);

    // Second item meta has date and unlocked_by but no reason suffix.
    const meta1 = items[1].querySelector('.tsc-unlock-meta');
    expect(meta1.textContent).toMatch(/2026-05-22/);
    expect(meta1.textContent).toMatch(/mr\.colson/);
  });

  it('each li has a .tsc-unlock-revoke button', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_btn', username: 'pear-cat', realName: 'Btn User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    window.renderTscUnlocks({ ok: true, rows: SAMPLE_ROWS });

    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    expect(revokeBtns.length).toBe(2);
  });

  it('0 unlocks shows empty-state "No active overrides."', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_0unlock', username: 'fig-dove', realName: 'No Unlock', section: 'PeriodD' });
    await new Promise(r => setTimeout(r, 20));

    const list = document.getElementById('tsc-unlocks-list');
    expect(list.textContent).toMatch(/No active overrides/);
  });
});

// ---------------------------------------------------------------------------
// 4. Revoke flow (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Revoke flow', () => {
  async function setupWithUnlocks(fetchMock, rows = SAMPLE_ROWS) {
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_revoke', username: 'oak-lion', realName: 'Revoke User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    // Opening a student no longer fetches unlocks; supply the renderer fixture directly.
    window.renderTscUnlocks({ ok: true, rows });

    return { dom, document, window };
  }

  it('confirm=true -> POST /teacher/lesson-unlock/revoke with {studentUsername, lessonKey:"1-1"}', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/lesson-unlock/revoke')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, row: { status: 'revoked', lesson_key: '1-1' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document, window } = await setupWithUnlocks(fetchMock);
    window.confirm = () => true;

    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    expect(revokeBtns.length).toBeGreaterThanOrEqual(1);
    revokeBtns[0].click();
    await new Promise(r => setTimeout(r, 30));

    const revokeCalls = fetchMock.mock.calls.filter(c => c[0].includes('/lesson-unlock/revoke'));
    expect(revokeCalls.length).toBe(1);

    const body = JSON.parse(revokeCalls[0][1].body);
    expect(body.studentUsername).toBe('oak-lion');
    expect(body.lessonKey).toBe('1-1');
  });

  it('200 response -> row fades to opacity 0.4', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/lesson-unlock/revoke')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, row: { status: 'revoked' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document, window } = await setupWithUnlocks(fetchMock);
    window.confirm = () => true;

    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    const firstLi = revokeBtns[0].closest('li');
    revokeBtns[0].click();
    await new Promise(r => setTimeout(r, 30));

    expect(firstLi.style.opacity).toBe('0.4');
    expect(firstLi.style.pointerEvents).toBe('none');
  });

  it('404 response -> error shown, row remains in DOM', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/lesson-unlock/revoke')) {
        return Promise.resolve({
          ok: false, status: 404,
          json: async () => ({ ok: false, error: 'no active unlock for that (student, lesson)' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document, window } = await setupWithUnlocks(fetchMock);
    window.confirm = () => true;

    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    const firstLi = revokeBtns[0].closest('li');
    revokeBtns[0].click();
    await new Promise(r => setTimeout(r, 30));

    // Row should still be in the DOM (not faded out).
    expect(firstLi.style.opacity).not.toBe('0.4');
    // Error banner should be visible.
    const errBanner = document.getElementById('err-banner');
    expect(errBanner).not.toBeNull();
    expect(errBanner.textContent).toMatch(/no active unlock/);
    expect(firstLi.isConnected).toBe(true);
  });

  it('confirm=false -> no fetch fired', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document, window } = await setupWithUnlocks(fetchMock);
    window.confirm = () => false;

    const callsBefore = fetchMock.mock.calls.length;
    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    revokeBtns[0].click();
    await new Promise(r => setTimeout(r, 20));

    // No additional fetch calls.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  // Codex P6 MINOR fold: after revoking the last visible unlock, the section
  // should re-render the "No active overrides." placeholder rather than leave
  // an empty <ul>.
  it('revoking the last unlock restores the empty-state placeholder', async () => {
    const SINGLE_ROW = [SAMPLE_ROWS[0]];
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/lesson-unlock/revoke')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, row: { status: 'revoked' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document, window } = await setupWithUnlocks(fetchMock, SINGLE_ROW);
    window.confirm = () => true;

    const revokeBtns = document.querySelectorAll('#tsc-unlocks-list .tsc-unlock-revoke');
    expect(revokeBtns.length).toBe(1);
    revokeBtns[0].click();
    // Wait long enough for the 240 ms fade-then-remove timeout to finish.
    await new Promise(r => setTimeout(r, 300));

    const list = document.getElementById('tsc-unlocks-list');
    // After the last row is removed, the empty-state placeholder is back.
    expect(list.textContent).toMatch(/No active overrides/);
    // The single child should be the empty-state li (not a real unlock row).
    expect(list.children.length).toBe(1);
    expect(list.children[0].className).toBe('tsc-unlock-empty');
  });
});

// ---------------------------------------------------------------------------
// 5. Drawer switching (Codex P6 MAJOR fold: stale rows when switching students)
// ---------------------------------------------------------------------------

describe('Drawer switching: openTscDrawer clears stale unlock rows', () => {
  it('opening student B clears provided student A unlock rows before B grade resolves', async () => {
    let resolveBGrade;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/stu_B/grade')) {
        return new Promise(resolve => { resolveBGrade = resolve; });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }) });
    });
    const { window } = makeDom(fetchMock);
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_A', username: 'apple-bird', realName: 'Student A', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));
    window.renderTscUnlocks({ ok: true, rows: SAMPLE_ROWS });
    const list = document.getElementById('tsc-unlocks-list');
    expect(list.querySelectorAll('.tsc-unlock-key').length).toBe(2);
    expect(document.getElementById('tsc-section-unlocks').hidden).toBe(true);

    window.openTscDrawer({ studentId: 'stu_B', username: 'lime-fish', realName: 'Student B', section: 'PeriodG' });
    expect(list.children.length).toBe(0);
    expect(document.getElementById('tsc-drawer-title').textContent).toBe('Student B');
    expect(resolveBGrade).toBeTypeOf('function');
    resolveBGrade({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 77.7 } }, units: {} }) });
    await new Promise(r => setTimeout(r, 30));

    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/77\.7/);
    expect(list.children.length).toBe(1);
    expect(list.children[0].classList.contains('tsc-unlock-empty')).toBe(true);
    expect(list.textContent).toMatch(/No active overrides/);
    expect(list.querySelectorAll('.tsc-unlock-key').length).toBe(0);
    expect(document.getElementById('tsc-section-unlocks').hidden).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/lesson-unlocks'))).toBe(false);
  });
});
