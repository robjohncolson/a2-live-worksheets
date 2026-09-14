# Reflection Rubric Audit — 2026-08-19

AI-grading rubrics (`ai-grading-prompts*.js`) checked against their worksheets and CED objectives by four Codex reviewers. **Nothing changed** — proposals for the teacher.

| | count |
|---|---|
| rubrics audited | 212 |
| fine as-is | 150 |
| revise | 59 |
| rewrite | 3 |
| question mismatches | 10 |
| high-severity findings | 13 |

## ai-grading-prompts-u8-l3.js (grades u8_lesson3_live.html)

### reflect1 — rewrite · QUESTION MISMATCH
- **high** (question): The worksheet asks for the complete predatory-lending GOF test, its conclusion, and the largest-discrepancy interpretation. The rubric question asks only for calculation mechanics and stops at the P-value.
  - evidence: Worksheet: "Include the hypothesized proportions, expected counts, chi-square statistic, degrees of freedom, p-value, and the conclusion at alpha = 0.05. Then explain which income bracket showed the largest discrepancy."
- **high** (grounding): The required elements omit the displayed prompt's reject/conclusion step and largest-contribution interpretation, so the current E score does not represent completion of the worksheet question.
  - evidence: Worksheet body: "There is convincing statistical evidence that the distribution of predatory lending businesses in Dallas is not the same" and "The income bracket with the largest contribution was the $100,000 and above bracket."
- proposed rubric: see artifact

### reflect2 — rewrite · QUESTION MISMATCH
- **high** (question): The displayed prompt requires a comparison of predatory lending (p = 0.0208) and Battleship (p = 0.079). The rubric instead asks only about predatory lending and largest-contribution follow-up.
  - evidence: Worksheet: "Use both the predatory lending result (p = 0.0208) and the Battleship result (p = 0.079) to illustrate the difference between rejecting and failing to reject the null hypothesis at alpha = 0.05."
- **high** (grounding): No required element grades the Battleship P-value interpretation, fail-to-reject decision, or contextual conclusion, while largest contribution is required even though the displayed question does not ask for it.
  - evidence: Worksheet body: "In the Battleship practice, the p-value of 0.079 is greater than alpha = 0.05, so we fail to reject H0."
- proposed rubric: see artifact

### exitTicket — revise · QUESTION MISMATCH
- **medium** (question): The rubric rewrites the city summer-program prompt, adding parameter definitions and a P-value interpretation while the worksheet asks for hypotheses, condition work with expected counts, mechanics, conclusion, and largest contribution.
  - evidence: Worksheet begins "The city summer program problem" and asks: "(a) state the null and alternative hypotheses ... (c) give the test statistic, degrees of freedom, and p-value."
  - proposal: The city summer program problem: a simple random sample of 240 households produced observed counts of 100, 35, 40, 22, 12, and 31 for districts A through F. The year-2000 proportions are 0.32, 0.12, 0.10, 0.27, 0.05, and 0.14. (a) State the null and alternative hypotheses. (b) Check the three conditions for inference, showing the expected counts. (c) Give the test statistic, degrees of freedom, and p-value. (d) State the conclusion in context at alpha = 0.05. (e) Which district had the greatest change in participation? Justify using contributions.
- **medium** (strictness): parameter-definition is mandatory even though the displayed exit ticket asks for hypotheses but not a separate parameter definition. That extra requirement can turn an otherwise complete multi-part answer into P.
  - evidence: Worksheet part (a): "state the null and alternative hypotheses."
  - proposal: {"id":"parameter-definition","description":"May define the parameters as the population participation proportions for districts A through F","required":false}

## ai-grading-prompts-u8-l5.js (grades u8_lesson5_live.html)

### reflect1 — revise · QUESTION MISMATCH
- **medium** (question): The rubric is semantically close but does not reproduce the displayed question, which explicitly names independent random samples/randomized experiments and a single random sample rather than the added 2,000-adult detail.
  - evidence: Worksheet: "Include comparing distributions across multiple populations or treatments, independent random samples or a randomized experiment, one single random sample, association between two categorical variables, the school example as homogeneity, and the employment example as independence."
  - proposal: Explain how you decide whether a two-way table calls for a chi-square test for homogeneity or a chi-square test for independence. Include comparing distributions across multiple populations or treatments, independent random samples or a randomized experiment, one single random sample, association between two categorical variables, the school example as homogeneity, and the employment example as independence.

### reflect2 — revise · QUESTION MISMATCH
- **medium** (question): The rubric adds a required many-sided explanation and a separate expected-versus-observed reminder that are not in the displayed reflection prompt.
  - evidence: Worksheet prompt ends with "the 10% condition, and the rule that all expected counts must be greater than 5."
  - proposal: Explain how to write null and alternative hypotheses and verify the conditions for these chi-square tests. Include no difference in distributions versus difference for homogeneity, no association or independent versus association or not independent for independence, the fact that no parameter needs to be defined, the 10% condition, and the rule that all expected counts must be at least 5.
- **medium** (strictness): many-sided and expected-not-observed are independently required even though the shown reflection does not request those explanations; they should enrich rather than gate E.
  - evidence: Worksheet displayed prompt does not include "many-sided" or ask why observed counts are not checked.
  - proposal: Set many-sided and expected-not-observed to required:false.
- **medium** (grounding): design-condition says homogeneity requires a stratified random sample, which is too narrow and conflicts with the lesson's own school example and vocabulary. Homogeneity uses independent random samples from the populations or a randomized experiment. The expected-count boundary should also be at least 5, not greater than 5.
  - evidence: Worksheet vocabulary: "Independent Random Samples — Separate random samples taken from different populations or groups." u8_lesson6 uses "expected counts at least 5."
  - proposal: Replace design-condition with "States that homogeneity uses independent random samples from the populations or groups, or multiple groups from a randomized experiment, while independence uses one random sample"; replace expected-counts with "States that all expected counts must be at least 5".

