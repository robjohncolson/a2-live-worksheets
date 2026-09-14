# ANDROID PHASE 3 — P2P gossip (epidemic ledger sync)

> Builds on ANDROID_PACKET_APP_SPEC §5/§6 and Phase 2 (the local signed-ledger
> G-Set in `ledger-store.js`). Phase 2 made each device hold a content-addressed,
> signature-verified replica of its own + (eventually) the class's signed rows.
> Phase 3 makes devices **gossip that G-Set peer-to-peer**, so a student's work
> reaches the teacher via *classmates* even with no internet and no direct
> student↔teacher contact.
>
> **Status:** spec → implement. The pure gossip engine + transport contract are
> buildable + testable NOW (transport-agnostic). The native Nearby-Connections
> Capacitor plugin is a separate, device-tested lift — **gated on the transport
> decision below.**

---

## 0. Why this is mostly already done

The hard parts are Phase 2's: the data is a **G-Set keyed by `receipt_id`**
(content address), so **merge = union, dedup, idempotent, order-independent —
conflicts are impossible** (CRDT). Gossip is just "exchange sets until everyone
converges." The only genuinely new things are (a) the anti-entropy protocol and
(b) a transport.

| Reused | From |
|---|---|
| `LedgerStore` (union merge, `keyOf`=receipt_id, `verifyAll`) | Phase 2 |
| `receipt-verify.js` (Ed25519 verify) | Phase 2 |
| `/ledger/import` (teacher ingest of a bundle) | s27 offline mode |
| `apstats-offline-export/v1` bundle shape | s27 |

---

## 1. The gossip engine (`ledger-gossip.js`, pure, transport-agnostic)

Anti-entropy between two peers, symmetric. `window.LedgerGossip`:

- `digest(rows)` → `{ ids: [receipt_id…], v: 1 }` — the cheap "here's what I have."
  Plain id list (rows are small signed JSON; a class-year is a few thousand ids =
  tens of KB — fine over even BLE in chunks; a Bloom digest is a v2 optimization).
- `planSync(myDigest, peerDigest)` → `{ toSend: [ids the peer lacks], toRequest:
  [ids I lack] }` — pure set difference.
- `frame(type, payload)` / `parse(msg)` — wire framing for the message types:
  - `HELLO` `{digest}` — announce my set on connect.
  - `REQUEST` `{ids}` — please send these rows.
  - `SEND` `{rows}` — here are rows (each a full signed `item_ledger` row w/
    `receipt_compact`).
  - `BYE` — done.
- `ingest(rows, {verify, store})` → `Promise<{accepted, rejected, ids}>` —
  **VERIFY-ON-INGEST is the security boundary:** each row's `receipt_compact` must
  verify against a trusted issuer (`receipt-verify.js`); unsigned/tampered rows are
  **rejected, never stored, never re-gossiped.** Accepted rows go to `LedgerStore`
  (union). Idempotent.
- `runExchange(transport, peerId, {store, verify})` — drive one full HELLO→plan→
  REQUEST/SEND→ingest round with a peer, over an injected transport. Pure w.r.t.
  the transport (testable with a mock).

**Epidemic delivery:** because every pairwise exchange unions sets, a row hops
A→B→teacher transitively. No peer needs to meet the teacher; the union is the truth
(sealed by the daily epoch anchor, which detects any device's gaps).

## 2. Security & privacy (inherited, restated)

- **Integrity:** only issuer-signed rows are accepted on ingest → a malicious peer
  **cannot inject fake grades** (forgery needs the teacher key). Replay is harmless
  (idempotent G-Set; latest-signed-ts wins in `computeGrade`). Withholding is
  detected by the epoch anchor.
- **Authority:** a student device only ever relays **submissions/signed rows** — it
  never mints a grade. Grades trace to the teacher key (Phase 4).
- **Privacy:** clear-text (ANDROID_PACKET_APP_SPEC §9, accepted). A phone ends up
  holding the class's signed rows; the UI shows a student only their own. A
  determined kid could read raw classmate rows — explicitly accepted (low-stakes
  pedagogy, max durability).

## 3. Transport contract (`GossipTransport`)

The engine is transport-agnostic. A transport implements:

```
start({ onPeer(peerId), onMessage(peerId, msg), onLost(peerId) }) -> Promise
send(peerId, msg) -> Promise        // msg is a framed string
stop() -> Promise
```

Implementations:
- **MockTransport** (in-memory, tests) — wires N peers into one bus; proves
  two-peer + multi-hop convergence with zero native code.
- **NearbyTransport** (Phase 3 native) — a Capacitor plugin wrapping Android
  **Nearby Connections** (`P2P_CLUSTER`: BT + BLE + Wi-Fi Direct, auto-discovery,
  no pairing). The one device-tested piece.
- (optional v2) **LanTransport** — WebSocket/WebRTC on a shared LAN, reusing the
  classroom server, for when Nearby is unavailable.

## 4. Desk hook

A "Sync nearby" action (Apps/Teacher menu) that, when a transport is registered
(`window.GossipTransport`), runs `LedgerGossip.runExchange` against discovered
peers and reports "+N records received". No-op (hidden/disabled) when no transport
is present — so the GH-Pages web Desk is unaffected; only the APK (which ships the
native plugin) lights it up.

## 5. THE DECISION (gates the native plugin, Task 9)

How to implement `NearbyTransport`:

- **(a) Custom Capacitor plugin over Google Nearby Connections** — the spec's
  pick. Best UX (no pairing, auto-discover, BT/BLE/Wi-Fi-Direct fallback), but it's
  bespoke Java/Kotlin + `@capacitor/android` plugin scaffolding + 2-device testing,
  and pulls in Google Play Services (fine for sideload).
- **(b) An existing community Capacitor/Cordova Nearby or BLE plugin** — less code
  if one is maintained for current Capacitor; risk of staleness/abandonment.
- **(c) Defer transport; ship the engine + a manual QR/file bundle exchange now**
  — the `apstats-offline-export/v1` bundle already moves rows device↔teacher over
  USB/file; QR handles a single record. Zero native code; gossip automation lands
  later.

## 6. Phases / build order
1. `ledger-gossip.js` engine + MockTransport + convergence tests. **(now)**
2. Transport contract + Desk "Sync nearby" hook (no-op without a transport) + tests.
3. **[gated]** `NearbyTransport` native plugin per the §5 decision + 2-device adb test.

## 7. Out of scope
Bloom-filter digests (v2), LAN/WebRTC transport (v2), per-student keypairs /
non-repudiation (v2), the teacher signing key + grade-FRQ loop (Phase 4).
