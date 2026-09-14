# TI-84 CE Native Stat Module — Port Spec

**Goal**: Replace CEmu WASM dependency with a native JavaScript reimplementation of the TI-84 Plus CE's statistical functionality. All menu navigation, wizard forms, computations, and result screens reproduced in JS with full programmatic hooks.

**Not in scope**: Graphing engine (histogram/boxplot/scatterplot rendering), Y= editor, table features, programming, finance. These stay as CEmu fallback or are mocked.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Trainer App (app.js)                           │
│  - Subscribes to events                         │
│  - Controls walkthrough flow                    │
│  - Highlights keys, validates input             │
├─────────────────────────────────────────────────┤
│  ti84-native.js  (THIS MODULE)                  │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ MenuNav  │ │FormEngine│ │  StatMath        ││
│  │          │ │          │ │                  ││
│  │ STAT tabs│ │ Wizards  │ │ 1-Var Stats     ││
│  │ DISTR    │ │ Cursor   │ │ t/z/chi-sq      ││
│  │ Catalog  │ │ Fields   │ │ binomial/geom   ││
│  │ Matrix   │ │ Toggles  │ │ normalcdf       ││
│  └──────────┘ │ Validate │ │ LinReg          ││
│               └──────────┘ └──────────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Screen   │ │ Result   │ │  EventBus        ││
│  │ Renderer │ │ Formatter│ │                  ││
│  │          │ │          │ │ onScreenChange   ││
│  │ LCD-like │ │ TI number│ │ onFieldFocus     ││
│  │ canvas   │ │ formatting│ │ onFieldChange   ││
│  │ 320×240  │ │          │ │ onCompute        ││
│  └──────────┘ └──────────┘ │ onResultDisplay  ││
│                             │ onKeyPress       ││
│                             └──────────────────┘│
└─────────────────────────────────────────────────┘
```

## Data Sources (already extracted)

| Source file | What it provides |
|-------------|-----------------|
| `ti84-procedures-data.json` | 20 wizard field tables, 14 result screens, 12 menus, 8 editors, 27 procedures, keypad map |
| `ti84-rom-disassembly-results.json` | ROM-verified field order, defaults, confidence levels, ROM offsets |
| `ti84-rom-wizard-fields.md` | String offsets, token byte map, alternative hypothesis labels |
| `ti84-state-machine.js` | 52-test state machine for all 27 procedures |

---

## Module 1: MenuNav

Handles all menu screens and tab navigation.

### Menu Types

1. **Tabbed menus** (STAT): 3 tabs (EDIT/CALC/TESTS), LEFT/RIGHT switches tabs, UP/DOWN moves cursor, number key jumps to item, ENTER selects
2. **Scrollable menus** (DISTR, STAT>TESTS): cursor wraps, items numbered 1-9 then 0 then A-H
3. **Simple menus** (STAT PLOT, ZOOM): small item count, ENTER selects

### API

```javascript
const menu = MenuNav.create(menuId);
// menuId: 'stat-menu', 'stat-calc-menu', 'stat-tests-menu', 'distr-menu', etc.

