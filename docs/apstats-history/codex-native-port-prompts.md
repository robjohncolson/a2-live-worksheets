# Codex Prompts — TI-84 Native Stat Module Port

## Dependency Graph

```
Batch 1 (parallel, no deps):
  Agent A: EventBus + StatMath
  Agent B: MenuNav + field/menu data tables

Batch 2 (depends on Batch 1):
  Agent C: FormEngine (needs field tables from B, EventBus from A)
  Agent D: ResultFormatter + ScreenRenderer (needs StatMath from A)

Batch 3 (depends on all):
  Agent E: TI84Native orchestrator + integration tests
```

---

## Agent A: EventBus + StatMath

### Prompt

```
You are building two foundational modules for a TI-84 Plus CE native stat calculator reimplementation in JavaScript. These modules have ZERO dependencies — pure functions and a simple pub/sub.

Read `ti84-native-port-spec.md` for the full architecture, then implement:

**File 1: `ti84-trainer-v2/native/event-bus.js`**

Simple pub/sub event emitter. API:
- `EventBus.create()` → returns `{ on, off, emit }`
- `on(event, callback)` — register listener
- `off(event, callback)` — remove listener  
- `emit(event, data)` — fire all listeners for event

Events listed in spec Module 6. Keep it under 50 lines.

**File 2: `ti84-trainer-v2/native/stat-math.js`**

All statistical computation functions. API defined in spec Module 3. Key requirements:
- `oneVarStats(data, freq?)` — mean, SD, five-number summary. Use TI's quartile method (interpolation between adjacent values when n is even)
- `normalcdf(lower, upper, mu, sigma)` — use rational approximation for the standard normal CDF, then transform. 10+ significant digit accuracy.
- `invNorm(area, mu, sigma, tail)` — inverse normal via rational approximation. Handle LEFT/CENTER/RIGHT tail modes.
- `tTest`, `tInterval`, `twoSampTTest`, `twoSampTInt` — t-distribution via regularized incomplete beta function
- `onePropZTest`, `onePropZInt` — z-based proportion inference
- `chi2GOFTest`, `chi2Test` — chi-square via incomplete gamma function
- `linReg(xList, yList, freq?)` — least-squares a+bx, r, r²
- `linRegTTest`, `linRegTInt` — regression inference
- `binompdf`, `binomcdf`, `geometpdf`, `geometcdf` — exact computation
- `formatTI(value)` — format number like TI-84 display (10 digits, scientific notation for |x|≥10^10 or |x|<0.001, trailing zeros stripped)

Implementation notes:
- For normal CDF: use the Abramowitz & Stegun approximation (formula 26.2.17) or a minimax rational approximation. Must be accurate to at least 10 significant digits to match TI output.
- For t-distribution CDF: implement via regularized incomplete beta function I_x(a,b) where x=df/(df+t²), a=df/2, b=1/2.
- For chi-square CDF: implement via regularized lower incomplete gamma function P(a,x) where a=df/2, x=χ²/2.
- For incomplete beta/gamma: use continued fraction expansion (Lentz's algorithm).
- Pooled vs unpooled t-test: pooled uses sp²=(n1-1)s1²+(n2-1)s2²)/(n1+n2-2), df=n1+n2-2. Unpooled (Welch) uses Satterthwaite df.
- 1-Var Stats quartiles: TI uses the "include median" method. For odd n, median is middle value. Q1 is median of lower half (not including median if n odd). Same for Q3.

**File 3: `ti84-trainer-v2/native/tests/stat-math.test.js`**

Vitest tests. Test each function against known TI-84 output:
- oneVarStats: test with [1,2,3,4,5] → x̄=3, Sx=1.5811388, σx=1.4142136, etc.
- normalcdf: normalcdf(-1,1,0,1) ≈ 0.6826894921, normalcdf(600,800,700,50) for non-standard
- tTest: known textbook examples
- onePropZTest: p₀=0.5, x=55, n=100 → z≈1.0, p≈0.3173
- binompdf: binompdf(10,0.5,5) = 0.2460937500
- formatTI: verify scientific notation triggers, trailing zero stripping

Do NOT modify any existing files. Only create new files in `ti84-trainer-v2/native/`.
```

