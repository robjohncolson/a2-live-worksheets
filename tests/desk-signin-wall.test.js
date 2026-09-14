// desk-signin-wall.test.js — NO guest mode on the Desk. The sign-in modal
// auto-opens on load when nobody is signed in and is non-dismissable
// (Cancel hidden, outside-click no-op) until a successful sign-in. Teachers
// pass it via teacher sign-in. The wall fails OPEN (a bug never hard-locks).
//
// Static parse of the Desk HTML + a real-execution smoke test of
// _deskAccessGranted (SIGNIN_WALL_BUILD.md §2/§5).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk: no-guest-mode sign-in wall', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: _deskAccessGranted gates on the live roster session and fails OPEN', () => {
    expect(DESK).toMatch(/function\s+_deskAccessGranted\s*\(/);
    const body = fnBody(DESK, '_deskAccessGranted');
    // Gates on the LIVE roster session (not the legacy localStorage key) so a
    // cleared session re-walls the Desk instead of leaving a zombie.
    expect(body).toMatch(/rosterClient\.current\s*\(/);
    expect(body).toMatch(/_deskIsTeacher\s*\(/);
    // catch returns true — a broken check must never hard-lock the Desk.
    expect(body).toMatch(/catch\s*\(_\)\s*\{\s*return true;\s*\}/);
  });

  it('02: _signinWallActive flag is declared', () => {
    expect(DESK).toMatch(/var\s+_signinWallActive\s*=\s*false/);
  });

  it('03: the Cancel button carries id="signin-cancel-btn"', () => {
    expect(DESK).toMatch(/id="signin-cancel-btn"[^>]*onclick="closeSignInModal\(\)"/);
  });

  it('04: openSignInModal sets the wall flag + toggles the Cancel button', () => {
    const body = fnBody(DESK, 'openSignInModal');
    expect(body).toMatch(/_signinWallActive\s*=/);
    expect(body).toMatch(/!_deskAccessGranted\s*\(\s*\)/);
    // typeof-guarded so the desk-roster-signin vm-test sandbox keeps passing.
    expect(body).toMatch(/typeof\s+_deskAccessGranted\s*===\s*'function'/);
    expect(body).toMatch(/signin-cancel-btn/);
    // Cancel is hidden ('none') when the wall is mandatory.
    expect(body).toMatch(/_signinWallActive\s*\?\s*['"]none['"]/);
  });

  it('05: closeSignInModal refuses to dismiss while the wall is up + not signed in', () => {
    const body = fnBody(DESK, 'closeSignInModal');
    // typeof-guarded form: _signinWallActive && typeof guard && !granted → return.
    expect(body).toMatch(/_signinWallActive\s*&&\s*typeof\s+_deskAccessGranted\s*===\s*'function'\s*&&\s*!_deskAccessGranted\s*\(\s*\)\s*\)\s*return/);
  });

  it('06: the boot splash dismissal opens the wall when not signed in (signup for a new device, sign-in for a returning one)', () => {
    // After the boot-overlay click-to-start is dismissed, the wall opens.
    // Still gated on !_deskAccessGranted(); a first-time device (no sign-in
    // history) gets the signup modal, a returning-but-signed-out device gets
    // the sign-in modal.
    expect(DESK).toMatch(/if\s*\(\s*!_deskAccessGranted\(\)\s*\)\s*\{/);
    expect(DESK).toMatch(/_firstTime && typeof openSignupModal === 'function'\) openSignupModal\(\)/);
    expect(DESK).toMatch(/else openSignInModal\(\)/);
  });

  // ── _deskAccessGranted real-execution smoke tests ─────────────────────────
  // Gates on the LIVE roster session (rosterClient.current()), not the legacy
  // localStorage key, so a cleared session (e.g. cr sign-out) re-pops the wall.
  function makeAccessGranted({ signedIn = false, teacher = false, throwIt = false } = {}) {
    const src = fnBody(DESK, '_deskAccessGranted');
    const window = { rosterClient: { current: () => { if (throwIt) throw new Error('boom'); return signedIn ? { studentId: 'sid' } : null; } } };
    const _deskIsTeacher = () => teacher;
    // eslint-disable-next-line no-new-func
    return new Function('window', '_deskIsTeacher', 'return (' + src + ');')(window, _deskIsTeacher);
  }

  it('07: _deskAccessGranted — live roster session → granted', () => {
    expect(makeAccessGranted({ signedIn: true })()).toBe(true);
  });

  it('08: _deskAccessGranted — teacher → granted', () => {
    expect(makeAccessGranted({ signedIn: false, teacher: true })()).toBe(true);
  });

  it('09: _deskAccessGranted — no live session and not a teacher → NOT granted (zombie re-walls)', () => {
    expect(makeAccessGranted({ signedIn: false, teacher: false })()).toBe(false);
  });

  it('10: _deskAccessGranted — a thrown error fails OPEN (granted)', () => {
    expect(makeAccessGranted({ throwIt: true })()).toBe(true);
  });
});
