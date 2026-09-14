# AP Stats Student-Facing Surface — Implementation Plan

**Status:** execution plan (source of truth for shipping order).  
**Date:** 2026-07-09  
**Derived from:** `student-facing-surface-audit-spec.md`  
**Consensus patch (2026-07-09):** Grok + Codex review applied — W0 does not depend on G1; G1 is an *output* of W0; G3/G7 locked; W1/W3 soft-parallel with W0; W8 split (prune vs re-home); Summer Foundations marked shipped; dual-manifest regression gate added; content supplements out of scope.

**Relationship to the audit:** the audit says *what* is broken (holes H0–H12) and the rough phase order. This doc is *how we ship the fixes* — a sequenced backlog of discrete, independently-shippable increments, each with scope, approach, a verification gate, a commit boundary, and a review checkpoint. Hole/phase references (`→ H2`, `→ Phase 2`) point back to the audit.

---

## 1. Execution model (non-negotiable, proven on the reframe work)

Every increment below follows the same loop that shipped the calendar/manifest/summer reframes:

1. **One increment = one commit** (or a tiny stack), scoped to a single surface + concern. No mixed commits.
2. **Option B always:** old ids (`6.4`, `WS-U1L1-Q1`, `U1-L3-Q01`) stay the stable grade/link/consensus key. We change *display, order, labels, denominators* — never ids.
3. **Labels come from the crosswalk, never copied forward.** Any "relabel X" task = "re-derive X's labels from `2026-crosswalk.json`."
4. **Static gate + browser-smoke gate before push.** Static = counts/invariants in Node. Browser = `playwright-core` headless, desktop + phone, real host paths, zero *new* uncaught errors. Node logic alone never clears a live student surface.
5. **Adversarial review before push** for anything live-facing: relay the diff + smoke results to Codex/Grok; push on green. (Docs/specs: lighter.)
6. **Generated data is idempotent + footgun-guarded:** builders read a frozen source and reproduce live byte-for-byte (the `build-work-manifest-ced.mjs --deploy` pattern). Never hand-edit generated output. Dual live manifests stay byte-identical; the old 9-unit builder must not silently clobber the 5-unit Do-Now deploy.
7. **Provisional stays labeled provisional** (SY2627 dates, exam date, inferred skill mappings).
8. **THE SEAMLESSNESS GATE (user directive, 2026-07-09): current students' work is uninterrupted on every layer — they notice nothing.** Every push that touches a student-reachable surface must pass, and its review packet must report:
   - **Grade invariance** — old ids/itemIds/receipts untouched; core worksheet blank-counts byte-identical (the P2 ritual).
   - **Current-student simulation** — run `computeDonow` (and any changed surface) against representative live ledgers: fresh student, mid-summer (done 1.1–1.5), summer-boundary (done 1.1–1.9), summer-complete, worked-ahead. **Every surface a student sees (Do-Now card, calendar next-up, summer banner) must agree on "what's next"** — a two-against-one split across surfaces is a FAIL even when no data is harmed. (This gate exists because the P2 manifest reorder created exactly that split at the 1.9→1.10 boundary: card said 3.1, calendar+banner said 1.10.)
   - **Old-bookmark resolution** — a worksheet/quiz/video URL saved by a student last month still lands (200 + renders) on the live host.
   - **No student-visible flow change ships without the user's explicit sign-off** — cosmetics included; list every visible delta in the review packet, don't bundle them silently.

---

## 2. Gating decisions

These come from audit §9. Resolve before the *dependent* increment starts — **except G1**, which is *discovered* by W0.