---

## Agent B: MenuNav + Data Tables

### Prompt

```
You are building the menu navigation module and embedded data tables for a TI-84 Plus CE native stat calculator reimplementation.

Read `ti84-native-port-spec.md` for the full architecture. Also read `ti84-procedures-data.json` — you will extract menu and wizard field data from it.

**File 1: `ti84-trainer-v2/native/menu-tables.js`**

Extract and embed all menu screen data from `ti84-procedures-data.json` screens where type='menu'. Structure:

```javascript
const MENU_TABLES = {
  'stat-menu': {
    tabs: ['EDIT', 'CALC', 'TESTS'],
    activeTab: 'EDIT',
    items: ['1:Edit...', '2:SortA(', '3:SortD(', '4:ClrList', '5:SetUpEditor'],
  },
  'stat-calc-menu': { ... },
  'stat-tests-menu': { ... },  // 18 items
  'distr-menu': { ... },       // 16 items
  // ... all 12 menu screens
};
```

Include the mapping of which menu item opens which wizard/screen:
```javascript
const MENU_ACTIONS = {
  'stat-calc-menu': {
    0: { screen: 'one-var-stats-wizard' },  // 1:1-Var Stats
    // ...
  },
  'stat-tests-menu': {
    0: { screen: 't-test-wizard' },  // ... mapped by index
    // ...
  },
};
```

**File 2: `ti84-trainer-v2/native/field-tables.js`**

Extract and embed all wizard field tables from `ti84-procedures-data.json` screens where type='wizard'. Also incorporate confidence and ROM offset data from `ti84-rom-disassembly-results.json`. Structure:

```javascript
const FIELD_TABLES = {
  'one-var-stats-wizard': {
    fields: [
      { label: 'List', type: 'list-selector', default: 'L1' },
      { label: 'FreqList', type: 'list-selector', default: '1' },
      { label: 'Calculate', type: 'action-button' },
    ],
    inputModes: null,  // no Data/Stats toggle
  },
  't-test-data-wizard': {
    fields: [ ... ],
    inputModes: {
      data: ['Inpt', 'μ₀', 'List', 'Freq', 'μ?μ₀', 'Color:', 'Calculate/Draw'],
      stats: ['Inpt', 'μ₀', 'x̄', 'Sx', 'n', 'μ?μ₀', 'Color:', 'Calculate/Draw'],
    },
  },
  // ... all 20 wizard screens
};
```

Also embed all result screen templates:
```javascript
const RESULT_TABLES = {
  'one-var-stats-result-page1': {
    lines: ['x̄ = {xbar}', 'Σx = {sumX}', ...],
    scrollable: true,
    nextPage: 'one-var-stats-result-page2',
  },
  // ... all 14 result screens
};
```

**File 3: `ti84-trainer-v2/native/menu-nav.js`**

Menu navigation engine. API from spec Module 1:
- `MenuNav.create(menuId)` — creates a menu navigator from MENU_TABLES
- `menu.handleKey(key)` — processes UP/DOWN/LEFT/RIGHT/ENTER/number keys
- `menu.getState()` — returns { menuId, activeTab, cursorIndex, items, selectedItem }
- `menu.onSelect(callback)` — fires when an item is selected

Tab navigation:
- RIGHT: next tab (wraps), resets cursor to 0
- LEFT: previous tab (wraps), resets cursor to 0
- UP/DOWN: move cursor within current tab's items (wraps)
- ENTER: select current item
- Number/letter key (1-9, 0, A-H): jump to that item and select immediately

For STAT menu: switching tabs creates a new menu state for that tab's screen (stat-menu, stat-calc-menu, or stat-tests-menu).

**File 4: `ti84-trainer-v2/native/tests/menu-nav.test.js`**

Vitest tests:
- Tab switching: STAT → RIGHT → CALC tab, RIGHT → TESTS tab, RIGHT → wraps to EDIT
- Cursor movement: DOWN wraps from last item to first
- Number key selection: pressing '5' in TESTS selects 1-PropZTest
- Item selection returns correct screen ID from MENU_ACTIONS

Do NOT modify any existing files. Only create new files in `ti84-trainer-v2/native/`.
Read `ti84-procedures-data.json` and `ti84-rom-disassembly-results.json` for source data.
```

