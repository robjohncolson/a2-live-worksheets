// teacher-student-console-remediation.test.js -- T1 of P6 BUILD section 4.3.
// Tests the Apply Remediation modal wiring in teacher-dashboard.html.
//
// Strategy: two layers.
//   1. Static source analysis (node env) -- verifies DOM markup, CSS rules, and
//      JS function signatures are present verbatim in the file.
//   2. JSDOM behavioral tests -- loads the page with runScripts:'dangerously',
//      stubs fetch, and exercises modal open/close + submit wiring.
//
// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  // Stubs required at script-eval time.
  window.rosterClient = { token: () => null, current: () => null };
  window.fetch = fetchMock || vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [], rows: [] }),
  });

  return dom;
}

// Stub that always returns success for grade/recent/unlocks.
function makeDefaultFetch() {
  return vi.fn().mockImplementation((url) => {
    if (url.includes('/lesson-unlocks')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, rows: [] }),
      });
    }
    if (url.includes('/grade')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, quarters: {}, units: {} }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ ok: true, submissions: [] }),
    });
  });
}

// ---------------------------------------------------------------------------
// 1. Remediation modal DOM presence (static analysis)
// ---------------------------------------------------------------------------

describe('Remediation modal DOM presence', () => {
  it('file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('#tsc-remediation-modal exists and is hidden by default (aria-hidden true, no tsc-modal-open)', () => {
    expect(DASH).toMatch(/id="tsc-remediation-modal"/);
    // aria-hidden="true" should be present and the class should NOT have tsc-modal-open in source
    expect(DASH).toMatch(/id="tsc-remediation-modal"[^>]*aria-hidden="true"/);
  });

  it('all four form controls exist', () => {
    expect(DASH).toMatch(/id="tsc-rem-unit"/);
    expect(DASH).toMatch(/id="tsc-rem-skill"/);
    expect(DASH).toMatch(/id="tsc-rem-notes"/);
    expect(DASH).toMatch(/id="tsc-remediation-confirm"/);
  });

  it('#tsc-action-remediation does NOT have disabled attribute', () => {
    // The button should exist without a disabled attr
    expect(DASH).toMatch(/id="tsc-action-remediation"/);
    // Check it is NOT disabled -- find the button line and verify no disabled on it
    const buttonMatch = DASH.match(/id="tsc-action-remediation"[^>]*/);
    expect(buttonMatch).not.toBeNull();
    expect(buttonMatch[0]).not.toMatch(/disabled/);
  });

  it('modal CSS class .tsc-modal is defined', () => {
    expect(DASH).toMatch(/\.tsc-modal\s*\{/);
  });

  it('modal open CSS class .tsc-modal-open is defined', () => {
    expect(DASH).toMatch(/\.tsc-modal\.tsc-modal-open/);
  });

  it('openRemediationModal function is defined', () => {
    expect(DASH).toMatch(/function\s+openRemediationModal\s*\(/);
  });

  it('closeRemediationModal function is defined', () => {
    expect(DASH).toMatch(/function\s+closeRemediationModal\s*\(/);
  });

  it('submitRemediationProposal function is defined', () => {
    expect(DASH).toMatch(/function\s+submitRemediationProposal\s*\(/);
  });

  it('_tscCurrentStudentStub variable is declared', () => {
    expect(DASH).toMatch(/var\s+_tscCurrentStudentStub\s*=/);
  });
});

// ---------------------------------------------------------------------------
// 2. Open modal from drawer button (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Open modal from drawer button', () => {
  let dom, document, window;

  beforeEach(async () => {
    dom = makeDom(makeDefaultFetch());
    document = dom.window.document;
    window = dom.window;

    // Open the drawer first (required to set _tscCurrentStudentStub).
    window.openTscDrawer({
      studentId: 'stu_rem_test',
      username: 'mango-fox',
      realName: 'John Smith',
      section: 'PeriodC',
    });
    await new Promise(r => setTimeout(r, 20));
  });

  it('modal is hidden before button click', () => {
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal).not.toBeNull();
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking #tsc-action-remediation opens the modal', () => {
    const btn = document.getElementById('tsc-action-remediation');
    btn.click();
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
  });

  it('student name appears in #tsc-remediation-student-name after open', () => {
    const btn = document.getElementById('tsc-action-remediation');
    btn.click();
    const nameEl = document.getElementById('tsc-remediation-student-name');
    expect(nameEl.textContent).toBe('John Smith');
  });

  it('all form fields are empty after open', () => {
    const btn = document.getElementById('tsc-action-remediation');
    btn.click();
    expect(document.getElementById('tsc-rem-unit').value).toBe('');
    expect(document.getElementById('tsc-rem-skill').value).toBe('');
    expect(document.getElementById('tsc-rem-notes').value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. Validation (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Validation', () => {
  let dom, document, window;

  beforeEach(async () => {
    dom = makeDom(makeDefaultFetch());
    document = dom.window.document;
    window = dom.window;

    window.openTscDrawer({
      studentId: 'stu_val',
      username: 'lime-duck',
      realName: 'Val User',
      section: 'PeriodD',
    });
    await new Promise(r => setTimeout(r, 10));
    document.getElementById('tsc-action-remediation').click();
  });

  it('submit with empty unit shows "Unit is required." and makes no fetch', async () => {
    const fetchSpy = window.fetch;
    const callsBefore = fetchSpy.mock.calls.length;
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 10));
    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/Unit is required/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
    // No additional fetch calls.
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });

  it('submit with unit="abc" shows format error and makes no fetch', async () => {
    const fetchSpy = window.fetch;
    const callsBefore = fetchSpy.mock.calls.length;
    document.getElementById('tsc-rem-unit').value = 'abc';
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 10));
    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/look like/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });

  it('submit with unit="U1" but empty skill shows "Skill code is required." and makes no fetch', async () => {
    const fetchSpy = window.fetch;
    const callsBefore = fetchSpy.mock.calls.length;
    document.getElementById('tsc-rem-unit').value = 'U1';
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 10));
    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/Skill code is required/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// 4. Successful POST (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Successful POST', () => {
  it('valid unit+skill fires one POST to /remediation/propose with correct body shape', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, assignmentId: 'xyz', status: 'proposed' }),
        });
      }
      if (url.includes('/lesson-unlocks')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_post', username: 'oak-bear', realName: 'Post User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    document.getElementById('tsc-action-remediation').click();

    document.getElementById('tsc-rem-unit').value = 'U1';
    document.getElementById('tsc-rem-skill').value = 'a2-domain-range';
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 20));

    const proposeCalls = fetchMock.mock.calls.filter(c => c[0].includes('/remediation/propose'));
    expect(proposeCalls.length).toBe(1);

    const body = JSON.parse(proposeCalls[0][1].body);
    expect(body.studentId).toBe('stu_post');
    expect(body.unit).toBe('U1');
    expect(body.skill).toBe('a2-domain-range');
    expect(body.proposedBy).toBe('teacher-dashboard');
    // Empty notes -> notes field is undefined (not included in body).
    expect(body.notes).toBeUndefined();
  });

  it('x-teacher-secret header is present when a secret is entered', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ ok: true, assignmentId: 'abc' }),
        });
      }
      if (url.includes('/lesson-unlocks')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    const secretInput = document.getElementById('teacher-secret');
    if (secretInput) secretInput.value = 'super-secret';

    window.openTscDrawer({ studentId: 'stu_sec', username: 'fig-seal', realName: 'Sec User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    document.getElementById('tsc-action-remediation').click();
    document.getElementById('tsc-rem-unit').value = 'U2';
    document.getElementById('tsc-rem-skill').value = 'a2-linear-equations';
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 20));

    const proposeCalls = fetchMock.mock.calls.filter(c => c[0].includes('/remediation/propose'));
    expect(proposeCalls.length).toBe(1);
    expect(proposeCalls[0][1].headers['x-teacher-secret']).toBe('super-secret');
  });

  it('200 ok response shows success, closes the modal after delay, and keeps the drawer open', async () => {
    let gradeRequests = 0;
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ ok: true, assignmentId: 'xyz' }),
        });
      }
      if (url.includes('/stu_ok/grade')) {
        gradeRequests++;
        const quarterGrade = gradeRequests === 1 ? 70.0 : 91.5;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: { Q4: { quarterGrade } }, units: {} }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, submissions: [], rows: [] }) });
    });
    const { window } = makeDom(fetchMock);
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_ok', username: 'pear-wolf', realName: 'OK User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    expect(gradeRequests).toBe(1);
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/70/);

    document.getElementById('tsc-action-remediation').click();
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    document.getElementById('tsc-rem-unit').value = 'U1';
    document.getElementById('tsc-rem-skill').value = 'a2-domain-range';
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 50));

    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/Proposed.*xyz/);
    expect(statusEl.classList.contains('is-success')).toBe(true);
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);

    // The success message remains visible for 1.4 seconds before automatic close.
    await new Promise(r => setTimeout(r, 1500));
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    // The AP baseline proposes remediation without re-fetching the drawer.
    expect(gradeRequests).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/stu_ok/recent')).length).toBe(1);
    expect(document.getElementById('tsc-grade-card').textContent).toMatch(/70/);
    expect(document.getElementById('tsc-drawer-title').textContent).toBe('OK User');
    expect(document.getElementById('tsc-drawer').getAttribute('aria-hidden')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// 5. Error paths (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Error paths', () => {
  async function setupWithFetch(fetchMock) {
    const dom = makeDom(fetchMock);
    const { window } = dom;
    const document = window.document;

    window.openTscDrawer({ studentId: 'stu_err', username: 'plum-elk', realName: 'Err User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    document.getElementById('tsc-action-remediation').click();
    document.getElementById('tsc-rem-unit').value = 'U1';
    document.getElementById('tsc-rem-skill').value = 'a2-domain-range';
    return { dom, document, window };
  }

  it('503 response shows server error string and modal stays open + confirm re-enabled', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.resolve({
          ok: false, status: 503,
          json: async () => ({ ok: false, error: 'remediation_assignment not provisioned' }),
        });
      }
      if (url.includes('/lesson-unlocks')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document } = await setupWithFetch(fetchMock);
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 30));

    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/not provisioned/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
    // Modal stays open.
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    // Confirm button re-enabled.
    expect(document.getElementById('tsc-remediation-confirm').disabled).toBe(false);
  });

  it('400 response shows the server error string', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.resolve({
          ok: false, status: 400,
          json: async () => ({ ok: false, error: 'studentId, unit, and skill are required' }),
        });
      }
      if (url.includes('/lesson-unlocks')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document } = await setupWithFetch(fetchMock);
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 30));

    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/studentId, unit, and skill are required/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
  });

  it('network throw shows "Network error: ..."', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/remediation/propose')) {
        return Promise.reject(new Error('Failed to fetch'));
      }
      if (url.includes('/lesson-unlocks')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, rows: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, quarters: {}, units: {}, submissions: [] }) });
    });

    const { document } = await setupWithFetch(fetchMock);
    document.getElementById('tsc-remediation-confirm').click();
    await new Promise(r => setTimeout(r, 30));

    const statusEl = document.getElementById('tsc-remediation-status');
    expect(statusEl.textContent).toMatch(/Network error/);
    expect(statusEl.classList.contains('is-error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Close affordances (JSDOM behavioral)
// ---------------------------------------------------------------------------

describe('Close affordances', () => {
  let dom, document, window;

  beforeEach(async () => {
    dom = makeDom(makeDefaultFetch());
    document = dom.window.document;
    window = dom.window;

    window.openTscDrawer({ studentId: 'stu_close', username: 'fig-owl', realName: 'Close User', section: 'PeriodC' });
    await new Promise(r => setTimeout(r, 20));
    document.getElementById('tsc-action-remediation').click();
  });

  it('clicking .tsc-modal-close closes the modal', () => {
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    const closeBtn = modal.querySelector('.tsc-modal-close');
    closeBtn.click();
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
  });

  it('clicking the overlay closes the modal', () => {
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    const overlay = modal.querySelector('.tsc-modal-overlay');
    overlay.click();
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
  });

  it('clicking Cancel closes the modal', () => {
    const modal = document.getElementById('tsc-remediation-modal');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    const cancel = modal.querySelector('.tsc-modal-cancel');
    cancel.click();
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
  });

  it('ESC closes the modal and does NOT also close the drawer (capture-phase + stopPropagation)', () => {
    const modal = document.getElementById('tsc-remediation-modal');
    const drawer = document.getElementById('tsc-drawer');
    expect(modal.classList.contains('tsc-modal-open')).toBe(true);
    expect(drawer.classList.contains('tsc-open')).toBe(true);

    const evt = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);

    // Modal closes.
    expect(modal.classList.contains('tsc-modal-open')).toBe(false);
    // Drawer stays open (capture handler stopped propagation).
    expect(drawer.classList.contains('tsc-open')).toBe(true);
  });
});
