# A2_FORK_DIFF_AUDIT.md — is every difference from the AP Stats platform intentional?

**Goal.** The Algebra 2 platform was meant to be a 1:1 fork of the AP Stats platform with
three intentional change sets (content strip, feature strip, rename/rebrand) plus the A2
additions in `A2_FORK_PLAN.md`. Two unintended regressions have already surfaced (the empty
Desk calendar, the un-bumped PWA build stamp). This audit finds the rest: every file, function,
style block and page that differs from the AP baseline is classified, and anything not covered
by the plan is either restored or explicitly accepted by the teacher.

**Roles.** Claude Code orchestrates: builds the inventory, writes the batches, judges results,
commits. Codex (`gpt-6-astra` via `Agent/runner/cross-agent.py --direction cc-to-codex`)
does every implementation and code-review task. Batches are dependency-aware; nothing in a
batch depends on another task in the same batch.

## Baseline

| Item | Value |
|---|---|
| AP repo | `robjohncolson/apstats-live-worksheet` |
| Fork snapshot commit | `68d3e61` (2026-09-13, "Flashcards open straight into the full timed deck") |
| Local checkout | `C:/Users/rober/Downloads/Projects/.apstats-base` (cloned 2026-09-16, `core.longpaths=true`) |
| AP HEAD since the fork | 11 commits, 196 files (Phase 5 plan: 6 port, 14 need adaptation, 176 skip) — `state/fork-diff/phase5-port-plan.md` |
| Inventory | `state/fork-diff-inventory.txt` (ONLY_IN_AP / ONLY_IN_A2 / MODIFIED, one path per line) |

First-pass counts (2026-09-16): AP 2779 tracked files, A2 1040. Only in AP 2095 (573 `dok/`,
296 root `.md`, 163 tests, 95 root `.html`, 90 root `.js`, unit folders, `ai-tutor/`,
`concept-posters/`, `ti84-trainer-v2/`, `Mac-OS-Sounds/`). Only in A2 356 (249 `docs/`, 33
tests, 30 `roster-server/`, 19 `content/`). Shared but modified 303 (132 tests, 91
`roster-server/`, 15 root `.js`, 12 root `.html`, 12 `data/`). The Desk itself is a rename
(`ap_stats_roadmap_square_mode.html` → `desk.html`) and is diffed as a pair, not as a delete+add.

## Classification rules

Every inventory line gets exactly one class:

| Class | Meaning | Source of authority |
|---|---|---|
| `STRIP-CONTENT` | AP curriculum removed on purpose | `A2_FORK_PLAN.md` Phase 1 list |
| `STRIP-FEATURE` | Doge/Candy, Tetris, Live Classroom, TI-84, Progress Checks, videos removed on purpose | Phase 2 list |
| `RENAME` | Same thing under the A2 name/key (`apstats_*` → `a2_*`, `desk.html`, titles) | Phase 3 |
| `A2-ADD` | New A2 code/content (Try-It scorer, lesson checks, decks, district grading, deploy) | Phase 4/5, `content/a2/` |
| `HISTORY` | Spec/build docs moved to `docs/apstats-history/` | Phase 1 |
| `UNINTENDED` | Not covered by any list, or covered but the removal took something else with it (calendar data, PWA stamp, CSS, icons, sounds used by kept features) | needs restoration |
| `UNCLEAR` | Plausibly intentional but not written down | teacher decides |

A `STRIP-*` classification is only valid if nothing that stayed still references the removed
thing. Codex must grep the kept tree for every removed path/symbol; a live reference flips the
class to `UNINTENDED`.

## Phases

### Phase 0 — inventory (done 2026-09-16, orchestrator)
`state/fork-diff-inventory.txt` plus the counts above.

### Phase 1 — classify (Codex, read-only, two parallel tasks)
- **1a Files.** Classify every inventory line. Output `state/fork-diff/files.json`
  (`[{path, side, class, reason, referencedBy: [...]}]`) and a summary table by class and area.
- **1b Desk pair.** Function-level, CSS-block-level and HTML-section-level diff of
  `ap_stats_roadmap_square_mode.html` vs `desk.html`. Output `state/fork-diff/desk.json`
  (`[{kind: function|css|html|script-tag, name, side, class, reason}]`). Same classes.
  Also list every `<script src>`, `<link>`, icon, sound and font the AP Desk loads that the
  A2 Desk does not, with the class.
