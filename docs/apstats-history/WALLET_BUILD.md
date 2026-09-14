# WALLET_BUILD — "My Wallet" for the Desk (durable receipts + grade/points balance)

A MetaMask-style **Wallet** window in the Desk: a **balance** (real v3 grade on top +
an only-up **points** momentum line) and a feed of **recorded work** (the signed
receipts, each verifiable). Builds on the Signed Receipt System (RECEIPTS_BUILD.md,
contract `curriculum_render/docs/receipt-system-spec.md`).

Decisions (locked by the teacher 2026-06-12):
- **Balance = both**: real v3 quarter grade as the headline, only-up points beneath it.
- **Surface = standalone System 7 window** (own 👛 desktop icon), cloning the `ProgressApp`
  pattern (`app-progress-overlay` / `openProgress` / `destroyProgress`).
- **Aesthetic = tasteful nods**: wallet *shape* (Balance, recorded-work feed, Verify,
  Copy) in plain student language. NOT "transaction / tx hash / block explorer / gas".
- **Durable from day one**: receipts persist server-side and repopulate on any device
  after sign-in; the local `desk_receipts_v1` is a fast cache, not the source of truth.

## Task A — server: durable receipt persistence (Codex)

Owned paths: `roster-server/**` ONLY.

**Safety principle (non-negotiable):** the grade write (`insertLedgerRow`) must remain
byte-identical and must NEVER fail because the receipt columns don't exist yet. Migrations
are user-run and the live service can lag, so persistence is a SEPARATE best-effort UPDATE
*after* the row is safely recorded. The receipt is already delivered in-band in the
response regardless of persistence — persistence only enables later replay.

1. **Migration `migrations/0018_item_ledger_receipt.sql`** (USER-RUN, additive; mirror the
   header style of 0016): add two nullable columns —
   ```sql
   alter table item_ledger add column if not exists receipt_id text;
   alter table item_ledger add column if not exists receipt_compact text;
   ```
   Document: until run, receipt persistence silently no-ops (write still succeeds, receipt
   still returned in-band); GET /ledger/student returns rows without receipt fields.

2. **`ledger-db.js`**: add a new method `updateLedgerReceipt(ledgerId, { receiptId,
   receiptCompact })` → `client.from('item_ledger').update({ receipt_id, receipt_compact })
   .eq('ledger_id', ledgerId)`. Return `{ error }`. Do NOT touch `insertLedgerRow`'s body
   or its `.select(...)` (leave the grade write exactly as-is). `getLedgerByStudent`
   already does `select('*')`, so it returns the new columns automatically once they exist.

3. **`ledger.js` (POST /ledger/record)**: AFTER the existing `issueLedgerReceipt` call and
   only when a receipt was issued AND a ledgerId exists, call
   `db.updateLedgerReceipt(data.ledger_id, { receiptId: receipt.receiptId, receiptCompact:
   receipt.compact })` and **swallow any error** (fire-and-forget; a 42703 undefined_column
   pre-migration must not surface). Response shape unchanged (still `{ ok, ledgerId,
   evidenceTier, receipt }`). `mountLedger` is injected `{ db, verifyToken }` — `db` is the
   ledgerDb, so `updateLedgerReceipt` is reachable.

4. **`class.js` (POST /class/blooket)**: same best-effort persistence per issued blooket
   receipt, using each row's `ledger_id` (widen the insert's returned data if needed, OR do
   the update keyed on the known studentId+source+itemId+attempt — pick the simplest that
   doesn't alter the grade write). Swallow errors.

