# Algebra 2 Fork Baseline

Date: 2026-09-13

## Untouched snapshot: overseer baseline

- Root: 317 files; 22 failed files; 27 failed tests; 9,517 passed; 13 skipped.
- roster-server: 92 files; 0 failed files/tests; 1,782 passed; 3 skipped. Dependencies were already installed in both directories.

## Untouched snapshot: root JSON rerun

Command: `npx vitest run --reporter=json --outputFile=.baseline-root.json` (exit 1).

317 files: 23 failed, 294 passed. Assertion statuses: 28 failed, 9,516 passed, 13 skipped (9,557 total). These are pre-existing AP Stats snapshot failures observed before any content changes. Relative to the supplied baseline: +1 failed file, +1 failed test, -1 passed test, unchanged skipped count. The supplied baseline has no failure names, so the specific changed test cannot be established.

Counts above are derived from testResults file statuses and assertionResults statuses. JSON aggregate fields instead report 1,876 suites, 4 failed suites, 9,529 passed tests, and 0 pending tests; those fields do not represent the observed file/pass/skip breakdown.

### Every failing root file and test

#### tests/candy-poke.test.js

Suite failed before named tests could run:

```text
ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\curriculum_render\railway-server\server.js'
```

#### tests/classroom-structure.test.js

- Live Classroom v1a - Desk integration D3: the Teacher menu has a Live Classroom item opening teacher-classroom.html
- KEYBOARD_AVATAR Phase 1 -- player controller wiring Desk has the keyboard help-text strip below the board mount

#### tests/content-validation.test.js

- §5 data/skill-map.json — committed skill-map schema (CI-safe: the .js twin is validated by CI-excluded suites) every entry is {skill: string|null, candidates[], confidence: number, provenance: known} under a known key family

#### tests/desk-self-signup.test.js

- teacher onboarding + class gradebook (static) the Teacher menu opens the Teacher Tools launcher, which wires the Roster Console

#### tests/desk-user-role.test.js

- Desk: user-role gating + sign-in teacher checkbox 12: Teacher Tools launcher reaches the teacher pages (roster console, dashboard, codegen)

#### tests/desk-verify-tools.test.js

- Desk — verification tools surfaced the Teacher Tools launcher wires the scan-to-verify tool (openVerifyQR)

#### tests/disambiguate-skills.test.js

- buildAllItemTextMap (loader fix: multi-lesson worksheets included) returns a Map spanning multiple units (string values)

#### tests/doge-payout-agent.test.js

- DOGE payout agent config and RPC wrapper lets environment override file config and keeps portable defaults

#### tests/doge-presence-submenu.test.js

Suite failed before named tests could run:

```text
ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\curriculum_render\railway_client.js'
```

#### tests/doge-send-core.test.js

- doge-send durable file journal atomically creates, refuses overwrite, updates, and clears a mode-0600 journal

#### tests/level-editor-lint.test.js

- Group 2 -- real corpus sanity all 80 corpus files lint without ERROR severity issues (warns are OK)

#### tests/level-editor-sim.test.js

Suite failed before named tests could run:

```text
ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\curriculum_render\railway-server\activities\U1.1.json'
```

#### tests/level-editor.test.js

Suite failed before named tests could run:

```text
ENOENT: no such file or directory, scandir 'C:\Users\rober\Downloads\Projects\curriculum_render\railway-server\activities'
```

#### tests/phase4-structure.test.js

- teacher-dashboard.html — Phase 4a structure declares it is a teacher dashboard (title)
- teacher-dashboard.html — Phase 4a structure teacher-secret persistence is OPT-IN only; localStorage writes are scoped to two known keys

#### tests/phase4b-structure.test.js

- Phase 4b — teacher-dashboard.html remediation panel teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19)

#### tests/progress-reset-matrix-cleared-storage.test.js

- matrix row: cleared storage recovers — CONTROL (a subsequent live success) (7) flips to available, writes the latch, and the strict gate resumes

#### tests/progress-reset-matrix-latch.test.js

- matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED D4 fail-open never leaks into the affirmative-server case

#### tests/progress-reset-matrix-loadstate.test.js

- matrix row: 401 -> auth classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session
- matrix row: 403 -> auth (classified identically to 401) classifies unavailable/auth

#### tests/remaining-feature-contracts.test.js

- F004 Start Here signed-in progress preview renders the signed-out fallback when identity or service config is unavailable
- F004 Start Here signed-in progress preview fetches /grade with rosterClient.token() and renders quarter/unit progress for signed-in students
- F061 public worksheet table of contents index links TOC.html and TOC lists all 69 live worksheet files that exist on disk

#### tests/skill-map.test.js

- Pool coverage pool (b): curriculum.js IDs present (U{n}-L{l}-Q format)
- Pool coverage pool (a/b) total IDs match run1 result counts

#### tests/journeys/harness.smoke.test.js

- Desk journey harness smoke boots the real Desk cleanly with Do Now and disk-backed roadmap tiles in under 3 seconds

#### tests/journeys/j2-shared-device.journey.test.js

- Desk journey J2 J2 reloads a shared device across A → B → A without leaking marks, due chip, or SRS state, then hydrates a fresh marks bucket from /donow (supersedes desk-calendar-sync per-student visibility and selfDone hydration behavior)

#### tests/journeys/j7-offline-grade.journey.test.js

- Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab 'network' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '401' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '403' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '500' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)

## After Phase 1

Completed 2026-09-13. Mechanical deletion and history archive only; no surviving source edits. Counts come from each JSON testResults file status and assertionResults status.

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped | Pending |
|---|---:|---:|---:|---:|---:|---:|---:|
| Root | 298 | 237 | 61 | 5494 | 163 | 11 | 34 |
| roster-server | 92 | 90 | 2 | 1771 | 11 | 3 | 0 |

Both commands exited 1. Root delta from the named Phase 0 JSON rerun: {"files":-19,"passed_files":-57,"failed_files":38,"passed":-4022,"failed":135,"skipped":-2,"pending":34}. Server delta from Phase 0: {"files":0,"passed_files":-2,"failed_files":2,"passed":-11,"failed":11,"skipped":0,"pending":0}.

Pending and skipped are distinct assertion statuses; do not combine them with passed tests. Collection failures can have zero failed named assertions. Raw final JSON reports are in state/cross-agent/phase1-root-final-tests.json and phase1-server-final-tests.json.

### Deletions and moves

- Deleted 1442 files, including 19 content-only test files.
- Moved 231 root documents to docs/apstats-history/.
- No roster-server test files deleted.

| Category | Files deleted |
|---|---:|
| worksheets | 69 |
| blooket_decks | 77 |
| grading_prompts | 70 |
| frameworks | 9 |
| video_files | 6 |
| schedule_pages | 16 |
| other_pages | 3 |
| root_data | 8 |
| root_images_and_ti84_data | 14 |
| data_content | 12 |
| directory:ai-tutor | 75 |
| directory:concept-posters | 71 |
| directory:Mac-OS-Sounds | 23 |
| directory:apstat-park | 7 |
| directory:syllabus | 2 |
| directory:formal | 8 |
| directory:probe-signal-reports | 1 |
| directory:ti84-cemu-screenshots | 10 |
| directory:mit_python_vid2 | 2 |
| directory:a2_3-3 | 1 |
| directory:unit4guide | 5 |
| directory:android-app | 13 |
| directory:gitnexus-shadow | 8 |
| directory:u1 | 28 |
| directory:u2 | 30 |
| directory:u3 | 16 |
| directory:u4_l10_l11_l12 | 8 |
| directory:u4_l1_l2 | 6 |
| directory:u4_l3_l4_l5 | 6 |
| directory:u4_l6 | 6 |
| directory:u4_l7_l8 | 6 |
| directory:u4_l9 | 4 |
| directory:u4_poster | 6 |
| directory:u5 | 30 |
| directory:u6 | 44 |
| directory:u7 | 40 |
| directory:u8 | 26 |
| directory:u9 | 84 |
| dok_content | 573 |
| content_only_tests | 19 |

Deleted test files:

- tests/dok-active.test.js
- tests/dok-index.test.js
- tests/dok-registry.test.js
- tests/grading-prompts.test.js
- tests/grading-prompts-u4.test.js
- tests/grade-pipeline-w3-prompts.test.js
- tests/worksheet-hydration.test.js
- tests/worksheet-completion-tracker.test.js
- tests/worksheet-graded-note.test.js
- tests/worksheet-ledger-heal.test.js
- tests/worksheet-identity-clean.test.js
- tests/worksheet-revise-hint.test.js
- tests/worksheet-signin-wall.test.js
- tests/worksheet-viewas-module.test.js
- tests/appeal-clamp-live.test.js
- tests/schedule.test.js
- tests/skill-map-tiny-pools.test.js
- tests/secure-key-plugin.test.js
- tests/video-ondemand.test.js

### Failures caused by removed content or moved documents

The following surviving test files exercise retained code and therefore remain. Each entry gives its missing dependency and newly failing test names. A suite initialization error is listed when collection failed. Failures whose exact names were already recorded in Phase 0 are identified separately and are not claimed as new content-only regressions.

#### tests/answer-key.test.js

Missing dependency: `data/answer-key.json`.

- generated data/answer-key.json (integration) exists, dual-write byte-identical
- generated data/answer-key.json (integration) all keys are MCQ with a non-empty single-token answerKey
- generated data/answer-key.json (integration) answer-key ids are a subset of work-manifest keys (0 mapping needed)

#### tests/audit-feeder-ids.test.js

Missing dependency: `u*_lesson*_live.html`, `GRADEBOOK_FEEDER_ID_AUDIT.md (moved)`.

- audit-feeder-ids: result shape audits all 69 worksheets
- audit-feeder-ids: known findings u3_lesson6-7_live.html uses WORKSHEET_ID form
- audit-feeder-ids: report file report file exists after audit run
- audit-feeder-ids: report file report contains a summary section
- audit-feeder-ids: report file report contains a per-worksheet table
- audit-feeder-ids: report file report contains a verdict section
- audit-feeder-ids: report file report mentions all 69 worksheets in the table
- audit-feeder-ids: report file report contains MISMATCH or CLEAN status for every worksheet

#### tests/audit-skill-tagging.test.js

Missing dependency: `apstat_*_framework.md`, `u*_lesson*_live.html`, `data/skill-map.json`.

- Required report sections Phase 3 verdict is dynamic and consistent with skill-map stats
- Required report sections Phase 3 verdict reports a provenance distribution table
- Deterministic counts across two runs worksheet count is stable (69)
- Deterministic counts across two runs worksheet blank count is stable
- Deterministic counts across two runs FRQ textarea count is stable
- apstat_5_framework.md — restructured per TT1-E apstat_5 framework is parsed and returns 8 topics (5.1–5.8)
- apstat_5_framework.md — restructured per TT1-E apstat_5 topics 5.1–5.8 all present in topicSkillMap
- apstat_5_framework.md — restructured per TT1-E apstat_5 extracts correct skills (5.2 → [3.A, 3.C], 5.3 → [3.C])
- apstat_5_framework.md — restructured per TT1-E previously-holed topics 3.3–3.6 now parse with skills
- apstat_5_framework.md — restructured per TT1-E previously-holed topic 6.6 now parses with skills
- Framework parsing correctness all 9 framework files found (none missing)
- Framework parsing correctness unit 1 framework has topics 1.1 through 1.10
- Framework parsing correctness topic 1.1 maps to skill 1.A
- Framework parsing correctness topic 1.7 maps to skill 2.C
- Framework parsing correctness topic 1.10 maps to skill 3.A (normal distribution)
- Framework parsing correctness at least 80 topics extracted total (all frameworks parseable, U5 fixed)
- Exported functions — unit tests parseFramework does NOT flag apstat_5 as malformed after TT1-E restructure
- Exported functions — unit tests parseFramework does NOT flag apstat_1 as malformed
- Exported functions — unit tests loadSkillMapStats computes a verdict + split provenance for the real map

#### tests/build-offline-pack.test.js

Missing dependency: `u3_lesson6-7_live.html`.

- build (real, into a temp dir) assembles a personalized pack with injected config and the launcher

#### tests/ced2026-surfaces.test.js

Missing dependency: `lessons-index.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\lessons-index.json'

#### tests/content-validation.test.js

Missing dependency: `data/blooket-card-pairs.json`, `data/blooket-*`, `roadmap-data.json`, `ai-grading-prompts*.js`, `u*_lesson*_live.html`, `*_blooket.csv`, `data/skill-map.json`.

This file also failed in Phase 0; the missing dependencies above describe its Phase 1 failures, not a claim that the file was previously green.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\blooket-card-pairs.json'

#### tests/desk-blooket-flashcards.test.js

Missing dependency: `data/blooket-difficulty.json`.

- Desk: Blooket flashcard verification 43: data/blooket-difficulty.json exists with valid schema + per-file tags
- Desk: Blooket flashcard verification 44: no CSV is tagged all-one-difficulty (lazy-tagging guard)

#### tests/desk-calendar-ced2026.test.js

Missing dependency: `2026-crosswalk.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\2026-crosswalk.json'

#### tests/disambiguate-skills.test.js

Missing dependency: `data/skill-map.json`, `u*_lesson*_live.html`.

This file also failed in Phase 0; the missing dependencies above describe its Phase 1 failures, not a claim that the file was previously green.

