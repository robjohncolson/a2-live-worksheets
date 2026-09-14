# Grade Substrate CED-2026 Fix — Spec v2 (W4)

**Status:** v2 after Codex adversarial review (gpt-5.6-sol, two-pass). v1's central recon claim was ruled FALSE and the design received CORRECTIONS — this version is rebuilt on the verified findings.
**Review evidence:** `state/cross-agent/635c25f0a131.result.json` (Part A — claim verification, file:line receipts) and `state/cross-agent/e5cb519aa888.result.json` (Part B — design stress-test). Cited below as [A#]/[B#].
**Date:** 2026-07-09 · **Author:** Fable · **Prime directive:** seamlessness gate (plan §1.8) — history and current students change by exactly nothing.

## 1. Goal & non-goals — unchanged from v1

Align the grade substrate with the 5-unit CED **without** touching historical rows/receipts/ids, without changing any SY2526-or-summer student's computed grade, and without depending on the final SY2627 calendar. Bonus never deleted, only non-required. No pedagogy-knob tuning.

## 2. Verified ground truth (post-review — v1's §3 corrected)

1. **Quarter bands are NOT PC-only** [A1 FALSE]. Consumers of `quarters[q].units` beyond the PC track: the env-gated **V3 path buckets every lesson by `quarterOfUnit`** (lesson-grade.js:885-895), the no-schedule fallback filters by band (grade.js:340-359), **gradebook-grid builds lesson columns AND PC+Poster columns from bands** (gradebook-grid.js:102-145), plus band-consuming surfaces v1 missed entirely: `class.js`, `transcript.js`, `review.js`, and the **offline `grade-engine.bundle.js`** loaded by the Desk and teacher-app. Any band change ripples through all of these.
2. **Schedule dual-copy drift is real and meaningful** [A2]: the server loads `roster-server/data/lesson-schedule.json` (env → bundled → repo-root priority; server.js:1148-1165), which already carries SY2627 dates on the **9-unit** model (1.1→2026-09-09, 9 PCs from 2026-09-24); the public copy has null/spring dates. Not cosmetic.
3. **PC collision is certain at the aggregate level** [A3]: PC rows aggregate to `U1`…`U9` keys with **no year partitioning before `latestPerItem`** (scoring.js:81-177, grade.js:118-125); SY2526 already occupies `U1–U5`. Ledger uniqueness is `(student, source, item_id, attempt)` — **no date/year**. Also: `source:'pc'` includes study-guide `U{n}-SG` rows, and the live pacing reuses `t:U1-PC1` for BOTH the opening baseline and the end-of-unit PC day [B2].
4. **Config resolves at read time** [A4 TRUE]: every GET recomputes from the live `PHASE3_CONFIG`; nothing selects config by row date. In-place edits reinterpret all history.
5. **Blooket denominator bites only on the env-gated V3 branch** [A5]; the flashcard combined-CSV gap is narrower than audited — only mobile's **ID-only fallback** misresolves (`3.6`→`u3_l6_blooket.csv`); normal Desk/mobile opens resolve via worksheet URL correctly.
6. **The grade path hardcodes `periods.B/E`** [A6]: `sectionToPeriod('PeriodX')` → `'E'`. A literal `periods:{X:date}` schedule silently breaks quartering, due flags, and PC due discovery.
7. **Actual PC administration quarters (live provisional pacing)** [B2]: ≈ Q1:{U1,U2}, Q2:{U3,U4}, Q3:{U5}, **Q4: none** — the course ends ~Apr 30, so Q4 is PC-less and some quarter holds two PCs. v1's `Q1:[1]…Q4:[4,5]` mis-bucketed nearly everything.
8. **The schedule fans out far beyond grades** [B3]: transcripts **hash** the schedule + config (provenance changes on regen even if numbers match); Schoology sync knows only PeriodB/E/Y (PeriodX → defaults to B / empty scope); offline packs cache old schedule+engine; gradebook dates PC/Poster columns by earliest band lesson, not `progressChecks`.
9. **Omitting bonus lessons from the schedule would HIDE earned work** [B3]: `expandLessonKey` returns nothing for missing ids. Bonus must remain present-but-unscheduled, never absent.

## 3. Design v2

### D1′ — Atomic year-resolved **grade context** (not config-only versioning)
An immutable registry keyed by school year; each entry is the full bundle `{schoolYear, config, lessonSchedule, answerKeyVersion, blooketDenominator}` [B1.5]. A resolver returns **one concrete context** per computation — the runtime `config` argument keeps its current concrete shape (server.js shallow-spreads it; consumers expect `config.C`/`config.quarters`) [B1.1]. `SY2526`'s entry snapshots today's *actual* SY2526 semantics — noting today's live object is already a hybrid (old bands + SY2627 windows), so the frozen entry must be reconstructed to reproduce current outputs byte-identically, which the invariance test defines as truth.
**Year resolution is by cohort/schedule identity, never `recorded_at`** (ingestion-stamped; late imports would flip years) [B1.4]. The year domain is **total**: intersession dates have a defined owner (G8 below).
**PC rows partition by school year BEFORE `latestPerItem`/aggregation** [A3, B1.1]; SY2627 PC item-id families get a distinct namespace (and the baseline a distinct identity from the end-of-unit PC) so physical ids can never collide with SY2526 rows.

### D2′ — SY2627 PC bands derive from the **pacing**, not unit-per-quarter intuition
Bands are generated from where PC administration dates actually land in the quarter windows (currently ≈ Q1:{1,2}, Q2:{3,4}, Q3:{5}, Q4:{}) and regenerate with the real calendar. Policy pins, asserted by test: every PC's scheduled quarter == its configured grade quarter (or documented carryover); the double-PC quarter is intentional and stable; **a PC-less Q4's grade story is explicit** (Q4 = work track + retakes window — confirm as G9). Client mirrors (Desk `QUARTER_BAND_LABEL`, start-here's hardcoded U1/U2/U3 PC inputs and band copy) ship in the same increment, test-asserted [B4].

### D3′ — SY2627 `lesson-schedule.json`: regenerate **with B/E compatibility keys**
Generated from the CED pacing: 67 core lessons dated (old-id keys), **10 bonus lessons present but unscheduled** [B3-bonus], 5 PCs + posters with real event dates, `periods.E` retained as the storage key for the universal Period X (matching `sectionToPeriod('PeriodX')→'E'`; B also mirrored for legacy readers) [A6, B3-blocking]. Single generator, dual-write byte-identical; current drifted copies archived (public + server) as the SY2526/9-unit snapshots that D1′'s frozen context references — **the archive is load-bearing, not decorative** [B1.5].
Downstream fan-out handled explicitly: transcript hash change is expected-and-documented (or transcripts pin their context version) [B3]; Schoology sync gains PeriodX mapping *before* any SY2627 push; offline pack rebuild + cache-version bump is a listed step, not an afterthought.

### D4′ — Blooket/flashcards (W5) — unchanged in intent, narrowed in scope
Core-67 denominator (V3 branch is where it bites [A5]); bonus flagged, visible-but-never-required (G4). Fix the **mobile ID-only fallback** resolution specifically (topic→combined-CSV map); Desk/normal paths already work — don't churn them.

### D5′ — Declare the non-grade surfaces
Drills: explicitly non-grade, grade-invariant (or get their own spec later). Posters: visible-but-uncounted (scoring unimplemented; gradebook returns null) — removed from acceptance claims [B4]. Wallet/receipts: year-less by design; receipt display gains a read-time year/new-unit crosswalk, **no receipt rewrites** [B4].

## 4. Increments v2

| # | Increment | Contents | Depends |
|---|---|---|---|
| M2a | Blooket denominator + mobile CSV fallback (W5) | D4′ | — |
| M2b′ | **Grade-context registry + resolver** (freeze SY2526 byte-identically; year-partitioned PC aggregation scaffold) | D1′ | — |
| M2c′ | SY2627 schedule + pacing-derived PC bands + client mirrors + Schoology PeriodX + pack rebuild step | D2′+D3′ | M2b′, G8, G9 |
| M2d | Teacher dashboard bonus/core labels + receipt year-crosswalk display | D5′ | M2a |

## 5. Acceptance — v1's six checks plus:
7. **History invariance now includes transcripts**: replayed SY2526 ledgers reproduce grades byte-identically AND transcript verification either reproduces or the provenance change is versioned-and-documented [B3].
8. **PC quarter agreement**: for every SY2627 PC, scheduled administration quarter == configured grade quarter (test) [B2].
9. **Year totality**: every date 2026-06-01→2027-06-30 resolves to exactly one grade context; no null-context gap [B1.3].
10. **Bonus presence**: all 87 old ids resolve in the SY2627 schedule (77 lessons incl. 10 unscheduled bonus + PC/poster events); `expandLessonKey` hides nothing [B3].

## 6. Gating decisions (NEW — from the review; block M2c′ only)

- **G8 — Summer-2026 prework ownership** [B1.3]: summer rows (July–Aug 2026, and the 2026-06-24→09-08 gap) belong to which grade context? Options: (a) attach to **SY2627** (summer work banks into fall Q1 — matches the "banked real work before day one" promise in Start Here), (b) SUMMER26 as its own frozen cohort, (c) SY2526 until a stated cutover. **Recommend (a)** — it matches the student-facing promise; grades differ across options, so this is the user's call.
- **G9 — PC-less Q4 story**: with the course ending ~Apr 30, Q4 has no new PC. Confirm Q4 = work-track + PC-retake window (the existing retake-until-quarter-closes rule gives Q4 its PC evidence). **Recommend yes.**

## 7. Unchanged open items
v1's §7 (window dates, anchor carry-forward, no SY2526 export needed) — defaults stand.

## 8. USER DECISIONS (recorded 2026-07-09 — these override anything above)

1. **PC redo deferred to its own pass.** The user now has access to the official Fall-2026 Progress Checks; the next major pass replaces current PC material wholesale (then video comparison follows). M2c′'s PC-banding work and the A3 year-partition scaffold WAIT for that pass — don't build banding against PC content that's about to be replaced.
2. **G9 confirmed, and stronger:** Q4 is a review quarter (fine to have no new PC). Bigger: **the grading scheme only has to be fully faithful through the end of Q1** (~Nov). By second semester the model is done — the teacher awards curved A's based on classwork. Engineering consequence: M2 optimizes for Q1-fidelity + history persistence; do NOT gold-plate Q2–Q4 band mechanics.
3. **G8 = SY2627 owns summer work.** Current summer students ARE the SY2627 cohort (period assignment pending the real schedule); their summer rows resolve under the SY2627 context and **must persist** into fall.
4. **Bonus lessons: OMIT from the SY2627 schedule** (user call, overriding D3′'s present-but-unscheduled). Safe because: students haven't reached bonus content (summer = 1.1–1.10), SY2526 history resolves under the frozen context which retains them, and bonus is never-required anyway. Caveat accepted: a SY2627 student who does bonus work won't see it in schedule-driven grade views (ledger rows persist regardless).
5. **M2a and M2b′ approved** for dispatch.
