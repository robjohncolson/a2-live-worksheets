# Blooket Deck Content Review — 2026-08-18

> **Applied 2026-08-18** (commit after 0646fb4): all rewrites, merges and drops below were applied to the CSVs; the two answer-key fixes landed in 0646fb4. Two agent proposals had the key in the wrong slot and were corrected by hand before applying (u8_l5 q2 → "separate samples… across populations"; u6_l9 q16 → "entirely below 0"). Dropped cards keep their numbering gaps (card identity is csv#qnum) and their difficulty tags were pruned.

Generated from `node scripts/lint-blooket-deck.mjs` findings, each checked against the live worksheet the deck derives from. **No deck has been edited.** Each item is a proposal for the teacher.

| | count |
|---|---|
| wrong answer keys | 3 |
| rewrite | 32 |
| merge | 17 |
| drop | 7 |
| keep | 85 |

## Fix first — wrong answer keys

- **u4_l6_blooket.csv q40** — ANSWER KEY BUG: the CSV marks choice 2 'All events' correct, but the worksheet says the simplified rule is for independent events only, so the key must be changed to choice 1; the rewrite also removes q5's leaked formula.
- **u4_lesson6_blooket.csv q40** — ANSWER KEY BUG: the CSV marks choice 2 'All events' correct, but the worksheet says the simplified rule is for independent events only, so the key must be changed to choice 1; the rewrite also removes q5's leaked formula.
- **u6_l6_blooket.csv q6** — The sibling pairing with q5 (p=0.03 reject vs p=0.12 fail to reject) is intentional and fine, BUT the answer key is WRONG: Correct Answer(s) is 2 ('Reject H0') when the worksheet rule makes choice 1 ('Fail to reject H0 because 0.12 > 0.05') correct — the key must be changed to 1; stem and choices can stay as-is.

## u4_l3_l4_l5_blooket.csv (from u4_lesson3-4-5_live.html)

### q12 — rewrite (answerInStem)
- Current: A valid probability can equal 0.75. TRUE or FALSE?
  - choices: TRUE | FALSE | Only for rare events | Only for common events → **TRUE**
- Proposed: Which of these values could be a probability?
  - choices: 0.75 | 1.25 | -0.25 | 1.5 → **0.75**
- Why: The T/F lint hit is a false positive on its own, but q12/q13/q14 all test the 0-to-1 rule; folding the three into one multiple-choice card removes the sibling cluster and the T/F format.
- Worksheet: “A probability is always a number between [0] and [1], inclusive.”

### q13 — merge (answerInStem, siblingStem)
- Current: A valid probability can equal 1.25. TRUE or FALSE?
  - choices: TRUE | FALSE | Only for certain events | Only with large samples → **FALSE**
- Why: T/F format is a false positive for answerInStem, but this card is absorbed by the rewritten q12 (1.25 becomes a distractor there); drop q13.
- Worksheet: “A probability is always a number between [0] and [1], inclusive.”

### q14 — merge (answerInStem, siblingStem)
- Current: A valid probability can equal -0.25. TRUE or FALSE?
  - choices: TRUE | FALSE | Only for impossible events | Only for complements → **FALSE**
- Why: T/F format is a false positive for answerInStem, but this card is absorbed by the rewritten q12 (-0.25 becomes a distractor there); drop q14.
- Worksheet: “A probability is always a number between [0] and [1], inclusive.”

### q17 — drop (siblingStem)
- Current: A probability of 0.5 means the event is:
  - choices: Certain to occur | Impossible to occur | Equally likely | Very unlikely → **Equally likely**
- Why: Sibling of q15; the worksheet only defines P=0 and P=1 (Q6) and never says 0.5 means 'equally likely', so this card has no worksheet basis.
- Worksheet: no basis found

### q21 — merge (answerInStem, siblingStem)
- Current: P(A') = 1 − P(A). TRUE or FALSE?
  - choices: TRUE | FALSE | Only for independent events | Only for dependent events → **TRUE**
- Why: q20 (1 + P(A), FALSE) and q21 (1 − P(A), TRUE) test the same complement rule; keep q21 (matches the worksheet formula) and drop q20.
- Worksheet: “Complement ... P(A') = 1 - P(A)”

### q26 — merge (answerInStem, siblingStem)
- Current: Mutually exclusive events CANNOT occur at the same time. TRUE or FALSE?
  - choices: TRUE | FALSE | Only in small samples | Only in large samples → **TRUE**
- Why: q25 (CAN, FALSE) and q26 (CANNOT, TRUE) test the same definition; keep q26 (worksheet wording) and drop q25.
- Worksheet: “Mutually exclusive (or disjoint) events cannot occur at the same time.”

### q32 — merge (answerInStem, siblingStem)
- Current: If P(A ∩ B) > 0, A and B are mutually exclusive. TRUE or FALSE?
  - choices: TRUE | FALSE | Only if P(A ∩ B) < 0.05 | Only if P(A ∩ B) > 0.5 → **FALSE**
- Why: q31 (P = 0.15) and q32 (P > 0) test the same iff fact; keep q31 (concrete number, like worksheet Q16's 2/6) and drop q32.
- Worksheet: “Two events are mutually exclusive if, and only if, P(A ∩ B) = 0.”

### q44 — merge (answerInStem, siblingStem)
- Current: P(B|A) means probability of A given B occurred. TRUE or FALSE?
  - choices: TRUE | FALSE | Same as P(A|B) | Depends on context → **FALSE**
- Why: q43 (B given A, TRUE) and q44 (A given B, FALSE) test the same notation reading; keep q43 and drop q44 (q47/q48 already cover the order-matters idea).
- Worksheet: “The notation P(B|A) is read "the probability of B given A."”

### q46 — merge (answerInStem, siblingStem)
- Current: The formula P(B|A) = P(A ∩ B) / P(B) is correct. TRUE or FALSE?
  - choices: TRUE | FALSE | That's P(A|B) | That's the complement → **FALSE**
- Why: q45 (÷P(A), TRUE) and q46 (÷P(B), FALSE) test the same formula; keep q45 and drop q46.
- Worksheet: “Conditional Probability Formula: P(B|A) = P(A ∩ B) / P(A)”

### q50 — merge (answerInStem, siblingStem)
- Current: The multiplication rule: P(A ∩ B) = P(A) + P(B|A). TRUE or FALSE?
  - choices: TRUE | FALSE | That's for union | That's for complement → **FALSE**
- Why: q49 (×, TRUE) and q50 (+, FALSE) test the same rule; keep q49 and drop q50.
- Worksheet: “General Multiplication Rule: P(A ∩ B) = P(A) · P(B|A)”

### q53 — merge (answerInStem, siblingStem)
- Current: After drawing red WITHOUT replacement, P(second red) = 3/9. TRUE or FALSE?
  - choices: TRUE | FALSE | Still 4/10 | Now it's 4/9 → **TRUE**
- Why: q52 (4/10, FALSE) and q53 (3/9, TRUE) test the same marble fact; keep q53 (its 'Still 4/10' distractor covers q52) and drop q52.
- Worksheet: “P(B|A) = probability second marble is red, given first was red = 3/9 (Only 3 red left out of 9 remaining)”

### q58 — rewrite (answerInStem)
- Current: In a two-way table, conditional probability uses the grand total. TRUE or FALSE?
  - choices: TRUE | FALSE | Uses the condition's total | Uses the intersection → **FALSE**
- Proposed: In the Super Status! table (433 students), which probability is found by dividing a cell by the grand total 433?
  - choices: P(Happy ∩ Freeze Time) | P(Rich | Fly) | P(Fly | Rich) | P(Fly | Not Rich) → **P(Happy ∩ Freeze Time)**
- Why: Lint is technically a false positive (both TRUE and FALSE appear in every T/F stem), but the T/F form with filler distractors is weak; a table-grounded MC tests the same denominator idea and separates it from q59.
- Worksheet: “Shortcut with two-way tables: For P(Rich | Fly), focus only on the "Fly" row. The answer is simply 22 out of 89.”

### q60 — drop (answerInStem)
- Current: For P(B|A), the denominator is the grand total. TRUE or FALSE?
  - choices: TRUE | FALSE | It's the condition total | It's P(B) total → **FALSE**
- Why: Lint is a false positive, but this is the negated mirror of q59 (same fact, same distractor set) and adds nothing once q58 is rewritten; drop it.
- Worksheet: “Shortcut with two-way tables: For P(Rich | Fly), focus only on the "Fly" row. The answer is simply 22 out of 89.”

### q61 — rewrite (answerInStem)
- Current: 60 of 100 freshmen like math. P(Math|Freshman) = 60/100. TRUE or FALSE?
  - choices: TRUE | FALSE | Should be 60/200 | Should be 100/60 → **TRUE**
- Proposed: Exit ticket: of 200 students, 100 are freshmen and 45 of those freshmen chose Math (105 chose Math overall). P(Math | Freshman) = ?
  - choices: 45/100 | 45/200 | 100/200 | 105/200 → **45/100**
- Why: Lint is a false positive, but the numbers do not match the worksheet (45 of 100 freshmen chose Math; 60 is the sophomore count); rewrite as an MC using the exit-ticket table.
- Worksheet: “Exit Ticket table: Freshman — Math 45, English 55, Total 100; Sophomore — Math 60, English 40, Total 100; grand total 200. Calculate P(Math | Freshman)”

### q62 — merge (answerInStem, siblingStem)
- Current: 60 of 100 freshmen like math. P(Math|Freshman) = 60/200. TRUE or FALSE?
  - choices: TRUE | FALSE | That's P(Math ∩ Fresh) | Should be 100/200 → **FALSE**
- Why: Mirror of q61 with the same wrong numbers; merge into the rewritten q61 (its 45/200 distractor covers the joint-vs-conditional confusion) and drop q62.
- Worksheet: “Exit Ticket table: Freshman — Math 45, English 55, Total 100; grand total 200. Calculate P(Freshman ∩ Math) — the joint probability.”

### q63 — rewrite (answerInStem)
- Current: P(A ∩ B) and P(A|B) are the same thing. TRUE or FALSE?
  - choices: TRUE | FALSE | Only when P(B) = 1 | Only when P(A) = 1 → **FALSE**
- Proposed: Super Status! table: P(Rich ∩ Fly) = 22/433, the Fly row total is 89 and the Rich column total is 102. Which fraction is P(Rich | Fly)?
  - choices: 22/89 | 22/433 | 89/433 | 22/102 → **22/89**
- Why: Lint is a false positive, but the abstract T/F is weak; a numeric MC from the Super Status! table tests joint vs conditional directly.
- Worksheet: “P(Happy ∩ Freeze Time) = the joint probability = 63 / 433 ... P(Rich | Fly) = P(Rich ∩ Fly) / P(Fly) = (22/433) / (89/433) = 22/89”

### q64 — drop (answerInStem)
- Current: P(A ∩ B) and P(A|B) are different calculations. TRUE or FALSE?
  - choices: TRUE | FALSE | Same formula | Same result always → **TRUE**
- Why: Lint is a false positive, but this is the affirmative mirror of q63 (same fact); once q63 is rewritten this card is redundant.
- Worksheet: “Key Takeaway: The joint probability is the probability of the intersection of two events. ... P(B|A) = P(A ∩ B) / P(A)”

### q65 — rewrite (answerInStem)
- Current: In Venn diagrams, overlapping circles show mutually exclusive events. TRUE or FALSE?
  - choices: TRUE | FALSE | Shows intersection exists | Shows union only → **FALSE**
- Proposed: In a Venn diagram, how are two mutually exclusive events drawn?
  - choices: Two circles that do not touch | Two overlapping circles | One circle inside the other | One circle covering the whole rectangle → **Two circles that do not touch**
- Why: Lint is a false positive, but rewriting as a direct MC on worksheet Q15 is stronger and absorbs its mirror q66.
- Worksheet: “If two events are mutually exclusive, there is no intersection. The Venn diagram shows two circles that do not touch.”

### q66 — merge (answerInStem, siblingStem)
- Current: In Venn diagrams, non-touching circles show mutually exclusive events. TRUE or FALSE?
  - choices: TRUE | FALSE | Shows they overlap | Shows independence → **TRUE**
- Why: Mirror of q65 (same fact); merge into the rewritten q65 and drop q66.
- Worksheet: “If two events are mutually exclusive, there is no intersection. The Venn diagram shows two circles that do not touch.”

### q67 — rewrite (answerInStem)
- Current: A probability distribution must have probabilities summing to 1. TRUE or FALSE?
  - choices: TRUE | FALSE | Can sum to any value | Must sum to 100 → **TRUE**
- Proposed: Record store: the owner computes P(genre) for all six genres and adds them. What total confirms a valid probability distribution?
  - choices: 1 | 0 | 6 | 2105 → **1**
- Why: Lint is a false positive, but a record-store MC grounded in worksheet Q10 is stronger and absorbs its mirror q68.
- Worksheet: “If we calculate the probability for each genre and add them all up, we should get 1. This confirms we have a valid probability distribution.”

### q68 — merge (answerInStem, siblingStem)
- Current: A probability distribution can have probabilities summing to 0.95. TRUE or FALSE?
  - choices: TRUE | FALSE | Rounding error is ok | Must equal exactly 1 → **FALSE**
- Why: Negated mirror of q67 (same fact); merge into the rewritten q67 and drop q68.
- Worksheet: “If we calculate the probability for each genre and add them all up, we should get 1. This confirms we have a valid probability distribution.”

### q69 — rewrite (answerInStem)
- Current: Probability represents long-run relative frequency. TRUE or FALSE?
  - choices: TRUE | FALSE | Only for simulations | Only for calculations → **TRUE**
- Proposed: Record store: P(Jazz) ≈ 0.205. In a repeatable situation like selecting many albums, this probability is best interpreted as:
  - choices: The relative frequency of jazz albums in the long run | The exact number of jazz albums in the next 10 sales | A guarantee that the next album is jazz | The share of jazz albums still on the shelves → **The relative frequency of jazz albums in the long run**
- Why: Lint is a false positive, but the interpretation is a core VAR-4.B objective and deserves a real MC with the misconception distractors (matches R1).
- Worksheet: “The probability of an event in a repeatable situation can be interpreted as the relative frequency with which the event will occur in the long run.”


## u2_l3_blooket.csv (from u2_lesson3_live.html)

### q12 — rewrite (crossCardLeak)
- Current: Why are conditional relative frequencies useful for comparing groups?
  - choices: they make each cell use the same count | they show the table as one whole | they keep each group on its own total | they remove the need for totals → **they keep each group on its own total**
- Proposed: Why compare groups using percents computed within each row or column instead of raw counts?
- Why: The stem contains q11's answer 'conditional relative frequencies'; describing the calculation (percent within a row or column) instead of naming the term removes the leak.
- Worksheet: “Compare distributions of a categorical variable across groups using conditional relative frequencies.”

### q13 — rewrite (crossCardLeak)
- Current: What suggests two categorical variables are associated?
  - choices: the conditional distributions are different | the row totals are all different | the column totals are all different | the marginal totals are equal → **the conditional distributions are different**
- Proposed: What pattern in a two-way table suggests the variables are associated?
- Why: The stem contains q1's answer 'two categorical variables'; rewording to 'the variables in a two-way table' removes the leak.
- Worksheet: “If the conditional distributions are not the same for all groups, that is evidence of an association.”

### q14 — rewrite (siblingStem, crossCardLeak)
- Current: What suggests two categorical variables are not associated?
  - choices: the joint frequencies stay small | the row totals stay fairly large | the column totals stay fairly small | the conditional distributions are similar → **the conditional distributions are similar**
- Proposed: What pattern in a two-way table suggests the variables are not associated?
- Why: The stem contains q1's answer 'two categorical variables'; same fix as q13.
- Worksheet: “If the conditional distributions are not the same for all groups, that is evidence of an association.”


## u4_l6_blooket.csv (from u4_lesson6_live.html)

### q6 — drop (crossCardLeak)
- Current: P(A and B) = P(A) times P(B) is ONLY valid when events are:
  - choices: Mutually exclusive | Independent | Complementary | Conditional → **Independent**
- Why: Prints q5's answer formula verbatim and tests the same fact as q40 (simplified rule applies only to independent events); drop q6 and keep the rewritten q40.
- Worksheet: “Multiplication Rule for Independent Events: General rule: P(A and B) = P(A) · P(B|A); For independent events: P(A and B) = P(A) · P(B)”

### q39 — rewrite (crossCardLeak)
- Current: The general multiplication rule P(A and B) = P(A) times P(B|A) works for:
  - choices: ALL events - whether independent or not | Only independent events | Only mutually exclusive events | Only complementary events → **ALL events - whether independent or not**
- Proposed: The GENERAL multiplication rule, the version that uses the conditional probability P(B|A), applies to which events?
- Why: The formula prefix leaks q5's answer; naming the rule by its conditional term keeps the concept without printing the independent-events formula.
- Worksheet: “General rule: P(A and B) = P(A) · P(B|A); For independent events: P(A and B) = P(A) · P(B)”


## u4_lesson6_blooket.csv (from u4_lesson6_live.html)

### q6 — drop (crossCardLeak)
- Current: P(A and B) = P(A) times P(B) is ONLY valid when events are:
  - choices: Mutually exclusive | Independent | Complementary | Conditional → **Independent**
- Why: Prints q5's answer formula verbatim and tests the same fact as q40 (simplified rule applies only to independent events); drop q6 and keep the rewritten q40.
- Worksheet: “Multiplication Rule for Independent Events: General rule: P(A and B) = P(A) · P(B|A); For independent events: P(A and B) = P(A) · P(B)”

### q39 — rewrite (crossCardLeak)
- Current: The general multiplication rule P(A and B) = P(A) times P(B|A) works for:
  - choices: ALL events - whether independent or not | Only independent events | Only mutually exclusive events | Only complementary events → **ALL events - whether independent or not**
- Proposed: The GENERAL multiplication rule, the version that uses the conditional probability P(B|A), applies to which events?
- Why: The formula prefix leaks q5's answer; naming the rule by its conditional term keeps the concept without printing the independent-events formula.
- Worksheet: “General rule: P(A and B) = P(A) · P(B|A); For independent events: P(A and B) = P(A) · P(B)”


## u2_l2_blooket.csv (from u2_lesson2_live.html)

### q4 — rewrite (crossCardLeak)
- Current: Why use percents within each group before graphing?
  - choices: to hide the original sample sizes | to change categories into numbers | to force each graph to look equal | to compare groups with different sizes → **to compare groups with different sizes**
- Proposed: Why should counts be divided by the group total before comparing groups in a bar graph?
- Why: The stem contains q14's exact answer 'percents within each group'; rewording around dividing by the group total removes the leak.
- Worksheet: “To compare distributions within groups, convert counts to percents by dividing by the group total.”

### q18 — rewrite (crossCardLeak)
- Current: What does association mean for two categorical variables?
  - choices: each category has the same total | one variable causes the other | the bars all have equal width | one variable helps predict the other → **one variable helps predict the other**
- Proposed: In a two-way table setting, what does it mean to say the variables are associated?
- Why: The stem contains q16's answer 'two categorical variables'; asking about the definition of association without that phrase fixes the leak.
- Worksheet: “Association: A relationship in which knowing one categorical variable helps predict another.”


## u4_l1_l2_blooket.csv (from u4_lesson1-2_live.html)

### q6 — rewrite (crossCardLeak)
- Current: A collection of outcomes from a random process is called a(n):
  - choices: Outcome | Trial | Event | Frequency → **Event**
- Proposed: Which term names a set of one or more outcomes grouped together (for example, 'the roll is even')?
- Why: Stem repeats q5's correct definition word-for-word; the paraphrase keeps the definition-to-term direction without handing q5's answer to the student.
- Worksheet: “Event: A collection of outcomes from a random process”

### q46 — drop (siblingStem)
- Current: A probability of 1 means the event is:
  - choices: Certain - it will always happen | Impossible - it can never happen | Rare but possible | The most common outcome → **Certain - it will always happen**
- Why: Neither this card nor sibling q45 (probability of 0) has any grounding in the 4.1-4.2 worksheet, which covers randomness, simulation, and the Law of Large Numbers; drop q46 (and consider q45) as ungrounded.
- Worksheet: no basis found


## u4_l11_blooket.csv (from u4_lesson10-12_live.html)

### q33 — rewrite (answerInStem)
- Current: If n doubles and p stays the same, the binomial mean μ = np:
  - choices: Doubles | Stays the same | Is cut in half | Quadruples → **Doubles**
- Proposed: A binomial setting has n = 40 and p = 0.21. If n changes to 80 with the same p, the mean μ = np:
- Why: Stem said 'doubles' verbatim; the rewrite uses the worksheet's n = 40, p = 0.21 example so the student must apply μ = np to see the mean is multiplied by 2.
- Worksheet: “Mean: μX = np ... μC = np = (40)(0.21) = [8.4] cell phones”

### q34 — rewrite (answerInStem)
- Current: If n increases while p stays fixed, the binomial standard deviation:
  - choices: Increases | Decreases | Stays the same | Becomes negative → **Increases**
- Proposed: A binomial setting has n = 40 and p = 0.21. If n changes to 80 with the same p, the standard deviation √[np(1-p)]:
  - choices: Gets larger | Gets smaller | Stays the same | Becomes negative → **Gets larger**
- Why: 'Increases' appeared in the stem; the rewrite anchors to the worksheet's cell-phone example and rewords the choices so the answer cannot be pattern-matched.
- Worksheet: “Standard Deviation: σX = √[np(1-p)] ... σC = √[(40)(0.21)(0.79)] = [2.58] cell phones”


## u4_l7_l8_blooket.csv (from u4_lesson7-8_live.html)

### q15 — rewrite (answerInStem)
- Current: Which is discrete: time to finish homework or number of problems correct?
  - choices: Number of problems correct | Time to finish homework | Both are discrete | Neither is discrete → **Number of problems correct**
- Proposed: Which of these random variables is DISCRETE?
  - choices: Number of problems a student gets correct on a quiz | Time (in minutes) a student takes to finish homework | Weight of a randomly chosen backpack | Height of a randomly chosen student → **Number of problems a student gets correct on a quiz**
- Why: An either/or stem necessarily names the answer; a four-option 'which is discrete' card tests the countable-values definition without echoing the correct choice.
- Worksheet: “Discrete Random Variable: Can only take a countable number of values (with space between values on a number line)”

### q48 — merge (siblingStem)
- Current: If X=10 with P=0.3 and X=20 with P=0.7 then μ=?
  - choices: 17 | 15 | 14 | 30 → **17**
- Why: Same unequal-weight two-value expected-value drill as q46 (and templated on q45); keep q46 and drop q48.
- Worksheet: “Mean (Expected Value): μX = Σ xi · P(xi)”


## u5_l5_blooket.csv (from u5_lesson5_live.html)

### q6 — rewrite (answerInStem)
- Current: A high school has 2,000 students with p = 0.30. For a sample of n = 50, what is μ_p-hat?
  - choices: 0.30 | 0.065 | 15 | 50 → **0.30**
- Proposed: In a high school with 2,000 students, 30% have a driver's license. For a random sample of n = 50 students, what is the mean of the sampling distribution of p̂?
- Why: Since mu_p-hat = p the value must be derivable from the stem; stating it as '30%' (the worksheet's own wording) requires the student to know the rule rather than copy '0.30'.
- Worksheet: “In a high school with 2,000 students, 30% have a driver's license. We select a random sample of n = 50 students... Interpret mu_p-hat = 0.30”

### q24 — rewrite (answerInStem)
- Current: A city has a large population where p = 0.40 support a policy. For a sample of n = 100, what is μ_p-hat?
  - choices: 0.40 | 0.049 | 40 | 100 → **0.40**
- Proposed: A polling company surveys n = 100 people from a large city where 40% support a new policy. What is the mean of the sampling distribution of p̂?
- Why: Same fix as q6: give the proportion as '40%' per the worksheet so the literal answer '0.40' is not in the stem while keeping the worksheet's exit-ticket scenario.
- Worksheet: “A polling company surveys n = 100 people from a large city where 40% support a new policy (p = 0.40). (a) Calculate the mean and standard deviation of the sampling distribution of p-hat.”


## u1_l5_blooket.csv (from u1_lesson5_live.html)

### q25 — rewrite (crossCardLeak)
- Current: Which question matters before choosing a dotplot or stem-and-leaf plot?
  - choices: how many intervals define one bar | how many cutoffs mark the totals | how many observations are in the data | how many stems split in advance → **how many observations are in the data**
- Proposed: Before choosing a display that shows every individual value, what should you check about the data set?
- Why: The stem repeats q23's exact answer phrase; rephrasing around 'a display that shows every individual value' removes the leak while keeping the concept.
- Worksheet: “Dotplots and stem-and-leaf plots are harder to make for very large data sets.”


## u1_l8_blooket.csv (from u1_lesson8_live.html)

### q24 — merge (siblingStem)
- Current: What does it mean if the median line is near the right side of the box?
  - choices: the lower whisker must be longest | the middle 50% stretches more left | the mean must equal the median | the middle 50% stretches more right → **the middle 50% stretches more left**
- Why: Merge: keep q23, drop q24. Both cards test the same inferred reading of median-line position inside the box, which the worksheet only supports indirectly; one card is enough.
- Worksheet: “The box shows the middle 50% of the data, with a line at the median and ends at the quartiles.”


## u1_l9_blooket.csv (from u1_lesson9_live.html)

### q24 — merge (siblingStem)
- Current: Which pair is also a reasonable numerical comparison of center and variability?
  - choices: mode and response rate | median and IQR together | cluster and gap size | title and sample year → **median and IQR together**
- Why: Merge: keep q23, drop q24. The word 'also' makes q24 depend on q23 and both test the same fact (a center statistic paired with a variability statistic).
- Worksheet: “Center: mean or median. Variability: range, IQR, standard deviation”


## u3_l3_blooket.csv (from u3_lesson3_live.html)

### q5 — drop (siblingStem)
- Current: What does sampling with replacement mean?
  - choices: A chosen item is removed from the pool | A chosen item may be selected again | A chosen item must stay in its stratum | A chosen item counts for every cluster → **A chosen item may be selected again**
- Why: The worksheet only defines sampling WITHOUT replacement (q4); 'with replacement' never appears in the worksheet, so q5 has no basis there and duplicates q4's concept in mirror form.
- Worksheet: no basis found


## u4_l10_blooket.csv (from u4_lesson10-12_live.html)

### q27 — rewrite (crossCardLeak)
- Current: Using P(X=5) = C(6,5) · (0.53)^5 · (0.47)^1, the probability is about:
  - choices: 0.118 | 0.0486 | 0.53 | 0.882 → **0.118**
- Proposed: In the hurricane example, the probability that exactly 5 of the 6 predicted tropical storms become hurricanes is about:
  - choices: 0.118 | 0.0486 | 0.882 | 0.418 → **0.118**
- Why: Stem printed q15's full formula setup verbatim; the rewrite asks for the worksheet's computed value without restating the setup and swaps out the '0.53' distractor that is q11's answer.
- Worksheet: “P(X = 5) = 6C5 · (0.53)^5 · (0.47)^1 = [0.118]”


## u4_l10_l11_l12_blooket.csv (from u4_lesson10-12_live.html)

### q37 — rewrite (permutationUnsafe)
- Current: Which conditions do binomial and geometric distributions share?
  - choices: Binary outcomes, independent trials, same probability p | Fixed number of trials | Counting total successes | All of these → **Binary outcomes, independent trials, same probability p**
- Proposed: Which conditions do binomial and geometric settings have in common?
  - choices: Binary outcomes, independent trials, same probability p | A fixed number of trials n | Counting the total number of successes | Counting trials until the first success → **Binary outcomes, independent trials, same probability p**
- Why: Replace position-dependent 'All of these' with a geometric-only distractor (trials until first success) so the card is safe under choice shuffling.
- Worksheet: “Geometric vs Binomial: Similarities: Binary outcomes, Independent trials, Same probability p. Key Difference: Binomial has fixed n; Geometric has no fixed n”


## u4_l10_l12_blooket.csv (from u4_lesson10-12_live.html)

### q37 — rewrite (permutationUnsafe)
- Current: Which conditions do binomial and geometric distributions share?
  - choices: Binary outcomes, independent trials, same probability p | Fixed number of trials | Counting total successes | All of these → **Binary outcomes, independent trials, same probability p**
- Proposed: Which conditions do binomial and geometric settings have in common?
  - choices: Binary outcomes, independent trials, same probability p | A fixed number of trials n | Counting the total number of successes | Counting trials until the first success → **Binary outcomes, independent trials, same probability p**
- Why: Replace position-dependent 'All of these' with a geometric-only distractor (trials until first success) so the card is safe under choice shuffling.
- Worksheet: “Geometric vs Binomial: Similarities: Binary outcomes, Independent trials, Same probability p. Key Difference: Binomial has fixed n; Geometric has no fixed n”


## u4_l8_blooket.csv (from u4_lesson7-8_live.html)

### q8 — merge (siblingStem)
- Current: If X=10 with P=0.3 and X=20 with P=0.7 then μ=?
  - choices: 17 | 15 | 14 | 30 → **17**
- Why: Same unequal-weight two-value expected-value drill as q6 (and templated on q5); keep q6 and drop q8.
- Worksheet: “Mean (Expected Value): μX = Σ xi · P(xi)”


## u5_l7_blooket.csv (from u5_lesson7_live.html)

### q10 — rewrite (answerInStem)
- Current: A population is approximately normal. The sampling distribution of x-bar from samples of size 5 is:
  - choices: Approximately normal | Not normal because the sample size is less than 30 | Skewed in the same direction as the population | Unknown without seeing the actual sample data → **Approximately normal**
- Proposed: Lemon weights are symmetric and bell-shaped with μ = 4 oz and σ = 0.5 oz. For random samples of n = 6 lemons, the shape of the sampling distribution of x̄ is:
  - choices: Approximately normal | Not normal because n is less than 30 | Skewed in the same direction as the population | Unknown without seeing the actual sample data → **Approximately normal**
- Why: Uses the worksheet's lemon scenario and describes the population shape without the word 'normal', so the student must apply Path 1 (normal population => normal sampling distribution) instead of pattern-matching.
- Worksheet: “In the lemon example, the population is already approximately normal, so the sampling distribution of x-bar is approximately normal even though n = [6], which is less than 30.”


## u6_l7_blooket.csv (from u6_lesson7_live.html)

### q29 — rewrite (siblingStem)
- Current: Which statement about power is incorrect?
  - choices: Power depends on the true parameter value when that value differs from the null. | Power is larger when the sample size is larger, all else being equal. | Power helps describe the chance of avoiding a Type II error. | Power is the probability that the null hypothesis is false. → **Power is the probability that the null hypothesis is false.**
- Proposed: Which of these is NOT a true statement about the power of a significance test?
- Why: q19 asks for the correct definition of power while q29 asks students to spot a misconception among power facts, so they test different things; but 'correct?' vs 'incorrect?' stems are easy to misread in a fast game — reword q29 to make the negation unmistakable (choices unchanged).
- Worksheet: “Power = P(correctly reject a false H0). P(Type II error) = 1 − power. Power increases when sample size increases, significance level increases, standard error decreases, or the true parameter value is farther from the null.”


## u6_l9_blooket.csv (from u6_lesson9_live.html)

### q16 — rewrite (crossCardLeak)
- Current: A claim says the first population proportion is smaller than the second. Which interval supports it?
  - choices: An interval entirely above 0 for first minus second. | An interval entirely below 0 for first minus second. | An interval that includes 0 for first minus second. | An interval centered exactly at 0 for first minus second. → **An interval entirely below 0 for first minus second.**
- Proposed: A researcher claims p1 < p2. Which confidence interval for p1 - p2 gives convincing evidence for that claim?
  - choices: An interval entirely above 0. | An interval entirely below 0. | An interval that includes 0. | An interval centered exactly at 0. → **An interval entirely above 0.**
- Why: The stem restates q7's correct answer verbatim ('first population proportion is smaller than the second'); switching to symbolic AP notation (p1 < p2) keeps the same skill (claim → interval direction) without echoing q7's answer text.
- Worksheet: “A negative interval here means the first population proportion is [smaller] than the second. ... if all interval values support the claim, there is convincing evidence.”


## u7_l3_blooket.csv (from u7_lesson3_live.html)

### q5 — rewrite (crossCardLeak)
- Current: Before computing a one-sample t-interval for a mean what should come first?
  - choices: Round the sample data and find t-star. | State the conclusion and justify it later. | Compare the claim with the margin first. | Check conditions and identify the procedure. → **Check conditions and identify the procedure.**
- Proposed: In a complete inference response estimating a population mean μ, what must happen before calculating the interval?
- Why: Stem repeats q6's correct answer 'a one-sample t-interval for a mean' verbatim; rewording to 'estimating μ' keeps the concept without leaking q6.
- Worksheet: “A complete inference response should define the parameter, choose the procedure, verify conditions, calculate the interval, and interpret it in context.”


## u8_l2_blooket.csv (from u8_lesson2_live.html)

### q29 — merge (siblingStem)
- Current: What does a large chi-square statistic usually suggest?
  - choices: The observed counts follow the model very closely | The sample proportions are all exactly equal | The observed counts are far from the expected pattern | The categories came from a quantitative variable → **The observed counts are far from the expected pattern**
- Why: q6 (small statistic = counts fit closely) and q29 (large statistic = counts far from expected) are the same monotone fact stated both ways; keep q29 (matches the worksheet's 'larger chi-square value' exit-ticket wording) and drop q6.
- Worksheet: “Explain what a larger chi-square value would mean about how well the observed counts fit the equal-proportions model.”


## u8_l5_blooket.csv (from u8_lesson5_live.html)

### q2 — rewrite (crossCardLeak)
- Current: When is a chi-square test for homogeneity appropriate?
  - choices: When one variable is quantitative and one is categorical | When one sample measures two traits on each person | When row totals and column totals are both equal | When separate samples compare one variable across groups → **When separate samples compare one variable across groups**
- Proposed: Which data-collection design leads to a chi-square test whose null hypothesis says there is no difference in distributions?
  - choices: One sample records two categorical variables on each individual | One quantitative and one categorical variable are recorded | Row totals and column totals are forced to be equal | Separate samples measure one categorical variable across several populations → **One sample records two categorical variables on each individual**
- Why: Stem names 'chi-square test for homogeneity', which is q30's correct answer; the rewrite identifies the test by its null hypothesis (worksheet wording) so q30 is not leaked.
- Worksheet: “If the goal is to compare distributions across multiple populations or treatments, use a chi-square test for homogeneity ... The correct test depends on how the data are collected.”


## Kept as-is (false positives / acceptable)

- u4_l3_l4_l5_blooket.csv: q1, q2, q10, q11, q8, q18, q19, q20, q25, q31, q38, q40, q41, q42, q43, q45, q47, q48, q49, q51, q52, q54, q55, q56, q57, q59, q70, q16
- u2_l3_blooket.csv: q8, q27
- u4_l7_l8_blooket.csv: q46
- u5_l5_blooket.csv: q11
- u1_l5_blooket.csv: q11
- u1_l8_blooket.csv: q5, q16
- u4_l10_blooket.csv: q11, q5, q7
- u4_l10_l11_l12_blooket.csv: q12, q5, q7
- u4_l10_l12_blooket.csv: q12, q5, q7
- u4_l8_blooket.csv: q6
- u5_l7_blooket.csv: q33
- u6_l6_blooket.csv: q13, q17
- u6_l7_blooket.csv: q2, q4, q12
- u6_l9_blooket.csv: q7, q13
- u1_l10_blooket.csv: q30
- u1_l6_blooket.csv: q4, q7
- u1_l7_blooket.csv: q6, q9
- u2_l4_blooket.csv: q13, q16
- u2_l5_blooket.csv: q9
- u2_l6_blooket.csv: q3
- u2_l7_blooket.csv: q11
- u3_l2_blooket.csv: q13
- u3_l5_blooket.csv: q27
- u4_l12_blooket.csv: q29
- u4_l9_blooket.csv: q2, q18, q32, q22, q27
- u5_l1_blooket.csv: q14
- u5_l4_blooket.csv: q2
- u5_l8_blooket.csv: q10
- u6_l1_l2_blooket.csv: q7
- u6_l10_blooket.csv: q23
- u6_l11_blooket.csv: q7, q24
- u6_l5_blooket.csv: q6
- u7_l7_blooket.csv: q9, q11
- u8_l3_blooket.csv: q13
- u8_l6_blooket.csv: q22
- u9_l3_blooket.csv: q9
- u9_l5_blooket.csv: q12
