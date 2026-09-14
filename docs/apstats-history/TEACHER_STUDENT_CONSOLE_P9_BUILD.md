# Teacher -> Student Console -- Phase 9 (Floating Avatar Popup) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements spec §4.1 "Live-mode
> floating popup" -- item #2 of session-112's NEXT queue. Closes the
> last big spec section the s112 P1-P5 ship intentionally deferred.
> Subsumes item #8 (single-student avatar popup).
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` (section 4.1 + 4.2 + 4.3 +
> section 5 action inventory). Sibling BUILDs: P1 (the drawer the
> popup routes to), P2 (the View-as flow), P5 (the override-gate
> flow), P6 (the Apply Remediation modal the popup routes to), P7
> (the nudge-history surface the drawer carries).
>
> NO new migration. NO new server endpoint -- all actions route to
> existing surfaces via cross-tab query params.

## 0. Scope

In the cockpit's Live mode, clicking on a student avatar (when NOT in
P4 Select-Students mode) opens a small floating popup positioned
next to the avatar. The popup carries 6 action buttons:

| Button | What it does |
|---|---|
| View as student | Opens the Desk in a new tab with `?viewAsUserId=<sid>` (existing P2 flow). |
| View grade | Opens the dashboard in a new tab with `?openDrawerFor=<sid>` (NEW query param -- auto-opens the P1 drawer for that student). |
| View recent | Same target as View grade (the drawer's Recent Submissions section is on the same surface). |
| Send nudge | Closes the popup, scrolls the nudge panel into view, pre-selects the dropdown to the clicked student, and focuses the textarea. Pure in-cockpit; no new tab. |
| Apply remediation | Opens the dashboard in a new tab with `?openDrawerFor=<sid>&openRemediation=1` (auto-opens the drawer AND the P6 Apply-Remediation modal). |
| Override gate | Opens the Desk in a new tab with `?viewAsUserId=<sid>&autoOpenOverride=1` (auto-opens the P5 override modal once view-as has hydrated). |

ESC closes the popup. Click outside the popup also closes it.
Re-clicking the same avatar toggles (closes if open, opens if closed).
Clicking a DIFFERENT avatar repositions the popup to the new sprite.

P4 (Select Students mode) wins precedence: when select mode is
active, avatar clicks go to selection, NOT the popup. Existing P4
behavior unchanged.

Spec §4.1 also called for inline "Send nudge" expansion + inline
modals for remediation/override. P9's MVP punts those to follow-up
polish -- all 6 actions resolve via cross-tab routing or pre-fill of
the existing cockpit panel. The frame for inline expansion exists
(the popup DOM is in the cockpit DOM); a future phase can swap
buttons for inline forms.

## 1. File ownership (disjoint -> three waves run in parallel)

| Wave | Files                                                                                                                                                                            | Touched by |
|------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| A    | `classroom-board.js` (always-fire onAvatarClick), `teacher-classroom.html` (popup DOM + CSS + JS + send-nudge pre-fill), `tests/avatar-popup-cockpit.test.js` (NEW)                | Sonnet     |
| B    | `teacher-dashboard.html` (`?openDrawerFor=` + `?openRemediation=` URL-param readers), `tests/teacher-student-console-dashboard-deeplink.test.js` (NEW)                             | Sonnet     |
| C    | `ap_stats_roadmap_square_mode.html` (`?autoOpenOverride=1` URL-param reader inside the existing view-as bootstrap), `tests/desk-auto-open-override.test.js` (NEW)                  | Sonnet     |

No file appears in more than one wave. Each wave's tests stub the
cross-page behavior via jsdom + query-param simulation; no wave runs
the live integration. Codex review happens after all three return.

## 2. Wave A -- cockpit popup

### 2.1 classroom-board.js

Current `canvas.addEventListener('click', ...)` (around line 1492):

```js
if (!selectModeActive || !onAvatarClick) return;
```

CHANGE TO: always fire `onAvatarClick` when one is registered, passing
the hit info AND a `selectMode` flag so the cockpit can decide its
behavior:

```js
if (!onAvatarClick) return;
var hit = /* existing 40x40 hit-test logic, unchanged */;
if (hit) {
  try { onAvatarClick({ ...hit, selectMode: selectModeActive }); } catch (_) {}
}
```

Existing P4 behavior is preserved because the cockpit's
`onAvatarClick` callback already checks `_selectModeActive` and routes
to selection toggling. P9 adds an `else` branch: when NOT select
mode, open the popup.

NO change to any other classroom-board.js method.

### 2.2 teacher-classroom.html -- popup DOM

Insert directly inside the body, BEFORE `<script>` blocks (around
line 600 -- after the existing cockpit panels):

```html
<!-- P9: Floating avatar popup (TEACHER_STUDENT_CONSOLE_SPEC.md section 4.1). -->
<div id="avatar-popup" class="avatar-popup" style="display:none" role="dialog" aria-hidden="true">
  <button type="button" class="ap-close" id="avatar-popup-close" aria-label="Close popup">&times;</button>
  <div class="ap-header">
    <strong class="ap-name" id="avatar-popup-name">Student</strong>
    <span class="ap-meta" id="avatar-popup-meta"></span>
  </div>
  <div class="ap-actions">
    <button type="button" class="ap-action" data-ap-action="view-as">View as student</button>
    <button type="button" class="ap-action" data-ap-action="view-grade">View grade</button>
    <button type="button" class="ap-action" data-ap-action="view-recent">View recent</button>
    <button type="button" class="ap-action" data-ap-action="send-nudge">Send nudge</button>
    <button type="button" class="ap-action" data-ap-action="apply-remediation">Apply remediation</button>
    <button type="button" class="ap-action" data-ap-action="override-gate">Override gate</button>
  </div>
