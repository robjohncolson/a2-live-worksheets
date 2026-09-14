# ANDROID PACKET APP SPEC

The AP Stats course as a **sideloadable Android app** — the whole curriculum (videos +
worksheets + quizzes) bundled to run **fully offline on a student's phone**, with grades
captured locally and replicated as a **single-writer signed ledger** across every device,
the teacher's app, and Supabase. No piece is the single source of truth; the union is.

> **Status:** proposed (brainstorm → spec → implement). **Owner:** teacher. **Platform:**
> Android first (sideload via USB), Google Play later, iOS only if the teacher gets a Mac.
> Builds directly on the OFFLINE_MODE (s27) + GRADE_LEDGER_DURABILITY (s29) work — this is
> ~80% packaging of things that already exist. **Money/grade-adjacent only via the existing
> ledger; the teacher signing key MOVES on-device — review the key-custody section.**

---

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| Single-origin offline pack | `scripts/build-offline-pack.mjs` (`offline-pack/`, localhost-served) | the WebView's bundled web root |
| Lesson → local video resolver | `offline-video.js` + `media-manifest.json` | play bundled video by lesson |
| Offline grade capture + sync | `OfflineQueue` (`offline-queue.js`), `POST /ledger/import` | capture work offline → sync |
| Signed receipts (Ed25519) | `roster-server/receipts.js` (`issue*Receipt`, content-addressed `receipt_id`) | the ledger records |
| Commit chain (QR-sized, prev-chained Merkle) | `roster-server/commits.js` (`/commits`) | canonical ordering, QR sync |
| Daily epoch anchor (signed class seal) | `receipts.js::issueEpochReceipt`, `admin-snapshot.js::buildEpoch` | O(1)/day seal over all heads |
| Snapshot / verify / restore | `/admin/snapshot`, `snapshot-verify.js`, `/admin/restore` | replicate + verify + recover |
| Bundle format | `apstats-offline-export/v1` (`admin-snapshot.js`, `ledger-import.js`) | the gossip/USB payload |
| Off-Supabase mirror | `apstats-grade-mirror` repo + `tools/nightly-backup.mjs` | one more redundant replica |
| PWA (installable, network-first) | `sw.js`, `pwa-register.js`, `manifest.webmanifest` (both repos) | the iPhone story (stream video) |
| Grade engine (latest-wins, AI-only-raises) | `roster-server/lesson-grade.js`, `grade.js` | the authority-ladder resolution |

The HTTP backend (roster-server identity/grades/ledger, cr AI grading) works **unchanged** in
a WebView — same `fetch()` calls. CORS is wildcard-open and the prepared allowlist already
includes localhost / capacitor origins. **No backend change is required to ship.**

---

## 1. Goals / Non-goals

**Goals**
1. One **Capacitor** Android app that runs the whole course **fully offline** (video, worksheets,
   quizzes), sideloaded via USB.
2. Grades captured on-device and made **durable + tamper-evident** by replicating the signed
   ledger across **every device + the teacher app + Supabase** — survive the loss of any one.
3. A student always sees the **freshest** version of their own grade, instantly (Supabase preview)
   and eventually-correct everywhere (the chain).
4. Reuse essentially everything already built; backend untouched.

**Non-goals (v1)**
- Not a consensus blockchain — it is a **single-writer signed log** (teacher = sole authority).
- Not encrypted at rest — grades are low-stakes pedagogy; privacy is **UI-level only** (see §9).
- Not iOS (see §10). Not Google Play at launch (see §2; sideload first).
- No student-side grade authority — a student device mints **submissions**, never **grades**.

---

## 2. Delivery & packaging

- **Capacitor** (modern WebView shell; the existing web app runs inside it verbatim). `minSdk`
  API 24 (Android 7+, ~99% of devices, universal H.264 hardware decode). Stable `applicationId`
  from day one (e.g. `com.robcolson.apstats`) so sideload and a later Play build are the SAME app
  and upgrade cleanly.
- **App web root** = the `build-offline-pack.mjs` output (all 69 worksheets + the quiz app +
  trainer + Desk + `offline-config.js`), bundled as Capacitor assets. Small (<20 MB without video).
