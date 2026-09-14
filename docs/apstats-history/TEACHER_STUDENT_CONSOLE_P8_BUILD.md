# Teacher -> Student Console -- Phase 8 (Broadcast Nudge) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements item #9 of session-112's
> NEXT queue. Adds a "Broadcast to all online students" toggle to the
> cockpit's nudge panel. NO new server endpoint, NO new DB column,
> NO migration -- the existing multi-recipient handling in P3 already
> supports a list; broadcast is purely a cockpit UX layer that
> auto-fills the recipient list with every currently-online student.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` (section 15 deferred items).
> Sibling BUILDs: P3 (the nudge plumbing this reuses), P4 (the
> select-students mode this layers alongside).
>
> NO Desk change. NO roster-server change. NO curriculum_render change.
> NO migration.

## 0. Scope

The cockpit's nudge panel (`teacher-classroom.html` lines 552-568)
currently has:
- a `<select id="nudge-recipient">` dropdown (one online student at a time)
- a `<textarea id="nudge-text">` (280 chars)
- a `<button id="btn-send-nudge">` that fires a single-recipient
  classroom_teacher_nudge WS message + a single-recipient
  /teacher/nudge POST

P8 adds a "Broadcast to all online students" checkbox that, when
checked:
- Visually disables (greys out, NOT hides) the recipient dropdown
- Shows a live count next to the toggle (e.g. "broadcast to 7 online")
- On Send: the WS message + POST both carry the complete list of
  currently-online student usernames (NOT `['*']` -- the cockpit
  resolves the list locally at send time)
- The status line on send reads "Broadcast sent to N (M delivered)"
  using the offline ack the server already returns

When unchecked, the dropdown behaves exactly as today (Phase 3).

No state persists across cockpit reloads -- broadcast is an
in-the-moment intent, not a saved preference.

## 1. File ownership (one wave -- cockpit-only)

| Wave | Files                                                                                                                                                                | Touched by |
|------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| Single | `teacher-classroom.html` (form row + helpers + _sendNudgeFromCockpit extension), `tests/broadcast-nudge-cockpit.test.js` (NEW)                                      | Sonnet     |

Only one wave because the change is entirely client-side. The
existing P3 server endpoints + cr WS handler already accept
multi-recipient payloads. Codex review still happens after.

## 2. Wave -- Cockpit broadcast toggle

### 2.1 DOM changes

In `teacher-classroom.html`, modify the nudge panel form. The current
markup is at lines 552-568. The change inserts a new form row between
the current recipient row and the message row, plus replaces the
recipient row with a wrapper that also tracks the broadcast state:

```html
<div class="form-row">
  <label for="nudge-recipient">Student</label>
  <select id="nudge-recipient" disabled>
    <option value="">(no students online)</option>
  </select>
</div>
<div class="form-row" id="nudge-broadcast-row">
  <label class="nudge-broadcast-toggle">
    <input type="checkbox" id="nudge-broadcast">
    <span>Broadcast to all online students</span>
    <span id="nudge-broadcast-count" class="hint" style="margin-left:6px"></span>
  </label>
