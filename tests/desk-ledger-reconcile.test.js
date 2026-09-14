// desk-ledger-reconcile.test.js — ANDROID Phase 2 Desk wiring.
// The offline grade re-derivation (_phase2ReDeriveGrade) must: run the shared
// engine over the local signed ledger ∪ unsynced OfflineQueue, return a
// /grade-shaped payload, be OFF in view-as, and return null (→ caller falls back
// to the cached blob) when the engine / cached inputs / rows aren't available.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const FNS = 'var _phase2VerifySummary=null,_phase2IssuerRegistered=false,_phase2BaseUrl=null;\n'
  + ['_phase2InputsKey', '_phase2PersistInputs', '_phase2LoadInputs', '_phase2QueueRows', '_phase2ReDeriveGrade', '_phase2RefreshVerifySummary', '_phase2RegisterIssuer']
    .map((n) => fnBody(DESK, n)).join('\n');

function memLocalStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Build a harness exposing all _phase2 fns over the given stubs.
function harness({ vasContext = null, sid = 'stu-1', GradeEngine, LedgerStore, OfflineQueue, ReceiptVerify, fetch } = {}) {
  const localStorage = memLocalStorage();
  const rosterClient = { studentId: () => sid };
  const window = { rosterClient, GradeEngine, LedgerStore, OfflineQueue, ReceiptVerify };
  const _viewAsContext = () => vasContext;
  const run = new Function(
    'window', '_viewAsContext', 'rosterClient', 'localStorage', 'GradeEngine', 'LedgerStore', 'OfflineQueue', 'ReceiptVerify', 'fetch',
    FNS + '\nreturn { _phase2InputsKey, _phase2PersistInputs, _phase2LoadInputs, _phase2QueueRows, _phase2ReDeriveGrade,'
        + ' _phase2RefreshVerifySummary, _phase2RegisterIssuer, getVerifySummary: function(){ return _phase2VerifySummary; }, getIssuers: function(){ return window.ReceiptVerify ? window.ReceiptVerify.ISSUERS : null; } };'
  );
  return run(window, _viewAsContext, rosterClient, localStorage, GradeEngine, LedgerStore, OfflineQueue, ReceiptVerify, fetch);
}

const okEngine = (capture) => ({
  computeGrade: (rows, key, cfg, opts) => { if (capture) capture.rows = rows, capture.key = key, capture.cfg = cfg, capture.opts = opts; return { units: {}, quarters: { Q1: { quarterGrade: 88 } }, completion: {}, lessons: [] }; },
  buildGradebook: () => ({ grid: true }),
  todayInTz: () => '2026-09-20',
});
const storeWith = (rows) => ({ all: () => Promise.resolve(rows), mergeAll: (a, b) => (a || []).concat(b || []) });
const queueWith = (recs) => ({ all: () => Promise.resolve(recs) });
const INPUTS = { redactedKey: { 'U1-L2-Q1': { answerKey: ' REDACTED ' } }, config: { schoolTz: 'America/New_York' }, schedule: {}, section: 'PeriodB', worksheetBlankCounts: {}, blooketLessons: [] };

describe('_phase2InputsKey — live-only in view-as', () => {
  it('keys by studentId in normal mode', () => {
    const H = harness({});
    expect(H._phase2InputsKey()).toBe('a2_grade_inputs_v1:stu-1');
  });
  it('returns null in view-as', () => {
    const H = harness({ vasContext: { studentId: 'x' } });
    expect(H._phase2InputsKey()).toBeNull();
  });
});

describe('_phase2QueueRows — OfflineQueue → ledger-row shape', () => {
  it('maps itemId→item_id and ts→recorded_at', async () => {
    const H = harness({ OfflineQueue: queueWith([{ itemId: 'WS-U1L2-Q1', source: 'worksheet', score: 0.5, ts: 1700000000000, attempt: 2 }]) });
    const rows = await H._phase2QueueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ item_id: 'WS-U1L2-Q1', source: 'worksheet', score: 0.5, attempt: 2 });
    expect(rows[0].recorded_at).toBe(new Date(1700000000000).toISOString());
  });
  it('drops records with no item_id', async () => {
    const H = harness({ OfflineQueue: queueWith([{ source: 'worksheet' }]) });
    expect(await H._phase2QueueRows()).toHaveLength(0);
  });
});

