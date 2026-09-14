# Deferred grade-loss hardening: release review

Implemented locally on Athena, 2026-09-10. **NOT PUSHED. No build bump.**
Baseline: follow-alongs `445a243`; curriculum_render `c8bc8aa`. Park work remains shelved.
User requested one local commit per task and orchestrator-owned review, build bump, and push-by-hash.
This packet is committed separately so it can name every implementation commit.

## Task 1: parked offline answers

- follow-alongs: `c6000274eaa15404f9d7685efa2f0814adff7b1a`
- curriculum_render: `389e00597210cc3c2d2d8db14fd23e4dc70785d2`
- Files in both repos: `offline-queue.js`, `gradebook-client.js`.
- Tests: follow-alongs `tests/offline-queue.test.js`, `tests/gradebook-client.test.js`; curriculum_render `tests/offline-gradebook.test.js`.

| Acceptance criterion | Result and evidence |
|---|---|
| Non-ok HTTP status reaches replay from ledger and PC POSTs | ✅ Raw HTTP results carry status; ledger integration test "12 HTTP 500s park the stored row; a 13th sync makes no fetch and shows one banner". PC branch inspected; existing full feeder suite passes its PC tests. |
| Stored serverFailures defaults to 0; only 5xx consumes attempts; lastServerError records status/time | ✅ "401, 429, unreachable sends and ownership/auth refusal do not consume attempts" and "parks after 12 server failures, exports flagged work, and a fresh edit resets it", in both repos. |
| Failure compare/update cannot charge a newer edit | ✅ "a failed older send does not charge a newer edit", both repos; real browser IndexedDB race smoke below. IndexedDB read/update uses one readwrite transaction. Feeder compares ts; worksheet compares transportSequence, preserving its existing supersession identity. |
| 12 failures park, 13th drain skips; all/parked retain work; fresh enqueue resets | ✅ Queue cap/reset test and real HTTP client integration in both repos. |
| Once-per-page banner and console warning of parked keys | ✅ Client integration removes the first banner, syncs again, and checks no replacement banner/no extra fetch. Alert uses textContent and existing nudge styling. |
| Export includes parked:true; existing public record reasons/shapes and ownership remain | ✅ Queue export test; unchanged feeder-record-contract.property suite; existing shared-device tests. HTTP status is internal metadata stripped from public record failures. |
| Worksheet backoff stops with only parked work | ✅ "stops the offline scheduler when only parked rows remain", advances fake time two hours and checks no additional reads/POSTs. |

Real Edge IndexedDB verification (both actual queue files, local HTTP origin, isolated browser contexts): persisted 11 failures across reload; twelfth failure parked; subsequent drain skipped; export flagged; fresh edit reset; failure resolving after a newer enqueue did not charge the new row. Output:
```
curriculum_render {"durableAcrossReload":true,"cap":true,"export":true,"freshEdit":true,"race":true}
follow-alongs {"durableAcrossReload":true,"cap":true,"export":true,"freshEdit":true,"race":true}
```

## Task 2: inbox polling lifecycle

- follow-alongs: `c5ed68592f1798533418c0e0d6cae8bc3dcb4932`
- Files: `teacher-dashboard.html`, `tests/teacher-inbox.test.js`.

| Acceptance criterion | Result and evidence |
|---|---|
| 401/503 stops an active interval and displays unavailable once; manual class load restarts | ✅ parameterized "%s stops polling until an explicit load retries it": starts timer before response, advances 120s with only one fetch, then manually retries and verifies polling resumes. |
| Network failures keep polling | ✅ "network errors keep polling". |
| Boot fetch/poll only when teacherAuthHeaders is nonempty | ✅ parameterized "boot loads only with credentials: %s" for token/null. |
| Read markers belong to the fetched section, not edited filter | ✅ "marks the fetched section even if the filter changes while loading or before mark-read". Superseded requests are ignored by request number. |
| Existing drawer/render/deeplink/gradebook behavior preserved | ✅ existing teacher-inbox tests, teacher-student-console-dashboard-deeplink and teacher-gradebook suites. |

Changed existing test fixture: the mark-read test now sets the fetched `_inboxSection` instead of assuming typing a filter changes the displayed inbox's section. This is the behavior Task 2 explicitly changes; noted in the commit message. No test expectations were loosened for failures.

## Task 3: Desk expired-session prompt

- follow-alongs: `33759c1f1935ef6c065cae5528ecf9fd88e2c0d6`
- Files: `ap_stats_roadmap_square_mode.html`, new `tests/desk-session-expired.test.js`.

| Acceptance criterion | Result and evidence |
|---|---|
| Live grade 401/403 with current stored token prompts once with requested notice | ✅ parameterized "live %s opens a dismissible modal once without changing saved evidence". |
| Network errors, null response, 503, malformed JSON do not imply sign-out | ✅ parameterized "%s does not open a sign-in modal". |
| No clearing marks/cache/latch/Desk keys; dismissal remains possible; no signOutStudent/reload | ✅ storage snapshot equality before/after rejection and dismissal; source diff adds only prompt branch and replay calls. Existing restoration/classification paths unchanged. |
| View-as untouched | ✅ "view-as %s does not prompt" covers both context and __VIEW_AS_STUDENT_ID__; entire desk-view-as suite passes. |
| Same-tab successful sign-in replays under the written session, without propagating replay failure | ✅ parameterized "%s replays the queue after storing the new session" tests submitSignIn and primary name-finder _nfSubmitPassword. |
| Late rejection of a replaced token cannot interrupt the new session; typing survives an already-open modal | ✅ "an old-token response cannot interrupt a newly signed-in session or erase typed credentials". |