</div>
```

The visual aesthetic: matches the existing `.form-row` + `.hint`
classes already in the file. NO new CSS file; one inline rule keeps
the toggle aligned:

```css
.nudge-broadcast-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.88rem; cursor: pointer; user-select: none;
}
.nudge-broadcast-toggle input { cursor: pointer; }
```

Append to the existing `<style>` block.

### 2.2 State + helpers

Add a module-level variable near `_nudgeIdSeq`:

```js
// P8: broadcast toggle state. Tracked at module scope so
// _updateNudgeSendButton + _refreshNudgeRecipients can both consult it.
var _nudgeBroadcastActive = false;
```

Extend `_refreshNudgeRecipients(summary)` (lines 1064-1093) to also
update the broadcast count label. The list of online students is
already computed; reuse it.

```js
function _refreshNudgeRecipients(summary) {
  var sel = document.getElementById('nudge-recipient');
  if (!sel) return;
  var members = (summary && summary.members) || {};
  var onlineStudents = Object.keys(members).filter(function (u) {
    var m = members[u];
    return m && m.role === 'student' && m.online !== false;
  });
  // ... existing dropdown population logic ...
  // After existing logic, ALSO update the broadcast count:
  var countEl = document.getElementById('nudge-broadcast-count');
  if (countEl) {
    countEl.textContent = onlineStudents.length === 0
      ? '(no students online)'
      : '(' + onlineStudents.length + ' online)';
  }
  // Stash the current online list on a module variable so
  // _sendNudgeFromCockpit can read it at send time without a re-walk.
  _nudgeLastOnlineList = onlineStudents.slice();
  _updateNudgeSendButton();
}
```

Add the `_nudgeLastOnlineList` declaration near `_nudgeBroadcastActive`:

```js
var _nudgeLastOnlineList = [];
```

### 2.3 Send-button gating

Replace `_updateNudgeSendButton` so it correctly enables the button
in broadcast mode (where the dropdown is empty but the broadcast list
isn't):

```js
function _updateNudgeSendButton() {
  var sel = document.getElementById('nudge-recipient');
  var text = document.getElementById('nudge-text');
  var btn = document.getElementById('btn-send-nudge');
  if (!sel || !text || !btn) return;
  var hasText = !!String(text.value || '').trim();
  if (_nudgeBroadcastActive) {
    btn.disabled = !hasText || _nudgeLastOnlineList.length === 0;
  } else {
    btn.disabled = !sel.value || !hasText;
  }
}
```

### 2.4 Toggle handler

When the checkbox flips:
- Update `_nudgeBroadcastActive`
- Visually disable/enable the dropdown via the `disabled` attr
- Re-run `_updateNudgeSendButton`

Wire on DOMContentLoaded (near the existing send-button wiring at
line 2062):

```js
var bcastBox = document.getElementById('nudge-broadcast');
if (bcastBox) {
  bcastBox.addEventListener('change', function () {
    _nudgeBroadcastActive = !!bcastBox.checked;
    var sel = document.getElementById('nudge-recipient');
    if (sel) {
      if (_nudgeBroadcastActive) {
        sel.setAttribute('disabled', '');
        sel.classList.add('nudge-recipient-broadcast-dim');
      } else {
        sel.removeAttribute('disabled');
        sel.classList.remove('nudge-recipient-broadcast-dim');
        // Re-run refresh so the dropdown re-enables only when there
        // are actually online students.
      }
    }
    _updateNudgeSendButton();
  });
}
```

The optional `.nudge-recipient-broadcast-dim` CSS class gives a
visual cue (greyed out) without hiding the dropdown -- the teacher
can still see who's online beneath the broadcast layer:

```css
.nudge-recipient-broadcast-dim { opacity: 0.45; }
```

### 2.5 Extend `_sendNudgeFromCockpit`

In the existing function (lines 1103-1173), the recipient list is
currently `[recipient]` (single). For broadcast, it becomes the full
online list:

```js
async function _sendNudgeFromCockpit() {
  var sel = document.getElementById('nudge-recipient');
  var textEl = document.getElementById('nudge-text');
  var status = document.getElementById('nudge-status');
  if (!sel || !textEl) return;
  var rawText = String(textEl.value || '').trim();
  if (!rawText) return;
  if (rawText.length > 280) rawText = rawText.slice(0, 280);

  // P8: resolve the recipient list. Broadcast -> the live online list
  // captured by the most recent _refreshNudgeRecipients. Single ->
  // the dropdown selection.
  var recipientList;
  if (_nudgeBroadcastActive) {
    recipientList = _nudgeLastOnlineList.slice();
    if (recipientList.length === 0) {
      if (status) {
        status.textContent = 'No students online -- nothing to broadcast.';
        setTimeout(function () { if (status) status.textContent = ''; }, 3500);
      }
      return;
    }
  } else {
    var recipient = sel.value;
    if (!recipient) return;
    recipientList = [recipient];
  }

  var nudgeId = _newNudgeId();
  var btn = document.getElementById('btn-send-nudge');
  if (btn) btn.disabled = true;

  // 1) Live delivery via the existing classroom WS.
  var wsSent = false;
  try {
    if (boardHandle && typeof boardHandle.sendMessage === 'function') {
      wsSent = !!boardHandle.sendMessage({
        type: 'classroom_teacher_nudge',
        nudgeId: nudgeId,
        recipientUsernames: recipientList,
        text: rawText
      });
    }
  } catch (_) { wsSent = false; }

  // 2) Log to roster-server. deliveredUsernames is the full list when
  // WS sent; empty when not. The server already supports multi-recipient
  // batches via insertNudges.
  try {
    var rsBase = (typeof window.ROSTER_SERVICE_URL === 'string') ? window.ROSTER_SERVICE_URL : '';
    var rosterToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (rsBase && rosterToken) {
      var resp = await fetch(rsBase + '/teacher/nudge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + rosterToken
        },
        body: JSON.stringify({
          nudgeId: nudgeId,
          recipientUsernames: recipientList,
          text: rawText,
          deliveredUsernames: wsSent ? recipientList : []
        })
      });
      var data = null;
      try { data = await resp.json(); } catch (_) {}
      if (status) {
        if (!wsSent) {
          status.textContent = 'Not connected -- nudge not delivered.';
        } else if (_nudgeBroadcastActive) {
          status.textContent = (data && data.ok)
            ? ('Broadcast sent to ' + recipientList.length + '.')
            : ('Broadcast sent to ' + recipientList.length + ' (log failed).');
        } else {
          status.textContent = (data && data.ok) ? 'Sent.' : 'Sent (log failed).';
        }
        setTimeout(function () { if (status) status.textContent = ''; }, 3500);
      }
    } else if (status) {
      if (!wsSent) {
        status.textContent = 'Not connected -- nudge not delivered.';
      } else if (_nudgeBroadcastActive) {
        status.textContent = 'Broadcast sent to ' + recipientList.length + ' (no log -- not signed in).';
      } else {
        status.textContent = 'Sent (no log -- not signed in).';
      }
      setTimeout(function () { if (status) status.textContent = ''; }, 3500);
    }
  } catch (_) {
    if (status) {
      status.textContent = wsSent ? 'Sent (log failed).' : 'Not connected -- nudge not delivered.';
      setTimeout(function () { if (status) status.textContent = ''; }, 3500);
    }
  }

  textEl.value = '';
  _updateNudgeSendButton();
}
```

### 2.6 Tests: `tests/broadcast-nudge-cockpit.test.js`

Vitest + jsdom + vm. Mirror the harness from
`tests/poll-archive-cockpit.test.js` (loads the cockpit's inline
script in a vm sandbox; per the s112 memory: jsdom doesn't provide
WebSocket, stub it; any new HTML element the cockpit references MUST
also be in the test's HTML scaffolding).

Required cases:

**describe('Broadcast toggle DOM')**
- `#nudge-broadcast` checkbox exists.
- `#nudge-broadcast-count` span exists.
- `.nudge-broadcast-toggle` CSS rule is defined.
- Default state: checkbox unchecked, `_nudgeBroadcastActive === false`.