---

## Agent C: FormEngine (depends on Batch 1)

### Prompt

```
You are building the wizard form engine for a TI-84 Plus CE native stat calculator reimplementation.

Read `ti84-native-port-spec.md` for the architecture. The field data tables are in `ti84-trainer-v2/native/field-tables.js` (already built). The event bus is in `ti84-trainer-v2/native/event-bus.js` (already built).

**File 1: `ti84-trainer-v2/native/form-engine.js`**

Wizard form manager. This is the most complex module. API from spec Module 2:

- `FormEngine.create(wizardId, fieldTable, eventBus)` — creates a wizard form
- `wizard.handleKey(key)` — processes DOWN/UP/LEFT/RIGHT/ENTER/digit keys/CLEAR/DEL/NEGATIVE
- `wizard.getState()` — { wizardId, fields[], cursorIndex, activeField, values{}, inputMode }
- `wizard.getValue(label)` — current value of a field by label
- `wizard.onFieldFocus(cb)` / `wizard.onFieldChange(cb)` / `wizard.onSubmit(cb)`

Field type behaviors:

1. **number**: Typing digits builds the value string. NEGATIVE inserts/toggles leading minus. DECIMAL adds decimal point. CLEAR clears the field. DEL backspaces. ENTER confirms and moves to next field. First keystroke clears any default.

2. **integer**: Same as number but no DECIMAL allowed.

3. **list-selector**: LEFT/RIGHT cycles L1→L2→L3→L4→L5→L6→L1. Also responds to 2ND+1 through 2ND+6 for direct L1-L6 selection.

4. **choice**: LEFT/RIGHT cycles through options array. ENTER does NOT select — it moves to next field. The current option is just highlighted.

5. **action-button**: ENTER triggers the onSubmit callback with current values. This is Calculate, Paste, or Draw.

6. **action-selector**: LEFT/RIGHT toggles between Calculate and Draw. ENTER triggers onSubmit with the selected action.

7. **color-selector**: LEFT/RIGHT cycles through colors (BLUE, RED, BLACK, MAGENTA, GREEN, ORANGE, BROWN, NAVY, LTBLUE, YELLOW, WHITE, LTGRAY, MEDGRAY, DARKGRAY). Default is BLUE.

8. **equation-selector**: LEFT/RIGHT cycles Y1-Y0 (10 equation vars).

9. **matrix-selector**: LEFT/RIGHT cycles [A]-[J].

Cursor navigation:
- DOWN: move to next field (wraps from last to first)
- UP: move to previous field (wraps from first to last)
- When entering a number/integer field, the first digit press clears any existing value

Data/Stats toggle (Inpt field):
- When a wizard has `inputModes`, the Inpt field is always index 0
- LEFT/RIGHT on Inpt toggles between 'Data' and 'Stats'
- Toggling swaps which fields are visible below Inpt
- The μ₀ (or equivalent) field and alternative hypothesis field are shared between modes
- Values entered in Data mode are preserved if user switches to Stats and back

**File 2: `ti84-trainer-v2/native/tests/form-engine.test.js`**

Vitest tests:
- Cursor movement: DOWN through all fields, wraps at end
- Number entry: type '1', '2', '3' → value is '123'. CLEAR → empty. NEGATIVE → '-123'
- List selector: RIGHT from L1 → L2, LEFT from L1 → L6
- Choice cycling: RIGHT cycles through ≠/</> options
- Action button: ENTER on Calculate triggers onSubmit with all field values
- Data/Stats toggle: switch Inpt, verify correct fields appear
- First-keystroke-clears: field with default 'L1', press RIGHT → L2 (not clear)
- Field with default '.95', type '9' '0' → value is '90' (not '.9590')

Do NOT modify any existing files. Only create new files in `ti84-trainer-v2/native/`.
```

