# TI-84 Trainer V2 — Mobile Layout Spec

**Date**: 2026-04-09
**Target**: Phone screens (375-412px wide, 667-915px tall)
**Files to modify**: `ti84-trainer-v2/style.css`, `ti84-trainer-v2/app.js`
**Rebuild after**: `node ti84-trainer-v2/build.mjs`

---

## Problem

On a phone (e.g. iPhone 14: 390x844), the current layout stacks the full problem panel (~200-300px) above the full calculator (~870px). Total content height ~1100px in an ~794px usable viewport. Students must scroll past the walkthrough text to reach the calculator, then scroll again for lower keypad rows. The narration bar (which tells them what key to press) scrolls off screen.

## Design Principles

1. **Calculator fills the viewport** — minimal scrolling during a walkthrough
2. **Problem text collapses** — compact bar by default, tap to expand
3. **Narration stays visible** — sticky at bottom of calculator scroll area
4. **Keys stay touch-friendly** — 42px+ minimum tap target (Apple HIG: 44pt)
5. **Don't break desktop** — all changes scoped to `@media (max-width: 600px)`

---

## Breakpoint: `max-width: 600px`

### A. Full-bleed chrome removal

| Selector | Property | Value |
|----------|----------|-------|
| `#app` | padding | 0 |
| `.trainer-window` | border | 0 |
| `.trainer-window` | box-shadow | none |
| `.trainer-window` | max-width | none |
| `.window-titlebar` | display | none |
| `.workspace` | padding | 0 |
| `.workspace` | gap | 0 |

### B. Problem panel — compact walkthrough bar

During an active walkthrough (`.walkthrough-panel`), the problem panel collapses to a single-line bar:

```css
.problem-panel.walkthrough-panel {
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid rgba(0,0,0,0.12);
  box-shadow: none;
  cursor: pointer;
}
```

Content changes (JS):
- Show only: procedure name + step counter (e.g. "1-Var Stats  Step 4/12")
- Mode badge stays (Guided/Recall)
- Problem stem, value chips, walkthrough copy, clutch cards — hidden by default
- Tap the bar to toggle `.expanded` class which shows the full content
- During Track 1 (pattern recognition / question panel): keep full height (choices must be visible)

### C. Calculator panel — viewport-filling

| Selector | Property | Value |
|----------|----------|-------|
| `.calc-panel` | padding | 0 |
| `.calc-panel` | border | 0 |
| `.calc-panel` | box-shadow | none |
| `.calc-panel` | height | `calc(100vh - 52px)` (minus compact bar) |
| `.calc-panel` | height | `calc(100dvh - 52px)` (dynamic viewport, fallback above) |
| `.calc-panel` | overflow-y | auto |
| `.calc-panel` | `-webkit-overflow-scrolling` | touch |
| `.calc-top` | display | none |
| `.calculator-branding` | display | none |
| `.calculator-shell` | border-radius | 0 |
| `.calculator-shell` | padding | 8px 6px 6px |
| `.calculator-shell` | box-shadow | none |

### D. LCD — keep full width, tighten chrome

| Selector | Property | Value |
|----------|----------|-------|
| `.lcd-bezel` | padding | 8px |
| `.lcd-bezel` | border-radius | 16px |
| `.screen-frame` | padding | 6px |
| `.screen-frame` | border-radius | 10px |
| `.calc-canvas` | border-radius | 8px |

Keep `width: 100%` and `aspect-ratio: 4/3`. At 390px viewport this yields ~370px wide, ~278px tall LCD. Acceptable.

### E. Narration bar — sticky + compact

