import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeGrade } from '../grade.js';
import { CONFIG, QUARTER_KEY, ANSWER_KEY, GRADE_OPTS, GRADE_OPTS_EARLY, ATOMS, materialize, isDueAtom, ARCHETYPES }
  from './fixtures/sim-world.js';

// Rounding slack. Every grade output is single-rounded to 0.1 and rounding is
// monotonic, so true inequalities survive rounding; 0.05 is pure safety margin.
const EPS = 0.05;

// THE ORACLE: a trajectory (plan) -> the Q1 quarter result from the real engine.
function gradeOf(plan) {
  const rows = materialize(plan);
  const result = computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
  return result.quarters[QUARTER_KEY];
}

// Same oracle at the EARLY snapshot (no PC due → PC track null) — for A9.
function gradeOfEarly(plan) {
  const rows = materialize(plan);
  const result = computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS_EARLY);
  return result.quarters[QUARTER_KEY];
}

// -- Trajectory generator (the fuzz source shared with B/C) --------------------
// A plan maps every atom.id -> a value v in [0,1], or null (not attempted).
const valueArb = fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null });
const planArb = fc
  .tuple(...ATOMS.map(() => valueArb))
  .map((vals) => new Map(ATOMS.map((a, i) => [a.id, vals[i]])));

const NUM_RUNS = 600;

// A4 was SPECIFIED as "adding a 100% item to an already-due slot never lowers
// the grade — HOLDS". The simulator REFUTED it (fast-check shrank to a worksheet
// blank). Reclassified to CANDIDATE FINDING F3 and pinned deterministically.
// Root cause: the Lessons feeder Cws is the worksheet-blank completion fraction
// over ALL blanks; it is null (ignored, FRQ carries the lesson) until the FIRST
// blank is recorded, then present at sum/blankCount with the unfilled blanks as
// zeros. So your first correct blank "reveals" the rest as 0 and DROPS the
// lesson. Same family as F1 (a feeder absent-vs-present discontinuity).
describe('A4/F3: doing ONE worksheet blank can LOWER the grade (partial-worksheet penalty)', () => {
  // expected verdict: CANDIDATE FINDING (documented in GRADE_SIMULATION_FINDINGS.md)
  it('FINDING: first correct blank flips Cws from absent (FRQ=100) to 1/4=25, tanking the lesson', () => {
    // FRQ-only worksheets (no blanks), perfect quizzes + Blooket, no PC → work-bound.
    const base = new Map(ATOMS.map((a) => [a.id, null]));
    for (const a of ATOMS) {
      if (isDueAtom(a) && (a.kind === 'frq' || a.kind === 'quiz' || a.kind === 'blooket')) {
        base.set(a.id, 1.0);
      }
    }
    // The student does exactly ONE of lesson 1.1's four blanks, perfectly.
    const more = new Map(base);
    more.set('WS-U1L1-Q1', 1.0);

    const before = gradeOf(base).quarterGrade;
    const after = gradeOf(more).quarterGrade;

    // More (perfect) work → lower grade. Lesson 1.1 itself falls 100 → 75.
    expect(after).toBeLessThan(before);
  });
});

describe('A6: attempting a due quiz never lowers the grade vs leaving it blank', () => {
  // expected verdict: HOLDS
  it('a due blank quiz already counts as 0, so a 0-credit attempt cannot hurt', () => {
    fc.assert(
      fc.property(fc.nat(), (pick) => {
        // Base = all due WORK perfect, but due quizzes left BLANK (the grinder
        // sets due quizzes to 1.0, which would make this vacuous — blank them so
        // "leaving it blank" is genuinely the baseline being compared against).
        const base = ARCHETYPES.work_grinder_pc_skipper();
        for (const a of ATOMS) {
          if (a.kind === 'quiz' && isDueAtom(a)) base.set(a.id, null);
        }
        const before = gradeOf(base);
        if (before.quarterGrade == null) return;

        const attemptable = ATOMS.filter(
          (a) => a.kind === 'quiz' && isDueAtom(a) && base.get(a.id) == null,
        );
        if (attemptable.length === 0) return;

        const atom = attemptable[pick % attemptable.length];
        const attempted = new Map(base);
        attempted.set(atom.id, 0);
        const after = gradeOf(attempted);

        expect(after.quarterGrade).not.toBeNull();
        expect(after.quarterGrade).toBeGreaterThanOrEqual(before.quarterGrade - EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('A7: single-track ceiling', () => {
  // expected verdict: HOLDS
  it('one present track below 40% caps the quarter grade at 70%', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const q = gradeOf(plan);
        if (q.pcAvgRaw == null || q.workAvgRaw == null) return;
        if (q.pcAvgRaw >= 0.40 && q.workAvgRaw >= 0.40) return;

        expect(q.quarterGrade).not.toBeNull();
        expect(q.quarterGrade).toBeLessThanOrEqual(70 + EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('A8: both tracks cleared -> max', () => {
  // expected verdict: HOLDS
  it('when both raw tracks are at least 40%, quarterGrade is max(pcAvg, workAvg)', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const q = gradeOf(plan);
        if (q.pcAvgRaw == null || q.workAvgRaw == null) return;
        if (q.pcAvgRaw < 0.40 || q.workAvgRaw < 0.40) return;

        expect(q.quarterGrade).not.toBeNull();
        expect(q.pcAvg).not.toBeNull();
        expect(q.workAvg).not.toBeNull();
        expect(Math.abs(q.quarterGrade - Math.max(q.pcAvg, q.workAvg))).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('A9: a fully-null track is renormalized away (no phantom zero)', () => {
  // expected verdict: HOLDS
  // At the EARLY snapshot no PC is due, so the PC track is genuinely null. The
  // engine must then set the grade from the present (Work) track ALONE —
  // combineV3(null, work) === work — and NOT average the absent PC track in as a
  // 0. (At AS_OF both tracks are always present, so this can only be shown early.)
  it('with PC not due, quarterGrade equals workAvg — the absent PC track is not a 0', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const q = gradeOfEarly(plan);
        // PC is not due at the early snapshot → PC track absent.
        expect(q.pcAvg).toBeNull();
        // The grade is the present Work track verbatim, not dragged toward 0.
        if (q.workAvg == null) {
          expect(q.quarterGrade).toBeNull();
          return;
        }
        expect(q.quarterGrade).not.toBeNull();
        expect(Math.abs(q.quarterGrade - q.workAvg)).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
