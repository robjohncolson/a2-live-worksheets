# LIVE_CLASSROOM_V3 P3 -- Build Contract (FROZEN)

Session 111, 2026-05-23. Design: `LIVE_CLASSROOM_V3_SPEC.md` Section 6
(transport) + Section 9 Phase 3. Implements the WebRTC star transport.
Builds on P1+P2 (`LIVE_CLASSROOM_V3_P12_BUILD.md`, shipped).

This contract is FROZEN -- implement verbatim. Do NOT improvise
message names, payload fields, timeout values, or STUN endpoints.

## Correction (Codex read-only review, session 111)

Codex found 1 BLOCKER + 3 MAJOR + 1 MINOR. Three folded inline; one
deferred to P3.1 with documentation.

- **BLOCKER (folded)**: `enterLiveMode` initiated peer connections
  for already-online students before the board WS was open, so
  `boardHandle.sendSignaling` silently dropped the rtc_offer and the
  3 s timeout left a dead stub in `studentPeers`, blocking retry.
  **Fold:** (a) `classroom-board.js`'s `sendSignaling` now queues
  payloads when `ws.readyState !== 1` and flushes the queue in
  `ws.onopen` (after `sendJoin`); (b) the cockpit's 3 s timeout
  `delete studentPeers[username]` instead of nulling fields, so a
  later `_initPeerFor` can retry.
- **MAJOR 1 (folded)**: the new-student-during-Live path was wired to
  `_applyMonitorDelta`, but `enterLiveMode` unsubscribes the monitor.
  **Fold:** added `_reconcileStudentPeers(summary)` driven from the
  board's `onStateChange` (the authoritative live source). It both
  initiates peers for new online students and tears down peers for
  departed / offline students. Idempotent via `if (!studentPeers[uname])`
  for the add path; safe to be called on every state change.
- **MAJOR 3 (folded)**: trickle-ICE ordering. ICE candidates can arrive
  before the `setRemoteDescription` promise resolves; `addIceCandidate`
  would then reject. **Fold:** per-peer `pendingIce` queue + `remoteDescSet`
  flag on both the cockpit (`entry.pendingIce` / `entry.remoteDescSet`)
  and the student (`_peerPendingIce` / `_peerRemoteDescSet`). ICE is
  buffered when the remote description is not yet set; the queue is
  drained inside the `setRemoteDescription` `.then`. All Promise-returning
  WebRTC calls also got `.catch(function(){})` handlers to silence
  unhandled rejections.
- **MAJOR 2 (deferred to P3.1)**: split-brain DC ↔ WS relay. When a
  DC-connected student moves, the cockpit's DC.onmessage relays only
  to OTHER DC peers; WS-fallback students never receive DC peers'
  positions. The Codex-proposed fix requires a new server-side message
  (`classroom_pos_relay` with a teacher-only `from` override) so the
  cockpit can dual-send DC + WS. Decision: defer to P3.1 with the
  known limitation documented (impact is small in the primary use
  case -- everyone on the school network -- and zero when no student
  is in WS fallback). If real classroom usage surfaces a need, P3.1
  is ~30 lines (a new handler + a per-peer transport chooser).
- **MINOR (folded by tests)**: the original test set dodged the race
  scenarios. **Fold:** added a new test
  `Codex MAJOR 3 fold: rtc_ice arriving BEFORE rtc_answer is queued + flushed`
  in `tests/v3-p3-webrtc.test.js` that exercises the queued-ICE
  contract; the existing `_handleRtcSignaling routes rtc_ice ...` test
  was updated to wait for rtc_answer first (its prior shape would
  have failed under the new queued behavior, a real correctness
  signal).

Post-fold test counts: cr 923/924 (unchanged), follow-alongs 4927/4928
(+1 new queued-ICE test; +20 over the v3-P3 baseline).

## Dependency analysis

Cross-repo work. Three implementation units + one test unit:

- **Unit A** (cr `railway-server/server.js` + `railway-server/classroom.js`):
  add three new WS message handlers (`rtc_offer`, `rtc_answer`,
  `rtc_ice`) for the classroom case + a `findSocketByUsername(section, username)`
  helper in `classroom.js`. The handlers route by `to: username` within
  the sender's section.
- **Unit B** (`teacher-classroom.html`): cockpit-side hub manager.
  On Live entry, initiate WebRTC to every student in the active
  section. On a new student member-update, initiate WebRTC for them.
  Manage `studentPeers: Map<username, { pc, dc, dcOpen }>`. Relay
  classroom_pos arriving via DC to other students' DCs.
- **Unit C** (`classroom-board.js`): student-side WebRTC receiver.
  On receiving `rtc_offer`, create RTCPeerConnection as guest, set
  remote description, send `rtc_answer`. On DC open, switch
  `classroom_pos` send path from WS to DC.
- **Unit T** (tests): vitest mocks for `RTCPeerConnection` + `RTCDataChannel`;
  verify the protocol order + fallback. Both repos.

A, B, C are independent at the file level but share the wire protocol
(spelled out below). All three can run in parallel.

## The contract -- verbatim

### C1. New WS message shapes

The three signaling messages **EXTEND** the existing Tetris pattern
with an additive `to: username` field so the server can route per-peer
inside the same section's room. The classroom-context discriminator
is the sender's binding: a teacher socket in a section can target any
student in that section; a student socket can only target the teacher
of their section (the cockpit).

| Type           | Direction                  | Payload                                                                         |
|----------------|----------------------------|---------------------------------------------------------------------------------|
| `rtc_offer`    | Cockpit -> server -> student | `{ to: studentUsername, sdp: <RTCSessionDescriptionInit> }`                     |
| `rtc_answer`   | Student -> server -> cockpit | `{ to: teacherUsername, sdp: <RTCSessionDescriptionInit> }`                     |
| `rtc_ice`      | Either direction           | `{ to: peerUsername, candidate: <RTCIceCandidateInit> }`                        |