### exitTicket — rewrite · QUESTION MISMATCH
- **high** (question): The rubric replaces the displayed conceptual setup task with a different task requiring numerical condition checks for both examples. The worksheet instead asks students to identify both tests, state both hypothesis pairs, state the three general conditions, and explain why expected rather than observed counts are checked.
  - evidence: Worksheet: "(e) state the three conditions for chi-square homogeneity or independence tests and explain why expected counts, not observed counts, are checked in the third condition."
- **high** (strictness): The required elements demand 320, 214, 14.8, 2,000, and example-specific condition verifications not requested by the displayed exit ticket, while expected-not-observed is optional even though it is explicitly asked.
  - evidence: The displayed exit ticket contains no sample-size or smallest-expected-count values and explicitly asks why expected counts are checked.
- proposed rubric: see artifact

## ai-grading-prompts-u7-l7.js (grades u7_lesson7_live.html)

### reflect1 — revise · QUESTION MISMATCH
- **medium** (question): The rubric substitutes a narrower prompt that explicitly names the interval endpoints. The worksheet asks for the general template, direction, parameter-versus-sample distinction, and two bad interpretations; grading should use that exact prompt.
  - evidence: Worksheet: "Explain how to correctly interpret a confidence interval for the difference of two population means. Use the spider example to discuss the general interpretation template, the direction of subtraction, why the interval must describe a parameter instead of a sample, and two incorrect interpretations students should avoid."
  - proposal: Explain how to correctly interpret a confidence interval for the difference of two population means. Use the spider example to discuss the general interpretation template, the direction of subtraction, why the interval must describe a parameter instead of a sample, and two incorrect interpretations students should avoid.

### reflect2 — revise · QUESTION MISMATCH
- **high** (question): The actual prompt explicitly requires the spider, restaurant, and fire-station intervals. The rubric question omits the restaurant interval, and restaurant-connection is only optional, so the grader is not grading the displayed task.
  - evidence: Worksheet: "Use the spider interval, the restaurant interval (-9.3, 3.2), and the fire-station interval (-2.37, 0.37) to discuss what it means when 0 is or is not in the interval."
  - proposal: Explain how to use a confidence interval to justify or not justify a claim about two population means. Use the spider interval, the restaurant interval (-9.3, 3.2), and the fire-station interval (-2.37, 0.37) to discuss what it means when 0 is or is not in the interval and how to state the conclusion correctly.
- **high** (scoring): Because the worksheet requires the restaurant example, treating it as optional lets an incomplete answer earn E while a response following the displayed three-example comparison is not represented by the required set.
  - evidence: Worksheet body: "For the interval (-9.3, 3.2), 0 is in the interval, so there is not convincing evidence of a difference between foam and plastic containers."
  - proposal: {"id":"restaurant-connection","description":"Explains that 0 is in the restaurant interval (-9.3, 3.2), so no difference is plausible and there is not convincing evidence of a difference between foam and plastic container mean temperatures","required":true}

### exitTicket — revise · QUESTION MISMATCH
- **medium** (question): The rubric paraphrases and reorganizes the exit ticket, omitting the council member's belief from the setup and adding condition details not stated in part (b). The rubric elements are mostly aligned, so replacing questionText is sufficient.
  - evidence: Worksheet begins: "A town council member believes the two fire stations have different mean response times" and part (b) says "Explain why the conditions are met and interpret the interval in context."
  - proposal: A town council member believes the two fire stations have different mean response times. Random samples of 50 calls from the northern and southern fire stations were selected. The summary statistics were x-bar_N = 4.3 minutes, s_N = 3.7 minutes, x-bar_S = 5.3 minutes, and s_S = 3.2 minutes. A calculator produced the 95% confidence interval (-2.37, 0.37) for (northern - southern). (a) Define the parameter and identify the correct confidence interval procedure. (b) Explain why the conditions are met and interpret the interval in context. (c) State whether the interval supports the council member's belief, and explain your answer using 0. (d) Interpret the meaning of the 95% confidence level for this interval.

## ai-grading-prompts.js (grades u3_lesson6-7_live.html)

### reflect55 — revise
- **high** (grounding): The required p-value element uses the common but incorrect AP interpretation that p = 0.02 is a 2% chance the observed difference happened by chance. A p-value is conditional on the null model and includes the observed result or more extreme results.
  - evidence: Worksheet: "The probability of observing an outcome this extreme due to chance was p ≈ 0" and "Statistical Significance — Observed differences are too large to be reasonably attributed to chance alone."
  - proposal: Replace the element with: { "id": "significance-meaning", "description": "Assuming no true treatment difference, p = 0.02 means there is a 2% probability of obtaining a difference at least as extreme as the observed one from chance variation alone", "required": true }.
- **medium** (strictness): The two required elements significance-meaning and not-by-chance test essentially the same idea, so a concise correct interpretation can be counted as missing one required component.
  - evidence: Worksheet: "Statistical Significance — Observed differences are too large to be reasonably attributed to chance alone."
  - proposal: Replace the second element with: { "id": "not-by-chance", "description": "Concludes that the observed difference is statistically significant, or unlikely under a no-difference chance model", "required": false }.
- **medium** (scoring): The I guide makes any p-value misinterpretation or any wrong causation conclusion automatically Incorrect even when the other half of the two-part response is correct; that conflicts with Partially correct.
  - evidence: Worksheet prompt: "What does this mean, and what can we conclude about causation?"
  - proposal: Replace the guide with: { "E": "Correctly interprets p = 0.02 under a no-difference chance model and states that a causal conclusion requires random assignment", "P": "Correctly addresses either statistical significance or the random-assignment requirement for causation, but not both, or makes a minor imprecision", "I": "Correctly addresses neither component or shows a fundamental misunderstanding of both significance and causation" }.