Acceptance: every inventory line and every Desk symbol appears exactly once; `UNINTENDED`
and `UNCLEAR` entries carry a one-line reason and, for `UNINTENDED`, the kept file that still
references the missing thing or the visible surface that broke.

### Phase 2 — visual audit (orchestrator + Codex review)
Side-by-side screenshots of each surface, AP (local file) vs A2 (Vercel), via the Edge rig
(`python tools/cdp/edge.py --url … --shot …`): Desk signed out / signed in as a student /
signed in as the teacher, Start Here, Open House, calendar paging, gradebook overlay,
flashcards, lesson check, teacher dashboard, roster console, Try-It scorer, mobile home.
Codex reviews the pairs against `desk.json` and adds any visual difference not already
explained (spacing, fonts, icons, colours, missing panels) as `UNINTENDED`/`UNCLEAR`.

### Phase 3 — teacher decision
The `UNCLEAR` list goes to the teacher as one table with a recommended default each.
Nothing in Phase 4 starts on an `UNCLEAR` item until it is decided.

### Phase 4 — restore (Codex, dependency-aware batches, tests first)
Group `UNINTENDED` items into batches by area: (a) Desk chrome and assets (CSS, icons,
sounds, fonts, panels), (b) Desk behaviour (calendar, Do Now, gradebook, tooltips), (c)
Start Here / Open House / mobile home, (d) roster-server behaviour and data files, (e)
tests deleted with content that still cover kept code (restore with A2 fixtures), (f) tooling
and scripts (build/bump/lint) that kept code depends on. Each batch: Codex implements with a
test per restored behaviour, then a second Codex task reviews the diff (`--task-type review`)
before the orchestrator runs both suites, bumps the PWA build stamp, commits and pushes.
Root suite must stay at the baseline's six inherited failures or better; server suite green.

### Phase 5 — post-fork AP commits
Diff AP `68d3e61..HEAD`. Schoology sync improvements (assignment folder, form read-back)
likely apply to `tools/schoology_*` in A2; port them the same way as Phase 4 batches.

### Phase 6 — freeze
Record the final classification in this file, add a test that pins the ONLY_IN_AP list
against the plan (so a future strip cannot silently widen), and update `A2_FORK_BASELINE.md`.

## Results


### Phase 1 classification (Codex gpt-6-astra, 2026-09-16) — raw outputs in `state/fork-diff/`

**1a files** (`files.json`, 2754 inventory lines + 43 split entries): STRIP-CONTENT 1226 · STRIP-FEATURE 280 ·
RENAME 31 · A2-ADD 193 · HISTORY 505 · UNINTENDED 434 · UNCLEAR 85. Codex applied the reference rule
conservatively (any surviving mention flips to UNINTENDED, including comments, lineage metadata and renamed
tests). Orchestrator triage (`triage-1a.md`, `runtime-candidates.md`): of the 434, **70** are only referenced by
stale AP data manifests that should themselves go, **51** are test-only consumers, **6** are comment-only, and
the rest collapse to the runtime list below. Phase 1c (Codex review, `runtime-verdicts.md`) verifies each.

**1b Desk pair** (`desk.json`, 2402 records: 744 functions, 577 CSS blocks, 293 HTML sections, 788 resources):
UNINTENDED 66 · UNCLEAR 1. Removed from the AP Desk: 274 functions, 62 CSS blocks, 72 HTML sections, 733
resources (worksheet, tutor, video and Blooket links are 700+ of those and are STRIP-CONTENT).

### Consolidated UNINTENDED list (what Phase 4 restores or neutralises)

