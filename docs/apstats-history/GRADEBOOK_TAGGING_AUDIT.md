# Gradebook Tagging Audit — AP Skill Coverage
<!-- GENERATED: 2026-09-13T17:26:43.278Z -->

## Summary

### Pool (a) — Follow-Along Worksheets
- Worksheets scanned: 69
- Total fill-in-the-blank items (data-answer): 2373
- Total FRQ reflection textareas: 281
- AI grading prompt files: 69
- Worksheets with explicit AP-skill anchoring: 0 of 69
- AP skill anchoring method: NONE (no data-skill/data-ap-skill attrs found in any worksheet HTML)
  Skills are inferred from lesson→topic→framework mapping only.

### Pool (b) — curriculum_render/data/curriculum.js
- Status: **pool unavailable — curriculum.js not found**

### Pool (c) — Supplement Probes + FRQ Decompositions
- Supplement probes (formula-probe-supplement.js): 16
  - With formulaId (practice signal): 16
  - Zero-signal probes (no formulaId/skill): 0
  - AP-skill tagging: **ABSENT** — probes link via formulaId, not AP skill code.
- FRQ decompositions (frq-decompositions.json): 9 FRQs, 31 sub-skills
  - Sub-skills with zero supporting MCQs: 6
  - AP-skill tagging: **ABSENT** — FRQ skills use internal IDs (u1-frq-zscore style), not AP codes.

### Pool (d) — AP Framework Files (apstat_1..9_framework.md)
- Framework files parsed: 9 of 9
- Topics extracted: 80
- Malformed files: 0

## Flags and Malformed Sources

- WARN: curriculum_render pool unavailable — pool unavailable — curriculum.js not found

## AP Skill Coverage Matrix

Skill inferred via: worksheet lesson → framework topic → AP skill code.
curriculum.js, supplement, and FRQ decomposition pools carry NO AP-skill tags.

| AP Skill | Skill Name | Worksheet Items (inferred) | curriculum.js | Supplement | FRQ Skills | Has Tag? |
|----------|------------|---------------------------|---------------|------------|------------|----------|
| 1.A | Selecting Statistical Methods (identify question/problem) | 355 | 0 | 0 | 31 | YES (inferred) |
| 2.A | Data Analysis (describe data) | 469 | 0 | 0 | 6 | YES (inferred) |
| 2.B | Data Analysis (construct representations) | 345 | 0 | 0 | 10 | YES (inferred) |
| 2.C | Data Analysis (calculate statistics) | 344 | 0 | 0 | 6 | YES (inferred) |
| 2.D | Data Analysis (compare distributions) | 201 | 0 | 0 | 6 | YES (inferred) |
| 3.A | Probability & Simulation (determine probabilities) | 310 | 0 | 0 | 17 | YES (inferred) |
| 3.B | Probability & Simulation (determine distribution parameters) | 186 | 0 | 0 | 8 | YES (inferred) |
| 3.C | Probability & Simulation (describe distributions) | 249 | 0 | 0 | 15 | YES (inferred) |
| 4.A | Statistical Argumentation (make claims) | 229 | 0 | 0 | 14 | YES (inferred) |
| 4.B | Statistical Argumentation (interpret/assess claims) | 1002 | 0 | 0 | 31 | YES (inferred) |
| 4.C | Statistical Argumentation (verify conditions) | 386 | 0 | 0 | 15 | YES (inferred) |

## Per-Unit Coverage (Worksheets)

| Unit | Worksheets | Blanks | Textareas | Grading Files | Explicit Skill Tags |
|------|------------|--------|-----------|---------------|---------------------|
| U1 | 10 | 355 | 40 | 10 | 0 |
| U2 | 9 | 291 | 37 | 9 | 0 |
| U3 | 6 | 211 | 27 | 5 | 0 |
| U4 | 7 | 361 | 29 | 7 | 0 |
| U5 | 7 | 156 | 28 | 7 | 0 |
| U6 | 10 | 389 | 40 | 10 | 0 |
| U7 | 9 | 310 | 36 | 9 | 0 |
| U8 | 6 | 162 | 24 | 6 | 0 |
| U9 | 5 | 138 | 20 | 5 | 0 |

## Framework Topic → AP Skill Map

Extracted from apstat_{1..9}_framework.md. Unit 5 uses fallback parser (malformed).

