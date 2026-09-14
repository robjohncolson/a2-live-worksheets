# TI-84 Trainer v2 - Fix Plan (all four bundles)

Source of truth for findings: `TI84_TRAINER_REVIEW_FINDINGS.md` (32 confirmed, adversarially verified, 2026-06-11).
Teacher decisions (2026-06-12):
1. All four bundles approved.
2. **Physical-calculator mode requires the type-the-result verification step to earn credit.** "I did it" alone records nothing.
3. Division of labor: CC main session = planning + frontend/UX + content authoring; Codex = backend + bulk implementation via cross-agent runner.

~~Blocking external dependency: migration 0016 (`'trainer'` source) is USER-RUN and unconfirmed on the roster Supabase (`<AP_SUPABASE_PROJECT_REF>`). Until it runs, 100% of trainer ledger writes 503.~~ **Migration 0016 live-verified 2026-07-06** — trainer ledger writes confirmed working on the deployed roster-server.

## Task breakdown

### Bundle A - data-trust + 2-prop unblock

| Task | Findings | Owner | Status |
|------|----------|-------|--------|
| A1 Recall-mode answer-leak gating | #1 | Codex (Task 1 spec) | SHIPPED `0f080ad` |
| A2 Physical-mode verification-required credit + mode tag + Expected-leak delay + mock-LCD result lines + backend rebind | #2, #12 | Codex (Task 1 spec) | SHIPPED `0f080ad` (mock-LCD substitution rewritten label-based by CC) |
| A3 Track 1 brute-force penalty (wrongChoices) | #14 | Codex (Task 1 spec) | SHIPPED `0f080ad` |
| A4 Raise-only recorded score (max) | #30 | Codex (Task 1 spec) | SHIPPED `0f080ad` |
| A5 Auth-aware record failure surfacing (401 -> 'auth', saved/not-saved line) | #28, #10 | Codex (Task 1 spec) | SHIPPED `0f080ad` |
| A6 recorded_at refresh on ledger upsert | #29 | Codex (Task 2, roster-server) | SHIPPED `28d72c9` (auto-deployed) |
| A7 2-prop pattern-data authoring (signatures, canonical problems, distractors, confusion pair, meta) | #5, #6 | CC in-session | SHIPPED `0f080ad` |
| A8 Native two-prop support + VERIFICATION_FIELDS/computeExpected + derive test pin + SAMPLE_VALUES x1/x2 | #8, #17, #22 | Codex (Task 4) + CC app.js bits | SHIPPED `0f080ad` - native suite green 362/362 |
| A9 Wizard ENTER-commit ROM verification, then data fix across ~10 procedures if confirmed | #7 | CC verify first (ROM check), then Codex data pass | **RESOLVED (empirical, 2026-08-06)** — confirmed on ROM (OS 5.8.2.0029): choice rows commit on ENTER only, never on LEFT/RIGHT; data + native model + generated bundles fixed and regenerated |
| A10 Migration 0016 + live smoke | #10 | USER (run migration), then CC smoke | blocked on user |

### Bundle B - mobile (CC in-session, frontend)

| Task | Findings | Status |
|------|----------|--------|
| B1 Banner visible on mobile (compact sticky, top) | #3 | SHIPPED `0f080ad` |
| B2 Physical-panel escape hatch (on-screen calculator + Options buttons); first-run chooser | #4 | SHIPPED `0f080ad` + `e059cc5` |

### Bundle C - build guard + robustness (Codex, Task 3)

| Task | Findings |
|------|----------|
| C1 build:ti84 npm script + standalone-sync drift test (export buildStandalone(), CRLF-safe compare) | #9 |
| C2 IDB read failure treated as cache-miss (download still runs) | #19 |
| C3 ROM download length validation; invalidate cache only on post-write boot errors | #20 |
| C4 Guard savePersisted/saveListMemory/unit-filter setItem (try/catch + one-time banner) | #21 |
| C5 Lazy ROM init in physical mode (download on first mode switch / ROM dialog) | #25 |
| C6 Single-source module manifest (build, index.html assert, both test files) | #26 |
| C7 ROM_CONFIG -> non-inlined sibling config script (roster_config.js pattern) | #27 |

### Bundle D - progress + onboarding

| Task | Findings | Owner | Status |
|------|----------|-------|--------|
| D1 First-run onboarding rewrite (student language, rename clutch copy, move Firmware button) | #11 | CC in-session | SHIPPED `e059cc5` |
| D2 Due counter mirrors scheduler + caught-up state + promotion sets tomorrow | #13 | CC in-session | SHIPPED `e059cc5` |
| D3 "My procedures" progress list (mastery pill, next review, Practice this) | #15 | CC in-session (design) | NOT STARTED |
| D4 Teacher trainer:{} summary on /class/grades + dashboard section | #31 | Codex (Task 2) | SHIPPED `28d72c9` |
| D5 #unit=N deep-link | #32 | CC in-session | trainer-side SHIPPED `e059cc5`; Desk-side SHIPPED |
| D6 Keyboard input map + aria-live banner (stretch) | #16 | Codex (stretch) | NOT STARTED |

## Sequencing (conflict management)

`ti84-trainer-v2/app.js` is one large IIFE - serialize edits to it:
1. Codex Task 1 (A1-A5) owns app.js + gradebook-client.js. Nothing else touches app.js while it runs.
2. CC folds/reviews Task 1, rebuilds standalone, tests, commits.
3. CC does Bundle B + D1/D2/D5 on app.js (+ Desk for D5); commits.
4. Codex Task 3 (Bundle C) owns bridge.js/build.mjs/native tests + the C4/C5 app.js touches - runs after step 3.
5. Codex Task 2 (roster-server recorded_at; optionally D4) - independent of app.js, can run parallel to 3/4. roster-server auto-deploys on push: flag in commit.
6. A7 content authoring (pattern JSON) is conflict-free with Task 1 - runs parallel.
7. Codex Task 4 (A8 native two-prop) after A7 lands.
8. A9 ENTER-commit check needs a booted ROM (browser session) - schedule when convenient; data fix afterwards.

Rebuild rule: every app.js/bridge.js/data change ships only after `node ti84-trainer-v2/build.mjs` regenerates standalone.html (students load standalone, finding #9).

## Known gaps

- **matrix-entry repeat loop guides only the first cell.** `app.js`'s repeatable-step machinery (A9) deliberately excludes parameter steps and last steps from the hold-on-step gate (a parameter step must retype its value on every press; a last step must still be able to finish the walkthrough). matrix-entry's authored repeat loop for entering per-cell observed counts relies on holding a step across multiple cells, so today only the first cell is guided — the rest advance immediately. Needs its own design (a dedicated "repeat a parameter across N cells" step shape), not a tweak to the generic repeatable gate.
