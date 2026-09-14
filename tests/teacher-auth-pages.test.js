// teacher-auth-pages.test.js -- WI-4d structure pins.
// Verifies that teacher-dashboard.html and teacher-roster-console.html:
//   (a) load roster-client.js as a sibling script
//   (b) each request helper adds Authorization: Bearer from rosterClient.token()
//   (c) x-teacher-secret path is still present (fallback intact)
//   (d) show a session-status line in the Connection section
//
// Static parse only -- no network, no DOM execution.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  const full = resolve(repo, p);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
};

const DASH = read('teacher-dashboard.html');
const CON  = read('teacher-roster-console.html');

// -- teacher-dashboard.html --------------------------------------------------

describe('teacher-dashboard.html -- WI-4 structure pins', () => {
  it('00: file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist').toBeTypeOf('string');
  });

  it('WI-4a: loads roster-client.js as a sibling script', () => {
    expect(DASH).toMatch(/<script\s+src=["']roster-client\.js["']>/i);
  });

  it('WI-4a: roster-client.js is loaded after roster_config.js', () => {
    const configIdx = DASH.indexOf('src="roster_config.js"');
    const clientIdx = DASH.indexOf('src="roster-client.js"');
    expect(configIdx).toBeGreaterThan(0);
    expect(clientIdx).toBeGreaterThan(configIdx);
  });

  it('WI-4b: fetchJson adds Authorization: Bearer from rosterClient.token()', () => {
    // Find fetchJson function body.
    const fetchIdx = DASH.indexOf('async function fetchJson(');
    expect(fetchIdx).toBeGreaterThan(0);
    // There must be rosterClient.token() usage followed by Authorization Bearer construction.
    const chunk = DASH.slice(fetchIdx, fetchIdx + 1200);
    expect(chunk).toMatch(/rosterClient\.token\(\)/);
    expect(chunk).toMatch(/Authorization/);
    expect(chunk).toMatch(/Bearer/);
  });

  it('WI-4b: postJson also adds Authorization: Bearer from rosterClient.token()', () => {
    const postIdx = DASH.indexOf('async function postJson(');
    expect(postIdx).toBeGreaterThan(0);
    const chunk = DASH.slice(postIdx, postIdx + 1200);
    expect(chunk).toMatch(/rosterClient\.token\(\)/);
    expect(chunk).toMatch(/Authorization/);
    expect(chunk).toMatch(/Bearer/);
  });

  it('WI-4b: Authorization header is set conditionally on the token being non-null', () => {
    // Pattern: if (_tok) headers['Authorization'] = ...
    expect(DASH).toMatch(/if\s*\(\s*_tok\s*\)\s*headers\s*\[.Authorization.\]\s*=/);
  });

  it('WI-4c: x-teacher-secret input still present (fallback intact)', () => {
    expect(DASH).toMatch(/id=["']teacher-secret["']/);
    expect(DASH).toMatch(/x-teacher-secret/);
  });

  it('WI-4c: x-teacher-secret is still sent when secret is non-empty', () => {
    // The fetchJson/postJson bodies must send x-teacher-secret when secret is truthy.
    expect(DASH).toMatch(/headers\s*\[.x-teacher-secret.\]\s*=\s*secret/);
  });

  it('WI-4c: session-status element shows hint about the secret being optional', () => {
    expect(DASH).toMatch(/id=["']session-status["']/);
    expect(DASH).toMatch(/optional/i);
  });

  it('WI-4c: renderSessionStatus shows "Signed in as <name> (teacher)" line', () => {
    expect(DASH).toMatch(/Signed in as/);
    expect(DASH).toMatch(/\(teacher\)/);
  });

  it('WI-4c: Remember on this device checkbox stays', () => {
    expect(DASH).toMatch(/id=["']remember-secret["']/);
  });

  it('WI-4d: renderSessionStatus function is defined', () => {
    expect(DASH).toMatch(/function\s+renderSessionStatus\s*\(\s*\)/);
  });

  it('WI-4d: renderSessionStatus is called on page load', () => {
    expect(DASH).toMatch(/renderSessionStatus\s*\(\s*\)/);
  });
});

// -- teacher-roster-console.html ---------------------------------------------

describe('teacher-roster-console.html -- WI-4 structure pins', () => {
  it('00: file exists', () => {
    expect(CON, 'teacher-roster-console.html must exist').toBeTypeOf('string');
  });

  it('WI-4a: loads roster_config.js as a sibling script', () => {
    expect(CON).toMatch(/<script\s+src=["']roster_config\.js["']>/i);
  });

  it('WI-4a: loads roster-client.js as a sibling script', () => {
    expect(CON).toMatch(/<script\s+src=["']roster-client\.js["']>/i);
  });

  it('WI-4a: roster-client.js is loaded after roster_config.js', () => {
    const configIdx = CON.indexOf('src="roster_config.js"');
    const clientIdx = CON.indexOf('src="roster-client.js"');
    expect(configIdx).toBeGreaterThan(0);
    expect(clientIdx).toBeGreaterThan(configIdx);
  });

  it('WI-4b: api() adds Authorization: Bearer from rosterClient.token()', () => {
    const apiIdx = CON.indexOf('async function api(');
    expect(apiIdx).toBeGreaterThan(0);
    const chunk = CON.slice(apiIdx, apiIdx + 1200);
    expect(chunk).toMatch(/rosterClient\.token\(\)/);
    expect(chunk).toMatch(/Authorization/);
    expect(chunk).toMatch(/Bearer/);
  });

  it('WI-4b: Authorization header is set conditionally on the token being non-null', () => {
    // Pattern: if (_tok) headers['Authorization'] = ...
    expect(CON).toMatch(/if\s*\(\s*_tok\s*\)\s*headers\s*\[.Authorization.\]\s*=/);
  });

  it('WI-4c: x-teacher-secret input still present (fallback intact)', () => {
    expect(CON).toMatch(/id=["']teacher-secret["']/);
    expect(CON).toMatch(/x-teacher-secret/);
  });

  it('WI-4c: x-teacher-secret is still sent in api() when secret is non-empty', () => {
    expect(CON).toMatch(/headers\s*\[.x-teacher-secret.\]\s*=\s*secret/);
  });

  it('WI-4c: session-status element shows hint about the secret being optional', () => {
    expect(CON).toMatch(/id=["']session-status["']/);
    expect(CON).toMatch(/optional/i);
  });

  it('WI-4c: renderSessionStatus shows "Signed in as <name> (teacher)" line', () => {
    expect(CON).toMatch(/Signed in as/);
    expect(CON).toMatch(/\(teacher\)/);
  });

  it('WI-4c: Remember on this device checkbox stays', () => {
    expect(CON).toMatch(/id=["']remember-secret["']/);
  });

  it('WI-4d: renderSessionStatus function is defined', () => {
    expect(CON).toMatch(/function\s+renderSessionStatus\s*\(\s*\)/);
  });

  it('WI-4d: renderSessionStatus is called on page load', () => {
    expect(CON).toMatch(/renderSessionStatus\s*\(\s*\)/);
  });
});
