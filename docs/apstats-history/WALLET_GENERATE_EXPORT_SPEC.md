# WALLET_GENERATE_EXPORT_SPEC.md — generate wallets in the dashboard, and print every held key as a QR sheet

> **Later policy update (2026-09-05):** The teacher explicitly requested student
> access to their own printable wallet. [Student wallet printing](state/student-wallet-print-BUILD.md)
> documents the authenticated, confirmed single-wallet exception. The teacher-only
> statements below describe the original generation/export scope; class export
> and wallet management remain teacher-only.

**Purpose:** `WALLET_LOADING_SPEC.md` (shipped 2026-09-05) loads paper wallets the node generated. The teacher's follow-up:
(1) generate the wallets **in the app** instead of on the node, and (2) an **export** that produces a PDF with every
student's keys and QR codes. This addendum adds both on top of the shipped custody layer; nothing in it changes how a
wallet is stored, paid, or revealed.

> **Status:** proposed (2026-09-05, teacher asked for it the same day). **Owner:** teacher. **Workflow:** spec → Codex
> builds (plan first) → orchestrator reviews and pushes. Custody policy unchanged: teacher-only, encrypted at rest, never a
> student surface, never AI-touched.

## 0. What already exists (reused)

| Piece | Where | Reuse for |
|---|---|---|
| Browser key library: secp256k1 arithmetic, RIPEMD-160, base58check, `decodeWIF → address` | `doge-keys.js` (vendored copy of `roster-server/lib/doge-keys.mjs`) | generation = draw 32 random bytes → scalar → the SAME derivation the loader already trusts |
| Custody write path: `POST /wallet/address` then `POST /wallet/custody` (WIF re-derived server-side, 409 on mismatch) | `roster-server/doge-wallet.js`, `roster-server/wallet-custody.js` | generated wallets are saved exactly like pasted ones — no new write path |
| Audited single reveal `GET /wallet/custody/:id?confirm=1` (row-locked, `key_reveal` ledger row) | `wallet-custody.js`, migration 0035 | the export is N of these, or one bulk endpoint with the same audit (§2) |
| Loader UI: modal, assignment table, progress list, badges, typed `REVEAL` confirm | `js/teacher-wallet-loading.js` | "Generate" is a second entry point into the same assignment table |
| Printable one-wallet sheet with address QR + WIF QR + warnings | `tools/doge-wallet-gen.mjs` `renderSheet` (Node, `qrcode` npm) | the browser sheet copies its layout; QR encoding moves to a vendored browser encoder |
| QR **decoder** vendored | `vendor/jsqr/` | pattern for vendoring the **encoder** (§3) |
| Teacher gate | `requirePayoutTeacher` | every new endpoint |

## 1. Generate in the app

**Button:** "✨ Generate wallets" next to "📥 Load wallets" in Reward Disbursement. Opens the same modal as the loader,
pre-filled: one freshly generated wallet per **active student without an address** (section filter respected), labelled
`Wallet #<n>` continuing from the highest label already held in the class (so app-generated and node-generated labels never
collide). The teacher can untick students. Submit runs the loader's existing per-row sequence: `POST /wallet/address`
(mainnet `D…`), then `POST /wallet/custody` with the WIF — **keep-keys is forced ON for generated wallets** (there is no
paper copy yet; the server is the only custodian until the teacher prints).

Generation (all in `doge-keys.js`, browser only):
1. `crypto.getRandomValues(new Uint8Array(32))` → reject and redraw if the scalar is 0 or ≥ the curve order (the library
   already throws on out-of-range; loop on it).
2. `multiplyGenerator(scalar)` → compressed public key → hash160 → mainnet P2PKH address; WIF = base58check(0x9e ‖ priv ‖ 0x01).
3. Self-check: `decodeWIF(wif).address === address` before the wallet is offered; a mismatch aborts the whole batch
   (never silently drops one).
4. Wipe the scalar and WIF buffers (`wipeBytes`) after the custody POST succeeds; nothing is kept in `localStorage`,
   IndexedDB, or the page after the modal closes.