menu.handleKey(key);  // 'RIGHT', 'DOWN', 'ENTER', '5', 'ALPHA_D', etc.
menu.getState();      // { menuId, activeTab, cursorIndex, items[], selectedItem }
menu.onSelect(callback);  // fires when ENTER or number key selects an item
```

### Data (from JSON)

```
stat-menu:        tabs=[EDIT,CALC,TESTS], EDIT has 5 items, cursor=0
stat-calc-menu:   tabs=[EDIT,CALC,TESTS], CALC active, items=[1-Var Stats, 2-Var Stats, ...]
stat-tests-menu:  tabs=[EDIT,CALC,TESTS], TESTS active, 18 items (1:Z-Test through H:ANOVA)
distr-menu:       no tabs, 16 items (1:normalpdf through F:geometcdf)
stat-plot-menu:   no tabs, 3 items (Plot1/2/3)
```

### Tab navigation rules
- STAT menu: RIGHT cycles EDIT→CALC→TESTS→EDIT
- LEFT cycles reverse
- Switching tabs resets cursor to 0
- Number/letter key: jump directly to that item and select it

---

## Module 2: FormEngine

Renders and manages wizard forms. This is the most complex module.

### Field Types (from ROM extraction)

| Type | Behavior | Examples |
|------|----------|---------|
| `number` | Accepts digit input, decimal, negative | p₀, μ₀, lower, upper, area |
| `integer` | Accepts digit input, no decimal | x, n, df, trials |
| `list-selector` | Cycles through L1-L6 on LEFT/RIGHT or 2ND+1-6 | List, Xlist, Ylist, FreqList |
| `choice` | Cycles through options on LEFT/RIGHT, cursor highlights | prop ≠p₀/<p₀/>p₀, μ≠μ₀, Tail LEFT/CENTER/RIGHT |
| `action-button` | ENTER triggers computation or paste | Calculate, Paste |
| `action-selector` | Choice between Calculate and Draw | Calculate/Draw |
| `color-selector` | Cycles through display colors | Color: |
| `equation-selector` | Selects Y1-Y9 for storing regression | RegEQ, Store RegEQ |
| `matrix-selector` | Selects [A]-[J] | Observed, Expected (for chi-square) |

### Wizard State

```javascript
const wizard = FormEngine.create(wizardId, fieldTable);
// wizardId: 'one-propztest-wizard', etc.
// fieldTable: from ti84-procedures-data.json screens

wizard.handleKey(key);     // DOWN, UP, ENTER, digits, 2ND, etc.
wizard.getState();         // { wizardId, fields[], cursorIndex, activeField, values{} }
wizard.getValue(label);    // get current value of a field
wizard.onFieldFocus(cb);   // fires when cursor moves to a new field
wizard.onFieldChange(cb);  // fires when a value changes
wizard.onSubmit(cb);       // fires when Calculate/Paste/Draw is selected
```

### Cursor Rules
- DOWN moves to next field, UP to previous
- At last field, DOWN wraps to first (TI behavior)
- ENTER on number/integer field: moves to next field (confirms value)
- ENTER on action-button: triggers computation
- ENTER on choice field: no action (use LEFT/RIGHT to change)
- Typing digits replaces the current value (no append — clear on first keystroke)

### Data/Stats Toggle (Inpt field)
6 procedures use an Inpt toggle that swaps the visible field set:
- **Data mode**: List, Freq fields visible
- **Stats mode**: x̄, Sx, n fields visible (or x̄1, Sx1, n1, x̄2, Sx2, n2 for 2-sample)

The toggle is always the FIRST field. LEFT/RIGHT changes the mode. This swaps which fields are rendered below it.

### All 20 Wizard Field Tables

(Extracted from ROM, verified against `ti84-rom-disassembly-results.json`)

```
one-var-stats-wizard:        List=L1, FreqList=1, Calculate
linreg-wizard:               Xlist=L1, Ylist=L2, FreqList=1, Store RegEQ=Y1, Calculate
normalcdf-wizard:            lower, upper, μ=0, σ=1, Paste
invnorm-wizard:              area, μ=0, σ=1, Tail=LEFT, Paste
binompdf-wizard:             trials, p, x, Paste
binomcdf-wizard:             trials, p, x, Paste
geometpdf-wizard:            p, x, Paste
geometcdf-wizard:            p, x, Paste
t-test-data-wizard:          Inpt=Data, μ₀, List=L1, Freq=1, μ?μ₀[≠/>/<], Color:, Calculate/Draw
t-test-stats-wizard:         Inpt=Stats, μ₀, x̄, Sx, n, μ?μ₀[≠/>/<], Color:, Calculate/Draw
t-interval-data-wizard:      Inpt=Data, List=L1, Freq=1, C-Level=.95, Calculate
t-interval-stats-wizard:     Inpt=Stats, x̄, Sx, n, C-Level=.95, Calculate
two-samp-ttest-stats-wizard: Inpt=Stats, x̄1, Sx1, n1, x̄2, Sx2, n2, μ1?μ2[≠/>/<], Pooled[No/Yes], Color:, Calculate/Draw
two-samp-tint-stats-wizard:  Inpt=Stats, x̄1, Sx1, n1, x̄2, Sx2, n2, C-Level=.95, Pooled[No/Yes], Calculate
one-propztest-wizard:        p₀, x, n, prop[≠p₀/<p₀/>p₀], Color:, Calculate/Draw
one-propzint-wizard:         x, n, C-Level=.95, Calculate
chi2gof-wizard:              Observed=L1, Expected=L2, df, Color:, Calculate/Draw
chi2test-wizard:             Observed=[A], Expected=[B], Color:, Calculate/Draw
linreg-ttest-wizard:         Xlist=L1, Ylist=L2, Freq=1, β&ρ[≠0/<0/>0], RegEQ=Y1, Calculate
linreg-tint-wizard:          Xlist=L1, Ylist=L2, Freq=1, C-Level=.95, RegEQ=Y1, Calculate
```

---

## Module 3: StatMath

Pure computation functions. No UI, no state — just math.

### Functions Needed

```javascript
StatMath.oneVarStats(data, freq?)
// Returns: { xbar, sumX, sumX2, Sx, sigmaX, n, minX, Q1, Med, Q3, maxX }

