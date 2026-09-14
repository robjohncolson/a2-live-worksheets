// student-key-client.test.js — window.StudentKey (student-key.js), the device
// signing-key manager for the offline-grading mesh (OFFLINE_GRADING_MESH_SPEC §0.2).
// Runs the real module in a vm with injected fakes for SecureKeyStore / ReceiptSign /
// ReceiptVerify / fetch, exercising ensure() (get-or-generate + register) and the
// revocation clear path (§0.3).
//
// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'student-key.js'), 'utf8');

function makeLocalStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

function load(win) {
  // Bare `fetch` in the module resolves against the context globals — delegate to
  // the per-test win.fetch (which each test swaps) at call time.
  const ctx = createContext({
    window: win, globalThis: win, self: win, JSON, Promise, String, Object, Array, console,
    localStorage: win.localStorage,
    fetch: (...a) => (win.fetch ? win.fetch(...a) : Promise.reject(new Error('no fetch'))),
  });
  runInContext(SRC, ctx);
  return win.StudentKey;
}

const SID = 'stu-42';

function baseWin(over = {}) {
  const store = new Map();                 // SecureKeyStore backing
  const win = {
    localStorage: makeLocalStorage(),
    rosterClient: { studentId: () => SID, token: () => 'TOKEN' },
    SecureKeyStore: {
      available: true,
      _opts: [],                              // captures every (setKey/getKey) opts arg
      hasKey: (name) => Promise.resolve(store.has(name)),
      getKey: function (name, opts) { this._opts.push(opts); return Promise.resolve(store.get(name) || null); },
      setKey: function (name, val, opts) { this._opts.push(opts); store.set(name, val); return Promise.resolve(); },
      removeKey: (name) => { store.delete(name); return Promise.resolve(); },
    },
    ReceiptSign: {
      generateKey: () => Promise.resolve({ publicKeyX: 'PK_NEW', privateKey: { _k: 1 }, privateJwk: { d: 'x' } }),
      importPrivateKey: (jwk) => Promise.resolve({ _imported: jwk }),
      publicKeyXFromPrivate: () => Promise.resolve('PK_DERIVED'),
    },
    ReceiptVerify: { registerStudentKeys: (keys) => ({ added: keys.length, updated: 0, conflicts: 0 }) },
    _store: store,
  };
  return Object.assign(win, over);
}

describe('StudentKey.available()', () => {
  it('false without SecureKeyStore or ReceiptSign (web is inert)', () => {
    const SK = load(baseWin({ SecureKeyStore: undefined }));
    expect(SK.available()).toBe(false);
    const SK2 = load(baseWin({ SecureKeyStore: { available: false } }));
    expect(SK2.available()).toBe(false);
  });
  it('true with both present (APK)', () => {
    expect(load(baseWin()).available()).toBe(true);
  });
});

describe('StudentKey.ensureKey — get-or-generate', () => {
  it('generates + wraps + caches the pubkey on first run', async () => {
    const win = baseWin();
    const SK = load(win);
    const r = await SK.ensureKey(SID);
    expect(r.ok).toBe(true);
    expect(r.generated).toBe(true);
    expect(r.pubkey).toBe('PK_NEW');
    expect(win._store.has('a2_student_signing_v2:' + SID)).toBe(true);
    expect(win.localStorage.getItem('a2_student_pubkey_v2:' + SID)).toBe('PK_NEW');
  });

  it('reuses the cached pubkey on a later run (no regeneration)', async () => {
    const win = baseWin();
    const SK = load(win);
    await SK.ensureKey(SID);
    const again = await SK.ensureKey(SID);
    expect(again.generated).toBe(false);
    expect(again.pubkey).toBe('PK_NEW');
  });

  it('stores the student key SILENTLY — requireAuth:false on every SecureKeyStore call (§2.5)', async () => {
    const win = baseWin();
    const SK = load(win);
    await SK.ensureKey(SID);                                   // generate + setKey
    win.localStorage.removeItem('a2_student_pubkey_v2:' + SID);
    await SK.ensureKey(SID);                                   // re-derive path → getKey
    await SK.unlock(SID);                                      // unlock → getKey
    expect(win.SecureKeyStore._opts.length).toBeGreaterThanOrEqual(3);
    for (const o of win.SecureKeyStore._opts) {
      expect(o, 'every student key op must pass an opts arg').toBeTruthy();
      expect(o.requireAuth).toBe(false);                      // never a biometric prompt
    }
  });

  it('re-derives the pubkey (one unlock) if the key exists but the cache was cleared', async () => {
    const win = baseWin();
    const SK = load(win);
    await SK.ensureKey(SID);
    win.localStorage.removeItem('a2_student_pubkey_v2:' + SID);
    const r = await SK.ensureKey(SID);
    expect(r.ok).toBe(true);
    expect(r.generated).toBe(false);
    expect(r.pubkey).toBe('PK_DERIVED');
  });

  it('returns no-identity without a sid and unavailable on the web', async () => {
    expect((await load(baseWin()).ensureKey(null)).reason).toBe('no-identity');
    expect((await load(baseWin({ SecureKeyStore: undefined })).ensureKey(SID)).reason).toBe('unavailable');
  });
});

describe('StudentKey.register — authenticated, idempotent, revocation-aware', () => {
  it('POSTs the pubkey with a Bearer token and records success', async () => {
    let seen = null;
    const win = baseWin({ fetch: (url, opts) => { seen = { url, opts }; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, existing: false }) }); } });
    const SK = load(win);
    const r = await SK.register('https://roster', 'TOKEN', SID, 'PK_NEW');
    expect(r.ok).toBe(true);
    expect(seen.url).toBe('https://roster/student-keys/register');
    expect(seen.opts.headers.Authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(seen.opts.body).pubkey).toBe('PK_NEW');
    // A second call short-circuits (already recorded) without another fetch.
    let calls = 0;
    win.fetch = () => { calls += 1; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }); };
    const again = await SK.register('https://roster', 'TOKEN', SID, 'PK_NEW');
    expect(again.already).toBe(true);
    expect(calls).toBe(0);
  });

  it('on a 403 revoked, clears the stored key + caches so the next ensure regenerates (§0.3)', async () => {
    const win = baseWin({ fetch: () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ ok: false, error: 'pubkey revoked' }) }) });
    const SK = load(win);
    await SK.ensureKey(SID);                         // establish a key + caches
    const r = await SK.register('https://roster', 'TOKEN', SID, 'PK_NEW');
    expect(r.reason).toBe('revoked');
    expect(win._store.has('a2_student_signing_v2:' + SID)).toBe(false);
    expect(win.localStorage.getItem('a2_student_pubkey_v2:' + SID)).toBeNull();
  });
});

describe('StudentKey.syncTrustSet', () => {
  it('feeds the fetched keys into ReceiptVerify.registerStudentKeys', async () => {
    let registered = null;
    const win = baseWin({
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, keys: [{ pubkey: 'A', sid: '1' }, { pubkey: 'B', sid: '2' }] }) }),
    });
    win.ReceiptVerify.registerStudentKeys = (keys) => { registered = keys; return { added: keys.length, updated: 0, conflicts: 0 }; };
    const SK = load(win);
    const r = await SK.syncTrustSet('https://roster', 'TOKEN');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(registered.map((k) => k.pubkey)).toEqual(['A', 'B']);
  });
});
