# Teacher -> Student Console -- Phase 11 (popup inline expansions) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements item #3 of the s113
> NEXT queue. Spec section 4.1 originally called for the popup to
> expand inline for Send Nudge + Apply Remediation + Override Gate;
> P9 MVP routed those three via cross-tab/prefill. P11 lands the
> inline expansions.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` section 4.1. Sibling
> BUILD: P9 (the popup this extends), P10 (the polish layer just
> above this).
>
> NO migration. NO server change -- all three inline submits reuse
> existing endpoints (P3's `/teacher/nudge`, P4b's
> `/remediation/propose`, P5's `/teacher/lesson-unlock`). NO Desk
> change. NO curriculum_render change.

## 0. Scope

The P9 popup is a 220 px floating menu with 6 action buttons.
Currently:
- View as / View grade / View recent -> open new tab
- Send nudge -> pre-fill the cockpit nudge panel (closes popup)
- Apply remediation / Override gate -> open new tab to dashboard /
  Desk respectively, with deep-link query params

P11 swaps the in-cockpit actions to expand the popup itself:

| Action | Before P11 | After P11 |
|---|---|---|
| Send nudge | Pre-fill cockpit panel | Expand popup into textarea + Send |
| Apply remediation | New tab + deep-link | Expand popup into inline form |
| Override gate | New tab + deep-link | Expand popup into inline form |

View as / View grade / View recent KEEP their new-tab behavior --
those targets need full-screen real estate. Only the three actions
that fit in a small form get inline expansions.

Popup state machine becomes:
- `main` (the 6 buttons — current default)
- `nudge` (single textarea + Send + Back)
- `remediation` (3 fields + Submit + Back)
- `gate` (2 fields + Confirm + Back)

Popup width grows to 280 px when expanded (still fits next to the
sprite; the edge-flip logic from P9 still works). Closing the
popup from any view drops back to `main` for next open.

## 1. File ownership (one wave)

| Wave | Files                                                                                                                                | Touched by |
|------|--------------------------------------------------------------------------------------------------------------------------------------|------------|
| Single | `teacher-classroom.html` (popup DOM + CSS + JS), `tests/avatar-popup-inline-expansions.test.js` (NEW)                              | Sonnet     |

NO test fixtures from prior phases need updating (P9's
`tests/avatar-popup-cockpit.test.js` tests the `main` view; the new
view-switching is purely additive).

## 2. DOM changes

In `teacher-classroom.html`, replace the existing `#avatar-popup`
body content with a multi-view structure. The wrapper, header,
close button, and footer stay; the inner content gets a `data-view`
switcher.

