# Teacher -> Student Console -- Phase 4 BUILD Contract

> FROZEN, session 112, 2026-05-24. Implements `TEACHER_STUDENT_CONSOLE_SPEC.md`
> Section 11 (Select Students mode) + Section 13 row P4.
>
> Scope: cockpit-side UX for multi-student nudges. Teacher clicks
> "Select Students" -> avatars freeze + canvas desaturates + click an
> avatar toggles selection -> selection bar at bottom shows count +
> textarea + Send. Send fires one `classroom_teacher_nudge` with the
> selected usernames + one POST `/teacher/nudge`. ESC or Cancel exits.
>
> Pure cockpit UX layer on top of P3's nudge plumbing. NO server
> changes (cr + roster-server untouched). NO migration. NO Desk file
> change. NO `curriculum_render/data/curriculum.js` change.

## 0. P4 scope cut from spec

The spec (Section 11) says select mode toggles overhead labels from
@username to Real Name. The cockpit ALREADY shows real names (passes
`nameMap: currentNameMap` to mount). Keep that behavior; no toggle.
The select-mode effect is purely: freeze + desaturate + multi-pick.

Spec also calls for "bright outline + check mark over their head" on
selected avatars. P4 ships this via a DOM overlay layer (selection
markers as absolute-positioned divs over the canvas), NOT via canvas
render-path edits. Cleaner separation; classroom-board.js stays
mostly out of the marker rendering.

## 1. File ownership (single wave, planner-direct)

| Files                                                                          | Touched by      |
|--------------------------------------------------------------------------------|-----------------|
| `classroom-board.js` (extend ClassroomBoard.mount with onAvatarClick callback + setSelectMode method + applyPos freeze gate) | Planner-direct |
| `teacher-classroom.html` (Select Students button + selection state + overlay markers + multi-nudge send + ESC handler) | Planner-direct |
| `tests/cockpit-select-students.test.js` (NEW)                                  | Planner-direct |

All edits in follow-alongs only.

## 2. classroom-board.js extensions

### 2.1 New mount option: `onAvatarClick`

After the existing `onClassroomMessage` option binding (~line 1457):

```js
// P4 Select Students (TEACHER_STUDENT_CONSOLE_SPEC.md §11): caller-supplied
// avatar-click callback. Fires when the user clicks on a sprite within the
// canvas while select mode is active. The cockpit uses this to toggle
// selection state.
var onAvatarClick = (typeof opts.onAvatarClick === 'function') ? opts.onAvatarClick : null;
var selectModeActive = false;
```

### 2.2 Canvas click handler

After `container.appendChild(canvas)` (~line 1479):

```js
// P4: canvas click -> avatar hit-test. Only fires onAvatarClick when
// select mode is active so normal-mode clicks don't surprise the user.
canvas.addEventListener('click', function (ev) {
  if (!selectModeActive || !onAvatarClick) return;
  var rect = canvas.getBoundingClientRect();
  var cssX = ev.clientX - rect.left;
  var cssY = ev.clientY - rect.top;
  // Translate CSS coords to canvas-internal coords.
  var cx = cssX * (canvas.width / Math.max(1, canvas.clientWidth));
  var cy = cssY * (canvas.height / Math.max(1, canvas.clientHeight));
  // Hit-test against spriteEntities. Hit zone is 40x40 around each
  // sprite center -- generous because rendered sprites are only ~20x24
  // and the teacher needs to click reliably.
  var HIT = 20;  // half-side of the hit square
  var hit = null;
  for (var u in spriteEntities) {
    var sp = spriteEntities[u];
    if (!sp) continue;
    // Skip self (the teacher's own avatar shouldn't be selectable).
    if (u === username) continue;
    var dx = Math.abs(cx - sp.x);
    var dy = Math.abs(cy - sp.y);
    if (dx <= HIT && dy <= HIT) {
      hit = u;
      break;
    }
  }
  if (hit) {
    try { onAvatarClick(hit); } catch (_) {}
  }
});
```

### 2.3 `setSelectMode` handle method

In the returned handle (~line 2705, alongside `sendMessage` + `section`):

```js
// P4 Select Students (TEACHER_STUDENT_CONSOLE_SPEC.md §11): cockpit
// toggles select mode. ON freezes peer applyPos updates (sprites stop
// moving so the teacher can click reliably) + adds a CSS class on the
// canvas for the desaturation effect. The visual selection markers
// are rendered by the cockpit (DOM overlay), not by the board.
setSelectMode: function (on) {
  selectModeActive = !!on;
  if (canvas && canvas.classList) {
    if (selectModeActive) canvas.classList.add('classroom-select-mode');
    else canvas.classList.remove('classroom-select-mode');
  }
},

// P4: expose canvas dimensions + position lookups so the cockpit can
// position its selection-marker overlay correctly relative to the
// rendered sprites.
getCanvas: function () { return canvas; },
getSpritePosition: function (uname) {
  var sp = spriteEntities[uname];
  if (!sp) return null;
  return { x: sp.x, y: sp.y, canvasW: canvas.width, canvasH: canvas.height };
},
```

