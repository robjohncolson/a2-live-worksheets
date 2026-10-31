# Continuation Prompt — Algebra 2 Desk, SY26-27

Updated 2026-10-31 (Saturday after week 8). Paste into the next Claude Code / Codex session after
`git pull`. Read `CLAUDE.md`, `A2_FORK_PLAN.md`, `A2_FORK_BASELINE.md` and the specs under
`docs/a2-*-spec.md` first. Everything below is deployed unless marked otherwise.

## What changed 2026-10-30/31 (read this first)

1. **Every remaining year-plan lesson has a fast lesson** built to `docs/a2-fast-lesson-spec.md`
   (the PLC's Oct 20 shape written down: at most two Savvas Examples chosen for the lesson-quiz
   items, Web Jams on the starred IXL skills, the Savvas quiz; SmartScore 70 replaces the quiz).
   Per lesson, in `../Lesson_planning/`: `a2_<L>_fast.tex` + `.pdf` (3-4 pages on
   `fast-packet-template.tex`) and `a2_<L>_quiz_fast.tex` + `.pdf` (the TE quiz items with their
   Savvas numbers, a scoring proposal, an answer key). In this repo: a `content/a2/lesson-prep.json`
   entry (keep/cut proposal, quiz focus, DOK 3, IXL per example, opener questions), a
   `content/a2/lesson-objectives.json` entry (packet goals verbatim) and, for Topics 3+, the
   authored IXL codes in `data/a2-lesson-skills.json`; `lesson-trees/` and `teacher-prompts/` are
   regenerated. Lessons: 2-1, 2-2, 2-3, 2-6, 2-7, 3-1, 3-2, 3-4, 3-5, 4-2, 4-3, 4-4, 4-5, 5-1,
   5-5, 5-6, 6-1, 6-2, 6-3, 6-6, 7-1, 7-2, 7-3 and the brief 1-4, 2-4, 2-5, 3-3, 3-7, 4-1. 1-5
   and 1-6 got objectives entries, 1-6 a prep entry, 1-5's prep was aligned to its fast packet.
   **Every keep/cut is a proposal until the PLC rules**; `docs/a2-fast-lessons-status.md` lists
   each lesson's proposal and the decisions left to the teacher (which items count, which skills
   are starred, a few Example swaps). Record a ruling in the prep entry's `status` line.
2. **How it was checked:** `python tools/check_fast_packet.py` (planning repo) lints every packet
   and quiz; an independent agent verified each lesson's mathematics and rendered pages; Codex
   (gpt-6-astra, `cross-agent.py --task-type review --read-only`) reviewed every lesson twice,
   with a fix round between; the merge into this repo goes through
   `scripts/merge-fast-lesson-drafts.mjs`. Root suite: the same four pre-existing failures as
   before (`a2-fork-freeze`, `a2-objectives-display`, `a2-secrets`, `draft-card-decks`); server
   suite green. `tests/a2-lesson-skills.test.js` now accepts Topics 3+ and pins 2-1 with L8C last.
3. **Not pushed.** The commits are local in both repos; push after the teacher looks at one
   packet (2-1 is next in the plan, due Nov 19/20) and the Topic 1 assessment week is over.

## What changed 2026-10-07 to 10-22 (still true unless superseded above)

