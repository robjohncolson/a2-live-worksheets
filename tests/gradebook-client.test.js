/**
 * Tests for gradebook-client.js (Workstream C â€” Gradebook Sprint 1)
 *
 * Coverage per build doc Â§3 (WS-C expectations):
 * - no-identity â†’ no-op, NO fetch issued
 * - happy path: posts to ${ROSTER_SERVICE_URL}/ledger/record with token in body â†’ { ok:true, ledgerId }
 * - fetch rejects â†’ { ok:false, reason:'network' } and the call does NOT throw
 * - HTTP 500 / server ok:false â†’ { ok:false, reason:'network' }
 * - missing required args (source/itemId/response) â†’ { ok:false, reason:'bad-args' }
 * - reads ROSTER_SERVICE_URL and token at call time (override mid-test)
 * - NO secret literals in gradebook-client.js source
 * - NO 'x-proctor-secret' anywhere in gradebook-client.js source (L-C)
 * - NO import/require statements (pure browser JS)
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

// â”€â”€â”€ load source as text (for literal-scan assertions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const REPO_ROOT    = resolve(import.meta.dirname, '..');
const CLIENT_SRC   = readFileSync(resolve(REPO_ROOT, 'gradebook-client.js'), 'utf8');
const ROSTER_SRC   = readFileSync(resolve(REPO_ROOT, 'roster-client.js'),    'utf8');
const CONFIG_SRC   = readFileSync(resolve(REPO_ROOT, 'roster_config.js'),    'utf8');
const OFFLINE_SRC  = readFileSync(resolve(REPO_ROOT, 'offline-queue.js'),    'utf8');

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STORAGE_KEY = 'a2_roster.v1';

/**
 * Boot a fresh jsdom window with roster_config.js + roster-client.js +
 * gradebook-client.js evaluated.  Returns { win, gradebookClient, rosterClient }.
 *
 * Uses vm.createContext(win) so bare `window` in the source resolves correctly.
 * overrideServiceUrl: if provided, sets win.ROSTER_SERVICE_URL before the scripts run.
 */
function makeWindow(overrideServiceUrl = 'https://mock-service.test') {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://a2-app.example.com'
  });
  const win = dom.window;

  if (overrideServiceUrl !== null) {
    win.ROSTER_SERVICE_URL = overrideServiceUrl;
  }

  const ctx = createContext(win);
  runInContext(CONFIG_SRC,  ctx);
  runInContext(ROSTER_SRC,  ctx);
  runInContext(CLIENT_SRC,  ctx);

  return {
    win,
    rosterClient:    win.rosterClient,
    gradebookClient: win.gradebookClient
  };
}

/**
 * Set up win.localStorage so rosterClient.token() returns the given token.
 */
function setToken(win, token) {
  const session = {
    studentId:   'uuid-test-student',
    username:    'test_user',
    realName:    'Test Student',
    section:     'SUMMER26',
    token:       token,
    signedInAt:  '2026-05-17T00:00:00.000Z'
  };
  win.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Replace win.fetch with a mock that resolves with the given JSON body.
 * Returns the vi.fn() so callers can assert call counts / arguments.
 */
function mockFetch(win, responseBody, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody
  });
  win.fetch = fn;
  return fn;
}

// â”€â”€â”€ tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ 1. No-identity â†’ immediate no-op, fetch NEVER called â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('gradebook-client.js â€” no-identity (no token)', () => {
  it('returns { ok:false, reason:"no-identity" } when rosterClient.token() returns null', async () => {
    const { win, gradebookClient } = makeWindow();
    // No session in localStorage â†’ token() returns null
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      response: 'some answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
  });

  it('does NOT call fetch when token is absent', async () => {
    const { win, gradebookClient } = makeWindow();
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      response: 'answer'
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns no-identity when rosterClient is absent entirely', async () => {
    const { win, gradebookClient } = makeWindow();
    // Remove rosterClient from the window
    win.rosterClient = undefined;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'ans'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns no-identity when rosterClient.token throws', async () => {
    const { win, gradebookClient } = makeWindow();
    win.rosterClient = { token: () => { throw new Error('storage blocked'); } };
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'ans'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-identity');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// â”€â”€ 2. Happy path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('gradebook-client.js â€” happy path', () => {
  it('POSTs to ${ROSTER_SERVICE_URL}/ledger/record and returns { ok:true, ledgerId }', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'signed.token.abc');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-ledger-001', evidenceTier: 'practice' });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'WS-U4L1-2-Q1',
      unit:     'U4',
      topic:    '4.1',
      skill:    'VAR-3.D',
      response: 'probability describes long-run behavior',
      score:    1,
      attempt:  1
    });

    expect(result.ok).toBe(true);
    expect(result.ledgerId).toBe('uuid-ledger-001');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://mock-service.test/ledger/record');
  });

  it('includes the token in the POST body (not in a header)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'my.jwt.token');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-002', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q2',
      response: 'answer text'
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.token).toBe('my.jwt.token');
  });

  it('sends all optional fields in the body when provided', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-003', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'frq',
      itemId:   'FRQ-U5-001',
      unit:     'U5',
      topic:    '5.3',
      skill:    'UNC-3.A',
      response: { text: 'my answer', words: 42 },
      score:    2,
      attempt:  2
    });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.source).toBe('frq');
    expect(body.itemId).toBe('FRQ-U5-001');
    expect(body.unit).toBe('U5');
    expect(body.topic).toBe('5.3');
    expect(body.skill).toBe('UNC-3.A');
    expect(body.response).toEqual({ text: 'my answer', words: 42 });
    expect(body.score).toBe(2);
    expect(body.attempt).toBe(2);
  });

  it('treats explicit null response as present and forwards it', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-null', evidenceTier: 'practice' });

    const result = await gradebookClient.record({
      source: 'worksheet',
      itemId: 'Q-null',
      response: null
    });

    expect(result).toEqual({ ok: true, ledgerId: 'uuid-null', receipt: null });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.response).toBeNull();
  });

  it('does NOT send x-proctor-secret in the request headers (decision L-C)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-lc', evidenceTier: 'practice' });

    await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    const [, options] = fetchFn.mock.calls[0];
    const headers = options.headers || {};
    expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('x-proctor-secret');
  });

  it('uses Content-Type: application/json', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-ct', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [, options] = fetchFn.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });
});

