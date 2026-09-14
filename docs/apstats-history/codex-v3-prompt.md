# Codex Task: TI-84 Trainer V3 — CEmu Primary + Native State Machine + Accurate Skin

## Context

We have a TI-84 Plus CE procedural trainer (`ti84-trainer-v2/`) with two backends:
- **CEmu WASM** (`bridge.js` + `wasm/WebCEmu.js`) — runs the real TI-84 ROM in the browser
- **Native JS port** (`native/*.js`) — pure JS reimplementation, 354 tests passing

Currently the app defaults to the native backend and optionally upgrades to CEmu when a ROM is loaded. **We're inverting this**: CEmu becomes the primary UI (students always see the real emulated calculator), and the native port becomes a background state machine that validates keystrokes.

Read `ti84-v3-spec.md` for the full architecture. Read `84plusCE.webp` for the physical calculator appearance.

## What to Build

### 1. Supabase ROM Auto-Loader

Replace the ROM file picker with automatic download from a Supabase storage bucket.

**In `bridge.js` (or a new `rom-loader.js` section inlined in standalone.html):**

```javascript
const ROM_CONFIG = {
  supabaseUrl: '', // placeholder — user will fill in their project URL
  bucketPath: 'ti84-trainer-assets/ROM.rom',
  cacheKey: 'ce-rom',
  cacheVersion: '5.8.2.0029',
};
```

**Load sequence in the `init()` function:**
1. Check IndexedDB for cached ROM (same `ti84-trainer-v2` database, `assets` store, key `ce-rom`)
2. If found AND version matches → boot CEmu immediately
3. If not found → fetch from Supabase URL
   - Show a progress bar/status: "Downloading calculator firmware… X%"
   - Store the downloaded bytes + version in IndexedDB
   - Boot CEmu
4. On fetch error → fall back to native-only mode with a message: "Could not load calculator firmware. Using simplified mode."

The Supabase URL will be empty initially — add a config constant at the top of the app that the user fills in. When the URL is empty, fall back to the existing file-picker behavior so the app still works during development.

**Remove the auto-opening ROM dialog.** The ROM dialog should only appear if:
- Supabase URL is not configured AND no cached ROM exists
- Or the user explicitly clicks a settings/ROM button

### 2. Parallel Backend Wiring (CEmu + Native)

Both backends run simultaneously. CEmu renders; native validates.

**Key press flow:**

```javascript
function handleKeyPress(buttonId) {
  // 1. Check with native state machine: is this the expected key?
  const currentScreen = native.getScreen();
  const expectedKey = walkthrough.getCurrentExpectedKey();
  
  if (walkthrough.mode === 'guided' && buttonId !== expectedKey) {
    // Wrong key — block it, don't send to CEmu
    flashButton(buttonId, 'wrong');
    showFeedback(walkthrough.getErrorFeedback(buttonId));
    return;
  }
  
  // 2. Correct key (or recall mode) — send to BOTH backends
  native.pressKey(buttonId);           // update state machine
  await bridge.sendButton(buttonId);   // execute on real calculator
  
  // 3. Advance walkthrough
  advanceStep();
}
```

**For parameter steps** (typing values into wizard fields):
```javascript
if (stepIsParameter(step)) {
  const value = getSampleValue(step);
  // Type into CEmu
  await bridge.typeValue(value);
  // Type into native (individual key presses)
  for (const char of String(value)) {
    const key = CHAR_TO_KEY[char];
    if (key) native.pressKey(key);
  }
}
```

**The native port NEVER renders to the LCD canvas.** Remove any native canvas rendering. The LCD canvas is exclusively owned by CEmu's render loop.

**Keep native's event hooks available** for future use (field-focus, compute events) but don't wire them to UI yet.

### 3. Reset on Every New Problem

When starting a new walkthrough or switching procedures:

```javascript
async function startWalkthrough(procedureId, problem) {
  // 1. Reset CEmu to home screen
  await bridge.prepareHome();
  
  // 2. Reset native state machine
  native.reset();
  
  // 3. Seed list data if needed
  if (procedure.assumeDataIn && problem?.data) {
    // Seed native
    Object.entries(problem.data).forEach(([key, values]) => {
      if (key.match(/^L\d$/)) native.setList(key, values);
    });
    // Seed CEmu — type data into L1 via STAT>EDIT
    // For now, skip CEmu data seeding (complex key sequence)
    // Students will be told data is "already entered"
  }
  
  // 4. Both backends synchronized at HOME screen
}
```

### 4. Calculator Skin CSS

The virtual keypad must visually match the physical TI-84 Plus CE EZ-Spot model shown in `84plusCE.webp`. This is the most visually important change.

**Reference `84plusCE.webp` for exact colors.** Key observations from the photo:

**Calculator body:**
- Dark charcoal/graphite gray body
- Yellow/gold bezel around the LCD screen
- "TI-84 Plus CE" branding above LCD

**Key zones (top to bottom):**

1. **Function row** — y=, window, zoom, trace, graph
   - Near-black keys, white labels
   - Yellow "2nd function" labels ABOVE the keys (stat plot f1, tblset f2, format f3, calc f4, table f5)

