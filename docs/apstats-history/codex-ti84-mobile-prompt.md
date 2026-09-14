# Codex Prompt — TI-84 Trainer Mobile Layout

## Task

Implement mobile layout optimizations for the TI-84 Procedural Trainer V2. All changes scoped to a new `@media (max-width: 600px)` breakpoint. Must not break the existing desktop or tablet layouts.

## Spec

Read `ti84-mobile-layout-spec.md` in this directory for the full spec. Summary of changes:

### Files to modify

1. **`ti84-trainer-v2/style.css`** — Add a `@media (max-width: 600px)` block at the end (after the existing 768px block)
2. **`ti84-trainer-v2/app.js`** — Modify render functions for mobile-aware output

### CSS changes (style.css)

Add a new `@media (max-width: 600px)` block implementing:

```css
@media (max-width: 600px) {
  /* A. Full-bleed: remove window chrome */
  #app { padding: 0; }
  .trainer-window { border: 0; box-shadow: none; max-width: none; }
  .window-titlebar { display: none; }
  .workspace { padding: 0; gap: 0; }
  .banner-row { display: none; }

  /* B. Problem panel compact mode during walkthrough */
  .problem-panel.walkthrough-panel {
    padding: 10px 12px;
    border: 0;
    border-bottom: 1px solid rgba(0,0,0,0.12);
    box-shadow: none;
  }
  .problem-panel.walkthrough-panel .problem-stem,
  .problem-panel.walkthrough-panel .chip-row,
  .problem-panel.walkthrough-panel .walkthrough-copy,
  .problem-panel.walkthrough-panel .clutch-card,
  .problem-panel.walkthrough-panel .button-row {
    display: none;
  }
  .problem-panel.walkthrough-panel.expanded .problem-stem,
  .problem-panel.walkthrough-panel.expanded .chip-row,
  .problem-panel.walkthrough-panel.expanded .walkthrough-copy,
  .problem-panel.walkthrough-panel.expanded .clutch-card,
  .problem-panel.walkthrough-panel.expanded .button-row {
    display: revert;
  }

  /* C. Calculator panel fills viewport */
  .calc-panel {
    padding: 0;
    border: 0;
    box-shadow: none;
    height: calc(100dvh - 52px);
    height: calc(100vh - 52px); /* fallback */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .calc-top { display: none; }
  .calculator-branding { display: none; }
  .calculator-shell {
    border-radius: 0;
    padding: 8px 6px 6px;
    box-shadow: none;
  }

  /* D. LCD tighter chrome */
  .lcd-bezel { padding: 8px; border-radius: 16px; }
  .screen-frame { padding: 6px; border-radius: 10px; }
  .calc-canvas { border-radius: 8px; }

  /* E. Narration bar — sticky + compact */
  .narration-bar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    padding: 8px 10px;
    border-radius: 12px 12px 0 0;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .narration-copy strong {
    font-size: 0.88rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .narration-copy span { display: none; }

  /* F. Keypad — tighter spacing */
  .keypad-shell { padding: 6px 2px 2px; }
  .keypad-layout { gap: 6px; }
  .key-row { gap: 5px; }
  .key {
    min-height: 42px;
    padding: 8px 5px 6px;
    border-radius: 10px;
  }
  .key-modifier { min-height: 44px; }
  .key-large, .key-enter { min-height: 46px; }
  .key-label { font-size: 0.8rem; }
  .key-number .key-label { font-size: 1.2rem; }
  .key-operator .key-label { font-size: 1.1rem; }
  .key-secondary { font-size: 0.58rem; }
  .key-alpha-label { display: none; }
  .dpad-shell { width: min(100%, 120px); }
  .keypad-upper { gap: 8px; }

  /* G. Dashboard — compact */
  .dashboard-row {
    padding: 8px;
    gap: 8px;
    grid-template-columns: repeat(2, 1fr);
  }
  .dashboard-row.mobile-hidden { display: none; }

  /* H. Dialog — full-width */
  .dialog-window { width: 100%; max-height: 90vh; overflow-y: auto; }
  .dialog-backdrop { padding: 8px; }
}
```

### JS changes (app.js)

These are surgical changes to 3 render functions. Do NOT restructure the app — just add mobile-aware branches.