- **Sideload first:** the full app + all re-encoded video (~1.3 GB, see §3) ships as one APK the
  teacher loads over USB. Fully offline, no first-run download, no per-unit juggling.
- **Google Play later (not a rewrite — a config path):** Play caps a single APK/AAB at 150 MB, so
  the Play build CANNOT bundle the video. **Forward-compat rule, build it in NOW:** the app resolves
  *lesson → local file path* (it already does via `media-manifest.json`); *how that path gets filled*
  is swappable —
  - **sideload build:** filled from bundled assets (or USB-dropped).
  - **Play build:** filled by an on-demand **downloader** (per-unit) + the teacher's old
    *delete-old-unit-videos-to-free-space* idea as the eviction strategy.

  Keep playback decoupled from population and Play is a flag, not a fork.

---

## 3. Video — re-encode for max compatibility (MEASURED)

The source videos are CollegeBoard slide screen-recordings with a tiny talking-head corner —
nearly static and **hugely over-bitrated** (~2.5 Mbps for content that needs ~150 kbps).

- **Codec: H.264 CRF 23** (NOT H.265). Universal hardware decode on every Android/iOS device, and
  for this near-static content H.264 CRF 23 *ties* H.265 CRF 28 on size — so H.265 buys nothing.
- **Measured (real test, lesson 1.2):** 187.6 MB → **10.3 MB (−94.5%)**, frame pixel-for-pixel
  identical. Library-wide (live run, 96/144 done): **~884 MB → extrapolates to ~1.3 GB for all 144**
  (was ~25 GB). Per unit (~16 videos) ≈ 160 MB. A handful of motion-heavier lessons (e.g. 4.10) land
  ~31 MB — still trivial.
- **Tooling:** `scripts/compress-videos.mjs` — `media/ → media-compressed/` (same filenames so
  `media-manifest.json` still maps), H.264 CRF 23 `+faststart -pix_fmt yuv420p`, resumable, source
  kept as master. Both dirs gitignored. The offline pipeline repoints at `media-compressed/`.
- **Implication:** ~1.3 GB is small enough to **bundle the WHOLE course into one sideload APK** —
  the per-unit-packet + eviction complexity is unnecessary for sideload (it returns only for the
  Play download-on-demand build, §2).

---

## 4. The grade ledger — an append-only authority ladder

A grade is **never edited in place** — every change is a new signed record that **supersedes** the
prior one. Per item, the effective grade = the **highest-authority latest** record:

```
teacher override   ← the teacher, anytime, UP or DOWN (final word)
      ▲
AI review          ← signed bump, can ONLY raise (existing rule)
      ▲
auto-grade         ← f(response, signed answer key) — deterministic, computable on-device
```

- This is already how `lesson-grade.js` resolves (latest-wins per item, AI-only-raises, teacher
  authoritative) — minimal new logic. It yields a **free audit trail**: the chain shows
  "auto 60% → AI 70% → teacher 85%", every step signed, nothing erased.
- **Provenance vs authority:** a student device can mint a **submission** (its response), never a
  grade. Authority always traces to the teacher key. For **auto-graded** items the grade is a pure
  function of the (bundled, teacher-signed) answer key + the response, so it needs **no per-item
  teacher signature** — the **daily epoch anchor** seals the whole day's set transitively (teacher
  signs O(1)/day, not O(items)). **Non-deterministic** items (FRQ / AI) carry an explicit grader
  signature; offline they sit **pending** until the teacher app or the online AI grader signs them.
- The **answer key is signed once per version** and bundled, so a tampered local key can't forge an
  auto-grade.

---

## 5. Distribution & replication — a single-writer CRDT, in the clear

Because every record is **teacher-authored** (single writer) and **content-addressed** (`receipt_id`
= hash of the signed payload), the data structure is a **grow-only set (G-Set / CRDT)**:

- **Merge = set union, dedup by `receipt_id`.** Commutative, associative, idempotent — devices sync
  in any order, any number of times, over any transport, and **converge. Conflicts are impossible.**
