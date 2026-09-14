# Wallet generation and printable export

Implemented phases 1–4 of `WALLET_GENERATE_EXPORT_SPEC.md` on top of the shipped teacher custody layer.

## Teacher workflow

- **Generate wallets** opens reviewed assignments for active students without addresses in the selected section. Labels continue after the highest held `Wallet #n` across all sections, including archived students. Untick students to skip them. Generation requires HTTPS or localhost with Web Crypto randomness and SHA-256; otherwise the button is disabled with a visible explanation.
- Generated wallets always keep their private keys in teacher custody. Submit uses the existing address write followed by custody write. Failed custody rows retain their keys for retry without rewriting an already-saved address. Closing with unsaved keys warns before discarding them; successful and unused keys are cleared when the selected batch finishes.
- **Print wallet sheets** shows the held count and section and requires typing `PRINT`. It includes held keys for archived students in scope. A blocked popup stops the operation before any reveal. Each returned key is checked and audited through the existing row-locked RPC. Corrupt, changed, or unauditable individual wallets are omitted and reported as skipped.
- The print window has a dated cover and one letter-size page per wallet, including student name, section, label, address text/QR, private-key text/QR, and handling warnings. Use the browser's Print → Save as PDF. Close the print window when finished.
- **Reprint** in an address cell uses one audited reveal and prints one wallet page without a cover. The existing Reveal dialog also prints its already-revealed key without making another reveal request.

## Custody and deployment

No new migration or environment setting is needed. The existing migration 0035 and `WALLET_KEY_SECRET` remain required. Deploy the server and teacher dashboard/assets together: generated label allocation and print counts use the new `includeArchived=1` metadata option. No deployment, push, environment change, or real-wallet operation was performed during this build.

Private keys are generated with secure browser randomness, checked against the existing WIF decoder, and posted only to `/wallet/custody`. Export is teacher-gated and no-store. Each export audits the exact address/ciphertext snapshot before returning its WIF. Missing custody provisioning returns 503. No payout, candy, grading, student custody proposal, or `STUDENT_WALLET_OPTIN` logic changed.

Byte buffers are wiped in `finally`; generated and returned WIF properties are cleared after their last use. JavaScript strings cannot be overwritten in memory, so cleanup releases references and removes the relevant DOM. The renderer clears its input immediately after rendering and clears the print document on close/navigation. No localStorage, IndexedDB, server file, or browser download is used by the implementation; saving a PDF is the teacher's explicit browser action.

QR encoding uses the pinned local MIT `qrcode-generator` 2.0.4 distribution. Source, archive integrity, and file hashes are recorded in `vendor/qrcode-generator/README.md`. The existing vendored jsQR decoder verifies printed address/WIF QR round trips in tests.

## Verification

| Phase | Browser/tool tests passed | Server tests passed | Server skipped |
| --- | ---: | ---: | ---: |
| 1 | 78 | 1,612 | 3 |
| 2 | 89 | 1,612 | 3 |
| 3 | 89 | 1,640 | 3 |
| 4 | 113 | 1,640 | 3 |

Every phase ran the requested five browser/tool files and the full server suite before its local commit. Final custody suite: 51 tests. Tests use public deterministic scalars, never real wallet backups. Coverage includes Node/browser parity, scalar redraw/self-check/wiping, forced custody, assignment retries, archived scope, export authorization/audit failures, popup ordering, response cleanup, actual rendered QR decoding, and per-page key isolation.

Headless Chrome additionally produced a three-page PDF for a cover plus two public-fixture wallets, and a one-page reprint PDF; all pages were US letter (612 × 792 points). Extracted PDF text verified key/page isolation, and both QR codes decoded from the actual PDF raster at 144 DPI. Visual inspection found no clipping. No physical printer or real student keys were used.

GitNexus upstream checks were low or unknown for newly added, unindexed symbols. The combined custody change reports high aggregate scope through existing authorization/crypto mount flows; these were reviewed and all payout/conservation suites passed. Unrelated workspace files and concurrent documentation commits were excluded from phase staging.