---

## Agent D: ResultFormatter + ScreenRenderer (depends on Batch 1)

### Prompt

```
You are building the result formatter and screen renderer for a TI-84 Plus CE native stat calculator reimplementation.

Read `ti84-native-port-spec.md` for the architecture. StatMath is in `ti84-trainer-v2/native/stat-math.js` (already built). Result screen templates are in `ti84-trainer-v2/native/field-tables.js` as RESULT_TABLES.

**File 1: `ti84-trainer-v2/native/result-formatter.js`**

Takes computed results and produces display lines matching TI-84 output.

API:
- `ResultFormatter.format(resultScreenId, computedValues, altHypothesis?)` → { lines: string[], scrollable: boolean }

The formatter must:
- Use `StatMath.formatTI()` for all numeric values
- Include the alternative hypothesis line (e.g., "μ≠μ₀" or "prop>p₀") as the first line for test results
- Handle multi-page results (1-Var Stats has page1 + page2, connected by scrollable flag)
- Match the exact line templates from RESULT_TABLES, substituting {value} placeholders

**File 2: `ti84-trainer-v2/native/screen-renderer.js`**

Renders calculator state to a 320×240 canvas.

API:
- `ScreenRenderer.create(canvas)` → renderer object
- `renderer.renderHome(lines)` — home screen with blinking cursor
- `renderer.renderMenu(menuState)` — title bar + optional tab strip + item list + cursor
- `renderer.renderWizard(wizardState)` — field labels left, values right, cursor indicator
- `renderer.renderResult(resultState)` — label=value lines, scroll indicator
- `renderer.renderEditor(editorState)` — column grid with cursor

Rendering rules:
- Background: #9EAD86 (classic LCD green) or #FFFFFF (CE white backlight)
- Text: dark pixels on light background
- Font: monospace, sized so 26 chars fit across 320px (≈12px per char)
- Menu cursor: ► character at left margin of selected item
- Wizard cursor: highlight/invert the active field row
- Tab strip: tab names across top, active tab highlighted
- Result scroll indicator: ▼ at bottom-right when more content below

Keep the renderer simple — mid-fidelity is fine. The goal is recognizable TI-84 screens, not pixel-perfect.

**File 3: `ti84-trainer-v2/native/tests/result-formatter.test.js`**

Vitest tests:
- 1-Var Stats format: pass known values, verify line output
- 1-PropZTest format: verify alternative hypothesis line appears first
- TInterval format: verify interval displayed as (lower, upper)
- Multi-page: verify page1 has scrollable=true, page2 does not

Do NOT modify any existing files. Only create new files in `ti84-trainer-v2/native/`.
```

---

## Agent E: TI84Native Orchestrator (depends on ALL)

### Prompt