**describe('Recipient count label')**
- After `_refreshNudgeRecipients(summary)` with 3 online students, the count label reads "(3 online)".
- With 0 online students, label reads "(no students online)".

**describe('Send button gating in broadcast mode')**
- Broadcast off, dropdown empty -> button disabled.
- Broadcast on, 0 online -> button disabled even if text present.
- Broadcast on, 3 online + text -> button enabled.

**describe('Toggle visual dim')**
- Toggling the checkbox on adds `.nudge-recipient-broadcast-dim` to the dropdown + sets the disabled attr.
- Toggling off removes the class + the disabled attr (when there are online students).

**describe('Broadcast send')**
- Broadcast checked + 3 online + text "ping" + click Send -> the WS sendMessage call carries `recipientUsernames` = the 3 online usernames (not a single one).
- The POST /teacher/nudge body also carries the same 3 usernames.
- Status text reads "Broadcast sent to 3." on success.

**describe('Broadcast with zero online')**
- Broadcast on, no students online, click Send -> no WS call, no fetch, status text "No students online -- nothing to broadcast."

**describe('Non-broadcast (regression)')**
- Broadcast off, dropdown=apple-fox, text "ping", Send -> single-recipient WS message + POST (the P3 behavior unchanged).

Test count target: 14-18.

