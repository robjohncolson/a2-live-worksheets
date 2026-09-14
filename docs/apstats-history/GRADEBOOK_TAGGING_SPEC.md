# Gradebook — Skill-Tagging Workstream Spec

**Status:** **DRAFT — for sign-off.** Brainstormed & converged 2026-05-17 (session 99). No build.
**⚠ Retargeted by `GRADEBOOK_GRADING_SPEC.md` v2 (hybrid, 2026-05-17):** the skill-map does **not** feed the grade. The grade of record is the cumulative+booster model students were promised (`GRADEBOOK_GRADING_SPEC.md` §2). The skill-map powers the **diagnostic / remediation engine** (§3 there): auto weak-skill detection, the decision-B learning loop, the teacher heatmap. Everything below stands — the deliverable (`data/skill-map.json`) and T-0..T-3 are unchanged — only the *why* moved from "BKT IS the grade" to "BKT/tags diagnose which skill is weak." Wherever this doc says "certifier"/"BKT grade", read "diagnostic engine + the curriculum_render-quiz feeder."
**Relationship:** prerequisite for the §3 diagnostic engine of `GRADEBOOK_GRADING_SPEC.md` **and** for the Phase 2 curriculum_render-quiz grade feeder. Sprint 1's `GRADEBOOK_TAGGING_AUDIT.md` proved no item carries AP-skill codes (so weak-skill diagnosis is impossible today); this spec defines how they get tagged. Phase 0 (roster) + Sprint 1 (item_ledger + feeders) are LIVE. Read `GRADEBOOK_GRADING_SPEC.md` v2 + `GRADEBOOK_TAGGING_AUDIT.md` first.
**Sign-off:** decisions T-0..T-3 below. T-1 teacher-chosen ("1" = baseline-first). T-2/T-3 + the §5 knobs adopted from the brainstorm recommendation, **all signed off 2026-05-17** ("I dig your lean" — Codex pipeline; `unresolved`→exclude from the diagnostic rollup; fixed stratified sample). Re-confirm only if the v2 retarget changes your view.

---

## 1. The reframe (why this is tractable)

It is **not** "hand-tag 3,190 items." Every item already has a structured id (curriculum.js `U1-L2-Q01`; worksheet `WS-U4L1-2-Q{N}`), and `GRADEBOOK_TAGGING_AUDIT.md` already extracted a **topic→AP-skill map** from the 9 framework files. So `id → unit/lesson → topic → framework skill(s)` gives every item a deterministic *candidate skill set* for free. Real work = (a) fix the framework-map holes, (b) disambiguate items under *multi-skill* topics, (c) the two tiny pools. Single-skill topics are tagged the instant the map exists.

## 2. Locked decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| **T-0** | **Fix the taxonomy source FIRST.** Repair `apstat_5_framework.md` (malformed — no `## TOPIC` headers, known defect) + harden the framework parser so the topic→AP-skill map has **zero `(none parsed)` holes** (currently: all of U5, plus 3.3–3.6, 6.6, 7.10, 8.7). | Every tag is only as good as the framework parse. Upstream of all else; bounded. |
| **T-1** | **Baseline-first, iterate** (teacher-chosen). Ship the deterministic topic-inheritance map; Phase 2/3 may start on it; accuracy climbs via the AI + teacher passes without blocking. NOT "perfect tags before any Phase 3." | The grade model is forgiving of moderate tag noise: per-unit fraction-of-skills, `max(mastery,growth)`, unlimited proctored retakes. Data flowing now > data flowing perfectly later. |
| **T-2** | **One external unified skill-map** artifact: `id → {skill, candidates, confidence, provenance, topic}`, covering all 4 pools. **Not** inline `data-skill` attrs. | Never edits sacred `curriculum.js`; avoids 69 invasive student-facing worksheet edits + redeploys; one format, one review surface; re-taggable without touching content. |
| **T-3** | **Confidence + provenance on every tag; teacher spot-review GATE on the certifying pool only.** curriculum.js (= the proctored Progress Check = the grade certifier, decision D) requires a stratified teacher spot-review before its tags count as proctored-grade evidence. Practice pools (worksheets/probes — capped below mastery anyway) ride on baseline+AI with lighter review. Dual-AI agreement is an automated pre-filter that focuses teacher review on disagreements. | Coverage ≠ correctness; BKT validity rides on correctness, but only the *certifying* pool needs human-grade trust. Mirrors the grade model's "practice can't certify." |

