# Codex Task: Build TI-84 Plus CE State Machine Engine

## Task Summary

Build a deterministic JavaScript state machine that models the TI-84 Plus CE calculator's menu/wizard/result screen navigation for AP Statistics procedures. The function signature is:

```javascript
transition(currentState, keyPress) -> nextState | null
```

This state machine is the engine for a procedural trainer app. It must correctly reproduce every navigation path that a student would follow when performing AP Stats calculator procedures (hypothesis tests, confidence intervals, distribution calculations, descriptive stats, regression, graphing).

---

## Context and Existing Files

Read these files before starting:

| File | What it contains | How to use it |
|------|-----------------|---------------|
| `ti84-state-machine-spec.md` | Full spec for this task: state shape, transition shape, ROM regions, risks, deliverable format | Your primary requirements document |
| `ti84-procedures-data.json` | 27 procedures, 16 micro-skills, 65 screen definitions, keypad layout, prerequisite DAG | **Ground truth**: the state machine must reproduce every step sequence in every procedure |
| `ti84-rom-wizard-fields.md` | ROM string extraction report: wizard field labels, menu items, token mappings, discrepancies | Reference for exact field names, menu ordering, and known ROM offsets |
| `TI-84_Plus_CE/ROM.rom` | The actual ROM file (4MB, eZ80 CPU, OS 5.8.2.0029) | Optional: for disassembly-based extraction if you pursue that path |

---

## Approach: Two Tracks (Pick One, or Both)

### Track A: Manual Construction from JSON (Recommended starting point)

Convert `ti84-procedures-data.json` into a state machine directly:

1. **Parse all 65 screen definitions** from the JSON's `screens` array. Each becomes a state template.
2. **Parse all procedure step sequences**. Each step says "press key X, arrive at screen Y." Convert each step pair into a transition: `{from: previousScreen, key: X, to: Y}`.
3. **Parse all micro-skill step sequences** the same way.
4. **Add structural transitions** not explicitly in procedures:
   - `CLEAR` from any menu/wizard returns to parent menu or home
   - `2ND+QUIT` from anywhere returns to home
   - Menu `UP`/`DOWN` moves cursor within the current menu
   - Menu number shortcuts (pressing `5` on TESTS menu selects item 5 directly)
   - Tab switching: `LEFT`/`RIGHT` on menu tabs (STAT menu has EDIT/CALC/TESTS)
   - Wizard field navigation: `DOWN` moves to next field, `UP` to previous
   - Alt hypothesis cycling: `LEFT`/`RIGHT` on hypothesis field cycles `<`, `>`, `!=`
   - Data/Stats toggle: `LEFT`/`RIGHT` on Inpt field
   - Pooled Yes/No toggle: `LEFT`/`RIGHT` on Pooled field
5. **Verify**: Run every procedure's step sequence through the state machine and confirm it produces the expected screen at each step.

### Track B: ROM Disassembly (Enrichment, not required for MVP)

Use Ghidra or radare2 to disassemble relevant ROM regions and extract transitions we didn't document manually:

1. **Install eZ80 support**: For Ghidra, install the `ez80-ghidra` community processor module. For radare2, the Z80 plugin handles most instructions but mangles 24-bit ADL mode ops.
2. **Load ROM**: Import `TI-84_Plus_CE/ROM.rom` as raw binary, base address 0x000000, eZ80 processor.
3. **Start with STAT > TESTS**: The menu string table is at `0x7BDF9`. Search for cross-references to this address. The referencing code is the menu dispatch handler.
4. **Extract the dispatch table**: Near the string table references, look for a jump table or indexed indirect call pattern. Each entry maps a menu index to a handler address.
5. **Trace one handler** (e.g., 1-PropZTest, item 5 in TESTS): Follow the handler to find wizard field setup, field traversal logic, and Calculate/Draw handlers.
6. **Generalize**: Once you understand the pattern for one test, apply it to all 17 TESTS items, then DISTR, CALC, STAT PLOT.

**Known ROM anchors** (from our extraction):

| What | Offset |
|------|--------|
| STAT > TESTS menu strings | `0x7BDF9` |
| STAT > CALC menu strings | `0xA0808` |
| DISTR menu strings | `0xA0DEF` |
| Wizard field label pool | `0xAEB30 - 0xAED00` |
| Alt hypothesis options | `0xAEC05 - 0xAEC49` |
| Result screen alt displays | `0xAB3D6 - 0xAB49F` |
| Plot editor labels | `0xB24A3 - 0xB2518` |
| Stat variable tokens | `0xA0A68 - 0xA0AE8` |

