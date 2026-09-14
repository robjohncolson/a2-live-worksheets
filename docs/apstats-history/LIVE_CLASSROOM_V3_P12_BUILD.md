# LIVE_CLASSROOM_V3 P1+P2 -- Build Contract (FROZEN)

Session 111, 2026-05-23. Design: `LIVE_CLASSROOM_V3_SPEC.md`.
Combines spec phases P1 (cockpit section-agnostic by default) and P2
(Live button + section picker + student indicator) because neither
ships meaningfully alone -- a toggle-less global view is pointless, and
a Live toggle without a global view to return to is meaningless. P3
(WebRTC) and P4 (vote-with-your-feet) stay separate phases.

This contract is FROZEN -- implement it verbatim. Do NOT improvise
message names, broadcast targets, or UI strings.

## Dependency analysis

Cross-repo work. Five units in two repos:

- **Unit A** (cr `railway-server/classroom.js`): add monitor-socket
  subscription + `subscribeMonitor` / `unsubscribeMonitor` /
  `getAllSectionsState` / live-state methods. All existing broadcasts
  fan out to monitor sockets in addition to their room sockets.
- **Unit B** (cr `railway-server/server.js`): wire three new WS
  message types into the existing handler switch (lines 1907 is the
  `default` case). Also clean monitor sockets on detach.
- **Unit C** (`teacher-classroom.html`): restructure UI to make the
  global-presence view the default; the existing section picker
  becomes the "Go Live" form, hidden behind a button.
- **Unit D** (`classroom-board.js`): `_reduce` handles a new
  `classroom_live_state` message; `state.live` becomes a new state
  field; `onStateChange` summary carries `live`. The student-side Live
  indicator is rendered by the Desk's mount caller (`ap_stats_roadmap_square_mode.html`).
- **Unit E** (`ap_stats_roadmap_square_mode.html`): the Desk's
  classroom board mount handler reads `summary.live` and renders a
  fixed "Live with Mr. Colson" pill on the page. Hides when `live`
  is false.

Units A and B share the same repo and the same module boundary -- B
imports from A. They run as ONE Sonnet unit (the cr server work).

Units C, D, E are in this repo and touch DIFFERENT files. They can run
in parallel. C reads only this contract; D reads only this contract;
E reads only this contract.

A test unit (Unit T) follows after the 4 implementation units land --
new vitest cases in both repos.

```
                          Unit A+B (cr server)
                                 |
                                 v
   +---------------+   +-------------------+   +----------------+
   |  Unit C       |   |  Unit D           |   |  Unit E        |
   |  cockpit UI   |<->|  board _reduce    |<->|  Desk mount    |
   +---------------+   +-------------------+   +----------------+
                                 |
                                 v
                            Unit T (tests)
```

C/D/E are independent at the file level but share contract semantics
(message names, payload shapes). Verbatim text in this contract
synchronizes them.

## The contract -- verbatim

### C1. Three new WS messages (cr)

| Direction               | Type                        | Payload                                                                                                |
|-------------------------|-----------------------------|--------------------------------------------------------------------------------------------------------|
| Client -> server        | `classroom_monitor_start`   | `{}` (no payload). Caller must be a teacher (`requireTeacher`-equivalent: `role === 'teacher'` in roster). |
| Server -> caller        | `classroom_state_all`       | `{ sections: [{ section, gate, poll, live, members: [WireMember, ...] }, ...] }`                       |
| Client -> server        | `classroom_monitor_stop`    | `{}` (no payload).                                                                                     |
| Client (teacher) -> server | `classroom_live_start`   | `{ section }`. Marks the room as Live (`room.live = true`). Only the section's room is affected.       |
| Client (teacher) -> server | `classroom_live_stop`    | `{ section }`. Marks the room as not Live (`room.live = false`).                                       |
| Server -> all (room + monitors) | `classroom_live_state` | `{ section, live }`. Broadcast whenever live transitions.                                       |