</div>
```

### 2.3 CSS

Append to existing `<style>` block:

```css
/* P9: Floating avatar popup (TEACHER_STUDENT_CONSOLE_SPEC.md section 4.1). */
.avatar-popup {
  position: fixed;
  z-index: 10000;
  width: 220px;
  background: var(--sg-bg-card, #fffbe6);
  border: 1px solid var(--sg-border, #d97706);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
  padding: 10px 12px;
  font: 13px "Geneva", "Lucida Grande", system-ui, sans-serif;
}
.avatar-popup .ap-close {
  position: absolute; top: 6px; right: 8px;
  background: transparent; border: 0; cursor: pointer;
  font-size: 18px; line-height: 1; color: var(--sg-text-dim, #5a5045);
  padding: 0 4px;
}
.avatar-popup .ap-header {
  display: flex; flex-direction: column; gap: 2px;
  margin-bottom: 8px; padding-right: 22px;
  border-bottom: 1px solid var(--sg-border, #d97706);
  padding-bottom: 6px;
}
.avatar-popup .ap-name { color: var(--sg-accent, #92400e); font-size: 0.92rem; }
.avatar-popup .ap-meta { color: var(--sg-text-dim, #5a5045); font-size: 0.78rem; }
.avatar-popup .ap-actions { display: grid; gap: 4px; }
.avatar-popup .ap-action {
  text-align: left; padding: 6px 10px;
  font: inherit; cursor: pointer;
  background: var(--sg-bg, #fff);
  border: 1px solid var(--sg-border, #d97706);
  border-radius: 4px;
}
.avatar-popup .ap-action:hover {
  background: var(--sg-bg-card, #fff5d6);
  border-color: var(--sg-accent, #92400e);
}
.avatar-popup .ap-action[disabled] { opacity: 0.5; cursor: not-allowed; }
```

### 2.4 JS

Add helpers near the existing nudge panel helpers (right after the
P8 broadcast wiring around line 2175):

```js
// P9: Floating avatar popup helpers (TEACHER_STUDENT_CONSOLE_SPEC.md section 4.1).
// Single-state singleton; one popup at a time. Opened by avatar click in
// Live mode (when NOT in Select-Students mode).

var _avatarPopupStudent = null;  // { username, realName, section, studentId }

function _openAvatarPopup(hit, screenPos) {
  // hit: { username, screenX, screenY } from classroom-board onAvatarClick.
  // screenPos: precomputed viewport position { x, y } for the popup.
  var popup = document.getElementById('avatar-popup');
  if (!popup) return;
  // Resolve identity via the current section's nameMap + member lookup.
  var realName = (currentNameMap && currentNameMap[hit.username]) ? currentNameMap[hit.username] : hit.username;
  var section = (_lastSummary && _lastSummary.section) || '';
  // student_id is NOT in the cockpit's roster map by default. The popup
  // routes via username/section for nudge + view-as (which the Desk
  // resolves via /viewAsUserId=studentId NOT username). For routes that
  // need studentId, fetch from the section's nameMap-with-ids if available;
  // otherwise pass username and let the dashboard/Desk resolve.
  _avatarPopupStudent = {
    username: hit.username,
    realName: realName,
    section: section,
    studentId: (currentIdMap && currentIdMap[hit.username]) ? currentIdMap[hit.username] : null,
  };
  document.getElementById('avatar-popup-name').textContent = realName;
  document.getElementById('avatar-popup-meta').textContent =
    '@' + hit.username + (section ? ' -- ' + section : '');
  popup.style.left = screenPos.x + 'px';
  popup.style.top = screenPos.y + 'px';
  popup.style.display = 'block';
  popup.setAttribute('aria-hidden', 'false');
}

function _closeAvatarPopup() {
  var popup = document.getElementById('avatar-popup');
  if (!popup) return;
  popup.style.display = 'none';
  popup.setAttribute('aria-hidden', 'true');
  _avatarPopupStudent = null;
}

function _avatarPopupIsOpen() {
  var popup = document.getElementById('avatar-popup');
  return !!(popup && popup.style.display !== 'none');
}

// Position the popup next to a canvas-local sprite position, with edge
// auto-flip. canvas is the cockpit's classroom canvas; (sx, sy) are
// canvas-local sprite coords.
function _computeAvatarPopupPos(canvas, sx, sy) {
  var rect = canvas.getBoundingClientRect();
  var popup = document.getElementById('avatar-popup');
  var popupW = popup ? popup.offsetWidth || 220 : 220;
  var popupH = popup ? popup.offsetHeight || 200 : 200;
  // Default: place to the RIGHT of the sprite, vertically centered.
  var x = rect.left + sx + 24;
  var y = rect.top + sy - popupH / 2;
  // Flip horizontally if the popup would go off the right edge.
  if (x + popupW > window.innerWidth - 8) {
    x = rect.left + sx - popupW - 24;
  }
  // Clamp vertical so it stays in viewport.
  if (y < 8) y = 8;
  if (y + popupH > window.innerHeight - 8) y = window.innerHeight - popupH - 8;
  return { x: x, y: y };
}

// Wire avatar-click to popup vs select-toggle. Replaces the P4-only
// onAvatarClick handler at the mount call site.
function _handleAvatarClickRouted(hit) {
  // P4 wins precedence.
  if (_selectModeActive) {
    if (typeof _toggleSelectedAvatar === 'function') _toggleSelectedAvatar(hit.username);
    return;
  }
  // Toggle: same-avatar click closes; different-avatar click repositions.
  if (_avatarPopupIsOpen() && _avatarPopupStudent && _avatarPopupStudent.username === hit.username) {
    _closeAvatarPopup();
    return;
  }
  // Resolve sprite screen position via the board handle.
  var pos = (boardHandle && typeof boardHandle.getSpritePosition === 'function')
    ? boardHandle.getSpritePosition(hit.username) : null;
  var canvas = (boardHandle && typeof boardHandle.getCanvas === 'function')
    ? boardHandle.getCanvas() : null;
  if (!pos || !canvas) return;
  var screenPos = _computeAvatarPopupPos(canvas, pos.x, pos.y);
  _openAvatarPopup(hit, screenPos);
}

// Action button handlers. The actions resolve to cross-tab routing or
// in-cockpit pre-fill, never inline modals (deferred polish).
function _handleAvatarPopupAction(action) {
  if (!_avatarPopupStudent) return;
  var s = _avatarPopupStudent;
  var sid = s.studentId;
  var uname = s.username;
  switch (action) {
    case 'view-as':
      if (sid) window.open('./ap_stats_roadmap_square_mode.html?viewAsUserId=' + encodeURIComponent(sid), '_blank', 'noopener');
      break;
    case 'view-grade':
    case 'view-recent':
      if (sid) window.open('./teacher-dashboard.html?openDrawerFor=' + encodeURIComponent(sid), '_blank', 'noopener');
      break;
    case 'send-nudge':
      _prefillNudgePanelForStudent(uname);
      _closeAvatarPopup();
      return;  // do NOT close at the end (already closed)
    case 'apply-remediation':
      if (sid) window.open('./teacher-dashboard.html?openDrawerFor=' + encodeURIComponent(sid) + '&openRemediation=1', '_blank', 'noopener');
      break;
    case 'override-gate':
      if (sid) window.open('./ap_stats_roadmap_square_mode.html?viewAsUserId=' + encodeURIComponent(sid) + '&autoOpenOverride=1', '_blank', 'noopener');
      break;
  }
  _closeAvatarPopup();
}

// Pre-fill the existing nudge panel for the clicked student. Sets the
// dropdown value (NOT broadcast mode), then focuses the textarea.
function _prefillNudgePanelForStudent(username) {
  // Ensure broadcast is off so the dropdown is functional.
  var bcastBox = document.getElementById('nudge-broadcast');
  if (bcastBox && bcastBox.checked) {
    bcastBox.checked = false;
    if (typeof _nudgeBroadcastActive !== 'undefined') _nudgeBroadcastActive = false;
    var sel0 = document.getElementById('nudge-recipient');
    if (sel0) sel0.classList.remove('nudge-recipient-broadcast-dim');
  }
  var sel = document.getElementById('nudge-recipient');
  if (sel) {
    sel.disabled = false;
    sel.value = username;
  }
  var text = document.getElementById('nudge-text');
  if (text) {
    text.focus();
    try { text.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  }
  if (typeof _updateNudgeSendButton === 'function') _updateNudgeSendButton();
}
```

Wire `_handleAvatarClickRouted` into the `ClassroomBoard.mount` call
(replaces the existing P4-only handler at line ~932). The existing
P4 wiring at line 940+ MUST be reworked so it doesn't conflict --
specifically, the `onAvatarClick` callback now ALWAYS fires, and the
cockpit's handler decides between select-toggle and popup-open.

Add the popup's button click handlers + close behavior on DOMContentLoaded:

```js
document.addEventListener('DOMContentLoaded', function () {
  // Wire close button.
  var closeBtn = document.getElementById('avatar-popup-close');
  if (closeBtn) closeBtn.addEventListener('click', _closeAvatarPopup);

  // Wire action buttons via delegated click on the popup.
  var popup = document.getElementById('avatar-popup');
  if (popup) {
    popup.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ap-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-ap-action');
      if (action) _handleAvatarPopupAction(action);
    });
  }

  // ESC closes the popup.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _avatarPopupIsOpen()) {
      e.stopPropagation();
      _closeAvatarPopup();
    }
  }, true);

  // Click outside the popup closes it.
  document.addEventListener('click', function (e) {
    if (!_avatarPopupIsOpen()) return;
    var popup = document.getElementById('avatar-popup');
    if (popup && !popup.contains(e.target)) {
      // BUT: ignore clicks on the canvas (which already routes via the
      // canvas's own click handler -- it will toggle/reposition on its own).
      var canvas = (boardHandle && typeof boardHandle.getCanvas === 'function')
        ? boardHandle.getCanvas() : null;
      if (canvas && canvas.contains(e.target)) return;
      _closeAvatarPopup();
    }
  }, true);
});
```

### 2.5 Tests: `tests/avatar-popup-cockpit.test.js`

Vitest + jsdom + vm sandbox (same pattern as `tests/broadcast-nudge-cockpit.test.js`). Required cases:

**describe('Popup DOM presence')**
- `#avatar-popup` exists and is hidden by default.
- 6 action buttons with the correct `data-ap-action` values.
- Close button exists.
- `.avatar-popup` CSS class is defined.

**describe('Open/close lifecycle')**
- Calling `_openAvatarPopup({username, ...}, {x:100, y:200})` sets `display:block` + populates name + meta.
- Calling `_closeAvatarPopup()` hides it + clears `_avatarPopupStudent`.
- `_avatarPopupIsOpen()` returns the correct boolean.

**describe('Position computation')**
- `_computeAvatarPopupPos(canvas, sx, sy)` with canvas bounds + sprite at center returns x = `rect.left + sx + 24`, y = `rect.top + sy - 100` (popup height 200, vertically centered).
- Sprite near right edge -> popup flips to left of sprite.
- Sprite near top edge -> y clamped to 8.

**describe('Click routing')**
- `_handleAvatarClickRouted({username: 'X'})` with `_selectModeActive=false` calls `_openAvatarPopup`.
- Same call with `_selectModeActive=true` does NOT open popup (routes to select).
- Same-avatar repeat click toggles closed.
- Different-avatar click repositions (closes prior + opens new).

**describe('Action routing')**
- `_handleAvatarPopupAction('view-as')` opens `?viewAsUserId=<sid>` in new tab.
- `_handleAvatarPopupAction('view-grade')` opens `?openDrawerFor=<sid>`.
- `_handleAvatarPopupAction('apply-remediation')` opens `?openDrawerFor=<sid>&openRemediation=1`.
- `_handleAvatarPopupAction('override-gate')` opens `?viewAsUserId=<sid>&autoOpenOverride=1`.
- `_handleAvatarPopupAction('send-nudge')` sets `#nudge-recipient.value` to the student, focuses textarea, closes popup, does NOT open a new tab.

**describe('Send-nudge pre-fill side effects')**
- If broadcast is currently active, pre-fill clears it (unchecks checkbox + removes dim class + sets `_nudgeBroadcastActive = false`).
- Dropdown's `disabled` attr is cleared.

Test count target: 18-24.

## 3. Wave B -- dashboard deep-link

### 3.1 `?openDrawerFor=<studentId>` + `?openRemediation=1`

In `teacher-dashboard.html`, add a DOMContentLoaded handler that
reads the URL query params + auto-opens the drawer:

```js
// P9: deep-link via URL params (TEACHER_STUDENT_CONSOLE_P9_BUILD.md section 3).
// ?openDrawerFor=<sid> -> fetch profile + open drawer
// ?openRemediation=1   -> after drawer opens, click the Apply Remediation button
document.addEventListener('DOMContentLoaded', function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var deeplinkSid = params.get('openDrawerFor');
    var deeplinkRemediation = params.get('openRemediation') === '1';
    if (!deeplinkSid) return;
    // Wait for the teacher secret + auth to be ready. The simplest path:
    // fetch the profile endpoint with whatever auth is currently set.
    // If 401, prompt the teacher to enter the secret then retry.
    function tryOpen() {
      var headers = teacherAuthHeaders();
      return fetch(svcUrl() + '/teacher/student/' + encodeURIComponent(deeplinkSid) + '/profile', { headers: headers })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (j) {
          if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'profile load failed');
          openTscDrawer({
            studentId: j.studentId,
            username: j.username,
            realName: j.realName,
            section: j.section,
          });
          if (deeplinkRemediation) {
            // Wait for the drawer animation + the modal-button wiring to be ready.
            setTimeout(function () {
              var btn = $('tsc-action-remediation');
              if (btn && !btn.disabled) btn.click();
            }, 250);
          }
        })
        .catch(function (err) {
          // If the secret is missing, the teacher will enter it manually and can
          // re-click the link. Don't blow up the page.
          console.warn('[deeplink] could not open drawer for', deeplinkSid, ':', err.message);
        });
    }
    // Allow the rest of the page to render first.
    setTimeout(tryOpen, 50);
  } catch (_) {}
});
```

### 3.2 Tests: `tests/teacher-student-console-dashboard-deeplink.test.js`

Vitest + jsdom. Mirror the existing dashboard test harness.

Required cases:

**describe('Deep-link DOM hooks')**
- The dashboard contains a DOMContentLoaded handler that reads `URLSearchParams`.
- The handler references `openDrawerFor` + `openRemediation` param names.

**describe('?openDrawerFor= behavior')**
- Loading with `?openDrawerFor=stu_123` triggers a fetch to `/teacher/student/stu_123/profile`.
- On 200 success, `openTscDrawer` is called with the student stub from the profile response.
- On 401, the failure is logged + the page does not crash.
- Without the query param, no extra fetch fires (regression).

**describe('?openRemediation=1 behavior')**
- After the drawer opens via `?openDrawerFor=...&openRemediation=1`, the `#tsc-action-remediation` button is clicked.
- The remediation modal opens.

Test count target: 8-12.

## 4. Wave C -- Desk auto-open override

### 4.1 `?autoOpenOverride=1`

In `ap_stats_roadmap_square_mode.html`, extend the existing
`_viewAsBootstrap` IIFE (the one that handles `?viewAsUserId=`)
to also detect `?autoOpenOverride=1`. After the view-as banner
renders, click the override button.

The view-as bootstrap currently runs SYNCHRONOUSLY before the page
renders. The override button is created later as part of the banner.
Approach: stash a sessionStorage flag, then in the existing P5
override-gate setup, check the flag + auto-click after the
banner DOM is ready.

```js
// In _viewAsBootstrap (top of file, before any async work):
try {
  var params = new URLSearchParams(window.location.search);
  if (params.get('autoOpenOverride') === '1') {
    sessionStorage.setItem('apstats_auto_open_override', '1');
  }
} catch (_) {}

// After the view-as banner is rendered (existing P5 setup code),
// before the existing override-button event handler wiring:
try {
  if (sessionStorage.getItem('apstats_auto_open_override') === '1') {
    sessionStorage.removeItem('apstats_auto_open_override');
    setTimeout(function () {
      var btn = document.getElementById('view-as-override-gate');
      if (btn) btn.click();
    }, 300);
  }
} catch (_) {}
```

The `apstats_auto_open_override` flag is one-shot -- removed
immediately after the auto-click fires so a refresh doesn't re-open
the modal.

### 4.2 Tests: `tests/desk-auto-open-override.test.js`

Vitest + jsdom. Read the Desk HTML, eval the inline script in a
sandbox, simulate `?autoOpenOverride=1` via `window.location.search`.

Required cases:

**describe('Auto-open override bootstrap')**
- With `?autoOpenOverride=1`, sessionStorage gains the `apstats_auto_open_override` flag.
- Without the param, the flag stays absent.
- After the click fires (on a stubbed override button), the flag is REMOVED so a refresh doesn't re-fire.

**describe('Source presence')**
- The Desk source contains the `autoOpenOverride` query param read.
- The Desk source contains the `apstats_auto_open_override` sessionStorage key.

Test count target: 6-10.

## 5. What is explicitly OUT of P9

- **Inline expansion of Send Nudge into a popup textarea.** Spec
  §4.1 calls for this; MVP punts to a follow-up. P9 pre-fills the
  existing cockpit panel instead.
- **Inline Apply Remediation modal inside the popup.** Spec §4.1
  again; MVP routes to the dashboard's existing P6 modal in a new
  tab. The deep-link auto-opens it.
- **Inline Override Gate modal inside the popup.** Same -- routes
  to the Desk's existing P5 modal in view-as mode.
- **Disabling action buttons contextually** (e.g. greying out
  "Apply remediation" when the lesson the student is on doesn't have
  a remediation path). Spec §4.1 mentions it; out of MVP scope.
- **Inline drawer for /class/grades clicks** (spec §4.2). Already
  shipped in P1; this BUILD only adds the Live-mode popup half.
- **Real-name overhead labels on avatars** (spec §4.3). Out of scope;
  the popup header carries the real name, which is enough for v1.
- **Animation transitions** on popup open/close. Plain show/hide.
- **studentId resolution for usernames that aren't yet in the
  cockpit's currentIdMap.** Wave A skips actions that need studentId
  if the mapping isn't loaded; the user can refresh + retry. A
  proper fix would proactively hydrate the cockpit's roster-with-ids
  cache.

## 6. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- expect zero new cases (no
   server change). 589/589 unchanged.
2. `npm test` from repo root -- expect +32-46 new cases across the
   three waves. Total fails unchanged from 5229/5230 baseline.
3. **Manual cockpit**: open the cockpit in Live mode with at least
   one student avatar; click the avatar -> popup appears next to
   sprite. Test all 6 actions.
4. **Manual cross-tab**: clicking "View grade" should open a new
   tab to the dashboard with the drawer pre-opened.

## 7. Dispatch instructions

Three Sonnet agents dispatched in parallel. Each prompt embeds the
relevant section verbatim + parent SPEC §4.1.

After all three return:
1. Planner runs smoke (section 6).
2. Cross-agent.py to Codex (review, read-only, 540s).
3. Fold findings.
4. ONE commit: `feat: Teacher Student Console Phase 9 (floating popup)`.

## 8. Notes for build agents

- **PowerShell 5.1 + git** -- Bash heredoc for commits.
- **Stage own paths only**.
- **ASCII-only**: NO `§`, NO box-drawing chars, NO curly quotes.
  The P6 + P7 + P8 BLOCKER lessons reinforced.
- **Sacred files**: do NOT touch `curriculum_render/data/curriculum.js`,
  `canvas_engine.js`, `sprite_sheet.js`.
- **classroom-board.js is follow-alongs-native** (does NOT exist in
  cr per s112 memory). Safe to modify directly.
- **Existing P4 select-mode behavior MUST stay intact**. Wave A's
  classroom-board.js change widens onAvatarClick to always fire;
  the cockpit's handler MUST still route to selection when
  `_selectModeActive` is true.

## 9. Recall on reload

- Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` section 4.1.
- P1 BUILD: the drawer the popup deep-links to.
- P2 BUILD: the Desk view-as flow.
- P4 BUILD: the existing onAvatarClick wiring + the select-mode
  precedence rule.
- P5 BUILD: the override-gate modal the popup auto-triggers.
- P6 BUILD: the Apply Remediation modal the popup deep-links to.
- P7 BUILD: the nudge-history surface (the drawer carries it).
- P8 BUILD: the broadcast toggle (P9's send-nudge pre-fill must
  clear the broadcast state).
