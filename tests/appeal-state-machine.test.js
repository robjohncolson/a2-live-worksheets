// appeal-state-machine.test.js — a pure model of the reflection APPEAL state
// machine (STATE_MACHINES.md §12-13), EXHAUSTIVELY model-checked. The real logic
// lives in every worksheet's submitAppeal + recordReflectionToGradebook (e.g.
// u1_lesson1_live.html ~L1701/L1206/L2290). The appeal space is tiny (3 verdicts,
// <=3 appeals), so we enumerate EVERY initial-grade + appeal-sequence and assert
// the invariants — a proof, not a sample.
//
// Findings are documented in GRADE_SIMULATION_FINDINGS.md (F5/F6).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';

const VERDICTS = ['I', 'P', 'E'];
const RANK = { I: 0, P: 1, E: 2 };

// canAppeal gate: worksheet L1703 (appealCount<3) + STATE_MACHINES canAppeal
// (score !== 'E'). Appealing an E is not offered.
function canAppeal(s) {
  return s.score !== 'E' && s.appealCount < 3;
}

// The appeal-resolution transition EXACTLY as the worksheet implements it.
//   display/gradingState: ALWAYS set to the appeal score (L1738) — NO guard.
//   gradebook record:
//     'base'    — recordReflectionToGradebook (L1206): records whatever it is.
//     'overlay' — the _aiFrqFloor monkey-patch (L2290): records only if it RAISES
//                 the floor (`if (nr <= floor) return`).
function applyAppeal(s, appealScore, mode) {
  if (s.appealCount >= 3) return s; // hard entry gate
  // 'clamped' = the SHIPPED F5/F6 fix (wire-appeal-clamp.mjs): the appeal verdict
  // is clamped to >= the previous BEFORE anything reads it, so display AND
  // gradebook AND the upgraded flag all flow from the guarded value.
  const effective = (mode === 'clamped' && RANK[appealScore] < RANK[s.score]) ? s.score : appealScore;
  const nr = RANK[effective];
  let gradebook = s.gradebook;
  let floor = s.floor;
  if (mode === 'overlay') {
    if (nr > floor) { gradebook = effective; floor = nr; } // never downgrade
  } else {
    gradebook = effective;                   // base/clamped: always record
    floor = Math.max(floor, nr);
  }
  const upgraded = effective === 'E' || (s.score === 'I' && effective === 'P');
  return {
    score: effective,                        // display/state (clamped → guarded)
    gradebook,
    floor,
    appealCount: s.appealCount + 1,
    history: [...s.history, { prev: s.score, appealScore: effective, upgraded }],
  };
}

function initialState(grade) {
  return { score: grade, gradebook: grade, floor: RANK[grade], appealCount: 0, history: [] };
}

// Enumerate every initial grade + every appeal sequence (length 0..3) of verdicts.
// Returns the list of full run traces (each: array of states from initial onward).
function allRuns(mode) {
  const runs = [];
  function extend(state, trace) {
    runs.push(trace);
    if (!canAppeal(state)) return;        // can't appeal further
    for (const v of VERDICTS) {
      const next = applyAppeal(state, v, mode);
      extend(next, [...trace, next]);
    }
  }
  for (const g of VERDICTS) {
    const s0 = initialState(g);
    extend(s0, [s0]);
  }
  return runs;
}

// ── Invariants that HOLD in BOTH modes ────────────────────────────────────────
describe('appeal machine: structural invariants (HOLD)', () => {
  for (const mode of ['base', 'overlay']) {
    it(`[${mode}] appealCount never exceeds 3`, () => {
      for (const trace of allRuns(mode)) {
        for (const s of trace) expect(s.appealCount).toBeLessThanOrEqual(3);
      }
    });

    it(`[${mode}] EXHAUSTED is terminal (no transition once appealCount===3)`, () => {
      for (const trace of allRuns(mode)) {
        const last = trace[trace.length - 1];
        if (last.appealCount === 3) {
          // applying any further appeal is a no-op (the entry gate returns s).
          for (const v of VERDICTS) expect(applyAppeal(last, v, mode)).toBe(last);
        }
      }
    });

    it(`[${mode}] every score + gradebook stays in {E,P,I}`, () => {
      for (const trace of allRuns(mode)) {
        for (const s of trace) {
          expect(VERDICTS).toContain(s.score);
          expect(VERDICTS).toContain(s.gradebook);
        }
      }
    });

    it(`[${mode}] you cannot appeal an E (canAppeal gate)`, () => {
      // No run ever transitions FROM a score of 'E'.
      for (const trace of allRuns(mode)) {
        for (let i = 1; i < trace.length; i++) {
          expect(trace[i - 1].score).not.toBe('E');
        }
      }
    });
  }
});

