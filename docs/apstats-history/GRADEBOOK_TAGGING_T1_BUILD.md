# Gradebook Tagging — Sprint T1 Build Plan & Frozen Contracts (deterministic foundation)

**Status:** Build in progress (session 99). Freezes interfaces so 2 workstreams build in parallel.
**Authority (law):** the FROZEN CONTRACTS here + `GRADEBOOK_TAGGING_SPEC.md` (signed off; T-0..T-3; §3 skill-map shape; §5 leans) + `GRADEBOOK_GRADING_SPEC.md` **v2 hybrid** (the skill-map powers the *diagnostic engine*, NOT the grade — but T1 doesn't touch grade calc) + `GRADEBOOK_TAGGING_AUDIT.md` (the gap data + the existing audit script to refactor).

> Rule: FROZEN CONTRACTS are law — no renamed file/field/path, no schema drift. Flag, don't silently "fix". A result file is **not** evidence — the planner re-runs everything (s88b: a prior agent faked a pass report).

---

## 0. Scope (planner's call — dependency-aware)

The tagging workstream has a real spine (T-0 frameworks → deterministic backbone → AI disambiguation → verification), so it is **not** 3-way parallel. **Sprint T1 = the deterministic foundation + tiny-pool deterministic maps. NO AI. NO teacher surface.**

**IN:** (WS-1) fix `apstat_5_framework.md` + a hardened shared framework parser (zero `(none parsed)`) + the deterministic skill-map generator → `data/skill-map.json` (+`.js`); (WS-2) the two tiny-pool deterministic maps (supplement, FRQ).

**DEFERRED (NOT this sprint):** Sprint T2 = constrained-AI disambiguation of `unresolved` items (Codex pipeline, per signed-off §5). Sprint T3 = teacher spot-review verification surface. Phase 2/3/4 after. §6.4 adoption later.

T1's job: maximal *deterministic* coverage + emit every still-ambiguous item as explicit `unresolved` **with its candidate set, counted** — that count sizes the T2 AI sprint.

## 0.1 Decisions (this sprint)

| ID | Decision | Rationale |
|----|----------|-----------|
| TT1-A | Hardened parser: primary = per-`## TOPIC` LO-table `[Skill N.L]` extraction; **fallback = the "UNIT AT A GLANCE" topic→skills table** every framework file has. Never fabricate AP CED content. | Eliminates `(none parsed)` (all of U5 + 3.3–3.6, 6.6, 7.10, 8.7) robustly from the files' own content. |
| TT1-B | FRQ sub-skill → AP skill **deterministically via its `supportingMcqIds`**: topic-inherit each supporting MCQ id → if they agree on one skill, assign it; conflict/none → `unresolved`. | `frq-decompositions.json` already carries `supportingMcqIds`; reuses the same topic-inherit truth. Deterministic, no AI. |
| TT1-C | Supplement probe → AP skill via a deterministic `formulaId`/probe-id-topic map; genuinely ambiguous → `unresolved`. NO AI in T1. | Only 16; the id (`U4-L9-QS1`) topic-inherits and `formulaId` is a strong signal. Judgment calls deferred to T2. |
| TT1-D | `unresolved` is a **first-class emitted state**, not an error: `skill:null` + the `candidates[]` + counted in the audit re-run. | It is the T2 input; T1 must quantify it, not hide it. |
| TT1-E | `apstat_5_framework.md` restructured to the sibling `## TOPIC 5.L:` convention **from its own existing content** (its LOs + its topic/skills glance table). Do not invent topics/skills. | Sacred-content discipline: normalize structure, preserve meaning. |
| TT1-F | **Skill set = the real AP CED codes `[1-4].[A-F]`, NOT the "canonical 11" in FC1/the audit matrix.** (Accepted 2026-05-17; the audit's 11 was a lossy subset — e.g. topics legitimately carry `1.C`, `4.E`.) WS-1 flagged this rather than silently truncating. FROZEN CONTRACT 1's "canonical 11" line is **superseded by this** — the diagnostic engine keys on the full CED set. | More-correct per-skill diagnosis; flagged-not-silent (good adversarial behavior). |
| TT1-G | **Iteration record:** Codex's bare-call fix introduced a vitest regression (top-level `const ROOT = fileURLToPath(import.meta.url)` throws under vitest's non-`file://` scheme → all importing suites failed collection). Codex did not run vitest (subagent mode). Planner caught it on re-verify; a focused Sonnet fix made root resolution lazy with a `process.cwd()` fallback **and** closed the 384-empty-candidate gap (PC-MCQ→unit-skill union; PC-FRQ→frq-decomp cross-ref; `U#-L#-{MCQ,FRQ}-Q#` infix id-parse). Re-verified by planner under vitest: 358/358. | Provenance; the recurring "works under node, breaks under vitest, agent didn't run vitest" trap — re-verify under the real harness. |

---

## FROZEN CONTRACT 1 — skill-map entry schema (`GRADEBOOK_TAGGING_SPEC.md` §3, T1 subset)

Every entry, keyed by item id:

```json
{ "skill": "2.C" | null,
  "candidates": ["2.A","2.B","2.C","2.D"],
  "confidence": 1.0,
  "provenance": "topic-inherit" | "formula-map" | "frq-xref" | "unresolved",
  "topic": "2.3" | null }
```

- Single-skill topic → `skill` set, `candidates`=[that one], `confidence` 1.0, `provenance:"topic-inherit"`.
- Multi-skill topic, not deterministically resolvable in T1 → `skill:null`, `candidates`=the topic's framework skills, `confidence` 0, `provenance:"unresolved"`.
- T2 will later flip `unresolved` → `ai-constrained`; T3 → `teacher`. **Do not implement those in T1.**
- AP skill codes are the canonical 11: `1.A 2.A 2.B 2.C 2.D 3.A 3.B 3.C 4.A 4.B 4.C` (audit matrix).

## FROZEN CONTRACT 2 — files, ownership, generator CLI

| File | Owner | Notes |
|------|-------|-------|
| `apstat_5_framework.md` | WS-1 | Restructure to `## TOPIC 5.L:` (TT1-E) |
| `scripts/lib/framework-parse.mjs` | WS-1 | Shared hardened parser. Export `parseFrameworks()` → `{ topicSkills: { "<topic>": ["<skill>",…] }, malformed: string[] }`. Zero `(none parsed)`. |
| `scripts/build-skill-map.mjs` | WS-1 | CLI `node scripts/build-skill-map.mjs` → writes `data/skill-map.json` + `data/skill-map.js`. Deterministic (two runs byte-identical except a single marked timestamp line, if any). Builds worksheet-id + curriculum.js-id entries via topic-inherit; **merges WS-2's two files verbatim by the frozen paths below**; emits `unresolved` per FC1. |
| `data/skill-map.json` | WS-1 | Unified generated output, all 4 pools. |
| `data/skill-map.js` | WS-1 | Wrapper: `window.SKILL_MAP = {…}` (mirror `data/ti84-procedures.js` wrapper pattern). |
| `scripts/audit-skill-tagging.mjs` | WS-1 | **Refactor only** to consume `framework-parse.mjs` (so the audit re-run reflects the fix). Keep its report/“Phase 3 Readiness” output contract; it stays the acceptance gate. |
| `data/skill-map-supplement.json` | **WS-2** | 16 probe `id`s → FC1 entries. |
| `data/skill-map-frq.json` | **WS-2** | 31 FRQ sub-skill `id`s → FC1 entries. |
| `tests/framework-parse.test.js`, `tests/skill-map.test.js` | WS-1 | |
| `tests/skill-map-tiny-pools.test.js` | **WS-2** | |

No file is dual-owned. WS-1's generator reads WS-2's two files by these exact paths; WS-1 unit-tests the generator with a small fixture for those paths; the **planner integration-verifies** with WS-2's real files. WS-1 may refactor `audit-skill-tagging.mjs` but must NOT change its CLI or its report-section names (it's the acceptance gate). Neither WS may edit `curriculum_render/**` (read curriculum.js **read-only** for ids only — sacred), worksheets, study guide, roadmap, `roster-server/**`.