1. **The Class Log phone talks to roster-server** (`school/class-log`, a sibling folder of this
   repo; the Kotlin app records each block). Every phone route is `Bearer CLASS_LOG_TOKEN`
   (timing-safe compare; unset => 503), mounted before the app-wide JSON parser so auth runs
   before any body is read; every `/teacher/*` route sits behind `requireTeacher` (the
   `x-teacher-secret` key or a teacher-role token). Each table came in its own migration, run
   by hand in the Supabase SQL editor (schema `a2`, then `NOTIFY pgrst, 'reload schema'`); a
   503 from a route means its migration has not run. In order:
   - **Observer cards** (1f9b140, d23ad73; migrations 0041/0042): `GET /class-log/cards?date=`
     (content-hash ETag, 304 on a weak match too), `POST /class-log/cards/:id/outcome`,
     `PUT /teacher/cards`, `GET /teacher/cards`. `scripts/push-observer-cards.mjs` pushes the
     `observerCard` blocks of `content/a2/day-log.json`; `scripts/draft-observer-cards.mjs`
     drafts them (DeepSeek, `DRAFT_API_*` env) and `--apply` writes the day log atomically.
     Rules in `roster-server/observer-card-rules.js`.
   - **Lesson summaries** (0b0d520, fb5babc; migration 0043): `POST /class-log/summaries`
     (upsert by date/course/section), `GET /teacher/summaries?from=&to=[&course=]` (<= 62 days,
     paged; `course=apstats` is how the AP Stats Desk reads the shared table, added 10/22).
   - **Class Log pass 3** (0551caa; migrations 0044/0045): schedule overrides
     (`GET /class-log/schedule?from=&to=`, `PUT/DELETE/GET /teacher/schedule-overrides`,
     `scripts/push-schedule.mjs` seeds the bell schedule and days off) and device health
     (`POST /class-log/health`, `GET /teacher/health`, 30-day log). The Desk teacher view has a
     health strip (`lib/class-log-health.js`) that compares today's blocks with the phone's last
     ping and hides itself on a schedule error. Since 10/22 the server adds `recordingWarnings24h`
     to each ping (the phone's count, else its `events24h` lines saying `transcript poor` or
     `Mic:` not `ok`) and the strip paints amber for warnings, red for failures; the phone does
     not send either field yet (school/class-log change owed).
   - **Class Log pass 4** (7a95796): `node scripts/pull-class-summaries.mjs` pulls the last 30
     days of summaries into gitignored `roster-local/class-summaries/` (`<date>-<section>.md` +
     `index.json`); the teacher day panel has a "Recording" fold; daily procedure step 1 below
     reads the summary first. `roster-local/` is also excluded from the Vercel upload.
   - **Rehearsal decks** (4a67c9e; migration 0046): `a2.card_decks` (one deck per observer card,
     8-14 items of type frame/anchor/trap/step/cue) and `a2.deck_results` (one row per grade the
     phone records). `GET /class-log/decks?date=` (ETag/304), `POST /class-log/deck-results`
     (<= 200, exact repeats dropped, unique key ignores duplicates; since 10/22 the row's section
     is the card's own, a body naming another section is 409 `section_mismatch`), `PUT /teacher/decks`
     (<= 20 decks, ONE transaction through the `a2.put_card_decks` RPC: a missing card is 404 and
     nothing is written; unchanged content is not rewritten), `GET /teacher/decks` (per-deck
     sessions/asked/again and the three most-missed items; the Desk "Rehearsal" line),
     `DELETE /teacher/decks?cardId=`. Rules in `roster-server/deck-rules.js`;
     `scripts/draft-card-decks.mjs` drafts a deck per card (DeepSeek) or validates a hand-written
     file with `--from-file`, writes `content/a2/card-decks/<date>.json` (tracked; decks hold no
     student data and the script refuses roster first names) and `--apply` PUTs it. Hand-written
     decks for Thu 10/22 C and G are in `content/a2/card-decks/2026-10-22.json`.
   - Deck results, summaries, outcomes, schedule overrides and health pings are **never read by
     the grade engine** (checked 2026-10-22: no grade or ledger module touches those tables).
2. **Railway incident 2026-10-21:** the deploy of 4a67c9e never built; b8c16df (10/22) is an
   empty re-trigger. Check `/health` on the roster server after any push that day-ish and
   compare the commit it reports with `git log -1`.
3. **Review of 2026-10-22** (`docs/review-2026-10-22.md`): one fix — a hand-edited
   `card_decks.items` entry that is not an object (the 0046 check only pins the jsonb type)
   crashed the process on `GET /teacher/decks` (an uncaught throw in an Express 4 async handler
   is an unhandled rejection); `deckFromRow` now drops such entries, with a test. The rest of the
   list is plausible-only; the teacher key compare in `requireTeacher` is `===`, not
   timing-safe (accepted, noted).
4. **Lesson 1-2, as taught (Oct 8-20):** Examples 1-3 with the IXL skills as Web/Group Jams —
   23W (graph an absolute value function, prerequisite; homework column "IXL 23W ... (1-2
   homework)", SmartScore/70 x 10, capped at 10, due Thu 10/15 C / Fri 10/16 D and G; dropped
   for D and repurposed as a Web Jam column), FS8 (find values using function graphs), F6J
   (translations, Example 1), PHV (reflections, Example 2), NNY (dilations) and RSN (combined
   transformations) as the pre-quiz Jams. Jam columns are 10 pts Assignments, everyone present
   10 plus a 0.5 x fraction bonus for the Jam score; Try It columns are 5 pts (correct = 6).
   The 1-2 quiz is the short form `../Lesson_planning/a2_1-2_quiz_fast.pdf` (Savvas items 1, 3,
   5; items 2 and 3 count 10 each, item 1 is +5 bonus, 20-pt Assessments). C and G took it
   Tue 10/20; **D has not** (SAT day 10/21 cut D to ~25 minutes, no Jams, no quiz; D's quiz is
   Fri 10/23 after the NNY/RSN Jams). G had no block on 10/21, so every later G day shifts one
   meeting and the U5D/FT6 Jams merge into the Nov 3 quiz day. The 10/21 D recording is unusable
   (phone in a bag). Teacher observation Mon 10/19 in C (Ms. Bonnevie and Mr. Serino).
