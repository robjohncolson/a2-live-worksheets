// teacher-student-console-drawer.test.js — Build §3 structure + behavior pins.
// Wave 1B of TEACHER_STUDENT_CONSOLE_P1_BUILD.md.
//
// Strategy: two layers.
//   1. Static source analysis (node env) — verifies DOM markup, CSS rules, and
//      JS function signatures are present verbatim in the file.
//   2. JSDOM behavioral tests — loads the page with runScripts:'dangerously',
//      stubs fetch, and exercises open/close + click wiring.
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
// JSDOM helper — strips external <script src> tags so jsdom won't 404 on them,
// then runs the inline script with a stubbed fetch and rosterClient.
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
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }),
  });

  return dom;
}

// ---------------------------------------------------------------------------
// 1. DOM presence (static analysis)
// ---------------------------------------------------------------------------

describe('TSC drawer DOM presence', () => {
  it('file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('drawer root #tsc-drawer is present with aria-hidden="true" by default', () => {
    expect(DASH).toMatch(/id="tsc-drawer"/);
    expect(DASH).toMatch(/aria-hidden="true"/);
  });

  it('drawer root has class tsc-drawer', () => {
    expect(DASH).toMatch(/class="tsc-drawer"/);
  });

  it('overlay element is present with data-tsc-close="overlay"', () => {
    expect(DASH).toMatch(/data-tsc-close="overlay"/);
  });

  it('close button is present with data-tsc-close="button"', () => {
    expect(DASH).toMatch(/data-tsc-close="button"/);
  });

  it('all four action buttons present; nudge + remediation enabled, only gate disabled', () => {
    expect(DASH).toMatch(/id="tsc-action-view-as"/);
    expect(DASH).toMatch(/id="tsc-action-nudge"/);
    expect(DASH).toMatch(/id="tsc-action-remediation"/);
    expect(DASH).toMatch(/id="tsc-action-gate"/);
    // Phase 1 teacher chat enabled the nudge ("Send message") button; remediation
    // was enabled in P6; only the gate (Phase 5) stays disabled.
    const nudgeBtn = DASH.match(/id="tsc-action-nudge"[^>]*/);
    expect(nudgeBtn[0]).not.toMatch(/disabled/);
    const remBtn = DASH.match(/id="tsc-action-remediation"[^>]*/);
    expect(remBtn[0]).not.toMatch(/disabled/);
    const gateBtn = DASH.match(/id="tsc-action-gate"[^>]*/);
    expect(gateBtn[0]).toMatch(/disabled/);
  });

  it('Phase 1 teacher chat: compose box + send-to-student/whole-class wired to /teacher/nudge', () => {
    expect(DASH).toMatch(/id="tsc-nudge-compose"/);
    expect(DASH).toMatch(/id="tsc-nudge-text"/);
    expect(DASH).toMatch(/id="tsc-nudge-broadcast"/);          // whole-class option
    expect(DASH).toMatch(/function _tscSendNudge/);
    expect(DASH).toMatch(/postJson\('\/teacher\/nudge'/);       // posts to the existing backend
    expect(DASH).toMatch(/recipientUsernames:\s*recipients/);
    expect(DASH).toMatch(/_tscClassUsernames/);                 // broadcast recipient resolver
  });

  it('drawer title placeholder element exists', () => {
    expect(DASH).toMatch(/id="tsc-drawer-title"/);
  });

  it('drawer subtitle element exists', () => {
    expect(DASH).toMatch(/id="tsc-drawer-subtitle"/);
  });
});

// ---------------------------------------------------------------------------
// 2. CSS contract (static analysis)
// ---------------------------------------------------------------------------

describe('TSC drawer CSS rules', () => {
  it('.tsc-drawer has display:none by default', () => {
    expect(DASH).toMatch(/\.tsc-drawer\s*\{[^}]*display:\s*none/);
  });

  it('.tsc-drawer.tsc-open has display:block', () => {
    expect(DASH).toMatch(/\.tsc-drawer\.tsc-open\s*\{[^}]*display:\s*block/);
  });

  it('.tsc-drawer-panel uses translateX(100%) before open', () => {
    expect(DASH).toMatch(/transform:\s*translateX\(100%\)/);
  });

  it('.grades-row-clickable has cursor:pointer', () => {
    expect(DASH).toMatch(/\.grades-row-clickable\s*\{[^}]*cursor:\s*pointer/);
  });
});

