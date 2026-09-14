# Codex prompt — DOK ladders, rounds 3+ (chained; run until PENDING is empty or a blocker) — 2026-09-04

Same job, same recipe and gates as `state/dok-ladder-unit1-codex-prompt.md` (read it first) and
`state/dok-ladder-unit3-codex-prompt.md`. Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs`.
**Done and pushed: OLD 1.1–1.10 and 3.1–3.6 (16/66, HEAD `6c36ff6`+).** This prompt chains the rest so you can keep going
without the orchestrator: **round 3** (seeded below), **round 4** (seeded below), then **self-seeded rounds** (§C) in
`dok/PENDING.md` order. Commit per topic or pair. **Never push.** After each round, append a 5-line round report to
`dok/ROUNDS.md` (round, topics, commits, page counts, anything you changed outside `dok/lessons`+`dok/registry`).

Quality bar reminder (checked on every round so far): student 2pp / board 1pp / teacher ≤3pp; no answer text or
bias/feature NAMES in the student/board visual (a table column that says "Nonresp." gives away part (a) — the orchestrator
had to strip one from 3.4); part (c) not answerable by one procedure and not pre-decided in the stem; every number in the
key recomputed in Python; `--validate` + both DOK test suites green.

## A. Round 3 — OLD 2.1–2.3 (two categorical variables) + 4.1–4.5 (probability) — B 10-13 → 10-26, land by 09-29

Real `ced2026` mapping (from `roadmap-data.json`): 2.1, 2.2 → `{unit: 2, topic: "2.1", label: "Two Categorical Variables:
Tables & Graphs"}`; 2.3 → `{unit: 2, topic: "2.2", label: "Two Categorical Variables: Summary Statistics"}`; 4.1, 4.2 →
`{unit: 2, topic: "2.3", label: "Estimating Probabilities Using Simulation"}`; 4.3 → `2.4 Introduction to Probability`;
4.4 → `2.5 Mutually Exclusive Events`; 4.5 → `2.6 Conditional Probability`. Worksheets: 2.1 `u2_lesson1_live.html`,
2.2 `u2_lesson2_live.html`, 2.3 `u2_lesson3_live.html`, 4.1 and 4.2 `u4_lesson1-2_live.html`, 4.3/4.4/4.5
`u4_lesson3-4-5_live.html`. Tutor artifacts exist for all except **2.1 and 4.1** (→ `tether:` copied verbatim from
`apstat_2_framework.md` / `apstat_4_framework.md`). **Before 4.1, write `dok/calibration/unit2.json`** in the exact shape of
`unit1.json` for NEW Unit 2 (probability, random variables, sampling distributions): 2 DOK-2 anchors (compute a probability
from a table/tree; simulate and estimate), 3 DOK-3 anchors (which probability answers the question asked — conditional vs
joint; is-independence-warranted-from-data; whose-simulation-design-is-valid), `not_dok3`.

| Topic | Seed for part (c) — the DOK-3 (refine; identify → describe → adjudicate) |
|---|---|
| 2.1 Introducing Statistics: Are Variables Related? | A two-way table: 200 students, rows = plays a sport (yes/no), cols = gets ≥ 8 h sleep (yes/no); design it so the ROW percents differ (athletes sleep more) but a student compares raw COUNTS and concludes the opposite because there are many more non-athletes. Part (c): decide whether the variables appear related, cite the two conditional percents that settle it, explain what the count comparison misleads a reader into, and state what this table can NOT tell you (cause). Skill 4.B; pattern `counts-vs-conditional-percents-are-the-variables-related`. Visual two_way_table (counts + totals only). |
| 2.2 Representing Two Categorical Variables | Same kind of data, two displays: a side-by-side bar graph of COUNTS vs a segmented (100\%) bar graph of the same table; one student says the segmented graph "hides how many people there are", the other says the count graph "hides the relationship". Part (c): which graph answers "is preference related to grade level?", the feature that settles it (equal-height bars let you compare proportions), what the other graph is FOR, and one question each graph cannot answer. Skill 4.B; pattern `count-bars-vs-segmented-bars-which-answers-the-question`. Visual raw_tikz: two ybar-stacked axes side by side (heights ~1.6in). |
| 2.3 Statistics for Two Categorical Variables | A 2×2 table (e.g. 300 students, uses the tutoring center × passed the exam). Two students compute "the probability a student passed" differently: one the marginal 75\%, one the conditional 88\% among tutoring users; a third says "tutoring raises pass rates by 13 points". Part (c): which number answers which question (marginal vs conditional), whether the 13-point gap shows the variables are associated, and why association here does not show tutoring CAUSED the difference (who chooses tutoring). Skills 2.D/4.B; pattern `marginal-vs-conditional-association-is-not-cause`. Visual two_way_table. |
| 4.1 Introducing Statistics: Random and Non-Random Patterns? | A coin flipped 10 times gives HHHHHHTTTT. Claim A: "the coin is rigged — six heads in a row can't be chance." Claim B: "streaks like this happen; you'd need a simulation to know how unusual it is." Part (c): decide which claim the evidence supports, describe a simulation that would settle it (what one trial is, what to count, how many trials), and state what result WOULD make you doubt the coin. Skill 4.A/3.A; pattern `is-this-pattern-random-design-the-simulation`. Visual: dotplot of a provided simulation result (e.g. longest run in 100 simulated trials; put the values in the YAML) — label only. |
| 4.2 Estimating Probabilities Using Simulation | Two students simulate "probability at least 2 of 5 randomly chosen students are left-handed (p = 0.12)". Student 1 uses digits 0–9 with "0" = left-handed (p = 0.10 — wrong p); Student 2 uses pairs 00–99 with 00–11 = left-handed (correct) but counts "exactly 2" instead of "at least 2". Part (c): find the flaw in each design, decide which estimate is closer to the truth and why you can't be sure without fixing both, then write ONE correct trial description. Skills 3.A/4.B; pattern `whose-simulation-design-is-valid-and-what-it-misestimates`. Visual two_way_table (the two designs side by side: digits, assignment, one trial, what is counted). |
| 4.3 Introduction to Probability | A spinner/dice game: two claims about the probability of an event, one from a sample-space count, one from 40 observed plays (relative frequency). Part (c): decide which is the probability and which is an estimate, cite the law of large numbers to explain why they differ, and say what would make the observed proportion untrustworthy (few trials; the game was not fair). Skill 4.B; pattern `theoretical-vs-empirical-which-is-the-probability`. Visual: dotplot or small table of the 40 outcomes. |
| 4.4 Mutually Exclusive Events | Survey table: 120 students, likes pizza (80), likes tacos (60), both (35). Student claims P(pizza or tacos) = 80/120 + 60/120 > 1 "so everyone likes one of them". Part (c): decide whether the events are mutually exclusive, cite the number that settles it (the 35), compute the correct P(pizza or tacos), explain what the wrong formula misleads a reader into, and name a pair of events in this context that ARE mutually exclusive. Skills 3.A/4.B; pattern `mutually-exclusive-or-not-when-the-addition-rule-double-counts`. Visual: two_way_table (pizza × tacos, 2×2 with totals). |
| 4.5 Conditional Probability | Medical-style 2×2 (hypothetical): 1{,}000 students screened for a condition with prevalence 5\%; test sensitivity 90\%, false-positive rate 10\%. Claim: "a positive test means you almost certainly have it (90\%)". Part (c): compute P(condition | positive) from the table, decide whether the claim is warranted, cite the two numbers that settle it (the 95 true positives vs 45 false positives... compute them), and explain the confusion between P(positive | condition) and P(condition | positive). Skills 3.A/4.B; pattern `conditional-direction-confusion-p-a-given-b-vs-b-given-a`. Visual two_way_table of counts. |

## B. Round 4 — OLD 4.6–4.11 + 5.2, 5.1, 5.3 (random variables, binomial, normal, sampling distributions) — B 10-29 → 11-13, land by 10-15

`ced2026`: 4.6 → `2.7 Independent Events & Unions`; 4.7 → `2.8 Introduction to Random Variables`; 4.8 → `2.9 Parameters of
Random Variables`; 4.10, 4.11 → `2.10 The Binomial Distribution`; 5.2 → `2.11 The Normal Distribution`; 5.1, 5.3 →
`2.12 Sampling Distributions & the CLT`. Worksheets: 4.6 `u4_lesson6_live.html`; 4.7, 4.8 `u4_lesson7-8_live.html`; 4.10, 4.11
`u4_lesson10-12_live.html`; 5.2, 5.1 `u5_lesson1-2_live.html`; 5.3 `u5_lesson3_live.html`. Tutor artifacts exist for all except
**5.1** (`tether:` from `apstat_5_framework.md`). 4.9 is not dated (skip unless it appears in PENDING).

| Topic | Seed for part (c) |
|---|---|
| 4.6 Independent Events and Unions | 2×2 table where P(A|B) ≈ P(A) in one version and clearly not in another (use one table; ask whether "owns a pet" and "plays an instrument" are independent from the data). Part (c): decide independence from the numbers, cite the two probabilities that settle it, explain why "mutually exclusive" and "independent" are different (give the pair here that is one and not the other), and say what independence would let you compute with the multiplication rule. Skills 3.A/4.B; pattern `independent-vs-mutually-exclusive-decide-from-the-table`. |
| 4.7 Introduction to Random Variables | A raffle: 200 tickets, prizes 1×\$100, 4×\$25, 20×\$5; tickets cost \$2. Two claims: "the average ticket wins \$1.50, so it's a good deal" vs "most tickets win nothing". Part (c): build the probability distribution, decide whether both statements are true at once, explain what the expected value does and does not tell one buyer, and decide whether to buy. Skills 3.A/4.B; pattern `expected-value-vs-typical-outcome-what-the-mean-tells-one-person`. Visual two_way_table (x, P(x)). |
| 4.8 Mean and Standard Deviation of Random Variables | Two delivery routes as random variables (minutes): same mean 30, SD 3 vs SD 12. A dispatcher says "same mean, so it doesn't matter which". Part (c): decide which route a customer who must not be late should get, cite the parameter that settles it, explain what a transformation (e.g. adding 5 min of loading, or doubling) does to mean and SD, and what the mean alone misleads the dispatcher into. Skills 3.A/4.B; pattern `same-mean-different-sd-which-parameter-answers-the-question`. Visual: two dotplots or raw_tikz of the two distributions. |
| 4.10 Introduction to the Binomial Distribution | Free-throw shooter, 70\% career; makes 3 of 10 tonight. Claim A: "she's in a slump — that never happens"; Claim B: "with n = 10, that's within normal variation". Part (c): check the binomial conditions (independence assumption — is it plausible?), compute P(X ≤ 3), decide whose claim is warranted, and state what evidence would change your mind. Skills 3.A/4.B; pattern `binomial-conditions-then-is-this-outcome-unusual`. Visual: pgfplot_hist of the binomial pmf (bins 0–10, counts as probabilities × 1000 or a table). |
| 4.11 Parameters for a Binomial Distribution | Same shooter, n = 100: mean 70, SD ≈ 4.6. A coach says "anything under 60 makes is impossible". Part (c): compute μ and σ, decide whether 58 is unusual (z ≈ −2.6; also check the normal approximation conditions np, n(1−p) ≥ 10), explain the difference between "unusual" and "impossible", and what the coach's claim misleads a reader into. Skills 3.A/4.B; pattern `binomial-mean-sd-unusual-vs-impossible`. |
| 5.2 The Normal Distribution, Revisited | Two normal models with the same mean, different SD (e.g. test scores of two schools); a claim "a 92 is 90th percentile at both". Part (c): compute the percentile at each school, decide whether the claim is warranted, explain why the same raw score has different z-scores, and which school's 92 is "better". Skill 3.A/4.B; pattern `same-score-two-models-compare-with-z`. Visual raw_tikz: two normal curves (pgfplots `gauss` expression) on one axis. |
| 5.1 Introducing Statistics: Why Is My Sample Not Like Yours? | Class activity: 20 students each draw n = 10 from the same population; a dotplot of their 20 sample means; one student's mean is far from the rest and she says "my sample is wrong". Part (c): decide whether her sample is wrong or just variable, cite the dotplot feature (the spread of sample means) that settles it, explain the difference between the population parameter and a sample statistic, and what would shrink the spread. Skill 4.B; pattern `sampling-variability-is-not-error`. Visual: dotplot of the 20 sample means (list them in the YAML). |
| 5.3 The Central Limit Theorem | A right-skewed population (e.g. commute times, mean 25, SD 15). Two claims: "the mean of a sample of 4 is approximately normal" vs "you need a bigger sample for that". Part (c): decide which claim is right for n = 4 and for n = 40, cite the CLT's condition, compute the SD of the sampling distribution for n = 40, and say what a reader who ignored the skew would get wrong. Skills 3.A/4.B; pattern `clt-when-does-normality-apply`. Visual: pgfplot_hist of the skewed population. |

## C. Self-seeded rounds — everything else in `dok/PENDING.md` order (OLD 5.4, 5.5, 6.x, 7.x, 8.x …), 6–8 topics per round

You now write the seeds. Rules:
1. **Before the first topic of each NEW CED unit** (`roadmap-data.json` `lessons.<old>.ced2026.newUnit`), write
   `dok/calibration/unit{n}.json` in the shape of `unit1.json` (2 DOK-2 anchors, 3 DOK-3 anchors with `frq_patterns`,
   `not_dok3`). NEW Unit 3 = inference for proportions & categorical data; Unit 4 = inference for means; Unit 5 = two-variable
   quantitative data & regression (check the labels in `roadmap-data.json`). Commit the calibration file with the first topic.
2. The DOK-3 for an inference topic is almost always **which conclusion is warranted**: two students run the same test or
   interval and reach different conclusions (one ignores a condition, one confuses fail-to-reject with accept, one reads
   significance as importance, one generalizes beyond the sample); or **which procedure** (proportion vs mean, one- vs two-sample,
   paired vs independent, chi-square GOF vs independence); or **what the interval/p-value means to a reader** (a specific
   misinterpretation to adjudicate). Always cite a specific number or condition from the stem; always ask what the wrong
   choice misleads a reader into. Skill 4.x for part (c); 3.x or 1.x for (a)/(b).
3. Use the topic's tutor artifact (`ai-tutor/u{u}_l{n}.md`) for the EK tether and to avoid duplicating its quiz items; use the
   worksheet named in `data/lesson-schedule.json` (`worksheetKey` → `u{u}_lesson{key}_live.html`; when several files match,
   pick the one whose range contains the lesson number). Topics with no tutor artifact get a `tether:` from
   `apstat_{u}_framework.md`.
4. Bonus ("Beyond the Exam", `status: bonus`) topics are last and still get a DOK-3.
5. Stop and report (do not guess) if: a worksheet file cannot be identified, a topic's framework text is missing, a
   generator change is needed that is more than ~20 lines, or `--validate`/tests fail for a reason outside your files.
6. Keep the two-week rule visible: prefer topics in date order; if a round would land after a topic's B date minus 14 days,
   say so in `dok/ROUNDS.md`.

Round report format (`dok/ROUNDS.md`, append):
```
## Round N — <date> — topics … — commits … — coverage X/66
pages: all 2/1/≤3 (or list exceptions) · tests: vitest N, pytest N · changed outside lessons/registry: … · notes: …
```