- Canonical skill-map.json is immutable data/skill-map.json exists
- Canonical skill-map.json is immutable skill-map.json mtime is not changed by disambiguateBatch
- Canonical skill-map.json is immutable skill-map.json still has unresolved entries (not touched)
- buildAllItemTextMap (loader fix: multi-lesson worksheets included) returns a Map spanning multiple units (string values) [Already failed by this name in Phase 0.]
- buildAllItemTextMap (loader fix: multi-lesson worksheets included) REGRESSION (Codex MAJOR #3): multi-lesson worksheet families now have text
- buildAllItemTextMap (loader fix: multi-lesson worksheets included) REGRESSION (Codex re-review MAJOR): non-reflect1/2/exitTicket textareas (reflect3) have text
- buildAllItemTextMap (loader fix: multi-lesson worksheets included) REGRESSION (Codex re-review MINOR): no phantom WS text-map keys (data-answer= mirrors build-skill-map)

#### tests/framework-parse.test.js

Missing dependency: `apstat_*_framework.md`.

- Zero (none parsed) guarantee (TT1-A) parseFrameworks() works with no root argument
- Zero (none parsed) guarantee (TT1-A) at least 80 topics parsed across U1–U9
- Unit 1 — reference framework topics 1.1 through 1.10 all present
- Unit 1 — reference framework topic 1.1 → [1.A]
- Unit 1 — reference framework topic 1.2 → [2.A]
- Unit 1 — reference framework topic 1.7 → [2.C, 4.B]
- Unit 1 — reference framework topic 1.10 → includes 3.A (normal distribution)
- Unit 5 — restructured per TT1-E topics 5.1 through 5.8 all present
- Unit 5 — restructured per TT1-E topic 5.1 → [1.A]
- Unit 5 — restructured per TT1-E topic 5.2 → [3.A, 3.C]
- Unit 5 — restructured per TT1-E topic 5.3 → [3.C] (CLT)
- Unit 5 — restructured per TT1-E topic 5.4 → [3.B, 4.B]
- Unit 5 — restructured per TT1-E topic 5.5 → [3.B, 3.C, 4.B] (sampling distributions for proportions)
- Unit 5 — restructured per TT1-E topic 5.8 → [3.B, 3.C, 4.B] (difference in sample means)
- Previously-holed topics now resolved (TT1-A fallback) topic 3.3 → [1.C] (was empty before)
- Previously-holed topics now resolved (TT1-A fallback) topic 3.4 → [1.C] (was empty before)
- Previously-holed topics now resolved (TT1-A fallback) topic 3.5 → [1.B, 1.C] (was empty before)
- Previously-holed topics now resolved (TT1-A fallback) topic 3.6 → [1.C] (was empty before)
- Previously-holed topics now resolved (TT1-A fallback) topic 6.6 → [4.E] (was empty before)
- N/A synthesis topics emit empty arrays topic 7.10 is present but has empty skills (N/A synthesis)
- N/A synthesis topics emit empty arrays topic 8.7 is present but has empty skills (N/A synthesis)
- N/A synthesis topics emit empty arrays topic 9.6 is present but has empty skills (N/A synthesis)
- CED skill code recognition recognizes 1.A (in canonical 11)
- CED skill code recognition recognizes 1.C (not in canonical 11 but in CED)
- CED skill code recognition recognizes 3.B (in canonical 11)
- CED skill code recognition recognizes 4.C (in canonical 11 — inference conditions)
- All 9 units represented Unit 1 has at least one topic
- All 9 units represented Unit 2 has at least one topic
- All 9 units represented Unit 3 has at least one topic
- All 9 units represented Unit 4 has at least one topic
- All 9 units represented Unit 5 has at least one topic
- All 9 units represented Unit 6 has at least one topic
- All 9 units represented Unit 7 has at least one topic
- All 9 units represented Unit 8 has at least one topic
- All 9 units represented Unit 9 has at least one topic

#### tests/frq-regrade-job.test.js

Missing dependency: `u1_lesson2_live.html`, `u4_lesson3-4-5_live.html`, `u3_lesson6-7_live.html`, `u*_lesson*_live.html`, `ai-grading-prompts-u1-l1.js`.

- FRQ regrade manifest derives u1_lesson2_live.html from the real worksheet and its prompt module
- FRQ regrade manifest derives u4_lesson3-4-5_live.html from the real worksheet and its prompt module
- FRQ regrade manifest derives u3_lesson6-7_live.html from the real worksheet and its prompt module
- FRQ regrade manifest builds the committed, sorted manifest and loads every builder in vm
- FRQ regrade manifest builds exactly the prompt exposed to the worksheet page
- FRQ regrade manifest loads the committed bundle without evaluating page prompt code

#### tests/frq-rubrics-bundle.test.js

Missing dependency: `u*_lesson*_live.html`, `ai-grading-prompts-u1-l10.js`, `ai-grading-prompts-u4-l345.js`.

- committed FRQ rubric bundle is byte-for-byte in sync with the real manifest and prompt builders
- committed FRQ rubric bundle reproduces real page builders across many worksheets
- committed FRQ rubric bundle round-trips marker-looking and template-looking answer text without parsing it

#### tests/frq-status-clarity.test.js

Missing dependency: `u*_lesson*_live.html`.

- W2.7 FRQ status clarity — every worksheet covers the whole worksheet family

#### tests/gitnexus-shadow.test.js

Missing dependency: `gitnexus-shadow/`.

- tracked shadows are fresh ap_stats_roadmap_square_mode.html → gitnexus-shadow/ap_stats_roadmap_square_mode.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh mobile-home.html → gitnexus-shadow/mobile-home.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh teacher-dashboard.html → gitnexus-shadow/teacher-dashboard.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh teacher-classroom.html → gitnexus-shadow/teacher-classroom.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh teacher-roster-console.html → gitnexus-shadow/teacher-roster-console.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh study_guide_diagnostic.html → gitnexus-shadow/study_guide_diagnostic.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh start-here.html → gitnexus-shadow/start-here.inline.js matches the current HTML (line-preserving)
- tracked shadows are fresh tools/level-editor.html → gitnexus-shadow/level-editor.inline.js matches the current HTML (line-preserving)

#### tests/gradebook-feeder-wiring.test.js

Missing dependency: `data/skill-map.json`, `u*_lesson*_live.html`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\skill-map.json'

#### tests/lineage.test.js

Missing dependency: `DATA_LINEAGE.md (moved)`, `tests/schedule.test.js`, `gitnexus-shadow/`, `offline-video.js`.

- data lineage manifest points every repository artifact path or supported glob at an existing file
- data lineage manifest points every file pin at an existing test
- cheap deterministic lineage freshness every tracked GitNexus shadow equals shadowOf its current app
- cheap deterministic lineage freshness every local sw.js CORE entry exists
- cheap deterministic lineage freshness DATA_LINEAGE.md is a fresh render of data/lineage.json

#### tests/misconception-maps.test.js

Missing dependency: `ai-grading-prompts-u1-l10.js`, `data/answer-key.json`.

- draft misconception maps enumerates every rubric element with no extra source keys
- draft misconception maps enumerates all 354 MCQs and only their wrong letters
- draft misconception maps checks the rubric builder without changing the map
- draft misconception maps checks the distractor builder without changing the map

#### tests/mobile-home-fc-csv-fallback.test.js

Missing dependency: `data/blooket-topic-csv.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\blooket-topic-csv.json'

#### tests/no-guest-mode.test.js

Missing dependency: `u*_lesson*_live.html`.

- worksheets — all 69 require a roster session (off-ramp removed) there are 69 worksheets

#### tests/offline-video.test.js

Missing dependency: `offline-video.js`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\offline-video.js'

#### tests/phase5-structure.test.js

Missing dependency: `ai-tutor/`.

- ai-tutor/ artifact inventory — exact 75-file set the ai-tutor directory exists
- ai-tutor/ artifact inventory — exact 75-file set count is exactly 75 (the inventory baseline)
- ai-tutor/ artifact inventory — exact 75-file set the set on disk matches the AI_TUTOR_FANOUT_BUILD.md inventory EXACTLY
- ai-tutor/ artifact inventory — exact 75-file set every artifact starts with the canonical AI Tutor header marker (topic-aware)

#### tests/roster-prefill.test.js

Missing dependency: `u*_lesson*_live.html`.

- roster-prefill.js — structural rollout coverage (all 69 worksheets) every u*_lesson*_live.html includes <script src="roster-prefill.js"></script>

#### tests/skill-map.test.js

Missing dependency: `u*_lesson*_live.html`, `apstat_*_framework.md`, `data/skill-map-supplement.json`, `data/skill-map-frq.json`, `data/skill-map.disambiguated.json`.

This file also failed in Phase 0; the missing dependencies above describe its Phase 1 failures, not a claim that the file was previously green.

- FC1 schema compliance topic-inherit entries have skill set and confidence 1.0
- FC1 schema compliance unresolved entries have skill=null and confidence=0
- Pool coverage pool (a): worksheet IDs present (WS-U prefix)
- Pool coverage pool (a): has entries for all 69 worksheet files
- Pool coverage pool (b): curriculum.js IDs present (U{n}-L{l}-Q format) [Already failed by this name in Phase 0.]
- Pool coverage pool (a/b) total IDs match run1 result counts [Already failed by this name in Phase 0.]
- topic-inherit vs unresolved resolution resolved count is greater than 0
- topic-inherit vs unresolved resolution unresolved count is greater than 0
- WS-2 supplement and FRQ file merge supplement entries are merged (16 entries from data/skill-map-supplement.json)
- WS-2 supplement and FRQ file merge FRQ entries are merged (31 entries from data/skill-map-frq.json)
- WS-2 supplement and FRQ file merge build proceeds gracefully when WS-2 files are absent (no crash)

#### tests/study-guide.test.js

Missing dependency: `ai-grading-prompts-study-guide.js`, `ti84-procedures-data.json`.

- ai-grading-prompts-study-guide.js — v2 exports exists on disk
- ai-grading-prompts-study-guide.js — v2 exports defines the v2 schema + storage constants
- ai-grading-prompts-study-guide.js — v2 exports exposes all required window globals for the worksheet
- ai-grading-prompts-study-guide.js — v2 exports lists all 9 expected gate IDs
- ai-grading-prompts-study-guide.js — v2 exports has UNIT_TITLES entries for all 9 units
- ai-grading-prompts-study-guide.js — prompt template structure FRQ template uses the AP rubric vocabulary
- ai-grading-prompts-study-guide.js — prompt template structure FRQ template documents the JSON response schema keys
- ai-grading-prompts-study-guide.js — prompt template structure focus synthesis template requests LO-grounded recommendations
- study_guide_diagnostic.html — DAG / BKT integration prompt builder renders the mastery block when a snapshot is provided
- session 89 two-proportion calculator walkthroughs adds two-proportion wizard and result screens to ti84-procedures-data.json
- session 89 two-proportion calculator walkthroughs two-propztest records the 6-key test flow with both samples and an alternative row
- session 89 two-proportion calculator walkthroughs two-propzint records the ALPHA + B interval flow with confidence level entry
- session 89 two-proportion calculator walkthroughs DAG wiring includes the new unit 6 procedure nodes and prerequisites
- session 91 local gate FRQ bank + official scoring prompt prompt builder exposes official scoring and solution checkpoint helpers
- session 91 local gate FRQ bank + official scoring prompt prompt builder handles both solution.scoring and top-level scoring shapes

#### tests/tango-theme.test.js

Missing dependency: `u*_lesson*_live.html`.

- Tango theme on worksheets every worksheet carries the current theme block exactly once, after the base stylesheet

#### tests/teacher-dashboard-misconceptions.test.js

Missing dependency: `dok/manifest.json`.

- teacher misconception panel lists all active remediation sheets from the DOK manifest with student/board/teacher links (textContent only)
- renders all manifest sheets and target labels safely, and hides an empty strip

#### tests/ti84-expected-accuracy.test.js

Missing dependency: `ti84-pattern-recognition-data.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-pattern-recognition-data.json'

#### tests/ti84-procedure-data-integrity.test.js

Missing dependency: `ti84-procedures-data.json`.

- Suite initialization/collection failed: Cannot find module 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-procedures-data.json'

#### tests/ti84-skill-taxonomy.test.js

Missing dependency: `ti84-pattern-recognition-data.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-pattern-recognition-data.json'

#### tests/ti84-standalone-sync.test.js

Missing dependency: `ti84-procedures-data.json`.

- TI-84 standalone build sync keeps standalone.html and generated files in sync with build output

#### tests/ti84-state-machine.test.js

Missing dependency: `ti84-procedures-data.json`.

- Suite initialization/collection failed: Cannot find module './ti84-procedures-data.json'

#### tests/ti84-worksheet-links.test.js

Missing dependency: `u1_lesson5_live.html`.

- Suite initialization/collection failed: Expected exactly one worksheet for topic 1.5; found 0: 

#### tests/work-manifest-ced-regression.test.js

Missing dependency: `2026-crosswalk.json`.

- W-reg CED deploy reproduces both live copies (d) --deploy to a temp root yields byte-identical live JSON matching both live files

#### tests/work-manifest.test.js

Missing dependency: `data/skill-map.json`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\skill-map.json'

#### tests/worksheet-answer-recovery.test.js

Missing dependency: `u1_lesson1_live.html`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_lesson1_live.html'

#### tests/worksheet-diagnostics.test.js

Missing dependency: `u1_lesson1_live.html`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_lesson1_live.html'

#### tests/journeys/harness.smoke.test.js

Missing dependency: `roadmap-data.json`.

This file also failed in Phase 0; the missing dependencies above describe its Phase 1 failures, not a claim that the file was previously green.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\roadmap-data.json'

#### tests/journeys/j4-quick-check.journey.test.js

Missing dependency: `u1_l1_blooket.csv`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'

#### tests/journeys/j5-timed-deck.journey.test.js

Missing dependency: `u1_l1_blooket.csv`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'

#### tests/journeys/j6-review-mode.journey.test.js

Missing dependency: `u1_l1_blooket.csv`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'

#### tests/journeys/j9-flashcard-sync.journey.test.js

Missing dependency: `u1_l1_blooket.csv`.

- Suite initialization/collection failed: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'

#### roster-server/tests/bundle-parity.test.js

Missing dependency: `data/answer-key.json`, `data/skill-map.json`.

- bundle parity — byte-identical canonical copies roster-server/data/skill-map.json === data/skill-map.json (T2-frozen)
- bundle parity — byte-identical canonical copies roster-server/data/answer-key.json === data/answer-key.json (Phase-2)

#### roster-server/tests/quarters-by-date.test.js

Missing dependency: `2026-crosswalk.json`.

- lesson-schedule.json — SY26-27 date sanity lesson-schedule.json can be loaded, has 77 lessons and a calendar block
- lesson-schedule.json — SY26-27 date sanity crosswalk-core topics are dated for BOTH periods; bonus topics for NEITHER
- lesson-schedule.json — SY26-27 date sanity every date is a meeting day for its period (B never Wed; E only Mon/Wed/Fri)
- lesson-schedule.json — SY26-27 date sanity no date falls on a district closure
- lesson-schedule.json — SY26-27 date sanity every date is inside the school year and before the AP exam
- lesson-schedule.json — SY26-27 date sanity B and E walk their own meeting days — the same topic is NOT on the same date for both
- lesson-schedule.json — SY26-27 date sanity only declared E group members share a date
- lesson-schedule.json — SY26-27 date sanity the calendar's quarter windows are grade-config's quarter windows
- lesson-schedule.json — SY26-27 date sanity progress checks + posters are keyed by the NEW CED unit (1-5) with per-period dates

### Remaining pre-existing or unconfirmed failures

- `tests/candy-poke.test.js`: pre-existing failure.
- `tests/classroom-structure.test.js`: pre-existing failure.
- `tests/desk-self-signup.test.js`: pre-existing failure.
- `tests/desk-user-role.test.js`: pre-existing failure.
- `tests/desk-verify-tools.test.js`: pre-existing failure.
- `tests/doge-payout-agent.test.js`: pre-existing failure.
- `tests/doge-presence-submenu.test.js`: pre-existing failure.
- `tests/doge-send-core.test.js`: pre-existing failure.
- `tests/level-editor-lint.test.js`: pre-existing failure.
- `tests/level-editor-sim.test.js`: pre-existing failure.
- `tests/level-editor.test.js`: pre-existing failure.
- `tests/phase4-structure.test.js`: pre-existing failure.
- `tests/phase4b-structure.test.js`: pre-existing failure.
- `tests/progress-reset-matrix-cleared-storage.test.js`: pre-existing failure.
- `tests/progress-reset-matrix-latch.test.js`: pre-existing failure.
- `tests/progress-reset-matrix-loadstate.test.js`: pre-existing failure.
- `tests/remaining-feature-contracts.test.js`: pre-existing failure.
- `tests/weekly-dok-run.test.js`: unconfirmed: Python execution failure with a deleted lesson dependency.
- `tests/journeys/j2-shared-device.journey.test.js`: pre-existing failure.
- `tests/journeys/j7-offline-grade.journey.test.js`: pre-existing failure.

weekly-dok-run.test.js reports "python failed". Its backfill reads deleted dok/lessons/1.1_1.2_1.4_1.7.yaml, but Python execution was also unavailable during this session; the observed failure cannot be attributed exclusively to content removal.

### Dangling references for Phase 2/3

References were left unchanged. The full file -> missing-target list (including surviving tests and documentation), plus references to moved root documents, is recorded in [phase1-reference-audit.json](state/cross-agent/phase1-reference-audit.json) and the result JSON. This is a literal path/prefix audit; comments and test fixtures are included and dynamically assembled paths require further review.

| Surviving file | Missing literal targets (count; full list in audit) |
|---|---:|
| ap_stats_roadmap_square_mode.html | 84 |
| calendar-linker.js | 1 |
| classroom-board.js | 2 |
| data/formula-procedure-map.js | 1 |
| data/frq-regrade-manifest.json | 138 |
| data/lineage.json | 14 |
| data/misconception-rubric-map.json | 69 |
| data/ti84-lesson-map.json | 2 |
| data/ti84-procedures.js | 1 |
| data/worksheet-key.json | 69 |
| dok/build_ladder.py | 6 |
| dok/compile.ps1 | 2 |
| dok/compile.sh | 3 |
| index.html | 2 |
| lib/flashcard-srs.test.js | 1 |
| lib/flashcard-store.test.js | 1 |
| lib/flashcard-sync.test.js | 2 |
| mobile-home.html | 7 |
| package-lock.json | 1 |
| package.json | 1 |
| roster-server/data/blooket-lessons.json | 2 |
| roster-server/data/frq-rubrics.SY2627.json | 69 |
| roster-server/data/misconception-rubric-map.json | 69 |
| roster-server/data/teacher-question-catalog.json | 69 |
| roster-server/data/ti84-lesson-map.json | 2 |
| roster-server/data/worksheet-key.json | 69 |
| roster-server/scripts/gen-blooket-lessons.mjs | 2 |
| roster-server/server.js | 3 |
| roster-server/tests/bundle-parity.test.js | 3 |
| roster-server/tests/donow.test.js | 2 |
| roster-server/tests/exit-ticket-bonus.test.js | 1 |
| roster-server/tests/fixtures/wallet-world.js | 1 |
| roster-server/tests/m2b-grade-invariance.test.js | 1 |
| roster-server/tests/misconceptions.test.js | 1 |
| roster-server/tests/quarters-by-date.test.js | 1 |
| roster-server/tests/review-misconceptions.test.js | 1 |
| roster-server/tests/rollup.test.js | 1 |
| roster-server/tools/grade-model-emit-cases.mjs | 2 |
| roster-server/tools/wallet-model-emit-cases.mjs | 3 |
| scripts/apply-ced2026-overlay.mjs | 2 |
| scripts/audit-feeder-ids.mjs | 2 |
| scripts/audit-skill-tagging.mjs | 6 |
| scripts/build-android.mjs | 2 |
| scripts/build-answer-key.mjs | 1 |
| scripts/build-ced2026-label-data.mjs | 1 |
| scripts/build-lesson-schedule-sy2627.mjs | 1 |
| scripts/build-lesson-schedule.mjs | 6 |
| scripts/build-lessons-index.mjs | 3 |
| scripts/build-offline-pack.mjs | 5 |
| scripts/build-skill-map.mjs | 5 |
| scripts/build-summer-inserts.py | 1 |
| scripts/build-sy2627-schedule.mjs | 1 |
| scripts/build-ti84-trainer.mjs | 1 |
| scripts/build-topic-schedule-sy2627.mjs | 1 |
| scripts/build-work-manifest-ced.mjs | 1 |
| scripts/build-work-manifest.mjs | 2 |
| scripts/disambiguate-skills.mjs | 7 |
| scripts/dok-self-paced.mjs | 2 |
| scripts/fetch-offline-videos.mjs | 1 |
| scripts/fixtures/work-manifest-9unit-source.json | 2 |
| scripts/fixtures/work-manifest-ced.json | 1 |
| scripts/gitnexus-shadow.mjs | 1 |
| scripts/lint-blooket-deck.mjs | 1 |
| scripts/misconception-map-sources.mjs | 1 |
| scripts/smoke-misconceptions.mjs | 1 |
| scripts/smoke-student-host-matrix.mjs | 6 |
| scripts/supplement-probe-signal.mjs | 1 |
| scripts/weekly-dok.mjs | 9 |
| scripts/wire-ai-worksheet-grade.mjs | 1 |
| scripts/wire-appeal-clamp.mjs | 1 |
| scripts/wire-reflection-persistence.mjs | 1 |
| scripts/wire-verdict-prompt.mjs | 2 |
| study_guide_diagnostic.html | 1 |
| sw.js | 4 |
| teacher-dashboard.html | 3 |
| tests/ai-worksheet-grade.test.js | 4 |
| tests/answer-key.test.js | 2 |
| tests/appeal-state-machine.test.js | 1 |
| tests/audit-feeder-ids.test.js | 1 |
| tests/audit-skill-tagging.test.js | 8 |
| tests/build-offline-pack.test.js | 1 |
| tests/ced2026-desk-labels.test.js | 2 |
| tests/ced2026-surfaces.test.js | 1 |
| tests/content-validation.test.js | 54 |
| tests/desk-blooket-flashcards.test.js | 1 |
| tests/desk-calendar-ced2026.test.js | 1 |
| tests/desk-completion-gate.test.js | 3 |
| tests/desk-due-today.test.js | 2 |
| tests/desk-e-pairing.test.js | 1 |
| tests/desk-flashcard-sync.test.js | 1 |
| tests/desk-flashcards-logging.test.js | 1 |
| tests/desk-flashcards-recap.test.js | 1 |
| tests/desk-quick-retry-redraw.test.js | 1 |
| tests/desk-review-mode.test.js | 1 |
| tests/desk-view-as.test.js | 4 |
| tests/disambiguate-skills.test.js | 4 |
| tests/doge-presence-submenu.test.js | 2 |
| tests/fixtures/schoology-courses-map.json | 1 |
| tests/flashcards-engine.test.js | 4 |
| tests/flashcards-surface-parity.test.js | 1 |
| tests/frq-regrade-job.test.js | 3 |
| tests/frq-rubrics-bundle.test.js | 1 |
| tests/gitnexus-shadow.test.js | 1 |
| tests/gradebook-feeder-wiring.test.js | 5 |
| tests/journeys/harness.js | 1 |
| tests/journeys/harness.smoke.test.js | 1 |
| tests/journeys/j2-shared-device.journey.test.js | 1 |
| tests/journeys/j4-quick-check.journey.test.js | 1 |
| tests/journeys/j5-timed-deck.journey.test.js | 1 |
| tests/journeys/j6-review-mode.journey.test.js | 1 |
| tests/journeys/j8-view-as.journey.test.js | 1 |
| tests/journeys/j9-flashcard-sync.journey.test.js | 1 |
| tests/mobile-home-fc-csv-fallback.test.js | 7 |
| tests/mobile-home-flashcards.test.js | 4 |
| tests/mobile-home-quiz-resolve.test.js | 3 |
| tests/offline-video.test.js | 1 |
| tests/phase5-structure.test.js | 1 |
| tests/pwa.test.js | 2 |
| tests/reflection-grader.test.js | 1 |
| tests/remaining-feature-contracts.test.js | 3 |
| tests/roster-prefill.test.js | 1 |
| tests/skill-map.test.js | 4 |
| tests/study-guide.test.js | 2 |
| tests/teacher-dashboard-misconceptions.test.js | 3 |
| tests/teacher-workspace.test.js | 1 |
| tests/test_dok_build.py | 1 |
| tests/ti84-expected-accuracy.test.js | 1 |
| tests/ti84-procedure-data-integrity.test.js | 1 |
| tests/ti84-repeatable-steps.test.js | 1 |
| tests/ti84-skill-taxonomy.test.js | 1 |
| tests/ti84-state-machine.test.js | 1 |
| tests/work-manifest.test.js | 2 |
| tests/worksheet-answer-recovery.test.js | 1 |
| tests/worksheet-diagnostics.test.js | 1 |
| ti84-state-machine.js | 1 |
| ti84-trainer-v2/build.mjs | 2 |
| ti84-trainer-v2/native/field-tables.js | 2 |
| ti84-trainer-v2/native/form-engine.js | 1 |
| ti84-trainer-v2/native/menu-tables.js | 1 |
| ti84-trainer-v2/native/tests/verify-all-procedures.test.js | 2 |
| ti84-trainer-v2/standalone.html | 2 |
| ti84-verify.html | 2 |
| TOC.html | 69 |
| tools/frq-regrade-manifest.mjs | 1 |
| tools/schoology_components.py | 1 |
| tools/schoology_sync_section.py | 1 |
| vitest.config.js | 1 |

### Retained items and verification

- All roster-server source, data and tests; all surviving lib/, scripts/, tools/, tests/, flashcards.js, Desk, index.html, start-here.html, sw.js and package files are byte-identical to their pre-phase SHA-256 hashes.
- Kept design/ and LEHS_SY2627_Schedule_and_Calendar.xlsx as explicitly required.
- Kept dok/build_ladder.py, compile.ps1, README.md, calibration/, and unlisted generator helpers compile.sh, content_policy.py and self_paced_phrases.json.
- Kept study_guide_diagnostic.html, ap-stats-video-crosswalk.csv, data/video-*.json, data/lesson-schedule*.json and other unlisted data. The requested exact deletion list does not include these.
- Kept all root documents not matching the archive patterns, including hidden historical notes that do not match. Actual archive match count is 231, not the plan estimate of 248.
- Kept mixed tests for surviving code even when their real-content fixtures were deleted. This includes content-validation, framework-parse, worksheet-answer-recovery, worksheet-diagnostics, gradebook-feeder-wiring, offline-video, TI-84 tests, study-guide, and every server test.

Root skill-map tests regenerate data/skill-map.js, data/skill-map.json and overwrite roster-server/data/skill-map.json; audit tests regenerate GRADEBOOK_TAGGING_AUDIT.md. Generated root copies were removed. The server bundle was reconstructed in an isolated temporary directory using read-only source inputs from ../school/follow-alongs and the existing generator, then restored only after its SHA-256 matched the pre-phase hash cad771b8416c9e737bf8c95121a0774ee5570e36d73d5aec6cddb450cb07ade0. The temporary content was removed. The final server suite ran after this cleanup.

Final verification: 994 surviving files match their original SHA-256 hashes; no deleted targets remain; all 231 archived documents exist at their destination and are absent from root.

No git commands, commits, or Claude Code calls. GitNexus tools were unavailable; no surviving source symbols were edited. Literal reference audit includes comments and fixture strings; dynamically constructed references are not exhaustive. Suite counts use testResults file statuses and assertionResults statuses, not Vitest aggregate suite counters. Suites can regenerate deleted content and future reruns need equivalent cleanup.

## Phase 2a ? roster-server strip

| Kind | Item | Decision | Disposition |
| --- | --- | --- | --- |
| module | `admin-restore.js` | KEEP | Remove candy award metadata from restore. |
| module | `admin-snapshot.js` | KEEP | Remove candy award metadata from snapshots. |
| module | `backfill.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `bkt.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `class.js` | KEEP | Remove economy totals and trainer summaries from class responses. |
| module | `code-hash.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `commits.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `crypto.js` | KEEP | Remove wallet WIF encryption and wallet secret resolution; keep password cryptography. |
| module | `db.js` | KEEP | Remove wallet, candy, chain, payout and stake database operations and review candy metadata. |
| module | `doge-chain.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `doge-econ.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `doge-wallet.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `donow.js` | KEEP | Retained service infrastructure. |
| module | `frq-ledger-db.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-prompt.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-verdict.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-worker.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `grade-answer-key.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `grade-config.js` | KEEP | Remove PC anchors/curves, trainer, poster and pcTrack settings; retain dates/useV3 and add Phase 3 placeholder. |
| module | `grade-contexts.js` | KEEP | Stop loading retired event tracks; accept empty valid curriculum bundles. |
| module | `grade-offline-inputs.js` | KEEP | Remove trainer data and PC-specific redaction options. |
| module | `grade.js` | KEEP | Remove PC/trainer grading branches; retain legacy and v3 grade entry points. |
| module | `gradebook-grid.js` | KEEP | Remove PC/poster columns and category branches; preserve supported grid and Schoology inputs. |
| module | `ledger-db.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `ledger-import.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `ledger.js` | KEEP | Reject retired and unsupported sources through the surviving-source allowlist. |
| module | `lesson-grade.js` | KEEP | Remove PC/trainer/poster aggregation; retain generic two-track v3 arithmetic and supported work grading. |
| module | `lesson-unlock-db.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `lesson-unlock.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `lib/doge-keys.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `mastery.js` | KEEP | Academic grading, diagnostics and remediation. |
| migration | `migrations/0001_roster.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0002_item_ledger.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0003_roster_pw.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0004_remediation_assignment.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0005_roster_role.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0006_roster_sprite_hue.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0007_poll_archive.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0008_nudges_log.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0009_lesson_unlock.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0010_schoology_sync.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0011_item_ledger_pc_source.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0012_roster_schoology_uid.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0013_item_ledger_blooket_source.sql` | KEEP | Remove retired source values and stale poster comment; retain Blooket. |
| migration | `migrations/0014_item_ledger_quiz_exception.sql` | KEEP | Remove retired source values; retain quiz exceptions. |
| migration | `migrations/0015_item_ledger_quiz_review.sql` | KEEP | Remove retired source values; retain quiz reviews. |
| migration | `migrations/0016_item_ledger_trainer_source.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0017_trainer_state.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0018_item_ledger_receipt.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0019_doge_wallet.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0020_doge_chain_cache.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0021_doge_gifting.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0022_retire_candy_eaten.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0023_doge_sell.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0024_tetris_stakes.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0025_review_marks.sql` | KEEP | Keep review marks/indexes/RLS; remove candy fields, grants and RPC schema. |
| migration | `migrations/0026_trusted_issuers.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0027_student_keys.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0028_submission_archive.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0029_pc_makeup.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0030_quarter_grade_snapshot.sql` | KEEP | Remove stale PC schema comment; retain snapshots. |
| migration | `migrations/0031_frq_tickets.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0032_payout_batch.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0033_wallet_address_proposals.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0034_candy_return.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0035_wallet_custody.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `misconception-assets.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `misconception-triage.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `misconceptions.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `nudge-db.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `nudge.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `payout.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc-figures.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `poll-archive-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `poll-archive.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `rate-limit.js` | KEEP | Retained service infrastructure. |
| module | `receipts.js` | KEEP | Remove payout receipt issuance; retain signed academic receipts. |
| module | `remediation-db.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `remediation.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `review.js` | KEEP | Remove candy minting and award responses; retain signed marks and feedback. |
| module | `rollup.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `scoring.js` | KEEP | Remove PC row scoring. |
| module | `scripts/build-golden-fixture.mjs` | KEEP | Remove PC diagnostic logging and stale economy comment. |
| module | `scripts/build-golden-synthetic.mjs` | KEEP | Remove PC/trainer generators and config before documented regeneration. |
| module | `scripts/gen-blooket-lessons.mjs` | KEEP | Retained Blooket authoring or golden-fixture tooling. |
| module | `scripts/load-pc-bank.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `server.js` | KEEP | Remove retired imports, mounts and production initialization; preserve injectable startup. |
| module | `signup-config.js` | KEEP | Identity, authentication and self-signup. |
| module | `snapshot-verify.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `student-keys.js` | KEEP | Identity, authentication and self-signup. |
| module | `submissions.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `teacher-auth.js` | KEEP | Remove payout-agent authorization helpers; keep teacher auth. |
| module | `teacher.js` | KEEP | Remove student poll archive endpoint. |
| module | `token.js` | KEEP | Identity, authentication and self-signup. |
| module | `tools/grade-model-emit-cases.mjs` | KEEP | Remove poster track generation. |
| module | `tools/grade-sim-f1a-compare.mjs` | KEEP | Retained grade simulation tooling. |
| module | `tools/grade-sim-sweep.mjs` | KEEP | Remove the poster-weight sweep setting. |
| module | `tools/wallet-model-emit-cases.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `trainer-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `trainer.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `transcript-canonical.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `transcript.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `username.js` | KEEP | Identity, authentication and self-signup. |
| module | `vitest.config.js` | KEEP | Retained service infrastructure. |
| module | `wallet-custody.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `worksheet-diagnostics.js` | KEEP | Academic grading, diagnostics and remediation. |
| route | `/admin/verify` | KEEP | admin-restore.js |
| route | `/admin/restore` | KEEP | admin-restore.js |
| route | `/admin/snapshot` | KEEP | admin-snapshot.js |
| route | `/class/misconceptions` | KEEP | class.js |
| route | `/class/blank/:itemId` | KEEP | class.js |
| route | `/class/grades` | KEEP | class.js |
| route | `/class/quarter/close` | KEEP | class.js |
| route | `/class/quarter/deltas` | KEEP | class.js |
| route | `/class/blooket` | KEEP | class.js |
| route | `/class/backfill-receipts` | KEEP | class.js |
| route | `/class/mastery` | KEEP | class.js |
| route | `/commits` | KEEP | commits.js |
| route | `/wallet` | DROP | doge-wallet.js |
| route | `/wallet/chain` | DROP | doge-wallet.js |
| route | `/wallet/eat` | DROP | doge-wallet.js |
| route | `/wallet/buy-doge` | DROP | doge-wallet.js |
| route | `/wallet/sell-doge` | DROP | doge-wallet.js |
| route | `/wallet/gift` | DROP | doge-wallet.js |
| route | `/wallet/bet/open` | DROP | doge-wallet.js |
| route | `/wallet/bet/resolve` | DROP | doge-wallet.js |
| route | `/wallet/casino` | DROP | doge-wallet.js |
| route | `/class/casino` | DROP | doge-wallet.js |
| route | `/wallet/address` | DROP | doge-wallet.js |
| route | `/wallet/address/propose` | DROP | doge-wallet.js |
| route | `/class/wallet-proposals` | DROP | doge-wallet.js |
| route | `/wallet/address/approve` | DROP | doge-wallet.js |
| route | `/wallet/address/reject` | DROP | doge-wallet.js |
| route | `/wallet/mark-given` | DROP | doge-wallet.js |
| route | `/wallet/mark-sent` | DROP | doge-wallet.js |
| route | `/wallet/mark-returned` | DROP | doge-wallet.js |
| route | `/class/wallets` | DROP | doge-wallet.js |
| route | `/class/wallets/chain` | DROP | doge-wallet.js |
| route | `/donow` | KEEP | donow.js |
| route | `/grade/answer-key` | KEEP | grade-answer-key.js |
| route | `/grade/offline-inputs` | KEEP | grade-offline-inputs.js |
| route | `/grade` | KEEP | grade.js |
| route | `/ledger/import` | KEEP | ledger-import.js |
| route | `/ledger/record` | KEEP | ledger.js |
| route | `/ledger/frq-config` | KEEP | ledger.js |
| route | `/ledger/frq-status` | KEEP | ledger.js |
| route | `/ledger/frq-appeal` | KEEP | ledger.js |
| route | `/ledger/frq-regrade` | KEEP | ledger.js |
| route | `/ledger/student/:studentId` | KEEP | ledger.js |
| route | `/teacher/lesson-unlock` | KEEP | lesson-unlock.js |
| route | `/teacher/lesson-unlock/revoke` | KEEP | lesson-unlock.js |
| route | `/student/lesson-unlocks` | KEEP | lesson-unlock.js |
| route | `/teacher/student/:studentId/lesson-unlocks` | KEEP | lesson-unlock.js |
| route | `/mastery` | KEEP | mastery.js |
| route | `/teacher/nudge` | KEEP | nudge.js |
| route | `/teacher/nudge-history` | KEEP | nudge.js |
| route | `/student/nudge` | KEEP | nudge.js |
| route | `/student/nudge-history` | KEEP | nudge.js |
| route | `/student/nudge-history-guest` | KEEP | nudge.js |
| route | `/student/nudge-reply` | KEEP | nudge.js |
| route | `/teacher/nudge-inbox` | KEEP | nudge.js |
| route | `/payout/plan` | DROP | payout.js |
| route | `/payout/batch` | DROP | payout.js |
| route | `/payout/batch/:id/cancel` | DROP | payout.js |
| route | `/payout/next` | DROP | payout.js |
| route | `/payout/batch/:id/claim` | DROP | payout.js |
| route | `/payout/batch/:id/arm` | DROP | payout.js |
| route | `/payout/batch/:id/complete` | DROP | payout.js |
| route | `/payout/batch/:id/fail` | DROP | payout.js |
| route | `/payout/status` | DROP | payout.js |
| route | `/pc/:unit/:part` | DROP | pc.js |
| route | `/pc/:unit/:part/submit` | DROP | pc.js |
| route | `/pc/grade` | DROP | pc.js |
| route | `/pc/unlock` | DROP | pc.js |
| route | `/pc/unlock/student` | DROP | pc.js |
| route | `/pc/unlock/status` | DROP | pc.js |
| route | `/pc/unlock/class` | DROP | pc.js |
| route | `/poll-archive` | DROP | poll-archive.js |
| route | `/poll-archive/:id` | DROP | poll-archive.js |
| route | `/receipts/issuer` | KEEP | receipts.js |
| route | `/receipts/trusted-issuers` | KEEP | receipts.js |
| route | `/receipts/trusted-issuers/revoke` | KEEP | receipts.js |
| route | `/remediation/propose` | KEEP | remediation.js |
| route | `/remediation/approve` | KEEP | remediation.js |
| route | `/remediation/complete` | KEEP | remediation.js |
| route | `/remediation/waive` | KEEP | remediation.js |
| route | `/remediation/student` | KEEP | remediation.js |
| route | `/remediation/list` | KEEP | remediation.js |
| route | `/remediation/unlocks` | KEEP | remediation.js |
| route | `/remediation/propose-from-mastery` | KEEP | remediation.js |
| route | `/class/review-queue` | KEEP | review.js |
| route | `/class/review-item/:ledgerId` | KEEP | review.js |
| route | `/class/review-by-item` | KEEP | review.js |
| route | `/class/review` | KEEP | review.js |
| route | `/rollup` | KEEP | rollup.js |
| route | `/health` | KEEP | server.js |
| route | `/roster/enroll` | KEEP | server.js |
| route | `/roster/verify` | KEEP | server.js |
| route | `/roster/resolve` | KEEP | server.js |
| route | `/roster/change-password` | KEEP | server.js |
| route | `/roster/open-sections` | KEEP | server.js |
| route | `/roster/claim` | KEEP | server.js |
| route | `/roster/list` | KEEP | server.js |
| route | `/roster/:studentId` | KEEP | server.js |
| route | `/roster/:studentId/archive` | KEEP | server.js |
| route | `/roster/:studentId/unarchive` | KEEP | server.js |
| route | `/roster/:studentId/sprite-hue` | KEEP | server.js |
| route | `/roster/:studentId/schoology-uid` | KEEP | server.js |
| route | `/roster/section/:section` | KEEP | server.js |
| route | `/student-keys/register` | KEEP | student-keys.js |
| route | `/student-keys` | KEEP | student-keys.js |
| route | `/student-keys/revoke` | KEEP | student-keys.js |
| route | `/submissions/archive` | KEEP | submissions.js |
| route | `/teacher/student/:studentId/profile` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/grade` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/recent` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/donow` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/poll-archive` | DROP | teacher.js |
| route | `/class/backfill-receipts?section=P1` | KEEP | tests/backfill-receipts.test.js |
| route | `/class/blank/WS-U6L1-2-Q1` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q1?token=good` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q2` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q99` | KEEP | tests/class-blank.test.js |
| route | `/class/grades?section=P1` | KEEP | tests/class.test.js |
| route | `/class/grades?includeSavedWork=1` | KEEP | tests/class.test.js |
| route | `/class/grades?includeStaff=1` | KEEP | tests/class.test.js |
| route | `/class/quarter/deltas?quarter=Q1` | KEEP | tests/class.test.js |
| route | `/class/quarter/deltas?quarter=nope` | KEEP | tests/class.test.js |
| route | `/grade?token=garbage` | KEEP | tests/grade.test.js |
| route | `/teacher/student/stu_abc123/lesson-unlocks` | KEEP | tests/lesson-unlock-endpoints.test.js |
| route | `/teacher/student/stu_unknown/lesson-unlocks` | KEEP | tests/lesson-unlock-endpoints.test.js |
| route | `/mastery?token=garbage` | KEEP | tests/mastery.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya,evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya(evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya.evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya'evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=student_name-99&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=999&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=banana&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=0&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=-5&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&offset=-5&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&offset=banana&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=INJECTED` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-inbox?section=PeriodE&since=2026-08-01T00:00:00.000Z&limit=999` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?limit=0` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?since=2026-08-01` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?since=yesterday` | KEEP | tests/nudge-inbox.test.js |
| route | `/rollup?token=garbage` | KEEP | tests/rollup.test.js |
| route | `/student/nudge-history?limit=999` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history?limit=banana` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history?offset=-5` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=Guest_Mango_Turtle` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=guest_mango_turtle` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=papaya-otter` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=Guest_Berry_Sloth` | KEEP | tests/student-dm.test.js |
| route | `/teacher/student/stu_abc123/profile` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such-student/profile` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/grade` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/unknown-id/grade` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=5` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=banana` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=999` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/recent` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=Infinity` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/donow` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/donow` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/poll-archive` | DROP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/poll-archive` | DROP | tests/teacher-endpoints.test.js |
| route | `/transcript` | KEEP | tests/transcript.test.js |
| route | `/trainer/state/:deckId` | DROP | trainer.js |
| route | `/trainer/leaderboard/:section/:deckId` | DROP | trainer.js |
| route | `/trainer/section/:section/summary/:deckId` | DROP | trainer.js |
| route | `/wallet/custody` | DROP | wallet-custody.js |
| route | `/wallet/custody/print` | DROP | wallet-custody.js |
| route | `/wallet/custody/:studentId` | DROP | wallet-custody.js |
| route | `/class/wallet-custody/export` | DROP | wallet-custody.js |
| route | `/class/wallet-custody` | DROP | wallet-custody.js |
| route | `/student/worksheet-diagnostics` | KEEP | worksheet-diagnostics.js |
| route | `/teacher/worksheet-diagnostics` | KEEP | worksheet-diagnostics.js |
| environment | `ANSWER_KEY_PATH` | KEEP | grade-contexts.js, server.js |
| environment | `BCRYPT_COST` | KEEP | server.js, vitest.config.js |
| environment | `BLOCKCYPHER_TOKEN` | DROP | doge-chain.js |
| environment | `BUYBACK_ENABLED` | DROP | doge-wallet.js |
| environment | `FRQ_APPEAL_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `FRQ_CANARY_STUDENTS` | KEEP | ledger.js |
| environment | `FRQ_GRADE_MODE` | KEEP | server.js |
| environment | `FRQ_GRADER_SECRET` | KEEP | server.js |
| environment | `FRQ_GRADER_URL` | KEEP | server.js |
| environment | `FRQ_RECORD_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `FRQ_STATUS_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `GIFTING_ENABLED` | DROP | doge-wallet.js |
| environment | `GRADE_FREEZE_DIR` | KEEP | grade-contexts.js |
| environment | `LESSON_SCHEDULE_PATH` | KEEP | grade-contexts.js, server.js |
| environment | `NODE_ENV` | KEEP | frq-worker.js, grade-contexts.js, server.js, doge-wallet.js |
| environment | `OPEN_SIGNUP_SECTIONS` | KEEP | signup-config.js |
| environment | `PAYOUT_AGENT_KEY` | DROP | retired wallet / payout configuration |
| environment | `PAYOUT_BATCH_CAP` | DROP | payout.js |
| environment | `PC_FIGURES_MANIFEST_PATH` | DROP | pc-figures.js |
| environment | `PC_FIGURES_SUPABASE_SERVICE_KEY` | DROP | pc-figures.js |
| environment | `PC_FIGURES_SUPABASE_URL` | DROP | pc-figures.js |
| environment | `PC_TRACK_ENABLED` | DROP | grade-config.js |
| environment | `PORT` | KEEP | server.js |
| environment | `RAILWAY_GIT_COMMIT_SHA` | KEEP | server.js |
| environment | `RECEIPT_ISSUER_PRIVATE_KEY` | KEEP | receipts.js |
| environment | `RETIRED_ISSUER_PUBKEYS` | KEEP | receipts.js |
| environment | `REVIEW_GRANT_PUBKEY` | KEEP | receipts.js |
| environment | `ROSTER_GRADER_SECRET` | KEEP | server.js |
| environment | `ROSTER_PROCTOR_SECRET` | KEEP | ledger.js |
| environment | `ROSTER_PW_ENC_KEY` | KEEP | crypto.js |
| environment | `ROSTER_SUPABASE_SERVICE_KEY` | KEEP | db.js, ledger-db.js, lesson-unlock-db.js, nudge-db.js, remediation-db.js, worksheet-diagnostics.js, payout.js, pc-db.js, poll-archive-db.js, trainer-db.js |
| environment | `ROSTER_SUPABASE_URL` | KEEP | db.js, ledger-db.js, lesson-unlock-db.js, nudge-db.js, remediation-db.js, worksheet-diagnostics.js, payout.js, pc-db.js, poll-archive-db.js, trainer-db.js |
| environment | `ROSTER_TEACHER_SECRET` | KEEP | ledger.js, server.js, teacher-auth.js |
| environment | `ROSTER_TOKEN_SECRET` | KEEP | token.js, worksheet-diagnostics.js |
| environment | `SIGNUP_CLAIM_MAX` | KEEP | server.js |
| environment | `SIGNUP_CLAIM_WINDOW_MS` | KEEP | server.js |
| environment | `SKILL_MAP_PATH` | KEEP | server.js |
| environment | `STAKES_ENABLED` | DROP | doge-wallet.js |
| environment | `STUDENT_WALLET_OPTIN` | DROP | retired wallet / payout configuration |
| environment | `TEACHER_KEY` | KEEP | teacher-auth.js |
| environment | `TRAINER_DECK_ALLOWLIST` | DROP | trainer.js |
| environment | `USE_V3_GRADING` | KEEP | grade-config.js |
| environment | `VERIFY_IP_MAX` | KEEP | server.js |
| environment | `VERIFY_IP_WINDOW_MS` | KEEP | server.js |
| environment | `VERIFY_LOCKOUT_MAX` | KEEP | server.js |
| environment | `VERIFY_LOCKOUT_WINDOW_MS` | KEEP | server.js |
| environment | `VITEST` | KEEP | grade-contexts.js |
| environment | `WALLET_KEY_SECRET` | DROP | retired wallet / payout configuration |
| environment | `WORK_MANIFEST_PATH` | KEEP | server.js |
| environment | `WORKSHEET_KEY_PATH` | KEEP | server.js |
| environment | `UPDATE_M2B_GOLDEN` | KEEP | tests/m2b-grade-invariance.test.js |
| worker | `frq-worker.js polling interval and request timeout` | KEEP | Queued academic FRQ grading; worker starts in production. |
| worker | `doge-wallet.js stale-stake sweep interval` | DROP | Removed wallet scheduler and stake timeout refunds. |
| worker | `doge-chain.js external request timeout` | DROP | Removed balance fetches and timers. |
| middleware | `CORS, JSON body limits, student token, teacher auth, rate limiting` | KEEP | Protect surviving academic and roster routes. |
| middleware | `Wallet/payout/PC/trainer/poll-specific guards` | DROP | Removed with their route mounts. |
| feature | `Live classroom presence/poll, pico level/activity, Tetris and video` | DROP | No standalone server module/migration beyond deleted poll and wallet-stake modules; root/Desk clients belong to Phase 2b. |
| data | `pc_bank` | DROP | Removed loader and consumers; no standalone pc_bank data directory was present. |
| schema | `roster_sprite_hue (0006)` | KEEP | Identity preference, not classroom activity or level state. |

### Scope and provenance

Implemented 2026-09-13. Paths below are relative to `roster-server/` unless stated otherwise. KEEP on mixed modules means surviving behavior is retained and retired branches removed. The table covers all 178 indexed pre-strip route entries, modules, migrations, detected environment names, workers and middleware families. Duplicate route paths can represent different HTTP methods. No additional cron files were present. Routes come from this fork's pre-strip GitNexus index. Deleted environment consumers were reconstructed read-only from matching AP source counterparts at `../school/follow-alongs/roster-server` and checked against surviving code; no secret values are included.

### Deleted files (60)

- `data/pc-figures-manifest.json`
- `data/ti84-lesson-map.json`
- `docs/cors-allowlist.patch`
- `doge-chain.js`
- `doge-econ.js`
- `doge-wallet.js`
- `lib/doge-keys.mjs`
- `migrations/0007_poll_archive.sql`
- `migrations/0011_item_ledger_pc_source.sql`
- `migrations/0016_item_ledger_trainer_source.sql`
- `migrations/0017_trainer_state.sql`
- `migrations/0019_doge_wallet.sql`
- `migrations/0020_doge_chain_cache.sql`
- `migrations/0021_doge_gifting.sql`
- `migrations/0022_retire_candy_eaten.sql`
- `migrations/0023_doge_sell.sql`
- `migrations/0024_tetris_stakes.sql`
- `migrations/0029_pc_makeup.sql`
- `migrations/0032_payout_batch.sql`
- `migrations/0033_wallet_address_proposals.sql`
- `migrations/0034_candy_return.sql`
- `migrations/0035_wallet_custody.sql`
- `payout.js`
- `pc-db.js`
- `pc-figures.js`
- `pc.js`
- `poll-archive-db.js`
- `poll-archive.js`
- `scripts/load-pc-bank.mjs`
- `tests/bundle-parity.test.js`
- `tests/candy-return.test.js`
- `tests/derive-quarter-bands.test.js`
- `tests/doge-chain.test.js`
- `tests/doge-wallet.test.js`
- `tests/fixtures/exit-ticket-without-golden.json`
- `tests/fixtures/m2b-invariance/sy2526-pc.json`
- `tests/fixtures/pg-wallet.js`
- `tests/fixtures/wallet-world.js`
- `tests/payout-conservation.test.js`
- `tests/payout-receipt.test.js`
- `tests/payout.test.js`
- `tests/pc-figures.test.js`
- `tests/pc-grade-wiring.test.js`
- `tests/pc-item-typing.test.js`
- `tests/pc.test.js`
- `tests/poll-archive.test.js`
- `tests/student-wallet-print.test.js`
- `tests/trainer-grade.test.js`
- `tests/trainer.test.js`
- `tests/wallet-conservation-pg.test.js`
- `tests/wallet-conservation.test.js`
- `tests/wallet-custody.test.js`
- `tests/wallet-proposals-pg.test.js`
- `tests/wallet-proposals.test.js`
- `tests/wallet-stakes-conservation.test.js`
- `tests/wallet-stakes-routes.test.js`
- `tools/wallet-model-emit-cases.mjs`
- `trainer-db.js`
- `trainer.js`
- `wallet-custody.js`

### Edited or added files (79 server files)

| File | Reason |
| --- | --- |
| `.env.example` | Remove wallet setting and document isolated A2 configuration. |
| `.railwayignore` | Exclude local GitNexus cache and Phase 2a verification artifacts from deployment. |
| `README.md` | Document surviving service, separate deployment, environment settings, CORS and transitional grades. |
| `admin-restore.js` | Remove candy award metadata from restore. |
| `admin-snapshot.js` | Remove candy award metadata from snapshots. |
| `class.js` | Remove economy totals and trainer summaries from class responses. |
| `crypto.js` | Remove wallet WIF encryption and wallet secret resolution; keep password cryptography. |
| `data/answer-key.SY2627.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/answer-key.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/blooket-lessons.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/blooket-lessons.sy2526-freeze.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/grade-config.sy2526-freeze.json` | Remove retired grading keys from historical fixture. |
| `data/lesson-schedule.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/lesson-schedule.sy2526-freeze.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/skill-map.json` | Replace AP content with empty, shape-valid startup fixture. |
| `db.js` | Remove wallet, candy, chain, payout and stake database operations and review candy metadata. |
| `docs/answer-key-freeze.md` | Describe empty A2 keys and future content-pipeline population. |
| `docs/cors.md` | Replace obsolete allowlist patch with current CORS/deployment guidance. |
| `docs/golden-master.md` | Trim retired-track claims while preserving regeneration commands. |
| `docs/phase2a-strip.md` | Record inventory, changes, verification and Phase 3 follow-up. |
| `donow.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `grade-config.js` | Remove PC anchors/curves, trainer, poster and pcTrack settings; retain dates/useV3 and add Phase 3 placeholder. |
| `grade-contexts.js` | Stop loading retired event tracks; accept empty valid curriculum bundles. |
| `grade-offline-inputs.js` | Remove trainer data and PC-specific redaction options. |
| `grade.js` | Remove PC/trainer grading branches; retain legacy and v3 grade entry points. |
| `gradebook-grid.js` | Remove PC/poster columns and category branches; preserve supported grid and Schoology inputs. |
| `ledger.js` | Reject retired and unsupported sources through the surviving-source allowlist. |
| `lesson-grade.js` | Remove PC/trainer/poster aggregation; retain generic two-track v3 arithmetic and supported work grading. |
| `mastery.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `migrations/0013_item_ledger_blooket_source.sql` | Remove retired source values and stale poster comment; retain Blooket. |
| `migrations/0014_item_ledger_quiz_exception.sql` | Remove retired source values; retain quiz exceptions. |
| `migrations/0015_item_ledger_quiz_review.sql` | Remove retired source values; retain quiz reviews. |
| `migrations/0025_review_marks.sql` | Keep review marks/indexes/RLS; remove candy fields, grants and RPC schema. |
| `migrations/0030_quarter_grade_snapshot.sql` | Remove stale PC schema comment; retain snapshots. |
| `phase2a-env-inventory.json` | Record retained and retired environment consumers. |
| `phase2a-inventory.json` | Record complete module/migration/route/environment/worker map. |
| `phase2a-route-inventory.json` | Record pre-strip GitNexus route KEEP/DROP decisions. |
| `phase2a-tests.json` | Preserve full-suite machine-readable results. |
| `receipts.js` | Remove payout receipt issuance; retain signed academic receipts. |
| `review.js` | Remove candy minting and award responses; retain signed marks and feedback. |
| `rollup.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `scoring.js` | Remove PC row scoring. |
| `scripts/build-golden-fixture.mjs` | Remove PC diagnostic logging and stale economy comment. |
| `scripts/build-golden-synthetic.mjs` | Remove PC/trainer generators and config before documented regeneration. |
| `server.js` | Remove retired imports, mounts and production initialization; preserve injectable startup. |
| `teacher-auth.js` | Remove payout-agent authorization helpers; keep teacher auth. |
| `teacher.js` | Remove student poll archive endpoint. |
| `tests/class.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/exit-ticket-bonus.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/feature-strip.test.js` | Add retained v3 combiner, retired-source and school-year date regressions. |
| `tests/fixtures/golden-synthetic/expected.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/golden-synthetic/inputs.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/golden-synthetic/students.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/art-hashes.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2526-pc-v3.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-empty.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-env-schedule-override.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-frq_work.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-mixed.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-quiz_partial.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/pg-frq.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/golden-master.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-contexts.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-offline-inputs.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-sim.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/gradebook-grid.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/ledger.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/lesson-grade-v3.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/lesson-grade.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/m2b-grade-invariance.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/quarters-by-date.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/review-misconceptions.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/review.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/roster-archive.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/sy2627-due-and-early-bonus.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/teacher-endpoints.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tools/grade-model-emit-cases.mjs` | Remove poster track generation. |
| `tools/grade-sim-sweep.mjs` | Remove the poster-weight sweep setting. |

Also updated this root baseline section and wrote the required `state/cross-agent/52a62bbab12b.result.json`. Temporary implementation helpers and the accumulator were removed; they are not counted as pre-existing deleted files. The local GitNexus cache is tooling rather than application source.

### Deleted tests (23 files)

- `tests/bundle-parity.test.js`
- `tests/candy-return.test.js`
- `tests/derive-quarter-bands.test.js`
- `tests/doge-chain.test.js`
- `tests/doge-wallet.test.js`
- `tests/payout-conservation.test.js`
- `tests/payout-receipt.test.js`
- `tests/payout.test.js`
- `tests/pc-figures.test.js`
- `tests/pc-grade-wiring.test.js`
- `tests/pc-item-typing.test.js`
- `tests/pc.test.js`
- `tests/poll-archive.test.js`
- `tests/student-wallet-print.test.js`
- `tests/trainer-grade.test.js`
- `tests/trainer.test.js`
- `tests/wallet-conservation-pg.test.js`
- `tests/wallet-conservation.test.js`
- `tests/wallet-custody.test.js`
- `tests/wallet-proposals-pg.test.js`
- `tests/wallet-proposals.test.js`
- `tests/wallet-stakes-conservation.test.js`
- `tests/wallet-stakes-routes.test.js`

Removed cases/groups in mixed suites:

| File | Case/group |
| --- | --- |
| `tests/class.test.js` | surfaces per-student effort points → candy (DOGE wallet), matching the wallet |
| `tests/class.test.js` | adds a trainer summary from already-fetched ledger rows |
| `tests/teacher-endpoints.test.js` | GET /teacher/student/:studentId/poll-archive |
| `tests/roster-archive.test.js` | A2b: UNSCOPED /class/wallets excludes archived students (the payout worklist surface) |
| `tests/review.test.js` | awards candy only ONCE per student per day across multiple items, and an idempotent re-mark adds no candy |
| `tests/review.test.js` | migration 0025 candy_bonus (real plpgsql via pglite) |
| `tests/quarters-by-date.test.js` | lesson-schedule.json — SY26-27 date sanity |
| `tests/grade.test.js` | pcRawToP: piecewise linear, clamps, scales to 0 below p85 |
| `tests/sy2627-due-and-early-bonus.test.js` | PC track placed and dated by the event schedule (NEW units), not the old-unit band |
| `tests/sy2627-due-and-early-bonus.test.js` | loadEventScheduleWithPriority reads progressChecks/posters keyed by NEW units 1-5 from the bundled file |

### Deleted pending Phase 3

| File | Case/group |
| --- | --- |
| `tests/bundle-parity.test.js` | Entire AP content/band-dependent suite |
| `tests/derive-quarter-bands.test.js` | Entire AP content/band-dependent suite |
| `tests/grade-sim.test.js` | archetype: pc_ace_work_skipper is capped by the single-track ceiling (~70) |
| `tests/grade-sim.test.js` | archetype: work_grinder_pc_skipper is capped by the single-track ceiling (~70) |
| `tests/grade.test.js` | B = (1·W + 2·Q)/3, cap at 85, P only-raises via max |
| `tests/grade.test.js` | genuine master: minimal work, perfect PC → 100 (PC uncaps regardless) |
| `tests/grade.test.js` | strong worker, bad PC day → never punished (banked floor holds) |
| `tests/grade.test.js` | units[] UNCHANGED in shape and values after Phase 6 additions |
| `tests/gradebook-grid.test.js` | adds a Progress Check + Poster column per band unit |
| `tests/gradebook-grid.test.js` | Schoology total = category-weighted blend over present categories |
| `tests/lesson-grade-v3.test.js` | all four present → full weighted blend |
| `tests/lesson-grade-v3.test.js` | PC due + both tracks above floor → max-of-two |
| `tests/lesson-grade-v3.test.js` | PC-only gamer (high PC, no work) → 70% ceiling on the grade |
| `tests/lesson-grade-v3.test.js` | PC due but un-attempted engages the 70% single-track ceiling against strong work |
| `tests/lesson-grade-v3.test.js` | an out-of-range raw PC% is clamped so grade/ceiling never exceed 100 |
| `tests/lesson-grade.test.js` | PC-only data: P_quarter > 0 with nothing due → quarterGrade = P_quarter |
| `tests/sy2627-due-and-early-bonus.test.js` | event schedule reaches the production grade inputs |
| `tests/m2b-grade-invariance.test.js` | SY2526: PC ledger pins freeze (77 required, full config deep-equal, schedule 1.1 B) |
| `tests/grade-contexts.test.js` | answer key: empty map throws |
| `tests/grade-contexts.test.js` | blooket: 1 topic throws |
| `tests/grade-contexts.test.js` | schedule: empty lessons {} throws |
| `tests/grade-contexts.test.js` | structurally invalid blooket (1 topic) THROWS |
| `tests/exit-ticket-bonus.test.js` | strip exit tickets: all four SY2627 fixture public results remain byte-identical |
| `tests/golden-master.test.js` | detects an isolated v3Gates floor perturbation |
| `tests/golden-master.test.js` | detects an isolated v3Gates ceiling perturbation |
| `tests/lesson-grade.test.js` | PC + lessons: max(banked, P_quarter) preserves only-raises asymmetry |
| `tests/grade-offline-inputs.test.js` | redactPc (default) sentinels PC answers even when correct |
| `tests/lesson-grade.test.js` | U1-PC-Q3 → unit=1, lessonKey=null (PC is unit-scoped) |
| `tests/lesson-grade.test.js` | U1-PC-MCQ-A-Q01 → unit=1, lessonKey=null |

New `tests/feature-strip.test.js` checks the pure v3 two-track gates/fallback, retired-source grading with `useV3` off and on, and the required quarter boundaries. Existing generic ledger, receipts, roster, diagnostics and grade coverage remains.

### Stubs created

| File | Shape |
| --- | --- |
| `data/answer-key.json` | `{ generatedFrom: string, answerKey: {} }` |
| `data/answer-key.SY2627.json` | `{ generatedFrom: string, answerKey: {} }` |
| `data/skill-map.json` | `{}` |
| `data/blooket-lessons.json` | `{ topics: [], allTopics: [], requiredTopics: [], bonusTopics: [] }` |
| `data/blooket-lessons.sy2526-freeze.json` | `{ topics: [], allTopics: [], requiredTopics: [], bonusTopics: [] }` |
| `data/lesson-schedule.json` | `{ schemaVersion: 2, lessons: {} }` |
| `data/lesson-schedule.sy2526-freeze.json` | `{ schemaVersion: 2, lessons: {} }` |

### Verification and golden regeneration

- `cd roster-server && npx vitest run`: **70 files passed; 1,301 tests passed, 0 failed, 3 skipped (1,304 total)**. Exit 0; 37.30 seconds. JSON report: `phase2a-tests.json`.
- Root dry import with `NODE_ENV=test`, `PORT=0` and `node -e "require('./roster-server/server.js')"`: exit 0. Test mode suppresses DB setup/listening; production still requires Supabase.
- From `roster-server/`, ran `node scripts/build-golden-synthetic.mjs` (documented in `roster-server/docs/golden-master.md`): 16 synthetic students, 69 records; students.json, inputs.json and expected.json regenerated. Exit 0.
- From `roster-server/`, ran `UPDATE_M2B_GOLDEN=1 npx vitest run tests/m2b-grade-invariance.test.js` (documented in `roster-server/tests/m2b-grade-invariance.test.js header`): 4 tests passed; surviving m2b snapshots/artifact hashes regenerated. Exit 0.
- No golden JSON was hand-edited. node --check tools/grade-sim-sweep.mjs passed after removing its unused poster knob. Other changes after the full suite were comments, deployment exclusions and report artifacts.
- One earlier suite command accidentally used repository root and was canceled. Follow-up checks found no generated root source/data artifacts. The complete required roster-server suite subsequently passed.
- JSON aggregate numPassedTests includes skipped cases in this Vitest version; report counts come from assertionResults statuses and match the final CLI summary.

### Blocked on Phase 2b

None in the roster-server suite. Shared root/`lib/`/Desk changes and packaging remain Phase 2b work; no outside file needed modification to make this suite green.

### Impact analysis

Created a server-only GitNexus index with gitnexus analyze --skip-git --index-only. No git commands or commits. HIGH/CRITICAL risks were reported before edits to shared grading and app/route factories.

| Symbol | Risk | Direct callers | Affected processes |
| --- | --- | --- | --- |
| computeGrade | CRITICAL | 8 | 12 |
| computeQuarterV3 / computeLessonGrades | CRITICAL | 1 | 11 |
| createApp | CRITICAL | 2 | 5 |
| mountTeacherStudent / mountLedger / mountReview / mountClass / mountAdminRestore | HIGH | 1 | 4 |

191 original database/deleted-module functions were checked individually, alongside modified grade, route, crypto and generator helpers. Core impact includes class, teacher, review, transcript and grade HTTP flows. The simulator file lookup was unresolved (UNKNOWN); its only edit removed a top-level poster knob. No commit was made, so pre-commit detect_changes did not apply.

### Left in place / Phase 3 follow-up

- A2 categories are deferred. Static unit fallback bands, lesson/FRQ/quiz weights, early-bonus settings and supported grid category weights remain transitional. The required Phase 3 comment marks replacement of the category model.
- The generic v3 two-track engine and useV3 remain. No replacement mastery source was invented: computeQuarterV3 supplies null mastery and uses the tested Work-only fallback.
- Compatibility fields pcAvg/pcAvgRaw=null, pcDue=false and P_quarter=0, plus unused positional createApp/buildLessonsArray slots, remain for existing callers. They have no retired scoring or data loading behind them.
- KEEP modules still consume AP-derived frq-rubrics.SY2627.json, misconception maps/catalog/triage, teacher-question-catalog.json, worksheet-key.json and work-manifest.json. These need Phase 3 curriculum replacement; they are not empty stubs.
- Historical school-year support, frozen-fixture filenames (including sy2526-pc-v3.json), unused historical bundle-size constants and some simulator input labels/rows remain. Dedicated retired-feature tests are gone; remaining retired rows are inert or test rejection/ignoring.
- scripts/gen-blooket-lessons.mjs remains Blooket authoring tooling and still references AP roadmap/crosswalk inputs. Replace its inputs in Phase 3 before generating A2 decks; it is not a startup dependency.
- Guest-alias nudges and sprite hue remain teacher-feedback/identity features. They do not maintain classroom presence, poll, level or activity state.
- No database was created, migrated, purged or fabricated. Production still requires isolated Supabase configuration.
- GitNexus created a local roster-server/.gitnexus cache and registered the server-only index. This tooling cache is excluded from deployment and is not application source.

Quarter dates remain Q1 2026-09-02 to 2026-11-06; Q2 2026-11-09 to 2027-01-22; Q3 2027-01-25 to 2027-04-14; Q4 2027-04-15 to 2027-06-17. No A2 category model, git commits, Claude calls, live DB operations or deployment.

## Phase 2b  front-end strip

**Status: partial; not ready to mark Phase 2b complete.** Major deletions and front-end stripping are applied. The root suite is not green. No git commands, commits, Claude calls, server source changes or deployment.

Desk: **24831 ? 14879 lines**. Deleted 301 files (excluding four moves); edited 38 files; added 2 files.

### Deleted files by area

- **root: 32**  `activity-bridge.js`, `activity-colorbox-grid.js`, `activity-colorbox.js`, `activity-level.js`, `ap-stats-video-crosswalk.csv`, `button.png`, `calendar-linker.js`, `canvas_engine.js`, `classroom-board.js`, `coin_0.png`, `coin_1.png`, `coin_2.png`, `doge-keys.js`, `door_closed.png`, `door_open.png`, `gradebook-client-demo.html`, `key.png`, `ledger-gossip.js`, `nearby-transport.js`, `pico_sprite1.json`, `qr-fountain.js`, `qr-sync.js`, `roster-client-demo.html`, `sprite.png`, `sprite_sheet.js`, `teacher-classroom.html`, `teacher-guest-reconcile.html`, `ti84-plot.js`, `ti84-rom-wizard-fields.md`, `ti84-state-machine.js`, `ti84-verify.html`, `ti84_trainer.html`
- **css: 1**  `css/teacher-wallet-loading.css`
- **icons: 7**  `icons/calc.jpg`, `icons/formula.jpg`, `icons/icon-formulas.png`, `icons/icon-quiz.png`, `icons/icon-tetris.png`, `icons/icon-ti84.png`, `icons/quiz.jpg`
- **js: 6**  `js/student-wallet-print.js`, `js/student-wallet.js`, `js/teacher-wallet-loading.js`, `js/wallet-print-sheets.js`, `js/wallet-qr-scanner.js`, `js/wallet_logic.js`
- **scripts: 59**  `scripts/apply-ced2026-overlay.mjs`, `scripts/audit-feeder-ids.mjs`, `scripts/audit-question-context.mjs`, `scripts/audit-skill-tagging.mjs`, `scripts/build-android.mjs`, `scripts/build-answer-key.mjs`, `scripts/build-ced2026-label-data.mjs`, `scripts/build-frq-rubrics.mjs`, `scripts/build-lesson-schedule-sy2627.mjs`, `scripts/build-lesson-schedule.mjs`, `scripts/build-lessons-index.mjs`, `scripts/build-skill-map.mjs`, `scripts/build-summer-inserts.py`, `scripts/build-sy2627-schedule.mjs`, `scripts/build-teacher-question-catalog.mjs`, `scripts/build-ti84-template-samples.mjs`, `scripts/build-ti84-trainer.mjs`, `scripts/build-topic-schedule-sy2627.mjs`, `scripts/build-video-catalog.mjs`, `scripts/build-video-minutes-const.mjs`, `scripts/build-worksheet-key.mjs`, `scripts/compress-videos.mjs`, `scripts/disambiguate-skills.mjs`, `scripts/dn2b-wire-feeders.mjs`, `scripts/dok-self-paced.mjs`, `scripts/dok-video-free.mjs`, `scripts/fetch-offline-videos.mjs`, `scripts/fixtures/topic-schedule-sy2627.fixture.json`, `scripts/gitnexus-shadow.mjs`, `scripts/lineage-impact.mjs`, `scripts/render-lineage.mjs`, `scripts/smoke-trainer-ledger.mjs`, `scripts/supplement-probe-signal.mjs`, `scripts/ti84-trainer-runtime.js`, `scripts/ti84-trainer-styles.css`, `scripts/upload-r2.mjs`, `scripts/weekly-dok.mjs`, `scripts/whisper-transcribe.sh`, `scripts/wire-ai-worksheet-grade.mjs`, `scripts/wire-appeal-clamp.mjs`, `scripts/wire-blank-scores.mjs`, `scripts/wire-completion-tracker.mjs`, `scripts/wire-frq-graded-note.mjs`, `scripts/wire-frq-status-clarity.mjs`, `scripts/wire-hydration.mjs`, `scripts/wire-identity-clean.mjs`, `scripts/wire-ledger-heal.mjs`, `scripts/wire-offline-queue.mjs`, `scripts/wire-reflection-persistence.mjs`, `scripts/wire-remove-guest-offramp.mjs`, `scripts/wire-revise-hint.mjs`, `scripts/wire-roster-prefill.mjs`, `scripts/wire-signin-wall.mjs`, `scripts/wire-tango-theme.mjs`, `scripts/wire-ti84-practice-links.mjs`, `scripts/wire-verdict-parser.mjs`, `scripts/wire-verdict-prompt.mjs`, `scripts/wire-worksheet-script-paths.mjs`, `scripts/wire-worksheet-viewas.mjs`
- **tests: 142**  `tests/activity-bridge.test.js`, `tests/activity-colorbox-grid.test.js`, `tests/activity-colorbox.test.js`, `tests/activity-level.test.js`, `tests/answer-key.test.js`, `tests/audit-feeder-ids.test.js`, `tests/audit-script.test.js`, `tests/audit-skill-tagging.test.js`, `tests/avatar-popup-cockpit.test.js`, `tests/avatar-popup-inline-expansions.test.js`, `tests/broadcast-nudge-cockpit.test.js`, `tests/candy-poke.test.js`, `tests/canvas-engine-resume.test.js`, `tests/canvas-engine-scenes.test.js`, `tests/ced2026-desk-labels.test.js`, `tests/ced2026-surfaces.test.js`, `tests/classroom-board-activity.test.js`, `tests/classroom-board-choicepad.test.js`, `tests/classroom-board-gate.test.js`, `tests/classroom-board-level.test.js`, `tests/classroom-board-scroll.test.js`, `tests/classroom-board-shared-camera.test.js`, `tests/classroom-board-tally-chute.test.js`, `tests/classroom-board-tally-threshold.test.js`, `tests/classroom-board-terrain.test.js`, `tests/classroom-board-zone5.test.js`, `tests/classroom-board.test.js`, `tests/classroom-structure.test.js`, `tests/cockpit-activity.test.js`, `tests/cockpit-level.test.js`, `tests/cockpit-nudge-panel.test.js`, `tests/cockpit-select-students.test.js`, `tests/content-validation.test.js`, `tests/desk-activity-kbd.test.js`, `tests/desk-avatar-menu.test.js`, `tests/desk-b-work-days.test.js`, `tests/desk-calendar-ced2026-render.test.js`, `tests/desk-calendar-ced2026.test.js`, `tests/desk-doge-wallet.test.js`, `tests/desk-dok-ladder-row.test.js`, `tests/desk-e-pairing.test.js`, `tests/desk-level-integration.test.js`, `tests/desk-menu-sprite-hue.test.js`, `tests/desk-phase3-gossip.test.js`, `tests/desk-self-emote.test.js`, `tests/desk-student-wallet-onboarding.test.js`, `tests/desk-teacher-dok-app.test.js`, `tests/desk-ti84-skill-link.test.js`, `tests/desk-ti84-trainer-chip.test.js`, `tests/desk-verify-tools.test.js`, `tests/desk-video-availability.test.js`, `tests/desk-wallet-render.test.js`, `tests/desk-wallet-sessions-only.test.js`, `tests/desk-year-opener.test.js`, `tests/disambiguate-skills.test.js`, `tests/doge-keys.test.js`, `tests/doge-payout-agent.test.js`, `tests/doge-presence-submenu.test.js`, `tests/doge-send-core.test.js`, `tests/doge-send.test.js`, `tests/doge-wallet-gen.test.js`, `tests/doge-wallet-logic.test.js`, `tests/dok-self-paced.test.js`, `tests/dok-video-free.test.js`, `tests/fetch-offline-videos.test.js`, `tests/framework-parse.test.js`, `tests/frq-rubrics-bundle.test.js`, `tests/frq-status-clarity.test.js`, `tests/gitnexus-shadow.test.js`, `tests/gradebook-feeder-wiring.test.js`, `tests/ledger-gossip-lanes.test.js`, `tests/ledger-gossip.test.js`, `tests/level-editor-lint.test.js`, `tests/level-editor-sim.test.js`, `tests/level-editor.test.js`, `tests/lineage.test.js`, `tests/mesh-grade-loop-e2e.test.js`, `tests/mesh-robustness.test.js`, `tests/mesh-submission-verify.test.js`, `tests/mobile-home-quiz-resolve.test.js`, `tests/mobile-home-submissions.test.js`, `tests/nearby-transport.test.js`, `tests/offline-video.test.js`, `tests/p10-cockpit-polish.test.js`, `tests/phase5-structure.test.js`, `tests/poll-archive-cockpit.test.js`, `tests/poll-archive-desk.test.js`, `tests/qr-fountain.test.js`, `tests/qr-sync.test.js`, `tests/skill-map.test.js`, `tests/student-wallet-print.test.js`, `tests/student-wallet.test.js`, `tests/study-break-hardening.test.js`, `tests/study-break-improvements.test.js`, `tests/study-break-smoke.test.js`, `tests/study-break-stakes.test.js`, `tests/tango-theme.test.js`, `tests/teacher-dashboard-payout.test.js`, `tests/teacher-reward-disbursement.test.js`, `tests/teacher-student-console-dashboard-deeplink.test.js`, `tests/teacher-student-console-drawer.test.js`, `tests/teacher-student-console-nudges-pagination.test.js`, `tests/teacher-student-console-nudges.test.js`, `tests/teacher-student-console-remediation.test.js`, `tests/teacher-student-console-unlocks.test.js`, `tests/teacher-wallet-loading.test.js`, `tests/teacher-wallet-proposals.test.js`, `tests/test_dok_build.py`, `tests/ti84-autofill-fallback.test.js`, `tests/ti84-data-trust.test.js`, `tests/ti84-expected-accuracy.test.js`, `tests/ti84-leniency.test.js`, `tests/ti84-lesson-map-sync.test.js`, `tests/ti84-lesson-map.test.js`, `tests/ti84-list-transfer.test.js`, `tests/ti84-math-prb.test.js`, `tests/ti84-plot.test.js`, `tests/ti84-practice-links.test.js`, `tests/ti84-procedure-data-integrity.test.js`, `tests/ti84-property-check.test.js`, `tests/ti84-reference-values.json`, `tests/ti84-repeatable-steps.test.js`, `tests/ti84-serving.test.js`, `tests/ti84-skill-taxonomy.test.js`, `tests/ti84-standalone-sync.test.js`, `tests/ti84-state-machine.test.js`, `tests/ti84-student-state.test.js`, `tests/ti84-template-accuracy.test.js`, `tests/ti84-template-reference-values.json`, `tests/ti84-template-samples.json`, `tests/ti84-templates.property.test.js`, `tests/ti84-ui-scale.test.js`, `tests/ti84-worksheet-links.test.js`, `tests/v3-p3-webrtc.test.js`, `tests/v3-p4-doorways.test.js`, `tests/video-catalog.test.js`, `tests/video-minutes-const.test.js`, `tests/wallet-logic.test.js`, `tests/wallet-print-sheets.test.js`, `tests/wallet-qr-scanner.test.js`, `tests/weekly-dok-run.test.js`, `tests/weekly-dok-select.test.js`
- **ti84-trainer-v2: 35**  `ti84-trainer-v2/app.js`, `ti84-trainer-v2/bridge.js`, `ti84-trainer-v2/build.mjs`, `ti84-trainer-v2/CEMU_BUILD.md`, `ti84-trainer-v2/data-templates.js`, `ti84-trainer-v2/generated/data-patterns.js`, `ti84-trainer-v2/generated/data-procedures.js`, `ti84-trainer-v2/generated/state-machine.js`, `ti84-trainer-v2/index.html`, `ti84-trainer-v2/keypad-layout.json`, `ti84-trainer-v2/native/event-bus.js`, `ti84-trainer-v2/native/field-tables.js`, `ti84-trainer-v2/native/form-engine.js`, `ti84-trainer-v2/native/manifest.mjs`, `ti84-trainer-v2/native/menu-nav.js`, `ti84-trainer-v2/native/menu-tables.js`, `ti84-trainer-v2/native/result-formatter.js`, `ti84-trainer-v2/native/screen-renderer.js`, `ti84-trainer-v2/native/stat-math.js`, `ti84-trainer-v2/native/tests/form-engine.test.js`, `ti84-trainer-v2/native/tests/menu-nav.test.js`, `ti84-trainer-v2/native/tests/result-formatter.test.js`, `ti84-trainer-v2/native/tests/stat-math.test.js`, `ti84-trainer-v2/native/tests/ti84-native.test.js`, `ti84-trainer-v2/native/tests/verify-all-procedures.test.js`, `ti84-trainer-v2/native/ti84-native.js`, `ti84-trainer-v2/native/vitest.config.js`, `ti84-trainer-v2/README.md`, `ti84-trainer-v2/rom-config.js`, `ti84-trainer-v2/spike-harness.html`, `ti84-trainer-v2/standalone.html`, `ti84-trainer-v2/style.css`, `ti84-trainer-v2/wasm/README.md`, `ti84-trainer-v2/wasm/WebCEmu.js`, `ti84-trainer-v2/wasm/WebCEmu.wasm`
- **tools: 19**  `tools/doge-payout-agent.mjs`, `tools/doge-payout-agent.service`, `tools/doge-send.mjs`, `tools/doge-wallet-gen.mjs`, `tools/level-editor-lint.js`, `tools/level-editor-model.js`, `tools/level-editor-render.js`, `tools/level-editor-sim.js`, `tools/level-editor-ui.js`, `tools/level-editor.css`, `tools/level-editor.html`, `tools/payout-agent.config.example.json`, `tools/pico_park_atlas.png`, `tools/register_payout_agent_task.ps1`, `tools/register_weekly_dok.ps1`, `tools/sprite-regions.js`, `tools/ti84_template_reference.py`, `tools/weekly-dok-author-prompt.md`, `tools/weekly_dok.ps1`

### Moved history

- `TI84_TRAINER_SPIKE_RESULT.md` ? `docs/apstats-history/TI84_TRAINER_SPIKE_RESULT.md`
- `LEVEL_DESIGN_RECIPE.md` ? `docs/apstats-history/LEVEL_DESIGN_RECIPE.md`
- `student-host-matrix-and-quiz-packaging.md` ? `docs/apstats-history/student-host-matrix-and-quiz-packaging.md`
- `INCIDENT_2026-07-20_PROGRESS_RESET.md` ? `docs/apstats-history/INCIDENT_2026-07-20_PROGRESS_RESET.md`

### Edited files

- `.github/workflows/ci.yml`  Removed mesh wording from the retained receipt verification step.
- `ap_stats_roadmap_square_mode.html`  Removed major retired feature blocks, registry entries and UI; installed an empty Phase 4 lesson source; retained named receipt and worksheet helpers. Further stripping remains.
- `CLAUDE.md`  Removed retired app/tool/content entries while retaining the document structure.
- `grade-engine.bundle.js`  Regenerated from Phase 2a server modules after removing obsolete PC export names.
- `index.html`  Removed retired links/content; retained the surface for later copy replacement.
- `manifest.webmanifest`  Removed trainer from the application description.
- `mobile-home.html`  Removed video, quiz and mesh paths; retained native flashcards and an empty configurable Phase 4 lesson source.
- `package.json`  Removed commands invoking deleted scripts.
- `scripts/build-grade-engine.mjs`  Removed PC helper names deleted by Phase 2a from the export tables.
- `scripts/build-offline-pack.mjs`  Removed trainer/video/quiz packaging and filtered missing content from the shell inventory.
- `scripts/misconception-map-sources.mjs`  Stubbed rubric and external question input lists for Phase 4; existing committed maps retained.
- `scripts/smoke-student-host-matrix.mjs`  Removed dropped hosts and unavailable AP content probes.
- `start-here.html`  Removed retired links/content; retained the surface for later copy replacement.
- `sw.js`  Removed deleted files from CORE.
- `teacher-dashboard.html`  Removed economy, trainer and PC panels; restored student navigation/inbox handlers; removed wallet dependency from pacing; deferred DOK sheet inputs.
- `tests/ai-worksheet-grade.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-blooket-flashcards.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-donow-ledger.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-lesson-gate.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-modal-polish.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-nudge-toast.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-pacing-overview.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-persistent-teacher-chat.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-receipt-row.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/desk-view-as.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/frq-regrade-job.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/mobile-home-flashcards.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/no-guest-mode.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/remaining-feature-contracts.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/roster-prefill.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/study-guide.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/teacher-workspace.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/worksheet-answer-recovery.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `tests/worksheet-diagnostics.test.js`  Removed retired/AP corpus cases or repointed retained behavior tests to extracted runtime.
- `TOC.html`  Removed retired links/content; retained the surface for later copy replacement.
- `tsconfig.json`  Removed deleted ledger-gossip input.
- `vitest.config.js`  Removed retired path exclusions and retained root test discovery.
- `A2_FORK_BASELINE.md`  Recorded Phase 2b changes, limitations and validation.

### Added files

- `lib/worksheet-ai-grade.js`
- `lib/worksheet-hydration.js`

### Tests deleted

- `tests/activity-bridge.test.js`
- `tests/activity-colorbox-grid.test.js`
- `tests/activity-colorbox.test.js`
- `tests/activity-level.test.js`
- `tests/answer-key.test.js`
- `tests/audit-feeder-ids.test.js`
- `tests/audit-script.test.js`
- `tests/audit-skill-tagging.test.js`
- `tests/avatar-popup-cockpit.test.js`
- `tests/avatar-popup-inline-expansions.test.js`
- `tests/broadcast-nudge-cockpit.test.js`
- `tests/candy-poke.test.js`
- `tests/canvas-engine-resume.test.js`
- `tests/canvas-engine-scenes.test.js`
- `tests/ced2026-desk-labels.test.js`
- `tests/ced2026-surfaces.test.js`
- `tests/classroom-board-activity.test.js`
- `tests/classroom-board-choicepad.test.js`
- `tests/classroom-board-gate.test.js`
- `tests/classroom-board-level.test.js`
- `tests/classroom-board-scroll.test.js`
- `tests/classroom-board-shared-camera.test.js`
- `tests/classroom-board-tally-chute.test.js`
- `tests/classroom-board-tally-threshold.test.js`
- `tests/classroom-board-terrain.test.js`
- `tests/classroom-board-zone5.test.js`
- `tests/classroom-board.test.js`
- `tests/classroom-structure.test.js`
- `tests/cockpit-activity.test.js`
- `tests/cockpit-level.test.js`
- `tests/cockpit-nudge-panel.test.js`
- `tests/cockpit-select-students.test.js`
- `tests/content-validation.test.js`
- `tests/desk-activity-kbd.test.js`
- `tests/desk-avatar-menu.test.js`
- `tests/desk-b-work-days.test.js`
- `tests/desk-calendar-ced2026-render.test.js`
- `tests/desk-calendar-ced2026.test.js`
- `tests/desk-doge-wallet.test.js`
- `tests/desk-dok-ladder-row.test.js`
- `tests/desk-e-pairing.test.js`
- `tests/desk-level-integration.test.js`
- `tests/desk-menu-sprite-hue.test.js`
- `tests/desk-phase3-gossip.test.js`
- `tests/desk-self-emote.test.js`
- `tests/desk-student-wallet-onboarding.test.js`
- `tests/desk-teacher-dok-app.test.js`
- `tests/desk-ti84-skill-link.test.js`
- `tests/desk-ti84-trainer-chip.test.js`
- `tests/desk-verify-tools.test.js`
- `tests/desk-video-availability.test.js`
- `tests/desk-wallet-render.test.js`
- `tests/desk-wallet-sessions-only.test.js`
- `tests/desk-year-opener.test.js`
- `tests/disambiguate-skills.test.js`
- `tests/doge-keys.test.js`
- `tests/doge-payout-agent.test.js`
- `tests/doge-presence-submenu.test.js`
- `tests/doge-send-core.test.js`
- `tests/doge-send.test.js`
- `tests/doge-wallet-gen.test.js`
- `tests/doge-wallet-logic.test.js`
- `tests/dok-self-paced.test.js`
- `tests/dok-video-free.test.js`
- `tests/fetch-offline-videos.test.js`
- `tests/framework-parse.test.js`
- `tests/frq-rubrics-bundle.test.js`
- `tests/frq-status-clarity.test.js`
- `tests/gitnexus-shadow.test.js`
- `tests/gradebook-feeder-wiring.test.js`
- `tests/ledger-gossip-lanes.test.js`
- `tests/ledger-gossip.test.js`
- `tests/level-editor-lint.test.js`
- `tests/level-editor-sim.test.js`
- `tests/level-editor.test.js`
- `tests/lineage.test.js`
- `tests/mesh-grade-loop-e2e.test.js`
- `tests/mesh-robustness.test.js`
- `tests/mesh-submission-verify.test.js`
- `tests/mobile-home-quiz-resolve.test.js`
- `tests/mobile-home-submissions.test.js`
- `tests/nearby-transport.test.js`
- `tests/offline-video.test.js`
- `tests/p10-cockpit-polish.test.js`
- `tests/phase5-structure.test.js`
- `tests/poll-archive-cockpit.test.js`
- `tests/poll-archive-desk.test.js`
- `tests/qr-fountain.test.js`
- `tests/qr-sync.test.js`
- `tests/skill-map.test.js`
- `tests/student-wallet-print.test.js`
- `tests/student-wallet.test.js`
- `tests/study-break-hardening.test.js`
- `tests/study-break-improvements.test.js`
- `tests/study-break-smoke.test.js`
- `tests/study-break-stakes.test.js`
- `tests/tango-theme.test.js`
- `tests/teacher-dashboard-payout.test.js`
- `tests/teacher-reward-disbursement.test.js`
- `tests/teacher-student-console-dashboard-deeplink.test.js`
- `tests/teacher-student-console-drawer.test.js`
- `tests/teacher-student-console-nudges-pagination.test.js`
- `tests/teacher-student-console-nudges.test.js`
- `tests/teacher-student-console-remediation.test.js`
- `tests/teacher-student-console-unlocks.test.js`
- `tests/teacher-wallet-loading.test.js`
- `tests/teacher-wallet-proposals.test.js`
- `tests/test_dok_build.py`
- `tests/ti84-autofill-fallback.test.js`
- `tests/ti84-data-trust.test.js`
- `tests/ti84-expected-accuracy.test.js`
- `tests/ti84-leniency.test.js`
- `tests/ti84-lesson-map-sync.test.js`
- `tests/ti84-lesson-map.test.js`
- `tests/ti84-list-transfer.test.js`
- `tests/ti84-math-prb.test.js`
- `tests/ti84-plot.test.js`
- `tests/ti84-practice-links.test.js`
- `tests/ti84-procedure-data-integrity.test.js`
- `tests/ti84-property-check.test.js`
- `tests/ti84-reference-values.json`
- `tests/ti84-repeatable-steps.test.js`
- `tests/ti84-serving.test.js`
- `tests/ti84-skill-taxonomy.test.js`
- `tests/ti84-standalone-sync.test.js`
- `tests/ti84-state-machine.test.js`
- `tests/ti84-student-state.test.js`
- `tests/ti84-template-accuracy.test.js`
- `tests/ti84-template-reference-values.json`
- `tests/ti84-template-samples.json`
- `tests/ti84-templates.property.test.js`
- `tests/ti84-ui-scale.test.js`
- `tests/ti84-worksheet-links.test.js`
- `tests/v3-p3-webrtc.test.js`
- `tests/v3-p4-doorways.test.js`
- `tests/video-catalog.test.js`
- `tests/video-minutes-const.test.js`
- `tests/wallet-logic.test.js`
- `tests/wallet-print-sheets.test.js`
- `tests/wallet-qr-scanner.test.js`
- `tests/weekly-dok-run.test.js`
- `tests/weekly-dok-select.test.js`
- `ti84-trainer-v2/native/tests/form-engine.test.js`
- `ti84-trainer-v2/native/tests/menu-nav.test.js`
- `ti84-trainer-v2/native/tests/result-formatter.test.js`
- `ti84-trainer-v2/native/tests/stat-math.test.js`
- `ti84-trainer-v2/native/tests/ti84-native.test.js`
- `ti84-trainer-v2/native/tests/verify-all-procedures.test.js`

### Deleted pending Phase 3

- `tests/content-validation.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1
- `tests/desk-b-work-days.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1
- `tests/desk-e-pairing.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1
- `tests/desk-year-opener.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1
- `tests/framework-parse.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1
- `tests/gradebook-feeder-wiring.test.js`  Deleted pending Phase 3: AP curriculum corpus removed in Phase 1

Individual retired/AP-corpus cases removed from mixed suites:

- `tests/desk-blooket-flashcards.test.js`  43: data/blooket-difficulty.json exists with valid schema + per-file tags
- `tests/desk-blooket-flashcards.test.js`  44: no CSV is tagged all-one-difficulty (lazy-tagging guard)
- `tests/desk-donow-ledger.test.js`  folds the score breakdown · vs Schoology into the My Ledger window
- `tests/desk-lesson-gate.test.js`  07: video renders a visited tag, never a Done button
- `tests/desk-modal-polish.test.js`  pin 09: AI-tutor buttons (Phase 5/5.1) still render in showResourcePanel
- `tests/desk-nudge-toast.test.js`  ClassroomBoard.mount call includes onClassroomMessage hook for teacher nudge
- `tests/desk-persistent-teacher-chat.test.js`  DogePresence.handleMessage routes nudge_notify to _onNudgeNotify
- `tests/desk-persistent-teacher-chat.test.js`  is teacher-gated in the avatar and DogePresence menus
- `tests/desk-receipt-row.test.js`  keeps the per-session inline QR (_walletShowSessionQR + shared helpers)
- `tests/desk-view-as.test.js`  _fetchPollArchive is routed through _maybeViewAsFetch
- `tests/desk-view-as.test.js`  _fetchPollArchive fallback constructs /poll-archive with Bearer header
- `tests/frq-regrade-job.test.js`  FRQ regrade manifest
- `tests/no-guest-mode.test.js`  Desk — presence never surfaces a guest
- `tests/no-guest-mode.test.js`  worksheets — all 69 require a roster session (off-ramp removed)
- `tests/roster-prefill.test.js`  every u*_lesson*_live.html includes <script src="roster-prefill.js"></script>
- `tests/worksheet-answer-recovery.test.js`  protects edited fields in all 69 worksheet hydration functions
- `tests/worksheet-diagnostics.test.js`  wires diagnostics into all 69 worksheets and stamps its actual running build
- `tests/remaining-feature-contracts.test.js`  index links TOC.html and TOC lists all 69 live worksheet files that exist on disk
- `tests/study-guide.test.js`  ai-grading-prompts-study-guide.js — v2 exports
- `tests/study-guide.test.js`  FRQ template uses the AP rubric vocabulary
- `tests/study-guide.test.js`  FRQ template documents the JSON response schema keys
- `tests/study-guide.test.js`  ai-grading-prompts-study-guide.js — prompt template structure
- `tests/study-guide.test.js`  ai-grading-prompts-study-guide.js
- `tests/study-guide.test.js`  prompt builder renders the mastery block when a snapshot is provided
- `tests/study-guide.test.js`  prompt builder exposes official scoring and solution checkpoint helpers
- `tests/study-guide.test.js`  prompt builder handles both solution.scoring and top-level scoring shapes

### Check findings

- calendar.html is a 16-line redirect to the retained Desk: kept. calendar-linker.js only injected AP schedule-page links: deleted.
- teacher-offline-import.html imports plain ledger JSON through /ledger/import: kept. teacher-guest-reconcile.html was mesh reconciliation: deleted.
- roster-client-demo.html and gradebook-client-demo.html had no surviving test references: deleted.
- js/ced2026-crosswalk.js and js/ced2026-labels.js remain imported by Desk/mobile: kept for Phase 3.
- lib/ retained, including study-guide/BKT/flashcard runtime. No additional trainer-only lib module was identified for deletion.
- tools/mirror-ledger.yml is a private server snapshot backup workflow template, not mesh transport: kept.
- scripts/build-frq-rubrics.mjs reads deleted grading-prompt modules: deleted.
- build-work-manifest*.mjs feed retained grading data: kept along with work-manifest fixtures. Their AP inputs are still missing and their regression tests remain unresolved.
- misconception-map-sources.mjs depended on deleted prompt modules and sibling curriculum_render: retained with empty loadRubrics/loadQuestions lists. Builders remain; --check currently fails against retained AP maps. Do not regenerate over teacher-authored maps without curriculum replacement.
- Schoology Python/CDP tooling, backup/ledger verification/regrade tooling, Blooket import, scripts/lib and tools/lib retained. The explicit tools/lib keep rule includes two dormant doge helper modules.
- Deleted the AP topic-schedule fixture; retained work-manifest fixtures. Removed dedicated trainer/formula/quiz/Tetris image assets.
- AGENTS.md already contained only GitNexus and code-style rules; no feature-specific sections needed removal.
- offline.html had no additional retired links after prior changes; it remains unchanged.
- Four historical root documents were moved into docs/apstats-history/ rather than discarded.

### Needs roster-server follow-up

- lib/flashcard-sync.js still uses /trainer/state/flashcards-v1 for cross-device SRS persistence. Phase 2a removed trainer routes. Provide a retained flashcard-state endpoint and repoint the client; local quick/timed/SRS runtime remains.
- Server grade/work-manifest/misconception inputs remain AP-derived by the Phase 2a contract. Coordinate A2 fixture/data replacement in Phase 3/4; no server source was edited.
- Review /donow next-task output with the front-end strip so retained task suggestions do not target the removed external quiz/trainer apps.

### Unsure / remaining work

- This is a partial implementation, not a completed or green Phase 2b. The remaining failures below were not hidden or skipped.
- Desk still contains legacy _wallet-prefixed receipt helpers retained for receipt behavior and brace-matched tests, some dead wallet/presence hooks, PC baseline/grade coaching copy and inactive special-tile code. A further targeted strip is required.
- Some receipt verification/print links still point to curriculum_render/verify.html. A local retained verifier destination is needed before removing that last external receipt dependency.
- Teacher gradebook/reconciliation still has some PC/poster compatibility field/copy references; complete the UI cleanup without changing surviving grade math.
- Desk schedule helpers still contain AP video-duration pairing data and historical calendar definitions despite the empty lesson source. Remove this scheduling dependency when separating retained calendar behavior from AP pacing tests.
- The diagnostic study-guide runtime and AP procedure/data examples were kept as requested for Phase 4. Missing prompt/procedure source references still require that repointing.
- Several retained journeys still read removed roadmap/deck fixtures. Replace those dependencies with synthetic lesson/deck fixtures while retaining identity isolation, grading boundaries, offline recovery and SRS assertions.
- Progress reset/gating failures remain unresolved; do not weaken those assertions merely to obtain green tests.
- Pacing now computes due/completed status without wallet logic; the former wallet-dependent grace/rest color nuance needs review if it is required for the retained teacher pacing surface.
- tools/lib/doge-keys.mjs and doge-send-core.mjs remain because tools/lib was explicitly marked KEEP. Confirm whether dormant economy helpers should be pruned separately.
- Legacy AP nomenclature, grade model copy and some outdated documentation references remain for Phase 3. Some remaining tests pin that copy; they are retained and listed rather than broadly deleted.
- New worksheet runtime files preserve executable grading/hydration behavior from the deleted worksheet generator/template. Phase 4 lesson authoring must load them and provide the worksheet-specific globals.

### Verification and final suite counts

Root suite exit 1: 2633 passed, 55 failed, 40 skipped assertions; 125/160 files passed, 35 files failed (including collection failures). Full machine-readable report: `state/cross-agent/phase2b-tests-final.json`. Desk boot is clean. Offline-pack and host-matrix scripts pass syntax checks. The final focused teacher workspace/pacing check passes. SHA-256 comparison found 0 roster-server changes.

GitNexus upstream checks covered 1,027 named inline symbols; inline HTML matches were mostly UNKNOWN, not a reliable low-risk guarantee. LOW indexed matches and the same-name HIGH server match were reported. Full impact audit: `state/cross-agent/phase2b-inline-impact.json`.

Remaining failures (all root-owned test files; server follow-up separately above):

- `tests/build-offline-pack.test.js`
  -  build (real, into a temp dir) assembles a personalized pack with injected config and the launcher  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\state\_pack_test\u3_lesson6-7_live.html'
- `tests/calendar-cohesion.test.js`
  -  Item 1 -- legend decodes overlay states (not just unit colors) the key labels every overlay signal  expected 'function updateLegend(def){\n  const …' to contain 'Progress Check'
  -  Item 1 -- legend decodes overlay states (not just unit colors) swatches reuse the LIVE cell classes so the key cannot drift from the CSS  expected 'function updateLegend(def){\n  const …' to match /legend-st cell-pc/
  -  Item 2 -- cells are keyboard-focusable + activatable a classic-Mac dotted :focus-visible ring exists, with a light variant for dark cells  expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to match /\.cell-pc:hover[^{}]*\{[^}]*outline-c…/
  -  Item 3 -- aria-label + screen-reader live region cellAria -- sentinels, lessons, PCs, and due dates render as flat text  expected 'Sep 1. Lesson' to contain 'Unit 1 Progress Check 1 of 2'
  -  Item 3 -- aria-label + screen-reader live region cellAria -- the remaining branches (post / poster / baseline / review / double-topic)  expected 'Nov 1. Lesson' to contain 'Unit 4 Poster gallery walk'
- `tests/desk-gating-fixes.test.js`
  -  app desktop icons: PNG xor emoji (no duplicate) every current app-icon template carries data-emoji + an onload→has-png img (no inline emoji text)  expected 1 to be greater than or equal to 2
- `tests/desk-grade-checkin.test.js`  collection: not found: SY2627_PACING_B
- `tests/desk-roster-signin.test.js`
  -  DN2c — shared roster client is loaded both roster scripts load before the main inline app <script>  expected -1 to be greater than -1
  -  TR2 — renderDoNow self-gates on mustChangePassword (static) init runs the force gate before renderDoNow()  expected -1 to be greater than -1
- `tests/desk-self-signup.test.js`
  -  teacher onboarding + class gradebook (static) the Teacher menu opens the Teacher Tools launcher, which wires the Roster Console  expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to contain 'window.open(\'teacher-roster-console.…'
- `tests/desk-user-role.test.js`
  -  Desk: user-role gating + sign-in teacher checkbox 12: Teacher Tools launcher reaches the teacher pages (roster console, dashboard, codegen)  expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to match /window\.open\s*\(\s*['"]teacher-roste…/
- `tests/grade-clarity.test.js`
  -  start-here.html — v3 two-track grade explanation explains the two-track higher-of-two model with the 40% floor / 70% cap  expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to match /40% on each/i
  -  start-here.html — v3 two-track grade explanation states the Schoology relationship (same number, live, a step ahead)  expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to match /posts to Schoology/i
- `tests/misconception-maps.test.js`
  -  draft misconception maps enumerates every rubric element with no extra source keys  expected [ 'WS-U1L10-reflect1', …(211) ] to deeply equal []
  -  draft misconception maps enumerates all 354 MCQs and only their wrong letters  expected [] to have a length of 354 but got +0
  -  draft misconception maps checks the rubric builder without changing the map  Command failed: C:\Program Files\nodejs\node.exe scripts/build-misconception-rubric-map.mjs --check file:///C:/Users/rober/Downloads/Projects/algebra2-live-worksheet/scripts/misconception-map-sources.mjs:41
     if (!isDeepStrictEqual(doc, previous)) throw new Error(`${filename} is stale; regenerate and review source changes`);
                    
  -  draft misconception maps checks the distractor builder without changing the map  Command failed: C:\Program Files\nodejs\node.exe scripts/build-misconception-distractor-map.mjs --check file:///C:/Users/rober/Downloads/Projects/algebra2-live-worksheet/scripts/misconception-map-sources.mjs:41
     if (!isDeepStrictEqual(doc, previous)) throw new Error(`${filename} is stale; regenerate and review source changes`);
                
- `tests/mobile-home-fc-csv-fallback.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\blooket-topic-csv.json'
- `tests/offline-pack-flashcards.test.js`
  -  offline pack flashcard assets ships flashcards.js as a root file  expected 'const ROOT_FILES = [\n  "index.html",…' to contain '\'flashcards.js\''
- `tests/phase4-structure.test.js`
  -  teacher-dashboard.html — Phase 4a structure teacher-secret persistence is OPT-IN only; localStorage writes are scoped to two known keys  localStorage.setItem(_, ...) targets an unknown key — only URL_KEY, SECRET_KEY, and GLOBAL_OVERRIDE_KEY are allowed: expected false to be true // Object.is equality
  -  start-here.html — Phase 4a student render every pre-existing section header and key copy stays present (additive-scope guard)  existing marker "ti84-trainer-v2/standalone.html" must remain present: expected '<!DOCTYPE html>\n<html lang="en">\n<h…' to contain 'ti84-trainer-v2/standalone.html'
- `tests/phase4b-structure.test.js`
  -  Phase 4b — teacher-dashboard.html remediation panel teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19)  unexpected setItem key: _: expected false to be true // Object.is equality
- `tests/progress-reset-matrix-cleared-storage.test.js`
  -  matrix row: cleared storage recovers — CONTROL (a subsequent live success) (7) flips to available, writes the latch, and the strict gate resumes  expected true to be false // Object.is equality
- `tests/progress-reset-matrix-latch.test.js`
  -  matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED D4 fail-open never leaks into the affirmative-server case  expected true to be false // Object.is equality
- `tests/progress-reset-matrix-loadstate.test.js`
  -  matrix row: 401 -> auth classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session  expected false to be true // Object.is equality
  -  matrix row: 403 -> auth (classified identically to 401) classifies unavailable/auth  expected '' to match /sign-in needs a refresh/i
- `tests/pwa.test.js`
  -  sw.js contracts pre-caches the mobile flashcard shell and supporting data  expected 'const CORE = [\n  "./",\n  "ap_stats_…' to contain '\'flashcards.js\''
- `tests/remaining-feature-contracts.test.js`
  -  F004 Start Here signed-in progress preview renders the signed-out fallback when identity or service config is unavailable  could not find Start Here progress script
  -  F004 Start Here signed-in progress preview fetches /grade with rosterClient.token() and renders quarter/unit progress for signed-in students  could not find Start Here progress script
  -  F062 external Formula Lab link (W2 / G3) primary card opens Formula Lab; Defense is secondary legacy review  expected null not to be null
- `tests/roadmap-resilience.test.js`
  -  roadmap network resilience loadRegistry uses saved data before live refresh and reports fallback state  expected 'async function loadRegistry() {\n  RE…' to match /_readRoadmapCache\(ROADMAP_REGISTRY_C…/
  -  roadmap network resilience loadSupabaseOverlay accepts partial results and saves the overlay cache  expected 'async function loadSupabaseOverlay(pe…' to match /Promise\.allSettled/
  -  roadmap UI clarity and performance live roster fetches keep the raw-fetch fallback for isolated tests  not found: _fetchPollArchive
- `tests/smoke-student-host-matrix.test.js`
  -  student host matrix — flashcard assets (static) checks flashcards.js and a representative deck on GH Pages  expected '#!/usr/bin/env node\n/**\n * smoke-st…' to match /host: 'GH_Pages_Desk', resource: 'fla…/
  -  student host matrix — flashcard assets (static) checks flashcards.js and a representative deck on the Vercel mirror  expected '#!/usr/bin/env node\n/**\n * smoke-st…' to match /host: 'Vercel_Mirr…/u1_l1_blooket\.csv`
- `tests/study-guide.test.js`
  -  session 89 two-proportion calculator walkthroughs adds two-proportion wizard and result screens to ti84-procedures-data.json  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-procedures-data.json'
  -  session 89 two-proportion calculator walkthroughs two-propztest records the 6-key test flow with both samples and an alternative row  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-procedures-data.json'
  -  session 89 two-proportion calculator walkthroughs two-propzint records the ALPHA + B interval flow with confidence level entry  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-procedures-data.json'
  -  session 89 two-proportion calculator walkthroughs DAG wiring includes the new unit 6 procedure nodes and prerequisites  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\ti84-procedures-data.json'
- `tests/teacher-auth-desk.test.js`
  -  WI-5f: teacher-classroom.html currentRole reads from rosterClient teacher-classroom.html file loads  expected null to be type of 'string'
  -  WI-5f: teacher-classroom.html currentRole reads from rosterClient currentRole reads rosterClient.current() instead of localStorage  function not found: currentRole
  -  WI-5f: teacher-classroom.html currentRole reads from rosterClient currentRole returns null when rosterClient is unavailable (safe fallback)  function not found: currentRole
- `tests/teacher-dashboard-misconceptions.test.js`
  -  teacher misconception panel lists all active remediation sheets from the DOK manifest with student/board/teacher links (textContent only)  expected 'async function loadRemediationSheets(…' to contain 'fetch(\'dok/manifest.json\''
  -  renders all manifest sheets and target labels safely, and hides an empty strip  ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\dok\manifest.json'
  -  uses vocabulary label text for tagged remediation targets without interpreting markup  expected '' to contain 'Targets: <b>Compare percentages</b>; …'
- `tests/teacher-gradebook.test.js`
  -  teacher-dashboard in-app gradebook grid renders a student row with cells and both totals  expected 7 to be 9 // Object.is equality
  -  teacher-dashboard in-app gradebook grid groups columns by Schoology category in the header (structural 1:1, incl. empty Posters)  expected 'Lesson 15% | Quizzes 15% | Blooket 5%' to contain 'Progress Check 50%'
- `tests/work-manifest-ced-regression.test.js`
  -  W-reg CED deploy reproduces both live copies (d) --deploy to a temp root yields byte-identical live JSON matching both live files  node:fs:441
     return binding.readFileUtf8(path, stringToFlags(options.flag));
                    ^
 
 Error: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\2026-crosswalk.json'
     at readFileSync (node:fs:441:20)
     at file:///C:/Users/rober/Downloads/Projects/algebra2-live-worksheet/scrip
- `tests/work-manifest.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\data\skill-map.json'
- `tests/journeys/harness.smoke.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\roadmap-data.json'
- `tests/journeys/j2-shared-device.journey.test.js`
  -  Desk journey J2 J2 reloads a shared device across A → B → A without leaking marks, due chip, or SRS state, then hydrates a fresh marks bucket from /donow (supersedes desk-calendar-sync per-student visibility and selfDone hydration behavior)  expected undefined to be 'Review due (1)' // Object.is equality
- `tests/journeys/j3-worksheet-done.journey.test.js`
  -  Desk journey J3 J3 keeps worksheet Done disabled at the 59% lower boundary  calendar has no 1.1 tile: expected undefined to be truthy
  -  Desk journey J3 J3 worksheet Done is disabled at 59% but at 60% posts one exact WS-…-DESK_DONE payload and updates the tile (supersedes desk-calendar-sync 60% gate pin)  Cannot read properties of undefined (reading 'classList')
- `tests/journeys/j4-quick-check.journey.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'
- `tests/journeys/j5-timed-deck.journey.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'
- `tests/journeys/j6-review-mode.journey.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'
- `tests/journeys/j7-offline-grade.journey.test.js`
  -  Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab 'network' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)  live /grade did not render the exact incident progress label after 1000 ms
  -  Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '401' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)  live /grade did not render the exact incident progress label after 1000 ms
  -  Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '403' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)  live /grade did not render the exact incident progress label after 1000 ms
  -  Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '500' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)  live /grade did not render the exact incident progress label after 1000 ms
- `tests/journeys/j8-view-as.journey.test.js`
  -  Desk journey J8 J8 production teacher view-as is read-only for entry, lifecycle sync, worksheet Done, flashcards/review, passport, and every apstats_* local key  1.1 tile did not render for view-as after 1000 ms
- `tests/journeys/j9-flashcard-sync.journey.test.js`  collection: ENOENT: no such file or directory, open 'C:\Users\rober\Downloads\Projects\algebra2-live-worksheet\u1_l1_blooket.csv'

The complete per-test errors, inventory and uncertainties are also in `state/cross-agent/9ce57f7f4f72.result.json`.

## Phase 2c — strip completion

Completed 2026-09-13. Defined green: every surviving non-baseline root test passes; only the ten named Phase 0 failures remain. The server suite is green. No git commands, commits, Claude calls, deployment or live database operations.

Desk: 14,879 → **14,569 lines**. Removed retired wallet/presence hooks, historical AP schedules/video pairing, inactive special tiles and external cards. Preserved extracted receipt helpers and generic calendar/grade runtime. Restored Teacher Tools navigation, roster boot/password gate, registry/cache resilience and offline assets.

### Final suite counts

Counts use testResults file statuses and assertionResults statuses (not Vitest's aggregate suite counters).

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped | Pending |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 159 | 153 | 6 | 2682 | 10 | 13 | 0 |
| roster-server | 72 | 72 | 0 | 1307 | 0 | 3 | 0 |

Root command: `npx vitest run --reporter=json --outputFile=state/cross-agent/phase2c-root-final.json` (exit 1, expected baseline failures). Server command: `cd roster-server; npx vitest run --reporter=json --outputFile=../state/cross-agent/phase2c-server-final.json` (exit 0). Root worker concurrency is capped at four so full-DOM reboot journeys retain their original deadlines without host CPU contention. New verifier tests use real Ed25519 signatures; new server tests exercise HTTP and actual Postgres queries.

### Four-bucket triage

Every one of the 55 named failures and every collection-failure file in Phase 2b has exactly one bucket below. Explicit FIX instructions take precedence for the teacher launcher, harness and J2 even though those also appeared in Phase 0. J8 is FIX because it guards surviving view-as isolation.

| Test | Bucket | Action |
| --- | --- | --- |
| tests/build-offline-pack.test.js — build (real, into a temp dir) assembles a personalized pack with injected config and the launcher | FIX | Ship flashcards/mobile/verifier assets; build a synthetic worksheet pack with --source; retain config injection and secret-exclusion checks. |
| tests/calendar-cohesion.test.js — Item 1 -- legend decodes overlay states (not just unit colors) the key labels every overlay signal | PHASE 3 | Delete PC/poster legend, special-cell styling and aria cases; Phase 3 must pin A2 equivalents. |
| tests/calendar-cohesion.test.js — Item 1 -- legend decodes overlay states (not just unit colors) swatches reuse the LIVE cell classes so the key cannot drift from the CSS | PHASE 3 | Delete PC/poster legend, special-cell styling and aria cases; Phase 3 must pin A2 equivalents. |
| tests/calendar-cohesion.test.js — Item 2 -- cells are keyboard-focusable + activatable a classic-Mac dotted :focus-visible ring exists, with a light variant for dark cells | PHASE 3 | Delete PC/poster legend, special-cell styling and aria cases; Phase 3 must pin A2 equivalents. |
| tests/calendar-cohesion.test.js — Item 3 -- aria-label + screen-reader live region cellAria -- sentinels, lessons, PCs, and due dates render as flat text | PHASE 3 | Delete PC/poster legend, special-cell styling and aria cases; Phase 3 must pin A2 equivalents. |
| tests/calendar-cohesion.test.js — Item 3 -- aria-label + screen-reader live region cellAria -- the remaining branches (post / poster / baseline / review / double-topic) | PHASE 3 | Delete PC/poster legend, special-cell styling and aria cases; Phase 3 must pin A2 equivalents. |
| tests/desk-gating-fixes.test.js — app desktop icons: PNG xor emoji (no duplicate) every current app-icon template carries data-emoji + an onload→has-png img (no inline emoji text) | FIX | Expose retained receipts/progress icons with data-emoji and image onload fallback contract. |
| tests/desk-grade-checkin.test.js — [collection failure] | PHASE 3 | Delete file extracting removed SY2627_PACING_B and AP grade-checkin dates. |
| tests/desk-roster-signin.test.js — DN2c — shared roster client is loaded both roster scripts load before the main inline app <script> | FIX | Restore registry marker and roster script ordering; force password-change gate before renderDoNow. |
| tests/desk-roster-signin.test.js — TR2 — renderDoNow self-gates on mustChangePassword (static) init runs the force gate before renderDoNow() | FIX | Restore registry marker and roster script ordering; force password-change gate before renderDoNow. |
| tests/desk-self-signup.test.js — teacher onboarding + class gradebook (static) the Teacher menu opens the Teacher Tools launcher, which wires the Roster Console | FIX | Restore guarded Teacher Tools links to roster console, dashboard and codegen. |
| tests/desk-user-role.test.js — Desk: user-role gating + sign-in teacher checkbox 12: Teacher Tools launcher reaches the teacher pages (roster console, dashboard, codegen) | FIX | Restore guarded Teacher Tools links to roster console, dashboard and codegen. |
| tests/grade-clarity.test.js — start-here.html — v3 two-track grade explanation explains the two-track higher-of-two model with the 40% floor / 70% cap | PHASE 3 | Delete start-here v3/AP grade copy assertions; retain runtime grade checks. |
| tests/grade-clarity.test.js — start-here.html — v3 two-track grade explanation states the Schoology relationship (same number, live, a step ahead) | PHASE 3 | Delete start-here v3/AP grade copy assertions; retain runtime grade checks. |
| tests/misconception-maps.test.js — draft misconception maps enumerates every rubric element with no extra source keys | FIXTURE | Use one synthetic rubric/MCQ, real vocabulary and isolated source root; retain wrong-letter, key, dual-copy and non-mutating builder checks. |
| tests/misconception-maps.test.js — draft misconception maps enumerates all 354 MCQs and only their wrong letters | FIXTURE | Use one synthetic rubric/MCQ, real vocabulary and isolated source root; retain wrong-letter, key, dual-copy and non-mutating builder checks. |
| tests/misconception-maps.test.js — draft misconception maps checks the rubric builder without changing the map | FIXTURE | Use one synthetic rubric/MCQ, real vocabulary and isolated source root; retain wrong-letter, key, dual-copy and non-mutating builder checks. |
| tests/misconception-maps.test.js — draft misconception maps checks the distractor builder without changing the map | FIXTURE | Use one synthetic rubric/MCQ, real vocabulary and isolated source root; retain wrong-letter, key, dual-copy and non-mutating builder checks. |
| tests/mobile-home-fc-csv-fallback.test.js — [collection failure] | FIXTURE | Synthetic topic map, split/combined deck aliases and required/bonus metadata; retain fallback resolution and existence checks. |
| tests/offline-pack-flashcards.test.js — offline pack flashcard assets ships flashcards.js as a root file | FIX | Restore root-file string contract; flashcards.js and mobile shell actually ship. |
| tests/phase4-structure.test.js — teacher-dashboard.html — Phase 4a structure teacher-secret persistence is OPT-IN only; localStorage writes are scoped to two known keys | PRE-EXISTING | Leave Phase 0 teacher-secret persistence assertion unchanged. |
| tests/phase4-structure.test.js — start-here.html — Phase 4a student render every pre-existing section header and key copy stays present (additive-scope guard) | PHASE 3 | Delete start-here additive AP copy guard. |
| tests/phase4b-structure.test.js — Phase 4b — teacher-dashboard.html remediation panel teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19) | PRE-EXISTING | Leave Phase 0 teacher-secret persistence assertion unchanged. |
| tests/progress-reset-matrix-cleared-storage.test.js — matrix row: cleared storage recovers — CONTROL (a subsequent live success) (7) flips to available, writes the latch, and the strict gate resumes | PRE-EXISTING | Leave Phase 0 cleared-storage strict-gate control unchanged. |
| tests/progress-reset-matrix-latch.test.js — matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED D4 fail-open never leaks into the affirmative-server case | PRE-EXISTING | Leave Phase 0 affirmative-server strict-gate assertion unchanged. |
| tests/progress-reset-matrix-loadstate.test.js — matrix row: 401 -> auth classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session | PRE-EXISTING | Leave Phase 0 401/403 sign-in banner assertions unchanged. |
| tests/progress-reset-matrix-loadstate.test.js — matrix row: 403 -> auth (classified identically to 401) classifies unavailable/auth | PRE-EXISTING | Leave Phase 0 401/403 sign-in banner assertions unchanged. |
| tests/pwa.test.js — sw.js contracts pre-caches the mobile flashcard shell and supporting data | FIX | Precache retained mobile/flashcard runtime and empty data hooks. |
| tests/remaining-feature-contracts.test.js — F004 Start Here signed-in progress preview renders the signed-out fallback when identity or service config is unavailable | PHASE 3 | Delete F004/F062 cases and empty F061 group; F061 AP TOC assertion was already removed in Phase 2b. |
| tests/remaining-feature-contracts.test.js — F004 Start Here signed-in progress preview fetches /grade with rosterClient.token() and renders quarter/unit progress for signed-in students | PHASE 3 | Delete F004/F062 cases and empty F061 group; F061 AP TOC assertion was already removed in Phase 2b. |
| tests/remaining-feature-contracts.test.js — F062 external Formula Lab link (W2 / G3) primary card opens Formula Lab; Defense is secondary legacy review | PHASE 3 | Delete F004/F062 cases and empty F061 group; F061 AP TOC assertion was already removed in Phase 2b. |
| tests/roadmap-resilience.test.js — roadmap network resilience loadRegistry uses saved data before live refresh and reports fallback state | FIX | Restore cached registry, fallback status, optional partial overlay loading and raw roster fetch fallback; remove retired poll assertion only. |
| tests/roadmap-resilience.test.js — roadmap network resilience loadSupabaseOverlay accepts partial results and saves the overlay cache | FIX | Restore cached registry, fallback status, optional partial overlay loading and raw roster fetch fallback; remove retired poll assertion only. |
| tests/roadmap-resilience.test.js — roadmap UI clarity and performance live roster fetches keep the raw-fetch fallback for isolated tests | FIX | Restore cached registry, fallback status, optional partial overlay loading and raw roster fetch fallback; remove retired poll assertion only. |
| tests/smoke-student-host-matrix.test.js — student host matrix — flashcard assets (static) checks flashcards.js and a representative deck on GH Pages | FIXTURE | Remove deleted AP deck URL probes; retain flashcards.js checks on both hosts. |
| tests/smoke-student-host-matrix.test.js — student host matrix — flashcard assets (static) checks flashcards.js and a representative deck on the Vercel mirror | FIXTURE | Remove deleted AP deck URL probes; retain flashcards.js checks on both hosts. |
| tests/study-guide.test.js — session 89 two-proportion calculator walkthroughs adds two-proportion wizard and result screens to ti84-procedures-data.json | FIXTURE | Delete only the TI-84 two-proportion walkthrough group (including its AP-specific procedure DAG wiring); retain study-guide DAG/runtime suites. |
| tests/study-guide.test.js — session 89 two-proportion calculator walkthroughs two-propztest records the 6-key test flow with both samples and an alternative row | FIXTURE | Delete only the TI-84 two-proportion walkthrough group (including its AP-specific procedure DAG wiring); retain study-guide DAG/runtime suites. |
| tests/study-guide.test.js — session 89 two-proportion calculator walkthroughs two-propzint records the ALPHA + B interval flow with confidence level entry | FIXTURE | Delete only the TI-84 two-proportion walkthrough group (including its AP-specific procedure DAG wiring); retain study-guide DAG/runtime suites. |
| tests/study-guide.test.js — session 89 two-proportion calculator walkthroughs DAG wiring includes the new unit 6 procedure nodes and prerequisites | FIXTURE | Delete only the TI-84 two-proportion walkthrough group (including its AP-specific procedure DAG wiring); retain study-guide DAG/runtime suites. |
| tests/teacher-auth-desk.test.js — WI-5f: teacher-classroom.html currentRole reads from rosterClient teacher-classroom.html file loads | FIX | Delete tests solely targeting the deleted teacher-classroom.html. |
| tests/teacher-auth-desk.test.js — WI-5f: teacher-classroom.html currentRole reads from rosterClient currentRole reads rosterClient.current() instead of localStorage | FIX | Delete tests solely targeting the deleted teacher-classroom.html. |
| tests/teacher-auth-desk.test.js — WI-5f: teacher-classroom.html currentRole reads from rosterClient currentRole returns null when rosterClient is unavailable (safe fallback) | FIX | Delete tests solely targeting the deleted teacher-classroom.html. |
| tests/teacher-dashboard-misconceptions.test.js — teacher misconception panel lists all active remediation sheets from the DOK manifest with student/board/teacher links (textContent only) | FIXTURE | Empty DOK replacement manifest hides strip; synthetic sheets exercise safe title/target text and student/board/teacher links. |
| tests/teacher-dashboard-misconceptions.test.js — renders all manifest sheets and target labels safely, and hides an empty strip | FIXTURE | Empty DOK replacement manifest hides strip; synthetic sheets exercise safe title/target text and student/board/teacher links. |
| tests/teacher-dashboard-misconceptions.test.js — uses vocabulary label text for tagged remediation targets without interpreting markup | FIXTURE | Empty DOK replacement manifest hides strip; synthetic sheets exercise safe title/target text and student/board/teacher links. |
| tests/teacher-gradebook.test.js — teacher-dashboard in-app gradebook grid renders a student row with cells and both totals | PHASE 3 | Delete AP Posters/category-column pins; re-cover surviving student row, four component cells, both totals and delta using synthetic columns. |
| tests/teacher-gradebook.test.js — teacher-dashboard in-app gradebook grid groups columns by Schoology category in the header (structural 1:1, incl. empty Posters) | PHASE 3 | Delete AP Posters/category-column pins; re-cover surviving student row, four component cells, both totals and delta using synthetic columns. |
| tests/work-manifest-ced-regression.test.js — W-reg CED deploy reproduces both live copies (d) --deploy to a temp root yields byte-identical live JSON matching both live files | FIXTURE | Build from empty manifest/crosswalk inputs and compare both output copies byte-for-byte. |
| tests/work-manifest.test.js — [collection failure] | FIXTURE | Use fixture manifest and skill map; retain sort, schema, exclusion and copy-parity assertions. |
| tests/journeys/harness.smoke.test.js — [collection failure] | FIX | Serve synthetic registry/calendar/lesson/deck through the real Desk harness; retain clean boot deadline. |
| tests/journeys/j2-shared-device.journey.test.js — Desk journey J2 J2 reloads a shared device across A → B → A without leaking marks, due chip, or SRS state, then hydrates a fresh marks bucket from /donow (supersedes desk-calendar-sync per-student visibility and selfDone hydration behavior) | FIX | Restore synthetic calendar and normal Desk boot; retain A/B/A identity, marks, SRS and hydration assertions. |
| tests/journeys/j3-worksheet-done.journey.test.js — Desk journey J3 J3 keeps worksheet Done disabled at the 59% lower boundary | FIX | Restore test registry/calendar hook; retain exact 59/60 boundary and one authenticated completion payload. |
| tests/journeys/j3-worksheet-done.journey.test.js — Desk journey J3 J3 worksheet Done is disabled at 59% but at 60% posts one exact WS-…-DESK_DONE payload and updates the tile (supersedes desk-calendar-sync 60% gate pin) | FIX | Restore test registry/calendar hook; retain exact 59/60 boundary and one authenticated completion payload. |
| tests/journeys/j4-quick-check.journey.test.js — [collection failure] | FIXTURE | Repoint deck to 12-card fixture; preserve pre-existing skip status and quick-mode assertions. |
| tests/journeys/j5-timed-deck.journey.test.js — [collection failure] | FIXTURE | Repoint 12-card deck; preserve timed score, run identity and ledger assertions. |
| tests/journeys/j6-review-mode.journey.test.js — [collection failure] | FIXTURE | Repoint 12-card deck; preserve review/SRS updates and zero grading side effects. |
| tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab 'network' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control) | PRE-EXISTING | Leave all four Phase 0 cold-reboot network/401/403/500 cases and assertions unchanged. |
| tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '401' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control) | PRE-EXISTING | Leave all four Phase 0 cold-reboot network/401/403/500 cases and assertions unchanged. |
| tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '403' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control) | PRE-EXISTING | Leave all four Phase 0 cold-reboot network/401/403/500 cases and assertions unchanged. |
| tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '500' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control) | PRE-EXISTING | Leave all four Phase 0 cold-reboot network/401/403/500 cases and assertions unchanged. |
| tests/journeys/j8-view-as.journey.test.js — Desk journey J8 J8 production teacher view-as is read-only for entry, lifecycle sync, worksheet Done, flashcards/review, passport, and every apstats_* local key | FIX | Restore harness registry and retained sync route; preserve read-only view-as, lifecycle and local-state isolation assertions. |
| tests/journeys/j9-flashcard-sync.journey.test.js — [collection failure] | FIXTURE | Repoint deck and fake /flashcards/state; preserve cross-device merge, CAS, identity and SRS assertions. |

Additional regressions exposed while stripping: replaced retired wallet-hue/calendar-preservation assertions; moved nudge reply tests from deleted websocket transport to authenticated HTTP while preserving recipient/text/stack isolation; updated assessment-label expectations while retaining numeric grade checks; updated invalid-state sync failure classification while retaining fail-closed/local-storage assertions. Removed retired fake trainer PATCH/allowlist cases and replaced them with retained endpoint auth/isolation/CAS/size cases.

### Deleted pending Phase 3

Each item below must be replaced with an A2 equivalent when Phase 3 establishes the grade/category and copy contracts. Full original assertion bodies are recorded in `state/cross-agent/phase2c-deleted-cases.json`.

- `tests/grade-clarity.test.js`: explains the two-track higher-of-two model with the 40% floor / 70% cap.
- `tests/grade-clarity.test.js`: states the Schoology relationship (same number, live, a step ahead).
- `tests/phase4-structure.test.js`: every pre-existing section header and key copy stays present (additive-scope guard).
- `tests/calendar-cohesion.test.js`: the key labels every overlay signal.
- `tests/calendar-cohesion.test.js`: swatches reuse the LIVE cell classes so the key cannot drift from the CSS.
- `tests/calendar-cohesion.test.js`: a classic-Mac dotted :focus-visible ring exists, with a light variant for dark cells.
- `tests/calendar-cohesion.test.js`: cellAria -- sentinels, lessons, PCs, and due dates render as flat text.
- `tests/calendar-cohesion.test.js`: cellAria -- the remaining branches (post / poster / baseline / review / double-topic).
- `tests/teacher-gradebook.test.js`: renders a student row with cells and both totals.
- `tests/teacher-gradebook.test.js`: groups columns by Schoology category in the header (structural 1:1, incl. empty Posters).
- `tests/remaining-feature-contracts.test.js`: F004 Start Here signed-in progress preview.
- `tests/remaining-feature-contracts.test.js`: F061 public worksheet table of contents. The 69-worksheet TOC assertion was removed in Phase 2b; Phase 2c only removes its empty group.
- `tests/remaining-feature-contracts.test.js`: F062 external Formula Lab link (W2 / G3).
- `tests/desk-grade-checkin.test.js`: SY2627_PACING_B AP pacing extraction and calendar dates.

The deleted teacher row case pinned nine cells including AP PC/Poster columns. A replacement synthetic row case retains identity, four surviving component cells, both total values and the 8.5 difference. Study-guide deletion is limited to the two-proportion calculator walkthrough group, including its named procedure-specific DAG wiring; generic DAG/runtime tests remain. Teacher-classroom-only tests and the two dormant doge tools are deleted outright.

### PRE-EXISTING — retained by exact name

- `tests/phase4-structure.test.js`: teacher-dashboard.html — Phase 4a structure teacher-secret persistence is OPT-IN only; localStorage writes are scoped to two known keys
- `tests/phase4b-structure.test.js`: Phase 4b — teacher-dashboard.html remediation panel teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19)
- `tests/progress-reset-matrix-cleared-storage.test.js`: matrix row: cleared storage recovers — CONTROL (a subsequent live success) (7) flips to available, writes the latch, and the strict gate resumes
- `tests/progress-reset-matrix-latch.test.js`: matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED D4 fail-open never leaks into the affirmative-server case
- `tests/progress-reset-matrix-loadstate.test.js`: matrix row: 401 -> auth classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session
- `tests/progress-reset-matrix-loadstate.test.js`: matrix row: 403 -> auth (classified identically to 401) classifies unavailable/auth
- `tests/journeys/j7-offline-grade.journey.test.js`: Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab 'network' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- `tests/journeys/j7-offline-grade.journey.test.js`: Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '401' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- `tests/journeys/j7-offline-grade.journey.test.js`: Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '403' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
- `tests/journeys/j7-offline-grade.journey.test.js`: Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '500' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)

### Retained flashcard state endpoint and local verifier

`GET/PUT /flashcards/state` uses existing signed student tokens and checks the roster identity. The table stores one private JSON object per student, capped by the route at 262,144 UTF-8 bytes. First writes insert atomically; later writes compare `baseUpdatedAt` and return 409 on conflicts. Reads return `found: false` or the state and server timestamp; responses are not cached. Migration `0036_flashcard_state.sql` adds roster-cascading storage with RLS and service-role-only access. Client and journey fake use the new route; the wire format/SRS identity and bounded merge retry remain intact. No grade endpoint or grade evidence is written by practice sync.

`verify.html` wraps existing `receipt-verify.js` using a small local script and no dependencies. Receipt/print/QR links resolve on the current site. The page verifies receipts and commit manifest signatures, renders payloads as text, and rejects altered signatures. Both verifier scripts, flashcards.js and mobile-home.html ship in the offline pack and service-worker core.

### Files edited / deleted / added

**edited (41)**

- `A2_FORK_BASELINE.md`
- `ap_stats_roadmap_square_mode.html`
- `lib/flashcard-sync.js`
- `lib/flashcard-sync.test.js`
- `roster-server/server.js`
- `scripts/build-offline-pack.mjs`
- `scripts/build-work-manifest-ced.mjs`
- `scripts/misconception-map-sources.mjs`
- `scripts/smoke-student-host-matrix.mjs`
- `sw.js`
- `teacher-dashboard.html`
- `tests/build-offline-pack.test.js`
- `tests/calendar-cohesion.test.js`
- `tests/desk-donow-ledger.test.js`
- `tests/desk-donow-speedbump.test.js`
- `tests/desk-flashcard-sync.test.js`
- `tests/desk-grade-outlook.test.js`
- `tests/desk-persistent-teacher-chat.test.js`
- `tests/grade-clarity.test.js`
- `tests/journeys/fake-roster.contract.test.js`
- `tests/journeys/fake-roster.js`
- `tests/journeys/harness.js`
- `tests/journeys/harness.smoke.test.js`
- `tests/journeys/j1-signin-donow.journey.test.js`
- `tests/journeys/j4-quick-check.journey.test.js`
- `tests/journeys/j5-timed-deck.journey.test.js`
- `tests/journeys/j6-review-mode.journey.test.js`
- `tests/journeys/j9-flashcard-sync.journey.test.js`
- `tests/misconception-maps.test.js`
- `tests/mobile-home-fc-csv-fallback.test.js`
- `tests/nudge-toast-stack.test.js`
- `tests/phase4-structure.test.js`
- `tests/remaining-feature-contracts.test.js`
- `tests/roadmap-resilience.test.js`
- `tests/smoke-student-host-matrix.test.js`
- `tests/study-guide.test.js`
- `tests/teacher-dashboard-misconceptions.test.js`
- `tests/teacher-gradebook.test.js`
- `tests/work-manifest-ced-regression.test.js`
- `tests/work-manifest.test.js`
- `vitest.config.js`

**deleted (4)**

- `tests/desk-grade-checkin.test.js`
- `tests/teacher-auth-desk.test.js`
- `tools/lib/doge-keys.mjs`
- `tools/lib/doge-send-core.mjs`

**added (33)**

- `data/blooket-difficulty.json`
- `data/blooket-topic-csv.json`
- `data/remediation-sheets.json`
- `roadmap-data.json`
- `roster-server/flashcard-state.js`
- `roster-server/migrations/0036_flashcard_state.sql`
- `roster-server/tests/flashcard-state-store.test.js`
- `roster-server/tests/flashcard-state.test.js`
- `tests/fixtures/a2/blooket-lessons.json`
- `tests/fixtures/a2/crosswalk.empty.json`
- `tests/fixtures/a2/crosswalk.json`
- `tests/fixtures/a2/data/lesson-questions.json`
- `tests/fixtures/a2/data/lesson-rubrics.json`
- `tests/fixtures/a2/data/misconception-distractor-map.json`
- `tests/fixtures/a2/data/misconception-rubric-map.json`
- `tests/fixtures/a2/data/misconceptions.json`
- `tests/fixtures/a2/data/skill-map.json`
- `tests/fixtures/a2/data/work-manifest.json`
- `tests/fixtures/a2/lessons-index.json`
- `tests/fixtures/a2/remediation-manifest.empty.json`
- `tests/fixtures/a2/roadmap-data.json`
- `tests/fixtures/a2/roster-server/data/misconception-distractor-map.json`
- `tests/fixtures/a2/roster-server/data/misconception-rubric-map.json`
- `tests/fixtures/a2/roster-server/data/misconceptions.json`
- `tests/fixtures/a2/roster-server/data/work-manifest.json`
- `tests/fixtures/a2/topic-csv.json`
- `tests/fixtures/a2/u1_l1_blooket.csv`
- `tests/fixtures/a2/u1_lesson1_live.html`
- `tests/fixtures/a2/u3_l6_l7_blooket.csv`
- `tests/fixtures/a2/work-manifest.empty.json`
- `tests/verify-page.test.js`
- `verify-page.js`
- `verify.html`

Inventories compare SHA-256 hashes with the Phase 2c start snapshot; tooling caches, dependencies and state reports are excluded. Fixture copies include one fake lesson, one 12-card Blooket deck plus a combined-filename alias, empty manifests, and small synthetic map/rubric/question inputs. No teacher-authored production map was regenerated.

### Unsure / left in place

- Named receipt helpers _walletB64UrlBytes/_walletVerifyReceiptCompact/_walletEsc/_walletVerifyAndCheck/_walletReceiptRow and WALLET_ISSUERS remain for surviving receipt dependencies and brace-matched tests; rename in Phase 3.
- AP filenames, storage/deck IDs, B/E periods, CED crosswalk/labels, generic v3 math and pcAvg/pcDue compatibility fields remain for Phase 3. Teacher/student gradebook category/reconciliation metadata remains transitional; no A2 grade weights invented.
- Production work-manifest and teacher-authored misconception maps remain untouched AP-derived inputs. Builders now accept isolated synthetic sources; replace production curriculum in Phase 3/4 before regeneration.
- The default lesson/calendar registry and Blooket/remediation maps are empty Phase 4 hooks. No real A2 lessons or decks were fabricated. Optional A2_ROADMAP_OVERLAY endpoints are unset by default.
- J4 quick-check journeys retain their two pre-existing skips (quick UI was already retired); their deck fixtures now collect successfully. Other quick engine tests remain. Root skipped count drops from 40 to 13 because deleted AP grade-checkin cases included 27 skips.
- Diagnostic study-guide runtime and remaining AP examples stay for Phase 4 as requested. Its deleted two-proportion procedure-specific DAG case is listed separately from retained generic DAG/runtime assertions.
- The local verifier verifies trusted signatures and explicitly labels commit manifests as signature-only; it does not implement full bundled-receipt inclusion proofs.
- Migration 0036 is added and tested in local in-memory Postgres, but has not been applied to a live database. Deployment must apply it alongside the retained endpoint.
- The ten named Phase 0 failures are unchanged. No git commands, commits, Claude calls, deployments or live database operations were performed.

Impact evidence: `state/cross-agent/phase2c-impact.json` and `phase2c-targeted-impact.jsonl`. Indexed changed sync/app paths were LOW risk; inline HTML symbols were mostly UNKNOWN and verified by the suites. No pre-commit analysis was needed because no commit was requested or made.


## Phase 3 — rename + A2 grade model

Implemented 2026-09-13. District 50/40/10 is the default; when both flags are enabled it wins and logs a startup warning. C meets Mon/Tue/Thu, D Mon/Wed/Fri, and G Tue/Wed/Thu/Fri, including early-release Wednesdays. SY26–27 quarter dates and due-after-lesson-day behavior remain.

The district engine counts unattempted due work as zero, renormalizes weights over present categories, reports category minimum-count progress and a remaining-item ceiling, and averages nonempty quarter grades for the year. The ledger adapter uses recorded_at, best assessment attempts, latest Try-It rescores, and one existing BL-…-DESK_DONE flashcard per deck/quarter. The A2 v3 alternative uses mean topic-assessment mastery with the retained v3Gates.

### Pinned worked examples

Today is 2026-10-10; listed Q1 items are due 2026-10-01 unless their September date is specified. Category minimums are reported independently of the weighted arithmetic.

| Case | Assessment points | Assignment points | Engagement points | Quarter grade | Ceiling |
| --- | --- | --- | --- | --- | --- |
| All perfect | 110/110 (one 10-point check + one 100-point topic assessment) | 2/2 | 1/1 | 100 | 100 |
| Missing one topic assessment | 10/110 (unattempted assessment remains in denominator) | 2/2 | 1/1 | 600/11 = 54.54545454545455 | 100 |
| Only Assignments present | absent | 1/2 | absent | 50 | 50 |
| Empty quarter | absent | absent | absent | null | null |
| Bonus window: missing Sep 15 check + perfect Sep 22 check | 10/10 (100%; Sep 15 excluded) | absent | absent | 100 | 100 |
| Only-raise bonus: Sep 15 check attempted 5/10 + perfect Sep 22 check | 10/10 (100%; Sep 15 ignored) | absent | absent | 100 | 100 |
| Only-raise bonus, empty base: Sep 15 Try-Its 2/2 and 0/2 attempted | absent | 2/2 (zero-score item ignored) | absent | 100 | 100 |
| Only-raise bonus: Sep 25 Try-It 1/2 + Sep 15 Try-It 2/2 | absent | 3/4 | absent | 75 | 75 |
| Only-raise bonus: Sep 25 Try-It 1/2 + Sep 15 Try-It 1/2 | absent | 2/4 (equal-ratio bonus included) | absent | 50 | 50 |
| Only-raise bonus tie ordering: 2/4 C, 1/2 A, 1/2 B | 4/8 (order C, A, B in every input permutation) | absent | absent | 50 | 50 |
| Missing Try-It due Sep 25 | absent | 0/2 (0%) | absent | 0 | 100 |
| Bonus window disabled (null): missing Sep 15 check + perfect Sep 22 check | 10/20 (50%) | absent | absent | 50 | 100 |


Year example: quarter grades 80 and 100, with two empty quarters, yield 90. The missing-assessment category score is 100/11 percent; the quarter is 0.5 × (100/11) + 0.4 × 100 + 0.1 × 100.

### Rename, surfaces, and sync

- Renamed ap_stats_roadmap_square_mode.html to desk.html and updated functional references, packaging, redirects, scripts and tests. Historical phase records retain the old name for provenance.
- Changed apstats_ storage prefixes to a2_ throughout active clients and tests; no migration shim.
- Rebranded titles/manifest/landing/TOC and receipt issuer display name (The A2 Desk); rewrote Start Here with A2 classroom facts and the three-category playground.
- Desk Do Now/My Gradebook show category scores, minimum progress, live grade and ceiling. Lesson tiles show Try-Its, lesson check, and flashcard chips from grade-ledger data. Teacher columns display earned/max points and all A2 categories.
- Schoology kinds are lesson_check/topic_assessment → Assessments, try_it → Assignments, flashcard → Engagement; fixtures emit earned points. Try-It sync permits replacement. CLI and daily batch remain dry-run by default; explicit -Live forwards --apply. Daily batch defaults to PeriodC.
- Migration 0037 admits the four A2 sources and atomically preserves best scores on duplicate-attempt updates. Receipts use the stored score returned by the database.
- Browser grade-engine bundle regenerated from the shared server modules. Synthetic and M2b golden fixtures regenerated with their documented commands, never hand-edited.

### Tests added and superseded

- Added roster-server/tests/district-grade.test.js
- Added roster-server/tests/a2-receipts.test.js
- Added roster-server/tests/a2-ledger-migration.test.js
- Added tests/a2-surfaces.test.js
- Added tests/test_a2_schoology.py

- tests/grade-playground.test.js: AP v3 playground replaced with the district three-slider/ceiling example
- tests/phase4-structure.test.js: obsolete Start Here section ordering replaced with A2 policy/copy assertions; teacher security tests retained
- tests/grade-clarity.test.js and tests/remaining-feature-contracts.test.js: course orientation and district explanation repinned
- tests/teacher-gradebook.test.js: added four-kind A2 row/category-header coverage; generic row/date/reconciliation tests retained
- tests/test_schoology_sync_lib.py: AP classifier/title/all-100-point classes superseded by A2 category/point tests; generic date/action tests retained
- tests/test_schoology_components.py: AP key/column/producer classes superseded by A2 individual-item columns and earned-points fixture tests; presence-loader coverage retained
- tests/test_schoology_sync_section.py: PC/Poster parity class removed; transport/idempotency/marking-period tests adapted to explicit A2 item fixtures
- tests/test_e_wednesday_schedule_schoology.py: AP real-corpus pins replaced with synthetic C/D/G same-day item identity tests
- tests/test_schoology_exit_bonus.py: AP 105-percent extra-credit case replaced with four A2 feeder point values
- Existing flashcard, roster, and path/storage tests updated for Engagement copy, C/D/G controls, desk.html and a2_ keys

No whole test files were deleted in this phase. Generic v3 two-track, ledger, receipt, transcript, identity, sync and offline tests remain.

### Final verification

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 160 | 154 | 6 | 2658 | 10 | 13 |
| roster-server | 75 | 75 | 0 | 1329 | 0 | 3 |
| pytest | — | — | 0 | 155 | 0 | 0 |

Commands: root npx vitest run --reporter=json --outputFile=state/cross-agent/phase3-root-final.json; server npx vitest run --reporter=json --outputFile=../state/cross-agent/phase3-server-final.json; root pytest tests/ -q --tb=short --basetemp=state/cross-agent/phase3-pytemp-final. Pytest uses a workspace temp directory because the host pytest temp directory was inaccessible; 155 passed with two pre-existing datetime.utcnow deprecation warnings. The daily PowerShell batch also passed parser validation after its explicit-live flag update.

Root exits 1 with exactly the same ten named baseline failures, and no new failures:

- tests/phase4-structure.test.js — teacher-dashboard.html — Phase 4a structure teacher-secret persistence is OPT-IN only; localStorage writes are scoped to two known keys
  Reason: localStorage.setItem(_, ...) targets an unknown key — only URL_KEY, SECRET_KEY, and GLOBAL_OVERRIDE_KEY are allowed: expected false to be true // Object.is equality
- tests/phase4b-structure.test.js — Phase 4b — teacher-dashboard.html remediation panel teacher secret persistence is opt-in only; localStorage scoped to known keys (Phase 4a security posture, updated 2026-05-19)
  Reason: unexpected setItem key: _: expected false to be true // Object.is equality
- tests/progress-reset-matrix-cleared-storage.test.js — matrix row: cleared storage recovers — CONTROL (a subsequent live success) (7) flips to available, writes the latch, and the strict gate resumes
  Reason: expected true to be false // Object.is equality
- tests/progress-reset-matrix-latch.test.js — matrix row: strict-gate-still-strict — evidence present + genuinely incomplete predecessor stays LOCKED D4 fail-open never leaks into the affirmative-server case
  Reason: expected true to be false // Object.is equality
- tests/progress-reset-matrix-loadstate.test.js — matrix row: 401 -> auth classifies unavailable/auth, shows the Sign-in banner, and never clears the roster session
  Reason: expected false to be true // Object.is equality
- tests/progress-reset-matrix-loadstate.test.js — matrix row: 403 -> auth (classified identically to 401) classifies unavailable/auth
  Reason: expected '' to match /sign-in needs a refresh/i
- tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab 'network' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
  Reason: live /grade did not seed the durable cache and grade strip after 1000 ms
- tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '401' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
  Reason: live /grade did not seed the durable cache and grade strip after 1000 ms
- tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '403' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
  Reason: live /grade did not seed the durable cache and grade strip after 1000 ms
- tests/journeys/j7-offline-grade.journey.test.js — Desk journey J7 J7 cold reboot preserves the incident invariants after a real visible-tab '500' /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)
  Reason: live /grade did not seed the durable cache and grade strip after 1000 ms

Server and pytest exit 0. Counts use file and assertion statuses, not Vitest aggregate suite counters.

### Unsure / left in place

- No A2 curriculum was fabricated. Production server lesson/deck registries remain Phase 4 hooks; author lesson.items/tryItCount and topicAssessments in the Lesson_planning pipeline.
- Try-It rescoring uses the lesson topicAssessmentDate cutoff when provided; the quarter close is always enforced. Publishing the actual lesson-to-assessment cutoff metadata is required with Phase 4 content.
- Ceiling is the remaining-item projection: completed scores are held fixed and unattempted overdue/future scheduled items become perfect. It does not simulate additional retakes of already-completed items.
- The lesson-check runner and teacher scoring interfaces remain Phase 4. New scored lesson-check/Try-It/topic-assessment writes require teacher/trusted-scorer authorization and registered scheduled item IDs.
- Historical v3/legacy fixtures, compatibility fields pcAvg/workAvg, and legacy gradebook helpers remain. A2 v3 uses mean topic-assessment mastery; the historical both-flags-off fallback is retained for old fixtures.
- Archived AP history, AP-derived diagnostic/content bundles, legacy service/course aliases and trusted public-key defaults remain deployment/content follow-up. Configure isolated A2 URLs, course IDs, receipt keys and OPEN_SIGNUP_SECTIONS for C/D/G in Phase 5.
- Migration 0037 was tested locally in PostgreSQL/PGlite and was not applied to a live database.
- No git commands, commits, Claude Code calls, deployments, live syncs or live database operations were performed.

GitNexus evidence: state/cross-agent/phase3-impact.jsonl and phase3-core-impact.jsonl. Shared grading and section-resolution paths were HIGH; inline symbols often UNKNOWN. Broad audit: 2,181 LOW, 15 MEDIUM, 101 HIGH, 17 CRITICAL, 2,195 UNKNOWN lookups (includes unedited symbols and test helpers). Warnings were reported before core edits. No pre-commit detect_changes was applicable because no commit was made.

## Phase 4 — A2 additions

Implemented 2026-09-13. Lesson 1-1 is published from the read-only Lesson_planning registry and TE. Student checks are scored on the roster server, teacher Try-It and topic scores append receipt-bearing attempts, and the Desk reads ledger status plus persisted pacing. No git commands, commits, Claude calls, deployment, or live database writes were performed.

### New files

- `content/a2/lessons.json`
- `content/a2/1-1/deck.csv`
- `content/a2/1-1/deck.sources.json`
- `content/a2/1-1/images/1-1_savvas_q18-22_graph.png`
- `content/a2/1-1/images/1-1_savvas_q23-27_graph.png`
- `content/a2/1-1/images/1-1_savvas_q32_graph.png`
- `lib/a2-answers.js`
- `roster-server/a2-lessons.js`
- `roster-server/a2-routes.js`
- `roster-server/migrations/0038_a2_lessons.sql`
- `a2-client.js`
- `a2-desk.js`
- `check.html`
- `check.js`
- `teacher-tryits.html`
- `roster-server/tests/a2-phase4.test.js`
- `tests/a2-phase4.test.js`
- `tests/journeys/a2-check.journey.test.js`

### Updated files

- `desk.html`
- `teacher-dashboard.html`
- `offline-queue.js`
- `roster-server/server.js`
- `roster-server/district-ledger.js`
- `roster-server/signup-config.js`
- `roster-server/tests/signup-claim.test.js`
- `scripts/lint-blooket-deck.mjs`
- `scripts/build-offline-pack.mjs`
- `sw.js`
- `grade-engine.bundle.js`
- `tests/journeys/harness.js`
- `tests/journeys/fake-roster.js`
- `A2_FORK_BASELINE.md`

### Endpoints and payloads

All A2 route responses are no-store. Teacher auth uses the existing teacher Bearer token or x-teacher-secret helper.

- **GET /lessons** — Public. Payload: `null`. Published lesson model with server pacing overlay.
- **GET /teacher/lessons** — Teacher Bearer token or x-teacher-secret. Payload: `null`. Published lesson model with pacing overlay.
- **PUT /teacher/lessons** — Teacher Bearer token or x-teacher-secret. Payload: `{"lessons": [{"key": "1-1", "sections": {"C": "YYYY-MM-DD or null", "D": "YYYY-MM-DD or null", "G": "YYYY-MM-DD or null"}, "onenoteUrl": "HTTPS URL or null"}]}`. Validated, persisted pacing overlay; registry content cannot be edited through this endpoint.
- **GET /lesson-status/:lesson** — Student Bearer token; teacher may select ?studentId=. Payload: `null`. Five scores with registry IDs/rescoreRequested, scored count/points, best check percent, attempt count, existing flashcard pass.
- **POST /ledger/rescore** — Student Bearer token; teacher may select studentId. Payload: `{"itemId": "TI-1-1-1"}`. rescoreRequested:true; rejects unscored, closed-quarter or post-topic-assessment requests.
- **PUT /student/section** — Student Bearer token. Payload: `{"section": "C | D | G"}`. Persists roster.section; teacher credentials retain teacher identity-selection authority.
- **POST /ledger/record** — Student Bearer token for lesson checks; teacher Bearer token or x-teacher-secret plus studentId for teacher scores. Payload: `{"source": "lesson-check | try-it | topic-assessment", "itemId": "LC-1-1 | TI-1-1-1..5 | TA-T1", "requestId": "Unique retry-safe string", "answers": "For lesson-check: object mapping all six registry IDs to answer strings", "score": "Teacher sources only: 0/1/2 or 0..100", "studentId": "Teacher-selected roster identity", "quarter": "Optional topic-assessment quarter constraint"}`. Append-only numbered attempt with signed receipt; check score computed server-side; bestScore reported; retries deduplicated.

### Ledger item kinds

| Source | Item ID | Points | Selection |
| --- | --- | ---: | --- |
| try-it | `TI-<lesson>-<n>` | 2 | Latest score; distinct recorded attempts and receipts retained |
| lesson-check | `LC-<lesson>` | 10 | Best score, computed from all submitted registry answers using the shared normalizer |
| topic-assessment | `TA-<topicAssessmentKey>` | 100 | Latest score, including lower replacements; receipts retained |
| worksheet (existing flashcard commit) | `BL-U<topic>-L<lessonNumber>-DESK_DONE` | 1 | Existing flashcard percent >=80 maps to one Engagement point for the scheduled quarter |

Scores/maxPoints/lesson metadata live in the existing ledger response metadata; the district adapter supplies category and point scales. Try-It requests persist in a roster-cascading table and are exposed as rescoreRequested. A later teacher score clears the displayed request by timestamp. Lesson checks reuse a shared best-attempt helper; topic assessments now select the latest attempt.

### Lesson 1-1 content and answers

Try-Its 1–5 are verbatim registry prompts. The lesson check uses five DOK 1 Practice items plus SAT/ACT #32; all selected answers are auto-gradable. Shared graph images were copied byte-identically with their original filenames.

| Registry ID | Accepted answers |
| --- | --- |
| `1-1-savvas-q18` | (-inf,inf); [-9,inf) / (-∞,∞); [-9,∞) |
| `1-1-savvas-q21` | (-1,inf); (-inf,-1) / (-1,∞); (-∞,-1) |
| `1-1-savvas-q22` | 1 |
| `1-1-savvas-q23` | [-5,5]; [-1,2] |
| `1-1-savvas-q27` | -1/2 / -0.5 |
| `1-1-savvas-q32` | A |

For #18 and #23, responses are `domain; range`; #21 is `increasing interval; decreasing interval`. The runner displays these response-order hints. #32 uses the four printed choices, with A correct ($6,000 initially invested). The shared normalizer accepts whitespace, Unicode minus/infinity, inf/infinity/LaTeX-infty spellings while preserving open/closed brackets. Short answers use pipe-separated alternatives.

The Blooket deck has **14 recall cards**, each citing a concept-box or concept-summary registry ID in the source column and deck.sources.json. Lint reports **zero findings**. No problem was invented and no chosen registry answer was left ungradable.

### Desk, teacher scoring, and pacing

- teacher-tryits.html provides 48px score toggles, section/today-or-any-lesson selection, optimistic capture, offline replay, and rescore badges. The shared queue now includes studentId in teacher-record identities.
- check.html?lesson=1-1 renders traced graph-reading items with data-answer blanks, printed MC radios, immediate feedback, a sign-in wall, and an always-available retake button. Server request IDs deduplicate retries.
- The dashboard gradebook adds a 0–100 input column per published topic key. Later entries replace earlier ones, retain receipts, and enforce the original quarter.
- Desk lesson tiles and Do Now show ledger-derived Try-It/check/flashcard chips. My Gradebook shows all five Try-It scores and rescore buttons. The Do Now card includes the section’s dated lesson and OneNote link alongside the existing district category/minimum/grade/ceiling display.
- Teacher menu Pacing opens the server-backed date/OneNote editor. Live grade/class/teacher/transcript paths share the overlaid schedule; static content stays unchanged. Flashcard launch reads the model’s deck path.
- Signup defaults to C/D/G; profile section edits persist server-side. The name finder handles bare C/D/G and retained PeriodC/PeriodD/PeriodG aliases.
- The service worker/offline pack include the new runner, model, images, and deck. The browser grade bundle was regenerated from shared source.

### Verification

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 162 | 156 | 6 | 2668 | 10 | 13 |
| roster-server | 76 | 76 | 0 | 1338 | 0 | 3 |
| pytest | — | — | 0 | 155 | 0 | 0 |

Root exits 1 with exactly the same ten named Phase 3 failures (verified by exact full-name set comparison); server and pytest exit 0. Pytest retains two pre-existing datetime.utcnow deprecation warnings. Counts use file/assertion statuses. The new checks add 10 root tests and 9 server tests, including the real Desk/sign-in/check/ledger/gradebook journey.

- `npx vitest run --reporter=json --outputFile=state/cross-agent/phase4-root-final.json`
- `cd roster-server; npx vitest run --reporter=json --outputFile=../state/cross-agent/phase4-server-final.json`
- `C:/Python313/python.exe -m pytest tests/ -q --tb=short --basetemp=state/cross-agent/phase4-pytemp-final`
- `node scripts/lint-blooket-deck.mjs --csv content/a2/1-1/deck.csv`
- `node scripts/build-grade-engine.mjs`

Journey pin: a C-section student completes 4/6 (20/3 points) then 6/6 (10 points). The tile shows 100% and My Gradebook shows 10.0 / 10. With five due unattempted Try-Its and one due unattempted deck, Q1 = 0.50 × 100 + 0.40 × 0 + 0.10 × 0 = **50**; the ceiling is 100.


### Unsure / left in place

- Lesson sections and OneNote URL remain null until the teacher sets pacing; no dates were fabricated.
- Try-It 1 registry row 1-1-savvas-try-it-1-lesson-1-1 embeds a LaTeX answer block in its prompt. It is preserved verbatim as requested; source cleanup belongs in Lesson_planning.
- scripts/blooket-template.csv is a student/correct/attempted score-import template, not a deck template. The deck uses the existing flashcard parser’s Question # / Question Text / Answer 1..4 / Time Limit (sec) / Correct Answer(s) columns plus source. All 14 cards also have deck.sources.json entries.
- Migration 0038 was verified locally with PGlite; it has not been applied to a live database. Production boot supplies the Supabase pacing/rescore store explicitly. Deployment must include content/a2 and lib/a2-answers.js alongside roster-server.
- Teacher score writes are serialized per student within the current single roster-server instance. Multi-instance deployment would need a shared attempt allocator.
- Topic assessments receive their first recorded date as their grading date; replacement attempts retain it. No separate topic-assessment due-date schedule was invented.
- Existing flashcard commits, v3 grading, receipts/transcripts, and inherited service configuration remain. The ten named root baseline failures remain unchanged.
- OfflineQueue coalesces unsent taps to the latest value per student/item; each write accepted by the server retains its own numbered attempt and receipt. Teacher keys are not stored in queued records.

GitNexus upstream evidence: state/cross-agent/phase4-impact.jsonl. Indexed factories, signup helpers, deck lint and harness helpers returned LOW (up to two direct callers; the fetchable-file helper touched one process). New district and inline UI symbols often returned UNKNOWN. No HIGH/CRITICAL result was reported for these lookups. No pre-commit detect_changes was applicable because no commit was made.


## Phase 4b ? bonus window, retakes, Start Here

Implemented 2026-09-13. `bonusOnlyThrough: '2026-09-18'` is an inclusive school-timezone due-date cutoff; null disables it. Due, unattempted bonus items contribute neither earned nor possible points or minimum counts. Phase 4b originally counted attempted items normally; Phase 4d below supersedes that behavior with the only-raise rule. Later missing due work remains zero. Each category exposes `bonusWindowExcluded`. The district and A2 v3 selectors agree. The ceiling keeps unattempted bonus work completable while the quarter is open, excludes it after close, and never falls below the live grade.

Topic assessments allow any number of retakes, with the latest score replacing the earlier one. Makeup and retake times are announced in class. This copy appears in Start Here, the shared Do Now/My Gradebook category display, teacher help, and README. Existing quarter-close guards, first grading dates, and Try-It rescore rules remain unchanged.

Start Here now has the five requested sections, four-row grading table, unchanged district playground, and final Desk link. Its five sections contain **356 words of prose**, excluding table and playground. The dashboard header reads the shared configuration and displays ?Bonus-only through Sep 18? without an edit control. Desk category rows show the number of bonus items not yet attempted.

The Phase 3 worked-example table above is updated by Phase 4d to pin the corrected only-raise arithmetic. Added checks cover Sep 18 inclusivity, attempted zero, later missing work, school-timezone midnight, closed-quarter exclusion, v3 selection, excluded counts, five headings, four table rows, copy bans, and the read-only header. The existing Phase 4 student journey now correctly expects 100% with five Try-Its and one deck excluded. Configuration snapshots were regenerated with UPDATE_M2B_GOLDEN=1; the browser bundle was regenerated with node scripts/build-grade-engine.mjs.

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 162 | 156 | 6 | 2671 | 10 | 13 |
| roster-server | 76 | 76 | 0 | 1346 | 0 | 3 |
| pytest | ? | ? | 0 | 155 | 0 | 0 |

Root failure full-name set is exactly equal to phase4-root-final.json: no new failures. Server and pytest exit 0; pytest retains two datetime.utcnow deprecation warnings. Final reports: state/cross-agent/phase4b-root-final.json and phase4b-server-final.json. Commands: root and server npx vitest run --reporter=json with those output paths; C:/Python313/python.exe -m pytest tests/ -q --tb=short --basetemp=state/cross-agent/phase4b-pytemp-final. Focused UI/journey verification also passed all six tests.

Files changed/generated:

- `roster-server/grade-config.js`
- `roster-server/district-grade.js`
- `roster-server/a2-v3-grade.js`
- `grade-engine.bundle.js`
- `desk.html`
- `teacher-dashboard.html`
- `start-here.html`
- `README.md`
- `roster-server/tests/district-grade.test.js`
- `roster-server/tests/a2-phase4.test.js`
- `tests/a2-surfaces.test.js`
- `tests/journeys/a2-check.journey.test.js`
- `tests/remaining-feature-contracts.test.js`
- `A2_FORK_BASELINE.md`
- `roster-server/tests/fixtures/m2b-invariance/sy2627-empty.json`
- `roster-server/tests/fixtures/m2b-invariance/sy2627-env-schedule-override.json`
- `roster-server/tests/fixtures/m2b-invariance/sy2627-frq_work.json`
- `roster-server/tests/fixtures/m2b-invariance/sy2627-mixed.json`
- `roster-server/tests/fixtures/m2b-invariance/sy2627-quiz_partial.json`
- `roster-server/tests/fixtures/m2b-invariance/art-hashes.json`

Unsure / left in place:

- Quarter-close entry guards and original topic-assessment grading dates remain unchanged; no automatic next-quarter rollover or makeup schedule was invented.
- Try-It rescoring cutoff remains unchanged.
- Superseded by Phase 4d: attempted bonus-window work now counts only when it does not lower the running category average.
- Empty categories still renormalize; an entirely empty quarter retains null grade and ceiling. Completed scores stay fixed in the ceiling; omitted bonus items remain completable only through quarter close.
- Schoology synchronization behavior is unchanged; its current completed-item reconciliation remains as documented in Phase 3.
- GitNexus returned UNKNOWN/target not found for quarterGradeDistrict, computeA2V3, and renderA2Categories. Current callers were inspected directly. No git commands or commits were run.


## Phase 4c ? This week chip

Implemented 2026-09-13. The Desk Do Now card and teacher scoring header share a read-only, plain-text ?This week? chip. Teacher menu ? Pacing opens the existing teacher page with a ?This week (students see this)? textarea, visible ?Student-facing info only ? no staff names, no PD, no private data.? hint, live n/280 counter, Save announcement button, and current/next Monday selector. Separate drafts preserve text when switching the selector. Save sends only { text, weekOf } via PUT using the page's existing teacher credentials.

- Public GET /announcement returns { text, weekOf, updatedAt } for the current school-timezone Monday, or exactly { text: null }. No teacher credentials or updated_by are exposed. Responses use Cache-Control: no-store.
- PUT /teacher/announcement uses the same requireTeacher helper as /teacher/lessons (teacher key or verified teacher token). Writes use the shared fixed-window rate limiter, 30 writes per minute per IP. Unauthorized requests return 403, invalid input 400 with a reason, throttled writes 429, and storage failures 503 without private database details.
- Text is stripped of HTML tags, whitespace is flattened to one line and trimmed, and nonempty text is limited to 280 characters. Email addresses, phone numbers with 7+ digits (including separators), and URLs/www./bare domains are rejected. Both original and cleaned text are checked. A valid ISO Monday is required. Empty cleaned text deletes only that week's row.
- Migration 0039_announcements.sql creates announcements(week_of date primary key, text text not null, updated_at timestamptz not null, updated_by text). RLS is enabled; only service_role has table access. The server lazily uses its existing Supabase service credentials. A verified token ID is recorded as updated_by; key-only writes record null, never a secret.
- The client uses grade-config's schoolTz through the shared browser grade bundle. The a2_announcement localStorage entry includes weekOf. Offline mode shows only the current week's cached note. Null responses clear the cache; online fetch errors hide the chip. Focus, connectivity, visibility, storage changes, and week rollover refresh it. The service-worker core and offline pack include the new assets.

Files changed:

- roster-server/announcements.js
- roster-server/migrations/0039_announcements.sql
- roster-server/server.js
- a2-announcement.js
- a2-announcement.css
- desk.html
- teacher-tryits.html
- sw.js
- scripts/build-offline-pack.mjs
- roster-server/tests/announcements.test.js
- tests/a2-announcement.test.js
- tests/journeys/fake-roster.js
- A2_FORK_BASELINE.md

Verification:

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 163 | 157 | 6 | 2682 | 10 | 13 |
| roster-server | 77 | 77 | 0 | 1375 | 0 | 3 |

Root exits 1 with the exact same ten full test names as phase4b-root-final.json; there are no new failures. Server exits 0. Added 11 root jsdom tests and 29 server tests, including public reads, teacher-key/token auth, student rejection, each validation rejection class, current/next selection across Sunday-to-Monday school midnight, delete-on-empty, throttling, storage errors, and a PGlite migration/persistence check. Browser checks cover rendering, null/error hiding, current/stale offline cache, timezone/year boundaries, editor hint/counter, actual Pacing wiring, and authenticated PUT payloads for both Mondays. The journey fake roster now returns { text: null } for the new public route.

Commands: root npx vitest run --reporter=json --outputFile=state/cross-agent/phase4c-root-final.json; roster-server npx vitest run --reporter=json --outputFile=../state/cross-agent/phase4c-server-final.json. Reports and logs are in state/cross-agent/phase4c-*. The first root run exposed two unhandled-endpoint harness failures; the final full rerun passed those after adding the fake route. No server implementation changed after its green full run.

Unsure / left in place:

- Migration verified locally with PGlite; it has not been applied to a live database.
- Staff names, PD, and other private context remain a teacher editorial responsibility, reinforced by the visible hint. Automated validation enforces the requested email/phone/URL restrictions; it does not attempt name or topic classification.
- GET intentionally exposes only the current week. Next-week editing starts with a blank local draft; no additional public future-week read endpoint was added.
- The inherited ten root failures and existing grading, scoring, authentication policy, and deployment configuration remain. Pytest was not requested or run for this phase.
- GitNexus evidence: state/cross-agent/phase4c-impact.jsonl. createApp and createFakeRoster returned LOW with one direct caller each and no affected processes; inline/new symbols returned UNKNOWN. No HIGH/CRITICAL result was returned. No git commands, commits, or other-repository edits were made.


## Phase 4d ? only-raise bonus rule

Implemented 2026-09-13. The teacher correction, ?a bonus by definition can only raise,? supersedes Phase 4b's attempted-work behavior. For each quarter/category, required due items establish earned/possible totals (missing work earns zero). Attempted bonus candidates sort by descending earned/possible ratio, then descending possible points, then ascending itemId. The first candidate counts when the base is empty; later candidates count only when they preserve or raise the running average. Equal ratios count. Unattempted bonuses remain excluded. A null cutoff disables both bonus exclusions and only-raise selection.

Each category now reports `bonusWindowIgnored: { count, itemIds }` for attempted bonuses not counted, alongside the existing numeric `bonusWindowExcluded`. Ignored items contribute neither points nor minimum counts. The shared selector also protects each v3 source track while preserving its existing weights and gates. The browser grade bundle is regenerated.

Pinned results (the worked-example table above replaces the Phase 4b rows):

1. Sep 22 check 10/10 plus Sep 15 check 5/10: Assessments **100%**, 10/10; the Sep 15 item is ignored.
2. Empty base, attempted bonus Try-Its 2/2 and 0/2: Assignments **100%**, 2/2; the zero is ignored.
3. Sep 25 Try-It 1/2 plus bonus 2/2: **75%**, 3/4. Separately, plus bonus 1/2: **50%**, 2/4; the equal-ratio bonus counts.
4. Equal-ratio candidates C=2/4, A=1/2, B=1/2 always select in C, A, B order and produce **50%**, 4/8. Against a perfect required base, all three are ignored in the same order and the grade remains **100%**.
5. `bonusOnlyThrough: null`: missing Sep 15 check plus perfect Sep 22 check is **50%**, 10/20, with no bonus exclusions or ignored items. An attempted 5/10 instead counts normally and yields **75%**.

Start Here includes the teacher's exact only-raise sentence, preserving the rest of the section. The teacher header reads ?Bonus-only through Sep 18 (only-raise)?. Desk category rows display ?n bonus not attempted ? m bonus not counted? whenever either count is nonzero. README and Desk explanatory copy reflect the correction; pinned copy tests are updated.

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 163 | 157 | 6 | 2682 | 10 | 13 |
| roster-server | 77 | 77 | 0 | 1381 | 0 | 3 |
| pytest | ? | ? | 0 | 155 | 0 | 0 |

Root's final failure full-name set exactly matches `phase4c-root-final.json`; there are no new failures. Server and pytest exit 0. Pytest retains the two existing datetime.utcnow deprecation warnings. Focused grading and copy checks passed 29 and 5 tests respectively. Full commands: root and roster-server `npx vitest run --reporter=json --outputFile=...`; `C:/Python313/python.exe -m pytest tests/ -q --tb=short --basetemp=state/cross-agent/phase4d-pytemp-final`. Final reports/logs are `state/cross-agent/phase4d-root-final.*`, `phase4d-server-final.*`, and `phase4d-pytest-final.log`.

Files changed:

- `roster-server/district-grade.js`
- `roster-server/a2-v3-grade.js`
- `grade-engine.bundle.js`
- `desk.html`
- `teacher-dashboard.html`
- `start-here.html`
- `README.md`
- `roster-server/tests/district-grade.test.js`
- `tests/a2-surfaces.test.js`
- `A2_FORK_BASELINE.md`

Unsure / left in place:

- Ceiling projection retains completed scores, open-quarter recovery, closed-quarter exclusions, and the live-grade floor.
- The v3 selector applies the same only-raise arithmetic within each source track; existing track weights and two-track gates remain. Its categoryBreakdown remains the district category breakdown as before.
- Schoology completed-item reconciliation, assessment grading dates, quarter-close guards, and Try-It rescoring policy remain unchanged.
- GitNexus upstream impact returned UNKNOWN/target not found for quarterGradeDistrict, computeA2V3, renderA2Categories, and renderBonusWindow. Direct callers were inspected; no HIGH/CRITICAL result was returned.
- No git commands, commits, deployment, or other-repository edits were performed.
- The first full root run had four extra exact-source failures caused by CRLF conversion in desk.html. Restoring LF resolved all four in the final full rerun.


## Phase 4e — Open House handout + sweep

Implemented 2026-09-13. Added a single-file caregiver handout generated from Start Here, linked from the landing page and Teacher menu. Its average-day paragraph, grading table and four rules, formula, minimums, live-grade/ceiling explanation, only-raise add/drop copy, and quarter dates are copied from the same source. The three-line Where to look box contains no personal contacts. Regenerate with `node scripts/build-open-house.mjs` after changing Start Here; four tests pin verbatim policy, regeneration parity, navigation, and print/privacy structure.

Removed dormant app-window headings, unused animation/video CSS and mobile videos metadata; rewrote obsolete comments and visible exam-era labels. Preserved every existing named function and receipt helper. Removed the duplicate quarter-close section, retaining the Dates section and Desk button. Archived the old AI integration analysis under docs/apstats-history/ and replaced the root file with current pointers; README/CLAUDE/AGENTS now point to history and acknowledge the published lesson.

The one-pager has **365 words** (printed main content, including title/table/box, excluding navigation). Headless Chrome produced **one Letter page (612 × 792 pt)** with 0.6in CSS margins and no printed buttons or URL. PDF text and the rendered page were inspected. Artifacts: `state/cross-agent/phase4e-open-house.pdf` and `.png`.

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| root | 164 | 158 | 6 | 2686 | 10 | 13 |
| roster_server | 77 | 77 | 0 | 1381 | 0 | 3 |

Root failure full-name set exactly equals phase4d-root-final.json: the same ten inherited failures, no regressions. Server exits 0. Commands: root `npx vitest run --reporter=json --outputFile=state/cross-agent/phase4e-root-verified.json`; roster-server `npx vitest run --reporter=json --outputFile=../state/cross-agent/phase4e-server-final.json`. The first full root run also matched baseline; the final rerun includes the last cosmetic edits.

Case-insensitive matching-line counts for `AP Stat|Progress Check|Blooket warm|TI-84|Doge|wallet|tetris|Live Classroom` (equivalent to the requested grep -ciE):

| Student-facing file | Raw count | Non-generic leftovers |
| --- | ---: | ---: |
| desk.html | 20 | 0 |
| start-here.html | 0 | 0 |
| index.html | 0 | 0 |
| mobile-home.html | 0 | 0 |
| check.html | 0 | 0 |
| open-house.html | 0 | 0 |

Retained generic receipt/transcript references in desk.html (line: source):

- 10972: `var WALLET_ISSUERS = [`
- 10977: `function _walletB64UrlBytes(value) {`
- 10986: `async function _walletVerifyReceiptCompact(compact) {`
- 10991: `var data = _walletB64UrlBytes(parts[0]);`
- 10992: `var sig = _walletB64UrlBytes(parts[1]);`
- 10993: `for (var i = 0; i < WALLET_ISSUERS.length; i++) {`
- 10994: `var issuer = WALLET_ISSUERS[i];`
- 11308: `? '<img class="qr" src="' + _walletEsc(qrSrc) + '" alt="Verification QR code">'`
- 11326: `+ '<dt>Student</dt><dd>' + _walletEsc(transcript.u || 'Student') + '</dd>'`
- 11327: `+ '<dt>Quarter</dt><dd>' + _walletEsc(transcript.quarter || '') + '</dd>'`
- 11328: `+ '<dt>Grade</dt><dd>' + _walletEsc(String(transcript.grade || '') + '%') + '</dd>'`
- 11329: `+ '<dt>Item count</dt><dd>' + _walletEsc(transcript.count == null ? '' : String(transcript.count)) + '</dd>'`
- 11330: `+ '<dt>Sealed</dt><dd>' + _walletEsc(issued) + '</dd>'`
- 11342: `function _walletEsc(s) {`
- 11378: `function _walletVerifyAndCheck(r, statusEl, btn) {`
- 11382: `Promise.resolve(_walletVerifyReceiptCompact(r.compact)).then(function (sig) {`
- 11385: `? '✅ Signed by ' + _walletEsc(sig.issuer || 'the class server') + ' — genuine &amp; unaltered.'`
- 11411: `function _walletReceiptRow(r) {`
- 11476: `// Verify — signature + live gradebook presence (see _walletVerifyAndCheck).`
- 11497: `verify.onclick = function () { _walletVerifyAndCheck(r, verifyStatus, verify); };`

Files changed:

- `open-house.html`
- `scripts/build-open-house.mjs`
- `tests/open-house.test.js`
- `desk.html`
- `mobile-home.html`
- `start-here.html`
- `index.html`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `AI_GRADING_INTEGRATION.md`
- `docs/apstats-history/AI_GRADING_INTEGRATION.md`
- `A2_FORK_BASELINE.md`

Unsure / left in place:

- The 10 named pre-existing root failures remain unchanged; pytest was not requested or run for this phase.
- WALLET_ISSUERS and _wallet-prefixed receipt/transcript helpers retain their names and behavior. Every matching line is listed in grep_table.
- Legacy service aliases, practice metadata, storage keys, and the inert hasVideo branch remain unchanged; no deployment or grading behavior changed.
- GitNexus upstream impact returned UNKNOWN/target not found for _lessonsFromRoadmap and htm. Direct source inspection supplemented these results; no HIGH/CRITICAL warning was returned.
- The handout follows the requested content order. Open House rotation times were supplied as context and are not added to the Start Here policy copy.
- Regenerate open-house.html with node scripts/build-open-house.mjs whenever Start Here changes. Drift and generation parity are test-gated.

No git commands, commits, Claude Code calls, deployments, or external-repository edits were performed. GitNexus evidence: state/cross-agent/phase4e-impact.json and phase4e-htm-impact.json.


## Phase 5a ? deploy prep

Implemented 2026-09-14. Repo-side preparation only: no cloud actions, git commands,
commits, Claude Code calls, or other-repository edits. The deployment contract is
private `robjohncolson/a2-live-worksheets`, both Vercel and GitHub Pages for static
hosting, a new Railway service rooted at `roster-server`, and an existing shared
Supabase project isolated by schema `a2`.

All six live Supabase client factories now specify the resolved schema (default
`a2`). Server startup refuses `public` with a logged reason before constructing
clients; `/health` includes schema without removing existing fields. CORS accepts
comma-separated origins, warns and permits wildcard only when unset, and permits
no browser origins when explicitly empty. Tests cover startup refusal, factory
options, health, allowed/denied origins, and authenticated preflight.

`deploy/supabase_a2_bootstrap.sql` is generated from the 24 ordered migrations by
`scripts/build-bootstrap-sql.mjs`. Its schema-local checksum ledger prevents older
source constraints being replayed over populated A2 rows, rejects edits to applied
migrations, and makes retries safe. Tables and RPCs are created in `a2`; every RPC
retains an `a2` execution search path. Service-role grants include tables, sequences,
functions, and default privileges. All 19 tables have RLS, including the three
Schoology tables. The unnecessary pgcrypto installation was removed because the
required UUID function is built into PostgreSQL 13+. PGlite verifies regeneration
parity, two runs with an existing lesson-check row, the exact table list, RPC use
with a different caller search path, and no tables added to the default schema.

Fixed five explicit schema qualifications in migration 0036 and three references
in its/FRQ tests. The server JS/MJS/SQL scan has no remaining default-schema
qualification or explicit schema-selection hits. All server `.from`, `.rpc`, and
`.schema` calls were enumerated in `state/cross-agent/phase5a-db-calls.log`.

Vercel serves index.html at `/`. Pages deploys main with upload-pages-artifact and
deploy-pages, staging the same exclusions as Vercel. Both keep content/lib/data;
server code, SQL, docs, scripts, test artifacts, dependencies and local dotfiles are
excluded. Browser configuration accepts window.A2_CONFIG and has A2 URL fallbacks.
Inherited production hosts were replaced in shipped pages, tools, workflows and
test fixtures. The host regression scan excludes archived history and ignored
local runtime/agent artifacts. README and the fork plan point to the deployment
runbook. The Schoology wrapper now requires an environment-supplied A2 course ID
and passes it explicitly while retaining dry-run by default.

| Suite | Files | Passed files | Failed files | Passed tests | Failed tests | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root | 165 | 159 | 6 | 2689 | 10 | 13 |
| roster-server | 80 | 80 | 0 | 1388 | 0 | 3 |

Root failure full-name set exactly equals phase4e-root-verified.json. No new
failures. Final reports: state/cross-agent/phase5a-root-verified.json and
phase5a-server-final.json. Commands: root and roster-server `npx vitest run
--reporter=json --outputFile=...`. Pytest was not requested or run. Earlier checks
caught three old host fixtures, one old Vercel assertion, and an incomplete new
Storage mock; all are corrected in the final runs.

Ignore audit: the requested ignore patterns are present; `.env.example` has an
explicit exception so the deployment contract remains available. The plan,
baseline and history directory are not excluded. Git tracking/commit verification
belongs to the overseer because git commands were prohibited. The full tree audit
found 22 files over 5 MB in ignored dependency/GitNexus directories and one PDF,
state/cross-agent/phase4e-open-house.pdf (62,921 bytes), also ignored. No authored
content/a2 images need exclusion. Every path, size and recommendation is recorded
in state/cross-agent/phase5a-large-files.json and the task result JSON.

GitNexus CLI upstream checks preceded symbol edits. createApp: LOW, one direct
caller, no affected processes. createServiceClient: LOW, three direct callers,
one affected ingestion process group. serviceUrl: MEDIUM, five authentication/
enrollment callers, no affected processes. Other client factories had LOW
candidates (one direct caller each); some index entries resolve to old snapshot
files. Inline/SQL symbols returned UNKNOWN/not found and were inspected directly.
No HIGH/CRITICAL result occurred. No detect_changes was run because no commit or
git operation was permitted.

Unsure / left in place:

- Actual project URL/key, Railway domain, Vercel domain, A2 course IDs and account
  access remain teacher-supplied. No live migrations, hosting or smoke tests ran.
- Private-repository Pages requires an eligible GitHub plan; the runbook records
  this requirement without changing repository privacy.
- Existing optional AI routes, diagnostics Storage bucket, and legacy workflow
  variable aliases remain; this phase does not provision a separate AI service or
  Storage bucket. Legacy peer-answer cleanup stays best-effort and is now confined
  to a2 (the bootstrap does not invent an answers table).
- Bootstrap reruns skip applied migrations; future schema edits must be new
  migrations. Standalone migration execution must explicitly select schema a2.
- The inherited teacher seed in migration 0005 remains; on a fresh empty schema
  its username-specific update affects no rows.
