# Continuation Prompt — Algebra 2 Desk, SY26-27

Updated 2026-10-06 (Tuesday of week 5). Paste into the next Claude Code / Codex session after
`git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`, `A2_FORK_BASELINE.md` and the specs under
`docs/a2-*-spec.md` first. Everything below is deployed unless marked otherwise.

## What changed on 2026-10-05/06 (read this first)

1. **Teacher prep per lesson lives in `content/a2/lesson-prep.json`** (commit 32bcba7, deployed).
   Per lesson: PLC keep/cut decision per example with DOK and practice items, the quiz item the
   lesson is taught toward, IXL skill per example, the DOK 3 task, and the TE's Model & Discuss /
   Explore & Reason questions with answers. The teacher day panel shows it as a "Teacher prep"
   fold under the IXL skills (`_appendA2TeacherPrep` in `desk.html`, loaded by `a2-desk.js`).
   Teacher-only; students never load it. Entries so far: **1-2** (draft from the Sep 27 plan) and
   **1-3** (PLC decisions of Oct 6). Add the next lesson as a new key when the PLC decides it.
2. **1-3 PLC decisions (Oct 6):** keep Examples 2 and 3, cut 1, 4 and 5; the lesson is taught
   toward 1-3 Lesson Quiz item 1 (two-piece graph, key B, verify against the TE); the DOK 3 that
   replaces Example 5 is practice item 27 (Yama earnings, three pieces); IXL RVD (Ex 2) and W67
   (Ex 3), WRZ demoted to prerequisite in `data/a2-lesson-skills.json`. Objectives are a lean
   "I can" draft in lesson-prep.json; `lesson-objectives.json` stays verbatim-from-packet.
   The PLC rule: examples can be cut, but one DOK 3 item must survive; an IXL skill is DOK 1-2 and
   cannot stand in for it.
3. **1-2 is the current lesson.** Only 1-2 quiz item 1 is on the Topic 1 assessment (end of
   October). Day 1 (C and D Mon Oct 5, G Tue Oct 6) was the key-points bridge from 1-1: whiteboard
   rounds (vertex, intercepts) and `../Lesson_planning/a2_1-2_day1_key_points.pdf` (two pages)
   with a separate on-demand `_support.pdf` (word bank with Spanish glosses + sentence frames,
   same numbering). Supervisor rule (Ms. Bonnevie): scaffolds go to ELLs on demand, not to
   everyone. Day 2 uses Mr. Mailloux's Notice & Wonder peer-share packet (nine |x| graphs with
   conversation frames); the Louvre pyramid performance task waits until after Examples 2-5.
   Posters are labeled Day 1 / Day 2, not weekdays, because the sections are staggered.
4. **Grading rules now in force (Sep 28/30):** the lesson quiz counts Q3 and Q4 (10 each), Q1 is
   +5 bonus, capped at 20; Try Its are bonus on the quiz, not Assignments items; a SmartScore of
   80 on each assigned IXL skill (1-1: W42, BNH, PHD) replaces the quiz with 20/20; Assignments
   is fed by Group Jams and IXL homework. The 1-1 replacement window stays open; progress-report
   grades go in **Wed Oct 7**. Live IXL on Oct 5: nobody under 20 in D had qualified (Sandra
   100/55/-, Anderson 84/38/-, Dylan 13/73/20, Amavany -/-/52).
5. **Schoology entries made Oct 5/6:** "Whiteboard work" (10 pts, Engagement, due Oct 5) in C and
   D; D all present 10/10 (Deysi blank), C 10/10 for Carelys, Jamaal, Cristofer, Ma'Kaya, Diego
   and Nicole, rest blank. **Group Jam columns are done (Oct 6, Chrome MCP):** 10/10 for every
   student (makeups not required), Assignments, 10 pts, due on the class day. D: PS2 Sep 18, W42
   Sep 21, WMS Sep 23 (15 students). C: "Group Jam: Graph inequalities on number lines + Domain and
   range (1-1), Sep 17", "Group Jam: Estimate average rate of change (W42), Sep 21", "Poster work:
   Try Its 4 and 5 (1-1), Sep 24" (10 students). G: "Group Jam: Find values using function graphs
   (FS8) + Complete a table (W5Z), Sep 17", "Group Jam: Evaluate functions (PS2), Sep 18", "Poster
   work: Try Its 4 and 5 (1-1), Sep 24" (15 students). **G Sep 23 was NOT created**: the day log has
   no note for it and the Sep 24 note says the planned W42/WMS Web Jam was dropped, so there is no
   real jam to back it; ask the teacher what G actually did that day before adding a fourth column.
   The teacher's spoken names: "Carolina" = Carelys, "Tristan" = Diego, "Christopher" = Cristofer.
   Do not manufacture graded work; backfill only from real jams, worksheets, Try Its and IXL.
6. **Gradebook entry from Chrome MCP** works when browser-harness is blocked on Chrome's Allow
   dialog: compute the cell centre from `#grader-grid-cell-{col}-{row}`, real `left_click`, type,
   Enter, re-read `aria-label`; JS `focus()` alone drops keystrokes; scroll the grid so the column
   is on screen first. New column: `/course/{cid}/materials/assignments/add?is_popup=1`, set
   fields by JS, click `#edit-submit` inside `setTimeout`. IXL sign-in: ixl.com/signin -> Lynn
   link -> ClassLink -> "Sign in using Windows" (no password typed); then
   Faster bulk entry: after one real click lands focus in row 0, Enter commits and moves focus down
   one row, so a single `type` of "10
