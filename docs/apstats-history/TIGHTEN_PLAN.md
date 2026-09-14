# TIGHTEN_PLAN (follow-alongs) — receipt/wallet hardening P1–P3

Implements the verified audit findings for the receipt/wallet system. Two
independent agents; each owns disjoint files. Never-throw / additive / no
behavior change when receipts are disabled. The frozen receipt contract
(`curriculum_render/docs/receipt-system-spec.md`) and the production pubkeys in
`curriculum_render/docs/KEY_MANAGEMENT_RUNBOOK.md` are authoritative.

## Agent FA1 — roster-server hardening
Owned paths: `roster-server/**` ONLY.

**1. Populate `u` (username) in ledger receipts (audit #10).** Today
`issueLedgerReceipt` is called without `username`, so receipts carry only the
`sid` uuid and the wallet/verify show a uuid. In `roster-server/ledger.js` POST
/ledger/record, after the token is verified to `studentId`, resolve that
student's roster display username and pass it as `username` to
`issueLedgerReceipt`. Wire a best-effort resolver: add a roster-db lookup
(by student_id → username) if one doesn't already exist, and pass it into
`mountLedger` from `server.js` (alongside `db`/`verifyToken`). Best-effort:
if the lookup fails or is unavailable, OMIT `u` exactly as today (never block or
throw the record path). Do the same for the teacher `/class/blooket` receipts in
`class.js` (the studentId is already resolved there — pass the roster name if in
scope, else omit).

**2. `/health` receipt signal + de-swallow persistence failures (audit #8, #14).**
- `roster-server/server.js` `/health`: add a `receipts` block built from
  `getReceiptIssuer()` → `{ enabled, pubkey }` (so an unset key after a redeploy
  is visible, not silent).
- `roster-server/ledger.js` + `class.js`: the `updateLedgerReceipt` failure is
  currently swallowed with a bare comment. Keep it non-fatal, BUT log it
  distinctly and count it: a pre-migration `42703 / undefined_column` is an
  EXPECTED no-op (log once at info, e.g. "receipt persistence not provisioned");
  any OTHER error is a real failure (log at warn with the ledgerId, increment a
  module counter). Expose the counter in `/health.receipts` (e.g.
  `persistFailures`). Never change the response or block the write.

**3. Tests.** Extend `roster-server/tests/receipts.test.js`: assert a ledger
receipt now carries `u` when a username resolver is provided (decode the compact,
check `payload.u`); assert it still omits `u` when the resolver returns nothing;
assert `/health` includes the `receipts` block with the right pubkey when
enabled and `enabled:false` when unset; assert a non-42703 persist error is
counted while a 42703 is not. Keep ALL existing tests green. Run (from
roster-server) `npx vitest run tests/receipts.test.js tests/ledger.test.js`.

## Agent FA2 — Desk Wallet: in-place verify, honest points, tested logic
Owned paths: `ap_stats_roadmap_square_mode.html`, `js/wallet_logic.js` (new),
`tests/wallet-logic.test.js` (new) ONLY.

**1. Extract wallet logic to a tested module (audit #7).** The points and merge
logic currently lives inline in the Desk with ZERO tests (the cd2ec6d
false-green-test hazard). Create `js/wallet_logic.js` exposing a pure
`window.WalletLogic` (also `module.exports` for vitest via a UMD wrapper:
`(function(g){ ... g.WalletLogic = api; if (typeof module!=='undefined') module.exports = api; })(typeof window!=='undefined'?window:globalThis)`):
- `pointsFor(src, itemId)` — moved from `_walletPointsFor`. ADD: return 0 for
  evidence-only sources `quiz_verdict` and `quiz_answer` (captured quiz receipts
  that mirror already-counted ledger work — they must show in the feed but add
  no points).
- `computePoints(receipts)` — moved from `_walletComputePoints` (dedup by
  `src|item`, monotonic, `today` from local midnight).
- `mergeReceipts(durable, local)` — moved from the merge in `_walletLoadReceipts`
  (dedup by `id` then `compact`, durable wins so the server `ts`/`recorded_at` is
  preferred — this fixes the "today" drift across a storage wipe, audit #9).
Load `<script src="js/wallet_logic.js"></script>` in the Desk (near
`gradebook-client.js`) and have the inline wallet code call `WalletLogic.*`.

**2. Tests (`tests/wallet-logic.test.js`, vitest).** Cover: points dedup (same
item twice → counted once), only-up monotonicity, `quiz_verdict`/`quiz_answer`
→ 0 points, flashcard `BL-…-DESK_DONE` → 4, `today` delta; merge dedup by id,
durable-wins-ts. Execute real code (import the module). String-presence
assertions forbidden.

**3. In-place verify in the wallet (audit #11).** Add an inline Verify that runs
WebCrypto Ed25519 against the issuer registry IN the Desk (don't force a new
tab). Embed both production pubkeys:
- Quiz Server `yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4`
- The Desk `DRfEbaWByfatxMq26iHrw4wxt4MIpypZlbB3GeBFSO4`
On a receipt row, the Verify action should decode the compact, verify the
signature in-browser, and show an inline ✓/✗ + which issuer signed, without
navigating away. KEEP the existing external `verify.html` link as a secondary
"open full verifier" affordance.

**4. Honest points label (audit #17).** In the balance card, label the points
line so it reads as effort/completion, not an adjudicated grade — e.g.
"effort points · work recorded" with a small tooltip "Points reward completing
work; your Grade reflects correctness." No numeric change.

Run (repo root) `npx vitest run tests/wallet-logic.test.js`.
