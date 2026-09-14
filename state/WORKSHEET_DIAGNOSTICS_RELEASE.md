# Automatic worksheet diagnostics - 2026-09-10

## Behavior
- All 69 worksheets load worksheet-diagnostics.js before the gradebook client and report after prior-answer hydration, including failed and empty reads. A watchdog reports initialization or stalled-client failures.
- Counts distinguish downloaded answer records for this exact worksheet, matching form fields, restored answers, matching visible answers, edited fields, and filled fields. No answer text, password, token, user agent, or IP is stored in a report. The browser identifier is random and local to that browser profile.
- The actual client build is stamped by scripts/bump-build.mjs. Reports include HTTP outcome, online status, and whether a service worker controls the page.
- Reports that fail to upload are kept in a separate bounded local queue (20 reports, up to seven days), retried three times and on reconnect/focus/sign-in. Only the report owner's session can replay them. Nothing changes grades, completion marks, or the answer queue.
- Teacher dashboard: Worksheet answer loading section, authenticated boot load and visible-page 60-second polling, manual refresh, student search, captured section labels, separate opt-in teacher previews, visible unavailable/no-report states. Reports are browser observations, not grade evidence.

## Backend and storage
- POST /student/worksheet-diagnostics validates an explicit field allowlist, bounds counts and identifiers, derives student identity/section from the roster, and enforces per-student minute/day throttles. Students cannot target another student.
- GET /teacher/worksheet-diagnostics is teacher-only, no-store, optionally section filtered.
- Diagnostic-only signature verification accepts authentic sessions expired within 30 days so the failure can be reported. Normal token verification is unchanged. Expired teachers cannot target another student or read reports.
- Private Supabase Storage bucket worksheet-diagnostics was provisioned with public=false, JSON-only content, 8192-byte object limit. No SQL migration or grade-table changes.
- Latest summary per section/student/browser/worksheet/mode; previous recent failure retained after recovery; older incoming reports cannot overwrite newer ones. Storage survives Railway restarts. Dashboard reads show observations from the last seven days and prune old objects as encountered. Up to 200 recent summaries per section / 400 per read; truncation is visible.
- No retrospective browser state exists. A student's updated browser must execute a worksheet and be able to reach the service (or reconnect later). Missing/unverifiable identity cannot be attributed safely; missing reports are explicitly not treated as missing work.

## Validation before deployment
- Roster full suite: 85 files passed; 1709 tests passed, 3 skipped (1712 total).
- New roster diagnostic tests: 14 passed, including forged/expired tokens, cross-student rejection, preview separation, stripped fields, storage outage, throttling, persistent summaries and cleanup.
- New browser diagnostic and teacher panel tests: 20 passed. Includes actual worksheet hydration, HTTP failures, timeout, watchdog, offline replay after reload, privacy allowlist, ownership, bounded retries, explicit storage acknowledgements, and all 69 hooks.
- Release regression selection: 8 files / 106 tests passed before the final additional privacy test. PWA build lockstep and worksheet recovery also passed.
- Wider frontend sweep: 3463 passed, 9 failed in two existing timing-sensitive teacher-console suites. Baseline HEAD dashboard reproduced a nudge-pagination failure; isolated current run had 2 failures / 42 passes. No existing console handlers were changed. The targeted gradebook, inbox, and dashboard-deeplink tests pass.
- Headless Edge with real local worksheet and dashboard scripts: 37 restored, 37 matched, automatic report received; student row shown; teacher-preview toggle reveals a second row; no page errors. Remote services were stubbed, so this test did not write student grades.
- Real private-storage smoke: write/read succeeded; public access denied (400); temporary diagnostic objects removed.

## Deployment verification
Initial implementation: fa453638cb7e1431a638a9be5e23c55ad7edad01. Pages succeeded and served build 2026-09-10-rxfu. Railway deployment 874b9bdf-194b-452c-b851-44b1bc03f196 succeeded; the live diagnostic route correctly returned 401 without authentication.

A final failure-path check found a real recovery race: a successful background ledger repair read cancelled the visible restoration retry after an initial 503. The new regression reproduced 0 restored vs 37 expected. Background repair reads are now explicitly marked and cannot cancel visible restoration retries. All 69 repair callers and the generator were updated. The regression and associated suites pass: 5 files / 636 tests. Existing static tests were adjusted only for the additive optional argument and to inspect the complete repair function rather than truncating it at 1600 characters. Follow-up build: 2026-09-10-3b6d. Final live smoke follows deployment.


## Final integration follow-up
The real worksheet also has an AI-grading background read. Restoration now opts in explicitly with `{ restore: true }`; no background reader can cancel the visible retry. The expanded regression and hydration/client suites passed 808 tests. A fresh hosted teacher dashboard now inherits the configured live service instead of silently defaulting to localhost; explicit saved choices and local development defaults are preserved (39 dashboard tests passed).

A headless Edge smoke against the LIVE roster service, using candidate frontend source during review, injected one 503 for Angie's read-only teacher preview. It observed 37 answers automatically restored, a persisted `loaded` report with `lastFailure: network`, and the dashboard hiding that report by default and showing it only when teacher previews were included. No grade writes occurred; the temporary report was removed. This test is intentionally a teacher preview and makes no claim about Angie's actual laptop. Final hosted-asset and deployment verification is performed after this follow-up push.


## Final published verification
- Runtime source: a0d38171997f30188db1cf4354ee1041e9302d3b (implementation fa45363, recovery follow-ups e75b630 and a0d3817).
- Pages deployment 34529696706: SUCCESS; build 2026-09-10-gpqb.
- Railway deployment 5b8a2080-a93b-4d9e-8fd2-c50cbe8e04fe: SUCCESS at a0d3817; health HTTP 200.
- All 69 hosted worksheet files fetched and verified to include diagnostics, final reporting, and explicit restoration reads.
- Full smoke repeated using ONLY PUBLISHED frontend assets and live roster/storage: injected initial 503; 37 answers automatically restored; live report downloaded/matched/restored=37; outcome=loaded; lastFailure=network; mode=teacher-preview; zero attempted grade writes. Live dashboard GET=200; preview hidden by default and visible when included. Temporary diagnostic report deleted successfully.
- Final build/diagnostic/panel selection: 49 tests passed (14 browser diagnostic, 7 panel, 28 PWA). Recovery/hydration/client selection: 808 passed. Teacher dashboard selection: 39 passed. Backend diagnostic selection: 14 passed; full roster suite previously passed 1709 with 3 skipped.
- CI 34529696839 remains red with exactly the same 22 failing test names and 8 normalized type errors as pre-task CI 34507527813 (commit 4b2512e). No new CI failure names or type errors. Existing stale GitNexus shadows, lineage/structure pins, and grade-engine type errors are outside this change; they are not represented as green.
- Reports from Angie's actual laptop still require that updated laptop to open the worksheet and reach the service. The smoke was an explicitly separated teacher preview, not evidence of her laptop's state.