- **Multi-master, no single source of truth:** every peer phone + the teacher app + Supabase each
  hold a (partial→complete) replica. The **truth is the union**, sealed by the teacher's daily epoch
  anchor (which detects any device's gaps/tampering).
- **Clear-text (no encryption).** Grades are low-stakes pedagogy (§1). A phone physically carries the
  whole class's records in plaintext; **privacy is UI-level** (the app shows you only your own). A
  determined kid digging into the data could read others' — explicitly accepted. This is the
  durability/ease-optimal choice (an unreadable encrypted backup is *less* durable).
- **The teacher app is the only "miner":** it holds the signing key, grades pending FRQs, issues
  teacher receipts/overrides, and signs the daily epoch.

---

## 6. Sync channels (same merge over all of them)

1. **Online (the 99% case):** roster-server stays the hub. Student app drains `OfflineQueue` up;
   teacher app pulls `/admin/snapshot`. **Already works.**
2. **Offline P2P — Bluetooth / Nearby:** Android **Nearby Connections API** (abstracts BT + BLE +
   Wi-Fi Direct, auto-discovers peers with no manual pairing, bulk transfer), wrapped as a Capacitor
   plugin. Phones in a room gossip their G-Sets epidemically — a student's work reaches the teacher
   via *classmates* even if that student never meets the teacher device or wifi ("if one fails, no
   problem"). Signed receipts are small JSON; even BLE suffices.
3. **Offline small — QR:** the commit chain is QR-sized by design — a handshake, a single FRQ, or
   "prove your day's head matches my anchor."
4. **Offline bulk — USB/file:** the `apstats-offline-export/v1` bundle, exported/imported device↔
   device. Matches the teacher's "hook the phone to my computer" workflow.

---

## 7. Reconciliation — Supabase (fast lane) ⊕ chain (durable lane)

Supabase and the P2P chain are **two replicas of the same signed receipts, not two writers**, so
there is **no conflict to resolve** — freshness falls out for free:

- A student's grade for an item = **union of all sources, latest receipt wins** (max signed
  timestamp per item across whatever the device has seen). Read Supabase (instant preview) + local
  chain → merge → newest displays. "Chain newer → chain wins; Supabase newer → Supabase wins" is
  exactly this.
- **No write-race:** the teacher is the only overrider (single writer for changes), so whether an
  override arrives first via Supabase (kid online) or via a classmate's Bluetooth gossip (kid
  offline), the signed `ts` on the override is the tiebreaker and it wins either way.
- **Role of each:** Supabase = realtime preview / speed. The chain = the durable, eventually-
  consistent, tamper-evident layer that's *always* maintained in parallel. Lose Supabase → teacher
  app + mirror + phones rebuild it.

---

## 8. Teacher-key custody — THE ONE OPEN DECISION (`TODO`)

The issuer (teacher) signing key is the **root of all grade authority**. Today it's a Railway env
var; this design **moves it onto the teacher's phone**. That is the one place "all local" trades
against "don't lose everything," so it must be nailed before building.

- **Storage:** Android **Keystore** (hardware-backed on most devices — the private key never leaves
  secure hardware), gated by PIN/biometric. Forgery needs the unlocked phone *and* the PIN.
- **Backup (the crux — `TODO: choose`):** lose the phone with no backup → can't sign new grades or
  continue the chain under the same issuer. Options:
  - **(a)** an encrypted key export (passphrase-wrapped) stashed in the `apstats-grade-mirror` repo;
  - **(b)** an offline **seed phrase** the teacher keeps on paper;
  - **(c) ← CHOSEN.** Railway warm-spare: the signing key ALREADY lives on Railway as its own env
    var **`RECEIPT_ISSUER_PRIVATE_KEY`** (the random 256-bit Ed25519 key `receipts.js` signs with).
    The teacher app loads a **copy of that same key** into Keystore; Railway keeps its copy as the
    spare. Phone dies → Railway recovers it. **Zero new secret to manage.**
    **⚠ This is NOT the login key.** Do NOT reuse `apteacher2627` (`TEACHER_KEY`) — that's a PUBLIC,
    memorable *authentication* secret (visible in the public repo); the signing key must stay secret
    and high-entropy. Two separate secrets, two separate jobs (door key vs notary stamp).
- **Rotation (`TODO: design in now`):** support an **issuer-key history** (cert-chain style) so old
  receipts stay verifiable under the old key while new ones use a rotated key after a
  compromise/loss. Cheap now, painful to retrofit.

