# TI-84 Trainer → Grade Ecosystem Integration Spec

2026-07-06. Goal: make the TI-84 trainer a minor Work-track strand like Blooket —
launchable from lesson chips, visible on Desk/calendar/gradebook surfaces, and
eventually counted modestly once the evidence path is trusted. Four separable
tracks, lowest-risk first:

- **A. Ledger/write verification** — DONE (0016 confirmed live; see §A)
- **B. Desk completion visibility** — ledger-authoritative, display-only
- **C. Grade aggregation/counting policy** — visible-but-uncounted now, counted behind config later
- **D. UI readability** — SHIPPED (independent pane scaling, fa `b288b2a`)

Non-goals of this phase: gating lesson advancement on trainer work, Schoology
export of a trainer category, SRS changes.

---

## A. Evidence path — audited + live-verified

### A.1 Where trainer evidence comes from (client)

Two write sites in `ti84-trainer-v2/app.js`, both `source:'trainer'`,
`itemId: TI84-<procedureId>` (sanitized), `attempt: 1` (re-practice upserts the
same row), fire-and-forget with a "Saved to your gradebook" status line:

| Site | Fires when | Score |
|------|-----------|-------|
| `recordTrainerAttempt` | Walkthrough/recall completes; signed-in only; **physical mode requires the type-the-result verification**; **Desk-launched practice (`app.practice`) suppresses this row** (no SRS outcome, no attempt row) | `max(track2.bestScore, quality/5)` — 0..1, raise-only |
| `recordHandheldMastery` | Handheld mastery check passed (typed the real calculator's result, verified against recompute). **No practice guard — fires even in Desk-launched practice**, whose flow chains into the handheld check (§B.2) | forces `1.0` |

Signed-out sessions never write. Local per-student state
(`ti84trainer_v2_state.<studentId>`, list memory) is device bookkeeping only —
it cannot masquerade as evidence (server writes require a roster token).

### A.2 Server gate — migration 0016 IS LIVE (verified 2026-07-06)

`/ledger/record` (roster-server/ledger.js) has **no JS source whitelist** — the
only gate is the Postgres CHECK constraint that migration
`0016_item_ledger_trainer_source.sql` widens; pre-migration writes map
check_violation 23514 → HTTP 503.

**Live smoke result (production, 2026-07-06):** signed-in POST with
`source:'trainer'` returned **HTTP 200** + ledgerId + `evidenceTier:'practice'`
+ signed receipt. 0016 has been applied; trainer rows have been landing in
`item_ledger` for every signed-in completion since. The long-standing
"0016 pending / writes 503" belief was stale.

- Durable smoke: `node scripts/smoke-trainer-ledger.mjs <username> <pin>`
  (probe row `TI84-SMOKE-0016`, upserts over itself, grade-inert).
- Cleanup owed: throwaway student **`zz_smoke_delete_me` (PeriodX)** — delete
  via teacher-roster-console when convenient. Its one probe row dies with it.

### A.3 What is NOT evidence

- `trainer_state` / migration 0017 (cloud save for decks): client-owned display
  blob, size-capped, explicitly "never grade evidence" in code comments. Not
  part of this integration.
- Trainer rows carry no proctor header → always `evidenceTier:'practice'`.
- Receipts are issued (not gated) for trainer rows; no review-grant required.

### A.4 Evidence-tier reality (grades policy input)

- **Strongest:** handheld-mastery rows (typed real-TI result verified against
  the recompute oracle) — but they are only distinguishable from a perfect
  practice pass via `response.event === 'handheld-mastery'` (score alone is
  ambiguous: clean recall also reaches 1.0).
- **Medium:** emulator recall passes with exact-value verification.
- **Weaker:** U3 randomization procedures — property checks validate FORM
  (count/range/no-repeat), not exact TI RNG output.
- Anti-farm posture is acceptable for a 0-weight strand; before counting,
  restrict to mastery rows (§C.3).

---

## B. Desk / calendar visibility — ledger-authoritative

### B.1 This slice (shipping now)

**Server** (roster-server; see §C for the engine wiring):

- `lessons[]` in `/grade` gains `trainer` (0–100 or null) + `hasTrainer`
  (topic present in the lesson map), computed from `source='trainer'` rows.
- Per-lesson score = mean over the topic's mapped procedures of
  `bestRowScore × 100`, **missing procedure counts 0** (transparent partial
  progress; monotonic — more procedures done never lowers it).
- Lesson→procedures map: `roster-server/ti84-lesson-map.json`, a committed
  copy of `data/ti84-lesson-map.json` (23 topics, all 9 units). A root test
  pins the two files identical so they cannot drift silently.
- Quarter surface: `trainerDue / trainerDone / trainerTodo` mirroring the
  Blooket fields (due = due lessons whose topic is mapped; done = trainer
  ≥ 80; missing-but-due shows as todo). **No workAvg participation** (§C).

**Desk** (`ap_stats_roadmap_square_mode.html`):

- Display-only 🖩 state on lesson surfaces fed by `/grade`
  `lessons[].trainer` — same pattern as the Blooket score chip.
- **NO change to `_isLessonComplete`** — trainer must not gate advancement or
  greying in this phase. (Blooket keeps its ≥80 gate; trainer gets none.)
- The Do-Now calculator chip already appears only for mapped topics — keep.
- Calendar: inherits whatever `_isLessonComplete` says; since we don't touch
  it, calendar behavior is unchanged by design this phase.
- Never derive cross-device completion from trainer localStorage.

### B.2 Practice-completion rows — DECIDED: WAIT (teacher, 2026-07-06)

Precision on what Desk-launched practice records: `app.practice` suppresses
the normal walkthrough/attempt row (`recordTrainerAttempt` returns early — no
SRS outcome, no attempt row), but the practice flow **chains into the handheld
check**, and verified handheld mastery still records through
`recordHandheldMastery` (it has no practice guard). So chip-launched practice
DOES light the chip whenever the student proves the procedure on real
hardware — mastery-backed procedure evidence needs no new row type.

A `TI84-LESSON-<topic>` completion row would only add a separate
"topic practice completed" signal independent of procedure mastery.
**Decision: wait — procedure mastery rows are cleaner evidence.** Revisit only
if real usage shows students finishing practice queues without handheld
passes and that gap turns out to matter.

"Desk practice does not advance SRS scheduling" stays inviolate either way.

---

## C. Grade policy — Blooket-modeled, staged

### C.1 Where trainer rows sit in the engine today

Grade-inert by *double* omission: `parseItemLesson` has no `TI84-` pattern, and
the scoring loop has no `trainer` branch. Rows are dropped before any
accumulator — they cannot pollute existing categories.

### C.2 This slice: visible-but-uncounted

- `lesson-grade.js`: parse `TI84-<procedureId>` via the lesson map (procedure →
  topic), accumulate per-topic best scores, resolve per-lesson `trainer` pct,
  add a `trainer` quarter sub-track (due/done/todo/avg) — **and pass it to
  `workAvgV3` ONLY when `config.trainer.weight > 0`**.
- `grade-config.js`: `trainer: { weight: 0, doneThreshold: 80 }`. Weight 0 is
  the shipped default → `workAvgV3` inputs are bit-identical to today.
  (Adding a 0-weight key to `v3WorkWeights` itself is avoided — the track is
  excluded entirely unless enabled, so renormalization math never sees it.)
- **Grade-invariance is proven by test**: same ledger fixture with and without
  trainer rows produces identical `workAvg`/`pcAvg`/final grades at weight 0.
- `gradebook-grid.js` / Schoology mirror: untouched this phase. Teacher-side
  visibility already exists (`/class/grades` `trainer` summary panel); the
  Desk chip (§B) covers students.

### C.3 Counted mode (later, config-gated — do not enable without these)

Prerequisites: real usage data exists; shared-device identity spec verified in
classroom; teacher decides weight.

- Recommendation: a small separate **Calculator Skills** strand inside Work —
  add `trainer: 0.05` alongside blooket's `0.10` in `v3WorkWeights` (options
  considered: sharing Blooket's slice couples unrelated evidence and silently
  halves Blooket's meaning; folding into `lessons` makes it invisible and
  un-tunable). Note: enabling ANY new weight renormalizes the other Work
  slices (≈5% dilution) — that is the teacher's call, ~Sept with real data.
