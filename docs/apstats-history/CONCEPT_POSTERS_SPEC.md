# CONCEPT_POSTERS_SPEC.md — Hand-Made Classroom Wall Posters (Fall-2026 CED)

**Purpose:** a build guide for 15 hand-made posters that, together, put every equation and core concept of the course on the classroom wall. One reference per poster: what goes on it, exactly which formulas, how big, what color, and a QA checklist so nothing on the formula sheet is missed.

**Who makes them:** the teacher, by hand. No printing assumed.

**Status:** spec only. Nothing in the app changes. This document is the deliverable.

---

## 0. How to use this document

1. Read §1 (scope) once, then §2 (production standards) once. Those decide size, lettering, and colors for the whole set so the posters read as one system.
2. Build posters in the order in §4. Unit 1 posters go up first because they are taught first.
3. Before inking any poster, run the §5 checklist against its entry in §3.
4. After all 15 are up, walk §6 (the coverage matrix) and tick off every formula id.

---

## 1. Scope and sources

### 1.1 What "all 6 units" maps to

The SY26-27 course runs on the **Fall-2026 CED**, which has **5 core units** plus a set of **"Beyond the Exam"** topics that this course still teaches after the core content (see `roadmap-data.json`, `ced2026` fields; commit `39dd6de`). This spec treats the sixth "unit" as that Beyond the Exam tier. It does **not** get its own posters. Instead, every Beyond the Exam formula lives in a clearly marked **★ corner** on the poster of its parent concept, so the wall matches what students are graded on while still covering everything taught.

| New unit | Working title (verify wording against the CED PDF before lettering) | Core topics |
|---|---|---|
| 1 | Exploring One-Variable Data & Collecting Data | 1.1–1.13 |
| 2 | Probability, Random Variables & Sampling Distributions | 2.1–2.12 |
| 3 | Inference for Proportions & Categorical Data | 3.1–3.15 |
| 4 | Inference for Means | 4.1–4.10 |
| 5 | Exploring Two-Variable Data (Regression) | 5.1–5.5 |
| ★ | Beyond the Exam | Chi-square GOF, slope inference, geometric, combining RVs, departures from linearity, simulation-based significance |

The old 9-unit numbering is still on every worksheet and video. Each poster entry in §3 lists the old topic numbers it covers so a student can find the matching worksheet.

### 1.2 Formula source of truth

`data/ap-stats-cartridge.js` holds the **81 formulas** the Equation Trainer drills (ids like `one-prop-z`). §6 maps every one of those ids to exactly one poster. If a formula is on the wall it must match the cartridge's notation, and vice versa. The cartridge follows the College Board formula sheet.

> **Verify before inking:** the Fall-2026 formula sheet may differ from the 2019 sheet in notation (for example, the CED taxonomy in `data/skill-taxonomy-ced2026.json` dropped the VAR/UNC/DAT big-idea labels). Check the current AP formula sheet PDF once, and if a symbol differs, the formula sheet wins.

### 1.3 What is deliberately not on the wall

- Calculator keystrokes. Those live in the TI-84 trainer, not on posters.
- Skill codes (1.A, 3.E, …). Students never need them.
- Anything from the old CED that is not in the new one (e.g. the VAR/UNC/DAT labels).

---

## 2. Production standards (apply to every poster)

### 2.1 Size and legibility

- **Sheet:** 22 × 28 in poster board, portrait, for every poster. Same size keeps the wall orderly and lets you plan hanging space once.
- **Legibility rule:** roughly **1 inch of letter height per 10 ft of viewing distance**. For a back row at 25 ft:
  - Poster title: 3 in tall letters
  - Main formulas: 1.5–2 in tall
  - Variable key and interpretation sentences: 0.75–1 in tall
  - Nothing smaller than 0.5 in. If it does not fit at 0.5 in, it belongs in a worksheet, not on the wall.
- **Markers:** broad-chisel for formulas and titles, fine-tip only for the variable key. Black for content, one unit color for accents. Test a swatch on the board before starting; some boards bleed.
- **Pencil first.** Lay out every poster in pencil with a yardstick, check it from across the room, then ink.

### 2.2 The one layout template

Every poster uses the same five zones, top to bottom. Students learn to look in the same place on every poster.