```html
<div id="avatar-popup" class="avatar-popup" style="display:none" role="dialog" aria-hidden="true" data-view="main">
  <button type="button" class="ap-close" id="avatar-popup-close" aria-label="Close popup">&times;</button>
  <div class="ap-header">
    <strong class="ap-name" id="avatar-popup-name">Student</strong>
    <span class="ap-meta" id="avatar-popup-meta"></span>
  </div>

  <!-- View: main (P9 6-button menu) -->
  <div class="ap-view ap-view-main" data-ap-view="main">
    <div class="ap-actions">
      <button type="button" class="ap-action" data-ap-action="view-as">View as student</button>
      <button type="button" class="ap-action" data-ap-action="view-grade">View grade</button>
      <button type="button" class="ap-action" data-ap-action="view-recent">View recent</button>
      <button type="button" class="ap-action" data-ap-action="send-nudge">Send nudge</button>
      <button type="button" class="ap-action" data-ap-action="apply-remediation">Apply remediation</button>
      <button type="button" class="ap-action" data-ap-action="override-gate">Override gate</button>
    </div>
  </div>

  <!-- View: nudge (P11) -->
  <div class="ap-view ap-view-nudge" data-ap-view="nudge" style="display:none">
    <label class="ap-form-label" for="ap-nudge-text">Nudge to this student</label>
    <textarea id="ap-nudge-text" class="ap-form-input" rows="3" maxlength="280" placeholder="Type your nudge (280 chars max)"></textarea>
    <div class="ap-form-status" id="ap-nudge-status"></div>
    <div class="ap-form-actions">
      <button type="button" class="ap-back" data-ap-back="main">Back</button>
      <button type="button" class="ap-submit" id="ap-nudge-send">Send</button>
    </div>
  </div>

  <!-- View: remediation (P11) -->
  <div class="ap-view ap-view-remediation" data-ap-view="remediation" style="display:none">
    <label class="ap-form-label" for="ap-rem-unit">Unit (e.g. <code>U3</code>)</label>
    <input type="text" id="ap-rem-unit" class="ap-form-input" maxlength="8" pattern="^U\d+$" placeholder="U3">
    <label class="ap-form-label" for="ap-rem-skill">Skill code (e.g. <code>3.A</code>)</label>
    <input type="text" id="ap-rem-skill" class="ap-form-input" maxlength="16" placeholder="3.A">
    <label class="ap-form-label" for="ap-rem-notes">Notes (optional)</label>
    <textarea id="ap-rem-notes" class="ap-form-input" rows="2" maxlength="500" placeholder="Optional context"></textarea>
    <div class="ap-form-status" id="ap-rem-status"></div>
    <div class="ap-form-actions">
      <button type="button" class="ap-back" data-ap-back="main">Back</button>
      <button type="button" class="ap-submit" id="ap-rem-submit">Propose</button>
    </div>
  </div>

  <!-- View: gate (P11) -->
  <div class="ap-view ap-view-gate" data-ap-view="gate" style="display:none">
    <label class="ap-form-label" for="ap-gate-key">Lesson key (e.g. <code>1.7</code>)</label>
    <input type="text" id="ap-gate-key" class="ap-form-input" maxlength="20" pattern="^\d+\.\d+$" placeholder="1.7">
    <label class="ap-form-label" for="ap-gate-reason">Reason (optional)</label>
    <textarea id="ap-gate-reason" class="ap-form-input" rows="2" maxlength="500" placeholder="Optional reason"></textarea>
    <div class="ap-form-status" id="ap-gate-status"></div>
    <div class="ap-form-actions">
      <button type="button" class="ap-back" data-ap-back="main">Back</button>
      <button type="button" class="ap-submit" id="ap-gate-submit">Override</button>
    </div>
  </div>
</div>
```

## 3. CSS additions

Append to the existing `.avatar-popup` CSS block:

```css
/* P11: popup grows when an inline view is active. */
.avatar-popup[data-view="nudge"],
.avatar-popup[data-view="remediation"],
.avatar-popup[data-view="gate"] { width: 280px; }

/* Form inputs (shared across the 3 inline views). */
.avatar-popup .ap-view { display: grid; gap: 6px; }
.avatar-popup .ap-form-label {
  font-size: 0.78rem; color: var(--sg-text-dim, #5a5045);
  margin-top: 4px;
}
.avatar-popup .ap-form-input {
  font: inherit; padding: 6px 8px;
  border: 1px solid var(--sg-border, #d97706); border-radius: 4px;
  background: var(--sg-bg, #fff); width: 100%; box-sizing: border-box;
}
.avatar-popup .ap-form-input:invalid { border-color: #b91c1c; }
.avatar-popup .ap-form-status {
  min-height: 18px; font-size: 0.78rem;
  color: var(--sg-text-dim, #5a5045);
}
.avatar-popup .ap-form-status.is-error { color: #b91c1c; }
.avatar-popup .ap-form-status.is-success { color: #15803d; }
.avatar-popup .ap-form-actions {
  display: flex; justify-content: space-between; gap: 6px;
  margin-top: 6px;
}
.avatar-popup .ap-back, .avatar-popup .ap-submit {
  padding: 6px 12px; font: inherit; cursor: pointer;
  border: 1px solid var(--sg-border, #d97706); border-radius: 4px;
  background: var(--sg-bg, #fff);
}
.avatar-popup .ap-submit {
  background: var(--sg-accent, #92400e); color: #fff;
  border-color: var(--sg-accent, #92400e);
}
.avatar-popup .ap-submit[disabled] { opacity: 0.55; cursor: not-allowed; }
```