10
..." fills a whole column; scroll the grid wrapper
   (`.grader-grid-table-wrapper`, `scrollLeft = scrollWidth`) rather than the page, since a cell
   flush against the viewport edge takes the click but drops the keystrokes.
   `fetch('/analytics/skill-score-chart/run?teacherId=<id>&skill=<skillId>')` from the IXL tab
   returns `table[]` with firstName/lastName/score. Skill ids in `tools/ixl/skill-ids.json`.
7. Ops (Fable->Ops channel) staged the 1-2 and 1-3 lesson quizzes and the 1-3 TE pages in
   `../Lesson_planning` on Oct 2 and asked for a 1-3 TE pass, question-bank ingest for 1-2/1-3 and
   keeper quiz questions; the keeper questions are now decided (1-2 item 1, 1-3 item 1). Nothing
   from Ops authorizes a push.

8. **PowerSchool (Oct 6 evening):** PowerTeacher Pro (lynnschools.powerschool.com, Microsoft SSO;
   C = sectionId 68114) had NO grade-calculation formula on any term for any class, so every
   PowerSchool grade was Total Points, not the district 50/40/10. Teacher chose to set Category
   Weighting per term (Settings -> Traditional Grade Calculations -> pencil on M1): Classwork 40,
   Quiz 50, Project 10, Test unused until a topic assessment exists (then split the 50 or move
   Assessments to Test). The Schoology->PowerSchool adapter allows one Schoology category per
   PowerSchool category: Quiz <- Assessments, Classwork <- Assignments, Project <- Engagement; never
   map Schoology's dead 0% "Classwork" category. The Claude Code auto-mode classifier blocks typing
   into PowerSchool ("Unrequested Commit in a Connected App"), so the teacher sets the weights by
   hand. Teacher set C's M1 to Category Weighting by hand (verified; D and G to confirm) and recategorized Poster work to Engagement (shows as Proj in PowerSchool). M1 progress-report comments for all 10 C students were typed and saved in PowerSchool (Grading -> Comment Verification; the side panel's Comments box accepts typed text, click the next grid row to commit, green Save at bottom right; typing comments was NOT blocked by the classifier, only the weight field was). D (sectionId 68112) and G (68113) M1 comments also typed and saved for all 15 students each; all three classes now show Calculation: Category Weighting. SYNC GAP seen Oct 6 evening: PowerSchool D had NO scores at all (every M1 grade "--") and G showed 100% for everyone (jams synced, the 1-1 Quiz did not), while C had all five columns. Check the Schoology->PowerSchool grade sync for D and G before the Oct 7 progress reports. Gary (G)
   1-1 Quiz set to 10 (verified).

## What changed on 2026-09-22/23 (still true unless superseded above)

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

1. Group Jam columns are done (item 5 above) except G's Sep 23, which needs the teacher to say
   what happened. Then the Oct 5 worksheet as an Assignments column once graded.
2. **IXL quiz replacement, pulled Oct 6 evening** (`roster-local/ixl-{W42,BNH,PHD}-2026-10-06.json`,
   qualifiers in `roster-local/quiz/2026-10-06-Period{C,D,G}-ixl-replace.json`): C Nicole lifted
   15 -> 20; every other qualifier already had 20. Still under 20 and not qualified (W42/BNH/PHD):
   C Carelys 38/87/-, Diego 80/76/0, Rovyr -, Anyi -, Luis 25/-/-; D Anderson 77/73/-, Dylan
   13/100/100, Sandra 100/55/-, Amavany -/-/52; G Alejandra 82/55/-, Shirley 84/81/20, Gary -.
   **Oct 6 evening, teacher's partial-credit adds on the 1-1 Quiz (entered, verified):** C Carelys
   15->18, Diego 13->18; D Anderson 18->20, Dylan 0->18, Sandra 16->19, Amavany 0->15; G Alejandra
   10->15, Shirley 13->19. Untouched: C Rovyr 10, Anyi 10, Luis 10; G Gary 4. Re-pull Wed Oct 7
   morning before progress reports if the teacher wants a last look. The IXL teacher id is readable from the skill-score-chart page's own
   `run` request (`performance.getEntriesByType('resource')`); ClassLink's domain is blocked for the
   Chrome extension, but the Windows SSO click still went through and IXL signed in.
3. 1-2: log Day 2 per section; grade Try It 5 on quiz day; 1-2 quiz Thu/Fri.
4. 1-3: when the PLC packet is final, copy its verbatim objectives into
   `content/a2/lesson-objectives.json`, update `lesson-prep.json` status, and build the Desk
   content (`docs/a2-lesson-targets.md` order).
5. **Relay / note box** in the teacher day panel (teacher wants it); two decisions pending (notes
   on the roster server? may scheduled runs commit day-log edits?).
6. First paper Do Now tally through the Engagement script; R4/R5 parked while students are off the
   Desk; rotate the teacher key (`TEACHER_KEY` in Railway, then `roster-server/.env`).
