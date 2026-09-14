# TI-84 Plus CE State Machine Extraction Spec

**Goal**: Extract a deterministic state machine from the TI-84 Plus CE ROM (OS 5.8.2.0029) that maps `(current_screen_state, key_press) -> next_screen_state` for every AP Statistics navigation path, then transpile it to JavaScript for use as the procedural trainer's engine.

---

## 1. Architecture Overview

```
ROM.rom (4MB, eZ80)
    |
    v
[Phase 0] Disassembly (Ghidra/radare2 with eZ80 plugin)
    |
    v
[Phase 1] Menu handler extraction
    |  - Identify dispatch tables / jump tables for STAT, DISTR, STAT PLOT, ZOOM
    |  - Map key scan codes to handler entry points
    |  - Extract menu item -> handler linkage
    |
    v
[Phase 2] Wizard state extraction
    |  - Trace wizard field traversal (cursor movement, field validation)
    |  - Map Data/Stats toggle, alternative hypothesis cycling, Pooled Yes/No
    |  - Identify Calculate/Draw handler entry points
    |
    v
[Phase 3] Formalization (Haskell ADTs or direct JS)
    |  - Define ScreenState, KeyPress, Transition types
    |  - Enumerate all reachable states from AP Stats entry points
    |  - Verify against ti84-procedures-data.json (27 procedures, 65 screens)
    |
    v
[Phase 4] JavaScript transpilation
    - Export transition(state, key) -> state function
    - Export initial states for each menu entry point
    - Single file: ti84-state-machine.js
```

### Why Haskell intermediate (optional)

Haskell's algebraic data types make exhaustive pattern matching trivial -- the compiler will tell us if we missed a (state, key) combination. If eZ80 disassembly yields clean dispatch tables, a Haskell formalization catches completeness errors before we ship JS. If disassembly proves too difficult and we fall back to manual construction, skip straight to JS.

---

## 2. Known ROM Regions

These offsets were confirmed from our string extraction (`ti84-rom-wizard-fields.md`):

| Region | Offset range | Contents | Relevance |
|--------|-------------|----------|-----------|
| STAT > TESTS menu | `0x7BDF9 - 0x7BEC0` | 17 menu items with `0xCE` terminators | Menu structure, item ordering |
| STAT > CALC menu | `0xA0808 - 0xA0850` | 1-Var Stats, LinReg(a+bx), etc. | Menu structure |
| DISTR menu | `0xA0DEF - 0xA0E70` | 16 distribution functions | Menu structure |
| Wizard field labels | `0xAEB30 - 0xAED00` | All wizard input labels, options, buttons | Wizard field enumeration |
| Alt hypothesis options | `0xAEC05 - 0xAEC49` | 18 alternative hypothesis label variants | Wizard cycling behavior |
| Result display labels | `0xAB3D6 - 0xAB49F` | Alternative hypothesis display on result screens | Result screen rendering |
| Stat variable tokens | `0xA0A68 - 0xA0AE8` | x-bar, Sigma-x, Sx, etc. | Result screen fields |
| Five-number summary | `0xB2695 - 0xB26A8` | Q1, Q3, minX, maxX, Med | Result screen fields |
| Plot editor labels | `0xB24A3 - 0xB2518` | Xlist:, Ylist:, Type:, Color:, etc. | STAT PLOT wizard |
| Result misc labels | `0xA2F72 - 0xA30A5` | df=, Area=, low=, up= | Distribution result screens |

### Disassembly entry strategy

The string offsets give us anchors. For each string table:
1. Find XREF to the string table base address
2. Those XREFs are inside the menu rendering / dispatch code
3. The dispatch code contains the jump table mapping menu index -> handler
4. Handlers are the state transition implementations

---

## 3. TI Token Mapping

The ROM uses a proprietary token encoding for mathematical symbols. Confirmed mappings:

