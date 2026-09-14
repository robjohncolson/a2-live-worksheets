window.FRQ_DECOMPOSITIONS = {
  "U1-PC-FRQ-Q02": {
    "unit": 1,
    "topic": "Calculating z-scores and comparing tail probabilities across two normal distributions",
    "skills": [
      {
        "id": "u1-frq-zscore",
        "name": "Compute both z-scores",
        "whyItMatters": "Part (a) awards credit only when both z-scores are computed correctly, labeled to the correct region, and supported with work.",
        "supportingFormulas": [
          "zscore"
        ],
        "supportingMcqIds": [
          "U1-L10-Q02",
          "U1-L10-Q03"
        ]
      },
      {
        "id": "u1-frq-tail-comparison",
        "name": "Compare normal tail chances",
        "whyItMatters": "Part (b) requires more than naming the southern region; the rubric rewards a direct comparison of the z-scores or the corresponding normal-curve proportions.",
        "supportingFormulas": [
          "zscore"
        ],
        "supportingMcqIds": [
          "U1-L10-Q05",
          "U1-L10-Q07"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U2-PC-FRQ-Q02": {
    "unit": 2,
    "topic": "Calculating residuals, interpreting residual spread, and using normal residuals to judge surprise",
    "skills": [
      {
        "id": "u2-frq-residual-calc",
        "name": "Compute a residual correctly",
        "whyItMatters": "Part (a) requires finding the predicted height from the regression line, subtracting predicted from actual in the correct order, and interpreting the sign in context.",
        "supportingFormulas": [
          "residual",
          "linreg"
        ],
        "supportingMcqIds": [
          "U2-L7-Q01",
          "U2-L6-Q03"
        ]
      },
      {
        "id": "u2-frq-residual-spread",
        "name": "Interpret residual standard deviation",
        "whyItMatters": "Part (b) rewards treating s as the typical prediction error, not as spread in heights or foot lengths.",
        "supportingFormulas": [
          "resid-s"
        ],
        "supportingMcqIds": [
          "U9-L1-QS1"
        ]
      },
      {
        "id": "u2-frq-normal-tail",
        "name": "Use normal residual model",
        "whyItMatters": "Part (c) depends on standardizing a residual of 8 cm and finding the correct upper-tail percentage from the normal model.",
        "supportingFormulas": [
          "zscore"
        ],
        "supportingMcqIds": [
          "U1-L10-Q02",
          "U1-L10-Q03"
        ]
      },
      {
        "id": "u2-frq-surprising-case",
        "name": "Judge whether a case surprises",
        "whyItMatters": "Part (d) earns credit by converting 165 cm into the needed residual, linking that cutoff to part (c), and deciding whether the event is unusual.",
        "supportingFormulas": [
          "residual",
          "zscore"
        ],
        "supportingMcqIds": [
          "U2-L7-Q01",
          "U1-L10-Q02"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U3-PC-FRQ-Q01": {
    "unit": 3,
    "topic": "Distinguishing generalization and causation from volunteer experiments versus random-sample observational studies",
    "skills": [
      {
        "id": "u3-frq-generalization",
        "name": "Match method to population",
        "whyItMatters": "Part (a) awards separate components for naming the correct population of generalization for each method and justifying it from how participants were obtained.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      },
      {
        "id": "u3-frq-causal-claims",
        "name": "Justify causal claims",
        "whyItMatters": "Part (b) rewards a cause-and-effect conclusion only for method I, with justification based on random assignment of exercise conditions.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      }
    ],
    "maxPenalty": 0.50
  },
  "U4-PC-FRQ-Q02": {
    "unit": 4,
    "topic": "Computing distribution probabilities and comparing golf strategies with expected values and break-even thresholds",
    "skills": [
      {
        "id": "u4-frq-distribution-prob",
        "name": "Add outcome probabilities",
        "whyItMatters": "Part (a) gives credit for summing the relevant probabilities from the table to get P(X <= 5) and showing that setup.",
        "supportingFormulas": [
          "add-rule"
        ],
        "supportingMcqIds": [
          "U4-L4-Q03"
        ]
      },
      {
        "id": "u4-frq-expected-value",
        "name": "Compute expected score",
        "whyItMatters": "Part (b) rewards a correct weighted-average calculation of E(X) and an interpretation that treats the result as Miguel's long-run average score.",
        "supportingFormulas": [
          "rv-mean"
        ],
        "supportingMcqIds": [
          "U4-L8-Q04"
        ]
      },
      {
        "id": "u4-frq-strategy-ev",
        "name": "Compare strategy expected values",
        "whyItMatters": "Part (c) requires weighting the successful and failed long-hit outcomes by their probabilities and choosing the lower expected score.",
        "supportingFormulas": [
          "rv-mean"
        ],
        "supportingMcqIds": [
          "U4-L8-Q04",
          "U4-L9-QS1"
        ]
      },
      {
        "id": "u4-frq-break-even-p",
        "name": "Solve break-even probability",
        "whyItMatters": "Part (d) awards a correct expected-value expression in terms of p, the comparison to 4.55, and the inequality that identifies when the long hit is better.",
        "supportingFormulas": [
          "rv-mean"
        ],
        "supportingMcqIds": [
          "U4-L8-Q04",
          "U4-L9-QS1"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U5-PC-FRQ-Q02": {
    "unit": 5,
    "topic": "Estimating probabilities from displays, using CLT, and comparing estimator bias and variability",
    "skills": [
      {
        "id": "u5-frq-histogram-prob",
        "name": "Estimate probability from histogram",
        "whyItMatters": "Part (a) specifically rewards reading relative frequency from the histogram bars; using a normal model instead misses the point.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      },
      {
        "id": "u5-frq-clt-xbar",
        "name": "Use CLT for x-bar",
        "whyItMatters": "Part (b) requires an approximately normal model for x-bar with mean 403,000 and standard deviation 278,000/sqrt(40) before finding the left-tail probability.",
        "supportingFormulas": [
          "xbar-mean",
          "xbar-sd",
          "zscore"
        ],
        "supportingMcqIds": [
          "U5-L7-Q05",
          "U5-L7-Q04",
          "U1-L10-Q02"
        ]
      },
      {
        "id": "u5-frq-midrange-choice",
        "name": "Compute and defend midrange",
        "whyItMatters": "Part (c) awards the correct sample midrange and a plausible reason someone might prefer it, such as easier computation.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      },
      {
        "id": "u5-frq-estimator-comparison",
        "name": "Compare bias and variability",
        "whyItMatters": "Part (d) earns credit by citing numerical evidence that the sample midrange is biased (mean of sampling distribution $617K vs population mean $403K) or more variable (SD $136K vs $44K for the sample mean). One well-supported argument is sufficient; the cartridge has no midrange card, so this skill is intentionally tool-free.",
        "supportingFormulas": [],
        "supportingMcqIds": [
          "U5-L7-Q05",
          "U5-L7-Q04",
          "U5-L7-Q09"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U6-PC-FRQ-Q01": {
    "unit": 6,
    "topic": "Constructing, interpreting, and using a one-proportion confidence interval to assess a claimed proportion",
    "skills": [
      {
        "id": "u6-frq-conditions",
        "name": "Check interval conditions",
        "whyItMatters": "Step 1 awards identifying the one-proportion z interval and checking random sampling plus the large-counts condition; the 10% condition strengthens the setup.",
        "supportingFormulas": [
          "random-condition",
          "normal-condition",
          "ten-pct-condition"
        ],
        "supportingMcqIds": [
          "U6-L2-Q01",
          "U6-L2-Q02"
        ]
      },
      {
        "id": "u6-frq-construct-ci",
        "name": "Construct the z interval",
        "whyItMatters": "Step 2 requires the correct standard error, 95% critical value, and numerical interval with work.",
        "supportingFormulas": [
          "one-prop-ci",
          "phat-se"
        ],
        "supportingMcqIds": [
          "U6-L2-Q05"
        ]
      },
      {
        "id": "u6-frq-interpret-ci",
        "name": "Interpret interval in context",
        "whyItMatters": "Step 3 earns credit only when the interval is described as estimating the population proportion of all people in the United States with 95% confidence.",
        "supportingFormulas": [
          "ci-formula",
          "one-prop-ci"
        ],
        "supportingMcqIds": [
          "U6-L2-Q03",
          "U6-L2-Q05"
        ]
      },
      {
        "id": "u6-frq-claim-check",
        "name": "Use interval to judge claim",
        "whyItMatters": "Part (b) depends on checking whether 33% lies inside the interval and explicitly tying the conclusion back to the interval from part (a).",
        "supportingFormulas": [
          "one-prop-ci"
        ],
        "supportingMcqIds": [
          "U6-L2-Q03"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U7-PC-FRQ-Q02": {
    "unit": 7,
    "topic": "Constructing and interpreting a one-sample t interval while respecting the sample's scope",
    "skills": [
      {
        "id": "u7-frq-conditions",
        "name": "Check t interval conditions",
        "whyItMatters": "The setup point requires identifying a one-sample t interval, checking random sampling, and justifying approximate normality with n > 30 or a roughly normal stemplot.",
        "supportingFormulas": [
          "random-condition",
          "normal-condition"
        ],
        "supportingMcqIds": [
          "U6-L2-Q01",
          "U6-L2-Q02"
        ]
      },
      {
        "id": "u7-frq-construct-ci",
        "name": "Construct the t interval",
        "whyItMatters": "The calculation point comes from using s/sqrt(n), the correct degrees of freedom, an appropriate t* value, and the resulting interval.",
        "supportingFormulas": [
          "one-mean-ci",
          "xbar-se",
          "df-t"
        ],
        "supportingMcqIds": [
          "U7-L2-Q06",
          "U7-L5-Q01"
        ]
      },
      {
        "id": "u7-frq-interpret-ci",
        "name": "Interpret mean interval correctly",
        "whyItMatters": "The rubric rewards an interpretation that names the population mean, uses context, and states 95% confidence.",
        "supportingFormulas": [
          "ci-formula",
          "one-mean-ci"
        ],
        "supportingMcqIds": [
          "U6-L2-Q03",
          "U7-L2-Q06"
        ]
      },
      {
        "id": "u7-frq-scope-limit",
        "name": "Respect the sampling scope",
        "whyItMatters": "Part (b) earns credit for recognizing that results from emperor penguins cannot be generalized to all penguin types.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      }
    ],
    "maxPenalty": 0.50
  },
  "U8-PC-FRQ-Q01": {
    "unit": 8,
    "topic": "Performing a chi-square homogeneity test from hypotheses through conditions, calculation, and conclusion",
    "skills": [
      {
        "id": "u8-frq-hypotheses",
        "name": "Select test and hypotheses",
        "whyItMatters": "Step 1 requires naming the chi-square test for homogeneity and stating null and alternative hypotheses in context.",
        "supportingFormulas": [
          "chi-sq-select",
          "chi-sq-hyp"
        ],
        "supportingMcqIds": [
          "U8-L5-Q02",
          "U8-L2-Q05"
        ]
      },
      {
        "id": "u8-frq-conditions-calc",
        "name": "Check conditions and calculate",
        "whyItMatters": "Step 2 awards checking independence and large counts, then computing expected counts, degrees of freedom, the chi-square statistic, and a consistent p-value.",
        "supportingFormulas": [
          "chi-sq-conditions",
          "expected-twoway",
          "df-twoway",
          "chi-sq"
        ],
        "supportingMcqIds": [
          "U8-L2-Q02",
          "U8-L4-Q01",
          "U8-L4-Q03",
          "U8-L3-Q06"
        ]
      },
      {
        "id": "u8-frq-conclusion",
        "name": "Conclude with p-value",
        "whyItMatters": "The conclusion point depends on comparing the p-value to alpha = 0.05, making the correct decision, and stating the result in context of regional soda preferences.",
        "supportingFormulas": [
          "chi-sq-conclude"
        ],
        "supportingMcqIds": [
          "U8-L3-Q09"
        ]
      }
    ],
    "maxPenalty": 0.50
  },
  "U9-PC-FRQ-Q01": {
    "unit": 9,
    "topic": "Assessing linearity, building a regression line, and testing whether the slope is nonzero",
    "skills": [
      {
        "id": "u9-frq-scatterplot",
        "name": "Plot and assess linearity",
        "whyItMatters": "Part (a) awards two components: correctly constructing the scatterplot with dial setting on the x-axis and output length on the y-axis, AND justifying (with reference to the plot's pattern) that a linear model is appropriate. Both components are needed for full credit.",
        "supportingFormulas": [],
        "supportingMcqIds": [
          "U2-L6-Q03",
          "U2-L7-Q01"
        ]
      },
      {
        "id": "u9-frq-lsrl",
        "name": "Write the regression line",
        "whyItMatters": "Part (b) requires slope and intercept estimates with variables clearly labeled so the line predicts output length from dial setting.",
        "supportingFormulas": [
          "linreg",
          "slope-b",
          "y-intercept"
        ],
        "supportingMcqIds": [
          "U2-L6-Q03",
          "U2-L8-Q01"
        ]
      },
      {
        "id": "u9-frq-slope-hypotheses",
        "name": "State slope hypotheses",
        "whyItMatters": "Part (c) earns credit for stating H0: beta_1 = 0 and Ha: beta_1 != 0, or the equivalent contextual statements about a linear relationship.",
        "supportingFormulas": [],
        "supportingMcqIds": []
      },
      {
        "id": "u9-frq-slope-test",
        "name": "Use slope t test",
        "whyItMatters": "Part (d) depends on using the slope test result to compare a p-value to the chosen significance level, reject the null, and conclude in context.",
        "supportingFormulas": [
          "slope-t",
          "df-t"
        ],
        "supportingMcqIds": [
          "U9-L5-Q02",
          "U9-L5-Q04",
          "U7-L5-Q01"
        ]
      }
    ],
    "maxPenalty": 0.50
  }
};
