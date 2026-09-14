# ANDROID PHASE 6 — QR ledger sync (radio-free fallback)

> ANDROID_PACKET_APP_SPEC §3 (grade ledger) — a **second transport** for the same
> signed-ledger data, for when the Nearby (Bluetooth/BLE/Wi-Fi-Direct) path can't run.
> QR needs only a **camera + a screen**: no Google Play Services, no Bluetooth, no
> runtime permission beyond the camera, no shared network. It is *not* a replacement
> for Phase 3 — it's the belt-and-suspenders channel for the devices/rooms where the
> radio path fails.
>
> **Why the radio path fails (and QR doesn't):** the gossip does NOT need LAN or
> internet — Nearby is infrastructure-less device-to-device radio. What Nearby *does*
> require, and QR doesn't, is (1) **Google Play Services** (dead on de-Googled / some
> school-managed / Huawei devices), (2) **Bluetooth on + location granted**, and
> (3) **uncongested RF** — 30 phones advertising at once exhaust BLE slots
> (`ADVERTISE_FAILED_TOO_MANY_ADVERTISERS`, seen live on the tablet).
>
> **Status (2026-07-01):** §0 binding SHIPPED (`5cea79b`). The animated-QR ENGINE is
> built + tested + adversarially reviewed (`257cb3f`: `qr-fountain.js` + `qr-sync.js`,
> 25 tests) but **inert — no render/camera/UI wired**. Decision: the render/camera/UI
> layer is **DEFERRED** — the animated-QR path is the zero-radio floor, and Nearby
> (`GossipNearby`, built) + the roster server (online hub) already cover the common and
> online cases. A raw-Bluetooth (RFCOMM) alternative was spec'd + reviewed and
> **REJECTED** (see `ANDROID_PHASE6B_QR_BT_SPEC.md` §0: not faster than Nearby, needs a
> per-session OS prompt, broadcast-QR-key breaks confidentiality). This spec was
> adversarially reviewed (security / math / UX-integration); the review found a
> **pre-existing integrity gap closed by §0** plus design corrections, all folded below.

---

## 0. PRECONDITION — the signature must actually bind the grade (the FIRST commit of QR v1)

**This is not a QR problem; it's a gossip-trust problem that QR would inherit and
amplify. Decision (2026-07-01): it ships bundled as the first work-item of QR v1 —
before the transport code — not as a separate PR. QR cannot be trusted until it lands.**

