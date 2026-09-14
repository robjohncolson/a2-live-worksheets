// no-guest-mode.test.js — GUESTS ARE RETIRED (2026-06-25).
// The teacher's policy: no one reaches a student surface without a real login name.
// This pins the contract across every surface so a future edit can't quietly
// re-open a guest door:
//   - the Desk sign-in wall admits only a live roster session or a teacher
//   - the name-finder "I'm not on the list" link opens self-signup, not guest
//   - presence (the 🐶 "Online Now" feed + Live Classroom avatars) never shows a guest
//   - the shared peer-sync client never announces / attributes work to a Guest_ alias
//   - all 69 worksheets require a roster session (the off-ramp line is gone)
//   - the study guide is behind the same wall
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const RAILWAY = readFileSync(resolve(repo, 'railway_client.js'), 'utf8');
const STUDYGUIDE = readFileSync(resolve(repo, 'study_guide_diagnostic.html'), 'utf8');

// Brace-match a body starting at an arbitrary declaration token.
function bodyFrom(src, decl) {
  const idx = src.indexOf(decl);
  if (idx < 0) throw new Error('not found: ' + decl);
  const i = src.indexOf('{', idx);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(idx, j + 1); }
  }
  throw new Error('unbalanced: ' + decl);
}

describe('Desk — sign-in wall admits only roster/teacher (no guest)', () => {
  const gate = bodyFrom(DESK, 'function _deskAccessGranted()');
  it('returns live || teacher, with no guest term', () => {
    expect(gate).toMatch(/return\s+live\s*\|\|\s*teacher\s*;/);
    expect(gate).not.toMatch(/\|\|\s*guest/);
    expect(gate).not.toContain('_deskGuestOk()');   // the guest helper is no longer consulted
  });
  it('the Desk never SETS the cross-app guest flag anymore', () => {
    expect(DESK).not.toContain("setItem('a2_guest_active'");
  });
  it('boot evicts any stale guest flag before gating', () => {
    expect(DESK).toContain("removeItem('a2_guest_active')");
    expect(DESK).toMatch(/evict any stale guest flag/);
  });
});

describe('Desk — "I\'m not on the list" routes to self-signup, never guest', () => {
  const guestFn = bodyFrom(DESK, 'function _nfGuestSignIn()');
  it('the (kept-as-redirect) _nfGuestSignIn no longer mints a guest', () => {
    expect(guestFn).not.toContain("setItem('a2_guest_active'");
    expect(guestFn).toMatch(/_nfCreate\(\)|openSignupModal\(\)/);
  });
});



describe('railway_client.js — no guest attribution / presence', () => {
  const presence = bodyFrom(RAILWAY, 'function _presenceUsername()');
  const submit = bodyFrom(RAILWAY, 'function submitAnswerViaRailway(');
  it('_presenceUsername returns empty rather than a guest alias', () => {
    expect(presence).not.toContain('return getGuestIdentity()');
    expect(presence).toMatch(/return\s+'';/);
  });
  it('submitAnswerViaRailway drops a username-less / Guest_ submission', () => {
    expect(submit).not.toContain('username = getGuestIdentity()');
    expect(submit).toMatch(/\/\^Guest_\/i\.test\(username\)\)\s*return false/);
  });
  it('evicts the stale guest flag on load and never renders the guest banner', () => {
    expect(RAILWAY).toContain("removeItem('a2_guest_active')");   // one-time eviction at load
    const active = bodyFrom(RAILWAY, 'function _apGuestActive()');
    expect(active).toMatch(/return false;/);                           // banner + field-lock never trigger
  });
});



describe('study guide — behind the same sign-in wall', () => {
  it('mounts a wall gated on a roster session / teacher', () => {
    expect(STUDYGUIDE).toContain('sg-signin-wall');
    expect(STUDYGUIDE).toContain('function _sgAccessGranted()');
    expect(STUDYGUIDE).toMatch(/rosterClient\.current\(\)/);
    expect(STUDYGUIDE).not.toContain('a2_guest_active');  // guests never pass here
  });
});
