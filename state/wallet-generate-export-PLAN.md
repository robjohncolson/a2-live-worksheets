# Wallet generation and printable export plan

Implement `WALLET_GENERATE_EXPORT_SPEC.md` phases 1–4 in order. Make one local commit per phase after the requested browser/tool gate and full roster-server suite pass. Never push. Existing unrelated untracked files are excluded.

## Constraints and preparation

- Reuse the teacher-only custody gate, encryption, address writer, and row-locked reveal audit RPC. No migration or changes to payouts, candy, grading, student custody proposals, or `STUDENT_WALLET_OPTIN`.
- Use only public deterministic test vectors; do not read real wallet backups or log keys. No browser persistence of generated or revealed material.
- Read the generation/export and shipped loading specifications, shipped key libraries, loader, scanner, custody/crypto/migration, Node sheet renderer, tests, and jsQR provenance.
- Refresh the stale GitNexus index. Before modifying existing symbols, run upstream impact and report callers, flows, and risk. Run `detect_changes` before each commit and compare against `master` for final regression review.

## Phase 1 — generation and QR encoder

- Add browser `generateWallet({ random })`, with secure Web Crypto default randomness, 32-byte scalar rejection/redraw, compressed mainnet derivation, WIF self-check, and `finally` buffer wiping. Expose no private scalar or hex.
- Test fixed scalars against Node crypto plus canonical server/CLI encodings, invalid draws, unavailable secure randomness, self-check failure, and buffer cleanup.
- Vendor an immutable official MIT `qrcode-generator` release with LICENSE and source/archive/file integrity notes. Add encoder→vendored-jsQR address/WIF round trips in `tests/wallet-print-sheets.test.js` so the full requested gate exists from phase 1 onward.

## Phase 2 — generated assignment rows

- Extend the existing bulk dialog with generated mode. Load active students and current addresses; honor the current section and continue labels after the highest class-wide held `Wallet #n`.
- Generate the complete batch before offering it. Default all eligible students selected, allow deselection, force custody both in the UI and submission logic, and reuse address→custody submission/retry.
- Disable generation with an explanatory message when secure randomness/digest is unavailable. Warn on closing/navigating with unsaved generated keys; clear each successful key immediately and all remaining keys on close or batch failure.
- Test G1–G4, section/label scope, retries, all-or-nothing generation, deselection, and cleanup without storage writes.

## Phase 3 — audited bulk export

- Add teacher-gated `GET /class/wallet-custody/export?confirm=1[&section]` using existing database methods. Probe metadata even for empty rosters so missing migration yields 503.
- Decrypt and rederive each held wallet separately; audit the exact ciphertext/address snapshot through the existing RPC before including plaintext. Omit individual corrupt/changed/unaudited wallets with sanitized `skipped` reasons. Missing provisioning remains 503.
- Return only required public identity/section metadata and the explicitly requested WIF. Preserve no-store headers and sanitized errors; never log keys.
- Add E1 authorization, confirmation, provisioning, scoped identity, audit count, mismatch/concurrent-change/failure tests. Keep existing reveal/store and payout outcomes green.

## Phase 4 — browser print/reprint

- Add a shared offline renderer with cover page for batches and one letter-size page per wallet, public and WIF QR/text, name/section/label, and the Node renderer's warning wording. Single reprints have one wallet page and no cover.
- Add typed PRINT confirmation displaying held count and section; pre-open a print window from the click before asynchronous reveal to avoid popup blocking. Export only after confirmation, render, print, and release response/key references. Closing the print window clears its document; no storage/server files.
- Add per-student Reprint using the existing single audited reveal, replace the Node command hint, and load the encoder/renderer only in the teacher dashboard.
- Test E2 page/secret isolation, escaping, real round-trip decoding of both rendered QR codes, popup/print cleanup, bulk confirmation and single reveal integration.

## Validation and delivery

Before each phase commit:

`npx vitest run tests/doge-keys.test.js tests/teacher-wallet-loading.test.js tests/wallet-qr-scanner.test.js tests/wallet-print-sheets.test.js tests/doge-wallet-gen.test.js`

`cd roster-server; npx vitest run`

Review staged scope with GitNexus and git diff; commit only phase files. Record commit hashes and passed/skipped counts below as work completes. Final report includes any verification limitations. No deployment, real key operations, or push.

## Results

Phase 1: browser/tool gate 78 passed; server gate 1,612 passed, 3 skipped (82 files). GitNexus staged scope: 7 intended files, low risk; new generation and vendor symbols are not yet in the index.

Phase 1 commit: `f3829e2`.

Phase 2: browser/tool gate 89 passed; server gate 1,612 passed, 3 skipped (82 files). Upstream impacts were low; staged change detection reports medium aggregate risk confined to two existing bulk-dialog flows. Generated mode forces custody, honors section selection, retains failed keys for retry, and wipes successful/unused keys. Secure generation checks both randomness and digest availability.

Phase 2 commit: `992db61`.

Phase 3 scope clarification from review: “every held key” includes archived students. Export uses the existing roster helper's archived-inclusive option; metadata adds an opt-in `includeArchived=1` query while ordinary badges keep their prior scope. Generation requests this metadata for collision-free class-wide label continuation. No new database methods or migration are needed.

Phase 3: browser/tool gate 89 passed; server gate 1,640 passed, 3 skipped (82 files), including 51 custody tests. Individual upstream impacts are low. Staged detection reports high aggregate risk through 11 existing custody mount/auth/crypto flows and 2 bulk-dialog flows; reviewed all affected paths and confirmed no payout, crypto helper, migration, or student-route edits. Full conservation/payout suites passed.

Phase 3 commit: `85a815b`.

Phase 4: browser/tool gate 113 passed; server gate 1,640 passed, 3 skipped (82 files). Renderer tests decode the actual emitted address/WIF QR SVGs with jsQR and verify page isolation and cleanup. Headless Chrome PDF smoke: cover plus two wallets produces 3 letter pages; a single reprint produces 1 letter page. Final build notes are in `WALLET_GENERATE_EXPORT_BUILD.md`.

Final full GitNexus refresh succeeded after an incremental refresh exited without diagnostics. Staged phase 4 and `compare master` each show 7 intended files with medium aggregate risk. Full-task comparison against `f3829e2^` shows the reviewed custody paths and concurrent, separately committed documentation work; wallet commits include only their explicitly staged files. The renderer's inferred `PrintReady` graph paths were checked against its actual browser `Window.print()` call. PDF text also confirmed per-page WIF isolation, and both QR codes decoded from the PDF raster at 144 DPI. No deployment or push was performed.