`live` is a NEW field on `room`, defaulting to `false`. It is durable
across `armGate` / `greenLight` / `reset` (NOT cleared by them).

WireMember shape is unchanged from v2.1 (`username, role, status, online, hue, vote, pos`).

### C2. classroomRegistry method additions

In `classroom.js`, add three new methods + extend the existing
broadcast helper so every broadcast ALSO fans out to monitor sockets.

```js
  // Set of teacher sockets in "monitor" mode -- they receive every
  // broadcast from every room without joining any specific room.
  var monitorSockets = new Set();

  // subscribeMonitor(ws) -> { sends }
  // Add ws to monitorSockets and send back a classroom_state_all snapshot.
  // No room state mutation; idempotent.
  function subscribeMonitor(ws) {
    monitorSockets.add(ws);
    return { sends: [{ ws: ws, payload: buildAllSectionsStatePayload() }] };
  }

  // unsubscribeMonitor(ws) -> void
  // Remove ws from monitorSockets. Idempotent.
  function unsubscribeMonitor(ws) {
    monitorSockets.delete(ws);
  }

  // buildAllSectionsStatePayload() -> { type, sections: [...] }
  // Returns a snapshot of every room's state, role-aware for teachers
  // (monitor is teacher-only -- buildStatePayload's blind-poll mask
  // does not apply since the viewer is always a teacher).
  function buildAllSectionsStatePayload() {
    var sections = [];
    classrooms.forEach(function(room, section) {
      var members = [];
      room.members.forEach(function(member) {
        // Monitor viewer is always teacher -- no blind-poll mask needed.
        members.push(toWireMember(member));
      });
      sections.push({
        section: section,
        gate:    room.gate,
        poll:    room.poll || null,
        live:    !!room.live,
        members: members
      });
    });
    return { type: 'classroom_state_all', sections: sections };
  }

  // setLive(section, live, now) -> { broadcasts }
  // Set the room's live state. Returns a classroom_live_state broadcast
  // that fans out to the room's sockets AND every monitor socket.
  // If the section's room does not exist, returns empty broadcasts (no-op).
  function setLive(section, live, now) {
    if (!classrooms.has(section)) {
      return { broadcasts: [] };
    }
    var room = classrooms.get(section);
    var liveBool = !!live;
    if (room.live === liveBool) {
      return { broadcasts: [] };  // no-op on identity transition
    }
    room.live = liveBool;
    var payload = { type: 'classroom_live_state', section: section, live: liveBool };
    var sockets = roomSockets(room, null);
    monitorSockets.forEach(function(mws) { sockets.push(mws); });
    if (sockets.length === 0) {
      return { broadcasts: [] };
    }
    return { broadcasts: [{ sockets: sockets, payload: payload }] };
  }
```

Plus EVERY existing returned `broadcasts` array in `join`, `detach`,
`heartbeat`, `armGate`, `checkin`, `greenLight`, `reset`, `openPoll`,
`castVote`, `closePoll`, `revealPoll`, `position`, `sweep` -- when
non-empty -- must append the monitor sockets to each `bc.sockets`
array. This is done via a small helper:

```js
  // Inject monitor sockets into every broadcast target list. Call AFTER
  // building the room-scoped broadcasts; mutates each broadcast's
  // sockets list in place.
  function _fanoutToMonitors(broadcasts) {
    if (monitorSockets.size === 0 || !broadcasts || broadcasts.length === 0) {
      return broadcasts;
    }
    broadcasts.forEach(function(bc) {
      monitorSockets.forEach(function(mws) {
        if (!bc.sockets.includes(mws)) {
          bc.sockets.push(mws);
        }
      });
    });
    return broadcasts;
  }
```

Wire `_fanoutToMonitors(broadcasts)` into every existing method that
returns broadcasts (before the `return`). For methods that build
`broadcasts` from `buildRoleAwareMemberUpdateBroadcasts`, call it on
the result.

