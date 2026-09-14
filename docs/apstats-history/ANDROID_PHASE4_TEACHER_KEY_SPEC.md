# ANDROID PHASE 4 — Teacher app: on-device signing key + the grading loop

> Builds on ANDROID_PACKET_APP_SPEC §4/§8 and Phases 2–3. The issuer (teacher)
> signing key is the **root of all grade authority** — every auto-grade is sealed by
> the daily epoch, every AI/teacher receipt carries it. Today it lives only as a
> Railway env var (`RECEIPT_ISSUER_PRIVATE_KEY`). Phase 4 gives the **teacher device**
> the power to sign — grade pending FRQs, issue overrides, seal the epoch — so the
> class can run with no server in the loop.
>
> **Status:** spec → implement. The **issuer-key history/rotation** foundation is
> buildable + testable NOW (pure server + client) and is a prerequisite for any
> on-device key. The on-device signing + teacher-app UI is the device-tested lift,
> **gated on the key-custody decision (§3).**

---

## 1. What already exists (reused)

| Piece | Where |
|---|---|
| Ed25519 issuer key + `signPayload` (canonical + receiptId) | `roster-server/receipts.js` |
| `issue*Receipt` (item, epoch, review), grading provenance | `receipts.js` |
| Zero-trust verify (signature + record binding + epoch) | `snapshot-verify.js` |
| Snapshot / restore / import (the bundle in/out) | `admin-snapshot.js`, `admin-restore.js`, `ledger-import.js` |
| Client multi-issuer verifier (APPEND keys, never remove) | `receipt-verify.js` (`ISSUERS`) |
| `GET /receipts/issuer` (current pubkey) | `receipts.js::mountReceipts` |
| Phase-3 gossip transport (push signed rows device↔device) | `ledger-gossip.js`, `gossip-nearby` plugin |

## 2. The foundation — issuer-key HISTORY / rotation (build NOW)

The spec's "design it in now, painful to retrofit." Verification must trust a **set**
of issuer pubkeys (the current signer + any retired ones), so a rotated/added key
never invalidates already-signed receipts.

- **`receipts.js`**: `getTrustedIssuerPubkeys()` → `[currentPubkey, ...retired]` where
  retired comes from env `RETIRED_ISSUER_PUBKEYS` (comma-separated base64url Ed25519
  `x`). Signing ALWAYS uses the current key; verification trusts the whole set.
  `getReceiptIssuer()` gains `pubkeys: [...]` (current first) — `pubkey` (singular,
  current) stays for back-compat → `GET /receipts/issuer` now advertises the full set.
- **`snapshot-verify.js`**: `verifyCompact(compact, pubKeyOrList)` tries each key until
  one verifies (single-key callers unchanged). `verifySnapshot({ pubkey, pubkeys })`
  accepts an optional history; threads the list through `verifyRecord` /
  `verifyReviewMark` / the epoch check.
- **Client**: `_phase2RegisterIssuer` (Desk) registers EVERY pubkey from
  `/receipts/issuer` (`j.pubkeys || [j.pubkey]`) into `ReceiptVerify.ISSUERS`
  (already multi-key, dedup by pubkey).

Rotation procedure (operational, not code): generate a new key → set
`RETIRED_ISSUER_PUBKEYS` += the OLD pubkey → set `RECEIPT_ISSUER_PRIVATE_KEY` = the
new key → redeploy. Old receipts verify under the retired key; new ones under the new
key; client + snapshot-verify + gossip-ingest all trust both.

**This foundation also unlocks the cleanest custody option (§3, option B).**

## 3. THE DECISION — where the teacher key lives + signs (gates the device work)

The spec's original §8 pick was "(c) Railway warm-spare = copy the EXISTING
`RECEIPT_ISSUER_PRIVATE_KEY` into the teacher app's Keystore." **Platform reality
check:** Android Keystore's Ed25519/EdDSA support is API-33+ AND it does **not**
support *importing* an externally-generated Ed25519 private key on most devices
(Keystore is built around keys generated in-place, non-extractable). So literally
copying the Node-generated key into hardware Keystore is **infeasible on most
phones.** Three realistic options:

- **(A) Server stays the sole signer (no key on-device).** The "teacher app" is just
  a UI over existing server endpoints; signing happens on Railway. Simplest, zero
  crypto risk — but it does NOT achieve "run with no server," so the epoch can't be
  sealed offline. Honest fallback if device crypto isn't worth it yet.