## 4. JS changes

### 4.1 View switcher

Replace `_handleAvatarPopupAction` so the three in-cockpit actions
switch view instead of cross-tab routing:

```js
function _handleAvatarPopupAction(action) {
  if (!_avatarPopupStudent) return;
  var s = _avatarPopupStudent;
  var sid = s.studentId;
  var uname = s.username;
  switch (action) {
    case 'view-as':
      if (sid) window.open('./ap_stats_roadmap_square_mode.html?viewAsUserId=' + encodeURIComponent(sid), '_blank', 'noopener');
      _closeAvatarPopup();
      break;
    case 'view-grade':
    case 'view-recent':
      if (sid) window.open('./teacher-dashboard.html?openDrawerFor=' + encodeURIComponent(sid), '_blank', 'noopener');
      _closeAvatarPopup();
      break;
    case 'send-nudge':
      _switchAvatarPopupView('nudge');
      break;
    case 'apply-remediation':
      _switchAvatarPopupView('remediation');
      break;
    case 'override-gate':
      _switchAvatarPopupView('gate');
      break;
  }
}

function _switchAvatarPopupView(view) {
  var popup = document.getElementById('avatar-popup');
  if (!popup) return;
  // Update the dataset which the CSS uses for the width grow.
  popup.setAttribute('data-view', view);
  var views = popup.querySelectorAll('.ap-view');
  views.forEach(function (el) {
    var thisView = el.getAttribute('data-ap-view');
    el.style.display = (thisView === view) ? '' : 'none';
  });
  // Reset status lines + focus the first input in the new view.
  ['ap-nudge-status', 'ap-rem-status', 'ap-gate-status'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('is-error', 'is-success'); }
  });
  var focusMap = { nudge: 'ap-nudge-text', remediation: 'ap-rem-unit', gate: 'ap-gate-key' };
  if (focusMap[view]) {
    setTimeout(function () {
      var inp = document.getElementById(focusMap[view]);
      if (inp) inp.focus();
    }, 30);
  }
}
```

The existing `_closeAvatarPopup` is extended to reset to `main` view
on close so the next open starts clean:

```js
function _closeAvatarPopup() {
  var popup = document.getElementById('avatar-popup');
  if (!popup) return;
  popup.style.display = 'none';
  popup.setAttribute('aria-hidden', 'true');
  // P11: reset to main view + clear any form values so next open starts clean.
  popup.setAttribute('data-view', 'main');
  var views = popup.querySelectorAll('.ap-view');
  views.forEach(function (el) {
    var thisView = el.getAttribute('data-ap-view');
    el.style.display = (thisView === 'main') ? '' : 'none';
  });
  // Clear form values.
  ['ap-nudge-text', 'ap-rem-unit', 'ap-rem-skill', 'ap-rem-notes', 'ap-gate-key', 'ap-gate-reason'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  _avatarPopupStudent = null;
}
```

### 4.2 Inline submit handlers

Each view has its own submit. All three reuse existing endpoints.