### reflect56 — revise
- **high** (scoring): Random selection and representativeness are marked as two simultaneously required conditions even though the worksheet presents representativeness as the basis for generalization and random selection as one way to improve representativeness. The description says OR while required flags and P guide penalize giving only one.
  - evidence: Worksheet: "If experimental units are representative of the population, then results can be generalized to the population" and "Random selection of individuals gives a better chance that the sample will be representative."
  - proposal: Set random-selection to required: false and representative-sample to required: true. Replace the guide with: { "E": "States that experimental units must be representative of the larger population; may explain that random selection helps achieve representativeness", "P": "Mentions random selection or representativeness but does not clearly connect it to the population to which results generalize", "I": "Gives no valid basis for generalization or confuses generalization with random assignment and causation" }.

## ai-grading-prompts-u4-l10-12.js (grades u4_lesson10-12_live.html)

### reflect1 — revise
- **medium** (scoring): The required distinction and E guide use only fixed n versus waiting for the first success. The worksheet asks how students know which distribution applies and explicitly teaches the shared binary, independent, same-p conditions as well.
  - evidence: Worksheet vocabulary: "Binomial Setting — Binary outcomes, Independent trials, fixed Number of trials, Same probability" and "Geometric Setting — Binary, Independent, Same p, but NO fixed number of trials (count until first success)."
  - proposal: Replace distinction-explanation with: { "id": "distinction-explanation", "description": "Explains that both scenarios have binary outcomes, independent trials, and constant p = 0.30; binomial fixes n = 10 and counts successes, while geometric counts trials until the first success", "required": true }. Add the shared conditions to E.

### exitTicket — revise
- **medium** (grounding): The part-d interpretation says 2.5 hurricanes form "before" one makes landfall, which can be read as 2.5 failures before the success. The geometric variable and mean count trials through and including the first success.
  - evidence: Worksheet vocabulary: "Geometric Random Variable — X = the number of trials until the first success" and "Geometric Mean — μX = 1/p."
  - proposal: Replace the element with: { "id": "part-d-interpretation", "description": "Part (d): Over many such sequences, the first landfall occurs on about the 2.5th hurricane on average, counting the hurricane that makes landfall", "required": true }.
- **medium** (strictness): The guide assigns I whenever fewer than three of four multi-part tasks are correct. A response with two complete, conceptually correct parts is genuinely partial and should not be Incorrect in E/P/I terms.
  - evidence: Worksheet exit ticket contains four separately requested parts: exact binomial probability, binomial mean and interpretation, exact geometric probability, and geometric mean and interpretation.
  - proposal: Replace the guide with: { "E": "All four parts are substantially correct with appropriate calculations and interpretations", "P": "Two or three parts are substantially correct, or all four are attempted with limited calculation or interpretation errors", "I": "Fewer than two parts are substantially correct or the response shows a fundamental inability to distinguish binomial from geometric settings" }.

## ai-grading-prompts-u4-l345.js (grades u4_lesson3-4-5_live.html)

### reflect1 — revise
- **medium** (grounding): The required claim that the percentage "generalizes to any sample size" is stronger than the lesson and can imply exact 20% behavior in arbitrary finite samples. The supported interpretation is approximate long-run relative frequency.
  - evidence: Worksheet: "The probability of an event in a repeatable situation can be interpreted as the relative frequency with which the event will occur in the long run."
  - proposal: Replace the element with: { "id": "generalizability", "description": "Explains that the proportion communicates an approximate long-run rate and can support predictions over many future selections, unlike a raw count tied to the 2,105 observed sales", "required": true }.

### reflect3 — revise
- **medium** (context): The common-mistake warning "Confusing independence with sampling with replacement" is over-broad. In this random-draw setting, replacement restores the bag and makes the two red-draw events independent, so that is a correct alternative explanation.
  - evidence: Worksheet prompt: "How would this change if we selected marbles WITH replacement instead?" The lesson's without-replacement example says the second probability changes because only 3 red remain out of 9.
  - proposal: Replace that common mistake with: "Claiming the draws are independent without explaining that replacement restores the original 4-red-out-of-10 composition and keeps the second-draw probability unchanged."

### exitTicket — revise
- **medium** (scoring): The comparison of the two conditional probabilities is optional, so E can be awarded without answering the worksheet's explicit "What do these tell you?" subpart.
  - evidence: Worksheet: "Calculate P(Math | Freshman) and P(Math | Sophomore). What do these tell you?"
  - proposal: Replace the element with: { "id": "comparison", "description": "Interprets the comparison: sophomores in this survey were more likely to prefer Math than freshmen (60% versus 45%)", "required": true }. Replace E with: "All calculations are correct, P(Math) is interpreted, non-mutual-exclusivity is explained, and the two conditional probabilities are compared in context."

## ai-grading-prompts-u8-l6.js (grades u8_lesson6_live.html)

### reflect2 — revise
- **medium** (strictness): The displayed reflection asks for the follow-up idea of looking for the largest contribution, but the rubric requires the exact contribution 8.30 and the exact unemployed/no-diploma cell explanation. That numerical detail is useful but not essential to the requested general idea.
  - evidence: Worksheet prompt: "the idea of follow-up analysis using the largest contribution."
  - proposal: Explains that follow-up analysis examines the largest cell contribution to identify which cells most strongly explain the chi-square result; may use the employment example as illustration

### exitTicket — revise · QUESTION MISMATCH
- **medium** (question): The rubric says calculator support may be mentioned, while the displayed part (e) explicitly requires one way technology can help. It also collapses the displayed five-part wording.
  - evidence: Worksheet part (e): "State the decision and conclusion in context, and explain one way technology can help carry out the test."
  - proposal: Use the schizophrenia age-group and gender example to describe a complete chi-square test for independence. (a) Identify the correct procedure and explain why it fits this setting. (b) State H0 and Ha in context. (c) State the significance level used if none is given, and verify the three conditions using the random sample of 207 people, the 10% condition, and expected counts at least 5. (d) Report the chi-square statistic, degrees of freedom, and p-value. (e) State the decision and conclusion in context, and explain one way technology can help carry out the test.
