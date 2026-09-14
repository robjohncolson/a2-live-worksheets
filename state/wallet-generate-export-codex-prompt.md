# Codex prompt — in-app wallet generation + printable key/QR export — 2026-09-05

> Follow-up: the teacher subsequently authorized students to print their own
> wallet. See [student-wallet-print-BUILD.md](student-wallet-print-BUILD.md) for
> this narrow exception to the original teacher-only reveal policy below.

Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs` (Windows; forward slashes; `node`, `python` on PATH).
**Plan first** (`state/wallet-generate-export-PLAN.md`), then implement `WALLET_GENERATE_EXPORT_SPEC.md` phases 1–4 in
order. **Never push**; commit per phase; report hashes and test counts. Custody policy is fixed: teacher-only, encrypted at
rest, no student surface, keys never logged.

## Read first
`WALLET_GENERATE_EXPORT_SPEC.md` (all), `WALLET_LOADING_SPEC.md` + `WALLET_LOADING_BUILD.md` (what shipped), the shipped
code: `doge-keys.js`, `js/teacher-wallet-loading.js`, `js/wallet-qr-scanner.js`, `roster-server/wallet-custody.js`,
`roster-server/lib/doge-keys.mjs`, `roster-server/crypto.js`, `roster-server/migrations/0035_wallet_custody.sql`,
`tools/doge-wallet-gen.mjs` (`renderSheet`, `--reprint`), tests `tests/doge-keys.test.js`, `tests/teacher-wallet-loading.test.js`,
`tests/wallet-qr-scanner.test.js`, `roster-server/tests/wallet-custody.test.js`, and the vendoring pattern in `vendor/jsqr/`.

## Build, per the spec
1. **Phase 1** — `generateWallet({ random })` in `doge-keys.js` (32 random bytes → in-range scalar with redraw → compressed
   pubkey → mainnet address + WIF; self-check via `decodeWIF`; `wipeBytes` on the way out). Node parity test: the same fixed
   scalar through `roster-server/lib/doge-keys.mjs`/`tools/doge-wallet-gen.mjs` yields the identical address + WIF. Vendor
   `qrcode-generator` (MIT) under `vendor/qrcode-generator/` with LICENSE + a README noting version/source/integrity;
   round-trip test: encode with it, decode with `vendor/jsqr/`, compare.
2. **Phase 2** — "✨ Generate wallets" in the loader: pre-filled assignment rows for active students without an address
   (section filter respected), labels continue from the highest held `Wallet #n`, keep-keys forced ON and not untickable,
   same submit sequence as the CSV path, ✗ rows retryable, unsaved-key warning on close, wipe after success. Tests G1–G4.
3. **Phase 3** — `GET /class/wallet-custody/export?confirm=1[&section]` in `wallet-custody.js`: `requirePayoutTeacher`,
   `walletCryptoEnabled` 503, per-row decrypt + address re-derivation, **one `key_reveal` audit row per wallet via the
   existing row-locked RPC**, omit-and-report mismatches in `skipped`, no-store headers, never log. Tests E1 (401/400/503,
   audit count, skipped path) + E3 (existing suites unchanged).
4. **Phase 4** — `js/wallet-print-sheets.js`: cover page + one page per wallet (name · section · label · address text+QR ·
   WIF text+QR · warning block, copy the Node sheet's wording), letter `@page`, `page-break-after`; opened in a new window
   → `window.print()`; nothing persisted; `window.close()` clears. "🖨 Print wallet sheets" (typed `PRINT` confirm, count +
   section shown) and per-student "Reprint" on the address cell (single reveal → one page). Test E2 (one section per
   wallet, WIF never outside its section, round-trip decode of a rendered sheet's two QR codes).

## Gates
`npx vitest run tests/doge-keys.test.js tests/teacher-wallet-loading.test.js tests/wallet-qr-scanner.test.js
tests/wallet-print-sheets.test.js tests/doge-wallet-gen.test.js` and `cd roster-server && npx vitest run` — all green before
each commit. Do not touch payout, candy, grading, the self-custody proposal path, or `STUDENT_WALLET_OPTIN`.
If the browser cannot reach `getRandomValues` (non-secure context) the Generate button must be disabled with a message,
never fall back to `Math.random`. Report: commits, test counts, anything you could not do.
