# TI-84 Plus CE Procedural Trainer — Research & Data Gathering

## Your Role

You are researching and documenting every TI-84 Plus CE keystroke procedure needed for an AP Statistics procedural trainer app. Your output is **structured data** — not code, not prose. The output will feed directly into a webapp that trains students on calculator button sequences.

**Target calculator**: TI-84 Plus CE (color edition, OS 5.x+). The CE uses wizard-based entry for many STAT > TESTS functions (as opposed to the older paste-to-homescreen behavior). Always document the CE wizard path, not the classic TI-84 path.

## What You Must Produce

Create **one output file** in this directory:

**`ti84-procedures-data.json`** — A JSON file containing:
1. All procedures (keystroke sequences with screen states)
2. All micro-skills (shared sub-procedures)
3. The prerequisite DAG
4. The screen state catalog
5. Common errors per procedure

## Deliverable Schema

```json
{
  "meta": {
    "calculator": "TI-84 Plus CE",
    "os_version": "5.x+",
    "research_date": "YYYY-MM-DD",
    "sources": ["list of sources consulted"]
  },

  "keypad": {
    "description": "Map of all keys relevant to AP Stats procedures",
    "keys": [
      {
        "id": "STAT",
        "label": "STAT",
        "row": 3,
        "col": 3,
        "color": "blue",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "2ND",
        "label": "2ND",
        "row": 2,
        "col": 1,
        "color": "yellow",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "2ND_DISTR",
        "label": "DISTR",
        "triggeredBy": ["2ND", "VARS"],
        "description": "2ND + VARS opens the DISTR menu"
      }
    ]
  },

  "screens": [
    {
      "id": "home",
      "type": "home",
      "description": "TI-84 CE home screen, blank with blinking cursor",
      "layout": {
        "rows": 10,
        "cols": 26,
        "content": []
      }
    },
    {
      "id": "stat-menu",
      "type": "menu",
      "description": "STAT menu with EDIT/CALC/TESTS tabs",
      "tabs": ["EDIT", "CALC", "TESTS"],
      "activeTab": "EDIT",
      "items": ["1:Edit...", "2:SortA(", "3:SortD(", "4:ClrList", "5:SetUpEditor"],
      "cursor": 0
    },
    {
      "id": "one-var-stats-wizard",
      "type": "wizard",
      "description": "1-Var Stats setup wizard",
      "fields": [
        { "label": "List", "default": "L1", "type": "list-selector" },
        { "label": "FreqList", "default": "1", "type": "list-selector" },
        { "label": "Calculate", "type": "action-button" }
      ]
    },
    {
      "id": "one-var-stats-result",
      "type": "result",
      "description": "1-Var Stats output, page 1",
      "lines": [
        "x̄ = {value}",
        "Σx = {value}",
        "Σx² = {value}",
        "Sx = {value}",
        "σx = {value}",
        "n = {value}"
      ],
      "scrollable": true,
      "page2_lines": [
        "minX = {value}",
        "Q1 = {value}",
        "Med = {value}",
        "Q3 = {value}",
        "maxX = {value}"
      ]
    }
  ],

  "microSkills": [
    {
      "id": "enter-data-l1",
      "name": "Enter data into L1",
      "skillType": "parameter",
      "description": "Navigate to STAT > EDIT and enter numeric values into list L1",
      "usedBy": ["one-var-stats", "histogram", "boxplot", "linreg"],
      "steps": [
        {
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "1:Edit...",
          "narration": "Press [STAT] to open the Statistics menu. EDIT tab is already selected.",
          "skillType": "navigation"
        },
        {
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "L1 first cell",
          "narration": "Press [ENTER] to open the list editor. Cursor is in L1.",
          "skillType": "confirmation"
        },
        {
          "key": "{number}",
          "screen": "stat-edit-lists-entering",
          "highlight": "L1 entry line",
          "narration": "Type a data value, then press [ENTER] to move to the next row. Repeat for all values.",
          "skillType": "parameter",
          "repeatable": true
        }
      ]
    }
  ],

  "procedures": [
    {
      "id": "one-var-stats",
      "name": "1-Var Stats",
      "unit": 1,
      "category": "descriptive",
      "description": "Calculate summary statistics (mean, SD, 5-number summary) for a single list",
      "prerequisites": ["enter-data-l1", "nav-stat-calc"],
      "assumeDataIn": "L1",
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab active, 1:Edit... highlighted",
          "narration": "Press [STAT] to open the Statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "2ND accesses secondary functions. You want the [STAT] key directly."
            },
            {
              "key": "MATH",
              "feedback": "MATH opens the math menu. The statistics functions are under [STAT]."
            }
          ]
        }
      ],
      "resultInterpretation": {
        "description": "The result screen shows summary statistics",
        "keyOutputs": [
          { "label": "x̄", "meaning": "sample mean" },
          { "label": "Sx", "meaning": "sample standard deviation (s)" },
          { "label": "σx", "meaning": "population standard deviation" },
          { "label": "n", "meaning": "sample size" },
          { "label": "minX", "meaning": "minimum value" },
          { "label": "Q1", "meaning": "first quartile" },
          { "label": "Med", "meaning": "median" },
          { "label": "Q3", "meaning": "third quartile" },
          { "label": "maxX", "meaning": "maximum value" }
        ]
      }
    }
  ],

  "dag": {
    "nodes": [],
    "edges": [
      { "from": "enter-data-l1", "to": "one-var-stats", "type": "prerequisite" },
      { "from": "nav-stat-calc", "to": "one-var-stats", "type": "prerequisite" }
    ]
  }
}
```

