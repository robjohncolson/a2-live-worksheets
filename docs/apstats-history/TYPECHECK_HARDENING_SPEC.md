# TYPECHECK_HARDENING_SPEC.md

**Status:** SHIPPED — §6's P1-P4 all landed 2026-07-02/04. P1 grade engine `80e3c81`; CI wiring `00e9b59` (advisory); P2 mesh/receipts `f641e32`, `7ea7168`, `cf87cf0`, `6c6b0cc`, `24a65cf`, hardening `021e0dc` + `8e070c3`; P3 content validators `037c555`; P4 feeder contract + **blocking** typecheck gate `060d147`. `npm run typecheck` exists at root and in `roster-server`; `.github/workflows/ci.yml` runs both as blocking. §8 (the Lisp seam) remains unbuilt by design.
**Intent:** Harden the load-bearing *pure logic* with static type-checking and property
tests — **without adding a runtime build step** and **without touching the 69
worksheets**. Boring in the best way.

This is the concrete form of the "types + property tests where the money is, one
language" direction. Lisp stays a sandbox/content-authoring experiment (§8), never core
runtime.

---

## 0. Goals & non-goals

**Goals**
- Static type-checking (`tsc --noEmit`) over a *tight allowlist* of pure modules.
- Property tests for the invariants that have actually bitten us (downgrade, signature
  binding, idempotence, CRDT merge, suppression, attempt anti-farm).
- Author-time schema validation for generated content (rubrics, decks, data).
- CI catches all of the above; **shipped runtime behavior is unchanged** — only
  `@ts-check`/JSDoc comments are added, and no generated bundle drifts.

**Non-goals (hard boundaries)**
- ❌ No `.ts` emit, no bundler, **no build step** anywhere in the deploy path. GH Pages +
  Vercel keep serving the same files; Railway keeps `node server.js`.
- ❌ No "TypeScript all the things." The 69 `u*_lesson*_live.html` worksheets and the
  ~14k-line Desk inline JS are **out of scope** — they're DOM glue, not load-bearing
  logic, and converting them fights the zero-build ethos.
- ❌ No Lisp in the runtime. (§8 for where it *could* live later.)

---

## 1. Mechanism — type-checking with no build step

Use TypeScript purely as a **checker** over annotated `.js`:

- `// @ts-check` at the top of each in-scope file.
- JSDoc (`@typedef`, `@param`, `@returns`, `@template`) for the public contracts;
  internals inferred.
- `tsconfig.json` with `{ allowJs, checkJs, noEmit, strict-ish }` and an **explicit
  `include` allowlist** (never the whole repo — see §2).
- New devDep: `typescript` (root + `roster-server`). `fast-check` already exists in
  `roster-server` (`^4.8.0`); add it to root for browser-module property tests.
- CI script: `npm run typecheck` → `tsc --noEmit -p tsconfig.json`. Advisory first, then
  a blocking gate once the allowlist is clean.

**Why this threads the needle:** the checker runs in the editor and in CI; the file that
ships is runtime-identical (only comments/JSDoc added). `tsc --noEmit` is *not* on the
Railway/Pages/Vercel path, so it can never add a deploy-time failure mode (the exact
class of pain from the Jekyll/Pages meltdown).

---

## 2. Scope — the allowlist

**IN (pure, load-bearing, mostly already extracted + tested):**

| Area | Files |
|------|-------|
| Grade engine | `roster-server/{grade-config,scoring,lesson-grade,gradebook-grid,grade}.js` — **source modules only**. `grade-engine.bundle.js` is **generated**: never hand-annotated, stays covered by the existing parity test. If the bundle ever needs annotations, the generator emits them. |
| Receipts | `receipt-sign.js`, `receipt-verify.js` (+ `roster-server/receipts.js`, `snapshot-verify.js`) |
| Identity | `student-key.js`, `secure-key.js` |
| Ledger / submissions | `ledger-store.js`, `ledger-gossip.js` (merge), `ledger-seal.js`, `submission-store.js`, `submission-grader.js` |
| Feeder contract | `gradebook-client.js` (`record()` shape only) |

**OUT (explicitly):** all 69 worksheets; `ap_stats_roadmap_square_mode.html` inline JS;
`teacher-*.html`; DOM-glue in `mobile-home.html` (its pure helpers may opt in later, not
now); Python tooling; `ti84-trainer-v2`.

