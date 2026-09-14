# Gradebook Tagging — T2 FULL RUN Build Record (frozen contract)

**Status:** Contract frozen 2026-05-18 (session 100, autonomous loop task #1).
Follows `GRADEBOOK_TAGGING_T2_BUILD.md` §5 ("GO recommendation + the
deferred full run"). The T2 *harness* (`scripts/disambiguate-skills.mjs`)
+ U1 pilot shipped in `1dc5c05`; this is the controlled full ~2593-item run
+ the canonical merge.

**Reads:** `GRADEBOOK_TAGGING_SPEC.md` §3–§7, `GRADEBOOK_TAGGING_T2_BUILD.md`
§5, `GRADEBOOK_GRADING_SPEC.md` v2 (skill-map = diagnostic engine, NOT the
grade), `CONTINUATION_PROMPT.md` task #1.

## 1. Classifier decision (signed-off §5 knob #1 — empirically confirmed)

§5 knob #1 was signed off as **"reuse the Codex pipeline."** A 6/8-item
feasibility probe (`codex exec -s read-only --skip-git-repo-check
--ephemeral --output-schema -o`) confirmed it: every pick was inside the
item's candidate set (constraint respected), confidences were stochastic
(0.60–0.98 — real dual-pass signal, unlike the deterministic pilot
`builtInClassifier`), JSON was schema-clean, latency was workable in
batches. **Decision: Codex pipeline via batched `codex exec`, honored as
written.** No deviation to parallel-Sonnet.

- **`codex exec`** invoked directly (NOT the cross-agent runner — the
  runner echoes ~1.3MB & is for task delegation; direct `codex exec` with
  a compact ASCII prompt is the right primitive for bulk micro-classification).
- Flags: `-s read-only --skip-git-repo-check --ephemeral
  --output-schema <schema> -o <outfile>`; prompt via **stdin** (avoids
  Windows arg-length + cp1252 issues).
- **ASCII-only** prompt (carry-forward gotcha): item text sanitised to
  ASCII (math unicode → ASCII, strip the rest) before embedding.
- **Batch size 40** items/call. ~2593 unresolved → ~65 batches/pass.
- **Dual-pass = two INDEPENDENT codex invocations** per batch (pass A,
  pass B). Stochastic → genuine agreement signal.
- **Bounded concurrency 5**, **resumable** (per-batch result cached in
  gitignored `.t2tmp/`; existing cache files skipped on re-run).
- **Constraint enforcement:** any pick outside the item's candidates is
  dropped → that item routes to the review queue (never invents a code;
  never crashes the run).

## 2. Frozen interfaces (what gets built)

### 2a. `scripts/disambiguate-skills.mjs` (extend; protect the 34 tests)
- **New exported pure `resolveDualPass(id, entry, itemText, pass1, pass2)`**
  — single source of truth for the decision: no-text|appeal → queued
  `no-item-text`; single-candidate → resolved conf 1.0; pass outside
  candidates → queued `out-of-candidates`; agree → resolved
  `ai-constrained` conf=avg; disagree → queued `dual-pass-disagreement`.
- `disambiguateBatch` refactored to **delegate the decision** to
  `resolveDualPass` while preserving its EXACT observable behavior
  (classifier called pass1→pass2 in order; single-candidate does NOT call
  classifier; out-of-candidates still throws via the live path). The 34
  existing tests MUST stay green (verified on disk).
- **New exported `disambiguateAll(items, pass1Map, pass2Map)`** — replay
  path for `--all`: looks up precomputed passes, calls the SAME
  `resolveDualPass`. Out-of-candidates here → queue (not throw; a bulk run
  must not abort on one bad pick).
- **New `buildAllItemTextMap(root)`** — units 1–9 worksheets + curriculum
  (read-only) + frq, reusing the existing loaders.
- **New `codexBatchClassify(items, opts)`** — batches, builds ASCII
  prompt + schema, spawns `codex exec` (concurrency 5, resumable cache),
  parses `-o` output, returns `Map<id,{skill,confidence}>`. Two calls
  (passLabel 'A'/'B') give the two independent passes.
- **`--all` CLI**: load all `unresolved`; build text map; pass A then
  pass B (independent); `disambiguateAll`; write
  `data/skill-map.disambiguated.json` (ai-constrained resolutions) +
  `data/skill-map.review-queue.json` (global T3 queue). **NEVER writes
  canonical `data/skill-map.json`.** Prints agreement stats.

### 2b. `scripts/build-skill-map.mjs` (add the merge/overlay path)
- After the deterministic backbone + supplement/frq merge: **if
  `data/skill-map.disambiguated.json` exists, overlay** each entry whose
  id is present AND currently `unresolved` AND whose skill ∈ that entry's
  candidates → replace with the `ai-constrained` entry. Deterministic &
  idempotent: canonical map = f(frameworks, pools, disambiguated.json).
  `.js` wrapper regenerated in sync. This IS "the T1 generator's merge
  path" §5 step 3 calls for.

### 2c. `scripts/audit-skill-tagging.mjs` (dynamic verdict)
- Replace the hardcoded `### Verdict: NOT READY` with a verdict **computed
  from `data/skill-map.json`** provenance distribution + the T3 residual:
  - report provenance/confidence distribution table (spec §7);
  - **CONDITIONAL** when practice pools are AI/topic-tagged but the
    curriculum.js *certifier* pool still has `unresolved` or
    un-teacher-verified `ai-constrained` (residual = the Sprint T3 queue —
    exactly "move toward READY", T2 build §5 step 4);
  - **READY** only when every pool is tagged AND certifier `unresolved`
    == 0 AND certifier multi-skill tags are `teacher` (post-T3).
  - Still always emits the `## Phase 3 Readiness Verdict` section.
- `tests/audit-skill-tagging.test.js` line ~126 ("verdict contains NOT
  READY") updated to assert the new dynamic verdict string for the
  current state (this is a legitimate state change, in the sprint's own
  test file).

### 2d. T3 surface (Sprint T3 input — this run only PRODUCES it)
- `data/skill-map.review-queue.json` — machine queue (disagreements +
  no-text + out-of-candidates), with `pass1`/`pass2`/`reason`.
- `GRADEBOOK_TAGGING_T3_QUEUE.md` — human summary for the teacher
  (counts per unit × reason, certifier-pool items called out first per
  the §2/§3 priority order). Disagreements do NOT block this run.

## 3. Acceptance (GREEN for this loop task)

Per `CONTINUATION_PROMPT.md` GREEN gate, not the whole-workstream §7:
- follow-alongs root suite: exactly **1** pre-existing fail
  (`tests/study-guide.test.js` v3-structure). No NEW failures.
- New/updated sprint tests pass: `tests/disambiguate-skills.test.js`
  (34 + new `resolveDualPass`/`disambiguateAll`/codex-classify-with-fake
  cases), `tests/audit-skill-tagging.test.js` (verdict updated),
  `tests/skill-map.test.js` (post-merge invariants hold).
- Guards: `node scripts/audit-feeder-ids.mjs` → CLEAN 69 / MISMATCH 0;
  `tests/work-manifest*` green after `build-work-manifest.mjs` re-run
  (+ bundled `roster-server/data/work-manifest.json` copy).
- `data/skill-map.json` change is **REAL and committed** (T2 exception —
  the "revert GENERATED-header false-positive" rule does NOT apply here);
  `.js` wrapper regenerated; provenance now includes `ai-constrained`.
- Canonical map only changes `unresolved` → `ai-constrained` (no
  topic-inherit/formula-map/frq-xref entry altered; key set unchanged).
- roster-server redeployed; `/health` + `/donow` smoke 200.

## 4. Method (loop algorithm)

1. Contract frozen (this doc).
2. **Planner implements directly** — cohesive multi-script change to ONE
   workstream's tooling; parallel-Sonnet fan-out = clobber risk on
   interdependent scripts (loop EXCEPTION rule). Classification *runtime*
   = the batched `codex exec` background run.
3. Codex cross-agent **read-only review** of the implementation
   (ASCII-only prompt; parse `state/cross-agent/<id>.result.json` /
   transcript tail).
4. Planner **re-verify ON DISK**: full suites + guards + sample-audit the
   merged tags (stratified spot-check per §5 knob #3 — fixed sample).
5. GREEN → one tight commit (stage only own paths; audit/agreement stats
   in the commit message) → push → re-run `build-work-manifest.mjs` →
   redeploy roster-server → next task.

**Out of scope (unchanged):** never write `curriculum.js`; tags are
diagnostic only (v2); Sprint T3 (teacher verification of the certifier
pool + the disagreement queue) is the NEXT tagging sprint, not this run.

## 5. Run results (2026-05-19, completed)

Controlled full run executed via a **detached** process (the first two
harness-tracked attempts were killed by session suspend; detached survives).
Clean run, **0 failed batches, 0 constraint violations**:

- **2,472** items classified (117 no-text auto-queued; the rest structural).
- **2,193 resolved `ai-constrained`** (dual-pass agreement) =
  **84.6%** of all 2,593 `unresolved` (88.6% of classifiable).
  Confidence: 1899 in 0.8-0.99, 264 in 0.6-0.79, 26 <0.6, 4 @1.0.
- **400 → Sprint T3** (`data/skill-map.review-queue.json` +
  `GRADEBOOK_TAGGING_T3_QUEUE.md`): 283 dual-pass-disagreement + 117 no-text.
- Merged via `build-skill-map.mjs` overlay → canonical `data/skill-map.json`
  now `{ai-constrained:2193, topic-inherit:837, unresolved:400,
  formula-map:11, frq-xref:8}` (3449 keys, key set unchanged). Audit
  verdict moved **NOT READY → CONDITIONAL** (residual = the T3 queue,
  exactly "move toward READY").
- Stratified-sample accuracy audit (3 confidence bands x 9 units, certifier
  pool): ~22/27 clearly correct (3.A normal-prob, 2.D comparison tables,
  1.B sampling/design, 3.B sampling-dist parameters, ...).

### Known limitation (routed to Sprint T3 + future re-run)

`SKILL_DESCRIPTIONS` was **missing 1.F / 3.D / 3.E / 4.D** (the U6-U9
inference skills) during this run, so those codes appeared without a gloss
in U6-U9 prompts — elevated tag noise concentrated in the U6-U9 **certifier
pool**, which is exactly the pool Sprint T3's teacher spot-review gates
(decision T-3), so it does not block (spec T-1: baseline-first/iterate;
v2: tags diagnostic-only). **Fixed in tooling** (descriptions added;
`CLASSIFIER_PROMPT_VERSION='v2'` now part of the cache key so a re-run
recomputes with the better prompt). Per the idempotent-overlay design
(resolution at rollup time), a future `--all` re-run **retro-improves all
historical tags** with no ledger rewrite — the intended T-1 iterate path.
Sprint T3 should prioritize U6-U9 certifier items.

## 6. Codex review (load-bearing gate) + final result

Two Codex read-only reviews were run. Review 1 found **1 BLOCKER + 4 MAJOR**
(all real, all in the new full-run code; the legacy `disambiguateBatch`
path confirmed un-regressed). All 5 fixed:
1. (BLOCKER) stale `-o` reuse → unlink-before-spawn + exit-code gate +
   batch-id-set validation in `codexBatchClassify`.
2. (MAJOR) cache key now hashes prompt-version + full batch content
   (id+itemText+candidates+topic); hash-unique outFile.
3. (MAJOR) worksheet loader: `.+` filename regex + shared
   `extractWorksheetUnitId` (UNIT_ID/WORKSHEET_ID); **+ re-review found it
   incomplete** → `extractWorksheetTextareas` made generic (was hardcoded
   `reflect1/2/exitTicket`, dropped `reflect3`) and `extractWorksheetBlanks`
   switched to `data-answer=` (mirrors build-skill-map exactly; kills the
   `u3_lesson6-7` regex-literal phantom). no-text 117 -> 5 (only the
   text-less `U#-L#-QS#` supplement probes remain).
4. (MAJOR) overlay preserves `teacher` provenance (conf 1.0).
5. (MAJOR) READY verdict requires non-empty certifier + practice fully
   resolved.

Review 2 (focused re-review) **confirmed fixes 1,2,4,5 correct** and
surfaced the fix-3 incompleteness above (blast radius = exactly **2**
items: `WS-U2L8-reflect3`, `WS-U4L3-5-reflect3`). Per spec T-1
(don't-block / iterate / idempotent-overlay retro-fix) those 2 are routed
to Sprint T3, not re-run for.

**Final merged result (run #5, all fixes in tooling):**
**2,412 / 2,593 `ai-constrained` = 93.0%**, 0 constraint violations,
confidence 4@1.0 / 2021@0.8-0.99 / 345@0.6-0.79 / 42<0.6. Queue **181**
-> Sprint T3 = 173 dual-pass-disagreement + 7 no-text + 1 classifier-miss.
Run progression 84.6% (loader-bugged) -> 91.5% (loader fixed) -> 93.0%
(recovery). Canonical `data/skill-map.json` = `{topic-inherit:837,
ai-constrained:2412, unresolved:181, formula-map:11, frq-xref:8}`,
key set unchanged (3449). Audit verdict NOT READY -> CONDITIONAL.