5. **Tests** (`roster-server/tests/receipts.test.js`, extend; keep all existing green):
   - The fake ledgerDb gains `updateLedgerReceipt` storing onto the row, and
     `getLedgerByStudent` returns rows including `receipt_id`/`receipt_compact`.
   - `/ledger/record` with key set → the row later fetched via GET /ledger/student carries
     the same `receipt_compact` that was returned in-band.
   - **Pre-migration resilience**: when `updateLedgerReceipt` returns `{ error: { code:
     '42703' } }` (or throws), `/ledger/record` STILL returns `{ ok:true, ... , receipt }`
     and 200 (the grade write and in-band receipt are unaffected).
   - Disabled mode unchanged (no update attempted, response deep-equals baseline).
   - Execute real code paths; string-presence assertions forbidden.

Hard constraints: never-throw into the parent request; `insertLedgerRow` untouched; no new
deps; touch only `roster-server/**`.

## Task B — client: `gradebookClient.fetchReceipts()` (Fable, already in this commit)

In `gradebook-client.js` (canonical home; re-sync note applies to curriculum_render copy):
a read-only `fetchReceipts()` mirroring `fetchPrior`'s auth (token + sid, Authorization
header, never-throws, returns `[]` on any failure). GETs `/ledger/student/:sid`, returns an
array of `{ id, compact, src, i, sc, ts }` for rows that have a `receipt_compact`
(`id`=receipt_id, `ts`=Date.parse(recorded_at)). The Wallet merges this with local
`desk_receipts_v1`, deduped by `id`, so it survives browser wipes and device switches.

## Task C — Wallet UI (Fable, this repo)

Owned file: `ap_stats_roadmap_square_mode.html`.

1. **Desktop icon** `.app-icon[data-app="wallet"]` (👛 "Wallet") alongside ti84/quiz/
   formulas/game/progress (the `.app-icon` block ~line 1496-1519); `ondblclick="openWallet()"`.
2. **Native window** `app-wallet-overlay` cloning the `app-progress-overlay` structure
   (`app-window` → `game-title-bar` w/ close-box `destroyWallet()` + collapse-box
   `minimizeApp('wallet')` → `app-content` populated by JS).
3. **`WalletApp` / `openWallet()` / `destroyWallet()`** mirroring ProgressApp lifecycle.
4. **Balance card**:
   - **Grade** (headline): current quarter `quarterGrade` from `_gradeQuartersCache`
     (`quarterOfDate(new Date())` → `Q#`; fall back to first quarter with a numeric grade).
     Shown as a percent; "—" while the cache is null. Plain label "Grade".
   - **Points** (only-up momentum): computed from the MERGED receipt set, summed over
     DISTINCT items (`src + '|' + i`, each counted once → monotonic, ungameable):
     `curriculum_quiz`/`pc` = 10, `frq` = 5, `blooket` or `BL-...-DESK_DONE` = 4,
     `worksheet` = 3, `quiz_review`/`quiz_exception` = 2, `trainer` = 1, default 1.
     Show "+N today" = points from items first-recorded today (local midnight).
5. **Recorded-work feed**: merged durable (`fetchReceipts()`) + local (`desk_receipts_v1`),
   deduped by `id`, newest first. Per row: source icon, item id, score (if present),
   date, a "recorded ✓" marker, a **Verify** link to
   `https://robjohncolson.github.io/curriculum_render/verify.html#r=<encodeURIComponent(compact)>`,
   and a **QR** toggle (reuse `lib/qrcode.min.js`) + a **Copy** button for the compact.
6. On open: read the grade cache, call `fetchReceipts()`, merge, render. Degrade silently
   to local-only if offline/signed-out (empty state: "No recorded work yet — items appear
   here as your work is saved."). Read-only w.r.t. grading (no ledger writes, no cache mutation).

## Acceptance

1. `roster-server` tests green incl. new persistence + pre-migration-resilience cases.
2. Env unset / pre-migration → grade writes and responses byte-identical to today.
3. After 0018, a recorded item appears in GET /ledger/student with its receipt_compact, and
   the Wallet shows it after a browser-storage wipe (durable replay).
4. Wallet balance shows the real quarter grade + an only-up points number; feed rows verify
   green on verify.html.
5. No file touched outside the owned paths per task.
