/**
 * Tests for roster-client.js (Workstream C — Gradebook Phase 0)
 *
 * Coverage per build doc §4:
 * - current() null when key absent / parsed when present / never throws
 * - signIn() mocks fetch → persists key on ok; studentId() returns the uuid
 * - enroll() sends x-teacher-secret header; does NOT persist a session
 * - signOut() removes the key
 * - No password/secret literals in roster-client.js or roster_config.js
 * - Cross-host identity test (§7.4): same a2_roster.v1 → identical studentId across 3 instances
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

// ─── load source files as text (for the literal-scan assertion) ───────────────

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CLIENT_SRC = readFileSync(resolve(REPO_ROOT, 'roster-client.js'), 'utf8');
const CONFIG_SRC = readFileSync(resolve(REPO_ROOT, 'roster_config.js'), 'utf8');

// ─── helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'a2_roster.v1';

/**
 * Boot a fresh jsdom window with roster_config.js + roster-client.js evaluated.
 * Returns the window, its localStorage handle, and window.rosterClient.
 *
 * Uses vm.createContext(win) so that bare `window` identifiers in the source
 * resolve to the jsdom window object (jsdom's own Function constructor does
 * not expose `window` as a bare name, but vm does when the context IS the win).
 */
function makeWindow(overrideServiceUrl, originUrl = 'https://example.com', sharedStorage) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: originUrl   // jsdom requires a url for localStorage to work
  });
  const win = dom.window;

  if (sharedStorage) {
    Object.defineProperty(win, 'localStorage', {
      value: sharedStorage,
      configurable: true
    });
  }

  // Inject optional override before running the client
  if (overrideServiceUrl) {
    win.ROSTER_SERVICE_URL = overrideServiceUrl;
  }

  // Evaluate source in a vm context where win IS the global object.
  // This makes bare `window` resolve correctly.
  const ctx = createContext(win);
  const configCode = readFileSync(resolve(REPO_ROOT, 'roster_config.js'), 'utf8');
  const clientCode = readFileSync(resolve(REPO_ROOT, 'roster-client.js'), 'utf8');
  runInContext(configCode, ctx);
  runInContext(clientCode, ctx);

  return {
    win,
    localStorage: win.localStorage,
    rosterClient: win.rosterClient
  };
}

function makeTeacherSecret() {
  return `teacher-${randomBytes(12).toString('hex')}`;
}

function createSharedStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index) {
      return [...data.keys()][index] || null;
    },
    get length() {
      return data.size;
    }
  };
}

/**
 * Build a minimal mock fetch that resolves with a JSON body.
 * win.fetch is replaced so the client's fetch calls go here.
 */
function mockFetch(win, responseBody, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody
  });
  win.fetch = fn;
  // The client code runs in a function scope where `fetch` is not shadowed;
  // it uses the global `fetch`. In jsdom the global IS window.fetch.
  return fn;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('roster-client.js — current()', () => {
  it('returns null when a2_roster.v1 is absent', () => {
    const { rosterClient } = makeWindow('https://mock-service.test');
    expect(rosterClient.current()).toBeNull();
  });

  it('returns the parsed session when the key is present', () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    const session = {
      studentId: 'abc-123',
      username: 'mango_fox',
      realName: 'Jane Smith',
      section: 'SUMMER26',
      token: 'tok.sig',
      signedInAt: '2026-05-17T00:00:00.000Z'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    const current = rosterClient.current();
    expect(current).not.toBeNull();
    expect(current.studentId).toBe('abc-123');
    expect(current.username).toBe('mango_fox');
    expect(current.realName).toBe('Jane Smith');
    expect(current.section).toBe('SUMMER26');
  });

  it('returns null (does not throw) when the stored JSON is corrupt', () => {
    const { localStorage, rosterClient } = makeWindow('https://mock-service.test');
    localStorage.setItem(STORAGE_KEY, 'NOT VALID JSON {{{');
    expect(() => rosterClient.current()).not.toThrow();
    expect(rosterClient.current()).toBeNull();
  });

  it('never throws even when localStorage.getItem throws', () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    // Override getItem on the object so it throws
    const orig = win.localStorage.getItem;
    win.localStorage.getItem = () => { throw new Error('blocked by browser'); };
    // current() must swallow the error and return null
    expect(() => rosterClient.current()).not.toThrow();
    expect(rosterClient.current()).toBeNull();
    // Restore
    win.localStorage.getItem = orig;
  });
});

