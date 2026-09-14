# E Wednesday double block implementation plan

Status: completed; current invocation authorizes unlimited files, verification and exactly three commits. Never push.

Baseline HEAD: 94394648329204c91087338b2cd1199f83bc7a0a. Existing unrelated modifications and untracked Schoology logs are excluded. Initial B-column assertion passed (1 test) before application edits. Captured SHA256 of all existing JSON B-field lines: a212bb52dcca76c7b968a9b07eb882c80fa20432df6f589c84defb70bbc7f142. The additive dayGroups.B empty array is outside the original column.

## Current-code audit (completed before implementation)

Acorn parsed the current Desk shadow and walked every noncomputed `.t` access. The complete enclosing-reader list is below; numbers are pre-edit HTML lines. `.t` is never accessed through computed properties in the schedule consumers. Full-member handling applies only to explicit group arrays; legacy joined cells retain their original rendering and completion fallback.

| Reader | Lines | Disposition |
| --- | --- | --- |
| `_orderedPeriodTopics` callbacks | 7848-7849 | Keep day identity as one chronological gate step. |
| `maybeBumpThenOpen` | 7986 | Member-aware Do Now matching, full cell passed onward. |
| `injectPcPosterEvents` | 9729 | No change; operates before pairing on unchanged pacing. |
| `generateSchedule` | 10004 | Four-condition E-only placement; full member cells. |
| `_lessonCoachHtml` | 11087 | No internal change; call for each resource member. |
| `showResourcePanel` | 11107-11433 | Loop full members with individual OLD resource/progress keys; unique tutor IDs; preserve group for refresh. |
| `_lessonDateMap` | 18055-18057 | Resolve member keys to same date. |
| Tetris `_todayLessonDone` method | 19057 | No change; joined day key resolved by completion oracle. This is Tetris break awareness, not Classroom. |
| `_ti84TodayTopic` | 21955 | First member present in calculator map. |
| `cls` | 23437-23440 | Member CED unit; original legacy color. |
| `htm` | 23454-23460 | All member labels and existing 2x badge. |
| `cellAria` | 23477-23485 | All labels and member readiness. |
| `_summerWeeks` callback | 23545 | Lookup full member names; keep summer behavior. |
| `rCal._wkIdxForTopic` | 23646 | Match group or member. |
| `rCal` | 23746-23824 | Day identity for DOM/gate/click; cache full today cell before paging. |
| `_computePace` | 23910 | Flatten/deduplicate both total and expected lessons. |
| `rProg` | 23920-23925 | Count member lessons and use member CED metadata. |
| `sTip` | 23992-24015 | All labels and member registry sync states. |

The derived consumers below were read against current source: `_focusTodayLessonVideo` already opens the full cell; `_renderTodayTopics` does not yet exist and will be added. `appLaunchUrl` uses `_ti84TodayTopic`, so its mapped-topic path needs no edit. `openDayGrade` selects every server lesson by date. `paintLocalDoneCells`, `paintDonowCells`, `calNextUpTopic`, `_prevTopicInSequence` retain day identities and delegate aggregate completion. Registry lookup helpers retain legacy behavior; new groups call them per member. Resource/status helpers must not create joined server keys. Offline resource identity remains OLD-keyed.

## Consumer disposition

Source: `git show codex-packing-paused:state/schedule-packing-consumers.md`, reconciled with the new Wednesday-only spec. No packing code, branch changes, or Schoology logs were imported.

