# TI-84 Trainer — Answer Verification Spec

**Date**: 2026-04-09
**Status**: Spec
**Files to modify**: `ti84-trainer-v2/app.js`, `ti84-trainer-v2/style.css`
**Rebuild after**: `node ti84-trainer-v2/build.mjs`

---

## Goal

Add a "Check Your Answer" step where students enter key numeric results from their calculator. The app computes expected values via stat-math.js and verifies with tolerance. Works for both CEmu walkthrough users and students on a physical TI-84.

---

## Two Modes

### Mode A: Post-Walkthrough Verification

Appears during the **result-review phase** (clutch disengaged), replacing the current bare "Finish review" button.

Flow:
1. Student completes procedure walkthrough (all steps done)
2. `enterResultReviewPhase()` fires
3. Result-review panel now shows a **"Check Your Answer"** card with labeled input fields
4. Student reads their calculator LCD (CEmu or physical) and types key values
5. App computes expected values from problem data via stat-math.js
6. Compares with tolerance → field-by-field green check / red X feedback
7. All correct → "Finish review" button enables, walkthrough complete
8. Wrong → feedback shown, student can re-enter (unlimited retries)

### Mode B: Standalone Practice (no walkthrough)

A new entry point from the start/dashboard screen. Student sees:
1. Problem stem (from canonical problems)
2. "Do this on your calculator, then enter your answer below"
3. Same answer input card as Mode A
4. No walkthrough, no key guidance — just problem → answer → verify

This is lower priority. Implement Mode A first. Mode B can follow later.

---

## Key Fields Per Procedure

Each procedure type has 1-3 "key fields" the student must enter. These are the values that matter for AP Stats.

```javascript
// Procedure IDs must match ti84-procedures-data.json exactly.
// Full list: one-var-stats, histogram, modified-boxplot, normalcdf, invnorm,
// linreg-a-plus-bx, scatterplot, residual-plot, binompdf, binomcdf,
// geometpdf, geometcdf, normalcdf-sampling, invnorm-sampling,
// one-propztest, one-propzint, t-test-stats, t-test-data,
// t-interval-stats, t-interval-data, two-samp-ttest, two-samp-tint,
// matrix-entry, chi-square-gof-test, chi-square-test, linreg-ttest, linreg-tint

const VERIFICATION_FIELDS = {
  // Tests — ask for test statistic + p-value
  't-test-data':           [{ key: 't', label: 't =' },
                            { key: 'p', label: 'p =' }],
  't-test-stats':          [{ key: 't', label: 't =' },
                            { key: 'p', label: 'p =' }],
  'two-samp-ttest':        [{ key: 't', label: 't =' },
                            { key: 'p', label: 'p =' }],
  'one-propztest':         [{ key: 'z', label: 'z =' },
                            { key: 'p', label: 'p =' }],
  'chi-square-gof-test':   [{ key: 'chi2', label: 'χ² =' },
                            { key: 'p',    label: 'p ='  }],
  'chi-square-test':       [{ key: 'chi2', label: 'χ² =' },
                            { key: 'p',    label: 'p ='  }],
  'linreg-ttest':          [{ key: 't', label: 't =' },
                            { key: 'p', label: 'p =' }],

  // Intervals — ask for bounds
  't-interval-data':       [{ key: 'lower', label: '(' },
                            { key: 'upper', label: ',' }],
  't-interval-stats':      [{ key: 'lower', label: '(' },
                            { key: 'upper', label: ',' }],
  'two-samp-tint':         [{ key: 'lower', label: '(' },
                            { key: 'upper', label: ',' }],
  'one-propzint':          [{ key: 'lower', label: '(' },
                            { key: 'upper', label: ',' }],
  'linreg-tint':           [{ key: 'lower', label: '(' },
                            { key: 'upper', label: ',' }],

  // Descriptive — ask for key summaries
  'one-var-stats':         [{ key: 'xbar', label: 'x̄ =' },
                            { key: 'Sx',   label: 'Sx =' }],

  // Regression — ask for slope, intercept, correlation
  'linreg-a-plus-bx':     [{ key: 'a', label: 'a =' },
                            { key: 'b', label: 'b =' },
                            { key: 'r', label: 'r =' }],

  // Distributions — single value
  'normalcdf':             [{ key: 'value', label: 'P =' }],
  'invnorm':               [{ key: 'value', label: 'z =' }],
  'normalcdf-sampling':    [{ key: 'value', label: 'P =' }],
  'invnorm-sampling':      [{ key: 'value', label: 'z =' }],
  'binompdf':              [{ key: 'value', label: 'P =' }],
  'binomcdf':              [{ key: 'value', label: 'P =' }],
  'geometpdf':             [{ key: 'value', label: 'P =' }],
  'geometcdf':             [{ key: 'value', label: 'P =' }],

  // No verification (graph-only or data entry):
  // histogram, modified-boxplot, scatterplot, residual-plot, matrix-entry
};
```