**Priority order (from the grade model, flips the audit's list):** curriculum.js (certifier) → proctored FRQ decompositions → practice (worksheets, supplement probes).

## 3. The skill-map artifact (the central deliverable — FROZEN shape)

`data/skill-map.json` (single source of truth) + `data/skill-map.js` wrapper exposing `window.SKILL_MAP` for browser consumers (mirrors the `data/ti84-procedures.js` wrapper pattern). Keyed by item id:

```json
{
  "U1-L2-Q01": { "skill": "2.A", "candidates": ["2.A"], "confidence": 1.0, "provenance": "topic-inherit", "topic": "1.2" },
  "U2-L3-Q07": { "skill": "2.C", "candidates": ["2.A","2.B","2.C","2.D"], "confidence": 0.74, "provenance": "ai-constrained", "topic": "2.3" },
  "WS-U4L1-2-Q3": { "skill": "3.A", "candidates": ["3.A"], "confidence": 1.0, "provenance": "topic-inherit", "topic": "4.2" },
  "u1-frq-zscore": { "skill": "2.C", "candidates": ["2.C","4.B"], "confidence": 1.0, "provenance": "teacher", "topic": "1.7" }
}
```

- `provenance` ∈ `topic-inherit` (single-skill topic; deterministic; conf 1.0) · `ai-constrained` (LLM chose among the topic's framework candidates; conf = model's) · `teacher` (human confirmed/overrode; conf 1.0) · `unresolved` (multi-skill, not yet disambiguated; Phase 3 treats as low-confidence / spread, never certifies).
- **Resolution is at rollup time, not write time.** Sprint 1's `item_ledger` stores `item_id`; Phase 3 BKT resolves `item_id → skill` via this map when it computes mastery. Consequence (key, enables T-1): **improving a tag later retroactively improves all historical grades** — no ledger rewrite, iterate freely.
- The Sprint-1 `gradebook-client` may *optionally* stamp `skill` from the map at record time as a denormalized hint, but the map is authoritative.

## 4. Workstream sequence (dependency-aware; same build method as Phase 0/Sprint 1)

1. **T-0 — Framework repair** (blocks all): restructure `apstat_5_framework.md` to the `## TOPIC` convention; harden `scripts/audit-skill-tagging.mjs`'s framework parser so zero topics are `(none parsed)`; re-run the audit → topic→skill map complete for all 9 units.
2. **Deterministic backbone** (`scripts/build-skill-map.mjs`): parse every pool's ids → topic → framework skills → emit `skill-map.json`. Single-skill topics → `topic-inherit`, conf 1.0. Multi-skill topics → `unresolved` with the candidate set.
3. **Constrained-AI disambiguation pass**: for `unresolved` items, an LLM (reuse the Codex/agent content pipeline) picks among that item's framework candidates given the item text — constrained classification, confidence-scored → `ai-constrained`. Dual-pass; agreement → keep, disagreement → flag for teacher.
4. **Two tiny pools**: supplement `formulaId`→AP map (16) and `frq-decompositions.json` sub-skill-id→AP map (31) — AI-proposed, teacher-confirmed.
5. **T-3 verification**: stratified teacher spot-review surface for the curriculum.js (certifier) tags + AI-disagreement queue; sign-off flips those to `teacher`/conf 1.0.
6. **Acceptance**: re-run `scripts/audit-skill-tagging.mjs` → "Phase 3 Readiness Verdict" must report **READY** (every pool tagged; curriculum.js certifier tags teacher-verified; confidence distribution reported). Then Phase 2 (cr quiz feeder) and Phase 3 (BKT rollup + grade calc) are unblocked.

Build method per phase: planner freezes contracts → parallel Sonnet workstreams → Codex review+fix → planner re-verifies (same as Phase 0 / Sprint 1).

## 5. Open knobs (decide at sign-off)

1. **AI tagger**: reuse the existing Codex cross-agent pipeline, or a direct Claude classification script? (Lean: Codex pipeline — already wired, sandboxed, proven.)
2. **`unresolved` in Phase 3**: spread the observation equally across candidates (soft credit) vs. exclude from BKT until disambiguated (no credit)? (Lean: exclude — soft credit injects exactly the noise we're avoiding; T-1 tolerates *missing* signal better than *wrong* signal.)
3. **Teacher review volume for T-3**: review a fixed sample size per skill, or review until a confidence-interval on tag accuracy is tight enough? (Lean: fixed stratified sample per unit×skill for v1; revisit with data.)

## 6. Non-goals / guardrails

- **Never** edit or add fields to `curriculum_render/data/curriculum.js` (sacred). Tags live ONLY in the external skill-map.
- No inline `data-skill` edits to the 69 worksheets (T-2). Worksheets/study-guide/roadmap untouched by this workstream.
- Not Phase 2/3 itself — this only produces trustworthy tags + flips the audit verdict to READY.
- `unresolved`/low-confidence tags must never certify (Phase 3 honors confidence; mirrors "practice can't certify").
- Reuse the existing audit script as the acceptance gate; do not fork it.

## 7. Acceptance criteria ("workstream done")

- `apstat_5_framework.md` well-formed; framework parser yields **0 `(none parsed)` topics** across U1–U9.
- `data/skill-map.json` + `.js` wrapper exist; every item in all 4 pools has an entry (or an explicit `unresolved`).
- curriculum.js certifier tags: 0 `unresolved`; multi-skill ones either `ai-constrained` w/ dual-AI agreement **and** teacher-spot-reviewed, or `teacher`.
- `scripts/audit-skill-tagging.mjs` re-run → **Phase 3 Readiness: READY**, with a confidence/provenance distribution table.
- Decision record for T-0..T-3 + the §5 knobs.

---

**Next after sign-off:** freeze contracts (skill-map schema is §3; the framework-repair + generator + AI-pass + verification surfaces) and dispatch — same method. Decide §5 knobs first.