- **medium** (scoring): calculator is optional in expectedElements even though technology is an explicit part of the worksheet question, so the required set and E guide permit an incomplete response.
  - evidence: Worksheet explicitly asks to "explain one way technology can help carry out the test."
  - proposal: {"id":"calculator","description":"Explains one way technology helps, such as using a chi-square test with observed counts in matrix A and reading expected counts from matrix B","required":true}

## ai-grading-prompts-u5-l8.js (grades u5_lesson8_live.html)

### reflect1 — revise
- **low** (scoring): The E guide requires that both SDs decrease with n even though that fact is marked optional. The required SD-similarity element already captures the formula comparison requested by the prompt.
  - evidence: The worksheet asks: "How are the formulas for the mean and standard deviation similar? How are the normality conditions different?"
  - proposal: Replace scoringGuide.E with: "Response correctly identifies the similarity in the mean formulas (each is a difference in population parameters), the additive variance structure of the SD formulas, and correctly contrasts the normality conditions."

### reflect2 — revise
- **medium** (scoring): The conclusion about whether 1.2 ounces becomes unusual is optional even though it is an explicit question and is the endpoint of the reasoning chain.
  - evidence: The worksheet asks: "Would a difference of 1.2 ounces become unusual? Explain your reasoning."
  - proposal: Replace the element with: { "id": "unusual-prediction", "description": "Concludes that with both sample sizes increased to 60, a difference of 1.2 ounces would become unusual because its tail probability becomes small", "required": true }

### exitTicket — revise
- **medium** (scoring): The SD interpretation and unusual conclusion are marked optional although the worksheet explicitly asks for both and the E guide requires both.
  - evidence: The worksheet says: "Find the mean and SD ... Interpret both in context" and "find the probability, and state whether this result is unusual."
  - proposal: Change sd-interpretation and unusual-conclusion to required: true. Keep their existing descriptions.

## ai-grading-prompts-u6-l4.js (grades u6_lesson4_live.html)

### reflect2 — revise
- **medium** (grounding): The town's adult population size is not supplied, so the 10% condition cannot be verified outright. The rubric should require a conditional statement rather than allow an unexplained assumption that the condition is met.
  - evidence: The prompt supplies only "A random sample of 120 adults"; elsewhere the worksheet models this correctly as "For the 10% condition ... we need to assume the school has more than 300 students."
  - proposal: Replace ten-percent-condition with: { "id": "ten-percent-condition", "description": "States that the 10% condition cannot be verified without the town's adult population size and that it would be met if the town has at least 1,200 adults", "required": true }. Replace scoringGuide.E with: "Correctly identifies the one-sample z test, verifies the random and large-counts conditions, states the conditional requirement for the 10% condition, and explains why the large-counts check uses the null value 0.35."

### exitTicket — revise
- **high** (grounding): The rubric unconditionally concludes that it is appropriate to proceed, but the school enrollment needed for the 10% condition is absent. A fully correct response must make the decision conditional on the school having at least 900 students.
  - evidence: The worksheet gives a random sample of 90 students but no school enrollment, and its lesson example says the 10% check requires an explicit population-size assumption.
  - proposal: Replace check-ten-percent with: { "id": "check-ten-percent", "description": "States that the 10% condition cannot be verified from the information given and would hold if the school has at least 900 students", "required": true }. Replace proceed-and-parameter with: { "id": "proceed-and-parameter", "description": "Concludes that the test may proceed if the school has at least 900 students, since the other conditions are met, and explains that hypotheses use the population proportion p rather than the sample statistic p̂", "required": true }.

## ai-grading-prompts-u1-l3.js (grades u1_lesson3_live.html)

### reflect2 — revise
- **medium** (grounding): The optional majority benchmark says 'at least 50 percent.' In standard statistical usage, a majority is more than half; exactly 50% is not a majority. The worksheet itself exposes the contradiction by pairing 'More than half' with 'at least 50%.'
  - evidence: Worksheet vocabulary: 'Majority More than half, or at least 50%, of the cases.'
  - proposal: Replace the element description with: 'May mention a benchmark such as majority meaning more than 50 percent or over one-third meaning above about 33 percent.'

### exitTicket — revise
- **medium** (context): One common-mistake entry teaches the same incorrect inclusive definition of majority. Although 45% is not a majority under either cutoff, this wording could penalize a student who correctly states that a majority must exceed 50%.
  - evidence: Worksheet vocabulary says 'Majority More than half'; the exit-ticket prompt asks whether 'a majority of students prefer chips.'
  - proposal: Replace the common mistake with: 'Forgetting that a majority means more than 50 percent.'

## ai-grading-prompts-u1-l7.js (grades u1_lesson7_live.html)

### reflect1 — revise
- **medium** (grounding): The median element says half the observations are below 3 and half are above 3. That is not generally valid when observations can equal the median; the conventional interpretation uses at or below and at or above.
  - evidence: Worksheet vocabulary: 'Median The middle value in an ordered data set.' The lesson identifies the Flint median as 3 parts per billion.
  - proposal: Replace the median element with: 'Explains that the median is the middle ordered value and may note that at least half the Flint lead levels are at or below 3 parts per billion and at least half are at or above 3 parts per billion.'
- **medium** (strictness): The prompt requires at least one numerical value, but the median and IQR elements each hard-code a numerical result, effectively requiring multiple numerical facts before the separate numerical-detail element is considered.
  - evidence: Worksheet prompt: 'Use context and include at least one numerical value from the lesson.'
  - proposal: Make each statistic element conceptual with its numerical value optional, and replace numerical-detail with required:true and description 'Includes at least one correct numerical value from the lesson, such as mean 7.31, median 3, IQR 5, Q1 2, or Q3 7.'