| # | Decision | Status | Blocks |
|---|---|---|---|
| **G1** | Production source of truth for the quiz app: GH Pages `/quiz`, separate cr origin, or APK-only? | **Open until W0** — measure, then lock | W9 (not W0) |
| **G2** | Grade quarters: renumber to CED 1–5 this summer, or keep old-id bands with clearer UI labels + a later migration window? | Default: **old-id bands + clearer labels** this summer | W6 |
| **G3** | Formula Defense: hide entirely, or keep as labeled "legacy review" until Lab covers means + chi-square? | **LOCKED:** Lab primary; Defense stays as labeled **legacy review** until W13 | W2, W13 |
| **G4** | Bonus Blookets/quizzes: visible to students, or teachers only? | Default: **visible-but-never-required** (teacher-labeled) | W5, W9 |
| **G5** | Study guide diagnostic: migrate or freeze as legacy? | Default: **freeze as legacy** | W12 |
| **G6** | SY2627 calendar dates: ship provisional now or hold until the coordinator confirms? | Default: **provisional already live**; finalize later | finalize-only |
| **G7** | Canonical home for the new 18-code skill taxonomy | **LOCKED:** `data/skill-taxonomy-ced2026.json` | W10 (author), W11, W8b (re-home) |

**Do not over-design G1 in the abstract.** W0 records what each host actually serves; G1 is written into the host-matrix doc from that evidence.

---

## 2.1 Explicitly out of scope for this surface-integration plan

- Matched-pairs / content supplement punch-list (audit H11: `mu_d`, differences condition, etc.) — track as a separate content-edit backlog.
- Full Formula Lab means + chi-square *authoring* beyond launcher/primary (that is W13, its own multi-cluster track).
- Expanding summer to full new Unit 1 (pedagogy settled: Summer Foundations = old 1.x).

### Already shipped (not backlog)

| Item | Commit / note |
|---|---|
| Summer Foundations labels + plain summer topics | `b447b84` |
| 5-unit Do-Now manifest dual deploy | `669f088` |
| Manifest pipeline footgun harden (frozen 9-unit source + CED `--deploy`) | `3d35034` |
| Desk calendar 5-unit CED (Period X) | `39dd6de` |

---

## 3. Increment backlog (tracking table)

Ordered by the consensus kickoff. Status: ☐ not started · ◐ in progress · ☑ shipped.

| ID | Increment | Maps to | Risk | Sub-spec? | Depends on | Status |
|---|---|---|---|---|---|---|
| **W0** | Dead-end smoke + host matrix one-pager (+ APK rebuild timing) | H0, H3, Phase 0.5 | — (recon) | is one | — (**not G1**) | ☐ |
| **W1** | Tile honesty: null-quiz / missing-tutor labeling | H0, H8, Phase 1 | low | — | — (parallel OK with W0) | ☐ |
| **W2** | Formula entry points → Formula Lab primary | H5, Phase 1 | low-med | — | G3 (locked) | ☐ |
| **W3** | Copy honesty: Start Here / index / portal | H0, Phase 1 | low | — | — (parallel OK with W0) | ☐ |
| **W10** | Thin: drop Big Ideas from grader + author taxonomy file (**early win**) | Phase 6 early | med | — | G7 (locked); keep thin | ☐ |
| **W-reg** | Dual work-manifest / CED builder regression gate | H10, pipeline | low | — | — (can ship anytime; prefer with M0–M1) | ☐ |
| **W4** | Write `grade-substrate-ced2026-fix-spec.md` | H1, Phase 2 | — (spec) | is one | — | ☐ |
| **W5** | Blooket/flashcard denominator → core 67 + combined-id resolution | H2, Phase 2 | high | via W4 | W4, G4 | ☐ |
| **W6** | Quarter config + `lesson-schedule.json` alignment | H1, Phase 2 | high | via W4 | W4, G2 | ☐ |
| **W7** | Registry media + `status` truth | H3, Phase 3 | med | — | W0 (host media policy) | ☐ |
| **W8a** | TI-84 **prune**: mark-bonus / remove required GOF, geometric, slope-inference | H4, Phase 4 | med | — | — (taxonomy optional) | ☐ |
| **W8b** | TI-84 **re-home**: CED labels + pattern map ↔ taxonomy | H4, Phase 4 | med | — | W10 taxonomy | ☐ |
| **W9** | Curriculum Render policy gate + packaging contract | H7, H0, Phase 5 | med-high | short one-pager | W0, **G1 from W0**, G4 | ☐ |
| **W11** | `ced2026`-aware tutor prompt regen + opener coverage | H8, Phase 6 | med | — | W10, G7 | ☐ |
| **W12** | Study guide diagnostic migrate/freeze | H9, Phase 6 | med | — | G5 | ☐ |
| **W13** | Formula Lab completion clusters → hide Defense | H6, Phase 7 | med-high | per-cluster specs | W2, G3 | ☐ |

