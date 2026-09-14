// Auto-generated wrapper for data/formula-probe-map.json so browsers can load
// it via <script src>. The JSON file is the source of truth — re-run the
// generator (or hand-edit both) if you change the mapping.
const FORMULA_PROBE_MAP = {
  "generated": "2026-04-13",
  "source": "Manual per-formula review of EMBEDDED_CURRICULUM (curriculum_render/data/curriculum.js, 817 MCQs), 4 parallel Explore-agent batches. Each formula mapped to 1-3 MCQs that genuinely exercise the formula (not keyword matches).",
  "formulaSource": "tmux-trainer/ap-stats-cartridge.js AP_STATS_CARTRIDGE.commands (81 formulas)",
  "coverageNote": "11 formulas have questionIds:[] and need either re-review or hand-authored probes. See gaps list at bottom.",
  "map": {
    "mean":             { "questionIds": ["U1-L7-Q02", "U4-L8-Q01"], "notes": "U1-L7-Q02 uses sum/n; U4-L8-Q01 computes E(B) from probability distribution" },
    "std-dev":          { "questionIds": ["U1-L10-Q05", "U1-L10-Q06"], "notes": "both use SD; Q06 requires z-score calc with SD" },
    "linreg":           { "questionIds": ["U2-L6-Q03"], "notes": "uses yhat = a + bx to predict" },
    "linreg-mean":      { "questionIds": ["U2-L6-Q01"], "notes": "regression model at point of means" },
    "corr-r":           { "questionIds": ["U2-L5-Q02", "U2-L5-Q05"], "notes": "compute and interpret r" },
    "slope-b":          { "questionIds": ["U2-L8-Q06", "U2-L8-Q02"], "notes": "interpret slope in context; Q06 uses yhat=0.5+1.1L" },
    "zscore":           { "questionIds": ["U1-L10-Q02", "U1-L10-Q03"], "notes": "z = (x-mu)/sigma to find proportions" },
    "iqr":              { "questionIds": ["U1-L7-Q06"], "notes": "Q3-Q1 used for outlier rule" },
    "outlier-iqr":      { "questionIds": ["U1-L7-Q06"], "notes": "1.5*IQR rule" },
    "empirical-rule":   { "questionIds": ["U1-L10-Q05", "U1-L10-Q07"], "notes": "68-95-99.7 application" },
    "residual":         { "questionIds": ["U2-L7-Q01"], "notes": "residual plot analysis, y-yhat" },
    "r-squared":        { "questionIds": ["U2-L8-Q06"], "notes": "36% variation explained -> r^2=0.36 -> r=0.60" },
    "y-intercept":      { "questionIds": ["U2-L8-Q01"], "notes": "interpret a when x=0" },
    "variance":         { "questionIds": ["U4-L8-Q06", "U4-L8-Q02"], "notes": "squared deviations and linear transform" },
    "add-rule":         { "questionIds": ["U4-L4-Q03"], "notes": "P(A U B) = P(A)+P(B)-P(A ^ B)" },
    "cond-prob":        { "questionIds": ["U4-L5-Q02", "U4-L5-Q03"], "notes": "P(A|B) with restricted denominator" },
    "complement":       { "questionIds": ["U4-L4-Q03"], "notes": "P(not A) = 1-P(A)" },
    "mult-rule":        { "questionIds": ["U4-L5-Q01"], "notes": "P(A ^ B) = P(A)*P(B|A)" },
    "mult-independent": { "questionIds": ["U4-L6-Q01"], "notes": "P(A ^ B) = P(A)*P(B) independence check" },

    "rv-mean":          { "questionIds": ["U4-L8-Q04"], "notes": "interpret E(X) in context" },
    "rv-sd":            { "questionIds": ["U4-L8-Q01"], "notes": "SD of random variable under transformation" },
    "binom-pmf":        { "questionIds": ["U4-L10-Q01", "U4-L10-Q02"], "notes": "P(X=k) for binomial" },
    "binom-mean":       { "questionIds": ["U4-L11-Q01", "U4-L11-Q02"], "notes": "mu = np" },
    "binom-sd":         { "questionIds": ["U4-L11-Q03"], "notes": "sigma = sqrt(np(1-p))" },
    "geom-pmf":         { "questionIds": ["U4-L12-Q01", "U4-L12-Q03"], "notes": "(1-p)^(k-1)*p" },
    "geom-mean":        { "questionIds": ["U4-L12-Q04"], "notes": "mu = 1/p" },
    "geom-sd":          { "questionIds": ["U4-L12-Q08"], "notes": "sigma = sqrt(1-p)/p" },
    "lincomb-mean":     { "questionIds": [], "notes": "GAP: no genuine match (sum/diff of RV means)" },
    "lincomb-var":      { "questionIds": ["U4-L9-Q01"], "notes": "variance of sum of independent RVs" },
    "lintransform":     { "questionIds": ["U4-L8-Q02"], "notes": "Y = a+bX effect on mu and sigma" },
    "slope-mean":       { "questionIds": [], "notes": "GAP: sampling distribution mean of slope b" },
    "slope-sd":         { "questionIds": [], "notes": "GAP: true SD of sampling distribution of slope" },
    "slope-se":         { "questionIds": ["U9-L2-Q03", "U9-L2-Q07"], "notes": "SE(b) from computer output" },
    "resid-s":          { "questionIds": [], "notes": "GAP: root mean square error sqrt(sum(y-yhat)^2/(n-2))" },
    "slope-t":          { "questionIds": ["U9-L5-Q02", "U9-L5-Q04"], "notes": "t = b/SE(b)" },
    "slope-ci":         { "questionIds": ["U9-L2-Q03", "U9-L2-Q07"], "notes": "b +/- t*SE(b)" },
    "log-transform":    { "questionIds": ["U2-L9-Q03"], "notes": "back-transform from log scale" },

    "phat-mean":        { "questionIds": ["U5-L5-Q03", "U5-L5-Q04"], "notes": "mean of sampling dist = p" },
    "phat-sd":          { "questionIds": ["U5-L5-Q01", "U5-PC-MCQ-B-Q02"], "notes": "sqrt(p(1-p)/n), uses true p" },
    "phat-se":          { "questionIds": ["U6-L2-Q05", "U6-L2-Q06"], "notes": "sqrt(phat(1-phat)/n) for CI" },
    "diff-p-sd":        { "questionIds": ["U5-L6-MCQ-Q02"], "notes": "SD of p1-p2 independent samples" },
    "diff-p-se":        { "questionIds": ["U6-L8-Q09"], "notes": "SE of p1-p2 for CI, separate p-hats" },
    "pooled-se":        { "questionIds": ["U6-L11-Q02", "U6-L11-Q03", "U6-L11-Q04"], "notes": "pooled phat for two-prop z-TEST" },
    "one-prop-z":       { "questionIds": ["U6-L5-Q01", "U6-L5-Q02"], "notes": "(phat-p0)/sqrt(p0(1-p0)/n)" },
    "two-prop-z":       { "questionIds": ["U6-L11-Q02", "U6-L11-Q03"], "notes": "uses pooled SE" },
    "one-prop-ci":      { "questionIds": ["U6-L2-Q05"], "notes": "phat +/- z* SE" },
    "two-prop-ci":      { "questionIds": ["U6-L8-Q08"], "notes": "separate phats, not pooled" },
    "large-counts":     { "questionIds": ["U5-PC-MCQ-B-Q03", "U5-PC-MCQ-B-Q04"], "notes": "np>=10 and n(1-p)>=10" },
    "xbar-mean":        { "questionIds": ["U5-L7-Q05", "U5-L7-Q09"], "notes": "mean of sampling dist = mu" },
    "xbar-sd":          { "questionIds": ["U5-L7-Q04"], "notes": "sigma/sqrt(n) when sigma known" },
    "xbar-se":          { "questionIds": ["U7-L2-Q06", "U7-L5-Q01", "U7-L5-Q05"], "notes": "Q06 = one-sample t CI (novels, distinguishes s/sqrt(n) from s/sqrt(n-1)); Q01 = one-sample t test statistic (canned corn); Q05 = one-sample t test statistic. Q03 also plausible per Codex but not tagged primary." },
    "diff-x-sd":        { "questionIds": ["U5-L8-Q03"], "notes": "SD of diff in means, sigmas known" },
    "diff-x-se":        { "questionIds": ["U7-L6-Q04"], "notes": "sqrt(s1^2/n1 + s2^2/n2)" },
    "one-mean-t":       { "questionIds": ["U7-L5-Q01"], "notes": "(xbar-mu0)/(s/sqrt(n))" },
    "two-mean-t":       { "questionIds": ["U7-L6-Q04"], "notes": "two-sample t" },
    "paired-t":         { "questionIds": ["U7-L2-Q05"], "notes": "t on differences" },
    "one-mean-ci":      { "questionIds": ["U7-L2-Q06"], "notes": "xbar +/- t* SE" },
    "two-mean-ci":      { "questionIds": ["U7-L6-Q05"], "notes": "diff in means CI" },

    "chi-sq":           { "questionIds": ["U8-L2-Q09", "U8-L3-Q06"], "notes": "sum (O-E)^2/E" },
    "expected-twoway":  { "questionIds": ["U8-L4-Q01", "U8-L4-Q02", "U8-L4-Q03"], "notes": "row*col/total" },
    "expected-gof":     { "questionIds": ["U8-L2-Q01", "U8-L2-Q04"], "notes": "n*p_i" },
    "df-gof":           { "questionIds": ["U8-L3-Q02"], "notes": "k-1" },
    "df-twoway":        { "questionIds": ["U8-L4-Q03"], "notes": "(r-1)(c-1)" },
    "chi-sq-select":    { "questionIds": ["U8-L5-Q02", "U8-L5-Q03"], "notes": "GOF vs homogeneity vs independence" },
    "chi-sq-hyp":       { "questionIds": ["U8-L2-Q05"], "notes": "H0/Ha for chi-square" },
    "chi-sq-conditions":{ "questionIds": ["U8-L2-Q02", "U8-L2-Q06"], "notes": "10% condition + expected >= 5" },
    "chi-sq-conclude":  { "questionIds": ["U8-L3-Q09"], "notes": "compare p to alpha, conclude in context" },
    "chi-sq-output":    { "questionIds": ["U8-L3-Q07"], "notes": "interpret chi-square output" },
    "std-resid-chi":    { "questionIds": [], "notes": "GAP: standardized residual (O-E)/sqrt(E), uncommon" },
    "z-test-stat":      { "questionIds": ["U7-L5-Q01"], "notes": "general (stat-param)/SE structure" },
    "ci-formula":       { "questionIds": ["U6-L2-Q03"], "notes": "estimate +/- crit*SE" },
    "power":            { "questionIds": [], "notes": "GAP: power of a test, 1-beta" },
    "margin-error":     { "questionIds": [], "notes": "GAP: ME = crit*SE computation missing" },
    "width-ci":         { "questionIds": [], "notes": "GAP: sample size for desired ME" },
    "df-t":             { "questionIds": ["U7-L5-Q01"], "notes": "n-1 for one-sample, n-2 for regression" },
    "type-i-error":     { "questionIds": [], "notes": "GAP: alpha, rejecting true H0" },
    "type-ii-error":    { "questionIds": [], "notes": "GAP: beta, failing to reject false H0" },
    "ten-pct-condition":{ "questionIds": ["U6-L2-Q01"], "notes": "n < 10% of population" },
    "random-condition": { "questionIds": ["U6-L2-Q01"], "notes": "random sample/assignment check" },
    "normal-condition": { "questionIds": ["U6-L2-Q02"], "notes": "large counts for normality" },
    "p-value-interp":   { "questionIds": ["U7-L5-Q02", "U7-L5-Q03", "U8-L3-Q06"], "notes": "probability of data given H0 true" }
  },
  "gaps": {
    "hardAuthorNeeded": [
      { "id": "std-resid-chi", "tier": "support", "reason": "specialized chi-square technique, zero curriculum coverage" },
      { "id": "lincomb-mean", "tier": "support", "reason": "mean of linear combination of RVs not found as central focus" },
      { "id": "slope-mean", "tier": "regular", "reason": "sampling distribution mean of slope b not directly tested" },
      { "id": "slope-sd", "tier": "power", "reason": "true SD of slope sampling distribution not directly tested" },
      { "id": "resid-s", "tier": "power", "reason": "root mean square error formula not directly tested" },
      { "id": "power", "tier": "support", "reason": "power of a test conceptually missing" },
      { "id": "margin-error", "tier": "support", "reason": "ME = crit*SE computation missing" },
      { "id": "width-ci", "tier": "support", "reason": "sample size for desired ME missing" },
      { "id": "type-i-error", "tier": "support", "reason": "Type I alpha interpretation missing" },
      { "id": "type-ii-error", "tier": "support", "reason": "Type II beta interpretation missing" }
    ],
    "needsReReview": []
  },
  "coverageSummary": {
    "totalFormulas": 81,
    "tagged": 71,
    "gapsForHandAuthoring": 10,
    "byTier": {
      "core": { "total": 18, "tagged": 18, "gaps": 0 },
      "regular": { "total": 14, "tagged": 13, "gaps": 1 },
      "power": { "total": 14, "tagged": 11, "gaps": 3 },
      "support": { "total": 35, "tagged": 29, "gaps": 6 }
    },
    "withSupplement": {
      "note": "All 10 gaps authored in data/formula-probe-supplement.js. Combined coverage is 81/81.",
      "tagged": 81
    }
  }
};

if (typeof window !== 'undefined') {
  window.FORMULA_PROBE_MAP = FORMULA_PROBE_MAP;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FORMULA_PROBE_MAP;
}