// â”€â”€ 3. Network / server errors â†’ { ok:false, reason:'network' }, never throw â”€â”€

describe('gradebook-client.js â€” network and server errors', () => {
  it('returns { ok:false, reason:"network" } when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('does NOT throw when fetch rejects (caller must never see a rejection)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    await expect(
      gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' })
    ).resolves.not.toThrow();
  });

  it('returns { ok:false, reason:"server" } on HTTP 500 (server error body)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'internal server error' }, { ok: false, status: 500 });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('server');
  });

  it('returns { ok:false, reason:"auth" } on HTTP 401 (bad token server-side)', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('auth');
  });

  it('returns { ok:false, reason:"server" } when a 200 response has an unparseable body', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); }
    });

    const result = await gradebookClient.record({
      source:   'worksheet',
      itemId:   'Q1',
      response: 'answer'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('server');
  });
});

// â”€â”€ 4. Missing / invalid required args â†’ bad-args â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('gradebook-client.js â€” argument validation (bad-args)', () => {
  it('returns bad-args when source is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ itemId: 'Q1', response: 'ans' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when itemId is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', response: 'ans' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when response is missing', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns bad-args when opts is null', async () => {
    const { gradebookClient } = makeWindow();

    const result = await gradebookClient.record(null);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
  });

  it('returns bad-args when opts is undefined', async () => {
    const { gradebookClient } = makeWindow();

    const result = await gradebookClient.record(undefined);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-args');
  });

  it('bad-args check happens before identity check (no fetch even without identity)', async () => {
    // When args are bad, we should get bad-args regardless of identity state.
    // This test intentionally has no token AND bad args.
    const { win, gradebookClient } = makeWindow();
    // No session â†’ token() = null, but args are also missing
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet' }); // missing itemId + response

    expect(result.reason).toBe('bad-args');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// â”€â”€ 5. Reads URL and token at call time (not module load) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('gradebook-client.js â€” reads URL and token at call time', () => {
  it('uses the ROSTER_SERVICE_URL value present at call time, not at load time', async () => {
    const { win, gradebookClient } = makeWindow('https://original.test');
    setToken(win, 'tok');

    // Override URL after module load but before the call
    win.ROSTER_SERVICE_URL = 'https://overridden.test';

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-override', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('https://overridden.test/ledger/record');
  });

  it('uses the token present in localStorage at call time (not at load time)', async () => {
    const { win, gradebookClient } = makeWindow();
    // No token at load time; set it just before the call
    setToken(win, 'late-token');

    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-late', evidenceTier: 'practice' });

    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });

    const [, options] = fetchFn.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.token).toBe('late-token');
  });

  it('returns no-identity if token is cleared between calls', async () => {
    const { win, gradebookClient } = makeWindow();
    setToken(win, 'first-token');

    // First call succeeds
    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'uuid-first', evidenceTier: 'practice' });
    const r1 = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'ans' });
    expect(r1.ok).toBe(true);

    // Clear the session (sign out)
    win.localStorage.removeItem(STORAGE_KEY);

    // Second call â€” no identity
    const r2 = await gradebookClient.record({ source: 'worksheet', itemId: 'Q2', response: 'ans2' });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('no-identity');
    // Fetch should have been called only once (for the first call)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// â”€â”€ 6. Security: no secret / x-proctor-secret literals in source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Security: no secret literals or x-proctor-secret in gradebook-client.js', () => {
  it('contains no x-proctor-secret string literal', () => {
    expect(CLIENT_SRC).not.toContain('x-proctor-secret');
  });

  it('contains no hardcoded password literals', () => {
    expect(CLIENT_SRC).not.toMatch(/password\s*=\s*["'][^"']{3,}/);
    expect(CLIENT_SRC).not.toMatch(/secret\s*=\s*["'][^"']{3,}/);
  });

  it('contains no Supabase service-role key pattern (eyJ...)', () => {
    expect(CLIENT_SRC).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('has no import/require statements (pure browser JS)', () => {
    expect(CLIENT_SRC).not.toMatch(/^\s*import\s+/m);
    expect(CLIENT_SRC).not.toMatch(/require\s*\(/);
  });

  it('contains no ROSTER_PROCTOR_SECRET literal', () => {
    expect(CLIENT_SRC).not.toContain('ROSTER_PROCTOR_SECRET');
  });
});

// â”€â”€ 7. fetchPrior â€” PERSISTENT_ANSWERS_BUILD.md Â§4 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// fetchPrior(prefix) NEVER throws. NEVER rejects. Always resolves to a Map.

describe('gradebook-client.js â€” fetchPrior (no identity)', () => {
  it('returns an empty Map when not signed in', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when rosterClient is absent entirely', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    win.rosterClient = undefined;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when token() throws', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    win.rosterClient = {
      token: () => { throw new Error('storage blocked'); },
      studentId: () => 'uuid-test-student'
    };
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('gradebook-client.js â€” fetchPrior (bad args)', () => {
  it('returns an empty Map when prefix is missing', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior();
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix is empty string', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('');
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix contains wildcards / special chars', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    for (const bad of ['WS-U4%', 'WS-U4*', 'WS-U4 OR 1=1', 'WS-U4;DROP']) {
      const out = await gradebookClient.fetchPrior(bad);
      expect(out).toBeInstanceOf(Map);
      expect(out.size).toBe(0);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when prefix is not a string', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    for (const bad of [null, 42, {}, [], true]) {
      const out = await gradebookClient.fetchPrior(bad);
      expect(out).toBeInstanceOf(Map);
      expect(out.size).toBe(0);
    }
  });
});

describe('gradebook-client.js â€” fetchPrior (network / server errors)', () => {
  it('returns an empty Map when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
  });

  it('does NOT throw when fetch rejects', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    await expect(
      gradebookClient.fetchPrior('WS-U4L1-2')
    ).resolves.not.toThrow();
  });

  it('returns an empty Map on HTTP 401 / 403', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'forbidden' }, { ok: false, status: 401 });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when ROSTER_SERVICE_URL is not set', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    // roster_config.js falls back to a prod URL by default â€” clear it AFTER load.
    win.ROSTER_SERVICE_URL = null;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns an empty Map when JSON parse throws', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    win.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json'); }
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when server returns ok:false', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: false, error: 'bad prefix' });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });

  it('returns an empty Map when rows is not an array', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: true, rows: 'not-an-array' });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(0);
  });
});