### Procedures WITHOUT numeric verification (graph-only)

These produce visual output, not numeric results. Skip verification:
- `histogram`
- `modified-boxplot`
- `scatterplot`
- `residual-plot`

For these, the result-review phase stays as-is (no answer card, just "Finish review").

---

## Computing Expected Values

### Mapping procedure → stat-math function

The native module's `StatMath` object (exposed as `window.TI84StatMath` in standalone build, or available via `app.bridge.native.statMath` if native backend is wired) has all the needed functions.

For each procedure, compute expected results from the problem's sample values:

```javascript
function computeExpected(procedureId, problem) {
  const v = problem.values || problem;
  const SM = getStatMath(); // however stat-math is accessible

  switch (procedureId) {
    case 'one-var-stats':
      return SM.oneVarStats(v.data || v.L1);

    case 't-test-data':
      const stats = SM.oneVarStats(v.data || v.L1);
      return SM.tTest(v.mu0, stats.xbar, stats.Sx, stats.n, v.direction);
    case 't-test-stats':
      return SM.tTest(v.mu0, v.xbar, v.sx, v.n, v.direction);

    case 't-interval-data':
      const ds = SM.oneVarStats(v.data || v.L1);
      return SM.tInterval(ds.xbar, ds.Sx, ds.n, v.cLevel);
    case 't-interval-stats':
      return SM.tInterval(v.xbar, v.sx, v.n, v.cLevel);

    case 'one-propztest':
      return SM.onePropZTest(v.p0, v.x, v.n, v.direction);
    case 'one-propzint':
      return SM.onePropZInt(v.x, v.n, v.cLevel);

    case 'chi-square-gof-test': {
      const expected = v.expected || v.expected_proportions.map(p => p * v.n);
      return SM.chi2GOFTest(v.observed, expected, v.df);
    }
    case 'chi-square-test':
      return SM.chi2Test(v.observed); // matrix

    case 'linreg-a-plus-bx':
      return SM.linReg(v.L1 || v.x_values, v.L2 || v.y_values);
    case 'linreg-ttest':
      return SM.linRegTTest(v.L1 || v.x_values, v.L2 || v.y_values, null, v.direction);
    case 'linreg-tint':
      return SM.linRegTInt(v.L1 || v.x_values, v.L2 || v.y_values, null, v.cLevel);

    case 'two-samp-ttest':
      return SM.twoSampTTest(v.xbar1||v.x1, v.sx1||v.s1, v.n1, v.xbar2||v.x2, v.sx2||v.s2, v.n2, v.direction, false);
    case 'two-samp-tint':
      return SM.twoSampTInt(v.xbar1||v.x1, v.sx1||v.s1, v.n1, v.xbar2||v.x2, v.sx2||v.s2, v.n2, v.cLevel, false);

    case 'normalcdf':
    case 'normalcdf-sampling':
      return { value: SM.normalcdf(v.lower, v.upper, v.mu || 0, v.sigma || 1) };
    case 'invnorm':
    case 'invnorm-sampling':
      return { value: SM.invNorm(v.area, v.mu || 0, v.sigma || 1, v.tail || 'left') };
    case 'binompdf':
      return { value: SM.binompdf(v.trials, v.p, v.x) };
    case 'binomcdf':
      return { value: SM.binomcdf(v.trials, v.p, v.x) };

    default:
      return null; // no verification for this procedure
  }
}
```

### Accessing stat-math

`window.TI84StatMath` is the global. It's set by `native/stat-math.js` (line 994) and available in standalone.html (line 4418). Access it directly from app.js:

```javascript
const SM = window.TI84StatMath;
```

No wiring needed — it's already loaded before app.js runs in the bundle.

---

## Tolerance Comparison