| Byte | Glyph | Example usage |
|------|-------|---------------|
| `0x12` | superscript 2 | Sigma-x-squared, chi-squared |
| `0x18` | not-equal | Alternative hypothesis options |
| `0x80` | subscript 0 | p0, sigma0/mu0 fields |
| `0x81` | subscript 1 | x1, p1, sigma1, mu1 |
| `0x82` | subscript 2 | x2, p2, sigma2, mu2 |
| `0x83` | subscript 3 | Q3 |
| `0xBC` | beta | LinRegTTest |
| `0xC3` | sigma (lowercase) | Known sigma field, sigma-x |
| `0xC5` | rho | LinRegTTest |
| `0xC6` | Sigma (uppercase) | Sigma-x, Sigma-x-squared |
| `0xC7` | mu | mu1, mu2 wizard fields |
| `0xCB` | x-bar | Wizard fields and stat variables |
| `0xD9` | chi | chi-squared test names |

**Key insight**: Byte `0xC3` at offset `0xAEB41` serves double duty -- it renders as either mu0 or sigma0 depending on which test is active. The ROM uses contextual rendering, not distinct labels. This means the wizard field FSM has shared states parameterized by the active test context.

---

## 4. State Machine Definition

### 4.1 State Shape

```typescript
interface ScreenState {
  // Identity
  type: 'home' | 'menu' | 'wizard' | 'result' | 'editor' | 'graph' | 'plot-editor';
  id: string;                    // matches ti84-procedures-data.json screen IDs

  // Menu-specific
  tabs?: string[];               // e.g., ['EDIT', 'CALC', 'TESTS']
  activeTab?: string;
  items?: string[];              // visible menu items
  cursor?: number;               // 0-indexed position of highlight

  // Wizard-specific
  fields?: WizardField[];
  activeField?: number;          // index into fields[]
  inputMode?: 'Data' | 'Stats'; // for tests with Inpt toggle
  altHypothesis?: '<' | '>' | '!='; // for tests with Ha selection

  // Result-specific
  lines?: string[];              // display lines
  scrollPosition?: number;       // for multi-page results
  page?: number;

  // Graph-specific
  windowSettings?: { xmin, xmax, ymin, ymax, xscl, yscl };

  // Context
  activeTest?: string;           // which test/function is running (for shared labels)
}

interface WizardField {
  label: string;                 // e.g., 'List', 'Freq', 'C-Level'
  type: 'list-selector' | 'numeric' | 'toggle' | 'action-button' | 'alt-hypothesis';
  value: string;
  options?: string[];            // for toggle/alt-hypothesis fields
}
```

### 4.2 Key Press Encoding

```typescript
type KeyPress =
  | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  | 'ENTER'
  | 'CLEAR' | '2ND' | 'ALPHA' | 'MODE'
  | 'STAT' | 'MATH' | 'APPS' | 'PRGM' | 'VARS'
  | 'Y_EQUALS' | 'WINDOW' | 'ZOOM' | 'TRACE' | 'GRAPH'
  | 'DEL'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '(-)' | ',' | '(' | ')'
  // Compound keys (2ND combos resolved before reaching FSM)
  | '2ND_STATPLOT' | '2ND_DISTR' | '2ND_MATRIX' | '2ND_LIST'
  | '2ND_QUIT' | '2ND_ENTRY';
```

### 4.3 Transition Shape

```typescript
interface Transition {
  from: string;         // ScreenState.id
  key: KeyPress;
  to: string;           // ScreenState.id
  guard?: string;       // condition (e.g., "cursor === 4" for selecting item 5)
  effects?: Effect[];   // side effects
}

interface Effect {
  type: 'set_cursor' | 'set_tab' | 'set_field' | 'set_input_mode'
       | 'cycle_alt_hypothesis' | 'scroll' | 'compute' | 'draw';
  target?: string;
  value?: any;
}
```

### 4.4 Example: STAT > TESTS > 1-PropZTest (Stats mode)

