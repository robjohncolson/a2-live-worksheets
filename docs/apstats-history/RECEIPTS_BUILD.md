# RECEIPTS_BUILD — Signed Receipt System v1.1 for the Desk (roster-server)

**Frozen contract:** `curriculum_render/docs/receipt-system-spec.md` (sections "Receipt
contract v1" and "Contract v1.1 — ledger receipts"). Reference implementation:
`curriculum_render/scripts/receipt_keytool.mjs`. Working Ed25519 issuer to port:
`curriculum_render/railway-server/receipts.js` + its tests
`curriculum_render/tests/receipt-issuance.test.js`. Both frozen test vectors (v1 verdict
+ v1.1 ledger) MUST be reproduced byte-for-byte.

**Why:** every gradeable aspect of the Desk flows through two endpoints —
`POST /ledger/record` (worksheet, frq, curriculum_quiz, pc, quiz_review, quiz_exception,
trainer, flashcard make-up) and `POST /class/blooket` (teacher game import) — both via
`insertLedgerRow`. Receipts at those two points give every grade row a signed, student-held,
offline-verifiable attestation, including the server-derived `evidence_tier`. Upserts
destroy row history; a receipt outlives the row it attests.

## Task A — roster-server issuance (Codex)

Owned paths: `roster-server/**` ONLY.

1. **New module `roster-server/receipts.js`** — port of curriculum_render's
   `railway-server/receipts.js` (same canonicalize/signPayload/initReceipts/getReceiptIssuer
   internals, same never-throw rule), with `issueLedgerReceipt({ studentId, username,
   source, itemId, score, attempt, evidenceTier, response })` building the v1.1 `ledger`
   payload: `{v:1, t:'ledger', sid, u?, src, i, sc?, a, e, ah, ts, n}`.
   - `sc` = `Number(score)`, OMITTED entirely when score is undefined/null.
   - `ah` = first 16 hex of SHA-256 of the response (stringify non-strings; `null` → "null").
   - `u` optional: include only if a username is passed in; do NOT add DB lookups.
   - Returns `{receiptId, compact}` or null (disabled / missing sid/src/itemId / error).
2. **`POST /ledger/record`** (`ledger.js` success path, after `insertLedgerRow` returns):
   attach `receipt: {receiptId, compact}` to the 200 body alongside `ledgerId`/`evidenceTier`.
   Sign SERVER-known values: sid from `verifyToken`, evidenceTier as derived, attempt as
   defaulted (`attempt ?? 1`), score as validated, ts = `Date.now()`.
3. **`POST /class/blooket`** (`class.js` per-entry loop): issue per recorded entry
   (sid = resolved student_id, src='blooket', sc = the server-computed blooketScore,
   e='practice', u = the roster name if already in scope in that loop). Return
   `receipts: { [itemId+':'+studentId]: {receiptId, compact} }` (or an array — pick one,
   document it in the response) alongside existing `recorded/skipped/errors`. Must not
   break `scripts/import-blooket.mjs` (additive field only).
4. **`GET /receipts/issuer`** → `{enabled, alg:'Ed25519', v:1, pubkey}` (same shape as
   curriculum_render's `/api/receipts/issuer`).
5. **Env:** `RECEIPT_ISSUER_PRIVATE_KEY` (base64 PKCS8). Unset → all responses
   byte-identical to today, `issueLedgerReceipt` returns null, one startup log line.
6. **Tests** (`roster-server/tests/receipts.test.js`, vitest, follow the existing
   injectable-`createApp` pattern in `tests/ledger.test.js`):
   - Reproduce BOTH frozen vectors exactly (canonical, receiptId, sig) using the TEST keys
     from the spec.
   - `sc` omission for score-less payloads (canonical has no `"sc"` key).
   - Disabled mode: response shape unchanged (deep-equal against a no-receipt baseline).
   - `/ledger/record` integration: with key set, response carries a receipt whose decoded
     payload has `sid` = the token's sid, `e` = server-derived tier (test both practice and
     proctored via x-proctor-secret), `a` = stored attempt.
   - Signing failure injected → request still succeeds without receipt field.
   - Execute real code paths; string-presence assertions on source are FORBIDDEN.

Hard constraints: never-throw into parent requests; no new deps; do NOT touch grade
engine, token, trainer, donow, poll files beyond the named issuance points; do NOT
persist receipts (no migrations — phase 2).

## Task B — Desk UI receipt-awareness (Codex)

Owned paths: `ap_stats_roadmap_square_mode.html`, `lib/qrcode.min.js` (new file) ONLY.

Receipts arrive via `gradebookClient.record()` (already capturing to localStorage
`desk_receipts_v1` — see storage contract in the spec; the capture code is already in
`gradebook-client.js`, do not modify it).

1. **"🧾 My Receipts" chip** in `renderDoNowGrades` next to the "📊 My Gradebook" chip
   (~line 6549-6564), same styling/markup pattern.
2. **`my-receipts-overlay` modal** cloned from the `my-gradebook-overlay` pattern
   (HTML ~line 1814; open/close/Esc handlers ~9958-10025): newest-first list of captured
   receipts — icon by `src`, item id, score (if present), date, short receiptId
   (first 12), evidence tier badge when `proctored` — each row with: a "Verify ✓" link to
   `https://robjohncolson.github.io/curriculum_render/verify.html#r=<compact>`
   (encodeURIComponent the compact) opening in a new tab, and a "QR" toggle rendering the
   same URL as a QR code inline (copy `qrcode.min.js` from `curriculum_render/lib/` into
   `follow-alongs/lib/` and add the script tag near the existing chart.js include).
   Empty state: "No receipts yet — receipts appear as your work is recorded."
3. **Teacher menu item** "Verify a receipt…" in the `menu-teacher` dropdown (~1463-1473)
   that opens verify.html in a new tab.
4. Read-only with respect to grading: this UI must not write to the ledger, must not
   touch `_studentMarkSave`/grade caches, and must degrade silently if
   `desk_receipts_v1` is absent or unparseable (treat as empty).

## NOT in scope (phase 2)

Receipt persistence server-side (migration 0018 + pull via GET /ledger/student),
grade-snapshot receipts on GET /grade, per-row badges inside renderMyGradebook,
teacher-dashboard recent-list badges, worksheet wire-script rollout, the-desk (future
platform) implementation.

## Acceptance (sign-off checklist)

1. `npx vitest run roster-server/tests/receipts.test.js` green; both frozen vectors reproduced.
2. Existing `roster-server/tests/ledger.test.js` still green (response additive only).
3. Env unset → deep-equal response baseline.
4. A live-issued ledger receipt verifies green on verify.html (multi-issuer registry).
5. Desk modal renders captured receipts and links/QRs resolve to verify.html.