## Procedures to Research

Research and document the **complete keystroke sequence** for each procedure below. For every step, record: which key is pressed, what the screen shows after, what is highlighted, and what common wrong keys a student might press.

### Unit 1: Exploring One-Variable Data

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 1 | **1-Var Stats** | Data already in L1 | STAT > CALC > 1. Document both pages of output (x̄/Sx/n AND min/Q1/Med/Q3/max). Note: CE uses wizard with List and FreqList fields. |
| 2 | **Histogram** | Data in L1 | 2ND > STAT PLOT > Plot1 > Type: Histogram > Xlist: L1 > Freq: 1 > ZOOM > 9:ZoomStat. Document window settings and TRACE behavior. |
| 3 | **Boxplot (modified)** | Data in L1 | 2ND > STAT PLOT > Plot1 > Type: Modified Boxplot (4th icon) > Xlist: L1 > Freq: 1 > ZOOM > 9:ZoomStat. Document TRACE showing 5-number summary. |
| 4 | **normalcdf** | No data entry needed | 2ND > DISTR > 2:normalcdf. CE wizard: lower, upper, μ, σ. Document the wizard fields and what the result screen shows. |
| 5 | **invNorm** | No data entry needed | 2ND > DISTR > 3:invNorm. CE wizard: area, μ, σ, tail (LEFT/CENTER/RIGHT). Note: CE added tail selector that classic TI-84 didn't have. |

### Unit 2: Exploring Two-Variable Data

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 6 | **LinReg(ax+b)** | Paired data in L1/L2 | STAT > CALC > 8:LinReg(a+bx). CE wizard: Xlist, Ylist, FreqList, Store RegEQ. Document output: a, b, r², r. Note: r and r² only display if DiagnosticOn has been run. Document how to turn diagnostics on (2ND > CATALOG > DiagnosticOn > ENTER). |
| 7 | **Scatterplot** | Paired data in L1/L2 | 2ND > STAT PLOT > Plot1 > Type: Scatter (1st icon) > Xlist: L1 > Ylist: L2 > ZOOM > 9:ZoomStat |
| 8 | **Residual plot** | After running LinReg | STAT PLOT > Scatter > Xlist: L1 > Ylist: RESID (2ND > LIST > RESID) > ZOOM > 9:ZoomStat. Document how to access RESID list. |

### Unit 4: Probability & Distributions

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 9 | **binompdf** | No data entry | 2ND > DISTR > scroll to B:binompdf. CE wizard: n (trials), p (probability), x (value). Single probability P(X=x). |
| 10 | **binomcdf** | No data entry | 2ND > DISTR > scroll to C:binomcdf. CE wizard: n, p, x. Cumulative probability P(X≤x). |
| 11 | **geometpdf** | No data entry | 2ND > DISTR > scroll to E:geometpdf. CE wizard: p, x. Probability of first success on trial x. |
| 12 | **geometcdf** | No data entry | 2ND > DISTR > scroll to F:geometcdf. CE wizard: p, x. Cumulative probability P(X≤x). |

### Unit 5: Sampling Distributions

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 13 | **normalcdf for sampling dist** | Parameters calculated by hand (μ, σ/√n) | Same as #4 but with SE as σ. Document that students must compute SE by hand first, then enter it. Show the parameter mapping. |
| 14 | **invNorm for sampling dist** | Parameters calculated by hand | Same as #5 but with SE. Document parameter mapping. |