| # | Surface | What broke | Cause | Proposed fix | Batch |
|---|---|---|---|---|---|
| U1 | Desk sounds | Sound toggle, dialogs, grade check-in, name finder are silent; `MacSFX.play` removed | `Mac-OS-Sounds/` deleted with the games, but 4 wavs are shared UI sounds | Restore `PowerMacBeep`, `Quack`, `Wild-Eep`, `Single-Click` + `MacSFX.play` | chrome |
| U2 | Desk menu bar | Top-left identity sprite blank | `sprite.png` deleted with pico sprites but the menu-bar walker still loads it | Restore `sprite.png` | chrome |
| U3 | Desk "My Progress" icon | Double-click throws (`openProgress` removed); `icons/icon-progress.png` never existed | New A2 shortcut wired to a stripped app | Point it at My Gradebook; add an icon | behaviour |
| U4 | Desk icon context menu | "Open" on Receipts/Progress falls through to an empty app registry | `_deskLaunch` registry emptied by the strip | Register the two shortcuts | behaviour |
| U5 | Desk View menu | No Section G entry; checkmarks only for C/D | Rebrand of B/E stopped at two entries | Add Section G to menu + `updateViewMenu` | behaviour |
| U6 | My Receipts | Local-only feed: durable receipt merge, grouping, review-mark hydration and **Print Sealed Summary** gone | Wallet strip removed shared academic-receipt code (`_walletLoadReceipts`, `_walletRenderGroupedReceipts`, `_walletPaint`) | Restore the academic receipt feed without the wallet | behaviour |
| U7 | Teacher Scan (verify) | Teacher workspace "Verify receipt (scan)" sends `action=scan`; Desk handler `openVerifyQR` and its overlay removed | QR verifier removed with the wallet | Restore `openVerifyQR` + overlay (verify.html is kept) or drop the button | behaviour |
| U8 | Sealed transcript notice | Falls back to `alert()` | `_showTrainerToast` removed with the TI-84 trainer though shared | Restore a plain toast helper | behaviour |
| U9 | Do Now card | Readiness colours and next-task icon cues no longer painted; `.donow-next` CSS dormant | Removed with the wallet | Restore with district-grade inputs (UNCLEAR → recommended yes) | behaviour |
| U10 | Stale guards | `_fetchPollArchive`, `_renderTodayTopics`, `openGame`, `#game-*`/`#guest-pass`/`#reconcile-qr` overlays, `_phase3SyncNearbyClick`, `.doge-dropdown` still referenced | Half-removed features | Delete the stale references | cleanup |
| U11 | Session/commit QR | `_walletShowSessionQR`, `_walletLoadCommits` removed while `_commitShowQR` and verify.html remain | Wallet strip | Restore session QR row and `/commits` loader (academic, not Doge) | behaviour |
| U12 | teacher-app.html | Loads `nearby-transport.js` and `ledger-gossip.js` (deleted); Sync Nearby dead | Live Classroom strip | Remove the script tags and the Sync Nearby UI (also on mobile-home) | pages |
| U13 | mobile-home.html | "No lessons found" | Reads the stripped `lessons-index.json` shape | Read `content/a2/lessons.json` / `/lessons` | pages |
| U14 | teacher-dashboard.html | Loads `data/summer-schedule.json` (deleted) | Content strip | Verdict pending 1c | pages |
| U15 | roster-server | `server.js` reads `dok/manifest.json` and a 1-line `skill-map.json` stub | Content strip | Verdict pending 1c | server |
| U16 | study_guide_diagnostic.html | Uses `ai-grading-prompts-study-guide.js` (deleted); relabeled A2 but AP content | Content strip | UNCLEAR (see decisions) | pages |
| U17 | lib/worksheet-ai-grade.js | Requires `ai-grading-prompts.js` (deleted) | Content strip | Verdict pending 1c | server |
| U18 | Stale AP data files | `data/frq-regrade-manifest.json`, `data/worksheet-key.json`, `data/misconception-rubric-map.json`, `data/ti84-lesson-map.json`, `data/ti84-procedures.js`, `docs/feature_user_story_status.tsv`, lineage entries for stripped artifacts | Strip left the pointers | Delete or empty them; fix lineage | cleanup |
| U19 | Tooling | `build-work-manifest*.mjs`, `gen-blooket-lessons.mjs`, `smoke-misconceptions.mjs`, `smoke-student-host-matrix.mjs`, `grade-model-emit-cases.mjs`, `dok/build_ladder.py` read stripped inputs | Content strip | Verdict pending 1c; delete or re-point | tooling |
| U20 | Tests | 51 deleted/modified tests whose subject survives (flashcard libs, console, hydration, sign-in wall, ...) | Strip took tests with content | Restore with A2 fixtures where the subject is kept | tests |
| U23 | Do Now card | The bundled `roster-server/data/work-manifest.json` (and root copy) is still the **AP Statistics** manifest (U1 "Exploring One-Variable Data", `WS-U1L1-Q*` items); `/donow` picks the earliest incomplete AP activity, so a signed-in A2 student's Do Now points at 28 AP worksheet questions that do not exist (labelled with the A2 title via the calendar overlay) | Content strip left the AP manifest; the generator reads stripped inputs | Generate the manifest from `content/a2/lessons.json` (Try-Its `TI-`, lesson check `LC-`, deck `BL-`) with an A2 builder; teach `renderDoNow` the A2 deep links (check.html, Try-Its, deck) | server + behaviour |
| U21 | PWA build stamp | (fixed 2026-09-16) | Not bumped after the fork | Rule added to runbook | done |
| U22 | Desk calendar | (fixed 2026-09-16) | Empty roadmap + no pacing | `applyA2Pacing` | done |


