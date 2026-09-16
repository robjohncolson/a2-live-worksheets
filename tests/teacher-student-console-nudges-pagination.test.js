// teacher-student-console-nudges-pagination.test.js
// Phase 12 (TEACHER_STUDENT_CONSOLE_P12_BUILD.md section 5):
// Tests for the "Load older" nudge history pagination button.
//
// Strategy:
//   1. Static source analysis (node env) -- verifies DOM markup, CSS rules,
//      and JS identifiers are present verbatim in the file.
//   2. JSDOM behavioral tests -- loads the page with runScripts:'dangerously',
//      stubs fetch, and exercises button visibility, append behavior, guards.
//
// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH_PATH = resolve(repo, 'teacher-dashboard.html');
const DASH = existsSync(DASH_PATH) ? readFileSync(DASH_PATH, 'utf8') : null;

// ---------------------------------------------------------------------------
// JSDOM helper -- mirrors the nudges.test.js pattern exactly.
// ---------------------------------------------------------------------------

function makeDom(fetchMock) {
  if (!DASH) throw new Error('teacher-dashboard.html not found');

  // Stylesheets are irrelevant here and localhost network failures delay DOMContentLoaded.
  const cleaned = DASH.replace(/<link\b[^>]*>/g, '')
    .replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');

  const dom = new JSDOM(cleaned, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const { window } = dom;

  window.rosterClient = { token: () => null, current: () => null };
  window.fetch = fetchMock || vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });

  return dom;
}

// Helpers to build page-sized arrays of fake nudge rows.
function makeRows(count, startIdx) {
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push({
      id: (startIdx || 0) + i,
      direction: i % 2 === 0 ? 'teacher' : 'student',
      sender_username: 'mr.colson',
      recipient_username: 'test-user',
      text: 'Row ' + ((startIdx || 0) + i),
      created_at: '2026-05-20T10:00:00Z',
      delivered_at: null,
    });
  }
  return out;
}

// Default non-nudge fetch response.
function defaultResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });
}

// ---------------------------------------------------------------------------
// 1. Older button DOM presence (static analysis)
// ---------------------------------------------------------------------------