## FROZEN CONTRACT 3 — pool id → topic derivation (deterministic)

- **curriculum.js ids**: `U{n}-L{l}-Q{q}` → topic `"{n}.{l}"`. Read-only parse of `../curriculum_render/data/curriculum.js` for ids only.
- **worksheet ids**: auto-assigned `WS-U{U}L{lessons}-Q{N}` (and variants) in the 69 `u*_lesson*_live.html` — derive unit/lesson → topic. Match the existing audit script's id extraction (reuse it).
- **supplement** (`data/formula-probe-supplement.js`): probe `id` like `U4-L9-QS1` (+ `formulaId`). WS-2.
- **FRQ** (`data/frq-decompositions.json`): keyed `U1-PC-FRQ-Q02`; `skills[].id` like `u1-frq-zscore`, each with `supportingMcqIds`. WS-2 keys the map by `skills[].id` (TT1-B).

## 1. Test expectations (each WS green; planner re-runs all + integration)

- **WS-1**: `tests/framework-parse.test.js` — `parseFrameworks()` yields **0 `(none parsed)`** topics across U1–U9; `apstat_5` parses like siblings; previously-holed topics (3.3–3.6, 6.6, 7.10, 8.7) now resolve. `tests/skill-map.test.js` — generator deterministic across two runs; single-skill topic → `topic-inherit` conf 1.0; multi-skill → `unresolved`+candidates; output validates against FC1; `data/skill-map.js` exposes `window.SKILL_MAP`. Refactored `audit-skill-tagging.mjs` still produces its report (run it).
- **WS-2**: `tests/skill-map-tiny-pools.test.js` — every one of the 16 supplement ids + 31 FRQ sub-skill ids has an FC1-valid entry (resolved or explicit `unresolved`); FRQ entries use the `supportingMcqIds` cross-ref logic (TT1-B); no fabricated skills; deterministic.
- Root `npm test` stays green (baseline: 1 known unrelated `study-guide.test.js` fail; everything else green incl. new tests). Forward slashes; ESM.

## 2. Acceptance (Sprint T1 "done")

1. `apstat_5_framework.md` well-formed (`## TOPIC 5.L:`); `parseFrameworks()` → **0 `(none parsed)`** U1–U9 (test-asserted).
2. `node scripts/build-skill-map.mjs` deterministic; `data/skill-map.json` (+`.js`) has an FC1 entry for **every** item across all 4 pools (worksheet ids, curriculum.js ids, 16 supplement, 31 FRQ) — each resolved or explicit `unresolved`+candidates.
3. Re-run `scripts/audit-skill-tagging.mjs` → report shows the new deterministic coverage **and a quantified `unresolved` count** (the T2 backlog size) — the headline flips from "ZERO tags" toward readiness, with the residual ambiguity named.
4. `curriculum_render/data/curriculum.js` never written (grep/git proof). No worksheet/study-guide/roadmap edits.
5. Decision record TT1-A..E.

## 3. Result files

Each agent writes `.batch-tt1-1|2.result.md` at repo root: files created/edited, contract adherence (quote the frozen bits), EXACT test command + REAL pasted output, the deterministic-coverage vs `unresolved` counts, anything flagged. No fabrication — planner re-runs + integration-verifies.
