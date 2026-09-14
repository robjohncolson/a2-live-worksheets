/**
 * tests/desk-roster-signin.test.js
 *
 * DN2c — verifies `rosterClient` is wired as the Desk's single sign-in surface
 * in desk.html. Frozen contract: DESK_DONOW_DN2C_BUILD.md.
 *
 * Strategy mirrors schedule.test.js (jsdom DOM-structure, scripts NOT executed —
 * the Desk's inline app script has canvas/audio/Supabase deps) + roster-client.test.js
 * (source-text literal scan). No network, no Supabase.
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
  // No runScripts — we only inspect the parsed DOM + raw source.
  document = new JSDOM(html).window.document;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Shared client loaded via <script src> — flat paths, config before client
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — shared roster client is loaded', () => {
  it('loads roster_config.js and roster-client.js via <script src> (flat paths)', () => {
    const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    expect(srcs).toContain('roster_config.js');
    expect(srcs).toContain('roster-client.js');
  });

  it('roster_config.js loads BEFORE roster-client.js (config sets the URL)', () => {
    const idxConfig = html.indexOf('<script src="roster_config.js">');
    const idxClient = html.indexOf('<script src="roster-client.js">');
    expect(idxConfig).toBeGreaterThan(-1);
    expect(idxClient).toBeGreaterThan(-1);
    expect(idxConfig).toBeLessThan(idxClient);
  });

  it('both roster scripts load before the main inline app <script>', () => {
    const idxClient = html.indexOf('<script src="roster-client.js">');
    // The main app script is the first inline <script> (BAKED_REGISTRY marker).
    const idxApp = html.indexOf('/* ═══ BAKED REGISTRY');
    expect(idxApp).toBeGreaterThan(-1);
    expect(idxClient).toBeLessThan(idxApp);
  });

  it('uses flat paths, not "../" (Desk is at repo root)', () => {
    expect(html).not.toContain('src="../roster-client.js"');
    expect(html).not.toContain('src="../roster_config.js"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sign-in modal = username + password (no leftover email)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — sign-in modal is username + password', () => {
  it('has #signin-username (text) and #signin-password (type=password)', () => {
    const u = document.getElementById('signin-username');
    const p = document.getElementById('signin-password');
    expect(u).not.toBeNull();
    expect(p).not.toBeNull();
    expect(p.getAttribute('type')).toBe('password');
  });

  it('no #signin-email input remains anywhere', () => {
    expect(document.getElementById('signin-email')).toBeNull();
    expect(html).not.toContain('signin-email');
  });

  it('the OK button still calls submitSignIn()', () => {
    const overlay = document.getElementById('signin-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain('submitSignIn()');
  });

  it('Student menu still exposes Sign In / Sign Out', () => {
    const menu = document.getElementById('menu-student');
    expect(menu).not.toBeNull();
    expect(menu.innerHTML).toContain('openSignInModal()');
    expect(menu.innerHTML).toContain('signOutStudent()');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Source wiring — functions call rosterClient and preserve legacy compat
// ─────────────────────────────────────────────────────────────────────────────

/** Slice the source of a top-level `function NAME(` (or `async function NAME(`)
 *  to its matching close brace, so assertions are scoped to that function. */
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('DN2c — submitSignIn uses rosterClient and mirrors legacy identity', () => {
  let body;
  beforeAll(() => { body = fnBody(html, 'submitSignIn'); });

  it('is async', () => {
    expect(/async\s+function\s+submitSignIn\s*\(/.test(html)).toBe(true);
  });

  it('calls window.rosterClient.signIn(username, password)', () => {
    expect(body).toMatch(/rosterClient\.signIn\s*\(/);
  });

  it('guards when rosterClient is absent (offline)', () => {
    expect(body).toMatch(/!window\.rosterClient/);
  });

  it('mirrors identity into the legacy a2_desk_student_email key', () => {
    expect(body).toContain("localStorage.setItem('a2_desk_student_email'");
  });

  it('does NOT keep the old email-regex validation path', () => {
    expect(body).not.toMatch(/\[\^\\s@\]\+@\[\^\\s@\]/);
  });
});

describe('DN2c — signOutStudent clears both roster session and legacy key', () => {
  let body;
  beforeAll(() => { body = fnBody(html, 'signOutStudent'); });

  it('calls window.rosterClient.signOut()', () => {
    expect(body).toMatch(/rosterClient\.signOut\s*\(/);
  });

  it('still removes the legacy a2_desk_student_email key', () => {
    expect(body).toContain("localStorage.removeItem('a2_desk_student_email')");
  });
});

describe('DN2c — menu + modal open read rosterClient.current()', () => {
  it('updateStudentMenu prefers rosterClient.current()', () => {
    expect(fnBody(html, 'updateStudentMenu')).toMatch(/rosterClient\.current\s*\(/);
  });

  it('openSignInModal prefills username from rosterClient.current()', () => {
    const b = fnBody(html, 'openSignInModal');
    expect(b).toMatch(/rosterClient\.current\s*\(/);
    expect(b).toContain('signin-username');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Legacy path bodies untouched (DN3 retires them, not DN2c)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2c — legacy email-keyed feature bodies are untouched', () => {
  it('getStudentEmail still reads a2_desk_student_email', () => {
    expect(fnBody(html, 'getStudentEmail'))
      .toContain("localStorage.getItem('a2_desk_student_email')");
  });

  it('recordProgress no longer posts to the legacy student_progress path', () => {
    expect(fnBody(html, 'recordProgress')).not.toContain('fetch(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RUNTIME behavior — execute the real Desk helpers against fakes
//    (addresses Codex MAJOR: prove the wiring, not just string presence)
// ─────────────────────────────────────────────────────────────────────────────

/** Build a vm sandbox with the 5 real DN2c helpers loaded + injectable fakes. */
function makeDesk({ rosterClient } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, { id, value: '', textContent: '', disabled: false, innerHTML: '',
                    style: {}, focus() {} });
    }
    return els.get(id);
  }

  const calls = { registerStudent: [], showDialog: [], closeSignInModal: 0,
                  signOut: 0, reload: 0 };

  const sandbox = {
    document: { getElementById: id => el(id) },
    localStorage,
    window: { rosterClient: rosterClient || undefined },
    setTimeout: fn => fn(),
    MacSFX: { play() {} },
    location: { reload: () => { calls.reload++; } },
    registerStudent: (x) => { calls.registerStudent.push(x); },
    closeSignInModal: () => { calls.closeSignInModal++; },
    showDialog: (...a) => { calls.showDialog.push(a); },
  };
  createContext(sandbox);

  const src = ['getStudentEmail', 'updateStudentMenu', 'openSignInModal',
               'submitSignIn', 'signOutStudent']
    .map(n => fnBody(html, n)).join('\n');
  runInContext(src + '\nthis.__api = { getStudentEmail, updateStudentMenu, '
    + 'openSignInModal, submitSignIn, signOutStudent };', sandbox);

  return { api: sandbox.__api, el, store, calls, sandbox };
}

describe('DN2c runtime — submitSignIn', () => {
  it('on success: writes rosterClient.current().username (NOT the typed username) to the legacy key, only after auth', async () => {
    let signInArgs = null;
    const d = makeDesk({
      rosterClient: {
        signIn: async (u, p) => { signInArgs = [u, p]; return { ok: true }; },
        current: () => ({ studentId: 'sid-1', username: 'coconut_shark', realName: 'Pat Q', section: 'SUMMER26' }),
      },
    });
    d.el('signin-username').value = '  typed_name  ';
    d.el('signin-password').value = ' p@ss with space ';

    await d.api.submitSignIn();

    // username trimmed into the signIn call; password passed verbatim (no trim)
    expect(signInArgs).toEqual(['typed_name', ' p@ss with space ']);
    // legacy key = current().username, NOT the typed value
    expect(d.store.get('a2_desk_student_email')).toBe('coconut_shark');
    expect(d.calls.registerStudent).toEqual(['coconut_shark']);
    expect(d.calls.closeSignInModal).toBe(1);
  });

  it('on failure: does NOT write the legacy key and surfaces the error', async () => {
    const d = makeDesk({
      rosterClient: {
        signIn: async () => ({ ok: false, error: 'Invalid username or password' }),
        current: () => null,
      },
    });
    d.el('signin-username').value = 'x';
    d.el('signin-password').value = 'y';

    await d.api.submitSignIn();

    expect(d.store.has('a2_desk_student_email')).toBe(false);
    expect(d.el('signin-error').textContent).toBe('Invalid username or password');
    expect(d.calls.closeSignInModal).toBe(0);
  });

  it('offline (no rosterClient): clear error message, no throw, no key write', async () => {
    const d = makeDesk({ rosterClient: undefined });
    d.el('signin-username').value = 'x';
    d.el('signin-password').value = 'y';

    await d.api.submitSignIn();

    expect(d.el('signin-error').textContent).toMatch(/offline/i);
    expect(d.store.has('a2_desk_student_email')).toBe(false);
  });

  it('in-flight guard: a second call while the first is pending is a no-op', async () => {
    let resolve1;
    let signInCount = 0;
    const d = makeDesk({
      rosterClient: {
        signIn: () => { signInCount++; return new Promise(r => { resolve1 = r; }); },
        current: () => ({ username: 'u1' }),
      },
    });
    d.el('signin-username').value = 'u1';
    d.el('signin-password').value = 'pw';

    const p1 = d.api.submitSignIn();      // starts, awaits the pending promise
    await d.api.submitSignIn();           // must early-return (guard)
    expect(signInCount).toBe(1);

    resolve1({ ok: true });
    await p1;
    expect(signInCount).toBe(1);
  });
});

describe('DN2c runtime — signOutStudent / menu / modal open', () => {
  it('signOutStudent calls rosterClient.signOut, clears legacy key, reloads', () => {
    const d = makeDesk({ rosterClient: { signOut() { d.calls.signOut++; }, current: () => null } });
    d.store.set('a2_desk_student_email', 'coconut_shark');

    d.api.signOutStudent();

    expect(d.calls.signOut).toBe(1);
    expect(d.store.has('a2_desk_student_email')).toBe(false);
    expect(d.calls.reload).toBe(1);
  });

  it('updateStudentMenu shows realName (username) from rosterClient.current()', () => {
    const d = makeDesk({ rosterClient: { current: () => ({ username: 'coconut_shark', realName: 'Pat Q' }) } });
    d.api.updateStudentMenu();
    expect(d.el('menu-student-status').textContent).toBe('Signed in as: Pat Q (coconut_shark)');
  });

  it('updateStudentMenu falls back to "Not signed in" when no session', () => {
    const d = makeDesk({ rosterClient: { current: () => null } });
    d.api.updateStudentMenu();
    expect(d.el('menu-student-status').textContent).toBe('Not signed in');
  });

  it('openSignInModal prefills username from current() and blanks the password', () => {
    const d = makeDesk({ rosterClient: { current: () => ({ username: 'coconut_shark' }) } });
    d.el('signin-password').value = 'stale-secret';
    d.api.openSignInModal();
    expect(d.el('signin-username').value).toBe('coconut_shark');
    expect(d.el('signin-password').value).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TR2 — forced change-password modal
// ─────────────────────────────────────────────────────────────────────────────

describe('TR2 — forced change-password is wired (static)', () => {
  it('has a non-dismissable pwchange modal with new + confirm inputs', () => {
    expect(html).toContain('id="pwchange-overlay"');
    expect(html).toContain('id="pwchange-new"');
    expect(html).toContain('id="pwchange-confirm"');
    // No outside-click close handler on the overlay (unlike the sign-in modal).
    const m = /<div class="dialog-overlay" id="pwchange-overlay"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m[0]).not.toContain('onclick');
  });

  it('submitSignIn opens the pw modal when result.mustChangePassword', () => {
    const b = fnBody(html, 'submitSignIn');
    expect(b).toMatch(/result\.mustChangePassword/);
    expect(b).toMatch(/openPwChangeModal\s*\(/);
  });

  it('submitPwChange calls rosterClient.changePassword and validates length + match', () => {
    const b = fnBody(html, 'submitPwChange');
    expect(b).toMatch(/rosterClient\.changePassword\s*\(/);
    expect(b).toMatch(/length\s*<\s*6/);
    expect(b).toMatch(/!==\s*confirmPw|pw\s*!==/);
  });

  it('maybeForcePasswordChange checks current().mustChangePassword and never throws', () => {
    const b = fnBody(html, 'maybeForcePasswordChange');
    expect(b).toMatch(/mustChangePassword/);
    expect(b).toMatch(/try\s*\{/);
  });

  it('init invokes maybeForcePasswordChange (guarded)', () => {
    expect(html).toMatch(/typeof maybeForcePasswordChange === 'function'\) maybeForcePasswordChange\(\)/);
  });

  // Voluntary "Change Password" entry from the User menu (vs the forced flow).
  it('the User menu exposes a voluntary Change Password item wired to changeMyPassword', () => {
    expect(html).toContain('id="menu-change-password"');
    expect(html).toMatch(/changeMyPassword\(\)/);
    const b = fnBody(html, 'changeMyPassword');
    expect(b).toMatch(/rosterClient\.current/);     // requires a signed-in session
    expect(b).toMatch(/openPwChangeModal\(true\)/); // opens the modal in voluntary mode
  });

  it('openPwChangeModal voluntary mode shows Cancel + generic copy; forced keeps Sign Out', () => {
    const d = makeDeskTR2({ rosterClient: { current: () => ({ username: 'u', mustChangePassword: false }) } });
    d.api.openPwChangeModal(true);                  // voluntary
    expect(d.el('pwchange-leftbtn').textContent).toBe('Cancel');
    expect(d.el('pwchange-title').textContent).toBe('Change Your Password');
    expect(d.el('pwchange-overlay').style.display).toBe('flex');
    d.api.openPwChangeModal();                      // forced (default)
    expect(d.el('pwchange-leftbtn').textContent).toBe('Sign Out');
    expect(d.el('pwchange-title').textContent).toBe('Set Your Password');
  });
});

/** Sandbox loading submitSignIn + the TR2 helpers with injectable fakes. */
function makeDeskTR2({ rosterClient } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, { id, value: '', textContent: '', disabled: false,
                    style: { display: 'none' }, focus() {} });
    }
    return els.get(id);
  }
  const calls = { showDialog: [], closeSignInModal: 0, registerStudent: [],
                  updateStudentMenu: 0, signOut: 0, reload: 0 };
  const sandbox = {
    document: { getElementById: id => el(id) },
    localStorage,
    window: { rosterClient: rosterClient || undefined },
    setTimeout: fn => fn(),
    MacSFX: { play() {} },
    location: { reload: () => { calls.reload++; } },
    registerStudent: x => { calls.registerStudent.push(x); },
    updateStudentMenu: () => { calls.updateStudentMenu++; },
    closeSignInModal: () => { calls.closeSignInModal++; },
    showDialog: (...a) => { calls.showDialog.push(a); },
  };
  createContext(sandbox);
  const src = ['submitSignIn', 'signOutStudent', 'openPwChangeModal',
               'closePwChangeModal', 'maybeForcePasswordChange', 'submitPwChange']
    .map(n => fnBody(html, n)).join('\n');
  runInContext(src + '\nthis.__api = { submitSignIn, signOutStudent, openPwChangeModal, '
    + 'closePwChangeModal, maybeForcePasswordChange, submitPwChange };', sandbox);
  return { api: sandbox.__api, el, store, calls };
}

describe('TR2 runtime — forced change-password flow', () => {
  it('sign-in with mustChangePassword opens the pw modal and does NOT show the welcome yet', async () => {
    const d = makeDeskTR2({
      rosterClient: {
        signIn: async () => ({ ok: true, mustChangePassword: true }),
        current: () => ({ username: 'coconut_shark', realName: 'Pat Q', mustChangePassword: true }),
      },
    });
    d.el('signin-username').value = 'coconut_shark';
    d.el('signin-password').value = 'temp-pass';

    await d.api.submitSignIn();

    expect(d.el('pwchange-overlay').style.display).toBe('flex');
    expect(d.calls.showDialog.length).toBe(0); // welcome deferred until pw set
    expect(d.calls.closeSignInModal).toBe(1);
  });

  it('sign-in WITHOUT mustChangePassword shows the welcome and never opens the pw modal', async () => {
    const d = makeDeskTR2({
      rosterClient: {
        signIn: async () => ({ ok: true, mustChangePassword: false }),
        current: () => ({ username: 'coconut_shark', realName: 'Pat Q' }),
      },
    });
    d.el('signin-username').value = 'coconut_shark';
    d.el('signin-password').value = 'good-pass';

    await d.api.submitSignIn();

    expect(d.el('pwchange-overlay').style.display).toBe('none');
    expect(d.calls.showDialog.length).toBe(1);
  });

  it('submitPwChange rejects mismatch and short passwords without calling the client', async () => {
    let called = 0;
    const d = makeDeskTR2({
      rosterClient: { changePassword: async () => { called++; return { ok: true }; },
                      current: () => ({ username: 'u' }) },
    });

    d.el('pwchange-new').value = 'abc';            // too short
    d.el('pwchange-confirm').value = 'abc';
    await d.api.submitPwChange();
    expect(d.el('pwchange-error').textContent).toMatch(/6 characters/);

    d.el('pwchange-new').value = 'longenough';     // mismatch
    d.el('pwchange-confirm').value = 'different1';
    await d.api.submitPwChange();
    expect(d.el('pwchange-error').textContent).toMatch(/do not match/);

    expect(called).toBe(0);
  });

  it('submitPwChange happy path: calls changePassword, closes modal, shows confirmation', async () => {
    let arg = null;
    const d = makeDeskTR2({
      rosterClient: {
        changePassword: async (pw) => { arg = pw; return { ok: true }; },
        current: () => ({ username: 'coconut_shark', realName: 'Pat Q' }),
      },
    });
    d.el('pwchange-overlay').style.display = 'flex';
    d.el('pwchange-new').value = 'brand-new-pw';
    d.el('pwchange-confirm').value = 'brand-new-pw';

    await d.api.submitPwChange();

    expect(arg).toBe('brand-new-pw');
    expect(d.el('pwchange-overlay').style.display).toBe('none');
    expect(d.calls.showDialog.length).toBe(1);
    expect(JSON.stringify(d.calls.showDialog[0])).toContain('Password set');
  });

  it('submitPwChange surfaces a server error and keeps the modal open', async () => {
    const d = makeDeskTR2({
      rosterClient: {
        changePassword: async () => ({ ok: false, error: 'newPassword must be at least 6 characters' }),
        current: () => ({ username: 'u' }),
      },
    });
    d.el('pwchange-overlay').style.display = 'flex';
    d.el('pwchange-new').value = 'longenough';
    d.el('pwchange-confirm').value = 'longenough';

    await d.api.submitPwChange();

    expect(d.el('pwchange-error').textContent).toContain('at least 6');
    expect(d.el('pwchange-overlay').style.display).toBe('flex');
    expect(d.calls.showDialog.length).toBe(0);
  });

  it('maybeForcePasswordChange opens the modal only when current().mustChangePassword', () => {
    const yes = makeDeskTR2({ rosterClient: { current: () => ({ mustChangePassword: true }) } });
    expect(yes.api.maybeForcePasswordChange()).toBe(true);
    expect(yes.el('pwchange-overlay').style.display).toBe('flex');

    const no = makeDeskTR2({ rosterClient: { current: () => ({ mustChangePassword: false }) } });
    expect(no.api.maybeForcePasswordChange()).toBe(false);
    expect(no.el('pwchange-overlay').style.display).toBe('none');

    const off = makeDeskTR2({ rosterClient: undefined });
    expect(() => off.api.maybeForcePasswordChange()).not.toThrow();
    expect(off.api.maybeForcePasswordChange()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. TR2 acceptance gate — a must-change student reaches NO Desk feature
//    (regression for the Codex MAJOR: renderDoNow ran before/around the gate)
// ─────────────────────────────────────────────────────────────────────────────

describe('TR2 — renderDoNow self-gates on mustChangePassword (static)', () => {
  it('the mustChangePassword check comes before any /donow fetch', () => {
    const b = fnBody(html, 'renderDoNow');
    const gateAt = b.indexOf('mustChangePassword');
    const fetchAt = b.indexOf('fetch(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(fetchAt);          // gate first, fetch never reached for must-change
  });

  it('init runs the force gate before renderDoNow()', () => {
    const i = html.indexOf("maybeForcePasswordChange(); // TR2 — gate BEFORE any feature render");
    const r = html.indexOf('renderDoNow();\n}');
    expect(i).toBeGreaterThan(-1);
    expect(r).toBeGreaterThan(-1);
    expect(i).toBeLessThan(r);
  });

  it('the visibilitychange listener routes through renderDoNow (so it is also gated)', () => {
    expect(html).toMatch(/visibilitychange['"]\s*,\s*function[^}]*renderDoNow\(\)/s);
  });
});

/** Harness that runs the real renderDoNow + the TR2 helpers with a fetch spy. */
function makeDeskDoNow({ rosterClient } = {}) {
  const els = new Map();
  function el(id) {
    if (!els.has(id)) {
      els.set(id, { id, value: '', textContent: '', className: '',
                    style: { display: 'none' }, disabled: false, focus() {} });
    }
    return els.get(id);
  }
  const calls = { fetch: 0 };
  const sandbox = {
    document: { getElementById: id => el(id) },
    window: { rosterClient: rosterClient || undefined, ROSTER_SERVICE_URL: 'https://svc.test' },
    fetch: (...a) => { calls.fetch++; return Promise.reject(new Error('fetch must NOT run for a must-change user')); },
    setTimeout: fn => fn(),
  };
  createContext(sandbox);
  const src = ['openPwChangeModal', 'closePwChangeModal', 'maybeForcePasswordChange', 'renderDoNow']
    .map(n => fnBody(html, n)).join('\n');
  runInContext(src + '\nthis.__api = { renderDoNow, maybeForcePasswordChange };', sandbox);
  return { api: sandbox.__api, el, calls };
}

describe('TR2 runtime — renderDoNow gating', () => {
  it('must-change session: no /donow fetch, shows the lock message, opens the forced modal', async () => {
    const d = makeDeskDoNow({
      rosterClient: {
        current: () => ({ username: 'u', mustChangePassword: true }),
        token: () => 'sess.tok',           // token present — must STILL be gated
      },
    });

    await d.api.renderDoNow();

    expect(d.calls.fetch).toBe(0);
    expect(d.el('donow-msg').textContent).toMatch(/set your password/i);
    expect(d.el('pwchange-overlay').style.display).toBe('flex');
  });

  it('returning must-change session (no explicit sign-in this load) is still gated on render', async () => {
    const d = makeDeskDoNow({
      rosterClient: { current: () => ({ mustChangePassword: true }), token: () => null },
    });
    await d.api.renderDoNow();
    expect(d.calls.fetch).toBe(0);
    expect(d.el('pwchange-overlay').style.display).toBe('flex');
  });

  it('not signed in: gate is skipped, no modal, no fetch (sign-in nudge path intact)', async () => {
    const d = makeDeskDoNow({ rosterClient: { current: () => null, token: () => null } });
    await d.api.renderDoNow();
    expect(d.calls.fetch).toBe(0);
    expect(d.el('pwchange-overlay').style.display).toBe('none');
    expect(d.el('donow-msg').textContent).toMatch(/sign in/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in dropdown fix -- pre-sign-in roster union + bail-on-empty
// ─────────────────────────────────────────────────────────────────────────────
//
// Before sign-in the student's period is unknown, so both roster pickers must
// merge PeriodB + PeriodE + parked PeriodX. Per-period callers continue using
// _fetchPeriodRoster; the sign-in dropdown still stays closed on an empty union.

describe('sign-in dropdown -- roster union + bail-on-empty', () => {
  it('exposes a _fetchSectionRoster helper (single-section fetch) for reuse', () => {
    // (section) or (section, opts) -- opts.fresh lets the name finder bypass the cache.
    expect(html).toMatch(/async\s+function\s+_fetchSectionRoster\s*\(\s*section\b/);
  });

  it('_fetchPeriodRoster falls back to PeriodX when the primary section is empty', () => {
    // Two anchors -- the fallback call + the no-double-fetch guard.
    expect(html).toMatch(/if\s*\(\s*primarySection\s*!==\s*['"]PeriodX['"]\s*\)/);
    expect(html).toMatch(/_fetchSectionRoster\(\s*['"]PeriodX['"]/);  // may carry an opts arg
  });

  it('the sign-in name finder fetches a FRESH B/E/X union', () => {
    const body = fnBody(html, 'openNameFinder');
    for (const section of ['PeriodC', 'PeriodD', 'PeriodG']) expect(body).toContain(`'${section}'`);
    expect(body).toMatch(/_fetchSectionRoster\(\s*section\s*,\s*\{\s*fresh:\s*true\s*\}/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);
    expect(body).toMatch(/localeCompare/);
    expect(html).toMatch(/cache:\s*['"]no-store['"]/);
    expect(html).toMatch(/if\s*\(\s*!fresh\s*\)/);  // cache read guarded by !fresh
  });

  it('_openRosterDropdown merges B/E/X, dedupes, sorts, and bails on empty', () => {
    const body = fnBody(html, '_openRosterDropdown');
    for (const section of ['PeriodC', 'PeriodD', 'PeriodG']) expect(body).toContain(`'${section}'`);
    expect(body).toMatch(/_fetchSectionRoster\(\s*section\s*\)/);
    expect(body).toMatch(/toLowerCase\s*\(\s*\)/);
    expect(body).toMatch(/localeCompare/);
    expect(body).toMatch(/if\s*\(\s*_rosterDropdownData\.length\s*===\s*0\s*\)\s*\{\s*_closeRosterDropdown\(\s*\);\s*return/);
  });
});