| Topic | AP Skills |
|-------|-----------|
| 1.1 | 1.A |
| 1.2 | 2.A |
| 1.3 | 2.A, 2.B |
| 1.4 | 2.A, 2.B, 2.D |
| 1.5 | 2.A, 2.B |
| 1.6 | 2.A |
| 1.7 | 2.C, 4.B |
| 1.8 | 2.A, 2.B |
| 1.9 | 2.D |
| 1.10 | 2.D, 3.A |
| 2.1 | 1.A, 2.D |
| 2.2 | 2.C, 2.D |
| 2.3 | 2.A, 2.B, 2.C, 2.D |
| 2.4 | 2.A, 2.B, 2.C, 4.B |
| 2.5 | 2.C, 4.B |
| 2.6 | 2.A, 2.B, 2.C |
| 2.7 | 2.A, 2.B, 2.C, 4.B |
| 2.8 | 2.A, 2.C, 4.B |
| 2.9 | 2.A, 2.C |
| 3.1 | 1.A |
| 3.2 | 1.C, 4.A |
| 3.3 | 1.C |
| 3.4 | 1.C |
| 3.5 | 1.B, 1.C |
| 3.6 | 1.C |
| 3.7 | 4.B |
| 4.1 | 1.A |
| 4.2 | 3.A |
| 4.3 | 3.A, 4.B |
| 4.4 | 4.B |
| 4.5 | 3.A |
| 4.6 | 3.A |
| 4.7 | 2.B, 4.B |
| 4.8 | 3.B, 4.B |
| 4.9 | 3.B, 3.C |
| 4.10 | 3.A |
| 4.11 | 3.B, 4.B |
| 4.12 | 3.A, 3.B, 4.B |
| 5.1 | 1.A |
| 5.2 | 3.A, 3.C |
| 5.3 | 3.C |
| 5.4 | 3.B, 4.B |
| 5.5 | 3.B, 3.C, 4.B |
| 5.6 | 3.B, 3.C, 4.B |
| 5.7 | 3.B, 3.C, 4.B |
| 5.8 | 3.B, 3.C, 4.B |
| 6.1 | 1.A |
| 6.2 | 1.D, 3.D, 4.C |
| 6.3 | 4.A, 4.B, 4.D |
| 6.4 | 1.E, 1.F, 4.C |
| 6.5 | 3.E, 4.B |
| 6.6 | 4.E |
| 6.7 | 1.B, 3.A, 4.A, 4.B |
| 6.8 | 1.D, 3.D, 4.C |
| 6.9 | 4.B, 4.D |
| 6.10 | 1.E, 1.F, 4.C |
| 6.11 | 3.E, 4.B, 4.E |
| 7.1 | 1.A |
| 7.2 | 1.D, 3.C, 3.D, 4.C |
| 7.3 | 4.A, 4.B, 4.D |
| 7.4 | 1.E, 1.F, 4.C |
| 7.5 | 3.E, 4.B, 4.E |
| 7.6 | 1.D, 3.D, 4.C |
| 7.7 | 4.A, 4.B, 4.D |
| 7.8 | 1.E, 1.F, 4.C |
| 7.9 | 3.E, 4.B, 4.E |
| 7.10 | (N/A — synthesis topic) |
| 8.1 | 1.A |
| 8.2 | 1.E, 1.F, 3.A, 3.C, 4.C |
| 8.3 | 3.E, 4.B, 4.E |
| 8.4 | 3.A |
| 8.5 | 1.E, 1.F, 4.C |
| 8.6 | 3.E, 4.B, 4.E |
| 8.7 | (N/A — synthesis topic) |
| 9.1 | 1.A |
| 9.2 | 1.D, 3.D, 4.C |
| 9.3 | 4.A, 4.B, 4.D |
| 9.4 | 1.E, 1.F, 4.C |
| 9.5 | 3.E, 4.B, 4.E |
| 9.6 | (N/A — synthesis topic) |

## Gap List — Skills with Insufficient Coverage

These AP skills have no items (via any pool) or are not inferrable from the topic→skill map.

No gaps detected (all skills covered by at least one pool via topic inference).

## FRQ Decompositions — Sub-Skill Coverage

| FRQ ID | Unit | Sub-Skills | Zero-Signal Sub-Skills |
|--------|------|------------|------------------------|
| U1-PC-FRQ-Q02 | 1 | 2 | 0 |
| U2-PC-FRQ-Q02 | 2 | 4 | 0 |
| U3-PC-FRQ-Q01 | 3 | 2 | 2 |
| U4-PC-FRQ-Q02 | 4 | 4 | 0 |
| U5-PC-FRQ-Q02 | 5 | 4 | 2 |
| U6-PC-FRQ-Q01 | 6 | 4 | 0 |
| U7-PC-FRQ-Q02 | 7 | 4 | 1 |
| U8-PC-FRQ-Q01 | 8 | 3 | 0 |
| U9-PC-FRQ-Q01 | 9 | 4 | 1 |

## Phase 3 Readiness Verdict

**Question: Can the diagnostic per-skill BKT engine be trusted today?**

### Verdict: CONDITIONAL

**Provenance distribution (`data/skill-map.json`):**

| Provenance | All | Certifier (curriculum PC/lesson) | Practice (worksheet/FRQ/probe) |
|------------|----:|---------------------------------:|-------------------------------:|
| topic-inherit | 791 | 0 | 791 |
| ai-constrained | 1667 | 0 | 1667 |
| unresolved | 155 | 5 | 150 |
| formula-map | 11 | 11 | 0 |
| frq-xref | 8 | 0 | 8 |
| **total** | **2632** | **16** | **2616** |

**Confidence buckets:** 1.0: 814 · 0.8-0.99: 1352 · 0.6-0.79: 283 · <0.6: 28 · none: 155

**CONDITIONAL — diagnostic-ready, certifier pending Sprint T3.** Practice pools are tagged (2458/2616 via topic-inherit + ai-constrained); the diagnostic BKT engine (v2 §3) can consume practice signal now. The **certifier pool** (curriculum.js Progress Check — the proctored grade certifier, decision T-3) still has 5 `unresolved` and 0 `ai-constrained` (not yet teacher-verified). Per spec §6, `unresolved`/un-verified tags **never certify** — they are excluded from the certifying rollup until Sprint T3 flips the spot-reviewed certifier tags to `teacher`. This is the expected post-T2 state ("move toward READY").

**Residual before READY (= Sprint T3 scope):**
1. Teacher spot-review the certifier `ai-constrained` tags (stratified sample) → flip to `teacher`.
2. Resolve the 5 certifier `unresolved` items (dual-pass disagreements + no-text) from `data/skill-map.review-queue.json`.
3. Re-run this audit → verdict becomes READY when certifier `unresolved` == 0 and certifier multi-skill tags are `teacher`.

**Biggest coverage gaps:**
- Skills with most inferred worksheet items: 4.B (1002), 2.A (469), 4.C (386)
- Skills with fewest/zero inferred worksheet items: 4.A (229), 2.D (201), 3.B (186)
- Skills with zero items in ALL pools: none