Server forwards each message to the target socket (looked up via the
sender's section + the `to` username), adding `from: senderUsername` to
the payload so the receiver knows which peer originated it. The
`section` field is NOT carried on the wire -- it's derived server-side
from the sender's binding (`wsIndex.get(ws).section`).

Forwarded payload shape:

```js
{ type: 'rtc_offer', from: 'teacher1', sdp: { ... } }
```

If `to` does not name a member of the sender's section: drop silently.

### C2. classroom.js helper

Add a public helper to the registry:

```js
  // findSocketByUsername(section, username) -> [ws, ws, ...]
  // Returns the open WS sockets bound to (section, username), or an
  // empty array if the user is not in the section or has no sockets.
  // Used by the rtc_* relay to target a specific peer in the same room.
  function findSocketByUsername(section, username) {
    if (!classrooms.has(section)) { return []; }
    var room = classrooms.get(section);
    var member = room.members.get(username);
    if (!member) { return []; }
    var sockets = [];
    member.sockets.forEach(function(s) {
      if (s.readyState === 1) { sockets.push(s); }
    });
    return sockets;
  }
```

Expose in the registry's return object alongside the other public
methods.

### C3. server.js handlers

After the existing `case 'classroom_live_stop'` block (introduced in
P1+P2) and BEFORE the `default:` case, insert three new handler
blocks. Verbatim ASCII:

```js
        // --- v3 P3: WebRTC signaling for the classroom case ----------
        // The three rtc_* messages route by `to: username` within the
        // sender's section. They're shared with Tetris's game P2P but
        // the classroom case is opt-in via the `to` field's presence
        // and the sender being bound to a classroom room.

        case 'rtc_offer':
        case 'rtc_answer':
        case 'rtc_ice': {
          var senderEntry = classroomRegistry._wsEntry
            ? classroomRegistry._wsEntry(ws) : null;
          if (!senderEntry) {
            // Sender is not bound to a classroom room -- this might be
            // the Tetris path. Fall through to existing Tetris routing
            // (if present); for the classroom case we require a binding.
            break;
          }
          var targetUsername = (data.to || '').trim();
          if (!targetUsername) break;
          var targetSockets = classroomRegistry.findSocketByUsername(
            senderEntry.section, targetUsername);
          if (targetSockets.length === 0) break;
          var forwardPayload = {
            type: data.type,
            from: senderEntry.username
          };
          if (data.sdp != null)       { forwardPayload.sdp = data.sdp; }
          if (data.candidate != null) { forwardPayload.candidate = data.candidate; }
          var forwardMsg = JSON.stringify(forwardPayload);
          targetSockets.forEach(function(sock) {
            try { sock.send(forwardMsg); } catch (e) { /* ignore */ }
          });
          break;
        }
```

To support the `_wsEntry` lookup, also expose it from classroom.js:

```js
  // _wsEntry(ws) -> { section, username } | null
  // Internal-but-exported lookup for the section/username bound to a ws.
  // Used by server.js to route the rtc_* signaling without re-parsing
  // any classroom_join payload.
  function _wsEntry(ws) {
    return wsIndex.get(ws) || null;
  }
```

Expose in the return object.

### C4. Cockpit-side hub manager (teacher-classroom.html)

Add a new code section at module-scope (alongside the existing
`enterLiveMode` / `exitLiveMode` / `_sendLiveStart` etc.):

```js
    // ===== v3 P3: WebRTC star -- cockpit is the hub for Live mode =====
    //
    // On Live entry, the cockpit opens an RTCPeerConnection per student
    // in the active section + a 'livedata' DataChannel; classroom_pos
    // flows via DC when open, falling back to WS per-student. The
    // cockpit RELAYS each incoming DC classroom_pos to the OTHER
    // students' DCs (server is not in this path); WS-arrived
    // classroom_pos messages are already broadcast by the server, so
    // the cockpit does NOT re-relay them via DC.

    var STUN_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
    var P3_DC_TIMEOUT_MS = 3000;     // 3 s to negotiate; else fall back

    // studentPeers[username] = { pc, dc, dcOpen, timeoutId }
    var studentPeers = {};

    function _initPeerFor(username) {
      if (studentPeers[username]) { return studentPeers[username]; }
      if (typeof RTCPeerConnection === 'undefined') { return null; }
      var entry = { pc: null, dc: null, dcOpen: false, timeoutId: null };
      try {
        entry.pc = new RTCPeerConnection({ iceServers: STUN_ICE_SERVERS });
      } catch (_) {
        return null;   // WebRTC unavailable -- cockpit stays in WS mode
      }
      entry.dc = entry.pc.createDataChannel('livedata');
      _wireDataChannel(entry.dc, username);
      entry.pc.onicecandidate = function(ev) {
        if (ev.candidate) {
          _sendSignalingOverWs({ type: 'rtc_ice', to: username, candidate: ev.candidate });
        }
      };
      // Fallback timeout: if the DC isn't open in 3 s, mark as failed
      // and the cockpit's outbound relay routes via WS for this peer.
      entry.timeoutId = setTimeout(function() {
        if (!entry.dcOpen) {
          try { entry.pc.close(); } catch (_) {}
          entry.pc = null;
          entry.dc = null;
        }
      }, P3_DC_TIMEOUT_MS);
      studentPeers[username] = entry;
      // Initiate the offer.
      entry.pc.createOffer().then(function(offer) {
        return entry.pc.setLocalDescription(offer);
      }).then(function() {
        _sendSignalingOverWs({ type: 'rtc_offer', to: username, sdp: entry.pc.localDescription });
      }).catch(function() { /* offer creation failed -- fall back to WS */ });
      return entry;
    }

    function _wireDataChannel(dc, username) {
      dc.onopen = function() {
        if (studentPeers[username]) {
          studentPeers[username].dcOpen = true;
          if (studentPeers[username].timeoutId) {
            clearTimeout(studentPeers[username].timeoutId);
            studentPeers[username].timeoutId = null;
          }
        }
      };
      dc.onclose = function() {
        if (studentPeers[username]) { studentPeers[username].dcOpen = false; }
      };
      dc.onmessage = function(ev) {
        var msg = null;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || msg.type !== 'classroom_pos') return;
        // Relay this position to every OTHER student's DC. Skip the
        // sender. WS path is not touched -- the sender did not use it,
        // and the server therefore did not broadcast.
        for (var other in studentPeers) {
          if (other === username) continue;
          var p = studentPeers[other];
          if (p && p.dcOpen && p.dc) {
            try { p.dc.send(JSON.stringify({
              type: 'classroom_pos',
              from: username,
              x: msg.x, y: msg.y, state: msg.state, vx: msg.vx
            })); } catch (_) {}
          }
        }
      };
    }

    function _handleRtcSignaling(msg) {
      if (!msg || !msg.from || !msg.type) return;
      var fromUser = msg.from;
      var entry = studentPeers[fromUser];
      if (!entry || !entry.pc) return;
      if (msg.type === 'rtc_answer' && msg.sdp) {
        try { entry.pc.setRemoteDescription(msg.sdp); } catch (_) {}
      } else if (msg.type === 'rtc_ice' && msg.candidate) {
        try { entry.pc.addIceCandidate(msg.candidate); } catch (_) {}
      }
    }

    function _teardownAllPeers() {
      for (var u in studentPeers) {
        var p = studentPeers[u];
        if (p) {
          if (p.timeoutId) { clearTimeout(p.timeoutId); }
          if (p.dc) { try { p.dc.close(); } catch (_) {} }
          if (p.pc) { try { p.pc.close(); } catch (_) {} }
        }
      }
      studentPeers = {};
    }

    // _sendSignalingOverWs: routed through the BOARD's WS, exposed via
    // boardHandle.sendSignaling. The board has done classroom_join with
    // (section, teacherUsername, role: 'teacher') so its wsIndex entry
    // lets the server's rtc_* relay find it. The monitor WS does NOT
    // have a section binding -- it would be dropped server-side.
    function _sendSignalingOverWs(payload) {
      if (boardHandle && typeof boardHandle.sendSignaling === 'function') {
        try { boardHandle.sendSignaling(payload); } catch (_) {}
      }
    }
```

Wire these in:

1. In `enterLiveMode(section)`, AFTER the existing mountBoard +
   `_sendLiveStart(section)` calls, initiate WebRTC for every student
   currently shown in the section:

   ```js
       // v3 P3: open WebRTC to every student currently in the section.
       // _globalState carries the monitor snapshot per section; pull the
       // student usernames for the active section and initiate.
       var sec = (_globalState.sections || []).filter(function(s) {
         return s.section === section;
       })[0];
       if (sec && sec.members) {
         for (var mi = 0; mi < sec.members.length; mi++) {
           var m = sec.members[mi];
           if (m && m.role === 'student' && m.online !== false) {
             _initPeerFor(m.username);
           }
         }
       }
   ```

2. In `exitLiveMode()`, AFTER the existing teardown + `_sendLiveStop`,
   call `_teardownAllPeers()`.

3. In `_applyMonitorDelta(msg)`, if `msg.type === 'classroom_member_update'`
   AND `_cockpitMode === 'live'` AND the active section matches AND
   the member is a student AND member.online !== false, initiate WebRTC
   for them (handles the "new student joins during Live" case):

   ```js
       // v3 P3: a new student in the active Live section -> open WebRTC.
       if (_cockpitMode === 'live'
           && msg.section === _liveSectionRef
           && msg.member && msg.member.role === 'student'
           && msg.member.online !== false) {
         _initPeerFor(msg.member.username);
       }
   ```

4. In the `mountBoard(section, session)` call's `ClassroomBoard.mount`
   options literal, ADD an `onSignaling` callback alongside the existing
   `onStateChange`:

   ```js
         onSignaling: function (msg) {
           // v3 P3: rtc_answer / rtc_ice from a student peer; route to
           // the cockpit's hub manager. The board's role is 'teacher'
           // so the WS handler delegates these instead of consuming
           // them locally.
           _handleRtcSignaling(msg);
         },
   ```

   The monitor WS does NOT handle rtc_* (no section binding -- the
   server-side relay would drop the message).

### C4.5. ClassroomBoard public API additions

`classroom-board.js`'s `mount()` return value (the handle) gains ONE
method, additive:

```js
      sendSignaling: function (payload) {
        // Pass-through send over the board's WS. Used by the cockpit
        // to route rtc_offer / rtc_ice to specific students. The board
        // has the right wsIndex entry (classroom_join'd as 'teacher'
        // for the active section) so the server's rtc_* relay can
        // find it.
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify(payload)); } catch (_) {}
        }
      },
```

And `mount()` opts gain ONE new field:

- `onSignaling`: `function(msg) { ... }` -- called when the WS receives
  a `rtc_offer` / `rtc_answer` / `rtc_ice` AND the local role is
  `'teacher'`. The board's WS handler dispatches these to onSignaling
  instead of consuming them; teachers don't act as WebRTC peers from
  within the board. (When the role is `'student'`, the WS handler
  consumes them internally -- see C5.)

### C5. Student-side WebRTC receiver (classroom-board.js)

Add a new module-scope block at the top of mount() (the inner function
that opens the WS), after the existing state setup and before the WS
message handler:

```js
    // v3 P3: WebRTC peer connection (student-as-guest). Receives an
    // rtc_offer from the cockpit when its section enters Live mode;
    // creates a PC, sets remote, sends rtc_answer. The DC is opened
    // by the cockpit; ondatachannel hooks it. Once open, classroom_pos
    // sends prefer DC; otherwise WS.
    var _peerConnection = null;
    var _peerDataChannel = null;
    var _peerDcOpen = false;
    var _peerTeacherUsername = null;

    function _handleP3Offer(fromUsername, sdp) {
      if (typeof RTCPeerConnection === 'undefined') { return; }
      if (_peerConnection) { _teardownPeer(); }
      _peerTeacherUsername = fromUsername;
      try {
        _peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      } catch (_) { _peerConnection = null; return; }
      _peerConnection.onicecandidate = function(ev) {
        if (ev.candidate && ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'rtc_ice', to: fromUsername, candidate: ev.candidate })); } catch (_) {}
        }
      };
      _peerConnection.ondatachannel = function(ev) {
        _peerDataChannel = ev.channel;
        _peerDataChannel.onopen = function() { _peerDcOpen = true; };
        _peerDataChannel.onclose = function() { _peerDcOpen = false; };
        _peerDataChannel.onmessage = function(mev) {
          var pos = null;
          try { pos = JSON.parse(mev.data); } catch (_) { return; }
          if (!pos || pos.type !== 'classroom_pos') return;
          // Route through the same applyPos path as the WS classroom_pos
          // handler. The `from` field identifies which peer this is.
          if (typeof applyPos === 'function') {
            applyPos({ username: pos.from, x: pos.x, y: pos.y, state: pos.state, vx: pos.vx });
          }
        };
      };
      _peerConnection.setRemoteDescription(sdp).then(function() {
        return _peerConnection.createAnswer();
      }).then(function(answer) {
        return _peerConnection.setLocalDescription(answer);
      }).then(function() {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'rtc_answer', to: fromUsername, sdp: _peerConnection.localDescription })); } catch (_) {}
        }
      }).catch(function() { _teardownPeer(); });
    }

    function _handleP3Ice(candidate) {
      if (_peerConnection && candidate) {
        try { _peerConnection.addIceCandidate(candidate); } catch (_) {}
      }
    }

    function _teardownPeer() {
      if (_peerDataChannel) { try { _peerDataChannel.close(); } catch (_) {} _peerDataChannel = null; }
      if (_peerConnection)  { try { _peerConnection.close(); }  catch (_) {} _peerConnection  = null; }
      _peerDcOpen = false;
      _peerTeacherUsername = null;
    }
```

Wire into the WS message handler (`onmessage`) -- add cases for the
new rtc_* types. The dispatch is role-aware: students consume rtc_*
internally; teachers delegate to opts.onSignaling.

```js
            } else if (msg.type === 'rtc_offer' || msg.type === 'rtc_answer' || msg.type === 'rtc_ice') {
              if (role === 'teacher') {
                // Cockpit: delegate to the user's onSignaling callback.
                if (typeof opts.onSignaling === 'function') {
                  try { opts.onSignaling(msg); } catch (_) {}
                }
              } else {
                // Student: handle locally as a guest peer.
                if (msg.type === 'rtc_offer' && msg.from && msg.sdp) {
                  _handleP3Offer(msg.from, msg.sdp);
                } else if (msg.type === 'rtc_ice' && msg.candidate) {
                  _handleP3Ice(msg.candidate);
                }
                // rtc_answer is teacher-bound; students drop it silently.
              }
            } else if (msg.type === 'classroom_live_state' && msg.live === false) {
              if (role !== 'teacher') { _teardownPeer(); }
              // Note: the existing _reduce dispatch above handles
              // classroom_live_state for state.live (preserved through
              // every case). This teardown is purely the WebRTC side.
```

In the PlayerSprite's emit path (the `onPos` callback that today calls
`safeSend` with type:'classroom_pos'), prefer DC when open. Find the
existing `safeSend({type:'classroom_pos', ...})` call and change it to:

```js
        baseOpts.onPos = function (msg) {
          var payload = {
            type:  'classroom_pos',
            x:     msg.x,
            y:     msg.y,
            state: msg.state,
            vx:    msg.vx
          };
          // v3 P3: prefer DC when open; fall back to WS.
          if (_peerDcOpen && _peerDataChannel) {
            try { _peerDataChannel.send(JSON.stringify(payload)); return; } catch (_) {}
          }
          safeSend(payload);
        };
```

The existing `applyPos` function (which handles inbound classroom_pos
from WS) is REUSED by `_peerDataChannel.onmessage` -- no behavioral
change to applyPos itself.

Also handle teardown when destroy() / unmount happens: extend the
existing destroy logic to call `_teardownPeer()`. Find the destroy
return path and add the call.

### C6. Tests (Unit T)

WebRTC in jsdom is hard; mock RTCPeerConnection + RTCDataChannel. Each
test stubs the global RTCPeerConnection constructor and asserts on:

- the protocol order (offer -> setLocalDescription -> send rtc_offer)
- the fallback (when DC is not open, classroom_pos goes via WS)
- the relay path (cockpit gets classroom_pos via DC -> forwards to other DCs)
- teardown (Exit Live closes all PCs)

Specific tests in cr `tests/classroom.test.js`:

1. `_wsEntry(ws)` returns the section/username for a joined socket; null
   for an unbound ws.
2. `findSocketByUsername` returns the right sockets in the right section;
   empty for unknown sections/users.

Specific tests in follow-alongs (extend existing classroom-board.test.js
or add `tests/v3-p3-webrtc.test.js`):

3. cockpit's _initPeerFor creates a PC + DC, sends rtc_offer with `to`
4. cockpit's _handleRtcSignaling routes rtc_answer to the right PC
5. cockpit's DC.onmessage relays classroom_pos to other peers' DCs (skip sender)
6. cockpit's _teardownAllPeers closes everything cleanly
7. student's _handleP3Offer creates a PC, sends rtc_answer
8. student's classroom_pos prefers DC when open, WS when not
9. student's _teardownPeer is called on classroom_live_state{live:false}

Stub `RTCPeerConnection`:

```js
function mockRTCPeerConnection() {
  return function MockPC(_config) {
    this.iceServers = _config && _config.iceServers;
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.localDescription = null;
    this._channels = [];
    this.createDataChannel = function(label) {
      var dc = mockDataChannel(label);
      this._channels.push(dc);
      return dc;
    };
    this.createOffer = function() { return Promise.resolve({ type: 'offer', sdp: 'fake-offer' }); };
    this.createAnswer = function() { return Promise.resolve({ type: 'answer', sdp: 'fake-answer' }); };
    this.setLocalDescription = function(desc) { this.localDescription = desc; return Promise.resolve(); };
    this.setRemoteDescription = function() { return Promise.resolve(); };
    this.addIceCandidate = function() { return Promise.resolve(); };
    this.close = function() { this._closed = true; };
  };
}

function mockDataChannel(label) {
  return {
    label: label,
    readyState: 'connecting',
    onopen: null,
    onclose: null,
    onmessage: null,
    send: function(_) {},
    close: function() { this.readyState = 'closed'; if (this.onclose) this.onclose(); }
  };
}
```