Also: the `detach` method must call `monitorSockets.delete(ws)` AT THE
TOP to avoid a dangling monitor entry when a teacher tab closes.

Also: `getAllSectionsState()` is exported as a public method so server.js
can call it directly (useful for unit tests, though server.js doesn't
need it -- subscribeMonitor returns the same payload).

Expose in the return object:

```js
  return {
    join: join,
    detach: detach,
    heartbeat: heartbeat,
    armGate: armGate,
    checkin: checkin,
    greenLight: greenLight,
    reset: reset,
    openPoll: openPoll,
    castVote: castVote,
    closePoll: closePoll,
    revealPoll: revealPoll,
    position: position,
    sweep: sweep,
    // v3 P1+P2 additions:
    subscribeMonitor: subscribeMonitor,
    unsubscribeMonitor: unsubscribeMonitor,
    setLive: setLive,
    getAllSectionsState: buildAllSectionsStatePayload
  };
```

### C3. server.js handler wiring (cr)

After the existing `case 'classroom_pos'` block (around line 1905) and
BEFORE the `default` case, insert three new handlers. ASCII-only.

```js
        // --- v3 P1+P2: cockpit monitor + Live mode ----------------------

        case 'classroom_monitor_start': {
          var msResult = classroomRegistry.subscribeMonitor(ws);
          msResult.sends.forEach(function(s) {
            if (s.ws.readyState === 1) {
              try { s.ws.send(JSON.stringify(s.payload)); } catch (e) { /* ignore */ }
            }
          });
          break;
        }

        case 'classroom_monitor_stop': {
          classroomRegistry.unsubscribeMonitor(ws);
          break;
        }

        case 'classroom_live_start': {
          var lsSection = (data.section || '').trim();
          if (!lsSection) break;
          var lsResult = classroomRegistry.setLive(lsSection, true, Date.now());
          broadcastToClassroom(null, lsResult.broadcasts);
          break;
        }

        case 'classroom_live_stop': {
          var lxSection = (data.section || '').trim();
          if (!lxSection) break;
          var lxResult = classroomRegistry.setLive(lxSection, false, Date.now());
          broadcastToClassroom(null, lxResult.broadcasts);
          break;
        }
```

NO role check at the server case level -- the registry's setLive +
subscribeMonitor are additive and the worst a non-teacher can do is
spam them (no state corruption). A future v3.5 may add `role === 'teacher'`
gate; for v3 P1+P2 the convention is enforced client-side.

### C4. Student-side `_reduce` extension (`classroom-board.js`)

In `_reduce`, BEFORE the closing `default: return state;` (or wherever
the final default lives), add this NEW case AND extend two existing
cases. Verbatim:

```js
      case 'classroom_live_state':
        // v3 P1+P2: room.live transitions. Carries section + live bool.
        // The state.live field is new (defaults to false in emptyState).
        return {
          members:    state.members,
          gate:       state.gate,
          poll:       state.poll,
          greenlight: state.greenlight,
          closedPoll: state.closedPoll != null ? state.closedPoll : null,
          live:       !!message.live
        };
```

ALSO update the existing `classroom_state` case so the returned state
preserves `message.live` (the server snapshot now includes it):

```js
      case 'classroom_state':
        // ... existing newMembers build above ...
        return {
          members:    newMembers,
          gate:       message.gate  || null,
          poll:       message.poll  || null,
          greenlight: false,
          closedPoll: null,
          live:       !!message.live  // v3 P1+P2 additive
        };
```

ALSO update `emptyState()` (around line 430):

```js
  function emptyState() {
    return { members: {}, gate: null, poll: null, greenlight: false, closedPoll: null, live: false };
  }
```

ALSO every OTHER case that returns a new state object MUST preserve
`state.live` (since they all rebuild the state object verbatim):
`classroom_member_update`, `classroom_member_left`, `classroom_gate`,
`classroom_poll`, `classroom_poll_closed`, `classroom_poll_reveal`,
`classroom_greenlight`. Each one's `return { ... }` literal gains
`live: state.live` as the last field.