- **(B) ⭐ Device-generated hardware key, added to the issuer history (recommended).**
  The teacher app generates a NEW Ed25519 key **inside** Android Keystore
  (hardware-backed, non-extractable, gated by device PIN/biometric via
  `BiometricPrompt`) and registers its **pubkey** into the trust set (env
  `RETIRED_ISSUER_PUBKEYS` / a `trusted_issuers` row — really an "additional issuers"
  list, reusing §2). The teacher app signs on-device with the hardware key; Railway
  keeps its key as a **co-signer + durable fallback**. Both are trusted (that's what
  §2 is for). **Sidesteps the import problem entirely** and gives TRUE hardware
  signing. Lose the phone → that device key can't sign new receipts, but its old ones
  still verify (pubkey in history) and the teacher rotates to a new device key; the
  Railway key is the durable signer throughout. **No secret to back up** (the device
  key is disposable; Railway is the backup signer).
- **(C) Software key, encrypted at rest.** Put a copy of the existing key in
  EncryptedSharedPreferences (Jetpack Security, AES wrapped by a Keystore key), gated
  by PIN/biometric; sign in app code (WebCrypto Ed25519 in the WebView, or a bundled
  lib). Works with the EXISTING key cross-device, and Railway is the warm-spare per
  the original plan — but the private key is software-resident when unlocked (weaker
  than B's hardware signing).

**Decision needed:** A, B, or C. (Recommendation: **B** — it's the only TRUE
hardware-key path, it reuses the §2 history, and key loss is a non-event.)

## 4. The teacher grading loop (after §3)

A teacher-app surface (or an extension of `teacher-dashboard.html` running in the
APK) that, using the chosen key:
1. **Import** — pull/receive bundles (online `/admin/snapshot`, USB `ledger-import`,
   or Phase-3 gossip) into a local working set.
2. **Grade pending** — FRQ/AI items sit `pending` until graded; the teacher scores
   them; each becomes a signed receipt (AI-only-raises rule preserved).
3. **Sign / override** — teacher overrides (up or down) as signed receipts that
   supersede; append-only audit trail.
4. **Seal epoch** — issue the daily epoch anchor over the day's re-derived heads
   (O(1)/day), signed by the chosen key.
5. **Push** — export/gossip the new signed receipts back out (Supabase + mirror +
   peers all converge via the Phase-2 G-Set union).

## 5. Phases / build order
1. **Issuer-key history/rotation** (§2) — server verify + `/receipts/issuer` + client
   registration + tests. **(now; decision-independent)**
2. **[gated]** Native key per §3 (B recommended): Keystore keygen + `BiometricPrompt`
   + a `sign(payload)` Capacitor method; register the device pubkey into the trust set.
3. **[gated]** Teacher grading-loop UI (import → grade → sign → seal → push).
4. Rotation runbook + `KEY_MANAGEMENT_RUNBOOK.md` update.

## 5b. Security review (adversarial, 20-agent — find → refute)

15 candidate findings raised, **12 refuted, 0 confirmed, 3 survived (PLAUSIBLE).** Notably refuted:
a claimed concurrent-FRQ-overwrite (student FRQ writes hardcode `attempt:1`), and all 5
XSS / prototype-pollution candidates in `teacher-app.html` (every interpolated value is `esc()`'d
or a Number; studentIds are server UUIDs).

| # | Finding | Disposition |
|---|---|---|
| 1 | **No live revocation** — revoking a `trusted_issuers` row only took effect at restart. | **FIXED** — added `db.revokeTrustedIssuer` + teacher-gated `POST /receipts/trusted-issuers/revoke` that re-lists + refreshes the cache so a lost-device key loses authority immediately. |
| 2 | Teacher secret persisted in cleartext `localStorage`. | **ACCEPTED / documented** — the secret is a SHARED, public-default (`apteacher2627`) classroom bearer password by design; `teacher-dashboard.html` already persists it identically; the secure store's purpose (protect the *device* Ed25519 key) is intact. Out of the stated threat model. |
| 3 | Object/array FRQ responses skip the `ah` answer-hash bind in `verifyRecord` (`snapshot-verify.js:83`). | **PRE-EXISTING (s29), deferred** — not a Phase 4 regression; Phase 4's FRQ path uses string responses (bound). The safe fix is a coordinated canonical-`ah` receipt-format change (deep-sort object keys on BOTH sign + verify) that would otherwise break existing object receipts → a dedicated migration, not bundled here. Quiz/PC responses are letter strings (primitive → already bound). |

## 6. Out of scope
Per-student keypairs / non-repudiation (v2), Play Store (Phase 5), changing the
clear-text privacy posture (decided, §9 of the packet spec).