```
┌──────────────────────────────────────────┐
│ [unit color stripe, 1.5 in, full width]   │  ← unit number + unit name, white lettering
│ TITLE (3 in)                              │
├──────────────────────────────────────────┤
│ ZONE A — THE FORMULAS                     │  ← 45% of the height. Big. Boxed.
│                                           │
├──────────────────────────────────────────┤
│ ZONE B — WHAT THE SYMBOLS MEAN            │  ← 15%. Two columns. Parameter vs statistic
├──────────────────────────────────────────┤
│ ZONE C — SAY IT IN WORDS                  │  ← 15%. Interpretation sentence frame(s)
├──────────────────────────────────────────┤
│ ZONE D — WATCH OUT           │ ★ BEYOND  │  ← 15%. Common mistake(s) | ★ bonus corner
│                              │ THE EXAM  │     (★ corner only where §3 says so)
└──────────────────────────────────────────┘
```

Bottom-right corner of every poster: a small **"see WS old u#_l#"** tag pointing to the old worksheet numbering (the videos students watch still use it).

### 2.3 Unit color code

Pick five distinct marker/board colors and use them consistently for the stripe, boxes around formulas, and the ★ corner border.

| Unit | Color | Posters |
|---|---|---|
| 1 | Green | P01, P02, P03 |
| 2 | Blue | P04, P05, P06, P07, P08 |
| 3 | Orange | P09, P10, P11, P12 |
| 4 | Purple | P13 |
| 5 | Red | P14, P15 |
| ★ Beyond the Exam | Gold border, on the parent poster's ★ corner | (embedded) |

P09 and P10 (the CI and test master posters) are used in Units 3, 4 and 5. They keep the Unit 3 orange stripe but get a second thin stripe in purple and red so students know they apply across inference.

### 2.4 Notation conventions (hold these on every poster)

- **Parameters are Greek or unhatted, statistics wear a hat or a bar.** μ, σ, p, β vs x̄, s, p̂, b. Write this rule once on P08 and honor it everywhere.
- Population SD of a statistic is **σ_(statistic)**; the estimated version from data is **s_(statistic)** or **SE**. Write "SE" only when the poster says what it estimates.
- Use **p̂_c** for the pooled proportion (matches the cartridge id `pooled-se`).
- Always show **df** next to any t or χ² formula.
- Conditions are always in the same order: **Random → 10% (independence) → Normal/Large Counts**.

### 2.5 Materials and time

- 15 sheets of 22 × 28 poster board, plus 2 spares.
- Broad-chisel markers: black ×3, one per unit color ×2 each, gold ×1.
- Fine-tip black ×2, yardstick, pencil, big eraser, painter's tape for hanging.
- Budget **60–90 minutes per poster** (pencil layout 20, ink 40, QA 10). Fifteen posters ≈ 3 working days, or two per evening for eight evenings.

---

## 3. The 15 posters

Formulas below are written so they can be copied by hand. Where a formula id from the cartridge applies it appears in `code` so §6 can be checked.

---

### P01 · Variables & Displays — Unit 1 (green)

**Covers:** new 1.1–1.6, 1.8, 1.9 · old 1.1–1.6, 1.8, 1.9
**No cartridge formulas.** This is a concept poster.

**Zone A (the content, boxed as two columns):**
- Left column, **Categorical**: bar graph, pie chart, frequency table, relative frequency. Sketch a tiny bar graph.
- Right column, **Quantitative**: dotplot, stemplot, histogram, boxplot, cumulative graph. Sketch a tiny histogram and a tiny boxplot.
- Across the bottom of Zone A, the describe-a-distribution mnemonic in big letters: **Shape · Center · Spread · Outliers** (or CUSS/SOCS if that is what you say in class). Underneath, the shape vocabulary: symmetric, skewed left, skewed right, unimodal, bimodal, uniform.

**Zone B:** discrete vs continuous; individual vs variable.

**Zone C:** the comparison sentence frame: *"Distribution A is [more/less] [shape/center/spread word] than B, because ___ (with numbers and context)."*

**Zone D:** "Skewed LEFT means the tail is on the left, not the pile." Also: "A histogram has no gaps between bars; a bar graph does."

---

### P02 · Summary Statistics — Unit 1 (green)

**Covers:** new 1.7, 1.8 · old 1.7, 1.8
**Cartridge ids:** `mean`, `std-dev`, `variance`, `iqr`, `outlier-iqr`

**Zone A (formulas, biggest lettering on the poster):**

```
x̄ = Σxᵢ / n
s² = Σ(xᵢ − x̄)² / (n − 1)
sₓ = √[ Σ(xᵢ − x̄)² / (n − 1) ]
IQR = Q₃ − Q₁
Outlier if  x > Q₃ + 1.5·IQR   or   x < Q₁ − 1.5·IQR
```

Plus a labeled boxplot sketch with min, Q₁, median, Q₃, max and a whisker ending at the last non-outlier.

