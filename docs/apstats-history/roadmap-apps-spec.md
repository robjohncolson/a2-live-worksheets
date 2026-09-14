# Spec: Roadmap App Launcher — iframe-based App Windows

**Target file**: `ap_stats_roadmap_square_mode.html`
**Goal**: Add three new iframe-based "app windows" to the roadmap calendar, accessible from a new "Apps" menu in the menu bar. Each app opens in a System 7-styled overlay window (same pattern as the existing Study Break game overlay).

---

## Apps to Add

| ID | Menu Label | Title Bar Text | iframe URL | Emoji |
|----|-----------|----------------|------------|-------|
| `ti84` | TI-84 Trainer | TI-84 Trainer | `https://robjohncolson.github.io/apstats-live-worksheet/ti84-trainer-v2/standalone.html` | 🔢 |
| `quiz` | AP Stats Quiz | AP Stats Quiz | `https://robjohncolson.github.io/curriculum_render/` | 📝 |
| `formulas` | Equation Trainer | Equation Trainer | `https://tmux-trainer.vercel.app/#deck=ap-stats-formulas` | ⚡ |

---

## HTML Changes

### 1. New "Apps" Menu (insert between Label and Special menus)

Insert a new `<span class="menu-item">` after the Label menu (line ~873) and before the Special menu (line ~874):

```html
<span class="menu-item" data-menu="apps">Apps
    <div class="menu-dropdown" id="menu-apps">
        <div class="menu-dd-item" data-sfx onclick="closeMenus();openApp('ti84')" style="font-weight:bold">&#128290; TI-84 Trainer</div>
        <div class="menu-dd-item" data-sfx onclick="closeMenus();openApp('quiz')" style="font-weight:bold">&#128221; AP Stats Quiz</div>
        <div class="menu-dd-item" data-sfx onclick="closeMenus();openApp('formulas')" style="font-weight:bold">&#9889; Equation Trainer</div>
    </div>
</span>
```

### 2. Three App Overlay Windows (insert after the game overlay, before the Tooltip div)

Each app overlay follows the exact same HTML pattern as the game overlay (`#game-overlay`), but replaces canvas content with an iframe. Insert these after line ~1010 (end of game overlay) and before line ~1013 (Tooltip).

For each app (`ti84`, `quiz`, `formulas`):

```html
<!-- ═══ App Window: {TITLE} ═══ -->
<div class="app-overlay" id="app-{ID}-overlay">
    <div class="app-window">
        <div class="game-title-bar">
            <div class="close-box" onclick="closeApp('{ID}')"></div>
            <div class="title-stripes"></div>
            <span class="title-text chicago">{TITLE BAR TEXT}</span>
        </div>
        <div class="app-content">
            <iframe id="app-{ID}-frame" class="app-iframe" allow="cross-origin-isolated"></iframe>
        </div>
    </div>
</div>
```

---

## CSS Changes

Add these styles (in the `<style>` block, near the existing `.game-overlay` rules around line ~465):

```css
/* ── App Overlay Windows ───────────────────── */
.app-overlay {
    display: none;
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 250;
    background: rgba(85, 85, 102, 0.6);
}
.app-window {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 900px;
    max-width: 95vw;
    height: 80vh;
    max-height: 90vh;
    background: var(--platinum);
    border: 1px solid var(--black);
    box-shadow:
        inset 1px 1px 0 0 var(--plat-hi),
        inset -1px -1px 0 0 var(--plat-lo),
        2px 2px 0 0 var(--black);
    padding: 1px;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.app-content {
    margin: 1px 2px 2px 2px;
    border: 1px solid var(--black);
    background: var(--white);
    flex: 1;
    display: flex;
    min-height: 0;
}
.app-iframe {
    width: 100%;
    height: 100%;
    border: none;
    flex: 1;
}
```

### Mobile responsiveness

Add inside the existing `@media (max-width: 600px)` block:

```css
.app-window {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    top: 0; left: 0;
    transform: none;
    border-radius: 0;
}
```

---

## JavaScript Changes

Add these functions in the `<script>` block. Place them near the existing `openGame()`/`closeGame()` functions (around line ~4655).

### App Registry + Open/Close

```javascript
/* ═══ APP LAUNCHER ═══ */
const APP_REGISTRY = {
    ti84:     { url: 'https://robjohncolson.github.io/apstats-live-worksheet/ti84-trainer-v2/standalone.html', sfx: 'wildEep' },
    quiz:     { url: 'https://robjohncolson.github.io/curriculum_render/', sfx: 'wildEep' },
    formulas: { url: 'https://tmux-trainer.vercel.app/#deck=ap-stats-formulas', sfx: 'wildEep' }
};

function openApp(id) {
    var app = APP_REGISTRY[id];
    if (!app) return;
    MacSFX.play(app.sfx, 0.5);
    var overlay = document.getElementById('app-' + id + '-overlay');
    var iframe = document.getElementById('app-' + id + '-frame');
    // Lazy-load: set src only on open
    if (!iframe.src || iframe.src === 'about:blank' || iframe.src === window.location.href) {
        iframe.src = app.url;
    }
    overlay.style.display = 'block';
}

function closeApp(id) {
    var overlay = document.getElementById('app-' + id + '-overlay');
    var iframe = document.getElementById('app-' + id + '-frame');
    overlay.style.display = 'none';
    // Clear iframe to free memory
    iframe.src = 'about:blank';
}
```

### Escape key handling

The existing code likely handles Escape for the game overlay. Add app overlay handling to the same keydown listener. When Escape is pressed, close any visible app overlay:

```javascript
// Inside the existing keydown handler, add:
document.querySelectorAll('.app-overlay').forEach(function(el) {
    if (el.style.display === 'block') {
        var id = el.id.replace('app-', '').replace('-overlay', '');
        closeApp(id);
    }
});
```

### Click-outside-to-close

Each overlay should close when the backdrop (not the window) is clicked:

```javascript
// After DOM ready or inline:
document.querySelectorAll('.app-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            var id = overlay.id.replace('app-', '').replace('-overlay', '');
            closeApp(id);
        }
    });
});
```

---

## Menu System Integration

The existing menu system uses `data-menu` attributes and a `closeMenus()` function. The new "Apps" menu must be recognized by the menu open/close logic. Check how `closeMenus()` works — it likely hides all `.menu-dropdown` elements. Since the new menu uses the same class, it should work automatically.

However, verify that the menu-opening logic (click on `[data-menu]`) handles the new `data-menu="apps"` value. The existing code at the top of the script likely does a generic selector like `document.querySelectorAll('.menu-item')` — if so, no changes needed.

---

## Constraints

- Do NOT modify any Study Break / Tetris code or HTML
- Do NOT modify any Doge Presence code
- Do NOT change existing CSS variables or class names
- Reuse existing CSS classes (`.game-title-bar`, `.close-box`, `.title-stripes`, `.title-text`) for the title bar — do NOT duplicate their styles
- Keep the System 7 aesthetic consistent
- All three app overlays use the same CSS classes (`.app-overlay`, `.app-window`, `.app-content`, `.app-iframe`)
- The `openApp()`/`closeApp()` functions are generic — driven by the `APP_REGISTRY` object and `id` parameter
