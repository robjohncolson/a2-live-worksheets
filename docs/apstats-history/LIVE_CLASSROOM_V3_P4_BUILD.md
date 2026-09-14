# LIVE_CLASSROOM_V3 P4 -- Build Contract (FROZEN)

Session 111, 2026-05-23. Design: `LIVE_CLASSROOM_V3_SPEC.md` Section 8.
Implements vote-with-your-feet -- the FIRST live data mode. Generalizes
the single GateDoor to N labelled `Doorway` entities; walking through +
pressing Up casts a vote; cockpit shows a live bar chart of choices.

P4 does NOT depend on P3's WebRTC transport. Vote messages are
infrequent (one per student per poll) and ride WS, mirroring the v2
poll pattern exactly. The WebRTC DataChannel from P3 stays for
position updates only.

This contract is FROZEN -- implement verbatim.

## Correction (Codex read-only review, session 111)

Codex found 1 BLOCKER + 4 MAJOR. All five folded inline.

- **BLOCKER (folded)**: `buildStatePayload` + `buildAllSectionsStatePayload`
  did not serialize `room.doorways`, AND `reset()` left `room.doorways`
  + every `member.doorVote` live (cleared only gate + poll + vote).
  Result: late-joiners / cockpit refreshes saw `doorways:null` even when
  the server was mid-session; a reset left server state divergent from
  client state. **Fold:** added `doorways: room.doorways || null` to
  both snapshot helpers; `reset()` now clears `room.doorways` + every
  `m.doorVote`.
- **MAJOR 1 (folded)**: cockpit's `_activeDoorwaysId` was set only by
  the local Open click; a refresh / second teacher couldn't drive Close
  because `_activeDoorwaysId` was null. **Fold:** the onStateChange
  callback now derives `_activeDoorwaysId` + Open/Close button
  visibility from `summary.doorways` on every state change. Combined
  with the BLOCKER snapshot fix, late-joiners hydrate cleanly.
