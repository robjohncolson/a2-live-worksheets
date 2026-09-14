# ANDROID PHASE 6B — QR handshake → raw-Bluetooth transfer

> Supersedes the *primacy* of the animated-QR data path in ANDROID_PHASE6_QR_SYNC_SPEC.
> Insight (2026-07-01): animated QR is a slow DATA pipe (KB/frame, ~8–15 s holds), but a
> great **discovery** channel. What actually failed us on-device was Nearby's *discovery*
> (location-perm bug, `TOO_MANY_ADVERTISERS`, mutual-advertising lottery), not the transfer.
> So use a **static QR to bootstrap a Bluetooth link, then stream the ledger over raw
> Bluetooth (RFCOMM)** — fast, **GMS-free**, congestion-immune, and (unlike Nearby)
> **portable to a laptop/PC client**, since RFCOMM/SPP is a cross-platform BT standard.
>
> **Status:** spec → REVIEWED (2026-07-01): **NOT feasible as written** — see §0. The
> transport idea is buildable, but the "QR bootstrap is faster/simpler than Nearby's
> discovery" premise is FALSE, and the crypto model is broken. Do not implement §§2–6 as
> drafted; §0 records what actually holds.

---

## 0. REVIEW VERDICT — read this first (2026-07-01)

A 2-lens feasibility+security review (Android-BT + protocol) found this **not feasible as
specified**. The value proposition that motivated the pivot — "QR handshake avoids Nearby's
flaky, slow discovery" — does not survive contact with the Android Bluetooth stack.

**Android-BT blockers (certain):**
- A listening RFCOMM socket is **connectable but NOT discoverable** (default `SCAN_MODE_CONNECTABLE`).
  To be found by a peer's `startDiscovery()` the shower must go discoverable — and a non-system app's
  only path is **`ACTION_REQUEST_DISCOVERABLE`, a mandatory system prompt** (user tap, ≤300 s).
  So "just show a static QR" is broken by a per-session OS dialog.
- **"~1–3 s targeted discovery" is impossible.** Classic inquiry is a fixed ~10–12 s omnidirectional
  broadcast you can only filter client-side, not target. Realistic handshake **10–25 s — the same
  order as the Nearby discovery this pivot was meant to beat.** Asymmetry fixes *congestion*, not *latency*.
- **Name-matching (`APX-<token>`) is unreliable** — `ACTION_FOUND` often has a null name, Android caches
  stale remote names, and `setName()` is async + a **crash-unsafe global mutation** of the phone's BT name.
  → must rendezvous on the **SDP service UUID** (`UUID5(token)` via `fetchUuidsWithSdp`), never the name.
- Permissions were under-stated: need **`BLUETOOTH_ADVERTISE`** (for discoverable/SDP on API 31+) and
  **`ACCESS_FINE_LOCATION` + the location master toggle** for classic inquiry on API <31 (the same trap
  `GossipNearby` hit).

**Security blockers (certain):** the model treats the QR-borne key as an out-of-band *secret* — but a
**QR on a classroom screen is a broadcast to every camera in the room**, and the FERPA adversary IS the
other 29 students. So (1) a classmate photographs the handback QR and gets the decryption key; (2) they
connect *first* to the one-client socket and decrypt another student's grades (and wedge the real
scanner); (3) the §2 duplex "both sides, same key" guarantees **AES-GCM nonce reuse** (catastrophic).

**What DOES hold (reusable if we ever build this):**
- Insecure RFCOMM connects with **no bonding** on Android 12/13/14; the client CAN read the server's
  **real classic MAC** from inquiry (classic doesn't randomize — BLE does, so a BLE beacon can't shortcut).
- **§0 `verifyLedgerRow` covers integrity for any transport** — so BT encryption would be *confidentiality-only*.
- The correct confidentiality fix: **bind to the student's existing Ed25519 roster identity** — encrypt the
  handback DUMP to the target student's PUBLIC key (or authenticated ECDH), so a photographed QR is useless
  to anyone lacking that student's private key. The QR carries a rendezvous token / ephemeral *public* key,
  never a decryption secret. HKDF per-direction keys + a pinned monotonic nonce (or XChaCha20 random nonces).

**Bottom line:** raw RFCOMM's only real wins over the already-built Nearby are **GMS-free** and
**PC-portable** — NOT faster/simpler discovery, and it *adds* a per-session discoverable prompt. Whether
that's worth a native plugin is a strategic call (see the chat), not a foregone conclusion. §§2–9 below are
the ORIGINAL draft, retained for reference but superseded by this verdict.

---

