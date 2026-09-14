# Flashcard Improvement Brainstorm
*AP Statistics platform (`apstats-live-worksheet`), 2026-08-18. Produced by a 14-agent review: 5 readers (apstats flashcard UI, apstats grade path, apstats curriculum assets, casio-sxc1, kaiwa), 5 ideation lenses (41 proposals), 3 adversarial verifiers (breakage / grading / curriculum), 1 synthesis — then hand-verified against the repo.*

> **Status:** brainstorm / decision doc — nothing here is built. This file is uncommitted; no existing repo files were modified.

## TL;DR

- **Today:** two graded modes (Quick check → 80 cap, Full timed deck → up to 100) share one grade row `BL-U{u}-L{key}-DESK_DONE`, one 200-line pure engine (`flashcards.js`, output-parity-pinned to the Desk's inline twins), zero curriculum tagging beyond difficulty, and a per-card log that is written but **read by nothing**.
- **Three real defects found (hand-verified, see below):** a Cancel/reopen loophole that lets a "capped at 80%" quick check record 90–100%; the mobile timed deck reveals the answer on a miss (Desk hides it → same grade row is easier on a phone); the mobile "Saved offline / Sign in" notes can never fire (`_fcCommit` returns a Promise). **T1.1 (loophole) should ship first.**
- **What to borrow:** casio-sxc1's *Check-then-Rate* two-button flow with integer SM-2 scheduling and idempotent, versioned progress events; kaiwa's *evidence-channel walls* (practice never inflates the graded track), BKT readiness that's stricter than P(mastery), per-showing distractor permutation, and content-validation tests that reject bad cards.
- **The shape of the plan:** freeze the grade path (engine + item id + caps + server), and grow flashcards through **new sibling modules** — an SRS fold over the existing log, a flag-gated non-graded *Review* mode, a "Review due (n)" deck on the Desk, choice-position permutation, per-card content lint, and (once the teacher supplies the CED-2026 per-topic skill list) a card→skill sidecar map with a teacher review gate.
- **12 teacher decisions** are listed in §6; only Tier 3 items touch how an 80/100 is earned and all of those default to "ship behind a flag, off."

### Hand-verified before publishing

| Claim | Where | Result |
|---|---|---|
| Quick-check resume loophole | `ap_stats_roadmap_square_mode.html` `_bfAnswer` (~12048) banks the point; `idx` advances only in `_bfNext` (~12084); `closeBlooketFlashcards` (~12171) calls `_bfSaveProgress` on Cancel with the un-advanced `idx`; `_bfFinish` is deferred 900 ms after the passing answer and `_bfCloseUI` empties the deck so the deferred finish records nothing | **Confirmed.** Reopen re-serves an already-scored card; chained through the 900 ms window a quick check can record 90% and, repeated once more, 100%. |
| Mobile reveals on miss in timed mode | `mobile-home.html` `_fcResolve` (~1099) adds `.right` to the correct choice for every outcome, no mode check | **Confirmed.** |
| Mobile commit note never fires | `mobile-home.html` `_fcCommit` (~1189) assigns `gradebookClient.record(...)` — declared `async` at `gradebook-client.js:200` — so `committed.ok/.queued` are undefined and `_fcRenderResult` falls through to the generic note | **Confirmed.** |
| Server buckets by item-id regex regardless of source; `blooket = max(game, flashcard)` | `roster-server/lesson-grade.js:347-353, 485-494` | **Confirmed.** Blooket track = 10% of V3 work weight (`:764`). |
| Parity test is behavioral, not byte-level | `tests/flashcards-engine.test.js` extracts Desk bodies by brace-matching and compares outputs | **Confirmed.** Any change to `flashcards.js` must land with the inline twin in the same commit. |

---

## 1. Where flashcards stand today

**One pure engine, two UI surfaces, one grade row.**

- **Engine:** `flashcards.js` (200 lines, `window.Flashcards`): `parseCsv → rowsToDeck` (Blooket Import Template cols 0=Q#, 1=text, 2-5=choices, 7=1-indexed correct) → `selectTop10` (hard>med>easy>untagged from `data/blooket-difficulty.json`; first-10 when untagged) → shuffle; quick scoring `quickPassCount = ceil(0.8·len)`; timed round `createRound / recordOutcome / roundScore`; `blooketItemId(topic) → BL-U{u}-L{key}-DESK_DONE`. Constants `PASS_THRESHOLD=0.80`, `FULLDECK_SECONDS=40`, `QUICK_TARGET=10`.
- **The Desk does NOT load it.** `ap_stats_roadmap_square_mode.html` keeps inline twins (`_bfParseCsv/_bfRowsToDeck/_bfSelectTop10/_bfShuffle` ~11753-11851; `_ftCreateRound/_ftRecordOutcome/_ftScore` ~12236-12275). `tests/flashcards-engine.test.js` pins **output** parity (extracts bodies, runs both, `toEqual`) plus regex pins on `BLOOKET_PASS_THRESHOLD = 0.80` (:11669), `BLOOKET_FULLDECK_SECONDS = 40` (:12228), `'-DESK_DONE'`. It is *not* byte parity and does *not* compare `round.log`.
- **Mobile** (`mobile-home.html`, `#fco` overlay) loads `flashcards.js` (:162) and reuses the pure functions.

**Two modes (Desk picker `_bfShowModePicker` :11924, launched from the resource-panel Blooket row → `studentMark(...,'blooket')` → `openBlooketFlashcards`):**

| Mode | What it does | Score / commit |
|---|---|---|
| Quick check (`_bfStartQuick`) | Top-10 by difficulty tag, untimed, reveals correct answer, early-stops at `ceil(0.8·len)` correct | Commits **only on pass** (`_bfFinish` :12090, `if (passed`); effectively capped at 80 for 10-card decks (5/6 = 83.3 possible) |
| Full timed deck (`_ftStart`) | Every card, 40 s each, no reveal on a miss (pinned), miss = −⅓ + re-queue, 3 misses = 0 | **Always** commits (`_ftFinish` :12435 → `_ftLogToStore` + `_ftRenderRecap` + `_blooketCommit`) |

**Grade path (the contract):** `_blooketCommit` (:12510) refreshes `/grade` first, floor = max(server blooket, local mark) and only `score > floor` saves → `_studentMarkSave` (:11552) → `gradebookClient.record({source:'worksheet', itemId:'BL-U{u}-L{key}-DESK_DONE', unit, topic, response:{selfAttest:'blooket'}, score, attempt:1})`. Server `roster-server/lesson-grade.js:347-355` buckets **by item-id regex regardless of source** → `acc.blooketFlashcard`; :485-494 `acc.blooket = max(game, flashcard)`; the Blooket track is 10% of Work with denominator = required (66 core) due lessons, missing-due = 0. Server upsert key `(student_id, source, item_id, attempt)` is **last-write-wins** — best-wins is client-only. Also consumed by `donow.js:82-96` (self-done grey-out) and `js/wallet_logic.js:15` (4 wallet points). `_isLessonComplete` (:6400): Blooket half = local mark OR blooket ≥ 80 OR server latch; feeds sequential unlock.

**Logged but unused:** `_ftLogToStore` (:12485) writes `{topic,qnum,correct,latencyMs,wasTimeout,missIndex,ts}` to `apstats_srs_log_<email>` (cap 2000) — **timed mode only, Desk only, and nothing reads it anywhere.** Quick-mode resume lives in `apstats_desk_bf_progress_<email>` (`_bfSaveProgress` :11690 / `_bfLoadProgress` :11710). Mobile has no resume and writes no log. `blooket-difficulty.json` rationales (2409) are rendered nowhere.

**Known defects:**
- **Resume loophole (grade-relevant):** `_bfAnswer` (:12048) increments score before save; `idx` advances only in `_bfNext` (:12084); Cancel/Escape saves `{idx unadvanced, score incremented}` → reopen re-shows the card. Verifier finding: because `_bfFinish` is scheduled 900 ms after the passing answer and `_bfCloseUI` empties the deck, a close in that window can yield **90% — and, repeated, 100% — recorded** on reopen, above the advertised 80 cap. (Verified by hand; see table above.)
- Mobile `_fcCommit` assigns the Promise from async `gradebookClient.record()` to `res`, so "Saved offline / Sign in / Couldn't save" notes never fire.
- Mobile timed mode **reveals** the answer on a miss (Desk hides it), so the same BL row is easier to earn on a phone.
- `flashcards.js` and all `*_blooket.csv` are absent from `scripts/build-offline-pack.mjs` ROOT_FILES and `sw.js` CORE.

**Not enforced re: curriculum:** the 77 CSVs (2654 cards) carry **zero LO/EK/skill codes**; topic is filename-only; 7 combined decks map many-to-one (`data/blooket-topic-csv.json`), and three of them mix core and bonus content per card (u3_l6_l7, u4_l10_l12, u4_l3_l4_l5). `tests/content-validation.test.js` validates structure, resolution and difficulty-tag schema — nothing checks CED alignment or answer correctness. `data/skill-taxonomy-ced2026.json` (18 codes, LOCKED) exists but has **no per-topic skill lists and its cited source files are not on this machine.** Difficulty rationales are Codex-generated answer restatements, not explanations.

---

## 2. What casio-sxc1 and kaiwa do that we can borrow

1. **Separate evaluation from persistence** (casio `Engine.hs:302-336`): `Check` grades purely and writes nothing; only an explicit rating writes. *Adaptation:* the third "Review" mode — choices → `I'm not sure` → then `Again/Hard` or `Good/Easy`; the rating is the only thing logged, and it never touches `_blooketCommit`.
2. **Two-actions-per-stage, replace-don't-append** (casio M11; kaiwa `actionPair` throws on >2). *Adaptation:* Review mode owns ≤2 buttons per stage; a jsdom test counts them; Cancel moves to a header ✕ that still calls `closeBlooketFlashcards()`.
3. **Integer SM-2 with day-granularity, no clock, no floats** (casio `Scheduler.hs:57-97`; ease 2500 clamp [1300,3000], deltas −320/−140/0/+100, pinned interval table). *Adaptation:* `lib/flashcard-srs.js` folding the existing srs log; cap 45 days (semester) instead of 180; replay determinism test.
4. **One grade-derivation function with explicit-review precedence** (casio `Types.hs:214-236`). *Adaptation:* `gradeOfOutcome(entry)`: `review` verbatim if present; timeout/wrong → Again; correct with `missIndex>0` → at most Hard (answer-primed retry); clean → Good/Easy by one named latency constant.
5. **Idempotent events keyed `<round>#<seq>`** (casio `esRated`). *Adaptation:* new log entries carry `roundId+seq` and `csv` basename so a double-finish or a mobile+Desk write of the same round cannot double-count.
6. **Persist the folded state, not the events; version + `migrateWith` + never-overwrite-corrupt + tombstones for unknown ids** (casio `Codec.hs`; kaiwa `store.js` orphans). *Adaptation:* one versioned per-student store keyed `csv#qnum` **plus a stemHash** so a trimmed/shifted deck (the u4_l9 incident class) orphans state instead of misattaching it.
7. **Passport export/import with preview-before-commit** (casio envelope `{format,schema,exportedAt,payload}`; kaiwa ≤2 MB preview). *Adaptation:* `{format:'apstats-flashcards', version:1, ...}`, cross-student import refused, topic ids validated against the registry.
8. **Evidence-channel walls** (kaiwa `recordAssistedObservation`/`recordRebuildObservation`, guess = 1/optionCount, readiness gate stack requiring N objective corrects + one ≥12h spaced correct). *Adaptation:* review-mode self-ratings and `missIndex>0` retries never feed readiness; per-deck BKT via existing `lib/bkt.js` with pGuess 0.25 (0.5 for T/F stems); "Ready" is a display badge only.
9. **Rebuild ≠ evidence; delayed revisit** (kaiwa 10-min `BREAKDOWN_REVISIT_MS`). *Adaptation:* quick-check retry redraws fresh cards from the deck pool instead of re-serving the 10 whose answers were just shown; optional cool-down constant default 0.
10. **Per-showing option shuffle salted by attempt** (kaiwa `generatedOptionsForAttempt`; casio deterministic correct side per id). *Adaptation:* seeded, replayable choice-position permutation at render time (`data-i` stays the real index) — kills the "press A" exploit on the 24 position-biased decks without touching CSVs.
11. **Content validation as tests over the real corpus** (kaiwa `validateOptionSet`; casio exercise-check group 24). *Adaptation:* card-content lint — answer leaked in stem, undeclared near-duplicate sibling stems, T/F side balance, "all/none of these" options — ratcheted like `LEGACY_IMBALANCED`.
12. **Machine-readable hidden state + "why this card"** (casio `#sxc1-progress`; kaiwa `schedulerReason`). *Adaptation:* Desk⇄mobile parity harness with a `KNOWN_DIVERGENCES` ratchet; a one-line scheduler reason under each review card.
13. **Session planner: due (≤2) → continue → new → fill; completion reconciled from durable state, never the tab snapshot** (casio Today's Session). *Adaptation:* Desk "Review due (n)" deck capped at 20, snapshot in sessionStorage keyed by day, truth from the fold.

---

## 3. Non-negotiables (guardrails)

1. **Grade row shape is frozen:** `{source:'worksheet', itemId:'BL-U{u}-L{key}-DESK_DONE', unit, topic, response:{selfAttest:'blooket'}, score, attempt:1}`; `blooketItemId` outputs; `lesson-grade.js:61/347/485` semantics. Never mint another `*-DESK_DONE` id (donow/wallet regexes fire on it).
2. **Caps stay:** literal `BLOOKET_PASS_THRESHOLD = 0.80` and `BLOOKET_FULLDECK_SECONDS = 40` in the Desk; quick commits only on pass; timed always commits; credit ladder 1 / ⅔ / ⅓ / 0.
3. **Parity discipline:** any change to `flashcards.js` lands with the Desk inline twin and a parity `it` in the same commit; inline function names stay `function NAME(` (brace-matching extractor). Prefer **new sibling modules that are loaded, not copied.**
4. **Best-wins ordering:** `_blooketCommit` refreshes `/grade` before `score > floor`; strict `>`; property-tested (`feeder-bestwins-invariants`). Mobile `_fcCommit` **must stay synchronous** (harness asserts on its sync return).
5. **Static-pin hygiene:** no `_blooketCommit`/`_bfClearProgress` tokens before `if (passed` in `_bfFinish`; keep `_bfLoadProgress`'s `(entry.idx || 0) >= entry.deck.length`; keep `_bfKeydownHandler` shape; `_bfCloseUI` keeps removing both handlers + `_ftClearTimer` + `_ftState.round=null`; every new identifier inside executed harness bodies (`_blooketCommit`, `_fcCommit`, `_bfKeydownHandler`, `_bfSaveProgress`, `renderDoNow`, the mobile helper slice) is `typeof`-guarded.
6. **Storage keys stay:** `apstats_desk_bf_progress_<email>`, `apstats_srs_log_<email>` (additive fields only), `apstats_mobile_fcbest_v2`.
7. **Content is sacred:** CSVs are never edited by tooling (they feed the live Blooket game); `curriculum_render/data/curriculum.js` untouched; every roadmap topic resolves to an existing deck; no orphan CSVs; `data/skill-map.json` (≥2999, key families) not injected into.
8. **Vocabulary:** only the 18-code CED-2026 taxonomy student-facing; never bare old 2019 codes or VAR/UNC/DAT; bonus content follows the W8b precedent (no current-CED code).
9. **roster-server auto-deploys on push = grade-affecting by default.** Any server change ships env-flag default OFF; `lesson-grade.js` edits require bundle regeneration + transcript canonical review — avoid.
10. **Teacher sign-off in a `*_BUILD.md`** before anything changes *how* an 80/100 can be earned or *which* cards form the pass gate.
11. **View-as / read-only:** every new writer short-circuits on `_viewAsContext()`; nothing new writes under `__WS_READ_ONLY__`.
12. **Never invent content:** no AI-generated text reaches students without provenance `teacher` or a per-deck teacher audit flag.

---

## 4. Ranked proposals

Duplicates merged; canonical id first, absorbed ids in brackets. **Dropped/rejected:** none received a hard REJECT, but three were marked RISKY by at least one verifier and are demoted (see Tier 3/4). `arch:fc-module-boundaries`' *frozen 16-key export snapshot* is **rejected as written** (it would block ≥7 other proposals); the tiering idea itself survives.

### Tier 1 — do first: high value, low risk, walled off from grading

**T1.1 `grading:quick-answered-snapshot`** [ux:fc-resume-snapshot-integrity, arch:fc-quick-resume-answered-snapshot] — Persist `answered` in the resume record; resume at `idx+1`; **and** if `saved.score >= ceil(0.8*len)` finish immediately at the saved pct with no further answering. Reset `_bfState.answered=false` before `_bfSaveProgress()` in `_bfNext` (all three variants shared this latent bug). *Grading:* NONE to math; integrity fix on the 80 gate (heads-up, not sign-off). *Curriculum:* none. *Tests:* executed jsdom answer→close→reopen → idx+1; answer→Next→close→reopen → idx k+1; passed-then-closed commits once; pins 10b/11/12/20/21/22 kept. *Effort:* S. **Prerequisite for every logging proposal.**

**T1.2 `srs:srs-fold-engine`** [arch:fc-event-idempotent-scheduler] — `lib/flashcard-srs.js` (UMD like `lib/bkt.js`; `lib/` auto-ships in the offline pack): `cardId(csv,qnum)`, ONE `gradeOfOutcome`, integer SM-2 (cap 45 d), `foldLog`, `dueCards` (total order), event-id idempotency from the arch variant. Reads only the srs log; keys by `csv#qnum`; `topic` is metadata (7 shared decks); carries stemHash for orphaning. *Grading:* NONE. *Curriculum:* consumes vetted cards only; no per-topic bonus exclusion promised. *Tests:* pinned interval table, exhaustive grade mapping, replay determinism, fast-check ranges, purity source-inspection (no `Date.now/Math.random/localStorage/document/fetch/gradebookClient/_blooketCommit/_studentMarkSave/DESK_DONE`). *Effort:* M.

**T1.3 `srs:log-every-surface`** — Quick mode and mobile write the same `apstats_srs_log_<email>` key with additive `mode/csv/surface/roundId/seq/nChoices/chosenIdx`; view-as gated; `_bfState.log` reset on fresh load/retry; mobile email derivation byte-identical to Desk `getStudentEmail`. Log write goes before `if (passed` with no forbidden tokens. *Grading:* NONE. *Tests:* static pins + jsdom mobile boot asserting deck.length entries and unchanged BL row. *Effort:* S. **Depends on T1.1.**

**T1.4 `ux:fc-offline-first-decks`** [arch:fc-offline-and-mirror-assets] — Add `flashcards.js`, `mobile-home.html`, `data/blooket-*.json` to `sw.js` CORE; `flashcards.js` + `BLOOKET_RE` glob to ROOT_FILES; fix the async note via `Promise.resolve(_fcCommit(...)).then(...)` in `_fcFinish` (**keeps `_fcCommit` sync**); Desk queued pill via `OfflineQueue.all()`; smoke matrix covers the Vercel mirror; bump BUILD. *Grading:* NONE. *Effort:* S.

**T1.5 `ux:fc-touch-a11y-320`** — 44 px `.bf-choice`, 320 px layout, `role=dialog` on `.dialog-box` (not on `#bf-overlay` — attribute order is pinned), `aria-live` on feedback/result, focus into card and back to launcher (null-guarded, try/catch). *Grading:* NONE. *Effort:* S.

**T1.6 `ux:fc-mode-picker-honest-copy`** — Picker states current best (`_blooketScoreFor`), resume state (`_bfLoadProgress`), early-stop, best-wins, hidden-answer timed round; keep literals `Quick check`/`Full deck`; copy must say "Blooket half of Done (worksheet 60% also needed)", not "unlocks". *Grading:* NONE. *Effort:* S.

**T1.7 `ux:fc-misses-recap-both-modes` (a)-(c)** [curriculum:recap-rationale, later layer] — Recap on every finish (quick fail/pass, mobile) listing misses with the deck's own correct answer + "Review in the worksheet" link. **Do not render difficulty rationale** ("Why?"); a `<details>` appears only when a teacher-reviewed `explain` exists. Capture mobile misses before `_fc = null`. Keep `recapFromRound` inline unless the tier rule permits an export. *Grading:* NONE. *Effort:* M. Item (d) moves to T3.4.

**T1.8 `grading:scoring-guard-and-teacher-safety`** — Defense-in-depth (verifier: not a live leak — `recordProgress` already refuses under view-as): a `typeof`-guarded `_mayScore()` at the top of `_bfFinish/_ftFinish/_blooketCommit`, set/clear `__WS_READ_ONLY__` on view-as entry/exit, and add editable-target/overlay guards to `_ftKeydownHandler` (coordinate with T2.6 so added once). *Effort:* S.

**T1.9 `curriculum:card-content-lint`** — Executed lint in `content-validation` over the real engine output: unique choices, answer-in-stem, near-duplicate sibling stems (plus cross-card rule: correct-option text ≥25 chars appearing in another stem — catches u4_l1_l2 mirrors), T/F side balance, "all/none of these" permutation-safety; pairs declared in a small `data/blooket-card-pairs.json` (decoupled from the skill map); ratchet `LEGACY_PAIRS`; CLI `scripts/lint-blooket-deck.mjs`; rebuild the `.skill` zip. Findings = teacher review list, never CSV edits. *Effort:* S.

**T1.10 `arch:fc-phased-roadmap-gate-docs`** — Fix stale docs (`FLASHCARD_REWORK_BUILD.md` §2 gate claim, `BLOOKET_MAKEUP_BUILD.md` "game wins", `_studentMarkSave` comment :11563 — shrink only, w4 slice budget); docs-consistency test scoped to current-state sentences; keep `_flashcardsFromLauncher`. *Effort:* S.

**T1.11 `arch:fc-module-boundaries` (tier rule only)** — Adopt: Tier 0 `flashcards.js` grows only with inline twin + parity `it` + BUILD line; Tier 1 sibling modules under `lib/` (loaded, purity-tested; storage adapter exempted); Tier 2 glue as `function NAME(`. **Do not add the exact-16-key snapshot**; instead an allowlist test that grows deliberately. *Effort:* S.

### Tier 2 — high value, needs coordinated change/tests

**T2.1 `srs:review-mode-two-button`** [grading:practice-channel-separation, arch:fc-review-mode-flagged] — ONE third picker mode `_rv*` behind a staged flag (`data/flashcard-flags.json` URL→allowUsernames→allowSections→enabled, **fetched cache-busted** or with a BUILD bump). Casio grammar, `Again` re-queues with ≥3-card gap, ≤20 ratings, resume snapshot, "why this card" line, badge "includes beyond-the-exam cards" for u3_l6_l7/u4_l10_l12. Teardown in `_bfCloseUI` + Escape map. *Grading:* NONE, **proven** by a static test that `_rvStart/_rvRate/_rvFinish` bodies contain none of `_blooketCommit/_studentMarkSave/gradebookClient/recordProgress/DESK_DONE`. *Tests:* two-buttons-per-stage jsdom, verbatim rating logged, Escape teardown, flag resolution. *Effort:* M-L. Depends on T1.2, T1.3.

**T2.2 `srs:desk-due-today-deck`** [ux:fc-due-cues-streak] — One scheduler (the fold), cross-lesson "Review due (n)" chip rendered from `renderDoNowGrades/renderWhySoLow` (not `renderDoNow`, which clears `#donow-helper`), coach line appended after flashcardGate, per-row "k due" suffix, capped 20-card mixed deck labeled with the Desk's ced2026 labeler (deck lesson-range for combined decks), session snapshot by day, truth from the fold. Bonus exclusion stated as topic-level. *Grading:* NONE. Run `gitnexus_impact` on `renderDoNow`. *Effort:* L. Depends on T2.1.

**T2.3 `srs:srs-state-sync`** [ux:fc-progress-passport-sync, arch:fc-versioned-store] — One versioned store `apstats_fc_state_v1_<email>` (folded state, tombstones+stemHash, migrateWith, corrupt-never-overwritten, backfill from the srs log), one passport format, one trainer deckId **`ap-stats-flashcards`** via `TRAINER_DECK_ALLOWLIST` env (no code push), tuple indices 0/3/4 preserved for `tupleIsNewer`; degrade to local-only on any failure; teacher summary labeled non-authoritative. *Grading:* NONE (trainer_state is documented never-grade). *Effort:* M. Depends on T1.2.

**T2.4 `grading:choice-position-permutation`** — Seeded per-showing permutation at render; `data-i` = real index; identity fallback when `perm` absent (keyboard harness); fix highlight loops to map through `perm`; skip cards whose options match "all/none of these" (from T1.9); engine helpers + Desk twins + parity `it`; kill-switch flag. *Grading:* NONE to math; **teacher heads-up: pass rates on u4-style decks will drop.** *Effort:* M.

**T2.5 `srs:bkt-topic-readiness`** — `foldMastery` per **deck** (presented per topic via the map), `lib/bkt.js` untouched, pGuess 0.25 / 0.5 for T/F stems (needs `nChoices` from T1.3), kaiwa gate stack with 24 h spaced correct; badge copy "Practice signal — not your grade" appended beside `_scoreChip`; never consulted by `_isLessonComplete`. *Tests:* ported kaiwa property tests. *Effort:* M.

**T2.6 `ux:fc-two-action-stage-keys`** — Quick-mode auto-advance after a correct answer **only on the non-passing branch** (early-stop path already schedules `_bfFinish`), cancellable `advanceId` cleared in `_bfCloseUI`; header ✕; timed keydown guards (once, with T1.8); mobile quick-only. *Effort:* M.

**T2.7 `grading:attempt-evidence-audit` (Tier A)** — Bounded `response.run` (≤400 B, no question/answer text, deckHash) via an optional 5th `_studentMarkSave` param (mind the 4400-char w4 slice); dashboard "review suggested" flag (never penalty). **Premise fix:** Nightly Review redacts BL responses (`review.js:372`) — needs a teacher read route or accept lb-only visibility via T2.3. *Grading:* NONE (server reads score only). *Effort:* M.

**T2.8 `arch:fc-surface-parity-harness` (1)** — Harness + `KNOWN_DIVERGENCES` ratchet, landed before any mobile convergence. *Effort:* M.

**T2.9 `grading:quick-retry-redraw`** — `retryDeck` keeps missed cards, fills from unseen pool in difficulty order; persist `poolQnums` not card objects; keep `_bfShuffle(_bfState.deck)` and first-draw `_bfSelectTop10` pins; cool-down constant **default 0** (sign-off to change). *Grading:* grade-adjacent (harder to pass by priming), no math change. *Effort:* M. Depends on T1.1.

### Tier 3 — needs teacher decision (touches grade math, gate composition, or how an 80/100 is earned)

**T3.1 `grading:server-monotonic-bl-guard`** [arch:fc-server-bl-max-merge] — Skip-write variant in the `/ledger/record` route only (not `insertLedgerRow` — admin-restore replays faithfully), env `LEDGER_MONOTONIC_ITEM_PATTERNS` default OFF, no new receipt on skip, `typeof`-guard the new db read for `ledger.test.js`'s fake, document `/ledger/import` bypass. Verdicts: breakage/grading SAFE_WITH_CONDITIONS, curriculum RISKY (grade-affecting on flip). *Sign-off + admin correction path required before flipping.* *Effort:* M.

**T3.2 `curriculum:coverage-selector`** — `selectCoverage` behind `BLOOKET_QUICK_SELECTOR` default `'difficulty'`, per-topic rollout, fallback to `_bfSelectTop10`, flag-off snapshot test; real value = excluding teacher-`exclude`d beyond-the-exam cards from core-topic quick checks. Changes which 10 cards form the pass gate → sign-off. Depends on T4.1/T4.3.

**T3.3 `srs:srs-spaced-pass-hook`** — New way to earn exactly 80 through the unchanged `_blooketCommit`; code constant default false; objective (quick/full, missIndex 0) entries only; **not enabled for u3_l6_l7/u4_l10_l12 topics until per-card status exists.** All three verifiers RISKY — policy change, keep parked until a `*_BUILD.md` decision.

**T3.4 `grading:mobile-timed-parity` (1)** [ux:fc-misses-recap (d), arch:fc-surface-parity-harness (2)] — Remove mobile mid-round reveal behind `FC_MOBILE_REVEAL_ON_MISS=false` (constant outside the sliced helper block), keep `#fc-next`. Same BL row becomes as hard as on the Desk; some mobile scores drop → sign-off. Log write (3) is T1.3; async fix (2) is T1.4.

**T3.5 Quick-retry cool-down > 0** (from T2.9) and **`srs:unit-review-before-pc`** — the latter marked RISKY by curriculum: unit membership must resolve through `2026-crosswalk.json`/`lesson.ced2026.newUnit` (never old-id prefix), restrict to taught topics via `_lessonDateMap`, inert until the calendar is ingested. Ship only after T2.2 with a pinned "Unit 2 PC deck contains old-4.x, no old-2.x" test.

### Tier 4 — later / speculative (blocked on missing sources or teacher review)

**T4.1 `curriculum:blooket-skill-map`** + **T4.2 `curriculum:codex-align-job`** — Blocked: no in-repo CED-2026 per-topic skill list (taxonomy's cited `framworkSY2627/unit*framework.txt` absent), grounding texts carry old codes (collision), per-card topic/status needed for shared decks, bonus policy must follow W8b. Land as data + tests with zero consumers, only after the teacher supplies `data/ced2026-topic-skills.json` with provenance and a mandatory spot-audit sample.
**T4.3 `curriculum:teacher-override-file`** — the review gate the rest depends on (LOCAL-ONLY `tools/blooket-tag-review.html`, `exclude.reason` enum). Can start before T4.1 for `pairOf`/`exclude` alone.
**T4.4 `curriculum:recap-rationale`, `curriculum:distractor-misconceptions`, `curriculum:recap-worksheet-link`** — student-facing text only with provenance `teacher`; chip labeled "CED-2026 skill"; DOM test for no VAR-/UNC-/DAT-; worksheet link phase 1 text-fragment only (redefine `questionId`), phase 2 codemod as its own guarded rollout.
**T4.5 `grading:attempt-evidence-audit` Tier B**, teacher mastery heatmap — after T2.3.

---

## 5. Phased roadmap

**Module boundary:** *Frozen:* `flashcards.js` (grow only via twin+parity), Desk `_bf*/_ft*` bodies, `_blooketCommit/_studentMarkSave`, `roster-server/lesson-grade.js`, all CSVs, `curriculum.js`. *New:* `lib/flashcard-srs.js`, `lib/flashcard-store.js` (with adapter), `lib/flashcard-flags.js`, `data/flashcard-flags.json`, `data/blooket-card-pairs.json`, `scripts/lib/blooket-lint.mjs`, Desk `_rv*`/`_srs*` glue, mobile `_fcSrs*` glue, tests listed above.

| Phase | Ships | Rollback point | Must stay green |
|---|---|---|---|
| **P0 (week 1)** | T1.1 loophole fix; T1.10 docs; T1.4 offline assets + async note; T1.5 a11y; T1.6 copy; T1.8 guards; T1.9 lint; T1.11 tier rule | Revert per commit (each independent) | flashcards-engine, desk-blooket-flashcards (54), desk-timed-deck, desk-view-as, mobile-home-flashcards, mobile-home-fc-csv-fallback, feeder-bestwins-invariants, content-validation, pwa/offline-pack |
| **P1 (weeks 2-3)** | T1.2 SRS module (loaded, no consumer); T1.3 logging on all surfaces; T1.7 recap; T2.8 parity harness ratchet | Remove `<script>` tags / revert log lines | + flashcard-srs.test.js, grade-pipeline-w4, desk-nightly-review |
| **P2 (weeks 4-6)** | T2.1 review mode (flag off → staged); T2.3 store/passport/sync (env allowlist); T2.2 due-today deck; T2.5 readiness badge; T2.4 permutation (kill-switch); T2.6 stage flow; T2.7 evidence Tier A; T2.9 redraw (cool-down 0) | Flag JSON flip; remove wrapper calls; kill-switch localStorage; env removal | + desk-donow-card, desk-why-so-low, roster-server trainer.test.js, desk-modal-escape |
| **P3 (sign-off bundle)** | T3.1 server guard env flip; T3.4 mobile reveal removal; T3.2 coverage selector per-topic; T3.5 cool-down/PC deck; (T3.3 parked) | Env off / constant flip / revert mobile diff | roster-server suite incl. lesson-grade, blooket, donow, transcript-canonical, grade-engine-bundle-parity |
| **P4 (curriculum, gated on sources)** | T4.3 override tooling → T4.1/T4.2 map + align job → T4.4 recap layers | Data files inert without consumer flags | content-validation, skill-map, ti84-skill-taxonomy |

Every commit: `gitnexus_impact` on edited symbols, `gitnexus_detect_changes` before commit, all three suites green, `npx gitnexus analyze` after.

---

## 6. Teacher decisions needed

1. **Server monotone floor for BL rows** (T3.1) — enable? *Default: yes*, after documenting the admin correction path (direct DB / nightly review).
2. **Remove the mobile mid-round reveal** (T3.4) — *Default: yes*; some mobile timed scores will drop; announce to students.
3. **Choice-position permutation** (T2.4) — heads-up only: pass rates on the 24 position-biased decks will fall. *Default: on with kill-switch.*
4. **Quick-retry redraw cool-down** (T2.9/T3.5) — *Default: 0 (off)*; if on, 10 min.
5. **Coverage selector** (T3.2) — *Default: off* until per-card `exclude` exists; then enable only for u3_l6_l7 / u4_l10_l12 topics first.
6. **Spaced-pass hook** (T3.3) — new way to earn the 80. *Default: no*; revisit after a semester of review-mode data.
7. **Quick score clamp** — clamp early-stop passes to exactly 80 for <10-card decks? *Default: leave as is* (only 7 orphan/short decks affected).
8. **Bonus-card policy for tagging** — W8b rule (no current-CED code, `status:'bonus'`) or tag anyway? *Default: W8b.*
9. **Vocabulary source** — supply/verify `data/ced2026-topic-skills.json` from the official Fall-2026 unit guides (with page refs). Without it, P4 stays parked.
10. **What students may see from AI-generated text** — *Default:* nothing until provenance `teacher` or a per-deck spot-audit flag; difficulty rationales never rendered.
11. **Trainer-state channel for flashcard sync** — add `ap-stats-flashcards` to `TRAINER_DECK_ALLOWLIST` on Railway? *Default: yes* (env only, non-grade).
12. **Review-mode rollout ladder** — which sections first? *Default:* URL param (teacher test) → one section → all.

---

## 7. Open questions / verify before building

- Does the Android/offline pack actually get rebuilt after ROOT_FILES changes, and does `android-app/www` exist anywhere to confirm? (not present locally)
- Confirm the 900 ms close-window 90% path with an executed jsdom repro before writing the T1.1 test — it is the load-bearing regression case.
- Reconcile the two `gradeOfOutcome` latency constants (12 s "easy" vs 20 s "good") — pick one named constant, document it as a pedagogy choice.
- Confirm Desk `getStudentEmail` legacy `apstats_desk_student_email` users vs mobile `<username>@roster.local` — how many students have divergent keys? Decide whether to migrate the legacy key.
- `sw.js` cache-first + `{cache:'no-cache'}`: verify a cache-busting query on `data/flashcard-flags.json` actually bypasses the SW asset rule; otherwise every flag flip needs a BUILD bump.
- Where does the teacher read `response.run` (T2.7)? `review.js:372` redacts it — confirm whether a `/ledger/student/:sid` teacher route exists or must be added (roster-server change).
- Verify `_flashcardsFromLauncher` (`?flashcards=`) has no remaining callers (index.html:290, teacher tools) before pinning it.
- Is the `Supabase lesson_urls` worksheet override ever pointing a topic at a *different* CSV than the file? If so, `csv#qnum` keys and difficulty tags silently mismatch.
- Confirm `blooket-difficulty.json` rationale quality claim on a larger sample before deciding whether an `explain` field is worth authoring at all.
- Should timed-mode keep no resume by design (verifier: intentional)? Document it in the tier rule so nobody adds one without the snapshot rule.
- Confirm with GitNexus the fan-in of `renderDoNow`, `_bfShowModePicker`, `_bfCloseUI`, `_studentMarkSave` before P1/P2 edits and record the blast radius in the BUILD doc.