### Unit 6: Inference for Proportions

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 15 | **1-PropZTest** | Summary stats known | STAT > TESTS > 5:1-PropZTest. CE wizard: p₀, x, n, prop (≠p₀ / <p₀ / >p₀). Document Calculate vs Draw options. Document result screen: z, p-value, p̂, n. |
| 16 | **1-PropZInt** | Summary stats known | STAT > TESTS > A:1-PropZInt. CE wizard: x, n, C-Level. Document result: CI bounds, p̂, n. |

### Unit 7: Inference for Means

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 17 | **T-Test (Stats input)** | Summary stats known | STAT > TESTS > 2:T-Test. Input: Stats. CE wizard: μ₀, x̄, Sx, n, μ (≠μ₀/<μ₀/>μ₀). Result: t, p, x̄, Sx, n. |
| 18 | **T-Test (Data input)** | Raw data in L1 | Same path but Input: Data. CE wizard: μ₀, List, Freq, μ direction. |
| 19 | **TInterval (Stats)** | Summary stats | STAT > TESTS > 8:TInterval. Input: Stats. CE wizard: x̄, Sx, n, C-Level. Result: CI bounds, x̄, Sx, n, df. |
| 20 | **TInterval (Data)** | Raw data in L1 | Same path but Input: Data. |
| 21 | **2-SampTTest** | Summary stats for both groups | STAT > TESTS > 4:2-SampTTest. Input: Stats. Wizard: x̄1, Sx1, n1, x̄2, Sx2, n2, μ1 direction, Pooled (Yes/No). |
| 22 | **2-SampTInt** | Summary stats for both groups | STAT > TESTS > 0:2-SampTInt. Input: Stats. Wizard: x̄1, Sx1, n1, x̄2, Sx2, n2, C-Level, Pooled. |

### Unit 8: Chi-Square

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 23 | **Enter matrix** | Observed counts ready | 2ND > MATRIX (above x⁻¹) > EDIT > 1:[A]. Set dimensions (rows × cols). Enter values. **This is a critical micro-skill — document every keystroke of matrix entry.** |
| 24 | **χ²GOF-Test** | Observed in L1, Expected in L2 | STAT > TESTS > D:χ²GOF-Test. CE wizard: Observed list, Expected list, df. Note: GOF uses lists, not matrices. |
| 25 | **χ²-Test (independence/homogeneity)** | Observed matrix in [A] | STAT > TESTS > C:χ²-Test. CE wizard: Observed matrix [A], Expected matrix [B] (auto-calculated). Result: χ², p, df. |

### Unit 9: Regression Inference

| # | Procedure | Starting assumption | Key details to capture |
|---|-----------|-------------------|----------------------|
| 26 | **LinRegTTest** | Paired data in L1/L2 | STAT > TESTS > F:LinRegTTest. CE wizard: Xlist, Ylist, Freq, β and ρ (≠0/<0/>0), RegEQ. Result: t, p, df, a, b, s, r², r. |
| 27 | **LinRegTInt** | Paired data in L1/L2 | STAT > TESTS > G:LinRegTInt. CE wizard: Xlist, Ylist, Freq, C-Level, RegEQ. Result: CI for slope, df, a, b, s, r², r. |

## Micro-Skills to Research

For each micro-skill, document the same step-by-step format as procedures. These are reusable building blocks.

| # | Micro-Skill | Description | Used by (procedure IDs) |
|---|-------------|-------------|------------------------|
| M1 | **enter-data-l1** | Enter data values into list L1 | 1-5, 6-8 |
| M2 | **enter-data-l1-l2** | Enter paired x,y data into L1 and L2 | 6-8, 26-27 |
| M3 | **clear-lists** | Clear data from lists before entering new data | All list-based |
| M4 | **nav-stat-edit** | Open STAT > EDIT (list editor) | All list-based |
| M5 | **nav-stat-calc** | Open STAT > CALC menu | 1, 6 |
| M6 | **nav-stat-tests** | Open STAT > TESTS menu | 15-27 |
| M7 | **nav-2nd-distr** | Open 2ND > DISTR menu | 4-5, 9-14 |
| M8 | **nav-2nd-statplot** | Open 2ND > STAT PLOT menu | 2-3, 7-8 |
| M9 | **select-data-vs-stats** | Toggle between Data and Stats input in test/CI wizards | 17-22 |
| M10 | **enter-matrix** | Enter values into a matrix via 2ND > MATRIX > EDIT | 23, 25 |
| M11 | **set-plot-type** | Set STAT PLOT type (scatter, histogram, boxplot) | 2-3, 7-8 |
| M12 | **zoom-stat** | Execute ZoomStat (ZOOM > 9) to auto-scale graph window | 2-3, 7-8 |
| M13 | **diagnostic-on** | Turn on correlation display via 2ND > CATALOG > DiagnosticOn | 6 |
| M14 | **access-resid-list** | Access the RESID list from 2ND > LIST > NAMES | 8 |
| M15 | **select-alternative** | Choose alternative hypothesis direction (≠, <, >) in test wizards | 15, 17-18, 21, 26 |
| M16 | **calculate-vs-draw** | Choose Calculate vs Draw on test/CI result | 15-27 |

