# Codex Task: TI-84 Trainer V2 — ROM-Based with Pattern Recognition

## Overview

Build a TI-84 Plus CE procedural trainer that runs the **actual calculator ROM** in the browser via CEmu's WebAssembly build. Students see the real TI-84 CE screen. Our state machine acts as an overlay that guides them to the correct buttons, intercepts wrong keys, and provides feedback.

This replaces the V1 mid-fidelity renderer with the real thing.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  System 7 Mac UI Shell (Chicago font, bevels)   │
├─────────────────────────────────────────────────┤
│  Track 1: Pattern Recognition                    │
│  ┌─────────────────────────────────────────────┐ │
│  │ AP-style problem stem + 4 procedure choices │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  Track 2: Calculator Navigation                  │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ CEmu WASM    │  │ Overlay                │   │
│  │ (real ROM)   │  │ - Narration bar        │   │
│  │              │  │ - Step counter         │   │
│  │ Canvas LCD   │  │ - Error feedback       │   │
│  │ 320x240      │  │ - Key highlight        │   │
│  └──────────────┘  └────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Virtual Keypad                               │ │
│  │ (clicks route to CEmu via WASM bridge)       │ │
│  │ (state machine intercepts wrong keys)        │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  Session Dashboard (collapsible)                 │
│  Due: 5 | New: 2 | Mastery: 72%                │
└─────────────────────────────────────────────────┘
```

## Phase 1: Build CEmu WASM

### 1.1 Clone and compile

```bash
git clone https://github.com/CE-Programming/CEmu.git
cd CEmu/core

# Install Emscripten SDK if not present
# https://emscripten.org/docs/getting_started/downloads.html

# Build using the existing emscripten makefile
make -f emscripten.mk
```

The build should produce `WebCEmu.js` and `WebCEmu.wasm` (or similar). If `emscripten.mk` needs modifications, document what you changed.

### 1.2 Export keypad input

The existing `os-emscripten.c` exports `lcd_get_frame()` but NOT keypad input. Add this export to `os-emscripten.c`:

```c
#include "../../core/keypad.h"

void EMSCRIPTEN_KEEPALIVE emsc_keypad_event(int row, int col, int pressed) {
    keypad_key_event(row, col, (bool)pressed);
}
```

The TI-84 CE keypad is a matrix with rows 0-7 and cols 0-7. The mapping from key names to (row, col) pairs is in `core/keypad.c` or `core/keypad.h`. Document the full mapping.

### 1.3 Optimize output size

Use these Emscripten flags:
```
-Oz -flto --closure 1 -s MINIFY_WASM_IMPORTS=1
```

Target: < 2MB gzipped for the WASM binary.

### 1.4 ROM loading

The existing `main()` in `os-emscripten.c` loads `CE.rom` from the Emscripten virtual filesystem:
```c
success = emu_load(EMU_DATA_ROM, "CE.rom");
```

The JS bridge should:
1. On first launch: show a file picker for the student to select their ROM file
2. Write the ROM to Emscripten's FS: `Module.FS.writeFile('CE.rom', romData)`
3. Store the ROM in IndexedDB for subsequent launches
4. On subsequent launches: load ROM from IndexedDB automatically

## Phase 2: JavaScript Bridge Layer

### 2.1 LCD rendering

```javascript
// Get LCD framebuffer pointer from WASM
const framePtr = Module._lcd_get_frame();
// Create typed array view into WASM memory (320x240 RGBA)
const frame = new Uint32Array(Module.HEAPU32.buffer, framePtr, 320 * 240);
// Render to canvas at 60fps
const ctx = canvas.getContext('2d');
const imageData = ctx.createImageData(320, 240);