```
State: home
  Key: STAT -> stat-menu {activeTab: 'EDIT', cursor: 0}

State: stat-menu {activeTab: 'EDIT'}
  Key: RIGHT -> stat-menu {activeTab: 'CALC', cursor: 0}
  Key: RIGHT+RIGHT -> stat-menu {activeTab: 'TESTS', cursor: 0}

State: stat-menu {activeTab: 'TESTS', cursor: 0}
  Key: DOWN (x4) -> stat-menu {activeTab: 'TESTS', cursor: 4}
  Key: 5 -> one-propztest-wizard (shortcut: number selects item directly)
  Key: ENTER [when cursor=4] -> one-propztest-wizard

State: one-propztest-wizard {inputMode: 'Stats', activeField: 0}
  Fields: [p0, x, n, prop:altHypothesis, Calculate, Draw]
  Key: DOWN -> activeField++
  Key: UP -> activeField--
  Key: ENTER [on Calculate] -> one-propztest-result
  Key: ENTER [on Draw] -> one-propztest-graph
  Key: LEFT/RIGHT [on altHypothesis] -> cycle !=, <, >
```

---

## 5. Scope

### In scope (AP Statistics only)

| Menu path | Items | Procedure count |
|-----------|-------|----------------|
| STAT > EDIT | Edit (list editor) | Used by many as micro-skill |
| STAT > CALC | 1-Var Stats, LinReg(a+bx) | 2 procedures |
| STAT > TESTS | All 17 items | 12 procedures (tests + intervals) |
| 2ND > DISTR | normalcdf, invNorm, binompdf, binomcdf, geometpdf, geometcdf | 6 procedures |
| 2ND > STAT PLOT | Plot setup wizard | 4 procedures (histogram, boxplot, scatterplot, residual) |
| ZOOM | ZoomStat (item 9) | Micro-skill |
| 2ND > MATRIX | Matrix editor | 1 micro-skill |

**Total**: 27 procedures, 16 micro-skills, 65 unique screen states (from `ti84-procedures-data.json`).

### Out of scope

- General calculator operation (arithmetic, algebra, graphing Y= equations)
- Finance (TVM Solver, etc.)
- Programming (PRGM menu)
- Apps (Transformation Graphing, etc.)
- Catalog
- Memory management

---

## 6. Disassembly Strategy

### 6.1 The eZ80 CPU

The TI-84 Plus CE uses an eZ80 (Zilog eZ80F91) running at 48 MHz. Key facts:
- 24-bit address space (16MB)
- Superset of Z80 instruction set with 24-bit extensions
- Mixed 16-bit (Z80 legacy) and 24-bit (ADL mode) operation
- ROM is memory-mapped starting at 0x000000

### 6.2 Tool options

| Tool | eZ80 support | Notes |
|------|-------------|-------|
| **Ghidra** | Via community plugin (`ez80-ghidra`) | Best for cross-referencing strings to code. Install eZ80 processor module. |
| **radare2** | Limited Z80 support, no native eZ80 | Can disassemble Z80 subset; 24-bit ops will be mangled. Usable for string XREF. |
| **IDA Pro** | Z80 module only | Same limitation as radare2. |
| **Custom script** | Full control | Write a Python eZ80 disassembler targeting only the relevant ROM regions. Most practical for focused extraction. |
| **CEmu** | Full emulator | Can trace execution live. Best for verifying behavior, not static extraction. |

**Recommended approach**: Use Ghidra with the eZ80 plugin for static analysis. Use CEmu for dynamic verification of state transitions.

### 6.3 Locating menu dispatch tables

The TI-OS uses a consistent pattern for menu handling:
1. Menu definition: array of {string_ptr, handler_ptr} pairs
2. Menu renderer: reads array, draws items, handles UP/DOWN/number-shortcut input
3. On selection: indirect call through handler_ptr

