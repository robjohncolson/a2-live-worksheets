// ledger-merge-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (prop 9).
// fast-check over LedgerStore's PURE G-Set merge (mergeRow/mergeAll): the CRDT
// convergence laws. Devices gossip these merges P2P, so they MUST be idempotent,
// grow-only, and order/grouping-independent or two phones never agree on the ledger.
// This is the canonical thing property tests exist for.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'ledger-store.js'), 'utf8');
function loadStore() {
  const win = { Date };
  runInContext(SRC, createContext({ window: win, globalThis: win }));
  return win.LedgerStore;
}

let S;
beforeAll(() => { S = loadStore(); });

// Small key space so collisions actually happen. receipt_id rows dedup by hash; the
// rest fall back to source|item|attempt. ts is the LWW tiebreak.
const rowArb = () => fc.record({
  receipt_id: fc.option(fc.constantFrom('r1', 'r2', 'r3'), { nil: undefined }),
  source: fc.constantFrom('worksheet', 'curriculum_quiz'),
  item_id: fc.constantFrom('WS-U1L1-Q1', 'WS-U1L1-Q2', 'BL-U1-L1-DESK_DONE'),
  attempt: fc.integer({ min: 1, max: 2 }),
  ts: fc.integer({ min: 1, max: 10000 }),
  score: fc.integer({ min: 0, max: 100 }),
});
// Distinct ts per row → the max-ts winner for each key is a UNIQUE row, so we can
// assert full-row convergence (not just ts convergence).
const distinctTs = (rows) => rows.map((r, i) => ({ ...r, ts: (i + 1) * 3 }));

const keysOf = (list) => new Set(list.map((r) => S.keyOf(r)));
const winnerMap = (list) => { const m = new Map(); for (const r of list) m.set(S.keyOf(r), r); return m; };
// Reference impl: the winner per key is the max-ts row (>= matches pickNewer).
function refWinners(rows) {
  const m = new Map();
  for (const r of rows) { const k = S.keyOf(r); const c = m.get(k); if (!c || S.tsOf(r) >= S.tsOf(c)) m.set(k, r); }
  return m;
}

describe('LedgerStore G-Set merge — CRDT convergence laws (prop 9)', () => {
  it('idempotent: re-merging a set into itself changes nothing', () => {
    fc.assert(fc.property(fc.array(rowArb(), { maxLength: 20 }), (rows) => {
      const once = S.mergeAll([], rows);
      const twice = S.mergeAll(once, once);
      expect(keysOf(twice)).toEqual(keysOf(once));
      expect(twice.length).toBe(once.length);            // no growth from a re-merge
    }));
  });

  it('grow-only: a merge never drops a key, and size only grows', () => {
    fc.assert(fc.property(fc.array(rowArb(), { maxLength: 15 }), fc.array(rowArb(), { maxLength: 15 }), (a, b) => {
      const base = S.mergeAll([], a);
      const merged = S.mergeAll(base, b);
      for (const k of keysOf(base)) expect(keysOf(merged).has(k)).toBe(true);
      expect(merged.length).toBeGreaterThanOrEqual(base.length);
      expect(keysOf(merged).size).toBe(merged.length);   // still one row per key
    }));
  });

  it('commutative: any permutation converges to the same per-key winner', () => {
    fc.assert(fc.property(fc.array(rowArb(), { maxLength: 20 }), (raw) => {
      const rows = distinctTs(raw);
      const fwd = winnerMap(S.mergeAll([], rows));
      const rev = winnerMap(S.mergeAll([], [...rows].reverse()));
      const want = refWinners(rows);
      expect(new Set(fwd.keys())).toEqual(new Set(want.keys()));
      for (const [k, r] of want) {
        expect(S.tsOf(fwd.get(k))).toBe(S.tsOf(r));       // distinct ts ⇒ this pins the exact row
        expect(S.tsOf(rev.get(k))).toBe(S.tsOf(r));
        expect(fwd.get(k).score).toBe(r.score);
        expect(rev.get(k).score).toBe(r.score);
      }
    }));
  });

  it('associative: (A∪B)∪C converges the same as A∪(B∪C)', () => {
    const arr = () => fc.array(rowArb(), { maxLength: 10 });
    fc.assert(fc.property(arr(), arr(), arr(), (ra, rb, rc) => {
      const [a, b, c] = [distinctTs(ra), distinctTs(rb.map((r) => ({ ...r, ts: r.ts + 1 }))), distinctTs(rc.map((r) => ({ ...r, ts: r.ts + 2 })))];
      const A = S.mergeAll([], a);
      const left = S.mergeAll(S.mergeAll(A, b), c);
      const right = S.mergeAll(A, S.mergeAll(S.mergeAll([], b), c));
      const wl = winnerMap(left), wr = winnerMap(right);
      expect(new Set(wl.keys())).toEqual(new Set(wr.keys()));
      for (const [k, r] of wl) expect(S.tsOf(wr.get(k))).toBe(S.tsOf(r));
    }));
  });

  it('LWW: on a logical-key collision the higher-ts row always wins', () => {
    fc.assert(fc.property(
      fc.constantFrom('worksheet', 'curriculum_quiz'), fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 100 }), fc.integer({ min: 101, max: 200 }),
      (source, attempt, tLo, tHi) => {
        const lo = { source, item_id: 'WS-U1L1-Q1', attempt, ts: tLo, score: 10 }; // no receipt_id → fallback key
        const hi = { source, item_id: 'WS-U1L1-Q1', attempt, ts: tHi, score: 90 };
        expect(S.keyOf(lo)).toBe(S.keyOf(hi));                     // same logical key
        expect(S.mergeAll([], [lo, hi]).length).toBe(1);          // deduped
        expect(S.mergeAll([], [lo, hi])[0].ts).toBe(tHi);         // hi wins either order
        expect(S.mergeAll([], [hi, lo])[0].ts).toBe(tHi);
      },
    ));
  });
});
