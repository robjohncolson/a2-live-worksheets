# Codex prompt — DOK ladders, finish Unit 1 (7 topics) — 2026-09-03

You are finishing Phase 3 of `APS_DOK_LADDER_SPEC.md` in `C:/Users/rober/Downloads/Projects/school/follow-alongs`
(Windows; use forward slashes; `python`, `node`, `pdflatex` (MiKTeX) and `pdfinfo` are on PATH).
Built and pushed already: **1.2, 1.6, 1.9** (hand-authored exemplars) and **1.3** (agent draft, compiles,
teacher key runs 4 pages — trim it to ≤ 3). Drafts on disk: `dok/registry/1.1.jsonl` (two valid rows, **no
`dok/lessons/1.1.yaml` yet**) and `dok/_drafts/1.4.jsonl.draft` (invalid JSON — an unescaped `\` around col
1512; fix the escaping, move it back to `dok/registry/1.4.jsonl`). Nothing exists yet for **1.5, 1.7, 1.8, 1.10**.

## Read first, in this order (do not skip)
1. `APS_DOK_LADDER_SPEC.md` §1.1–§1.3 (DOK for AP Stats, the rules, "every lesson carries a DOK-3") and §2 (data model).
2. `dok/README.md` — authoring recipe + the Phase-2 friction log (space rule of thumb, boxplot library, tether shapes).
3. `dok/calibration/unit1.json` — what DOK-2 / DOK-3 look like in Unit 1; `not_dok3` list.
4. Exemplars: `dok/registry/1.6.jsonl` + `dok/lessons/1.6.yaml` (pgfplot_hist), `dok/registry/1.9.jsonl` +
   `dok/lessons/1.9.yaml` (boxplot `series`), `dok/registry/1.2.jsonl` + `dok/lessons/1.2.yaml` (two_way_table).
5. `dok/build_ladder.py` — `VISUAL_KEYS`, `render_*`, `validate_item`, `validate_lesson`. Visual kinds:
   pgfplot_hist, dotplot, boxplot (single or `series`), two_way_table, scatter, raw_tikz (author-provided
   TikZ `body`, used for two side-by-side graphs). A focus item has ONE `visual`.
6. The topic's CED tether: `ai-tutor/u1_l{n}.md` (auto-printed on the teacher key). 1.1 has none — its YAML
   must carry `tether:` (a list of LaTeX-safe strings copied verbatim from `apstat_1_framework.md`, LO VAR-1.A
   and EKs VAR-1.A.1…).

## Per-topic inputs and DOK-3 seeds (refine the seed; keep the identify → describe → adjudicate shape)

| Topic | B / E dates | Worksheet | Seed for part (c) — the DOK-3 |
|---|---|---|---|
| 1.1 Introducing Statistics: What Can We Learn from Data? | 09-08 / 09-09 | `u1_lesson1_live.html` | Table of 12 students (hours of sleep, 10-pt quiz score; loose positive pattern, one exception). Two newspaper claims: "in this class, students who slept more tended to score higher" (data can support — descriptive) vs "sleeping more raises quiz scores for all students at the school" (cannot — causal + generalizing from 12 students, no comparison). Decide which the data support, cite the feature that settles each, name ONE kind of data needed before the second claim. Skill 4.A; pattern `claim-vs-data-support-bound-the-conclusion`. Visual: two_way_table of the 12 rows. |
| 1.4 Representing a Categorical Variable with Graphs | 09-14 / 09-16 | `u1_lesson4_live.html` | Favorite lunch: Pizza 52, Tacos 47, Salad 44, Pasta 41 (n=184). Newsletter prints a bar graph with the y-axis starting at 40 ("Pizza wins by a landslide"); a council member redraws it from 0 ("basically a tie"). Which graph is honest for "is pizza clearly the favorite?", which design feature settles it, what the truncated axis exaggerates (looks ~4×; actually 52 vs 41 = 27% more); then bar vs pie for comparing four categories. Skill 4.B; pattern `truncated-axis-which-display-is-honest-and-what-it-misleads`. Visual: raw_tikz with two ybar axes side by side (width ~0.45\linewidth, height ~1.6in, `symbolic x coords`). |
| 1.5 Representing a Quantitative Variable with Graphs | 09-15 / 09-18 | `u1_lesson5_live.html` | 30 daily step counts (thousands): school days ~5–8k, weekends ~11–13k, one 19k hiking day. Same data as a 1k-bin histogram (shows two clusters, a gap, the outlier) and a 5k-bin histogram (one smooth pile). Priya (coarse): "typical, symmetric around 8k"; Leo (fine): "two clusters and a gap". Coach asks "does the student move differently on school days vs weekends?" — which histogram answers it, which feature vanishes in the other, what Priya's reader wrongly concludes, one case where the coarse one is better. Skill 4.B; pattern `bin-width-which-display-answers-the-question-and-what-it-hides`. Visual: raw_tikz, two `ybar interval` axes side by side. List the 30 raw values in the teacher key. |
| 1.7 Summary Statistics for a Quantitative Variable | 09-21 / 09-25 | `u1_lesson7_live.html` | 15 weekly paid-work hours: 0,0,0,4,5,6,6,8,8,10,10,12,12,15,30. Kai: mean 8.4, SD ≈ 7.4 (correct). Rosa: median 8, IQR — computed with the median INCLUDED in both halves (wrong; correct Q1 = 4, Q3 = 12, IQR = 8; 30 is an outlier: 12 + 1.5·8 = 24). Part (c): whose IQR is right and what the other did wrong; which pair (mean+SD or median+IQR) the principal should get for "how much do students work?", the dotplot feature that settles it, what the wrong pair would make the principal believe. Skills 3.A/4.B; pattern `whose-computation-and-what-it-misleads-then-choose-the-summary`. Visual: dotplot. Recompute every number in Python. |
| 1.8 Graphical Representations of Summary Statistics | 09-22 / 09-28 | `u1_lesson8_live.html` | 24 practice-test times, bimodal (cluster 22–26, cluster 38–44, one 55). Omar (boxplot only): "most students took about 32 — the middle of the box"; Nia: "a boxplot can't show that". Part (c): who is right, the dotplot feature that settles it (the gap where the median sits), what a boxplot CAN show (center, spread, skew, outliers) vs CANNOT (modality, gaps, clusters), which display to use for the more-time decision. Skill 4.B; pattern `what-a-boxplot-can-and-cannot-show-adjudicate`. Visual: raw_tikz stacking a dotplot axis over a `boxplot prepared` axis, same x-scale (copy options from `render_dotplot` / `render_boxplot`; the preamble loads `\usepgfplotslibrary{statistics}`). Five-number summary by the exclude-the-median method; recompute in Python; list the 24 values in the key. |
| 1.10 The Normal Distribution | 11-09 / 12-02 | `u1_lesson10_live.html` | School says app time ≈ normal, mean 40, SD 12. Histogram of 60 real students is clearly right-skewed (bins of 10, 0–100; several students above 70). Ben: "empirical rule → ~16% above 52"; Ava: "z for 70 is 2.5 → under 1% above 70". Both correct FOR THE MODEL; the histogram says the model is wrong. Part (c): are the conclusions warranted, the histogram feature that settles it (skew / count above 70 ÷ 60), why a correct calculation can give a wrong conclusion, what to check before using the rule or a table. Skills 3.A/4.B; pattern `is-the-normal-model-appropriate-adjudicate-model-vs-data`. Visual: pgfplot_hist (counts sum to 60). |

(1.3 seed, already drafted: Chess 15/3 of 18 vs Robotics 27/18 of 45; frequency vs relative-frequency table;
which table answers "more student interest" and what each club's table hides. Only the teacher key needs trimming.)

## For each topic (≈ 30 min each)
1. `dok/registry/{topic}.jsonl` — ONE focus row `aps-{topic}-d3-1` (`role: "focus"`, `dok: 3`, `parts` a/b/c with
   `dok` 1/2/3 and a `skill` each, `first_take`, `frq_pattern` (kebab-case description, never a copied exam item),
   `dok_rationale` ≥ 40 chars naming the KIND of thinking — never the words hard/easy/difficult, `answers` for a/b/c,
   `scoring` = `expectedElements` + `scoringGuide` {E,P,I} + `commonMistakes`, `sentence_frames` using `\blank[..]`,
   `source: "original"`, `hypothetical: true`, `visual: "<key>"`), plus optionally `aps-{topic}-d2-1`
   (`role: "reinforcement"`, `dok: 2`, `answers: {"a": ...}`). Text is LaTeX, not markdown (`--`, ``quotes'', `\%`).
   Valid JSON, one object per line, backslashes doubled inside JSON strings. The row's `topic` must equal the file name.
2. `dok/lessons/{topic}.yaml` — copy the nearest exemplar's shape: `topic`, `ced2026 {unit: 1, topic, label}`,
   `title`, `minutes {first_take: 5, video_worksheet: 28, finish: 10, turn_in: 2}`, `essential_question`,
   `worksheet`, `rules_callout {title, body}` (the day's rules, printed on the sheet), `focus`, `reinforcement`,
   `exit_reflection: "One thing the video changed about my first take: \\hrulefill"`, `space` (start
   `{first_take: 0.9in, a: 0.7in, b: 1.4in, c: 2.0in}`), `teacher {phase_tag, teacher_does, students_do,
   questions_to_ask (4), adult_role, watch_for (3), first_take_note}`, `visuals {…}` (data + labels only).
3. Delete the topic's row from `dok/PENDING.md`.
4. `python dok/build_ladder.py dok/lessons/{topic}.yaml` → fix any validation message → `bash dok/compile.sh {topic}`
   → `pdfinfo dok/pdf/aps_{topic}_{student,board,teacher}.pdf | grep Pages`. **Required: student 2, board 1,
   teacher ≤ 3.** Tune `space:` (README rule of thumb) and shrink raw_tikz heights until they hold. On a pdflatex
   failure read the `!` lines in `dok/tex/aps_{topic}_{edition}.log`.
5. Open the three PDFs and look: nothing cut off, figures legible on the board slide, no answer text on the
   student or board edition.
6. `python dok/build_ladder.py --validate` (all rows + lessons) and
   `npx vitest run tests/dok-registry.test.js tests/dok-coverage.test.js` and
   `python -m pytest tests/test_dok_build.py -q` — all green before you commit.

## Commit rules
- Commit per topic (or per two): the YAML, the registry file, `dok/PENDING.md`, `dok/manifest.json`, the three PDFs.
  Never commit `dok/tex/*.aux|log|out` (gitignored). `dok/tex/aps_*.tex` are committed (regenerated output).
- **Do NOT push.** Pushes are gated by a local pre-push hook that only the orchestrator satisfies; report your
  commit hashes and the page counts per topic in your final message.
- Touch nothing outside `dok/` except `dok/PENDING.md`… i.e. do not edit the spec, tests, or `build_ladder.py`
  unless a generator bug blocks you — if so, fix minimally, add/extend a test in `tests/test_dok_build.py`, and say so.
- Adversarial self-check on every part (c) before committing: (1) is the decision pre-made in the stem? → DOK-2, rewrite;
  (2) can it be answered by one procedure? → DOK-2, rewrite; (3) does it cite a specific feature of the data and ask
  what the alternative would mislead a reader into? → that is the DOK-3 shape.

## Order
1.1 (B 09-08 — most urgent), 1.4, 1.5, 1.7, 1.8, then 1.3 teacher trim, then 1.10.
