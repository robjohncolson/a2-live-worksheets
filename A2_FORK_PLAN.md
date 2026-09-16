# A2_FORK_PLAN.md — Algebra 2 platform as a 1:1 fork of the AP Stats platform

**Decided 2026-09-13 with the teacher.** This directory is a fresh-history snapshot of
the AP Stats worksheet repository (git archive HEAD, 120 MB, no media/PDF history). The AP Stats
platform stays untouched. Deployment facts updated 2026-09-14: the private repository is
`robjohncolson/a2-live-worksheets`; a new Railway service runs the server, and both Vercel
and GitHub Pages host the static root. Supabase is an existing shared project; isolation
is schema `a2`, with no A2 reads or writes in the default schema. Secrets arrive via env vars.

## Classroom facts the fork is built for

| Fact | Value |
|---|---|
| Sections | C (Mon 60 / Tue 90 / Thu 90), D (Mon 90 / Wed 60 / Fri 90), G (Tue 70 / Wed 40 / Thu 70 / Fri 60) |
| Devices | Chromebooks. No phones (school policy) |
| Instruction | Teacher annotates the Savvas packet in OneNote on an iPad via AirPlay; students copy at own pace via a Schoology link. No videos |
| Graded pieces | Try-Its scored 0/1/2 by the teacher from a phone while circulating; a digital lesson check every lesson; flashcard runs; topic assessments 1–2 per quarter |
| District policy (pilot SY26-27) | Assessments 50% (min 4/qtr) · Assignments 40% (min 10/qtr) · Engagement 10% (min 10/qtr). Schoology categories are exactly `Assessments`, `Assignments`, `Engagement` |
| Grade engine | Keep the v3 two-track engine and its `useV3` flag. **Default = district 50/40/10 formula** with best-score-wins retakes, improvable Try-Its, and un-attempted-due = 0. Flipping to v3-with-override is a config change, not a rewrite |
| Blooket | Optional, unreliable in this building. Flashcards (`flashcards.js`, quick check ≤80%, timed full deck ≤100%, SRS) are the graded recall piece; decks are Blooket-format CSVs per lesson |

## Phase 0 — baseline (in progress)
- `npm install` root + `roster-server/`; run both Vitest suites on the untouched snapshot and record
  pass/fail counts in `A2_FORK_BASELINE.md`. Every later phase is judged against this.

## Phase 1 — content strip (mechanical, no code edits)
Delete AP Stats curriculum. Tests that only validate this content are deleted with it.
- 69 `u*_lesson*_live.html` worksheets, 77 `*_blooket.csv`, 70 `ai-grading-prompts*.js`, `ai-tutor/`,
  `concept-posters/`, `dok/` (keep `dok/build_ladder.py` + `compile.ps1` + `README.md` as the sheet
  generator; drop `lessons/`, `registry/`, `tex/`, `pdf/`, `archive/`), `u1/`…`u9/`, `u4_*/`,
  `unit4guide/`, `mit_python_vid2/`, `a2_3-3/`, `apstat-park/`, `syllabus/`, `formal/`,
  `probe-signal-reports/`, `ti84-cemu-screenshots/`, `data/skill-map*`, `data/answer-key.json`,
  `data/blooket-*`, `roadmap-data.json`, `lessons-index.json`, `2026-crosswalk.json`,
  `apstat_*_framework.md`, `ap-stats-video-crosswalk.md`, `video-ingest*.mjs`, `offline-video.js`,
  `video-store.js`, `video-ondemand.js`, the 16 `unit4_*`/`week_*`/`postbreak_calendar` schedule
  pages, `u3_random_block_review.html`, `u6-proportion-inference-plan.html`, `code-to-website-workshop.html`,
  `ap_stats_pacing_mar23_may7.xlsx`, `supabase-*summer-2026.sql`.
- Move the 248 root `*_SPEC.md` / `*_BUILD.md` / runbooks to `docs/apstats-history/` (reference for
  the code that stays; not deleted).

## Phase 2 — feature strip (code edits, test-gated)
Dropped by teacher decision: **Doge wallet + Candy economy, Study Break Tetris, Live Classroom,
TI-84 trainer, AP Classroom Progress-Check path, video links.**
- roster-server: remove `doge-chain.js`, `doge-econ.js`, `doge-wallet.js`, `wallet-custody.js`,
  `payout.js`, `poll-archive*.js`, `trainer*.js`, `pc*.js` and their routes in `server.js`; remove
  their migrations from the fresh schema; delete their tests (17 of 92).