## 3. What is explicitly OUT of P8

- **Section-level broadcast** (other sections). The toggle is "all online students in MY section." A cross-section broadcast is a separate spec, NOT P8 scope.
- **Scheduled / delayed broadcasts**. Send is immediate only.
- **Targeted subgroup broadcasts** (e.g. "all students who haven't completed lesson 5.3"). Out of scope; the existing Select-Students (P4) covers the manual subset case.
- **Broadcast acknowledgment summary** (which students opened the toast, replied, etc.). The existing `_renderNudgeAck` shows offline recipients; that already works for multi-recipient nudges, so broadcast inherits it for free.
- **Server-side `recipientUsernames: ['*']` wildcard expansion**. The cockpit resolves the list locally because it already has the online set via the classroom monitor stream. NO server change.
- **Persistence of the broadcast toggle state across cockpit reloads**. Broadcast is an in-the-moment intent.

## 4. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- no new cases (no server change). 589/589 unchanged.
2. `npm test` from repo root -- expect +14-18 cases. Total fails unchanged from 5205/5206 baseline (1 known study-guide fail).
3. **Manual**: open the cockpit on a live section with 2-3 online students; check Broadcast; type a message; Send. Verify all online students get the toast simultaneously + the audit log captures one nudgeId with N rows.

## 5. Dispatch instructions

One Sonnet agent (`general-purpose`). Prompt embeds Section 2
verbatim + the parent SPEC + P3 BUILD pointer.

After return:
1. Planner runs smoke (section 4).
2. Cross-agent.py to Codex (`task-type=review`, read-only, 540s
   timeout). Focus areas: toggle state lifecycle (cleared on
   refresh?), broadcast vs single send path divergence, status text
   correctness, zero-online edge case, P3 + P4 regression coverage,
   ASCII-only, sacred file guards.
3. Fold all findings.
4. Re-run tests.
5. ONE commit: `feat: Teacher Student Console Phase 8 (broadcast nudge)`.
6. Push.

## 6. Notes for the build agent

- **PowerShell 5.1 + git**: Bash heredoc for commits.
- **Stage own paths only**.
- **ASCII-only** (P6 + P7 lessons reinforced).
- **Cockpit test harness**: any new HTML element the cockpit
  references MUST be in the test's HTML scaffolding (otherwise
  `getElementById('foo').addEventListener` throws on null). Stub
  WebSocket.
- **The classroom monitor stream** is the source of truth for
  online students. `_refreshNudgeRecipients` runs on every
  `onStateChange`, so the broadcast count + the captured online list
  stay live.

## 7. Recall on reload

- Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` section 15.
- P3 BUILD documents the existing nudge plumbing. The server is
  already multi-recipient; broadcast is purely a cockpit UX layer.
- P4 BUILD documents the Select-Students mode (the manual subset
  flow that broadcast complements but does not replace).
- P7 BUILD documents the most recent cockpit-adjacent change (it was
  dashboard-only; P8 returns the attention to the cockpit).
