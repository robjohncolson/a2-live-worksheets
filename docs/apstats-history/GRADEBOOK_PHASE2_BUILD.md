# Gradebook Phase 2 — cr-quiz GRADE-feeder rollup (frozen contract)

**Status:** Contract frozen 2026-05-19 (session 100, autonomous loop task #2).
Depends on: Task #1 (T2 skill-map merged — `4140afe`), DN2d (cr-quiz
write-path LIVE in cr-repo `1ccd8a2`), Sprint 1 (`item_ledger` LIVE).
Reads: `GRADEBOOK_GRADING_SPEC.md` v2 §2, `GRADEBOOK_SPEC.md` §8,
cr-repo `DN2D_BUILD.md`, `CONTINUATION_PROMPT.md` task #2.

## 1. What Phase 2 is (and is NOT)

DN2d already **writes** every cr-quiz answer to `item_ledger`
(`source='curriculum_quiz'`, `item_id`=verbatim curriculum.js question id,
`response`=selected option(s), `attempt`, **`score` deliberately OMITTED** —
"done = attempted, not score-gated"; correctness deferred to the rollup).

**Phase 2 = the grade-of-record aggregation/rollup side:** score each
cr-quiz `response` against the answer key and aggregate into a per-student
per-unit **correctness-weighted cr-quiz feeder contribution** — one of the
two feeders of `B(unit)` in v2 §2's cumulative+capped model.

**NOT Phase 2 (= Phase 3):** combining the two feeders into `B(unit)`,
`banked=min(B,C≈85)`, `unitGrade=max(banked,P)`, the diagnostic BKT. Phase 2
only produces the cr-quiz feeder rollup that Phase 3 consumes.

## 2. The answer-key problem + decision (proven bundled-data pattern)

The correct-answer key lives in **sacred `curriculum_render/data/curriculum.js`**
(cr repo, 1.7MB, READ-ONLY) — the deployed roster-server (Root Dir =
`roster-server/`) cannot reach it. **Decision: a read-only extraction
bundled into roster-server**, exactly mirroring the DN2-prep precedent that
bundled `work-manifest.json` so `/donow` survives redeploy.

