# Codex Task: Integrate Native TI-84 Module into Trainer App

## Context

We have a TI-84 Plus CE procedural trainer (`ti84-trainer-v2/standalone.html`) that currently uses CEmu WASM to run a real ROM in the browser. We've built a native JavaScript reimplementation of the TI-84's stat functionality (`ti84-trainer-v2/native/`) that covers all 27 AP Stats procedures — 276 tests passing.

Your job: wire the native module into the trainer app as the **default backend** (no ROM needed, instant boot), with CEmu as an optional upgrade when a ROM is loaded.

## Files to Read First

1. `ti84-native-integration-spec.md` — Full spec with all 9 integration points, code examples, and verification steps
2. `ti84-trainer-v2/standalone.html` — The trainer app (4200+ lines). Key sections:
   - Lines ~2060-2520: `bridge.js` (CEmu WASM bridge) inlined as an IIFE
   - Lines ~2530-2620: `BUTTONS`, `BUTTON_META`, `BUTTON_TO_ENGINE` keypad data
   - Lines ~2800: `app` state object with `bridgeStatus`, `bridge`
   - Lines ~3280-3300: `startWalkthrough()` — calls `bridge.prepareHome()`
   - Lines ~3535-3545: `advanceStep()` — calls `bridge.typeValue()` and `bridge.sendButton()`
   - Lines ~3850-3870: status bar rendering using `bridgeStatus`
   - Lines ~3920-3960: ROM dialog rendering
   - Lines ~3995-4000: `attachBridge()` and canvas mounting
   - Lines ~4040-4050: `updateMockCanvas()`
   - Lines ~4175-4200: `attachBridge()`, `init()`
3. `ti84-trainer-v2/native/ti84-native.js` — The native orchestrator (bridge-compatible API)
4. `ti84-trainer-v2/native/*.js` — All 8 native module files

## What to Do

### Step 1: Inline the native module into standalone.html

Add all 9 native module files as inline `<script>` blocks BEFORE the existing app IIFE. They must load in this order:

```
event-bus.js → stat-math.js → menu-tables.js → field-tables.js → 
menu-nav.js → form-engine.js → result-formatter.js → screen-renderer.js → ti84-native.js
```

Read each file from `ti84-trainer-v2/native/` and inline it. Each is an IIFE that sets a `window.*` global.

### Step 2: Add a backend wrapper function

Add a `createBackend(options)` function AFTER the bridge IIFE and native module scripts, BEFORE the app IIFE. This wrapper unifies the native and CEmu backends behind a single API.

The wrapper should:
- Create both a native calc (`TI84Native.create()`) and a CEmu bridge (`createBridge()`)
- Default to native backend (active immediately, no ROM needed)
- Expose the same API the app already uses: `init()`, `sendButton()`, `prepareHome()`, `getStatus()`, `isRealEmulator()`, `selectRomFile()`, `clearStoredRom()`, `mountCanvas()`, `setMockLines()`, `typeValue()`
- Add: `isNative()`, `getScreen()`, `getWizardValues()`, `on()`, `off()`, `setList()`, `getList()`, `switchToCemu()`, `switchToNative()`
- When `selectRomFile(file)` is called and CEmu boots successfully, switch to CEmu backend
- When `clearStoredRom()` is called, switch back to native
- In native mode: `sendButton()` calls `native.pressKey()` synchronously (wrap in resolved promise for async compat), `prepareHome()` calls `native.reset()`
- In native mode: `typeValue(value)` converts each character to a key press using the CHAR_TO_BUTTON map from bridge.js and calls `native.pressKey()` for each

See `ti84-native-integration-spec.md` sections 2-3 for detailed API design.

### Step 3: Replace bridge usage with backend

In the app IIFE:
- Change `attachBridge()` to `attachBackend()` — use `createBackend()` instead of `createBridge()`
- The app still uses `app.bridge` as the variable name (to minimize changes), but it now points to the backend wrapper
- Remove the `onStatus` callback that opens the ROM dialog on `needs-rom` — native mode doesn't need a ROM
- In `init()`: after `app.bridge.init()`, the status will be `{ code: 'ready', detail: 'Native mode', usingMock: false }` immediately

### Step 4: Update mock canvas / LCD rendering

- In native mode: the ScreenRenderer draws to the canvas on every `pressKey()`. Remove the mock canvas rendering for native mode.
- Keep the `updateMockCanvas()` function but make it check `app.bridge.isNative()` — if native, skip the mock lines (the native renderer handles the canvas)
- When the native backend processes a key, it renders the current screen. The canvas should show actual TI-84-like screens (menus, wizards, results) instead of the green mock text.
- When starting a walkthrough in native mode, after `prepareHome()`, call the native renderer to show the home screen on the canvas.

### Step 5: Update status bar

- When native: show "Native" status pill (use a blue/accent color)
- When CEmu: show "CEmu" status pill (keep existing green)
- Remove "Mock screen" pill when in native mode — it's a real implementation
- Update `bridgeStatusLabel()` function

### Step 6: Update ROM dialog

- Don't auto-open the ROM dialog on init — native mode works without it
- ROM dialog message: explain that native mode is active and works for all AP Stats procedures. Loading a ROM enables pixel-perfect CEmu rendering.
- "Clear ROM" button should switch back to native and close the dialog

### Step 7: Seed list data for walkthroughs

In `startWalkthrough()`, after calling `prepareHome()`, seed the native module's lists with the problem's sample data:

```javascript
if (app.bridge.isNative?.() && app.walkthrough.problem?.data) {
  const data = app.walkthrough.problem.data;
  Object.entries(data).forEach(([key, values]) => {
    if (key.match(/^L\d$/)) app.bridge.setList(key, values);
  });
}
```

Also check the procedure's `assumeDataIn` field — some procedures assume data is in L1. If the problem has a `data` field with a raw array, set L1 to that.

### Step 8: Update index.html (dev entry point)

Add `<script src="native/...">` tags for all 9 native module files in the correct load order, before the app.js script tag.

## What NOT to Do

- Do NOT modify any files in `ti84-trainer-v2/native/` — they are done and tested
- Do NOT remove bridge.js — it's still needed for CEmu mode
- Do NOT change the keypad layout, button metadata, or CSS
- Do NOT break the existing walkthrough flow — the same `sendButton()` / `typeValue()` calls should work identically
- Do NOT remove ROM loading capability — CEmu is an optional upgrade, not removed
- Do NOT add new npm dependencies

## Output Files

1. **`ti84-trainer-v2/standalone.html`** — Modified with inlined native modules + backend wrapper + all integration changes
2. **`ti84-trainer-v2/index.html`** — Modified with script tags for native modules

## Verification Checklist

After your changes:

1. `standalone.html` opens in browser (with local server) → shows "Native" status, LCD canvas renders home screen, no ROM dialog
2. Click a procedure → walkthrough starts, each key press updates the LCD canvas with native rendering
3. Complete a walkthrough → verify all steps work, result screen shows computed values
4. Click ROM button → ROM dialog opens, explains native vs CEmu
5. Load a ROM → switches to CEmu, LCD shows real ROM output, status changes to "CEmu"
6. Clear ROM → switches back to native mode
7. The file `standalone.html` is self-contained — all native module code is inlined
8. Existing tests still pass: `cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js`