describe('gradebook-client.js â€” fetchPrior (happy path / dedup)', () => {
  it('returns a Map of itemId â†’ {response, score, source} on success', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'session.token.abc');

    const fetchFn = mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-Q1', response: 'first answer',  score: 1,  source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q2', response: 'second answer', score: null, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(2);
    expect(out.get('WS-U4L1-2-Q1')).toEqual({
      response: 'first answer', score: 1, source: 'worksheet'
    });
    expect(out.get('WS-U4L1-2-Q2')).toEqual({
      response: 'second answer', score: null, source: 'worksheet'
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain('https://mock.test/ledger/student/');
    expect(url).toContain('prefix=WS-U4L1-2');
    // Token must NOT be in the URL (leaks into logs); it goes in the header.
    expect(url).not.toContain('token=');
    expect(opts.headers.Authorization).toBe('Bearer session.token.abc');
  });

  it('view-as: window.__VIEW_AS_STUDENT_ID__ overrides the sid but keeps the signed-in (teacher) token', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'teacher.token.xyz');            // signed in as the teacher
    win.__VIEW_AS_STUDENT_ID__ = 'uuid-target-student';

    const fetchFn = mockFetch(win, {
      ok: true,
      rows: [{ item_id: 'WS-U4L1-2-Q1', response: 'student answer', score: 1, source: 'worksheet' }]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');

    expect(out.get('WS-U4L1-2-Q1').response).toBe('student answer');
    const [url, opts] = fetchFn.mock.calls[0];
    // Reads the TARGET student's ledger, not the teacher's own id.
    expect(url).toContain('/ledger/student/uuid-target-student');
    expect(url).not.toContain('uuid-test-student');
    // The teacher's token rides along so the server can authorize the read.
    expect(opts.headers.Authorization).toBe('Bearer teacher.token.xyz');
  });

  it('no view-as global → reads the signed-in student\'s OWN id (unchanged)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');                          // no __VIEW_AS_STUDENT_ID__ set

    const fetchFn = mockFetch(win, { ok: true, rows: [] });
    await gradebookClient.fetchPrior('WS-U4L1-2');

    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain('/ledger/student/uuid-test-student');
  });

  it('dedupes by item_id (newest-first wins)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    // Server returns rows newest-first; the first occurrence per item_id wins.
    mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-Q1', response: 'newest', score: 1, source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q1', response: 'older',  score: 0, source: 'worksheet' },
        { item_id: 'WS-U4L1-2-Q2', response: 'second', score: 1, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(2);
    expect(out.get('WS-U4L1-2-Q1').response).toBe('newest');
    expect(out.get('WS-U4L1-2-Q2').response).toBe('second');
  });

  it('skips rows without item_id', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    mockFetch(win, {
      ok: true,
      rows: [
        { response: 'no-itemid', score: 1, source: 'worksheet' },                       // skipped
        { item_id: '',          response: 'empty-id', score: 1, source: 'worksheet' }, // skipped (falsy)
        { item_id: 'WS-U4L1-2-Q1', response: 'ok', score: 1, source: 'worksheet' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(1);
    expect(out.get('WS-U4L1-2-Q1').response).toBe('ok');
  });

  it('sends URL-encoded prefix in the query and the raw token in the Authorization header', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok+with/special=chars');

    const fetchFn = mockFetch(win, { ok: true, rows: [] });

    await gradebookClient.fetchPrior('WS-U4L1-2');

    const [url, opts] = fetchFn.mock.calls[0];
    // Prefix is URL-encoded in the query string.
    expect(url).toContain('prefix=WS-U4L1-2');
    // Token is carried in the Authorization header, verbatim â€” never the URL.
    expect(url).not.toContain('token=');
    expect(opts.headers.Authorization).toBe('Bearer tok+with/special=chars');
  });

  it('handles object responses (not just strings) in row.response', async () => {
    const { win, gradebookClient } = makeWindow('https://mock.test');
    setToken(win, 'tok');

    mockFetch(win, {
      ok: true,
      rows: [
        { item_id: 'WS-U4L1-2-FRQ1', response: { text: 'multi-line answer' }, score: 0.5, source: 'frq' }
      ]
    });

    const out = await gradebookClient.fetchPrior('WS-U4L1-2');
    expect(out.size).toBe(1);
    expect(out.get('WS-U4L1-2-FRQ1').response).toEqual({ text: 'multi-line answer' });
    expect(out.get('WS-U4L1-2-FRQ1').source).toBe('frq');
  });
});