**Zone B:** x̄ sample mean vs μ population mean; s vs σ; five-number summary. A two-row table: **Resistant** (median, IQR) vs **Not resistant** (mean, SD, range).

**Zone C:** SD sentence frame: *"Typically, [variable] varies from the mean by about [s] [units]."*

**Zone D:** "Divide by n − 1, not n." "Adding a constant shifts center, does not change spread; multiplying scales both."

---

### P03 · Collecting Data & Scope of Inference — Unit 1 (green)

**Covers:** new 1.10–1.13 · old 3.1–3.5
**Cartridge ids:** `random-condition` (the wording "random sample or randomized experiment" is born here; it reappears on P09)
**★ corner:** simulation-based significance (old 3.6 segment) — one line: *"Re-randomize groups many times; if the observed difference is rare, it is not just chance."*

**Zone A, three boxed panels:**
1. **Sampling methods:** SRS, stratified, cluster, systematic. One-line definition each.
2. **Bias:** undercoverage, nonresponse, response bias, voluntary response, convenience. One-line each.
3. **Experiments:** control, random assignment, replication. Designs: completely randomized, randomized block, matched pairs. Placebo, blinding, confounding.

**Zone B:** observational study vs experiment; population vs sample; treatment vs response variable.

**Zone C:** the **scope-of-inference 2 × 2 grid**. Rows: random sample yes/no. Columns: random assignment yes/no. Cells: "generalize to population?" / "conclude cause and effect?". This grid is the single most-asked FRQ item from this unit.

**Zone D:** "Random *selection* lets you generalize. Random *assignment* lets you claim cause."

---

### P04 · Two Categorical Variables — Unit 2 (blue)

**Covers:** new 2.1, 2.2 · old 2.1–2.3
**No cartridge formulas**, but write the three relative-frequency definitions as formulas anyway so they sit in Zone A.

**Zone A:**
- A 2 × 2 two-way table with row and column totals filled in (use real-ish class data, e.g. "Has a job" × "Grade level").
- Beside it:
```
joint rel. freq.       = cell / grand total
marginal rel. freq.    = row (or column) total / grand total
conditional rel. freq. = cell / row (or column) total
```
- A tiny segmented bar graph and a tiny side-by-side bar graph.

**Zone B:** explanatory vs response variable; "conditional on" means "within that row/column."

**Zone C:** association sentence: *"There is an association because the conditional distribution of [response] differs across [explanatory] groups: ___% vs ___%."*

**Zone D:** "Compare conditional distributions, not counts, when group sizes differ."

---

### P05 · Probability Rules — Unit 2 (blue)

**Covers:** new 2.3–2.7 · old 4.1–4.6
**Cartridge ids:** `complement`, `add-rule`, `cond-prob`, `mult-rule`, `mult-independent`

**Zone A:**

```
0 ≤ P(A) ≤ 1,  P(S) = 1
P(Aᶜ) = 1 − P(A)
P(A ∪ B) = P(A) + P(B) − P(A ∩ B)
        mutually exclusive: P(A ∩ B) = 0
P(A | B) = P(A ∩ B) / P(B)
P(A ∩ B) = P(A) · P(B | A)
Independent  ⇔  P(A | B) = P(A)  ⇔  P(A ∩ B) = P(A) · P(B)
```

Add a small Venn diagram for the addition rule and a small tree diagram for the multiplication rule.

**Zone B:** ∪ "or", ∩ "and", | "given". Sample space, event, outcome. Law of large numbers in one line.

**Zone C:** the **simulation recipe**: *"1. Describe one trial with random digits/the calculator. 2. Run many trials. 3. Estimate P = (# successes) / (# trials)."*

**Zone D:** "Mutually exclusive events are **never** independent (unless one has probability 0)." "Independence is checked, not assumed."

---

### P06 · Random Variables, Binomial (★ Geometric, ★ Combining) — Unit 2 (blue)

**Covers:** new 2.8–2.10 · old 4.7–4.12
**Cartridge ids:** `rv-mean`, `rv-sd`, `lintransform`, `binom-pmf`, `binom-mean`, `binom-sd`
**★ corner ids:** `lincomb-mean`, `lincomb-var`, `geom-pmf`, `geom-mean`, `geom-sd`

**Zone A, two boxes:**

Box 1 — any discrete random variable:
```
μₓ = Σ xᵢ · P(xᵢ)
σₓ = √[ Σ (xᵢ − μₓ)² · P(xᵢ) ]
Y = a + bX:   μ_Y = a + b·μₓ,   σ_Y = |b|·σₓ
```

Box 2 — binomial (write the **BINS** checklist beside it: Binary, Independent, fixed Number, same p):
```
P(X = x) = (n choose x) · pˣ · (1 − p)ⁿ⁻ˣ
μₓ = np          σₓ = √[ np(1 − p) ]
```