```js
// P11: inline Send nudge submission. Reuses the P3 classroom_teacher_nudge
// WS message + POST /teacher/nudge. Single-recipient (the clicked student).
async function _submitInlineNudge() {
  if (!_avatarPopupStudent) return;
  var s = _avatarPopupStudent;
  var textEl = document.getElementById('ap-nudge-text');
  var statusEl = document.getElementById('ap-nudge-status');
  var btn = document.getElementById('ap-nudge-send');
  var rawText = textEl ? String(textEl.value || '').trim() : '';
  if (!rawText) {
    statusEl.textContent = 'Type a message first.';
    statusEl.classList.add('is-error');
    return;
  }
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  btn.disabled = true;
  statusEl.classList.remove('is-error', 'is-success');
  statusEl.textContent = 'Sending...';

  var nudgeId = _newNudgeId();
  var wsSent = false;
  try {
    if (boardHandle && typeof boardHandle.sendMessage === 'function') {
      wsSent = !!boardHandle.sendMessage({
        type: 'classroom_teacher_nudge',
        nudgeId: nudgeId,
        recipientUsernames: [s.username],
        text: rawText,
      });
    }
  } catch (_) { wsSent = false; }

  try {
    var rsBase = (typeof window.ROSTER_SERVICE_URL === 'string') ? window.ROSTER_SERVICE_URL : '';
    var rosterToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (rsBase && rosterToken) {
      var resp = await fetch(rsBase + '/teacher/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rosterToken },
        body: JSON.stringify({
          nudgeId: nudgeId,
          recipientUsernames: [s.username],
          text: rawText,
          deliveredUsernames: wsSent ? [s.username] : [],
        }),
      });
      await resp.json().catch(function () { return {}; });
    }
  } catch (_) {}

  if (wsSent) {
    statusEl.textContent = 'Sent.';
    statusEl.classList.add('is-success');
    setTimeout(_closeAvatarPopup, 800);
  } else {
    statusEl.textContent = 'Not connected -- nudge not delivered.';
    statusEl.classList.add('is-error');
    btn.disabled = false;
  }
}

// P11: inline Apply Remediation submission. Reuses P4b's /remediation/propose.
async function _submitInlineRemediation() {
  if (!_avatarPopupStudent) return;
  var s = _avatarPopupStudent;
  var unit = document.getElementById('ap-rem-unit').value.trim();
  var skill = document.getElementById('ap-rem-skill').value.trim();
  var notes = document.getElementById('ap-rem-notes').value.trim();
  var statusEl = document.getElementById('ap-rem-status');
  var btn = document.getElementById('ap-rem-submit');
  statusEl.classList.remove('is-error', 'is-success');
  if (!unit || !/^U\d+$/.test(unit)) {
    statusEl.textContent = 'Unit must look like "U3".';
    statusEl.classList.add('is-error');
    return;
  }
  if (!skill) {
    statusEl.textContent = 'Skill code is required.';
    statusEl.classList.add('is-error');
    return;
  }
  if (!s.studentId) {
    statusEl.textContent = 'Student id not yet loaded -- refresh + try again.';
    statusEl.classList.add('is-error');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Submitting...';

  try {
    var rsBase = (typeof window.ROSTER_SERVICE_URL === 'string') ? window.ROSTER_SERVICE_URL : '';
    var rosterToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (!rsBase || !rosterToken) {
      statusEl.textContent = 'Not signed in -- cannot submit.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    var resp = await fetch(rsBase + '/remediation/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rosterToken },
      body: JSON.stringify({
        studentId: s.studentId,
        unit: unit,
        skill: skill,
        notes: notes || undefined,
        proposedBy: 'cockpit-popup',
      }),
    });
    var j = await resp.json().catch(function () { return {}; });
    if (resp.status === 503) {
      statusEl.textContent = (j && j.error) || 'Remediation table not provisioned.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    if (!resp.ok || !j.ok) {
      statusEl.textContent = (j && j.error) || ('HTTP ' + resp.status);
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    statusEl.textContent = 'Proposed (' + (j.assignmentId || 'ok') + ').';
    statusEl.classList.add('is-success');
    setTimeout(_closeAvatarPopup, 1200);
  } catch (err) {
    statusEl.textContent = 'Network error: ' + (err && err.message ? err.message : 'unknown');
    statusEl.classList.add('is-error');
    btn.disabled = false;
  }
}

// P11: inline Override Gate submission. Reuses P5's /teacher/lesson-unlock.
async function _submitInlineGate() {
  if (!_avatarPopupStudent) return;
  var s = _avatarPopupStudent;
  var lessonKey = document.getElementById('ap-gate-key').value.trim();
  var reason = document.getElementById('ap-gate-reason').value.trim();
  var statusEl = document.getElementById('ap-gate-status');
  var btn = document.getElementById('ap-gate-submit');
  statusEl.classList.remove('is-error', 'is-success');
  if (!lessonKey || !/^\d+\.\d+$/.test(lessonKey)) {
    statusEl.textContent = 'Lesson key must look like "1.7" or "5.3".';
    statusEl.classList.add('is-error');
    return;
  }
  if (!s.username) {
    statusEl.textContent = 'Student username not loaded -- refresh + try again.';
    statusEl.classList.add('is-error');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Overriding...';

  try {
    var rsBase = (typeof window.ROSTER_SERVICE_URL === 'string') ? window.ROSTER_SERVICE_URL : '';
    var rosterToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (!rsBase || !rosterToken) {
      statusEl.textContent = 'Not signed in -- cannot submit.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    var resp = await fetch(rsBase + '/teacher/lesson-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rosterToken },
      body: JSON.stringify({
        studentUsername: s.username,
        lessonKey: lessonKey,
        reason: reason || undefined,
      }),
    });
    var j = await resp.json().catch(function () { return {}; });
    if (resp.status === 503) {
      statusEl.textContent = (j && j.error) || 'lesson_unlock table not provisioned.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    if (!resp.ok || !j.ok) {
      statusEl.textContent = (j && j.error) || ('HTTP ' + resp.status);
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    statusEl.textContent = 'Override saved.';
    statusEl.classList.add('is-success');
    setTimeout(_closeAvatarPopup, 1000);
  } catch (err) {
    statusEl.textContent = 'Network error: ' + (err && err.message ? err.message : 'unknown');
    statusEl.classList.add('is-error');
    btn.disabled = false;
  }
}
```