describe('gradebook-client.js â€” fetchPrior (source-level contract)', () => {
  it('source contains a fetchPrior function on window.gradebookClient', () => {
    expect(CLIENT_SRC).toContain('fetchPrior');
    expect(CLIENT_SRC).toContain('function (prefix, options)');
  });

  it('source does NOT modify record() (additive only)', () => {
    // The record path must still match the original signature pattern.
    expect(CLIENT_SRC).toContain('record: async function (opts)');
  });

  it('fetchPrior source NEVER calls record() or any write endpoint', () => {
    // Pull the fetchPrior function body and verify no writes.
    const start = CLIENT_SRC.indexOf('fetchPrior:');
    expect(start).toBeGreaterThan(0);
    // Everything from fetchPrior: to the closing `})();`
    const tail = CLIENT_SRC.slice(start);
    expect(tail).not.toContain('/ledger/record');
    expect(tail).not.toMatch(/method:\s*['"]POST['"]/);
  });
});

// â”€â”€ 8. No-identity nudge (defense-in-depth backstop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// A dropped write must NEVER be silent: when record() can't find an identity,
// it shows a one-time visible banner so the student knows their work isn't
// saving (the cause of a worksheet's score "disappearing").

describe('gradebook-client.js â€” no-identity nudge', () => {
  it('shows a visible nudge banner when a write is dropped for no-identity', async () => {
    const { win, gradebookClient } = makeWindow();
    await gradebookClient.record({ source: 'worksheet', itemId: 'WS-U1L1-Q1', response: 'ans' });
    const bar = win.document.getElementById('gb-no-identity-nudge');
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('role')).toBe('alert');
    // points the student at the Desk to sign in, and is dismissible
    const link = bar.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('desk.html');
    expect(bar.querySelector('button')).not.toBeNull();
  });

  it('still returns { ok:false, reason:"no-identity" } (return contract unchanged)', async () => {
    const { gradebookClient } = makeWindow();
    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'a' });
    expect(result).toEqual({ ok: false, reason: 'no-identity' });
  });

  it('shows the nudge at most ONCE across repeated no-identity writes (no spam)', async () => {
    const { win, gradebookClient } = makeWindow();
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'a' });
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q2', response: 'b' });
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q3', response: 'c' });
    expect(win.document.querySelectorAll('#gb-no-identity-nudge').length).toBe(1);
  });

  it('does NOT show the nudge on a happy-path write (token present)', async () => {
    const { win, gradebookClient } = makeWindow('https://mock-service.test');
    setToken(win, 'tok');
    mockFetch(win, { ok: true, ledgerId: 'uuid-x', evidenceTier: 'practice' });
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'a' });
    expect(win.document.getElementById('gb-no-identity-nudge')).toBeNull();
  });

  it('the dismiss button removes the banner', async () => {
    const { win, gradebookClient } = makeWindow();
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'a' });
    const bar = win.document.getElementById('gb-no-identity-nudge');
    expect(bar).not.toBeNull();
    bar.querySelector('button').click();
    expect(win.document.getElementById('gb-no-identity-nudge')).toBeNull();
  });

  it('does NOT show the nudge when args are bad (bad-args precedes the identity check)', async () => {
    const { win, gradebookClient } = makeWindow();
    await gradebookClient.record({ source: 'worksheet' }); // missing itemId + response
    expect(win.document.getElementById('gb-no-identity-nudge')).toBeNull();
  });

  it('record() still never throws even though it now touches the DOM', async () => {
    const { gradebookClient } = makeWindow();
    await expect(
      gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'a' })
    ).resolves.not.toThrow();
  });
});

