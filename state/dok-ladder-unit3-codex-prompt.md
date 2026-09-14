# Codex prompt — DOK ladders, round 2: OLD Unit 3 "Collecting Data" (6 topics) — 2026-09-04

Same job as `state/dok-ladder-unit1-codex-prompt.md` (read it first — recipe, gates, commit rules all still apply),
new topics. Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs`. **Unit 1 is complete (10/10, pushed at
`d6ceaba`).** Coverage 10/66. These six are the next dated days; Period B starts them **2026-09-25**, so they are due
in the repo by **2026-09-11** (two-week rule). In the NEW CED they belong to Unit 1 (Exploring One-Variable Data &
Collecting Data), so the calibration anchors in `dok/calibration/unit1.json` apply — especially
`u1-d3-scope-of-what-data-can-support` and its `sampling-method-critique-and-fix` pattern. `ced2026` in the YAML uses
the REAL new-CED mapping from `roadmap-data.json` (`lessons.<old>.ced2026`), which the header prints as "(CED u.t)":

| OLD | `ced2026` |
|---|---|
| 3.1, 3.2 | `{unit: 1, topic: "1.10", label: "Investigative Question & Data Collection"}` |
| 3.3 | `{unit: 1, topic: "1.11", label: "Random Sampling"}` |
| 3.4 | `{unit: 1, topic: "1.12", label: "Potential Problems with Sampling"}` |
| 3.5, 3.6 | `{unit: 1, topic: "1.13", label: "Experimental Design"}` |

(`topic:` at the top of the YAML and the file/registry names stay the OLD key, e.g. `3.4`.)

Exemplars to copy from now: `dok/registry/1.1.jsonl` + `dok/lessons/1.1.yaml` (claim-vs-data, has a `tether:` list because
no tutor artifact existed) and `dok/registry/1.3.jsonl` (two_way_table). 3.1 has no tutor artifact either → its YAML needs
`tether:` (copy LO VAR-1.A / EKs verbatim from `apstat_3_framework.md` Topic 3.1, LaTeX-escaped).

## Per-topic inputs and DOK-3 seeds (refine; keep identify → describe → adjudicate; choose / critique / bound)

| Topic | B / E | Worksheet | Tutor | Seed for part (c) |
|---|---|---|---|---|
| 3.1 Introducing Statistics: Do the Data We Collected Tell the Truth? | 09-25 / 10-02 | `u3_lesson1_live.html` | none → `tether:` | A school website poll "Should the cafeteria go cashless?" — 412 responses, 71\% yes; the same week a teacher asked every student in three randomly chosen homerooms (n=68): 44\% yes. Two headlines. Part (c): which number a reader should trust for "what do students at this school think?", the specific feature of each collection method that settles it (who chose to respond vs who was chosen), what the website number's 412 does NOT buy you, and one change that would fix the website poll. Skill 4.A/1.C; pattern `voluntary-response-vs-random-which-number-and-why`. Visual: two_way_table (method, n, \% yes, who was asked). |
| 3.2 Introduction to Planning a Study | 09-28 / 10-05 | `u3_lesson2_live.html` | yes | A student wants to know whether the new tutoring center raises test scores. Plan A: compare this year's scores of students who CHOSE to attend vs those who did not (observational). Plan B: randomly assign 40 volunteers to attend or not (experiment). Part (c): which plan could support "the center RAISES scores", the design feature that settles it (random assignment vs self-selection), one lurking variable that spoils Plan A, and what Plan B can still NOT claim (generalizing beyond volunteers). Skill 1.C/4.A; pattern `observational-vs-experiment-what-each-can-claim`. Visual: two_way_table comparing the two plans (who, how assigned, what is measured). |
| 3.3 Random Sampling and Data Collection | 09-29 / 10-07 | `u3_lesson3_live.html` | yes | Three proposed samples of 50 from a school of 1{,}200 for "hours of sleep": (1) every 24th name from the alphabetical roster after a random start; (2) 50 names drawn from a hat with all 1{,}200; (3) 12–13 randomly chosen from EACH grade. A student says "they're all random so they're all the same." Part (c): name each method, decide which is a simple random sample, then decide which ONE method you would use if grades differ a lot in sleep, cite the feature (stratifying guarantees every grade is represented) that settles it, and say what (1) would do wrong if the roster were sorted by grade instead of name. Skill 1.C/4.A; pattern `srs-vs-systematic-vs-stratified-choose-and-defend`. Visual: two_way_table of the three methods (how chosen, n per grade). |
| 3.4 Potential Problems with Sampling | 10-01 / 10-09 | `u3_lesson4_live.html` | yes | A mailed survey to 500 randomly chosen households about a park fee: 120 returned; 78\% oppose. A phone survey the same week, 300 random numbers, 240 answered, question worded "Do you support a NEW FEE that would tax park users?": 62\% oppose. Part (c): name the bias in each (nonresponse; wording), decide which estimate is closer to the truth and why NEITHER can be trusted as is, cite the specific numbers (24\% response rate; the loaded wording) that settle it, and propose one fix per survey. Skill 1.C/4.A; pattern `name-the-bias-direction-and-fix`. Visual: two_way_table (survey, sampled, responded, \% oppose, wording). |
| 3.5 Introduction to Experimental Design | 10-02 / 10-14 | `u3_lesson5_live.html` | yes | An energy-drink experiment: 30 volunteers; Design 1: first 15 to sign up get the drink, last 15 get water, reaction time measured; Design 2: coin flip per person, drink vs water, both in identical cups, tester doesn't know who got which. Part (c): which design lets a difference be attributed to the drink; name the specific features (random assignment, control, blinding) present in one and missing in the other; explain what a difference under Design 1 could ALSO be due to (the eager early sign-ups); then decide whether the finding could generalize to all teenagers. Skill 1.C/4.A; pattern `experiment-principles-which-design-supports-cause`. Visual: two_way_table (design, how assigned, control, blinding). |
| 3.6 Selecting an Experimental Design (incl. 3.7 blocking / inference for experiments — worksheet `u3_lesson6-7`) | 10-05 / 10-16 | `u3_lesson6-7_live.html` | yes | A fertilizer trial on 24 tomato plants across two greenhouses (one sunny, one shaded). Design A: completely randomized — 12 get fertilizer, 12 don't, ignoring greenhouse. Design B: randomized block — within EACH greenhouse, half fertilizer, half not. Results table shows means by greenhouse. Part (c): which design a grower should use, cite the specific feature (the greenhouse difference is larger than the fertilizer effect) that settles it, explain what Design A risks (chance imbalance masking the effect), and state what conclusion the randomized block design permits. Skill 1.C/4.B; pattern `completely-randomized-vs-block-when-blocking-earns-its-keep`. Visual: two_way_table (greenhouse × treatment, mean yield). |

## Same recipe, same gates
Registry row per topic (`aps-3.x-d3-1`, focus, dok 3, parts a/b/c dok 1/2/3, first_take, frq_pattern, dok_rationale ≥40 chars
without hard/easy/difficult, answers, scoring E/P/I, sentence_frames, source original, hypothetical true, visual) +
optional reinforcement; lesson YAML copied from the nearest exemplar; delete the row from `dok/PENDING.md`; build →
compile → `pdfinfo` (student 2 / board 1 / teacher ≤ 3) → open the PDFs and look → `python dok/build_ladder.py
--validate`, `npx vitest run tests/dok-registry.test.js tests/dok-coverage.test.js`, `python -m pytest
tests/test_dok_build.py -q`. Commit per topic or pair. **Do not push.** Report commit hashes + page counts.

Adversarial self-check on every part (c): decision not pre-made in the stem; not answerable by one procedure; cites a
specific feature of the data/design and asks what the alternative would mislead a reader into.

After 3.1–3.6, the next dated days are OLD 2.1, 2.2, 2.3 (B 10-13/10-15/10-16; two categorical variables) then OLD 4.1–4.3
(B 10-19 → 10-22; probability) — the orchestrator will write those seeds; stop after 3.6 and report.