**Strategy**:
1. Start at the STAT > TESTS string table (`0x7BDF9`)
2. Search for references to this address in the ROM
3. The referencing code is the menu definition structure
4. Adjacent to the string pointers will be handler pointers
5. Each handler is the entry point for a specific test's wizard

### 6.4 Locating wizard field handlers

Wizard rendering follows a similar pattern:
1. Wizard definition: array of {label_ptr, field_type, default_value, validation_fn}
2. Field renderer: draws labels, handles cursor movement between fields
3. Field-specific input: numeric entry, list selector, toggle, alt hypothesis cycling
4. On Calculate/Draw: call the computation routine

The wizard field label table at `0xAEB30-0xAED00` is the anchor. XREFs to individual labels reveal the wizard definition structures.

---

## 7. State Extraction Process

### Phase 1: Menu Navigation State Machine

Extract the top-level menu structure:

```
home --STAT--> stat-menu(EDIT)
stat-menu(EDIT) --RIGHT--> stat-menu(CALC) --RIGHT--> stat-menu(TESTS)
stat-menu(TESTS) --DOWN/number--> [specific test selected]
stat-menu(TESTS) --ENTER[cursor=N]--> [test-N wizard]

home --2ND+VARS--> distr-menu
distr-menu --DOWN/number--> [specific distribution selected]

home --2ND+Y=--> statplot-menu
statplot-menu --1/2/3--> plot-editor(N)
```

**Output**: A table of all (menu_state, key) -> next_state transitions for menu-level navigation.

### Phase 2: Wizard Field State Machine

For each of the ~20 wizard screens:

1. Enumerate all fields (from ROM label table, cross-checked with JSON)
2. Determine field traversal order (DOWN moves to next field, UP to previous)
3. Identify field types and their input behavior:
   - **Numeric fields**: accept digit keys, decimal point, negative sign
   - **List selector fields**: accept 2ND+1 through 2ND+6 for L1-L6
   - **Toggle fields** (Data/Stats, Pooled Yes/No): LEFT/RIGHT cycles options
   - **Alt hypothesis fields**: LEFT/RIGHT cycles <, >, !=
   - **Action buttons** (Calculate, Draw): ENTER triggers computation
4. Map the guards: which field is active determines what a key press does

**Output**: For each wizard, a sub-FSM defining (activeField, key) -> (newActiveField, fieldEffect).

### Phase 3: Result Screen State Machine

Result screens are simpler:
- DOWN scrolls to next line (or next page for multi-page results like 1-Var Stats)
- UP scrolls back
- CLEAR returns to home
- 2ND+QUIT returns to home

**Output**: For each result screen, scroll behavior and exit transitions.

---

## 8. Verification

The extracted state machine must reproduce every navigation path in `ti84-procedures-data.json`:

| Metric | Expected |
|--------|----------|
| Procedures traversable | 27/27 |
| Micro-skills traversable | 16/16 |
| Screens reachable | 65/65 |
| Step sequences match | Every step in every procedure must match a valid transition |

Verification script:
```javascript
for (const proc of procedures) {
  let state = initialState('home');
  for (const step of proc.steps) {
    const next = transition(state, step.key);
    assert(next.id === step.screen, `${proc.id} step failed: expected ${step.screen}, got ${next.id}`);
    state = next;
  }
}
```

---

## 9. JavaScript Output Format

The final deliverable is `ti84-state-machine.js`:

```javascript
// ti84-state-machine.js
// Deterministic TI-84 Plus CE state machine for AP Statistics procedures
// Generated from ROM analysis + manual verification

export const SCREENS = { /* all 65+ screen state definitions */ };

export const TRANSITIONS = [
  // Each: { from, key, to, guard?, effects? }
];

/**
 * Given a screen state and a key press, return the next screen state.
 * Returns null if the key press has no effect in the current state.
 */
export function transition(state, key) {
  // Resolve 2ND combos
  // Look up applicable transition
  // Apply guard conditions
  // Apply effects to produce new state
  // Return new state (immutable -- never mutate input)
}

/**
 * Get the initial state for entering a menu.
 */
export function entryState(menuPath) {
  // e.g., entryState('STAT') -> stat-menu with EDIT tab, cursor 0
}
```