## ai-grading-prompts-u4-l6.js (grades u4_lesson6_live.html)

### reflect1 — revise
- **medium** (scoring): The why-reasoning element is optional even though the prompt explicitly asks why and the E guide requires valid reasoning.
  - evidence: Worksheet prompt: "Can two events be both independent and mutually exclusive? Why or why not?"
  - proposal: Replace the element with: { "id": "reasoning", "description": "Explains that for positive-probability events, mutual exclusivity gives P(A and B)=0 while independence would require P(A and B)=P(A)P(B)>0", "required": true }.
- **medium** (context): The I guide and common-mistake list can penalize the mathematically correct zero-probability exception: mutually exclusive events can also be independent if P(A)=0 or P(B)=0. The expected element itself already limits the usual no answer to non-zero probabilities.
  - evidence: Worksheet gives "P(A and B) = P(A) · P(B)" for independent events and "P(A and B) = 0" for mutually exclusive events; both equations hold when one event has probability 0.
  - proposal: Replace the common mistake with: "Claiming two positive-probability events can be both independent and mutually exclusive." Replace I with: "Confuses the concepts or incorrectly claims that two events with positive probabilities can be both independent and mutually exclusive."

## ai-grading-prompts-u4-l7-8.js (grades u4_lesson7-8_live.html)

### reflect1 — revise
- **medium** (scoring): example-justification is optional even though the prompt asks students to explain why each example fits and E requires reasonable justification.
  - evidence: Worksheet prompt: "Give one original example of each (not from the video) and explain why it fits that category."
  - proposal: Replace the element with: { "id": "example-justification", "description": "Explains why the discrete example has countable separated values and why the continuous example can take any value in an interval", "required": true }.

### exitTicket — revise
- **medium** (scoring): The long-run interpretation of expected value is optional and absent from E, although the worksheet explicitly asks students to interpret the answer and defines expected value as a long-run average.
  - evidence: Worksheet vocabulary: "Expected Value (Mean) — The long-run average value of a random variable"; exit prompt: "Interpret your answer and determine if this is a 'fair' game."
  - proposal: Replace the element with: { "id": "long-run-context", "description": "Explains that over many plays the player's net profit would average about +$0.17 per play", "required": true }. Replace E with: "Correct net profits, probabilities, distribution, and expected value; interprets +$0.17 as a long-run average and concludes the game is not fair because the expected net profit is not 0."

## ai-grading-prompts-u5-l4.js (grades u5_lesson4_live.html)

### reflect1 — revise
- **medium** (grounding): The required element equates being centered at the parameter with misses being equally likely on both sides. Centering/no systematic direction does not generally guarantee equal tail probabilities, and the worksheet does not make that stronger claim.
  - evidence: The worksheet says: "Individual sample means vary around μ — some are too high, some too low. But the sampling distribution is centered at the population mean. That's what 'unbiased' means: no systematic tendency to miss in one direction."
  - proposal: Replace the element with: { "id": "centered-at-parameter", "description": "Describes the sampling distribution as centered at μ, so the estimator has no systematic tendency to overestimate or underestimate", "required": true }

### reflect2 — revise
- **medium** (scoring): The rubric treats the final overestimation question as a bonus, allowing E without answering an explicit part of the reflection.
  - evidence: The worksheet asks: "Could a different statistic be biased in the opposite direction — systematically overestimating?"
  - proposal: Replace the element with: { "id": "overestimation-possible", "description": "Explains that a different estimator can be biased upward if its sampling distribution is centered above the parameter, so it systematically overestimates", "required": true }

## ai-grading-prompts-u5-l7.js (grades u5_lesson7_live.html)

### reflect1 — revise
- **medium** (scoring): The explanation for why the normality conditions differ is optional even though the question explicitly asks for it and the E guide requires at least some reasoning.
  - evidence: The worksheet asks: "Why do you think the normality conditions differ?"
  - proposal: Replace the element with: { "id": "why-different", "description": "Offers a reasonable explanation for the different conditions, such as proportions arising from binary outcomes while sample means can originate from populations of many shapes", "required": true }

### exitTicket — revise
- **medium** (scoring): Two requested components—interpreting the SD and stating whether the result is unusual—are optional even though the E guide requires them.
  - evidence: The worksheet says: "Find the mean and SD ... Interpret both in context" and "find the probability, and state whether this result is unusual."
  - proposal: Change sd-interpretation and unusual-conclusion to required: true. Keep their existing descriptions.

## ai-grading-prompts-u6-l5.js (grades u6_lesson5_live.html)

### reflect1 — revise
- **medium** (scoring): The by-chance-alone clause is optional even though the E guide requires it and the worksheet's definition makes it part of a correct p-value interpretation.
  - evidence: The worksheet defines a p-value as "The probability of obtaining evidence for H_a as strong as or stronger than the observed evidence, by chance alone, when H_0 is true."
  - proposal: Replace the element with: { "id": "by-chance-alone", "description": "States that the probability describes what could occur by chance alone under the null model", "required": true }

### exitTicket — revise
- **medium** (scoring): The two clauses that distinguish a p-value from the probability of the exact observed result—'or less/more extreme' and 'by chance alone'—are optional, but the E guide requires both for the requested interpretation.
  - evidence: The worksheet defines the p-value as evidence "as strong as or stronger than the observed evidence, by chance alone, when H_0 is true."
  - proposal: Change or-more-extreme and by-chance-alone to required: true. Keep their existing descriptions.

## ai-grading-prompts-u1-l6.js (grades u1_lesson6_live.html)

### reflect2 — revise
- **high** (strictness): The question asks for at least two unusual-feature terms, but the rubric requires separate definitions of all three terms (outlier, gap, and cluster), plus a Flint connection and a statement about the role of unusual features. A student can fully follow the prompt with two correct terms and still be forced to P.
  - evidence: Worksheet prompt: 'Use at least two terms from the lesson and connect one of them to the Flint data.'
  - proposal: Replace the three required definition elements with one required element: {"id":"two-unusual-features","description":"Correctly explains any two of these lesson terms: outlier, gap, and cluster","required":true}. The unused third definition may be optional.

