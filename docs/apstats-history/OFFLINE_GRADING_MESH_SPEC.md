# OFFLINE GRADING MESH — the raw-work lane (turn work into grades with no server)

> Builds on ANDROID_PACKET_APP_SPEC (offline ledger), the signed-ledger + §0 binding
> (`receipt-verify.js verifyLedgerRow`), Phase 4 teacher key (`receipt-sign.js`,
> `secure-key.js`, `teacher-app.html`), and the transport-agnostic gossip engine
> (`ledger-gossip.js`). Closes the last gap in the offline vision.
>
> **The gap.** The mesh gossips ONLY *signed* rows (`idOf` requires `receipt_id`;
> "an un-addressable row can't be verified by a peer"). So ungraded raw work never
> travels the mesh — the teacher app grades FRQs it **imports from the server** (HTTP),
> not from peers. A fully disconnected classroom therefore can't convert work into grades.
>
> **The goal.** A SECOND mesh lane that carries **raw submissions** student→teacher, so
> the teacher device grades + signs offline, and the resulting signed grades re-enter the
> existing signed-grade lane and spread. Then: kids do work → mesh ferries it to the
> teacher's phone → teacher signs → grades mesh back out. No server in the loop.
>
> **Status:** spec → REVIEWED + hardened → **Phase 1 IMPLEMENTED (2026-07-01)**. A 2-lens
> review (trust/PKI + convergence) found the naive design **not shippable** — ~11 concrete
> defects. The **§0 corrections are binding** and override §§1–9 below. This is a LARGE,
> security-critical build; treat §0 as the real design.
>
> **Phase 1 shipped — student PKI + domain-separated verification (§0.1-0.3, §0.5):**
> - **Domain separation (§0.1a):** `receipt-verify.js verifyLedgerRow` + server
>   `snapshot-verify.js verifyRecord` now REQUIRE `payload.t === 'ledger'` — grade receipts
>   are uniformly `t:'ledger'` (a teacher FRQ grade is `t:'ledger'` + `src:'frq'`), so a
>   review/epoch/submission receipt can no longer be replayed as a grade. New `wrong-type` break.
> - **Second trust set (§0.1b/c):** `ReceiptVerify.STUDENT_KEYS` + `registerStudentKeys` /
>   `registerIssuerKeys` (mutual disjointness asserted at register time) + `verifySubmissionRow`
>   (t:'submission', NO `sc`/`g` fields, response-hash `ah` bind, and the impersonation gate:
>   row.sid === payload.sid === the signing key's REGISTERED sid). Verified only against the
>   student set — the two lanes share no keys.
> - **Server (auto-deploys, 503 until migration 0027 runs):** migration `0027_student_keys`
>   (pubkey PK, FK to roster, terminal `revoked`); `student-keys.js` — `POST /student-keys/register`
>   (sid from the TOKEN, never the body — §0.2; one-sid-per-pubkey — §0.5; a revoked key never
>   comes back — §0.3), `GET /student-keys` (served trust set incl. the revoked flag),
>   `POST /student-keys/revoke` (teacher). The trusted-issuers route now refuses a pubkey
>   already bound to a student (disjointness mirror).
> - **Client (APK-only, inert on web):** `student-key.js` (`window.StudentKey`) — get-or-generate
>   a device Ed25519 key hardware-wrapped via SecureKeyStore, register it (authenticated),
>   sync the class trust set, clear-on-revoke. Wired into `mobile-home.html` sign-in + sync boot.
> - Tests: `tests/{mesh-submission-verify,student-key-client}.test.js`,
>   `roster-server/tests/student-keys.test.js` + verifyRecord type-check regressions.
> - ✅ **USER RAN migration 0027** (`/student-keys` live: returns `{ok,keys}`, gates on the teacher secret).
>
> **Phase 2 shipped — the submissions lane (§2, §0.6, §0.7):**
> - **`submission-store.js`** (`window.SubmissionStore`) — a SECOND content-addressed G-Set
>   (`apstats_submissions_v1`), fully separate from the grades store. Grade-gated SUPPRESSION
>   (§0.7): `coveredKeys(gradesRows)` reads a `sub` field (the graded submission's receipt_id)
>   from each grade's decoded payload and covers that submission IF same student (blocks
>   cross-student griefing); `rowsForGossip` excludes covered subs from the offer, and
>   `suppressingVerify` rejects them on ingest — the row is never deleted (deletion resurrects
>   in a G-Set). Monotone (grade-presence grows) → converges to suppressed. Until Phase 3 mints
>   grades carrying `sub`, nothing is suppressed (safe: subs keep gossiping until graded).
> - **`submission-capture.js`** (`window.SubmissionCapture`) — build a `t:'submission'` payload
>   (NO `sc`/`g`), self-sign with the unlocked device key, content-address, store.
>   `signPendingWork` unlocks once and signs a batch, FORCING `student_id` = the caller sid
>   (self-attribution §0.2). Proven end-to-end: a captured submission is ACCEPTED by
>   `verifySubmissionRow` and REJECTED by `verifyLedgerRow`; a swapped response breaks the `ah` bind.
> - **`ledger-gossip.js`** — lane tags: `frame(type,payload,lane)` is byte-identical when no lane
>   is set (grades back-compat); `createSession(opts.lane)` stamps outgoing + ignores other lanes'
>   frames; NEW `runLanes(transport,{lanes})` carries both lanes over ONE Nearby discovery with
>   per-(peer,lane) sessions, demuxing by `frame.lane` (lane-less → grades). `runRound` UNCHANGED.
> - **`mobile-home.html`** Sync-Nearby runs `runLanes(grades+subs)` when the subs stack is present
>   (APK), else the unchanged `runRound`; the grades set is snapshotted ONCE per round so the
>   offer side (exclude covered) and ingest side (`suppressingVerify`) agree.
> - Adversarial review (7-agent: 3 raised, 3 refuted, 0 confirmed) still drove fixes: a Promise
>   passed where an array was expected (would silently disable suppression once Phase 3 lands) and
>   the missing reject-on-ingest half of §0.7 — both fixed; the per-student flood cap is correctly
>   DEFERRED to Phase 3 anti-farming (per the binding §0 phasing; §0.9 content-addressing forbids
>   a "re-answer replaces" cap).
> - Tests: `tests/{submission-store,submission-capture,ledger-gossip-lanes,mobile-home-submissions}.test.js`
>   + `ledger-gossip`/`build-offline-pack` extended.
>
> **Phase 2.5 shipped — hardware-smoke UX/security fixes (3-device smoke passed):** the
> 3-device smoke (Pixel Tablet + S24 + Pixel 3) PROVED real Nearby convergence (Pixel3↔S24
> both 1→2 submission rows), lane separation (grades stayed 49→49), and student-signed
> submission verification. It found two issues, both fixed here:
> - **Silent student key (§2.5, user-chosen "auto on sign-in, no biometric"):** the native
>   `secure-key-store` plugin gains a SECOND master key class — `MASTER_ALIAS_NOAUTH` created
>   WITHOUT `setUserAuthenticationRequired`, picked by `masterKey(requireAuth)`; `setKey`/`getKey`
>   read `requireAuth` (default true = teacher back-compat) + caller-provided `title`/`subtitle`;
>   `requireAuth:false` → `runDirect` (no BiometricPrompt). `student-key.js` uses `requireAuth:false`
>   (label bumped v1→v2 so the new APK never reads a v1 auth-required key with the silent master);
>   the roster password is the auth, the key only makes submissions attributable. `teacher-app.html`
>   keeps its biometric gate + now-correct explicit "teacher signing key" copy. So a student on a
>   SHARED teacher device never needs the teacher's fingerprint, and the wrong prompt copy is gone.
> - **Native mobile signup:** `mobile-home.html _nfCreate` renders an in-launcher signup (real name
>   + spun fruit_animal username + 4-digit PIN + a period PICKER — a `<select>` when >1 open section,
>   Desk parity) → `rosterClient.claim` (re-rolls on username-taken) → the post-sign-in flow. Was a
>   redirect to the desktop Desk.
> - Review (4-agent: 1 raised, 1 CONFIRMED + fixed = the multi-section signup dropped students into
>   section[0] with no picker; keystore-security + key-migration lenses clean). Tests:
>   `tests/{secure-key,secure-key-plugin,student-key-client,mobile-home-submissions}.test.js`. ⚠ USER
>   rebuilds the APK + re-tests on-device (the silent-key + signup are native/UI, only runtime-checkable on a phone).
>
> **Phase 3 shipped — the teacher offline grade loop (§3, §0.4, §0.8-0.11):**
> - **`submission-grader.js`** (`window.SubmissionGrader`, pure + fully unit-tested): `autoScore`
>   (worksheet scorer BYTE-matched to `ledger.js`; MC via the lifted `GradeEngine.isCorrect`);
>   `buildGradeFields` → unsigned `signLedgerReceipt` fields carrying `sub` (§0.7) + `kv` (§0.10) +
>   deterministic ts/n (§0.8); `planAutoGrades` = per (sid,item) grade ONLY the max-score submission
>   (never-downgrade) — the §0.9 emit fix; `assignAttempt` = **teacher-assigned max existing grade
>   attempt + 1**, NEVER the student's forgeable submission attempt (§0.4 — so the engine's
>   latest-by-attempt supersession records the max score; a wrong high-attempt submission can't
>   bury a correct one).
> - **`receipt-sign.js` + server `receipts.js`**: `signLedgerReceipt`/`issueLedgerReceipt` gain
>   `sub`/`kv` + a deterministic `nonce` (client/server byte-identical, proven in interop).
> - **`GradeEngine`**: `isCorrect`/`normalizeResponse`/`scoreAgainstKey` lifted into the public API
>   (bundle regenerated, parity pinned).
> - **Server**: teacher-gated `GET /grade/answer-key` (`grade-answer-key.js`) returns the FULL
>   unredacted key + a `keyVersion` hash for the teacher device (§7.1 — students still get the
>   redacted key). **⚠ closed a real leak: `build-offline-pack` copied the whole `data/` dir → the
>   full answer key shipped in the STUDENT APK; now excluded + PURGED (stale copies deleted, a test
>   guards it).**
> - **Flood cap (§0.4/§5)**: `SubmissionStore.floodCapVerify` bounds per-student/-item/-total rows
>   on the subs ingest; composed into the mobile + teacher subs lanes.
> - **`teacher-app.html`**: an Offline grading card + loop — Nearby two-lane sync, verify
>   submissions (student trust set), auto-grade (max-score, never-downgrade, teacher-assigned
>   attempt), FRQ E/P/I queue (already-covered work filtered out so a re-judge can't silently
>   downgrade), sign with the teacher key, verify-before-emit into the grades G-Set.
> - 8-agent adversarial review: 4 confirmed + FIXED (the stale-file leak; the §0.4/§0.9 attempt
>   assignment; the never-downgrade-vs-active-score; the FRQ re-queue downgrade) + 1 refuted.
>
> **Phase 4 shipped — hub reconcile (§4, §0.10) — THE MESH IS FEATURE-COMPLETE (all phases 1-4 + 2.5):**
> - **Server verifies + archives raw submissions, decoupled from grading (§0.10):** migration
>   `0028_submission_archive` (append-only, content-addressed by `receipt_id`, FK to roster,
>   NEVER a score column); `snapshot-verify.js verifySubmissionRecord` (the server twin of the
>   client `verifySubmissionRow` — verifies a `t:'submission'` ONLY against the student trust set,
>   with the impersonation gate `rec.studentId === payload.sid === signer.sid` + the no-grade-fields
>   check); `submissions.js` — teacher-gated `POST /submissions/archive` (verify each row, archive
>   valid via idempotent upsert-ignore, reject forged, honest archived/duplicate/rejected counts)
>   + `GET /submissions/archive` (teacher audit). The archive path NEVER writes `item_ledger`, so
>   the server can't mint a competing score; teacher GRADES reach the ledger via the unchanged
>   `/admin/restore` (teacher key = trusted issuer). `teacher-app.html` best-effort uploads its
>   verified submissions after grading.
> - Review (5-agent: 3 raised, 3 refuted, 0 confirmed — the object-`ah` caveat + the teacher-gated
>   verify cost matched the shipped `verifyRecord`'s accepted limits; the count over-report was
>   fixed to be honest). Tests: `roster-server/tests/submissions.test.js` (11, incl. real Ed25519
>   sign→verify + a pglite migration test).
> - **⚠ USER: run migrations `0028` (+ confirm `0027` ran). The whole mesh (Phases 1-4 + 2.5) is
>   feature-complete but the offline P2P grade loop is RUNTIME-UNTESTED end-to-end — it needs a
>   teacher device + ≥1 student phone (rebuild the APK; drive via adb) to validate the full
>   student-submits → teacher-grades-offline → grade-gossips-back → suppression loop.**