**M1 wave (honesty + early win, mostly independent):** W1, W2, W3, W10 — can run **in parallel with** W0; only W2 needs G3 (locked), only W10 needs G7 (locked).

---

## 4. Increment detail

Each block: **scope · approach · verify · commit · review**.

### W0 — Dead-end smoke + host matrix *(do first — recon, not a fix)*

- **Scope:** a `playwright-core` smoke that, per host (GH Pages / Railway / Vercel / APK), opens from Desk + mobile: a known worksheet (`1.2`), quiz (`1.2`), video, flashcards, formula, TI-84 — and records HTTP status + whether the resource renders. Produce `student-host-matrix-and-quiz-packaging.md`.
- **Also document:** when to rebuild the Android/offline pack after Desk/manifest deploys (APK rebuild timing).
- **Approach:** hit real hosts, not `file://`. **G1 is an output of this work**, not a prerequisite. Prefer one-origin outcomes when evidence supports them; do not invent G1 abstractly.
- **Verify:** the matrix states, for each host, what `/quiz`, `/media`, formula origin actually serve; every "does it 404?" is answered with evidence; G1 decision paragraph written from that evidence.
- **Commit:** the host-matrix doc (+ reusable smoke script under `scripts/`).
- **Review:** Codex/Grok sanity-check the matrix before W7/W9 key off it.

### W1 — Tile honesty (null quiz / missing tutor)

- **Scope:** where a lesson has `quiz == null` (the 9 openers) or no tutor file, the button reads "No quiz — worksheet only" / hides, instead of a dead control. Desk resource panel + mobile launcher.
- **Approach:** display-only; read the existing registry fields. No id/link changes. **Not hard-gated on W0.**
- **Verify:** browser-smoke — opener `1.1` shows no dead Quiz button; a real quiz lesson still opens (or clearly unavailable per host if matrix says so).
- **Commit:** 1 (Desk + mobile). **Review:** diff + smoke.

### W2 — Formula entry → Formula Lab primary  *(G3 locked)*

- **Scope:** Desk app-registry formula entry + index/portal formula card → Formula Lab primary. Formula Defense remains reachable only as labeled **"legacy review"** until W13. Confirm roster allowlist includes `formula-lab`.
- **Verify:** smoke — primary formula button opens Lab from a direct QR/mobile launch; Defense not presented as the main surface; roster env includes `formula-lab` if required.
- **Commit:** 1. **Review:** diff + smoke.

### W3 — Copy honesty (Start Here / index / portal)

- **Scope:** "Summer Foundations" language, 5-unit-year framing, remove "every lesson has a quiz," remove "Units 1–9" marketing, explicit note that Progress Checks live in AP Classroom (not Desk Do-Now tasks).
- **Approach:** pure copy; re-derive any unit labels from the crosswalk. **Not hard-gated on W0.**
- **Verify:** grep for stale claims; smoke that pages render.
- **Commit:** 1. **Review:** light (copy).

### W10 — Thin taxonomy + drop Big Ideas from grader  *(EARLY WIN, G7 locked)*

- **Scope (keep thin):**
  1. Author `data/skill-taxonomy-ced2026.json` (18 codes `1.A`–`4.G`) as the canonical map.
  2. In `curriculum_render` grading context (`frameworks.js` or equivalent), stop citing dead Big Ideas `VAR/UNC/DAT`.
  3. Keep old question ids. Inferred old→new skill mapping stays labeled **inferred**.
- **Do not** in the same commit: rewire TI-84 maps, full tutor regen, or Formula Lab workflow taxonomy consumers (those are W8b / W11 / W13).
- **Verify:** static — no "VAR/UNC/DAT" / "Big Idea" string in student-facing grading context output; sample AI-grade path cites practices/skills, not Big Ideas; grading still keys off old ids.
- **Commit:** 1 (taxonomy file in follow-alongs; frameworks change may be curriculum_render repo). **Review:** content-correctness + id stability.