## ai-grading-prompts-u1-l8.js (grades u1_lesson8_live.html)

### reflect1 — revise
- **high** (strictness): The prompt explicitly allows the student to mention the box, whiskers, or outliers, but the rubric requires both a box/median explanation and a whiskers/outliers explanation. That turns an explicit OR into an AND and can deny E to a response that follows the prompt exactly.
  - evidence: Worksheet prompt: 'Include at least two numerical values from the lesson and mention the box, whiskers, or outliers.'
  - proposal: Replace box-and-median plus whiskers-or-outliers as required items with one required element: {"id":"boxplot-feature","description":"Correctly explains at least one requested box-plot feature: the box runs from Q1 to Q3 with the median inside it, whiskers extend to the most extreme non-outliers, or outliers are plotted separately","required":true}. Keep additional feature explanations optional.

## ai-grading-prompts-u5-l5.js (grades u5_lesson5_live.html)

### reflect1 — revise
- **medium** (scoring): Why variability matters is an explicit half of the question, but the only element that answers it is optional and the E guide calls it a bonus.
  - evidence: The worksheet asks: "Why is understanding this variability important for statistics?" and states, "Knowing how much a sample statistic typically varies from the truth is one of the most important reasons to study sampling distributions. This concept connects to confidence intervals."
  - proposal: Set importance-connection to required: true with description: "Explains that knowing typical sample-to-sample variability helps judge how close a statistic may be to the truth and supports later confidence intervals or significance tests." Replace scoringGuide.E with: "Response correctly interprets σ_p̂ = 0.065 in the driver's-license context, refers to random samples of size 50, uses typical-variation language, and explains why knowing this variability is useful for statistical inference."

### exitTicket — revise
- **low** (grounding): The optional 10% element states that 200 is less than 10% of all bulbs produced, but the worksheet supplies no population size. A student can only state the needed assumption or conditional check.
  - evidence: The worksheet gives only: "A quality inspector takes a random sample of n = 200 bulbs" and defines the 10% condition as "Sample size must be less than 10% of the population size for the standard deviation formula to apply."
  - proposal: Replace the element with: { "id": "ten-percent-condition", "description": "Notes that the 10% condition cannot be verified from the information given; it holds if the relevant population contains at least 2,000 bulbs (or it is reasonable to assume production is that large)", "required": false }

## ai-grading-prompts-u1-l10.js (grades u1_lesson10_live.html)

### reflect2 — revise
- **medium** (strictness): The rubric requires the blood-pressure context even though the reflection asks for three general Table A procedures and never asks for a contextual example. The three procedures and z-score language already fill a reasonable 2-4 sentence response.
  - evidence: Worksheet prompt: 'Explain how Table A helps you solve three kinds of normal-distribution problems: area to the right, area between two values, and working backward from an area to a cutoff value. Use z-score language in your response.'
  - proposal: Change context to required:false. Replace scoringGuide.E with: 'Response accurately explains all three Table A strategies and correctly connects them to z-scores; a correct contextual example may strengthen the explanation but is not required.'

## ai-grading-prompts-u2-l6.js (grades u2_lesson6_live.html)

### reflect1 — revise
- **medium** (scoring): The decimal-possible element is required even though the question only asks why the result is a prediction, and scoringGuide.E does not require a decimal explanation. A correct explanation that y-hat is a model estimate could be denied E for omitting this unasked lesson detail.
  - evidence: Worksheet prompt: 'How do slope, y-intercept, and x-value work together in y-hat = a + bx, and why is the result only a prediction?' The worksheet separately notes: 'The answer 75.3 can be a decimal because it is a prediction.'
  - proposal: Change decimal-possible to required:false; keep predicted-response required:true.

## ai-grading-prompts-u2-l8.js (grades u2_lesson8_live.html)

### reflect3 — revise
- **medium** (strictness): The rubric makes the identity r squared equals correlation squared mandatory even though the reflection asks what r squared tells you and how to locate slope and intercept in output. That identity is lesson content, but it is not necessary to answer either requested task and is absent from scoringGuide.E's essential summary.
  - evidence: Worksheet prompt: 'What does r squared tell you about a regression model, and how can you identify the slope and y-intercept from computer output?'
  - proposal: Change r-squared-equals-r-squared to required:false.

## ai-grading-prompts-u2-l9.js (grades u2_lesson9_live.html)

### reflect2 — revise
- **medium** (strictness): The reflection asks when to transform and what evidence shows improvement, but the rubric additionally requires an explanation of how a log transformation reduces right skew. That detail is grounded in the lesson yet not necessary to answer the stated question, and scoringGuide.E does not make it essential.
  - evidence: Worksheet prompt: 'When should statisticians consider transforming bivariate data, and what evidence suggests the transformed model is better?'
  - proposal: Change log-skew to required:false.

## ai-grading-prompts-u3-l5.js (grades u3_lesson5_live.html)

### reflect2 — revise
- **medium** (strictness): The rubric separately requires an explanation that randomization balances confounders, although the reflection asks students to distinguish the designs, explain blocking, and say how treatments are assigned. The E guide does not require this extra benefit either.
  - evidence: Worksheet prompt: "Explain the difference between a completely randomized design and a randomized block design. Include what blocking does and how treatments are assigned in each design."
  - proposal: Replace the element with: { "id": "randomization-benefit", "description": "May explain that random assignment helps balance confounding or uncontrolled variables between treatment groups", "required": false }.

## ai-grading-prompts-u4-l3.js (grades u4_lesson3_live.html)