**Decision needed:** which backup mechanism (a/b/c), and confirm building the key-history in v1.

---

## 9. Privacy posture (decided)
UI-level only. The app surfaces a student **only their own** grades; the replicated data on any
device is the whole class's, **in the clear**. A determined student could extract a classmate's
grade from the raw data — **accepted** (low-stakes pedagogy, not financial). No encryption →
maximum durability + simplicity.

## 10. iOS posture (deferred)
Capacitor supports iOS, but it needs a **Mac (Xcode)** the teacher doesn't have, an **Apple
Developer account ($99/yr)**, and there's **no free sideload** (TestFlight/App Store/Ad-Hoc).
Build-without-a-Mac is possible (GitHub Actions macOS runners / Codemagic / Ionic Appflow) but it's
a v2 lift. **For iPhone students now: the existing PWA** (Add to Home Screen, offline app shell) —
it just **streams** video online instead of bundling it (iOS PWA storage is capped). Zero Mac/
account/store needed. Revisit native iOS only if the teacher gets a Mac/iPhone or it becomes a real
need.

---

## 11. Reused vs new
**Reused:** the entire web app + offline pack, `media-manifest`/`offline-video.js`, signed receipts,
commit chain, epoch anchors, snapshot/verify/restore, bundle format, OfflineQueue, the git mirror,
the grade engine, the PWA, the HTTP backend (unchanged). **New:** the Capacitor shell + build/sign
pipeline; `compress-videos.mjs` (done); a Nearby-Connections Capacitor plugin for P2P gossip; the
on-device merge/reconcile (union + latest-ts) reading Supabase ⊕ local chain; moving the issuer key
into the teacher app (+ backup + rotation history); the teacher-app "import bundle → grade pending
FRQs → sign → seal epoch → export/push" loop; (optional v2) per-device student keypairs for
non-repudiation; (Play v2) the per-unit video downloader + eviction.

## 12. Phases
| Phase | Work |
|---|---|
| **0 — video** | `compress-videos.mjs` → `media-compressed/`; repoint the offline pipeline. **(in progress)** |
| **1 — Capacitor shell (sideload)** | wrap the offline pack; bundle compressed video; local video playback; sign + sideload one APK; verify the whole course runs offline + grades capture to OfflineQueue + sync online. |
| **2 — on-device ledger merge** | read Supabase ⊕ local chain, union + latest-ts reconcile; surface freshest own-grade; verify against epoch anchors. |
| **3 — P2P gossip** | Nearby-Connections Capacitor plugin; gossip the G-Set device↔device (+ QR small-sync); epidemic delivery to the teacher app. |
| **4 — teacher app** | issuer key on-device (Keystore+PIN) + **chosen backup** + key-history; import/grade-FRQ/sign/seal-epoch/push loop. |
| **5 — Play (optional)** | split video out → per-unit on-demand downloader + eviction; AAB; privacy policy + Data Safety; same `applicationId`. |

## 13. Open decisions / TODOs
- **§8 teacher-key backup — DECIDED: (c) Railway warm-spare** = copy the EXISTING
  `RECEIPT_ISSUER_PRIVATE_KEY` into the teacher app's Keystore; Railway keeps its copy. No new
  secret. NOT the `apteacher2627` login key (separate secrets).
- Confirm **issuer-key history** is built in v1 (recommended yes).
- Student keypairs (non-repudiation) — v2 unless wanted sooner.
- Per-unit eviction UX — only needed for the Play build (Phase 5).

---

### TL;DR
Wrap the existing offline web app in a **Capacitor Android app**, bundle the whole course +
**H.264-CRF23 re-encoded video (~1.3 GB, measured −94%)**, and sideload it via USB — fully offline.
Grades are an **append-only, single-writer (teacher-signed), content-addressed log** = a CRDT that
**merges by union** across every phone + the teacher app + Supabase, gossiped peer-to-peer over
**Nearby/Bluetooth** and reconciled **latest-timestamp-wins** (Supabase = fast preview, chain =
durable truth, neither is the single source). Privacy is UI-level (clear-text data, accepted). The
one thing to nail before building the teacher app: **backup + rotation of the on-device signing
key.** iOS is deferred to the PWA.
