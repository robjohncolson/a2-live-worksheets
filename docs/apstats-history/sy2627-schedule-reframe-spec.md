# SY2627 Schedule Reframe — Spec (draft v2, Codex-reviewed)

**Status:** draft v2 · patched per Codex review (2026-07-07) · awaiting user calendar/pacing inputs (§6), then implement.
**Author:** Fable · **Reviewer:** Codex (endorsed Option B; found the `/donow` + no-migration + merge-bug corrections folded in below).
**Depends on:** the Fall-2026 CED crosswalk (`2026-crosswalk.json`, `ap-stats-video-crosswalk.md`) and the already-live `ced2026` overlay (roadmap-data.json + lessons-index.json, `711801e`) and the mobile-home render (`6de797e`).

---

## 1. Goal

Make the **square-mode Desk** (`ap_stats_roadmap_square_mode.html`) — and the two things that drive it, the **Do-Now manifest** and the **schedule overlay** — present the **Fall 2026 5-unit CED** (new grouping, new topic numbers/labels, correct teaching order, greyed "Beyond the Exam" bonus) for SY2026-27, the way `mobile-home.html` already does.

## 2. Non-goals

- **No re-recording / no content changes** (crosswalk: 67 keep / 10 bonus / 0 re-record).
- **No deletion** — bonus stays greyed enrichment.
- **No id reindex and no grade-history rewrite** — see §4.

## 3. Current pipeline (verified against code 2026-07-07)

Everything is keyed by **old 9-unit `U.T` ids**. Two *separate* engines drive the Desk — do not conflate them:

| Source | Shape | Consumed by | Drives |
|---|---|---|---|
| `roster-server/data/work-manifest.json` (and identical `./data/` copy) | `{units:[{unit:"U1", lessons:[{lesson:"1.1", activities:[{itemIds:[…]}]}], pc}]}` — **9 units, no `ced2026`** | `roster-server/donow.js` → `computeDonow()` | **Do Now.** `computeDonow` walks `manifest.units` **in file order** and returns `nextTask` = earliest incomplete activity (donow.js:71, :102, :174). |
| `Agent/config/topic-schedule.json` | `{ B:{"6.1":"2026-03-02",…}, E:{…} }` (period → old-id → date) | `build-roadmap-data.mjs` (→ `periods.date`); `sync-schedule-to-supabase.mjs` → Supabase `topic_schedule` | **Schedule overlay / calendar dates.** Desk `mergeSupabase()` merges date + period state (html:4925, :9093). |
| `Agent/state/lesson-registry.json` | old-id → {topic, urls, schoology, date} | `build-roadmap-data.mjs`, sync | registry/roadmap content |
| `roadmap-data.json` (+ `BAKED_REGISTRY` in Desk) | old-id lessons **with additive `ced2026`** | Desk `REGISTRY.lessons`, mobile-home | display data |

**Key correction (Codex):** changing `topic-schedule.json` dates alone will **not** re-sequence Do Now — Do Now is manifest-order-driven. Both surfaces must be reframed.

The SY2526 calendars (`week_*_calendar.html`) that feed `build-topic-schedule.mjs` are last year's; none exist for SY2627.

## 4. The crux: `U.T` ids collide across CEDs — keep old ids, overlay the new CED

New `5.1` (Graphs of two quantitative vars) ≠ old `5.1` (Intro to Sampling Distributions). The bare `U.T` string is the primary key in the manifest (incl. `WS-U1L1-*` itemIds), registry, schedule, Supabase, **and every grade row / Blooket record ever written**.

- **(A) True reindex** old→new everywhere + remap historical grades → high risk, corrupts gradebook. **Rejected.**
- **(B) Old ids stay the stable internal key; Fall-2026 CED is a display + ordering overlay** (the shipped `ced2026 = {status,newUnit,newTopic,newLabel,bonusUnit}` pattern). ✅ **Recommended, Codex-endorsed.** No id migration; grades untouched; surfaces *reorder and relabel* the existing old-id topics.

Everything below assumes **Option B**.

## 5. Work by surface (Option B)

