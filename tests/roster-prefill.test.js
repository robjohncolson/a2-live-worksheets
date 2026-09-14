// roster-prefill.test.js — exercises roster-prefill.js against a minimal
// worksheet DOM with a fake rosterClient. Pins:
//   - signed-in path: 3 inputs populated + read-only + tinted + tooltip
//   - banner inserted above the .student-info host
//   - writeBackLegacyStore syncs localStorage['worksheet-user']
//   - not-signed-in path: zero side effects (worksheet's legacy save/restore
//     flow stays in charge)
//   - bespoke single-input form (u3_lesson6-7 shape): only the present input
//     is populated; no banner orphans, no throw
//   - structural assertion: every u*_lesson*_live.html loads roster-prefill.js
//
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFILL_PATH = resolve(repo, 'roster-prefill.js');
const PREFILL_SRC = readFileSync(PREFILL_PATH, 'utf8');

// Build a minimal worksheet shell — student-info container + 3 inputs.
// Mirrors the 68 standard worksheets (u3_lesson6-7 single-input variant gets
// its own narrower fixture below).
function buildStandardShell() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.innerHTML = `
    <h1>Test Worksheet</h1>
    <div class="student-info">
      <div><label>Name:</label> <input type="text" id="worksheetName" style="width:160px;"></div>
      <div><label>Period:</label> <input type="text" id="worksheetPeriod" style="width:40px;"></div>
      <div><label>Username:</label> <input type="text" id="worksheetUsername" style="width:120px;" placeholder="for class sync"></div>
    </div>
    <div>body content</div>
  `;
  document.body.appendChild(root);
  return root;
}

function buildSingleInputShell() {
  // u3_lesson6-7 only has #worksheetUsername; no Name/Period.
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="student-info">
      <div><label>Username:</label> <input type="text" id="worksheetUsername"></div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function loadPrefillScript() {
  // Execute the helper IIFE against the current jsdom window. We eval the
  // source so the document.readyState branches inside it see jsdom's state.
  // jsdom's readyState is 'complete' by the time tests run, so the helper's
  // setTimeout-scheduled applyPrefill fires next tick.
  // eslint-disable-next-line no-new-func
  new Function(PREFILL_SRC).call(window);
}

// Helper: wait one macrotask so the setTimeout(applyPrefill, 0) inside the
// IIFE has a chance to fire.
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  // Reset state between tests.
  delete window.rosterClient;
  try { localStorage.removeItem('worksheet-user'); } catch (_) {}
  try { window.history.replaceState(null, '', '/'); } catch (_) {}
  delete window.__WS_READ_ONLY__;
  document.body.innerHTML = '';
});

afterEach(() => {
  delete window.rosterClient;
});

describe('roster-prefill.js — signed-in path', () => {
  it('populates all 3 inputs from rosterClient.current() and locks them read-only', async () => {
    buildStandardShell();
    window.rosterClient = {
      current: () => ({
        studentId: 'uuid-1',
        username: 'date_tiger',
        realName: 'Robert Colson',
        section: 'PeriodE',
      }),
    };
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('Robert Colson');
    expect(document.getElementById('worksheetPeriod').value).toBe('PeriodE');
    expect(document.getElementById('worksheetUsername').value).toBe('date_tiger');

    for (const id of ['worksheetName', 'worksheetPeriod', 'worksheetUsername']) {
      const el = document.getElementById(id);
      expect(el.readOnly, `${id} must be readOnly`).toBe(true);
      expect(el.title, `${id} tooltip must mention signed-in`).toMatch(/Signed in via the Desk/);
    }
  });

  it('renders the green "Signed in via the Desk" banner above .student-info', async () => {
    buildStandardShell();
    window.rosterClient = {
      current: () => ({ username: 'apple_otter', realName: 'Ada Lovelace', section: 'PeriodB' }),
    };
    loadPrefillScript();
    await tick();

    const banner = document.getElementById('roster-prefill-banner');
    expect(banner, 'banner must be inserted').toBeTruthy();
    expect(banner.innerHTML).toContain('Signed in via the Desk');
    expect(banner.innerHTML).toContain('Ada Lovelace');
    expect(banner.innerHTML).toContain('PeriodB');
    // Banner sits immediately before the .student-info container.
    const studentInfo = document.querySelector('.student-info');
    expect(banner.nextSibling).toBe(studentInfo);
  });

  it('writes the same identity to localStorage["worksheet-user"] for legacy save/restore parity', async () => {
    buildStandardShell();
    window.rosterClient = {
      current: () => ({ username: 'plum_yak', realName: 'Marie Curie', section: 'PeriodE' }),
    };
    loadPrefillScript();
    await tick();

    const stored = JSON.parse(localStorage.getItem('worksheet-user') || '{}');
    expect(stored.name).toBe('Marie Curie');
    expect(stored.klass).toBe('PeriodE');
    expect(stored.username).toBe('plum_yak');
  });

  it('is idempotent: running twice does not insert a duplicate banner', async () => {
    buildStandardShell();
    window.rosterClient = {
      current: () => ({ username: 'kiwi_seal', realName: 'A', section: 'PeriodB' }),
    };
    loadPrefillScript();
    await tick();
    loadPrefillScript();
    await tick();

    const banners = document.querySelectorAll('#roster-prefill-banner');
    expect(banners.length).toBe(1);
  });
});