describe('roster-client.js — signIn()', () => {
  it('POSTs to /roster/verify and persists the session on ok:true', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');

    const fetchFn = mockFetch(win, {
      ok: true,
      studentId: 'uuid-001',
      username: 'mango_fox',
      realName: 'Jane Smith',
      section: 'SUMMER26',
      token: 'signed.token'
    });

    const result = await rosterClient.signIn('mango_fox', 'hunter2');

    // Returned shape
    expect(result.ok).toBe(true);
    expect(result.studentId).toBe('uuid-001');
    expect(result.realName).toBe('Jane Smith');
    expect(result.section).toBe('SUMMER26');

    // Persisted key
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored).not.toBeNull();
    expect(stored.studentId).toBe('uuid-001');
    expect(stored.token).toBe('signed.token');

    // Fetch called to correct URL
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/roster/verify');
  });

  it('studentId() returns the uuid after a successful signIn', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true,
      studentId: 'uuid-999',
      username: 'apple_deer',
      realName: 'Bob Jones',
      section: 'SUMMER26',
      token: 'tok'
    });

    await rosterClient.signIn('apple_deer', 'pass');
    expect(rosterClient.studentId()).toBe('uuid-999');
  });

  it('does NOT persist session on ok:false', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, { ok: false, error: 'Invalid username or password' }, { ok: false, status: 401 });

    const result = await rosterClient.signIn('nobody', 'wrong');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns ok:false and does not throw on network error', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await rosterClient.signIn('foo', 'bar');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('reads ROSTER_SERVICE_URL at call time (not module load)', async () => {
    // Start with one URL, override before calling signIn
    const { win, rosterClient } = makeWindow('https://initial-service.test');
    win.ROSTER_SERVICE_URL = 'https://overridden-service.test';

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, studentId: 'x', username: 'u', realName: 'R', section: 'S', token: 't' })
    });
    win.fetch = fetchFn;

    await rosterClient.signIn('u', 'p');

    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain('https://overridden-service.test');
  });
});

describe('roster-client.js — enroll()', () => {
  it('sends x-teacher-secret header', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, {
      ok: true,
      studentId: 'uuid-enroll',
      username: 'lime_bear'
    });
    const teacherSecret = makeTeacherSecret();

    await rosterClient.enroll({
      realName: 'Alice Test',
      section: 'SUMMER26',
      password: 'secret',
      teacherSecret
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, options] = fetchFn.mock.calls[0];
    expect(options.headers['x-teacher-secret']).toBe(teacherSecret);
  });

  it('POSTs to /roster/enroll', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, { ok: true, studentId: 'u1', username: 'kiwi_wolf' });
    const teacherSecret = makeTeacherSecret();

    await rosterClient.enroll({
      realName: 'Bob Enroll',
      section: 'SUMMER26',
      password: 'pw',
      teacherSecret
    });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/roster/enroll');
  });

  it('does NOT persist a session after enroll (enroll != sign-in)', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, { ok: true, studentId: 'u2', username: 'pear_elk' });
    const teacherSecret = makeTeacherSecret();

    await rosterClient.enroll({
      realName: 'Carol Enroll',
      section: 'SUMMER26',
      password: 'pw',
      teacherSecret
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns ok:false without throwing on server error', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, { ok: false, error: 'forbidden' }, { ok: false, status: 401 });
    const teacherSecret = makeTeacherSecret();

    const result = await rosterClient.enroll({
      realName: 'D', section: 'S', password: 'p', teacherSecret
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('includes optional email in the request body when provided', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, { ok: true, studentId: 'u3', username: 'fig_cat' });
    const teacherSecret = makeTeacherSecret();

    await rosterClient.enroll({
      realName: 'Eve Email',
      section: 'SUMMER26',
      password: 'pw',
      teacherSecret,
      email: 'eve@school.edu'
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.email).toBe('eve@school.edu');
  });

  it('omits email from the request body when not provided', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, { ok: true, studentId: 'u4', username: 'fig_dog' });
    const teacherSecret = makeTeacherSecret();

    await rosterClient.enroll({
      realName: 'Frank No-Email',
      section: 'SUMMER26',
      password: 'pw',
      teacherSecret
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.email).toBeUndefined();
  });
});

