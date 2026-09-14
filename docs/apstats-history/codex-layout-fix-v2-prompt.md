# Codex Task: Fix Calculator Layout V2 — Based on Actual Screenshot

## The Problem (with screenshot evidence)

See `resized_screen.png` in the repo root for the current state. Issues:

1. **LCD screen is ~120×80px** — too small to read CEmu output. Needs to be at least 240×180px.
2. **Keys are horizontally crushed** — labels overlap, 2nd/alpha text unreadable. Keys need at least 40px width.
3. **Calculator panel is only ~280px wide** (after padding) — not enough for 5 keys + gaps per row.
4. **Keys vertically squished** — trying to fit 10+ rows into remaining height after LCD.

## The Fix

The calculator needs to be **wider** and the LCD needs a **fixed minimum size**. The left pane (problem text) can be narrower — text wraps fine.

### Layout targets for 1366×768 (school laptops):

```
Available: ~1280px wide × ~688px tall (after browser chrome)

Left pane (problem):  ~730px wide (scrollable)
Right pane (calc):    ~450px wide (fixed to viewport height)

Inside the calc panel:
  - Branding:    20px tall
  - LCD:         ~180px tall × ~320px wide (readable CEmu output)  
  - Narration:   ~35px tall (step instruction)
  - Keypad:      ~400px tall (10 rows × ~38px each)
  - Gaps/padding: ~55px total

  Total:         ~690px — fits the viewport
```

### Specific CSS changes needed:

**1. Widen the calc column:**
```css
.workspace {
  grid-template-columns: minmax(0, 1fr) clamp(380px, 38vw, 480px);
}
```

**2. LCD: fixed minimum height, not percentage:**
```css
.lcd-bezel {
  flex: 0 0 auto;
  min-height: 140px;
  max-height: 200px;
}

.calc-canvas {
  width: 100%;
  height: auto;
  max-height: 100%;
}
```

Don't use `flex: 0 0 clamp(82px, 20%, 150px)` for the LCD — the percentage basis is the calc panel height which is already constrained, making the LCD tiny. Use a fixed min-height instead.

**3. Keys: wider, reasonable height:**
```css
.key {
  min-height: 32px;
  /* Let width be determined by grid columns — don't constrain it */
}

.key-row {
  gap: 4px;
}
```

At 450px panel width minus padding (~420px inner), 5 keys + 4 gaps of 4px = 16px gaps → each key ~81px wide. That's plenty for labels.

**4. Font sizes — must be readable at these dimensions:**
```css
.key-label {
  font-size: clamp(9px, 0.9vw, 13px);  /* main label */
}

.key-number .key-label {
  font-size: clamp(14px, 1.6vw, 22px);  /* number keys bigger */
}

.key-secondary {
  font-size: clamp(8px, 0.75vw, 11px);  /* 2nd function — MUST be ≥8px */
}

.key-alpha-label {
  font-size: clamp(8px, 0.75vw, 11px);  /* alpha — MUST be ≥8px */
}
```

**5. Keypad takes remaining space:**
```css
.keypad-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.keypad-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.key-row {
  flex: 1 1 auto;
  min-height: 0;
}
```

This lets key rows distribute evenly in whatever vertical space remains after the LCD.

**6. D-pad must fit the narrower row height:**
```css
.dpad-shell {
  width: min(100%, 90px);
}
```

## Critical: Run the build

After CSS changes, you MUST run:
```bash
node ti84-trainer-v2/build.mjs
```

This regenerates `standalone.html` with the CSS inlined. The user opens `standalone.html`, not `index.html`. If you don't rebuild, the user sees no changes.

## Files to modify

1. `ti84-trainer-v2/style.css` — all layout changes
2. Run `node ti84-trainer-v2/build.mjs` to regenerate `ti84-trainer-v2/standalone.html`

Do NOT modify `app.js` (CRITICAL impact on renderCalculatorColumn).

## Verification

1. `node ti84-trainer-v2/build.mjs` succeeds
2. `cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js` → 354 passing
3. Compare the layout against `resized_screen.png` — it should look dramatically better:
   - LCD readable (at least 240px wide)
   - Keys not overlapping
   - 2nd/alpha labels visible (≥8px rendered)
   - Both panes fit at 100% zoom on 1366×768

If you have headless Chromium available, screenshot at 1366×768 and verify all calculator elements are within the viewport bounds.