## Research Guidelines

### Sources to consult

1. **TI-84 Plus CE official guidebook** (ti.com documentation, PDF)
2. **TI-84 Plus CE Getting Started guide**
3. **AP Statistics exam reference materials** (for parameter names and notation matching)
4. YouTube walkthroughs of TI-84 CE procedures (for visual confirmation of screen states)
5. Common AP Stats textbook calculator appendices (e.g., The Practice of Statistics, Stats: Modeling the World)

### For each procedure step, record

1. **Key pressed** — exact key name as printed on the TI-84 CE (use standard names: STAT, 2ND, ENTER, ALPHA, arrow keys as UP/DOWN/LEFT/RIGHT)
2. **Screen after** — what the display shows (menu items, wizard fields, results, cursor position)
3. **What is highlighted** — which menu item, field, or button has the cursor/selection
4. **Narration** — one sentence explaining what this step does and why
5. **Skill type** — "navigation" (choosing menus/tabs), "parameter" (entering values/selecting options), or "confirmation" (pressing ENTER to execute)
6. **Common errors** — 1-3 wrong keys students commonly press at this step, with corrective feedback text

### Key accuracy requirements

- **Menu item numbering**: Get the exact number/letter prefix for each menu item (e.g., is 1-PropZTest item 5 or 6 in the TESTS menu on CE? It matters.)
- **Wizard field names**: Use the exact labels shown on the CE screen (e.g., does it say "p₀" or "p0" or "p_0"?)
- **Wizard field order**: Top to bottom, as they appear on the CE
- **Result screen labels**: Exact labels and order (e.g., "z=" vs "z =" vs "z-stat=")
- **Tab names**: Exact tab labels (EDIT / CALC / TESTS for STAT menu)
- **2ND key combos**: Which physical key is the 2ND target? (e.g., DISTR is 2ND + VARS, STAT PLOT is 2ND + Y=)

### CE-specific details to verify

The TI-84 Plus CE differs from the classic TI-84 Plus in several ways:
- **Wizard-based entry** for DISTR functions (normalcdf, etc.) — CE shows a form with labeled fields instead of pasting `normalcdf(` to home screen
- **Wizard-based entry** for STAT > TESTS functions
- **invNorm tail selector** — CE added LEFT/CENTER/RIGHT tail option
- **Color screen** — affects how menus and results are displayed
- **Menu letter assignments** may differ (verify each letter/number for TESTS and DISTR menus)

### Output quality checklist

Before submitting, verify:
- [ ] Every procedure has complete step-by-step keystroke sequence from home screen to result
- [ ] Every screen state has enough detail to render a mid-fidelity simulator
- [ ] Every micro-skill has its own step sequence
- [ ] DAG edges connect micro-skills to all procedures that use them
- [ ] Common errors are populated for at least the first 2 steps of every procedure
- [ ] All menu item numbers/letters are verified for TI-84 Plus CE (not classic TI-84)
- [ ] Wizard field names match exactly what the CE displays
- [ ] Result screen labels and order match what the CE displays
- [ ] The `sources` field in metadata lists all references consulted

## Context: Why This Matters

This data feeds a webapp that trains AP Statistics students on mechanical calculator fluency. Students currently learn formulas (via tower defense game) and interpretation (via drill platform), but have no systematic way to practice the physical act of navigating the TI-84. On exam day, fumbling through menus costs time and confidence. This trainer closes that gap.

The output must be **accurate enough that a student following the documented steps on a real TI-84 Plus CE would see the same screens described in the data**. Inaccurate menu numbers or wrong wizard field names would train students on incorrect procedures — worse than no training at all.
