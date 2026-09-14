# Gradebook Phase 3 — grade calc + diagnostic BKT (FROZEN CONTRACT)

**Status:** Spec FROZEN 2026-05-19 (session 100) via a teacher brainstorm —
every §7 knob is now decided. No implementation yet. This doc is the
authoritative Phase-3 build contract; implement it loop-style (freeze →
build → Codex review → planner verify on disk → commit/push → redeploy).
Reads: `GRADEBOOK_GRADING_SPEC.md` v2 §2/§3/§7, `GRADEBOOK_PHASE2_BUILD.md`
(the `/rollup` it consumes), `project_gradebook_grading_model.md`.

Depends on (both DONE): Task #1 T2 skill-map merged (`4140afe`), Phase 2
cr-quiz `/rollup` (`00e7a6c`, prod-verified).

## 1. The grade model (fully parameterized — teacher-decided)

**Per unit:** `unitGrade(u) = max( min(B(u), C), P(u) )`, with `C = 85` (flat,
all units — the difficulty ramp lives entirely in the PC→P curve).

**`B(u)` — feeder correctness aggregate, 0–100** (the thing `min(.,85)` caps):
- TWO feeders, **weighted follow-along : cr-quiz = 1 : 2**
  → `B = (1·W + 2·Q) / 3`.
  - `W` = follow-along worksheet correctness % for the unit: fill-ins
    (Railway `/api/submit-answer` → `item_ledger` source `worksheet`) +
    AI-graded FRQ (`/api/ai/grade`/`appeal`, source `frq`). **AI FRQ E/P/I →
    numeric E=100, P=70, I=35.**
  - `Q` = cr-quiz correctness %: the Phase-2 `GET /rollup` per-unit
    `crQuizPct` (source `curriculum_quiz`; PC excluded — that's `P`).
- **Completion is a SEPARATE accountability readout, NOT in the grade.**
- **B-loophole (perfect-on-few-items → B=100 → banked=85): ACCEPTED, no
  gate-the-cap machinery.** Mitigation = the quarterly model itself: short
  (~10wk) visible window + completion surfaced as accountability the teacher
  acts on + the proctored PC is the real gate.

**`P(u)` — proctored Progress Check, 0–100, ONLY EVER RAISES** (sits inside
`max`; a bad PC never lowers banked work; retake freely until quarter-close).
Criterion-referenced (NEVER cohort/norm/ t-test — that contradicts the
mastery philosophy and degenerates under an optional PC). Mapping = an
**AP-exam-curve proxy**, two anchors per quarter, **linear between, clamp
≤100**; below the P=85 anchor, P scales linearly to 0 (mostly dominated by
banked, but matters for low-`B` students):

| Quarter | Units | raw% → P=85 | raw% → P=100 (earned the A) |
|---------|-------|------------:|----------------------------:|
| **Q1**  | U1–2  | 40 | **60** |
| **Q2**  | U3–5  | 45 | **64** |
| **Q3**  | U6–7  | 50 | **67** |
| **Q4**  | U8–9  | 55 | **70** |

Q4 = the published AP-Stats exam standard (a *5* ≈ ~70% composite — the
documented ballpark; CB publishes NO Progress-Check curve). Q1–Q3 sit
deliberately gentler — that gap IS the graduated-tightening "trust ramp"
(Q1 teaches the recover-and-rise model before stakes feel real).
**All anchors are §7 pilot-tunable** (esp. the ~70 Q4 number — adjust on
first-cohort data; do not over-defend).

**Per quarter:** `quarterGrade = mean( unitGrade(u) for u in that band )`
(simple unweighted mean). Bands: **Q1=U1-2 · Q2=U3-5 · Q3=U6-7 · Q4=U8-9.**
All units stay open all year (bands freeze *grades*, not content — May-exam
prep safe; get-ahead allowed).

**Quarter-close = HARD lock** (admin/SIS, out of teacher's hands). The honest
promise = *"unlimited recovery WITHIN the quarter; the quarter is the unit
of mastery."* Consciously accepted bend: late mastery of a prior quarter's
unit cannot retro-lift it.

## 2. Diagnostic engine (§3 — fully decoupled from the grade)

- `skill_mastery` BKT rollup over the **T2 skill-map** tags
  (`data/skill-map.json`, `4140afe`) from `item_ledger`.
- **Reuse the study-guide BKT AS-IS** (`.v4-logic-block.js` — locate in
  `study_guide_diagnostic.html`/repo; do NOT re-implement or re-tune params).
- **Diagnostic θ = 0.65** (weak-skill flag cutoff; pilot-tunable;
  GRADE-INDEPENDENT — θ never enters the grade). ⚠ teacher wrote
  "Diagnostic c0 ?" — ambiguous; locked at 0.65; θ=0 would DISABLE
  weak-skill flagging. On reload, if the teacher meant "skip the diagnostic
  engine for now," it is cleanly separable — build the grade calc first
  regardless; the diagnostic rollup is an independent sub-deliverable.
- Powers (Phase 4): auto weak-skill detection post-PC, decision-B
  remediation loop (re-check RAISES, never lowers), teacher heatmap.
  Student sees a motivational per-skill view, NEVER BKT jargon/θ/probabilities.

## 3. Implementation shape (loop-style; planner implements — server tooling)

- **roster-server, additive** (mirror `mountLedger`/`mountDonow`/
  `mountRollup`; injectable db; tests no-network; LF):
  - A grade endpoint (e.g. `GET /grade?token=`): pull the student's
    `item_ledger` (worksheet+frq feeders) + reuse the Phase-2 `/rollup`
    cr-quiz aggregation; compute per-unit `B`, apply `min(.,C=85)`, compute
    `P` from the quarter's PC anchors (PC rows = source `pc`; the
    quarter→band + anchor table is a config constant), `unitGrade =
    max(...)`, then per-quarter mean. Returns per-unit + per-quarter grades
    + the separate completion readout. **Read-only w.r.t. item_ledger.**
  - A diagnostic rollup (e.g. `GET /mastery?token=` or fold into the
    teacher dashboard data): BKT over skill-map tags → per-skill pKnow →
    weak-skill list at θ=0.65. Independent of the grade endpoint.
- Quarter/anchor table + C + feeder weights + E/P/I + θ = ONE config
  constant block (all §7 pilot-tunable in one place).
- **GREEN gate** (unchanged): follow-alongs root suite only the 1 known
  `study-guide.test.js` fail; roster-server full suite green (no Phase-0/1/
  donow/rollup/TR regression) + new Phase-3 tests; `audit-feeder-ids`
  CLEAN 69.
- **Redeploy:** Phase 3 needs NO migration (`item_ledger` exists). After
  GREEN: `cd roster-server && railway up --ci -s roster` (standing
  authorization; roster-server is the LIVE auth service — additive only,
  full regression first), smoke `/grade` + `/mastery` with a SMOKETEST
  account, fold cleanup into the pending `delete from roster where
  section='SMOKETEST';`.

## 4. Guardrails

Never write sacred `curriculum.js` (Phase 3 only reads ledger + the derived
answer-key/skill-map). roster-server additive only. Stage own paths only
(repo has unrelated dirty scratch + concurrent-session history). The
diagnostic BKT must reuse the study-guide implementation, not fork it.

## 5. Implementation contract (planner-frozen, session 100)

These resolve the §7-knob *implementation* ambiguities the teacher brainstorm
did not specify at code level. Frozen here so Codex review + planner-verify
have a fixed reference (loop method). All sit in the ONE config block,
pilot-tunable; none change the teacher-frozen policy in §1–§3.

**Ledger feeder shapes (verified on disk, DN2a/b + Phase-2):**
- `source:'worksheet'` rows record `response` only, **no `score`** (DN2b
  `recordBlankToGradebook`). No worksheet answer-key exists (Phase 3 builds
  none — sacred/scope). ⇒ worksheet fill-ins are **completion-only** until a
  future feeder stamps correctness; they count in the completion readout, NOT
  the graded `W` denominator (the `/rollup` `ungradable` precedent — forward-
  compatible: when a score later appears, `W` absorbs it with no rollup
  change, same "improve a tag → retro-fix grades" philosophy).
- `source:'frq'` rows record numeric `score ∈ {1, 0.5, 0}` (DN2b
  `recordReflectionToGradebook` maps E→1/P→0.5/I→0). Phase 3 remaps to the
  teacher band **E(≈1)→100 · P(≈0.5)→70 · I(≈0)→35** (`frqBand` config).
- `source:'curriculum_quiz'` → scored vs bundled answer-key (Phase-2 logic).
- `source:'pc'` → scored vs bundled answer-key (answer-key.json has 347
  `*-PC-*` MCQ keys; PC-FRQ has no key → ungradable, excluded). **No `pc`
  writer ships yet** ⇒ `/grade` must yield `P=0` (no lift) when absent.

**`B(u)` with missing feeders (non-punitive, cumulative — teacher §1/§2):**
`B = weighted mean over feeders that HAVE graded data`, weights renormalized
to those present. W-only → `B=W`; Q-only → `B=Q`; both → `B=(1·W+2·Q)/3`;
neither → `B=null` (unit ungraded — NOT 0; a not-yet-done unit must not tank
the grade — directly serves "cumulative, accumulates as work is completed,
never punitive"). `banked = B==null ? null : min(B, 85)`.

**`P(u)` curve** (raw% `r` = PC `correct/graded`×100 vs answer-key; null/no
PC → `P=0`): with quarter anchors `{p85,p100}` —
`r≥p100 → 100`; `p85≤r<p100 → 85 + (r−p85)/(p100−p85)·15`;
`0≤r<p85 → r/p85·85` (linear to 0). Clamp [0,100].
`unitGrade = max( banked ?? 0, P )`; a unit with `banked==null && P==0` has
**no grade** → excluded from the quarter mean (not counted as 0).
`quarterGrade = mean( unitGrade for graded units in the band )`, null if none.

**Diagnostic BKT (`/mastery`, decoupled):** reuse `lib/bkt.js` AS-IS via a
**byte-identical bundled `roster-server/bkt.js`** + a guard test asserting
identity (reuse, not fork — §4). Load via `createRequire` (UMD →
`module.exports`). Per-skill: resolve `item_id`→`skill` via byte-identical
bundled `roster-server/data/skill-map.json` (`skill:null`/unresolved →
excluded, per tagging spec). Correctness signal: `curriculum_quiz`/`pc` vs
answer-key; `frq` `correct = score≥0.5`; `worksheet` skipped (no key).
Sequence rows by `recorded_at` asc; fold `BKT.updateMastery` from `pInit`.
`weakSkills` = pKnow `< θ (0.65)`. θ/frq-threshold are config, grade-independent.

**Bundling (Railway Root Dir=roster-server/ ⇒ repo-root `data/` not shipped):**
mirror the answer-key/work-manifest precedent. `build-skill-map.mjs` gains a
byte-identical dual-write to `roster-server/data/skill-map.json`; `bkt.js`
copied byte-identical to `roster-server/bkt.js`. Both guarded by a
byte-identical regression test. `createApp` gains a 5th injectable
`loadSkillMap` (default = bundled-path loader, same priority chain as
`loadAnswerKey`); `mountGrade`/`mountMastery` are additive + injectable +
no-network-in-tests, exactly like `mountRollup`.