- Count only **mastery-tier** evidence: handheld-mastery rows
  (`response.event === 'handheld-mastery'`) or an explicit mastery itemId
  namespace if response-jsonb reads are too heavy for the grade query.
  Practice/walkthrough scores stay display-only. U3 randomization procedures
  count at most as practice (property-check ceiling), never mastery-tier.
- Mirror requirement: add the category to `SCHOOLOGY_CATEGORY_WEIGHTS`
  (gradebook-grid.js) in the SAME change that sets weight > 0, plus a
  `hasTrainer` column-emission block — otherwise in-app and Schoology views
  disagree.
- No-tank invariant (mirrors Blooket): null when no trainer-bearing lessons
  are due; renormalized away, never a 0.

### C.4 Test plan (mirrors the Blooket suites)

- itemId parsing: `TI84-<proc>` → topic via map; unmapped procedure ignored;
  smoke/junk ids ignored.
- Per-lesson resolve: missing-procedure-counts-0, best-wins across attempts,
  clamping, multi-procedure topics (`1.7`, `8.5`).
- Quarter track: due/done/todo denominators, combined-lesson slot collapse,
  no-mapped-lessons → null.
- **Weight-0 grade invariance** (the load-bearing test).
- Counted mode behind config: weight 0.05 → participates in `workAvgV3`
  renormalization exactly like blooket.
