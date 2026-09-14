# APStat Park replay and three-level release (2026-09-10)

Frontend: 89bb68ef6abea118d07a9213fb3f4ad1e1444f33; build 2026-09-10-wiir.
Relay: 6be50460dcae5e8f29cef516f96f639090dc6cd5.

## Delivered behavior

- The existing calendar doorway opens a local lobby with three keyboard-operated puzzle doors: Hello together, Switchback, Lift relay. All remain available. No hourly forced reset.
- Same board canvas, dimensions, background, camera, sprite assets and keyboard controls. Calendar doorway exits; Levels doorway returns to lobby; Up after arrival returns to lobby. Teacher activity recall still applies.
- Rooms are scoped by classroom section and level. Joining an unfinished room preserves its milestones. Explicit entry after completion creates a new attempt ID, clears poses/arrivals/key/switches, and starts at spawn. A transport resume preserves the attempt; stale commands cannot affect a new attempt.
- Returning to an unfinished room after arriving clears only that student's arrival, allowing them to help friends. Completion checkmarks persist per username in this browser's local storage and never restrict play. They are cosmetic, not grades or cross-device achievement records.
- Solo opening-level step; new levels require min(online players, available switches). Requirements can ease on disconnect and do not increase after the first puzzle action. Switches latch; nobody needs simultaneous network timing. All connected players must arrive, with disconnected players excluded.
- Movement remains capped at two changed anchors/sec, idle sends no movement, lift simulation stays local, milestones use bounded reliable replay. Lobby creates no park network traffic.
- Protocol 3 excludes older cached clients. Leaving before the first join reply arrives now removes the socket's park binding.

## Verification

Relay: `node --test apstat-park/*.test.mjs` in railway-server:
```
# tests 42
# pass 42
# fail 0
```
New replay-levels.test.mjs covers all three levels with 1, 2, 8 and 24 players, switch gates, disconnect easing, replica convergence, transport resume versus explicit entry, cleared poses, stale commands, returning to help, per-level/period isolation, and leaving during handshake.
Existing motion, bounded history, fanout, key handoff, stream churn and pressure tests remain green. Protocol fixture values changed from 2 to 3. Handoff's old expectation that a late member revokes completion now asserts completion persists until explicit new entry resets it.

Frontend: `node --test apstat-park/*.test.mjs`: 3 passed, 0 failed.
`npx vitest run tests/classroom-board.test.js tests/classroom-board-level.test.js tests/classroom-board-terrain.test.js tests/classroom-board-shared-camera.test.js tests/canvas-engine-scenes.test.js tests/classroom-board-activity.test.js`:
```
Test Files  6 passed (6)
     Tests  399 passed (399)
```
`npx vitest run tests/pwa.test.js`: 28 passed, 0 failed.

`node apstat-park/browser-smoke.mjs` with PARK_PLAYWRIGHT_MODULE pointing to Agent/node_modules/playwright-core/index.mjs and PARK_BROWSER pointing to installed Edge:
```
BOARD SCENE PASS 214 packets
```
Actual keyboard completion of original level with two players and both new layouts solo; replay starts fresh; reconnect retains attempt; completion stored; stationary silence; period isolation; five teacher recalls; held-Up exit protection; actual Desk at 650px height preserves canvas dimensions/background. No browser or calendar errors. Screenshots and result JSON are in local test-results/apstat-park (not committed).

## Release and limits

Frontend Pages run 34533709006 succeeded; public version.json and panel source verified build/protocol/lobby.
Railway deployment ce7db4d1-1d5d-4748-89a1-5a7199b70774 succeeded at 6be50460dcae5e8f29cef516f96f639090dc6cd5; health HTTP 200.
Live WebSocket smoke in temporary section park_verify_1789076697172 passed all three levels with three simulated students: protocol-2 rejection, shared period room, required switch counts, key/unlock/all arrivals, completed resume preservation, explicit replay with cleared poses/arrivals/door, unique rooms per level, and isolation from a second period. All test sockets left and closed.
Public panel.mjs, board-scene.mjs, replica.mjs and sw.js matched local source SHA-256 hashes after release. GitHub's broad CI run 34533708997 was still in progress at final verification; targeted tests above all passed. Prior unrelated broad-suite failures are documented in WORKSHEET_DIAGNOSTICS_RELEASE.md.
The existing relay classroom identity trust model and two-hour inactive room retention remain. Relay restarts reset active attempts. No extracted game data, new art, server physics, grade writes, or unrelated WIP shipped.
GitNexus impact: frontend scene/panel/replica low risk; relay symbols absent from index, so callers reviewed manually. Staged detection covered expected park files and build stamps; frontend event-consumer path tested. Existing unrelated classroom.js/server.js edits were left out. Prior user authorization to override the independent release gate was applied with a per-command empty hooks path; no approval sentinel was fabricated and permanent hooks were unchanged.