```css
.narration-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 8px 10px;
  border-radius: 12px 12px 0 0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

Content changes (JS in `renderCalculatorColumn`):
- Narration text: single line with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- Action buttons (Firmware/Restart/Hint/Pause): **icon-only**, 36px square, no text labels
- Icons: use Unicode symbols (e.g. Hint: `?`, Pause: `⏸`, Resume: `▶`, Restart: `↺`, Firmware: `⚙`)

```css
.narration-copy strong {
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.narration-copy span {
  display: none; /* hide detail line */
}
.narration-bar .mac-button {
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 1rem;
  text-align: center;
}
```

### F. Keypad — tighter spacing

| Selector | Property | Value |
|----------|----------|-------|
| `.keypad-shell` | padding | 6px 2px 2px |
| `.keypad-layout` | gap | 6px |
| `.key-row` | gap | 5px |
| `.key` | min-height | 42px |
| `.key` | padding | 8px 5px 6px |
| `.key` | border-radius | 10px |
| `.key-modifier` | min-height | 44px |
| `.key-large`, `.key-enter` | min-height | 46px |
| `.key-label` | font-size | 0.8rem |
| `.key-number .key-label` | font-size | 1.2rem |
| `.key-operator .key-label` | font-size | 1.1rem |
| `.key-secondary` | font-size | 0.58rem |
| `.key-alpha-label` | display | none |
| `.dpad-shell` | width | min(100%, 120px) |
| `.keypad-upper` | gap | 8px |

### G. Dashboard row

```css
.dashboard-row {
  padding: 8px;
  gap: 8px;
  grid-template-columns: repeat(2, 1fr);
}
```

During walkthrough: hide with JS (add `.mobile-hidden` class).
Show on start panel and session result screens.

### H. Dialog (ROM picker, settings)

```css
.dialog-window {
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}
.dialog-backdrop {
  padding: 8px;
}
```

---

## Height Budget (iPhone 14: 390x844, ~794px usable after browser chrome)

| Element | Height |
|---------|--------|
| Compact problem bar | 44px |
| Calculator shell padding | 14px |
| LCD (bezel + frame + canvas) | ~296px |
| Narration bar (sticky) | 48px |
| Keypad shell padding | 8px |
| Function row (42px) | 42px |
| Upper section (modifiers+dpad, ~120px) | 120px |
| 7 main rows x 42px + 6x6px gaps | 330px |
| **Total** | **~902px** |

~108px over viewport. Student scrolls ~108px within `.calc-panel` (which has `overflow-y: auto`). The narration bar stays sticky at the bottom, so guidance is always visible. The LCD scrolls off top as keys come into view — acceptable trade-off since students look at keys while pressing.

On taller phones (Pixel 7: 412x915, ~865px usable), overflow is only ~37px — nearly fits.

---

## JS Changes Summary

### In `renderWalkthroughPanel()` (~line 2263 of app.js)

Add mobile detection and compact rendering:

```javascript
// At top of function, check if mobile
const isMobile = window.innerWidth <= 600;
```

When `isMobile && walkthrough active`:
- Render compact bar: procedure name + step N/M + mode badge
- Add `onclick` to toggle `.expanded` class on the panel
- When `.expanded`: show full content (problem stem, chips, clutch cards)
- When collapsed: hide everything except the bar

### In `renderCalculatorColumn()` (~line 2473 of app.js)

When `isMobile`:
- Narration buttons: render icon-only variants
- Use `title` attributes for accessibility (tooltip on long-press)

### In `renderDashboard()` (~line 2554 of app.js)

When `isMobile && walkthrough active`:
- Return empty string (hide dashboard)

### Event handling

- Add resize listener to re-render on orientation change
- The compact bar tap-to-expand should use event delegation on `.walkthrough-panel`

---

## Testing Checklist

1. iPhone SE (375x667): calculator fits, keys tappable, no horizontal overflow
2. iPhone 14 (390x844): LCD visible at top, narration sticky at bottom, scroll to lower keys
3. Pixel 7 (412x915): nearly fits without scroll
4. iPad Mini (768x1024): should NOT trigger 600px breakpoint — uses existing 768px rules
5. Desktop (1440px): zero visual changes
6. Orientation change (landscape on phone): layout adapts without breaking
7. Track 1 (pattern recognition): full problem panel visible, not collapsed
8. Walkthrough: compact bar, tap to expand, tap again to collapse
9. Data setup phase: clutch card visible when bar expanded
10. Dialog (ROM picker): fills screen, scrollable
