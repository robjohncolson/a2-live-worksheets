# TI-84 Trainer — Seeded Parameterized Problem Templates (Track C)

Status: DRAFT for review (2026-07-03). Design-only — **zero content authored, zero runtime
code** until this is reviewed. Companion to `TI84_TRAINER_WEEK1_SPIKE_SPEC.md` Track C.
Independent of the Track A spike verdict: wave 1 targets pure wizard-field procedures with
no data-entry coupling.

## 1. Why

The problem bank is 29 procedures × 1–3 fixed problems = **68 problems total**
(`generated/data-patterns.js` → `canonicalProblems`), served by bare `Math.random`
(`pickRandom`, `app.js:1353`) at three sites:

- recognition question → walkthrough (`buildQuestion`, `app.js:1424`)
- branch walkthrough after a wrong choice (`openBranchIntro`, `app.js:2220`)
- **handheld mastery check** (`startHandheldCheck`, `app.js:2519`)

Consequences of a 1–3 problem pool under an SM-2 SRS (`sm2`, `app.js:2260`):

- Students see the same stem by rep 2–3 and memorize `z = -1.85, p = .032` instead of
  running the procedure. This is worst exactly where rigor matters most — the handheld
  check is the *numeric gate* for track2 mastery and the gradebook row
  (`recordHandheldMastery`, `app.js:2542`), and it draws from the same tiny pool the
  student just walked through. For `matrix-entry` (1 canonical) the handheld problem is
  *always* the problem they just practiced.
- Hand-authoring our way out (~200 fixed problems) is brittle: every problem needs a
  scipy-verified reference, and the bank still exhausts — it just takes more reps.

Templates fix the supply side: a reviewed generator per procedure yields effectively
unlimited fresh-numbers problems, each answer recomputed (never stored), each generation
reproducible from a seed.

## 2. Design principles (settled in brainstorm, restated as contract)

1. **Seeded, never random at serve time.** Same student + procedure + phase + attempt ⇒
   byte-identical problem. No reroll-fishing, reproducible bug reports, teacher can
   regenerate exactly what a student saw.
2. **`stat-math.js` stays the single answer authority.** Templates carry *inputs only*;
   answers always come from `computeExpected(procedureId, problem)` (`app.js:595`).
   A template that needs a new answer key is out of scope until `computeExpected` +
   `VERIFICATION_FIELDS` (`app.js:509`) support it.