// ── "AI only ever raises" — the gradebook invariant ──────────────────────────
describe('appeal machine: "AI only ever raises" (gradebook)', () => {
  it('OVERLAY mode: the gradebook score is monotonically non-decreasing (HOLDS)', () => {
    for (const trace of allRuns('overlay')) {
      for (let i = 1; i < trace.length; i++) {
        expect(RANK[trace[i].gradebook]).toBeGreaterThanOrEqual(RANK[trace[i - 1].gradebook]);
      }
    }
  });

  // FINDING F5: the BASE record path (no overlay) LOWERS the gradebook on a
  // downgrade appeal — so "AI only ever raises" depends entirely on the overlay
  // monkey-patch being present + its floor seeded. This test PINS that the base
  // path is NOT self-protecting (it finds a violating run).
  it('BASE mode: the gradebook CAN be lowered by an appeal (FINDING F5)', () => {
    let violating = null;
    for (const trace of allRuns('base')) {
      for (let i = 1; i < trace.length; i++) {
        if (RANK[trace[i].gradebook] < RANK[trace[i - 1].gradebook]) {
          violating = trace.map((s) => s.gradebook);
          break;
        }
      }
      if (violating) break;
    }
    // e.g. P -> appeal returns I -> gradebook drops P->I with no overlay guard.
    expect(violating).not.toBeNull();
  });
});

// ── The SHIPPED FIX (clamped mode) resolves F5 + F6 ──────────────────────────
describe('FIX (clamped): an appeal can never lower the grade — F5 + F6 resolved', () => {
  it('gradebook is monotonically non-decreasing (F5 fixed, no overlay needed)', () => {
    for (const trace of allRuns('clamped')) {
      for (let i = 1; i < trace.length; i++) {
        expect(RANK[trace[i].gradebook]).toBeGreaterThanOrEqual(RANK[trace[i - 1].gradebook]);
      }
    }
  });

  it('the DISPLAYED score is monotonically non-decreasing (F6 fixed)', () => {
    for (const trace of allRuns('clamped')) {
      for (let i = 1; i < trace.length; i++) {
        expect(RANK[trace[i].score]).toBeGreaterThanOrEqual(RANK[trace[i - 1].score]);
      }
    }
  });

  it('the upgraded flag is honest: true iff the score strictly increased', () => {
    for (const trace of allRuns('clamped')) {
      for (let i = 1; i < trace.length; i++) {
        const step = trace[i].history[trace[i].history.length - 1];
        const rose = RANK[trace[i].score] > RANK[trace[i - 1].score];
        expect(step.upgraded).toBe(rose);
      }
    }
  });
});

// ── Display/state honesty — FINDING F6 ───────────────────────────────────────
describe('appeal machine: display/state vs "Score maintained" (FINDING F6)', () => {
  it('the DISPLAYED score can drop while upgraded=false says "maintained"', () => {
    // submitAppeal sets state.result = appealResult unconditionally, and the UI
    // shows "Score maintained" whenever upgraded===false — so a P->I appeal both
    // LOWERS the shown score AND labels it "maintained". Pin that this exists.
    let found = false;
    for (const trace of allRuns('overlay')) { // mode-independent: display is unguarded
      for (let i = 1; i < trace.length; i++) {
        const step = trace[i].history[trace[i].history.length - 1];
        const dropped = RANK[trace[i].score] < RANK[trace[i - 1].score];
        if (dropped && step.upgraded === false) { found = true; break; }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});