StatMath.linReg(xList, yList, freq?)
// Returns: { a, b, r, r2, residuals[] }

StatMath.normalcdf(lower, upper, mu, sigma)
// Returns: probability (area under normal curve)

StatMath.invNorm(area, mu, sigma, tail)
// Returns: z-value (or x-value for non-standard)
// tail: 'LEFT' | 'CENTER' | 'RIGHT'

StatMath.binompdf(trials, p, x)
// Returns: P(X=x) for binomial

StatMath.binomcdf(trials, p, x)
// Returns: P(X≤x) for binomial

StatMath.geometpdf(p, x)
// Returns: P(X=x) for geometric

StatMath.geometcdf(p, x)
// Returns: P(X≤x) for geometric

StatMath.tTest(mu0, xbar, Sx, n, alternative)
// Returns: { t, p, df, xbar, Sx, n }

StatMath.tInterval(xbar, Sx, n, cLevel)
// Returns: { lower, upper, xbar, Sx, n, df, ME }

StatMath.twoSampTTest(x1, s1, n1, x2, s2, n2, alt, pooled)
// Returns: { t, p, df, x1, x2, Sx1, Sx2, n1, n2, ... }

StatMath.twoSampTInt(x1, s1, n1, x2, s2, n2, cLevel, pooled)
// Returns: { lower, upper, df, ... }

StatMath.onePropZTest(p0, x, n, alternative)
// Returns: { z, p, pHat, n }

StatMath.onePropZInt(x, n, cLevel)
// Returns: { lower, upper, pHat, n, ME }

StatMath.chi2GOFTest(observed, expected, df)
// Returns: { chi2, p, df }

StatMath.chi2Test(observedMatrix, expectedMatrix)
// Returns: { chi2, p, df }

StatMath.linRegTTest(xList, yList, freq, alternative)
// Returns: { t, p, df, a, b, s, r2, r }

