# Continuation Prompt — Algebra 2 Desk, SY26-27

Updated 2026-09-23 (Wednesday of week 3). Paste into the next Claude Code / Codex session after
`git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`, `A2_FORK_BASELINE.md` and the specs under
`docs/a2-*-spec.md` first. Everything below is deployed unless marked otherwise.

## What changed on 2026-09-22/23 (read this first)

1. **The Desk is a teacher/agent workbench, not a student tool.** The teacher said students will
   not really use it for now; it is "a bank of knowledge for you and I to discuss and work on".
   The Desk link is removed from Section C and unpublished in D and G. Do not design routines
   that assume students are on the Desk (flashcard openers, Try-Its on the Desk, sign-in).
2. **No daily Blooket.** The supervisor (Ms. Bonnevie) worries about district walkthroughs;
   Blooket is at most 1–2 days a week. Daily Engagement evidence comes from the room: a paper
   Do Now / exit ticket (new source in `scripts/a2-daily-engagement.mjs`, see procedure), IXL,
   occasional Blooket. The Week 3 folder text in Schoology still says "Each day: Blooket
   opener" — the teacher has not asked to reword it.
3. **Weekly objectives on the whiteboard** are required for district visitors. The Desk's
   objectives strip, when the teacher expands it, lists the whole week for all three sections
   (learning + language objectives, standards, essential question, verbatim from
   `content/a2/lesson-objectives.json`). `scripts/build-a2-week-objectives.mjs` prints a paper
   copy; the teacher prefers the on-Desk view. Lesson 1-2 objectives were added from the Savvas
   source doc (`content/a2/source-docs/`); re-check when the 1-2 packet is written.
4. **Teacher's quiet board** (`body.a2-teacher-quiet`, teacher viewing as self): no Do Now card,
   check-in banner, unit progress or school-day countdown; a cell shows only the date, the
   lesson title where the lesson changes, and the day log's short `student` line; no Try-It
   chips; the legend lists only the five scheduled topics. Marching ants mean "a meeting day of
   this week, today or earlier, with no `note` logged yet" and clear when a note lands. Clicking a
   day opens the **teacher day panel**: that day's Landed/Plan for this section, the lesson's
   other days for this section, then folds: "IXL skills for this lesson" (core first, prereqs
   sub-folded, deduped by URL, merged from `content/a2/lesson-skills.json` and the server lesson),
   "Other resources" (flashcards, Blooket set, OneNote), "Teacher pacing". Students' focused view
   is unchanged.
5. **Schoology is a channel.** When a course's state differs from what we expect, the teacher
   decided otherwise: keep it, update our notes, never re-create what they removed. Never give an
   assignment a due date on a day the section does not meet (C Mon/Tue/Thu, D Mon/Wed/Fri,
   G Tue/Wed/Thu/Fri). The signed-in domain in Chrome is `lynnschools.schoology.com`
   (app.schoology.com is a login wall). Chrome MCP recipes (add link/folder/update, delete; Edit
   and Move per item do not open) are in the memory note `schoology-chrome-mcp-recipes`.
6. **Use the Vercel address** `https://a2-live-worksheets.vercel.app/desk.html`. The GitHub Pages
   copy caches for 10 minutes and looped the "new version" banner; the nudge now refetches past
   the cache and nudges once per build, but Vercel is still the right link.
7. **IXL bonus tooling** moved into `tools/ixl/` (README there): pull the analytics JSON from a
   Chrome tab where the teacher signed in via the district ClassLink SSO, then
   `python tools/ixl/ixl_award_from_file.py <json> <code> <section> <due> "<label>" [--commit]`,
   `node scripts/a2-bonus-totals.mjs --commit --url <railway>`, then rewrite the Bonus column
   (`tools/ixl/schoology_enter_bonus.py` via browser-harness). Set `IXL_TEACHER_ID` and
   `A2_TEACHER_SURNAME` in the environment; the repo is PUBLIC and must not carry the name or id
   (commit e3a475b briefly did; history not rewritten).

## The class, as the teacher runs it

Sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), G (Tue/Wed/Thu/Fri). Each period: paper packet work,
IXL Web/Group Jams on the lesson's skills, class time for Try-Its; Nintendo if done early.
Grading (district formula 50/40/10):

| Piece | Category | Points | Rule |
| --- | --- | --- | --- |
| Daily Engagement | Engagement | 10 per class day | Best source + half the second best across paper Do Now, Blooket and flashcards, capped. Absent day = blank, never a zero. |
| Try-It | bonus on the lesson quiz (Sep 28 rule) | up to 5 each | Graded from the physical packet on quiz day; never an Assignments column. Off the student Desk. |
| Quiz | Assessments | 20 | ~1 per lesson in Q1. Q3 + Q4 (10 each), Q1 +5 bonus, capped at 20. IXL 80+ on each assigned skill replaces it with 20/20. |
| Topic assessment | Assessments | 100 | latest score counts. |
| Group Jam / IXL homework | Assignments | 10 each | Jams scored as participation; IXL at SmartScore 80+ = full. |
| Bonus | Assignments, extra credit | 0 possible, ≤10 earned/quarter | weeks 1–2 opener (≤3), Web Jam accuracy (≤1 per jam), IXL homework at SmartScore **80+** (+1). |

## Where the lessons stand (week of Oct 5)