// ---------------------------------------------------------------------------
// 3. JS function presence (static analysis)
// ---------------------------------------------------------------------------

describe('TSC JS function signatures', () => {
  it('openTscDrawer function is defined', () => {
    expect(DASH).toMatch(/function\s+openTscDrawer\s*\(/);
  });

  it('closeTscDrawer function is defined', () => {
    expect(DASH).toMatch(/function\s+closeTscDrawer\s*\(/);
  });

  it('renderTscGrade function is defined', () => {
    expect(DASH).toMatch(/function\s+renderTscGrade\s*\(/);
  });

  it('renderTscRecent function is defined', () => {
    expect(DASH).toMatch(/function\s+renderTscRecent\s*\(/);
  });

  it('teacherAuthHeaders function is defined', () => {
    expect(DASH).toMatch(/function\s+teacherAuthHeaders\s*\(/);
  });

  it('jsonOrErr function is defined', () => {
    expect(DASH).toMatch(/function\s+jsonOrErr\s*\(/);
  });

  it('renderGradesTable adds grades-row-clickable class to rows', () => {
    expect(DASH).toMatch(/grades-row-clickable/);
    expect(DASH).toMatch(/data-student-id/);
    expect(DASH).toMatch(/data-username/);
    expect(DASH).toMatch(/data-real-name/);
    expect(DASH).toMatch(/data-section/);
  });

  it('__tscWired guard prevents double-binding', () => {
    expect(DASH).toMatch(/__tscWired/);
  });
});

// ---------------------------------------------------------------------------
// 4. Row click opens drawer (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Row click opens drawer', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = makeDom();
    document = dom.window.document;
    window = dom.window;
  });

  it('drawer is hidden by default — no tsc-open class, aria-hidden=true', () => {
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer.classList.contains('tsc-open')).toBe(false);
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
  });

  it('renderGradesTable adds data-* attrs and grades-row-clickable class to rows', () => {
    const payload = {
      students: [
        {
          studentId: 'stu_abc',
          username: 'papaya-otter',
          realName: 'Jane Doe',
          section: 'PeriodC',
          quarters: {},
          units: {},
          completion: {},
        },
      ],
    };
    window.renderGradesTable(payload);

    const tr = document.querySelector('#grades-tbody tr');
    expect(tr).not.toBeNull();
    expect(tr.classList.contains('grades-row-clickable')).toBe(true);
    expect(tr.getAttribute('data-student-id')).toBe('stu_abc');
    expect(tr.getAttribute('data-username')).toBe('papaya-otter');
    expect(tr.getAttribute('data-real-name')).toBe('Jane Doe');
    expect(tr.getAttribute('data-section')).toBe('PeriodC');
  });

  it('clicking a row sets drawer to tsc-open and populates header optimistically', () => {
    const payload = {
      students: [
        {
          studentId: 'stu_xyz',
          username: 'mango-fox',
          realName: 'John Smith',
          section: 'PeriodD',
          quarters: {},
          units: {},
          completion: {},
        },
      ],
    };
    window.renderGradesTable(payload);

    const tr = document.querySelector('#grades-tbody tr');
    tr.click();

    const drawer = document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(true);
    expect(drawer.getAttribute('aria-hidden')).toBe('false');

    // Header should be populated from stub data immediately.
    const title = document.getElementById('tsc-drawer-title');
    expect(title.textContent).toBe('John Smith');
  });
});

// ---------------------------------------------------------------------------
// 5. Fetch wiring (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Fetch wiring', () => {
  it('openTscDrawer loads grade, recent work and messages without the retired unlock endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    window.openTscDrawer({
      studentId: 'stu_test',
      username: 'oak-bear',
      realName: 'Test User',
      section: 'PeriodC',
    });

    // Allow microtasks to flush.
    await new Promise(r => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/teacher/student/stu_test/grade'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_test/recent'))).toBe(true);
    expect(urls.some(u => u.includes('/teacher/student/stu_test/lesson-unlocks'))).toBe(false);
    expect(urls.some(u => u.includes('/teacher/nudge-history'))).toBe(true);
  });

  it('fetch calls include x-teacher-secret header when a secret is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    // Set the teacher secret input.
    const secretInput = document.getElementById('teacher-secret');
    if (secretInput) secretInput.value = 'my-secret-value';

    window.openTscDrawer({
      studentId: 'stu_sec',
      username: 'lime-duck',
      realName: 'Secure User',
      section: 'PeriodC',
    });

    await new Promise(r => setTimeout(r, 0));

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['x-teacher-secret']).toBe('my-secret-value');
  });

  it('grade endpoint response renders the quarter line in the grade card', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/grade')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            quarters: { Q4: { quarterGrade: 87.3, ceiling: 92.1, unitsGraded: 2, unitsTotal: 3 } },
            units: { U1: { unitGrade: 88 } },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, submissions: [] }),
      });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_grade', username: 'pear-wolf', realName: 'Grade User', section: 'PeriodC' });

    await new Promise(r => setTimeout(r, 20));

    const card = document.getElementById('tsc-grade-card');
    expect(card.textContent).toMatch(/87\.3/);
  });

  it('recent endpoint with 3 submissions renders 3 list items', async () => {
    const subs = [
      { recordedAt: '2026-05-22T14:01:00Z', itemId: '1-1-savvas-q18', source: 'worksheet', score: 1 },
      { recordedAt: '2026-05-22T14:02:00Z', itemId: '1-1-savvas-q21', source: 'worksheet', score: 0 },
      { recordedAt: '2026-05-22T14:03:00Z', itemId: '1-1-savvas-q22', source: 'worksheet', score: 1 },
    ];

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/recent')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, submissions: subs }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {} }),
      });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_rec', username: 'kiwi-cat', realName: 'Recent User', section: 'PeriodD' });

    await new Promise(r => setTimeout(r, 20));

    const items = document.querySelectorAll('#tsc-recent-list li');
    expect(items.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 6. Close behavior (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Close behavior', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = makeDom();
    document = dom.window.document;
    window = dom.window;
    // Open the drawer directly.
    window.openTscDrawer({ studentId: 'stu_close', username: 'fig-owl', realName: 'Close User', section: 'PeriodC' });
  });

  it('ESC key closes the drawer', () => {
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    const evt = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(evt);

    expect(drawer.classList.contains('tsc-open')).toBe(false);
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking the overlay closes the drawer', () => {
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    const overlay = drawer.querySelector('[data-tsc-close="overlay"]');
    overlay.click();

    expect(drawer.classList.contains('tsc-open')).toBe(false);
  });

  it('clicking the close button closes the drawer', () => {
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    const btn = drawer.querySelector('[data-tsc-close="button"]');
    btn.click();

    expect(drawer.classList.contains('tsc-open')).toBe(false);
  });

  it('clicking inside the panel (not on a tsc-close target) does NOT close the drawer', () => {
    const drawer = document.getElementById('tsc-drawer');
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    const gradeCard = document.getElementById('tsc-grade-card');
    gradeCard.click();

    // Still open — panel clicks don't propagate to tsc-close handler.
    expect(drawer.classList.contains('tsc-open')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Error handling (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('fetch returning {ok:false, error:"forbidden"} shows error in grade card', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/grade')) {
        return Promise.resolve({
          ok: false,
          statusText: 'Forbidden',
          json: async () => ({ ok: false, error: 'forbidden' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, submissions: [] }),
      });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_err', username: 'plum-elk', realName: 'Error User', section: 'PeriodC' });

    await new Promise(r => setTimeout(r, 20));

    const card = document.getElementById('tsc-grade-card');
    expect(card.textContent).toMatch(/Error.*forbidden/);
  });
});

// ---------------------------------------------------------------------------
// 8. Bearer token auth (Codex MAJOR fold)
// ---------------------------------------------------------------------------

describe('Bearer token auth (Codex MAJOR fold)', () => {
  it('fetch calls include Authorization Bearer header when rosterClient has a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    // Override the makeDom stub so rosterClient.token() returns a value.
    window.rosterClient = { token: () => 'TOKEN_XYZ', current: () => null };

    window.openTscDrawer({ studentId: 'stu_tok', username: 't-user', realName: 'Token User', section: 'PeriodC' });

    await new Promise(r => setTimeout(r, 0));

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer TOKEN_XYZ');
  });

  it('fetch calls send BOTH x-teacher-secret AND Authorization when both available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    const secretInput = document.getElementById('teacher-secret');
    if (secretInput) secretInput.value = 'my-secret-value';
    window.rosterClient = { token: () => 'TOKEN_ABC', current: () => null };

    window.openTscDrawer({ studentId: 'stu_both', username: 'b-user', realName: 'Both User', section: 'PeriodC' });

    await new Promise(r => setTimeout(r, 0));

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['x-teacher-secret']).toBe('my-secret-value');
    expect(headers['Authorization']).toBe('Bearer TOKEN_ABC');
  });

  it('no Authorization header when rosterClient.token() returns null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }),
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;

    // rosterClient.token returns null by default (per makeDom stub).
    window.openTscDrawer({ studentId: 'stu_n', username: 'n-user', realName: 'No-Token User', section: 'PeriodC' });

    await new Promise(r => setTimeout(r, 0));

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Race / stale-fetch guard + allSettled (Codex MAJOR fold)
// ---------------------------------------------------------------------------

describe('Stale-fetch guard + Promise.allSettled (Codex MAJOR fold)', () => {
  it('closing the drawer before fetch resolves does NOT render stale data', async () => {
    let resolveGrade;
    const gradePending = new Promise(r => { resolveGrade = r; });
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/grade')) return gradePending;
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, submissions: [] }) });
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_race', username: 'r-user', realName: 'Race User', section: 'PeriodC' });
    // Close BEFORE the grade fetch resolves.
    window.closeTscDrawer();
    // Now resolve grade with payload that would normally render.
    resolveGrade({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 99.9 } }, units: {} }) });
    await new Promise(r => setTimeout(r, 20));

    const card = document.getElementById('tsc-grade-card');
    // The drawer was closed; the late grade response must NOT have rendered.
    expect(card.textContent).not.toMatch(/99\.9/);
  });

  it('one failed fetch does NOT wipe the other successful pane (allSettled)', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/grade')) {
        return Promise.resolve({
          ok: false, statusText: 'Forbidden',
          json: async () => ({ ok: false, error: 'forbidden' }),
        });
      }
      // /recent succeeds with two submissions.
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, submissions: [
          { recordedAt: '2026-05-22T14:01:00Z', itemId: 'X1', source: 'worksheet', score: 1 },
          { recordedAt: '2026-05-22T14:02:00Z', itemId: 'X2', source: 'worksheet', score: 0 },
        ]}),
      });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_mix', username: 'm-user', realName: 'Mixed User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));

    // grade card has error.
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/Error.*forbidden/);
    // recent list still has its 2 items (NOT cleared by the grade rejection).
    const items = document.querySelectorAll('#tsc-recent-list li');
    expect(items.length).toBe(2);
  });

  it('opening student B mid-fetch for student A causes A late response to be dropped', async () => {
    let resolveAGrade;
    let resolveARecent;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/stu_A/grade')) return new Promise(resolve => { resolveAGrade = resolve; });
      if (url.includes('/stu_A/recent')) return new Promise(resolve => { resolveARecent = resolve; });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade: 50.0 } }, units: {}, submissions: [] }) });
    });
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_A', username: 'a', realName: 'A User', section: 'PeriodC' });
    window.openTscDrawer({ studentId: 'stu_B', username: 'b', realName: 'B User', section: 'PeriodG' });
    await new Promise(r => setTimeout(r, 20));

    expect(document.getElementById('tsc-drawer-title').textContent).toBe('B User');
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/50/);
    expect(resolveAGrade).toBeTypeOf('function');
    expect(resolveARecent).toBeTypeOf('function');

    // Settle both A requests after B renders, with the first request finishing last.
    resolveARecent({ ok: true, json: async () => ({ ok: true, submissions: [] }) });
    const staleGradeJson = vi.fn().mockResolvedValue({ ok: true, quarters: { Q4: { quarterGrade: 11.1 } }, units: {} });
    resolveAGrade({ ok: true, json: staleGradeJson });
    await new Promise(r => setTimeout(r, 20));

    expect(staleGradeJson).toHaveBeenCalledOnce();
    expect(document.getElementById('tsc-drawer-title').textContent).toBe('B User');
    expect(document.getElementById('tsc-grade-card').textContent).not.toMatch(/11\.1/);
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/50/);
  });
});