### Phase 1c runtime verdicts (Codex review, 2026-09-16, `state/fork-diff/runtime-verdicts.md`)

20 kept-code → stripped-file references checked at source: crash 5 · visible breakage 3 · silent 10 ·
comment-only 2. Fix letters: restore-as-is 0, A2-shaped replacement 6, remove consumer 7, leave 7.
Resolutions for the pending rows above:

| # | Verdict | Fix |
|---|---|---|
| U12 | teacher-app.html: mesh scripts optional, but the offline card and its controls are revealed after Connect and cannot work | remove mesh script tags, offline card and handlers; keep file-based offline import and receipt signing |
| U13 | mobile-home.html boots an empty `window.A2_LESSONS`; `syncNearby()` is undefined → ReferenceError on click | adapter for `content/a2/lessons.json`; remove the button (in batch A+B) |
| U15 | server.js does **not** read `dok/manifest.json` (false match); bundled `skill-map.json` is `{}` so mastery just records no skill observations | A2 item→skill map later (server batch, low priority) |
| U16 | study guide: prompt script 404s; reflection/focus builders throw inside try/catch → error toast; Desk and index.html still link the page; TI-84 walkthroughs still render inside it | D4 |
| U17 | worksheet-ai-grade.js only discovers optional builders; no file load | leave |
| U18 | frq-regrade manifest + `tools/regrade-ungraded-frqs.mjs` crash on invocation; worksheet-key / misconception maps are stale provenance, not loads; TI-84 metadata inert except the study-guide consumer; TSV comment-only; lineage entries metadata | neutralise regrade manifest/tool; prune lineage; delete TI-84 metadata with D4 |
| U19 | `build-work-manifest*.mjs`, `gen-blooket-lessons.mjs`, `smoke-misconceptions.mjs` crash when run; `smoke-student-host-matrix.mjs` returns a failed diagnostic; lint/grade-model/dok generator fine | replace with A2 generators (work manifest, deck membership, answer key) or delete; remove the video sweep |
| U14 | teacher-dashboard.html → `data/summer-schedule.json` (not in the 1c list) | verify in the pages batch |

Codex disagreements adopted: B6 (menu sprite) is a blank glyph, not an exception — restoring `sprite.png`
keeps 1:1 fidelity so batch A+B restores it; B4 (study guide) is neither stripped nor added by the plan,
hence D4.

### Decisions needed from the teacher (Phase 3)

| # | Question | Recommended default |
|---|---|---|
| D1 | Do Now readiness colours + next-task cue (U9): restore? | Yes, driven by district grade |
| D2 | Print Sealed Summary and session/commit QR in My Receipts (U6, U11): restore? | Yes; receipts/transcripts are a kept feature |
| D3 | Teacher "Verify receipt (scan)" camera workflow (U7): restore the QR verifier, or keep only the paste verifier (`verify.html`)? | Restore |
| D4 | Study guide diagnostic (U16): it still holds AP Statistics content under an Algebra 2 label. Hide it, remove it, or keep until A2 content exists? | Hide from student navigation until A2 content exists |
| D5 | Sync Nearby / offline gossip (U12): remove the dead buttons everywhere? | Remove (Live Classroom was stripped) |
| D6 | Android app shell (`android-app/`) was deleted without being named in the plan. Retire? | Retire; note in plan |
| D7 | Server tests force the old formula off (`roster-server/vitest.config.js`). Add district-formula coverage? | Yes, in the tests batch |
| D8 | The 30 one-off `scripts/wire-*.mjs` migration scripts and `build-android.mjs`: already applied before the fork; leave deleted? | Leave deleted; note in plan |
| D10 | AP commit 72766e6 softened FRQ grading (reflection floor, "can only raise" band). A2 has no reflections yet; port the mechanics now, or hold until A2 reflections exist? | Hold |
| D9 | Calendar cell click opens the inherited resource panel with no links. Open the lesson check instead? | Yes |


