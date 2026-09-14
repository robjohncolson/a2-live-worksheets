/**
 * tests/desk-donow-card.test.js
 *
 * DN3a — the Do Now card in desk.html.
 * Frozen contract: DESK_DONOW_DN3_BUILD.md (DN3a section).
 *
 * jsdom DOM-structure (scripts NOT executed) + Node `vm` runtime, mirroring
 * the DN2c/DN2d test approach. No network, no Supabase.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const REPO_ROOT = resolve(__dirname, '..');
const DESK_PATH = resolve(REPO_ROOT, 'desk.html');

let html;
let document;

beforeAll(() => {
  html = readFileSync(DESK_PATH, 'utf-8');
  document = new JSDOM(html).window.document;
});

// ─── slicer (skips the param list so default params don't fool it) ──────────
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Card markup present + mounted before the calendar
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3a — Do Now card markup', () => {
  it('has #donow-card and #donow-msg', () => {
    expect(document.getElementById('donow-card')).not.toBeNull();
    expect(document.getElementById('donow-msg')).not.toBeNull();
  });

  it('the card sits before the calendar grid (#cg)', () => {
    const iCard = html.indexOf('id="donow-card"');
    const iCal = html.indexOf('id="cg"');
    expect(iCard).toBeGreaterThan(-1);
    expect(iCal).toBeGreaterThan(iCard);
  });

  it('starts hidden (renderDoNow reveals it)', () => {
    const card = document.getElementById('donow-card');
    expect(card.getAttribute('style')).toMatch(/display:\s*none/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Source wiring — server-mediated, invoked at the right moments
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3a — wiring', () => {
  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)

  it('renderDoNow makes ZERO direct Supabase calls (D7)', () => {
    const b = fnBody(html, 'renderDoNow');
    expect(b).not.toMatch(/SUPABASE_URL|supabase/i);
  });

  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)
  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RUNTIME — renderDoNow behaves correctly against fakes
// ─────────────────────────────────────────────────────────────────────────────

function makeDesk({ token, tokenThrows, fetchImpl, serviceUrl = 'https://roster.example' } = {}) {
  const els = new Map();
  function el(id) {
    if (!els.has(id)) els.set(id, { id, textContent: '', className: '', style: {} });
    return els.get(id);
  }
  // Pre-create the two real ids the function queries.
  el('donow-card');
  el('donow-msg');

  const fetchCalls = [];
  const spiedFetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (fetchImpl) return fetchImpl(url, opts);
    throw new Error('no fetch');
  };

  const sandbox = {
    cedLabel: loadCedLabels().cedLabel,
    document: { getElementById: el },
    window: {
      ROSTER_SERVICE_URL: serviceUrl,
      rosterClient: {
        token: () => { if (tokenThrows) throw new Error('token boom'); return token || null; },
      },
    },
    fetch: spiedFetch,
    console,
  };
  createContext(sandbox);
  runInContext(fnBody(html, 'renderDoNow') + '\nthis.__rd = renderDoNow;', sandbox);
  return { run: sandbox.__rd, el, fetchCalls };
}

describe('DN3a runtime — renderDoNow states', () => {
  it('no token → sign-in nudge, amber, card shown', async () => {
    const d = makeDesk({ token: null });
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/Sign in/i);
    expect(d.el('donow-card').className).toBe('donow-signin');
    expect(d.el('donow-card').style.display).toBe('flex');
  });

  it('token + nextTask → message + fetches /donow with exact Bearer header (D7)', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({
        ok: true,
        nextTask: { unit: 'U1', lesson: '1.2', activity: 'worksheet', progress: { done: 4, total: 12 } },
      }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).toBe('Do Now: 1.2 · Variables — worksheet (4/12 done).');
    expect(d.el('donow-card').className).toBe('donow-todo');
    // Fetch spy: exact URL + Authorization header (not just a source regex).
    expect(d.fetchCalls).toHaveLength(1);
    expect(d.fetchCalls[0].url).toBe('https://roster.example/donow');
    expect(d.fetchCalls[0].opts.headers.Authorization).toBe('Bearer tok');
  });

  it('rosterClient.token() throws → graceful sign-in nudge, no throw, no fetch', async () => {
    const d = makeDesk({ tokenThrows: true });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Sign in/i);
    expect(d.fetchCalls).toHaveLength(0);
  });

  it('malformed truthy nextTask (no unit) → quiet fallback, never "undefined"', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({ ok: true, nextTask: { lesson: '1.2' } }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).not.toMatch(/undefined/);
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('token + nextTask null → celebratory all-caught-up, green', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({ ok: true, nextTask: null }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/All caught up/i);
    expect(d.el('donow-card').className).toBe('donow-done');
  });

  it('PC-style nextTask (no lesson) → unit only, no crash', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({
        ok: true, nextTask: { unit: 'U1', lesson: null, activity: 'progress-check', progress: { done: 0, total: 38 } },
      }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).toBe('Do Now: U1 — progress-check (0/38 done).');
  });

  it('fetch throws → quiet fallback, NEVER throws', async () => {
    const d = makeDesk({ token: 'tok', fetchImpl: async () => { throw new Error('network'); } });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('server ok:false → quiet fallback, no throw', async () => {
    const d = makeDesk({ token: 'tok', fetchImpl: async () => ({ json: async () => ({ ok: false }) }) });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('no ROSTER_SERVICE_URL → graceful unavailable message', async () => {
    const d = makeDesk({ token: 'tok', serviceUrl: null }); // null ≠ undefined: skips the destructuring default
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/unavailable/i);
  });
});