StatMath.linRegTInt(xList, yList, freq, cLevel)
// Returns: { lower, upper, b, df, s, r2, r }
```

### Implementation Notes
- Normal CDF: use Horner approximation or rational approximation (Hart's algorithm). TI uses ~10 significant digits.
- t-distribution: use regularized incomplete beta function
- Chi-square: use incomplete gamma function
- For 1-Var Stats: median/quartiles use TI's interpolation method (different from some textbooks)
- Pooled t-test: use pooled variance formula, df = n1+n2-2
- Unpooled (Welch's): use Welch-Satterthwaite df approximation

### Number Formatting
TI-84 displays numbers in a specific format:
- Up to 10 digits shown
- Scientific notation for |x| ≥ 10^10 or |x| < 0.001
- Trailing zeros stripped in FLOAT mode
- Format: `-1.23456E-4` (capital E, no space)

```javascript
StatMath.formatTI(value)
// Returns: string formatted like TI-84 output
```

---

## Module 4: ResultFormatter

Takes computation output and produces the result screen lines.

### All 14 Result Screens

```
one-var-stats-result-page1:   x̄={v}, Σx={v}, Σx²={v}, Sx={v}, σx={v}, n={v}
one-var-stats-result-page2:   minX={v}, Q1={v}, Med={v}, Q3={v}, maxX={v}
distribution-home-result:     (pasted to home screen as decimal)
linreg-result:                y=a+bx, a={v}, b={v}, r²={v}, r={v}
t-test-result:                μ?μ₀, t={v}, p={v}, x̄={v}, Sx={v}, n={v}
t-interval-result:            ({lower},{upper}), x̄={v}, Sx={v}, n={v}
two-samp-ttest-result:        μ1?μ2, t={v}, p={v}, df={v}, x̄1={v}, x̄2={v}, Sx1={v}, Sx2={v}, n1={v}, n2={v}
two-samp-tint-result:         ({lower},{upper}), df={v}, x̄1={v}, x̄2={v}, Sx1={v}, Sx2={v}, n1={v}, n2={v}
one-propztest-result:         prop?p₀, z={v}, p={v}, p̂={v}, n={v}
one-propzint-result:          ({lower},{upper}), p̂={v}, n={v}
chi2gof-result:               χ²={v}, p={v}, df={v}
chi2test-result:              χ²={v}, p={v}, df={v}
linreg-ttest-result:          β&ρ?0, t={v}, p={v}, df={v}, a={v}, b={v}, s={v}, r²={v}, r={v}
linreg-tint-result:           ({lower},{upper}), b={v}, df={v}, s={v}, r²={v}, r={v}
```

### API

```javascript
const formatted = ResultFormatter.format(resultScreenId, computedValues, altHypothesis?);
// Returns: { lines: string[], scrollable: boolean }
```

---

## Module 5: ScreenRenderer

Renders the current state to a 320×240 canvas that looks like a TI-84 LCD.

### Screen Types to Render

1. **Home screen**: blinking cursor, previous computation results
2. **Menu**: title bar, tab strip (if tabbed), item list with cursor arrow
3. **Wizard**: field labels left-aligned, values right-aligned, cursor on active field
4. **Result**: label = value lines, scrollable indicator
5. **Editor**: column headers (L1, L2...), cell grid with cursor

### Font
- TI-84 uses a monospace bitmap font, 6×8 pixels per character
- 26 columns × 10 rows on the LCD (320÷12 ≈ 26, 240÷24 = 10 at 2x scale)
- Use a canvas font or draw pixel-by-pixel for authenticity

### API

```javascript
const renderer = ScreenRenderer.create(canvas);
renderer.renderMenu(menuState);
renderer.renderWizard(wizardState);
renderer.renderResult(resultLines);
renderer.renderEditor(editorState);
renderer.renderHome(homeLines);
```

---

## Module 6: EventBus

The trainer hooks into these events to drive walkthroughs.

```javascript
const bus = EventBus.create();

// Events
bus.on('screen-change', ({ from, to, trigger }) => {});
bus.on('field-focus', ({ wizardId, fieldIndex, fieldLabel }) => {});
bus.on('field-change', ({ wizardId, fieldLabel, oldValue, newValue }) => {});
bus.on('menu-select', ({ menuId, itemIndex, itemLabel }) => {});
bus.on('compute', ({ type, inputs, results }) => {});
bus.on('result-display', ({ screenId, lines }) => {});
bus.on('key-press', ({ key, handled, blocked }) => {});
bus.on('key-reject', ({ key, reason, expectedKey }) => {});
```

These events are what make the native port superior to CEmu for training — the trainer can react to every state change without screen scraping.

---

## Module 7: TI84Native (Orchestrator)

Wires everything together. Single entry point.

```javascript
const calc = TI84Native.create(canvas, options);

