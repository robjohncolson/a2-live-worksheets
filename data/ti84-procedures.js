// Generated from ti84-procedures-data.json — do not edit directly
window.TI84_PROCEDURES = {
  "meta": {
    "calculator": "TI-84 Plus CE",
    "os_version": "5.8.2.0029",
    "research_date": "2026-04-07",
    "sources": [
      "https://education.ti.com/download/en/ed-tech/3BBF042421644CE2AF713484B03A8B11/FF49CCD0060F4DCFBDF8874AEA7F1854/84PLCE_GSG_EN.pdf",
      "https://education.ti.com/download/en/ed-tech/3BBF042421644CE2AF713484B03A8B11/DA0D22E4BC924472A8E6D147FE76CC74/GRefGuide_84PlusCE_EN.pdf",
      "https://education.ti.com/-/media/ti/files/resources/student-parent/ti-84-best-practices.pdf",
      "https://education.ti.com/download/en/ed-tech/C4D11EB6D86B47D19CD768E54A967441/6CC4C5AED5004F808892046AD33D4A35/TI84Plus_guidebook_EN.pdf",
      "https://education.ti.com/-/media/5EF22E08B537419E885917938962BF4A",
      "https://education.ti.com/-/media/7A6BD01CF8D547F1BBBF57E66A5641C5",
      "https://education.ti.com/~/media/C063D0204A7049AF9F2CFEC5EF810E1A",
      "https://education.ti.com/-/media/6455978B73D34086ADACAC6171F085B5",
      "https://education.ti.com/-/media/2359628777294B9DA4E18E3B25277038",
      "https://education.ti.com/en/customer-support/knowledge-base/ti-83-84-plus-family/troubleshooting-messages-unexpected-results/34424",
      "https://education.ti.com/en/customer-support/knowledge-base/ti-83-84-plus-family/product-usage/34799",
      "TI-84 Plus CE ROM dump (OS 5.8.2.0029) — string extraction for menu ordering verification"
    ],
    "verification_date": "2026-04-08",
    "verification_notes": "STAT > TESTS menu verified against TI-84 Plus CE Reference Guide (2020). ROM string table order does NOT match menu display order. DISTR menu confirmed. Wizard field labels verified via ROM extraction. ROM disassembly (eZ80) confirmed wizard field tables, added Color: field to draw-capable wizards, merged Calculate/Draw into selector, removed hallucinated CNTB from chi2gof result."
  },
  "keypad": {
    "description": "Subset of TI-84 Plus CE keys and 2ND combinations used in Algebra 2 procedures.",
    "keys": [
      {
        "id": "Y_EQUALS",
        "label": "Y=",
        "row": 1,
        "col": 1,
        "color": "blue",
        "secondary": "STAT PLOT",
        "alpha": null
      },
      {
        "id": "WINDOW",
        "label": "WINDOW",
        "row": 1,
        "col": 2,
        "color": "blue",
        "secondary": "TBLSET",
        "alpha": null
      },
      {
        "id": "ZOOM",
        "label": "ZOOM",
        "row": 1,
        "col": 3,
        "color": "blue",
        "secondary": "FORMAT",
        "alpha": null
      },
      {
        "id": "TRACE",
        "label": "TRACE",
        "row": 1,
        "col": 4,
        "color": "blue",
        "secondary": "CALC",
        "alpha": null
      },
      {
        "id": "GRAPH",
        "label": "GRAPH",
        "row": 1,
        "col": 5,
        "color": "blue",
        "secondary": "TABLE",
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
        "id": "MODE",
        "label": "MODE",
        "row": 2,
        "col": 2,
        "color": "gray",
        "secondary": "QUIT",
        "alpha": null
      },
      {
        "id": "DEL",
        "label": "DEL",
        "row": 2,
        "col": 3,
        "color": "gray",
        "secondary": "INS",
        "alpha": null
      },
      {
        "id": "ALPHA",
        "label": "ALPHA",
        "row": 3,
        "col": 1,
        "color": "green",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "STAT",
        "label": "STAT",
        "row": 3,
        "col": 3,
        "color": "blue",
        "secondary": "LIST",
        "alpha": null
      },
      {
        "id": "MATH",
        "label": "MATH",
        "row": 4,
        "col": 1,
        "color": "blue",
        "secondary": "TEST",
        "alpha": null
      },
      {
        "id": "APPS",
        "label": "APPS",
        "row": 4,
        "col": 2,
        "color": "blue",
        "secondary": "ANGLE",
        "alpha": null
      },
      {
        "id": "PRGM",
        "label": "PRGM",
        "row": 4,
        "col": 3,
        "color": "blue",
        "secondary": "DRAW",
        "alpha": null
      },
      {
        "id": "VARS",
        "label": "VARS",
        "row": 4,
        "col": 4,
        "color": "blue",
        "secondary": "DISTR",
        "alpha": null
      },
      {
        "id": "CLEAR",
        "label": "CLEAR",
        "row": 4,
        "col": 5,
        "color": "blue",
        "secondary": "CLRTBL",
        "alpha": null
      },
      {
        "id": "UP",
        "label": "UP",
        "row": 5,
        "col": 2,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "LEFT",
        "label": "LEFT",
        "row": 6,
        "col": 1,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "RIGHT",
        "label": "RIGHT",
        "row": 6,
        "col": 3,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "DOWN",
        "label": "DOWN",
        "row": 7,
        "col": 2,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "ENTER",
        "label": "ENTER",
        "row": 6,
        "col": 5,
        "color": "blue",
        "secondary": "ENTRY",
        "alpha": null
      },
      {
        "id": "X_INVERSE",
        "label": "x^-1",
        "row": 8,
        "col": 1,
        "color": "gray",
        "secondary": "MATRIX",
        "alpha": "D"
      },
      {
        "id": "COMMA",
        "label": ",",
        "row": 9,
        "col": 2,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "LPAREN",
        "label": "(",
        "row": 9,
        "col": 3,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "RPAREN",
        "label": ")",
        "row": 9,
        "col": 4,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "ZERO",
        "label": "0",
        "row": 12,
        "col": 2,
        "color": "gray",
        "secondary": "CATALOG",
        "alpha": null
      },
      {
        "id": "ONE",
        "label": "1",
        "row": 11,
        "col": 2,
        "color": "gray",
        "secondary": "L1",
        "alpha": null
      },
      {
        "id": "TWO",
        "label": "2",
        "row": 11,
        "col": 3,
        "color": "gray",
        "secondary": "L2",
        "alpha": null
      },
      {
        "id": "THREE",
        "label": "3",
        "row": 11,
        "col": 4,
        "color": "gray",
        "secondary": "L3",
        "alpha": null
      },
      {
        "id": "FOUR",
        "label": "4",
        "row": 10,
        "col": 2,
        "color": "gray",
        "secondary": "L4",
        "alpha": null
      },
      {
        "id": "FIVE",
        "label": "5",
        "row": 10,
        "col": 3,
        "color": "gray",
        "secondary": "L5",
        "alpha": null
      },
      {
        "id": "SIX",
        "label": "6",
        "row": 10,
        "col": 4,
        "color": "gray",
        "secondary": "L6",
        "alpha": null
      },
      {
        "id": "SEVEN",
        "label": "7",
        "row": 9,
        "col": 2,
        "color": "gray",
        "secondary": "u",
        "alpha": null
      },
      {
        "id": "EIGHT",
        "label": "8",
        "row": 9,
        "col": 3,
        "color": "gray",
        "secondary": "v",
        "alpha": null
      },
      {
        "id": "NINE",
        "label": "9",
        "row": 9,
        "col": 4,
        "color": "gray",
        "secondary": "w",
        "alpha": null
      },
      {
        "id": "DECIMAL",
        "label": ".",
        "row": 12,
        "col": 3,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "NEGATIVE",
        "label": "(-)",
        "row": 12,
        "col": 4,
        "color": "gray",
        "secondary": null,
        "alpha": null
      },
      {
        "id": "ON",
        "label": "ON",
        "row": 12,
        "col": 1,
        "color": "black",
        "secondary": "OFF",
        "alpha": null
      },
      {
        "id": "2ND_DISTR",
        "label": "DISTR",
        "triggeredBy": [
          "2ND",
          "VARS"
        ],
        "description": "2ND + VARS opens the distribution menu."
      },
      {
        "id": "2ND_STAT_PLOT",
        "label": "STAT PLOT",
        "triggeredBy": [
          "2ND",
          "Y="
        ],
        "description": "2ND + Y= opens the STAT PLOT menu."
      },
      {
        "id": "2ND_LIST",
        "label": "LIST",
        "triggeredBy": [
          "2ND",
          "STAT"
        ],
        "description": "2ND + STAT opens LIST names."
      },
      {
        "id": "2ND_MATRIX",
        "label": "MATRIX",
        "triggeredBy": [
          "2ND",
          "X_INVERSE"
        ],
        "description": "2ND + x^-1 opens MATRIX."
      },
      {
        "id": "2ND_CATALOG",
        "label": "CATALOG",
        "triggeredBy": [
          "2ND",
          "0"
        ],
        "description": "2ND + 0 opens the catalog."
      },
      {
        "id": "Y_VARS",
        "label": "Y-VARS",
        "triggeredBy": [
          "VARS",
          "RIGHT"
        ],
        "description": "VARS then RIGHT opens Y-VARS for selecting Y1."
      }
    ]
  },
  "screens": [
    {
      "id": "home",
      "type": "home",
      "description": "Blank TI-84 Plus CE home screen with status line and blinking cursor.",
      "layout": {
        "rows": 10,
        "cols": 26,
        "content": []
      }
    },
    {
      "id": "home-second",
      "type": "home",
      "description": "Home screen with the 2ND indicator active.",
      "layout": {
        "rows": 10,
        "cols": 26,
        "content": [
          "2ND indicator shown in status line"
        ]
      }
    },
    {
      "id": "stat-menu",
      "type": "menu",
      "title": "STAT",
      "tabs": [
        "EDIT",
        "CALC",
        "TESTS"
      ],
      "activeTab": "EDIT",
      "items": [
        "1:Edit...",
        "2:SortA(",
        "3:SortD(",
        "4:ClrList",
        "5:SetUpEditor"
      ],
      "cursor": 0,
      "description": "STAT menu with EDIT active."
    },
    {
      "id": "stat-calc-menu",
      "type": "menu",
      "title": "STAT",
      "tabs": [
        "EDIT",
        "CALC",
        "TESTS"
      ],
      "activeTab": "CALC",
      "items": [
        "1:1-Var Stats",
        "4:LinReg(ax+b)",
        "8:LinReg(a+bx)"
      ],
      "cursor": 0,
      "description": "STAT menu with CALC active."
    },
    {
      "id": "stat-tests-menu",
      "type": "menu",
      "title": "STAT",
      "tabs": [
        "EDIT",
        "CALC",
        "TESTS"
      ],
      "activeTab": "TESTS",
      "items": [
        "1:Z-Test...",
        "2:T-Test...",
        "3:2-SampZTest...",
        "4:2-SampTTest...",
        "5:1-PropZTest...",
        "6:2-PropZTest...",
        "7:ZInterval...",
        "8:TInterval...",
        "9:2-SampZInt...",
        "0:2-SampTInt...",
        "A:1-PropZInt...",
        "B:2-PropZInt...",
        "C:χ²-Test...",
        "D:χ²GOF-Test...",
        "E:2-SampFTest...",
        "F:LinRegTTest...",
        "G:LinRegTInt...",
        "H:ANOVA(..."
      ],
      "cursor": 0,
      "description": "STAT menu with TESTS active. Full 18-item menu verified against TI-84 Plus CE Reference Guide."
    },
    {
      "id": "stat-edit-lists",
      "type": "editor",
      "description": "Stat list editor showing L1 through L6 columns.",
      "columns": [
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
        "L6"
      ],
      "cursor": "current list cell"
    },
    {
      "id": "distr-menu",
      "type": "menu",
      "title": "DISTR",
      "items": [
        "1:normalpdf(",
        "2:normalcdf(",
        "3:invNorm(",
        "4:invT(",
        "5:tpdf(",
        "6:tcdf(",
        "7:χ²pdf(",
        "8:χ²cdf(",
        "9:Fpdf(",
        "0:Fcdf(",
        "A:binompdf(",
        "B:binomcdf(",
        "C:invBinom(",
        "D:poissonpdf(",
        "E:poissoncdf(",
        "F:geometpdf(",
        "G:geometcdf("
      ],
      "cursor": 0,
      "description": "DISTR menu (2ND > VARS). Full menu, ROM-verified OS 5.8.2."
    },
    {
      "id": "stat-plot-menu",
      "type": "menu",
      "title": "STAT PLOTS",
      "items": [
        "1:Plot1...",
        "2:Plot2...",
        "3:Plot3..."
      ],
      "cursor": 0,
      "description": "STAT PLOT menu reached by 2ND + Y=."
    },
    {
      "id": "plot1-editor-scatter",
      "type": "editor",
      "description": "Plot1 editor configured for a scatter plot.",
      "fields": [
        "On/Off",
        "Type: Scatter",
        "Xlist: L1",
        "Ylist: L2",
        "Mark",
        "Color"
      ],
      "cursor": "current field"
    },
    {
      "id": "plot1-editor-hist",
      "type": "editor",
      "description": "Plot1 editor configured for a histogram.",
      "fields": [
        "On/Off",
        "Type: Histogram",
        "Xlist: L1",
        "Freq: 1",
        "Color"
      ],
      "cursor": "current field"
    },
    {
      "id": "plot1-editor-modbox",
      "type": "editor",
      "description": "Plot1 editor configured for a modified boxplot.",
      "fields": [
        "On/Off",
        "Type: Modified Boxplot",
        "Xlist: L1",
        "Freq: 1",
        "Color"
      ],
      "cursor": "current field"
    },
    {
      "id": "plot1-editor-resid",
      "type": "editor",
      "description": "Plot1 editor configured for a residual scatterplot.",
      "fields": [
        "On/Off",
        "Type: Scatter",
        "Xlist: L1",
        "Ylist: RESID",
        "Mark",
        "Color"
      ],
      "cursor": "current field"
    },
    {
      "id": "zoom-menu",
      "type": "menu",
      "title": "ZOOM",
      "items": [
        "9:ZoomStat"
      ],
      "cursor": 0,
      "description": "ZOOM menu with ZoomStat available."
    },
    {
      "id": "math-menu",
      "type": "menu",
      "title": "MATH",
      "tabs": [
        "MATH",
        "NUM",
        "CMPLX",
        "PRB",
        "FRAC"
      ],
      "activeTab": "MATH",
      "items": [
        "1:▶Frac",
        "2:▶Dec",
        "3:³",
        "4:³√(",
        "5:ˣ√",
        "6:fMin(",
        "7:fMax(",
        "8:nDeriv(",
        "9:fnInt(",
        "0:summation Σ(",
        "A:logBASE(",
        "B:piecewise("
      ],
      "cursor": 0,
      "description": "MATH menu with MATH tab active. PRB is three RIGHT presses away, matching the real calculator."
    },
    {
      "id": "math-num-menu",
      "type": "menu",
      "title": "MATH",
      "tabs": [
        "MATH",
        "NUM",
        "CMPLX",
        "PRB",
        "FRAC"
      ],
      "activeTab": "NUM",
      "items": [
        "1:abs(",
        "2:round(",
        "3:iPart(",
        "4:fPart(",
        "5:int(",
        "6:min(",
        "7:max(",
        "8:lcm(",
        "9:gcd(",
        "0:remainder("
      ],
      "cursor": 0,
      "description": "MATH menu with NUM tab active — one RIGHT from MATH; keep going for PRB."
    },
    {
      "id": "math-cmplx-menu",
      "type": "menu",
      "title": "MATH",
      "tabs": [
        "MATH",
        "NUM",
        "CMPLX",
        "PRB",
        "FRAC"
      ],
      "activeTab": "CMPLX",
      "items": [
        "1:conj(",
        "2:real(",
        "3:imag(",
        "4:angle(",
        "5:abs(",
        "6:▶Rect",
        "7:▶Polar"
      ],
      "cursor": 0,
      "description": "MATH menu with CMPLX tab active — two RIGHTs from MATH; one more for PRB."
    },
    {
      "id": "math-prb-menu",
      "type": "menu",
      "title": "MATH",
      "tabs": [
        "MATH",
        "NUM",
        "CMPLX",
        "PRB",
        "FRAC"
      ],
      "activeTab": "PRB",
      "items": [
        "1:rand",
        "2:nPr",
        "3:nCr",
        "4:!",
        "5:randInt(",
        "6:randNorm(",
        "7:randBin(",
        "8:randIntNoRep("
      ],
      "cursor": 0,
      "description": "MATH menu with PRB tab active — rand pastes directly; randInt( and randIntNoRep( open wizard prompts."
    },
    {
      "id": "randint-wizard",
      "type": "wizard",
      "description": "randInt wizard — lower, upper, n, then Paste composes the command onto the home screen.",
      "fields": [
        {
          "label": "lower",
          "type": "integer"
        },
        {
          "label": "upper",
          "type": "integer"
        },
        {
          "label": "n",
          "type": "integer",
          "default": "1"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "randintnorep-wizard",
      "type": "wizard",
      "description": "randIntNoRep wizard — lower, upper, n, then Paste composes the command onto the home screen.",
      "fields": [
        {
          "label": "lower",
          "type": "integer"
        },
        {
          "label": "upper",
          "type": "integer"
        },
        {
          "label": "n",
          "type": "integer"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "math-frac-menu",
      "type": "menu",
      "title": "MATH",
      "tabs": [
        "MATH",
        "NUM",
        "CMPLX",
        "PRB",
        "FRAC"
      ],
      "activeTab": "FRAC",
      "items": [
        "1:n/d",
        "2:Un/d",
        "3:▶n/d◀▶Un/d",
        "4:▶F◀▶D"
      ],
      "cursor": 0,
      "description": "MATH menu with FRAC tab active — one RIGHT past PRB."
    },
    {
      "id": "one-var-stats-wizard",
      "type": "wizard",
      "description": "1-Var Stats setup wizard.",
      "fields": [
        {
          "label": "List",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "FreqList",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "one-var-stats-result-page1",
      "type": "result",
      "description": "1-Var Stats output page 1.",
      "lines": [
        "x̄ = {value}",
        "Σx = {value}",
        "Σx² = {value}",
        "Sx = {value}",
        "σx = {value}",
        "n = {value}"
      ],
      "scrollable": true
    },
    {
      "id": "one-var-stats-result-page2",
      "type": "result",
      "description": "1-Var Stats output page 2.",
      "lines": [
        "minX = {value}",
        "Q1 = {value}",
        "Med = {value}",
        "Q3 = {value}",
        "maxX = {value}"
      ]
    },
    {
      "id": "histogram-graph",
      "type": "graph",
      "description": "Histogram graph created with ZoomStat.",
      "tracePrompts": [
        "x = {bin center}",
        "y = {bin count}"
      ]
    },
    {
      "id": "histogram-trace",
      "type": "graph",
      "description": "Histogram in TRACE mode; left and right arrows move from bar to bar.",
      "tracePrompts": [
        "x = {bin center}",
        "y = {bin count}"
      ]
    },
    {
      "id": "modified-boxplot-graph",
      "type": "graph",
      "description": "Modified boxplot graph created with ZoomStat.",
      "tracePrompts": [
        "Med",
        "Q1",
        "Q3",
        "minX",
        "maxX",
        "x = {outlier}"
      ]
    },
    {
      "id": "modified-boxplot-trace",
      "type": "graph",
      "description": "Modified boxplot in TRACE mode.",
      "tracePrompts": [
        "Med",
        "Q1",
        "Q3",
        "minX",
        "maxX",
        "x = {outlier}"
      ]
    },
    {
      "id": "scatterplot-graph",
      "type": "graph",
      "description": "Scatterplot created with ZoomStat.",
      "tracePrompts": [
        "x = {value}",
        "y = {value}"
      ]
    },
    {
      "id": "scatterplot-trace",
      "type": "graph",
      "description": "Scatterplot in TRACE mode.",
      "tracePrompts": [
        "x = {value}",
        "y = {value}"
      ]
    },
    {
      "id": "residual-plot-graph",
      "type": "graph",
      "description": "Residual plot with Xlist L1 and Ylist RESID. If the regression line appears, turn Y1 off in Y= first.",
      "tracePrompts": [
        "x = {value}",
        "y = {residual}"
      ]
    },
    {
      "id": "residual-list-editor",
      "type": "editor",
      "description": "Stat list editor showing the RESID list after a regression.",
      "columns": [
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
        "L6",
        "RESID"
      ],
      "cursor": "current residual"
    },
    {
      "id": "list-names-menu",
      "type": "menu",
      "title": "LIST NAMES",
      "items": [
        "1:L1",
        "2:L2",
        "3:L3",
        "4:L4",
        "5:L5",
        "6:L6",
        "7:RESID"
      ],
      "cursor": 0,
      "description": "LIST names menu reached by 2ND + STAT."
    },
    {
      "id": "catalog-top",
      "type": "menu",
      "title": "CATALOG",
      "description": "CATALOG opened at the top of the alphabetical command list.",
      "items": [
        "abs(",
        "and",
        "angle("
      ],
      "cursor": 0
    },
    {
      "id": "catalog-d-section",
      "type": "menu",
      "title": "CATALOG",
      "description": "CATALOG positioned in the D section.",
      "items": [
        "DiagnosticOff",
        "DiagnosticOn",
        "dim("
      ],
      "cursor": 1
    },
    {
      "id": "normalcdf-wizard",
      "type": "wizard",
      "description": "CE wizard for normalcdf with STAT WIZARDS on; the bottom action pastes the function to the home screen.",
      "fields": [
        {
          "label": "lower",
          "type": "number"
        },
        {
          "label": "upper",
          "type": "number"
        },
        {
          "label": "μ",
          "type": "number",
          "default": "0"
        },
        {
          "label": "σ",
          "type": "number",
          "default": "1"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "invnorm-wizard",
      "type": "wizard",
      "description": "CE wizard for invNorm with tail selection.",
      "fields": [
        {
          "label": "area",
          "type": "number"
        },
        {
          "label": "μ",
          "type": "number",
          "default": "0"
        },
        {
          "label": "σ",
          "type": "number",
          "default": "1"
        },
        {
          "label": "Tail",
          "type": "choice",
          "options": [
            "LEFT",
            "CENTER",
            "RIGHT"
          ]
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "binompdf-wizard",
      "type": "wizard",
      "description": "CE wizard for binompdf.",
      "fields": [
        {
          "label": "trials",
          "type": "number"
        },
        {
          "label": "p",
          "type": "number"
        },
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ],
      "sharedParameterTable": {
        "sharedWith": "binomcdf-wizard",
        "romOffset": "0x0AF802"
      }
    },
    {
      "id": "binomcdf-wizard",
      "type": "wizard",
      "description": "CE wizard for binomcdf.",
      "fields": [
        {
          "label": "trials",
          "type": "number"
        },
        {
          "label": "p",
          "type": "number"
        },
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ],
      "sharedParameterTable": {
        "sharedWith": "binompdf-wizard",
        "romOffset": "0x0AF802"
      }
    },
    {
      "id": "geometpdf-wizard",
      "type": "wizard",
      "description": "CE wizard for geometpdf.",
      "fields": [
        {
          "label": "p",
          "type": "number"
        },
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ],
      "sharedParameterTable": {
        "sharedWith": "geometcdf-wizard",
        "romOffset": "0x0AF818"
      }
    },
    {
      "id": "geometcdf-wizard",
      "type": "wizard",
      "description": "CE wizard for geometcdf.",
      "fields": [
        {
          "label": "p",
          "type": "number"
        },
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "Paste",
          "type": "action-button"
        }
      ],
      "sharedParameterTable": {
        "sharedWith": "geometpdf-wizard",
        "romOffset": "0x0AF818"
      }
    },
    {
      "id": "distribution-home-result",
      "type": "result",
      "description": "Home screen showing the pasted distribution command on one line and the numeric answer below after ENTER.",
      "lines": [
        "command(...)",
        "{value}"
      ]
    },
    {
      "id": "linreg-wizard",
      "type": "wizard",
      "description": "LinReg(a+bx) setup wizard.",
      "fields": [
        {
          "label": "Xlist",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Ylist",
          "default": "L2",
          "type": "list-selector"
        },
        {
          "label": "FreqList",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "Store RegEQ",
          "default": "Y1",
          "type": "equation-selector"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "linreg-result",
      "type": "result",
      "description": "LinReg(a+bx) output. r and r² are displayed only after DiagnosticOn has been executed.",
      "lines": [
        "y = a + bx",
        "a = {intercept}",
        "b = {slope}",
        "r² = {value}",
        "r = {value}"
      ],
      "scrollable": true
    },
    {
      "id": "t-test-data-wizard",
      "type": "wizard",
      "description": "T-Test editor with Data input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Data",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "μ0",
          "type": "number"
        },
        {
          "label": "List",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Freq",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "μ ? μ0",
          "options": [
            "≠",
            "<",
            ">"
          ],
          "type": "choice"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "t-test-stats-wizard",
      "type": "wizard",
      "description": "T-Test editor with Stats input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Stats",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "μ0",
          "type": "number"
        },
        {
          "label": "x̄",
          "type": "number"
        },
        {
          "label": "Sx",
          "type": "number"
        },
        {
          "label": "n",
          "type": "integer"
        },
        {
          "label": "μ ? μ0",
          "options": [
            "≠",
            "<",
            ">"
          ],
          "type": "choice"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "t-test-result",
      "type": "result",
      "description": "T-Test numeric output.",
      "lines": [
        "μ ? μ0",
        "t = {value}",
        "p = {value}",
        "x̄ = {value}",
        "Sx = {value}",
        "n = {value}"
      ]
    },
    {
      "id": "t-interval-data-wizard",
      "type": "wizard",
      "description": "TInterval editor with Data input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Data",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "List",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Freq",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "t-interval-stats-wizard",
      "type": "wizard",
      "description": "TInterval editor with Stats input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Stats",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "x̄",
          "type": "number"
        },
        {
          "label": "Sx",
          "type": "number"
        },
        {
          "label": "n",
          "type": "integer"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "t-interval-result",
      "type": "result",
      "description": "TInterval numeric output.",
      "lines": [
        "({lower}, {upper})",
        "x̄ = {value}",
        "Sx = {value}",
        "n = {value}"
      ]
    },
    {
      "id": "two-samp-ttest-stats-wizard",
      "type": "wizard",
      "description": "2-SampTTest editor with Stats input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Stats",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "x̄1",
          "type": "number"
        },
        {
          "label": "Sx1",
          "type": "number"
        },
        {
          "label": "n1",
          "type": "integer"
        },
        {
          "label": "x̄2",
          "type": "number"
        },
        {
          "label": "Sx2",
          "type": "number"
        },
        {
          "label": "n2",
          "type": "integer"
        },
        {
          "label": "μ1 ? μ2",
          "options": [
            "≠",
            "<",
            ">"
          ],
          "type": "choice"
        },
        {
          "label": "Pooled",
          "options": [
            "No",
            "Yes"
          ],
          "type": "choice"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "two-samp-ttest-result",
      "type": "result",
      "description": "2-SampTTest numeric output.",
      "lines": [
        "μ1 ? μ2",
        "t = {value}",
        "p = {value}",
        "df = {value}",
        "x̄1 = {value}",
        "x̄2 = {value}",
        "Sx1 = {value}",
        "Sx2 = {value}",
        "n1 = {value}",
        "n2 = {value}"
      ],
      "scrollable": true
    },
    {
      "id": "two-samp-tint-stats-wizard",
      "type": "wizard",
      "description": "2-SampTInt editor with Stats input selected.",
      "fields": [
        {
          "label": "Inpt",
          "default": "Stats",
          "options": [
            "Data",
            "Stats"
          ]
        },
        {
          "label": "x̄1",
          "type": "number"
        },
        {
          "label": "Sx1",
          "type": "number"
        },
        {
          "label": "n1",
          "type": "integer"
        },
        {
          "label": "x̄2",
          "type": "number"
        },
        {
          "label": "Sx2",
          "type": "number"
        },
        {
          "label": "n2",
          "type": "integer"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "Pooled",
          "options": [
            "No",
            "Yes"
          ],
          "type": "choice"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "two-samp-tint-result",
      "type": "result",
      "description": "2-SampTInt numeric output.",
      "lines": [
        "({lower}, {upper})",
        "df = {value}",
        "x̄1 = {value}",
        "x̄2 = {value}",
        "Sx1 = {value}",
        "Sx2 = {value}",
        "n1 = {value}",
        "n2 = {value}"
      ],
      "scrollable": true
    },
    {
      "id": "one-propztest-wizard",
      "type": "wizard",
      "description": "1-PropZTest editor.",
      "fields": [
        {
          "label": "p0",
          "type": "number"
        },
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "n",
          "type": "integer"
        },
        {
          "label": "prop",
          "options": [
            "≠p₀",
            "<p₀",
            ">p₀"
          ],
          "type": "choice"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "one-propztest-result",
      "type": "result",
      "description": "1-PropZTest numeric output.",
      "lines": [
        "prop ? p0",
        "z = {value}",
        "p = {value}",
        "p̂ = {value}",
        "n = {value}"
      ]
    },
    {
      "id": "one-propzint-wizard",
      "type": "wizard",
      "description": "1-PropZInt editor.",
      "fields": [
        {
          "label": "x",
          "type": "integer"
        },
        {
          "label": "n",
          "type": "integer"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "one-propzint-result",
      "type": "result",
      "description": "1-PropZInt numeric output.",
      "lines": [
        "({lower}, {upper})",
        "p̂ = {value}",
        "n = {value}"
      ]
    },
    {
      "id": "two-propztest-wizard",
      "type": "wizard",
      "description": "2-PropZTest editor.",
      "fields": [
        {
          "label": "x1",
          "type": "integer"
        },
        {
          "label": "n1",
          "type": "integer"
        },
        {
          "label": "x2",
          "type": "integer"
        },
        {
          "label": "n2",
          "type": "integer"
        },
        {
          "label": "p1 ? p2",
          "options": [
            "≠",
            "<",
            ">"
          ],
          "type": "choice"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "two-propztest-result",
      "type": "result",
      "description": "2-PropZTest numeric output.",
      "lines": [
        "p1 ? p2",
        "z = {value}",
        "p = {value}",
        "p̂1 = {value}",
        "p̂2 = {value}",
        "n1 = {value}",
        "n2 = {value}"
      ]
    },
    {
      "id": "two-propzint-wizard",
      "type": "wizard",
      "description": "2-PropZInt editor.",
      "fields": [
        {
          "label": "x1",
          "type": "integer"
        },
        {
          "label": "n1",
          "type": "integer"
        },
        {
          "label": "x2",
          "type": "integer"
        },
        {
          "label": "n2",
          "type": "integer"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "two-propzint-result",
      "type": "result",
      "description": "2-PropZInt numeric output.",
      "lines": [
        "({lower}, {upper})",
        "p̂1 = {value}",
        "p̂2 = {value}",
        "n1 = {value}",
        "n2 = {value}"
      ]
    },
    {
      "id": "matrix-menu-names",
      "type": "menu",
      "title": "MATRIX",
      "tabs": [
        "NAMES",
        "MATH",
        "EDIT"
      ],
      "activeTab": "NAMES",
      "items": [
        "1:[A]",
        "2:[B]",
        "3:[C]"
      ],
      "cursor": 0,
      "description": "MATRIX menu with NAMES active."
    },
    {
      "id": "matrix-menu-math",
      "type": "menu",
      "title": "MATRIX",
      "tabs": [
        "NAMES",
        "MATH",
        "EDIT"
      ],
      "activeTab": "MATH",
      "items": [
        "1:det(",
        "2:T",
        "3:dim("
      ],
      "cursor": 0,
      "description": "MATRIX menu with MATH active."
    },
    {
      "id": "matrix-menu-edit",
      "type": "menu",
      "title": "MATRIX",
      "tabs": [
        "NAMES",
        "MATH",
        "EDIT"
      ],
      "activeTab": "EDIT",
      "items": [
        "1:[A]",
        "2:[B]",
        "3:[C]"
      ],
      "cursor": 0,
      "description": "MATRIX menu with EDIT active."
    },
    {
      "id": "matrix-editor-a-dims",
      "type": "editor",
      "description": "Matrix [A] dimension prompt at the top of the matrix editor.",
      "fields": [
        "rows",
        "columns"
      ]
    },
    {
      "id": "matrix-editor-a-values",
      "type": "editor",
      "description": "Matrix [A] value-entry screen.",
      "fields": [
        "cell-by-cell entry, row by row"
      ]
    },
    {
      "id": "chi2gof-wizard",
      "type": "wizard",
      "description": "χ²GOF-Test editor.",
      "fields": [
        {
          "label": "Observed",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Expected",
          "default": "L2",
          "type": "list-selector"
        },
        {
          "label": "df",
          "type": "integer"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "chi2gof-result",
      "type": "result",
      "description": "χ²GOF-Test numeric output.",
      "lines": [
        "χ² = {value}",
        "p = {value}",
        "df = {value}"
      ]
    },
    {
      "id": "chi2gof-draw",
      "type": "graph",
      "description": "χ²GOF-Test draw screen with right-tail shading.",
      "tracePrompts": [
        "χ² = {value}",
        "p = {value}"
      ]
    },
    {
      "id": "chi2test-wizard",
      "type": "wizard",
      "description": "χ²-Test editor.",
      "fields": [
        {
          "label": "Observed",
          "default": "[A]",
          "type": "matrix-selector"
        },
        {
          "label": "Expected",
          "default": "[B]",
          "type": "matrix-selector"
        },
        {
          "label": "Color:",
          "type": "color-selector"
        },
        {
          "label": "Calculate/Draw",
          "type": "action-selector",
          "options": [
            "Calculate",
            "Draw"
          ]
        }
      ]
    },
    {
      "id": "chi2test-result",
      "type": "result",
      "description": "χ²-Test numeric output; expected counts are stored in [B].",
      "lines": [
        "χ² = {value}",
        "p = {value}",
        "df = {value}"
      ]
    },
    {
      "id": "chi2test-draw",
      "type": "graph",
      "description": "χ²-Test draw screen with right-tail shading.",
      "tracePrompts": [
        "χ² = {value}",
        "p = {value}"
      ]
    },
    {
      "id": "linreg-ttest-wizard",
      "type": "wizard",
      "description": "LinRegTTest editor.",
      "fields": [
        {
          "label": "Xlist",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Ylist",
          "default": "L2",
          "type": "list-selector"
        },
        {
          "label": "Freq",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "β and ρ",
          "options": [
            "≠0",
            "<0",
            ">0"
          ],
          "type": "choice"
        },
        {
          "label": "RegEQ",
          "default": "Y1",
          "type": "equation-selector"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "linreg-ttest-result",
      "type": "result",
      "description": "LinRegTTest numeric output.",
      "lines": [
        "β and ρ alternative",
        "t = {value}",
        "p = {value}",
        "df = {value}",
        "a = {value}",
        "b = {value}",
        "s = {value}",
        "r² = {value}",
        "r = {value}"
      ],
      "scrollable": true
    },
    {
      "id": "linreg-tint-wizard",
      "type": "wizard",
      "description": "LinRegTInt editor.",
      "fields": [
        {
          "label": "Xlist",
          "default": "L1",
          "type": "list-selector"
        },
        {
          "label": "Ylist",
          "default": "L2",
          "type": "list-selector"
        },
        {
          "label": "Freq",
          "default": "1",
          "type": "list-selector"
        },
        {
          "label": "C-Level",
          "default": ".95",
          "type": "number"
        },
        {
          "label": "RegEQ",
          "default": "Y1",
          "type": "equation-selector"
        },
        {
          "label": "Calculate",
          "type": "action-button"
        }
      ]
    },
    {
      "id": "linreg-tint-result",
      "type": "result",
      "description": "LinRegTInt numeric output.",
      "lines": [
        "({lower}, {upper})",
        "df = {value}",
        "a = {value}",
        "b = {value}",
        "s = {value}",
        "r² = {value}",
        "r = {value}"
      ],
      "scrollable": true
    }
  ],
  "microSkills": [
    {
      "id": "enter-data-l1",
      "name": "Enter data into L1",
      "skillType": "parameter",
      "description": "Open the list editor and enter one-variable data into L1.",
      "usedBy": [
        "one-var-stats",
        "histogram",
        "modified-boxplot",
        "t-test-data",
        "t-interval-data"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab, 1:Edit... highlighted",
          "narration": "Press [STAT] to open the list editor menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "L1 first cell",
          "narration": "Open the stat list editor with the cursor in L1.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "RIGHT",
              "feedback": "Moving right here skips the list editor. Open it first with [ENTER]."
            },
            {
              "key": "2ND",
              "feedback": "You do not need a secondary function here. Use [ENTER]."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "{value}",
          "screen": "stat-edit-lists",
          "highlight": "current L1 cell",
          "narration": "Type a data value into the current L1 cell.",
          "skillType": "parameter",
          "repeatable": true
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "next L1 cell",
          "narration": "Store the value and move to the next row.",
          "skillType": "confirmation",
          "repeatable": true
        }
      ]
    },
    {
      "id": "enter-data-l1-l2",
      "name": "Enter paired data into L1 and L2",
      "skillType": "parameter",
      "description": "Open the list editor and enter x-values in L1 and y-values in L2.",
      "usedBy": [
        "linreg-a-plus-bx",
        "scatterplot",
        "residual-plot",
        "linreg-ttest",
        "linreg-tint"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab, 1:Edit... highlighted",
          "narration": "Press [STAT] to open the list editor menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "L1 first cell",
          "narration": "Open the stat list editor.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "RIGHT",
              "feedback": "Open the editor first, then move between lists."
            },
            {
              "key": "2ND",
              "feedback": "No secondary function is needed here."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "{x value}",
          "screen": "stat-edit-lists",
          "highlight": "current L1 cell",
          "narration": "Enter the x-value in L1.",
          "skillType": "parameter",
          "repeatable": true
        },
        {
          "stepNumber": 4,
          "key": "RIGHT",
          "screen": "stat-edit-lists",
          "highlight": "matching L2 cell",
          "narration": "Move to the matching cell in L2.",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 5,
          "key": "{y value}",
          "screen": "stat-edit-lists",
          "highlight": "current L2 cell",
          "narration": "Enter the y-value in L2.",
          "skillType": "parameter",
          "repeatable": true
        },
        {
          "stepNumber": 6,
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "next row in L2",
          "narration": "Store the pair and move to the next row.",
          "skillType": "confirmation",
          "repeatable": true
        },
        {
          "stepNumber": 7,
          "key": "LEFT",
          "screen": "stat-edit-lists",
          "highlight": "next row in L1",
          "narration": "Return to L1 if you want to keep entering pairs by row.",
          "skillType": "navigation",
          "repeatable": true
        }
      ]
    },
    {
      "id": "clear-lists",
      "name": "Clear data from lists",
      "skillType": "parameter",
      "description": "Clear an entire list column before entering fresh data.",
      "usedBy": [
        "enter-data-l1",
        "enter-data-l1-l2"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "UP",
          "screen": "stat-edit-lists",
          "highlight": "list name such as L1",
          "narration": "Move from a data cell up to the list name.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "CLEAR",
              "feedback": "If the cursor is in a data cell, [CLEAR] erases only that entry. Move to the list name first."
            },
            {
              "key": "DEL",
              "feedback": "[DEL] deletes one cell, not the whole list."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "CLEAR",
          "screen": "stat-edit-lists",
          "highlight": "empty list column",
          "narration": "Clear every entry in the highlighted list.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DEL",
              "feedback": "[DEL] only removes one entry at a time."
            },
            {
              "key": "ENTER",
              "feedback": "[ENTER] does not clear the list; it just confirms the current position."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "DOWN",
          "screen": "stat-edit-lists",
          "highlight": "first data row",
          "narration": "Return to the first row of the cleared list.",
          "skillType": "navigation"
        }
      ]
    },
    {
      "id": "nav-stat-edit",
      "name": "Open STAT > EDIT",
      "skillType": "navigation",
      "description": "Reach the stat list editor from the home screen.",
      "usedBy": [
        "enter-data-l1",
        "enter-data-l1-l2",
        "clear-lists"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab, 1:Edit... highlighted",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "ENTER",
          "screen": "stat-edit-lists",
          "highlight": "L1 first cell",
          "narration": "With EDIT already selected, press [ENTER] to open the list editor.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "RIGHT",
              "feedback": "That moves to CALC; stay on EDIT for the list editor."
            },
            {
              "key": "DOWN",
              "feedback": "Edit is already highlighted, so [ENTER] is the faster move."
            }
          ]
        }
      ]
    },
    {
      "id": "nav-stat-calc",
      "name": "Open STAT > CALC",
      "skillType": "navigation",
      "description": "Reach the CALC tab from the home screen.",
      "usedBy": [
        "one-var-stats",
        "linreg-a-plus-bx"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to the CALC tab.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        }
      ]
    },
    {
      "id": "nav-stat-tests",
      "name": "Open STAT > TESTS",
      "skillType": "navigation",
      "description": "Reach the TESTS tab from the home screen.",
      "usedBy": [
        "one-propztest",
        "one-propzint",
        "two-propztest",
        "two-propzint",
        "t-test-stats",
        "t-test-data",
        "t-interval-stats",
        "t-interval-data",
        "two-samp-ttest",
        "two-samp-tint",
        "chi-square-gof-test",
        "chi-square-test",
        "linreg-ttest",
        "linreg-tint"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC first.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to the TESTS tab.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the current item before you reach TESTS."
            },
            {
              "key": "LEFT",
              "feedback": "[LEFT] moves away from the TESTS tab."
            }
          ]
        }
      ]
    },
    {
      "id": "nav-2nd-distr",
      "name": "Open 2ND > DISTR",
      "skillType": "navigation",
      "description": "Reach the distribution menu from the home screen.",
      "usedBy": [
        "normalcdf",
        "invnorm",
        "binompdf",
        "binomcdf",
        "geometpdf",
        "geometcdf",
        "normalcdf-sampling",
        "invnorm-sampling"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        }
      ]
    },
    {
      "id": "nav-2nd-statplot",
      "name": "Open 2ND > STAT PLOT",
      "skillType": "navigation",
      "description": "Reach the STAT PLOT menu from the home screen.",
      "usedBy": [
        "histogram",
        "modified-boxplot",
        "scatterplot",
        "residual-plot"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[Y=] alone opens function definitions. Use [2ND] then [Y=] for STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens the statistics menu, not plot setup."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "Y_EQUALS",
          "screen": "stat-plot-menu",
          "highlight": "1:Plot1...",
          "narration": "Open the STAT PLOT menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not STAT PLOT."
            }
          ]
        }
      ]
    },
    {
      "id": "select-data-vs-stats",
      "name": "Toggle Data vs Stats input",
      "skillType": "navigation",
      "description": "Change an inferential editor between Data input and Stats input.",
      "usedBy": [
        "t-test-stats",
        "t-test-data",
        "t-interval-stats",
        "t-interval-data",
        "two-samp-ttest",
        "two-samp-tint"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "RIGHT",
          "screen": "t-test-stats-wizard",
          "highlight": "Inpt: Stats",
          "narration": "Move from Data to Stats when you are on the Inpt row.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Move horizontally first if you want Stats input."
            }
          ]
        },
        {
          "key": "ENTER",
          "screen": "t-test-stats-wizard",
          "highlight": "Inpt: Stats selected",
          "narration": "Press [enter] to select Stats. Highlighting Stats does not choose it - without this the fields stay in Data mode.",
          "skillType": "confirmation",
          "stepNumber": 2
        },
        {
          "stepNumber": 3,
          "key": "LEFT",
          "screen": "t-test-data-wizard",
          "highlight": "Inpt: Data",
          "narration": "Move from Stats back to Data when needed.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "That skips the Inpt selector."
            }
          ]
        },
        {
          "key": "ENTER",
          "screen": "t-test-data-wizard",
          "highlight": "Inpt: Data selected",
          "narration": "Press [enter] to select Data. Highlighting Data does not choose it - without this the fields stay in Stats mode.",
          "skillType": "confirmation",
          "stepNumber": 4
        }
      ]
    },
    {
      "id": "enter-matrix",
      "name": "Enter values into a matrix",
      "skillType": "parameter",
      "description": "Open MATRIX > EDIT, set dimensions, and enter observed counts.",
      "usedBy": [
        "matrix-entry",
        "chi-square-test"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "X_INVERSE",
              "feedback": "Press [2ND] first so x^-1 becomes MATRIX."
            },
            {
              "key": "STAT",
              "feedback": "Matrices are not under [STAT]."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "X_INVERSE",
          "screen": "matrix-menu-names",
          "highlight": "NAMES tab, 1:[A] highlighted",
          "narration": "Open the MATRIX menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not MATRIX."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not MATRIX."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "matrix-menu-math",
          "highlight": "MATH tab",
          "narration": "Move right across the MATRIX tabs.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "RIGHT",
          "screen": "matrix-menu-edit",
          "highlight": "EDIT tab, 1:[A] highlighted",
          "narration": "Move to the EDIT tab so you can edit matrix [A].",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "ENTER",
          "screen": "matrix-editor-a-dims",
          "highlight": "dimension prompt for [A]",
          "narration": "Open matrix [A] for editing.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "{rows}",
          "screen": "matrix-editor-a-dims",
          "highlight": "row count entered",
          "narration": "Enter the number of rows.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "ENTER",
          "screen": "matrix-editor-a-dims",
          "highlight": "column prompt",
          "narration": "Move to the column count.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "{cols}",
          "screen": "matrix-editor-a-dims",
          "highlight": "column count entered",
          "narration": "Enter the number of columns.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "ENTER",
          "screen": "matrix-editor-a-values",
          "highlight": "first cell [1,1]",
          "narration": "Open the matrix grid.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 10,
          "key": "{cell value}",
          "screen": "matrix-editor-a-values",
          "highlight": "current matrix cell",
          "narration": "Enter the value in the current cell.",
          "skillType": "parameter",
          "repeatable": true,
          "loop": "matrix-cells",
          "loopMatrix": "[A]"
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "matrix-editor-a-values",
          "highlight": "next matrix cell",
          "narration": "Store the value and move to the next cell.",
          "skillType": "confirmation",
          "repeatable": true,
          "loop": "matrix-cells-commit"
        }
      ]
    },
    {
      "id": "set-plot-type",
      "name": "Choose a STAT PLOT type",
      "skillType": "navigation",
      "description": "Move across the Type row until the desired plot icon is highlighted.",
      "usedBy": [
        "histogram",
        "modified-boxplot",
        "scatterplot",
        "residual-plot"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Type row",
          "narration": "Move to the Type row in the plot editor.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Turn the plot on first if needed, then move to Type."
            },
            {
              "key": "RIGHT",
              "feedback": "You need to be on the Type row before moving across the icons."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "plot1-editor-scatter",
          "highlight": "desired plot icon",
          "narration": "Move across the icons until the desired plot type is highlighted.",
          "skillType": "navigation",
          "repeatable": true,
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "That skips the icon row."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "selected plot icon",
          "narration": "Confirm the highlighted plot icon.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "zoom-stat",
      "name": "Use ZoomStat",
      "skillType": "navigation",
      "description": "Auto-fit the graph window to the data.",
      "usedBy": [
        "histogram",
        "modified-boxplot",
        "scatterplot",
        "residual-plot"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "ZOOM",
          "screen": "zoom-menu",
          "highlight": "9:ZoomStat",
          "narration": "Open the ZOOM menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "WINDOW",
              "feedback": "WINDOW edits settings manually; ZoomStat auto-fits them for you."
            },
            {
              "key": "GRAPH",
              "feedback": "Graph first if needed, but the auto-fit command is under [ZOOM]."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "9",
          "screen": "scatterplot-graph",
          "highlight": "ZoomStat applied",
          "narration": "Choose ZoomStat to fit the visible window to the data.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "1",
              "feedback": "Option 1 is ZBox, not ZoomStat."
            },
            {
              "key": "ENTER",
              "feedback": "Use menu item 9 for ZoomStat."
            }
          ]
        }
      ]
    },
    {
      "id": "diagnostic-on",
      "name": "Turn on regression diagnostics",
      "skillType": "navigation",
      "description": "Execute DiagnosticOn so regression screens display r and r².",
      "usedBy": [
        "linreg-a-plus-bx"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "0",
              "feedback": "Use [2ND] first so [0] opens CATALOG."
            },
            {
              "key": "STAT",
              "feedback": "DiagnosticOn is in the CATALOG, not in STAT."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "0",
          "screen": "catalog-top",
          "highlight": "CATALOG cursor",
          "narration": "Open the CATALOG.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] opens variables, not the CATALOG."
            },
            {
              "key": "MODE",
              "feedback": "[MODE] quits menus; it does not open the CATALOG."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "X_INVERSE",
          "screen": "catalog-d-section",
          "highlight": "DiagnosticOn",
          "narration": "Jump to the D section of the CATALOG.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "DOWN",
          "screen": "catalog-d-section",
          "highlight": "DiagnosticOn",
          "narration": "Move until DiagnosticOn is highlighted.",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 5,
          "key": "ENTER",
          "screen": "home",
          "highlight": "DiagnosticOn pasted",
          "narration": "Paste DiagnosticOn to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "ENTER",
          "screen": "home",
          "highlight": "Done",
          "narration": "Execute DiagnosticOn; the calculator shows Done.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "access-resid-list",
      "name": "Paste the RESID list",
      "skillType": "parameter",
      "description": "Open LIST names and choose RESID.",
      "usedBy": [
        "residual-plot"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "plot1-editor-resid",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary function for LIST.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "Use [2ND] first so [STAT] opens LIST names."
            },
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not LIST names."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "STAT",
          "screen": "list-names-menu",
          "highlight": "1:L1 ... 7:RESID",
          "narration": "Open LIST names.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not LIST names."
            },
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not LIST names."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "7",
          "screen": "plot1-editor-resid",
          "highlight": "Ylist: RESID",
          "narration": "Paste RESID into the active field.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "select-alternative",
      "name": "Choose an alternative hypothesis",
      "skillType": "navigation",
      "description": "Move across the alternative row until the correct inequality is highlighted.",
      "usedBy": [
        "one-propztest",
        "two-propztest",
        "t-test-stats",
        "t-test-data",
        "two-samp-ttest",
        "linreg-ttest"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "RIGHT",
          "screen": "t-test-data-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the alternative row until the correct relation is highlighted.",
          "skillType": "navigation",
          "repeatable": true,
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Stay on the alternative row until the correct relation is selected."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "ENTER",
          "screen": "t-test-data-wizard",
          "highlight": "selected alternative",
          "narration": "Confirm the highlighted alternative if the editor requires it.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "RIGHT",
              "feedback": "Do not overshoot the relation you want."
            },
            {
              "key": "LEFT",
              "feedback": "That moves away from the current selection."
            }
          ]
        }
      ]
    },
    {
      "id": "calculate-vs-draw",
      "name": "Choose Calculate vs Draw",
      "skillType": "confirmation",
      "description": "Move to Calculate or Draw at the bottom of a test editor, then execute it.",
      "usedBy": [
        "one-propztest",
        "two-propztest",
        "t-test-stats",
        "t-test-data",
        "two-samp-ttest",
        "chi-square-gof-test",
        "chi-square-test"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "RIGHT",
          "screen": "one-propztest-wizard",
          "highlight": "Calculate or Draw",
          "narration": "Move between Calculate and Draw at the bottom row.",
          "skillType": "navigation",
          "repeatable": true,
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "You are already on the action row; move sideways."
            },
            {
              "key": "ENTER",
              "feedback": "Highlight the action you want first."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "ENTER",
          "screen": "one-propztest-result",
          "highlight": "numeric results or graph",
          "narration": "Execute the highlighted action.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "LEFT",
              "feedback": "Changing direction is fine, but you still need [ENTER] to run the test."
            },
            {
              "key": "RIGHT",
              "feedback": "Once the correct action is highlighted, press [ENTER]."
            }
          ]
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
      "description": "Calculate mean, standard deviations, and the five-number summary for one list.",
      "prerequisites": [
        "enter-data-l1",
        "nav-stat-calc"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "1:1-Var Stats",
          "narration": "Move to the CALC tab.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "one-var-stats-wizard",
          "highlight": "List: L1",
          "narration": "Open the 1-Var Stats wizard.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "DOWN",
          "screen": "one-var-stats-wizard",
          "highlight": "FreqList: 1",
          "narration": "Move to FreqList.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "one-var-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "ENTER",
          "screen": "one-var-stats-result-page1",
          "highlight": "x̄ line",
          "narration": "Calculate the summary statistics and show page 1.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "one-var-stats-result-page2",
          "highlight": "minX line",
          "narration": "Scroll to page 2 for minX, Q1, Med, Q3, and maxX.",
          "skillType": "navigation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric"
      },
      "assumeDataIn": "L1"
    },
    {
      "id": "histogram",
      "name": "Histogram",
      "unit": 1,
      "category": "graphing",
      "description": "Turn on Plot1 as a histogram of L1, zoom to the data, and trace the bins.",
      "prerequisites": [
        "enter-data-l1",
        "nav-2nd-statplot",
        "set-plot-type",
        "zoom-stat"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[Y=] alone opens function definitions. Use [2ND] then [Y=] for STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens the statistics menu, not plot setup."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "Y_EQUALS",
          "screen": "stat-plot-menu",
          "highlight": "1:Plot1...",
          "narration": "Open STAT PLOT.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not STAT PLOT."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "Plot1 editor",
          "narration": "Edit Plot1.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "On",
          "narration": "Turn Plot1 on.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Type row",
          "narration": "Move to the Type row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "RIGHT",
          "screen": "plot1-editor-hist",
          "highlight": "Histogram icon",
          "narration": "Press [right] until the Histogram icon is highlighted - it sits two icons right of Scatter, past xyLine.",
          "skillType": "navigation",
          "repeatable": true,
          "minPresses": 2
        },
        {
          "stepNumber": 7,
          "key": "ENTER",
          "screen": "plot1-editor-hist",
          "highlight": "Histogram icon selected",
          "narration": "Press [enter] to select Histogram. Highlighting the icon does not choose it - without this the plot stays a scatterplot and ZoomStat draws the wrong graph.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "plot1-editor-hist",
          "highlight": "Xlist",
          "narration": "Move to Xlist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "2ND",
          "screen": "plot1-editor-hist",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "1",
          "screen": "plot1-editor-hist",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "plot1-editor-hist",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "1",
          "screen": "plot1-editor-hist",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "ZOOM",
          "screen": "zoom-menu",
          "highlight": "9:ZoomStat",
          "narration": "Open the ZOOM menu.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "9",
          "screen": "histogram-graph",
          "highlight": "Histogram graph",
          "narration": "Use ZoomStat to fit the window to the histogram.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "TRACE",
          "screen": "histogram-trace",
          "highlight": "first bar",
          "narration": "Enter TRACE mode.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "RIGHT",
          "screen": "histogram-trace",
          "highlight": "next bar",
          "narration": "Move along the bars; TRACE reports the current bin center and count.",
          "skillType": "navigation",
          "repeatable": true
        }
      ],
      "dataRequirements": {
        "L1": "numeric"
      },
      "assumeDataIn": "L1"
    },
    {
      "id": "modified-boxplot",
      "name": "Modified Boxplot",
      "unit": 1,
      "category": "graphing",
      "description": "Turn on Plot1 as a modified boxplot of L1, zoom to the data, and trace the five-number summary and any outliers.",
      "prerequisites": [
        "enter-data-l1",
        "nav-2nd-statplot",
        "set-plot-type",
        "zoom-stat"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[Y=] alone opens function definitions. Use [2ND] then [Y=] for STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens the statistics menu, not plot setup."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "Y_EQUALS",
          "screen": "stat-plot-menu",
          "highlight": "1:Plot1...",
          "narration": "Open STAT PLOT.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not STAT PLOT."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "Plot1 editor",
          "narration": "Edit Plot1.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "On",
          "narration": "Turn Plot1 on.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Type row",
          "narration": "Move to the Type row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "RIGHT",
          "screen": "plot1-editor-modbox",
          "highlight": "Modified Boxplot icon",
          "narration": "Press [right] until the modified boxplot icon is highlighted - it sits three icons right of Scatter.",
          "skillType": "navigation",
          "repeatable": true,
          "minPresses": 3
        },
        {
          "stepNumber": 7,
          "key": "ENTER",
          "screen": "plot1-editor-modbox",
          "highlight": "Modified Boxplot icon selected",
          "narration": "Press [enter] to select the modified boxplot. Highlighting the icon does not choose it.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "plot1-editor-modbox",
          "highlight": "Xlist",
          "narration": "Move to Xlist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "2ND",
          "screen": "plot1-editor-modbox",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "1",
          "screen": "plot1-editor-modbox",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "plot1-editor-modbox",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "1",
          "screen": "plot1-editor-modbox",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "ZOOM",
          "screen": "zoom-menu",
          "highlight": "9:ZoomStat",
          "narration": "Open the ZOOM menu.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "9",
          "screen": "modified-boxplot-graph",
          "highlight": "Modified boxplot graph",
          "narration": "Use ZoomStat to fit the boxplot.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "TRACE",
          "screen": "modified-boxplot-trace",
          "highlight": "Med",
          "narration": "Enter TRACE mode on the boxplot.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "RIGHT",
          "screen": "modified-boxplot-trace",
          "highlight": "Q1, Q3, whiskers, or outlier",
          "narration": "Move across the trace points to read Med, Q1, Q3, minX, maxX, and any outliers.",
          "skillType": "navigation",
          "repeatable": true
        }
      ],
      "dataRequirements": {
        "L1": "numeric"
      },
      "assumeDataIn": "L1"
    },
    {
      "id": "normalcdf",
      "name": "normalcdf",
      "unit": 1,
      "category": "probability",
      "description": "Use the CE wizard to paste normalcdf(lower, upper, μ, σ) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "2",
          "screen": "normalcdf-wizard",
          "highlight": "lower",
          "narration": "Open the normalcdf wizard.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Enter the lower bound. For P(X < k), use −1E99. For P(X > k), lower = k and upper = 1E99."
            }
          ]
        },
        {
          "stepNumber": 4,
          "key": "{lower bound}",
          "screen": "normalcdf-wizard",
          "highlight": "lower entered",
          "narration": "Enter the lower bound.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "upper",
          "narration": "Move to upper.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "{upper bound}",
          "screen": "normalcdf-wizard",
          "highlight": "upper entered",
          "narration": "Enter the upper bound.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "μ",
          "narration": "Move to μ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{μ}",
          "screen": "normalcdf-wizard",
          "highlight": "μ entered",
          "narration": "Enter the mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "σ",
          "narration": "Move to σ.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Make sure you entered σ (standard deviation), not σ² (variance)."
            }
          ]
        },
        {
          "stepNumber": 10,
          "key": "{σ}",
          "screen": "normalcdf-wizard",
          "highlight": "σ entered",
          "narration": "Enter the standard deviation.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "home",
          "highlight": "normalcdf(...) pasted",
          "narration": "Paste the function to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 13,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "numeric area",
          "narration": "Evaluate the pasted command to show the probability.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "invnorm",
      "name": "invNorm",
      "unit": 1,
      "category": "probability",
      "description": "Use the CE wizard to paste invNorm(area, μ, σ, tail) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "3",
          "screen": "invnorm-wizard",
          "highlight": "area",
          "narration": "Open the invNorm wizard.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Enter area as a decimal (e.g., 0.95), not a percentage (95). Must be between 0 and 1."
            }
          ]
        },
        {
          "stepNumber": 4,
          "key": "{area}",
          "screen": "invnorm-wizard",
          "highlight": "area entered",
          "narration": "Enter the cumulative area.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "μ",
          "narration": "Move to μ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "{μ}",
          "screen": "invnorm-wizard",
          "highlight": "μ entered",
          "narration": "Enter the mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "σ",
          "narration": "Move to σ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{σ}",
          "screen": "invnorm-wizard",
          "highlight": "σ entered",
          "narration": "Enter the standard deviation.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "Tail",
          "narration": "Move to the Tail selector.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Check tail direction: LEFT = area to the left, RIGHT = area to the right, CENTER = area between two boundaries."
            },
            {
              "key": "DOWN",
              "feedback": "Press [RIGHT] to cycle LEFT/CENTER/RIGHT before moving down."
            }
          ]
        },
        {
          "stepNumber": 10,
          "key": "RIGHT",
          "screen": "invnorm-wizard",
          "highlight": "LEFT, CENTER, or RIGHT",
          "narration": "Move across the tail choices until the desired option is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "invnorm-wizard",
          "highlight": "LEFT, CENTER, or RIGHT selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "ENTER",
          "screen": "home",
          "highlight": "invNorm(...) pasted",
          "narration": "Paste the function to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 14,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "cutoff value",
          "narration": "Evaluate the pasted command to show the cutoff value.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "linreg-a-plus-bx",
      "name": "LinReg(a+bx)",
      "unit": 2,
      "category": "regression",
      "description": "Run the CE regression wizard for y = a + bx and display a, b, r², and r. This procedure assumes DiagnosticOn has already been executed.",
      "prerequisites": [
        "enter-data-l1-l2",
        "nav-stat-calc",
        "diagnostic-on"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to the CALC tab.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "8",
          "screen": "linreg-wizard",
          "highlight": "Xlist: L1",
          "narration": "Open LinReg(a+bx).",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "2ND",
          "screen": "linreg-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1 for Xlist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 5,
          "key": "1",
          "screen": "linreg-wizard",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "linreg-wizard",
          "highlight": "Ylist: L2",
          "narration": "Move to Ylist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "2ND",
          "screen": "linreg-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L2 for Ylist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "2",
          "screen": "linreg-wizard",
          "highlight": "Ylist: L2",
          "narration": "Set Ylist to L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "linreg-wizard",
          "highlight": "FreqList: 1",
          "narration": "Move to FreqList.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "1",
          "screen": "linreg-wizard",
          "highlight": "FreqList: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "linreg-wizard",
          "highlight": "Store RegEQ",
          "narration": "Move to Store RegEQ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "VARS",
          "screen": "linreg-wizard",
          "highlight": "Y-VARS selector",
          "narration": "Open Y-VARS so the regression equation can be stored.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "RIGHT",
          "screen": "linreg-wizard",
          "highlight": "Function menu",
          "narration": "Move to the Y-VARS function list.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "ENTER",
          "screen": "linreg-wizard",
          "highlight": "Y1",
          "narration": "Select the Function submenu.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "ENTER",
          "screen": "linreg-wizard",
          "highlight": "Store RegEQ: Y1",
          "narration": "Paste Y1 next to Store RegEQ.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "DOWN",
          "screen": "linreg-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 17,
          "key": "ENTER",
          "screen": "linreg-result",
          "highlight": "a line",
          "narration": "Calculate the regression and display the coefficients.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      },
      "assumeDataIn": [
        "L1",
        "L2"
      ]
    },
    {
      "id": "scatterplot",
      "name": "Scatterplot",
      "unit": 2,
      "category": "graphing",
      "description": "Turn on Plot1 as a scatterplot of L1 versus L2, zoom to the data, and trace the points.",
      "prerequisites": [
        "enter-data-l1-l2",
        "nav-2nd-statplot",
        "set-plot-type",
        "zoom-stat"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[Y=] alone opens function definitions. Use [2ND] then [Y=] for STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens the statistics menu, not plot setup."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "Y_EQUALS",
          "screen": "stat-plot-menu",
          "highlight": "1:Plot1...",
          "narration": "Open STAT PLOT.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not STAT PLOT."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "Plot1 editor",
          "narration": "Edit Plot1.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "On",
          "narration": "Turn Plot1 on.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Type row",
          "narration": "Move to the Type row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "Scatter icon selected",
          "narration": "Press [enter] to select the Scatter icon the cursor already sits on.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Xlist",
          "narration": "Move to Xlist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "2ND",
          "screen": "plot1-editor-scatter",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "1",
          "screen": "plot1-editor-scatter",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Ylist",
          "narration": "Move to Ylist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "2ND",
          "screen": "plot1-editor-scatter",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "2",
          "screen": "plot1-editor-scatter",
          "highlight": "Ylist: L2",
          "narration": "Set Ylist to L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "ZOOM",
          "screen": "zoom-menu",
          "highlight": "9:ZoomStat",
          "narration": "Open the ZOOM menu.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "9",
          "screen": "scatterplot-graph",
          "highlight": "Scatterplot graph",
          "narration": "Use ZoomStat to fit the scatterplot to the data.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "TRACE",
          "screen": "scatterplot-trace",
          "highlight": "first point",
          "narration": "Enter TRACE mode.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "RIGHT",
          "screen": "scatterplot-trace",
          "highlight": "next point",
          "narration": "Move from point to point to read x- and y-coordinates.",
          "skillType": "navigation",
          "repeatable": true
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      },
      "assumeDataIn": [
        "L1",
        "L2"
      ]
    },
    {
      "id": "residual-plot",
      "name": "Residual plot",
      "unit": 2,
      "category": "graphing",
      "description": "After a regression, set Plot1 to use Xlist L1 and Ylist RESID, then zoom to the residual plot.",
      "prerequisites": [
        "enter-data-l1-l2",
        "linreg-a-plus-bx",
        "nav-2nd-statplot",
        "access-resid-list",
        "zoom-stat"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "Y=",
              "feedback": "[Y=] alone opens function definitions. Use [2ND] then [Y=] for STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens the statistics menu, not plot setup."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "Y_EQUALS",
          "screen": "stat-plot-menu",
          "highlight": "1:Plot1...",
          "narration": "Open STAT PLOT.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not STAT PLOT."
            },
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not STAT PLOT."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "Plot1 editor",
          "narration": "Edit Plot1.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "plot1-editor-scatter",
          "highlight": "On",
          "narration": "Turn Plot1 on.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "plot1-editor-scatter",
          "highlight": "Type row",
          "narration": "Move to the Type row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "ENTER",
          "screen": "plot1-editor-resid",
          "highlight": "Scatter icon selected",
          "narration": "Press [enter] to select the Scatter icon - the residual plot uses the scatter type.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "plot1-editor-resid",
          "highlight": "Xlist",
          "narration": "Move to Xlist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "2ND",
          "screen": "plot1-editor-resid",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "1",
          "screen": "plot1-editor-resid",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "plot1-editor-resid",
          "highlight": "Ylist",
          "narration": "Move to Ylist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "2ND",
          "screen": "plot1-editor-resid",
          "highlight": "2ND indicator",
          "narration": "Prepare to open LIST names.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "STAT",
          "screen": "list-names-menu",
          "highlight": "7:RESID",
          "narration": "Open LIST names.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "7",
          "screen": "plot1-editor-resid",
          "highlight": "Ylist: RESID",
          "narration": "Paste RESID into Ylist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 14,
          "key": "ZOOM",
          "screen": "zoom-menu",
          "highlight": "9:ZoomStat",
          "narration": "Open the ZOOM menu.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 15,
          "key": "9",
          "screen": "residual-plot-graph",
          "highlight": "Residual plot",
          "narration": "Use ZoomStat to fit the residual plot.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "TRACE",
          "screen": "residual-plot-graph",
          "highlight": "first residual point",
          "narration": "Enter TRACE mode to inspect residual coordinates.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 17,
          "key": "RIGHT",
          "screen": "residual-plot-graph",
          "highlight": "next residual point",
          "narration": "Move across the residual points.",
          "skillType": "navigation",
          "repeatable": true
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      }
    },
    {
      "id": "binompdf",
      "name": "binompdf",
      "unit": 4,
      "category": "probability",
      "description": "Use the CE wizard to paste binompdf(numtrials, p, x) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "DOWN",
          "screen": "distr-menu",
          "highlight": "A:binompdf(",
          "narration": "Scroll until A:binompdf( is highlighted.",
          "skillType": "navigation",
          "repeatable": true,
          "minPresses": 10
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "binompdf-wizard",
          "highlight": "binompdf wizard",
          "narration": "Open the binompdf wizard.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Keep scrolling — binompdf is at A. Or did you mean binomcdf (B) for cumulative P(X≤k)?"
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "{numtrials}",
          "screen": "binompdf-wizard",
          "highlight": "trials entered",
          "narration": "Enter the number of trials.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "binompdf-wizard",
          "highlight": "p",
          "narration": "Move to p.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{p}",
          "screen": "binompdf-wizard",
          "highlight": "p entered",
          "narration": "Enter the probability of success.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "binompdf-wizard",
          "highlight": "x",
          "narration": "Move to x.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "{x}",
          "screen": "binompdf-wizard",
          "highlight": "x entered",
          "narration": "Enter the exact number of successes.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "binompdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "home",
          "highlight": "binompdf(...) pasted",
          "narration": "Paste the command to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "single probability",
          "narration": "Evaluate the pasted command to show P(X = x).",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "binomcdf",
      "name": "binomcdf",
      "unit": 4,
      "category": "probability",
      "description": "Use the CE wizard to paste binomcdf(numtrials, p, x) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "DOWN",
          "screen": "distr-menu",
          "highlight": "B:binomcdf(",
          "narration": "Scroll until B:binomcdf( is highlighted.",
          "skillType": "navigation",
          "repeatable": true,
          "minPresses": 11
        },
        {
          "stepNumber": 4,
          "key": "ENTER",
          "screen": "binomcdf-wizard",
          "highlight": "binomcdf wizard",
          "narration": "Open the binomcdf wizard.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Keep scrolling — binomcdf is at B. Make sure you want cumulative P(X≤k), not exact P(X=k) which is binompdf (A)."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "{numtrials}",
          "screen": "binomcdf-wizard",
          "highlight": "trials entered",
          "narration": "Enter the number of trials.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "binomcdf-wizard",
          "highlight": "p",
          "narration": "Move to p.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{p}",
          "screen": "binomcdf-wizard",
          "highlight": "p entered",
          "narration": "Enter the probability of success.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "binomcdf-wizard",
          "highlight": "x",
          "narration": "Move to x.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "{x}",
          "screen": "binomcdf-wizard",
          "highlight": "x entered",
          "narration": "Enter the largest counted value.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "binomcdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "home",
          "highlight": "binomcdf(...) pasted",
          "narration": "Paste the command to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "cumulative probability",
          "narration": "Evaluate the pasted command to show P(X ≤ x).",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "geometpdf",
      "name": "geometpdf",
      "unit": 4,
      "category": "probability",
      "description": "Use the CE wizard to paste geometpdf(p, x) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ALPHA",
          "screen": "distr-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "COS",
          "screen": "geometpdf-wizard",
          "highlight": "F:geometpdf(",
          "narration": "Press [cos] (the F key) to select geometpdf.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "{p}",
          "screen": "geometpdf-wizard",
          "highlight": "p entered",
          "narration": "Enter the probability of success.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "geometpdf-wizard",
          "highlight": "x",
          "narration": "Move to x.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{x}",
          "screen": "geometpdf-wizard",
          "highlight": "x entered",
          "narration": "Enter the trial number of the first success.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "geometpdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "ENTER",
          "screen": "home",
          "highlight": "geometpdf(...) pasted",
          "narration": "Paste the command to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 10,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "single probability",
          "narration": "Evaluate the pasted command to show the probability for trial x.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "geometcdf",
      "name": "geometcdf",
      "unit": 4,
      "category": "probability",
      "description": "Use the CE wizard to paste geometcdf(p, x) to the home screen and evaluate it.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "ALPHA",
          "screen": "distr-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "TAN",
          "screen": "geometcdf-wizard",
          "highlight": "G:geometcdf(",
          "narration": "Press [tan] (the G key) to select geometcdf.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 5,
          "key": "{p}",
          "screen": "geometcdf-wizard",
          "highlight": "p entered",
          "narration": "Enter the probability of success.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "geometcdf-wizard",
          "highlight": "x",
          "narration": "Move to x.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{x}",
          "screen": "geometcdf-wizard",
          "highlight": "x entered",
          "narration": "Enter the largest trial number to count.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "geometcdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "ENTER",
          "screen": "home",
          "highlight": "geometcdf(...) pasted",
          "narration": "Paste the command to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 10,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "cumulative probability",
          "narration": "Evaluate the pasted command to show P(X ≤ x).",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "normalcdf-sampling",
      "name": "normalcdf for sampling distribution",
      "unit": 5,
      "category": "sampling-distribution",
      "description": "Use normalcdf with μ equal to the sampling-distribution mean and σ equal to the hand-computed standard error.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "2",
          "screen": "normalcdf-wizard",
          "highlight": "lower",
          "narration": "Open the normalcdf wizard.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 4,
          "key": "{lower bound}",
          "screen": "normalcdf-wizard",
          "highlight": "lower entered",
          "narration": "Enter the lower bound on the statistic.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "upper",
          "narration": "Move to upper.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "{upper bound}",
          "screen": "normalcdf-wizard",
          "highlight": "upper entered",
          "narration": "Enter the upper bound on the statistic.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "μ",
          "narration": "Move to μ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{sampling mean}",
          "screen": "normalcdf-wizard",
          "highlight": "μ entered",
          "narration": "Enter the mean of the sampling distribution.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "σ",
          "narration": "Move to σ.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "For sampling distributions, enter the standard error (σ/√n), not the population σ."
            }
          ]
        },
        {
          "stepNumber": 10,
          "key": "{SE = σ/√n}",
          "screen": "normalcdf-wizard",
          "highlight": "σ entered",
          "narration": "Enter the standard error in the σ field.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "normalcdf-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "home",
          "highlight": "normalcdf(...) pasted",
          "narration": "Paste the function to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 13,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "numeric area",
          "narration": "Evaluate the pasted command to show the probability.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "invnorm-sampling",
      "name": "invNorm for sampling distribution",
      "unit": 5,
      "category": "sampling-distribution",
      "description": "Use invNorm with μ equal to the sampling-distribution mean and σ equal to the hand-computed standard error.",
      "prerequisites": [
        "nav-2nd-distr"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[VARS] alone opens the variables menu. Use [2ND] then [VARS] for DISTR."
            },
            {
              "key": "STAT",
              "feedback": "[STAT] opens statistics, not the distribution menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "VARS",
          "screen": "distr-menu",
          "highlight": "1:normalpdf(",
          "narration": "Open the DISTR menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[2ND][STAT] opens LIST names, not DISTR."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not DISTR."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "3",
          "screen": "invnorm-wizard",
          "highlight": "area",
          "narration": "Open the invNorm wizard.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Enter area as a decimal (0.95), not a percentage (95)."
            }
          ]
        },
        {
          "stepNumber": 4,
          "key": "{area}",
          "screen": "invnorm-wizard",
          "highlight": "area entered",
          "narration": "Enter the target cumulative area.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "μ",
          "narration": "Move to μ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "{sampling mean}",
          "screen": "invnorm-wizard",
          "highlight": "μ entered",
          "narration": "Enter the mean of the sampling distribution.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "σ",
          "narration": "Move to σ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{SE = σ/√n}",
          "screen": "invnorm-wizard",
          "highlight": "σ entered",
          "narration": "Enter the standard error in the σ field.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "Tail",
          "narration": "Move to the Tail selector.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Check tail: LEFT = area to the left (default). RIGHT = area to the right."
            }
          ]
        },
        {
          "stepNumber": 10,
          "key": "RIGHT",
          "screen": "invnorm-wizard",
          "highlight": "LEFT, CENTER, or RIGHT",
          "narration": "Move across the tail choices until the desired option is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "invnorm-wizard",
          "highlight": "LEFT, CENTER, or RIGHT selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "invnorm-wizard",
          "highlight": "Paste",
          "narration": "Move to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "ENTER",
          "screen": "home",
          "highlight": "invNorm(...) pasted",
          "narration": "Paste the function to the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 14,
          "key": "ENTER",
          "screen": "distribution-home-result",
          "highlight": "cutoff value",
          "narration": "Evaluate the pasted command to show the cutoff value.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "one-propztest",
      "name": "1-PropZTest",
      "unit": 6,
      "category": "inference-proportion",
      "description": "Run a one-proportion z test from summary counts x and n.",
      "prerequisites": [
        "nav-stat-tests",
        "select-alternative",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "5",
          "screen": "one-propztest-wizard",
          "highlight": "p0",
          "narration": "Open 1-PropZTest.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "2",
              "feedback": "That opens T-Test (for means). Press [5] for 1-PropZTest (for proportions)."
            },
            {
              "key": "8",
              "feedback": "That opens TInterval. Press [5] for 1-PropZTest."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "{p0}",
          "screen": "one-propztest-wizard",
          "highlight": "p0 entered",
          "narration": "Enter the hypothesized population proportion.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "one-propztest-wizard",
          "highlight": "x",
          "narration": "Move to x.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{x}",
          "screen": "one-propztest-wizard",
          "highlight": "x entered",
          "narration": "Enter the number of successes.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "one-propztest-wizard",
          "highlight": "n",
          "narration": "Move to n.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "{n}",
          "screen": "one-propztest-wizard",
          "highlight": "n entered",
          "narration": "Enter the sample size.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "one-propztest-wizard",
          "highlight": "Prop row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "RIGHT",
          "screen": "one-propztest-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the Prop row until the correct alternative is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true,
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Use [RIGHT] to change the direction, not [DOWN]. DOWN moves to the next field."
            }
          ]
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "one-propztest-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "one-propztest-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "DOWN",
          "screen": "one-propztest-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 15,
          "key": "ENTER",
          "screen": "one-propztest-result",
          "highlight": "z line",
          "narration": "Choose Calculate to show the numeric results.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Cursor is already on Calculate. Press [ENTER] to run the test."
            }
          ]
        }
      ]
    },
    {
      "id": "one-propzint",
      "name": "1-PropZInt",
      "unit": 6,
      "category": "inference-proportion",
      "description": "Compute a one-proportion z confidence interval from x and n.",
      "prerequisites": [
        "nav-stat-tests"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "MATH",
          "screen": "one-propzint-wizard",
          "highlight": "A:1-PropZInt...",
          "narration": "Press [math] (the A key) to select 1-PropZInt..",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Keep scrolling — A:1-PropZInt is below the visible items."
            }
          ]
        },
        {
          "stepNumber": 6,
          "key": "{x}",
          "screen": "one-propzint-wizard",
          "highlight": "x entered",
          "narration": "Enter the number of successes.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "one-propzint-wizard",
          "highlight": "n",
          "narration": "Move to n.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{n}",
          "screen": "one-propzint-wizard",
          "highlight": "n entered",
          "narration": "Enter the sample size.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "one-propzint-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "{C-Level}",
          "screen": "one-propzint-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "one-propzint-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "ENTER",
          "screen": "one-propzint-result",
          "highlight": "interval line",
          "narration": "Compute the confidence interval.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "two-propztest",
      "name": "2-PropZTest",
      "unit": 6,
      "category": "inference-proportion",
      "description": "Run a two-proportion z test from summary counts x1/n1 and x2/n2.",
      "prerequisites": [
        "nav-stat-tests",
        "select-alternative",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "6",
          "screen": "two-propztest-wizard",
          "highlight": "x1",
          "narration": "Open 2-PropZTest.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "5",
              "feedback": "That opens 1-PropZTest. Press [6] for 2-PropZTest."
            },
            {
              "key": "4",
              "feedback": "That opens 2-SampTTest for means. Press [6] for the two-proportion z test."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "{x1}",
          "screen": "two-propztest-wizard",
          "highlight": "x1 entered",
          "narration": "Enter the number of successes for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "n1",
          "narration": "Move to n1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "{n1}",
          "screen": "two-propztest-wizard",
          "highlight": "n1 entered",
          "narration": "Enter the sample size for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "x2",
          "narration": "Move to x2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "{x2}",
          "screen": "two-propztest-wizard",
          "highlight": "x2 entered",
          "narration": "Enter the number of successes for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "n2",
          "narration": "Move to n2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "{n2}",
          "screen": "two-propztest-wizard",
          "highlight": "n2 entered",
          "narration": "Enter the sample size for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "p1 ? p2 row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "RIGHT",
          "screen": "two-propztest-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the p1 and p2 alternatives until the desired relation is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true,
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Use [RIGHT] to change the direction, not [DOWN]. DOWN moves to the next field."
            }
          ]
        },
        {
          "stepNumber": 14,
          "key": "ENTER",
          "screen": "two-propztest-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "DOWN",
          "screen": "two-propztest-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 17,
          "key": "ENTER",
          "screen": "two-propztest-result",
          "highlight": "z line",
          "narration": "Choose Calculate to show the test results.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Cursor is already on Calculate. Press [ENTER] to run the test."
            }
          ]
        }
      ]
    },
    {
      "id": "two-propzint",
      "name": "2-PropZInt",
      "unit": 6,
      "category": "inference-proportion",
      "description": "Compute a two-proportion z confidence interval from summary counts x1/n1 and x2/n2.",
      "prerequisites": [
        "nav-stat-tests"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "APPS",
          "screen": "two-propzint-wizard",
          "highlight": "B:2-PropZInt...",
          "narration": "Press [apps] (the B key) to select 2-PropZInt..",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "MATH",
              "feedback": "That opens A:1-PropZInt. Press [APPS] for B:2-PropZInt."
            }
          ]
        },
        {
          "stepNumber": 6,
          "key": "{x1}",
          "screen": "two-propzint-wizard",
          "highlight": "x1 entered",
          "narration": "Enter the number of successes for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "two-propzint-wizard",
          "highlight": "n1",
          "narration": "Move to n1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{n1}",
          "screen": "two-propzint-wizard",
          "highlight": "n1 entered",
          "narration": "Enter the sample size for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "two-propzint-wizard",
          "highlight": "x2",
          "narration": "Move to x2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "{x2}",
          "screen": "two-propzint-wizard",
          "highlight": "x2 entered",
          "narration": "Enter the number of successes for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "two-propzint-wizard",
          "highlight": "n2",
          "narration": "Move to n2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "{n2}",
          "screen": "two-propzint-wizard",
          "highlight": "n2 entered",
          "narration": "Enter the sample size for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "two-propzint-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "{C-Level}",
          "screen": "two-propzint-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "two-propzint-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "ENTER",
          "screen": "two-propzint-result",
          "highlight": "interval line",
          "narration": "Compute the two-proportion confidence interval.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "t-test-stats",
      "name": "T-Test (Stats input)",
      "unit": 7,
      "category": "inference-mean",
      "description": "Run a one-sample t test from summary statistics.",
      "prerequisites": [
        "nav-stat-tests",
        "select-data-vs-stats",
        "select-alternative",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "2",
          "screen": "t-test-data-wizard",
          "highlight": "Inpt: Data",
          "narration": "Open T-Test.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "5",
              "feedback": "That opens 1-PropZTest (proportions). Press [2] for T-Test (means)."
            },
            {
              "key": "8",
              "feedback": "That opens TInterval. Press [2] for T-Test."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "RIGHT",
          "screen": "t-test-stats-wizard",
          "highlight": "Inpt: Stats",
          "narration": "Switch Inpt from Data to Stats.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Toggle to Stats first — press [RIGHT] to switch from Data to Stats."
            }
          ]
        },
        {
          "key": "ENTER",
          "screen": "t-test-stats-wizard",
          "highlight": "Inpt: Stats selected",
          "narration": "Press [enter] to select Stats. Highlighting Stats does not choose it - without this the fields stay in Data mode.",
          "skillType": "confirmation",
          "stepNumber": 6
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "First data field",
          "narration": "Move past Inpt to the first data entry field.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{μ0}",
          "screen": "t-test-stats-wizard",
          "highlight": "μ0 entered",
          "narration": "Enter the hypothesized mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "x̄",
          "narration": "Move to x̄.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "{x̄}",
          "screen": "t-test-stats-wizard",
          "highlight": "x̄ entered",
          "narration": "Enter the sample mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "Sx",
          "narration": "Move to Sx.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "{Sx}",
          "screen": "t-test-stats-wizard",
          "highlight": "Sx entered",
          "narration": "Enter the sample standard deviation.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "n",
          "narration": "Move to n.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "{n}",
          "screen": "t-test-stats-wizard",
          "highlight": "n entered",
          "narration": "Enter the sample size.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "alternative row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Check the direction first. Move to the alternative row, use [RIGHT] to highlight ≠μ₀, <μ₀, or >μ₀, then [ENTER] to select it."
            }
          ]
        },
        {
          "stepNumber": 16,
          "key": "RIGHT",
          "screen": "t-test-stats-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the alternatives until the desired relation is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 17,
          "key": "ENTER",
          "screen": "t-test-stats-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 18,
          "key": "DOWN",
          "screen": "t-test-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 19,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 20,
          "key": "ENTER",
          "screen": "t-test-result",
          "highlight": "t line",
          "narration": "Choose Calculate to show the t-test results.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Cursor is on Calculate. Press [ENTER] to execute, or [RIGHT] to switch to Draw."
            }
          ]
        }
      ]
    },
    {
      "id": "t-test-data",
      "name": "T-Test (Data input)",
      "unit": 7,
      "category": "inference-mean",
      "description": "Run a one-sample t test from raw data in L1.",
      "prerequisites": [
        "enter-data-l1",
        "nav-stat-tests",
        "select-alternative",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "2",
          "screen": "t-test-data-wizard",
          "highlight": "Inpt: Data",
          "narration": "Open T-Test with Data input selected.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "5",
              "feedback": "That opens 1-PropZTest (proportions). Press [2] for T-Test (means)."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "μ₀ field",
          "narration": "Move past Inpt (Data mode) to the μ₀ field.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "{μ0}",
          "screen": "t-test-data-wizard",
          "highlight": "μ0 entered",
          "narration": "Enter the hypothesized mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "List",
          "narration": "Move to List.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "2ND",
          "screen": "t-test-data-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "1",
          "screen": "t-test-data-wizard",
          "highlight": "List: L1",
          "narration": "Set List to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "1",
          "screen": "t-test-data-wizard",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "alternative row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "RIGHT",
          "screen": "t-test-data-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the alternatives until the desired relation is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 14,
          "key": "ENTER",
          "screen": "t-test-data-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "DOWN",
          "screen": "t-test-data-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 17,
          "key": "ENTER",
          "screen": "t-test-result",
          "highlight": "t line",
          "narration": "Choose Calculate to show the t-test results.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric"
      },
      "assumeDataIn": "L1"
    },
    {
      "id": "t-interval-stats",
      "name": "TInterval (Stats input)",
      "unit": 7,
      "category": "inference-mean",
      "description": "Compute a one-sample t confidence interval from summary statistics.",
      "prerequisites": [
        "nav-stat-tests",
        "select-data-vs-stats"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "8",
          "screen": "t-interval-data-wizard",
          "highlight": "Inpt: Data",
          "narration": "Press [8] to open TInterval.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "2",
              "feedback": "That opens T-Test. Press [8] for TInterval."
            },
            {
              "key": "0",
              "feedback": "That opens 2-SampTInt. Press [8] for the one-sample TInterval."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "RIGHT",
          "screen": "t-interval-stats-wizard",
          "highlight": "Inpt: Stats",
          "narration": "Switch Inpt from Data to Stats.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Switch to Stats first — press [RIGHT] to toggle from Data to Stats."
            }
          ]
        },
        {
          "key": "ENTER",
          "screen": "t-interval-stats-wizard",
          "highlight": "Inpt: Stats selected",
          "narration": "Press [enter] to select Stats. Highlighting Stats does not choose it - without this the fields stay in Data mode.",
          "skillType": "confirmation",
          "stepNumber": 6
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "t-interval-stats-wizard",
          "highlight": "First data field",
          "narration": "Move past Inpt to the first data entry field.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{x̄}",
          "screen": "t-interval-stats-wizard",
          "highlight": "x̄ entered",
          "narration": "Enter the sample mean.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "t-interval-stats-wizard",
          "highlight": "Sx",
          "narration": "Move to Sx.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "{Sx}",
          "screen": "t-interval-stats-wizard",
          "highlight": "Sx entered",
          "narration": "Enter the sample standard deviation.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "t-interval-stats-wizard",
          "highlight": "n",
          "narration": "Move to n.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "{n}",
          "screen": "t-interval-stats-wizard",
          "highlight": "n entered",
          "narration": "Enter the sample size.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "t-interval-stats-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "{C-Level}",
          "screen": "t-interval-stats-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "t-interval-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "ENTER",
          "screen": "t-interval-result",
          "highlight": "interval line",
          "narration": "Compute the confidence interval.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "t-interval-data",
      "name": "TInterval (Data input)",
      "unit": 7,
      "category": "inference-mean",
      "description": "Compute a one-sample t confidence interval from raw data in L1.",
      "prerequisites": [
        "enter-data-l1",
        "nav-stat-tests"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "8",
          "screen": "t-interval-data-wizard",
          "highlight": "Inpt: Data",
          "narration": "Press [8] to open TInterval with Data input selected.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "2",
              "feedback": "That opens T-Test. Press [8] for TInterval."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "DOWN",
          "screen": "t-interval-data-wizard",
          "highlight": "List",
          "narration": "Move to List.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "2ND",
          "screen": "t-interval-data-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "t-interval-data-wizard",
          "highlight": "List: L1",
          "narration": "Set List to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "t-interval-data-wizard",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "1",
          "screen": "t-interval-data-wizard",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "t-interval-data-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "{C-Level}",
          "screen": "t-interval-data-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "t-interval-data-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "ENTER",
          "screen": "t-interval-result",
          "highlight": "interval line",
          "narration": "Compute the confidence interval.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric"
      },
      "assumeDataIn": "L1"
    },
    {
      "id": "two-samp-ttest",
      "name": "2-SampTTest",
      "unit": 7,
      "category": "inference-mean",
      "description": "Run a two-sample t test from summary statistics for two groups.",
      "prerequisites": [
        "nav-stat-tests",
        "select-data-vs-stats",
        "select-alternative",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "4",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Inpt: Data",
          "narration": "Open 2-SampTTest.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "2",
              "feedback": "That opens one-sample T-Test. Press [4] for 2-SampTTest."
            },
            {
              "key": "0",
              "feedback": "That opens 2-SampTInt (confidence interval). Press [4] for 2-SampTTest."
            }
          ]
        },
        {
          "stepNumber": 5,
          "key": "RIGHT",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Inpt: Stats",
          "narration": "Switch Inpt from Data to Stats.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Switch to Stats first — press [RIGHT]."
            }
          ]
        },
        {
          "key": "ENTER",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Inpt: Stats selected",
          "narration": "Press [enter] to select Stats. Highlighting Stats does not choose it - without this the fields stay in Data mode.",
          "skillType": "confirmation",
          "stepNumber": 6
        },
        {
          "stepNumber": 7,
          "key": "{x̄1}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "x̄1 entered",
          "narration": "Enter the mean for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Sx1",
          "narration": "Move to Sx1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "{Sx1}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Sx1 entered",
          "narration": "Enter the standard deviation for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "n1",
          "narration": "Move to n1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "{n1}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "n1 entered",
          "narration": "Enter the sample size for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 12,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "x̄2",
          "narration": "Move to x̄2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "{x̄2}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "x̄2 entered",
          "narration": "Enter the mean for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 14,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Sx2",
          "narration": "Move to Sx2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 15,
          "key": "{Sx2}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Sx2 entered",
          "narration": "Enter the standard deviation for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 16,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "n2",
          "narration": "Move to n2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 17,
          "key": "{n2}",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "n2 entered",
          "narration": "Enter the sample size for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 18,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "alternative row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 19,
          "key": "RIGHT",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the alternatives until the desired relation is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 20,
          "key": "ENTER",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 21,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Pooled",
          "narration": "Move to Pooled.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Check Pooled setting. For Algebra 2, Pooled is almost always No unless the problem says to pool."
            }
          ]
        },
        {
          "stepNumber": 22,
          "key": "RIGHT",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Pooled: No or Yes",
          "narration": "Choose whether to pool the variances (0-1 presses depending on the problem - Pooled is only No or Yes).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 23,
          "key": "ENTER",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Pooled: No or Yes selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 24,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 25,
          "key": "DOWN",
          "screen": "two-samp-ttest-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 26,
          "key": "ENTER",
          "screen": "two-samp-ttest-result",
          "highlight": "t line",
          "narration": "Choose Calculate to show the test results.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "two-samp-tint",
      "name": "2-SampTInt",
      "unit": 7,
      "category": "inference-mean",
      "description": "Compute a two-sample t confidence interval from summary statistics for two groups.",
      "prerequisites": [
        "nav-stat-tests",
        "select-data-vs-stats"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "0",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Inpt: Data",
          "narration": "Press [0] to open 2-SampTInt.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "4",
              "feedback": "That opens 2-SampTTest. Press [0] for 2-SampTInt."
            }
          ]
        },
        {
          "key": "RIGHT",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Inpt: Stats",
          "narration": "Switch Inpt from Data to Stats.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "DOWN",
              "feedback": "Switch to Stats first - press [RIGHT]."
            }
          ],
          "stepNumber": 5
        },
        {
          "key": "ENTER",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Inpt: Stats selected",
          "narration": "Press [enter] to select Stats. Highlighting Stats does not choose it - without this the fields stay in Data mode.",
          "skillType": "confirmation",
          "stepNumber": 6
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "First data field",
          "narration": "Move past Inpt to the first data entry field.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "{x̄1}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "x̄1 entered",
          "narration": "Enter the mean for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Sx1",
          "narration": "Move to Sx1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "{Sx1}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Sx1 entered",
          "narration": "Enter the standard deviation for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "n1",
          "narration": "Move to n1.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "{n1}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "n1 entered",
          "narration": "Enter the sample size for sample 1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "x̄2",
          "narration": "Move to x̄2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "{x̄2}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "x̄2 entered",
          "narration": "Enter the mean for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Sx2",
          "narration": "Move to Sx2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "{Sx2}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Sx2 entered",
          "narration": "Enter the standard deviation for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 17,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "n2",
          "narration": "Move to n2.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 18,
          "key": "{n2}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "n2 entered",
          "narration": "Enter the sample size for sample 2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 19,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 20,
          "key": "{C-Level}",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 21,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Pooled",
          "narration": "Move to Pooled.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 22,
          "key": "RIGHT",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Pooled: No or Yes",
          "narration": "Choose whether to pool the variances (0-1 presses depending on the problem - Pooled is only No or Yes).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 23,
          "key": "ENTER",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Pooled: No or Yes selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 24,
          "key": "DOWN",
          "screen": "two-samp-tint-stats-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 25,
          "key": "ENTER",
          "screen": "two-samp-tint-result",
          "highlight": "interval line",
          "narration": "Compute the two-sample confidence interval.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "matrix-entry",
      "name": "Enter matrix",
      "unit": 8,
      "category": "chi-square",
      "description": "Create or overwrite matrix [A] with observed counts.",
      "prerequisites": [
        "enter-matrix"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "2ND",
          "screen": "home-second",
          "highlight": "2ND indicator",
          "narration": "Activate the yellow secondary functions.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "X_INVERSE",
              "feedback": "Use [2ND] first so x^-1 becomes MATRIX."
            },
            {
              "key": "STAT",
              "feedback": "Observed counts for χ²-Test go into a matrix, not a list."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "X_INVERSE",
          "screen": "matrix-menu-names",
          "highlight": "NAMES tab, 1:[A]",
          "narration": "Open the MATRIX menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "VARS",
              "feedback": "[2ND][VARS] opens DISTR, not MATRIX."
            },
            {
              "key": "Y=",
              "feedback": "[2ND][Y=] opens STAT PLOT, not MATRIX."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "matrix-menu-math",
          "highlight": "MATH tab",
          "narration": "Move right across the MATRIX tabs.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "RIGHT",
          "screen": "matrix-menu-edit",
          "highlight": "EDIT tab, 1:[A]",
          "narration": "Move to the EDIT tab.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "ENTER",
          "screen": "matrix-editor-a-dims",
          "highlight": "dimension prompt",
          "narration": "Open matrix [A].",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "{rows}",
          "screen": "matrix-editor-a-dims",
          "highlight": "row count",
          "narration": "Enter the row count.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "ENTER",
          "screen": "matrix-editor-a-dims",
          "highlight": "column prompt",
          "narration": "Move to columns.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "{cols}",
          "screen": "matrix-editor-a-dims",
          "highlight": "column count",
          "narration": "Enter the column count.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 9,
          "key": "ENTER",
          "screen": "matrix-editor-a-values",
          "highlight": "first cell",
          "narration": "Open the matrix grid.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 10,
          "key": "{cell value}",
          "screen": "matrix-editor-a-values",
          "highlight": "current cell",
          "narration": "Enter each observed count cell by cell.",
          "skillType": "parameter",
          "repeatable": true,
          "loop": "matrix-cells",
          "loopMatrix": "[A]"
        },
        {
          "stepNumber": 11,
          "key": "ENTER",
          "screen": "matrix-editor-a-values",
          "highlight": "next cell",
          "narration": "Store the entry and move to the next cell.",
          "skillType": "confirmation",
          "repeatable": true,
          "loop": "matrix-cells-commit"
        }
      ]
    },
    {
      "id": "chi-square-gof-test",
      "name": "χ²GOF-Test",
      "unit": 8,
      "category": "chi-square",
      "description": "Run the goodness-of-fit test with observed counts in L1 and expected counts in L2.",
      "prerequisites": [
        "nav-stat-tests",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "X_INVERSE",
          "screen": "chi2gof-wizard",
          "highlight": "D:χ²GOF-Test...",
          "narration": "Press [x⁻¹] (the D key) to select χ²GOF-Test..",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "2ND",
          "screen": "chi2gof-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1 for Observed.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "chi2gof-wizard",
          "highlight": "Observed: L1",
          "narration": "Set Observed to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "chi2gof-wizard",
          "highlight": "Expected",
          "narration": "Move to Expected.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "2ND",
          "screen": "chi2gof-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L2 for Expected.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "2",
          "screen": "chi2gof-wizard",
          "highlight": "Expected: L2",
          "narration": "Set Expected to L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "chi2gof-wizard",
          "highlight": "df",
          "narration": "Move to df.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Enter the df value first. For GOF, df = number of categories − 1."
            }
          ]
        },
        {
          "stepNumber": 12,
          "key": "{df}",
          "screen": "chi2gof-wizard",
          "highlight": "df entered",
          "narration": "Enter the degrees of freedom.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "chi2gof-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "DOWN",
          "screen": "chi2gof-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 15,
          "key": "ENTER",
          "screen": "chi2gof-result",
          "highlight": "χ² line",
          "narration": "Choose Calculate to show χ², p, df, and CNTB.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      }
    },
    {
      "id": "chi-square-test",
      "name": "χ²-Test",
      "unit": 8,
      "category": "chi-square",
      "description": "Run the chi-square test of independence or homogeneity with observed counts in matrix [A].",
      "prerequisites": [
        "enter-matrix",
        "nav-stat-tests",
        "calculate-vs-draw"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "PRGM",
          "screen": "chi2test-wizard",
          "highlight": "C:χ²-Test...",
          "narration": "Press [prgm] (the C key) to select χ²-Test..",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "DOWN",
          "screen": "chi2test-wizard",
          "highlight": "Expected: [B]",
          "narration": "Leave Observed at [A] and move to Expected.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "DOWN",
          "screen": "chi2test-wizard",
          "highlight": "Calculate",
          "narration": "Leave Expected at [B] and move to Calculate or Draw.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "chi2test-wizard",
          "highlight": "Calculate",
          "narration": "Move past Color: to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "ENTER",
          "screen": "chi2test-result",
          "highlight": "χ² line",
          "narration": "Choose Calculate to show χ², p, and df. The expected counts are stored in [B].",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "[A]": "matrix"
      }
    },
    {
      "id": "linreg-ttest",
      "name": "LinRegTTest",
      "unit": 9,
      "category": "regression-inference",
      "description": "Test whether the population slope is zero using paired data in L1 and L2.",
      "prerequisites": [
        "enter-data-l1-l2",
        "nav-stat-tests",
        "select-alternative"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "COS",
          "screen": "linreg-ttest-wizard",
          "highlight": "F:LinRegTTest...",
          "narration": "Press [cos] (the F key) to select LinRegTTest..",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "2ND",
          "screen": "linreg-ttest-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1 for Xlist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "linreg-ttest-wizard",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "linreg-ttest-wizard",
          "highlight": "Ylist",
          "narration": "Move to Ylist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "2ND",
          "screen": "linreg-ttest-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L2 for Ylist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "2",
          "screen": "linreg-ttest-wizard",
          "highlight": "Ylist: L2",
          "narration": "Set Ylist to L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "linreg-ttest-wizard",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "1",
          "screen": "linreg-ttest-wizard",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "linreg-ttest-wizard",
          "highlight": "β and ρ row",
          "narration": "Move to the alternative row.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Check the alternative: for Algebra 2 you almost always test β & ρ ≠ 0 (two-sided)."
            }
          ]
        },
        {
          "stepNumber": 14,
          "key": "RIGHT",
          "screen": "linreg-ttest-wizard",
          "highlight": "desired alternative",
          "narration": "Move across the β and ρ choices until the desired relation is highlighted (0-2 presses depending on the problem).",
          "skillType": "navigation",
          "repeatable": true
        },
        {
          "stepNumber": 15,
          "key": "ENTER",
          "screen": "linreg-ttest-wizard",
          "highlight": "desired alternative selected",
          "narration": "Press [enter] to select the highlighted option. Arrow keys only move the cursor inside the row; [enter] commits the choice.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 16,
          "key": "DOWN",
          "screen": "linreg-ttest-wizard",
          "highlight": "RegEQ",
          "narration": "Move to RegEQ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 17,
          "key": "VARS",
          "screen": "linreg-ttest-wizard",
          "highlight": "Y-VARS selector",
          "narration": "Open Y-VARS so the regression equation can be stored.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 18,
          "key": "RIGHT",
          "screen": "linreg-ttest-wizard",
          "highlight": "Function menu",
          "narration": "Move to the Y-VARS function list.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 19,
          "key": "ENTER",
          "screen": "linreg-ttest-wizard",
          "highlight": "Y1",
          "narration": "Select the Function submenu.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 20,
          "key": "ENTER",
          "screen": "linreg-ttest-wizard",
          "highlight": "RegEQ: Y1",
          "narration": "Paste Y1 next to RegEQ.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 21,
          "key": "DOWN",
          "screen": "linreg-ttest-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 22,
          "key": "ENTER",
          "screen": "linreg-ttest-result",
          "highlight": "t line",
          "narration": "Run LinRegTTest and display t, p, df, a, b, s, r², and r.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      }
    },
    {
      "id": "linreg-tint",
      "name": "LinRegTInt",
      "unit": 9,
      "category": "regression-inference",
      "description": "Compute a confidence interval for the population slope using paired data in L1 and L2.",
      "prerequisites": [
        "enter-data-l1-l2",
        "nav-stat-tests"
      ],
      "steps": [
        {
          "stepNumber": 1,
          "key": "STAT",
          "screen": "stat-menu",
          "highlight": "EDIT tab",
          "narration": "Press [STAT] to open the statistics menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "2ND",
              "feedback": "Use [STAT] directly. [2ND] only activates yellow secondary functions."
            },
            {
              "key": "Y=",
              "feedback": "[Y=] opens function entry, not the statistics menu."
            }
          ]
        },
        {
          "stepNumber": 2,
          "key": "RIGHT",
          "screen": "stat-calc-menu",
          "highlight": "CALC tab",
          "narration": "Move to CALC.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "That would choose the highlighted EDIT item. Move to CALC first."
            },
            {
              "key": "RIGHT",
              "feedback": "One more [RIGHT] would move to TESTS instead of staying on CALC."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "RIGHT",
          "screen": "stat-tests-menu",
          "highlight": "TESTS tab",
          "narration": "Move to TESTS.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 4,
          "key": "ALPHA",
          "screen": "stat-tests-menu",
          "highlight": "ALPHA key",
          "narration": "Press [alpha] to activate letter input.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "TAN",
          "screen": "linreg-tint-wizard",
          "highlight": "G:LinRegTInt...",
          "narration": "Press [tan] (the G key) to select LinRegTInt..",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 6,
          "key": "2ND",
          "screen": "linreg-tint-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L1 for Xlist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "linreg-tint-wizard",
          "highlight": "Xlist: L1",
          "narration": "Set Xlist to L1.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 8,
          "key": "DOWN",
          "screen": "linreg-tint-wizard",
          "highlight": "Ylist",
          "narration": "Move to Ylist.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 9,
          "key": "2ND",
          "screen": "linreg-tint-wizard",
          "highlight": "2ND indicator",
          "narration": "Prepare to paste L2 for Ylist.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 10,
          "key": "2",
          "screen": "linreg-tint-wizard",
          "highlight": "Ylist: L2",
          "narration": "Set Ylist to L2.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 11,
          "key": "DOWN",
          "screen": "linreg-tint-wizard",
          "highlight": "Freq",
          "narration": "Move to Freq.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "1",
          "screen": "linreg-tint-wizard",
          "highlight": "Freq: 1",
          "narration": "Use 1 as the frequency list.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 13,
          "key": "DOWN",
          "screen": "linreg-tint-wizard",
          "highlight": "C-Level",
          "narration": "Move to C-Level.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 14,
          "key": "{C-Level}",
          "screen": "linreg-tint-wizard",
          "highlight": "C-Level entered",
          "narration": "Enter the confidence level.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "linreg-tint-wizard",
          "highlight": "RegEQ",
          "narration": "Move to RegEQ.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "VARS",
          "screen": "linreg-tint-wizard",
          "highlight": "Y-VARS selector",
          "narration": "Open Y-VARS so the regression equation can be stored.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 17,
          "key": "RIGHT",
          "screen": "linreg-tint-wizard",
          "highlight": "Function menu",
          "narration": "Move to the Y-VARS function list.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 18,
          "key": "ENTER",
          "screen": "linreg-tint-wizard",
          "highlight": "Y1",
          "narration": "Select the Function submenu.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 19,
          "key": "ENTER",
          "screen": "linreg-tint-wizard",
          "highlight": "RegEQ: Y1",
          "narration": "Paste Y1 next to RegEQ.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 20,
          "key": "DOWN",
          "screen": "linreg-tint-wizard",
          "highlight": "Calculate",
          "narration": "Move to Calculate.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 21,
          "key": "ENTER",
          "screen": "linreg-tint-result",
          "highlight": "interval line",
          "narration": "Run LinRegTInt and display the slope interval and regression details.",
          "skillType": "confirmation"
        }
      ],
      "dataRequirements": {
        "L1": "numeric",
        "L2": "numeric"
      }
    },
    {
      "id": "randint-sampling",
      "name": "randIntNoRep (random sample)",
      "unit": 3,
      "category": "randomization",
      "description": "Seed the calculator, then use randIntNoRep(lo,hi,n) to select a simple random sample of n distinct labels.",
      "prerequisites": [],
      "steps": [
        {
          "stepNumber": 1,
          "key": "{seed}",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Type the seed value from the problem.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 2,
          "key": "STO",
          "screen": "home",
          "highlight": "→",
          "narration": "Press [STO→] to store the seed.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "ENTER",
              "feedback": "Don't evaluate yet — store the value into rand first with [STO→]."
            }
          ]
        },
        {
          "stepNumber": 3,
          "key": "MATH",
          "screen": "math-menu",
          "highlight": "MATH tab",
          "narration": "Open the MATH menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[STAT] is for data lists. Random-number commands live under [MATH]."
            }
          ]
        },
        {
          "stepNumber": 4,
          "key": "RIGHT",
          "screen": "math-num-menu",
          "highlight": "NUM tab",
          "narration": "Arrow right — this is NUM, not PRB yet. Keep going.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "RIGHT",
          "screen": "math-cmplx-menu",
          "highlight": "CMPLX tab",
          "narration": "Arrow right again — CMPLX. One more.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "RIGHT",
          "screen": "math-prb-menu",
          "highlight": "PRB tab",
          "narration": "Third right arrow lands on PRB — the random-number commands.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "home",
          "highlight": "1:rand",
          "narration": "Paste rand — the seed target.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "ENTER",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Store the seed. Now every random draw is reproducible.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 9,
          "key": "MATH",
          "screen": "math-menu",
          "highlight": "MATH tab",
          "narration": "Back to the MATH menu for the sampling command.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "RIGHT",
          "screen": "math-num-menu",
          "highlight": "NUM tab",
          "narration": "Arrow right toward PRB.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "RIGHT",
          "screen": "math-cmplx-menu",
          "highlight": "CMPLX tab",
          "narration": "Keep going.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "RIGHT",
          "screen": "math-prb-menu",
          "highlight": "PRB tab",
          "narration": "PRB again.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "8",
          "screen": "randintnorep-wizard",
          "highlight": "8:randIntNoRep(",
          "narration": "Open randIntNoRep — no repeats, because a label can only be selected once in a simple random sample. The calculator prompts for each value.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "5",
              "feedback": "randInt( can repeat labels — a repeated label is not a valid simple random sample. Use 8:randIntNoRep(."
            }
          ]
        },
        {
          "stepNumber": 14,
          "key": "{lo}",
          "screen": "randintnorep-wizard",
          "highlight": "lower",
          "narration": "Type the smallest label.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "upper",
          "narration": "Down to the upper bound.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "{hi}",
          "screen": "randintnorep-wizard",
          "highlight": "upper",
          "narration": "Type the largest label.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 17,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "n",
          "narration": "Down to n, the sample size.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 18,
          "key": "{n}",
          "screen": "randintnorep-wizard",
          "highlight": "n",
          "narration": "Type how many labels to select.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 19,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "Paste",
          "narration": "Down to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 20,
          "key": "ENTER",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Paste the completed command onto the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 21,
          "key": "ENTER",
          "screen": "home",
          "highlight": "result line",
          "narration": "Your sample: the distinct labels shown. The people or items with these labels are selected.",
          "skillType": "confirmation"
        }
      ]
    },
    {
      "id": "randint-assignment",
      "name": "randIntNoRep (random assignment)",
      "unit": 3,
      "category": "randomization",
      "description": "Seed the calculator, generate a random ordering of all subjects with randIntNoRep(lo,hi), and assign the first groupSize labels to Treatment A.",
      "prerequisites": [],
      "steps": [
        {
          "stepNumber": 1,
          "key": "{seed}",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Type the seed value from the problem.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 2,
          "key": "STO",
          "screen": "home",
          "highlight": "→",
          "narration": "Press [STO→] to store the seed.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 3,
          "key": "MATH",
          "screen": "math-menu",
          "highlight": "MATH tab",
          "narration": "Open the MATH menu.",
          "skillType": "navigation",
          "commonErrors": [
            {
              "key": "STAT",
              "feedback": "[STAT] is for data lists. Random-number commands live under [MATH]."
            }
          ]
        },
        {
          "stepNumber": 4,
          "key": "RIGHT",
          "screen": "math-num-menu",
          "highlight": "NUM tab",
          "narration": "Arrow right — this is NUM, not PRB yet. Keep going.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 5,
          "key": "RIGHT",
          "screen": "math-cmplx-menu",
          "highlight": "CMPLX tab",
          "narration": "Arrow right again — CMPLX. One more.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 6,
          "key": "RIGHT",
          "screen": "math-prb-menu",
          "highlight": "PRB tab",
          "narration": "Third right arrow lands on PRB — the random-number commands.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 7,
          "key": "1",
          "screen": "home",
          "highlight": "1:rand",
          "narration": "Paste rand — the seed target.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 8,
          "key": "ENTER",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Store the seed so the assignment is reproducible.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 9,
          "key": "MATH",
          "screen": "math-menu",
          "highlight": "MATH tab",
          "narration": "Back to the MATH menu.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 10,
          "key": "RIGHT",
          "screen": "math-num-menu",
          "highlight": "NUM tab",
          "narration": "Arrow right toward PRB.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 11,
          "key": "RIGHT",
          "screen": "math-cmplx-menu",
          "highlight": "CMPLX tab",
          "narration": "Keep going.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 12,
          "key": "RIGHT",
          "screen": "math-prb-menu",
          "highlight": "PRB tab",
          "narration": "PRB again.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 13,
          "key": "8",
          "screen": "randintnorep-wizard",
          "highlight": "8:randIntNoRep(",
          "narration": "Open randIntNoRep — every subject must appear exactly once in the ordering. The calculator prompts for each value.",
          "skillType": "confirmation",
          "commonErrors": [
            {
              "key": "5",
              "feedback": "randInt( can repeat a subject — then your groups overlap. Use 8:randIntNoRep(."
            }
          ]
        },
        {
          "stepNumber": 14,
          "key": "{lo}",
          "screen": "randintnorep-wizard",
          "highlight": "lower",
          "narration": "Type the smallest subject label.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 15,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "upper",
          "narration": "Down to the upper bound.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 16,
          "key": "{hi}",
          "screen": "randintnorep-wizard",
          "highlight": "upper",
          "narration": "Type the largest subject label.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 17,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "n",
          "narration": "Down to n.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 18,
          "key": "{n}",
          "screen": "randintnorep-wizard",
          "highlight": "n",
          "narration": "Type the total number of subjects — the full ordering places everyone.",
          "skillType": "parameter"
        },
        {
          "stepNumber": 19,
          "key": "DOWN",
          "screen": "randintnorep-wizard",
          "highlight": "Paste",
          "narration": "Down to Paste.",
          "skillType": "navigation"
        },
        {
          "stepNumber": 20,
          "key": "ENTER",
          "screen": "home",
          "highlight": "entry line",
          "narration": "Paste the completed command onto the home screen.",
          "skillType": "confirmation"
        },
        {
          "stepNumber": 21,
          "key": "ENTER",
          "screen": "home",
          "highlight": "result line",
          "narration": "Apply the rule: the FIRST groupSize labels shown go to Treatment A; the rest go to Treatment B.",
          "skillType": "confirmation"
        }
      ]
    }
  ],
  "dag": {
    "nodes": [
      {
        "id": "enter-data-l1",
        "type": "microSkill",
        "name": "Enter data into L1"
      },
      {
        "id": "enter-data-l1-l2",
        "type": "microSkill",
        "name": "Enter paired data into L1 and L2"
      },
      {
        "id": "clear-lists",
        "type": "microSkill",
        "name": "Clear data from lists"
      },
      {
        "id": "nav-stat-edit",
        "type": "microSkill",
        "name": "Open STAT > EDIT"
      },
      {
        "id": "nav-stat-calc",
        "type": "microSkill",
        "name": "Open STAT > CALC"
      },
      {
        "id": "nav-stat-tests",
        "type": "microSkill",
        "name": "Open STAT > TESTS"
      },
      {
        "id": "nav-2nd-distr",
        "type": "microSkill",
        "name": "Open 2ND > DISTR"
      },
      {
        "id": "nav-2nd-statplot",
        "type": "microSkill",
        "name": "Open 2ND > STAT PLOT"
      },
      {
        "id": "select-data-vs-stats",
        "type": "microSkill",
        "name": "Toggle Data vs Stats input"
      },
      {
        "id": "enter-matrix",
        "type": "microSkill",
        "name": "Enter values into a matrix"
      },
      {
        "id": "set-plot-type",
        "type": "microSkill",
        "name": "Choose a STAT PLOT type"
      },
      {
        "id": "zoom-stat",
        "type": "microSkill",
        "name": "Use ZoomStat"
      },
      {
        "id": "diagnostic-on",
        "type": "microSkill",
        "name": "Turn on regression diagnostics"
      },
      {
        "id": "access-resid-list",
        "type": "microSkill",
        "name": "Paste the RESID list"
      },
      {
        "id": "select-alternative",
        "type": "microSkill",
        "name": "Choose an alternative hypothesis"
      },
      {
        "id": "calculate-vs-draw",
        "type": "microSkill",
        "name": "Choose Calculate vs Draw"
      },
      {
        "id": "one-var-stats",
        "type": "procedure",
        "name": "1-Var Stats",
        "unit": 1
      },
      {
        "id": "histogram",
        "type": "procedure",
        "name": "Histogram",
        "unit": 1
      },
      {
        "id": "modified-boxplot",
        "type": "procedure",
        "name": "Modified Boxplot",
        "unit": 1
      },
      {
        "id": "normalcdf",
        "type": "procedure",
        "name": "normalcdf",
        "unit": 1
      },
      {
        "id": "invnorm",
        "type": "procedure",
        "name": "invNorm",
        "unit": 1
      },
      {
        "id": "linreg-a-plus-bx",
        "type": "procedure",
        "name": "LinReg(a+bx)",
        "unit": 2
      },
      {
        "id": "scatterplot",
        "type": "procedure",
        "name": "Scatterplot",
        "unit": 2
      },
      {
        "id": "residual-plot",
        "type": "procedure",
        "name": "Residual plot",
        "unit": 2
      },
      {
        "id": "binompdf",
        "type": "procedure",
        "name": "binompdf",
        "unit": 4
      },
      {
        "id": "binomcdf",
        "type": "procedure",
        "name": "binomcdf",
        "unit": 4
      },
      {
        "id": "geometpdf",
        "type": "procedure",
        "name": "geometpdf",
        "unit": 4
      },
      {
        "id": "geometcdf",
        "type": "procedure",
        "name": "geometcdf",
        "unit": 4
      },
      {
        "id": "normalcdf-sampling",
        "type": "procedure",
        "name": "normalcdf for sampling distribution",
        "unit": 5
      },
      {
        "id": "invnorm-sampling",
        "type": "procedure",
        "name": "invNorm for sampling distribution",
        "unit": 5
      },
      {
        "id": "one-propztest",
        "type": "procedure",
        "name": "1-PropZTest",
        "unit": 6
      },
      {
        "id": "one-propzint",
        "type": "procedure",
        "name": "1-PropZInt",
        "unit": 6
      },
      {
        "id": "two-propztest",
        "type": "procedure",
        "name": "2-PropZTest",
        "unit": 6
      },
      {
        "id": "two-propzint",
        "type": "procedure",
        "name": "2-PropZInt",
        "unit": 6
      },
      {
        "id": "t-test-stats",
        "type": "procedure",
        "name": "T-Test (Stats input)",
        "unit": 7
      },
      {
        "id": "t-test-data",
        "type": "procedure",
        "name": "T-Test (Data input)",
        "unit": 7
      },
      {
        "id": "t-interval-stats",
        "type": "procedure",
        "name": "TInterval (Stats input)",
        "unit": 7
      },
      {
        "id": "t-interval-data",
        "type": "procedure",
        "name": "TInterval (Data input)",
        "unit": 7
      },
      {
        "id": "two-samp-ttest",
        "type": "procedure",
        "name": "2-SampTTest",
        "unit": 7
      },
      {
        "id": "two-samp-tint",
        "type": "procedure",
        "name": "2-SampTInt",
        "unit": 7
      },
      {
        "id": "matrix-entry",
        "type": "procedure",
        "name": "Enter matrix",
        "unit": 8
      },
      {
        "id": "chi-square-gof-test",
        "type": "procedure",
        "name": "χ²GOF-Test",
        "unit": 8
      },
      {
        "id": "chi-square-test",
        "type": "procedure",
        "name": "χ²-Test",
        "unit": 8
      },
      {
        "id": "linreg-ttest",
        "type": "procedure",
        "name": "LinRegTTest",
        "unit": 9
      },
      {
        "id": "linreg-tint",
        "type": "procedure",
        "name": "LinRegTInt",
        "unit": 9
      }
    ],
    "edges": [
      {
        "from": "nav-stat-edit",
        "to": "enter-data-l1",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-edit",
        "to": "enter-data-l1-l2",
        "type": "prerequisite"
      },
      {
        "from": "clear-lists",
        "to": "enter-data-l1",
        "type": "prerequisite"
      },
      {
        "from": "clear-lists",
        "to": "enter-data-l1-l2",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-calc",
        "to": "one-var-stats",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-calc",
        "to": "linreg-a-plus-bx",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "one-propztest",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "one-propzint",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "two-propztest",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "two-propzint",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "t-test-stats",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "t-test-data",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "t-interval-stats",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "t-interval-data",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "two-samp-ttest",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "two-samp-tint",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "chi-square-gof-test",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "chi-square-test",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "linreg-ttest",
        "type": "prerequisite"
      },
      {
        "from": "nav-stat-tests",
        "to": "linreg-tint",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "normalcdf",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "invnorm",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "binompdf",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "binomcdf",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "geometpdf",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "geometcdf",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "normalcdf-sampling",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-distr",
        "to": "invnorm-sampling",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-statplot",
        "to": "histogram",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-statplot",
        "to": "modified-boxplot",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-statplot",
        "to": "scatterplot",
        "type": "prerequisite"
      },
      {
        "from": "nav-2nd-statplot",
        "to": "residual-plot",
        "type": "prerequisite"
      },
      {
        "from": "set-plot-type",
        "to": "histogram",
        "type": "prerequisite"
      },
      {
        "from": "set-plot-type",
        "to": "modified-boxplot",
        "type": "prerequisite"
      },
      {
        "from": "set-plot-type",
        "to": "scatterplot",
        "type": "prerequisite"
      },
      {
        "from": "set-plot-type",
        "to": "residual-plot",
        "type": "prerequisite"
      },
      {
        "from": "zoom-stat",
        "to": "histogram",
        "type": "prerequisite"
      },
      {
        "from": "zoom-stat",
        "to": "modified-boxplot",
        "type": "prerequisite"
      },
      {
        "from": "zoom-stat",
        "to": "scatterplot",
        "type": "prerequisite"
      },
      {
        "from": "zoom-stat",
        "to": "residual-plot",
        "type": "prerequisite"
      },
      {
        "from": "diagnostic-on",
        "to": "linreg-a-plus-bx",
        "type": "prerequisite"
      },
      {
        "from": "access-resid-list",
        "to": "residual-plot",
        "type": "prerequisite"
      },
      {
        "from": "select-data-vs-stats",
        "to": "t-test-stats",
        "type": "prerequisite"
      },
      {
        "from": "select-data-vs-stats",
        "to": "t-interval-stats",
        "type": "prerequisite"
      },
      {
        "from": "select-data-vs-stats",
        "to": "two-samp-ttest",
        "type": "prerequisite"
      },
      {
        "from": "select-data-vs-stats",
        "to": "two-samp-tint",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "one-propztest",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "two-propztest",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "t-test-stats",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "t-test-data",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "two-samp-ttest",
        "type": "prerequisite"
      },
      {
        "from": "select-alternative",
        "to": "linreg-ttest",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "one-propztest",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "two-propztest",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "t-test-stats",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "t-test-data",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "two-samp-ttest",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "chi-square-gof-test",
        "type": "prerequisite"
      },
      {
        "from": "calculate-vs-draw",
        "to": "chi-square-test",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1",
        "to": "one-var-stats",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1",
        "to": "histogram",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1",
        "to": "modified-boxplot",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1",
        "to": "t-test-data",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1",
        "to": "t-interval-data",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1-l2",
        "to": "linreg-a-plus-bx",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1-l2",
        "to": "scatterplot",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1-l2",
        "to": "residual-plot",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1-l2",
        "to": "linreg-ttest",
        "type": "prerequisite"
      },
      {
        "from": "enter-data-l1-l2",
        "to": "linreg-tint",
        "type": "prerequisite"
      },
      {
        "from": "enter-matrix",
        "to": "matrix-entry",
        "type": "prerequisite"
      },
      {
        "from": "enter-matrix",
        "to": "chi-square-test",
        "type": "prerequisite"
      }
    ]
  }
}
;