describe('roster-prefill.js — not signed in', () => {
  it('no rosterClient at all → zero DOM side effects, no localStorage write', async () => {
    buildStandardShell();
    // rosterClient deliberately absent
    loadPrefillScript();
    await tick();

    for (const id of ['worksheetName', 'worksheetPeriod', 'worksheetUsername']) {
      const el = document.getElementById(id);
      expect(el.value, `${id} must stay empty`).toBe('');
      expect(el.readOnly, `${id} must stay editable`).toBe(false);
    }
    expect(document.getElementById('roster-prefill-banner')).toBeNull();
    expect(localStorage.getItem('worksheet-user')).toBeNull();
  });

  it('rosterClient present but current() returns null → no side effects', async () => {
    buildStandardShell();
    window.rosterClient = { current: () => null };
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('');
    expect(document.getElementById('roster-prefill-banner')).toBeNull();
  });

  it('rosterClient.current throws → caught silently, no side effects', async () => {
    buildStandardShell();
    window.rosterClient = { current: () => { throw new Error('boom'); } };
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('');
    expect(document.getElementById('roster-prefill-banner')).toBeNull();
  });
});

describe('roster-prefill.js — view-as guard (teacher previewing a student)', () => {
  const teacher = { current: () => ({ username: 'mr_teacher', realName: 'Mr Teacher', section: 'PeriodB', role: 'teacher' }) };

  it('bails when __WS_READ_ONLY__ is set (the module flag): no fields, no banner, no write', async () => {
    buildStandardShell();
    window.rosterClient = teacher;
    window.__WS_READ_ONLY__ = true;
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('');
    expect(document.getElementById('worksheetName').readOnly).toBe(false);
    expect(document.getElementById('roster-prefill-banner')).toBeNull();
    expect(localStorage.getItem('worksheet-user')).toBeNull();
  });

  it('bails on ?viewAsUserId + teacher role even WITHOUT the flag (self-contained signal)', async () => {
    buildStandardShell();
    window.rosterClient = teacher;
    window.history.replaceState(null, '', '/u1_lesson2_live.html?viewAsUserId=stu_target');
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('');
    expect(document.getElementById('roster-prefill-banner')).toBeNull();
    expect(localStorage.getItem('worksheet-user')).toBeNull();
  });

  it('does NOT bail for a STUDENT with a (forged) ?viewAsUserId — they still get their own prefill', async () => {
    buildStandardShell();
    window.rosterClient = {
      current: () => ({ username: 'kid_student', realName: 'Kid Student', section: 'PeriodE', role: 'student' }),
    };
    window.history.replaceState(null, '', '/u1_lesson2_live.html?viewAsUserId=stu_someone');
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetName').value).toBe('Kid Student');
    expect(document.getElementById('roster-prefill-banner')).toBeTruthy();
  });
});

describe('roster-prefill.js — single-input worksheet (u3_lesson6-7 shape)', () => {
  it('only the present input gets populated; no throw on missing IDs', async () => {
    buildSingleInputShell();
    window.rosterClient = {
      current: () => ({ username: 'grape_owl', realName: 'Solo', section: 'PeriodB' }),
    };
    loadPrefillScript();
    await tick();

    expect(document.getElementById('worksheetUsername').value).toBe('grape_owl');
    expect(document.getElementById('worksheetUsername').readOnly).toBe(true);
    // Banner still rendered (host is the .student-info div).
    expect(document.getElementById('roster-prefill-banner')).toBeTruthy();
  });

  it('worksheet with NO matching inputs at all → no banner, no throw', async () => {
    document.body.innerHTML = '<div>no student-info section at all</div>';
    window.rosterClient = {
      current: () => ({ username: 'no_target' }),
    };
    loadPrefillScript();
    await tick();

    expect(document.getElementById('roster-prefill-banner')).toBeNull();
  });
});

// Structural: every worksheet on disk must load roster-prefill.js. Mirrors
// the DN2b wiring-coverage assertion shape so a future regression (someone
// adds a new worksheet without the script tag, or strips it) fails the test.
describe('roster-prefill.js — structural rollout coverage (all 69 worksheets)', () => {
  

  it('roster-prefill.js loads AFTER roster-client.js in every worksheet (dependency order)', () => {
    const worksheets = readdirSync(repo)
      .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
      .sort();
    const violations = [];
    for (const f of worksheets) {
      const html = readFileSync(resolve(repo, f), 'utf8');
      const cli = html.indexOf('src="roster-client.js"');
      const pre = html.indexOf('src="roster-prefill.js"');
      if (cli < 0 || pre < 0 || pre <= cli) violations.push(`${f} (client@${cli}, prefill@${pre})`);
    }
    expect(violations).toEqual([]);
  });
});
