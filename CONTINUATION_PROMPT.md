# Continuation Prompt — Algebra 2 Desk, SY26-27

Updated 2026-09-21, end of the launch day. Paste into the next Claude Code / Codex session after
`git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`, `A2_FORK_BASELINE.md` and the specs under
`docs/a2-*-spec.md` first. Everything below is deployed unless marked otherwise.

## The class, as the teacher runs it (source of truth: `start-here.html`)

Sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), G (Tue/Wed/Thu/Fri). Each period: charged Chromebook,
Blooket opener, then either the paper packet or an IXL Web Jam, free time if the jam ends early.
Grading (district formula 50/40/10):

| Piece | Category | Points | Rule |
| --- | --- | --- | --- |
| Daily Engagement | Engagement | 10 per class day | Blooket accuracy + questions answered; a same-day flashcard run can redeem it: final = higher + half the lower, capped. Absent day = no item, never a zero. |
| Try-It | Assignments | 10 each | Teacher grades the **physical packet on quiz day**: 10 right with work · 8 effort-but-wrong or right-without-work · 1–7 partial · 0 unattempted (provisional zero 7 days after the set is scored; redoable). Students cannot see or change Try-Its on the Desk (`A2_SHOW_TRYIT_GRADES=false` is the seam for a read-only line later). |
| Quiz | Assessments | 20 | ~1 per lesson in Q1 (no topic test lands in Q1; Topic 1 test is Nov 9–10). Notes and packet allowed; same 80% work rule. |
| Topic assessment | Assessments | 100 | latest score counts. |
| Bonus | Assignments, extra credit | 0 possible, ≤10 earned/quarter | weeks 1–2 opener (≤3), Web Jam accuracy (≤1 per jam), IXL homework at SmartScore **80+** (+1; 80 = complete, 100 never required). |

Flashcards are ONE activity (the daily draw of 10 from the Blooket-mirroring deck), never
pass/fail, no 80% language; they count only through the Engagement redemption. The digital lesson
check is retired. Students see "Your grade is in Schoology for now." (`A2_STUDENT_GRADES_VISIBLE
= false` in `roster-client.js`) until the Desk grade view is switched on.

## What was built 2026-09-20/21 (all by spec → Codex build → Codex review → fix rounds)

- `docs/a2-student-launch-spec.md`: shared starting password `password` (must change on first
  sign-in), duplicate-proof self-signup (`roster-server/names-match.js`), password-versioned
  tokens, Desk grade hidden, AP leftovers removed, Blooket-mirroring deck
  (`scripts/build-a2-blooket-deck.mjs`, 36 cards, 23 number-line images), A2's own roster
  override key `a2_roster_service_url_override`.
- `docs/a2-daily-engagement-spec.md`: raw flashcard runs per America/New_York day
  (`/flashcards/daily`, teacher read `GET /teacher/flashcards/daily`), calculator
  `scripts/a2-daily-engagement.mjs` (config `data/a2-engagement-config.json`), `--commit`
  writes idempotently through `roster-server/teacher-score-import.js`.
- `docs/a2-desk-grade-rebuild-spec.md`: district engine with the table above, assigned-only
  Try-Its + provisional zeros, optimistic versioning on every teacher write (`expectedVersion`,
  409 `score-changed`), `teacher-tryits.html` 10/8/0 + "collected today", migration
  `roster-server/migrations/0040_a2_teacher_entry.sql` (APPLIED in the live Supabase project
  "lrsl-trainer", schema `a2`). R4 (student grade view) and R5 (Schoology mirror via
  `tools/schoology-sync.py`) are NOT built.
- `docs/a2-flashcards-simplify-spec.md`, `docs/a2-objectives-display-spec.md` (bottom strip with
  each lesson's learning + language objective for observers; data in
  `content/a2/lesson-objectives.json`, only 1-1 authored, verbatim from the packet),
  `docs/a2-student-focus-spec.md` (focused two-week student calendar with one `student` line per
  class day from `content/a2/day-log.json`; teacher view unchanged).

## Daily operating procedure (teacher-local data lives in gitignored `roster-local/`)

1. Blooket screenshot → `roster-local/blooket/<date>-<Period>.json` (`{players:[{name,correct,answered}]}`;
   nicknames in `roster-local/blooket-aliases.json`, never guess) →
   `node scripts/a2-daily-engagement.mjs --section PeriodC --date <date> --url <railway> --commit`.
2. Web Jam results → rows in `roster-local/a2-bonus-ledger.json` (1 pt × accuracy) →
   `node scripts/a2-bonus-totals.mjs --commit --url <railway>` → Schoology Bonus column overwrite
   (gradebook keystroke method, browser-harness `domain-skills/schoology/course-admin.md`).
3. IXL homework → IXL's `/analytics/skill-score-chart/run?skill=<id>` JSON from the signed-in
   Chrome (browser-harness `domain-skills/blooket|schoology`), +1 at 80+, then step 2. A helper
   lived in the session temp dir (`ixl_bonus_run.sh`); recreate under `tools/` if wanted.
4. Day log: every upcoming class day needs a short `student` line; `note`/`plan` are teacher-only.
5. Deploy only outside school hours (Railway restarts); push only when the root suite fails
   exactly the six inherited files (`tests/a2-fork-freeze`, `tests/phase4b-structure`, the three
   `tests/progress-reset-matrix-*`, `tests/journeys/j7-offline-grade`) and `roster-server`
   `npm test` is green. `unset ROSTER_TEACHER_SECRET` first: the teacher's PC has a stale AP Stats
   env var that overrides `roster-server/.env` (which holds the real teacher key as
   `ROSTER_TEACHER_SECRET`). Never `git add -A` from the repo root (it once published Blooket
   screenshots); stage files explicitly.
6. GitNexus does not index this checkout; tell agents to grep callers instead or they stop.

## Schoology state (courses C 8537065947, D 8537065922, G 8537065934)

Materials per course: OneNote link, 1-1 blooket, Week 3 IXL focus folder (day folders say "80
counts as complete"), Bonus (0 pts, Assignments, count-in-grade OFF), 1-1 Quiz (20 pts,
Assessments), syllabus PDF, Desk link (**unpublished** in all three until the teacher says go).
Categories Assessments/Assignments/Engagement 50/40/10; old categories at 0%. Quiz: C Thu Sep 24,
D and G Fri Sep 25; handout with Q1/Q3/Q4 only at `roster-local/handouts/`.

## Open items, in order

1. Publish the Desk link when the teacher says the site is ready (students then sign in with
   `password` and must change it).
2. Author `student` lines for the week of Sep 28 and lesson 1-2's objectives (packet needed).
3. R4: switch `A2_STUDENT_GRADES_VISIBLE` on once real scores exist (after the 1-1 quizzes).
4. R5: Schoology mirror so the teacher stops typing scores.
5. Teacher account `date_frog` still has a 4-digit password; the teacher key was pasted into a
   chat and should be rotated (`TEACHER_KEY` in Railway, then `roster-server/.env`).
