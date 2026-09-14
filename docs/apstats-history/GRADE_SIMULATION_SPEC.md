# GRADE_SIMULATION_SPEC.md

> **Status:** DRAFT v1 (2026-06-16, session 13). Authoritative contract for the grade-policy
> simulator. Spec-first; in-session builds Layer A's foundation slice, then Codex subagents
> implement the breadth (Layers A-breadth, B, C) against this document.

## 0. Why this exists

The grading policy is the part of the platform where **hidden exploits and perverse incentives
hide** — we already shipped one (Show-Answers = free 100%). We want to *explore the outcome space*:
"given any sequence of student decisions, what grade falls out, and does the policy reward the
behaviors we intend?" — by **search**, not by waiting for a teacher to notice.

The grading engine (`roster-server/lesson-grade.js`) is already pure, I/O-free, and explicitly
"designed to be unit-tested independently of the server." A student's grade is a **fold over an
event stream** (ledger rows). So we do not re-model the math — we feed the *real* engine synthetic
trajectories and assert invariants over thousands of them.

### Non-goals
- Not a re-implementation of the grade math (that would create a second source of truth that rots).
- Not a change to the shipping grade engine. The simulator is **read-only** over `lesson-grade.js`.
  If it finds a bug, we file it; fixes are a separate, reviewed change.
- Not shipped to students. Lives in `tests/` + `tools/`; adds nothing to any student-facing bundle.

## 1. The three layers

| Layer | What | Language | Who builds it |
|-------|------|----------|---------------|
| **A** | Simulator + property harness against the **real** `computeQuarterV3` | JS (Vitest + fast-check) | Foundation slice **in-session**; breadth → Codex |
| **B** | Policy-design sandbox: sweep `config`/weights over a synthetic population, print outcome distributions | JS (CLI in `tools/`) | Codex, on the proven Layer-A generator |
| **C** | Formal artifact: PLT Redex model of the item state machines + the quarter fold, cross-checked against the JS oracle | Racket (PLT Redex) | Codex, with a JS oracle harness from Layer A |

Rationale for the split is in the session transcript; the short version: A+B reuse the real code
(**zero drift**, runs in CI); C is the rigor/teaching artifact and is only honest because A exists
to cross-check it. Redex over Haskell because Redex is purpose-built for runnable reduction
semantics + `redex-check` randomized testing, and our domain is arithmetic over event streams (not
type-driven structure, where Haskell would shine).

## 2. The oracle — the real pipeline

The simulator MUST drive the production functions, never a copy. Entry path (mirrors
`roster-server/grade.js`):

```
trajectory (ledger rows[])
  → latestPerItem(rows)                         // scoring.js — dedupe latest per item_id
  → computeLessonGrades(rows, frqBand, answerKey, schedule, { worksheetBlankCounts, weights })
  → lessonMap  (Map<topicKey, lessonResult>)
  → computeQuarterV3({ quarterKey, config, lessonMap, schedule, todayDateStr, section,
                       unitPcData, gradingWindowStart, blooketLessons, quizLessons })
  → { quarterGrade, ceiling, pcAvg, workAvg, pcAvgRaw, workAvgRaw, workTracks, ... }
```

PC scores do **not** flow through `computeLessonGrades` (PC is unit-scoped). The simulator computes
`unitPcData` separately from PC rows in the trajectory using the same raw-% convention the server
uses (`U{n}-PC-Q{m}` rows → per-unit correct/total × 100). This is part of the in-session foundation
slice and must match `grade.js`'s PC assembly — read `grade.js` lines ~100-185 before implementing.

### 2.1 A "trajectory" — the input model

A trajectory is `{ rows: LedgerRow[], section, todayDateStr }` where a `LedgerRow` is the minimal
shape the engine reads:

```
{ item_id: string,        // e.g. "WS-U1L1-Q3", "U1-L1-Q2", "U1-PC-Q5", "BLOOKET-U1L1", "<frq>"
  source: string,         // 'worksheet' | 'frq' | 'curriculum_quiz' | 'pc' | 'blooket' | 'quiz_review' | ...
  score: number|null,     // semantics per source (see lesson-grade.js)
  response: any,          // for curriculum_quiz: scored against answerKey
  recorded_at: string }   // ISO; latestPerItem keeps the latest per item_id
```

