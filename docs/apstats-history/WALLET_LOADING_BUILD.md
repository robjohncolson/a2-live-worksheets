# Wallet loading implementation

Implemented the teacher dashboard CSV loader, camera address/WIF scan, encrypted custody, audited single-key reveal, and offline paper-wallet reprint. No deployment, database migration, environment configuration, or real wallet assignment was performed.

## Setup (user-run)

1. Apply `roster-server/migrations/0035_wallet_custody.sql` to the intended database. It is additive and idempotent; it also clears custody when an account's address changes.
2. Configure a separate, randomly generated `WALLET_KEY_SECRET` of at least 32 UTF-8 bytes in the server environment. Back it up in the teacher's password manager. Keep it stable: changing it makes existing held keys unreadable. This is independent of password encryption; v1 has no key rotation tool.
3. Use the configured `TEACHER_KEY` or a verified teacher session. Custody uses the existing strict payout authorization gate and does not accept the legacy public teacher-secret fallback.
4. Deploy the server and static dashboard together when ready. Before migration, custody endpoints return 503. Missing or short encryption configuration makes store/reveal return `wallet custody key not configured`. Address-only loading remains available.

## Use

In Reward Disbursement, choose **Load wallets**, paste or select the generator's `label,address,wif,privHex` CSV, and review assignments. Only active students without an address are assigned; addresses held by archived students remain reserved. WIF/address validation happens before submission. Custody defaults on. Nothing is written until Submit. Failed custody rows can be retried without resaving successful addresses.

**Scan** reads the address QR, then optionally its matching WIF QR. Review the student and address and press Save. Camera access requires HTTPS or localhost. **Reveal** requires typing `REVEAL`; the server records a `key_reveal` ledger event before returning the key. Closing the dialog clears its key fields.

Reprint one existing mainnet wallet locally:

```text
node tools/doge-wallet-gen.mjs --reprint --wif <WIF> --label "Wallet #17" --out sheet.html
```

This derives the existing address and renders one sheet; it generates no new key. The generator's existing KEYS CSV remains the cold backup. There is no export-all endpoint or student custody UI.

## Validation and implementation notes

- Full server suite: 82 files, 1,612 passed and 3 skipped. Custody tests cover authorization, mismatch rejection, missing configuration/schema, audit failure, ciphertext exclusion, and sanitized errors. Existing payout/conservation suites pass.
- Browser/tool suites: 83 passed across six files, including the final 32-test client/scanner run. They cover CSV review and retries, typed reveal, camera lifecycle, real QR decoding, WIF vectors and reprint behavior.
- Server typecheck still reports pre-existing errors in `grade.js` and `lesson-grade.js`; no changed wallet file appears in those diagnostics.
- Student/public account queries select an explicit safe column list. Custody responses disable caching. Custody writes and reveal auditing compare the current address atomically in database functions.
- The canonical Node key decoder lives under `roster-server/lib/` so a server-only deployment includes it; `tools/lib/doge-keys.mjs` re-exports it. The browser verifier has parity tests and no key generation API.
- jsQR is not available from cdnjs (the specified URL/package returned 404). The exact official jsQR 1.4.0 npm release is vendored locally with license and integrity provenance in `vendor/jsqr/README.md`; no third-party runtime script request receives camera access.
- Existing address writes, payout seal/complete behavior, grading and self-custody feature flags remain unchanged.
