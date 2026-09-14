# Spec: Multiplayer Enhancements — WebRTC, Quit Messages, Leaderboard, Window Fix

## Overview

Four enhancements to `ap_stats_roadmap_square_mode.html` and `railway-server/server.js`:

1. **Fix window shrink on line clear** — CSS height fix
2. **Better quit/disconnect messages** — differentiate intentional quit from disconnect, show scores
3. **WebRTC P2P** — DataChannel for game state when on same network, Railway relay fallback
4. **Leaderboard** — top 3 high scores displayed on mode-select screen

---

## 1. Fix Window Shrink on Line Clear

**Root cause:** `.game-help` uses `min-height: 32px` but text wraps to variable heights. When flash messages replace long default text, help bar shrinks, causing `.game-window` (centered via `translate(-50%,-50%)`) to visibly shift.

**Fix:** Change `.game-help` from `min-height: 32px` to `height: 40px`. Overflow is already hidden.

**Status:** Already implemented (P0 complete).

---

## 2. Better Quit/Disconnect Messages

### Server change
- `game_leave` → send `{ type: 'opponent_left', reason: 'quit' }` to opponent
- WS disconnect → send `{ type: 'opponent_left', reason: 'disconnect' }` to opponent

### Client change
Modify `opponentLeft()` in studyBreak:
- `reason === 'quit'` → "Opponent fled! You win!" + show scores
- `reason === 'disconnect'` → "Alice disconnected" + show scores
- Both show final score comparison: "You: 1250 | Alice: 980"

Modify `opponentKO()` to also show a clear "You win!" message with score comparison.

---

## 3. WebRTC P2P with Railway Signaling

### Concept
After `match_start`, attempt to establish an RTCPeerConnection with a DataChannel. If successful, game state flows P2P (low latency on LAN). If it fails within 5 seconds, silently fall back to Railway WS relay (current behavior).

### Server changes (signaling relay)
Add three new message type handlers that relay within the game room:
- `rtc_offer` → forward SDP offer to opponent
- `rtc_answer` → forward SDP answer to opponent
- `rtc_ice` → forward ICE candidate to opponent

These follow the exact same relay pattern as `game_state`:
```js
case 'rtc_offer': case 'rtc_answer': case 'rtc_ice': {
    const roomId = wsToRoom.get(ws);
    if (!roomId) break;
    const room = gameRooms.get(roomId);
    if (!room) break;
    const opponent = room.p1 === ws ? room.p2 : room.p1;
    if (opponent && opponent.readyState === 1) {
        opponent.send(JSON.stringify(data));
    }
    break;
}
```

### Client implementation

#### ICE configuration
```js
{ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
```
No TURN server needed — school LAN provides direct connectivity.

#### Connection flow
1. After `match_start`, both players create `RTCPeerConnection`
2. The "host" (side === 0 from match_start data) creates DataChannel and SDP offer
3. Host sends `{ type: 'rtc_offer', sdp: localDescription }` via WS
4. Guest receives offer, sets remote description, creates answer
5. Guest sends `{ type: 'rtc_answer', sdp: localDescription }` via WS
6. Both exchange ICE candidates via `{ type: 'rtc_ice', candidate }`
7. When DataChannel opens → set `this.useP2P = true`
8. All game state/garbage messages go through DataChannel instead of WS
9. If DataChannel doesn't open within 5s → `this.useP2P = false` (keep WS relay)

#### Message routing
Replace direct `this.mpWs.send(...)` calls with a helper:
```js
sendGameMessage(msg) {
    const json = JSON.stringify(msg);
    if (this.useP2P && this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(json);
    } else if (this.mpWs && this.mpWs.readyState === 1) {
        this.mpWs.send(json);
    }
}
```

#### DataChannel message handling
Messages received on DataChannel are the raw game messages (game_state, game_garbage, game_over) — not the server-translated types (opponent_state, garbage_incoming, opponent_ko). So the DataChannel handler needs to translate:
```js
dataChannel.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'game_state') data.type = 'opponent_state';
    else if (data.type === 'game_garbage') { data.type = 'garbage_incoming'; }
    else if (data.type === 'game_over') { data.type = 'opponent_ko'; data.finalScore = data.score; }
    this.handleMpMessage(data);
};
```

#### Cleanup
On game close/leave, close the peer connection and data channel:
```js
if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
if (this.dataChannel) { this.dataChannel = null; }
this.useP2P = false;
```

---

## 4. Leaderboard

### Server: in-memory top 3
Add a `leaderboard` array (max 3 entries, sorted by score descending):
```js
const leaderboard = [];  // [{ name, score, mode, date }]
```

New message types:
- `leaderboard_submit` → client sends `{ type: 'leaderboard_submit', name, score, mode }` after game over
- `leaderboard_get` → client sends `{ type: 'leaderboard_get' }`; server responds with `{ type: 'leaderboard_data', entries: [...] }`

Server inserts score if it's top 3, keeps array sorted and trimmed.

### Client: display on mode-select screen
In `drawModeSelect()`, add a "Hall of Fame" section below the Solo/1v1 buttons:
```
┌─────────────────────────────┐
│      STUDY BREAK            │
│      Square Mode            │
│                             │
│   [Solo]     [1v1]          │
│                             │
│   ── Hall of Fame ──        │
│   1. Alice  2450  solo      │
│   2. Bob    1980  1v1       │
│   3. Carol  1650  solo      │
│                             │
└─────────────────────────────┘
```

Fetch leaderboard on game open via WS (or DogePresence WS if connected).

Submit score on game over if it might be top 3.

### Persistence
In-memory on Railway server. Resets on deploy. This is fine for a fun Easter egg.

---

## 5. Files Modified

| File | Changes |
|------|---------|
| `ap_stats_roadmap_square_mode.html` | CSS fix, quit messages, WebRTC client, leaderboard UI |
| `../curriculum_render/railway-server/server.js` | RTC relay, quit reason, leaderboard storage |

---

## 6. Implementation Order

```
P0: CSS fix (done)
P1: Server enhancements (relay + quit reason + leaderboard) — different file
P2: Quit/disconnect messages — client, after P1
P3: WebRTC P2P — client, after P2
P4: Leaderboard UI — client, after P3
P5: Commit & push
```

P0 and P1 run in parallel (different files). P2→P3→P4 sequential (same HTML file).