**Zone B:** X is the count of successes in n trials; p is the probability of success on one trial; "n choose x" = number of orderings.

**Zone C:** expected value sentence: *"If we repeated this many times, the average [variable] would be about [μ] [units]."*

**Zone D:** "SDs never add. **Variances** add (for independent variables). |b| on the SD, not b."

**★ Beyond the Exam corner (gold border):**
```
μ_(aX+bY) = a·μₓ + b·μ_Y
Var(aX+bY) = a²σₓ² + b²σ_Y²   (independent)
Geometric: P(X = x) = (1 − p)ˣ⁻¹ · p,   μₓ = 1/p,   σₓ = √(1 − p) / p
```

---

### P07 · The Normal Distribution — Unit 2 (blue)

**Covers:** new 2.11 · old 1.10 (moved from Unit 1)
**Cartridge ids:** `zscore`, `empirical-rule`

**Zone A:**
- A large, carefully drawn normal curve with μ at center and tick marks at ±1σ, ±2σ, ±3σ. Shade and label the **68 / 95 / 99.7** bands in three shades of blue.
- Below it:
```
z = (x − μ) / σ
```
- A two-way arrow: "**x → z → area**" (normalcdf) and "**area → z → x**" (invNorm).

**Zone B:** z counts standard deviations from the mean; positive above, negative below. N(μ, σ) notation.

**Zone C:** z-score sentence: *"[x] is [z] standard deviations [above/below] the mean."* Percentile sentence: *"About [area]% of [population] have [variable] below [x]."*

**Zone D:** "Always draw and shade the curve first." "Percentile means area to the **left**."

---

### P08 · Sampling Distributions & the CLT — Unit 2 (blue)

**Covers:** new 2.12, 3.1, 3.2, 4.1 · old 5.1–5.7
**Cartridge ids:** `phat-mean`, `phat-sd`, `xbar-mean`, `xbar-sd`

This is the hinge poster. Everything in Units 3 and 4 hangs off it.

**Zone A, two boxes side by side:**

Sample proportion p̂ (from a population with proportion p):
```
μ_p̂ = p
σ_p̂ = √[ p(1 − p) / n ]
Approx. normal when  np ≥ 10  and  n(1 − p) ≥ 10
```

Sample mean x̄ (from a population with mean μ, SD σ):
```
μ_x̄ = μ
σ_x̄ = σ / √n
Normal if population is normal, or by CLT when n ≥ 30
```

Under both: the **10% condition**, `n < 0.10·N`, in a shared box (needed so draws are close enough to independent).