The `onStateChange` summary callback (already documented in classroom-board.js)
gains a `live` field. Existing callers MUST continue to work because
`live` defaults to `false`. Look for the place where summary is built
(grep `summary = {`) and add `live: state.live` to the literal.

### C5. Desk Live indicator (`ap_stats_roadmap_square_mode.html`)

The Desk currently mounts the classroom board via a helper in the
`_mountClassroomBoard` (or similarly named) function. That mount's
`onStateChange` callback handles the existing summary fields. Add to
the callback body (verbatim):

```js
            // v3 P1+P2: render the "Live with Mr. Colson" indicator
            // when the room transitions to live. _renderLiveIndicator
            // is a fire-and-forget no-throw helper (defined alongside).
            _renderLiveIndicator(!!summary.live);
```

The helper, added at the same scope as `_mountClassroomBoard`:

```js
      // v3 P1+P2 -- "Live" pill, top-right, shown only while the
      // student's section is in Live mode.
      function _renderLiveIndicator(isLive) {
        var EL_ID = 'desk-live-indicator';
        var el = document.getElementById(EL_ID);
        if (!isLive) {
          if (el) el.remove();
          return;
        }
        if (!el) {
          el = document.createElement('div');
          el.id = EL_ID;
          el.style.cssText = [
            'position:fixed', 'top:8px', 'right:8px',
            'z-index:9999', 'pointer-events:none',
            'background:#c0392b', 'color:#fff', 'font-weight:700',
            'padding:6px 12px', 'border-radius:6px',
            'font-family:Arial,sans-serif', 'font-size:0.85rem',
            'box-shadow:0 2px 6px rgba(0,0,0,0.3)'
          ].join(';');
          el.textContent = '⚫ Live with Mr. Colson';
          document.body.appendChild(el);
        }
      }
```

The `⚫` is the black-circle "live" indicator codepoint.

### C6. Cockpit restructure (`teacher-classroom.html`)

Today the cockpit's "Section" card (`#section-region`, around line 336)
contains a `<select>` that mounts the board on change. v3 P1+P2 splits
this into TWO surfaces:

**6.1 Global presence card** (NEW, added BEFORE the existing Section card)

A read-only list grouped by section. Pulls from the
`classroom_state_all` reply on monitor subscribe + updates incrementally
from the same WS broadcasts the board already handles
(`classroom_member_update`, `classroom_member_left`, `classroom_live_state`).

HTML (inserted in the `#board-region` div, BEFORE the Section card):

```html
      <!-- v3 P1+P2: Global presence -- shown by default; hidden in Live mode. -->
      <div class="section" id="global-presence-section">
        <h2 class="section-title">Everyone online</h2>
        <div id="global-presence-list">
          <div class="hint" id="global-presence-empty">Connecting...</div>
        </div>
        <div class="form-row">
          <button class="ctrl-btn primary" id="btn-go-live">Go Live</button>
          <div class="hint" id="go-live-hint">
            Pick a section to enter Live mode. The board mounts and students see a "Live" indicator.
          </div>
        </div>
      </div>
```

**6.2 Section card** (existing, MODIFY)

Wrap the existing `#section-region`'s container in a `style="display:none"`
default, plus an "Exit Live" button at the top:

The existing card becomes:

```html
      <!-- v1b: Section + board -- hidden by default in v3, shown after Go Live. -->
      <div class="section" id="section-region" style="display:none">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <h2 class="section-title" id="section-region-title">Live -- Period <span id="live-section-label">?</span></h2>
          <button class="ctrl-btn" id="btn-exit-live">Exit Live</button>
        </div>
        <div class="form-row">
          <label for="section-select">Section</label>
          <select id="section-select">
            <option value="PeriodX">PeriodX</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
          </select>
        </div>
        <div class="status-row" id="status-row"></div>
      </div>
```