describe('gradebook-client.js â€” nudge source contract', () => {
  it('defines the nudge helper and keeps record() additive (signature unchanged)', () => {
    expect(CLIENT_SRC).toContain('_showNoIdentityNudge');
    expect(CLIENT_SRC).toContain('record: async function (opts)');
  });
});

// ── 5. Offline capture (OFFLINE_MODE_SPEC §4.A) ───────────────────────────────

// A window with offline-queue.js also loaded (real in-memory queue in jsdom).
function makeWindowWithQueue(overrideServiceUrl = 'https://mock-service.test') {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://a2-app.example.com' });
  const win = dom.window;
  if (overrideServiceUrl !== null) win.ROSTER_SERVICE_URL = overrideServiceUrl;
  const ctx = createContext(win);
  runInContext(CONFIG_SRC, ctx);
  runInContext(ROSTER_SRC, ctx);
  runInContext(OFFLINE_SRC, ctx);   // window.OfflineQueue
  runInContext(CLIENT_SRC, ctx);
  return { win, rosterClient: win.rosterClient, gradebookClient: win.gradebookClient, OfflineQueue: win.OfflineQueue };
}

describe('gradebook-client.js — offline capture', () => {
  it('requestFrqGrade sends the authoritative ticket shape and surfaces ticket metadata', async () => {
    const { win, gradebookClient } = makeWindowWithQueue();
    setToken(win, 'tok');
    const fetchFn = mockFetch(win, {
      ok: true,
      ledgerId: 'frq-ledger-1',
      clientScoreIgnored: true,
      status: 'queued',
      responseVersion: 7
    });

    const result = await gradebookClient.requestFrqGrade({
      itemId: 'WS-U6L1-2-reflect1',
      response: 'A sufficiently detailed response.'
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toMatchObject({
      source: 'frq',
      itemId: 'WS-U6L1-2-reflect1',
      response: 'A sufficiently detailed response.',
      requestGrade: true
    });
    expect(result).toMatchObject({
      ok: true,
      ledgerId: 'frq-ledger-1',
      clientScoreIgnored: true,
      status: 'queued',
      responseVersion: 7
    });
  });

  it.each([429, 503])('captures an FRQ requestGrade %s retryable response in the outbox', async (status) => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    mockFetch(win, { error: 'grading storage unavailable', retryable: true }, { ok: false, status });

    const result = await gradebookClient.requestFrqGrade({
      itemId: 'WS-U6L1-2-reflect1',
      response: 'Latest authoritative response.'
    });

    expect(result).toMatchObject({ ok: false, reason: 'network', queued: true });
    const rows = await OfflineQueue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'frq',
      itemId: 'WS-U6L1-2-reflect1',
      requestGrade: true,
      studentId: 'uuid-test-student',
      response: 'Latest authoritative response.'
    });
    expect(typeof rows[0].transportSequence).toBe('number');
  });

  it('supersedes an older queued answer after a newer same-key POST succeeds', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const fetchFn = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, ledgerId: 'new' }) });
    win.fetch = fetchFn;

    const oldCall = gradebookClient.requestFrqGrade({ itemId: 'SAME', response: 'old answer' });
    const newCall = gradebookClient.requestFrqGrade({ itemId: 'SAME', response: 'new answer' });
    // The per-key send chain starts each POST on a microtask; yield once so the
    // FIRST send fires, then assert the second is still waiting behind it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: false, status: 429, json: async () => ({ retryable: true }) });
    const oldResult = await oldCall;
    // The OLD call's retryable failure must NOT enqueue: a NEWER send for the same
    // key already started, so queueing the stale text would risk replaying it over
    // the newer answer. Superseded-and-dropped is the designed outcome.
    expect(oldResult.ok).toBe(false);
    expect(await OfflineQueue.all()).toHaveLength(0);

    await newCall;
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await OfflineQueue.all()).toHaveLength(0);
    await gradebookClient.syncOfflineQueue();
    // Nothing queued -> nothing replayed: the newer POST's success is final.
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('uses keepalive only when an unload FRQ flush requests it', async () => {
    const { win, gradebookClient } = makeWindowWithQueue();
    setToken(win, 'tok');
    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'kept' });

    await gradebookClient.requestFrqGrade({ itemId: 'Q-hide', response: 'latest', keepalive: true });

    expect(fetchFn.mock.calls[0][1].keepalive).toBe(true);
  });

  it('keeps a non-FRQ retryable 503 as a server error with no outbox capture', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    mockFetch(win, { retryable: true }, { ok: false, status: 503 });

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q503', response: 'x' });

    expect(result.reason).toBe('server');
    expect(await OfflineQueue.all()).toHaveLength(0);
  });

  it('OFFLINE_MODE: enqueues without touching the network, returns ok+queued', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    win.OFFLINE_MODE = true;
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'mean', score: 1 });

    expect(result).toMatchObject({ ok: true, queued: true });
    expect(fetchFn).not.toHaveBeenCalled();
    const q = await OfflineQueue.all();
    expect(q).toHaveLength(1);
    expect(q[0].itemId).toBe('Q1');
    expect(q[0].studentId).toBe('uuid-test-student'); // attributed from rosterClient
  });

  it('intermittent: a fetch rejection enqueues, keeps reason="network", adds queued:true', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q2', response: 'x', score: 0.5 });

    // reason stays in the frozen whitelist; queued is an additive signal
    expect(result).toMatchObject({ ok: false, reason: 'network', queued: true });
    expect(await OfflineQueue.all()).toHaveLength(1);
  });

  it('read-only/view-as: never enqueues or fetches, returns reason="read-only"', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    win.__WS_READ_ONLY__ = true;
    win.OFFLINE_MODE = true; // even in offline mode, read-only must win
    const fetchFn = vi.fn();
    win.fetch = fetchFn;

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q9', response: 'x', score: 1 });

    expect(result).toMatchObject({ ok: false, reason: 'read-only' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await OfflineQueue.all()).toHaveLength(0);
  });

  // 2026-09-09: an auth failure IS captured now (reason stays 'auth', queued:true) — an
  // expired session used to drop the grade on the floor. The ownership-gated drain
  // replays it once the owner signs back in. See the "2026-09-09 hardening" block.
  it('enqueues on an auth failure but keeps reason "auth" (an expired session must not lose the write)', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'expired');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q3', response: 'x' });

    expect(result.reason).toBe('auth');
    expect(result.queued).toBe(true);
    expect(await OfflineQueue.all()).toHaveLength(1);
  });

  it('does NOT enqueue on a server 500 (server reachable — surface the error)', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    mockFetch(win, { ok: false }, { ok: false, status: 500 });

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q4', response: 'x' });

    expect(result.reason).toBe('server');
    expect(await OfflineQueue.all()).toHaveLength(0);
  });

  it('syncOfflineQueue drains queued records via a real POST and clears them on success', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    // queue two via offline mode
    win.OFFLINE_MODE = true;
    await gradebookClient.record({ source: 'worksheet', itemId: 'A', response: 'x', score: 1 });
    await gradebookClient.record({ source: 'worksheet', itemId: 'B', response: 'y', score: 1 });
    expect(await OfflineQueue.all()).toHaveLength(2);

    // back online: the server accepts everything
    win.OFFLINE_MODE = false;
    mockFetch(win, { ok: true, ledgerId: 'L1' });

    const r = await gradebookClient.syncOfflineQueue();
    expect(r.sent).toBe(2);
    expect(await OfflineQueue.all()).toHaveLength(0);
  });

  it('syncOfflineQueue leaves records queued if the server is still down', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'tok');
    win.OFFLINE_MODE = true;
    await gradebookClient.record({ source: 'worksheet', itemId: 'A', response: 'x' });
    win.OFFLINE_MODE = false;
    win.fetch = vi.fn().mockRejectedValue(new Error('still down'));

    const r = await gradebookClient.syncOfflineQueue();
    expect(r.failed).toBe(1);
    expect(await OfflineQueue.all()).toHaveLength(1);
  });

  it('periodically drains queued rows while the browser stays online', async () => {
    vi.useFakeTimers();
    try {
      const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
      setToken(win, 'tok');
      win.fetch = vi.fn().mockRejectedValueOnce(new Error('brief outage'));
      await gradebookClient.record({ source: 'worksheet', itemId: 'online-only', response: 'saved locally' });
      expect(await OfflineQueue.all()).toHaveLength(1);
      win.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, ledgerId: 'replayed' }) });

      await vi.advanceTimersByTimeAsync(30001);

      expect(await OfflineQueue.all()).toHaveLength(0);
      expect(win.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('without offline-queue.js loaded, record() behaves exactly as before (graceful)', async () => {
    const { win, gradebookClient } = makeWindow(); // no OfflineQueue in this context
    setToken(win, 'tok');
    win.fetch = vi.fn().mockRejectedValue(new Error('down'));
    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'x' });
    expect(result).toMatchObject({ ok: false, reason: 'network' }); // not 'queued'
  });
});