function renderFrame() {
  const framePtr = Module._lcd_get_frame();
  const frame = new Uint32Array(Module.HEAPU32.buffer, framePtr, 320 * 240);
  for (let i = 0; i < 320 * 240; i++) {
    const pixel = frame[i];
    imageData.data[i * 4 + 0] = (pixel >> 16) & 0xFF; // R
    imageData.data[i * 4 + 1] = (pixel >> 8) & 0xFF;  // G
    imageData.data[i * 4 + 2] = pixel & 0xFF;          // B
    imageData.data[i * 4 + 3] = 255;                    // A
  }
  ctx.putImageData(imageData, 0, 0);
  requestAnimationFrame(renderFrame);
}
```

### 2.2 Keypad input

```javascript
// Map our key IDs to CEmu (row, col) pairs
const KEY_TO_RC = {
  "STAT": [2, 6],    // verify from keypad.c
  "ENTER": [6, 0],
  "RIGHT": [0, 2],
  "LEFT": [0, 1],
  "UP": [0, 3],
  "DOWN": [0, 0],
  "2ND": [0, 5],
  "ALPHA": [0, 7],
  "CLEAR": [1, 6],
  // ... complete mapping from keypad.c
};

function sendKey(keyId) {
  const [row, col] = KEY_TO_RC[keyId];
  Module._emsc_keypad_event(row, col, 1); // press
  setTimeout(() => {
    Module._emsc_keypad_event(row, col, 0); // release
  }, 80);
}
```

### 2.3 State machine integration

The state machine overlay does NOT drive the screen — the ROM does. The overlay:
1. Knows which procedure step we're on (from `ti84-procedures-data.json`)
2. Knows which key is correct at this step
3. Intercepts clicks on the virtual keypad:
   - Correct key → pass to CEmu via `sendKey()`, advance step counter
   - Wrong key → block from CEmu, show error feedback, flash key red
4. Provides narration text for the current step
5. Highlights the correct key in guided mode

```javascript
function handleKeyClick(keyId) {
  const currentStep = procedures[currentProcId].steps[stepIndex];
  
  if (mode === 'guided') {
    if (keyId === currentStep.key) {
      sendKey(keyId);  // pass to CEmu
      stepIndex++;
      updateNarration();
      updateKeyHighlight();
    } else {
      showError(keyId, currentStep);
      flashKeyRed(keyId);
    }
  } else if (mode === 'recall') {
    if (keyId === currentStep.key) {
      sendKey(keyId);
      stepIndex++;
    } else {
      errors++;
      flashKeyRed(keyId);
    }
  }
}
```

## Phase 3: Pattern Recognition (Track 1)

### 3.1 Data source

Load `ti84-pattern-recognition-data.json` which contains:
- `patternSignatures` — what makes each procedure identifiable
- `confusionMatrix` — 22 confusable pairs with contrast explanations
- `canonicalProblems` — 62 problems across 27 procedures (2-3 each)
- `distractorSets` — 3 default distractors per procedure

### 3.2 Flow

```
Student opens app
  → Session queue pulls from Track 1 + Track 2 (interleaved)
  → Track 1 item:
      Show problem stem + 4 choices
      → Correct pick: transition to Track 2 walkthrough with problem values
      → Wrong pick: BRANCH
          Show contrast explanation
          Show canonical problem for the wrong procedure
          Do full walkthrough of the wrong procedure (via CEmu)
          Return to original question (wrong choice removed)
          → Repeat until correct
