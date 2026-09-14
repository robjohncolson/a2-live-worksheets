# TI-84 Trainer — Pattern Recognition Spec Addendum

**Extends**: `ti84-trainer-spec.md` (V1 core trainer)
**Status**: Design complete, ready for implementation

---

## 1. Problem Statement

On the AP Statistics exam, nobody tells students which TI-84 procedure to use. They get a paragraph describing a study and must:
1. Recognize which procedure fits (pattern recognition)
2. Navigate the calculator (keystroke fluency — current trainer)
3. Interpret the output (covered by worksheets/driller)

The current trainer assumes step 1 is done. This addendum adds step 1 as an independent, SRS-tracked skill.

---

## 2. Two Independent SRS Tracks

### Track 1: "What procedure?" (Pattern Recognition)
- Given an AP-style problem stem, identify the correct TI-84 procedure from 4 choices
- Own SRS state per procedure (interval, easeFactor, repetitions, mastery)
- Drillable independently — student can enter Track 1 without doing Track 2

### Track 2: "How to execute?" (Calculator Navigation)
- The existing guided/recall trainer
- Own SRS state per procedure, unchanged from V1

### Track Integration
- Session queue can pull from both tracks and interleave
- Students can filter to Track 1 only, Track 2 only, or both
- Tracks share the same procedure inventory but have independent mastery states
- When both tracks are active: Track 1 question → correct answer → Track 2 walkthrough with problem values pre-loaded

---

## 3. Branching on Wrong Answers

**Core principle**: Every wrong answer branches into a full learning sequence for the incorrectly chosen procedure. The time cost of branching IS the incentive to get it right. No artificial limits on branch depth.

### Branch Flow

```
Question: "Which procedure?" (correct = 1-PropZTest)
│
├─ Student picks TInterval (wrong)
│   ├─ Pattern contrast:
│   │   "TInterval estimates a population mean with a confidence interval.
│   │    Here's a typical TInterval problem:"
│   │   [Show canonical TInterval problem]
│   │
│   ├─ Full state-machine walkthrough of TInterval:
│   │   STAT > TESTS > 8 > wizard > enter values > Calculate > result screen
│   │   (Guided mode, using the canonical problem's values)
│   │
│   ├─ Contrast explanation:
│   │   "Notice: TInterval asks for x̄ and Sx (sample mean and SD).
│   │    Your original problem has counts (102 out of 150) — that's a
│   │    proportion, not a mean."
│   │
│   ├─ SRS credit:
│   │   Track 1 (TInterval): passive exposure, quality 2-3
│   │   Track 2 (TInterval): guided completion credit
│   │
│   └─ Return to original question (TInterval removed from choices)
│
├─ Student picks T-Test (wrong again)
│   ├─ [Same branch structure: contrast → full walkthrough → explanation]
│   ├─ SRS credit for T-Test
│   └─ Return to original question (T-Test also removed)
│
├─ Student picks 1-PropZTest (correct — 2 choices remain)
│   └─ Launch full walkthrough for 1-PropZTest
│       with values from the original problem (p₀=0.6, x=102, n=150, >p₀)
```

### SRS Credit for Branches

| Event | Track 1 quality | Track 2 effect |
|-------|----------------|----------------|
| Correct identification on first try | 5 | Proceed to walkthrough normally |
| Correct after 1 branch | 3 | Walkthrough proceeds, interval grows slowly |
| Correct after 2 branches | 1 | Walkthrough proceeds, interval resets |
| Correct after 3 branches (last choice) | 0 | Walkthrough proceeds, may demote to guided |
| Branched-into procedure (wrong pick) | 2 (passive exposure) | Guided completion credit if walkthrough done |

### Why Unlimited Branching Works

- **Self-correcting**: Students who keep confusing two procedures get massive exposure to both via branches. The contrast between them becomes increasingly clear.
- **Natural punishment**: Each wrong pick costs 2-5 minutes of walkthrough. Students learn to think carefully before picking.
- **SRS amplification**: Branched-into procedures get exposure credit, so they'll show up as direct questions soon — when the student has already seen them in contrast.
- **No dead ends**: Even a student who picks wrong 3 times still completes the correct procedure at the end. Every session ends with success.

---

## 4. Pattern Signature Model

Each procedure gets a `patternSignature` that defines what makes a problem "this type":

