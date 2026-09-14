/**
 * tests/desk-self-signup.test.js
 *
 * Student self-signup (open signup + 🎲 re-roll + 4-digit PIN) in
 * desk.html. Spec: STUDENT_SELF_SIGNUP_BUILD.md.
 *
 * Strategy mirrors desk-roster-signin.test.js: jsdom DOM-structure for statics +
 * a vm sandbox that runs the REAL self-signup source block against fakes. No
 * network, no Supabase.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const DESK_PATH = resolve(REPO_ROOT, 'desk.html');

let html;
let document;

beforeAll(() => {
  html = readFileSync(DESK_PATH, 'utf-8');
  document = new JSDOM(html).window.document;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Static — signup modal markup + sign-in cross-link
// ─────────────────────────────────────────────────────────────────────────────

describe('self-signup — modal markup', () => {
  it('has a #signup-overlay with real-name, two PIN inputs, a username card + re-roll', () => {
    expect(document.getElementById('signup-overlay')).not.toBeNull();
    expect(document.getElementById('signup-realname')).not.toBeNull();
    const pin = document.getElementById('signup-pin');
    const pin2 = document.getElementById('signup-pin2');
    expect(pin).not.toBeNull();
    expect(pin2).not.toBeNull();
    expect(pin.getAttribute('type')).toBe('password');
    expect(pin.getAttribute('maxlength')).toBe('4');
    expect(pin.getAttribute('inputmode')).toBe('numeric');
    expect(document.getElementById('signup-username-card')).not.toBeNull();
    expect(document.getElementById('signup-reroll')).not.toBeNull();
  });

  it('the Create-account button calls submitSignUp() and re-roll calls _spinUsername()', () => {
    const ov = document.getElementById('signup-overlay');
    expect(ov.innerHTML).toContain('submitSignUp()');
    expect(ov.innerHTML).toContain('_spinUsername()');
  });

  it('the sign-in modal cross-links to signup via _switchToSignUp()', () => {
    const ov = document.getElementById('signin-overlay');
    expect(ov.innerHTML).toContain('_switchToSignUp()');
  });

  it('the signup modal can switch back to sign-in (no dead-end)', () => {
    const ov = document.getElementById('signup-overlay');
    expect(ov.innerHTML).toContain('_switchToSignIn()');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Static — real Period B/E controls + boot routing precedence
// ─────────────────────────────────────────────────────────────────────────────

describe('teacher onboarding + class gradebook (static)', () => {
  it('signup modal has the "I\'m a teacher" checkbox + teacher-key field', () => {
    expect(document.getElementById('signup-is-teacher')).not.toBeNull();
    expect(document.getElementById('signup-teacher-key')).not.toBeNull();
    const ov = document.getElementById('signup-overlay');
    expect(ov.innerHTML).toContain('_toggleTeacherKey()');
  });

  it('the Teacher menu opens the Teacher Tools launcher, which wires the Roster Console', () => {
    // The teacher menu was consolidated into one launcher (openTeacherTools). The
    // in-Desk Class Gradebook tile was dropped (it duplicated the Dashboard); the
    // Roster Console — the teacher's enroll/passwords tool — is a tile in it.
    const menu = document.getElementById('menu-teacher');
    expect(menu).not.toBeNull();
    expect(menu.innerHTML).toContain('openTeacherTools()');     // menu → launcher
    expect(html).toContain("window.open('teacher-roster-console.html'");   // launcher tile wires it
  });

  it('the My Gradebook modal has the teacher student-picker row', () => {
    expect(document.getElementById('my-gradebook-student-row')).not.toBeNull();
    expect(document.getElementById('my-gradebook-student')).not.toBeNull();
  });

  it('openClassGradebook + _selectClassStudent are defined in source', () => {
    expect(html).toMatch(/async\s+function\s+openClassGradebook\s*\(/);
    expect(html).toMatch(/function\s+_selectClassStudent\s*\(/);
  });

  it('the redundant Do-Now "Class Gradebook" chip was removed (Teacher Tools is the single entry)', () => {
    // Do-Now declutter (2026-06-15): the Class Gradebook chip was dropped from the
    // Do Now card — it duplicated the teacher path to Class Gradebook, which now
    // lives in the Teacher Tools launcher (openTeacherTools → openClassGradebook).
    // The Do-Now grade strip no longer builds a cgChip.
    expect(html).not.toContain('cgChip');
    expect(document.getElementById('menu-teacher').innerHTML).toContain('openTeacherTools()');
    expect(html).toContain('openClassGradebook()');
  });
});

describe('self-signup runtime — _toggleTeacherKey', () => {
  it('shows the teacher-key field only when the box is checked', () => {
    const d = makeSignup();
    const row = d.el('signup-teacher-key-row');
    d.el('signup-is-teacher').checked = true;
    d.api._toggleTeacherKey();
    expect(row.style.display).toBe('block');
    d.el('signup-is-teacher').checked = false;
    d.api._toggleTeacherKey();
    expect(row.style.display).toBe('none');
  });
});

describe('self-signup — boot routes real Period B/E calendars', () => {
  it('the boot IIFE honors signed-in section, then ?period=, then defaults to E', () => {
    expect(html).toMatch(/who\.section === 'PeriodB'\) return 'B'/);
    expect(html).toMatch(/who\.section === 'PeriodE'\) return 'E'/);
    const bootEnd = html.indexOf('var APP_BUILD');
    const bootStart = html.lastIndexOf('(function(){', bootEnd);
    const boot = html.slice(bootStart, bootEnd);
    expect(boot.indexOf('_currentRosterPeriod()')).toBeLessThan(boot.indexOf('URLSearchParams'));
    expect(boot).toContain("?pp:'C'");
  });

  it('shows separate Period B/E buttons and View-menu items', () => {
    const btnB = document.getElementById('btn-b');
    const btnE = document.getElementById('btn-e');
    expect(btnB.textContent).toBe('Section C');
    expect(btnB.getAttribute('onclick')).toContain("setP('C')");
    expect(btnE.textContent).toBe('Section D');
    expect(btnE.getAttribute('onclick')).toContain("setP('D')");
    expect(btnE.style.display).not.toBe('none');
    expect(document.getElementById('menu-period-b').getAttribute('onclick')).toContain("setP('C')");
    expect(document.getElementById('menu-period-e').getAttribute('onclick')).toContain("setP('D')");
  });

  it('a first-time device (no sign-in history) auto-opens the signup modal', () => {
    expect(html).toMatch(/_loadKnownUsers\(\)\.length === 0/);
    expect(html).toMatch(/_firstTime && typeof openSignupModal === 'function'\) openSignupModal\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Runtime — run the real self-signup source against fakes
// ─────────────────────────────────────────────────────────────────────────────

function makeSignup({ rosterClient } = {}) {
  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, {
        id, value: '', textContent: '', disabled: false, firstChild: null,
        style: {}, focus() {}, appendChild() {}, removeChild() {}
      });
    }
    return els.get(id);
  }
  const calls = { registerStudent: [], showDialog: [], claim: [] };
  const created = [];
  const store = new Map();
  const sandbox = {
    document: {
      getElementById: id => el(id),
      createElement: (tag) => {
        const node = {
          tagName: String(tag || '').toUpperCase(), id: '', className: '', value: '',
          textContent: '', style: {}, firstChild: null, children: [],
          appendChild(c) { this.children.push(c); }, removeChild() {}
        };
        let _onchange = null;
        Object.defineProperty(node, 'onchange', { get() { return _onchange; }, set(v) { _onchange = v; }, configurable: true });
        created.push(node);
        return node;
      },
      createTextNode: t => ({ textContent: t })
    },
    window: { rosterClient: rosterClient || undefined },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    setTimeout: fn => fn(),
    Math, JSON, console,
    registerStudent: x => calls.registerStudent.push(x),
    showDialog: (...a) => calls.showDialog.push(a),
    openSignInModal: () => { calls.openSignInModal = (calls.openSignInModal || 0) + 1; }
  };
  createContext(sandbox);

  const start = html.indexOf('var _SIGNUP_FRUITS');
  const end = html.indexOf('function signOutStudent()');
  if (start < 0 || end < 0 || end < start) throw new Error('self-signup source block not found');
  const block = html.slice(start, end);
  runInContext(
    block +
    '\nthis.__api = { _spinUsername, _renderSignupSections, openSignupModal, closeSignupModal, ' +
    '_switchToSignUp, _switchToSignIn, submitSignUp, _toggleTeacherKey };',
    sandbox
  );
  return { api: sandbox.__api, el, store, calls, created };
}

describe('self-signup runtime — _spinUsername', () => {
  it('produces a fruit_animal candidate and shows it on the card', () => {
    const d = makeSignup();
    const name = d.api._spinUsername();
    expect(name).toMatch(/^[a-z]+_[a-z]+$/);
    expect(d.el('signup-username-card').textContent).toBe(name);
  });

  it('re-roll changes the candidate over repeated spins (not stuck)', () => {
    const d = makeSignup();
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(d.api._spinUsername());
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('self-signup runtime — submitSignUp', () => {
  function signedUpClient(over = {}) {
    let claimArgs = null;
    const client = {
      claim: async (opts) => { claimArgs = opts; return { ok: true, username: opts.username, realName: opts.realName, section: opts.section, ...over }; },
      current: () => ({ studentId: 'sid-signup', username: claimArgs && claimArgs.username, realName: claimArgs && claimArgs.realName }),
      get _claimArgs() { return claimArgs; }
    };
    return client;
  }

  it('happy path: claims with the right args, signs in, writes legacy key, welcomes', async () => {
    const client = signedUpClient();
    const d = makeSignup({ rosterClient: client });
    d.api._spinUsername();
    const candidate = d.el('signup-username-card').textContent;
    d.el('signup-realname').value = '  Jordan Lee  ';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';

    await d.api.submitSignUp();

    expect(client._claimArgs).toEqual({ realName: 'Jordan Lee', section: 'PeriodX', username: candidate, pin: '1234' });
    expect(d.store.get('a2_desk_student_email')).toBe(candidate);
    expect(d.calls.registerStudent).toEqual([candidate]);
    expect(d.calls.showDialog.length).toBe(1);
    expect(d.el('signup-overlay').style.display).toBe('none');
  });

  it('username-taken: re-rolls, shows a "taken" message, writes NO session', async () => {
    const d = makeSignup({ rosterClient: { claim: async () => ({ ok: false, code: 'username-taken', error: 'username-taken' }), current: () => ({}) } });
    d.api._spinUsername();
    const first = d.el('signup-username-card').textContent;
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/taken/i);
    expect(d.store.has('a2_desk_student_email')).toBe(false);
    // A fresh candidate is shown for the retry.
    expect(d.el('signup-username-card').textContent).not.toBe('');
  });

  it('rejects a non-4-digit PIN without calling claim', async () => {
    let called = 0;
    const d = makeSignup({ rosterClient: { claim: async () => { called++; return { ok: true }; }, current: () => ({}) } });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '12';
    d.el('signup-pin2').value = '12';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/4 digits/);
    expect(called).toBe(0);
  });

  it('rejects mismatched PINs without calling claim', async () => {
    let called = 0;
    const d = makeSignup({ rosterClient: { claim: async () => { called++; return { ok: true }; }, current: () => ({}) } });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '5678';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/do not match/i);
    expect(called).toBe(0);
  });

  it('rejects a blank real name without calling claim', async () => {
    let called = 0;
    const d = makeSignup({ rosterClient: { claim: async () => { called++; return { ok: true }; }, current: () => ({}) } });
    d.api._spinUsername();
    d.el('signup-realname').value = '   ';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/real name/i);
    expect(called).toBe(0);
  });

  it('teacher signup: passes the teacher key to claim when "I am a teacher" is checked', async () => {
    let claimArgs = null;
    const client = {
      claim: async (o) => { claimArgs = o; return { ok: true, username: o.username, realName: o.realName, section: o.section, role: 'teacher' }; },
      current: () => ({ studentId: 'sid-t', username: claimArgs && claimArgs.username, realName: claimArgs && claimArgs.realName, role: 'teacher' })
    };
    const d = makeSignup({ rosterClient: client });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Ms. Tea';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    d.el('signup-is-teacher').checked = true;
    d.el('signup-teacher-key').value = 'apteacher2627';

    await d.api.submitSignUp();

    expect(claimArgs.teacherKey).toBe('apteacher2627');
  });

  it('teacher signup: requires a key when the box is checked (no claim call)', async () => {
    let called = 0;
    const d = makeSignup({ rosterClient: { claim: async () => { called++; return { ok: true }; }, current: () => ({}) } });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Ms. Tea';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    d.el('signup-is-teacher').checked = true; // but no key entered

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/teacher key/i);
    expect(called).toBe(0);
  });

  it('teacher signup: does NOT send a teacher key when the box is unchecked', async () => {
    let claimArgs = null;
    const client = {
      claim: async (o) => { claimArgs = o; return { ok: true, username: o.username, realName: o.realName, section: o.section }; },
      current: () => ({ studentId: 'sid-s', username: claimArgs && claimArgs.username })
    };
    const d = makeSignup({ rosterClient: client });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Reg Student';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    // box left unchecked; a stale key value must be ignored
    d.el('signup-teacher-key').value = 'apteacher2627';

    await d.api.submitSignUp();

    expect(claimArgs.teacherKey).toBeUndefined();
  });

  it('teacher signup: surfaces invalid-teacher-key from the server', async () => {
    const d = makeSignup({ rosterClient: { claim: async () => ({ ok: false, code: 'invalid-teacher-key', error: 'invalid-teacher-key' }), current: () => ({}) } });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Ms. Tea';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    d.el('signup-is-teacher').checked = true;
    d.el('signup-teacher-key').value = 'wrong';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/teacher key isn/i);
  });

  it('fail-closed: claim ok but session did NOT persist (localStorage blocked) → error shown, wall NOT dropped', async () => {
    // claim() returns ok, but current() is null (writeSession silently failed).
    const d = makeSignup({ rosterClient: { claim: async (o) => ({ ok: true, username: o.username }), current: () => null } });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    d.el('signup-overlay').style.display = 'block';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/could not save/i);
    expect(d.store.has('a2_desk_student_email')).toBe(false);
    expect(d.el('signup-overlay').style.display).toBe('block'); // modal stays up
  });

  it('offline (no rosterClient.claim): clear message, no throw, no session', async () => {
    const d = makeSignup({ rosterClient: undefined });
    d.api._spinUsername();
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';

    await d.api.submitSignUp();

    expect(d.el('signup-error').textContent).toMatch(/offline/i);
    expect(d.store.has('a2_desk_student_email')).toBe(false);
  });
});

describe('self-signup runtime — modal switching', () => {
  it('_switchToSignUp hides the sign-in overlay and opens signup', () => {
    const d = makeSignup({ rosterClient: { current: () => ({}) } });
    d.el('signin-overlay').style.display = 'block';
    d.api._switchToSignUp();
    expect(d.el('signin-overlay').style.display).toBe('none');
    expect(d.el('signup-overlay').style.display).toBe('block');
  });

  it('_switchToSignIn hides the signup overlay and re-opens sign-in', () => {
    const d = makeSignup({ rosterClient: { current: () => ({}) } });
    d.el('signup-overlay').style.display = 'block';
    d.api._switchToSignIn();
    expect(d.el('signup-overlay').style.display).toBe('none');
    expect(d.calls.openSignInModal).toBe(1);
  });
});

describe('self-signup runtime — multi-period dropdown (fall path)', () => {
  it('renders a real <select> for >1 period and writes the PICKED value, not the label', async () => {
    let claimArgs = null;
    const client = {
      claim: async (o) => { claimArgs = o; return { ok: true, username: o.username, realName: o.realName, section: o.section }; },
      current: () => ({ studentId: 'sid-pick', username: claimArgs && claimArgs.username })
    };
    const d = makeSignup({ rosterClient: client });

    d.api._renderSignupSections([{ value: 'PeriodA', label: 'Period A' }, { value: 'PeriodB', label: 'Period B' }]);
    const sel = d.created.find(n => n.tagName === 'SELECT');
    expect(sel).toBeTruthy();
    expect(sel.children.length).toBe(2);
    expect(sel.children.map(o => o.value)).toEqual(['PeriodA', 'PeriodB']);
    expect(sel.children.map(o => o.textContent)).toEqual(['Period A', 'Period B']);

    // Pick the 2nd option → onchange must update the section value.
    sel.value = 'PeriodB';
    sel.onchange();

    d.api._spinUsername();
    d.el('signup-realname').value = 'Jordan Lee';
    d.el('signup-pin').value = '1234';
    d.el('signup-pin2').value = '1234';
    await d.api.submitSignUp();

    expect(claimArgs.section).toBe('PeriodB');
  });
});

describe('self-signup runtime — openSignupModal', () => {
  it('resets stale fields, shows the modal immediately, and refines the period list from the server', async () => {
    const client = {
      openSections: async () => [{ value: 'PeriodA', label: 'Period A' }, { value: 'PeriodB', label: 'Period B' }],
      current: () => ({})
    };
    const d = makeSignup({ rosterClient: client });
    d.el('signup-realname').value = 'stale name';
    d.el('signup-pin').value = '9999';
    d.el('signup-pin2').value = '9999';

    await d.api.openSignupModal();

    expect(d.el('signup-realname').value).toBe('');
    expect(d.el('signup-pin').value).toBe('');
    expect(d.el('signup-overlay').style.display).toBe('block');
    expect(d.el('signup-username-card').textContent).toMatch(/^[a-z]+_[a-z]+$/);
    // refined to the 2-period server list
    const sel = d.created.find(n => n.tagName === 'SELECT');
    expect(sel).toBeTruthy();
    expect(sel.children.length).toBe(2);
  });

  it('a rejecting openSections() does not throw and leaves the modal shown', async () => {
    const client = { openSections: async () => { throw new Error('down'); }, current: () => ({}) };
    const d = makeSignup({ rosterClient: client });
    await expect(d.api.openSignupModal()).resolves.not.toThrow;
    expect(d.el('signup-overlay').style.display).toBe('block');
  });
});
