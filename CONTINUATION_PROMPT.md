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
| Try-It | Assignments | 10 each | Teacher grades the **physical packet on quiz day**: 10 / 8 / 1–7 / 0. Off the student Desk. |
| Quiz | Assessments | 20 | ~1 per lesson in Q1. Notes and packet allowed. |
| Topic assessment | Assessments | 100 | latest score counts. |
| Bonus | Assignments, extra credit | 0 possible, ≤10 earned/quarter | weeks 1–2 opener (≤3), Web Jam accuracy (≤1 per jam), IXL homework at SmartScore **80+** (+1). |

## Where lesson 1-1 stands (week of Sep 21)

| Section | Ex 4 and 5 | Next meeting | 1-1 Quiz |
| --- | --- | --- | --- |
| C | done Tue 9/22 | Thu 9/24: poster work on Try Its 4 and 5 (worked); no W42/WMS jam, no WMS homework | **Mon 9/28** (deferred; the Schoology assignment still says Thu 9/24 — teacher to move it) |
| D | done Wed 9/23 (WMS jam + Ex 4) | Fri 9/25: Try Its 4 and 5 in class, no poster, Nintendo when done | Fri 9/25 — confirm whether it was taken |
| G | done Tue 9/22 | Thu 9/24: poster work (worked). Fri 9/25: Try Its 4 and 5 took the period, heavy teacher help | **not taken Fri 9/25** — reschedule |

**Decision (9/25):** C and G never really did the average rate of change IXL work (W42 / PHD) and
1-1 goes on without it. Do not plan a make-up jam or homework for it; the skill stays listed on
the lesson for reference only.

Course Updates posted 9/23 in C and G with Thursday's plan. G's PS2 IXL homework was awarded
9/22 evening (5 of 16 at 80+; late finishers by hand). Samuel Betancourt Ruiz (C) mastered W42.
IXL skills for 1-1: PHD A.9 and Algebra 1 W42 (Ex 5), WMS N.1 (Ex 4 — loosely: it labels max,
min, intercepts; IXL has no non-calculus skill for increasing/decreasing intervals), 78A A.1,
prereqs A.2–A.5 and number-line inequalities. Everything is in `content/a2/day-log.json`.

## Daily operating procedure (teacher-local data lives in gitignored `roster-local/`)

1. Day log: after each class the teacher tells us what landed; write `note` + short `student`
   line per section-day in `content/a2/day-log.json`, `node scripts/bump-build.mjs`, commit, push
   (the teacher OK'd pushes during the day this week). A logged note clears the ants.
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
4. First paper Do Now tally through the Engagement script.
5. R4 (student grade view) and R5 (Schoology mirror) stay parked while students are off the Desk.
6. Teacher account `date_frog` still has a 4-digit password; rotate the teacher key
   (`TEACHER_KEY` in Railway, then `roster-server/.env`).