## Acceptance

After A+B+C land + tests:

1. `git diff` in cr touches ONLY `railway-server/server.js`,
   `railway-server/classroom.js`, `tests/classroom.test.js`.
2. `git diff` in follow-alongs touches ONLY `teacher-classroom.html`,
   `classroom-board.js`, the test files, and adds the contract.
3. Grep `rtc_offer\|rtc_answer\|rtc_ice` in server.js returns >=1 hit.
4. Grep `findSocketByUsername` in classroom.js returns >=2 hits (def + use).
5. Grep `_wsEntry` in classroom.js returns >=2 hits.
6. Grep `studentPeers\|_initPeerFor\|_teardownAllPeers` in
   teacher-classroom.html each return >=2 hits.
7. Grep `_peerConnection\|_peerDataChannel\|_handleP3Offer` in
   classroom-board.js each return >=2 hits.
8. cr vitest baseline 917/918; +>=2 new tests passing.
9. follow-alongs root vitest baseline 4912/4913; +>=7 new tests passing.
10. No regression in existing v1/v2/v2.1/r3/scaling-K1/v3-P1+P2 tests.

## Out of scope

- TURN servers (only STUN). If the school network blocks UDP entirely,
  P3 falls back to WS for every student -- expected behavior.
- Cross-section signaling (a teacher running multiple sections at
  once). Out of scope while one cockpit hosts one section.