### 2.4 applyPos freeze gate

In `applyPos` (~line 2454), gate at top:

```js
function applyPos(msg) {
  // P4 Select Students: freeze peer movement so the teacher can click
  // sprites reliably while selecting. Self-position is not gated here
  // (it's the teacher's own sprite; they're not selecting themselves).
  if (selectModeActive) return;
  if (!msg || !msg.username) { return; }
  // ...existing body unchanged...
}
```

## 3. teacher-classroom.html changes

### 3.1 New control button + selection bar DOM

Insert into the cockpit's `nudge-section` (P3 added it) -- as a new sibling
panel right after the existing Send Nudge form, OR a separate panel
labelled "Select Students":

```html
<!-- P4: Select Students mode (multi-nudge) -->
<div class="section" id="select-students-section" style="display:none">
  <h2 class="section-title">Select Students (multi-nudge)</h2>
  <div class="control-strip">
    <button class="ctrl-btn" id="btn-select-students">Select Students</button>
    <span id="select-students-hint" class="hint">
      Click "Select Students" to freeze the board + multi-pick avatars for a group nudge.
    </span>
  </div>
</div>

<!-- Selection bar overlay (fixed bottom; hidden until select mode ON) -->
<div id="select-bar" style="display:none">
  <span class="sb-count" id="select-bar-count">0 selected</span>
  <textarea id="select-bar-text" maxlength="280" rows="2" placeholder="Nudge to selected (280 chars max)..."></textarea>
  <button type="button" class="ctrl-btn primary" id="btn-select-send" disabled>Send to selected</button>
  <button type="button" class="ctrl-btn" id="btn-select-cancel">Cancel</button>
</div>

<!-- Selection markers overlay (DOM divs positioned over canvas) -->
<div id="select-markers" style="display:none"></div>
```

### 3.2 CSS

In the existing `<style>` block:

```css
/* P4 Select Students (TEACHER_STUDENT_CONSOLE_SPEC.md §11). Canvas
   desaturates while select mode is active. Overlay markers + bottom
   bar are absolutely positioned. */
canvas.classroom-select-mode {
  filter: grayscale(0.7) brightness(0.85);
  cursor: crosshair;
}
#select-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9000;
  background: var(--sg-bg-card); border-top: 2px solid var(--sg-accent);
  padding: 10px 16px; display: flex; align-items: center; gap: 10px;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.18);
}
#select-bar .sb-count {
  font-weight: 700; color: var(--sg-accent); font-size: 0.95rem;
  min-width: 110px;
}
#select-bar textarea {
  flex: 1; resize: vertical; min-height: 40px; max-height: 100px;
  border: 1px solid var(--sg-border); border-radius: 4px;
  padding: 6px; font: inherit;
}
#select-markers {
  /* Codex MINOR fold P4: viewport-fixed overlay (NOT parent-absolute)
     because the cockpit's board-mount has its own positioned ancestors
     and parent-relative coords need offsetting. Viewport-fixed lets the
     marker code use canvas.getBoundingClientRect() directly. */
  position: fixed; top: 0; left: 0; pointer-events: none; z-index: 50;
  width: 100vw; height: 100vh;
}
#select-markers .sel-marker {
  position: absolute;
  width: 40px; height: 40px; margin-left: -20px; margin-top: -32px;
  border: 3px solid #d97706; border-radius: 4px;
  background: rgba(217, 119, 6, 0.18);
  box-sizing: border-box;
  pointer-events: none;
}
#select-markers .sel-marker::after {
  content: "✓"; position: absolute; top: -22px; left: 50%;
  transform: translateX(-50%);
  background: #d97706; color: #fff;
  width: 18px; height: 18px; line-height: 18px;
  border-radius: 50%; font-weight: 700; font-size: 12px;
  text-align: center;
}
```

### 3.3 JS state + helpers

After the existing P3 nudge helpers (~line 1100ish, near `_renderNudgeAck`):