### W-reg — Dual work-manifest / CED builder regression gate

- **Scope:** automated static test (or smoke script) that:
  - both live manifests are byte-identical;
  - live shape is 5-unit CED (no accidental restore of 9-unit + PC Do-Now);
  - `build-work-manifest.mjs` cannot dual-write over live without an explicit dangerous flag / is blocked in CI notes;
  - CED deploy path still requires frozen 9-unit source (pattern from `3d35034`).
- **Verify:** test fails if either copy drifts or unit count regresses to 9 with PCs on required path.
- **Commit:** 1 (test + maybe CI note). **Review:** light.

### W4 — `grade-substrate-ced2026-fix-spec.md` *(sub-spec, writing task)*

- **Scope:** `lesson-schedule.json` source-of-truth + dual-copy policy; quarter/unit config (per G2 default: transitional old-id bands + labels); PC policy; Blooket denominator (67 core); teacher dashboard bonus/core; grade-invariance tests; non-goals (no itemId/receipt renames).
- **Verify:** Codex/Grok review of the sub-spec **before** W5/W6 implement.
- **Commit:** the spec doc.

### W5 — Blooket/flashcard denominator → core 67 + combined-id resolution  *(via W4, G4)*

- **Scope:** split `blooket-lessons.json` into `core`/`bonus`; `grade.js` denominator = core 67; render bonus as enrichment; resolve combined-lesson CSVs from topic id (not only worksheet URL) so every Do-Now lesson id (incl. `4.1-2`, `3.6-7`) loads a deck or shows explicit "no deck."
- **Verify:** static — required denominator = 67, no bonus id required. Browser-smoke — combined ids; grade invariance for core.
- **Commit:** 1 (+ split data). **Review:** grade-path change.

### W6 — Quarter config + `lesson-schedule.json` alignment  *(via W4, G2)*

- **Scope:** per G2 default, keep old-id bands with explicit UI labels (or renumber only if user overrides); reconcile schedule dual copies; required progress = 67 core.
- **Verify:** static — bonus excluded; no item/grade-row id changes; copies reconciled. Browser-smoke — teacher grade view doesn't treat old Unit 9 as required.
- **Commit:** 1–2. **Review:** highest grade-truth risk.

### W7 — Registry media + `status` truth  *(after W0 media policy)*

- **Scope:** rehydrate `roadmap-data.json` videos from the `lessons-index` source *or* teach Desk to merge media when present; fix or demote `status` from student traffic-light (only ~9/77 "ready").
- **Approach:** honor host-media policy from W0's matrix (Pages may stay media-light; APK may have full media).
- **Verify:** browser-smoke — U1 video control plays **or** explains unavailability; Desk and mobile don't contradict "has video."
- **Commit:** 1. **Review:** diff + smoke.

### W8a — TI-84 prune (required-path cleanup)

- **Scope:** prune or mark-bonus removed procedures (geometric, chi-square GOF, slope inference) so they are not assignable as required practice. **Does not require** full taxonomy re-home.
- **Verify:** static — required trainer has no GOF/geometric/slope tasks. Browser-smoke — cannot assign removed proc as required.
- **Commit:** 1. **Review:** Codex/Grok.

### W8b — TI-84 re-home (labels + pattern map)

- **Scope:** re-home survivors under new CED topics via `ced2026`; align `ti84-pattern-recognition-data.json` to `data/skill-taxonomy-ced2026.json`. Optional: per-tile deep link.
- **Depends on:** W10 taxonomy file.
- **Verify:** pattern families match Formula Lab's map; display uses CED labels + old ids.
- **Commit:** 1. **Review:** Codex/Grok.

### W9 — Curriculum Render policy gate + packaging  *(G1 from W0, G4)*

- **Scope:** freeze current cr as versioned transitional/legacy; UI/route labeling so removed-topic quizzes aren't current required work; enforce packaging contract from host matrix; plan versioned Fall-2026 quiz ids (no collision with old keys).
- **Verify:** static — id non-collision plan. Browser-smoke — no removed-topic quiz as current required; every quiz surface identifies legacy vs current when shown.
- **Commit:** 1–2. **Review:** Codex/Grok.

