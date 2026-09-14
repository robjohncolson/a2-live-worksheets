// grade-sim-fixes.test.js — proves the F1/F3 perverse-incentive fixes WORK when
// their config flags are enabled, and that enabling them does not break the core
// invariants (A1 range, A2 ceiling, A3 monotonicity). Default-OFF behavior is
// pinned elsewhere (the finding tests in grade-sim*.test.js still reproduce the
// perverse cases under today's config). GRADE_FIX_F1_F3_BUILD.md.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeGrade } from '../grade.js';
import { computeLessonGrades, workAvgV3 } from '../lesson-grade.js';
import {
  CONFIG, QUARTER_KEY, ANSWER_KEY, GRADE_OPTS, ATOMS, materialize, isDueAtom, ARCHETYPES,
} from './fixtures/sim-world.js';

const EPS = 0.05;

// Config variants: fixes ON, with each F1-A mode.
const FIXES_BASE = { ...CONFIG, v3FixQuizZero: true, v3FixCwsReveal: true };
const FIX_ONLY_HELPS = { ...FIXES_BASE, v3AheadOfScheduleLessons: 'only-helps' };
const FIX_NOT_UNTIL_DUE = { ...FIXES_BASE, v3AheadOfScheduleLessons: 'not-until-due' };

function gradeWith(plan, config) {
  return computeGrade(materialize(plan), ANSWER_KEY, config, GRADE_OPTS).quarters[QUARTER_KEY];
}

const valueArb = fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null });
const planArb = fc.tuple(...ATOMS.map(() => valueArb))
  .map((vals) => new Map(ATOMS.map((a, i) => [a.id, vals[i]])));

describe('exit tickets are monotone through the real engine', () => {
  it('adding or raising an exit ticket never lowers either lesson grade, Work, or quarter', () => {
    fc.assert(fc.property(planArb, fc.nat(),
      fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }),
      (plan, pick, a, b) => {
        const targets = ATOMS.filter(atom => atom.kind === 'frq');
        const target = targets[pick % targets.length];
        const rows = materialize(plan);
        const exit = score => ({ ...target.makeRow(score), item_id: target.id.replace(/-reflect1$/, '-exitTicket') });
        const snapshots = [rows, [...rows, exit(Math.min(a, b))], [...rows, exit(Math.max(a, b))]];
        const maps = snapshots.map(items => computeLessonGrades(items, CONFIG.frqBand, ANSWER_KEY,
          GRADE_OPTS.lessonSchedule, { worksheetBlankCounts: GRADE_OPTS.worksheetBlankCounts }));
        const quarters = snapshots.map(items => computeGrade(items, ANSWER_KEY, FIX_NOT_UNTIL_DUE, GRADE_OPTS).quarters[QUARTER_KEY]);
        for (let i = 1; i < snapshots.length; i++) {
          for (const topic of target.backingTopics) {
            const before = maps[i - 1].get(topic), after = maps[i].get(topic);
            for (const field of ['lessonGrade', 'lessonGradeNoQuiz']) {
              if (before?.[field] == null) continue;
              expect(after[field]).toBeGreaterThanOrEqual(before[field]);
              expect(after[field]).toBeLessThanOrEqual(105);
            }
            if (before?.lessonGradeNoQuiz != null) {
              const workBefore = workAvgV3({ lessons: before.lessonGradeNoQuiz / 100, quizzes: 0.7 });
              const workAfter = workAvgV3({ lessons: after.lessonGradeNoQuiz / 100, quizzes: 0.7 });
              expect(workAfter).toBeGreaterThanOrEqual(workBefore);
            }
          }
          for (const field of ['workAvg', 'quarterGrade']) {
            if (quarters[i - 1][field] == null) continue;
            expect(quarters[i][field]).toBeGreaterThanOrEqual(quarters[i - 1][field]);
          }
        }
      }), { numRuns: 600, seed: 20260911 });
  });
});

// ── F1 fixed: ahead-of-schedule mediocre work no longer lowers the grade ──────
describe('FIX F1: doing ahead-of-schedule work no longer drops the grade', () => {
  // base = all due work perfect, no PC. more = base + future lesson 2.1 at 20%.
  const base = ARCHETYPES.work_grinder_pc_skipper();
  const more = ARCHETYPES.ahead_then_mediocre();

  it('TODAY (flags off): the perverse drop still reproduces (pins the finding)', () => {
    expect(gradeWith(more, CONFIG).quarterGrade).toBeLessThan(gradeWith(base, CONFIG).quarterGrade);
  });

  it("only-helps: more work does NOT lower the grade", () => {
    const b = gradeWith(base, FIX_ONLY_HELPS).quarterGrade;
    const m = gradeWith(more, FIX_ONLY_HELPS).quarterGrade;
    expect(m).toBeGreaterThanOrEqual(b - EPS);
  });

  it('not-until-due: more work does NOT lower the grade', () => {
    const b = gradeWith(base, FIX_NOT_UNTIL_DUE).quarterGrade;
    const m = gradeWith(more, FIX_NOT_UNTIL_DUE).quarterGrade;
    expect(m).toBeGreaterThanOrEqual(b - EPS);
  });
});

