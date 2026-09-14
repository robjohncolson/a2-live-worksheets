# Study Guide Diagnostic — Concept DAG + Bayesian Knowledge Tracing

**Status**: Spec — pending Codex batch dispatch
**Target file**: `study_guide_diagnostic.html`
**Problem**: Current study guide shows 6 first-N MCQs per unit (~2500px per card). Probes are not LO-aware, questions don't represent each unit's "gist," and there's no model of student mastery. We want denser signal with fewer questions, visible concept structure, and a Bayesian mastery estimate.

---

## 1. Goals

1. **Compact**: Each unit card ~600px tall (down from ~2500px) when expanded, driven by a concept graph visualization + 3 targeted probes instead of 6 first-N probes.
2. **Representative**: Probes selected to cover the LO surface area of the unit, not just first-per-lesson.
3. **Adaptive**: Probe selection uses Bayesian Knowledge Tracing (BKT) to prioritize high-uncertainty concepts. Mastery estimate updates after each Check.
4. **Visible**: Students see a per-unit concept DAG colored by their estimated mastery (red→yellow→green), which doubles as both a progress indicator and a study map.
5. **Feedback-rich focus synthesis**: The existing focus-synthesis prompt receives mastery state alongside raw MCQ results, so the AI can name specific LOs instead of just lessons.

---

## 2. Data & Module Inventory

Five new artifacts, plus an integration pass:

| # | Artifact | Type | Location | Depends on |
|---|----------|------|----------|------------|
| T1 | `study-guide-question-lo-map.json` + `question-lo-tagger.mjs` | Data + build script | `follow-alongs/data/` | — |
| T2 | `study-guide-dag-topology.json` + `dag-topology-builder.mjs` | Data + build script | `follow-alongs/data/` | — |
| T3 | `bkt.js` + `bkt.test.js` | JS module + tests | `follow-alongs/lib/` | — |
| T4 | `dag-renderer.js` | Browser JS module (SVG) | `follow-alongs/lib/` | T2 |
| T5 | `probe-selector.js` + `probe-selector.test.js` | JS module + tests | `follow-alongs/lib/` | T1, T3 |
| T6 | Edits to `study_guide_diagnostic.html` + `ai-grading-prompts-study-guide.js` | Integration | `follow-alongs/` | T4, T5 |

**Directory layout** (new):
```
follow-alongs/
  data/
    study-guide-question-lo-map.json        (T1 output)
    study-guide-dag-topology.json           (T2 output)
  lib/
    bkt.js                                  (T3)
    bkt.test.js                             (T3)
    dag-renderer.js                         (T4)
    probe-selector.js                       (T5)
    probe-selector.test.js                  (T5)
    question-lo-tagger.mjs                  (T1 — build script)
    dag-topology-builder.mjs                (T2 — build script)
```

---

## 3. Input Files (Read-Only References)

All Codex agents must read, never write, these files:

| Path | Shape | Purpose |
|------|-------|---------|
| `C:/Users/rober/Downloads/Projects/school/curriculum_render/data/curriculum.js` | `const EMBEDDED_CURRICULUM = [{id, type, prompt, answerKey, attachments: {choices:[{key,value}]}}, ...]` | Source of 433 MCQs keyed `U{unit}-L{lesson}-Q{n}` |
| `C:/Users/rober/Downloads/Projects/school/curriculum_render/data/frameworks.js` | `const UNIT_FRAMEWORKS = {1: {title, examWeight, bigIdeas, lessons: {1: {topic, skills, learningObjectives: [{id, text, essentialKnowledge}], keyConcepts}}}}` | Source of ~78 lessons × 250+ LO codes |
| `C:/Users/rober/Downloads/Projects/school/follow-alongs/study_guide_diagnostic.html` | HTML + IIFE | Integration target. Key functions: `buildProbes` (line 336), `renderMcq` (461), `renderProbe` (473), `renderUnit` (411), `getUnit`, `getFrameworkContextSG` callsite (search for `focusSynthesis`). |
| `C:/Users/rober/Downloads/Projects/school/follow-alongs/ai-grading-prompts-study-guide.js` | IIFE exposing `buildFocusSynthesisPromptSG` | Focus prompt builder — will gain a `masterySnapshot` input field in T6. |