describe('_phase2ReDeriveGrade', () => {
  it('re-derives a /grade-shaped payload from local rows ∪ queue', async () => {
    const cap = {};
    const H = harness({
      GradeEngine: okEngine(cap),
      LedgerStore: storeWith([{ item_id: 'WS-U1L1-Q1', source: 'worksheet', score: 1 }]),
      OfflineQueue: queueWith([{ itemId: 'WS-U1L2-Q1', source: 'worksheet', score: 0.5, ts: 1700000000000, attempt: 1 }]),
    });
    H._phase2PersistInputs(INPUTS);
    const data = await H._phase2ReDeriveGrade();
    expect(data).toBeTruthy();
    expect(data._reDerived).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.quarters.Q1.quarterGrade).toBe(88);
    expect(data.gradebook).toEqual({ grid: true });
    expect(data.config).toEqual(INPUTS.config); // deep-equal: inputs round-trip through localStorage
    // engine ran over BOTH the stored row and the unsynced queue row, with the redacted key
    expect(cap.rows.map((r) => r.item_id).sort()).toEqual(['WS-U1L1-Q1', 'WS-U1L2-Q1']);
    expect(cap.key).toEqual(INPUTS.redactedKey);
  });

  it('returns null in view-as (never re-derives a student under a teacher)', async () => {
    const H = harness({ vasContext: { studentId: 'x' }, GradeEngine: okEngine(), LedgerStore: storeWith([{ item_id: 'A', source: 'worksheet' }]) });
    H._phase2PersistInputs(INPUTS);
    expect(await H._phase2ReDeriveGrade()).toBeNull();
  });

  it('returns null when no inputs are cached', async () => {
    const H = harness({ GradeEngine: okEngine(), LedgerStore: storeWith([{ item_id: 'A', source: 'worksheet' }]), OfflineQueue: queueWith([]) });
    expect(await H._phase2ReDeriveGrade()).toBeNull();
  });

  it('returns null when there are no rows (→ caller falls back to the cache)', async () => {
    const H = harness({ GradeEngine: okEngine(), LedgerStore: storeWith([]), OfflineQueue: queueWith([]) });
    H._phase2PersistInputs(INPUTS);
    expect(await H._phase2ReDeriveGrade()).toBeNull();
  });

  it('returns null when the engine bundle is absent', async () => {
    const H = harness({ GradeEngine: undefined, LedgerStore: storeWith([{ item_id: 'A', source: 'worksheet' }]) });
    H._phase2PersistInputs(INPUTS);
    expect(await H._phase2ReDeriveGrade()).toBeNull();
  });
});

describe('_phase2 verification wiring', () => {
  const verifyStore = (summary) => ({ verifyAll: () => Promise.resolve(summary) });

  it('caches the verify summary and invokes the callback', async () => {
    const H = harness({ LedgerStore: verifyStore({ verified: 3, unverified: 1, tampered: 0, total: 4, available: true }) });
    await new Promise((done) => H._phase2RefreshVerifySummary(done));
    expect(H.getVerifySummary()).toMatchObject({ verified: 3, total: 4, available: true });
  });

  it('does not verify in view-as', () => {
    let called = false;
    const H = harness({ vasContext: { studentId: 'x' }, LedgerStore: { verifyAll: () => { called = true; return Promise.resolve({}); } } });
    H._phase2RefreshVerifySummary();
    expect(called).toBe(false);
    expect(H.getVerifySummary()).toBeNull();
  });

  it('registers the roster issuer pubkey idempotently', async () => {
    const ISSUERS = [{ name: 'The Desk', pubkey: 'AAA' }];
    const fetchImpl = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ enabled: true, pubkey: 'ROSTERKEY' }) });
    const H = harness({ ReceiptVerify: { ISSUERS }, fetch: fetchImpl });
    H._phase2RegisterIssuer('https://roster.example');
    await new Promise((r) => setTimeout(r, 0));
    expect(ISSUERS.some((i) => i.pubkey === 'ROSTERKEY')).toBe(true);
    const before = ISSUERS.length;
    H._phase2RegisterIssuer('https://roster.example'); // idempotent (already registered)
    await new Promise((r) => setTimeout(r, 0));
    expect(ISSUERS.length).toBe(before);
  });
});
