# Desk "Do Now" + Unified Completion-Colored Fall Calendar — Spec

**Status:** **DRAFT — ready for sign-off (no open blockers).** Brainstormed & converged 2026-05-18 (session 99). §6 exam-date pin RESOLVED 2026-05-18 (teacher chose option 1). No code yet — awaiting explicit sign-off.
**What this is:** the loop-closer. Phase 0 gave identity, Sprint 1 gave the `item_ledger`; nothing yet shows the *student* what to do next or what they've banked. This spec defines that: a prescriptive **"Do Now"** + the Desk's schedule reframed as **one school-year calendar that colors in as work is banked**.
**Relationship:** depends on Phase 0 roster (LIVE) + Sprint 1 `item_ledger` (LIVE, `/ledger/record`) + the v2-hybrid grade model (`GRADEBOOK_GRADING_SPEC.md` — cumulative+capped; color = banked). Reuses study-guide daily-queue UX patterns. **Forces the previously-deferred §6.4/Phase-1 adoption to become this feature's hard prerequisite (decision D2).**

---

## 1. The loop

`expected_work (manifest)  −  item_ledger(student)  →  { the single next task (Do Now),  per-lesson-day completion state (calendar color) }`

One server engine, two views: **Do Now** = projected to "the next thing"; **calendar** = the same data projected onto school-year dates. A summer student doing work early watches the *real fall calendar* fill in ahead of day one — color = banked grade made visible.

## 2. Locked decisions (teacher, 2026-05-18)

| # | Decision |
|---|---|
| **D1** | **Soft prescriptive default, never a hard gate.** Do Now points at the *earliest incomplete activity*. Opening a far-ahead unit with earlier gaps → a gentle interstitial: *"You have unfinished work in Unit X — recommended to finish that first. Continue anyway?"* Units stay open. Preserves the signed-off "all units open / self-paced / do it ahead" promise; guides the lost without caging the capable. |
| **D2** | **The deferred §6.4/Phase-1 adoption is now this feature's hard prerequisite** — and moves *ahead of* the full tagging-disambiguation run. Required: wire `rosterClient` into the Desk (identity); wire `gradebookClient.record(...)` into the worksheets + the curriculum_render quiz (so the ledger is actually populated). Do Now is worthless against an empty ledger. |
| **D3** | **"Complete" = attempted/submitted, not pass-gated.** Do Now surfaces *un-done* work; correctness flows to the grade separately (never-punitive — a low score never re-nags forever). Optional, *separate* "improve a low score" nudge, visually distinct from "not done." |
| **D4** | **Task granularity = per-activity, with progress.** "Finish the U1 L3 quiz — 4/12 done." Not per-question (nagging), not per-lesson (misses the half-done quiz). |
| **D5** | **One schedule = the real school year.** Drop the "Summer schedule" construct entirely (**supersedes the just-shipped SUMMER26 Jun-22 re-date**). The displayed calendar = SY26-27 (Sept 1 2026 → AP Stats exam, see §6 data-pin). The "U1–5 prep" value is preserved via Do Now's earliest-gap walk (a summer student is naturally driven U1→U2→U3…), not via a separate calendar. |
| **D6** | **Calendar cells color-in by completion. Four states:** not-started (grey) → in-progress/partial (amber) → done (green) → **done *ahead of the class* (distinct celebratory accent — gold/glow)**. Cell = one **lesson-day**; its color = roll-up of that lesson's per-activity completion (D4). The in-class daily rhythm (Blooket → video+worksheet → Blooket → quiz) stays visible on hover/expand; the at-a-glance signal is the color. The "ahead" accent fires when the lesson is done **and** its class-date is still in the future — the summer power-student's reward. |
| **D7** | **Architecture: server-mediated, one engine.** A roster-server endpoint computes `manifest − ledger` and returns both the next task and per-lesson-day completion (+ the "ahead" flag = done while class-date is future). The single-file Desk **renders + polls only — never touches Supabase directly** (Phase 0 §6.5, no anon Supabase). Reuse the study-guide queue UX; the novelty is the manifest−ledger + earliest-gap + ahead-detection, not the card UI. |

## 3. Data model

