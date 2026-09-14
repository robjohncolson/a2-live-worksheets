# TI-84 Plus CE Procedural Trainer — Spec

## 1. Product Vision

A standalone, single-file HTML webapp that trains AP Statistics students on the **mechanical key-press sequences and expected screen states** for every TI-84 Plus CE procedure used across Units 1–9. Students learn by guided walkthrough, then prove retention via recall drills. An SRS scheduler ensures durable memory of procedures through spaced repetition.

**What this is NOT**: an emulator. This is a scripted procedural trainer with mid-fidelity screen rendering and state-accurate navigation paths.

---

## 2. Packaging & Distribution

- **Single HTML file** — embedded JS/CSS, zero dependencies, opens in any browser
- **No build step** — students receive one file, double-click, done
- **Internally modular** — procedures, screen definitions, DAG, and UI are cleanly separated within the file so extending content doesn't require rewriting engine code

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   ti84_trainer.html                  │
├─────────────────────────────────────────────────────┤
│  CONTENT LAYER (data, no logic)                     │
│  ├─ PROCEDURES[]        procedure step sequences    │
│  ├─ MICRO_SKILLS[]      shared prerequisite nodes   │
│  ├─ SCREENS{}           screen state definitions    │
│  ├─ KEYPAD_LAYOUT       TI-84 CE key positions      │
│  └─ DAG                 prerequisite graph           │
├─────────────────────────────────────────────────────┤
│  ENGINE LAYER (logic)                               │
│  ├─ ProcedureRunner     steps through a procedure   │
│  ├─ ScreenRenderer      draws TI-84 screen states   │
│  ├─ KeypadController    handles virtual key input    │
│  ├─ SessionQueue        SRS scheduling + selection   │
│  ├─ KnowledgeTracer     mastery tracking per node    │
│  └─ StateManager        localStorage persistence    │
├─────────────────────────────────────────────────────┤
│  UI LAYER (rendering)                               │
│  ├─ Calculator display  (mid-fidelity TI-84 screen) │
│  ├─ Virtual keypad      (clickable button grid)     │
│  ├─ Compact key palette (physical-first mode)       │
│  ├─ Session dashboard   (progress, queue, mastery)  │
│  └─ Mode selector       (guided / recall / review)  │
└─────────────────────────────────────────────────────┘
```

---

## 4. Content Model

### 4.1 Procedures

A procedure is a complete TI-84 operation (e.g., "Run 1-Var Stats on L1"). Each procedure is a sequence of **steps**.

```javascript
{
  id: "one-var-stats",
  name: "1-Var Stats",
  unit: 1,
  category: "descriptive",       // for filtering/grouping
  description: "Calculate summary statistics for a single list",
  prerequisites: ["enter-data-l1", "nav-stat-calc"],  // micro-skill IDs
  steps: [
    {
      key: "STAT",                // the key to press
      screen: "stat-menu",       // screen state ID after this key
      highlight: "CALC",         // what's highlighted/selected on screen
      narration: "Press [STAT] to open the Statistics menu.",
      skillType: "navigation",   // "navigation" | "parameter" | "confirmation"
      commonErrors: [
        { key: "2ND", feedback: "That opens secondary functions — you want the STAT key directly." }
      ]
    },
    {
      key: "RIGHT",              // arrow to CALC tab
      screen: "stat-calc-menu",
      highlight: "1:1-Var Stats",
      narration: "Arrow right to the CALC tab.",
      skillType: "navigation"
    },
    {
      key: "ENTER",
      screen: "one-var-stats-wizard",
      highlight: "List: L1",
      narration: "Press [ENTER] to select 1-Var Stats. The wizard shows List and FreqList fields.",
      skillType: "confirmation"
    },
    {
      key: "ENTER",              // accept defaults (L1, FreqList=1)
      screen: "one-var-stats-result",
      highlight: null,
      narration: "Press [ENTER] to Calculate. The result screen shows x̄, Σx, Σx², Sx, σx, n.",
      skillType: "confirmation"
    }
  ]
}
```

**Skill type taxonomy:**
- `navigation` — choosing menus, tabs, submenus (wrong submenu, wrong tab)
- `parameter` — entering values, selecting lists, choosing Data vs Stats (wrong list, wrong input mode)
- `confirmation` — pressing ENTER to execute, accepting defaults

### 4.2 Micro-Skills (Shared Prerequisite Nodes)

Reusable sub-procedures that feed into multiple procedures via the DAG.

```javascript
{
  id: "enter-data-l1",
  name: "Enter data into L1",
  type: "micro-skill",
  skillType: "parameter",
  description: "Navigate to STAT > EDIT and enter values into list L1",
  steps: [
    { key: "STAT", screen: "stat-menu", highlight: "EDIT", narration: "Press [STAT]." },
    { key: "ENTER", screen: "stat-edit-lists", highlight: "L1 column", narration: "EDIT is already highlighted. Press [ENTER] to open the list editor." },
    // ... data entry steps
  ]
}
```

**Candidate micro-skills** (to be confirmed by research):

| ID | Name | Used by |
|----|------|---------|
| `enter-data-l1` | Enter data into L1 | 1-Var Stats, LinReg, histograms, boxplots |
| `enter-data-l1-l2` | Enter paired data into L1/L2 | LinReg, scatterplot, residual plot |
| `nav-stat-edit` | Navigate STAT > EDIT | All list-based procedures |
| `nav-stat-calc` | Navigate STAT > CALC | 1-Var Stats, LinReg |
| `nav-stat-tests` | Navigate STAT > TESTS | All hypothesis tests, all CIs |
| `nav-2nd-distr` | Navigate 2ND > DISTR | normalcdf, invNorm, binompdf, etc. |
| `nav-2nd-statplot` | Navigate 2ND > STAT PLOT | histogram, boxplot, scatterplot |
| `select-data-vs-stats` | Choose Data/Stats input mode | Tests and CIs with wizard |
| `enter-matrix` | Enter data into a matrix | Chi-square tests |
| `nav-matrix-edit` | Navigate to matrix editor | Chi-square tests |
| `set-plot-type` | Set plot type in STAT PLOT | histogram, boxplot, scatterplot |
| `set-window` | Adjust WINDOW settings | Any graphing procedure |
| `zoom-stat` | Use ZoomStat (Zoom > 9) | Scatterplot, histogram, boxplot |

### 4.3 Prerequisite DAG

```
                    ┌─────────────────┐
                    │  1-PropZTest     │ (procedure)
                    └────────┬────────┘
                             │ requires
                ┌────────────┼────────────┐
                │            │            │
        ┌───────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
        │nav-stat  │  │select-data│  │enter-params  │
        │-tests    │  │-vs-stats  │  │-proportions  │
        └──────────┘  └───────────┘  └──────────────┘
         (micro)        (micro)        (micro)