The existing `<div class="section" id="control-section">` (Gate Controls),
`#poll-section` etc. stay as-is below.

**6.3 Cockpit JS state machine**

A new module-scope variable:

```js
    // v3 P1+P2 cockpit state.
    //   'global'  -- showing the global presence view (default; not live)
    //   'live'    -- mounted on a specific section (live mode)
    var _cockpitMode = 'global';
    var _monitorWs = null;    // separate WS for monitor mode (or reuse boardHandle's)
    var _globalState = { sections: [] };
```

On page load (after the access check passes), open a WS connection (or
reuse the board's connection scheme; the easiest path is to send
`classroom_monitor_start` over the SAME `wsUrl()` connection that the
board would use, but we open it before mounting any board) and:

```js
    // ===== v3 P1+P2: global presence wiring =====

    function startMonitorMode() {
      _cockpitMode = 'global';
      document.getElementById('global-presence-section').style.display = '';
      document.getElementById('section-region').style.display = 'none';
      // The control-section + poll-section + remaining cards hide too --
      // they only make sense in Live mode.
      var hideInGlobal = ['control-section', 'poll-section',
                          'checkin-panel-section', 'poll-history-section'];
      hideInGlobal.forEach(function(id) {
        var n = document.getElementById(id);
        if (n) n.style.display = 'none';
      });
      _ensureMonitorWs();  // open WS + send classroom_monitor_start
    }

    function stopMonitorMode() {
      if (_monitorWs && _monitorWs.readyState === 1) {
        try { _monitorWs.send(JSON.stringify({ type: 'classroom_monitor_stop' })); } catch (_) {}
      }
      // Do NOT close the socket -- the about-to-mount board may reuse it.
    }

    function _ensureMonitorWs() {
      if (_monitorWs && _monitorWs.readyState <= 1) return;
      _monitorWs = new WebSocket(wsUrl());
      _monitorWs.addEventListener('open', function() {
        try { _monitorWs.send(JSON.stringify({ type: 'classroom_monitor_start' })); } catch (_) {}
      });
      _monitorWs.addEventListener('message', function(ev) {
        var msg = null;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || !msg.type) return;
        if (msg.type === 'classroom_state_all') {
          _globalState = { sections: msg.sections || [] };
          _renderGlobalPresence();
        } else if (msg.type === 'classroom_member_update'
                || msg.type === 'classroom_member_left'
                || msg.type === 'classroom_live_state') {
          _applyMonitorDelta(msg);
          _renderGlobalPresence();
        }
      });
    }

    function _applyMonitorDelta(msg) {
      var sections = _globalState.sections;
      var sec = msg.section;
      var idx = -1;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].section === sec) { idx = i; break; }
      }
      if (idx === -1) {
        // New section -- shouldn't happen often but is safe to add.
        sections.push({ section: sec, gate: null, poll: null, live: false, members: [] });
        idx = sections.length - 1;
      }
      var room = sections[idx];
      if (msg.type === 'classroom_member_update') {
        var found = false;
        for (var j = 0; j < room.members.length; j++) {
          if (room.members[j].username === msg.member.username) {
            room.members[j] = msg.member;
            found = true;
            break;
          }
        }
        if (!found) room.members.push(msg.member);
      } else if (msg.type === 'classroom_member_left') {
        room.members = room.members.filter(function(m) { return m.username !== msg.username; });
      } else if (msg.type === 'classroom_live_state') {
        room.live = !!msg.live;
      }
    }

    function _renderGlobalPresence() {
      var listEl  = document.getElementById('global-presence-list');
      var emptyEl = document.getElementById('global-presence-empty');
      if (!listEl) return;
      var sections = _globalState.sections;
      // Build the section blocks.
      var html = '';
      var any = false;
      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        var onlineCount = 0;
        for (var j = 0; j < sec.members.length; j++) {
          if (sec.members[j].online !== false) onlineCount++;
        }
        if (onlineCount === 0) continue;
        any = true;
        html += '<div style="margin:8px 0;">'
          + '<strong>' + _escHtml(sec.section) + '</strong>'
          + ' &mdash; ' + onlineCount + ' online'
          + (sec.live ? ' <span style="color:#c0392b;font-weight:bold">[LIVE]</span>' : '')
          + '<ul style="margin:4px 0 0 18px;padding:0;font-size:0.88rem;color:var(--sg-text-dim);">';
        for (var k = 0; k < sec.members.length; k++) {
          var m = sec.members[k];
          if (m.online === false) continue;
          html += '<li>' + _escHtml(m.username) + '</li>';
        }
        html += '</ul></div>';
      }
      if (!any) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.textContent = 'No students currently online.';
        listEl.appendChild(emptyEl);
      } else {
        listEl.innerHTML = html;
      }
    }

    function _escHtml(s) {
      var d = document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML;
    }

    function enterLiveMode(section) {
      if (!section) return;
      _cockpitMode = 'live';
      stopMonitorMode();
      document.getElementById('global-presence-section').style.display = 'none';
      document.getElementById('section-region').style.display = '';
      document.getElementById('live-section-label').textContent = section;
      // Reveal the board-dependent cards (mountBoard will show control-section etc).
      mountBoard(section, rosterClient.current());
      // Tell the server this section is Live now.
      _sendLiveStart(section);
    }

    function exitLiveMode() {
      if (_cockpitMode !== 'live') return;
      var sel = document.getElementById('section-select');
      var section = sel ? sel.value : '';
      teardown();
      if (section) _sendLiveStop(section);
      startMonitorMode();
    }

    function _sendLiveStart(section) {
      // Routed through the (about-to-mount) board's WS or a fresh one --
      // simplest: open a tiny WS, send, close. The board itself opens its
      // own WS so this is fire-and-forget signaling.
      try {
        var s = new WebSocket(wsUrl());
        s.addEventListener('open', function() {
          try { s.send(JSON.stringify({ type: 'classroom_live_start', section: section })); } catch (_) {}
          setTimeout(function() { try { s.close(); } catch (_) {} }, 250);
        });
      } catch (_) {}
    }

    function _sendLiveStop(section) {
      try {
        var s = new WebSocket(wsUrl());
        s.addEventListener('open', function() {
          try { s.send(JSON.stringify({ type: 'classroom_live_stop', section: section })); } catch (_) {}
          setTimeout(function() { try { s.close(); } catch (_) {} }, 250);
        });
      } catch (_) {}
    }
```