describe('Older button DOM presence', () => {
  it('#tsc-nudges-older exists in the HTML source', () => {
    expect(DASH).toMatch(/id="tsc-nudges-older"/);
  });

  it('the button is hidden by default (style.display === none in markup)', () => {
    expect(DASH).toMatch(/id="tsc-nudges-older"[^>]*style="display:none"/);
  });

  it('.tsc-nudges-older CSS rule is defined', () => {
    expect(DASH).toMatch(/\.tsc-nudges-older\s*\{/);
  });
});

// ---------------------------------------------------------------------------
// 2. Initial render -- offset + button visibility (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Initial render -- offset and button visibility', () => {
  it('20 rows on initial fetch -> button is shown', async () => {
    const rows20 = makeRows(20, 0);
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_20', username: 'apple-otter', realName: 'A', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    expect(btn).not.toBeNull();
    expect(btn.style.display).not.toBe('none');
  });

  it('20 rows on initial fetch -> module-scope offset is 20', async () => {
    const rows20 = makeRows(20, 0);
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    window.openTscDrawer({ studentId: 'stu_20off', username: 'banana-fish', realName: 'B', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    // Verify offset is reflected in the next older-button fetch URL.
    // Click the button to trigger the fetch; capture its URL.
    const document = window.document;
    const btn = document.getElementById('tsc-nudges-older');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [] }) });
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    const urls = fetchMock.mock.calls.map(c => c[0]);
    const nudgeUrl = urls.find(u => u.includes('/teacher/nudge-history'));
    expect(nudgeUrl).toMatch(/offset=20/);
  });

  it('5 rows on initial fetch -> button stays hidden', async () => {
    const rows5 = makeRows(5, 0);
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows5 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_5', username: 'cherry-wolf', realName: 'C', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    expect(btn.style.display).toBe('none');
  });

  it('0 rows on initial fetch -> empty-state placeholder and button hidden', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_0', username: 'date-seal', realName: 'D', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const list = document.getElementById('tsc-nudges-list');
    expect(list.textContent).toMatch(/No nudges yet/);
    const btn = document.getElementById('tsc-nudges-older');
    expect(btn.style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 3. Older button click -- append behavior (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Older button click', () => {
  it('click fires fetch to /teacher/nudge-history with correct studentUsername, limit=20, offset=20', async () => {
    const rows20 = makeRows(20, 0);
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_url', username: 'elderberry-fox', realName: 'E', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    fetchMock.mockClear();
    // Next page: return 5 rows so button hides after.
    fetchMock.mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: makeRows(5, 20) }) });
      }
      return defaultResponse();
    });

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    const urls = fetchMock.mock.calls.map(c => c[0]);
    const nudgeUrl = urls.find(u => u.includes('/teacher/nudge-history'));
    expect(nudgeUrl).toBeDefined();
    expect(nudgeUrl).toMatch(/studentUsername=elderberry-fox/);
    expect(nudgeUrl).toMatch(/limit=20/);
    expect(nudgeUrl).toMatch(/offset=20/);
  });

  it('20-row page appended -> list has 40 total items, offset is 40, button still visible', async () => {
    const rows20 = makeRows(20, 0);
    const rows20b = makeRows(20, 20);
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20b }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_40', username: 'fig-dove', realName: 'F', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(40);
    expect(btn.style.display).not.toBe('none');

    // Verify offset is now 40 by checking the next click URL.
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [] }) });
    btn.click();
    await new Promise(r => setTimeout(r, 30));
    const urls = fetchMock.mock.calls.map(c => c[0]);
    const nudgeUrl = urls.find(u => u.includes('/teacher/nudge-history'));
    expect(nudgeUrl).toMatch(/offset=40/);
  });

  it('5-row page appended -> list has 25 total items, button hidden', async () => {
    const rows20 = makeRows(20, 0);
    const rows5 = makeRows(5, 20);
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows5 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_25', username: 'grape-owl', realName: 'G', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(25);
    expect(btn.style.display).toBe('none');
  });

  it('0 rows on subsequent click -> button hidden', async () => {
    const rows20 = makeRows(20, 0);
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_0older', username: 'honeydew-cat', realName: 'H', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    expect(btn.style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 4. Stale-click guard (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Stale click guard', () => {
  it('clicking Older after drawer switches to a different student is a no-op', async () => {
    const rows20 = makeRows(20, 0);
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        fetchCount++;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    // Open student A.
    window.openTscDrawer({ studentId: 'stu_A', username: 'iris-bear', realName: 'A', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    expect(btn.style.display).not.toBe('none');

    // Switch to student B. The stored username changes.
    window.openTscDrawer({ studentId: 'stu_B', username: 'jasmine-duck', realName: 'B', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    // Force the button visible to simulate a stale DOM state
    // (the button was shown for A, now B's drawer is open).
    btn.style.display = '';
    btn.disabled = false;

    const countBefore = fetchCount;
    // Simulate clicking the stale button -- _tscCurrentStudentStub.username
    // is 'jasmine-duck' but _tscNudgeHistoryStudentUsername is also 'jasmine-duck' now
    // because openTscDrawer reset it. The guard fires when username DOESN'T match.
    // To exercise the guard we need to manually misalign state, which we can do
    // by directly overwriting the module's _tscNudgeHistoryStudentUsername.
    // Access via the window since JSDOM exposes script scope through window.
    if (window._tscNudgeHistoryStudentUsername !== undefined) {
      window._tscNudgeHistoryStudentUsername = 'iris-bear'; // old student
    }
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    // No additional nudge-history fetch should have fired for the stale click.
    expect(fetchCount).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// 5. In-flight click guard (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('In-flight click guard', () => {
  it('button is disabled during fetch, re-enabled after resolve with more pages', async () => {
    const rows20 = makeRows(20, 0);
    let resolveOlder;
    const olderPromise = new Promise((res) => { resolveOlder = res; });
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        // Second fetch is deferred.
        return olderPromise;
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_inflight', username: 'kiwi-wolf', realName: 'K', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click(); // start the in-flight fetch

    // Yield a tick to let the async function advance past the disabled step.
    await new Promise(r => setTimeout(r, 5));
    expect(btn.disabled).toBe(true);

    // Resolve with 20 more rows (button should re-enable).
    resolveOlder({ ok: true, json: async () => ({ ok: true, rows: makeRows(20, 20) }) });
    await new Promise(r => setTimeout(r, 30));

    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Error handling (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('401 response -> button re-enabled, no rows appended, list unchanged', async () => {
    const rows20 = makeRows(20, 0);
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ ok: false, error: 'forbidden' }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_401', username: 'lemon-shark', realName: 'L', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    // Button should be re-enabled (user can retry).
    expect(btn.disabled).toBe(false);
    // List should still have only the original 20 rows.
    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(20);
  });

  it('network throw -> button re-enabled, no rows appended', async () => {
    const rows20 = makeRows(20, 0);
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        return Promise.reject(new Error('Network failure'));
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_throw', username: 'mango-elk', realName: 'M', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();
    await new Promise(r => setTimeout(r, 30));

    expect(btn.disabled).toBe(false);
    const items = document.querySelectorAll('#tsc-nudges-list li');
    expect(items.length).toBe(20);
  });
});

// ============================================================================
// Codex P12 fold regressions (BLOCKER + MAJOR + MINOR)
// ============================================================================

describe('Codex P12 fold regressions', () => {
  const rows20 = Array.from({ length: 20 }, function (_, i) {
    return { direction: 'teacher', text: 'row ' + i, sender_username: 'mr.colson',
             recipient_username: 'apple-bird', created_at: '2026-05-' + (i < 10 ? '0' + i : i) + 'T10:00:00Z' };
  });

  // BLOCKER: real A->B switch case, where the older fetch was started for
  // A and resolves AFTER the drawer opened for B. The resolution MUST NOT
  // mutate B's drawer DOM or pagination state.
  it('BLOCKER: a deferred A older-fetch resolving after open(B) does not pollute B', async () => {
    let resolveA = null;
    const aPromise = new Promise((r) => { resolveA = r; });
    let pageHistoryCount = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        pageHistoryCount++;
        if (pageHistoryCount === 1) {
          // Initial fetch for student A.
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        if (pageHistoryCount === 2) {
          // The older-page fetch fired for A -- deferred.
          return aPromise;
        }
        if (pageHistoryCount === 3) {
          // Initial fetch for student B (after drawer switched).
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [
            { direction: 'teacher', text: 'b-only', sender_username: 'mr.colson',
              recipient_username: 'lime-fish', created_at: '2026-05-23T10:00:00Z' },
          ] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    // Open student A.
    window.openTscDrawer({ studentId: 'stu_A', username: 'apple-bird', realName: 'A', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));
    expect(document.querySelectorAll('#tsc-nudges-list li').length).toBe(20);

    // Click "Load older" on A. The older fetch is deferred via aPromise.
    document.getElementById('tsc-nudges-older').click();
    await new Promise(r => setTimeout(r, 5));   // tick microtasks but the fetch is still pending

    // Now switch the drawer to student B. The new fetch resolves immediately.
    window.openTscDrawer({ studentId: 'stu_B', username: 'lime-fish', realName: 'B', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    // B's drawer should show only B's 1 row.
    const itemsAfterB = document.querySelectorAll('#tsc-nudges-list li');
    expect(itemsAfterB.length).toBe(1);

    // NOW resolve A's older-page promise. The deferred A response carries 20 more rows.
    resolveA({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
    await new Promise(r => setTimeout(r, 30));

    // B's drawer must STILL show only B's 1 row -- A's resolved older fetch
    // must have been gated out by the post-await stillOurDrawer check.
    const finalItems = document.querySelectorAll('#tsc-nudges-list li');
    expect(finalItems.length).toBe(1);
    // The DOM should still carry B's row, not A's.
    expect(finalItems[0].textContent).toContain('b-only');
  });

  // MINOR: a second click while a fetch is in flight does NOT issue another
  // /nudge-history request (the _tscNudgeHistoryLoading flag gates).
  it('MINOR: a second click during in-flight older fetch is a no-op at the network layer', async () => {
    let resolveOlder = null;
    const olderPromise = new Promise((r) => { resolveOlder = r; });
    let olderHistoryCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/teacher/nudge-history')) {
        olderHistoryCalls++;
        if (olderHistoryCalls === 1) {
          // Initial fetch -- 20 rows.
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
        }
        if (olderHistoryCalls === 2) {
          // First Load-older click -- deferred.
          return olderPromise;
        }
        // Subsequent clicks should NEVER trigger this (it would mean the
        // in-flight guard failed). Assert via expect below.
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return defaultResponse();
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_dbl', username: 'apple-bird', realName: 'D', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 30));

    const btn = document.getElementById('tsc-nudges-older');
    btn.click();           // 1st click -- starts the deferred fetch
    await new Promise(r => setTimeout(r, 5));

    // While the fetch is still pending, click again.
    btn.click();           // 2nd click -- MUST be a no-op
    await new Promise(r => setTimeout(r, 5));
    btn.click();           // 3rd click -- also a no-op
    await new Promise(r => setTimeout(r, 5));

    // Only 2 history calls total (initial + first older click). No 3rd.
    expect(olderHistoryCalls).toBe(2);

    // Now resolve. The list should have the original 20 + 20 fresh = 40.
    resolveOlder({ ok: true, json: async () => ({ ok: true, rows: rows20 }) });
    await new Promise(r => setTimeout(r, 30));

    expect(document.querySelectorAll('#tsc-nudges-list li').length).toBe(40);
  });
});
