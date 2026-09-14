// grade-sim.test.js — Grade-policy SIMULATOR, foundation slice (Layer A).
// GRADE_SIMULATION_SPEC.md §3, §8. Drives the REAL grade engine (computeGrade)
// over fuzzed student trajectories and asserts the core invariants. NO copy of
// the math — computeGrade IS the oracle, so these never drift from production.
//
// Foundation (this file): the trajectory generator + archetypes + A1/A2/A3.
// Breadth (A4–A9), the Layer-B sweep, and the Layer-C Redex model are dispatched
// to Codex on top of this fixture + generator.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeGrade } from '../grade.js';
import {
  CONFIG, QUARTER_KEY, ANSWER_KEY, GRADE_OPTS,
  ATOMS, materialize, isDueAtom, ARCHETYPES,
} from './fixtures/sim-world.js';

// Rounding slack. Every grade output is single-rounded to 0.1 and rounding is
// monotonic, so true inequalities survive rounding; 0.05 is pure safety margin.
const EPS = 0.05;

// THE ORACLE: a trajectory (plan) → the Q1 quarter result from the real engine.
function gradeOf(plan) {
  const rows = materialize(plan);
  const result = computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
  return result.quarters[QUARTER_KEY];
}

// ── Trajectory generator (the fuzz source shared with B/C) ────────────────────
// A plan maps every atom.id → a value v ∈ [0,1], or null (not attempted).
const valueArb = fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null });
const planArb = fc
  .tuple(...ATOMS.map(() => valueArb))
  .map((vals) => new Map(ATOMS.map((a, i) => [a.id, vals[i]])));

const NUM_RUNS = 600;

describe('grade-sim: oracle wiring sanity', () => {
  it('an empty trajectory grades without throwing and stays in range', () => {
    const q = gradeOf(new Map());
    for (const k of ['quarterGrade', 'ceiling', 'pcAvg', 'workAvg']) {
      if (q[k] != null) {
        expect(q[k]).toBeGreaterThanOrEqual(0);
        expect(q[k]).toBeLessThanOrEqual(100 + EPS);
      }
    }
  });

  it('archetype: diligent_on_pace clears both tracks → near-max grade', () => {
    const q = gradeOf(ARCHETYPES.diligent_on_pace());
    // pcAvg=100 (unit-1 PC), workAvg high → both ≥ 40 → max(pc, work).
    expect(q.quarterGrade).toBeGreaterThanOrEqual(90);
  });

  

  
});

// ── A1. Bounded range — HOLDS ─────────────────────────────────────────────────
describe('A1: every grade output is in [0,100] ∪ {null}', () => {
  it('no decision path yields > 100 or < 0 (the Show-Answers exploit class)', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const q = gradeOf(plan);
        for (const k of ['quarterGrade', 'ceiling', 'pcAvg', 'workAvg']) {
          const v = q[k];
          if (v == null) continue;
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100 + EPS);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ── A2. Ceiling dominates — HOLDS ─────────────────────────────────────────────
describe('A2: ceiling ≥ quarterGrade', () => {
  it('you can never be above your own best case', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const q = gradeOf(plan);
        if (q.ceiling != null && q.quarterGrade != null) {
          expect(q.ceiling).toBeGreaterThanOrEqual(q.quarterGrade - EPS);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ── A5. Strong add-monotonicity — CANDIDATE FINDING (the policy surfaces a
// perverse incentive). This is the scientific payoff: the simulator demonstrates
// that doing MORE work can LOWER your grade. Documented in
// GRADE_SIMULATION_FINDINGS.md; this deterministic test PINS the finding (it
// passes by confirming the perverse case reproduces — if the engine is later
// changed so it no longer does, this test fails and flags that the finding is
// stale, which is the correct signal).
describe('A5: doing more (ahead-of-schedule, mediocre) work can LOWER the grade', () => {
  it('FINDING: starting a future lesson and doing it poorly drops the quarter grade', () => {
    // Baseline: all DUE work done perfectly, no PC → work-bound grade (~70 ceiling).
    const base = ARCHETYPES.work_grinder_pc_skipper();

    // Same student ALSO starts the future lesson 2.1 and does it poorly (20%).
    // 2.1 now counts as "due" (it has recorded work) → it joins the Lessons-track
    // denominator at 20% AND its un-taken quiz joins the Quizzes track as a 0,
    // dragging workAvg down. The student did strictly MORE work.
    const more = new Map(base);
    for (const a of ATOMS) {
      if (a.kind === 'worksheet' && a.backingTopics.includes('2.1')) more.set(a.id, 0.2);
    }

    const before = gradeOf(base).quarterGrade;
    const after = gradeOf(more).quarterGrade;

    // The perverse incentive: MORE work → LOWER grade.
    expect(after).toBeLessThan(before);
  });
});

// ── A3. Score-monotonicity (restricted) — HOLDS (the core guarantee) ──────────
describe('A3: raising the score of a present item never lowers the grade', () => {
  it('max/mean track-mixing stays monotonic in each raised item', () => {
    fc.assert(
      fc.property(planArb, fc.nat(), (plan, pick) => {
        const base = gradeOf(plan);
        if (base.quarterGrade == null) return; // raising only adds signal

        const raisable = [...plan.entries()].filter(([, v]) => v != null && v < 1);
        if (raisable.length === 0) return; // nothing to raise

        const [id] = raisable[pick % raisable.length];
        const lifted = new Map(plan);
        lifted.set(id, 1.0); // raise this one item to full credit
        const after = gradeOf(lifted);

        expect(after.quarterGrade).not.toBeNull();
        expect(after.quarterGrade).toBeGreaterThanOrEqual(base.quarterGrade - EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
