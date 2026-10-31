# Algebra 2 fast lessons: spec

**Status:** draft for the PLC, written 2026-10-30 from the October PLC record, amended 2026-10-31
(the Topic Assessment is the end goal; section 1 last row, R1, R8, sections 3, 7, 10, 12). It
describes how the fast packets for 1-3, 1-5 and 1-6 were made and sets the same method for every
lesson still in the year plan. The keep/cut choices it produces are **proposals** until the PLC
confirms them, exactly like the Oct 13 draft for 1-5 was.

Companion files: `../Lesson_planning/fast-packet-template.tex` (the shared preamble),
`../Lesson_planning/a2_1-3_fast.tex`, `a2_1-5_fast.tex`, `a2_1-6_fast.tex` (exemplar packets),
`../Lesson_planning/a2_1-2_quiz_fast.tex` (exemplar short-form quiz),
`content/a2/lesson-prep.json` (exemplar teacher prep: `1-3`, `1-5`),
`../Lesson_planning/tools/check_fast_packet.py` (lint), `scripts/merge-fast-lesson-drafts.mjs` (merge).

## 1. Where the format came from

| When | Who | Decision | Recorded in |
|---|---|---|---|
| Sep 2026 (two PLCs) | department | Keep / brief / skip / bridge per Savvas lesson; compress Topics 1-4 to reach 5-7; two weeks per lesson | `docs/a2-lesson-targets.md`, `data/a2-lesson-targets.json` |
| Oct 6 | PLC (1-3) | Examples can be cut, but **one DOK 3 item must survive**; an IXL skill is DOK 1-2 and cannot stand in for it. The lesson is taught **toward a named lesson-quiz item**. One IXL skill per kept example; a skill the quiz does not need is demoted to prerequisite (WRZ) | `content/a2/lesson-prep.json` (1-3), `data/a2-lesson-skills.json` note, `CONTINUATION_PROMPT.md` |
| Oct 13 | PLC (1-5 draft) | Keep/cut written as a proposal toward the Topic 1 assessment item the lesson feeds; DOK 3 named (practice 7); homework score = SmartScore / 70 x 10 | `lesson-prep.json` (1-5), memory `a2-grading-rule-sep28` |
| Oct 19 / 20 / 27 | Ms. Bonnevie (observer) | One observation-ready **QTEL micro-plan per day on one problem** (Preparing / Interacting / Extending, a sentence frame, structured partner talk); whiteboards used, not just out; open "why" questions; scaffolds to ELLs on demand; an IXL Jam on laptops is the worst thing to be observed on | memory `a2-admin-constraints`, `roster-local/observations/` |
| Oct 20 | PLC, Mr. Serino | **Go fast through the rest of Topic 1** to reach the Topic 1 Assessment by the Q1 close. Per lesson: **at most one or two packet Examples, chosen for the quiz items, then Web Jams on the lesson's IXL skills, then the Savvas Lesson Quiz.** SmartScore 70 on each starred skill replaces the quiz score. Picks: 1-3 Ex 3+5, 1-5 Ex 1+2, 1-6 Ex 1+2; 1-4 skipped; Try It 5 no longer graded for 1-2 | memory `a2-grading-rule-sep28` (Oct 20), `CONTINUATION_PROMPT.md` items 5-6, `content/a2/day-log.json` plans |
| Oct 20 | teacher + assistant | The three fast packets and the 1-2 short-form quiz built on `fast-packet-template.tex` (12 pt, 0.7 in margins, goals box, "On the quiz" box, Example then Try It pairs, IXL table with stars, sentence frames) | `../Lesson_planning/a2_1-*_fast.tex` |
| Oct 27 | teacher (Performance Matters goals) | Every lesson opens with a one-problem Do Now **from the assigned IXL skill, never a new task**; every lesson ends with **visible independent work**; **one language routine per section per week** tied to the posted language objective; lesson checks require shown work; SmartScore target 70 | memory `a2-performance-matters-goals`, `roster-local/performance-matters-goals-2026-27.md` |
| Oct 31 | teacher | **The Savvas Topic Assessment is the end goal of every lesson; the lesson quiz is the intermediate.** The district's common topic assessments are being remade from the Savvas Topic Assessments (the department removes questions it judges unnecessary, aiming the course at the SAT and Precalculus); the old district Topic 2 and 7 forms no longer exist, the new ones arrive later. So each topic's Savvas Topic Assessment (Forms A and B, TE pages) is transcribed as ground truth and every item is mapped to its lesson and Example before the lessons of that topic are cut | `../Lesson_planning/a2_T<N>_assessment_TE.tex`, `data/a2-topic-assessments.json`, `docs/a2-topic-assessment-audit.md` |