// ── 2026-09-09 hardening: an expired session no longer drops a grade-bearing write,
// and fetchPrior surfaces the stored grader result so worksheets can explain a grade.
describe('gradebook-client.js — 2026-09-09 hardening (auth capture + fetchPrior result)', () => {
  it('a 401 with a known studentId is CAPTURED for replay: { ok:false, reason:"auth", queued:true }', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });

    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'answer', score: 1 });

    expect(result).toMatchObject({ ok: false, reason: 'auth', queued: true });
    const rows = await OfflineQueue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'worksheet', itemId: 'Q1', studentId: 'uuid-test-student', response: 'answer' });
  });

  it('a 401-captured write drains under the owner once the session is valid again', async () => {
    const { win, gradebookClient, OfflineQueue } = makeWindowWithQueue();
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q2', response: 'B', score: 1 });
    expect(await OfflineQueue.all()).toHaveLength(1);

    setToken(win, 'fresh-token');
    const fetchFn = mockFetch(win, { ok: true, ledgerId: 'L2' });
    const res = await gradebookClient.syncOfflineQueue();
    expect(res.sent).toBe(1);
    expect(await OfflineQueue.all()).toHaveLength(0);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toMatchObject({ source: 'worksheet', itemId: 'Q2', response: 'B', token: 'fresh-token' });
  });

  it('a 401 on a page WITHOUT the offline queue shows the "NOT being saved" banner, never "kept on this device"', async () => {
    const { win, gradebookClient } = makeWindow();   // no offline-queue.js on this page (e.g. the TI-84 trainer)
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });
    const result = await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'answer', score: 1 });
    expect(result).toEqual({ ok: false, reason: 'auth' });
    const bar = win.document.getElementById('gb-no-identity-nudge');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('NOT being saved');
    expect(bar.textContent).not.toContain('kept on this device');
  });

  it('a 401 WITH the offline queue shows the "kept on this device" banner', async () => {
    const { win, gradebookClient } = makeWindowWithQueue();
    setToken(win, 'expired-token');
    mockFetch(win, { ok: false, error: 'invalid token' }, { ok: false, status: 401 });
    await gradebookClient.record({ source: 'worksheet', itemId: 'Q1', response: 'answer', score: 1 });
    const bar = win.document.getElementById('gb-no-identity-nudge');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('kept on this device');
  });

  it('fetchPrior exposes the stored grader result + gradedAt only when the row carries them', async () => {
    const { win, gradebookClient } = makeWindowWithQueue();
    setToken(win, 'tok');
    mockFetch(win, { ok: true, rows: [
      {
        item_id: 'WS-U1L1-reflect1', response: 'my answer', score: 0.5, source: 'frq',
        frq_result: { score: 0.5, feedback: 'Name the variable type.', provider: 'ai-batch', model: 'x', responseHash: 'h' },
        graded_at: '2026-08-19T05:12:00.000Z',
      },
      { item_id: 'WS-U1L1-Q1', response: 'B', score: 1, source: 'worksheet' },
      { item_id: 'WS-U1L1-reflect2', response: 'r2', score: 1, source: 'frq', frq_result: 'not-an-object', graded_at: null },
    ] });

    const map = await gradebookClient.fetchPrior('WS-U1L1');
    expect(map.get('WS-U1L1-reflect1')).toEqual({
      response: 'my answer', score: 0.5, source: 'frq',
      result: { score: 0.5, feedback: 'Name the variable type.', provider: 'ai-batch' },
      gradedAt: '2026-08-19T05:12:00.000Z',
    });
    // rows without a stored result keep the original three-field shape
    expect(map.get('WS-U1L1-Q1')).toEqual({ response: 'B', score: 1, source: 'worksheet' });
    expect(map.get('WS-U1L1-reflect2')).toEqual({ response: 'r2', score: 1, source: 'frq' });
  });
});