- Desk (`ap_stats_roadmap_square_mode.html`, 24,830 lines): remove the wallet/doge/candy UI (~700
  refs), Study Break, Live Classroom, TI-84 and Equation Trainer app-registry entries, video tiles.
  Remove `doge-keys.js`, `ledger-gossip.js`, `nearby-transport.js`, `qr-fountain.js`, `qr-sync.js`,
  `classroom-board.js`, `activity-*.js`, `canvas_engine.js`, `sprite_sheet.js`, `ti84-*.js`,
  `ti84-trainer-v2/`, `TI-84_Plus_CE/`, `Mac-OS-Sounds/`, `icons/` sprites for pico/doge, the
  `teacher-classroom.html` cockpit, `tools/level-editor.html`.
- Delete the matching root tests (65 of 314). Root + server suites must be green at the end of
  the phase; any remaining red test is listed by name in `A2_FORK_BASELINE.md` with a reason.

## Phase 3 — rename + rebrand
- `ap_stats_roadmap_square_mode.html` → `desk.html`; `apstats_*` localStorage keys → `a2_*`;
  page titles, `start-here.html` copy, `index.html`, `manifest.webmanifest`, `sw.js` CORE list.
- New `grade-config.js` for SY26-27 A2: quarters (09-02→11-06, 11-09→01-22, 01-25→04-14,
  04-15→06-17), meeting days per section (C/D/G), category weights 50/40/10, minimum counts,
  `useV3: false` default, Schoology `KIND_TO_CATEGORY` → Assessments / Assignments / Engagement.

## Phase 4 — A2 additions (new code)
1. **Try-It scorer**: teacher phone page, roster list × today's Try-Its, tap 0/1/2, writes an
   `Assignments` ledger row; students can request a rescore until the topic assessment.
2. **Lesson check runner**: the worksheet engine's blank/MC validation reused as a 4–6 item
   auto-graded check per lesson, items drawn from the Lesson_planning question bank
   (`questionbank/registry.jsonl`, Savvas-traced ids), retakable, best score kept → `Assessments`.
3. **Flashcard decks** per lesson as Blooket-format CSVs (rules + vocabulary) → `Engagement`.
4. **Topic assessment entry** (paper, teacher-entered score, retakable) → `Assessments`.
5. **Desk card**: today's lesson per section, OneNote link, Try-It scores, lesson-check status,
   flashcard streak, live quarter grade in the district formula.

## Phase 5 ? deploy
- Repo-side preparation and manual deployment instructions: `deploy/RUNBOOK.md`.
- Regenerate `deploy/supabase_a2_bootstrap.sql` from all ordered server migrations.
- Teacher creates the private `a2-live-worksheets` repository and new Railway service;
  reuse an existing Supabase project with exposed schema `a2`.
- Vercel and GH Pages are both required static hosts. Schoology sync uses the A2
  course ID from the environment and the three district categories.

## Content pipeline (Lesson_planning repo, unchanged)
Which lessons get authored, and in what order, follows `docs/a2-lesson-targets.md`
(Precalculus-prerequisite and SAT ratings per Savvas lesson, the compressed Topics 1-4 plan, and
the Topics 5-7 bridge list; machine-readable in `data/a2-lesson-targets.json`).
TE PDF → `pdftoppm` → Codex `codex exec -i` transcription to `a2_{lesson}_TE.tex` (exemplar
`a2_5-4_TE.tex`) → `ingest_lesson_from_latex.py` → hand-written calibration from the TE Item
Analysis → `qb_append.py`. Lesson 1-1 is done (71 rows, 2026-09-13).

## Decisions recorded 2026-09-16 (fork-diff audit, teacher accepted the defaults)
- The Android app shell (`android-app/`) is retired with Live Classroom and the nearby transport (D6).
- The one-off migration scripts (`scripts/wire-*.mjs`, `scripts/build-android.mjs`) were applied before
  the fork and stay deleted (D8).
- The AP grading-policy change (AP commit 72766e6, reflection floor / only-raise band) is held until A2
  reflections exist (D10).
- `study_guide_diagnostic.html` is hidden from student navigation until A2 content replaces its AP items (D4).
- Do Now readiness cues, the academic receipt feed with Print Sealed Summary and session QR, the teacher scan
  verifier, and calendar-cell → lesson check are restored (D1, D2, D3, D9); every Sync Nearby remnant is removed (D5).
The full list and statuses live in `data/a2-fork-audit.json` (pinned by `tests/a2-fork-freeze.test.js`).
