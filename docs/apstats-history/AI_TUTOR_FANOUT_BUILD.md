# AI Tutor — U2–U9 Fan-Out: Build Plan & Inventory

**Status:** in progress (2026-05-18). U1 pilot COMPLETE; template LOCKED. This fans the locked contract to U2–U9.
**Authority (law):** `AI_TUTOR_U1_BUILD.md` §1–§6 (the FROZEN contract — output template, block-rendering rules incl. the 2026-05-18 reasoning/solution schema correction, verification, result-file) + `AI_TUTOR_SPEC.md` decisions A–D / §4 template. **The U1 contract is unit-agnostic except literal "1"/"U1" strings — substitute the unit. Nothing else changes.**

> Rule: contracts are law. A result file is NOT evidence — CC re-reads every artifact vs the real `curriculum.js` (s88b). Codex broad cross-agent review **times out** at xhigh on 1.7MB → CC's independent cross-source verification is the gate (the mandated "look it over"); optionally pre-digest items for a scoped Codex pass.

## Deltas from the U1 contract (the ONLY differences)

1. **Path:** `ai-tutor/u{u}_l{L}.md` per lesson; `ai-tutor/u{u}_pc.md` per unit PC. Header line 1: `<!-- AI Tutor · AP Stats Topic {u}.{L} · generated from apstat_{u}_framework.md + curriculum.js U{u}-L{L} · DO NOT hand-edit; regenerate -->` (PC: `· AP Stats Unit {u} Progress Check · … curriculum.js U{u}-PC ·`).
2. **Grouping:** lesson = items id-matching `^U{u}-L{L}-`; PC = `^U{u}-PC-` (each unit's PC has MCQ-A/B sets + FRQs, like U1).
3. **Framework source:** `apstat_{u}_framework.md`. **Format varies, all LLM-readable:** `apstat_2` uses **bold** `## **TOPIC n.L**` headers; `apstat_5` has **no `## TOPIC` headers** — read its `[Skill ...]` tags + the `UNIT AT A GLANCE` topic→skill table (the audit's fallback). Neither blocks an LLM author. Pull the real Skill/EU/LO/EK for the topic; PC = condense the unit's skills via UNIT AT A GLANCE.
4. **Schema rule (U1-pilot finding, already in U1 build §0/§3 — RESTATE to every agent):** many `curriculum.js` items carry `reasoning` (MCQ) / `solution`/`scoring`/`scoringNotes` (FRQ); many don't. **If present → the WHY/SCORING MUST be faithful to it (clarify/condense, NEVER contradict). If absent → author from the framework EK.** Never quote into the student-visible flow.

Everything else (the §4 behavioral block verbatim, MCQ `(KEY) value` + `KEY:` + `WHY (for tutor's eyes)`, FRQ `SCORING:` E/P/I + 5-level, tables→markdown, charts→`[This item shows a chart in the quiz.]` + tutor-only numeric description read EXACTLY from chartConfig (never invented) + "don't compute for the student", no answer-leak, owned-path discipline, sacred read-only `curriculum.js`) is the U1 contract unchanged.

**ID-LABEL RULE (learned from u6_l11, 2026-05-18):** every item's header line MUST embed the full canonical id — `[MCQ] U{u}-L{L}-Q##` / `[FRQ] U{u}-L{L}-Q##` (or the U1 form `**[Item N of M] — U{u}-L{L}-Q##**`) — NEVER a bare `Q##`. The id is the traceability key CC verifies against `curriculum.js`; a bare label is a contract violation even if content is correct.

## Inventory (verified vs `curriculum.js` 2026-05-18) — item counts per lesson

| Unit | Framework | Lesson quizzes (id → item count) | PC | Artifacts |
|---|---|---|---|---|
| U2 | apstat_2 (bold hdr) | L1·1, L2·3, L3·6, L4·3, L5·6, L6·3, L7·3, L8·6, L9·7 | u2_pc (2 FRQ + MCQ-A/B) | 10 |
| U3 | apstat_3 | L2·6, L3·4, L4·3, L5·7, L6·3, L7·3 | u3_pc | 7 |
| U4 | apstat_4 | L2·3, L3·6, L4·3, L5·3, L6·3, L7·3, L8·6, L9·7, L10·3, L11·6, L12·9 | u4_pc | 12 |
| U5 | apstat_5 (tag/glance only) | L2·7, L3·3, L4·6, L5·9, L7·9, L8·9 (no L1/L6) | u5_pc | 7 |
| U6 | apstat_6 | L2·9, L3·10, L4·9, L5·6, L6·3, L7·13, L8·9, L9·6, L10·9, L11·10 | u6_pc | 11 |
| U7 | apstat_7 | L2·12, L3·9, L4·9, L5·10, L6·9, L7·9, L8·10, L9·9 | u7_pc | 9 |
| U8 | apstat_8 | L2·15, L3·11, L4·3, L5·9, L6·10 | u8_pc | 6 |
| U9 | apstat_9 | L2·9, L4·9, L5·9 (no L1/L3) | u9_pc (1 FRQ) | 4 |

**Total ≈ 66 artifacts (a few less — see resource rule).** A lesson appears here ⇒ it HAS quiz items ⇒ it gets an artifact. Lessons absent from this table have no `curriculum.js` quiz (no artifact — like U1-L1). If an agent's `^U{u}-L{L}-` grep count ≠ the table, FLAG it (don't pad/trim).

**RESOURCE RULE (learned from U2-L1, 2026-05-18):** an item with `"type": "resource"` is a pointer to videos/games, **not** a quiz question. A lesson whose only `^U{u}-L{L}-` hit(s) are resource-type gets **NO artifact** (a tutor with no questions is pointless — same as U1-L1). The grep-by-id inventory above over-counts such lessons by 1; the agent must check `type`, FLAG resource-only lessons, and write no file. (U2-L1 was such a case — dropped.)

## Execution

- **Unit by unit** (controlled, matches the U1 loop): per unit → parallel Sonnet (one agent ⇒ one artifact, non-overlapping owned path) → CC independent verify (integrity: header/placeholders/behavioral-verbatim/no-leak; id coverage vs source; reasoning/solution-faithfulness where present; chart values vs real chartConfig; sacred untouched) → scoped commit `ai-tutor/u{u}_*.md` only → next unit. Result files `.ai-tutor-u{u}-{L}.result.md` (scratch, untracked).
- Order: U2 → U3 → U4 → U5 → U6 → U7 → U8 → U9.
- Deferred (teacher-gated, NOT part of this fan-out): Desk-tile copy action + `start-here.html` AI-tutor section.