describe('parked answer notification', () => {
  it('12 HTTP 500s park the stored row; a 13th sync makes no fetch and shows one banner', async () => {
    const { win } = makeWindowWithQueue(); setToken(win, 'tok');
    try {
      win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ ok: false }) });
      await win.OfflineQueue.enqueue({ source: 'quiz', itemId: 'park-http', studentId: 'uuid-test-student', response: 'saved answer', ts: 1 });
      for (let i=0;i<12;i++) await win.gradebookClient.syncOfflineQueue();
      expect(win.document.querySelectorAll('#gb-parked-nudge')).toHaveLength(1);
      expect(win.document.getElementById('gb-parked-nudge').textContent).toContain('1 answer(s) could not be saved');
      win.document.getElementById('gb-parked-nudge').remove();
      expect(await win.gradebookClient.syncOfflineQueue()).toEqual({sent:0,failed:0,remaining:1});
      expect(win.document.querySelectorAll('#gb-parked-nudge')).toHaveLength(0);
      expect(win.fetch).toHaveBeenCalledTimes(12);
    } finally { win.document.defaultView.close(); }
  });
});


it('stops the offline scheduler when only parked rows remain', async () => {
  vi.useFakeTimers();
  const { win, OfflineQueue, gradebookClient } = makeWindowWithQueue();
  try {
    setToken(win, 'tok');
    await OfflineQueue.enqueue({ source:'quiz',itemId:'park-timer',studentId:'uuid-test-student',ts:1 });
    win.fetch = vi.fn().mockResolvedValue({ok:false,status:500,json:async()=>({ok:false})});
    for(let i=0;i<12;i++) await gradebookClient.syncOfflineQueue();
    const reads = vi.spyOn(OfflineQueue, 'all');
    await vi.advanceTimersByTimeAsync(1);
    const count=reads.mock.calls.length;
    await vi.advanceTimersByTimeAsync(7200000);
    expect(reads).toHaveBeenCalledTimes(count);
    expect(win.fetch).toHaveBeenCalledTimes(12);
  } finally { win.close(); vi.useRealTimers(); }
});


