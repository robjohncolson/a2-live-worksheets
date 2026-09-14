# ANDROID PHASE 2 — On-device ledger merge (item-level re-derivation)

> Builds on ANDROID_PACKET_APP_SPEC.md Phase 2 ("read Supabase ⊕ local chain, union + latest-ts
> reconcile; surface freshest own-grade; verify against epoch anchors"). **Altitude decided
> (user, s31): item-level re-derivation** — the device recomputes lesson/quarter grades *purely
> from its local signed items*, not by caching the server's `/grade` summary.
>
> **Status:** spec → implement. **Scope:** student device only (the Desk + offline pack ship to
> GH Pages too, so every web student also gets a verified local replica). Teacher app = Phase 4.
> **No backend change required** — every input already exists.

---

## 0. The one risk and how it's controlled

Item-level re-derivation means the client computes grades. If the client math ever drifts from the
server's, a student sees one grade on-device and a different one on the dashboard. **Control: do not
re-implement the engine — SHARE it.**

- The server grade engine is three **pure, I/O-free** ES modules: `grade-config.js` →
  `lesson-grade.js` → `grade.js`. The single top-level entry is
  **`computeGrade(ledgerRows, answerKey, config, opts)`** (`grade.js`).
- `scripts/build-grade-engine.mjs` (a codemod, same family as the repo's other `build-*.mjs`)
  concatenates those three files, strips `import`/`export`, and wraps them as
  **`window.GradeEngine`** → `grade-engine.bundle.js` (committed, generated-file header).
- **Parity test** (`tests/grade-engine-bundle-parity.test.js`): the no-divergence guarantee.
  1. Regenerates the bundle in-memory and asserts the committed file is byte-identical (no stale
     drift after an engine edit).
  2. Evaluates the bundle in a sandbox and runs `GradeEngine.computeGrade` AND the canonical
     server `computeGrade` over the SAME fixtures (real ledger rows + answer key + schedule);
     asserts deep-equal output. One engine, two runtimes, proven equal.

So `lesson-grade.js`/`grade.js` stay the single source of truth; the bundle is derived.

---

## 1. Components

### A. `grade-engine.bundle.js` (generated) + `scripts/build-grade-engine.mjs` (generator)
Browser global `window.GradeEngine` exposing `computeGrade` (+ `computeQuarterV3`,
`computeLessonGrades`, `buildLessonsArray`, `parseItemLesson`, `PHASE3_CONFIG`, … as needed). No
build for students — the bundle is a plain classic `<script>`. Regenerate when the engine changes
(parity test fails loudly if you forget).

### B. `ledger-store.js` (new browser module, mirrors `offline-queue.js`)
Durable IndexedDB **G-Set** of the student's OWN signed ledger rows — content-addressed by
`receipt_id` (→ union / dedup / idempotent; this is also the exact set Phase 3 will gossip).
`window.LedgerStore`:
- `.keyOf(row)` → `receipt_id` (fallback `source|item_id|attempt` for pre-0018 rows w/o a receipt).
- `.mergeRow(list, row)` / `.mergeAll(list, rows)` — pure union; on a `receipt_id` collision keep
  either (identical by content); on a same-item newer signed-`ts`, the latest-ts row is what the
  engine reads (latest-wins happens in `computeGrade`, not here — the store keeps the full G-Set).
- `.put(row)` / `.all()` / `.clear()` — durable (IndexedDB, in-memory fallback for jsdom).
- `.pull(rosterClient)` — GET `/ledger/student/:sid?token=`, merge rows in. Online-only; on a
  thrown/offline fetch it no-ops (keeps what it has). Returns `{added, total, offline}`.
- `.verifyAll(opts)` — run `ReceiptVerify.verifyReceipt(row.receipt_compact)` per row → tag
  `{verified, issuer}`; returns `{verified, unverified, tampered, missing}` counts. Tamper =
  a `receipt_compact` present but no known issuer signs it.

### C. Reconcile + surface (in `ap_stats_roadmap_square_mode.html`)
- Load `receipt-verify.js` + `grade-engine.bundle.js` + `ledger-store.js` in the Desk (and the
  offline pack injects them, like `offline-config.js`).
- New `_reconcileOwnGrade()`:
  1. ONLINE: server `/grade` is authoritative + freshest → display as today, AND `LedgerStore.pull()`
     refreshes the local replica in the background.
  2. OFFLINE (or `/grade` throws): read `LedgerStore.all()` → `GradeEngine.computeGrade(localRows,
     answerKey, config, opts)` → the SAME shape `/grade` returns → feed the existing render path.
     This **replaces the unverified `apstats_grade_cache_v1`** restore with a re-derived,
     signature-verified grade.
  3. Merge any unsynced `OfflineQueue` submissions into `localRows` before re-derivation so
     just-finished-offline work counts immediately.
- **Strictly additive / never downgrades:** when online and `/grade` succeeds it wins unchanged; the
  re-derivation only fills the offline gap (today that gap shows stale/unverified cached numbers).
  Guarded OFF in view-as (a teacher never re-derives a student's grade locally).

### D. Engine inputs, client-side
`computeGrade` needs `answerKey`, `config` (incl. `frqBand`, `gradingWindowStart`, quarter dates),
`schedule`, `worksheetBlankCounts`, `blooketLessons`. Plan:
- `schedule` ← `data/lesson-schedule.json` (already a repo data file the Desk loads).
- `answerKey` ← `data/answer-key.json` (repo data file).
- `config`/`frqBand` ← baked `PHASE3_CONFIG` in the bundle + any server `gradeConfig` overrides
  cached from the last online `/grade`.
- `worksheetBlankCounts` / `blooketLessons` ← cached from the last online `/grade` response (or
  baked into the offline pack at build time). First-ever run must have been online once (matches the
  Phase-1 "first sign-in needs internet" reality).
- A `grade-inputs-cache_v1:<sid>` localStorage blob holds the last-seen non-secret inputs so an
  offline cold start can still re-derive.

### E. Epoch-anchor verification — scope boundary
Per-receipt **signature** verification (B/`verifyAll`) is the real tamper-evidence and ships now.
The **epoch** cross-check reads `/admin/snapshot` (teacher-gated) → naturally a **teacher-app /
Phase 4** job, NOT student-side. (If wanted student-side later, add a tiny public
`GET /class/epoch-head` returning the day's signed epoch receipt; out of scope here.)

---

## 2. Tests
- `tests/grade-engine-bundle-parity.test.js` — drift + client≡server (the §0 guard).
- `tests/ledger-store.test.js` — pure merge/union/dedup/latest-ts + verify tagging (jsdom mem store).
- `tests/desk-ledger-reconcile.test.js` — `_reconcileOwnGrade` picks server-online / re-derive-offline,
  never downgrades, OFF in view-as, folds in unsynced OfflineQueue.

## 3. Out of scope (later phases)
P2P gossip (Phase 3), teacher signing key on-device (Phase 4), epoch cross-check student-side,
student keypairs / non-repudiation (v2).

## 4. Build order
1. Engine bundle + generator + **parity test green** (foundation; de-risks everything).
2. `ledger-store.js` + tests.
3. Wire `receipt-verify.js` + bundle + store into the Desk; `_reconcileOwnGrade` + inputs cache.
4. My-Ledger verification badges (✓ verified / ⚠ counts).
5. Offline-pack injection of the three scripts.
6. Full suite green (root + roster-server) → commit/push.