A trajectory is generated from a **student archetype** acting against a **fixed fixture world**
(schedule + answerKey + worksheetBlankCounts + blooketLessons + quizLessons + config). The world is
small but realistic: ≥2 units, combined-worksheet lessons, quiz-less openers, a unit with a PC.

### 2.2 The fixture world

Build ONE canonical fixture module (`tests/fixtures/sim-world.js`) reused by A/B and exported for C:
- `schedule`: ~2 units, mixed solo + combined (`worksheetKey: "1-2"`), some quiz-less openers,
  period B/E dates spanning two quarters, at least one null-date (not-yet-scheduled) lesson.
- `answerKey`: covers the quiz items so `computeQuizTotals` has denominators.
- `worksheetBlankCounts`: per-lesson blank counts (the Cws denominator).
- `blooketLessons`, `quizLessons`: the per-track denominators.
- `config`: a test config in the shape of `PHASE3_CONFIG` with `useV3: true`.
Keep it inspectable — every property failure is debugged against this one world.

## 3. Layer A — invariants

Each invariant is a fast-check property: generate N random trajectories, assert. **Shrinking is the
point** — on failure we want the *minimal* trajectory that breaks it. Each property documents its
**expected verdict** (HOLDS = policy is sound on this axis; CANDIDATE FINDING = we expect it may
fail and that failure is a real policy issue to surface to the teacher, not a test bug).

### A1. Bounded range — HOLDS
`quarterGrade`, `ceiling`, `pcAvg`, `workAvg` ∈ [0, 100] ∪ {null} for every trajectory.
No decision path yields > 100. (The Show-Answers class of exploit lands here.)

### A2. Ceiling dominates — HOLDS
`ceiling >= quarterGrade` whenever both are non-null. You can never be above your own best case.

### A3. Score-monotonicity (restricted) — HOLDS (the core guarantee)
Take a trajectory; pick any present gradable item; **raise its score** (worksheet blank, FRQ band,
quiz credit, blooket, PC). `quarterGrade` must not decrease. This is the single most important
property — max/mean track-mixing is where it's most likely to silently break.

### A4. Add-a-perfect-item monotonicity (restricted) — HOLDS
Adding a **100%** item for an **already-due** lesson/quiz/PC never decreases `quarterGrade`.

### A5. Strong add-monotonicity — **CANDIDATE FINDING (expected to FAIL)**
Adding **any** item (any score, including a *mediocre ahead-of-schedule* lesson) never decreases
`quarterGrade`. We expect this to fail: the Lessons-track denominator is *all due lessons*, and a
lesson counts as "due" once it has any recorded work — so starting a future lesson and doing it
poorly can lower the average. When A5 fails, the shrunk counterexample is the **teacher-facing
finding**: "doing more (future) work can hurt you." Spec captures the verdict; the teacher decides
whether to change the policy.

### A6. No-quiz-attempt floor — HOLDS
A due quiz-bearing lesson with no attempt scores 0 in the quiz track; *attempting* it (credit ≥ 0)
never lowers `quizzesAvg` (replaces an implicit 0 with actual credit). Same shape for blooket make-ups.

### A7. Single-track ceiling — HOLDS
If one track (`pcAvgRaw` or `workAvgRaw`) is < 0.40 and the other is present, `quarterGrade` ≤ 70.0
(+ rounding ε). The 70%-of-track gaming bound actually holds end-to-end, not just in `quarterGradeV3`.

### A8. Both-tracks-cleared reward — HOLDS
If `pcAvgRaw >= 0.40` and `workAvgRaw >= 0.40`, `quarterGrade ≈ max(pcAvg, workAvg)` (+ ε).

### A9. Null-track neutrality — HOLDS
A track that is entirely null (no due items) is renormalized away — its presence/absence with all
nulls does not change `quarterGrade`. (Guards against a phantom-0 leak.)

> Codex may PROPOSE additional invariants in the breadth phase, but must tag each with an expected
> verdict and justify it against the engine source. New CANDIDATE FINDINGs are valuable.

## 4. Layer B — policy-design sandbox

A CLI: `node tools/grade-sim-sweep.mjs`. Reuses the Layer-A trajectory generator to produce a
**fixed synthetic population** of student archetypes (see §5), then sweeps a named knob and prints
the outcome distribution per setting.