it('a fresh page with only a PARKED row still shows the parked banner (release-gate fix 2026-09-10)', async () => {
  vi.useFakeTimers();
  const { win, OfflineQueue, gradebookClient } = makeWindowWithQueue();
  try {
    setToken(win, 'tok');
    await OfflineQueue.enqueue({ source:'quiz', itemId:'park-reload', studentId:'uuid-test-student', ts:1 });
    win.fetch = vi.fn().mockResolvedValue({ ok:false, status:500, json:async()=>({ok:false}) });
    for (let i = 0; i < 12; i++) await gradebookClient.syncOfflineQueue();   // yesterday: parked
    win.document.getElementById('gb-parked-nudge').remove();
    // "next day": a fresh page load re-evaluates the client against the same durable queue
    runInContext(CLIENT_SRC, createContext(win));
    win.fetch = vi.fn();
    await vi.advanceTimersByTimeAsync(5);            // boot _scheduleOfflineDrain(0)
    expect(win.fetch).not.toHaveBeenCalled();         // parked rows are never replayed
    expect(win.document.querySelectorAll('#gb-parked-nudge')).toHaveLength(1);
    expect(win.document.getElementById('gb-parked-nudge').textContent).toContain('could not be saved');
  } finally { win.close(); vi.useRealTimers(); }
});

it('coalesces online/storage triggers until the in-flight batch resolves, then sends fresh rows', async () => {
  vi.useFakeTimers();
  const { win, OfflineQueue } = makeWindowWithQueue();
  let finish;
  try {
    setToken(win, 'tok');
    await OfflineQueue.enqueue({source:'quiz',itemId:'first',studentId:'uuid-test-student',ts:1});
    win.fetch=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
      .mockResolvedValue({ok:true,status:200,json:async()=>({ok:true,ledgerId:'second'})});
    win.dispatchEvent(new win.Event('online'));
    await vi.advanceTimersByTimeAsync(1);
    expect(win.fetch).toHaveBeenCalledTimes(1);
    await OfflineQueue.enqueue({source:'quiz',itemId:'second',studentId:'uuid-test-student',ts:2});
    win.dispatchEvent(new win.StorageEvent('storage',{key:'a2_roster.v1'}));
    win.dispatchEvent(new win.Event('online'));
    await vi.advanceTimersByTimeAsync(600);
    expect(win.fetch).toHaveBeenCalledTimes(1);
    finish({ok:true,status:200,json:async()=>({ok:true,ledgerId:'first'})});
    await vi.advanceTimersByTimeAsync(10);
    expect(win.fetch).toHaveBeenCalledTimes(2);
    expect(win.fetch.mock.calls.map(call=>JSON.parse(call[1].body).itemId)).toEqual(['first','second']);
    expect(await OfflineQueue.all()).toEqual([]);
    await vi.advanceTimersByTimeAsync(120000);
    expect(win.fetch).toHaveBeenCalledTimes(2);
  } finally { win.close();vi.useRealTimers(); }
});