If a custody POST fails after the address POST succeeded, the row shows ✗ "address saved, key NOT held — retry" and the WIF
stays in memory for that row until retried or the modal is closed (then the teacher must delete the address or reveal
nothing; the row is flagged in `GET /class/wallet-custody` as `held:false`). The modal warns before closing with unsaved keys.

## 2. Export: one PDF with every held key

**Button:** "🖨 Print wallet sheets" (teacher-only, next to Generate). Flow:
1. Typed confirm `PRINT` (mirrors `REVEAL`/`RESTORE`), with the count of held wallets and the section shown.
2. `GET /class/wallet-custody/export?confirm=1&section=…` → `{ wallets: [{studentId, realName, username, address, wif, label}] }`
   for every held wallet in scope. Server-side: same gate, same per-row address re-derivation, and **one `key_reveal`
   audit row per wallet** through the existing row-locked RPC (an export IS N reveals; the audit trail must say so).
   No-store headers. Any single row failing the address check → that wallet is omitted and listed in `skipped` with the
   reason; the export never 500s on one bad row.
3. The dashboard renders a print document in a new window: **one page per student** — name · section · label · address
   (text + QR) · private key (text + QR) · the generator's warning block ("anyone with this key owns the coins") — plus a
   cover page with the date, section, count, and "keep sealed". Page size letter, `@page { margin }`, `page-break-after`.
   The teacher uses the browser's Print → Save as PDF. Nothing is written to the server; nothing stays in the page after
   `window.close()`.
4. The same renderer serves the single-student **Reprint** button on the address cell (replaces the "run the node tool"
   hint from the loader spec): reveal → one-page sheet → print.

QR encoding: vendor `qrcode-generator` (MIT, dependency-free, ~30 KB) under `vendor/qrcode-generator/` with LICENSE +
integrity note, exactly like `vendor/jsqr/`. The Node sheet and the browser sheet must produce scannable codes for the same
test vector (the loader's scanner reads what the exporter prints — add a round-trip test with the vendored decoder).

## 3. Data / endpoints

| Endpoint | Auth | Effect |
|---|---|---|
| `GET /class/wallet-custody/export` | teacher + `?confirm=1` | §2.2. Optional `section`. Returns held wallets with WIFs; audits each. 503 without `WALLET_KEY_SECRET` / before 0035. |

No migration. No new columns. Generation touches no server code.

## 4. Invariants (tests)

- G1: a generated wallet's address equals `decodeWIF(wif).address` (client self-check) AND the server's custody check
  (409 path) — test both with a fixed scalar vector against the Node library's output.
- G2: generated scalars are in range; the redraw loop is exercised with a stubbed RNG returning 0 then a valid value.
- G3: keep-keys cannot be unticked for generated rows (UI test) and no generated WIF is ever sent to any endpoint other than
  `/wallet/custody`.
- G4: after a successful batch, no WIF/scalar remains in the page (inspect the loader's state object + no storage writes).
- E1: `/class/wallet-custody/export` without `confirm=1` → 400; with a student token → 401; before the env/migration → 503;
  writes exactly one `key_reveal` ledger row per exported wallet; omits (and reports) a wallet whose key no longer matches.
- E2: the printed page contains one `page-break` section per wallet, never the words of a WIF outside its own section, and
  the vendored decoder reads back both QR codes of a rendered sheet (round trip).
- E3: the existing loader, scanner, reveal and payout tests stay byte-identical in outcome.

## 5. Phases

| Phase | Work |
|---|---|
| 1 | `doge-keys.js` `generateWallet()` (+ Node parity test against `roster-server/lib/doge-keys.mjs`), vendored QR encoder + round-trip test |
| 2 | "Generate wallets" in `js/teacher-wallet-loading.js` (forced keep-keys, wipe, failure handling) |
| 3 | export endpoint + audit + tests |
| 4 | print renderer (`js/wallet-print-sheets.js`), Print / Reprint buttons, typed confirm |

### TL;DR
Generate keys in the teacher's browser with the library the loader already trusts, save them through the shipped custody
path with keep-keys forced on, and print every held key as a one-page-per-student QR sheet via an audited bulk reveal and
the browser's Save-as-PDF. No migration, no new storage, no student surface.