Wire up the buttons:

```js
    document.getElementById('btn-go-live').addEventListener('click', function() {
      // Open the section picker by simply revealing the Section card --
      // the user then picks a section from the dropdown and the existing
      // onSectionChange handler mounts the board. Re-targeted so the
      // mount fires immediately on the next change OR if the dropdown
      // is already at a valid value, fire it now.
      var sel = document.getElementById('section-select');
      var section = sel ? sel.value : '';
      if (section) {
        enterLiveMode(section);
      }
    });

    document.getElementById('btn-exit-live').addEventListener('click', exitLiveMode);
```

The existing `onSectionChange` handler stays (it mounts the board when
the dropdown changes) but it should now ALSO call `_sendLiveStart` to
mark the new section as Live (and `_sendLiveStop` on the previous one if any).

Find the existing:

```js
    function onSectionChange() {
      var section = document.getElementById('section-select').value;
      ...
    }
```

ADD at the top of the function, BEFORE the mountBoard call:

```js
      // v3 P1+P2: changing the section is implicitly an exit + re-enter Live.
      var prev = _liveSectionRef;
      if (prev && prev !== section) _sendLiveStop(prev);
      if (section) _sendLiveStart(section);
      _liveSectionRef = section;
```

Where `_liveSectionRef` is a new module-scope `var _liveSectionRef = null;`.

On `enterLiveMode` and `exitLiveMode`, keep `_liveSectionRef` in sync.

