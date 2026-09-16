// tests/desk-flashcard-sync.test.js — the Desk + mobile glue around lib/flashcard-sync.js.
// Executes the Desk's real _fcSyncClient / _fcSyncAllowed / _srsSyncPull /
// _srsSyncViaTrainerState bodies (extracted by name — never renamed) against a fake
// roster-server, and pins the mobile wiring statically.
// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import FlashcardSync from '../lib/flashcard-sync.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

function entry(over) {
  return Object.assign({
    roundId: 'phone-1-aaaa', seq: 0, csv: 'u4_l1_l2_blooket.csv', qnum: 3, correct: true,
    ts: 1_700_000_000_000, mode: 'quick', missIndex: 0, wasTimeout: false, latencyMs: 900,
    topic: '4.1-2', surface: 'mobile', nChoices: 4
  }, over || {});
}

// Build the Desk glue in an isolated scope with injectable globals.
function deskHarness(opts) {
  const o = opts || {};
  const storage = memoryStorage(o.seed);
  const session = memoryStorage();
  const remoteState = o.remoteEntries ? FlashcardSync.toWire(o.remoteEntries, { email: o.remoteEmail || 'kid' }) : null;
  let row = remoteState ? { state: remoteState, updatedAt: 'stamp-1' } : null;
  const calls = [];
  const fetchFake = vi.fn(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    const respond = (status, json) => ({ status, json: async () => json });
    if (init.method === 'GET') return row ? respond(200, { ok: true, found: true, state: row.state, updatedAt: row.updatedAt }) : respond(200, { ok: true, found: false });
    const body = JSON.parse(init.body);
    if (row && row.updatedAt !== body.baseUpdatedAt) return respond(409, { ok: false, error: 'stale', updatedAt: row.updatedAt });
    row = { state: body.state, updatedAt: 'stamp-2' };
    return respond(200, { ok: true, updatedAt: 'stamp-2' });
  });
  const chipCalls = [];
  const dueHost = { style: { display: 'block' } };
  const flags = Object.assign({ flashcardSync: true, dueTodayDeck: true }, o.flags || {});
  const scope = {
    FlashcardSync,
    fetch: fetchFake,
    localStorage: storage,
    sessionStorage: session,
    window: { ROSTER_SERVICE_URL: 'https://roster.example', rosterClient: { token: () => o.token === undefined ? 'tok' : o.token }, __WS_READ_ONLY__: !!o.readOnly },
    document: { getElementById: (id) => (id === 'donow-grades' ? dueHost : null) },
    getStudentEmail: () => 'kid',
    _fcFlag: (name) => !!flags[name],
    _viewAsContext: () => !!o.viewAs,
    _srsRenderDueChip: (host, summary) => { chipCalls.push(summary); },
    _srsDueSnapshot: () => ({ due: 1 }),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {}
  };
  const src = [
    'var _srsFoldCache = { stale: true }; var _srsReadinessCache = { stale: true };',
    'var _fcSyncClientInstance = null;',
    fnBody(DESK, '_fcSyncClient'),
    fnBody(DESK, '_fcSyncAllowed'),
    fnBody(DESK, '_srsSyncPull'),
    fnBody(DESK, '_srsSyncViaTrainerState'),
    fnBody(DESK, '_srsSyncFlush'),
    'return { pull: _srsSyncPull, push: _srsSyncViaTrainerState, flush: _srsSyncFlush, client: _fcSyncClient, caches: function () { return { fold: _srsFoldCache, ready: _srsReadinessCache }; } };'
  ].join('\n');
  const names = Object.keys(scope);
  const factory = new Function(...names, src);
  const api = factory(...names.map((n) => scope[n]));
  return { api, calls, storage, chipCalls, get row() { return row; } };
}