**MCQ counts per unit** (for planning): U1=38, U2=38, U3=26, U4=52, U5=43, U6=84, U7=77, U8=48, U9=27 → 433 total.

---

## 4. Architecture — Data Flow

```
Page load:
  1. curriculum.js + frameworks.js + question-lo-map.json + dag-topology.json loaded via <script>
  2. For each unit:
     a. Load persisted BKT state from localStorage (or init priors from topology)
     b. Render unit card with DAG visualization (T4) at top
     c. probe-selector (T5) picks 3 MCQs using current mastery + tagging map
     d. Render probes below DAG

Student clicks "Check" on a probe:
  1. Record correct/incorrect
  2. For each LO tagged to that question: update BKT posterior (T3)
  3. Re-render unit card (DAG colors + probes shift based on new mastery)
  4. Save state

Student clicks "Show focus":
  1. Build focus prompt with mastery snapshot appended to existing MCQ results + FRQ grade
  2. AI grounds recommendations in LO codes the student is actually weak on
```

---

## 5. Dependency Graph / Parallelization Waves

```
Wave 1 (all parallel — no cross-deps):
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ T1: Q→LO tagging │  │ T2: DAG topology │  │ T3: BKT module   │
  │ reads curriculum │  │ reads framework  │  │ pure math + test │
  │ + framework      │  │ only             │  │                  │
  └──────┬───────────┘  └────────┬─────────┘  └─────────┬────────┘
         │                       │                      │
         │                       ▼                      │
         │            ┌──────────────────┐               │
         │            │ T4: DAG renderer │               │
         │            │ reads T2 output  │               │
         │            └──────────┬───────┘               │
         │                       │                      │
         └───────────┐           │          ┌───────────┘
                     ▼           │          ▼
              ┌─────────────────────┐
              │ T5: Probe selector  │
              │ reads T1 + T3       │
              └──────────┬──────────┘
                         │
                         ▼
                 ┌──────────────────┐
                 │ T6: Integration  │
                 │ edits HTML+JS    │
                 └──────────────────┘

Wave 1: T1, T2, T3 in parallel  (3 Codex agents)
Wave 2: T4, T5 in parallel      (2 Codex agents)
Wave 3: T6 serial               (1 Codex agent)
```

---

## 6. Per-Task Specifications

### T1 — Question→LO Tagging Map

**Purpose**: Every MCQ in `EMBEDDED_CURRICULUM` needs to be tagged with one primary LO (and optionally 1-2 secondary LOs) so the probe selector knows which concept each question tests.

**Strategy**: Text-similarity matching, bootstrapped then spot-validated.
- Extract question text = `prompt + all choice.value strings`.
- For each question, compute TF-IDF cosine similarity against each candidate LO in the question's own unit. Candidates per question = all LOs from the same unit's lessons (drawn from `UNIT_FRAMEWORKS[unit].lessons[*].learningObjectives`).
- The LO text for matching = `lo.text + ' ' + lo.essentialKnowledge.join(' ') + ' ' + lesson.keyConcepts.join(' ')`.
- Primary LO = top-1 cosine match. Secondary LOs = any other LO with similarity ≥ 0.6 × primary similarity (cap 2).
- Confidence = normalized top similarity (scale 0-1).
- Stopword filter: drop `the, a, of, is, in, and, which, ...` (standard English stopwords) before tokenizing.
- Stemming optional (Porter or skip).