2. **Modifier rows + D-pad**
   - 2nd: light blue key
   - alpha: bright green key
   - mode, del, x,t,θ,n, stat: dark keys
   - D-pad: silver/light gray circular cross, separate from the key grid

3. **Command row** — math, apps, prgm, vars, clear
   - Dark keys, white labels
   - Green alpha labels on right side (A, B, C)
   - Yellow 2nd labels above (test, angle, draw, distr)

4. **Trig/math rows** — x⁻¹, sin, cos, tan, ^, x², etc.
   - Dark keys

5. **Number pad** — 7,8,9 / 4,5,6 / 1,2,3 / 0,.,(-) 
   - WHITE keys, BLACK text, noticeably larger than other keys
   - Yellow 2nd labels above (u,v,w / L4,L5,L6 / L1,L2,L3 / catalog,i,ans)
   - Green alpha labels (O,P,Q / T,U,V / Y,Z,θ / space,:,?)

6. **Operator column** (rightmost) — ÷, ×, −, +, enter
   - Medium gray keys
   - enter key is slightly larger

**CSS color variables:**

```css
:root {
  --calc-body: #4a4d52;
  --calc-bezel: #f5c518;
  --key-dark: #3a3d42;
  --key-2nd: #5ba4cf;
  --key-alpha: #6fbf4a;
  --key-number: #e8e8e8;
  --key-operator: #b8b8b8;
  --key-dpad: #c8c8c8;
  --label-primary: #ffffff;
  --label-2nd: #5ba4cf;
  --label-alpha: #6fbf4a;
  --label-number: #000000;
  --lcd-bg: #ffffff;
}
```

**Key rendering — each key shows 3 layers of text:**
1. **2nd function** (above the key, not on it): small blue text
2. **Main label** (center of key): white text (or black for number keys)
3. **Alpha label** (right edge of key): small green text

**D-pad** should be rendered as a circular element, not 4 separate square buttons. Use CSS border-radius and positioning to create the cross shape within a circle, matching the silver physical D-pad.

**Highlighted key (next correct key in guided mode):**
- Pulsing yellow/gold border (matches the calculator's yellow bezel theme)
- `@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(245,197,24,0.7); } 70% { box-shadow: 0 0 0 8px rgba(245,197,24,0); } }`

**Key feedback flashes:**
- Correct: brief green glow
- Wrong: brief red glow

### 5. Update Status Bar

Replace the current status indicators:
- Remove "Native" / "CEmu" / "Mock screen" labels
- Show simple status: "Calculator Ready" (green dot) or "Loading…" (spinner) or "Offline Mode" (yellow dot, native fallback)

### 6. Update index.html (dev entry point)

Add script tags for native modules (if not already present from V2 integration). Ensure native loads before app.js.

## Files to Modify

| File | Changes |
|------|---------|
| `ti84-trainer-v2/standalone.html` | ROM auto-loader, parallel wiring, new keypad CSS/HTML, reset on new problem, status bar update |
| `ti84-trainer-v2/app.js` | Same logic changes as standalone (for module version) |
| `ti84-trainer-v2/style.css` | Calculator skin CSS — full restyle of keypad to match photo |
| `ti84-trainer-v2/bridge.js` | Add Supabase fetch to init(), keep file picker as fallback |
| `ti84-trainer-v2/index.html` | Script tags, layout updates if needed |

## Files NOT to Modify

- `ti84-trainer-v2/native/*.js` — all 9 native module files stay as-is
- `ti84-trainer-v2/wasm/*` — CEmu WASM files stay as-is
- `ti84-procedures-data.json` — procedure data stays as-is
- Test files — existing 354 tests must continue passing

## Implementation Order

This can be done as a single agent since the changes are tightly coupled:
1. First: CSS skin (biggest visual change, can be tested immediately)
2. Second: Supabase ROM loader (replaces file picker)
3. Third: Parallel wiring (native validates, CEmu executes)
4. Fourth: Reset on new problem
5. Fifth: Status bar cleanup

## Testing

After your changes:

1. **Skin test**: Open standalone.html — keypad should visually match 84plusCE.webp. Compare side by side.
2. **ROM auto-load**: With Supabase URL configured, ROM downloads and caches on first visit. Second visit loads from cache instantly.
3. **ROM fallback**: With empty Supabase URL, existing file picker behavior works.
4. **Parallel operation**: Start a walkthrough. Correct key → CEmu executes + native advances. Wrong key → blocked, feedback shown.
5. **Reset**: Switch between procedures — CEmu returns to home screen each time.
6. **Existing tests**: `cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js` → 354 passing.

## Important Notes

- The Supabase URL constant should be empty by default (`''`). The user will fill it in after setting up their Supabase bucket. When empty, the app should fall back gracefully to the file picker or native-only mode.
- The CEmu global stubs (emul_is_inited, initFuncs, etc.) from the earlier fix MUST be preserved — they're needed for CEmu WASM to boot.
- The `.gitattributes` marking `.wasm` and `.rom` as binary MUST be preserved.
- Keep the `TI84V2_ASSET_BASE` mechanism for locating WASM files.
- The build script (`build.mjs`) needs to include the skin CSS changes in the standalone build.