**Zone B:** the **parameter vs statistic table** (write §2.4's rule here in full):

| | Parameter | Statistic |
|---|---|---|
| Mean | μ | x̄ |
| SD | σ | s |
| Proportion | p | p̂ |
| Slope | β | b |

Plus: **unbiased** = the sampling distribution is centered at the parameter; **variability shrinks with √n** (quadrupling n halves the SD).

**Zone C:** *"The sampling distribution of [statistic] is the distribution of [statistic] from all possible samples of size n."*

**Zone D:** "It is the **sample size** n that matters, not the population size N." "σ_x̄ = σ/√n needs σ, the population SD; when you only have s you are estimating (see P13)."

---

### P09 · Confidence Intervals: the Master Recipe — Unit 3 (orange, with purple + red sub-stripes)

**Covers:** new 3.3, 3.4, 3.10, 3.11, 4.2, 4.3, 4.7, 4.8 · old 6.2–6.3, 6.8–6.9, 7.2–7.3, 7.6–7.7
**Cartridge ids:** `ci-formula`, `margin-error`, `width-ci`, `random-condition`, `ten-pct-condition`, `normal-condition`

**Zone A:**

```
statistic  ±  (critical value) × (standard error of the statistic)
                └────────── margin of error ──────────┘
ME = z*·SE   (proportions)      ME = t*·SE   (means)
Width ∝ 1/√n     → to halve the margin, quadruple n
```

A small **z\* table** in a box: 90% → 1.645, 95% → 1.960, 99% → 2.576. (t\* comes from the table/calculator with df; say so.)

Then the **four-step frame** as a vertical checklist with big numbers: **1 State** (parameter, in context) · **2 Plan** (name the interval, check conditions) · **3 Do** (formula, numbers, interval) · **4 Conclude** (interpret in context). Use whatever step names you use in class; keep them identical on P10.

**Zone B:** the **conditions strip**, in the fixed order from §2.4:
```
Random:   data from a random sample or randomized experiment
10%:      n < 0.10·N when sampling without replacement
Normal:   proportions → np̂ ≥ 10 and n(1 − p̂) ≥ 10
          means → population normal, or n ≥ 30, or graph shows no strong skew/outliers
```

**Zone C:** two sentence frames, both mandatory:
- Interval: *"We are [C]% confident that the interval from ___ to ___ captures the true [parameter in context]."*
- Confidence level: *"If we took many samples and built an interval each time, about [C]% of those intervals would capture the true [parameter]."*

**Zone D:** "The **interval** sentence is about this interval. The **level** sentence is about the method. Never say the parameter has a 95% chance of being in the interval."

---

### P10 · Significance Tests: the Master Recipe — Unit 3 (orange, with purple + red sub-stripes)

**Covers:** new 3.5–3.8, 3.12, 3.13, 4.4, 4.5, 4.9, 4.10 · old 6.4–6.7, 6.10–6.11, 7.4–7.5, 7.8–7.10
**Cartridge ids:** `z-test-stat`, `p-value-interp`, `type-i-error`, `type-ii-error`, `power`

**Zone A:**

```
test statistic = (statistic − parameter under H₀) / (standard error of the statistic)
```

The same **four-step frame** as P09, with the test versions: **1 State** (H₀ and Hₐ with symbols and in context, α) · **2 Plan** (name the test, conditions) · **3 Do** (statistic, df if any, P-value; draw and shade the curve) · **4 Conclude**.

A boxed **P-value definition**:
```
P-value = P( statistic this extreme or more  |  H₀ true )
```

A **decision box**: `P ≤ α → reject H₀ → convincing evidence for Hₐ` / `P > α → fail to reject H₀ → not convincing evidence for Hₐ`.

**Zone B:** the **error table**, drawn as a 2 × 2 grid with H₀ true / Hₐ true across the top and reject / fail to reject down the side:
```
α = P(Type I) = P(reject H₀ | H₀ true)
β = P(Type II) = P(fail to reject H₀ | Hₐ true)
Power = 1 − β      ↑ with larger n, larger α, or larger true effect
```

**Zone C:** the conclusion frame, word for word: *"Because the P-value of ___ is [less/greater] than α = ___, we [reject / fail to reject] H₀. There [is / is not] convincing evidence that [Hₐ in context]."*

**Zone D:** "Never 'accept' H₀." "Hypotheses are about **parameters** (p, μ), never statistics (p̂, x̄)." "One-sided vs two-sided changes the P-value; decide from the question, not the data."

---

### P11 · Proportions Toolbox — Unit 3 (orange)

**Covers:** new 3.2–3.13 · old 6.1–6.11
**Cartridge ids:** `phat-se`, `one-prop-ci`, `one-prop-z`, `large-counts`, `diff-p-sd`, `diff-p-se`, `two-prop-ci`, `pooled-se`, `two-prop-z`

**Zone A, two boxes (one sample / two samples), each split CI | test:**

One proportion:
```
CI:    p̂ ± z*·√[ p̂(1 − p̂) / n ]
Test:  z = (p̂ − p₀) / √[ p₀(1 − p₀) / n ]        H₀: p = p₀
```

Two proportions:
```
CI:    (p̂₁ − p̂₂) ± z*·√[ p̂₁(1 − p̂₁)/n₁ + p̂₂(1 − p̂₂)/n₂ ]
Test:  z = (p̂₁ − p̂₂) / √[ p̂_c(1 − p̂_c)(1/n₁ + 1/n₂) ]      H₀: p₁ = p₂
       p̂_c = (x₁ + x₂) / (n₁ + n₂)
```

Small side box, "true SD when p is known":
```
σ_(p̂₁−p̂₂) = √[ p₁(1 − p₁)/n₁ + p₂(1 − p₂)/n₂ ]
```

**Zone B:** the **Large Counts check** and which p to use:
```
CI:    np̂ ≥ 10  and  n(1 − p̂) ≥ 10           (use p̂)
Test:  np₀ ≥ 10  and  n(1 − p₀) ≥ 10         (use p₀)
Two-sample test: use p̂_c for both groups
```

**Zone C:** *"We are [C]% confident the true proportion of [context] is between ___ and ___."*

**Zone D:** "CI uses p̂ in the SE; the test uses p₀. Different SEs, on purpose." "Pooled only for the two-sample **test**, never the CI."

---

### P12 · Chi-Square Tests (★ Goodness of Fit) — Unit 3 (orange)

**Covers:** new 3.14, 3.15 · old 8.1, 8.4–8.6
**Cartridge ids:** `chi-sq`, `expected-twoway`, `df-twoway`, `chi-sq-select`, `chi-sq-hyp`, `chi-sq-conditions`, `chi-sq-conclude`, `chi-sq-output`, `std-resid-chi`
**★ corner ids:** `expected-gof`, `df-gof`

**Zone A:**

```
χ² = Σ (O − E)² / E
expected count = (row total × column total) / grand total
df = (rows − 1)(columns − 1)
```

A right-skewed χ² curve sketch with the P-value shaded on the right tail (all χ² P-values are right-tail).

A **which-test selector** as a three-row table:
| Test | Data shape | H₀ says |
|---|---|---|
| Homogeneity | 1 variable, **several populations/treatments** | distribution is the same in every population |
| Independence | 2 variables, **one population** | the two variables are not associated |
| ★ Goodness of fit | 1 variable, claimed proportions | the data fit the claimed distribution |

**Zone B:** O observed, E expected. Conditions: Random · 10% · **all expected counts ≥ 5**. Follow-up: `standardized residual = (O − E) / √E` shows which cells drove the result.

**Zone C:** *"Because the P-value of ___ is [less/greater] than α, we [reject / fail to reject] H₀. There [is / is not] convincing evidence of an association between [var 1] and [var 2] for [population]."*

**Zone D:** "Check **expected**, not observed, counts against 5." "χ² tells you *whether*, not *which*; look at the residuals for *which*."

**★ Beyond the Exam corner:**
```
GOF:  E = n·p₀   for each category,   df = k − 1
```

---

### P13 · Means Toolbox (t procedures) — Unit 4 (purple)

**Covers:** new 4.1–4.10 · old 7.1–7.10
**Cartridge ids:** `xbar-se`, `one-mean-ci`, `one-mean-t`, `paired-t`, `diff-x-sd`, `diff-x-se`, `two-mean-ci`, `two-mean-t`, `df-t`

**Zone A, three boxes:**

One mean:
```
CI:    x̄ ± t*·(s / √n)                 df = n − 1
Test:  t = (x̄ − μ₀) / (s / √n)         H₀: μ = μ₀
```

Paired (matched pairs → work with the differences d):
```
t = (d̄ − μ_d₀) / (s_d / √n)            df = n − 1,  usually H₀: μ_d = 0
```

Two means (independent groups):
```
CI:    (x̄₁ − x̄₂) ± t*·√[ s₁²/n₁ + s₂²/n₂ ]
Test:  t = (x̄₁ − x̄₂) / √[ s₁²/n₁ + s₂²/n₂ ]      H₀: μ₁ = μ₂
       df from calculator, or conservative df = min(n₁ − 1, n₂ − 1)
```

Small side box: true SD when σ is known, `σ_(x̄₁−x̄₂) = √[ σ₁²/n₁ + σ₂²/n₂ ]`, and `s_x̄ = s/√n` labeled "standard error of x̄ (estimates σ/√n from P08)".

**Zone B:** a sketch of a t curve on top of a normal curve, same center, fatter tails, with the caption "**t because we replaced σ with s.** More df → closer to normal." The **Normal/Large Sample** condition for means:
```
population normal,   or   n ≥ 30,   or   graph the data: no strong skew, no outliers
(paired: check the differences; two-sample: check each group)
```

**Zone C:** *"We are [C]% confident the true mean [context] is between ___ and ___ [units]."*

**Zone D:** "**Paired or two-sample?** Same subjects measured twice, or natural pairs → paired. Two separate groups → two-sample. Get this wrong and everything after is wrong." "Never pool variances for two-sample t."

---

### P14 · Scatterplots, Correlation & the LSRL — Unit 5 (red)

**Covers:** new 5.1–5.3, 5.5 · old 2.4–2.6, 2.8
**Cartridge ids:** `corr-r`, `linreg`, `linreg-mean`, `slope-b`, `y-intercept`

**Zone A:**

```
ŷ = a + bx
b = r · (s_y / s_x)          a = ȳ − b·x̄
The LSRL always passes through (x̄, ȳ):   ȳ = a + b·x̄
r = [1/(n − 1)] · Σ [ (xᵢ − x̄)/s_x ] · [ (yᵢ − ȳ)/s_y ]
```

A scatterplot sketch with the LSRL drawn and the point (x̄, ȳ) marked. Beside it, the describe-a-scatterplot list: **Direction · Form · Strength · Unusual points** (with context).

**Zone B:** r properties as a bulleted list: −1 ≤ r ≤ 1 · no units · unchanged by swapping x and y or by changing units · measures **linear** strength only · sensitive to outliers. ŷ is "predicted y", not "y".

**Zone C:** the two mandatory interpretation frames:
- Slope: *"For each additional [1 unit of x], the predicted [y] [increases/decreases] by [b] [units of y]."*
- Intercept: *"When [x] is 0, the predicted [y] is [a] [units]."* (add "which may not make sense in context")

**Zone D:** "Correlation is not causation." "A strong r does not mean the relationship is linear; look at the residual plot (P15)." "Slope has units; r does not."

---

### P15 · Residuals, r², and Model Fit (★ Slope Inference, ★ Departures) — Unit 5 (red)

**Covers:** new 5.4, 5.5 · old 2.7–2.8 · ★ old 2.9, 9.1–9.5
**Cartridge ids:** `residual`, `r-squared`, `resid-s`
**★ corner ids:** `log-transform`, `slope-mean`, `slope-sd`, `slope-se`, `slope-t`, `slope-ci`

**Zone A:**

```
residual = y − ŷ = actual − predicted
r² = fraction of the variation in y explained by the linear relationship with x
s = √[ Σ (yᵢ − ŷᵢ)² / (n − 2) ]      typical size of a residual
```

Two side-by-side residual plot sketches: **"no pattern → linear model OK"** and **"curved pattern → not linear"**. Mark a positive residual (point above the line) and a negative one.

**Zone B:** a **computer-output decoder**: draw a mock regression printout (Predictor / Coef / SE Coef / T / P rows for Constant and the x variable, plus S and R-Sq) and arrow each number to a, b, SE(b), t, P-value, s, r². Students read these on every exam.

**Zone C:** r² frame: *"About [r²]% of the variation in [y] is explained by the linear relationship with [x]."* Residual frame: *"The actual [y] was [|residual|] [units] [above/below] what the line predicted."*

**Zone D:** "Extrapolation: do not predict outside the x-range of the data." "r² does not tell you the direction; r does."

**★ Beyond the Exam corner (gold border):**
```
Departures: outliers, high-leverage (extreme x), influential points (removing them changes the line)
Log transform: log(ŷ) = a + bx  ⇒  ŷ = 10^(a + bx)
Slope inference (df = n − 2):
   μ_b = β        σ_b = σ / (σ_x·√n)        s_b = s / (s_x·√(n − 1))
   t = b / s_b               b ± t*·s_b
```

---

## 4. Build order and hanging plan

Build in teaching order so the wall is never behind the class. Poster days already exist in the schedule at every unit boundary (`data/lesson-schedule.json`, `posters`), so the per-unit set should be up **before** that unit's poster day.

| Batch | Posters | Up before |
|---|---|---|
| 1 | P01, P02, P03 | Unit 1 poster day |
| 2 | P04, P05, P06, P07, P08 | Unit 2 poster day (P08 can go up last; it is not needed until 2.12) |
| 3 | P09, P10 first, then P11, P12 | Unit 3 poster day. P09/P10 go up the day 3.3 starts and never come down |
| 4 | P13 | Unit 4 poster day |
| 5 | P14, P15 | Unit 5 poster day |

**Hanging:** one wall, left to right in unit order, unit color stripes making five visible bands. P08 (sampling distributions), P09 (CI recipe) and P10 (test recipe) go at eye level in the middle of the inference band; everything else can go higher. If wall space is short, P01 and P04 are the first to retire to a side wall after Unit 2.

---

## 5. QA checklist (run per poster before inking, again after)

- [ ] Title lettering 3 in, formulas ≥ 1.5 in, key ≥ 0.75 in. Read it from the back row.
- [ ] Unit stripe color matches §2.3. ★ corner has the gold border if §3 lists ★ ids.
- [ ] Every cartridge id listed for this poster in §3 appears as a formula (tick them in §6).
- [ ] Every formula matches the cartridge/formula sheet symbol for symbol (hats, bars, subscripts, n − 1 vs n − 2).
- [ ] Every t or χ² formula has its df beside it.
- [ ] Conditions are in the fixed order Random → 10% → Normal/Large Counts.
- [ ] Every sentence frame has blanks for the number **and** the context.
- [ ] Zone D has at least one common mistake, phrased as a rule, not a warning.
- [ ] Bottom-right "see WS old u#_l#" tag is present and points at the right old unit.
- [ ] Nothing on the poster names a skill code or a Big Idea (VAR/UNC/DAT).
- [ ] Photograph the finished poster and drop the photo in `u_posters/` (new folder) so it can be re-made if damaged.

---

## 6. Coverage matrix — all 81 cartridge formula ids → one poster

Tick each id when it is on the wall. ★ marks Beyond the Exam (goes in a ★ corner).

| id | Poster | | id | Poster | | id | Poster |
|---|---|---|---|---|---|---|---|
| `mean` | P02 | | `binom-mean` | P06 | | `one-prop-ci` | P11 |
| `std-dev` | P02 | | `binom-sd` | P06 | | `one-prop-z` | P11 |
| `variance` | P02 | | `lincomb-mean` ★ | P06 | | `large-counts` | P11 |
| `iqr` | P02 | | `lincomb-var` ★ | P06 | | `diff-p-sd` | P11 |
| `outlier-iqr` | P02 | | `geom-pmf` ★ | P06 | | `diff-p-se` | P11 |
| `random-condition` | P03, P09 | | `geom-mean` ★ | P06 | | `two-prop-ci` | P11 |
| `complement` | P05 | | `geom-sd` ★ | P06 | | `pooled-se` | P11 |
| `add-rule` | P05 | | `zscore` | P07 | | `two-prop-z` | P11 |
| `cond-prob` | P05 | | `empirical-rule` | P07 | | `chi-sq` | P12 |
| `mult-rule` | P05 | | `phat-mean` | P08 | | `expected-twoway` | P12 |
| `mult-independent` | P05 | | `phat-sd` | P08 | | `df-twoway` | P12 |
| `rv-mean` | P06 | | `xbar-mean` | P08 | | `chi-sq-select` | P12 |
| `rv-sd` | P06 | | `xbar-sd` | P08 | | `chi-sq-hyp` | P12 |
| `lintransform` | P06 | | `ci-formula` | P09 | | `chi-sq-conditions` | P12 |
| `binom-pmf` | P06 | | `margin-error` | P09 | | `chi-sq-conclude` | P12 |
| `width-ci` | P09 | | `ten-pct-condition` | P08, P09 | | `chi-sq-output` | P12 |
| `normal-condition` | P09 | | `z-test-stat` | P10 | | `std-resid-chi` | P12 |
| `p-value-interp` | P10 | | `type-i-error` | P10 | | `expected-gof` ★ | P12 |
| `type-ii-error` | P10 | | `power` | P10 | | `df-gof` ★ | P12 |
| `phat-se` | P11 | | `xbar-se` | P13 | | `one-mean-ci` | P13 |
| `one-mean-t` | P13 | | `paired-t` | P13 | | `diff-x-sd` | P13 |
| `diff-x-se` | P13 | | `two-mean-ci` | P13 | | `two-mean-t` | P13 |
| `df-t` | P13 | | `corr-r` | P14 | | `linreg` | P14 |
| `linreg-mean` | P14 | | `slope-b` | P14 | | `y-intercept` | P14 |
| `residual` | P15 | | `r-squared` | P15 | | `resid-s` | P15 |
| `log-transform` ★ | P15 | | `slope-mean` ★ | P15 | | `slope-sd` ★ | P15 |
| `slope-se` ★ | P15 | | `slope-t` ★ | P15 | | `slope-ci` ★ | P15 |

Count check: 81 ids, 81 rows (two ids appear on two posters by design: `random-condition`, `ten-pct-condition`).

**Concept-only coverage** (no cartridge id, checked in §3): displays and shape vocabulary (P01), sampling/bias/design and scope of inference (P03), two-way tables and conditional distributions (P04), simulation recipe (P05), BINS (P06), parameter-vs-statistic table and unbiasedness (P08), four-step frames and all interpretation sentences (P09, P10), t-vs-normal picture and paired-vs-two-sample decision (P13), DFSU scatterplot description and r properties (P14), residual plots and computer-output decoder (P15).

---

## 7. Optional 16th poster — "Which procedure?" chooser

Only if there is wall space after the 15. A single flowchart:

1. **What kind of data?** categorical → proportions or counts; quantitative → means; two quantitative → regression.
2. **How many groups?** one / two / many (many categorical → χ²).
3. **Paired?** (quantitative, two measurements per subject) → paired t.
4. **Estimate or test?** → CI (P09) or significance test (P10).
5. Leaf boxes name the procedure and point to P11, P12, P13, or P15.

This is the poster students look at during the free-response section of the practice exam. It does not introduce any new formula, so it is not required for §6 coverage.

---

## 8. Open items (teacher decisions, not blockers)

- Confirm the five official Fall-2026 unit titles from the CED PDF before lettering the stripes (§1.1 uses working titles).
- Confirm the four-step step names used in class (State/Plan/Do/Conclude or Hypotheses/Conditions/Calculation/Conclusion). P09 and P10 must match each other.
- Decide whether P03's ★ corner (simulation-based significance) is worth the space; it was demoted to bonus on 2026-08-07 and can be dropped without affecting §6 coverage.