```javascript
function valuesMatch(actual, expected, key) {
  const a = parseFloat(actual);
  if (isNaN(a)) return false;

  const e = expected;
  if (e === 0) return Math.abs(a) < 1e-6;

  // Relative tolerance: 0.01% — handles 3-4 decimal place rounding
  const relTol = 1e-4;
  // Absolute tolerance: for very small values (p-values near 0)
  const absTol = 1e-6;

  return Math.abs(a - e) <= Math.max(relTol * Math.abs(e), absTol);
}
```

### Edge cases
- P-values displayed as "1E-4" or ".0001" — `parseFloat` handles both
- Negative signs — student may type `-` or `(-)` (TI-84 notation). Strip `(-)` → `-` before parsing
- Leading dots — ".05" is valid, `parseFloat` handles it
- Scientific notation — "2.34E-5" → `parseFloat` handles it

---

## UI Design

### Answer Verification Card

Rendered inside `renderResultReviewPanel()`. Replaces the current minimal content.

```
┌─────────────────────────────────────────┐
│  ✓ Check Your Answer                    │
│                                         │
│  Enter the key values from your result: │
│                                         │
│  t = [__________]  ✓                    │
│  p = [__________]  ✗ Expected: 0.0234   │
│                                         │
│  [ Check ]         [ Finish review ]    │
│                    (disabled until all ✓)│
└─────────────────────────────────────────┘
```

### CSS classes

```
.answer-card          — container (reuse .clutch-card styling base)
.answer-card h3       — "Check Your Answer" header
.answer-field-row     — flex row: label + input + status icon
.answer-input         — number input, monospace font
.answer-status        — ✓ or ✗ icon + expected value on miss
.answer-status.correct — color: var(--good)
.answer-status.wrong   — color: var(--bad)
.answer-hint          — "Expected: X" shown after wrong attempt
```

Style to match System 7 aesthetic (beveled inputs, Chicago font headers).

### Interaction

1. Student types values into inputs
2. Clicks "Check" button (or Enter key submits)
3. Each field shows ✓ (green) or ✗ (red) with expected value on miss
4. If all correct: "Finish review" button enables + celebratory flash
5. If wrong: inputs stay editable, student can retry
6. No attempt limit — the goal is learning, not gatekeeping

### For graph-only procedures

If `VERIFICATION_FIELDS[procedureId]` is undefined, skip the answer card entirely. Show the current result-review panel as-is.

---

## SRS Integration

Answer verification outcome feeds into Track 2 quality:
- All correct on first try → quality bonus (+1)
- Needed retries → neutral (no bonus, no penalty)
- Skipped (if we add a skip option) → slight penalty

This is a FUTURE enhancement. For now, answer verification is informational — it doesn't change the SRS score. The walkthrough quality (errors/hints during procedure) remains the primary Track 2 signal.

---

## Implementation Summary

### app.js changes

1. Add `VERIFICATION_FIELDS` lookup table (const, near top)
2. Add `computeExpected(procedureId, problem)` function
3. Add `valuesMatch(actual, expected, key)` comparator
4. Modify `renderResultReviewPanel()`:
   - Look up fields for current procedure
   - If fields exist: render answer card with labeled inputs + Check button
   - If no fields: render current minimal panel
5. Add click handler for "Check" button:
   - Read input values
   - Compute expected via stat-math
   - Compare each field
   - Update UI with ✓/✗ per field
   - Enable "Finish review" if all match
6. Store verification state on `app.walkthrough` (e.g. `answerVerified: boolean`)

### style.css changes

Add styles for `.answer-card`, `.answer-field-row`, `.answer-input`, `.answer-status` within the existing style structure. Include mobile styles in the 600px breakpoint.

### Rebuild

```bash
node ti84-trainer-v2/build.mjs
```

---

## Testing Checklist

1. Start a t-test walkthrough → complete → answer card appears with t= and p= fields
2. Enter correct values (from CEmu LCD) → both show ✓ → Finish enables
3. Enter wrong t value → shows ✗ with expected → fix → re-check → ✓
4. Start chi2-gof → complete → answer card shows χ²= and p= fields
5. Start 1-Var Stats → complete → answer card shows x̄= and Sx= fields
6. Start histogram → complete → NO answer card, just normal "Finish review"
7. Start linreg → complete → answer card shows a=, b=, r= fields
8. Enter value with scientific notation "2.34E-5" → parses correctly
9. Mobile: answer card inputs are full-width, touch-friendly
10. Enter TI-84 negation "(-)" prefix → parsed as negative number