```js
// ===== P4: Select Students mode (TEACHER_STUDENT_CONSOLE_SPEC.md §11) =====

var _selectModeActive = false;
var _selectedUsernames = new Set();
var _lastSummaryForMarkers = null;

function _enterSelectMode() {
  if (_selectModeActive) return;
  _selectModeActive = true;
  _selectedUsernames.clear();
  if (boardHandle && typeof boardHandle.setSelectMode === 'function') {
    boardHandle.setSelectMode(true);
  }
  var bar = document.getElementById('select-bar');
  if (bar) bar.style.display = 'flex';
  var markers = document.getElementById('select-markers');
  if (markers) markers.style.display = 'block';
  var btn = document.getElementById('btn-select-students');
  if (btn) btn.textContent = 'Exit Select Mode';
  _updateSelectBar();
}

function _exitSelectMode() {
  if (!_selectModeActive) return;
  _selectModeActive = false;
  _selectedUsernames.clear();
  if (boardHandle && typeof boardHandle.setSelectMode === 'function') {
    boardHandle.setSelectMode(false);
  }
  var bar = document.getElementById('select-bar');
  if (bar) bar.style.display = 'none';
  var markers = document.getElementById('select-markers');
  if (markers) {
    markers.style.display = 'none';
    markers.innerHTML = '';
  }
  var btn = document.getElementById('btn-select-students');
  if (btn) btn.textContent = 'Select Students';
  var textEl = document.getElementById('select-bar-text');
  if (textEl) textEl.value = '';
  _updateSelectBar();
}

function _toggleSelectAvatar(username) {
  if (!_selectModeActive || !username) return;
  if (_selectedUsernames.has(username)) _selectedUsernames.delete(username);
  else _selectedUsernames.add(username);
  _renderSelectMarkers();
  _updateSelectBar();
}

function _updateSelectBar() {
  var count = _selectedUsernames.size;
  var countEl = document.getElementById('select-bar-count');
  if (countEl) countEl.textContent = count + ' selected';
  var textEl = document.getElementById('select-bar-text');
  var sendBtn = document.getElementById('btn-select-send');
  if (sendBtn) sendBtn.disabled = count === 0 || !textEl || !String(textEl.value || '').trim();
}

function _renderSelectMarkers() {
  var markers = document.getElementById('select-markers');
  if (!markers) return;
  markers.innerHTML = '';
  if (!_selectModeActive || _selectedUsernames.size === 0) return;
  if (!boardHandle || typeof boardHandle.getSpritePosition !== 'function') return;
  var canvas = boardHandle.getCanvas ? boardHandle.getCanvas() : null;
  if (!canvas) return;
  // Marker container is overlaid on the canvas's parent; map canvas-internal
  // coords -> CSS pixels using the canvas's rendered size.
  var rect = canvas.getBoundingClientRect();
  var parentRect = markers.parentNode.getBoundingClientRect();
  var offsetLeft = rect.left - parentRect.left;
  var offsetTop = rect.top - parentRect.top;
  var scaleX = rect.width / Math.max(1, canvas.width);
  var scaleY = rect.height / Math.max(1, canvas.height);
  _selectedUsernames.forEach(function (u) {
    var pos = boardHandle.getSpritePosition(u);
    if (!pos) return;
    var div = document.createElement('div');
    div.className = 'sel-marker';
    div.style.left = (offsetLeft + pos.x * scaleX) + 'px';
    div.style.top = (offsetTop + pos.y * scaleY) + 'px';
    div.setAttribute('data-username', u);
    markers.appendChild(div);
  });
}

async function _sendSelectedNudge() {
  if (!_selectModeActive || _selectedUsernames.size === 0) return;
  var textEl = document.getElementById('select-bar-text');
  var rawText = textEl ? String(textEl.value || '').trim() : '';
  if (!rawText) return;
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  var recipients = Array.from(_selectedUsernames);
  var nudgeId = _newNudgeId();
  var sendBtn = document.getElementById('btn-select-send');
  if (sendBtn) sendBtn.disabled = true;
  // 1) Live delivery via WS.
  var wsSent = false;
  try {
    if (boardHandle && typeof boardHandle.sendMessage === 'function') {
      wsSent = !!boardHandle.sendMessage({
        type: 'classroom_teacher_nudge',
        nudgeId: nudgeId,
        recipientUsernames: recipients,
        text: rawText
      });
    }
  } catch (_) { wsSent = false; }
  // 2) Log to roster-server.
  try {
    var rsBase = (typeof window.ROSTER_SERVICE_URL === 'string') ? window.ROSTER_SERVICE_URL : '';
    var rosterToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (rsBase && rosterToken) {
      await fetch(rsBase + '/teacher/nudge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + rosterToken
        },
        body: JSON.stringify({
          nudgeId: nudgeId,
          recipientUsernames: recipients,
          text: rawText,
          deliveredUsernames: wsSent ? recipients : []
        })
      });
    }
  } catch (_) {}
  _exitSelectMode();
}
```