1-1 is closed: quizzes taken Sep 28 (D) and Sep 29 (C, G), packets collected, Try Its graded as
quiz bonus, IXL replacement window open through Oct 7. 1-2 Day 1 done in C and D (Oct 5) and G
(Oct 6); Day 2 next meeting; Examples 2-5 and the 1-2 quiz Thu/Fri Oct 8-9 per
`../Lesson_planning/a2_1-2_plan_oct5-7.pdf`. 1-3 packet is being re-cut by the PLC (see item 2
above); do not publish 1-3 content until that packet exists. Everything landed is in
`content/a2/day-log.json`.

## Daily operating procedure (teacher-local data lives in gitignored `roster-local/`)

1. Day log: run `node scripts/pull-class-summaries.mjs` and read that day's
   `roster-local/class-summaries/<date>-<section>.md`; write `note` + short `student` line per
   section-day in `content/a2/day-log.json` from the summary and what the teacher says,
   `node scripts/bump-build.mjs`, commit, push (the teacher OK'd pushes during the day this week).
   The teacher's words win on conflicts and the summary fills in what they did not mention; copy
   each `promises` item not already done into "Open items, in order". Read `studentQuestions` before
   drafting the next card (`scripts/draft-observer-cards.mjs` already reads the server).
2. Engagement: paper tally → `roster-local/paper/<date>-<Period>.json`
   (`{"outOf": n, "students": [{"name": "<roster name or alias>", "score": k}]}`); Blooket file
   optional at `roster-local/blooket/<date>-<Period>.json`; then
   `unset ROSTER_TEACHER_SECRET; node scripts/a2-daily-engagement.mjs --section PeriodC --date <date> --url <railway> [--commit]`
   and enter the CSV points in Schoology. No paper tally has been run yet.
3. IXL homework → step 7 above. Web Jam results → rows in `roster-local/a2-bonus-ledger.json`.
4. After editing `data/a2-lesson-skills.json` run `build-a2-lesson-skills.mjs` **and**
   `sync-server-shared.mjs` (the Desk reads the server's lesson copy; forgetting the sync hid WMS).
5. Deploy gate: push only when the root suite fails exactly the six inherited files
   (`a2-fork-freeze`, `phase4b-structure`, three `progress-reset-matrix-*`, `journeys/j7-offline-grade`).
   Chain `npx vitest run ... && git commit && git push` on vitest's exit code, never on a grep.
   `unset ROSTER_TEACHER_SECRET` first; never `git add -A`.
6. GitNexus does not index this checkout; tell agents to grep callers instead.

## Schoology state (courses C 8537065947, D 8537065922, G 8537065934; Advisory 8537050802)

Materials per Algebra 2 course: OneNote link, 1-1 blooket, Week 3 IXL focus folder, Bonus (0 pts,
Assignments, count-in-grade OFF), 1-1 Quiz (Assessments; C still due Thu 9/24), syllabus PDF, Desk
link (gone in C, unpublished in D/G). C also has an "IXL: IXL(example5reinforce)" external tool due
Wed 9/23 that the teacher made but never assigned; harmless, leave it. Advisory has one folder
"week 3 [9/23]" with the two SBIRT survey links and the intro video.

## Open items, in order

1. **Relay / note box** (teacher wants it): a note box in the teacher day panel that saves to the
   roster server; notes are log lines, decisions and requests; a pull script plus scheduled
   school-day checks (9/11/1/3) that read new notes and act or draft. Two decisions pending from
   the teacher: notes stored on the roster server (yes?), and whether scheduled runs may commit
   day-log edits or only draft them.
2. Monday 9/28: C's 1-1 Quiz; grade Try Its 4 and 5 from packets on each quiz day
   (`teacher-tryits.html`); pull WMS scores for C if the homework was assigned Thursday.
3. Lesson 1-2 packet (C opens 1-2 Mon 9/28); the objectives are already on the board.
   **Decision (9/27):** the class goes through Examples 1-5 with the focus on Example 5; Try It 5
   is the graded Try It; Example 6 is dropped from the packet. This targets 1-2 Lesson Quiz Q1
   (`aga_24_a2_na_0102_lq.pdf`; TE key A, C, D, F: translation 1 left, translation 2 down,
   horizontal stretch by 2, reflection across the x-axis; the vertex is at (-1,-2). An earlier
   session read it as C, D, F, which was wrong). Recorded in the day log as 1-2 plan entries (C Tue 9/29, D and G
   Wed 9/30). The class packet is `../Lesson_planning/a2_1-2.pdf` (source `a2_1-2.docx`): the
   Savvas-derived doc from `content/a2/source-docs/` with the Example 6 section removed and
   Try It 5 marked "Collected and graded"; 8 pages, Examples 1-5 plus the Concept Summary and
   Do You Understand / Know How pages. The 1-2 TE (pp. 24-36, 13 pages) is at
   `../Lesson_planning/a2_1-2_TE.pdf` (untracked, copyrighted; original at this repo's root as
   `a2_1-2.pdf`), transcribed by Codex to `a2_1-2_TE.tex` and ingested 2026-09-27: calibration
   `questionbank/calibration/1-2.json` (item analysis + quiz DOKs), 77 registry rows (`1-2-savvas-q13`
   .. `q38`, Try Its, examples, TE addenda, the Lesson Quiz row), graph crops `questionbank/images/1-2_*`.
   DOK-3 practice items: 13, 15, 17, 33, 34, 35, 37, 38. dok2/dok3 anchors in the calibration are still
   unpopulated (hand step when the DOK-3 driver is picked).
4. First paper Do Now tally through the Engagement script.
5. R4 (student grade view) and R5 (Schoology mirror) stay parked while students are off the Desk.
6. Teacher account `date_frog` still has a 4-digit password; rotate the teacher key
   (`TEACHER_KEY` in Railway, then `roster-server/.env`).