### Phase 4 progress (2026-09-16)

| Batch | Items | Codex implement → Codex review → fixes | Result |
|---|---|---|---|
| A+B Desk chrome/behaviour + mobile home | U1 U2 U3 U4 U5 U8 U10 U13 | review: safe with 2 fixes (Section G styling, behavioural tests) + walker jump sound restored for fidelity | committed a03b1ef; 11 chrome tests |
| D + D2 tooling/pages cleanup | U12 U14 (guarded, no change) U18 U19 | review: safe with 6 fixes (orphan regrade test + workflow removed, lineage pruned, host-matrix probes, behavioural teacher-app test, CLI test) | committed with the PWA stamp bump |
| E Do Now manifest | U23 | review: safe as-is (0 findings) | committed be0a615 |
| Phase 5 steps 1-2 Schoology | AP 8539a0dd + 2fd88bc4 | review: safe with 1 fix (folder failure-path tests added) | committed eb2095c; pytest 172 |
| Phase 5 step 3 section reconciliation | AP f979cd58 | review: safe as-is; tests then caught two regressions (calendar overwrite by legacy roadmap path, CRLF) and a view-as regression — all fixed | committed with the PWA stamp bump |
| U20 R1 tests | receipt crypto, menu sprite | restored from baseline; 21 tests | committed 0cd8455 |
| U20 R2 tests | six teacher-student-console tests | 12 of 57 assertions exposed real dashboard regressions (deep-link student name, remediation slider/close/refresh, unlock revoke and empty states) — restored from baseline; review: safe with 3 test fixes, applied | committed with the PWA stamp bump |
| U20 B01 grade engine | 9 server/desk grade tests | restoring exposed two gaps: quarter-band derivation ignored A2 sections (lesson-grade.js fixed, quarterOfLesson aligned; review 1 finding applied) and the Grade Check-in ignored Section G's column (desk.html fixed); grade-engine.bundle.js regenerated | committed with the stamp bump |
| U20 B07 receipts/offline crypto | 7 tests | adapted/restored; no subject change | same commit |
| U20 B10 identity/mobile | 8 tests | restoring exposed the teacher view-as deep link missing viewAsUserId (desk.html) and check.html not honouring view-as (now read-only with a banner; review 1 finding applied) | same commit |
| Inherited test pins | `desk-modal-escape` pinned closers for stripped overlays | updated to assert the removed ids are absent | same commit |

Gate after both batches: root suite 763 files, only the six baseline failures; server suite 80/80 green.

Remaining: U6 U7 U9 U11 (await D1-D3), U16 (D4), U15 (server skill map, low priority), U20 (tests batch), Phase 5 steps 1-3 shipped; step 5 (grading policy) held on D10; step 6 (DOK builder) deferred to Lesson_planning; Phase 6 (freeze test).

### Phase 2 visual pairs (orchestrator, 2026-09-16, signed-out) — screenshots in `state/fork-diff/shots/`

| Surface | Verdict | Notes |
|---|---|---|
| Desk (calendar) | parity after the calendar fix | A2 "My Receipts" desktop icon still uses the AP-branded glyph → UNINTENDED (cosmetic). "My Ledger" → "My Receipts" + "My Progress" is A2-ADD. AP shows a "Due today" line in Do Now from the work manifest; A2 shows the current lesson on the Today card instead → UNCLEAR. |
| Start Here | intentional rewrite | Same theme and layout; copy is the A2 syllabus. RENAME/A2-ADD. |
| Mobile Home | broken | A2 renders "No lessons found": the page still reads the stripped `lessons-index.json` shape. UNINTENDED. It also still offers "Sync Nearby" although `nearby-transport.js` was stripped → UNINTENDED (dead button) or STRIP-FEATURE if the button is removed. |
| Teacher dashboard | parity + A2 additions | Header adds the bonus-window note and the topic-assessment sentence. |
| Teacher roster console, teacher-app, calendar.html | captured, not yet reviewed | Codex reviews against `desk.json` in Phase 2b. |
| verify.html, teacher-tryits.html, open-house.html | A2-only | A2-ADD. |