// ── F3 fixed: the first worksheet blank no longer drops the lesson ────────────
describe('FIX F3: doing one worksheet blank no longer lowers the grade', () => {
  // FRQ-only worksheets + perfect quizzes/blooket, no PC; then do 1 of 4 blanks.
  const base = new Map(ATOMS.map((a) => [a.id, null]));
  for (const a of ATOMS) {
    if (isDueAtom(a) && (a.kind === 'frq' || a.kind === 'quiz' || a.kind === 'blooket')) base.set(a.id, 1.0);
  }
  const more = new Map(base);
  more.set('WS-U1L1-Q1', 1.0);

  it('TODAY (flags off): the first blank still drops the grade (pins the finding)', () => {
    expect(gradeWith(more, CONFIG).quarterGrade).toBeLessThan(gradeWith(base, CONFIG).quarterGrade);
  });

  it('v3FixCwsReveal on: the first blank does NOT lower the grade', () => {
    const b = gradeWith(base, FIXES_BASE).quarterGrade;
    const m = gradeWith(more, FIXES_BASE).quarterGrade;
    expect(m).toBeGreaterThanOrEqual(b - EPS);
  });
});

// ── Invariants still hold under the SHIPPED policy (not-until-due + F1-B + F3) ──
describe('Core invariants survive the shipped fixes (not-until-due + F1-B + F3)', () => {
  it('A1: every output stays in [0,100]', () => {
    fc.assert(fc.property(planArb, (plan) => {
      const q = gradeWith(plan, FIX_NOT_UNTIL_DUE);
      for (const k of ['quarterGrade', 'ceiling', 'pcAvg', 'workAvg']) {
        if (q[k] == null) continue;
        expect(q[k]).toBeGreaterThanOrEqual(0);
        expect(q[k]).toBeLessThanOrEqual(100 + EPS);
      }
    }), { numRuns: 500 });
  });

  it('A2: ceiling >= quarterGrade', () => {
    fc.assert(fc.property(planArb, (plan) => {
      const q = gradeWith(plan, FIX_NOT_UNTIL_DUE);
      if (q.ceiling != null && q.quarterGrade != null) {
        expect(q.ceiling).toBeGreaterThanOrEqual(q.quarterGrade - EPS);
      }
    }), { numRuns: 500 });
  });

  it('A3: raising a present item never lowers the grade', () => {
    fc.assert(fc.property(planArb, fc.nat(), (plan, pick) => {
      const before = gradeWith(plan, FIX_NOT_UNTIL_DUE);
      if (before.quarterGrade == null) return;
      const raisable = [...plan.entries()].filter(([, v]) => v != null && v < 1);
      if (raisable.length === 0) return;
      const [id] = raisable[pick % raisable.length];
      const lifted = new Map(plan); lifted.set(id, 1.0);
      const after = gradeWith(lifted, FIX_NOT_UNTIL_DUE);
      expect(after.quarterGrade).toBeGreaterThanOrEqual(before.quarterGrade - EPS);
    }), { numRuns: 500 });
  });
});

// ── FINDING F4: 'only-helps' (an available but NON-shipped mode) violates A3 ────
// The threshold rule "include an early lesson iff its value >= the scheduled-due
// average" is non-monotonic: raising a scheduled lesson lifts the average, which
// can EVICT a previously-included above-average early lesson and lower the grade.
// This is WHY production ships 'not-until-due' instead. Pinned here so the flaw
// is documented and re-checked, NOT a guard on shipped behavior.
describe('F4: only-helps mode is non-monotonic (documents why it is not shipped)', () => {
  it('there exists a plan where raising one item LOWERS the only-helps grade', () => {
    let found = false;
    // Deterministic LCG over the value space (no Math.random — reproducible).
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 4000 && !found; i += 1) {
      const plan = new Map(ATOMS.map((a) => [a.id, rnd() < 0.4 ? null : rnd()]));
      const before = gradeWith(plan, FIX_ONLY_HELPS).quarterGrade;
      if (before == null) continue;
      for (const [id, v] of plan) {
        if (v == null || v >= 1) continue;
        const lifted = new Map(plan); lifted.set(id, 1.0);
        const after = gradeWith(lifted, FIX_ONLY_HELPS).quarterGrade;
        if (after < before - EPS) { found = true; break; }
      }
    }
    expect(found).toBe(true);
  });
});