```

Rules:
- A procedure's micro-skill prerequisites must reach mastery before the procedure is queued in recall mode
- In guided mode, prerequisites are taught inline (the walkthrough includes the micro-skill steps)
- The DAG is a directed acyclic graph — cycles are invalid

### 4.4 Screen States

Each screen state defines what the TI-84 display shows at a given point.

```javascript
{
  id: "stat-menu",
  type: "menu",              // "menu" | "wizard" | "result" | "editor" | "graph"
  title: "STAT",
  tabs: ["EDIT", "CALC", "TESTS"],
  activeTab: "EDIT",
  items: ["1:Edit...", "2:SortA(", "3:SortD(", "4:ClrList", "5:SetUpEditor"],
  cursor: 0,                // which item is highlighted
  description: "The STAT menu with three tabs. EDIT tab is active."
}
```

Screen types:
- **menu** — tabbed or flat menu with selectable items
- **wizard** — parameter entry form (e.g., 1-PropZTest wizard with p₀, x, n, prop fields)
- **result** — output display (statistics, test results, CI bounds)
- **editor** — list editor (L1, L2, ...) or matrix editor
- **graph** — plot display (histogram, scatterplot, normal curve with shading)

---

## 5. Interaction Design

### 5.1 Guided Mode

**Purpose**: Teach the navigation path step by step.

Flow:
1. App shows the current screen state on the simulated TI-84 display
2. Narration text explains what to do next and why
3. The correct key is highlighted/pulsing on the virtual keypad (or named in physical-first mode)
4. Student presses the key → screen transitions to next state
5. Wrong key → immediate "off-path" feedback, key flashes red, retry
6. After completing all steps → brief summary of what was accomplished
7. Procedure marked as "seen" in SRS (short initial interval)

**Scaffolding removal**: After the student completes a guided walkthrough, subsequent guided reviews progressively hide narration text (show on hover/tap only) and stop highlighting the correct key.

### 5.2 Recall Mode

**Purpose**: Test retention of the procedure from memory.

Flow:
1. App shows a prompt: "Run a 1-PropZTest with p₀=0.5, x=64, n=100, prop > p₀"
2. Screen starts at the TI-84 home screen
3. Student must press the correct keys in sequence — no hints, no highlights
4. Correct key → screen advances, subtle green flash
5. Wrong key → screen does NOT advance; key flashes red; option to:
   - **Retry step** (try another key)
   - **Show hint** (reveals the correct key — counts as an error for SRS)
   - **Restart procedure** (back to home screen)
6. Completion → score based on errors (0 errors = perfect, 1-2 = partial, 3+ = needs review)
7. SRS interval updated based on performance

### 5.3 Virtual Keypad Mode (Primary)

A clickable representation of the TI-84 Plus CE keypad:

```
┌──────────────────────────────────┐
│  [Y=] [WINDOW] [ZOOM] [TRACE] [GRAPH] │
│                                  │
│  [2ND]  [MODE]  [DEL]           │
│  [ALPHA] [X,T,θ,n] [STAT]      │
│                                  │
│  [MATH] [APPS] [PRGM] [VARS]   │
│                                  │
│         [ ▲ ]                    │
│  [ ◄ ] [ENTER] [ ► ]           │
│         [ ▼ ]                    │
│                                  │
│  [─] [SIN] [COS] [TAN] [^]     │
│  [x²] [,] [(] [)] [÷]         │
│  [LOG] [7] [8] [9] [×]         │
│  [LN]  [4] [5] [6] [−]        │
│  [STO→] [1] [2] [3] [+]       │
│  [ON]  [0] [.] [(−)] [ENTER]   │
└──────────────────────────────────┘
```

- Keys are styled to approximate TI-84 CE color scheme (blue function keys, gray number pad, green ALPHA)
- 2ND key toggles secondary labels (shown in yellow above each key)
- ALPHA key toggles alpha labels (shown in green)
- Keys not relevant to the current step are dimmed in guided mode
- Touch-friendly sizing for phone/tablet use

### 5.4 Physical-First Mode

For students with a real TI-84 in hand:

- The simulated screen shows the **expected** state after each correct key press
- Below the screen: "Press [STAT] on your calculator" prompt
- Student confirms via:
  - **Compact key palette**: Smaller grid of ~20 contextually relevant keys (only keys that could plausibly be pressed at this step)
  - **"I pressed it" button**: Trust-based confirmation for parameter entry steps where the screen would show typed values
- After confirmation, app advances to next expected screen state
- If student's real calculator shows something different → "My screen doesn't match" button opens troubleshooting guidance

---

## 6. Scheduling & Mastery (V1)

### 6.1 SRS — SM-2 Baseline

Each procedure and micro-skill node has SRS state:

```javascript
{
  nodeId: "one-var-stats",
  interval: 1,           // days until next review
  easeFactor: 2.5,       // SM-2 ease factor
  repetitions: 0,        // consecutive correct recalls
  lastReview: null,       // ISO date
  nextReview: null,       // ISO date
  mode: "guided",        // "guided" | "recall" — current drill mode for this node
  history: []            // array of { date, mode, errors, time }
}
```

**Mode progression:**
- New node → starts in `guided` mode
- After 1 successful guided completion → promoted to `recall` mode
- If recall attempt has 3+ errors → demoted back to `guided` for one session
- Re-promoted to `recall` after successful guided pass

**Session queue algorithm:**
1. Collect all nodes with `nextReview <= now`
2. Sort by: overdue amount (most overdue first), then priority (procedures > micro-skills)
3. Interleave across units (never 3+ consecutive items from same unit)
4. Mix in 1-2 new items per session (unseen nodes whose prerequisites are met)
5. Session ends when queue is empty or student exits

### 6.2 Scoring

| Recall result | SM-2 quality | Effect |
|--------------|-------------|--------|
| 0 errors, no hints | 5 | Interval grows, ease stays/increases |
| 1 error, no hints | 4 | Interval grows (slower) |
| 2 errors OR 1 hint | 3 | Interval stays |
| 3+ errors | 1 | Interval resets to 1 day, ease decreases |
| Hint used 2+ times | 0 | Demote to guided mode |

---

## 7. Mastery & Knowledge Tracing (V2)

### 7.1 Bayesian Knowledge Tracing

Per-node mastery probability `P(L)` updated on each drill:

```
P(L|correct) = P(L) * (1 - P(S)) / P(correct)
P(L|wrong)   = P(L) * P(S) / P(wrong)
```

Where:
- `P(L)` = probability student has learned the skill
- `P(S)` = slip probability (knows it but makes error) — default 0.1
- `P(G)` = guess probability (doesn't know but gets right) — default 0.2
- `P(T)` = transition probability (learns per opportunity) — default 0.3

### 7.2 DAG Prerequisite Enforcement

- A procedure node is only queued when all prerequisite micro-skills have `P(L) >= 0.8`
- If a procedure is failed and the failure is on a navigation step → the corresponding micro-skill's `P(L)` is decreased
- Session queue weighted by: `(1 - P(L)) * priority * overdue_factor`

---

## 8. Procedure Inventory

### Unit 1: Exploring One-Variable Data

| Procedure | Key path | Category |
|-----------|----------|----------|
| 1-Var Stats | STAT > CALC > 1 | descriptive |
| Histogram | STAT PLOT > Type: Histogram > GRAPH | graphing |
| Boxplot | STAT PLOT > Type: Boxplot > GRAPH | graphing |
| normalcdf | 2ND > DISTR > 2:normalcdf | probability |
| invNorm | 2ND > DISTR > 3:invNorm | probability |

### Unit 2: Exploring Two-Variable Data

| Procedure | Key path | Category |
|-----------|----------|----------|
| LinReg(ax+b) | STAT > CALC > 8:LinReg(a+bx) | regression |
| Scatterplot | STAT PLOT > Type: Scatter > GRAPH | graphing |
| Store residuals (RESID) | After LinReg, RESID in L3 | regression |
| Residual plot | STAT PLOT > Scatter with L1 vs RESID | graphing |

### Unit 4: Probability & Distributions

| Procedure | Key path | Category |
|-----------|----------|----------|
| binompdf | 2ND > DISTR > B:binompdf | probability |
| binomcdf | 2ND > DISTR > C:binomcdf | probability |
| geometpdf | 2ND > DISTR > E:geometpdf | probability |
| geometcdf | 2ND > DISTR > F:geometcdf | probability |

### Unit 5: Sampling Distributions

| Procedure | Key path | Category |
|-----------|----------|----------|
| normalcdf (sampling dist) | 2ND > DISTR > normalcdf (with SE params) | probability |
| invNorm (sampling dist) | 2ND > DISTR > invNorm (with SE params) | probability |

### Unit 6: Inference for Proportions

| Procedure | Key path | Category |
|-----------|----------|----------|
| 1-PropZInt | STAT > TESTS > A:1-PropZInt | inference |
| 1-PropZTest | STAT > TESTS > 5:1-PropZTest | inference |

### Unit 7: Inference for Means

| Procedure | Key path | Category |
|-----------|----------|----------|
| TInterval | STAT > TESTS > 8:TInterval | inference |
| T-Test | STAT > TESTS > 2:T-Test | inference |
| 2-SampTInt | STAT > TESTS > 0:2-SampTInt | inference |
| 2-SampTTest | STAT > TESTS > 4:2-SampTTest | inference |

### Unit 8: Chi-Square

| Procedure | Key path | Category |
|-----------|----------|----------|
| Enter matrix | 2ND > MATRIX > EDIT | data-entry |
| Chi-square GOF Test | STAT > TESTS > D:χ²GOF-Test | inference |
| Chi-square Test | STAT > TESTS > C:χ²-Test | inference |

### Unit 9: Regression Inference

| Procedure | Key path | Category |
|-----------|----------|----------|
| LinRegTTest | STAT > TESTS > F:LinRegTTest | inference |
| LinRegTInt | STAT > TESTS > G:LinRegTInt | inference |

**Total: ~25 procedures + ~13 micro-skills = ~38 DAG nodes**

---

## 9. Visual Design

### Calculator Screen (Mid-Fidelity)

- Monospace font, dark background (#1a1a2e or similar), light text
- Fixed character grid (~26 cols x 10 rows for text screens, similar to TI-84 CE)
- Color screen: white text on dark blue/black, with highlighted items in inverse video
- Menu tabs rendered as underlined headers
- Cursor/highlight position shown with inverse background or bracket indicator
- Wizard fields rendered as labeled rows with editable values
- Result screens show statistics in the same layout order as the real calculator
- Graph screens show simplified SVG representations (histogram bars, scatter dots, normal curve shading)

### Overall App Layout

```
┌─────────────────────────────────────────────┐
│  Header: TI-84 Procedural Trainer           │
│  [Unit filter] [Mode: Guided/Recall] [Stats]│
├──────────────────────┬──────────────────────┤
│                      │                      │
│   TI-84 Screen       │   Virtual Keypad     │
│   (mid-fidelity)     │   (clickable)        │
│                      │   OR                 │
│                      │   Compact palette    │
│                      │   (physical-first)   │
│                      │                      │
├──────────────────────┴──────────────────────┤
│  Narration / Prompt bar                     │
│  [Progress: step 3/7]  [Hint] [Restart]     │
├─────────────────────────────────────────────┤
│  Session dashboard (collapsible)            │
│  Due: 5 reviews | New: 2 | Mastery: 72%    │
└─────────────────────────────────────────────┘
```

Mobile: stack screen above keypad vertically.

---

## 10. Persistence

All state in `localStorage` under key prefix `ti84trainer_`:

```javascript
{
  ti84trainer_srs: { /* per-node SRS state */ },
  ti84trainer_history: [ /* session logs */ ],
  ti84trainer_settings: { mode: "virtual", theme: "dark" },
  ti84trainer_version: "1.0"
}
```

No server required. Export/import as JSON for backup.

---

## 11. Implementation Phases

### V1 — Core Trainer (ship first)

- [ ] Content: All ~25 procedures + ~13 micro-skills with step sequences and screen states
- [ ] Engine: ProcedureRunner, ScreenRenderer, KeypadController
- [ ] Modes: Guided walkthrough + Recall drill
- [ ] Input: Virtual keypad mode (primary) + Physical-first mode
- [ ] Scheduling: SM-2 SRS with session queue and unit interleaving
- [ ] Persistence: localStorage SRS state
- [ ] UI: Mid-fidelity calculator screen, responsive layout

### V2 — Adaptive Mastery

- [ ] Bayesian knowledge tracing per node
- [ ] DAG prerequisite enforcement (mastery gates)
- [ ] Weighted session queue based on `P(L)`
- [ ] Analytics dashboard (mastery heatmap by unit, weak spots)
- [ ] Scaffolding removal in guided mode (progressive hint hiding)

### V3 — Polish & Integration (stretch)

- [ ] Parameterized procedures (same procedure, different input values)
- [ ] Railway sync for teacher visibility
- [ ] Integration with lrsl-driller progress (shared mastery state)
- [ ] Print-friendly cheat sheet generator (procedure quick-reference cards)

---

## 12. Open Questions for Research Phase

These must be resolved before implementation. The research prompt (separate file) tasks Codex with answering all of them.

1. **Exact keystroke sequences** for every procedure on the TI-84 Plus CE (OS 5.x+). The CE wizard-based UI differs from classic TI-84 in several procedures.
2. **Screen state catalog**: What exactly appears on screen at each step? Menu items, wizard field names, result labels, cursor positions.
3. **Key path variations**: Which procedures have multiple valid paths? (e.g., scrolling down vs typing a number to select a menu item)
4. **2ND key mappings**: Complete map of 2ND-key combinations relevant to AP Stats (DISTR, LIST, MATRIX, STAT PLOT, etc.)
5. **Common student errors**: Per procedure, what are the most frequent wrong turns? (e.g., CALC instead of TESTS, forgetting to set plot type, Data vs Stats confusion)
6. **Calculator-specific gotchas**: Procedures where TI-84 CE differs from TI-84 Plus (non-CE). Our students have CEs.
7. **Screen layout specifics**: Character positions for result screens (where does x̄ appear vs Sx vs n on the 1-Var Stats output?).