describe('roster-client.js — signOut()', () => {
  it('removes the localStorage key', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');

    // Sign in first
    mockFetch(win, {
      ok: true, studentId: 'u-so', username: 'plum_bear',
      realName: 'Sign Out Test', section: 'S', token: 't'
    });
    await rosterClient.signIn('plum_bear', 'pw');

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    rosterClient.signOut();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('current() returns null after signOut', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-so2', username: 'grape_wolf',
      realName: 'SO2', section: 'S2', token: 't2'
    });
    await rosterClient.signIn('grape_wolf', 'pw');
    expect(rosterClient.current()).not.toBeNull();

    rosterClient.signOut();
    expect(rosterClient.current()).toBeNull();
  });

  it('does not throw when called when already signed out', () => {
    const { rosterClient } = makeWindow('https://mock-service.test');
    expect(() => rosterClient.signOut()).not.toThrow();
  });
});

describe('roster-client.js — token()', () => {
  it('returns null when not signed in', () => {
    const { rosterClient } = makeWindow('https://mock-service.test');
    expect(rosterClient.token()).toBeNull();
  });

  it('returns the token after sign-in', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-tok', username: 'cherry_hawk',
      realName: 'Tok Test', section: 'S', token: 'the.actual.token'
    });
    await rosterClient.signIn('cherry_hawk', 'pw');
    expect(rosterClient.token()).toBe('the.actual.token');
  });
});

// ─── security: no secret/password literals in client source files ─────────────