**eZ80 notes**: The eZ80 is a 24-bit extension of the Z80. It runs in ADL (Address Data Long) mode with 24-bit registers and addresses. The instruction encoding is mostly Z80-compatible with prefix bytes for 24-bit operations. Key differences: `CALL` and `JP` targets are 3 bytes, not 2. Stack operations push/pop 3 bytes.

---

## Phased Implementation

### Phase 1: Menu Navigation (deliver first)

Build transitions for top-level menu navigation only:

- Home screen entry points: `STAT`, `2ND+VARS` (DISTR), `2ND+Y=` (STAT PLOT), `ZOOM`
- Tab switching within STAT menu (EDIT / CALC / TESTS)
- Cursor movement within each menu (UP/DOWN, wrapping behavior)
- Number shortcut selection (pressing digit selects that item directly)
- ENTER to select highlighted item
- CLEAR to exit menu

**Verification**: Can navigate from home to any of the 27 procedure entry points.

### Phase 2: Wizard Field Navigation (deliver second)

For each wizard screen (about 20 unique wizards):

- Field-to-field cursor movement (UP/DOWN)
- Field input behavior by type:
  - Numeric: digit keys, decimal, negative, CLEAR to reset field
  - List selector: 2ND+1..6 for L1..L6, or ALPHA+name
  - Toggle (Data/Stats, Pooled): LEFT/RIGHT cycles
  - Alt hypothesis: LEFT/RIGHT cycles <, >, !=
  - Action button (Calculate/Draw): ENTER triggers
- The `Inpt: Data/Stats` toggle changes which fields are visible (different field sets for Data mode vs Stats mode). This is the trickiest part -- model it as two sub-states of the wizard.

**Verification**: Can traverse every wizard field sequence in all 27 procedures.

### Phase 3: Result Screens and Graph Screens (deliver last)

- Result screen scrolling (DOWN for next page, UP for previous)
- Multi-page results (1-Var Stats has 2 pages, other tests have 1)
- Exit transitions (CLEAR or 2ND+QUIT to home)
- Graph result screens (after Draw): TRACE, WINDOW, ZOOM interactions (minimal -- most AP Stats procedures use Calculate, not Draw)

**Verification**: Full end-to-end procedure traversal matches JSON for all 27 procedures.

---

## Output Format

Produce a single file: **`ti84-state-machine.js`**

```javascript
/**
 * TI-84 Plus CE AP Statistics State Machine
 * Deterministic: transition(state, key) -> newState | null
 */

// ---- Screen State Definitions ----

const SCREENS = {
  'home': {
    type: 'home',
    id: 'home',
    description: 'TI-84 CE home screen'
  },
  'stat-menu': {
    type: 'menu',
    id: 'stat-menu',
    tabs: ['EDIT', 'CALC', 'TESTS'],
    defaultTab: 'EDIT',
    items: {
      'EDIT': ['1:Edit...', '2:SortA(', '3:SortD(', '4:ClrList', '5:SetUpEditor'],
      'CALC': ['1:1-Var Stats', '2:2-Var Stats', /* ... */ '8:LinReg(a+bx)'],
      'TESTS': ['1:Z-Test...', '2:T-Test...', /* ... all 17 items */ ]
    }
  },
  // ... all 65+ screens
};

// ---- Transition Table ----

// Transitions are looked up by (state.id, key) with optional guards.
// Guards are functions of the current state: (state) => boolean

const TRANSITIONS = [
  // Menu entry from home
  { from: 'home', key: 'STAT', to: 'stat-menu', effects: [{ type: 'set_tab', value: 'EDIT' }, { type: 'set_cursor', value: 0 }] },
  { from: 'home', key: '2ND_DISTR', to: 'distr-menu', effects: [{ type: 'set_cursor', value: 0 }] },
  { from: 'home', key: '2ND_STATPLOT', to: 'statplot-menu' },
  
  // Tab navigation
  { from: 'stat-menu', key: 'RIGHT', guard: (s) => s.activeTab === 'EDIT', to: 'stat-menu', effects: [{ type: 'set_tab', value: 'CALC' }, { type: 'set_cursor', value: 0 }] },
  { from: 'stat-menu', key: 'RIGHT', guard: (s) => s.activeTab === 'CALC', to: 'stat-menu', effects: [{ type: 'set_tab', value: 'TESTS' }, { type: 'set_cursor', value: 0 }] },
  
  // ... hundreds more transitions
];

// ---- Engine ----

/**
 * Compute the next state given current state and key press.
 * @param {object} state - Current screen state (immutable, will not be modified)
 * @param {string} key - Key press identifier
 * @returns {object|null} New state, or null if key has no effect
 */
export function transition(state, key) {
  // 1. Find all transitions matching (state.id, key)
  // 2. Evaluate guards in order; first passing guard wins
  // 3. Clone state, apply effects, return new state
  // 4. Return null if no transition matches
}

/**
 * Create the initial state for a given entry point.
 * @param {string} screenId - Screen to start at (default: 'home')
 * @returns {object} Initial state
 */
export function createState(screenId = 'home') {
  // Return a fresh state object for the given screen
}

/**
 * Get all valid key presses for the current state.
 * @param {object} state - Current screen state
 * @returns {string[]} Array of valid key identifiers
 */
export function validKeys(state) {
  // Return all keys that would produce a non-null transition
}
```