5. **Lesson 1-3 starts Thu 10/22** (C and G) with the fast packet `../Lesson_planning/a2_1-3_fast.pdf`:
   Examples 3 and 5 only, Web Jams RVD and W67, observer card "Write the rule for a three-piece
   graph"; no iPad (pen broken), the PDF goes on the SMART board with freeze + tray pen. 1-3 quiz
   (4 items) G Fri 10/23, C and D Mon 10/26. Then 1-5 (10/27-10/30, Examples 1-2, Web Jams
   M69/FM2/ZBH), 1-6 (10/30-11/4, Examples 1-2, Web Jams BW5/2CN/U5D/FT6), Topic 1 review, and the
   **Topic 1 Assessment Thu 11/5 (C, G) / Fri 11/6 (D)**; Q1 closes Fri 11/6 (Mr. Serino: inside
   Q1, the date is not hard). All of it is planned in `content/a2/day-log.json` with observer
   cards; `docs/a2-lesson-targets.md` now lists the Topic 1 assessment items by lesson (1-4
   carries four including a DOK 3; 1-3 one; 1-5 only item 11).
6. **1-5 lesson prep** is drafted in `content/a2/lesson-prep.json` (PLC proposal of Oct 13:
   keep Examples 1-3, cut 4; taught toward Topic 1 assessment item 11; DOK 3 = practice item 7;
   IXL M69, T86 proposed, FM2, ZBH). `tools/ixl/skill-ids.json` gained 23W, FS8, F6J, PHV.
7. **Roster changes:** a new student joined G on 10/14 (first name Ronaldo; laptop from 10/16)
   and one G student left the gradebook. The day log tells the two Wendys in G apart by a
   surname fragment ("Cha." / "Chv."), never the full surname; keep it at first names.
8. `docs/a2-tryit-capture-plan.md` (Oct 2, **on hold**): focused days + captured Try Its with
   AI partial credit; nothing built; three decisions listed at its end.

## What changed on 2026-10-05/06 (still true unless superseded above)

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

## Where the lessons stand (Thu Oct 22)

1-1 closed (quizzes Sep 28/29, IXL replacement window closed Oct 7, partial-credit adds entered
Oct 6). 1-2 taught Oct 5-20 in all sections; the short 1-2 quiz is taken in C and G (Oct 20) and
**still owed by D (Fri Oct 23, after the NNY/RSN Jams)**. 1-3 opens Thu Oct 22 in C and G with the
fast packet (Examples 3 and 5), Mon Oct 26 in D; 1-3 quiz G Oct 23, C and D Oct 26. Then 1-5
(Oct 27-30), 1-6 (Oct 30-Nov 4), Topic 1 review, Topic 1 Assessment Nov 5 (C, G) / Nov 6 (D); Q1
closes Nov 6. 1-3 content is still unpublished on the Desk (the PLC packet is the fast packet,
not the Savvas one; objectives verbatim from the packet are still owed to
`content/a2/lesson-objectives.json`). Everything landed and planned is in
`content/a2/day-log.json`; the observer cards and rehearsal decks for a day come from it.

