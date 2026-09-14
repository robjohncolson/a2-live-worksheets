# Codex Task: Fix Calculator Layout — Must Fit Viewport at 100% Zoom

## The Problem

The trainer has a two-panel layout: left pane (problem text) and right pane (calculator). At 100% browser zoom, only the top ~80% of the LCD screen is visible in the right pane — the entire keypad is below the fold. Users have to zoom to 33% to see everything, but at 33% the secondary labels (blue 2nd text, green alpha text) are unreadable.

**The goal**: At 100% browser zoom on a standard 1920×1080 or 1366×768 screen, the ENTIRE calculator (LCD + keypad + all labels) must be visible without scrolling in the right pane. The left pane problem text should also be readable at normal font sizes.

## Root Cause

The calculator shell is too tall. The keys, padding, bezels, and gaps all add up to more than 100vh. The CSS needs to be reworked so the calculator fits within viewport height.

## Design Constraints

1. **All key labels must be readable at 100% zoom.** This means:
   - Main label (white text on key): clearly visible
   - 2nd function label (blue text above key): readable — this is critical for training
   - Alpha label (green text on key): readable — needed for menu letter selection (A-H)
   
2. **The LCD screen must be large enough to read** — students need to see the CEmu output

3. **The problem text in the left pane must be readable** at normal font sizes (~14-16px)

4. **Touch-friendly keys** — minimum ~30px tap target even on the smallest keys

## Approach

The right pane should use `height: 100vh` (or `100dvh`) and the calculator inside it should fill that height using flexbox or grid with `overflow: hidden`. The calculator components (branding, LCD, narration, keypad) should divide the available height proportionally.

Specific sizing guidance:
- **LCD**: ~25% of the calculator height
- **Narration bar**: ~8% (step instructions)
- **Keypad**: ~60% of the calculator height  
- **Shell padding/branding**: minimal, ~7%

The keypad rows should use `fr` units or `%` heights so they scale to fill available space rather than having fixed `min-height` values that overflow.

For the key labels at small sizes:
- Main label: use a condensed font or reduce to fit
- 2nd label (above key): **must be at least 9px rendered**. Use `font-size: max(0.55rem, 9px)` or similar floor
- Alpha label: same minimum
- Consider putting 2nd/alpha labels ON the key face (top-left and top-right corners) instead of above/beside — this uses the key's own area rather than requiring extra space between rows

## Files to Modify

1. **`ti84-trainer-v2/style.css`** — Main stylesheet. Rework the calculator layout to be viewport-height constrained.
2. **`ti84-trainer-v2/app.js`** — If the HTML structure of the calculator needs changes (e.g., different container hierarchy for flex layout)
3. **Run `node ti84-trainer-v2/build.mjs`** after changes to regenerate `standalone.html` with the updated styles inlined.

## Key CSS Sections to Rework

- `.workspace` (line ~161): the two-column grid. Right column should be constrained to viewport height.
- `.calculator-shell` (line ~324): the main calculator container. Should be `max-height: 100vh` with internal flex layout.
- `.lcd-bezel`, `.screen-frame` (line ~365): LCD wrapper. Fixed proportion of available height.
- `.keypad-shell`, `.keypad-layout` (line ~446): Must fill remaining height after LCD.
- `.key` (line ~493): Remove fixed `min-height`. Use relative sizing that scales with available space.
- `.key-secondary`, `.key-alpha-label` (line ~586): Boost font size with a minimum floor.
- `.key-label` (line ~607): Scale proportionally.
- `.dpad-shell` (line ~640): Scale down proportionally.
- Media queries (line ~841): Update breakpoints to match new layout.

## Specific Requirements

1. **Right pane**: `position: sticky; top: 0; height: 100vh; overflow: hidden;` or use `max-height: 100vh` on the calc panel.

2. **Calculator shell**: Use `display: flex; flex-direction: column; height: 100%;` so children divide available space.

3. **Keypad layout**: Use `flex: 1; overflow: hidden;` and let key rows distribute evenly with `flex: 1` per row.

4. **Keys**: Replace `min-height: 36px` with `flex: 1; min-height: 0;` so they shrink to fit. Or use `height: calc((100vh - LCD_HEIGHT - PADDING) / NUM_ROWS)`.

5. **Key font sizes**: Use `clamp()` for responsive sizing:
   - Main label: `font-size: clamp(8px, 1.2vw, 14px);`
   - 2nd label: `font-size: clamp(7px, 1vw, 11px);`
   - Alpha label: `font-size: clamp(7px, 1vw, 11px);`
   - Number keys: `font-size: clamp(12px, 2vw, 22px);`

6. **2nd labels position**: If space is too tight above keys, move them inside the key (top-left corner, smaller). The labels must be visible regardless.

7. **Left pane**: Should scroll independently. Problem text stays at readable size.

## Verification

After changes:
1. Open standalone.html at 100% zoom on 1920×1080 — both panes visible, entire calculator (LCD + all keys) fits without scrolling
2. Open at 100% zoom on 1366×768 (common school laptop) — same requirement
3. All key labels readable: main, 2nd (blue), alpha (green)
4. LCD shows CEmu output clearly
5. Problem text in left pane is readable at ~14px
6. Click keys — they respond, no jitter, correct feedback
7. `node ti84-trainer-v2/build.mjs` succeeds and regenerates standalone.html
8. `cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js` — 354 tests passing