- **Manifest** — expected feeder items per `unit → lesson → activity`, each activity mapped to its **fall-calendar lesson-day cell**. Largely derivable from T1's skill-map id inventory (it already enumerates every worksheet item id + curriculum.js quiz id, keyed by unit/topic) + a per-activity grouping + a lesson→date mapping from the single fall schedule. **Integration risk to call out:** the manifest's item_ids MUST match exactly what the feeders record into `item_ledger` (`gradebookClient.record`'s `itemId`). Manifest ⟷ feeder id scheme ⟷ ledger must be one consistent vocabulary or "remaining" math breaks.
- **Ledger** — `item_ledger` filtered to `student_id` (Sprint 1; via roster-server, service-mediated). "Done" = a row exists for that item_id (attempted; D3) regardless of score.
- **Endpoint contract (sketch, frozen at spec-build):** `GET /donow?studentId=…` →
  ```
  { nextTask: { unit, lesson, activity, url, progress:"4/12", reason:"earliest gap" } | null,
    calendar: [ { date, unit, lesson, state:"none|partial|done|ahead", progress } … ],
    earlierGapFlag: bool   // true if any earlier-than-current incomplete work exists (drives D1 speed-bump) }
  ```
  Lives on roster-server (holds ledger access + service key; same service-mediated pattern as `/ledger/*`, `/roster/*`).

## 4. Build sequencing (after sign-off; same method)

1. **Prerequisite adoption (D2):** `rosterClient` into the Desk (single sign-in surface); `gradebookClient.record` into worksheets + curriculum_render quiz so the ledger populates. (This is the previously-deferred §6.4/Phase-1 work, now first.)
2. **Manifest builder** — emit the `unit→lesson→activity→cell` expected-work map from T1's id inventory; lock the item_id vocabulary shared with the feeders.
3. **`/donow` endpoint** on roster-server — `manifest − ledger` → next task + calendar state + earlierGapFlag.
4. **Desk rework** — collapse to the single fall calendar; render completion colors (D6 4 states); the Do Now card (D4 per-activity + progress); the D1 soft speed-bump interstitial.
5. **Polish** — refresh/poll cadence; the celebratory "ahead" treatment; transfer-in/late-start UX.
Method unchanged: planner freezes contracts → parallel Sonnet → Codex review → planner re-verify; tight single-purpose commits (concurrent AI-tutor session co-commits this repo).

## 5. Open knobs (decide at spec-freeze)

1. Poll/refresh cadence for the Desk (on focus? interval? after a known submit?).
2. Exact color palette + the "ahead" celebratory treatment (glow vs gold vs animation) — visual taste.
3. Lesson-days that bundle multiple lessons (combined worksheets exist for U4/U5) — cell roll-up rule.
4. Transfer-in / Sept-start student: all-grey calendar + Do Now = U1 L1 (fine, never-punitive — confirm the messaging isn't discouraging).

## 6. ✅ Data-pin RESOLVED — AP Stats exam date (the calendar horizon)

Teacher's source said "Friday, May 16" but **May 16 2027 = Sunday** (invalid for an AP exam — College-Board copy/transcription error acknowledged by the teacher). **RESOLVED 2026-05-18 (teacher chose option 1): AP Statistics exam = Friday, May 14, 2027, 8 AM** = the existing roadmap value `examDate:[2027,4,14]` (no value change needed). The single fall calendar runs **Sept 1 2026 → Fri May 14 2027, 8 AM**; SY26-27 `examDate` stays `[2027,4,14]`; add the 8 AM start time to the horizon display.

⚠ **Residual (build-time, not a blocker):** this matches a possibly-stale roadmap value, not a verified College-Board 2027 source. Before the calendar is student-facing, **web-verify the official 2027 AP Statistics date** (cheap; College Board publishes it) and correct `examDate` + `computeApExamDate()` if it differs. Acceptable to spec/build against `[2027,4,14]` now and confirm pre-launch.

## 7. Non-goals / guardrails

- **No hard gate** (D1) — units never lock; this is guidance, not a cage.
- **No direct Supabase from the Desk** (D7 / Phase 0 §6.5) — service-mediated only.
- Does **not** change the grade formula (v2 §2 cumulative+capped stands) — Do Now/coloring is the *view* of banked work, not a new grade.
- Never touches sacred `curriculum.js`; never inline-tags worksheets.
- Don't reinvent the queue UX — reuse the study-guide daily-queue/dose-ladder patterns.
- Supersedes the SUMMER26 schedule construct (D5) — the roadmap collapses to one school-year calendar; update continuation/memory so the just-shipped Jun-22 re-date isn't treated as live direction.

## 8. Acceptance (feature "done")

- Desk: signed-in student sees one fall calendar; cells reflect their `item_ledger` completion in the 4 D6 states incl. the "ahead" accent for future-dated done work.
- Do Now card shows the single earliest incomplete activity with progress (D4); the D1 speed-bump fires on far-ahead navigation with earlier gaps; nothing is hard-locked.
- All progress reads go through the roster-server `/donow` endpoint; zero direct Supabase calls from the Desk (grep/network-trace proof).
- Ledger is populated by real worksheet + quiz submissions (D2 adoption done & verified).
- Exam-date data-pin (§6) confirmed and encoded; calendar horizon correct.
- Decision record D1–D7 + the §6 pin resolution.