```javascript
{
  id: "one-propztest",
  patternSignature: {
    dataType: "categorical",           // categorical | quantitative
    parameterType: "proportion",        // proportion | mean | slope | distribution | variance
    questionType: "test",               // test | interval
    sampleStructure: "one-sample",      // one-sample | two-sample | paired | matched-pairs
    distributionFamily: "normal",       // normal | t | chi-square | F | binomial | geometric
    keywords: ["proportion", "percent", "%", "out of", "claimed", "p =", "p >", "p <"],
    antiKeywords: ["mean", "average", "standard deviation", "slope", "regression"],
    frameworkSkills: ["DAT-3.E", "VAR-6.A"],
    unit: 6
  }
}
```

### Pattern Signatures for All 27 Procedures

| Procedure | dataType | parameterType | questionType | sampleStructure | 
|-----------|----------|--------------|-------------|-----------------|
| 1-PropZTest | categorical | proportion | test | one-sample |
| 1-PropZInt | categorical | proportion | interval | one-sample |
| T-Test | quantitative | mean | test | one-sample |
| TInterval | quantitative | mean | interval | one-sample |
| 2-SampTTest | quantitative | mean | test | two-sample |
| 2-SampTInt | quantitative | mean | interval | two-sample |
| χ²-Test | categorical | distribution | test | two-sample (independence/homogeneity) |
| χ²GOF-Test | categorical | distribution | test | one-sample (multiple categories) |
| LinRegTTest | quantitative | slope | test | paired (bivariate) |
| LinRegTInt | quantitative | slope | interval | paired (bivariate) |
| normalcdf | quantitative | probability | calculation | n/a (distribution) |
| invNorm | quantitative | percentile | calculation | n/a (distribution) |
| binompdf | categorical | probability | calculation | n/a (distribution) |
| binomcdf | categorical | probability | calculation | n/a (distribution) |
| geometpdf | categorical | probability | calculation | n/a (distribution) |
| geometcdf | categorical | probability | calculation | n/a (distribution) |
| 1-Var Stats | quantitative | descriptive | calculation | one-sample |
| LinReg(a+bx) | quantitative | regression | calculation | paired (bivariate) |
| histogram | quantitative | graphical | display | one-sample |
| boxplot | quantitative | graphical | display | one-sample |
| scatterplot | quantitative | graphical | display | paired (bivariate) |
| residual-plot | quantitative | graphical | display | paired (bivariate) |
| normalcdf-sampling | quantitative | probability | calculation | n/a (sampling dist) |
| invnorm-sampling | quantitative | percentile | calculation | n/a (sampling dist) |

---

## 5. Confusion Matrix

All procedure pairs where students plausibly confuse them. The Bayesian knowledge tracer will learn which confusions are real for each student, but the generator starts with all possibilities.

### Structural Confusions (same parameter type, different question type)

| Procedure A | Procedure B | Confusion type |
|-------------|-------------|---------------|
| 1-PropZTest | 1-PropZInt | test vs interval (proportion) |
| T-Test | TInterval | test vs interval (mean) |
| 2-SampTTest | 2-SampTInt | test vs interval (two-sample mean) |
| LinRegTTest | LinRegTInt | test vs interval (slope) |

### Parameter Type Confusions (same question type, different parameter)

| Procedure A | Procedure B | Confusion type |
|-------------|-------------|---------------|
| 1-PropZTest | T-Test | proportion vs mean (one-sample test) |
| 1-PropZInt | TInterval | proportion vs mean (one-sample interval) |
| T-Test | LinRegTTest | mean vs slope (one-sample test) |
| 1-PropZTest | χ²GOF-Test | single proportion vs multiple categories |

### Sample Structure Confusions

| Procedure A | Procedure B | Confusion type |
|-------------|-------------|---------------|
| T-Test | 2-SampTTest | one-sample vs two-sample (mean test) |
| TInterval | 2-SampTInt | one-sample vs two-sample (mean interval) |
| χ²-Test | χ²GOF-Test | independence vs goodness-of-fit |

### Distribution Confusions

| Procedure A | Procedure B | Confusion type |
|-------------|-------------|---------------|
| normalcdf | invNorm | forward vs inverse normal |
| binompdf | binomcdf | exact vs cumulative binomial |
| geometpdf | geometcdf | exact vs cumulative geometric |
| normalcdf | binomcdf | continuous vs discrete |
| binompdf | geometpdf | fixed trials vs first success |

### Cross-Unit Confusions (less common but tested on AP exam)

| Procedure A | Procedure B | Confusion type |
|-------------|-------------|---------------|
| normalcdf | normalcdf-sampling | population vs sampling distribution |
| 1-PropZTest | χ²GOF-Test | proportion claim vs distribution fit |
| LinReg(a+bx) | LinRegTTest | descriptive regression vs inferential regression |
| 1-Var Stats | T-Test | descriptive vs inferential |

