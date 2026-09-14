# Gradebook Tagging — Sprint T2 Build Record (constrained-AI disambiguation)

**Status:** Harness built + **pilot validated**. Full 2,642-item run = controlled follow-on (see §5). Session 99 (2026-05-18). The dispatched Sonnet workstream stream-timed-out before writing this doc; the **planner authored it from the verified on-disk artifacts** (s88b: re-verified, not trusted).

**Reads:** `GRADEBOOK_TAGGING_SPEC.md` §4 step 3 + signed-off §5 (AI tagger = Codex pipeline; `unresolved` → exclude from the *diagnostic* rollup; fixed stratified sample). T1 (`GRADEBOOK_TAGGING_T1_BUILD.md`) produced `data/skill-map.json`: 3518 entries, 2642 `provenance:"unresolved"`, each with a non-empty `candidates` set of 2–7 AP skill codes. The grade is the v2-hybrid cumulative+capped model — **the skill-map feeds the *diagnostic engine* only, never the grade** (`GRADEBOOK_GRADING_SPEC.md` §3).

## 1. What T2 is

For every `unresolved` entry: a **constrained classification** — pick the ONE best AP skill **from that item's `candidates` set** (never invent a code outside it), given the item's text, with a confidence. **Dual-pass**: two independent passes; **agree → resolve** (`provenance:"ai-constrained"`, `skill`, `confidence`); **disagree → stays `unresolved`** + appended to a teacher-review queue (Sprint T3 input). Canonical `data/skill-map.json` is **never mutated by the harness** — T2 emits separate artifacts; the canonical merge is a deliberate later step after the full run is reviewed.

## 2. Frozen contract (as built)

- `scripts/disambiguate-skills.mjs` — pluggable classifier interface (tests inject a deterministic fake; the real full run wires the Codex pipeline per §5). CLI `node scripts/disambiguate-skills.mjs --unit N --pilot`. Item text: worksheet ids → the 69 `u*_lesson*_live.html`; curriculum ids → `../curriculum_render/data/curriculum.js` **READ-ONLY (sacred)**. Constrained pick is set-membership-enforced. Dual-pass agreement gate.
- `data/skill-map.pilot-u1.json` — pilot result (Unit 1 unresolved), NOT the canonical map.
- `data/skill-map.review-queue.pilot-u1.json` — dual-pass disagreements (T3 teacher queue).
- `tests/disambiguate-skills.test.js` — vitest, fake classifier, no network.

## 3. Pilot result — Unit 1 (planner-verified)

- **34/34** harness tests green (`npx vitest run tests/disambiguate-skills.test.js`).
- **U1 unresolved: 295 resolved `ai-constrained` + 6 dual-pass disagreements → review queue** (~**98%** auto-resolution on the pilot). Picks are set-constrained (e.g. `{candidates:["2.D","3.A"], skill:"3.A", confidence:0.92, topic:"1.10"}` — chosen from the candidate set, confidence-scored).
- **Canonical `data/skill-map.json` UNMODIFIED** (`git diff` clean) ✅ — scope respected.
- Full root suite: 1292 pass / 1 fail = the **known pre-existing unrelated** `study-guide.test.js` (not this work). No regressions.

## 4. Read on the approach

The candidate-bounding from T1 is what makes this reliable: a constrained pick among 2–7 framework-derived skills is a tractable classification, and dual-pass agreement (~98% on U1) gives a strong auto-resolution signal while routing the genuinely ambiguous ~2% to a human queue rather than guessing. This validates the T1→T2 design (deterministic narrowing → constrained AI → human only on disagreement).

## 5. GO recommendation + the deferred full run

**GO** for the full 2,642-item run, **as a controlled follow-on** (not auto-run here — cost/time + it should be wired to the Codex pipeline per signed-off §5, then the result reviewed before the canonical `skill-map.json` merge). Sequencing:
1. Run `disambiguate-skills.mjs` over all units via the Codex-pipeline classifier (dual-pass), emitting `skill-map.disambiguated.json` + a global review queue.
2. Planner reviews the agreement rate + a stratified sample (signed-off §5) — spot-check accuracy, not just agreement.
3. Merge `ai-constrained` resolutions into canonical `data/skill-map.json` via the T1 generator's merge path (one reviewed commit). Disagreements → Sprint T3 teacher-verification surface.
4. Re-run `scripts/audit-skill-tagging.mjs` → expect the readiness verdict to move toward READY (residual = the T3 queue).

**Out of scope (unchanged):** never write `curriculum.js`; the grade model is cumulative+capped (v2 §2) — tags are diagnostic only; T3 (teacher verification of the certifying/curriculum pool + disagreement queue) is the next tagging sprint after the full run.