## Daily operating procedure (teacher-local data lives in gitignored `roster-local/`)

1. Day log: run `node scripts/pull-class-summaries.mjs` and read that day's
   `roster-local/class-summaries/<date>-<section>.md`; write `note` + short `student` line per
   section-day in `content/a2/day-log.json` from the summary and what the teacher says,
   `node scripts/bump-build.mjs`, commit, push (the teacher OK'd pushes during the day this week).
   The teacher's words win on conflicts and the summary fills in what they did not mention; copy
   each `promises` item not already done into "Open items, in order". Read `studentQuestions` before
   drafting the next card (`scripts/draft-observer-cards.mjs` already reads the server).
   Tomorrow's note: the Windows task `A2 Tomorrow Draft` runs `tools/nightly_tomorrow.ps1` at
   20:30 (pull, then `node scripts/draft-tomorrow.mjs`), writing `roster-local/tomorrow/<date>-<section>.md`
   per section for its next class day and logging to `roster-local/tomorrow/log.txt`; the Desk's
   teacher day panel shows the same note in its "Tomorrow (draft)" fold. Read it before planning
   the next C, D or G class. It is deterministic (day log + lesson prep + lesson skills + the latest
   recording): the Do Now is the Jam the day's plan names, else the next kept example's assigned
   IXL skill, else the first skill not yet jammed, else a kept packet item not yet in the day log,
   never a new task (teacher, 2026-10-22); the format stays IXL skills, packet, quiz. A wrong note
   means the day log is behind: fix the day log, never the note. Run it by hand for another day
   with `--date YYYY-MM-DD [--section G]`.
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

1. **D's 1-2 quiz Fri Oct 23** (Web Jams NNY then RSN, then `a2_1-2_quiz_fast.pdf`); enter it as
   the 20-pt Assessments column like C and G; grade Try It 2 (5 pts, correct = 6) from the packets.
2. **1-3:** G quiz Fri Oct 23, C and D Mon Oct 26 (4 items). Copy the fast packet's objectives
   verbatim into `content/a2/lesson-objectives.json`, update `lesson-prep.json` status, and build
   the Desk content (`docs/a2-lesson-targets.md` order). Draft the Oct 23/26 observer cards and
   decks (`draft-observer-cards.mjs`, `draft-card-decks.mjs --apply`) the evening before.
3. **1-5 PLC proposal** (`lesson-prep.json` 1-5, Oct 13 draft): keep/cut and the DOK 3 are still
   the PLC's call; T86 proposed for `data/a2-lesson-skills.json` (then run
   `build-a2-lesson-skills.mjs` **and** `sync-server-shared.mjs`); verify 39B in IXL before keeping.
4. Group Jam columns are done (Oct 6) except G's Sep 23, which needs the teacher to say what
   happened; the Oct 5 worksheet as an Assignments column once graded.
5. Topic 1 Assessment inside Q1 (Nov 5/6); plan the review from the lowest Jam skills per
   section (`GET /teacher/decks` and the day log carry the Jam scores).
6. **Relay / note box** in the teacher day panel (teacher wants it); two decisions pending (notes
   on the roster server? may scheduled runs commit day-log edits?). The Class Log summaries now
   cover the "what happened" half; the note box is the "what I want" half.
7. First paper Do Now tally through the Engagement script; R4/R5 parked while students are off the
   Desk; rotate the teacher key (`TEACHER_KEY` in Railway, then `roster-server/.env`);
   `docs/a2-tryit-capture-plan.md` stays on hold until its three decisions are answered.
8. Review follow-ups that are plausible, not confirmed, are listed in `docs/review-2026-10-22.md`
   (phone-supplied `section` on a deck result is not checked against the card; the roster-name
   check in `draft-card-decks.mjs` is silent when `roster-local/roster-view-*.csv` is absent).