- **`scripts/build-answer-key.mjs`** — reads `../curriculum_render/data/curriculum.js`
  **READ-ONLY** (never writes it; `new Function` extract like
  `disambiguate-skills.mjs` / `build-skill-map.mjs`). Emits, for each
  objectively-scorable MCQ item: `{ [questionId]: { answerKey, type,
  unit, topic } }`. FRQ / free-response items (no objective key) are
  **excluded** (recorded in a count; they are the AI-graded follow-along
  feeder's job, not cr-quiz auto-scoring). Dual-write (DN2-prep pattern):
  `data/answer-key.json` + byte-identical bundled
  `roster-server/data/answer-key.json`. id namespace == work-manifest /
  skill-map keys (DN2d proved all 817 cr ids match verbatim → 0 mapping).
- **SACRED guard:** `git diff` must show `curriculum.js` untouched; the
  script only reads. (Honors `feedback_curriculum_render_sacred.md`.)

## 3. roster-server rollup (server-mediated, §6.5)

- New module `roster-server/rollup.js`, mounted in `server.js` (additive,
  pattern-match `mountLedger`/`mountDonow`; injectable `ledger-db` + the
  bundled answer-key; no network in tests).
- **`GET /rollup?token=` (roster-token auth, like `/donow`)** → for the
  authenticated student:
  1. Load `curriculum_quiz` rows from `item_ledger` (their rows only).
  2. Per `item_id`: take the **latest attempt**; score
     `response` vs bundled `answerKey` → correct ∈ {0,1}. Items with no
     key entry (FRQ / unknown) → excluded from the score denominator
     (counted as `ungradable`).
  3. Aggregate per **unit**: `{ unit: { attempted, graded, correct,
     crQuizPct (0–100 = correct/graded*100, null if graded=0) } }`.
  4. Return `{ ok, asOf, units: {...}, totals }`. **No grade math** (that's
     Phase 3) — purely the cr-quiz feeder rollup.
- `response` shape tolerance: DN2d records the selected option; scorer
  normalizes (string vs {value} vs array) and compares case/space-insensitive
  to the extracted key. Defensive: never throw on a malformed row → that
  row is `ungradable`, rollup continues.
- **Read-only** w.r.t. `item_ledger` (no writes; never mutates DN2d rows).

## 4. Acceptance (GREEN for this loop task)

- `node scripts/build-answer-key.mjs` → `data/answer-key.json` +
  `roster-server/data/answer-key.json` byte-identical;
  **`git diff ../curriculum_render/data/curriculum.js` empty** (sacred).
- New `tests/answer-key.test.js` (extraction: sacred-untouched, ids ⊆
  work-manifest keys, FRQ excluded, deterministic) + roster-server
  `tests/rollup.test.js` (fixture ledger → expected per-unit pct; latest
  attempt wins; ungradable excluded; malformed row tolerated; auth gate;
  read-only) all green.
- roster-server full suite stays green (Phase-0/1 + donow regression);
  `npm test` root suite: only the 1 known `study-guide.test.js` fail.
- `audit-feeder-ids` CLEAN 69 (unchanged — Phase 2 adds no skill-map keys).
- roster-server **REAL redeploy** (new endpoint + bundled answer-key):
  `cd roster-server && railway up --ci -s roster`; smoke `/health` +
  `/rollup` with a SMOKETEST account (enroll → record a known
  `curriculum_quiz` row → `/rollup` returns the expected pct); clean up
  via the standing `delete from roster where section='SMOKETEST';`.

## 5. Method (loop algorithm)

Contract frozen (this doc) → **planner implements directly** (cohesive
multi-file but interdependent server tooling; parallel-Sonnet = clobber
risk) → Codex cross-agent **read-only review** (ASCII-only; parse
`state/cross-agent/<id>.result.json`) → planner re-verify on disk (suites +
guards + the live smoke) → tight commit (stage own paths only; cr repo
NOT touched — extraction is read-only, no cr commit) → push → **real
roster-server redeploy** + smoke → Task #3 (Phase 3).

**Guardrails:** never write `curriculum.js` (sacred — read-only extract
only); roster-server changes are additive (no Phase-0/1/donow regression);
EOL LF for roster-server + bundled json; stage only own paths (this repo
has unrelated dirty scratch).

## 6. Status (2026-05-19, refined after TR fully landed)

The concurrent TR session committed ALL of TR0–TR4 (`92a0f46`+`13c7026`,
linear tree, no conflict — single-owner staged-paths discipline held). So
the roster-server **code-editing** contention is GONE: Phase-2b was
implemented additively on the TR-inclusive HEAD with zero clobber.

- **2a DONE:** `scripts/build-answer-key.mjs` → 782 MCQ keys; sacred
  `curriculum.js` git-clean before/after; dual-write byte-identical; all
  782 ids ⊆ work-manifest. `tests/answer-key.test.js` 9/9.
- **2b DONE (code):** `roster-server/rollup.js` + additive `server.js`
  wiring (4th `loadAnswerKey` param, `mountRollup`, bundled-path loader).
  `roster-server/tests/rollup.test.js` 13/13; roster-server full suite
  **113/113** (no Phase-0/1/donow/TR regression); root suite 1576/1577
  (1 known study-guide); `audit-feeder-ids` CLEAN 69.
- **DEFERRED — the single roster-server redeploy.** roster-server's
  committed HEAD now contains TR1 code requiring (user-driven) the `0003`
  Supabase migration + `ROSTER_PW_ENC_KEY` Railway env. I must NOT redeploy
  until the user completes that TR1 handoff (else TR1 code goes live without
  prereqs and breaks live auth). When the user deploys TR1, that single
  redeploy also brings Phase-2b `/rollup` live. Then smoke `/rollup` with a
  SMOKETEST account (the §4 acceptance step) and clean up via the standing
  `delete from roster where section='SMOKETEST';`.
- **A-vs-C:** chose **A** (standalone server-authoritative `/rollup`) — TR
  fully landed so the "minimize redeploys" pressure for C is moot; A gives
  the spec's feeder readout separate from the grade + a tamper-resistant
  re-scorable seam.