Today `ledger-gossip.js` `ingest()` calls `verify(row) → bool`, and the production
adapter (`mobile-home.html` `verifyRow`, and the Desk's) only checks
`verifyReceipt(row.receipt_compact).ok`. But:

- `verifyReceipt` only proves *a trusted issuer signed some payload bytes*. It returns
  `{ok, payload, receiptId}` — and **nothing consumes `payload` or `receiptId`.**
- `computeGrade` (grade-engine.bundle.js:1979/1997) grades off the **top-level, unsigned**
  `row.score`, `row.item_id`, `row.source` — never the signed payload.
- The G-Set dedups on the **row-supplied** `row.receipt_id` (`ledger-store.js keyOf`), not
  the hash of the signed bytes.

**Exploit:** harvest any validly-signed `receipt_compact` (every gossiped/QR'd row shows one
in the clear), staple it onto `{source:'frq', item_id:<target>, score:<full>, receipt_id:<any>,
receipt_compact:<harvested>}`, gossip it. `verify` passes → stored → `computeGrade` counts
the forged score. And because `receipt_id` is attacker-chosen, one signature replays under
unlimited ids → unbounded G-Set bloat (idempotency is not real either). **The Ed25519 layer
is currently decorative.**

**Required fix (small, localized, benefits the Bluetooth path too) — a binding verify + ingest:**

1. `verify(row)` = `verifyReceipt(row.receipt_compact, {includeTestKeys:false})` → require `r.ok`.
2. Require `row.receipt_id === r.receiptId` (SHA-256 of the signed payload); **dedup on that hash**, discarding any transmitted id.
3. **Derive the grade-bearing fields from `r.payload`** (`sid`, `src→source`, `i→item_id`, `sc→score`, `a→attempt`, `ts`), don't trust the row's copies — or reject rows whose copies disagree with the payload. Best: store only payload-derived fields.
4. **`includeTestKeys:false` is hardcoded** on this path — never derived from `location`/`hasTestModeFlag()` (deep-links are attacker-influenceable; a leaked TEST key would otherwise verify).
5. **Crypto floor:** `verifyReceipt` uses `crypto.subtle` Ed25519 (Chromium ~137, 2025). Old/de-Googled System WebViews — the *exact* devices QR targets — lack it, so `verify` throws and **every row is rejected silently**. Add a feature-detected `@noble/ed25519` fallback in `receipt-verify.js`; document the device floor.
6. **Verify-budget DoS bound:** cap rows-and-verifies per scan and short-circuit after N rejects (each row is an async signature verify; a malicious movie of thousands of tiny rows is a CPU/UI DoS otherwise).

Add tests: a row whose `score`/`item_id`/`receipt_id` disagree with the payload is **rejected**; an unsigned-but-well-formed receipt is rejected **through the real `verifyReceipt`**; a replayed signature under a new id collapses to one element.

## 1. Non-negotiables (given §0 is fixed)

QR is a transport swap, nothing more. With §0 in place:

- **Verify-on-ingest with payload binding is the trust boundary.** A forged/re-stapled QR
  row fails the binding check and is dropped — same gate for Bluetooth and QR. QR is just bytes.
- **The ledger is a content-addressed G-Set** (keyed on the *verified* hash). Merge = union;
  re-scans, duplicates, replays are genuine no-ops; convergence needs no coordination.
- **Shared reconciliation, not a shared session.** v1 QR reuses the pure helpers
  (`ingest`, and a full-id `digest`) — **not** the `createSession`/`HELLO`/`SYNC`/`SEND` state
  machine, which is inherently bidirectional (see §3). "One engine, two transports" is a v2
  goal for peer↔peer, not a v1 claim.

## 2. Reconciliation — digest→delta, and why a *shallow* Merkle

Digest→delta is the right shape. A full Merkle tree is the textbook diff tool, **but it
optimizes the wrong axis for QR:**

> A Merkle tree minimizes **bytes** at the cost of `log_b(n)` **round-trips**. Over a network
> that's free; **over QR each round-trip is a human flipping phones around and re-scanning.**
> Bytes are cheap (a frame or two); re-scans are the UX killer.

So flatten the tree until reconciliation is one round-trip. A Merkle tree with branching
factor = leaf count has **depth 1**, which *is a bucketed hash digest*.

### 2.1 Flat full-id digest — v1 default

The digest is the **full `receipt_id` list** (the engine already keys on full ids —
`idOf`/`diff`/`rowsFor` all compare full-id strings, so **do not truncate**; an 8-byte prefix
would make `rowsFor` return `[]`). Size is `O(n)` (a hash string × n). For a single student's
few-hundred-row ledger that's ~2–3 frames — fine. Other side diffs locally, ships the delta.

### 2.2 Bucketed digest (depth-1 Merkle) — v2 scale-up for teacher-side sets

For the teacher's large set (34 students × N rows), send `K` buckets of `(h, c)` — `h` = combined
hash (XOR of ids) of the bucket, `c` = count — bucketed on `parseInt(receipt_id.slice(0,2),16) % K`
(the id is a **hex string**; the first *char* only yields 16 values, so slice 2). Corrections vs
the first draft:

- **It is `O(n)`, not fixed-size:** to keep ~1–2 rows/bucket you need `K ≳ 2n`, so at ~9 B/bucket
  the digest is ~18n B — actually **~2× the flat id list**. Its only advantage is **round-trips**,
  never bytes. Use it only when the flat list's *frame count* hurts.
- **Buckets carry no ids, so they can't drive an id-precise `SYNC`/`SEND`.** Reconciliation is:
  **each side ships ALL its rows in every differing bucket, both directions** — redundant sends are
  harmless (idempotent G-Set). That's a distinct protocol from the id-based path; don't conflate.

### 2.3 IBLT / PinSketch — the only genuinely diff-sized sketch (v2 stretch)

Single-exchange, sketch sized to the *expected diff* not the set (Bitcoin Erlay). Elegant but more
code, and it needs a **fallback when the real diff exceeds capacity**. File as v2.

## 3. QR wire protocol

### 3.1 v1 — one-directional DUMP (collect + handback)

Because grades are a G-Set, the v1 flows are **one-way pushes**, and the gossip session engine
**cannot** drive them: `HELLO` carries only ids and `SEND` fires *only* from a `SYNC` handler
(`ledger-gossip.js:156`), so "HELLO→SEND" is a phantom transition. Instead v1 uses a dedicated
rows-carrying **`DUMP`** frame type fed straight to `LedgerGossip.ingest(rows, {verify, store})`.

### 3.2 v2 — peer↔peer handshake

Two devices reconcile with the real `HELLO(digest) → SYNC(rows+request) → SEND(rows)` session
over a QR driver (3 scans). Lower priority.

### 3.3 Frame format + animated (fountain) QR

Rows exceed one QR, so the sender loops a QR "movie" and the receiver holds the camera until it
decodes. Corrections:

- **Carry raw bytes in QR byte mode with binary length-prefixed framing** — do NOT wrap a base64
  chunk in JSON, which pays a 4/3 base64 tax *plus* the envelope (≈ −33% usable/frame).
- **Fountain frames carry `{sid, seed, k}`** (session nonce, symbol seed, source-symbol count) —
  **not** `i/n`, which is meaningless for an endless stream. The decoder **must partition inbound
  symbols by `sid`** (if two phone screens enter frame, their symbol streams must not mix).
- **Fountain overhead:** ~1.05–1.1× is *asymptotic*; at these small `k` (~50–90 symbols) plain
  **LT needs ~1.3×**. Use **RaptorQ/systematic** if you want ~1.05× at this size, or budget 1.3×.
- `sid` is a UX de-dupe/anti-stale hint for the receiver, **not** a security control (§0 is the
  security control). In an open push the scanner has no pre-agreed `sid`, so treat it as
  "which movie am I currently decoding," dedupe by content hash.

## 4. UX flows

### 4.1 Student → Teacher — "collect" (PRIMARY, one-directional)

1. Student taps **📷 Show my work** → animates their ledger as a `DUMP` movie (fountain).
2. Teacher **scans** → §0 binding verify per row → union-merge → "＋N verified from \<name\>".

(v2 optional delta: teacher shows a one-frame digest of what they already hold for that student;
student animates only the missing rows. Worth it once ledgers are large; v1 pushes the whole small ledger.)

### 4.2 Teacher → Students — "hand back grades" (PER-STUDENT, one-directional)

**Must be per-student, not a class broadcast.** A single fountain movie of the whole class decodes
fully for *any* camera (or CCTV) in the room → every `sid`+item+score recoverable into a durable
photo = a class-wide FERPA leak. (This is the key way the QR threat model differs from Nearby:
Nearby is targeted, range-limited, ephemeral; a screen is publicly photographable.) So: the teacher
selects a student → shows **only that student's** signed rows → that student scans. Repeat per kid
(or use per-recipient encryption in a later phase).

### 4.3 Peer ↔ Peer (v2, full handshake)

`HELLO → SYNC → SEND` over the QR driver, 3 scans. Lowest priority.

## 5. Sizing & collision math (corrected)

- **Per frame:** QR byte-mode v15–25 ≈ ~0.5–1.2 KB *raw*. With JSON+base64 framing, usable
  drops to ~570 B; with raw byte-mode framing ~760 B. **Budget raw framing → ~760 B/frame.**
- **Per row:** `receipt_compact` = base64url(payload) `.` base64url(sig 64 B → 88 chars); payload
  120–250 B → ~160–333 chars. **~0.5–0.9 KB/row.**
- **A 49-row ledger** ≈ ~30–45 KB ≈ **~55–70 frames raw** (≈ ~75–90 with JSON/base64); at 5–8 fps
  that's **~8–15 s of steady hold**, not "a few seconds." Show an on-screen decode-progress readout
  (`42/64 symbols`). Shrink via the v2 teacher-digest delta if hold time hurts.
- **Digest:** flat full-id list ≈ (hash-string length) × n → a few frames for a student ledger.
  A `K=64` bucketed digest is ~576 B raw = one byte-mode frame **only if not base64-wrapped**.
- **DoS cap:** bound by **verify-count and rows** (not just bytes). A legit 300-row year-end
  ledger is ~150–270 KB, so any byte cap must be ≥ ~512 KB or the collect must chunk across scans.
- **Collision:** with full ids there are no truncation collisions. (Never truncate the digest ids —
  a truncated-prefix match is *deterministic*, not a self-healing birthday event, and — pre-§0 —
  was even a *targeted grade-suppression* vector.)

## 6. Integration points

- **`ledger-gossip.js`** — `ingest()` gets the §0 binding logic. `digest()` stays `{v, ids}`
  (full ids) so `createSession` is unbroken. Add `bucketDigest(rows,K)` / `diffBuckets` as **new,
  separate** helpers (v2). Add a `DUMP` path = thin wrapper over `ingest`.
- **`qr-transport.js` (new)** — **not** `GossipTransport`-shaped (no `peerId`/`onPeer`/discovery,
  and `runRound`'s fixed `durationMs` can't drive hold-until-decoded). Instead: `show(msg)` →
  loop-render frames until dismissed; `scan()` → accumulate fountain symbols → resolve exactly one
  decoded message. Fountain encode/decode lives here.
- **Camera/decode** — **`zxing-wasm`** (fast, maintained) for the animated-decode path, **not
  `jsQR`** (pure-JS, unmaintained since ~2020, too slow for 5–8 fps animated decode on the low-end
  WebViews this phase targets). Bundle the `.wasm`. Render with a small canvas QR generator
  (`qrcode`). Benchmark effective decode fps on a target device before committing.
- **Surfaces** — **📷 Sync by QR** beside **📡 Sync Nearby** on `mobile-home.html`; a show/scan
  pane in `teacher-app.html` (per-student handback + collect).

## 7. Testing

- **§0 binding (highest value):** a row whose `score`/`item_id`/`receipt_id` disagree with its
  signed payload is **rejected**; an unsigned well-formed receipt is rejected **via the real
  `verifyReceipt`**; a replayed signature under a fresh id collapses to one element; test-keys
  never verify on this path.
- **Reconcile (no camera):** flat full-id digest → correct symmetric difference; convergence over
  the `DUMP` path; idempotent re-scan. Mirror `tests/ledger-gossip.test.js`'s in-memory bus, swapping
  the bus for a frame list.
- **Fountain codec:** encode → drop X% of frames → decode round-trips ≤ ~256 KB; two interleaved
  `sid` streams decode independently; a **mid-movie interruption** ingests nothing and restarts
  cleanly (so large handbacks should chunk into independently-ingestable batches).
- **On-device:** one `DUMP` collect end-to-end; per-student handback isolation (student A cannot
  read student B's rows); a device lacking WebCrypto Ed25519 uses the fallback (or fails loudly).

## 8. Security summary

- **§0 is the whole ballgame.** Without payload-binding + hash-keyed dedup, signatures are
  decorative and QR just makes harvesting easier. With §0, QR adds no new forgery surface.
- **Threat model differs from Nearby:** a screen is publicly photographable into a durable copy →
  **per-student handback only**, never a class broadcast (FERPA). Correct the earlier "QR exposes
  nothing BT didn't" claim.
- **Bounds:** verify-count/row caps per scan; `includeTestKeys:false` hardcoded; reject unknown
  `v`/`t`; cap accepted `sid` streams per scan.
- **PII:** a bound row exposes `sid`+item+score — same as BT for a *single* student, but never
  broadcast to the room.

## 9. Phasing & open decisions

**§0 (blocking — the FIRST commit of QR v1, before the transport):** binding verify + hash-keyed
dedup + `includeTestKeys:false` + WebCrypto-Ed25519 fallback + verify-budget cap. Grade-affecting +
touches the trust boundary → I'll show the diff + test results before pushing. The Bluetooth path
inherits the fix.

**v1 (§0 first, then the transport):** `DUMP` collect (student→teacher) + **per-student** handback; flat full-id digest;
fountain (raw byte-mode framing); `zxing-wasm` decode; `📷 Sync by QR` on launcher + teacher app;
§0 + reconcile + fountain-interruption tests.

**v2:** bucketed depth-1 digest (whole-differing-bucket over-ship) for large teacher sets; teacher-digest
delta on collect; peer↔peer `HELLO/SYNC/SEND` over a QR driver; IBLT single-exchange; per-recipient
encrypted handback.

**Open decisions for you:**
1. **Framing** — raw QR byte mode (binary, reclaims the 4/3 base64 tax) vs JSON+base64 (simpler). *Rec: byte mode for the movie, JSON only for the tiny digest.*
2. **Fountain** — LT at ~1.3× overhead (simple) vs RaptorQ/systematic at ~1.05× (faster, more code). *Rec: LT for v1, revisit if hold time hurts.*
3. **Decode lib** — `zxing-wasm` in the WebView vs a native ML-Kit/ZXing Capacitor scanner. *Rec: zxing-wasm first (no native code); native if fps is inadequate.*
4. **§0 timing** — *Decided 2026-07-01: bundle into QR v1 as its first commit (not a standalone PR).*