## 1. The transport tiers (shared DUMP core, capability-chosen pipe)

All tiers ship the SAME binding-verified `DUMP` (`qr-sync.js buildDump` → `LedgerGossip.ingest`
with `ReceiptVerify.verifyLedgerRow`). Only the pipe differs:

| Tier | Pipe | When | Cost |
|------|------|------|------|
| **1 (new primary)** | **QR handshake → RFCOMM** | Bluetooth on (GMS or not) | a native plugin |
| 2 (legacy) | Nearby Connections (`GossipNearby`) | GMS + BT + discovery all cooperate | already built |
| 3 (floor) | Animated QR (`qr-fountain.js`) | no usable Bluetooth at all | already built |

Tier 1 fixes the two things that actually broke tier 2: it needs **no Google Play Services**
(raw BT sockets) and it **can't be drowned by RF congestion** (targeted, asymmetric discovery).
Keep tier 3 as the camera-only floor. Tier 2 can be retired later to shrink the surface.

## 2. Why RFCOMM (Bluetooth Classic / SPP), not BLE GATT

- **Throughput:** RFCOMM is a full-duplex byte STREAM (~1–2 Mbps) — a whole ledger in a blink.
  BLE GATT is MTU-chunked (~185–512 B) + notification-based — awkward and slow for bulk.
- **Simplicity:** `BluetoothServerSocket.accept()` / `BluetoothSocket.connect(uuid)` — a plain
  socket. No GATT services/characteristics/MTU dance.
- **PC portability:** SPP (Serial Port Profile) exists on Windows/Linux/macOS; a desktop client
  can speak the identical protocol (§7). BLE-only stacks (Web Bluetooth) can't do RFCOMM, but a
  native/`node` desktop client can.
- **Duplex bonus:** once connected, BOTH sides can send a `DUMP` — so one QR bootstraps a **full
  bidirectional G-Set reconcile**, not just a one-way push (a strict improvement over QR-only §4.3).

## 3. The QR handshake blob (one STATIC frame — no fountain)

The SHOWER (the device presenting the QR) is the RFCOMM **server**; the SCANNER is the client and
receives. The QR is tiny and static — a single frame, instantly scannable:

```
QB1|<token>|<uuidHint>|<key>            e.g.  QB1|7f3a9c21|apx|Zm9vYmFy…(32B base64url)
```
- `token` — a short random per-session id. Derives the server's temporary BT name (§4) AND the
  RFCOMM **service UUID** = `UUID5(namespace, token)` (both sides compute it; no UUID on the wire
  beyond a version hint).
- `key` — a fresh 32-byte ephemeral secret. Bootstraps a confidential BT channel (§5). This is the
  whole point of QR: an **out-of-band secure channel** that no eavesdropper on the air can read.