**Build script**: `lib/question-lo-tagger.mjs` — runnable as `node lib/question-lo-tagger.mjs`. Reads the two source JS files (use `fs.readFileSync` + `new Function` or `vm.runInContext` to evaluate the global assignments, since they're not ES modules). Writes `data/study-guide-question-lo-map.json`.

**Output schema**:
```json
{
  "generated": "2026-04-13T...",
  "sourceHash": "sha1 of curriculum+framework",
  "questions": {
    "U1-L2-Q01": {
      "unit": 1,
      "lesson": 2,
      "primaryLoId": "VAR-1.C",
      "secondaryLoIds": ["VAR-1.B"],
      "confidence": 0.72,
      "method": "tfidf-cosine",
      "matchedKeywords": ["categorical", "variable", "classify"]
    }
  },
  "stats": {
    "totalQuestions": 433,
    "taggedWithHighConfidence": 350,
    "untaggedFallback": 0,
    "perUnit": {"1": {"total": 38, "avgConfidence": 0.68}, ...}
  }
}
```

**Acceptance**:
- All 433 MCQs present in `questions` map.
- Every entry has a `primaryLoId` that exists in `UNIT_FRAMEWORKS[unit].lessons[*].learningObjectives[*].id` for the question's unit (validate this as a post-step).
- `stats.perUnit` populated for all 9 units.
- JSON is valid and round-trippable.
- Sanity-check test: hand-verify that `U1-L2-Q01` (roller coaster categorical variables question) maps to a `VAR-1.C` or `VAR-1.B` LO. Include this assertion in a small inline test at the bottom of the build script or in a companion `lib/question-lo-tagger.test.mjs`.

**Non-goals**: Perfect tagging. This is a bootstrap — 80% accuracy is enough. T6 will expose the tags in the console for teacher spot-check later.

---

### T2 — DAG Topology Builder

**Purpose**: Define per-unit concept graphs where nodes = LO clusters and edges = prerequisite relationships. Output drives both the visual renderer (T4) and the BKT state initialization.

**Strategy**: Derive nodes and edges from `UNIT_FRAMEWORKS` directly.

**Node definition**: Each lesson contributes 1-2 nodes. Collapse LOs that share the same first segment (`VAR-1.A`, `VAR-1.B` → node "VAR-1 Variables"). Each node carries:
```json
{
  "id": "U1-VAR-1",
  "unit": 1,
  "lesson": 2,
  "label": "Classify variables",
  "loIds": ["VAR-1.B", "VAR-1.C"],
  "bigIdea": "VAR",
  "skills": ["2.A"]
}
```

Target: 8-12 nodes per unit (compressing ~3-5 LOs per lesson × 6-10 lessons into ~10 visible nodes). Total across all 9 units: ~80-100 nodes.

**Edge definition**: Two kinds of edges.
1. **Intra-unit `sequence`**: Node from lesson N is a prerequisite for nodes in lesson N+1 of the same unit (connect by adjacent lesson order).
2. **Cross-unit `handoff`**: Hardcoded edges for the well-known AP Stats progression:
   - U5 sampling distributions → U6 CIs/tests for proportions
   - U5 sampling distributions → U7 CIs/tests for means
   - U6/U7 inference → U8 chi-square
   - U6/U7 inference → U9 regression inference
   - U2 scatterplots → U9 regression
   - U4 probability → U5 sampling distributions
   - U1 distributions → U2 two-variable → U3 experiments (unit order)

Edge shape:
```json
{"from": "U4-UNC-3", "to": "U5-VAR-6", "kind": "handoff"}
```

**Layout**: Compute simple layered layout (rank by topological order within unit). Output normalized `x, y` in `[0, 1]` coordinates per node. The renderer (T4) will scale to pixels. Layout algorithm: rank = `lesson number`, x = `(index within rank) / (nodes in rank)`, y = `(rank - 1) / (max rank - 1)`. Nothing fancy — deterministic and debuggable.

**Build script**: `lib/dag-topology-builder.mjs` — runnable as `node lib/dag-topology-builder.mjs`. Reads `frameworks.js` via vm/Function eval. Writes `data/study-guide-dag-topology.json`.

**Output schema**:
```json
{
  "generated": "2026-04-13T...",
  "units": {
    "1": {
      "title": "Exploring One-Variable Data",
      "examWeight": "15-23%",
      "nodes": [
        {"id": "U1-VAR-1", "unit":1, "lesson":2, "label":"Classify variables", "loIds":["VAR-1.B","VAR-1.C"], "bigIdea":"VAR", "skills":["2.A"], "x":0.5, "y":0.0}
      ],
      "edges": [
        {"from":"U1-VAR-1", "to":"U1-UNC-1", "kind":"sequence"}
      ]
    },
    "2": { ... },
    ...
    "9": { ... }
  },
  "crossUnitEdges": [
    {"from":"U5-VAR-6","to":"U6-UNC-4","kind":"handoff"}
  ],
  "stats": {
    "totalNodes": 85,
    "totalEdges": 120,
    "perUnit": {"1":{"nodes":9,"edges":12}, ...}
  }
}
```

**Acceptance**:
- All 9 units represented.
- Each unit has 6-14 nodes (target 8-12, but 6-14 is fine for narrow/wide units).
- Every `loIds` entry exists in `UNIT_FRAMEWORKS[unit].lessons[*].learningObjectives[*].id`.
- Every `edges[*].from/to` is a valid node id in the same unit (for sequence edges) or across units (for handoffs).
- All node coordinates in `[0, 1]`.
- JSON is valid.

---

### T3 — Bayesian Knowledge Tracing Module

**Purpose**: Pure-math module with the BKT update rule and helpers for probe selection. No side effects, no imports. Runs in both Node (for tests) and browser (for T6 integration). Use ES module syntax and also attach to `window.BKT` when loaded in browser (UMD-lite pattern or the simpler `if (typeof window !== 'undefined') window.BKT = ...` at the bottom).

**API**:
```js
// Default params tuned for AP Stats diagnostic (5-choice MCQ, no in-session learning)
export const DEFAULT_PARAMS = {
  pInit: 0.3,      // prior P(mastery) before any evidence
  pTransit: 0.0,   // P(mastery state transition) — 0 for diagnostic
  pSlip: 0.1,      // P(wrong | mastered)
  pGuess: 0.25,    // P(right | not mastered) = ~1/4 (5-choice, but student usually eliminates one)
};

// Core update: returns posterior P(mastery) after one observation
export function updateMastery(prior, correct, params = DEFAULT_PARAMS) { ... }

// Predicted probability student answers correctly given current mastery
export function predictCorrect(mastery, params = DEFAULT_PARAMS) { ... }

// Information gain from a probe that tests one or more LOs
// Returns expected reduction in Shannon entropy of the targeted LOs
export function expectedInfoGain(masteryState, loIds, params = DEFAULT_PARAMS) { ... }

// Uncertainty score — higher = more uncertain (peaks at mastery=0.5)
export function uncertainty(mastery) { ... }

// Initialize a unit's mastery state from a topology
// Returns {[loId]: pInit} for every LO referenced in unit nodes
export function initMasteryState(unitNodes, params = DEFAULT_PARAMS) { ... }
```

**BKT update math** (for reference, include this as a comment in the module):
```
Given correct observation:
  numerator = prior * (1 - pSlip)
  denominator = prior * (1 - pSlip) + (1 - prior) * pGuess
  posterior_before_transit = numerator / denominator

Given incorrect observation:
  numerator = prior * pSlip
  denominator = prior * pSlip + (1 - prior) * (1 - pGuess)
  posterior_before_transit = numerator / denominator

Apply learning transition:
  posterior = posterior_before_transit + (1 - posterior_before_transit) * pTransit
```

**Tests** (`lib/bkt.test.js`, vitest-compatible):
- `updateMastery(0.5, true)` returns > 0.5 (correct answer increases mastery).
- `updateMastery(0.5, false)` returns < 0.5 (incorrect decreases).
- `updateMastery(0.99, false)` stays high (slip rate protects confident state).
- `updateMastery(0.01, true)` stays low (guess rate protects skepticism).
- Monotonicity: `updateMastery(0.4, true) < updateMastery(0.6, true)`.
- With `pTransit = 0`, repeated incorrect observations converge toward 0 but never reach it.
- `expectedInfoGain` for a question testing 2 LOs with masteries [0.5, 0.5] > info gain for same question with masteries [0.95, 0.95] (high-uncertainty states have more info to extract).
- `uncertainty(0.5) > uncertainty(0.1)` and `uncertainty(0.5) > uncertainty(0.9)`.
- `initMasteryState` returns one entry per unique loId across all provided nodes, all equal to `pInit`.

**Acceptance**:
- All 8+ test cases pass via `npx vitest run lib/bkt.test.js`.
- Module works in both node (import) and browser (`window.BKT`).
- No imports of anything outside pure JS stdlib.
- Numeric stability: no NaN when mastery is 0 or 1 exactly.

---

### T4 — DAG SVG Renderer

**Purpose**: Render a per-unit concept graph as compact inline SVG, colored by mastery, inside the study guide's unit card. No D3, no libraries — pure SVG element creation via `document.createElementNS`.

**API** (`lib/dag-renderer.js`, attaches to `window.DagRenderer`):
```js
window.DagRenderer = {
  // Returns an SVG element (detached). Caller inserts into DOM.
  // topology: per-unit block from study-guide-dag-topology.json
  // masteryState: {[loId]: number} — current BKT state for this unit
  // options: {width, height, onNodeClick, onNodeHover}
  render(topology, masteryState, options = {}) { ... }
};
```

**Visual spec**:
- Default size: 320px × 220px (fits inside unit card without adding significant height).
- Node: circle with radius 14-18px depending on LO count, filled by mastery-to-color:
  - mastery < 0.33 → `#d64545` (red)
  - mastery 0.33-0.66 → `#e0a83a` (yellow)
  - mastery > 0.66 → `#3fa066` (green)
  - Interpolate smoothly (HSL lerp from red through yellow to green).
- Node label: 1-3 word abbreviation from `label` field, drawn next to the circle (not inside — circles too small).
- Edge: thin gray line (`#aaa`, 1.5px). Sequence edges solid, handoff edges dashed.
- Hover: node scales 1.2x, tooltip appears with full label + mastery percent + LO ids.
- Click: fires `onNodeClick(nodeId)`. If set, renderer highlights connected edges.
- Accessibility: each `<circle>` gets `aria-label` with full description. SVG has `role="img"`.

**Layout**: Use `node.x, node.y` from topology (normalized 0-1). Scale to `[padding, width-padding]` and `[padding, height-padding]`. Padding = 24px.

**Self-test**: Include an inline function `DagRenderer._selfTest()` that, when run, creates a topology + mastery mock and asserts the returned SVG has correct node count. Run this from a small `lib/dag-renderer.test.html` for manual visual check.

**Acceptance**:
- Given a valid topology block and mastery state, returns an SVG element with one `<circle>` per node and one `<line>`/`<path>` per edge.
- Renders correctly in jsdom (test: create mock topology + mastery, call `render`, check `svg.querySelectorAll('circle').length === topology.nodes.length`).
- No external dependencies.
- ~320px × 220px output size.
- Color is computed deterministically from mastery.

---

### T5 — Adaptive Probe Selector

**Purpose**: Given a unit and current mastery state, pick 3 MCQs from `EMBEDDED_CURRICULUM` that maximize expected information gain while maintaining LO coverage across the unit.

**API** (`lib/probe-selector.js`, attaches to `window.ProbeSelector`):
```js
window.ProbeSelector = {
  // Returns [{question, lesson, loIds, infoGain, coverageBonus}, ...] (length = count)
  selectProbes({
    unit,              // 1-9
    count = 3,         // target probe count
    masteryState,      // {[loId]: number}
    tagMap,            // loaded study-guide-question-lo-map.json
    curriculum,        // EMBEDDED_CURRICULUM array
    alreadyAnswered,   // Set of question ids to exclude
    BKT,               // the T3 module
  }) { ... }
};
```

**Algorithm**:
1. Filter `curriculum` to MCQs whose id starts with `U{unit}-L` and which are not in `alreadyAnswered`.
2. For each candidate, look up its tagging entry in `tagMap.questions`. Skip if untagged.
3. Score each candidate:
   ```
   infoGain = BKT.expectedInfoGain(masteryState, [primaryLoId, ...secondaryLoIds])
   coverageBonus = 0.3 if primaryLoId not already covered by a pick, else 0
   score = infoGain + coverageBonus
   ```
4. Greedy selection: pick the highest-scoring candidate. After each pick, update `coverageBonus` for remaining candidates (LO already covered → bonus drops). Repeat until `count` probes selected.
5. Sort final picks by `lesson` ascending for display.

**Tests** (`lib/probe-selector.test.js`):
- With all LOs at mastery 0.5, selector returns 3 questions tagged to 3 different primary LOs (coverage dominates tiebreak).
- With one LO at mastery 0.1 and rest at 0.9, the first pick must be a question tagged to the 0.1 LO.
- `alreadyAnswered` entries are never returned.
- For a unit with fewer tagged questions than `count`, returns all available (no error).
- Deterministic for same input (stable tiebreak on question id).

**Acceptance**:
- All 5+ tests pass.
- Returns exactly `count` probes when enough candidates exist.
- Works as both a node import (for testing) and browser global.

---

### T6 — Integration into Study Guide

**Purpose**: Wire T1-T5 into `study_guide_diagnostic.html` and update the focus synthesis prompt to accept mastery state.

**Changes to `study_guide_diagnostic.html`**:

1. **Script loads** (near line 160, alongside existing script tags):
   ```html
   <script src="lib/bkt.js"></script>
   <script src="lib/dag-renderer.js"></script>
   <script src="lib/probe-selector.js"></script>
   <script>
     // Load topology + tag map as JSON. Use fetch for http(s) context; fallback to
     // a preloaded window global for file:// context.
   </script>
   ```
   Since the page is served both from file:// and http://, embed the JSON as `<script>window.SG_DAG_TOPOLOGY = {...}</script>` blocks that get injected at build time OR load via fetch with file:// fallback. Simplest: inline both JSON files as literal strings into new `data/dag-topology.js` and `data/question-lo-map.js` wrapper files that do `window.SG_DAG_TOPOLOGY = {...}`. Codex should create those wrappers.

2. **State shape** (extend `makeDefaultState`):
   ```js
   units[unit] = {
     ...existing...,
     masteryState: {},   // {[loId]: number} — populated lazily by initMasteryState
   };
   ```

3. **Replace `buildProbes`** (line 336): call `ProbeSelector.selectProbes` instead. Keep same return shape so downstream `renderMcq`/`renderProbe` works unchanged. Cache invalidation: clear `probeCache[unit]` whenever masteryState changes.

4. **BKT update hook** (line 509 — the Check button handler): after recording correct/incorrect, look up the question's LOs via tagMap, call `BKT.updateMastery` for each, write back to `data.masteryState`. Then clear `probeCache[unit]` and rerender.

5. **DAG rendering in unit card** (line 453-ish, inside `renderUnit`): insert a `renderDagPanel(unit)` call above the MCQ section. That function builds a small `<div class="dag-panel">` containing a title, the SVG from `DagRenderer.render`, and a 1-line legend.

6. **CSS additions** (near the end of the `<style>` block): `.dag-panel`, `.dag-panel svg`, hover tooltip styles. Target total DAG panel height ≤ 240px.

7. **Focus synthesis integration**: call `buildFocusSynthesisPromptSG` with a new `masterySnapshot` field (added below).

**Changes to `ai-grading-prompts-study-guide.js`**:

1. Extend `buildFocusSynthesisPromptSG` to accept `options.masterySnapshot` — an array of `{loId, loText, mastery, status}` (status = strong/emerging/weak from mastery bucket). If present, render a `## Current mastery estimate (Bayesian Knowledge Tracing):` block in the prompt, with a 1-line explanation of what the number means.

2. Add a sentence to the task instructions: "If the mastery snapshot shows specific LOs below 0.4, ground your focusLessons recommendations in those LO IDs directly."

**Compactness requirements**:
- Unit card expanded height target: ≤ 800px (DAG ~240px + 3 probes × ~180px).
- MCQ count visually drops from 6 to 3.
- No new scroll traps.

**Smoke test**:
- Open `study_guide_diagnostic.html` in node jsdom + load curriculum + framework + new data files + new lib files.
- Assert: unit 1 card contains 1 SVG with ≥ 6 circles.
- Assert: `ProbeSelector.selectProbes({unit:1, count:3, ...})` returns 3 probes.
- Assert: after "checking" one probe with the correct answer, the corresponding LO's mastery in `masteryState` has increased.
- Assert: `buildFocusSynthesisPromptSG` output includes "Current mastery estimate" when `masterySnapshot` provided.

**Acceptance**:
- All 4 smoke assertions pass.
- Existing tests (`tests/study-guide.test.js`) still pass.
- The page still renders in a real browser after integration (user will verify).
- No regression in export/import.

---

## 7. Handoff Convention Between Waves

- **Wave 1 → Wave 2**: T4 reads `data/study-guide-dag-topology.json` (produced by T2). T5 reads `data/study-guide-question-lo-map.json` (produced by T1) and imports `lib/bkt.js` (produced by T3). Codex for T4/T5 must not start until T1-T3 have written their files.
- **Wave 2 → Wave 3**: T6 reads `lib/dag-renderer.js`, `lib/probe-selector.js`, `lib/bkt.js`, and both JSON files. Codex for T6 must not start until T4/T5 complete.
- **Serialization enforcement**: CC dispatches Wave 1 in parallel, waits for all 3 to complete, then dispatches Wave 2 in parallel, waits, then dispatches Wave 3.

---

## 8. Out of Scope (For Now)

- Cross-student comparison (no aggregates visible in the DAG).
- Teacher dashboard view of class-wide mastery.
- SRS scheduling on top of BKT (for review timing — the diagnostic is one-shot).
- Handwritten LO tag corrections (teachers can open the JSON and fix manually; follow-up pass can add a UI).
- Replacing the current `buildProbes` fallback entirely — if `tagMap` or `topology` fails to load, the selector falls back to the old first-N behavior so the page never breaks.
- Not all of the 433 MCQs need to be tagged at high confidence — 80% is the target.

---

## 9. File Reference Quick Index

| File | Role | Created in task |
|------|------|-----------------|
| `data/study-guide-question-lo-map.json` | Question → LO map | T1 |
| `data/study-guide-dag-topology.json` | Per-unit concept graph | T2 |
| `data/dag-topology.js` | Window global wrapper for topology JSON | T6 (or T2) |
| `data/question-lo-map.js` | Window global wrapper for tag map JSON | T6 (or T1) |
| `lib/question-lo-tagger.mjs` | Build script | T1 |
| `lib/dag-topology-builder.mjs` | Build script | T2 |
| `lib/bkt.js` | BKT math module | T3 |
| `lib/bkt.test.js` | BKT tests | T3 |
| `lib/dag-renderer.js` | SVG renderer | T4 |
| `lib/probe-selector.js` | Adaptive selector | T5 |
| `lib/probe-selector.test.js` | Selector tests | T5 |
| `study_guide_diagnostic.html` | Integration target | T6 |
| `ai-grading-prompts-study-guide.js` | Prompt builder update | T6 |