### 3.4 onAvatarClick wiring in mount

Extend the existing `ClassroomBoard.mount(container, {...})` call options:

```js
onAvatarClick: function (username) {
  try { _toggleSelectAvatar(username); } catch (_) {}
},
```

### 3.5 Button + ESC wiring

At the end of the inline script (in the existing nudge-button-wire IIFE):

```js
// ===== P4: Select Students wiring =====
(function () {
  try {
    var btn = document.getElementById('btn-select-students');
    if (btn) btn.addEventListener('click', function () {
      if (_selectModeActive) _exitSelectMode();
      else _enterSelectMode();
    });
    var send = document.getElementById('btn-select-send');
    if (send) send.addEventListener('click', _sendSelectedNudge);
    var cancel = document.getElementById('btn-select-cancel');
    if (cancel) cancel.addEventListener('click', _exitSelectMode);
    var textEl = document.getElementById('select-bar-text');
    if (textEl) textEl.addEventListener('input', _updateSelectBar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _selectModeActive) _exitSelectMode();
    });
  } catch (_) {}
})();
```

### 3.6 setBoardSectionsVisible update

Add `select-students-section` to the list (it should show/hide alongside other panels):

```js
var ss = document.getElementById('select-students-section');
if (ss) ss.style.display = disp;
```

## 4. Tests `tests/cockpit-select-students.test.js`

Mirror the fnBody + mockStorage pattern from `tests/desk-view-as.test.js`.

Required test cases (~18):

**describe('Select Students -- structure')**
- DOM markup present: Select Students button, selection bar (hidden), markers overlay
- CSS rules for `canvas.classroom-select-mode`, `#select-bar`, `#select-markers`
- setBoardSectionsVisible includes select-students-section
- onAvatarClick wired in mount call
- classroom-board.js exports setSelectMode + getCanvas + getSpritePosition

**describe('_enterSelectMode / _exitSelectMode')**
- Enter: sets _selectModeActive true; shows bar; calls boardHandle.setSelectMode(true)
- Exit: clears selection; hides bar; calls setSelectMode(false); empties markers
- Toggle button label changes between Select Students / Exit Select Mode

**describe('_toggleSelectAvatar')**
- Add when not in set; remove when in set
- No-op when select mode inactive
- Re-renders markers each toggle

**describe('_updateSelectBar')**
- Count text reflects size
- Send button disabled when count=0 or text empty
- Send button enabled when count>=1 AND text non-empty

**describe('_renderSelectMarkers')**
- Renders one .sel-marker div per selected
- Marker positioned at sprite coordinates (mocked via getSpritePosition)
- Empty markers when set empty

**describe('_sendSelectedNudge')**
- Sends WS with recipientUsernames = Array.from(selected)
- POSTs /teacher/nudge with the same recipients
- Truncates text > 280
- Exits select mode after send

**describe('Canvas hit-testing (classroom-board.js)')**
- onAvatarClick fires when canvas clicked at sprite position in select mode
- Does NOT fire when select mode inactive
- Does NOT fire when click misses all sprites
- Self-username never fires onAvatarClick

## 5. Smoke checks (planner-run after Codex fold)

1. `npm test` from follow-alongs root -- expect ~18 new tests; baseline 5075/5076 must not regress.
2. Manual smoke (after GH Pages republish):
   - Teacher signs in to cockpit, picks PeriodX, sees student avatars.
   - Click "Select Students" -> canvas desaturates, avatars freeze.
   - Click two avatars -> orange outline + check mark appear on each; bottom bar shows "2 selected".
   - Type message in bar -> Send button enables.
   - Click Send -> both students see toast; cockpit exits select mode.
   - Press ESC instead of Cancel -> select mode exits.

## 6. Dispatch

Single-wave planner-direct (touches `classroom-board.js` which is
shared between Desk + cockpit -- planner-direct avoids parallel-edit
collisions). Codex review after, then commit + push (follow-alongs
only; no cr changes).

## 7. What is explicitly OUT of P4

- Drag-rectangle selection -- single click per avatar only.
- Real-name vs @username toggle on overhead label (cockpit already shows real names).
- Multi-section nudge -- only the active section's students appear in the board, so this naturally falls out.
- Section-wide broadcast nudge ("nudge all of PeriodB") -- spec calls this out as separate spec (Section 15 out-of-scope).
- Selection persistence across mode toggles -- exiting Select Mode clears the set.