The Teacher Edition transcriptions (`../Lesson_planning/a2_<lesson>_TE.tex`, 2024 enVision, all 69
lessons) are ground truth for every example, Try It, practice item, DOK label and lesson-quiz item
(memory `a2-te-transcription-ground-truth`). The Topic Assessment transcriptions
(`../Lesson_planning/a2_T<N>_assessment_TE.tex`, Topics 1-7: Form A and Form B item by item with
the TE's marked answers, and the TE item-analysis table with DOK and Skills Review codes) are
ground truth for the topic items; `data/a2-topic-assessments.json` maps each item to its lesson
and Example and `node scripts/build-a2-topic-assessment-audit.mjs` renders that map as
`docs/a2-topic-assessment-audit.md`. The TE prints no standards codes; standards come from
the Savvas Realize standards pane (`aga_24_a2_na_<tt><ll>_lq_standards.txt`) or the district
curriculum map.

## 2. The lesson as it runs

A fast lesson is one or two class meetings per kept Example plus a quiz day, inside the two-week
window of the year plan:

1. **Do Now** (under 10 min): one problem from the lesson's assigned IXL skill (the prerequisite
   Jam the day before the first Example; the kept Example's core skill after it). Never a new task.
2. **Example** on the board: the packet page on the SMART board or iPad; the observer card runs it as
   whiteboard rounds, one step per round, boards up, one student says the sentence frame.
3. **Try It** in pairs on the packet (think-pair-share), the teacher circulating with the phone.
4. **Web Jam(s)** on the starred IXL skills (laptops), scored as Assignments columns; homework to
   SmartScore 70 when the Jam is not perfect.
5. **Lesson quiz**: the Savvas Lesson Quiz (Realize PDF when downloaded, else the short form built
   from the TE), 20-point Assessments column; SmartScore 70 on each starred skill replaces the score.
6. **Exit**: the packet's last block (sentence completion or exit question) is the visible
   independent work; the language goal's words are the language routine.

## 3. Deliverables per lesson

In `../Lesson_planning/` (public repo; never student data):

| File | What |
|---|---|
| `a2_<L>_fast.tex` + `.pdf` | the student packet, 3-4 pages, on `fast-packet-template.tex` |
| `a2_<L>_quiz_fast.tex` + `.pdf` | the lesson quiz, short form: the quiz items the kept Examples teach, a scoring line, an answer-key page; built from the TE's Lesson Quiz block. The teacher may use the Realize PDF instead |
| `a2_T<N>_assessment_TE.tex` | once per topic, before its lessons: the Savvas Topic Assessment transcribed from the TE pages (Form A and Form B, every item with the marked answer, the item-analysis table), verified item by item by an independent agent |

In this repo:

| File | What |
|---|---|
| `data/a2-topic-assessments.json` | once per topic: every Topic Assessment item mapped to its lesson and Example, with DOK, Skills Review code, SAT and Precalculus relevance, the district form's status, and the per-lesson re-ranking (section 7); `docs/a2-topic-assessment-audit.md` is generated from it |
| `content/a2/lesson-prep.json` | one entry per lesson (section 7): the keep/cut proposal, the topic items the lesson owns, quiz focus, DOK 3, IXL per example, opener questions |
| `content/a2/lesson-objectives.json` | one entry per lesson (section 8): the packet's goals verbatim, essential question, standards |
| `data/a2-lesson-skills.json` | Topics 3+: the lesson's IXL codes (section 9); Topics 1-2 are already mapped and keep their lists |
| generated | `content/a2/lesson-skills.json`, `content/a2/lesson-trees/<L>.json`, `content/a2/teacher-prompts/<L>.json` |

Not part of a fast lesson: day-log entries and observer cards (written with the teacher on the day,
from the prep entry), the published lesson model in `content/a2/lessons.json` (the publish pipeline,
`docs/a2-lesson-targets.md`), question-bank ingestion.

## 4. Selection rules

Apply in order. Every choice is written down in the prep entry (`why`) so the PLC can overturn it.

- **R1 Topic test first, then the quiz.** List the Savvas Topic Assessment items the lesson owns
  (`a2_T<N>_assessment_TE.tex`; the map in `data/a2-topic-assessments.json`) and, for each, the
  Example that teaches it; then the lesson-quiz items (TE block `<L> Lesson Quiz:`) the same way
  (the TE's `SEE EXAMPLE` tags on practice items, the quiz item analysis, the concept summary). A
  topic item outranks a quiz item. The district's common assessment is the Savvas form with
  questions removed, aimed at the SAT and Precalculus (Oct 31), so when two Examples tie on topic
  items prefer the one whose items the audit tags SAT- or Precalculus-relevant; when the district
  form arrives, the items it dropped leave the ranking. No lesson of a topic is cut before that
  topic's assessment is transcribed and mapped.
- **R2 At most two Examples** (one for a `brief` lesson) that together cover the most topic items,
  then the most quiz items; tie-break toward the Example the concept summary is built on, then the
  one with a DOK 3 practice item. Everything else is cut. A kept Example's parts (A/B) may be
  trimmed to the part the topic test and the quiz need; the packet says so.
- **R3 One DOK 3 survives.** Name one DOK 3 practice item from the TE item analysis tied to a kept
  Example. It appears in the packet as the Practice or Exit block, or is named as the self-paced
  extension; an IXL skill never replaces it. When the item analysis files every DOK 3 item under a
  cut Example, name the lesson's DOK 3 item anyway (as the extension) and say so in the prep entry;
  when a lesson prints no DOK 3 item at all (7-1, 7-2), the prep entry says so and the Exit block
  carries the lesson's hardest item.
- **R4 Every kept Example is followed by its Try It**, verbatim from the TE, with blank grids or lines.
  A hint, if any, follows the prompt on its own line labeled "Hint:" and is never spliced into the
  TE sentence.
- **R5 One Practice block only when a quiz context item is not already rehearsed by a Try It.** It
  is a structural parallel (same structure, different numbers and setting) of that quiz item, never
  the item itself. A `%` comment names the quiz item.
- **R6 IXL table:** 2-4 core skills, starred (`$\bigstar$`) when they feed graded quiz items
  (the bonus item counts), each row naming the quiz question(s) it feeds; at most two unstarred
  rows (a warm-up, or a skill for an item on the full Savvas quiz only); codes from
  `data/ixl-algebra2-skills.json` only; the line "SmartScore 70 or above on each starred skill
  replaces your quiz score." verbatim. The prep entry and the authored list may carry more codes
  than the table prints; their notes say "not in the packet table".
- **R7 Language:** the goals box has one learning goal ("I can ...") and one language goal ("I can
  say / describe / explain ... using the words ...") naming 3-5 words; every Example ends with a
  "Say it:" frame using those words; the last block of the packet reuses the frame (sentence
  completion or exit question). Spanish cognates from the TE vocabulary builder may be listed.
- **R8 "On the quiz" and "On the Topic test" boxes:** plain words, numbered to the Savvas quiz
  items, telling students what each kept Example buys them on the quiz; an item the short form
  leaves off is marked "(full Savvas quiz only)". The IXL table's Feeds column uses the same
  numbers. Under it, `\topictarget{<N>}{...}` names the Topic Assessment question(s) the kept
  Examples answer, in plain words with the Example that teaches each ("Question 13 asks for the
  equation of a parabola through three points: Example 4"); a lesson whose kept Examples answer no
  topic item says so ("No question on the Topic 2 test comes from this lesson; the quiz is the
  goal") and the prep entry explains the choice.
- **R9 Layout:** `\input{fast-packet-template}`, `\packethead{Lesson <L>}{<TE title>}`, `\goals`,
  `\quiztarget`, `\topictarget`, `\wspart{Example N}{<TE title>}`, `\wspart{Try It N}{...}`, optional
  `\wspart{Practice}{...}`, `\wspart{IXL}{Practice for the quiz}`, a closing block. Graphs use the
  template's `sheetgrid` / `unitgrid` styles and `closed` / `open` nodes; windows match the TE
  figure description. 3-4 pages; `\newpage` so each Example + Try It pair opens a page when it fits.
- **R10 Fidelity:** Example wording verbatim or lightly compressed, numbers unchanged, worked steps
  recomputed and checked against the TE answer (a transcription error in the TE is corrected, with
  a `%` comment); Try It verbatim; graphs redrawn from the TE `\placeholder{graph}{...}`
  description: the TE's labeled range plus at most half a unit of padding so arrowheads and
  endpoint circles are not clipped, the TE's labeled ticks and a grid line at every unit, the same
  key points, open/closed ends, dashed asymptotes and continuation arrows when the description
  names them. Nothing is invented beyond R5 parallels, sentence frames and labeled hints.
- **R11 Build:** `pdflatex -interaction=nonstopmode` with zero errors; page count <= 4 (quiz <= 3);
  `tools/check_fast_packet.py` passes.

## 5. Packet anatomy

```
\input{fast-packet-template}
\begin{document}
\packethead{Lesson 2-1}{Vertex Form of a Quadratic Function}
\goals{I can ...}{I can ... using the words ...}
\quiztarget{You will (1) ... (2) ...}
\topictarget{2}{Question 1 asks for vertex form from the vertex and a point (Example 3); Question 13 ... (Example 4).}
\wspart{Example 3}{Write the equation of a parabola from its vertex and a point}
  ... worked example, graph in a minipage, table or numbered steps, then
\textbf{Say it:} ... \blank[...] ... \lines[2]
\newpage
\wspart{Try It 3}{...}   % verbatim, blank grid / lines
\wspart{Example 4}{...} ... \wspart{Try It 4}{...}
\wspart{Practice}{...}   % only under R5
\wspart{IXL}{Practice for the quiz}
  \begin{tabularx}{\textwidth}{l Y Y} ... \ixlrow{S9G $\bigstar$}{...}{Quiz 1, 3} ... \end{tabularx}
  \textbf{SmartScore 70 or above on each starred ($\bigstar$) skill replaces your quiz score.}
\wspart{Exit question}{...}  % or "Before the quiz, finish these sentences."
\end{document}
```

Graph rules: `pgfplots` only (no bitmap); label the curves with `\node[... fill=white]`; a blank
student grid is an empty `axis` with the window the Try It needs; step functions use horizontal
`\addplot` segments with `open` / `closed` nodes; parabolas and polynomials use `domain=` and
`samples=`; asymptotes dashed; exponential and log windows chosen so the key points in the TE
description are inside the window.

## 6. Quiz short form

`a2_<L>_quiz_fast.tex` is a standalone document (copy the preamble of `a2_1-2_quiz_fast.tex`).
Page 1: Name / Period / Date line, the lesson title, the items in TE order **keeping their Savvas
item numbers** (so "Quiz 3" means the same item on the packet, the short form and the Realize
PDF), with the TE wording and choices, graphs redrawn from the TE descriptions (an answer graph is
redrawn without the answer). A show-your-work or explain-your-choice prompt may be added under an
item and may carry part of that item's points, as the 1-2 form does; an added prompt never asks for
a new computation (a new point to map, a new intersection to find): such a prompt is removed or left
unscored. A scoring line proposes: the two items the kept Examples teach count 10 each, one further
item is a +5 bonus, total out of 20 (the Sep 28 rule for 1-1 and 1-2 named Q3 + Q4; the item
numbers are the teacher's call per quiz). Page 2: the answer key with the TE answer, DOK and
Realize skill code per item, a line listing the items left off (for a retake or Form B), and the
IXL replacement line naming the starred codes.

## 7. Teacher prep entry (`content/a2/lesson-prep.json`)

Same shape as `1-3` and `1-5`; the Desk fold, the Tomorrow draft and the lesson tree read it.

```
"<L>": {
  "title": "<TE title>",
  "status": "Fast-lesson draft <date>; PLC has not met on this lesson. Keep Examples a, b.",
  "objectives": { "learning": "<packet learning goal>", "language": "<packet language goal>",
                  "essentialQuestion": "<TE essential question>" },
  "topicAssessment": { "topic": <N>, "source": "a2_T<N>_assessment_TE.tex (Forms A and B; TE printed <pages>); data/a2-topic-assessments.json",
                       "items": { "<item>": "<what Form A asks> (DOK <d>): Example <n>, kept|cut", ... } },
  "quizFocus": { "item": <graded item>, "source": "a2_<L>_TE.tex Lesson Quiz; aga_24_a2_na_<tt><ll>_lq.pdf when downloaded",
                 "what": "...", "answer": "<TE key> (verify against the TE key on quiz day)",
                 "needs": ["..."], "items": { "1": "...", "2": "...", ... } },
  "examples": [ { "n": 1, "title": "...", "keep": false, "dok": "1-2", "practice": "11, 12", "ixl": ["..."], "why": "..." }, ... ],
  "dok3": { "item": <n>, "label": "Practice & Problem Solving <n>, <TE label>", "task": "...", "key": "...", "why": "..." },
  "ixl": [ { "code": "...", "name": "...", "directoryId": "...", "example": <n>, "role": "core" }, ..., { "code": "...", "name": "...", "directoryId": "...", "role": "prereq" } ],
  "modelDiscuss": { "source": "2024 TE page ..., Step 1 Explore (<opener type>)", "situation": "...",
                    "studentPrompts": ["A. ...", "B. ..."], "teQuestions": [ { "when": "Before, whole class", "q": "...", "a": "..." }, ... ],
                    "caution": "..." }
}
```

`examples` lists every TE Example with `keep` true or false and the practice item numbers from
the item analysis. `topicAssessment.items` lists exactly the items `data/a2-topic-assessments.json`
assigns to this lesson (`tests/a2-topic-assessments.test.js` checks the two agree); the Desk fold
shows them under "Topic N test" and the lesson tree makes one anchor per item after the quiz
anchors. `node scripts/build-lesson-tree.mjs --lesson <L>` must succeed (it needs the TE
prompts for each kept Example) and `--all --check` must stay green.

`data/a2-topic-assessments.json`, one block per topic:

```
"<N>": { "title": "<topic title>", "transcription": "a2_T<N>_assessment_TE.tex", "printed": "<pages>", "items": <count>,
         "district": { "status": "remade from the Savvas form; not yet received" | "SY25-26 form on disk", "file": "...", "note": "..." },
         "byItem": [ { "n": 1, "dok": 2, "skills": ["F17"], "lesson": "2-1", "examples": [3],
                       "formA": "<what Form A asks, one line>", "formB": "<Form B parallel>", "keyA": "...", "keyB": "...",
                       "sat": "high|medium|low|none", "satWhy": "...", "precalc": "high|medium|low|none", "precalcWhy": "...",
                       "district": "kept|dropped|unknown", "districtNote": "...", "note": "..." }, ... ],
         "lessons": { "<L>": { "items": [1, 13], "currentKept": [2, 4], "recommendedKept": [3, 4], "change": true, "why": "..." }, ... } }
```

`examples` names the TE Example(s) that teach the item (empty when the item needs no single
Example: a Topic Review skill, or a lesson the plan skips). `lessons` records the re-ranking
under R1 for every lesson of the topic that has a fast packet.

## 8. Objectives entry (`content/a2/lesson-objectives.json`)

```
"<L>": { "mathObjectives": ["<packet learning goal, verbatim>"], "standards": [...],
         "languageObjective": "<packet language goal, verbatim>",
         "essentialQuestion": "<TE essential question>",
         "source": "Lesson_planning/a2_<L>_fast.pdf goals line; essential question from a2_<L>_TE.tex; standards from <source>" }
```

Standards: the Realize standards file when it exists (1-2 through 1-6, 2-1, 2-2); otherwise the
topic's list in `Algebra_2_Curriculum_Map_SY_25-26.pdf`, filtered to the lesson's objective, with
the source named. An empty list is better than a guess.

## 9. IXL skills (`data/a2-lesson-skills.json`)

Topics 1-2 are already authored and pinned by `tests/a2-lesson-skills.test.js`: a packet's starred
skills are chosen from that list. The draft is `{ "replace": true, "entries": [...] }` carrying the
same codes in the same order with `example` ties and notes added; a code is added (at the end of
the core entries) only when a graded quiz item has no skill, and the change is recorded in a
`changeNote` and in the test's pin. Topics 3+: `prereq` entries first (1-3 codes), then `core` entries
each with `example` and a note; codes from `data/ixl-algebra2-skills.json` (search by strand).
Then `node scripts/build-a2-lesson-skills.mjs` and the test's "Topics 1 and 2" expectation becomes
"every authored lesson, Topics 1-2 complete".

## 10. Build and validation order

```
# Lesson_planning, once per topic, before its lessons
#   a2_T<N>_assessment_TE.tex transcribed from Topic_0<N>_Teacher_Edition.pdf (Topic Assessment pages),
#   verified item by item; then data/a2-topic-assessments.json authored and
node scripts/build-a2-topic-assessment-audit.mjs            # writes docs/a2-topic-assessment-audit.md (--check verifies)

# Lesson_planning
pdflatex -interaction=nonstopmode -halt-on-error a2_<L>_fast.tex      # and a2_<L>_quiz_fast.tex
python tools/check_fast_packet.py a2_<L>_fast.tex --quiz a2_<L>_quiz_fast.tex \
    --te a2_<L>_TE.tex --ixl-map ../algebra2-live-worksheet/data/ixl-algebra2-skills.json
pdftoppm -r 60 -png a2_<L>_fast.pdf <scratch>/<L>-page            # eyeball every page

# algebra2-live-worksheet (after the drafts are merged)
node scripts/merge-fast-lesson-drafts.mjs <drafts-dir>
node scripts/build-a2-lesson-skills.mjs
node scripts/sync-server-shared.mjs
node scripts/build-a2-roadmap-data.mjs
node scripts/build-a2-work-manifest.mjs
node scripts/build-lesson-tree.mjs --all
node scripts/build-lesson-tree.mjs --all --check
npx vitest run
node scripts/bump-build.mjs        # before committing
```

## 11. Scope and order

Every lesson in the year plan that is not yet built, in authoring order; `brief` lessons get the
one-Example form; `later` lessons are built on request with the same commands.

| Order | Lesson | Plan | Examples |
|---|---|---|---|
| 1-5 | 2-1, 2-2, 2-3, 2-6, 2-7 | keep | 2 |
| 6-9 | 3-1, 3-2, 3-4, 3-5 | keep | 2 |
| 10-13 | 4-2, 4-3, 4-4, 4-5 | keep | 2 |
| 14-16 | 5-1, 5-5, 5-6 | bridge | 2 |
| 17-20 | 6-1, 6-2, 6-3, 6-6 | bridge | 2 |
| 21-23 | 7-1, 7-2, 7-3 | bridge (7-3 "ideally") | 2 |
| 24-29 | 1-4, 2-4, 2-5, 3-3, 3-7, 4-1 | brief | 1 |

1-4 was skipped by the Oct 20 PLC; its packet exists because the Topic 1 assessment carries four
1-4 items (one DOK 3). Whether it is taught is the PLC's call.

## 12. Review and sign-off

0. Per topic, first: the Topic Assessment is transcribed (Opus 5.5) from the TE pages and verified
   item by item against the page images by an independent agent (both forms, answers, item
   analysis); then the item-to-Example map is written and verified the same way.
1. Author (Opus 5.5) writes the packet, the quiz and the three draft entries, compiles, lints.
2. Verifier (independent agent) renders the pages, recomputes every worked answer against the TE,
   checks R1-R11 and returns findings; the author fixes and recompiles; two rounds at most.
3. Codex (gpt-6-astra, via `Agent/runner/cross-agent.py --task-type review --read-only`) reviews
   every packet and quiz against the TE and this spec, and the Desk-side JSON and tests.
4. Fixes from the Codex findings, then a second Codex pass on the changed files.
5. The teacher and the PLC decide keep/cut, quiz scoring and dates; the prep entry's `status` line
   is updated when the PLC rules ("PLC <date>: ...").

What stays the teacher's: which Examples are taught, which quiz items count and the bonus,
whether a brief lesson gets a day, and every date (year plan and pacing tool).