Finally, call `startMonitorMode()` at the end of the access-check
success path (i.e. when the page reveals `board-region`), instead of
the (current) implicit auto-mount.

### C7. Tests (Unit T -- delayed)

The 4 implementation units land first; tests land after the planner
verifies the diff. New tests:

- **cr `tests/classroom.test.js`** (extend): subscribeMonitor adds the
  ws + replies with classroom_state_all; unsubscribeMonitor removes;
  detach removes; setLive transitions room.live + emits a
  classroom_live_state broadcast to room + monitors; broadcasts from
  existing methods (join, armGate, vote, etc.) reach monitor sockets
  when at least one is subscribed.
- **this repo `tests/classroom-board.test.js`** (extend): _reduce
  handles classroom_live_state; emptyState includes `live: false`;
  state.live preserved through every other case; onStateChange summary
  carries live.
- **this repo `tests/classroom-structure.test.js`** (extend): structure
  pin for the new `live` field in emptyState; pin for the
  classroom_live_state case in _reduce.

## Acceptance

After A+B+C+D+E land + the test units:

1. `git diff` in cr touches ONLY `railway-server/classroom.js`,
   `railway-server/server.js`, `tests/classroom.test.js`.
2. `git diff` in this repo touches ONLY `teacher-classroom.html`,
   `classroom-board.js`, `ap_stats_roadmap_square_mode.html`,
   `tests/classroom-board.test.js`, `tests/classroom-structure.test.js`,
   and adds this contract file (untracked -> tracked).
3. cr vitest baseline (902/903 known fail in redox-chat) -> green for
   classroom-related tests; +>=6 new tests pass.
4. follow-alongs root vitest baseline (4899/4900) -> green; +>=4 new
   tests pass; no regression.
5. Grep `classroom_monitor_start` / `classroom_monitor_stop` in
   `railway-server/server.js` each return >=1 hit.
6. Grep `subscribeMonitor` / `setLive` in `railway-server/classroom.js`
   each return >=2 hits (definition + use).
7. Grep `classroom_live_state` in `classroom-board.js` returns >=1 hit
   (the new case).
8. Grep `_renderLiveIndicator` in `ap_stats_roadmap_square_mode.html`
   returns >=2 hits (definition + call).
9. Grep `btn-go-live` and `btn-exit-live` in `teacher-classroom.html`
   each return >=2 hits (HTML id + JS listener).

## Out of scope

- P3 (WebRTC star transport) -- this contract only restructures the WS
  flow + cockpit UI; the WebRTC swap is a separate phase.
- P4 (vote-with-your-feet data mode) -- needs P3 first.
- The Teacher avatar visible in Live mode (spec Section 7) -- deferred
  to P3 with the WebRTC swap, since the teacher sprite is most natural
  alongside the new transport.
- The Teacher -> Student Console (avatar-click actions) -- sibling
  feature, separate spec, not built here.

## Codex review checklist (for the cross-agent review step)

- subscribeMonitor: idempotent on repeat-subscribe? Idempotent on
  unsubscribe-without-prior-subscribe?
- _fanoutToMonitors: does it correctly dedupe (a member socket that
  is ALSO a monitor socket shouldn't receive the same broadcast twice)?
- detach: does it remove from monitorSockets BEFORE building the
  detach broadcasts (otherwise the detached ws gets the broadcast it
  just generated)?
- buildAllSectionsStatePayload: is it safe to call with zero rooms?
- setLive: identity transition (already live + set live again) is a
  no-op?
- The new server.js handlers: do they degrade gracefully if the
  payload is malformed?
- Cockpit JS: does `startMonitorMode` survive a re-call when already
  in monitor mode? Does enter/exit Live correctly tear down monitor
  WS without double-listening?
- Desk indicator: does it survive `onStateChange` being called with
  no `live` field (back-compat)?
- _reduce: does the `state.live` preservation in every case hold up
  when v2.1 messages arrive at a freshly-joined room?