| Consumer | Single behavior | Group behavior / disposition |
| --- | --- | --- |
| `d`, new `groupTopics` | Keep complete cell and topic key | Retain complete ordered members; expose individual keys; preserve historical joined-string rendering |
| `generateSchedule` / proposed placement helper | Existing placement | Pair only E Wednesdays on/after Sep 14, excluding early release, with two plain same-unit lessons |
| `injectPcPosterEvents` | Existing injection | Leave entirely unchanged; pair only after injection |
| Calendar topic metadata / labels | Existing labels and units | Resolve member labels and unit; inspect current implementation before adding helpers |
| `_orderedPeriodTopics` | Chronological day identity | Keep a grouped day as one gate step |
| `_isLessonComplete` | Existing per-topic oracle | Resolve members, then require every member through that same oracle; no other oracle changes |
| `localLessonState`, `donowCellState` | Existing local/server completion | Require every member; preserve archived combined-key behavior |
| `_prevTopicInSequence`, `calNextUpTopic`, `paintLocalDoneCells`, `paintDonowCells` | Existing sequential gate and paint | Advance and paint complete only after all members satisfy their own gates |
| `maybeBumpThenOpen` | Open complete single cell | Open the full group, with Do Now coverage across members |
| `renderDoNow`, `_renderTodayTopics`, `_focusTodayLessonVideo` | Existing due-today lesson | List both due members and open the full-day resource panel |
| `_lessonCoachHtml` | Per-topic coaching | Invoke separately for each member |
| `showResourcePanel` | Existing resource rows and progress keys | Render each member in order using individual OLD IDs and unique DOM IDs; retain full cell for refresh |
| `_lessonDateMap` | Topic to date | Map both members to the shared date |
| `cls`, `htm`, `cellAria` | Existing cell labels and event branches | Show both labels, member unit color, aggregate completion, and existing `2x` badge |
| `sTip` | Existing tooltip | Aggregate member metadata; preserve existing double-topic tooltip |
| `rCal`, `_wkIdxForTopic` | Existing paging/focus | Focus may match day or member; preserve full today cell across paging |
| `_summerWeeks` | Existing summer schedule | Inspect group-name lookup if needed; preserve summer labels and numbering |
| `rProg`, `_computePace` | Existing progress | Flatten members for lesson totals and expected counts; retain 66 core lessons |
| `_isTopicLessonUnlocked`, `_confirmOverrideGate` | Existing individual override | Require/post individual keys for both members; preserve successful partial results for retry |
| `_ti84TodayTopic`, `appLaunchUrl` | Existing mapped lesson | Use the first mapped member |
| `desk-dok-ladder-row` | Teacher-only per-topic sheet | Teacher-only group sheet on doubled E days |
| `openDayGrade` | All server lessons due on a date | Keep date-based lookup; shared dates should naturally include both members |
| `getRegistryEntry`, `getAllRegistryEntries`, `lookupTopic` | Existing individual/legacy lookup | Call per member; retain legacy combined lookup |
| Schedule builder `litField`, placed-cell traversal, `dateOf` | Existing per-topic date output | Extract new literals, flatten groups, permit equal dates only within one group, emit E-only `dayGroups` |
| Schoology fixture/planner | Per-topic due dates | Retain both topics and stable ordering/idempotence on shared dates |
| Server grading and Do Now | Existing engines | Consume moved E dates; adjust only applicable fixture expectations |
| Offline exports | Existing OLD-ID resource keys | Preserve keys and URLs; include updated Desk rendering through existing export mechanism |

## GitNexus impact status

Refreshed the line-preserving Desk shadow and rebuilt with GITNEXUS_MAX_FILE_SIZE=4096. Local meta reports HEAD 9439464 and status up-to-date. Global registry registration failed EPERM, but the existing registration resolves this rebuilt local graph and authoritative file-qualified impact queries succeed. Raw upstream results are in state/e-wednesday-audit/. The table below records the pre-edit analysis of every modified existing symbol. New helpers receive caller review and are covered by the extracted-code tests.

## Commit sequence

1. Generator + Desk + focused tests + completed plan.
2. Extractor + both schedule JSON copies + applicable test expectations + Schoology shared-date regression.
3. Additive DOK group support + two authored/built sheets + eight explicit PENDING entries + group Desk row.

Each commit uses staged detect_changes. Stage only reviewed Desk hunks with git add -p. Never touch pacing, injection, unit boundaries, core-order fixture, grade engine, or bundle.

## Test update inventory

Confirmed `tests/desk-calendar-ced2026.test.js` pins the entire old JSON hash and one-topic-per-cell enumeration: preserve B-column baseline, adapt grouped rendering/lookup assertions, and retain builder drift check. Extracted Desk harnesses need helper dependencies when they execute changed functions (calendar, focus, completion, opener, grade check-in, TI84, resource-panel and DOK tests). `roster-server/tests/derive-quarter-bands.test.js` contains synthetic historical examples, so preserve those unless the test explicitly loads production dates. Inspect `sy2627-due-and-early-bonus.test.js`, quarters and m2b fixtures through the full server suite; only production E date expectations may change. No grade engine edits. Add offline Schoology fixture and planner same-date/idempotence regression. DOK registry/coverage/emission harnesses require additive group shape, slug, topic-order and worksheet-list checks.

Required final suites: focused Vitest; schedule --check; root npm test; roster-server npm test; pytest tests/. Capture counts and named failures. Do not fix known Windows crypto or flaky journeys.

## Acceptance fixture (expected only; not reproduced)

| E Wednesday | Pair | Unit | Observed |
| --- | --- | --- | --- |
| 2026-09-16 | 1.4+1.5 | 1 | Verified |
| 2026-09-23 | 1.7+1.8 | 1 | Verified |
| 2026-10-07 | 3.5+3.6 | 1 | Verified |
| 2026-10-28 | 4.2+4.3 | 2 | Verified |
| 2026-12-16 | 6.2+6.3 | 3 | Verified |
| 2027-01-06 | 5.6+6.8 | 3 | Verified |
| 2027-01-20 | 8.4+8.5 | 3 | Verified |
| 2027-02-03 | 7.1+7.2 | 4 | Verified |
| 2027-02-24 | 7.7+7.8 | 4 | Verified |
| 2027-03-10 | 2.5+2.6 | 5 | Verified |

Expected E PC Day 2 dates: U1 2026-10-16; U2 2026-12-07; U3 2027-01-29; U4 2027-03-05; U5 2027-03-22. Expected E review end: 2027-03-31. All generated and verified by the focused regression suite.

## Fresh pre-edit upstream blast radii

