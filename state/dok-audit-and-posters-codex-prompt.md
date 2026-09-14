# Codex prompt — (A) pedagogical audit of all 66 DOK-3 problems, (B) render all 15 concept posters — 2026-09-04

Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs` (Windows; forward slashes; `python`, `node`, `pdflatex`
(MiKTeX), `pdfinfo`, `latexmk` on PATH). Two independent tasks; do (A) first. **Never push** — commit per unit / per poster
batch and report commit hashes. Do not touch anything outside `dok/` (task A) and `concept-posters/` (task B) except the
report files named below.

---

## A. Audit every DOK-3 problem against what the students actually saw that day

Context: `APS_DOK_LADDER_SPEC.md` (read §1–§2, §6 — the class flow — and §10). Each lesson day, students see the board
slide at the bell, write a one-sentence *first take*, watch the lesson video while filling the follow-along worksheet, then
have **about 10 minutes** to finish parts (a)(b)(c) on paper and turn the sheet in. These are high-school students, many of
them English learners, in a 45-minute period. The sheet is hand-graded by the teacher; it is the one human-graded piece of
work in a course that is otherwise AI-graded, so it has to be *doable*, *clearly tied to that day's lesson*, and *worth
reading*.

For EACH of the 66 topics (`dok/lessons/{topic}.yaml` + `dok/registry/{topic}.jsonl`), read the day's actual materials:
1. **The follow-along worksheet** named in the YAML (`worksheet:` → `u{u}_lesson{..}_live.html` at the repo root). This is
   what the video teaches: the vocabulary list, the timestamped fill-in-the-blank sections, the reflection questions, and the
   exit ticket. Extract the concept vocabulary and the specific skills the video walks through.
2. **The flashcards** for the topic: the Blooket CSV (`u{u}_blooket*.csv` / `*_blooket.csv` at the repo root — match by
   unit/lesson in the filename or the first rows) — these are the DOK-1 recall items the students drill.
3. **The CED tether** (`ai-tutor/u{u}_l{n}.md` "THE CONCEPTS THIS LESSON IS BUILT ON" block, or the YAML `tether:`).
4. The registry row: `stem`, `first_take`, `parts` (a)(b)(c), `answers`, `scoring`, `sentence_frames`; the YAML
   `rules_callout` and `visuals`.

Judge each problem on these criteria and record a verdict per criterion (PASS / FIX / FLAG):
- **Alignment** — every concept, symbol, and vocabulary word the problem needs appears in that day's worksheet, flashcards,
  or rules callout. A DOK-3 that needs a later topic's idea (e.g. a z-score on a day before 1.10, "IQR" before 1.7,
  "conditional probability" before 4.5) is a FIX: rewrite so it uses only what was taught by the end of that video. Check the
  *worksheet's* order of topics, not the CED's.
- **Load** — a typical student can finish (a)(b)(c) in ~10 minutes with the rules callout in front of them, or at worst by
  the next class period. Count: sentences a student must write, numbers they must compute, features they must cite.
  Rule of thumb: (a) one line, (b) two or three sentences or one short computation, (c) three to five sentences. More than
  that → FIX (trim parts, drop a sub-question, pre-compute a number in the stem, shorten the stem). Do NOT remove the
  adjudicate/justify move in (c) — that is the DOK-3; trim around it.
- **Reading level** — stems and prompts at a plain, direct register: short sentences, concrete context, no stacked clauses,
  no unexplained jargon. Names and contexts should feel like this school (commutes, lunch, clubs, quizzes), not a textbook.
  Sentence frames must actually scaffold (c) for an English learner.
- **First take** — answerable in one sentence by a student who has NOT yet watched the video, using only the stem and the
  figure. If it needs the lesson's vocabulary, FIX it.
- **Rules callout** — contains every rule/formula (c) needs, in the video's own wording, and nothing that gives away the
  answer. (A callout that names the winning student or the deciding feature is a leak → FIX.)
- **Visual** — the figure is readable on paper at letter size and on the board slide; it never names the feature the
  question asks the student to find (a column header like "Flaw", an annotation like "outlier") → FIX.
- **Key + scoring** — `answers` are correct (recompute every number in Python) and `scoring.scoringGuide` E/P/I can be
  applied to a hand-written answer in under a minute per sheet.

Then FIX what you flagged, in place, keeping every existing gate:
- Edit the registry row / YAML; rebuild + recompile that topic (`python dok/build_ladder.py dok/lessons/{t}.yaml` then
  `bash dok/compile.sh {t}`); `pdfinfo` page counts must stay student 2 / board 1 / teacher ≤ 3; open the PDFs and look.
- `python dok/build_ladder.py --validate`, `npx vitest run tests/dok-registry.test.js tests/dok-coverage.test.js`,
  `python -m pytest tests/test_dok_build.py -q` — green before each commit.
- Keep the problem's identity (context, the two competing claims, the frq_pattern) unless the alignment criterion forces a
  new problem; if you must replace one, say so in the report.

Write `dok/AUDIT_2026-09.md`: a table with one row per topic (topic · title · Alignment · Load · Reading · First take ·
Callout · Visual · Key · what you changed, one line) followed by a short section "Patterns across the set" (the three or four
recurring problems you saw) and "Things a human should look at" (judgment calls you did not make). Commit the report with
the last batch. Work in Period-B date order (`dok/PENDING.md` is empty — use `data/lesson-schedule.json` `periods.B`), one
commit per OLD unit.

---

## B. Render all 15 concept posters

`CONCEPT_POSTERS_SPEC.md` specifies 15 hand-made wall posters (§3 P01–P15; §2 production standards; §2.3 colors;
§5 QA checklist; §6 coverage matrix). Three LaTeX mockups exist in `concept-posters/` (`p02-summary-statistics.tex`,
`p09-confidence-intervals.tex`, `p15-residuals-model-fit.tex`) on the shared style `concept-posters/apstats-poster.sty`,
built by `concept-posters/Makefile` into `concept-posters/rendered/` (poster-size PDF, a letter-size PDF, and a PNG each,
plus a combined mockups PDF). Read `concept-posters/README.md` first for the build commands and the page-size conventions.

Produce the remaining twelve — P01, P03, P04, P05, P06, P07, P08, P10, P11, P12, P13, P14 — as `p{NN}-{slug}.tex` in the
same style, one spec section each, with EVERY formula listed for that poster in spec §3 present and typeset (use the
notation conventions in §2.4; "★ Beyond the Exam" items go in the marked corner exactly as the spec says; unit color per
§2.3). Then:
- Build all 15 through the Makefile; regenerate the combined mockups PDF so it holds all 15 in order.
- Run the spec's §5 QA checklist per poster and tick the §6 coverage matrix: every formula id in the matrix must appear on
  exactly the poster the matrix says. Report any formula the spec lists that you could not place, rather than inventing a
  home for it.
- Check each poster's letter-size PDF for overfull boxes / clipped text (`grep -i overfull` on the logs; open the PDF).
- Commit `concept-posters/*.tex` + `concept-posters/rendered/*` in two batches (P01–P08, P10–P14) with a short
  `concept-posters/RENDER_LOG.md` (which poster, page count, QA ticks, anything you could not place).

Do not edit `apstats-poster.sty` unless a poster cannot be typeset without it; if you do, keep the three existing mockups
byte-identical in appearance (rebuild them and compare page counts / eyeball).

---

## Report format (final message)
Task A: commits per unit; counts of PASS / FIX / FLAG per criterion; the "patterns" paragraph; any replaced problems.
Task B: commits; 15/15 rendered or the list of gaps; formulas that could not be placed.
