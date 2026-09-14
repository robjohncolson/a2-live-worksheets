// grade-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P1.
// fast-check over the PURE grade-engine functions. Each property is an invariant that
// has actually bitten us (spec §4 catalog); property tests are exactly the tool for the
// "given any inputs, this must hold" claims that unit tests only spot-check.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { blooketScore, latestPerItem, unitOf, scoreAgainstKey } from '../scoring.js';
import { quarterGradeV3, combineV3, workAvgV3, V3_GATES } from '../lesson-grade.js';

const frac = () => fc.double({ min: 0, max: 1, noNaN: true });

describe('grade invariants (property tests)', () => {
  // ── Prop 1 — monotonic in the recorded score (pure recompute) ──────────────
  it('blooketScore is non-decreasing in `correct` and clamped to [0,1]', () => {
    fc.assert(fc.property(
      fc.nat({ max: 60 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 60 }),
      (correct, attempted, total) => {
        const c = Math.min(correct, attempted);
        const s = blooketScore(c, attempted, total);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        if (c + 1 <= attempted) {
          expect(blooketScore(c + 1, attempted, total)).toBeGreaterThanOrEqual(s); // more correct never lowers
        }
      },
    ));
  });

  it('quarterGradeV3 is non-decreasing in each track (grade never drops when a score rises)', () => {
    fc.assert(fc.property(frac(), frac(), frac(), (pc, work, bump) => {
      const g = quarterGradeV3(pc, work);
      expect(quarterGradeV3(Math.min(1, pc + bump), work)).toBeGreaterThanOrEqual(g - 1e-9);
      expect(quarterGradeV3(pc, Math.min(1, work + bump))).toBeGreaterThanOrEqual(g - 1e-9);
    }));
  });

  // ── Prop 2 — floor/ceiling gate ────────────────────────────────────────────
  it('quarterGradeV3 never exceeds the stronger track, and === max once BOTH clear the floor', () => {
    fc.assert(fc.property(frac(), frac(), (pc, work) => {
      const g = quarterGradeV3(pc, work);
      expect(g).toBeLessThanOrEqual(Math.max(pc, work) + 1e-9); // "unlocks max", never more
      expect(g).toBeGreaterThanOrEqual(0);
      if (pc >= V3_GATES.floor && work >= V3_GATES.floor) {
        expect(g).toBeCloseTo(Math.max(pc, work), 10);
      }
    }));
    expect(V3_GATES.floor).toBe(0.40);   // pin the gate constants the property depends on
    expect(V3_GATES.ceiling).toBe(0.70);
  });

  it('workAvgV3 stays in [0,1] (or null when no track is present)', () => {
    fc.assert(fc.property(
      fc.record({ lessons: fc.option(frac()), quizzes: fc.option(frac()), posters: fc.option(frac()), blooket: fc.option(frac()) }),
      (tracks) => {
        const w = workAvgV3(tracks);
        if (w != null) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1); }
      },
    ));
  });

  // ── Prop 3 — pre-PC short-circuit (no PC yet → grade IS the Work track) ─────
  it('combineV3 returns the present track when the other is null (un-due tracks never penalize)', () => {
    fc.assert(fc.property(frac(), (v) => {
      expect(combineV3(null, v)).toBe(v);  // no PC scheduled yet → exactly the Work track
      expect(combineV3(v, null)).toBe(v);
    }));
    expect(combineV3(null, null)).toBe(null);
  });

  // ── Prop 4 — ledger dedup: idempotent + input-order-independent (CRDT-flavored) ──
  const ledgerRow = () => fc.record({
    item_id: fc.constantFrom('WS-U1L1-Q1', 'WS-U2L3-Q2', 'BL-U1-L1-DESK_DONE', 'CR-U3-L1-DESK_DONE'),
    attempt: fc.integer({ min: 1, max: 3 }),
    recorded_at: fc.integer({ min: 0, max: 5 }).map((d) => `2026-01-0${d + 1}T00:00:00Z`),
    ledger_id: fc.uuid(),
    response: fc.string(),
  });
  it('latestPerItem is idempotent, order-independent, and one-row-per-item', () => {
    const winners = (a) => Object.fromEntries(a.map((r) => [r.item_id, r.ledger_id]));
    fc.assert(fc.property(fc.array(ledgerRow(), { maxLength: 20 }), (rows) => {
      const once = latestPerItem(rows);
      expect(winners(latestPerItem(once))).toEqual(winners(once));          // idempotent
      expect(winners(latestPerItem([...rows].reverse()))).toEqual(winners(once)); // order-independent
      expect(new Set(once.map((r) => r.item_id)).size).toBe(once.length);   // one row per item_id
    }));
  });

  // ── Prop 6 — hostile item_ids can't crash or pollute (the __proto__ class) ──
  it('hostile item_ids never throw or pollute Object.prototype', () => {
    const nasty = ['__proto__', 'constructor', 'prototype', '__proto__.polluted', 'toString'];
    const hostileRow = () => fc.record({
      item_id: fc.constantFrom(...nasty),
      attempt: fc.integer({ min: 1, max: 2 }),
      recorded_at: fc.constant('2026-01-01T00:00:00Z'),
      response: fc.string(),
    });
    fc.assert(fc.property(fc.array(hostileRow(), { maxLength: 10 }), (rows) => {
      expect(() => latestPerItem(rows)).not.toThrow();
      expect(() => scoreAgainstKey(rows, {})).not.toThrow();
      for (const r of rows) expect(() => unitOf(r.item_id, null)).not.toThrow();
    }));
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty('polluted')).toBe(false);
  });
});