| Symbol | Risk | Direct callers | Upstream | Processes |
| --- | --- | --- | --- | --- |
| _computePace | HIGH | 1 (rProg) | 16 | 3 (submitSignIn, loadYear, run) |
| _confirmOverrideGate | LOW | 0 (none indexed) | 0 | 0 (none indexed) |
| _dokLadderRowHtml | LOW | 1 (showResourcePanel) | 20 | 2 (studentMark, run) |
| _isLessonComplete | CRITICAL | 4 (localLessonState, _walletSummerReadiness, _walletPaint, _todayLessonDone) | 40 | 5 (handleMpMessage, submitSignIn, handleMessage, loadYear, run) |
| _isTopicLessonUnlocked | LOW | 0 (none indexed) | 0 | 0 (none indexed) |
| _lessonDateMap | LOW | 1 (renderMyGradebook) | 7 | 0 (none indexed) |
| _summerWeeks | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, run, loadYear) |
| _ti84TodayTopic | LOW | 2 (_renderTi84SkillBtn, appLaunchUrl) | 16 | 2 (submitSignIn, run) |
| _wkIdxForTopic | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, run, loadYear) |
| cellAria | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, run, loadYear) |
| cls | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, loadYear, run) |
| copyTutorPrompt | LOW | 0 (none indexed) | 0 | 0 (none indexed) |
| copyTutorPromptPc | LOW | 0 (none indexed) | 0 | 0 (none indexed) |
| donowCellState | LOW | 1 (paintDonowCells) | 19 | 2 (submitSignIn, loadYear) |
| generateSchedule | LOW | 1 (loadYear) | 2 | 1 (loadYear) |
| htm | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, run, loadYear) |
| localLessonState | HIGH | 6 (calNextUpTopic, paintLocalDoneCells, maybeBumpThenOpen, renderDoNow, rCal, _computePace) | 31 | 4 (studentMark, submitSignIn, run, loadYear) |
| maybeBumpThenOpen | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, run, loadYear) |
| rCal | HIGH | 12 (ap_stats_roadmap_square_mode.inline.js, loadRegistry, paintLocalDoneCells, _walletLoadSummerSchedule, renderDoNowGrades, renderDoNow, loadYear, _studentMarkSave, setP, calStep, calToday, _fetchPollArchive) | 33 | 4 (studentMark, run, submitSignIn, loadYear) |
| renderDoNow | HIGH | 9 (loadRegistry, submitSignIn, _nfSubmitPassword, _applySignedUpSession, submitPwChange, _walletLoadSummerSchedule, _renderGradeStatus, _studentMarkSave, ap_stats_roadmap_square_mode.inline.js) | 24 | 3 (studentMark, submitSignIn, run) |
| rProg | HIGH | 5 (loadRegistry, renderDoNowGrades, loadYear, setP, ap_stats_roadmap_square_mode.inline.js) | 24 | 4 (studentMark, submitSignIn, run, loadYear) |
| showResourcePanel | HIGH | 7 (ap_stats_roadmap_square_mode.inline.js, recordLinkVisit, open, renderDoNowGrades, _studentMarkSave, _blooketCommit, _focusTodayLessonVideo) | 40 | 3 (studentMark, run, submitSignIn) |
| sTip | HIGH | 1 (rCal) | 25 | 4 (studentMark, submitSignIn, loadYear, run) |

## Part 2/3 additional impacts

Calendar harness createDesk and collectCalendar: LOW, zero indexed callers/processes. Builder litField: LOW, one caller, zero processes (only its call site needed a new literal; body unchanged). DOK builder impacts all LOW; raw file-qualified results are in the audit directory.
- dok-build: LOW, 1 direct, 2 upstream, 1 processes.
- dok-ced_topic_label: LOW, 2 direct, 4 upstream, 2 processes.
- dok-emit_board: LOW, 0 direct, 0 upstream, 0 processes.
- dok-emit_teacher: LOW, 0 direct, 0 upstream, 0 processes.
- dok-header_line: LOW, 2 direct, 2 upstream, 2 processes.
- dok-load_registry: LOW, 2 direct, 3 upstream, 1 processes.
- dok-tether_lines: LOW, 1 direct, 1 upstream, 1 processes.
- dok-validate_item: LOW, 1 direct, 3 upstream, 1 processes.
- dok-validate_lesson: LOW, 2 direct, 4 upstream, 1 processes.
- dok-write_manifest: LOW, 1 direct, 2 upstream, 1 processes.

DOK emit_student: LOW, zero indexed callers/processes (pre-edit). Group teacher tethers retain the complete deduplicated union in two columns.

## Final verification

All acceptance pairs and dates verified. Period B remains byte-identical. Both group sets compile to 2 student / 1 board / 3 teacher pages; all 66 individual-topic emitters remain byte-identical. Step-6 counts and exact baseline failure names are recorded in `state/e-wednesday-audit/verification.json`. No push. Eight future group sheets remain explicitly pending as authorized.

Part 3 staged detect_changes: HIGH, 24 symbols / six processes; reviewed against the staged diff. Flows are the resource-panel lookup/student identity and DOK validation/tether/label pipeline. The index predates added lines, so neighboring untouched symbols appear in the hunk mapping; direct diff review confirms no changes to their bodies.