**Size estimate**: ~65 screen definitions, ~200-300 transitions, ~2000 lines of JS.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| eZ80 disassembly tooling immature | HIGH | Blocks Phase 0 | Use CEmu tracing instead of static disassembly. Or skip disassembly entirely (see fallback). |
| Menu rendering uses computed jumps | MEDIUM | Makes static extraction unreliable | Use dynamic tracing (CEmu) to record actual state transitions |
| Wizard field order differs from label table order | LOW | Wrong field traversal | Verify against `ti84-procedures-data.json` and CEmu |
| ROM is proprietary TI code | CERTAIN | Legal gray area for distribution | Extract only the state machine structure (menu items, transitions), not code. The state machine is functional behavior, not copyrightable expression. |
| Shared/contextual labels (sigma0/mu0) | CONFIRMED | State machine needs test-context awareness | Parameterize wizard states by activeTest, confirmed by our token analysis |
| Some result screen labels are runtime-computed | CONFIRMED | Can't extract from string tables alone | Use `ti84-procedures-data.json` result screen definitions as ground truth |

### Fallback: Manual Construction

If ROM disassembly proves impractical, build the state machine manually:

1. **Source**: `ti84-procedures-data.json` already contains 27 procedures with complete step sequences and 65 screen definitions
2. **Method**: Convert each procedure's step sequence into explicit (state, key) -> state transitions
3. **Gap-filling**: The JSON covers the "happy path" for each procedure. Add error/cancel transitions (CLEAR to go back, 2ND+QUIT to home) by pattern:
   - From any menu: CLEAR returns to previous screen or home
   - From any wizard: 2ND+QUIT returns to home, CLEAR returns to menu
   - From any result: CLEAR or ENTER returns to home
4. **Advantage**: This is actually faster and more reliable than disassembly
5. **Disadvantage**: Misses transitions not documented in the JSON (e.g., what happens if you press GRAPH from a wizard?)

**Recommendation**: Start with the manual fallback to get a working state machine immediately. Pursue ROM disassembly in parallel as a verification and enrichment pass -- it can reveal transitions we didn't think to document.

---

## 11. Deliverables Summary

| Deliverable | Format | Description |
|-------------|--------|-------------|
| `ti84-state-machine.js` | JavaScript ES module | `transition(state, key)` function + all state/transition data |
| `ti84-state-machine.test.js` | Vitest test file | Verifies all 27 procedures traverse correctly |
| `ti84-rom-analysis.md` | Markdown (optional) | Notes from disassembly: dispatch tables, handler addresses, findings |

---

## Appendix A: ROM File Details

- **File**: `TI-84_Plus_CE/ROM.rom`
- **Size**: 4,194,304 bytes (4 MB)
- **OS Version**: 5.8.2.0029
- **CPU**: eZ80F91 (Zilog), 48 MHz, 24-bit address space
- **Endianness**: Little-endian
- **Boot vector**: 0x000000 (reset), 0x000038 (RST 38h interrupt)

## Appendix B: Cross-Reference to Existing Data

| Existing file | Contains | Relationship to this spec |
|---------------|----------|--------------------------|
| `ti84-procedures-data.json` | 27 procedures, 16 micro-skills, 65 screens, keypad layout, DAG | Ground truth for state machine behavior |
| `ti84-rom-wizard-fields.md` | ROM string extraction, token mappings, discrepancy analysis | Input data for disassembly anchoring |
| `ti84-trainer-spec.md` | Trainer app spec (UI, SRS, modes) | Consumer of the state machine |
| `ti84-trainer-research-prompt.md` | Research prompt that produced procedures JSON | Context for data provenance |