- The actual STUN probe at Go Live (the spec calls this out but it's
  a UX nicety; the 3 s timeout per peer is the working fallback).
- Server-side enforcement that an rtc_offer FROM a student is rejected
  (the current design lets students initiate too, since the cockpit
  is just a peer). The cockpit's logic does NOT respond to incoming
  rtc_offer; only it INITIATES. So a malicious student trying to
  initiate to a peer would be ignored by both ends. Sufficient for v1.
- Re-negotiation on temporary disconnect (a network blip) -- the user
  will need to Exit Live + Go Live again. Future work.

## Codex review checklist (for the cross-agent step)

- _initPeerFor: idempotent on a username we already have a PC for?
- The 3 s timeout: does it correctly clean up the PC + null it out?
- The signaling-over-monitor-ws path: does it work when the monitor
  ws is open but the board's own ws (for classroom_join) is doing
  the room binding? The server checks the SENDER's section binding;
  the monitor ws may not be bound to a section. (This is the trickiest
  part of C4 -- the contract assumes the monitor ws's wsIndex entry
  carries the teacher's section; verify the server-side actually
  sets it that way.)
- The DC relay loop: when a student's classroom_pos arrives via DC,
  cockpit forwards to all OTHER DCs -- does the skipped-sender check
  use the right key (username)?
- _teardownAllPeers: clears timeouts AND closes DCs AND closes PCs?
- The student-side _handleP3Offer: does it tear down a prior PC if
  one exists (e.g., the cockpit re-initiates after a reconnect)?
- Multi-cockpit edge: if two teachers somehow Go Live for the same
  section, both initiate to every student -- what happens? (Probably
  the student's _handleP3Offer tears down the prior PC and accepts the
  latest offer. Document this as the resolution.)
- The student's `_peerDcOpen` check on outgoing classroom_pos: is
  there a race where the DC opens after a few WS sends? (Acceptable;
  the LAST send wins on the receiver via the existing applyPos.)