Rule of thumb: a file earns a spot only if it's **pure or near-pure and a bug in it is an
invariant failure, not a pixel.**

---

## 3. Type contracts to encode

Shared `@typedef`s (author once, e.g. `types/contracts.js` as JSDoc-only, or per-module):

- `Score` = number in `[0,100]`; `Pct01` = number in `[0,1]`.
- `Track` = `'PC' | 'Work'`; `Source` = `'worksheet' | 'curriculum_quiz' | 'frq' | …`.
- `ItemId` patterns as documented brands: `BL-U{u}-L{key}-DESK_DONE`, `WS-…`, `CR-…`.
- `LedgerRow` = `{ studentId, source, itemId, unit, topic, score, attempt, recorded_at, … }`.
- `Receipt` = domain-tagged union on `t`: `'ledger' | 'submission' | 'review'` (the
  domain-separation boundary must be a *type*, not a convention).
- `GradeResult`, `QuarterV3`, `LessonGrade`.

The point isn't ceremony — it's that the **two-track grade shape** and the **receipt
domain tag** become things the checker enforces at every call site.

---

## 4. Property tests — the invariant catalog

Each property below maps to a real failure mode we've hit or guarded. Tool: `fast-check`.

**Grade engine** (`roster-server`, fast-check already present):
1. **Grade monotonic in the recorded score (pure recompute)** — for a fixed row set,
   swapping a feeder row's score for a *higher* one never lowers the computed lesson
   grade. ⚠ This is a property of the *pure recompute*, **not** an end-to-end
   no-downgrade guarantee: the server upsert (`onConflict student,source,item_id,attempt`)
   can *overwrite* a higher score with a lower re-run, so the engine only ever sees the
   latest row and cannot recover a score that was clobbered upstream. End-to-end
   no-downgrade is the **feeder/best-wins contract** (property 12b) — that is where the
   native-flashcards downgrade bug actually lived.
2. **40% floor** — a computed quarter grade never drops below the floor.
3. **Pre-PC short-circuit** — with no PC rows, `combineV3` returns the Work track exactly.
4. **Idempotence** — re-recording the same `(student,source,itemId,attempt)` row leaves
   the grade unchanged (upsert semantics).
5. **Attempt anti-farm** — teacher-assigned attempt = `max(existing grade attempt)+1`,
   monotonic; a student-supplied attempt can't inflate it. *(§0.4/§0.9.)*
6. **Hostile itemId safety** — a `__proto__`/`constructor` itemId never pollutes or
   crashes grade computation. *(The NRv2 by-item crash.)*