- **MAJOR 2 (folded)**: `openDoorways` could overwrite an already-open
  session without clearing stale `member.doorVote`; a second open's
  first vote could no-op (same prior doorId) or use stale data.
  **Fold:** added `if (room.doorways) return { broadcasts: [] };` guard
  at the top of `openDoorways`; on accepted open, clear every member's
  `doorVote` (defense-in-depth, paired with the BLOCKER's reset fix).
- **MAJOR 3 (folded)**: gate mode + doorways mode were NOT mutually
  exclusive on the server -- an armed gate could remain live during
  doorways and students could trigger `classroom_checkin` instead of
  voting. **Fold:** `openDoorways` rejects when `room.gate.armed`;
  `armGate` rejects when `room.doorways`; `checkin` silently drops
  when `room.doorways`; `shouldShowCheckinButton` returns false when
  `state.doorways` is active.
- **MAJOR 4 (folded)**: the optimistic doorway walk left the local
  sprite at an off-canvas `targetX` in state='arrived'; no later code
  reset it. The natural clamp would bring it back to the canvas edge
  on the next non-walking update, but across close/reopen cycles the
  sprite could disappear permanently. **Fold:** the doorways close
  visibility hook now checks the local sprite's x; if it's outside
  the canvas, recenters it and resets state to 'idle'. The student
  can then walk freely with arrow keys.

Post-fold test counts unchanged (cr 934/935, fa 4941/4942) -- all five
folds preserved correctness without breaking existing tests; the new
behaviors are exercised by the impl tests already in place.

## Dependency analysis

Cross-repo. Four units; A, B, C are file-disjoint and run in parallel.

- **Unit A** (cr `railway-server/classroom.js` + `server.js`): server-side
  state + methods + handlers. Mirrors v2 poll structure but with a
  separate `room.doorways` slot mutually exclusive with `room.poll`.
- **Unit B** (`classroom-board.js`): board-side `_reduce` cases +
  `Doorway` entity (a re-use / generalisation of `GateDoor`) + the
  multi-hitbox onUpPressed check + drain-out animation.
- **Unit C** (`teacher-classroom.html`): cockpit UI -- a Doorways form
  (question + N options) + open/close/reset buttons + live bar chart
  via the existing `ti84-plot.js`. Archive on close (reuse the v2.1
  `archivePoll` path).
- **Unit T**: tests both repos.

## The contract -- verbatim

### C1. New WS messages

| Type                          | Direction         | Payload                                                                                                |
|-------------------------------|-------------------|--------------------------------------------------------------------------------------------------------|
| `classroom_open_doorways`     | Teacher -> all    | `{ id, question, options: [{ label, doorId }, ...], openedAt }`                                        |
| `classroom_doorway_vote`      | Student -> server | `{ id, doorId }`                                                                                       |
| `classroom_doorway_tally`     | Server -> all     | `{ id, tally: [{ doorId, count }, ...] }` -- broadcast after every vote                                |
| `classroom_close_doorways`    | Teacher -> all    | `{ id, tally: [{ doorId, count }, ...] }` -- final tally on close                                      |

The wire-level `id` is a string (e.g. `'doorways-1714765432'`) chosen
by the cockpit when opening. The server doesn't reuse the v2 poll's
`id` -- they're independent ID spaces (different message types).

### C2. classroom.js -- room state + methods

Add a new room field in `getOrCreateRoom`:

```js
doorways: null,   // v3 P4: { id, question, options: [{label, doorId, count}], openedAt } | null
```

(Insert as the last field before the closing `}` of the room literal,
alongside `live`, `poll`, etc. Reset in armGate / sweep is NOT needed --
doorways are an explicit action, not session state.)

New methods (place after `revealPoll`, before `position`):

```js
  // openDoorways(ws, id, question, options, now) -> { broadcasts }
  // Teacher-only. Rejects if a poll is open (mutual exclusion).
  // Initializes per-option count to 0; broadcasts to the room.
  function openDoorways(ws, id, question, options, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    if (room.poll) return { broadcasts: [] };  // mutual exclusion
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) return { broadcasts: [] };
    var safeId       = (typeof id === 'string' && id.trim()) ? id.trim() : ('doorways-' + (now || Date.now()));
    var safeQuestion = (typeof question === 'string') ? question.trim() : '';
    var optionsState = [];
    for (var i = 0; i < options.length; i++) {
      var o = options[i] || {};
      optionsState.push({
        label:  (typeof o.label === 'string') ? o.label.trim() : ('Option ' + String.fromCharCode(65 + i)),
        doorId: (typeof o.doorId === 'string' && o.doorId.trim()) ? o.doorId.trim() : ('d' + i),
        count:  0
      });
    }
    room.doorways = {
      id:       safeId,
      question: safeQuestion,
      options:  optionsState,
      openedAt: now == null ? Date.now() : now
    };
    // Reset each member's status to "present" (a fresh data mode).
    room.members.forEach(function(m) { m.status = 'present'; });
    var payload = {
      type:     'classroom_open_doorways',
      section:  entry.section,
      id:       safeId,
      question: safeQuestion,
      options:  optionsState.map(function(o) { return { label: o.label, doorId: o.doorId }; }),
      openedAt: room.doorways.openedAt
    };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // castDoorwayVote(ws, id, doorId, now) -> { broadcasts }
  // Student-only. Idempotent on a re-vote (the same student switching
  // doors moves their vote; one vote per student). Broadcasts the live
  // tally to the room + monitors.
  function castDoorwayVote(ws, id, doorId, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'student') return { broadcasts: [] };
    var safeDoorId = (typeof doorId === 'string') ? doorId.trim() : '';
    // Find the option for the new vote. Bail if doorId unknown.
    var found = null;
    for (var i = 0; i < room.doorways.options.length; i++) {
      if (room.doorways.options[i].doorId === safeDoorId) { found = room.doorways.options[i]; break; }
    }
    if (!found) return { broadcasts: [] };
    // If switching, decrement the prior doorId's count.
    var priorDoorId = member.doorVote || null;
    if (priorDoorId && priorDoorId !== safeDoorId) {
      for (var j = 0; j < room.doorways.options.length; j++) {
        if (room.doorways.options[j].doorId === priorDoorId) {
          room.doorways.options[j].count = Math.max(0, room.doorways.options[j].count - 1);
        }
      }
    }
    // No-op if voting for the same door again.
    if (priorDoorId !== safeDoorId) {
      found.count += 1;
      member.doorVote = safeDoorId;
      member.status   = 'voted';
    }
    var payload = {
      type:    'classroom_doorway_tally',
      section: entry.section,
      id:      room.doorways.id,
      tally:   room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; })
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // closeDoorways(ws, id, now) -> { broadcasts }
  // Teacher-only. Emits the final tally then clears room.doorways.
  // Each member's doorVote is cleared.
  function closeDoorways(ws, id, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    var finalTally = room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; });
    var closedId = room.doorways.id;
    var closedQuestion = room.doorways.question;
    var closedOptions = room.doorways.options.map(function(o) { return { label: o.label, doorId: o.doorId }; });
    room.doorways = null;
    room.members.forEach(function(m) {
      if (m.doorVote != null) { m.doorVote = null; }
      m.status = 'present';
    });
    var payload = {
      type:     'classroom_close_doorways',
      section:  entry.section,
      id:       closedId,
      question: closedQuestion,
      options:  closedOptions,
      tally:    finalTally
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }
```

Add to the public exports at the bottom of `createClassroomRegistry`:
`openDoorways`, `castDoorwayVote`, `closeDoorways`.

Also update `openPoll` to reject if `room.doorways` is open (the
existing rejection only checks `room.poll`). Add this guard at the
top of `openPoll`:

```js
    if (room.doorways) return { broadcasts: [] };  // mutual exclusion vs P4
```

`toWireMember` does NOT need to carry `doorVote` on the wire (it's
local state on the member; the tally is broadcast separately). Keep
the wire shape unchanged.

### C3. server.js -- new handlers

After the existing `case 'classroom_close_poll'` (around line 1893) and
BEFORE the `default:` case, insert three new handler blocks:

```js
        // --- v3 P4: vote-with-your-feet ----------------------------------

        case 'classroom_open_doorways': {
          var dwId       = (typeof data.id === 'string') ? data.id : '';
          var dwQuestion = (typeof data.question === 'string') ? data.question : '';
          var dwOptions  = Array.isArray(data.options) ? data.options : [];
          var dwResult   = classroomRegistry.openDoorways(ws, dwId, dwQuestion, dwOptions, Date.now());
          broadcastToClassroom(null, dwResult.broadcasts);
          break;
        }

        case 'classroom_doorway_vote': {
          var dvId     = (typeof data.id === 'string') ? data.id : '';
          var dvDoorId = (typeof data.doorId === 'string') ? data.doorId : '';
          var dvResult = classroomRegistry.castDoorwayVote(ws, dvId, dvDoorId, Date.now());
          broadcastToClassroom(null, dvResult.broadcasts);
          break;
        }

        case 'classroom_close_doorways': {
          var dcId     = (typeof data.id === 'string') ? data.id : '';
          var dcResult = classroomRegistry.closeDoorways(ws, dcId, Date.now());
          broadcastToClassroom(null, dcResult.broadcasts);
          break;
        }
```

### C4. classroom-board.js -- state + reducer

Add to `emptyState()`:

```js
  function emptyState() {
    return { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null, live: false, doorways: null };
  }
```

Add THREE new cases to `_reduce`:

```js
      case 'classroom_open_doorways':
        // v3 P4: a fresh data mode is opening. Mutually exclusive with
        // poll (server enforces); clear any closedPoll surface.
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       null,
          greenlight: state.greenlight,
          closedPoll: null,
          live:       state.live,
          doorways:   {
            id:       message.id,
            question: message.question || '',
            options:  Array.isArray(message.options) ? message.options.slice() : [],
            tally:    (Array.isArray(message.options) ? message.options : []).map(function(o) { return { doorId: o.doorId, count: 0 }; }),
            closed:   false
          }
        };

      case 'classroom_doorway_tally':
        // Update the tally on the active doorways state. If no doorways
        // open or id mismatch, no-op.
        if (!state.doorways || state.doorways.id !== message.id) { return state; }
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll,
          live:       state.live,
          doorways:   {
            id:       state.doorways.id,
            question: state.doorways.question,
            options:  state.doorways.options,
            tally:    Array.isArray(message.tally) ? message.tally.slice() : state.doorways.tally,
            closed:   state.doorways.closed
          }
        };

      case 'classroom_close_doorways':
        // The data mode is closing. Carry the final tally on a one-shot
        // closedDoorways snapshot (mirroring closedPoll); the active
        // doorways slot is cleared on the next state-driven path or a
        // fresh open.
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll,
          live:       state.live,
          doorways:   null,
          closedDoorways: {
            id:       message.id,
            question: message.question || '',
            options:  Array.isArray(message.options) ? message.options.slice() : [],
            tally:    Array.isArray(message.tally) ? message.tally.slice() : []
          }
        };
```

Every OTHER existing `_reduce` case that builds a new state object
MUST preserve `state.doorways` as the last field (mirroring the
state.live treatment in v3 P1+P2). Cases to update:
`classroom_state`, `classroom_member_update`, `classroom_member_left`,
`classroom_gate`, `classroom_poll`, `classroom_poll_closed`,
`classroom_poll_reveal`, `classroom_greenlight`, `classroom_live_state`.

For `classroom_state`, ALSO read `message.doorways` if present (it's
not currently sent on join snapshots but the field is reserved):

```js
        doorways:   message.doorways || null
```

For every other case, copy through:

```js
        doorways:   state.doorways
```

The `closedDoorways` field is one-shot (like closedPoll). Clear it on
the next `classroom_state` or `classroom_open_doorways`.

`emptyState()` also gains `closedDoorways: null`.

### C5. classroom-board.js -- Doorway entity

The existing `GateDoor` entity (line ~1045) renders ONE gate-hole at a
fixed x. Generalize it: add a NEW entity `Doorway` (do NOT modify the
existing GateDoor; the gate ritual still uses it for v1b check-in).

```js
  // --- Doorway entity (v3 P4) ------------------------------------------
  //
  // One labelled doorway. Multiple instances spread evenly across the
  // canvas when state.doorways is open. Each renders a vertical hole
  // identical visually to GateDoor; the label sits above and a count
  // sits below. Walking into the doorway's x range + pressing Up casts
  // a vote (the matched doorway's doorId is the choice).

  function Doorway(getGroundY, opts) {
    this.getGroundY = getGroundY;
    this.x          = opts.x;        // center x of the hole
    this.width      = opts.width || 24;
    this.label      = opts.label || '';
    this.doorId     = opts.doorId || '';
    this.count      = 0;             // updated from state.doorways.tally
  }
  Doorway.prototype.update = function () {};
  Doorway.prototype.render = function (ctx) {
    var groundY = this.getGroundY();
    var holeH   = 30;
    var holeW   = this.width;
    // Hole (visually the same dark slot as GateDoor).
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x - holeW / 2, groundY - holeH, holeW, holeH);
    // Label above.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.label, this.x, groundY - holeH - 6);
    // Count below.
    ctx.font = '10px Arial';
    ctx.fillText(String(this.count), this.x, groundY + 14);
  };
  Doorway.prototype.containsX = function (x, halfPlayerW) {
    // Hit-test: is the player's center inside the doorway's hole?
    var slack = halfPlayerW || 8;
    return Math.abs(x - this.x) <= (this.width / 2 + slack);
  };
```

### C6. classroom-board.js -- mount() wiring

In mount(), after the existing `showGateDoor()` / `hideGateDoor()`
helpers, add `showDoorways(options)` / `hideDoorways()` / `updateDoorwayCounts(tally)`:

```js
    var doorwayEntities = [];

    function showDoorways(options) {
      hideDoorways();
      if (!engineReady || !options || options.length === 0) { return; }
      var cw = engine.canvas.width / (root.devicePixelRatio || 1);
      var n  = options.length;
      // Even spread across the canvas, leaving a margin on each side.
      var margin = 40;
      var span   = cw - margin * 2;
      for (var i = 0; i < n; i++) {
        var xCenter = margin + (span * (i + 0.5) / n);
        var d = new Doorway(function () { return engine.groundY; }, {
          x: xCenter, width: 28, label: options[i].label, doorId: options[i].doorId
        });
        doorwayEntities.push(d);
        engine.addEntity('doorway_' + options[i].doorId, d);
      }
    }

    function hideDoorways() {
      if (!engineReady) { doorwayEntities = []; return; }
      for (var i = 0; i < doorwayEntities.length; i++) {
        var d = doorwayEntities[i];
        engine.removeEntity('doorway_' + d.doorId);
      }
      doorwayEntities = [];
    }

    function updateDoorwayCounts(tally) {
      if (!tally || !doorwayEntities.length) { return; }
      // Map by doorId.
      var byId = {};
      for (var i = 0; i < tally.length; i++) { byId[tally[i].doorId] = tally[i].count; }
      for (var j = 0; j < doorwayEntities.length; j++) {
        var d = doorwayEntities[j];
        if (typeof byId[d.doorId] === 'number') { d.count = byId[d.doorId]; }
      }
    }
```

In the message-handling path where the reducer is invoked, AFTER the
reducer returns the new state, drive the doorway visibility:

```js
      // v3 P4: doorways visibility + count refresh.
      if (newState.doorways && (!state.doorways || newState.doorways.id !== (state.doorways && state.doorways.id))) {
        showDoorways(newState.doorways.options);
        updateDoorwayCounts(newState.doorways.tally);
      } else if (newState.doorways) {
        updateDoorwayCounts(newState.doorways.tally);
      } else if (!newState.doorways && state.doorways) {
        hideDoorways();
      }
```

(Place this alongside the existing gate visibility hook.)

### C7. classroom-board.js -- onUpPressed multi-hitbox

The existing `handlePlayerUp` (or the player's Up callback) currently
fires `classroom_checkin` when inside the gate door's hitbox. EXTEND
it to ALSO check doorway hitboxes:

```js
    function handlePlayerUp(player) {
      // v3 P4: doorways take priority over the gate (a doorways data
      // mode is mutually exclusive with the gate ritual on the server).
      if (state.doorways && doorwayEntities.length > 0) {
        var px = player.x + player._spriteSize / 2;
        for (var i = 0; i < doorwayEntities.length; i++) {
          var d = doorwayEntities[i];
          if (d.containsX(px, player._spriteSize / 2)) {
            safeSend({ type: 'classroom_doorway_vote', id: state.doorways.id, doorId: d.doorId });
            // Optimistic local drain: walk through the doorway and out.
            // Mirror the gate drain (a walkTo target outside the canvas).
            var cw = engine.canvas.width / (root.devicePixelRatio || 1);
            player.targetX = (d.x < cw / 2) ? -d.width : cw + d.width;
            player.walkDir = (player.targetX < player.x) ? -1 : 1;
            player.state   = 'walking';
            return;
          }
        }
      }
      // Existing gate check-in path:
      if (!state.gate || !state.gate.armed) { return; }
      // ... existing checkin logic ...
    }
```

(Find the existing function body; the new doorways block goes BEFORE
the gate check.)

### C8. teacher-classroom.html -- Doorways UI

Add a NEW `<div class="section" id="doorways-section">` AFTER the
existing `#poll-section` (around line 380). Visible only when
`#section-region` is visible (same display lifecycle as the poll
section).

```html
      <!-- v3 P4: Doorways (vote-with-your-feet) -->
      <div class="section" id="doorways-section" style="display:none">
        <h2 class="section-title">Doorways (Vote with your feet)</h2>

        <div class="form-row">
          <label for="doorways-question-input">Question</label>
          <input type="text" id="doorways-question-input" class="poll-question-input" placeholder="Type your question...">
        </div>

        <div class="form-row">
          <label>Options (2-8 doorways)</label>
          <div class="poll-options-list" id="doorways-options-list">
            <div class="poll-option-row">
              <input type="text" class="poll-option-input" placeholder="Option A">
              <button class="poll-remove-btn" type="button" aria-label="Remove">x</button>
            </div>
            <div class="poll-option-row">
              <input type="text" class="poll-option-input" placeholder="Option B">
              <button class="poll-remove-btn" type="button" aria-label="Remove">x</button>
            </div>
          </div>
          <button type="button" id="doorways-add-option" class="ctrl-btn">+ Add doorway</button>
        </div>

        <div class="control-strip">
          <button id="btn-open-doorways" class="ctrl-btn primary">Open Doorways</button>
          <button id="btn-close-doorways" class="ctrl-btn danger" style="display:none">Close + Archive</button>
        </div>

        <canvas id="doorways-tally-canvas" width="480" height="160" style="display:none"></canvas>

        <div class="hint">
          Students walk their avatar through their chosen doorway + press Up.
          Mutually exclusive with the poll above. Closing archives the result.
        </div>
      </div>
```

In the cockpit JS, AFTER the existing `archivePoll` / `renderPollTally`
helpers, add a new script block:

```js
    // ===== v3 P4: doorways =====

    var _activeDoorwaysId = null;
    var _lastArchivedDoorwaysId = null;

    function getDoorwaysFormValues() {
      var q = (document.getElementById('doorways-question-input').value || '').trim();
      var inputs = document.querySelectorAll('#doorways-options-list .poll-option-input');
      var options = [];
      for (var i = 0; i < inputs.length; i++) {
        var label = (inputs[i].value || '').trim();
        if (label) options.push({ label: label, doorId: 'd' + i });
      }
      return { question: q, options: options };
    }

    document.getElementById('btn-open-doorways').addEventListener('click', function() {
      if (!boardHandle) return;
      var vals = getDoorwaysFormValues();
      if (vals.options.length < 2) { alert('Need at least 2 doorways.'); return; }
      if (vals.options.length > 8) { alert('Max 8 doorways.'); return; }
      var id = 'doorways-' + Date.now();
      _activeDoorwaysId = id;
      boardHandle.openDoorways(id, vals.question, vals.options);
      document.getElementById('btn-open-doorways').style.display = 'none';
      document.getElementById('btn-close-doorways').style.display = '';
      document.getElementById('doorways-tally-canvas').style.display = '';
    });

    document.getElementById('btn-close-doorways').addEventListener('click', function() {
      if (!boardHandle || !_activeDoorwaysId) return;
      boardHandle.closeDoorways(_activeDoorwaysId);
    });

    // Tally rendering -- reuse Ti84Plot.drawBarChart (the v2 poll API,
    // signature: drawBarChart(ctx, { labels, counts, title? })).
    function renderDoorwaysTally(summary) {
      var canvas = document.getElementById('doorways-tally-canvas');
      if (!canvas) return;
      if (!summary || !summary.doorways) {
        canvas.style.display = 'none';
        return;
      }
      canvas.style.display = '';
      if (typeof window.Ti84Plot === 'undefined' || typeof window.Ti84Plot.drawBarChart !== 'function') return;
      var d = summary.doorways;
      var labels = d.options.map(function(o) { return o.label; });
      // Align counts to labels via doorId.
      var byId = {};
      (d.tally || []).forEach(function(t) { byId[t.doorId] = t.count; });
      var counts = d.options.map(function(o) { return byId[o.doorId] || 0; });
      var ctx = canvas.getContext('2d');
      window.Ti84Plot.drawBarChart(ctx, { labels: labels, counts: counts, title: d.question || '' });
    }
```

Wire into `mountBoard`'s `onStateChange` callback (alongside the
existing `renderPollTally`):

```js
            renderDoorwaysTally(summary);
            // Archive closed doorways exactly once.
            var cd = summary.closedDoorways;
            if (cd && cd.id && cd.id !== _lastArchivedDoorwaysId) {
              _lastArchivedDoorwaysId = cd.id;
              archivePoll(cd.id, section, todayIsoDate(),
                cd.question, (cd.options || []).map(function(o) { return o.label; }),
                (cd.tally || []).map(function(t) { return t.count; }), false);
              // Reset cockpit UI back to the form.
              _activeDoorwaysId = null;
              document.getElementById('btn-open-doorways').style.display = '';
              document.getElementById('btn-close-doorways').style.display = 'none';
            }
```

Also reveal `#doorways-section` in `setBoardSectionsVisible` (find the
existing helper and add the doorways-section id alongside).

### C9. classroom-board.js -- public handle methods

Add to the `boardHandle` return:

```js
      openDoorways: function (id, question, options) {
        safeSend({ type: 'classroom_open_doorways', id: id, question: question, options: options });
      },
      closeDoorways: function (id) {
        safeSend({ type: 'classroom_close_doorways', id: id });
      },
```

Update `onStateChange`'s `summary` (in `buildSummary` or wherever the
summary object is built) to include `doorways: state.doorways` and
`closedDoorways: state.closedDoorways || null`.