### 5.1 Do-Now manifest — the real sequencer (NEW, was missing in v1)
- Rebuild **both** `work-manifest.json` copies (`./data/` and `roster-server/data/`, currently byte-identical) into **5 units in new-CED order**, each containing the old-id lessons that map into it (per `2026-crosswalk.json`), ordered by `ced2026.newTopic`. **Keep each lesson's old `lesson` id and all `itemIds` unchanged** (grades key off them).
- **Bonus lessons excluded from the sequence** (they're enrichment, not "next task") — omit from `manifest.units`, or flag `bonus:true` and have `computeDonow` skip them. Omitting is simplest.
- Add `ced2026` (or at least `newLabel`/`newTopic`) per manifest lesson so `/donow` can return the new label for the Desk to show.
- **No generator exists** for this file today — P1 either writes one (crosswalk-driven, testable) or does a careful reviewed transform. Prefer a script.
- *Alternative considered:* sort by ced2026 order inside `computeDonow()` instead of reordering data. Rejected as default — changing the grade-path algorithm is riskier than reordering data the algorithm already trusts; keep as fallback only.

### 5.2 Schedule dates (`topic-schedule.json` → Desk calendar overlay)
- Generate SY2627 dates for the **core** old-id topics in new teaching order (needs §6). Feeds the Desk's calendar/period overlay, not Do-Now sequencing. **Built (fixture):** `scripts/build-topic-schedule-sy2627.mjs` (synthetic calendar, self-asserting, no prod sync).
- Bonus topics get **no date** (§6.3).
- **Review markers:** the generator emits `1.review`..`5.review` at new-unit boundaries. These keys are NEW — the Agent registry only has `6.review`. **P2 must add registry entries or special-title handling for `1.review`..`5.review`** (else the published roadmap / Supabase sync surfaces them as fallback "Topic N.review" rows). Reconcile the old `6.review` drift at the same time.

### 5.3 Supabase `topic_schedule` — NO schema migration (Codex)
- Re-run `sync-schedule-to-supabase.mjs --execute` after SY2627 dates exist; rows stay old-id-keyed, **dates only**.
- **Do not add `ced2026`/`new_topic`/`bonus` columns.** The Desk already has `ced2026` in `REGISTRY.lessons` (BAKED_REGISTRY / roadmap-data.json); it joins by old topic id. `mergeSupabase()` already fetches a `title` column it doesn't use — display should come from the `ced2026` join, not a schedule column. Avoids a DB migration for data the client already holds.

### 5.4 The Desk render (`ap_stats_roadmap_square_mode.html`)
- **Display:** wherever a topic label is shown (from `REGISTRY.lessons[id].topic` or the `/donow` payload), prefer `REGISTRY.lessons[id].ced2026.newLabel` and prefix `newTopic`. No central resolver exists (~15 render paths) → add one small helper `displayLabel(id)` and thread it, **or** (lower-risk) rely on `/donow` returning `newLabel` from the reframed manifest (§5.1) so the primary surface needs no per-path edits.
- **Sequencing:** follows the reframed manifest (Do-Now) and schedule dates (calendar) automatically — no client reorder.
- **Bonus:** safety-net tag "Beyond the Exam" if a bonus id ever renders (server-marked; Desk styles). With bonus unscheduled + off-manifest, rarely hit.
- **Robustness bug to fix (Codex):** `_mergeRegistryData()` (html:~4842) copies `topic/status/urls/periods` but **not `ced2026`** — a live roadmap-data.json refresh strips the overlay off an already-baked lesson. Add `if (incoming.ced2026) existing.ced2026 = incoming.ced2026;`. One-liner; include in P3.

## 6. OPEN — needs the user before dates can be generated

1. **SY2627 academic calendar:** first instructional day; breaks/holidays; class-period model (still **B / E**?); and the **May 2027 exam date** — *do not hardcode*: confirm with the AP coordinator / College Board (the public AP dates page still lists 2026: https://apstudents.collegeboard.org/exam-dates).
2. **Pacing:** days per topic (or per unit via CED weights — U1 20-30% · U2 15-25% · U3 15-25% · U4 10-20% · U5 10-20%) to place the 67 core topics across the year.
3. **Bonus scheduled?** Assumption: **no date, off-manifest** — enrichment only. Confirm.
4. **Review days:** keep unit-review days (the `6.review` pattern), for which units?
5. **Archive SY2526** schedule so the Desk stops showing last year's dates? (vs keep for reference.)

## 7. Phased plan (spec → Codex → implement → verify → commit)

1. **P0 — this spec (Codex-reviewed ✅) + user §6 answers.**
2. **P1 — Do-Now manifest + schedule.** Rebuild both `work-manifest.json` copies into 5-unit CED order (old ids/itemIds preserved, bonus off-manifest, `ced2026` added); generate SY2627 `topic-schedule.json` (needs §6.1-6.4). **Verify:** `roster-server/tests/donow.test.js` extended — `computeDonow` returns tasks in new order; every core old-id present once; no bonus id in the sequence; itemIds unchanged. One commit (Agent + follow-alongs).
3. **P2 — data + Supabase.** Rebake `roadmap-data.json` (resolve `6.review`); `sync-schedule-to-supabase.mjs --execute` (dates only, no schema change). **Verify:** `/donow` smoke for a few school dates returns the right new topic/label. One commit.
4. **P3 — Desk render.** `displayLabel`/manifest-supplied label + the `_mergeRegistryData` `ced2026` fix + bonus tag. **Verify with a real-browser smoke** (Playwright headless, desktop + phone, zero uncaught errors, spot-check several school days show the right new topic/label; links intact) — the same push gate used for mobile-home. One commit, then push to the live Desk.

## 8. Verification principle (carried from the render step)

Node-logic checks are necessary but not sufficient for a live student surface. The push gate is a **real-browser smoke** (Playwright headless via `playwright-core` + a static server, both viewports, DOM asserts + zero uncaught errors + link integrity). The mobile-home `smoke.mjs` harness is reusable for the Desk.

---

### Appendix — new teaching order (crosswalk, old ids in CED order)

new 1.1–1.13 ← old 1.1-1.9, 3.1-3.7 · new 2.1–2.12 ← old 2.1-2.3, 4.1-4.8, 4.10-4.11, 1.10, 5.1-5.3 · new 3.1–3.15 ← old 5.4-5.6, 6.1-6.11, 8.1, 8.4-8.6 · new 4.1–4.10 ← old 5.7-5.8, 7.1-7.9 · new 5.1–5.5 ← old 2.4-2.8.
Bonus (unscheduled, greyed): old 4.9, 4.12 (→U2) · old 8.2, 8.3 (→U3) · old 2.9, 9.1-9.5 (→U5).