describe('Security: no secret or password literals in client source files', () => {
  it('roster-client.js contains no hardcoded password literals', () => {
    // Must not contain typical plaintext password patterns
    expect(CLIENT_SRC).not.toMatch(/password\s*=\s*["'][^"']{3,}/);
    expect(CLIENT_SRC).not.toMatch(/secret\s*=\s*["'][^"']{3,}/);
  });

  it('roster_config.js contains no hardcoded password or secret literals', () => {
    expect(CONFIG_SRC).not.toMatch(/password\s*=\s*["'][^"']{3,}/);
    expect(CONFIG_SRC).not.toMatch(/secret\s*=\s*["'][^"']{3,}/);
  });

  it('roster-client.js contains no Supabase service-role key pattern', () => {
    // Supabase service keys start with "eyJ" (base64-encoded JSON)
    expect(CLIENT_SRC).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('roster-client.js has no import/require statements (pure browser JS)', () => {
    expect(CLIENT_SRC).not.toMatch(/^\s*import\s+/m);
    expect(CLIENT_SRC).not.toMatch(/require\s*\(/);
  });

  it('roster-client.js does not embed the default service URL literal', () => {
    expect(CLIENT_SRC).not.toContain('apstats-roster-production.up.railway.app');
  });
});

// ─── cross-host identity test (acceptance criterion §7.4) ────────────────────
//
// "A student enrolled once can be resolved to the same student_id from the
// roadmap, a worksheet, and the study guide."
//
// Real-world mechanism: all apps share ONE browser's localStorage.  Any page
// (regardless of which HTML file loaded it) that reads `a2_roster.v1`
// gets the same data as every other page at the same origin.
//
// jsdom creates isolated storage per JSDOM instance. To prove the identity
// contract we spin up THREE separate jsdom windows (roadmap, worksheet,
// study guide) and replace each window's localStorage with the same shared
// in-memory storage object. That models three separate page contexts in the
// same browser reading the same canonical key.
//
// The test asserts: write the key once → three independently-loaded
// rosterClient instances all return the identical studentId.

describe('Cross-host identity (acceptance criterion §7.4)', () => {
  it('three separate page contexts share the same studentId via one shared storage key', () => {
    const sharedStorage = createSharedStorage();

    const roadmap = makeWindow(
      'https://mock-service.test',
      'https://a2-app.example.com/roadmap.html',
      sharedStorage
    );
    const worksheet = makeWindow(
      'https://mock-service.test',
      'https://a2-app.example.com/worksheet.html',
      sharedStorage
    );
    const studyGuide = makeWindow(
      'https://mock-service.test',
      'https://a2-app.example.com/study-guide.html',
      sharedStorage
    );

    // "Roadmap page" writes the session (e.g. after sign-in)
    const session = {
      studentId: 'canonical-uuid-42',
      username: 'fig_crane',
      realName: 'Cross Host Student',
      section: 'SUMMER26',
      token: 'signed.tok',
      signedInAt: '2026-05-17T00:00:00.000Z'
    };
    roadmap.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    expect(roadmap.rosterClient.current().studentId).toBe('canonical-uuid-42');

    // Separate page contexts read the same underlying key
    const currentWS = worksheet.rosterClient.current();
    expect(currentWS).not.toBeNull();
    expect(currentWS.studentId).toBe('canonical-uuid-42');

    const currentSG = studyGuide.rosterClient.current();
    expect(currentSG).not.toBeNull();
    expect(currentSG.studentId).toBe('canonical-uuid-42');

    // All three agree
    expect(roadmap.rosterClient.current().studentId).toBe(worksheet.rosterClient.current().studentId);
    expect(worksheet.rosterClient.current().studentId).toBe(studyGuide.rosterClient.current().studentId);
  });

  it('studentId() convenience method is identical across three separate page contexts', () => {
    const sharedStorage = createSharedStorage();
    const clients = [
      makeWindow('https://mock-service.test', 'https://a2-app.example.com/roadmap.html', sharedStorage).rosterClient,
      makeWindow('https://mock-service.test', 'https://a2-app.example.com/worksheet.html', sharedStorage).rosterClient,
      makeWindow('https://mock-service.test', 'https://a2-app.example.com/study-guide.html', sharedStorage).rosterClient
    ];

    // Write once via shared localStorage
    sharedStorage.setItem(STORAGE_KEY, JSON.stringify({
      studentId: 'shared-uuid-77',
      username: 'lime_otter',
      realName: 'Shared Student',
      section: 'SUMMER26',
      token: 'tok',
      signedInAt: '2026-05-17T00:00:00.000Z'
    }));

    // All three convenience methods return the same uuid
    const ids = clients.map(c => c.studentId());
    expect(ids[0]).toBe('shared-uuid-77');
    expect(ids[1]).toBe('shared-uuid-77');
    expect(ids[2]).toBe('shared-uuid-77');
  });
});

// ─── TR2: mustChangePassword surfacing + changePassword() ────────────────────

describe('roster-client.js — TR2 mustChangePassword + changePassword()', () => {
  it('signIn surfaces mustChangePassword:true and persists it in the session', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-mc', username: 'mango_fox',
      realName: 'MC', section: 'S', token: 't', mustChangePassword: true
    });

    const result = await rosterClient.signIn('mango_fox', 'temp');
    expect(result.ok).toBe(true);
    expect(result.mustChangePassword).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.mustChangePassword).toBe(true);
    expect(rosterClient.current().mustChangePassword).toBe(true);
  });

  it('signIn defaults mustChangePassword to false when absent', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-nc', username: 'apple_deer',
      realName: 'NC', section: 'S', token: 't'
    });
    const result = await rosterClient.signIn('apple_deer', 'pw');
    expect(result.mustChangePassword).toBe(false);
    expect(rosterClient.current().mustChangePassword).toBe(false);
  });

  it('changePassword returns {ok:false} when not signed in (no token)', async () => {
    const { rosterClient } = makeWindow('https://mock-service.test');
    const r = await rosterClient.changePassword('whatever1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not signed in/i);
  });

  it('POSTs token+newPassword to /roster/change-password and clears the flag on ok', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-cp', username: 'lime_bear',
      realName: 'CP', section: 'S', token: 'sess.tok', mustChangePassword: true
    });
    await rosterClient.signIn('lime_bear', 'temp');
    expect(rosterClient.current().mustChangePassword).toBe(true);

    const fetchFn = mockFetch(win, { ok: true });
    const r = await rosterClient.changePassword('brand-new-pw');

    expect(r.ok).toBe(true);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/roster/change-password');
    const body = JSON.parse(options.body);
    expect(body.token).toBe('sess.tok');
    expect(body.newPassword).toBe('brand-new-pw');
    // session flag cleared, token preserved
    expect(rosterClient.current().mustChangePassword).toBe(false);
    expect(rosterClient.token()).toBe('sess.tok');
  });

  it('changePassword returns the server error and leaves the session unchanged on ok:false', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-er', username: 'fig_cat',
      realName: 'ER', section: 'S', token: 'tok', mustChangePassword: true
    });
    await rosterClient.signIn('fig_cat', 'temp');

    mockFetch(win, { ok: false, error: 'newPassword must be at least 6 characters' }, { ok: false, status: 400 });
    const r = await rosterClient.changePassword('abc');

    expect(r.ok).toBe(false);
    expect(r.error).toContain('at least 6');
    expect(rosterClient.current().mustChangePassword).toBe(true); // unchanged
  });

  it('changePassword returns ok:false (no throw) on network error', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, {
      ok: true, studentId: 'u-ne', username: 'pear_elk',
      realName: 'NE', section: 'S', token: 'tok', mustChangePassword: true
    });
    await rosterClient.signIn('pear_elk', 'temp');

    win.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const r = await rosterClient.changePassword('newpassword');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Network error');
  });
});