```
You are building the orchestrator that wires together all modules of a TI-84 Plus CE native stat calculator reimplementation.

Read `ti84-native-port-spec.md` for the full architecture. All dependency modules are already built in `ti84-trainer-v2/native/`:
- `event-bus.js` — EventBus.create()
- `stat-math.js` — StatMath functions
- `menu-nav.js` — MenuNav.create()
- `form-engine.js` — FormEngine.create()
- `result-formatter.js` — ResultFormatter.format()
- `screen-renderer.js` — ScreenRenderer.create()
- `field-tables.js` — FIELD_TABLES, RESULT_TABLES
- `menu-tables.js` — MENU_TABLES, MENU_ACTIONS

**File 1: `ti84-trainer-v2/native/ti84-native.js`**

The orchestrator. Manages screen state, routes key presses, triggers computations.

API (matches bridge.js interface for drop-in replacement):
- `TI84Native.create(canvas, options?)` → calc object
- `calc.pressKey(key)` — synchronous key processing through full pipeline
- `calc.getScreen()` — { type, id, state }
- `calc.getWizardValues()` — current wizard field values or null
- `calc.reset()` — back to home screen
- `calc.setList(name, data)` / `calc.getList(name)` — manage stat lists
- `calc.setMatrix(name, data)` — manage matrices
- `calc.on(event, callback)` — event subscription
- `calc.save()` / `calc.load(state)` — persistence

Bridge-compatible API (so app.js can swap backends):
- `calc.init()` — resolves immediately (no ROM needed)
- `calc.mountCanvas(canvas)` — attach renderer
- `calc.sendButton(buttonId)` — alias for pressKey
- `calc.prepareHome()` — reset to home
- `calc.isRealEmulator()` — returns false
- `calc.getStatus()` — { code: 'ready', detail: 'Native mode', usingMock: false }

Key press pipeline (see spec Module 7):
1. Emit 'key-press' event
2. Route to current screen handler (menu → MenuNav, wizard → FormEngine, result → scroll/exit, home → limited)
3. If MenuNav selects a wizard: create FormEngine for that wizard, switch screen
4. If FormEngine triggers compute: call StatMath, format with ResultFormatter, switch to result screen
5. If result screen and CLEAR pressed: return to home
6. If 2ND+QUIT from anywhere: return to home
7. Render current screen via ScreenRenderer
8. Emit 'screen-change' if screen changed

Screen state machine:
- HOME → STAT key → stat-menu
- stat-menu → RIGHT → stat-calc-menu → RIGHT → stat-tests-menu
- stat-tests-menu → select item → wizard screen
- wizard → Calculate → result screen
- result → CLEAR → home
- HOME → 2ND+VARS → distr-menu
- distr-menu → select → wizard → Paste → home (value pasted)

List management:
- Maintain L1-L6 arrays in memory
- Procedures that assume data in L1 (like 1-Var Stats) read from these lists
- STAT>EDIT opens the list editor (simplified: just show the data, arrow nav)

**File 2: `ti84-trainer-v2/native/tests/ti84-native.test.js`**

Integration tests. Walk through complete procedures by key sequence and verify screen states at each step. Use `ti84-procedures-data.json` as the source of truth.

Test at minimum:
- 1-Var Stats: STAT → RIGHT → ENTER → DOWN → DOWN → ENTER → verify result lines
- 1-PropZTest: STAT → RIGHT → RIGHT → scroll to 5 → enter values → Calculate → verify z and p
- normalcdf: 2ND → VARS → 2 → enter bounds → Paste → verify home shows value
- Full key sequence for histogram procedure (navigation + plot setup)

Each test should verify: screen type, screen ID, and key wizard field states at critical steps.

Do NOT modify any existing files. Only create new files in `ti84-trainer-v2/native/`.
Read `ti84-procedures-data.json` for procedure key sequences and expected screen states.
```

---

## Dispatch Order

```
Batch 1 (parallel):
  codex exec --prompt codex-native-port-prompts.md#AgentA --owned-paths "ti84-trainer-v2/native/event-bus.js,ti84-trainer-v2/native/stat-math.js,ti84-trainer-v2/native/tests/stat-math.test.js"
  codex exec --prompt codex-native-port-prompts.md#AgentB --owned-paths "ti84-trainer-v2/native/menu-nav.js,ti84-trainer-v2/native/menu-tables.js,ti84-trainer-v2/native/field-tables.js,ti84-trainer-v2/native/tests/menu-nav.test.js"

Batch 2 (after Batch 1 completes):
  codex exec --prompt codex-native-port-prompts.md#AgentC --owned-paths "ti84-trainer-v2/native/form-engine.js,ti84-trainer-v2/native/tests/form-engine.test.js"
  codex exec --prompt codex-native-port-prompts.md#AgentD --owned-paths "ti84-trainer-v2/native/result-formatter.js,ti84-trainer-v2/native/screen-renderer.js,ti84-trainer-v2/native/tests/result-formatter.test.js"

Batch 3 (after Batch 2 completes):
  codex exec --prompt codex-native-port-prompts.md#AgentE --owned-paths "ti84-trainer-v2/native/ti84-native.js,ti84-trainer-v2/native/tests/ti84-native.test.js"
```