### reflect3 — revise
- **medium** (grounding): The required claim that the percentage "generalizes to any sample size" is stronger than the lesson and can imply that 20% should occur in every finite sample. The worksheet teaches approximate relative frequency in the long run.
  - evidence: Worksheet: "The probability of an event in a repeatable situation can be interpreted as the relative frequency with which the event will occur in the long run."
  - proposal: Replace the element with: { "id": "generalizability", "description": "Explains that the proportion communicates an approximate long-run rate and can support predictions over many future selections, unlike a raw count tied to the 2,105 observed sales", "required": true }.

## ai-grading-prompts-u4-l9.js (grades u4_lesson9_live.html)

### reflect1 — revise
- **medium** (scoring): The I guide says any wrong numeric answer is Incorrect, even when a student correctly identifies that variances add and merely makes an arithmetic slip. That overlaps with the P guide's partial conceptual credit.
  - evidence: Worksheet separates the method into: "variances ADD" and then "take square root"; the reflection asks students to "Explain the error ... and calculate the correct answer."
  - proposal: Replace the guide with: { "E": "Identifies that SDs were added incorrectly, states that independent variances add, and obtains 5", "P": "Uses the correct variance-addition method but makes a minor arithmetic error, or obtains 5 with an incomplete explanation", "I": "Adds the standard deviations directly or otherwise shows no correct variance-based method" }.

## ai-grading-prompts-u4.js (grades )

### exitTicket — revise
- **medium** (scoring): many-trials is marked optional, but the E guide requires repeating and a simulation cannot estimate a probability from one trial. The required flags and E standard therefore disagree.
  - evidence: Worksheet simulation procedure: "Perform many trials of the simulation" and "Calculate the relative frequency of successful trials."
  - proposal: Replace the element with: { "id": "many-trials", "description": "Repeat the five-question trial many times and use the proportion with at least 3 correct as the probability estimate", "required": true }.

## ai-grading-prompts-u5-l1-2.js (grades u5_lesson1-2_live.html)

### exitTicket — revise
- **medium** (strictness): The E guide requires an interpretation of the Brand Y probability even though part (c) asks only for the probability and no interpretation element is required. This can deny E to a response that fully answers the stated parts.
  - evidence: The worksheet asks: "(c) What is the probability that a randomly selected bag of Brand Y actually weighs more than a bag of Brand X?"
  - proposal: Replace scoringGuide.E with: "Correctly answers all three parts, shows the requested Z-score work, correctly finds the parameters of the difference distribution (especially adding variances), and obtains the correct probability that Brand Y weighs more."

## ai-grading-prompts-u5-l3.js (grades u5_lesson3_live.html)

### reflect2 — revise
- **medium** (scoring): The larger-probability contrast is marked optional even though the question explicitly asks for it and the E guide requires it.
  - evidence: The worksheet asks: "What would a larger probability (like 0.30) have suggested instead?"
  - proposal: Replace the element with: { "id": "larger-probability-contrast", "description": "Explains that 0.30 would mean a result at least this extreme is fairly common under chance alone and would not provide convincing evidence that melatonin is effective", "required": true }

## ai-grading-prompts-u5-l6.js (grades u5_lesson6_live.html)

### exitTicket — revise
- **medium** (scoring): The SD interpretation and unusual/not-unusual conclusion are marked optional, but both are explicitly requested and both are required by the E guide.
  - evidence: The worksheet asks: "Find the mean and SD ... Interpret both in context" and "Would it be unusual to get a sample difference of 0 or less ...? ... interpret your answer."
  - proposal: Change sd-interpretation and unusual-conclusion to required: true. Keep their existing descriptions.

## ai-grading-prompts-u6-l10.js (grades u6_lesson10_live.html)

### exitTicket — revise
- **medium** (grounding): The conditions element cites random samples, 10%, and large counts but omits the required independence between the two samples/populations.
  - evidence: The worksheet's Essential Knowledge says: "Check independence and large-count conditions before inference" and VAR-6.J is "Verify conditions for making inferences when testing a difference of two population proportions."
  - proposal: Replace the element with: { "id": "conditions-conclusion", "description": "Concludes conditions are met by noting that the two random samples are from separate app groups and are treated as independent, citing the given 10% condition, and verifying the pooled expected counts", "required": true }

## ai-grading-prompts-u6-l8.js (grades u6_lesson8_live.html)

### reflect1 — revise
- **medium** (grounding): Calling the parks 'large' does not numerically verify that 210 and 190 are at most 10% of their tree populations. The rubric should accept a conditional verification rather than assert the condition as fact.
  - evidence: The worksheet gives "two large parks" but no tree-population totals, while UNC-4.J requires students to "Verify independence, the 10% condition when appropriate, and the large counts condition."
  - proposal: Replace ten-percent with: { "id": "ten-percent", "description": "States that the 10% condition requires Park A to contain at least 2,100 trees and Park B at least 1,900 trees; the word 'large' makes this plausible but does not provide exact totals", "required": true }. Replace conclusion with: { "id": "conclusion", "description": "Concludes that the two-sample z-interval is appropriate provided the stated 10% population-size requirements hold", "required": true }.

## ai-grading-prompts-u7-l1.js (grades u7_lesson1_live.html)

### reflect1 — revise
- **medium** (strictness): The prompt asks for the observed evidence and the two explanations, and the E guide names those same essentials, but expected-zero is separately required. A concise answer can fully identify $12.49, chance variation, and a real wording effect without explicitly stating that the null-model expected difference is 0; the current all-required rule would deny E despite satisfying the question and E guide.
  - evidence: Worksheet prompt: "explain what the evidence for the claim is and describe the two possible explanations for that evidence."
  - proposal: {"id":"expected-zero","description":"May explain that if wording made no difference, the expected difference in means would be 0","required":false}

## ai-grading-prompts-u7-l2.js (grades u7_lesson2_live.html)

