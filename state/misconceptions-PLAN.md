# Persistent misconceptions implementation plan

Execution date: 2026-09-11. Never push. Preserve existing workspace edits.

## Data flow

Read-only prompt files (all 69) -> VM rubric enumeration -> draft rubric map
Read-only curriculum.js + answer-key + skill taxonomy -> draft distractor map
Both maps + controlled vocabulary -> deterministic signal extraction
Existing class roster + fanLedger/getLedgerByStudent -> windowed events
Events -> student persistence + class persistence + capped evidence
Teacher auth -> section/window cache (60 seconds) -> GET /class/misconceptions
Same computation -> review-by-item topMisconceptions -> existing review consumer
Dashboard section/window controls -> textContent rendering -> evidence expansion
Nudge action -> existing composer (teacher sends); worksheet action -> existing lesson

## Four commits

1. Vocabulary (40–60 NEW CED tags), both map builders, exhaustive drafted maps,
   map tests, and this plan. Every draft carries reviewed:false and provenance.
2. Pure misconceptions module, config block, authenticated cached class endpoint,
   shared computation integration, and server tests. No grade or ledger writes.
3. Dashboard panel, Nightly Review payload/consumer line, and UI tests.
4. Verification JSON and roster-server README documentation.

## Existing callers (git grep inventory before editing)

Commands run: `git grep -n -E 'mountClass\(|mountReview\(' -- '*.js'` and
`git grep -n '_paintReviewByItem(' -- '*.html' '*.js'`.

- mountClass: roster-server/server.js:1145 (createApp),
  roster-server/tests/class-blank.test.js:47. Definition: class.js:170.
  Other class tests exercise it indirectly through createApp.
- mountReview: roster-server/server.js:1213 (createApp),
  roster-server/tests/review.test.js:105 (mountServer). Definition: review.js:169.
- _paintReviewByItem: ap_stats_roadmap_square_mode.html:17645 (_reviewRefresh);
  definition at 17934. gitnexus-shadow contains a duplicate generated mirror.
- PHASE3_CONFIG: only add the independent misconceptions block; no existing
  scoring values change. It is configuration, not a function.
- Dashboard: add independent functions and listeners; reuse existing auth and
  composer helpers without modifying their definitions.
- listRoster and fanLedger: reuse unchanged. getLedgerByStudent already selects
  `*`, including response and frq_result; no projection change is necessary.

Extend this inventory and run upstream impact analysis before modifying any
additional existing function. GitNexus's stale index includes baseline duplicates;
use exact symbol UIDs. Initial mountClass analysis: LOW, direct createApp caller,
two impacted symbols, zero named execution processes. Refresh is in progress.

## Planned tests

- tests/misconception-maps.test.js: source coverage, wrong letters only, valid
  vocabulary/skills, draft metadata, deterministic builders and --check.
- roster-server/tests/misconceptions.test.js: MCQ and FRQ extraction, exact/fuzzy/
  unmatched resolution, verbatim mistakes, persistence thresholds, windows,
  sorting, evidence cap, draft flags, and immutable inputs.
- Endpoint harness: teacher authentication, empty section, section isolation,
  cache by window/section, and shared review computation.
- tests/teacher-dashboard-misconceptions.test.js: fixture rendering, draft pill,
  evidence expansion, textContent/XSS safety, controls and composer actions.
- Review consumer test: recurring-misconceptions line from fixture payload.

## Verification

Run both builders with --check, roster-server npm test, and root npm test.
Compare root failure names with state/pairing-v2-and-exit-bonus-verification.json;
do not fix known unrelated failures. Run pure-module smoke against available
local real rows or a clearly identified fixture; record the top five labels.
Run GitNexus detect_changes before each commit and review staged hunks. Stage
only this task's changes, using git add -p for shared files. No scratch directories
under state; use TEMP or test-results. If a requirement cannot be satisfied,
stop and report the concrete blocker instead of introducing a special case.

## Implementation refinements and final caller inventory

- Diagnostic configuration lives in TEACHER_DIAGNOSTIC_CONFIG.misconceptions in
  grade-config.js, outside PHASE3_CONFIG. Full-suite verification caught that
  adding diagnostics to PHASE3_CONFIG changed frozen-config golden snapshots.
  The separate block leaves those snapshots and all grading functions unchanged.
- The generated grade-engine bundle is refreshed only for the new unused
  diagnostic constant and source hash; no grading function changes.
- Builders synchronize byte-identical roster-server/data copies for standalone
  Railway deployments. The runtime does not require the parent repo directory.
- The endpoint adds worksheetLinks, derived from rubric source filenames, so
  split topics link to actual combined worksheets (for example 4.4 to
  u4_lesson3-4-5_live.html). Nightly Review also adds topMisconceptionsDraft so
  its one-line summary labels draft results.
- git grep caller inventory: computeMisconceptions and loadMisconceptionAssets
  are called in class.js and review.js; computeMisconceptions is also called by
  the new pure-module tests and smoke script. Graph risk LOW for both through
  mountClass/createApp; review integration was added afterward.
- misconceptionActions is called only by renderMisconceptions for class rows
  and student entries (teacher-dashboard.html). Its first graph lookup could
  not resolve the newly added symbol; DOM tests cover the actual source.
- _paintReviewByItem is called by _reviewRefresh at
  ap_stats_roadmap_square_mode.html:17645. The first graph lookups failed because
  the live HTML shadow was excluded or timed out; a baseline copy is not an
  authoritative impact result. The actual HTML source was tested directly.
- Generated HTML shadows are refreshed with scripts/gitnexus-shadow.mjs.
- Initial map commit: 96808e6. The server commit is amended with the deployment
  copies, combined-worksheet links, and isolated diagnostic configuration before
  the dashboard/review commit, preserving four final commits.
- Root test runs use two workers after the unrestricted run showed timing
  failures under heavy concurrent load. No known pre-existing test is changed.
- Final graph refresh succeeded: live _paintReviewByItem has one direct caller,
  six impacted symbols, LOW risk; misconceptionActions has one direct caller,
  two impacted symbols, LOW risk. Neither has named affected execution processes.
- Final suites: server 1,758 passed / 3 skipped; root 9,966 passed / 23 known
  failures / 1 skipped. Exact failure names are in the verification JSON.
