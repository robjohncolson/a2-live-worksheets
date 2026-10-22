# Focused days and captured Try Its: plan (on hold)

Written 2026-10-02 from the teacher's description. **Status: on hold**; nothing below is built.
Pick it up by answering the three decisions at the end.

## What the teacher wants

- A student clicks today's date on the Desk and sees that day only: "Lesson 1-2 starts; today is
  Examples 1 and 2". Days do not bleed together.
- A link to the official OneNote notebook where the class notes are, so they can see how the
  example was worked.
- Every example tied to an IXL skill that can be run as a Group Jam.
- The Try It for each example rendered properly (math, figures).
- The Try It opens as a pop-out in the Desk's own style, with an answer box, a space for written
  reasoning, and a sketch canvas with undo/redo that is saved ("math is like art, not typed").
- The submission (answer, reasoning, drawing) is evaluated by AI with partial credit, so a small
  error does not cost full credit. The evaluation goes on the ledger.
- After all of a lesson is done, a quiz like 1-1's, but captured the same way.
- Redundancy: DeepSeek for the live evaluation; GPT-6 API credits for a second pass in batches;
  and the raw work shown to the teacher to check by eye.

## What exists today (survey of 2026-10-02)

| Wanted | Today |
|---|---|
| Per-day content | Day panel exists (`_showA2ResourcePanel`, `desk.html`), but a day has only free text (`content/a2/day-log.json` entries: `date, section, lesson, note/plan, student`). No structured "examples covered today". |
| OneNote link | Shown in the student panel from `onenoteUrl` or `notebookUrlBySection`. |
| Example to IXL skill | Data exists: `supportingSkills[].example` (authored in `data/a2-lesson-skills.json`). Only the teacher panel shows it. |
| Examples and Try Its as content | `content/a2/lessons.json` has `tryIts[{n, registryId, prompt}]` (prompt text only), no Example model, no figures, no keys. The question bank in `Lesson_planning` now has every Example, Try It, key and figure crop for 1-2, 1-3, 1-4 and Topic 2 (Try Its tagged `linked-example-N`). |
| Student Try It submission | Does not exist. Scores come only from `teacher-tryits.html` via `POST /ledger/record` (`source:'try-it'`, `itemId:'TI-<lesson>-<n>'`, max 10). |
| Drawing / image storage | Does not exist. `submission_archive` stores JSON only. |
| AI grading | AP Stats FRQ worker is still in `roster-server/` (`frq-worker.js`, calls an external grader at `FRQ_GRADER_URL`), `FRQ_GRADE_MODE` defaults to off, rubrics are AP Stats. Reuse the structure, not the content. |
| Quiz | 20-point quiz is teacher-entered only (`source:'quiz'`, `QZ-<lesson>`). |
| Ledger | `item_ledger` accepts try-it, quiz, lesson-check and more; district formula reads try-it as Assignments out of 10. |
| Students on the Desk | Since 2026-09-22 the Desk is a teacher/agent workbench and the student links were removed. This plan reverses that. |

Model facts checked 2026-10-02: DeepSeek's `deepseek-flash` accepts images (since Sep 2026, about
384 tokens per image, so low resolution); `deepseek-v4-pro` is text-only. GPT-6 image input and
batch pricing not yet checked.

## Build, in four phases

1. **Focused days (no AI).** Structured day content: lesson, examples covered that day, and for
   each example its title, its IXL Group Jam skill and its Try It. Student clicks a date and sees
   only that day. Examples and Try Its imported from the question bank with figures and rendered
   math. Answer keys stay on the server, never in the public static files.
2. **Try It pop-out.** Desk dialog style (`.dialog-overlay > .dialog-box`, `.s7btn`). Prompt and
   figure, answer box, reasoning box, sketch canvas with undo/redo and autosave. Submit stores
   answer, reasoning and drawing (needs image storage: new table or bucket).
3. **Evaluation.** DeepSeek scores live against the key with partial credit and short feedback.
   GPT-6 re-scores in batches after school. Teacher review page: sketch, reasoning and both
   scores side by side, disagreements first; the teacher's override is what the ledger keeps.
4. **Lesson quiz** on the same pop-out, so work is captured like a Try It.

## Decisions needed before Phase 3 (Phase 1 needs none)

1. **What a Try It score counts for.** Sep 21: 10 points in Assignments. Sep 28: bonus on the
   quiz. Sep 30: "old idea; the deal is IXL". The code still counts each Try It as an Assignments
   item out of 10.
2. **Student work sent to outside AI companies** (DeepSeek, OpenAI). Proposed: no names, an
   anonymous id only, everything stored on our server. Acceptable under district rules, or hold
   the AI layer and let the teacher grade from the review page first?
3. **Students back on the Desk** (reverses the Sep 22 decision). Assumed yes.

Also needed for Phase 1: which examples each section covers on which day (or let the agent draft
a split per lesson for the teacher to correct).