### exitTicket — revise
- **medium** (grounding): Part (a) asks why the conditions are met, and this lesson explicitly teaches randomization, the 10% condition, and shape. The rubric requires the random and large-sample checks but omits the 10% condition, so an E can be awarded to an incomplete condition check.
  - evidence: Worksheet objective: "Verify the randomization, 10% condition, and shape condition for a one-sample t-interval." Exit prompt: "explain why the conditions are met."
  - proposal: Add {"id":"ten-percent","description":"States that it is reasonable that 40 crabs is no more than 10% of all fiddler crabs of this species","required":true}.

## ai-grading-prompts-u7-l5.js (grades u7_lesson5_live.html)

### reflect1 — revise
- **medium** (strictness): The worksheet explicitly asks for the formula, degrees of freedom, tail logic, and technology/Table B use, but the rubric additionally makes four exact example statistics and P-values independently mandatory. A correct short explanation using both examples' sidedness and degrees of freedom can answer the prompt without reproducing every decimal.
  - evidence: Worksheet prompt: "describe the formula, the degrees of freedom, how the alternative hypothesis determines the tail area, and how technology or Table B can be used."
  - proposal: Use {"id":"got-hops-t","description":"May report t = 1.535 with 19 degrees of freedom for Got Hops","required":false}, {"id":"got-hops-p","description":"Uses Got Hops as a two-sided P-value example; the exact decimal is optional","required":true}, {"id":"tread40-t","description":"May report t = 6.491 with 34 degrees of freedom for Tread40","required":false}, and {"id":"tread40-p","description":"Uses Tread40 as a right-tail P-value example; the exact decimal is optional","required":true}.

## ai-grading-prompts-u7-l6.js (grades u7_lesson6_live.html)

### reflect1 — revise
- **medium** (grounding): The rubric repeats the worksheet's "greater than 30" cutoff, but the AP classroom large-sample convention is that each sample size is at least 30. As written, a student correctly treating n = 30 as meeting the rule could be penalized.
  - evidence: Worksheet essential knowledge: "If both sample sizes are greater than 30, the sampling distribution ... is approximately normal."
  - proposal: Explains that both sample sizes must be at least 30, or otherwise both sample distributions should be free from extreme skewness and outliers

## ai-grading-prompts-u8-l2.js (grades u8_lesson2_live.html)

### reflect2 — revise
- **medium** (grounding): The rubric and this worksheet use "greater than 5," which excludes an expected count exactly equal to 5. The AP chi-square large-counts convention is that all expected counts are at least 5; Unit 8 Lesson 6 uses that correct wording.
  - evidence: This worksheet says "all expected counts greater than 5"; u8_lesson6 exit ticket says "expected counts at least 5."
  - proposal: States that all expected counts must be at least 5

## ai-grading-prompts-u9-l3.js (grades u9_lesson3_live.html)

### exitTicket — revise
- **medium** (grounding): The required procedure is called a "one-sample t interval for the slope beta." That is nonstandard AP terminology and can penalize the correct procedure name, "t-interval for the slope of a population regression line."
  - evidence: Worksheet learning objective: "Construct, calculate, and interpret a confidence interval for slope from regression output." U9L2 vocabulary: "t-Interval for the Slope — The confidence interval procedure used for estimating the slope of a population regression line."
  - proposal: Identifies the procedure as a t-interval for the slope of a population regression line and notes that conditions are assumed met

## ai-grading-prompts-u6-l1-2.js (grades u6_lesson1-2_live.html)

### reflect2 — revise
- **low** (scoring): The E guide says a proper interval interpretation must reference both the sample and population. The worksheet's requested confidence statement is about the population proportion; requiring a reference to the sample is unnecessary and may penalize a standard AP interpretation.
  - evidence: The worksheet asks for an interpretation using: "We are 95% confident that…" for "the proportion of all students who have received the flu vaccine."
  - proposal: Replace scoringGuide.E with: "Correctly verifies all three conditions with calculations in context, computes the confidence interval with the correct standard error and z*, and gives a proper interpretation naming the population proportion of all students at the school who have received the flu vaccine."

## ai-grading-prompts-u6-l11.js (grades u6_lesson11_live.html)

### reflect1 — revise
- **low** (scoring): Using the azithromycin/placebo context is optional even though the prompt explicitly requests a contextual p-value interpretation and the E guide requires one.
  - evidence: The worksheet asks: "Then interpret the p-value in context" for the "pink-eye eye-drop study."
  - proposal: Replace the element with: { "id": "context-language", "description": "Uses the context of azithromycin and placebo cure proportions for patients like those in the study", "required": true }

## ai-grading-prompts-u6-l7.js (grades u6_lesson7_live.html)

### reflect2 — revise
- **low** (strictness): A required element is phrased as the absence of a misconception rather than content the student was asked to state. A correct contextual power interpretation already demonstrates that power is not P(H0 is false); students should not have to add an unsolicited negation for E.
  - evidence: The worksheet asks students to "Explain what this power means in context, find the probability of a Type II error, and name one change that would increase the power"; it does not ask them to refute an H0-probability misconception.
  - proposal: Replace the element with: { "id": "not-h0-probability", "description": "Does not confuse power with the probability that H0 is false or the probability that the study is correct", "required": false }

## ai-grading-prompts-u7-l3.js (grades u7_lesson3_live.html)

### reflect1 — revise
- **low** (strictness): The conceptual reflection asks students to use the two examples to explain inside-versus-all-above reasoning. Requiring both full numerical interval endpoints is more specific than necessary for an essentially correct 2–4 sentence explanation; the comparison values and interval locations are the essential ideas.
  - evidence: Worksheet prompt: "Include what it means when a claimed value is inside the interval and what it means when the entire interval is above the comparison value."
  - proposal: Replace sugar-interval with "Uses the powdered sugar example to explain that 907 is inside its confidence interval (exact endpoints are not required)"; replace crab-example with "Uses the fiddler crab example to explain that its interval is entirely above 60 scoops per 30 seconds (exact endpoints are not required)".