describe('roster-client.js — claim() (student self-signup)', () => {
  it('POSTs to /roster/claim and persists the session on ok:true (claim == sign-in)', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, {
      ok: true, studentId: 'uuid-claim', username: 'mango_otter',
      realName: 'Jordan Lee', section: 'PeriodX', token: 'claim.token',
      role: 'student', spriteHue: null, mustChangePassword: false
    });

    const result = await rosterClient.claim({ realName: 'Jordan Lee', section: 'PeriodX', username: 'mango_otter', pin: '1234' });

    expect(result.ok).toBe(true);
    expect(result.username).toBe('mango_otter');
    expect(result.section).toBe('PeriodX');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.studentId).toBe('uuid-claim');
    expect(stored.token).toBe('claim.token');
    expect(stored.mustChangePassword).toBe(false);
    expect(rosterClient.studentId()).toBe('uuid-claim');

    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/roster/claim');
    expect(JSON.parse(opts.body)).toEqual({ realName: 'Jordan Lee', section: 'PeriodX', username: 'mango_otter', pin: '1234' });
  });

  it('surfaces username-taken as a code and does NOT persist a session', async () => {
    const { win, localStorage, rosterClient } = makeWindow('https://mock-service.test');
    mockFetch(win, { ok: false, error: 'username-taken' }, { ok: false, status: 409 });

    const result = await rosterClient.claim({ realName: 'X', section: 'PeriodX', username: 'taken_name', pin: '1111' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('username-taken');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns ok:false (no throw) on a network error', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const r = await rosterClient.claim({ realName: 'X', section: 'PeriodX', username: 'foo_bar', pin: '1234' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Network error');
  });
});

describe('roster-client.js — openSections()', () => {
  it('GETs /roster/open-sections and returns the sections array', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    const fetchFn = mockFetch(win, { ok: true, sections: [{ value: 'PeriodX', label: 'Period X' }] });
    const sections = await rosterClient.openSections();
    expect(sections).toEqual([{ value: 'PeriodX', label: 'Period X' }]);
    expect(fetchFn.mock.calls[0][0]).toBe('https://mock-service.test/roster/open-sections');
  });

  it('returns [] (no throw) on a network error or bad payload', async () => {
    const { win, rosterClient } = makeWindow('https://mock-service.test');
    win.fetch = vi.fn().mockRejectedValue(new Error('down'));
    expect(await rosterClient.openSections()).toEqual([]);

    mockFetch(win, { ok: false });
    expect(await rosterClient.openSections()).toEqual([]);
  });
});