### Important implementation details

1. **States are immutable**. `transition()` must return a new object, never mutate the input.
2. **Guards must be deterministic**. No randomness, no side effects.
3. **`validKeys()` is critical** for the trainer UI -- it needs to know which keys to highlight/accept.
4. **Number shortcuts on menus**: Pressing `5` on the TESTS menu should select item 5 directly, equivalent to moving cursor to index 4 and pressing ENTER.
5. **Wizard Data/Stats mode switching**: When Inpt changes from Data to Stats (or vice versa), the visible fields change. The state must reflect which fields are currently shown.
6. **Shared wizard labels**: The ROM reuses labels like sigma0/mu0 across tests. The state machine should use the test-specific display names from `ti84-procedures-data.json`, not the raw ROM tokens.

---

## Verification Script

After building the state machine, write `ti84-state-machine.test.js` (Vitest):

```javascript
import { transition, createState } from './ti84-state-machine.js';
import procedures from './ti84-procedures-data.json';

describe('procedure traversal', () => {
  for (const proc of procedures.procedures) {
    it(`traverses ${proc.id} (${proc.steps.length} steps)`, () => {
      let state = createState('home');
      for (const step of proc.steps) {
        const next = transition(state, step.key);
        expect(next).not.toBeNull();
        expect(next.id).toBe(step.screen);
        state = next;
      }
    });
  }

  for (const ms of procedures.microSkills) {
    it(`traverses micro-skill ${ms.id}`, () => {
      let state = createState('home');
      for (const step of ms.steps) {
        if (step.key.startsWith('{')) continue; // skip template steps like {number}
        const next = transition(state, step.key);
        expect(next).not.toBeNull();
        expect(next.id).toBe(step.screen);
        state = next;
      }
    });
  }
});

describe('structural transitions', () => {
  it('CLEAR from any menu returns to home or parent', () => {
    // Test CLEAR from stat-menu, distr-menu, etc.
  });

  it('2ND+QUIT from any screen returns to home', () => {
    // Test from wizards, results, menus
  });

  it('menu cursor wraps or clamps at boundaries', () => {
    // Test UP at cursor=0 and DOWN at cursor=max
  });

  it('tab switching wraps or clamps at boundaries', () => {
    // Test RIGHT on TESTS tab, LEFT on EDIT tab
  });
});
```

---

## What NOT to Build

- **No UI**. This is just the state machine engine. The trainer app (`ti84_trainer.html`) will consume this.
- **No actual computation**. The state machine does not calculate statistics. Result screens show `{value}` placeholders.
- **No list/matrix data storage**. The state machine does not track what numbers the user entered into L1. It only tracks which screen is showing and where the cursor is.
- **No sound, no rendering, no DOM manipulation**.

---

## Difficulty Assessment

This is a moderately difficult task with one genuinely hard part:

- **Easy**: Parsing the JSON procedures into transitions (mechanical)
- **Medium**: Adding structural transitions (CLEAR, cursor movement, tab switching) -- requires understanding TI-84 UI conventions
- **Medium**: Wizard field traversal with Data/Stats mode switching
- **Hard**: ROM disassembly (if pursued) -- eZ80 tooling is immature, TI-OS is undocumented, computed jumps are common

**Time estimate**:
- Track A (JSON-based): 2-4 hours for a working state machine
- Track B (ROM disassembly): 8-20 hours, uncertain outcome
- **Recommendation**: Ship Track A first, use Track B for verification/enrichment later

---

## Reference: TI Token Bytes

When reading ROM hex dumps, these byte values map to mathematical glyphs:

| Byte | Glyph | | Byte | Glyph |
|------|-------|-|------|-------|
| `0x12` | superscript 2 | | `0xC3` | sigma |
| `0x18` | not-equal | | `0xC5` | rho |
| `0x80` | subscript 0 | | `0xC6` | Sigma (uppercase) |
| `0x81` | subscript 1 | | `0xC7` | mu |
| `0x82` | subscript 2 | | `0xCB` | x-bar |
| `0x83` | subscript 3 | | `0xD9` | chi |
| `0xBC` | beta | | `0xCE` | menu item terminator |