---

## 0. Review corrections (binding — folded 2026-07-01)

The naive design self-signs submissions but leaves the hard halves open: the key→student
binding is unauthenticated, there's no revocation, "only teacher signs grades" is enforced
NOWHERE in code, and the submissions lane doesn't converge. **These corrections govern.**

### Trust / PKI
1. **Domain separation is mandatory (else a student can MINT a grade).** `verifyLedgerRow`
   today never checks `payload.t` or issuer *kind* — "only teacher/server sign grades" is an
   accident of `ISSUERS` membership. Required: (a) the **grades** verify uses ONLY the issuer
   trust set (server+teacher) AND requires `payload.t` ∈ grade types (`'ledger'`/`'frq'`) — add
   the `t` check to `verifyLedgerRow`; (b) the **submissions** verify uses ONLY the student trust
   set AND rejects any payload carrying grade fields (`sc`,`g`) — a submission structurally
   cannot be a grade; (c) never merge the two trust sets / key caches; assert disjoint at load.
2. **The pubkey→sid binding must be AUTHENTICATED (the real impersonation gate).** Self-signing
   only binds a submission to a *key*; the key→student step is unguarded. Registration MUST prove
   the caller **is** that `sid` (valid session/PIN) before binding a pubkey — never "first key
   wins," never accept a client-claimed `sid`. Without this, a student POSTs a key under a
   victim's `sid` and submits as them.