### 4.3 Wire-up additions

Inside the popup's existing DOMContentLoaded wiring block, add:

```js
// P11: inline view submit + back button wiring.
var nudgeSend = document.getElementById('ap-nudge-send');
if (nudgeSend) nudgeSend.addEventListener('click', _submitInlineNudge);
var remSubmit = document.getElementById('ap-rem-submit');
if (remSubmit) remSubmit.addEventListener('click', _submitInlineRemediation);
var gateSubmit = document.getElementById('ap-gate-submit');
if (gateSubmit) gateSubmit.addEventListener('click', _submitInlineGate);
// Back buttons delegate via data-ap-back.
popup.addEventListener('click', function (e) {
  var backBtn = e.target.closest('[data-ap-back]');
  if (!backBtn) return;
  _switchAvatarPopupView(backBtn.getAttribute('data-ap-back'));
});
```

### 4.4 Reposition after view switch

The popup grows from 220 px to 280 px when expanded. Without a
reposition, the popup might overflow the viewport. After
`_switchAvatarPopupView`, recompute the position via the existing
`_computeAvatarPopupPos` helper using the cached sprite position.

This requires `_avatarPopupSpritePos` (the canvas-local sprite
coords at popup open time) -- add it as state alongside
`_avatarPopupStudent`:

```js
var _avatarPopupSpritePos = null;  // canvas-local { x, y } at open time
```

Set it inside `_openAvatarPopup`. Use it inside `_switchAvatarPopupView`:

```js
function _switchAvatarPopupView(view) {
  // ... existing logic above ...
  // Reposition to keep popup visible after width change.
  if (boardHandle && _avatarPopupSpritePos) {
    var canvas = boardHandle.getCanvas();
    if (canvas) {
      var pos = _computeAvatarPopupPos(canvas, _avatarPopupSpritePos.x, _avatarPopupSpritePos.y);
      popup.style.left = pos.x + 'px';
      popup.style.top = pos.y + 'px';
    }
  }
}
```

## 5. Tests: `tests/avatar-popup-inline-expansions.test.js`

Vitest + jsdom + vm sandbox.