3. **Constructive generation, not rejection sampling.** Parameters are drawn so
   constraints hold *by construction* wherever possible (e.g., pick `p0` and `n` such
   that `n·p0 ≥ 10` is guaranteed by the grid, then derive `x`). Constraints still exist
   as declarative assertions — but they are validated exhaustively in tests, not
   retry-looped at runtime. Runtime keeps one cheap assertion pass; on failure it falls
   back to a canonical problem and logs (this should never fire — a property test proves
   it can't).
4. **`canonicalProblems` stay.** They remain the curated exemplars: the recognition
   phase keeps its hand-written stems and distractor pairings untouched in wave 1, and
   canonicals are the runtime fallback. Nothing is deleted or renamed.
5. **Generated values speak the existing vocabulary.** Each template's output object is
   shaped exactly like a canonical problem — `{ stem, values, frameworkSkill, unit,
   seed, templateId }` — with `values` keys matching what `computeExpected` already
   dispatches on for that procedure (`p0/x/n/direction`, `xbar/sx/n/mu0/cLevel`, …).
   Zero changes to `computeExpected` for wave 1.

## 3. Where generated problems serve (wave 1 integration points)

| Phase | Today | Wave 1 | Note |
|---|---|---|---|
| Recognition question stem | canonical | **canonical (unchanged)** | Curated stems + distractor sets are the pattern-recognition asset; don't dilute them yet |
| Walkthrough after correct choice | the question's canonical | **generated** (fresh numbers, own stem shown in the walkthrough panel) | Recognition happened on the canonical; execution reps get fresh numbers. UI shows a "fresh numbers" banner so the switch is explicit |
| Branch walkthrough (wrong choice) | canonical of the wrong procedure | canonical (unchanged) | Branches are contrast lessons, not reps — freshness buys little |
| Handheld mastery check | canonical (⅓ chance of repeat, or certain repeat) | **generated** | The anti-memorization payoff. Guaranteed ≠ the problem just walked through, because the phase tag is in the seed |

Serve-path change when runtime lands (next spec, not now): a single
`pickProblem(procedureId, phase)` chooses template-if-available-else-canonical, behind a
per-phase flag so rollout can be staged (handheld first, then walkthrough).

## 4. Seeding and determinism

- **PRNG**: mulberry32 (32-bit, ~10 lines, no deps). **String→seed hash**: FNV-1a
  (already the repo's hash of choice in `bridge.js frameHash`).
- **Seed recipe**: `fnv1a(studentId + '|' + procedureId + '|' + phase + '|' + attempt)`
  - `studentId` = roster username; signed-out fallback `'anon'` (and, per the
    launcher-grades lesson, nothing about a signed-out session is ever persisted).
  - `phase` ∈ `{'walkthrough','handheld'}` — guarantees the handheld problem differs
    from the walkthrough problem even at the same attempt count.
  - `attempt` = **count of recorded outcomes** for that (procedure, phase) in the
    persisted track record — NOT bumped on serve. A reload reproduces the identical
    problem; only actually finishing an attempt advances the numbers. This is the
    no-reroll-fishing property, stated precisely.
- **No date in the seed.** Recommendation (resolves the open question from the week-one
  spec): per-attempt stability, not per-day. Rationale: with `dateISO` in the seed, a
  student who finishes an attempt gets a *new* problem only at midnight (stale within a
  day) OR the same problem all day (copyable from a classmate on the same attempt — they
  differ by studentId, so actually not copyable… but a student retrying the same day
  would see identical numbers, which re-opens memorization on same-day retries — the
  common remediation path). Attempt-count seeding gives fresh numbers exactly when
  freshness matters. Reproducibility survives: the served seed is **stored on the track
  record** (`lastSeed`, plus in `sessionResult`), so "regenerate what the student saw"
  is a lookup, not a date reconstruction.
- **Determinism boundary**: template `derive` functions must be pure (no `Date.now`, no
  `Math.random` — the property suite enforces this by generating twice and comparing).

## 5. Template schema

Templates are authored as a plain-JS data file (matching the `generated/data-*.js`
window-global pattern; new file `ti84-trainer-v2/data-templates.js`, added to
`build.mjs`'s inline list when runtime lands). JS rather than JSON because `derive` is a
pure function; everything else is declarative.

```js
{
  procedureId: 'one-propztest',
  phases: ['walkthrough', 'handheld'],

  // Free parameters. Draws are grid/step-quantized so every displayed value is
  // "clean" — something a student can read from a stem and type into a wizard.
  params: {
    p0:        { grid: [0.2, 0.25, 0.3, ..., 0.8] },       // 0.05 grid
    n:         { min: 80, max: 400, step: 20 },
    direction: { oneOf: ['<', '>', '≠'] },
    // effect size in SE units; sign chosen to agree with `direction`
    kSE:       { grid: [-3, -2.5, -2, -1.5, 1.5, 2, 2.5, 3] },
  },

  // Derived values — pure function of the drawn params (and nothing else).
  // x is constructed so the z-stat lands ~kSE: no rejection loop needed.
  derive(p) {
    const se = Math.sqrt(p.p0 * (1 - p.p0) / p.n);
    const x = Math.round(p.n * (p.p0 + p.kSE * se));
    return { x };
  },

  // Declarative assertions. Validated exhaustively by the property suite;
  // runtime checks them once and falls back to a canonical on failure.
  constraints: [
    'n*p0 >= 10', 'n*(1-p0) >= 10',      // large counts, the AP condition
    '0 < x && x < n',                    // non-degenerate sample
    'answer.p >= 1e-4',                  // p-value readable, not sci-noise
    'Math.abs(answer.p - 0.5) >= 0.1',   // discriminable: a wrong-tail read
                                         // of the answer must fail valuesMatch
  ],

  // 2–4 hand-written scenario skins per template. Skins are the bounded
  // authoring cost (~20 total for wave 1) and carry the realism: value-range
  // overrides keep numbers sane for the story, and claim phrasing is selected
  // by direction so stem and alternative hypothesis always agree.
  stems: [
    {
      id: 'satisfaction',
      directions: ['<', '>'],
      text: 'A company claims that {claim} {p0pct}% of its customers are ' +
            'satisfied. In a random sample of {n} customers, {x} reported ' +
            'satisfaction. Test the claim at the α = 0.05 level.',
      // {claim} renders "at least" for '<', "no more than" for '>'
      paramOverrides: { p0: { grid: [0.6, 0.65, 0.7, 0.75, 0.8] } },
    },
    { id: 'free-throws', directions: ['<', '>', '≠'], text: '...', },
  ],

  frameworkSkill: 'VAR-6.G',
  unit: 6,
  answerVia: 'recompute',   // the only allowed value; here as documentation
}
```

Generation order (fixed, so seeds are stable): pick skin → apply overrides → draw params
in declaration order → run `derive` → assemble `values` → render stem → assert
constraints. Any future edit to a template's params/skins legitimately changes what a
seed produces — that's fine (seeds are reproducibility handles, not eternal contracts),
but it means **templates change by PR, never hot-edited**, and the stored `lastSeed` is
only meaningful against the deployed template version. Record `templateHash` (FNV-1a
over the template's canonical serialization incl. `derive.toString()` — auto-computed,
per review decision §10.5) alongside the seed.

### Second worked example — `t-test-stats` (sketch)

```js
params:  { mu0: {min: 10, max: 200, step: 5}, n: {min: 12, max: 45, step: 1},
           direction: {oneOf: ['<','>','≠']}, kSE: {grid: [±1.5, ±2, ±2.5, ±3]},
           sxRel: {grid: [0.08, 0.10, 0.12, 0.15]} }
derive(p){ const sx = round1(p.mu0 * p.sxRel);
           const xbar = round1(p.mu0 + p.kSE * sx / Math.sqrt(p.n));
           return { sx, xbar }; }
constraints: ['n >= 12', 'sx > 0', 'xbar != mu0', 'answer.p >= 1e-4',
              'Math.abs(answer.p - 0.5) >= 0.06']
```

Note the `round1` inside `derive`: displayed values are quantized *first*, then the
answer is recomputed from the quantized values — never the reverse. The kSE target is
approximate after rounding; that's fine, constraints are on the *recomputed* answer.

## 6. Constraints catalog (wave 1)

Statistical validity (the AP conditions the stem implicitly asserts):

- Proportions: `n·p0 ≥ 10`, `n·(1−p0) ≥ 10` (tests); `x ≥ 10`, `n−x ≥ 10` (intervals,
  which check counts not hypothesized values); two-prop: both groups pass.
- Means: `n ≥ 12` when the skin doesn't claim normal population (so "n large enough"
  isn't laughable); `sx > 0`.
- Intervals: `cLevel ∈ {0.90, 0.95, 0.99}` only.

Answer plausibility / discriminability:

- `p ≥ 1e-4` — the student must be able to read and type the p-value.
- `|p − 0.5| ≥ 0.1` — otherwise a wrong-tail reading (`1−p`) collides with the right
  answer inside `valuesMatch`'s leniency (`app.js:735`). The threshold is derived, not
  vibes: at a 1-decimal rendering the checker accepts floor/ceil candidates, so any
  expected value in `(0.4, 0.6)` accepts a typed `0.5` — meaning `p` and `1−p` share an
  accepted rendering whenever both sit inside that band. `|p − 0.5| ≥ 0.1` puts them on
  opposite sides of it, making the acceptance sets disjoint at every typing precision
  (property 5 in §7 proves this holds, not just argues it).
- Test statistic magnitude in `[0.8, 6]` — visible effect, not absurd.
- Interval endpoints: nonzero width; for proportions, endpoints within `(0, 1)`.

Realism: carried by skins (value-range overrides per scenario), not by global rules.

Cleanliness: every value the student reads or types is grid/step-quantized — a property
test asserts each rendered stem number round-trips through the declared step.

## 7. Validation plan

**A. fast-check property suite** — new file `tests/ti84-templates.property.test.js`
(fast-check `^4.8.0` already a devDependency; repo has an established property-test
pattern). Arbitrary = random seeds (property tests may use randomness; serve time may
not). Properties, per template:

1. **Determinism**: generate twice from the same seed ⇒ deep-equal problems.
2. **Constraint satisfaction**: all declared constraints hold for every seed (this is
   what licenses the no-retry runtime).
3. **Recompute totality**: `computeExpected(procedureId, generated)` is non-null, every
   verification field finite and in its declared range.
4. **Checker round-trip**: for each verification field, every realistic rendering of the
   recomputed answer — full precision, 3/2/1 decimals, round/floor/ceil/trunc, the exact
   acceptance set `valuesMatch` implements — is accepted.
5. **Checker discrimination**: the wrong-tail p-value (`1−p`) and the sign-flipped test
   statistic are *rejected* (this is what the `|p−0.5|` constraint buys; the property
   proves the constraint threshold is actually sufficient).
6. **Stem hygiene**: rendered stem contains no unfilled `{slot}`, every number in the
   stem appears in `values` (nothing displayed that isn't checkable), claim phrasing
   agrees with `direction`.
7. **Purity**: `derive` output depends only on params (generate with frozen
   `Date`/`Math.random` shims that throw).

**B. Offline scipy cross-check** — extends the existing pin philosophy without breaking
it. The current pin (`tests/ti84-reference-values.json`, 59 entries keyed
`{procId, idx}`) stays untouched — it indexes *canonicals* and remains valid. Templates
get a parallel, seed-keyed pin:

1. `scripts/build-ti84-template-samples.mjs` (dev tool, committed): for each template,
   generate N=25 problems from fixed seeds `0..24`, write full `values` + seed to
   `tests/ti84-template-samples.json`.
2. `tools/ti84_template_reference.py` (scipy): read the samples, compute references,
   write `tests/ti84-template-reference-values.json` keyed `{templateId, seed}`.
3. A vitest test compares `computeExpected` against the scipy refs to the same <0.001%
   bar as the canonical pin.
4. Both JSONs are committed; regenerating them is part of any template PR (the
   determinism property means the files only change when a template changes).

**C. Mutation sanity** (repo culture: kill your mutants): before trusting the suite,
hand-run ~6 mutants — drop a constraint, skip quantization in a `derive`, off-by-one a
grid, swap tails in a skin's claim phrasing — and confirm at least one property fails
for each. Recorded as a checklist in the test file header.

## 8. Compatibility and migration

- `canonicalProblems`, `distractorSets`, `patternSignatures`, `confusionMatrix`: all
  untouched. Recognition phase behavior identical in wave 1.
- `computeExpected`, `valuesMatch`, `VERIFICATION_FIELDS`: untouched (templates conform
  to their existing contracts; properties 3–5 prove it).
- `tests/ti84-expected-accuracy.test.js` + the 59-entry canonical pin: untouched.
- New runtime surface when implementation lands (next spec): `pickProblem(procedureId,
  phase)` + seed plumbing into track records + the walkthrough "fresh numbers" banner +
  `data-templates.js` in `build.mjs`'s inline list. All flag-gated per phase.
- Gradebook: no payload change. `recordHandheldMastery` rows are unaffected; the seed
  lives in trainer-local persisted state, not the ledger.

## 9. Wave 1 scope and sizing

Eight procedures — pure wizard-field (stats-input) inference, no list/matrix data entry,
therefore fully decoupled from the Track A autofill fork:

| Template | Procedures covered | Skins to author |
|---|---|---|
| one-prop z (test + interval) | `one-propztest`, `one-propzint` | 3 shared |
| two-prop z (test + interval) | `two-propztest`, `two-propzint` | 3 shared |
| one-samp t stats (test + interval) | `t-test-stats`, `t-interval-stats` | 3 shared |
| two-samp t stats (test + interval) | `two-samp-ttest`, `two-samp-tint` | 3 shared |

Test/interval pairs share a template's params and skins (the interval variant swaps the
claim sentence for an "estimate with C% confidence" sentence and drops `direction`/`x`
asymmetry rules) — so the authoring cost is ~4 param blocks + ~12 skins, each reviewed
once. Per the stress-test-before-fan-out rule, the first PR implements **one** template
(one-prop z) end-to-end through the full validation plan before the other three are
authored.

Later waves (explicitly not now): data-entry procedures (gated on the A4 verdict),
distribution utilities (`normalcdf`/`invnorm`/binomial/geometric — easy, but low
memorization risk since they're single-value), parameterized *recognition* stems with
generated distractor pairings, χ² matrix templates.

## 10. Open questions for review

Resolved here with a recommendation (veto in review if wrong):

1. **Per-day vs per-attempt stability** → per-attempt, seed advanced only by recorded
   outcomes, served seed stored on the track record (§4).
2. **Stem text variation** → fixed hand-written skins with number slots (2–4 per
   template), not generative text (§5). Bounded authoring, reviewable realism.
3. **Walkthrough integration UX** → recognition on canonical stem, walkthrough on a
   generated problem with an explicit "fresh numbers" banner (§3).

Resolved in review (teacher, 2026-07-05):

4. **No seed display in the UI** — the stored-seed lookup on the track record is
   sufficient for teacher regeneration.
5. **Content hash, not an integer** — the engine computes `templateHash` (FNV-1a over a
   canonical serialization of the template: params, `derive.toString()`, constraints,
   stems). It is stored with the seed on the track record and embedded in the
   sample/reference JSONs, so a stale pin fails loudly instead of relying on a human
   remembering to bump a number. §4/§5's `templateVersion` references mean this hash.
6. **Branch walkthroughs stay canonical permanently** — stable contrast examples force
   learning the discrimination skill; generated numbers would dilute that.