#### 1. Mobile detection helper

Add near the top of the file (after the `app` object initialization):

```javascript
function isMobileViewport() {
  return window.innerWidth <= 600;
}
```

#### 2. `renderWalkthroughPanel()` (around line 2263)

At the start of the function, add mobile compact mode. The panel HTML should include:
- A **compact header bar** always visible: procedure name + "Step N/M" + mode badge
- A click handler that toggles `.expanded` on the panel element
- When NOT expanded (default on mobile): the existing content below the header is hidden via CSS (see CSS above)
- When expanded: everything shows

Implementation approach:
```javascript
// Inside renderWalkthroughPanel(), near the top:
const mobile = isMobileViewport();

// The <section> tag should include an onclick for mobile:
// <section class="panel problem-panel walkthrough-panel" 
//   ${mobile ? 'onclick="this.classList.toggle(\'expanded\')"' : ''}>
```

The compact bar content (always visible) is the existing `.compact-problem-bar` div which already has procedure name and mode badge. Just add step counter text to it:

```javascript
// Inside the .compact-problem-bar, add step info:
const stepInfo = walkthrough ? `Step ${walkthrough.stepIndex + 1}/${walkthrough.steps.length}` : '';
// Render stepInfo next to the mode badge or procedure name
```

#### 3. `renderCalculatorColumn()` (around line 2473)

When `isMobileViewport()`:
- Narration bar action buttons should render as icon-only:
  - Firmware: `⚙` with `title="Firmware"`
  - Restart: `↺` with `title="Restart"`  
  - Hint: `?` with `title="Hint"`
  - Pause: `⏸` with `title="Pause guidance"`
  - Resume: `▶` with `title="Resume guidance"`

Implementation: wrap each button's text content in a conditional:
```javascript
const mobile = isMobileViewport();
// For each button:
// mobile ? '<span title="Hint">?</span>' : 'Hint'
```

Add CSS for mobile icon buttons:
```css
@media (max-width: 600px) {
  .narration-bar .button-row .mac-button {
    width: 36px;
    height: 36px;
    min-height: 36px;
    padding: 0;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
```

#### 4. `renderDashboard()` (around line 2554)

When mobile + walkthrough active, add `mobile-hidden` class:

```javascript
const dashHidden = isMobileViewport() && app.walkthrough ? ' mobile-hidden' : '';
return `<section class="dashboard-row${dashHidden}">...`;
```

#### 5. Re-render on resize

Add a debounced resize listener that triggers `render()` when crossing the 600px boundary:

```javascript
let wasMobile = isMobileViewport();
window.addEventListener('resize', () => {
  const nowMobile = isMobileViewport();
  if (nowMobile !== wasMobile) {
    wasMobile = nowMobile;
    render();
  }
});
```

Place this near the other event listeners (look for `addEventListener` calls).

### After changes

Rebuild the standalone bundle:
```bash
node ti84-trainer-v2/build.mjs
```

### What NOT to change

- Do not modify the keypad layout grid structure (5 columns for main rows, 3-column upper section)
- Do not modify the canvas dimensions (320x240) or aspect ratio (4:3)
- Do not touch the SRS, walkthrough engine, clutch system, or any state management
- Do not change the desktop or tablet (768px/960px) breakpoints
- Do not add new dependencies
- Do not restructure the render functions — add mobile branches, don't rewrite

### Testing

After implementation, verify:
1. Open `ti84-trainer-v2/standalone.html` in Chrome DevTools mobile emulation
2. Test iPhone SE (375x667): keys should be tappable, no horizontal overflow
3. Test iPhone 14 (390x844): LCD at top, narration sticky, scroll to lower keys
4. Test desktop (1440px wide): zero visual changes from current state
5. Start a walkthrough: problem panel collapses to compact bar, tap to expand
6. Pattern recognition (Track 1): problem panel stays full height
7. Dashboard hidden during walkthrough on mobile, visible on start screen
8. Narration buttons show as icons on mobile, full text on desktop

### Run tests

```bash
cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js
```

Tests validate the state machine and stat math, not the UI. But they must still pass after changes to confirm nothing was accidentally broken in app.js logic.