// Core API
calc.pressKey(key);           // process a key press through the full pipeline
calc.getScreen();             // current screen state { type, id, ... }
calc.getWizardValues();       // current wizard field values (if in a wizard)
calc.reset();                 // back to home screen

// List data management
calc.setList(name, data);     // e.g., calc.setList('L1', [1,2,3,4,5])
calc.getList(name);
calc.setMatrix(name, data);   // e.g., calc.setMatrix('A', [[1,2],[3,4]])

// Event hooks
calc.on(event, callback);     // delegates to EventBus

// State
calc.save();                  // serialize to JSON for localStorage
calc.load(state);             // restore from saved state
```

### Key Press Pipeline

```
pressKey(key)
  → EventBus.emit('key-press')
  → Route to current screen handler:
      Menu?  → MenuNav.handleKey()  → may trigger screen change
      Wizard? → FormEngine.handleKey() → may trigger compute
      Result? → handle scroll (DOWN) or exit (CLEAR/2ND+QUIT)
      Home?   → limited key handling
  → If compute triggered:
      → StatMath.compute(type, values)
      → ResultFormatter.format(screenId, results)
      → EventBus.emit('compute')
      → Screen change to result
      → EventBus.emit('result-display')
  → ScreenRenderer.render(currentState)
  → EventBus.emit('screen-change') if screen changed
```

---

## File Structure

```
ti84-trainer-v2/native/
  ti84-native.js       — Orchestrator (Module 7)
  menu-nav.js          — Menu navigation (Module 1)
  form-engine.js       — Wizard form engine (Module 2)
  stat-math.js         — Statistical computations (Module 3)
  result-formatter.js  — Result screen formatting (Module 4)
  screen-renderer.js   — Canvas LCD rendering (Module 5)
  event-bus.js         — Event system (Module 6)
  field-tables.js      — Wizard field data (extracted from JSON, embedded)
  menu-tables.js       — Menu item data (extracted from JSON, embedded)
```

For standalone deployment: all modules concatenated into a single IIFE, same as current approach.

---

## Integration with Existing Trainer

The trainer app (`app.js`) currently uses `bridge.js` to talk to CEmu. The native port should expose the same interface:

```javascript
// bridge.js API (current)
bridge.init()
bridge.mountCanvas(canvas)
bridge.sendButton(buttonId, holdMs)
bridge.prepareHome()
bridge.isRealEmulator()
bridge.getStatus()

// Native equivalent
native.init()                    // no ROM needed!
native.mountCanvas(canvas)
native.sendButton(buttonId)      // synchronous, deterministic
native.prepareHome()
native.isRealEmulator()          // returns false
native.getStatus()

// PLUS the event hooks that CEmu can't provide
native.on('field-focus', ...)
native.on('compute', ...)
```

The trainer can detect which backend is available and use native when no ROM is loaded, CEmu when a ROM is provided. Best of both worlds.

---

## Testing Strategy

Each module gets its own test file:

| Test file | What it covers |
|-----------|---------------|
| `stat-math.test.js` | Known computation results (compare to TI-84 output) |
| `form-engine.test.js` | Cursor movement, field validation, Data/Stats toggle |
| `menu-nav.test.js` | Tab switching, cursor wrap, number key selection |
| `result-formatter.test.js` | Output line formatting matches TI-84 display |
| `ti84-native.test.js` | Full procedure walkthroughs: key sequence → expected screens |

Use the existing 27 procedures as integration tests: feed each procedure's key sequence and verify the screen state at each step matches `ti84-procedures-data.json`.

---

## Constraints

- Zero external dependencies — pure JS, runs in any browser
- Must produce identical output to TI-84 for all AP Statistics procedures
- All 27 procedure key paths must work identically to the current state machine
- Canvas rendering at 320×240 to match TI-84 LCD resolution
- Synchronous key handling — no async delays like CEmu
