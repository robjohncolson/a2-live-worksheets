// submission-floodcap-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (prop 11).
// fast-check over SubmissionStore.floodCapVerify (§0.4/§5): the anti-farming cap that bounds
// how much a single student can push into the grow-only mesh per round. The invariants that
// matter: the caps are HARD (regardless of input size), base-verify runs FIRST so a forged/
// covered flood can't consume budget (starving legit rows), and under-budget nothing is lost.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'submission-store.js'), 'utf8');
function loadStore() {
  const win = { Date };
  runInContext(SRC, createContext({ window: win, globalThis: win, Date, JSON, String, Number, Array, Object, Promise, isFinite, Buffer }));
  return win.SubmissionStore;
}

let S;
beforeAll(() => { S = loadStore(); });

// Feed rows through a FRESH cap wrapper (counters are per-instance / per-round) and tally.
async function runCap(rows, opts, baseAccept = () => true) {
  const verify = S.floodCapVerify((row) => Promise.resolve(baseAccept(row)), opts);
  let admitted = 0; const byStudent = {}; const byItem = {};
  for (const r of rows) {
    if (await verify(r)) {
      admitted += 1;
      byStudent[r.student_id] = (byStudent[r.student_id] || 0) + 1;
      byItem[r.student_id + '|' + r.item_id] = (byItem[r.student_id + '|' + r.item_id] || 0) + 1;
    }
  }
  return { admitted, byStudent, byItem };
}
const rowArb = () => fc.record({ student_id: fc.constantFrom('A', 'B', 'C'), item_id: fc.constantFrom('i1', 'i2'), n: fc.integer() });

describe('submission flood cap (§0.4/§5, prop 11)', () => {
  it('never admits more than maxTotal / maxPerStudent / maxPerItem, whatever the input', async () => {
    await fc.assert(fc.asyncProperty(fc.array(rowArb(), { maxLength: 60 }), async (rows) => {
      const opts = { maxTotal: 10, maxPerStudent: 5, maxPerItem: 2 };
      const { admitted, byStudent, byItem } = await runCap(rows, opts);
      expect(admitted).toBeLessThanOrEqual(opts.maxTotal);
      for (const s of Object.keys(byStudent)) expect(byStudent[s]).toBeLessThanOrEqual(opts.maxPerStudent);
      for (const k of Object.keys(byItem)) expect(byItem[k]).toBeLessThanOrEqual(opts.maxPerItem);
    }), { numRuns: 40 });
  });

  it('base-verify runs FIRST: rejected rows consume no budget (a forged flood cannot starve legit rows)', async () => {
    await fc.assert(fc.asyncProperty(fc.array(rowArb(), { minLength: 1, maxLength: 40 }), async (flood) => {
      // A round where the base verifier rejects everything (forged/covered): 0 admitted, and
      // because budget was untouched, a legit row appended afterward still gets full cap.
      const verify = S.floodCapVerify((row) => Promise.resolve(row.ok === true), { maxTotal: 3, maxPerStudent: 3, maxPerItem: 3 });
      let admitted = 0;
      for (const r of flood) if (await verify({ ...r, ok: false })) admitted += 1;   // forged flood
      expect(admitted).toBe(0);
      let legit = 0;
      for (let i = 0; i < 3; i++) if (await verify({ student_id: 'Z', item_id: 'iZ', ok: true })) legit += 1;
      expect(legit).toBe(3);   // full budget survived the forged flood
    }), { numRuns: 30 });
  });

  it('admits every base-accepted row when under budget (no spurious drops)', async () => {
    await fc.assert(fc.asyncProperty(fc.array(rowArb(), { maxLength: 20 }), async (rows) => {
      const { admitted } = await runCap(rows, { maxTotal: 9999, maxPerStudent: 9999, maxPerItem: 9999 });
      expect(admitted).toBe(rows.length);
    }), { numRuns: 20 });
  });

  it('per-(student,item) budgets are independent — each key gets its own maxPerItem', async () => {
    const rows = [];
    for (const s of ['A', 'B', 'C']) for (const it of ['i1', 'i2']) for (let n = 0; n < 10; n++) rows.push({ student_id: s, item_id: it, n });
    const { byItem } = await runCap(rows, { maxTotal: 9999, maxPerStudent: 9999, maxPerItem: 3 });
    expect(Object.keys(byItem).length).toBe(6);                    // 3 students × 2 items
    for (const k of Object.keys(byItem)) expect(byItem[k]).toBe(3); // each flooded to exactly the cap
  });
});