- Desk: chip renders from `/grade` fields; `_isLessonComplete` output
  unchanged with trainer data present.

---

## D. UI readability — SHIPPED (fa `b288b2a`)

Browser zoom is no longer the workaround. At 100% browser zoom:

- `--guide-scale` (default 1.3, A−/A+ in the banner, clamp 1.0–1.75) enlarges
  guidance text: problem pane, banner coaching line, physical-mode cards, and
  the narration bar (which compensates against the calculator scale so it
  tracks guide size while living inside the shell).
- `--calc-scale` scales ONLY the calculator shell. Default **Fit**: largest
  scale (0.55–1.0) where the whole shell (screen + keypad) sits inside the
  viewport height, measured scroll-invariantly; 🖩−/🖩+ set a manual scale
  (0.55–1.2), Fit restores auto.
- Guidance pane scrolls internally; both panes are sticky, so the calculator
  never scrolls out of view while reading long directions.
- Prefs are DEVICE-level (`ti84trainer_ui_prefs_v1`) — a screen property, not
  mastery state; they survive sign-in/out and identity switches.
- CSS `zoom` (not `transform`) so scaled panes participate in layout: space is
  reserved, hitboxes stay correct. Desktop-only (>960px); phone layout keeps
  its own compact rules.
- Tests: `tests/ti84-ui-scale.test.js` (7 cases, boots real app.js in jsdom).

Verification owed on a real laptop: 100% zoom → whole calculator visible,
directions comfortably readable, buttons clickable at reduced scale.

---

## Rollout order

1. ✅ D (UI) — shipped fa `b288b2a`.
2. ✅ A (verification) — smoke live-passed; script committed.
3. B+C visible-but-uncounted (roster-server + Desk chip) — grade-affecting
   SURFACE but engine-inert by default; invariance test required before push
   (roster-server auto-deploys on push to master).
4. Teacher decisions (2026-07-06): delete smoke student `zz_smoke_delete_me`
   (still owed); counting stays OFF for now; `TI84-LESSON-<topic>` rows —
   WAIT, mastery rows are the cleaner evidence (§B.2). Remaining open:
   counted-mode weight + timing (§C.3, ~Sept with real data).