---

## 6. Question Generator

### Architecture

```
generate(procedure, unit, seed) → {
  stem: "A researcher claims that...",          // AP-style problem text
  correct: "one-propztest",                     // procedure ID
  distractors: ["one-propzint", "t-test-stats", "chi-square-gof-test"],
  feedback: {                                    // per distractor
    "one-propzint": { contrast, canonicalProblem, walkthrough },
    "t-test-stats": { contrast, canonicalProblem, walkthrough },
    "chi-square-gof-test": { contrast, canonicalProblem, walkthrough }
  },
  values: { p0: 0.6, x: 102, n: 150, direction: ">" },
  frameworkSkill: "DAT-3.E",
  unit: 6
}
```

### Sources

1. **Context vocabulary**: Drawn from `curriculum.json` (817 questions, matched by framework skill code)
2. **Problem templates**: Constrained to framework skills — no out-of-scope content
3. **Values**: Deterministic from seed, or pre-authored per procedure
4. **Distractors**: Selected from confusion matrix, prioritized by student's historical confusions (if Bayesian tracer active) or by structural similarity (default)

### Distractor Selection Algorithm

1. Start with all entries from the confusion matrix for the target procedure
2. If Bayesian tracer is active: sort by P(confusion) descending — show the distractors the student is most likely to pick
3. If no tracer: sort by structural similarity (same questionType > same parameterType > same sampleStructure)
4. Take top 3
5. Ensure at least one "test vs interval" confusion and one "wrong parameter type" confusion when applicable

### Canonical Problems

Each procedure needs one hand-crafted canonical problem that is shown during branches. These should be:
- Unambiguous (clearly one correct procedure)
- Short (2-3 sentences)
- Use familiar AP Stats contexts (polls, medical trials, agriculture, sports)
- Include realistic values that produce clean calculator output

These will be generated by CC from curriculum.json + frameworks, then reviewed by the teacher.

---

## 7. Data Model Additions

### Per-Procedure Additions to `ti84-procedures-data.json`

```javascript
{
  id: "one-propztest",
  // ... existing fields ...
  
  patternSignature: { /* see section 4 */ },
  
  confusableWith: [
    {
      procedure: "one-propzint",
      confusionType: "test-vs-interval",
      contrast: "Your problem tests a specific claim — 'more than 60%.' A confidence interval estimates a range, not test a claim. You need a hypothesis test."
    },
    // ... more confusable pairs
  ],
  
  canonicalProblem: {
    stem: "A company claims that at least 70% of its customers are satisfied with their service. In a random sample of 200 customers, 156 reported satisfaction. Test the company's claim at the α = 0.05 significance level.",
    values: { p0: 0.70, x: 156, n: 200, direction: ">" },
    frameworkSkill: "DAT-3.E"
  }
}
```

### SRS State Extension

```javascript
{
  nodeId: "one-propztest",
  track1: {  // pattern recognition
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
    lastReview: null,
    nextReview: null,
    confusionHistory: [
      { date: "...", pickedWrong: "one-propzint", context: "test-vs-interval" }
    ]
  },
  track2: {  // calculator navigation (existing)
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
    lastReview: null,
    nextReview: null,
    mode: "guided",
    history: []
  }
}
```

---

## 8. Bayesian Confusion Tracing (V2)

Per-student, per-procedure-pair confusion probability:

```
P(confuse A with B | student) updated on each Track 1 response
```

When student is given procedure A and picks B:
- P(confuse A→B) increases
- Future questions for A prioritize B as a distractor
- Future questions for B also surface (the confusion is bidirectional)

When student correctly identifies A without picking B:
- P(confuse A→B) decreases slowly

This feeds back into distractor selection: the generator picks the 3 distractors the student is most likely to confuse, making each question maximally diagnostic.

---

## 9. Implementation Phases

### Phase 1: Static Pattern Recognition (extend V1)
- Add patternSignature and confusableWith to procedure data
- Generate canonical problems for all 27 procedures
- Build Track 1 UI: problem stem → 4 choices → branch on wrong → walkthrough on correct
- Independent SRS for Track 1
- Static confusion matrix (all pairs equally weighted)

### Phase 2: Bayesian Confusion Tracing (V2)
- Per-student confusion probability tracking
- Adaptive distractor selection
- Confusion analytics dashboard (heatmap of which pairs cause problems)

### Phase 3: Curriculum-Driven Generation (V2+)
- Question generator pulling from curriculum.json
- Framework skill coverage tracking
- Unit-scoped question generation (only ask about procedures the student has learned)