```

### 3.3 Branching detail

On wrong answer:
1. Show a System 7-style dialog: "That would be [WrongProcedure]. Here's what a [WrongProcedure] problem looks like:"
2. Show the canonical problem for the wrong procedure
3. Transition CEmu to the correct starting point for the wrong procedure
4. Student walks through the FULL procedure on the real calculator (guided mode)
5. After completing the branch walkthrough, return to the original question
6. Remove the wrong choice from the options
7. Credit the branched-into procedure in SRS (Track 1: quality 2, Track 2: guided completion)

Branching is UNLIMITED. A student who picks wrong 3 times does 3 full walkthroughs before reaching the correct answer. The time cost is the incentive to learn.

### 3.4 SRS for Track 1

Same SM-2 algorithm as Track 2, but independent state:

| Event | Quality |
|-------|---------|
| Correct on first try | 5 |
| Correct after 1 branch | 3 |
| Correct after 2 branches | 1 |
| Correct after 3 branches | 0 |
| Branched-into procedure (passive) | 2 |

## Phase 4: System 7 Mac UI

### 4.1 Visual references

See `ap_stats_roadmap_square_mode.html` in this repo for the existing System 7 aesthetic:
- **Font**: Chicago (headings), Geneva (body). Use web-safe fallbacks: `"Chicago", "Geneva", "Helvetica Neue", sans-serif`
- **Colors**: Platinum gray (#C0C0C0) backgrounds, white window content areas, black text
- **Borders**: 1px black outlines, beveled buttons (light top-left, dark bottom-right)
- **Title bars**: Horizontal stripes, close box, window title centered
- **Scrollbars**: Classic Mac scrollbar style

### 4.2 Window layout

The app is a single "window" in the System 7 style:

```
┌─┬────────────────────────────────────────────┬─┐
│▫│     TI-84 Procedural Trainer               │ │
├─┴────────────────────────────────────────────┴─┤
│                                                 │
│  [Problem stem or calculator view here]         │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  Narration / instruction bar            │   │
│  │  Step 3 of 7          [Hint] [Restart]  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  Virtual keypad (when in Track 2)       │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Due: 5 | New: 2 | Mastery: 72% | [Unit: All] │
└─────────────────────────────────────────────────┘
```

### 4.3 Progressive disclosure

- **First launch**: ROM file picker in a System 7 dialog ("Please locate your TI-84 Plus CE ROM file")
- **Session start**: Just the problem stem and choices. Calculator is hidden.
- **After correct identification**: Calculator fades in below the problem, keypad appears
- **During walkthrough**: Problem stem minimizes to a thin bar at top showing context
- **Between items**: Brief "Nice!" feedback, then next item from queue

### 4.4 Mobile layout

Stack vertically: problem → screen → keypad → dashboard. Use CSS `@media (max-width: 768px)`.

## File Structure

```
ti84-trainer-v2/
├── index.html              # Main app (loads everything)
├── style.css               # System 7 Mac styling
├── app.js                  # App logic (pattern recognition, SRS, UI)
├── bridge.js               # CEmu WASM bridge (LCD rendering, keypad input)
├── state-machine.js        # Adapted from ti84-state-machine.js
├── data/
│   ├── procedures.json     # From ti84-procedures-data.json
│   └── patterns.json       # From ti84-pattern-recognition-data.json
├── wasm/
│   ├── WebCEmu.js          # Emscripten glue code
│   └── WebCEmu.wasm        # CEmu WASM binary
└── build.mjs               # Script to bundle into single HTML (optional)
```

Note: For distribution, a `build.mjs` script can inline everything into a single HTML file. But during development, keep files separate.

## Data Files to Read

| File | Embed in app |
|------|-------------|
| `ti84-procedures-data.json` | Yes — procedures, screens, micro-skills, common errors |
| `ti84-pattern-recognition-data.json` | Yes — canonical problems, confusion matrix, distractors |
| `ti84-state-machine.js` | Yes — adapt for overlay logic |
| `ti84-trainer-spec.md` | Reference — SRS algorithm, interaction design |
| `ti84-trainer-pattern-recognition-spec.md` | Reference — branching flow, SRS Track 1 |
| `ap_stats_roadmap_square_mode.html` | Reference — System 7 CSS patterns |

## Verification

1. CEmu WASM builds and ROM boots in browser
2. LCD renders at 60fps on canvas
3. Keypad clicks reach CEmu and produce correct screen changes
4. State machine correctly identifies right/wrong keys for all 27 procedures
5. Pattern recognition flow works: problem → choice → branch or walkthrough
6. Branching: wrong pick → contrast → full walkthrough → return to question
7. SRS persists in localStorage across page reloads
8. System 7 aesthetic is consistent and polished
9. Mobile layout is usable
10. ROM loads from IndexedDB on subsequent visits

## Constraints

- CEmu is GPLv3 — our usage must comply (we're building an educational tool, not redistributing the emulator commercially)
- ROM is not bundled — students provide their own
- Must work offline after initial ROM load
- Target browsers: Chrome, Edge, Firefox (recent versions)
- WASM binary should be < 3MB gzipped

## Priority Order

If time is limited, ship in this order:
1. CEmu WASM build + LCD rendering + keypad input (the core)
2. State machine overlay (guided mode with correct/wrong key handling)
3. Pattern recognition flow (Track 1 with branching)
4. System 7 UI polish
5. SRS scheduling
6. Mobile layout