**Mesh / receipts** (root, add fast-check):
7. **Signature binding** — `verify` rejects a receipt whose `score`/`item_id` was changed
   after signing (a harvested sig re-stapled to a forged score fails). *(The "decorative
   signature" QR scare.)*
8. **Domain separation** — a `t:'submission'` receipt is never accepted as a `t:'ledger'`
   grade, and vice-versa.
9. **CRDT merge laws** — G-set union merge is commutative, associative, idempotent; merge
   order never changes the result. *(Textbook fast-check target.)*
10. **Grade-gated suppression** — a submission covered by a grade row is suppressed from
    gossip/scoring; an uncovered one is not. *(§0.7.)*
11. **Flood cap** — verification work per gossip round is bounded regardless of input size.

**Feeder contract** (`gradebook-client.js` + the best-wins floor in the callers):
12. `record()` no-ops (never throws) with no identity; returns `read-only` under view-as;
    returns `queued:true` when offline — the `reason` whitelist is stable.
12b. **Best-wins floor (the sole end-to-end downgrade guard)** — the feeder path never
    *emits* a row whose score is below the known floor (`max(synced grade, local best)`),
    so a weaker re-run is dropped *before* it reaches the upsert. The server does **not**
    max, so this client-side floor is the only thing standing between a lower re-run and
    a downgraded grade. *(This is the real invariant behind the native-flashcards bug.)*

---

## 5. Content / schema validation (Codex #4)

Generated/authored content gets an author-time validator, run as a test (no new runtime):

- **Rubrics** (`ai-grading-prompts*.js`, 70 files): required fields present
  (`questionText`, `expectedElements[]` with unique `id`s, `scoringGuide.{E,P,I}`); every
  keyed textarea id resolves; no dangling element refs.
- **Decks** (`*_blooket.csv`, 77): well-formed (≥2 choices, valid `correctIdx`,
  ASCII-only, balanced correct-answer positions); every roadmap topic with a Blooket URL
  **resolves to an existing deck** (this is the exact check that caught the missing U3
  6-7 deck + the U4 alias gaps — promote it from a one-off to a guard).
- **Generated data**: `roadmap-data.json` shape (note: runtime-overridden by Supabase
  `lesson_urls`, so validate *shape*, not URL liveness); `data/blooket-difficulty.json`
  tag coverage; `data/skill-map.*` schema.
- **Offline pack**: assert the answer key is **absent** from the built pack (the P3
  answer-key leak — keep the guard as a typed/validated check).

The validator is a plain JS schema (Zod *or* a small assert-based checker). Zod earns its
place only if the autocomplete/error messages pay for the dep; otherwise a hand-rolled
checker in a test is fine. Either way this is the **seam** Lisp could plug into later (§8).

---

## 6. Phasing (each phase independently shippable, zero runtime change)

- **P1 — Grade engine (roster-server ONLY).** Add `typescript`; `tsconfig`;
  `@ts-check`+JSDoc on the **5 grade *source* modules** (NOT the generated bundle);
  properties 1–6; `npm run typecheck` (advisory). Do **not** touch root/browser mesh code
  yet. *Highest bug-payoff, lowest risk — starts where fast-check already lives.*
- **P2 — Mesh/receipts (root/browser).** `@ts-check` the receipt/ledger/submission/gossip
  modules; add root fast-check; properties 7–11 + 12/12b; domain-tag the `Receipt` union.
- **P3 — Content validation.** §5 validators as CI tests; promote the deck-resolution
  check to a permanent guard.
- **P4 — Feeder + gate.** `gradebook-client.js` contract (property 12); flip
  `typecheck` from advisory to a blocking CI gate once the allowlist is clean.

Every phase: run root + roster-server suites, confirm **runtime/behavior-identical**
output and **no generated-bundle drift** (the bundle parity test stays green).

---

## 7. Risks & guardrails

- **`checkJs` surfaces latent issues.** Feature, not bug — but keep `include` tightly
  scoped so it can't explode across the repo. Fix or `// @ts-expect-error` with a reason.
- **JSDoc verbosity.** Annotate *boundaries* (exports, public fns); let inference handle
  internals. If a contract gets clumsy in JSDoc, that single file *may* graduate to a
  real `.ts` compiled in `roster-server` only (Node, build-OK) — never in the browser
  path.
- **roster-server auto-deploys on push.** `tsc --noEmit` runs in CI, **not** in the
  Railway build — a type error blocks the *PR*, never the deploy. Keep it that way.
- **Scope creep is the enemy.** The allowlist (§2) is the contract. Adding worksheets or
  the Desk requires a new decision, not a drive-by.

---

## 8. The Lisp seam (sandbox only)

Lisp does **not** enter the runtime. The one place it could earn a spot *later* is the §5
content layer: author rubrics/decks as EDN/s-expressions that compile to the exact
validated JSON we already ship. That's reversible (same output), opt-in, and only worth
it if authoring in Lisp proves *delightful* in a standalone sandbox first (e.g., port the
parity-guarded grade engine to ClojureScript as a toy, zero fleet risk). Until then: the
validator *is* the DSL's value, delivered in the language Claude is most fluent in.

---

## 9. Definition of done — P1

- [ ] `typescript` devDep added to **roster-server** only; `roster-server/tsconfig.json`
      with the grade allowlist; `npm run typecheck` script.
- [ ] `// @ts-check` + JSDoc on the 5 grade *source* modules
      (`grade-config/scoring/lesson-grade/gradebook-grid/grade`) — **not** the generated
      bundle; `tsc --noEmit` clean.
- [ ] Properties 1–6 green under fast-check; existing 7,800+ suites still pass.
- [ ] Runtime/behavior-identical; **no generated-bundle drift** (bundle parity test green).
- [ ] CI runs `typecheck` (advisory) + tests. Root/browser mesh untouched (that's P2).