### C10. Tests (Unit T)

**cr `tests/classroom.test.js`** (append new describe block):

```
describe('createClassroomRegistry -- v3 P4 doorways', () => {
  - openDoorways requires teacher role
  - openDoorways rejects when a poll is open
  - openPoll rejects when doorways are open (mutual exclusion)
  - openDoorways validates 2-8 options
  - castDoorwayVote increments the matched doorId count
  - castDoorwayVote rejects unknown doorId silently
  - castDoorwayVote switches a vote: prior doorId decrements + new increments
  - castDoorwayVote re-vote for same door is a no-op
  - closeDoorways emits final tally + clears room.doorways
  - closeDoorways requires teacher role
  - non-students cannot castDoorwayVote
})
```

**follow-alongs `tests/classroom-board.test.js`** (append):

```
describe('classroom-board -- v3 P4 doorways reducer', () => {
  - emptyState includes doorways: null + closedDoorways: null
  - _reduce(classroom_open_doorways) sets state.doorways with id/question/options/tally(0s)
  - _reduce(classroom_doorway_tally) updates the tally; id mismatch is a no-op
  - _reduce(classroom_close_doorways) clears state.doorways + sets closedDoorways
  - state.doorways preserved through unrelated cases (member_update, gate, etc.)
})
```

**follow-alongs `tests/v3-p4-doorways.test.js`** (new file -- cockpit
runtime tests, mirror the pattern in poll-archive-cockpit.test.js):