**describe('P11 DOM scaffolding')**
- `#avatar-popup` has `data-view` attribute defaulting to "main".
- The 4 `.ap-view` divs exist with `data-ap-view` of main, nudge, remediation, gate.
- Each form view has its expected inputs + status div + submit + back buttons.
- The CSS rule for `.avatar-popup[data-view="nudge"]` (etc.) defines the 280 px width.

**describe('View switching')**
- `_switchAvatarPopupView('nudge')` updates `data-view` + hides main + shows nudge.
- `_switchAvatarPopupView('main')` (back button delegated path) reverses.
- `_closeAvatarPopup` resets view to main + clears all input values.

**describe('Inline Send Nudge submit')**
- Empty textarea -> status "Type a message first."; no fetch fires.
- Filled textarea + WS-up + roster-token -> sendMessage fires with `recipientUsernames=[username]`; status "Sent."; popup auto-closes.
- WS-down -> status "Not connected -- nudge not delivered."; popup stays open; button re-enabled.

**describe('Inline Apply Remediation submit')**
- Missing unit -> status error; no fetch.
- Invalid unit ("abc") -> status error; no fetch.
- Missing skill -> status error; no fetch.
- Missing studentId -> status error; no fetch.
- Valid unit + skill + studentId -> POST /remediation/propose with the correct body shape. 200 success -> "Proposed (<id>)." -> auto-close.
- 503 -> error status; no auto-close.

**describe('Inline Override Gate submit')**
- Invalid lesson key (e.g. "abc") -> status error; no fetch.
- Missing username -> status error; no fetch.
- Valid key + WS+roster -> POST /teacher/lesson-unlock with `studentUsername` + `lessonKey` + optional `reason`. 200 -> "Override saved." -> auto-close.

Test count target: 18-24.

## 6. What is explicitly OUT of P11

- **Adding new endpoints** -- all three submits reuse the existing
  ones from P3 / P4b / P5.
- **Validation parity with the dashboard remediation modal** --
  the popup's remediation form is intentionally LIGHTER (no skill
  dropdown, no preview); the full modal still lives in the
  dashboard for in-depth editing.
- **Override-gate revocation inline** -- the popup only supports
  setting an unlock; revoking happens in the dashboard drawer (P6).
- **Save form-state across popup re-opens** -- close + reopen
  resets to `main` view + blank inputs. Intentional.
- **Popup animations on view-switch** -- view switch is instant.
  P10's open animation still fires on `display:none -> display:block`.

## 7. Smoke checks

1. `cd roster-server && npm test` -- 589/589 unchanged.
2. `npm test` from root -- expect +18-24 cases. 1 known
   study-guide.test.js fail unchanged.
3. **Manual cockpit**: click an avatar -> popup opens at main view.
   Click Send nudge -> popup expands inline. Type a message + Send
   -> nudge delivered + popup closes. Re-click avatar + Apply
   remediation -> form expands. Submit. Same for Override gate.

## 8. Dispatch

ONE Sonnet agent. Prompt embeds Sections 2-5 verbatim + a strong
reminder to use Edit-not-Write on teacher-classroom.html (P9 BOM
lesson).

After return: planner smoke + Codex review + fold + commit + push.

## 9. Notes for the build agent

- **ASCII-only**. P6 + P7 + P8 + P9 BLOCKER lesson FOUR TIMES.
- **USE EDIT TOOL** for teacher-classroom.html. NEVER WRITE.
- **Stage own paths only**.
- **P9 popup behavior MUST stay intact** for main-view actions
  (View as / View grade / View recent / etc.); the test
  `tests/avatar-popup-cockpit.test.js` MUST stay passing.

## 10. Recall on reload

- P9 BUILD documents the popup this extends.
- P3 / P4b / P5 BUILDs document the three endpoints the inline
  submits reuse.
- P10 BUILD: the layer just below this; idMap re-hydration helps
  the Apply Remediation flow (needs studentId).
