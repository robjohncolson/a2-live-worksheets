// Auto-generated hand-authored MCQ supplement for Algebra 2 formulas not covered
// by the main EMBEDDED_CURRICULUM bank. Each probe targets a specific formula id
// from Formula Defense (tmux-trainer/ap-stats-cartridge.js).
//
// Loaded by study_guide_diagnostic.html alongside ../curriculum_render/data/curriculum.js.
// Each entry has an extra `formulaId` field linking it back to the formula.
//
// Schema matches EMBEDDED_CURRICULUM: {id, type, prompt, answerKey, attachments:{choices:[{key,value}]}}

const EMBEDDED_CURRICULUM_SUPPLEMENT = [
  {
    "id": "U4-L9-QS1",
    "type": "multiple-choice",
    "formulaId": "lincomb-mean",
    "prompt": "A coffee shop sells small drinks (X) and large drinks (Y). Mean daily small sales: 42 cups (SD 6). Mean daily large sales: 30 cups (SD 5). Total revenue is T = 3X + 5Y dollars. What is the mean of T, assuming X and Y are NOT independent?",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "$72, because I ignored the coefficients and just added the raw means: 42 + 30 = 72." },
        { "key": "B", "value": "$300, because 5(42) + 3(30) = 210 + 90 (with the coefficients swapped)." },
        { "key": "C", "value": "$276, because E(3X + 5Y) = 3E(X) + 5E(Y) = 3(42) + 5(30) = 276, regardless of independence." },
        { "key": "D", "value": "Cannot be determined without knowing whether X and Y are independent." },
        { "key": "E", "value": "$138, because I averaged the two products instead of summing them: (126 + 150) / 2 = 138." }
      ]
    },
    "reasoning": "Linearity of expectation: E(aX + bY) = aE(X) + bE(Y) always holds, even when X and Y are dependent. Independence is only required for the variance formula, not the mean. 3(42) + 5(30) = 126 + 150 = 276."
  },
  {
    "id": "U9-L2-QS1",
    "type": "multiple-choice",
    "formulaId": "slope-mean",
    "prompt": "A researcher repeatedly takes random samples of size n = 25 from a large population and fits the least-squares regression line for each sample, recording the slope b. If the true population regression slope is β = 2.5, what does the theoretical sampling distribution predict for the mean of all the sample slopes b?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "0, because regression slopes are centered at zero under H₀." },
        { "key": "B", "value": "2.5, because the mean of the sampling distribution of b equals the true population slope β." },
        { "key": "C", "value": "2.5 / √25 = 0.5, because the mean shrinks with sample size." },
        { "key": "D", "value": "It depends on the standard deviation of the residuals." },
        { "key": "E", "value": "Cannot be determined without knowing the correlation r." }
      ]
    },
    "reasoning": "The least-squares slope b is an unbiased estimator of the population slope β. So μ_b = β = 2.5. Sample size affects spread (SE), not center."
  },
  {
    "id": "U9-L2-QS2",
    "type": "multiple-choice",
    "formulaId": "slope-sd",
    "prompt": "Which of the following correctly distinguishes σ_b (the true standard deviation of the sampling distribution of the slope) from SE(b) (the standard error computed from a single sample)?",
    "answerKey": "A",
    "attachments": {
      "choices": [
        { "key": "A", "value": "σ_b uses the population residual standard deviation σ, while SE(b) substitutes the sample residual standard deviation s. σ_b is theoretical; SE(b) is what we can actually compute." },
        { "key": "B", "value": "σ_b and SE(b) are always identical; the notation is just a stylistic difference." },
        { "key": "C", "value": "σ_b depends on the true slope β, while SE(b) does not." },
        { "key": "D", "value": "SE(b) is always larger than σ_b because sample estimates add uncertainty." },
        { "key": "E", "value": "σ_b = SE(b) / √n for large samples." }
      ]
    },
    "reasoning": "In the sampling distribution of the regression slope, σ_b = σ / (σ_x √n) where σ is the population residual SD (unknown in practice). SE(b) = s / (s_x √n) uses the sample residual SD s — that's why we use a t-distribution rather than z: we're using an estimate, not the true value."
  },
  {
    "id": "U9-L1-QS1",
    "type": "multiple-choice",
    "formulaId": "resid-s",
    "prompt": "A regression of weight (lb) on height (in) for n = 12 adults produces Σ(y − ŷ)² = 250. What is s, the standard deviation of the residuals, used in the regression t-test for the slope?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "√(250/12) ≈ 4.56" },
        { "key": "B", "value": "√(250/10) = 5.00" },
        { "key": "C", "value": "√(250/11) ≈ 4.77" },
        { "key": "D", "value": "250/10 = 25.0" },
        { "key": "E", "value": "250, the sum of squared residuals itself." }
      ]
    },
    "reasoning": "s = √(SSE / (n − 2)) = √(250 / 10) = √25 = 5.00. Degrees of freedom is n − 2 for simple linear regression because we estimated two parameters (slope and intercept)."
  },
  {
    "id": "U8-L5-QS1",
    "type": "multiple-choice",
    "formulaId": "std-resid-chi",
    "prompt": "In a chi-square test of independence, one cell of the two-way table has observed count O = 85 and expected count E = 64. The standardized residual for this cell, given by (O − E)/√E, is:",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "21/64 ≈ 0.33" },
        { "key": "B", "value": "21/√85 ≈ 2.28" },
        { "key": "C", "value": "21/√64 = 2.625" },
        { "key": "D", "value": "441/64 ≈ 6.89 (this is the cell's contribution to χ²)" },
        { "key": "E", "value": "21, the raw residual." }
      ]
    },
    "reasoning": "Standardized residual = (O − E)/√E = (85 − 64)/√64 = 21/8 = 2.625. Values with |standardized residual| > 2 indicate cells contributing meaningfully to the chi-square statistic. Choice D is the cell's contribution to χ² = (O−E)²/E, a different quantity."
  },
  {
    "id": "U6-L6-QS1",
    "type": "multiple-choice",
    "formulaId": "power",
    "prompt": "A researcher tests H₀: p = 0.5 vs H_a: p > 0.5 at α = 0.05. If the true population proportion is actually p = 0.60 and the probability of a Type II error at that true value is β = 0.28, what is the power of the test?",
    "answerKey": "D",
    "attachments": {
      "choices": [
        { "key": "A", "value": "0.05, the significance level." },
        { "key": "B", "value": "0.28, the probability of a Type II error." },
        { "key": "C", "value": "0.95, one minus the significance level." },
        { "key": "D", "value": "0.72, because Power = 1 − β = 1 − 0.28." },
        { "key": "E", "value": "Cannot be determined without the sample size." }
      ]
    },
    "reasoning": "Power is the probability of rejecting H₀ when H_a is actually true, so here it is the chance the researcher correctly detects that p is greater than 0.5 when the true proportion is 0.60. The formula connection is Power = P(reject H₀ | H_a true) = 1 − β, so the power is 1 − 0.28 = 0.72. Choice B is β itself, which is the chance of missing the real increase, and Choice C confuses power with 1 − α rather than 1 − β. On the AP exam, power should be interpreted in context as the chance the test detects a real effect, not just as a memorized arithmetic rule."
  },
  {
    "id": "U6-L6-QS2",
    "type": "multiple-choice",
    "formulaId": "power",
    "prompt": "A polling firm tests H₀: p = 0.30 vs H_a: p > 0.30, where p is the proportion of voters who support a school bond. The firm wants more power to detect a true support level of p = 0.38. Which change would increase the power of the test?",
    "answerKey": "D",
    "attachments": {
      "choices": [
        { "key": "A", "value": "Reduce the sample size from 200 voters to 80 voters." },
        { "key": "B", "value": "Lower the significance level from α = 0.05 to α = 0.01." },
        { "key": "C", "value": "Replace the alternative with H_a: p ≠ 0.30." },
        { "key": "D", "value": "Increase the sample size from 200 voters to 500 voters." },
        { "key": "E", "value": "Keep everything the same, because power is always 1 − α." }
      ]
    },
    "reasoning": "Power is the probability of rejecting H₀ when H_a is true, so here it means catching that support is really 38% instead of 30%. Increasing the sample size reduces sampling variability, which lowers β and therefore raises power because Power = 1 − β = P(reject H₀ | H_a true). Choice B goes the wrong direction because lowering α makes rejection harder, and Choice C also lowers power at the same α because a two-sided rejection rule splits α between two tails, making it harder to detect a specific upward shift; Choice E confuses power with 1 − α instead of 1 − β. At fixed α and effect size, the standard levers for raising power are a larger n, a larger true effect, a larger α, or a one-sided alternative that matches the direction of interest."
  },
  {
    "id": "U6-L6-QS3",
    "type": "multiple-choice",
    "formulaId": "power",
    "prompt": "A clinic studies a new screening test using H₀: sensitivity = 0.70 vs H_a: sensitivity > 0.70. If the true sensitivity is 0.85, the testing procedure has power 0.92. Which statement best interprets that power?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "There is a 92% chance that H₀ is true." },
        { "key": "B", "value": "There is a 92% chance the clinic will reject H₀ and conclude the sensitivity exceeds 0.70 when the true sensitivity is 0.85." },
        { "key": "C", "value": "There is an 8% chance of a Type I error when the sensitivity is 0.70." },
        { "key": "D", "value": "There is a 92% chance every patient will be classified correctly." },
        { "key": "E", "value": "There is a 92% chance the sample sensitivity will equal 0.85 exactly." }
      ]
    },
    "reasoning": "Power is the probability of rejecting H₀ when H_a is true, so in this setting it is the chance the clinic correctly detects that the screening sensitivity is above 0.70 when the true sensitivity is 0.85. The formula link is Power = P(reject H₀ | H_a true) = 1 − β, which is why a power of 0.92 means the procedure detects the improvement 92% of the time at that true value. Choice A wrongly treats power as the probability the null is true, and Choice C confuses power with α or the Type I error rate. Full-credit power interpretations name both the rejection decision and the specific true alternative value, so tie the 92% directly to rejecting H₀ when sensitivity really is 0.85."
  },
  {
    "id": "U7-L2-QS1",
    "type": "multiple-choice",
    "formulaId": "margin-error",
    "prompt": "A 95% confidence interval for a population mean is built from a sample with x̄ = 48, sample standard deviation s = 7, and n = 16. The critical value is t* = 2.131. What is the margin of error?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "1.75, the standard error by itself." },
        { "key": "B", "value": "3.73, because ME = t* · SE = 2.131 · (7/√16) = 2.131 · 1.75." },
        { "key": "C", "value": "2.131, the critical value by itself." },
        { "key": "D", "value": "48 ± 3.73, the full confidence interval." },
        { "key": "E", "value": "7, the sample standard deviation." }
      ]
    },
    "reasoning": "Margin of error = critical value × standard error. SE = s/√n = 7/4 = 1.75. ME = 2.131 × 1.75 ≈ 3.73. The full CI is x̄ ± ME = 48 ± 3.73, but the ME itself is just 3.73."
  },
  {
    "id": "U6-L4-QS1",
    "type": "multiple-choice",
    "formulaId": "width-ci",
    "prompt": "A political pollster wants to estimate the proportion of voters who support a ballot measure with 95% confidence and a margin of error of at most 3 percentage points (0.03). A conservative estimate uses p-hat = 0.5 to maximize the needed sample size. Using z* = 1.96, what is the minimum sample size required?",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "1067, because the formula gives 1067.11 and I rounded down to 1067 instead of always rounding up." },
        { "key": "B", "value": "2135, because I used p-hat(1 - p-hat) = 0.5 instead of 0.25: (1.96/0.03)^2 * 0.5 = 2134.22, round up." },
        { "key": "C", "value": "1068, because n >= (1.96/0.03)^2 times 0.5 times 0.5 = 1067.11 and we round up." },
        { "key": "D", "value": "33, because 1.96/0.03 times 0.5 is about 33." },
        { "key": "E", "value": "385, using p-hat = 0.1 instead of 0.5." }
      ]
    },
    "reasoning": "For a proportion CI: n >= (z*/ME)^2 * p-hat(1 - p-hat). Using the conservative p-hat = 0.5: n >= (1.96/0.03)^2 * 0.25 = 4268.4 * 0.25 = 1067.11. Always round UP: n = 1068."
  },
  {
    "id": "U6-L4-QS2",
    "type": "multiple-choice",
    "formulaId": "type-i-error",
    "prompt": "A pharmaceutical company tests H₀: the new drug is no more effective than placebo vs H_a: the new drug is more effective than placebo, at α = 0.01. In context, a Type I error occurs when:",
    "answerKey": "A",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The company concludes the drug IS more effective than placebo, when in truth it is not." },
        { "key": "B", "value": "The company concludes the drug is not more effective than placebo, when in truth it is." },
        { "key": "C", "value": "α = 0.01 means there is a 1% chance the drug actually works." },
        { "key": "D", "value": "The probability of this error is β, not α." },
        { "key": "E", "value": "The drug effect is smaller than the researchers expected." }
      ]
    },
    "reasoning": "Type I error means rejecting H₀ when H₀ is actually true; in this drug study, that means claiming the new drug is more effective than placebo when it really is not. The formula connection is α = P(Type I error | H₀ true), so the 0.01 level controls the chance of falsely declaring a benefit when the null statement of 'no more effective than placebo' is true. Choice B is the mirror mistake, a Type II error, because it misses a drug that really is better, and Choice C wrongly treats α as the probability the drug actually works. On AP questions, earn the point by stating the error in the study's language about drug effectiveness, not just by saying 'reject H₀ by mistake.'"
  },
  {
    "id": "U6-L4-QS3",
    "type": "multiple-choice",
    "formulaId": "type-ii-error",
    "prompt": "A factory inspector tests H₀: bolts meet the minimum strength specification vs H_a: bolts do NOT meet the specification. In context, a Type II error occurs when:",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The inspector concludes the bolts do not meet specification, when in truth they do." },
        { "key": "B", "value": "The inspector concludes the bolts meet specification, when in truth they do not." },
        { "key": "C", "value": "Both H₀ and H_a are true at the same time." },
        { "key": "D", "value": "α is the probability of this error." },
        { "key": "E", "value": "The inspector rejects H₀ too quickly." }
      ]
    },
    "reasoning": "Type II error means failing to reject H₀ when H₀ is false; here, it means the inspector lets the bolts pass as meeting the strength specification when they actually do not. The formula connection is β = P(Type II error | H_a true), and power is 1 − β, the chance the inspection correctly catches weak bolts. Choice A is a Type I error because it wrongly rejects bolts that really do meet spec, and Choice D confuses β with α, the probability of rejecting a true null. On the AP exam, describe the error in context, such as defective bolts being accepted, rather than writing only generic hypothesis-testing language."
  },
  {
    "id": "U6-L4-QS4",
    "type": "multiple-choice",
    "formulaId": "type-i-error",
    "prompt": "In a criminal trial, let H₀: the defendant is innocent and H_a: the defendant is guilty. In context, a Type I error occurs when:",
    "answerKey": "A",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The jury convicts the defendant when the defendant is actually innocent." },
        { "key": "B", "value": "The jury acquits the defendant when the defendant is actually guilty." },
        { "key": "C", "value": "The probability that the defendant is innocent is α." },
        { "key": "D", "value": "Both a Type I error and a Type II error happen in the same verdict." },
        { "key": "E", "value": "The probability of this error is β, not α." }
      ]
    },
    "reasoning": "Type I error means rejecting H₀ when H₀ is true, so in a trial it means rejecting 'the defendant is innocent' and convicting an innocent person. The formula connection is α = P(Type I error | H₀ true), so α is the chance of a wrongful conviction under the null of innocence. Choice B is the Type II mirror because it fails to convict when guilt is true, and Choice C incorrectly turns α into the probability the defendant is innocent. Full-credit FRQ responses describe the mistake in the courtroom's own words — 'convicting an innocent defendant' — rather than the generic 'rejecting a true H₀.'"
  },
  {
    "id": "U6-L4-QS5",
    "type": "multiple-choice",
    "formulaId": "type-i-error",
    "prompt": "A hospital uses a screening rule to test H₀: a patient does not have the disease vs H_a: a patient has the disease. The procedure is run at α = 0.05. What does α = 0.05 mean in this setting?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "There is a 5% chance that a patient who tests positive actually has no disease." },
        { "key": "B", "value": "There is a 5% chance the hospital will conclude a patient has the disease when the patient actually does not." },
        { "key": "C", "value": "There is a 5% chance that H₀ is true for any patient." },
        { "key": "D", "value": "There is a 5% chance the screening result is wrong for all patients combined." },
        { "key": "E", "value": "There is a 5% chance the alternative hypothesis is false." }
      ]
    },
    "reasoning": "Type I error means rejecting H₀ when H₀ is true, so in this medical screening setting it means telling a healthy patient that the patient has the disease. The formula link is α = P(Type I error | H₀ true), so α = 0.05 means a 5% false-positive rate among patients who truly do not have the disease. Choice C wrongly treats α as the probability H₀ is true, and Choice D turns α into an overall percentage of all wrong results, which hypothesis tests do not provide. The biggest trap is reading α backwards as P(disease | positive) or as the probability H₀ is true; always read it as the conditional P(positive conclusion | healthy patient)."
  },
  {
    "id": "U6-L4-QS6",
    "type": "multiple-choice",
    "formulaId": "type-ii-error",
    "prompt": "An automated smoke detector is designed around H₀: there is no fire in the room vs H_a: there is a fire in the room. In context, a Type II error occurs when:",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The alarm sounds when there is no fire." },
        { "key": "B", "value": "The alarm stays silent when there is actually a fire." },
        { "key": "C", "value": "The probability of this error is α." },
        { "key": "D", "value": "Both 'fire' and 'no fire' are true at the same time." },
        { "key": "E", "value": "The alarm stays silent when there is no fire in the room." }
      ]
    },
    "reasoning": "Type II error means failing to reject H₀ when H_a is actually true, so here it means the detector misses a real fire and stays silent. The formula connection is β = P(Type II error | H_a true), while power is 1 − β, the chance the alarm correctly goes off when there is a fire. Choice A is a Type I error because the alarm sounds when no fire exists, Choice C confuses β with α, and Choice E describes the correct non-rejection of H₀ when H₀ is actually true, so it is not an error at all. Free-response rubrics penalize generic wording: write the Type II event as 'the alarm fails to sound during an actual fire' rather than 'failing to reject H₀ when H_a is true.'"
  },
  {
    "id": "U6-L4-QS7",
    "type": "multiple-choice",
    "formulaId": "type-ii-error",
    "prompt": "A quality-control engineer tests H₀: the mean fill volume is 16 ounces vs H_a: the mean fill volume is less than 16 ounces. The true mean is actually 15.7 ounces, and the sample size stays fixed. If the engineer lowers the significance level from α = 0.05 to α = 0.01, what happens to β?",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "β decreases because a smaller α makes the test more reliable." },
        { "key": "B", "value": "β stays exactly the same because the hypotheses did not change." },
        { "key": "C", "value": "β increases because it becomes harder to reject H₀, so missing the real underfill becomes more likely." },
        { "key": "D", "value": "β becomes 0.01 because β always equals α." },
        { "key": "E", "value": "β becomes 1 − α = 0.99." }
      ]
    },
    "reasoning": "Type II error means failing to reject H₀ when H_a is true, so in this setting it means missing the real underfill and concluding the bottles still average 16 ounces. Because β = P(Type II error | H_a true) and power is 1 − β, lowering α makes the rejection rule stricter, so β usually increases when the sample size and effect size stay fixed. Choice A has the direction backwards, and Choices D and E confuse β with α or 1 − α rather than its own probability under the alternative. Commit the standard tradeoff to memory: at fixed n and effect size, decreasing α increases β, while increasing n tends to decrease β."
  }
];

if (typeof window !== 'undefined') {
  window.EMBEDDED_CURRICULUM_SUPPLEMENT = EMBEDDED_CURRICULUM_SUPPLEMENT;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EMBEDDED_CURRICULUM_SUPPLEMENT };
}