3. **Student keys need REVOCATION (issuer keys don't).** "Never remove" is catastrophic for a
   fleet of student keys: a lost/stolen private key signs as the student forever, and can backfill
   any date. Add a teacher/server-signed `{t:'revoke', pubkey, sid, ts}` that propagates on the
   **trusted** lane; submissions verify rejects a revoked key (or anything signed after its revoke).
4. **Anti-farming: students don't own the grade-controlling fields.** `attempt` and `ts` are
   student-authored — a student brute-forces auto-graded items (unbounded resubmit → 100) and
   backdates past deadlines. Required: the **teacher device caps attempts** per `(sid,item)` and
   **assigns the attempt number** at grade time (not trusting the submission's); supersede
   auto-graded items by **max score** (monotone, non-gameable), never by attempt; stamp any
   deadline logic from the **teacher clock**, never the submission `ts`.
5. **Teacher-attestation must be teacher-driven + replay-safe.** `{t:'attest', pubkey, sid, nonce,
   exp}` where the **teacher picks `sid` from the roster on the teacher's own device** (never the
   student's claim), captures the pubkey **in-band** (scan the student's on-screen key), one-sid-
   per-pubkey, distinct `t`, honors revocation. (v2 — v1 uses authenticated online registration, #2.)
6. **Lane discriminator on the wire.** Gossip frames carry rows with no lane tag and both lanes
   address by `sha256(payload)` — a submission can bleed into the grades ingest. Tag frames
   (`{lane:'grades'|'subs'}`) or use separate channels; each session's verify pinned to one trust
   set. Test: a submission row is REJECTED by the grades ingest.

### Convergence
7. **No pruning — use grade-gated SUPPRESSION.** Deleting from a grow-only gossip set resurrects
   forever (a peer re-offers what your digest lacks). Instead: a submission is "covered" iff a
   teacher grade for its `(sid,item,attempt)` exists locally; **exclude covered submissions from
   `getRows()`** (they leave the digest) AND **reject covered submissions on ingest**. Grade-
   presence is grow-only → the predicate is monotone → every device converges to "suppressed."
8. **Auto-grade receipts must be DETERMINISTIC** (or the grades set never dedups). Today `ts:
   Date.now()` + random `n` → re-grading the same submission (which WILL happen) yields a new
   `receipt_id` → duplicate grades whose score flaps by sync order. For deterministic (worksheet/
   quiz) grades, derive the receipt as a **pure function of the submission** (`ts` and `n` from the
   submission content, e.g. `n = hash(submission.receipt_id)`) → byte-identical → collapses.
9. **Supersede by max score + teacher-assigned attempt; representative by min `receipt_id`.**
   "Re-answer replaces" is false in a content-addressed set (different response → different id →
   both persist). Never let the student's `attempt`/`ts` pick the winner.
10. **One normalization + key-version pinning; issuer precedence on reconcile.** Offline-teacher
    and later-server grading of the same work can disagree (key version / whitespace / numeric
    tolerance) → two valid grades. Pin an **answer-key-version hash** into the grade payload, share
    ONE normalization module (`scoring.js`) between `grade-offline-inputs.js` and the server, and
    the **server must NOT re-grade** a submission that already carries a teacher grade — it archives
    + defers (idempotency), never mints a competing score.
11. **Keep the student clock out of supersession** — `submission.ts` is display/hint only; precedence
    is (assigned attempt → max score → min `receipt_id`), none of which a student can forge.

**Bottom line:** the idea is sound but the security surface is real — this is student PKI +
revocation + domain-separated verification + deterministic offline grading, not a small add.
§§1–9 below are the original draft, retained for reference but superseded by §0.

---

## 1. Why raw work can't just be gossiped (the trust wall)

The signed-grade lane is safe because a *trusted issuer* (server / teacher key) signs every
row, and peers verify-on-ingest. **Raw student work is unsigned**, so on an open mesh anyone
could inject *"student X submitted answer Y"* — impersonation and fabrication. You cannot put
unsigned, unattributed data on the mesh and trust it.

**So the raw-work lane requires student self-signing.** Each student device holds its own
Ed25519 keypair; a submission is **signed by the student's key**. That doesn't stop a student
from submitting *their own* garbage (fine — the teacher grades it), but it does bind every
submission to a real student identity and makes impersonation cryptographically impossible.
This mirrors the teacher key, scoped per student — and reuses `receipt-sign.js` + `secure-key.js`.

## 2. Two lanes, one engine (both are signed G-Sets)

`ledger-gossip.js` is transport-agnostic anti-entropy over a content-addressed G-Set. Run it
over TWO sets, each with its own verify function:

| Lane | Rows | Signed by | Verify-on-ingest | Direction |
|------|------|-----------|------------------|-----------|
| **Grades** (today) | signed grade receipts | server **or** teacher key | trusted-issuer sig + §0 field binding | everyone ↔ everyone |
| **Submissions** (new) | raw work: `{sid, item, src, response, attempt, ts}` | the **student's own** key | student-issuer sig + `sid` binds to the signing student | student → teacher (drains) |

Both are grow-only sets, content-addressed, union-merge, idempotent — the same convergence
guarantees. A submission is just a different receipt type (`t:'submission'`) verified against
the **student** trust set instead of the issuer trust set.

## 3. The flow (your triangle, completed offline)

1. **Capture + self-sign.** Student answers → device builds `{v:1, t:'submission', sid, src,
   i, a, ah:hash(response), response, ts}` and **signs it with the student key** → a
   content-addressed submission row → added to the local Submissions G-Set.
2. **Gossip (student → teacher).** The mesh spreads submissions. Verify-on-ingest: a submission
   is kept only if the **student signature** is valid AND its `sid` matches the signing key's
   registered student (no impersonation). Peers relay; the teacher device accumulates them.
3. **Grade on the teacher device.** For each verified submission:
   - **Auto-gradable** (`worksheet` blanks, `curriculum_quiz`) — the teacher device scores it
     deterministically against the answer key (it has the real key; a student device only has
     the redacted one, `grade-offline-inputs.js`), then signs.
   - **FRQ / judgment** — queued for the teacher (or on-device AI) to grade E/P/I, then signs.
   Signing = `ReceiptSign.signLedgerReceipt(teacherKey, {…, sc, g})` (Phase 4, unchanged).
4. **Gossip back (grades lane).** The teacher-signed grade enters the **existing** signed-grade
   G-Set and spreads to every device — including the student's — via the lane that already works.
5. **Prune.** A submission whose `(sid,item,attempt)` now has a teacher-signed grade is
   superseded; it can be dropped from the Submissions set (grades are the durable record).
6. **Reconcile with the hub.** When any device reaches Supabase, both lanes sync up; the server
   accepts teacher-signed grades (already a trusted issuer) and can archive submissions.

## 4. Student PKI (the new infrastructure)

- **Keygen.** On self-signup / first run, the device generates an Ed25519 keypair
  (`receipt-sign.js generateKey`) and stores the private key hardware-wrapped (`secure-key.js`).
- **Registration.** The public key is bound to the student's roster identity: `POST` the pubkey
  at signup (online), stored in a `student_keys` table + served in the trust set. Offline-first
  enrollment: the teacher device can also vouch (sign) a student pubkey it trusts, so a brand-new
  student can be admitted to the mesh with no server (teacher-attested key).
- **Trust set.** Devices fetch student pubkeys (like `/receipts/issuer` serves issuer keys) and
  cache them; the Submissions verify checks the student sig against this set. A submission from an
  unknown key is dropped (or held pending teacher attestation).
- **Rotation / lost device.** New device → new key → re-register (online) or teacher-attest
  (offline). Old submissions stay valid (old pubkey retained, never removed — same rule as issuers).

## 5. Security model

- **Impersonation:** blocked — a submission's `sid` must match its signing student key; you can't
  submit as someone whose key you don't hold.
- **Grade forgery:** unchanged — only server/teacher keys sign *grades*; a student key signs
  *submissions*, never grades. §0 binding still gates the grades lane.
- **Fabrication of your own work:** allowed by design (it's your work) — the teacher grades it.
- **Replay / dup:** harmless (idempotent content-addressed G-Sets).
- **Mesh flooding / DoS:** a student could self-sign thousands of junk submissions. Bound it:
  per-student rate/one-per-`(item,attempt)` (a re-answer *replaces*, same key), cap submissions
  accepted per student per sync, and a verify-budget like the QR path.
- **Privacy:** submissions carry a student's full response over the mesh — same class-visibility
  care as grades (peers can hold others' rows); acceptable within the class, but note it. FRQ
  responses are not encrypted peer-to-peer today.

## 6. What's reused vs. new

- **Reused:** `ledger-gossip.js` (second G-Set, same engine); `receipt-sign.js` (student self-sign,
  same as teacher); `secure-key.js` (student key storage); `receipt-verify.js` (add a student
  trust set + `t:'submission'` verify); the teacher signing/grading pipeline (`teacher-app.html`,
  `grade-offline-inputs.js`); the transports (Nearby / the parked QR).
- **New:** the Submissions G-Set + its verify; student keygen/registration + `student_keys` +
  the served student trust set + teacher-attestation path; the teacher device's ingest→grade→sign
  loop over gossiped submissions (vs today's server import); submission pruning.

## 7. Open decisions

1. **Auto-grade on the teacher device, or on the student device pre-submission?** A student device
   *can* score its own worksheet/quiz (redacted key) but can't sign; letting it pre-score saves the
   teacher work, but the teacher must re-verify (can't trust a student's self-score). *Rec: teacher
   device re-scores deterministic items itself + signs; never trust a student self-score.*
2. **Teacher-attested student keys (offline enrollment)** — build now, or require online signup for
   the first key? *Rec: online signup for v1; teacher-attestation v2 (removes the last server dependency).*
3. **Submission encryption** — leave FRQ responses cleartext on the mesh (class-visible) or encrypt
   to the teacher's key? *Rec: cleartext v1 (same as grades); teacher-key encryption if privacy demands.*
4. **Single teacher signer** assumed (no two-teacher conflict). Confirm.

## 8. Phasing

| Phase | Work |
|-------|------|
| **1 — student keys** | keygen + hardware-wrap on signup; `student_keys` table + registration; served student trust set; `receipt-verify` student-sig verify (`t:'submission'`) |
| **2 — submissions lane** | Submissions G-Set + store; self-sign on capture; gossip it (Nearby) with verify-on-ingest; rate/dup bounds |
| **3 — teacher offline grade loop** | teacher device ingests gossiped submissions → auto-grade deterministic + queue FRQ → sign (teacher key) → emit into the grades lane; prune superseded submissions |
| **4 — hub reconcile** | server accepts + archives submissions; verifies student sigs; both lanes sync on reconnect |

## 9. Risks / honest caveats

- **Student PKI is real new surface** — keygen, storage, registration, rotation, a served student
  trust set, and (for full offline) teacher attestation. This is the bulk of the work.
- **Teacher device = the offline grading SPOF** (same concern as the teacher-key backup) — if it's
  lost, no new grades until restored. Pairs with the warm-spare key-backup item.
- **Bandwidth:** raw FRQ responses are larger than grade rows; fine over BT gossip, heavier over QR.
- **Trust bootstrap:** verifying a student sig needs that student's pubkey; a device that never
  cached it (and no teacher attestation) holds the submission pending — it doesn't drop the work,
  but it can't verify it until the key is known.