JSDOM test loads actual Desk markup and executes the real named functions with unrelated services stubbed, matching the existing desk-view-as extraction pattern. It does not claim a full authenticated production-browser test.

## Task 4: coalesced scheduled drains

- follow-alongs: `f9b2f71db1799560ad6943a76d94cddd5312a4ad`
- Files: `gradebook-client.js`, `tests/gradebook-client.test.js`.
- ✅ _offlineDrainInFlight/_offlineDrainRerun prevent overlapping scheduler-triggered batches; triggers during the await request one rerun after completion. Backoff remains separate from immediate rerun.
- ✅ "coalesces online/storage triggers until the in-flight batch resolves, then sends fresh rows": holds first POST pending, enqueues another item, fires storage/online, verifies only one POST until resolution, then exactly one POST for the new item and no later duplicate.
- Scope: this serializes `_scheduleOfflineDrain` batches as requested; it does not introduce a new global lock around every possible direct caller of syncOfflineQueue.

## Exact verification command tails

### Requested follow-alongs command
```
npx vitest run tests/offline-queue.test.js tests/gradebook-client.test.js tests/feeder-record-contract.property.test.js tests/teacher-inbox.test.js tests/teacher-student-console-dashboard-deeplink.test.js tests/teacher-gradebook.test.js tests/desk-session-expired.test.js tests/desk-view-as.test.js tests/pwa.test.js
 ✓ tests/teacher-inbox.test.js  (14 tests) 3979ms
 ✓ tests/desk-session-expired.test.js  (11 tests) 4266ms

 Test Files  9 passed (9)
      Tests  235 passed (235)
   Start at  08:32:13
   Duration  8.29s (transform 699ms, setup 3ms, collect 12.30s, tests 18.44s, environment 11.11s, prepare 5.88s)
```

### All Desk suites plus PWA (PowerShell expands the glob)
```
$deskTests = @(rg --files tests -g 'desk-*.test.js')
npx vitest run @deskTests tests/pwa.test.js
 ✓ tests/desk-nudge-toast.test.js  (16 tests) 69ms
 ✓ tests/desk-guest-chat.test.js  (4 tests) 28ms

 Test Files  72 passed (72)
      Tests  1059 passed (1059)
   Start at  08:31:36
   Duration  29.46s (transform 4.23s, setup 22ms, collect 76.99s, tests 39.12s, environment 106.98s, prepare 68.15s)
```

### follow-alongs/roster-server
```
npx vitest run
 ✓ tests/grade-sim-fixes.test.js  (9 tests) 8035ms
 ✓ tests/grade-sim-invariants.test.js  (5 tests) 9948ms

 Test Files  84 passed (84)
      Tests  1695 passed | 3 skipped (1698)
   Start at  08:28:55
   Duration  57.18s (transform 13.70s, setup 30ms, collect 234.41s, tests 282.71s, environment 94ms, prepare 93.81s)
```

### curriculum_render root
```
npx vitest run

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 61 passed (62)
      Tests  1 failed | 1637 passed (1638)
   Start at  08:28:37
   Duration  31.22s (transform 6.27s, setup 0ms, collect 42.50s, tests 20.20s, environment 69ms, prepare 54.41s)
```

❌ `tests/build-stamp-fresh.test.js` is the sole feeder failure: `gradebook-client.js` has a newer commit than the release stamp. **Expected pending orchestrator build bump; deliberately not fixed because the task prohibits running bump-build.mjs.** All 1,637 other feeder tests pass. This is a required release check to rerun after the bump, not a claim of an entirely green feeder run.

Initial local Desk run had two LF-sensitive source assertion failures because the edit tool wrote CRLF. Restored LF and reran all 72 Desk/PWA suites: all green. No tests changed to excuse those failures.

## Scope / handoff

- ✅ Four bounded tasks locally committed; no push, deployment, build bump, generated bundle, worksheet-wide change, or new production file.
- ✅ Only own paths staged. Pre-existing AGENTS/CLAUDE/.claude changes, relay railway-server work, scripts, logs and other untracked files preserved.
- ✅ GitNexus impact invoked before production-symbol edits; queue/client symbols low individual risk. Feeder aggregate staged analysis high because recording/storage touches 11 indexed flows; targeted and full feeder tests run. HTML functions absent from index (UNKNOWN): direct callers and source diffs reviewed instead. detect_changes run on each staged task.
- ❌ Release (adversarial review, bump, push by hash) intentionally remains with orchestrator.
- Test logs are local temporary files: deferred-targeted-tests.log, deferred-desk-tests.log, deferred-roster-tests.log, deferred-curriculum-tests.log under the Windows TEMP directory.
