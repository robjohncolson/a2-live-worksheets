# Native Module Integration — Spec

**Goal**: Wire `ti84-native.js` into the trainer app so it works as the default backend (no ROM needed), with CEmu as an optional upgrade when a ROM is loaded.

---

## Current Architecture

The trainer app (`standalone.html`) uses a **bridge** abstraction to talk to the calculator:

```
app.bridge = createBridge(options)    // CEmu WASM bridge
app.bridge.init()                     // loads ROM from IndexedDB
app.bridge.sendButton(buttonId)       // sends key to CEmu
app.bridge.prepareHome()              // resets to home screen
app.bridge.isRealEmulator()           // true if ROM loaded
app.bridge.getStatus()                // { code, detail, usingMock, romMeta }
app.bridge.selectRomFile(file)        // load ROM from file picker
app.bridge.setMockLines(lines, footer) // update mock LCD display
app.bridge.mountCanvas(canvas)        // attach LCD canvas
app.bridge.typeValue(value)           // type digits into CEmu
```

When CEmu can't load (no ROM, WASM fails), the bridge falls back to **mock mode** — a green LCD showing text lines. The trainer still works but without real calculator rendering.

## Target Architecture

```
┌─────────────────────────────────────────────────┐
│  Trainer App                                    │
│                                                 │
│  app.backend = nativeBackend OR cemuBackend     │
│  app.backend.sendButton(key)                    │
│  app.backend.getScreen()     ← native only      │
│  app.backend.on('compute')   ← native only      │
│                                                 │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ NativeBackend│    │ CEmuBackend          │   │
│  │ (default)    │    │ (optional, ROM-based)│   │
│  │              │    │                      │   │
│  │ ti84-native  │    │ bridge.js + WASM     │   │
│  │ No ROM needed│    │ Needs ROM file       │   │
│  │ Event hooks  │    │ Pixel-perfect LCD    │   │
│  │ Instant boot │    │ Slower boot          │   │
│  └──────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Integration Points (what to change in standalone.html)

### 1. Load native module scripts

The native module is 8 JS files that need to be loaded before the app IIFE. They're all IIFEs that set `window.*` globals. Load order matters:

```
event-bus.js        → window.TI84EventBus
stat-math.js        → window.TI84StatMath
menu-tables.js      → window.TI84MenuTables
field-tables.js     → window.TI84FieldTables
menu-nav.js         → window.TI84MenuNav
form-engine.js      → window.TI84FormEngine
result-formatter.js → window.TI84ResultFormatter
screen-renderer.js  → window.TI84ScreenRenderer
ti84-native.js      → window.TI84Native
```

For `standalone.html`: inline all 8 files into `<script>` tags before the app IIFE, in the order above. For `index.html`: add `<script src="native/...">` tags.

### 2. Create a unified backend wrapper

Replace the direct `createBridge()` usage with a backend abstraction that wraps either native or CEmu:

```javascript
function createBackend(canvas, options) {
  const native = window.TI84Native?.create(canvas);
  const cemu = createBridge(options);
  
  let activeBackend = 'native';  // default to native
  let current = native;
  
  return {
    // Unified API (works for both)
    async init() {
      await native.init();
      // Also try CEmu in background — if ROM exists, it'll be ready for switch
      cemu.init().catch(() => {});
      return true;
    },
    
    mountCanvas(canvas) {
      current.mountCanvas(canvas);
    },
    
    async sendButton(buttonId, holdMs) {
      if (activeBackend === 'native') {
        current.pressKey(buttonId);
        return true;
      }
      return current.sendButton(buttonId, holdMs);
    },
    
    async prepareHome() {
      if (activeBackend === 'native') {
        current.reset();
        return true;
      }
      return current.prepareHome();
    },
    
    async typeValue(value) {
      if (activeBackend === 'native') {
        // Type each character as key presses
        for (const char of String(value)) {
          const key = charToButton(char);
          if (key) current.pressKey(key);
        }
        return true;
      }
      return current.typeValue(value);
    },
    
    // Backend switching
    async switchToCemu(romFile) {
      await cemu.selectRomFile(romFile);
      if (cemu.isRealEmulator()) {
        activeBackend = 'cemu';
        current = cemu;
        current.mountCanvas(canvas);
        return true;
      }
      return false;
    },
    
    switchToNative() {
      activeBackend = 'native';
      current = native;
      return true;
    },
    
    // Status
    isRealEmulator() { return activeBackend === 'cemu' && cemu.isRealEmulator(); },
    isNative() { return activeBackend === 'native'; },
    getStatus() {
      if (activeBackend === 'native') {
        return { code: 'ready', detail: 'Native mode — no ROM needed', usingMock: false, romMeta: null };
      }
      return cemu.getStatus();
    },
    getBackendType() { return activeBackend; },
    
    // Native-only features (no-op on CEmu)
    getScreen() { return activeBackend === 'native' ? native.getScreen() : null; },
    getWizardValues() { return activeBackend === 'native' ? native.getWizardValues() : null; },
    on(event, cb) { if (native) native.on(event, cb); },
    off(event, cb) { if (native) native.off(event, cb); },
    
    // List/matrix management (native only, needed for data-based procedures)
    setList(name, data) { native.setList(name, data); },
    getList(name) { return native.getList(name); },
    setMatrix(name, data) { native.setMatrix(name, data); },
    
    // CEmu-specific (passthrough)
    selectRomFile(file) { return this.switchToCemu(file); },
    clearStoredRom() { 
      cemu.clearStoredRom();
      this.switchToNative();
    },
    setMockLines(lines, footer) { cemu.setMockLines(lines, footer); },
    
    destroy() { 
      native.destroy?.();
      cemu.destroy?.();
    },
  };
}
```

### 3. Update app initialization (attachBridge → attachBackend)

**Before:**
```javascript
function attachBridge() {
  app.bridge = createBridge({ onStatus(status) { ... } });
}
async function init() {
  attachBridge();
  bindEvents();
  render();
  await app.bridge.init();
  app.bridgeStatus = app.bridge.getStatus();
  updateMockCanvas();
  render();
}
```

**After:**
```javascript
function attachBackend() {
  const canvas = document.getElementById('calc-canvas');
  app.bridge = createBackend(canvas, {
    onStatus(status) {
      app.bridgeStatus = status;
      if (status.code === 'needs-rom') {
        // Don't auto-open ROM dialog — native mode works fine
      }
      render();
    },
  });
}
async function init() {
  attachBackend();
  bindEvents();
  render();
  await app.bridge.init();
  app.bridgeStatus = app.bridge.getStatus();
  render();
}
```

### 4. Update LCD canvas rendering

**Native mode**: The native module's ScreenRenderer draws directly to the canvas. No mock screen needed — the native module renders real TI-84-like screens.

**CEmu mode**: CEmu's render loop draws the real LCD. Same as before.

The `updateMockCanvas()` function should check the backend type:
- If native: let the native renderer handle it (it renders on every `pressKey()`)
- If CEmu mock: show the existing mock lines

### 5. Update ROM dialog behavior

Currently the ROM dialog opens automatically when CEmu can't find a ROM. With native mode as default, the ROM dialog should only open when the user explicitly requests it (via the ROM button).

The ROM dialog should explain: "Native mode is active — all procedures work without a ROM. Load a ROM for pixel-perfect CEmu rendering."

When a ROM is loaded: switch to CEmu backend. When ROM is cleared: switch back to native.

### 6. Update status display

The status bar currently shows "Mock mode" / "ROM ready". Update for native:

```javascript
function bridgeStatusLabel() {
  if (app.bridge.isNative()) return 'Native';
  if (app.bridge.isRealEmulator()) return 'CEmu';
  return 'Loading';
}
```

Remove the "Mock screen" pill when in native mode — it's not mock, it's a real implementation.

### 7. Handle typeValue for native mode

The current code calls `app.bridge.typeValue(value)` for parameter steps (entering numbers into wizard fields). The native backend needs to translate this into individual key presses:

```javascript
const CHAR_TO_KEY = {
  '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
  '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE',
  '.': 'DECIMAL', '-': 'NEGATIVE', ',': 'COMMA',
};
```

### 8. Wire native event hooks for enhanced training

When in native mode, the trainer can subscribe to events for richer feedback:

```javascript
if (app.bridge.isNative()) {
  app.bridge.on('field-focus', ({ fieldLabel }) => {
    // Could highlight which field the student should fill next
  });
  app.bridge.on('compute', ({ type, results }) => {
    // Could show computation results alongside the walkthrough
  });
}
```

This is optional for the initial integration — the basic walkthrough works without it. But it enables future UX improvements.

### 9. Seed list data for procedures

Many procedures assume data is already in L1 (or L1+L2). The walkthrough's `problem.values` already has sample data. Before starting a walkthrough, seed the native module's lists:

```javascript
// In startWalkthrough(), after prepareHome:
if (app.bridge.isNative() && app.walkthrough.problem?.data) {
  const data = app.walkthrough.problem.data;
  if (data.L1) app.bridge.setList('L1', data.L1);
  if (data.L2) app.bridge.setList('L2', data.L2);
}
```

---

## Files to Modify

1. **`standalone.html`** — inline native module scripts, replace bridge with backend wrapper, update init/ROM dialog/status display
2. **`app.js`** — same changes for the module version
3. **`index.html`** — add `<script>` tags for native module files

## Files NOT to Modify

- All `ti84-trainer-v2/native/*.js` files — already built and tested
- `bridge.js` — kept as-is, wrapped by the backend abstraction
- `style.css` — no changes needed
- Tests — existing tests should continue passing

## Verification

After integration:
1. Open standalone.html WITHOUT a local server — native mode should work (no dynamic import needed)
2. Open with server — same behavior, plus ROM button available
3. Load a ROM — should switch to CEmu backend, LCD shows real ROM output
4. Clear ROM — should switch back to native
5. Walk through a procedure — each key press should update the native LCD canvas
6. Complete a walkthrough — verify all steps work in native mode