The QR never carries a MAC address (Android hides an app's own BT MAC since Android 6 — see §4).

## 4. Connecting (the MAC-privacy workaround — targeted discovery)

Android apps **cannot read their own BT MAC** (`getAddress()` → `02:00:00:00:00:00` since API 23),
so the QR can't just say "connect to me at AA:BB…". Instead the CLIENT learns the server's MAC by
discovery (reading a *remote* device's MAC IS allowed):

1. **Shower/server:** opens an insecure RFCOMM server socket on `UUID5(token)` and sets its BT name
   to `APX-<token>` (restored after). Only this one device advertises → **asymmetric, low congestion**
   (unlike Nearby's everyone-advertises `P2P_CLUSTER`).
2. **Scanner/client:** reads the QR → runs a **targeted** `startDiscovery()`, matches the device whose
   name is `APX-<token>`, reads that device's MAC from the `ACTION_FOUND` result, **stops discovery**,
   and `connect()`s RFCOMM to `UUID5(token)`. Targeted + deterministic — you know exactly what you're
   looking for, so it resolves in ~1–3 s even in a crowd, no advertising lottery.

No pairing/bonding required (insecure RFCOMM socket); the QR-borne `key` (§5) provides the security
that bonding would, out-of-band.

## 5. Security — QR is the trust anchor

- **Integrity is already handled:** every row is `verifyLedgerRow`-bound on ingest (§0), so even a
  hostile BT peer can't inject a forged grade — same gate as every other transport.
- **Confidentiality (FERPA):** the handback flow must not leak a student's grades to a snooping BT
  radio. The QR-borne 32-byte `key` is used to derive an AEAD key (HKDF → AES-GCM / XChaCha20); the
  RFCOMM stream is encrypted under it. Because the key traveled **out-of-band over the QR** (only a
  camera pointed at the screen sees it), an over-the-air eavesdropper or a wrong-device connect gets
  ciphertext. This also authenticates the link: only the holder of the scanned key can talk.
- **What a MITM can do:** connect to the token-named server without the key → gets ciphertext,
  learns nothing, injects nothing (AEAD auth-fails; and §0 would reject anyway). Deny-of-service
  (occupying the socket) is the residual risk — mitigated by a short server TTL + one-client accept.
- **Replay:** harmless (idempotent G-Set); the ephemeral key makes each session distinct.

## 6. The native plugin (`BtRfcomm`, Capacitor)

A thin Android plugin — Classic BT sockets, no GMS. Mirrors `GossipNearby`'s committable-local-plugin
layout under `android-app/plugins/bt-rfcomm/`.

```
BtRfcomm.serve({ token }) -> starts RFCOMM server on UUID5(token) + sets name APX-<token>;
                             events: "client" (connected), "data" (bytes), "closed"
BtRfcomm.send({ dataB64 })    // stream bytes to the connected peer
BtRfcomm.connect({ token, timeoutMs }) -> targeted discovery + RFCOMM connect;
                             events: "data", "closed"; resolves on connect or rejects on timeout
BtRfcomm.stop()
```
Android: `BluetoothAdapter`, `BluetoothServerSocket` (`listenUsingInsecureRfcommWithServiceRecord`),
`BluetoothSocket` (`createInsecureRfcommSocketToServiceRecord`), `startDiscovery()` + a
`BroadcastReceiver` for `ACTION_FOUND`. Permissions: `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`
(`neverForLocation` where possible), and — for the classic *inquiry* used by discovery — the same
runtime-location caveat we already handle in `GossipNearby` on older APIs.

The JS transport (`bt-transfer.js`) frames the DUMP length-prefixed, feeds received bytes to
`QrSync`-style ingest (reuse `LedgerGossip.ingest` + the binding verify + verify-budget cap), and
handles the AEAD wrap. The `qr-fountain.js` codec is NOT used on this path (RFCOMM is reliable).

## 7. Laptop / PC port (why this design travels)

The protocol is OS-agnostic: **QR token → `UUID5(token)` RFCOMM service → length-prefixed, key-encrypted
DUMP stream → binding-verified ingest.** A desktop client re-implements only the socket + discovery in
its platform's BT stack (e.g. Node `bluetooth-serial-port`, BlueZ on Linux, Win32 `SPP`), then reuses
the *same* payload + `receipt-verify` logic. Nearby Connections could never port this way. A teacher
laptop as the always-on "collector" (shows a QR on screen, students scan + upload) becomes trivial.

## 8. What's reused vs. new

- **Reused unchanged:** §0 `verifyLedgerRow` binding; `qr-sync.js buildDump`/projection; the wire
  `DUMP` JSON; `LedgerGossip.ingest` + verify-budget cap.
- **Demoted:** `qr-fountain.js` + animated-QR rendering → tier-3 floor only.
- **New:** `BtRfcomm` native plugin; `bt-transfer.js` (framing + AEAD + orchestration); a static-QR
  generator (tiny — one frame, so a small QR lib, not the animated pipeline); the `📷 Sync` UI wires
  to tier 1 first, tier 3 if BT is off.

## 9. Open decisions & phasing

**Decisions for you:**
1. **AEAD cipher** — AES-GCM via WebCrypto (native, but old-WebView Ed25519 caveat may extend here) vs
   a vendored XChaCha20-Poly1305 (`@noble/ciphers`, ~8 KB, no WebCrypto dep). *Rec: noble — matches the
   `@noble/ed25519` fallback we already need, one crypto vendor, works on every WebView.*
2. **Retire Nearby (tier 2)?** Keep it as a belt-and-suspenders, or drop `GossipNearby` once tier 1 is
   proven, to shrink native surface? *Rec: keep through one field test, then decide.*
3. **Discovery UX** — auto-run targeted discovery on scan (≤3 s), or show a "searching…" affordance with
   a manual retry? *Rec: auto with a visible progress + 8 s timeout → offer tier-3 QR fallback.*

**Phasing:**
- **6B.1** — `BtRfcomm` plugin (serve/connect/send/stream) + a bench "hello" round between two phones.
- **6B.2** — `bt-transfer.js`: QR handshake + `UUID5(token)` + length-prefixed DUMP + AEAD + ingest.
- **6B.3** — UI: `📷 Sync` shows a static handshake QR (server) / scans + connects (client); collect +
  per-student handback; tier-3 animated-QR fallback when BT is off.
- **6B.4** — (optional) desktop collector reference client.