describe('Desk flashcard sync — executed glue', () => {
  it('pulls another device\'s practice into the local log, invalidates fold caches, repaints only the chip', async () => {
    const h = deskHarness({
      seed: { a2_srs_log_kid: JSON.stringify([entry({ roundId: 'desk-1', surface: 'desk' })]) },
      remoteEntries: [entry({ roundId: 'phone-1' })]
    });
    const r = await h.api.pull({ force: true });
    expect(r).toMatchObject({ ok: true, changed: true, pushed: true });
    const local = JSON.parse(h.storage.getItem('a2_srs_log_kid'));
    expect(local.map((e) => e.roundId).sort()).toEqual(['desk-1', 'phone-1']);
    expect(h.api.caches()).toEqual({ fold: null, ready: null });
    expect(h.chipCalls).toEqual([{ due: 1 }]);
    expect(h.calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(h.calls[0].url).toBe('https://roster.example/flashcards/state');
    expect(h.row.state.e).toHaveLength(2);
  });

  it('does nothing when the flashcardSync flag is off, in view-as, or read-only, or signed out', async () => {
    for (const opts of [{ flags: { flashcardSync: false } }, { viewAs: true }, { readOnly: true }, { token: null }]) {
      const h = deskHarness(Object.assign({ seed: { a2_srs_log_kid: '[{"roundId":"x","seq":0,"ts":1}]' } }, opts));
      const r = await h.api.pull({ force: true });
      expect(r.ok, JSON.stringify(opts)).toBe(false);
      h.api.push();
      await h.api.flush();
      expect(h.calls, JSON.stringify(opts)).toEqual([]);
    }
  });

  it('push (debounced) uploads the local log; the wire payload never contains grade fields', async () => {
    vi.useFakeTimers();
    try {
      const h = deskHarness({ seed: { a2_srs_log_kid: JSON.stringify([entry({ roundId: 'desk-9', surface: 'desk' })]) } });
      h.api.push(); h.api.push();                       // debounced: one PUT
      await vi.advanceTimersByTimeAsync(2999);
      expect(h.calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(2);
      expect(h.calls.map((c) => c.method)).toEqual(['PUT']);
      const body = h.calls[0].body;
      expect(body.token).toBe('tok');
      expect(body.state.v).toBe(1);
      expect(JSON.stringify(body.state)).not.toMatch(/DESK_DONE|selfAttest|score/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('mobile-home flashcard sync — static wiring', () => {
  it('loads the lib and mirrors the Desk hooks (boot pull, sign-in pulls, open pull, append push, page-hide flush)', () => {
    expect(HOME).toContain('<script src="lib/flashcard-sync.js" onerror=""></script>');
    const client = fnBody(HOME, '_fcSyncClient');
    expect(client).toMatch(/window\.FlashcardSync\.createSyncClient\(\{/);
    expect(client).toMatch(/rosterClient\.token\(\)/);
    expect(client).toMatch(/_fcEmail\(\)/);
    const allowed = fnBody(HOME, '_fcSyncAllowed');
    expect(allowed).toMatch(/_fcSyncFlagOn\(\)/);
    expect(allowed).toMatch(/window\.__WS_READ_ONLY__/);
    expect(fnBody(HOME, '_fcSyncFlagOn')).toContain("'flashcardSync'");
    expect(fnBody(HOME, '_fcSrsAppend')).toMatch(/_fcSyncPush\(\)/);
    expect(fnBody(HOME, '_fcLoadFlagsOnce')).toMatch(/_fcSyncPull\(\{ force: true \}\)/);
    expect(fnBody(HOME, 'openFlashcards')).toMatch(/_fcSyncPull\(\)/);
    const signInPulls = HOME.match(/localStorage\.setItem\('a2_desk_student_email', who\.username \|\| [^)]+\); \} catch \(_\) \{\}\n\s*try \{ if \(typeof _fcSyncPull === 'function'\) _fcSyncPull\(\{ force: true \}\); \} catch \(_\) \{\}/g) || [];
    expect(signInPulls.length).toBe(2);
    expect(HOME).toMatch(/addEventListener\('pagehide', function \(\) \{ _fcSyncFlush\(\); \}\)/);
  });

  it('mobile has no passport UI (Supabase sync replaces it)', () => {
    expect(HOME).not.toMatch(/Flashcard progress/);
    expect(HOME).not.toMatch(/_fcpExport|_fcpImportFile/);
  });
});


describe('Desk A2 sync route and identity isolation', () => {
  it('rejects another student row without writing either namespace or uploading', async () => {
    const bobLog = JSON.stringify([entry({ roundId: 'bob-local' })]);
    const h = deskHarness({
      seed: { a2_srs_log_kid: '[]', a2_srs_log_bob: bobLog },
      remoteEmail: 'bob', remoteEntries: [entry({ roundId: 'bob-phone' })],
    });
    expect(await h.api.pull({ force: true })).toMatchObject({ ok: false, reason: 'email-mismatch' });
    expect(h.storage.getItem('a2_srs_log_kid')).toBe('[]');
    expect(h.storage.getItem('a2_srs_log_bob')).toBe(bobLog);
    expect(h.calls).toEqual([{
      url: 'https://roster.example/flashcards/state', method: 'GET', body: null,
    }]);
    expect(h.chipCalls).toEqual([]);
  });

  it('uploads practice only through PUT /flashcards/state', async () => {
    const h = deskHarness({ seed: { a2_srs_log_kid: JSON.stringify([entry()]) } });
    await h.api.client().push();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({
      url: 'https://roster.example/flashcards/state', method: 'PUT',
      body: { token: 'tok', state: { v: 1 } },
    });
  });
});