```
describe('v3 P4 cockpit doorways flow', () => {
  - btn-open-doorways form-validates and fires classroom_open_doorways
  - Close button fires classroom_close_doorways with the right id
  - closedDoorways summary triggers archivePoll exactly once
  - Form requires at least 2 options + max 8
})
```

**follow-alongs `tests/classroom-structure.test.js`** (append structure pins):

```
- defines Doorway entity
- _reduce has cases for classroom_open_doorways / _doorway_tally / _close_doorways
- emptyState includes doorways: null
- mount() exposes openDoorways + closeDoorways
```

## Acceptance

After A+B+C+T land:

1. cr `git diff` touches ONLY `railway-server/classroom.js`,
   `railway-server/server.js`, `tests/classroom.test.js`.
2. fa `git diff` touches the cockpit, board, BUILD doc, + tests.
3. cr vitest baseline 923/924; +>=10 new tests passing.
4. fa root vitest baseline 4927/4928; +>=12 new tests passing.
5. Grep `openDoorways\|castDoorwayVote\|closeDoorways` in cr classroom.js >=6 hits.
6. Grep `classroom_open_doorways\|classroom_doorway_vote\|classroom_close_doorways`
   in server.js >=3 hits.
7. Grep `Doorway\b` in classroom-board.js >=3 hits (entity + uses).
8. Grep `doorways-section\|btn-open-doorways\|btn-close-doorways` in
   teacher-classroom.html each >=2 hits.

## Out of scope

- Re-using a closed doorways state for "show last result" -- the
  cockpit's _lastArchivedDoorwaysId latches one archive per session.
- A separate doorways archive table -- reuses `poll_archive`.
- Per-doorway theming / colours -- options carry only `label` +
  `doorId`. A colour palette is a v3.x cosmetic.
- Anonymous voting / blind mode -- a future P4.1 if needed; v1 always
  reveals the live tally.
- More than 8 doorways -- canvas real estate limits.