- Knobs: `V3_WORK_WEIGHTS.{lessons,quizzes,posters,blooket}`, `quarterGradeV3` floors (0.40) and
  ceiling (0.70), `config.C`, `lessonFeederWeights`, `quarters[*].pcAnchor`.
- Output per setting: median, mean, p10, p90, and the delta vs baseline, for the whole population
  and for the bottom quartile (the population we most care about not breaking).
- **Deterministic:** seed the population so a sweep is reproducible run-to-run.
- Read-only over the engine: a sweep passes a cloned `config`, never mutates the shipping constant.

## 5. Student archetypes

A small set of named generators (shared by A's fuzzing seeds and B's population):
- `diligent_on_pace` — does each lesson at high quality on its due date.
- `pc_ace_work_skipper` — bombs/skips lessons, aces the PC (probes A7/A8).
- `work_grinder_pc_skipper` — does all work well, never takes the PC (symmetric probe).
- `behind_then_sprints` — nothing until late, then a burst (probes due-date dynamics).
- `ahead_then_mediocre` — starts future lessons at low quality (the A5 finding driver).
- `random_walk` — fully random rows (the fast-check fuzz baseline).

## 6. Layer C — PLT Redex formal model

- Encode the per-item state machines from `STATE_MACHINES.md` (item: Unchecked → Correct/Partial/
  Incorrect/Revealed; appeal: Empty → Graded → Appealed×≤3 → Exhausted) as Redex reduction rules,
  and the quarter fold as Redex metafunctions mirroring `quarterGradeV3` / `workAvgV3` / `combineV3`.
- **Cross-check (the anti-rot mechanism):** a JS harness (built in Layer A) emits random trajectories
  + the oracle's `quarterGrade`; a Racket harness runs the same trajectories through the Redex model;
  assert equality within rounding tolerance. A divergence means the model drifted from the engine —
  catch it in CI-adjacent run, not by hand.
- Lives in `formal/grade-model/` (Racket). Documented run instructions in its own README. Standalone
  toolchain — NOT wired into `npm test`; run on demand + before publishing the artifact.

## 7. Decisions / open questions (resolve before C)

1. **Rounding tolerance for the cross-check** — engine rounds to 0.1 at several points; the Redex
   model must replicate the *same* rounding points or compare within ±0.1. Default: replicate exactly.
2. **PC raw-% assembly** — confirm the simulator's PC aggregation matches `grade.js` exactly
   (in-session task; the only oracle input not produced by `computeLessonGrades`).
3. **Does Layer C earn its keep?** — decide AFTER Layer A ships. If A's fuzzing already gives
   confidence and the team doesn't want a Racket toolchain, C stays optional/deferred.

## 8. Dispatch plan (Codex via cross-agent runner)

- **In-session (foundation, NOT dispatched):** the fixture world (§2.2), the trajectory generator
  for ≥2 archetypes, the oracle wiring (incl. PC assembly), and invariants **A1, A2, A3** green
  against the real engine. This proves the pattern and is the oracle everything else checks against.
- **Codex batch 1 (after foundation green):** remaining invariants A4–A9 + the full archetype set
  (§5). Owned paths: `roster-server/tests/grade-sim-*.test.js`, `tests/fixtures/sim-world.js`.
- **Codex batch 2 (parallel-safe with batch 1; depends only on the generator):** Layer B sweep CLI
  `tools/grade-sim-sweep.mjs`.
- **Codex batch 3 (depends on A foundation + a JS oracle-export):** Layer C Redex model in
  `formal/grade-model/`.
- Per `feedback_session_division_of_labor`: ALWAYS run the suite in-session after folding any Codex
  diff (its harness skips verification). Per `feedback_codex_overengineers_small_fixes`: give Codex
  the exact API + "edit in place, no wrappers" + ≥600s timeout, and only delegate the big bounded
  builds — never the subtle oracle.

## 9. Verification

- `cd roster-server && npm test` (the sim tests live next to the engine they exercise) stays green,
  including the new `grade-sim-*` files.
- `node tools/grade-sim-sweep.mjs` runs deterministically and prints a distribution table.
- (If C is built) the Racket cross-check passes on ≥1000 random trajectories.
- Every CANDIDATE FINDING that fails is written up (minimal counterexample + the policy question it
  raises) in a `GRADE_SIMULATION_FINDINGS.md` for the teacher — that report is the actual product.
```