### W11 — Tutor prompt regen + opener coverage  *(W10, G7)*

- **Scope:** generate tutor-prompt metadata from the crosswalk; fill missing openers; bonus prompts prepend "Beyond the Exam"; core prompts show new CED labels + old ids; hide tutor button when artifact missing.
- **Verify:** static — no core prompt claims slope/GOF/geometric is tested; missing prompt ≠ broken button. Browser-smoke — Desk tutor buttons resolve or hide.
- **Commit:** 1. **Review:** Codex/Grok.

### W12 — Study guide diagnostic  *(G5)*

- **Scope:** per default freeze as labeled legacy (or migrate if user overrides); if kept, don't recommend removed topics for current exam prep; fix stale exam-date text.
- **Verify:** static — no removed topic as required prep; exam-date text current. **Commit:** 1. **Review:** Codex/Grok.

### W13 — Formula Lab completion clusters  *(G3, after W2)*

- **Scope:** build in curriculum order — means (1-mean/paired/2-mean t) → chi-square H/I → earlier-unit fluency; each cluster: classify/setup/compute/conditions/interpretation. Only after coverage is real, **hide** Formula Defense.
- **Approach:** per-cluster mini-specs (W13.x), each with its own review + smoke.
- **Verify:** every tested inference workflow has all five practice modes; removed workflows aren't production targets.
- **Commit:** per cluster. **Review:** per cluster.

---

## 5. Milestones

A milestone is "done" when its increments are shipped + smoked on the live host.

- **M0 — Ground truth (W0 [+ W-reg]):** we know what every host actually serves; G1 locked from evidence; dual-manifest clobber guarded.
- **M1 — Honest surface (W1, W2, W3, W10):** no dead buttons, no "Units 1–9" / "every lesson has a quiz" lies, formula opens Lab (Defense = legacy), AI grader stops teaching Big Ideas. Fast trust-recovery; parallelizable with W0.
- **M2 — Grade truth (W4 → W5, W6):** required denominators + quarters + schedule reflect 67 core; grades provably unchanged for core ids; bonus never required.
- **M3 — Practice-surface alignment (W7, W8a/b, W9, W11, W12):** media honest, TI-84 pruned then re-homed, quiz policy/packaging, tutor/study-guide.
- **M4 — Formula Lab primacy (W13):** Lab covers tested inference workflows; Formula Defense retired.

## 6. Cross-cutting infra (build once, consumed everywhere)

- **`2026-crosswalk.json`** — single label/order/status source (already live).
- **`data/skill-taxonomy-ced2026.json`** (W10, G7 locked) — one 18-code map for Formula Lab / TI-84 / tutor / AI-grading consumers.
- **Host matrix** (W0) — per-host serving + offline/APK rebuild triggers + G1 decision.
- **Idempotent generators** — extend `build-*-ced.mjs --deploy` + frozen-source discipline to new generated artifacts (Blooket split, tutor prompts, TI-84 map).
- **Dual-manifest regression gate** (W-reg) — both copies identical; 5-unit CED shape preserved.
- **Reusable smoke harness** — `playwright-core`; scripts under `scripts/`.

## 7. Kickoff (consensus)

1. **Patch + commit** this plan and the audit spec as source of truth. *(this commit)*
2. **Lock G3 + G7** (already locked above). Leave G1 open until W0.
3. **Run W0** host matrix immediately (measure quiz/media/formula/flash/TI-84 × hosts; write G1 + APK rebuild timing).
4. **In parallel (M1):**
   - W2 — formula launcher → Lab primary (Defense = legacy)
   - W1 — dead button honesty
   - W3 — copy honesty
   - W10 — thin taxonomy file + Big Ideas removal from grader
   - W-reg when convenient (same wave OK)
5. **Then W4** grade-substrate sub-spec before any grade-logic change (W5/W6).

Do not over-design the quiz host in the abstract. Measure first, then decide G1, then package (W9).
