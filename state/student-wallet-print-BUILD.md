# Student wallet printing — 2026-09-05

## Request and policy

The teacher requested that students have the printable wallet already available
in the teacher dashboard. This explicitly extends the earlier teacher-only
reveal policy: an active, signed-in student may print **their own** held wallet
after confirming. Teacher class export and management remain teacher-only.
The key remains encrypted at rest; no custody migration or payout change is needed.

## Student workflow

The Desk's wallet already displays candy, DOGE saved in the app, deposited DOGE,
and confirmed chain balance with an explorer link under Details. It now offers
**Print my wallet** beside the DOGE heading whenever the student has an assigned
address, including before the first deposit.

1. Open the wallet and choose **Print my wallet**.
2. Read the private-key warning and type `PRINT`.
3. Choose **Print / Save PDF**. A new window opens with one wallet page: name,
   section, label, public address and QR, private key and QR, and handling warning.
4. Print or save a PDF, then choose **Done** in either window to clear the sheet.

The sheet remains available while the browser print dialog runs, including
browsers whose `print()` returns or `afterprint` fires early. Closing the sheet,
closing/minimizing/rerendering the wallet, signing out, changing identity, expiry,
or leaving the page clears the transient print session. Students with an address
but no held key receive a message directing them to their teacher. A blocked
popup stops the request before a key is fetched.

## Request and custody boundary

`POST /wallet/custody/print` accepts only `{ "confirm": true }`. A verified Bearer
session determines the student; body and query identity selectors are rejected.
Teacher, archived, deleted, invalid, and expired sessions cannot use this route.
Both successful and failed responses use `Cache-Control: no-store` and
`Pragma: no-cache`; POST also bypasses the existing service-worker GET cache.

The server checks ownership, decrypts and re-derives the address, then requires
the existing row-locked audit against the exact address/ciphertext snapshot.
It rechecks active authorization after the audit before returning one wallet.
Five attempts per verified student per minute bound audit writes. A denied race
can leave a zero-value audit of the attempted reveal, but returns no key.

Ordinary student/class wallet metadata still excludes private keys. Browser code
checks student identity, token expiry, and the displayed address before rendering
and before the scheduled print call. Response WIF properties are cleared after
rendering; only the temporary print window contains private-key text or QR.
Nothing is written to localStorage, IndexedDB, URLs, logs, or server files. As in
the teacher renderer, JavaScript string cleanup releases references; immutable
strings cannot be physically overwritten. An explicitly saved PDF is the
student's private copy and must be kept safe.

## Deployment and validation

This change includes `roster-server/`: pushing to master will deploy Railway as
well as publish the student page on GitHub Pages. Deploy the endpoint and static
assets together. The existing migration 0035 and `WALLET_KEY_SECRET` are required;
no new migration, setting, node information, or funding action is needed.

Validation used synthetic wallets only. No real student key was retrieved during
implementation.

- Browser/tool regressions: **288 passed across 14 files**, including 55 student
  print tests, 26 shared print tests, teacher generation/export, QR decoding,
  wallet rendering, onboarding, ledger reconciliation, and wallet cryptography.
- Full native Windows roster-server suite: **1,688 passed, 3 skipped across 83
  files**, including 48 new student print endpoint tests and the existing 51
  custody tests. Command: `npm test -- --maxWorkers=4 --minWorkers=1` from
  `roster-server`. The initial default-concurrency run hit a golden-master setup
  timeout during concurrent indexing; the final full run passed without changing
  tests or timeouts.
- Actual Chrome PDF: one US letter page (612 × 792 points), student warning and
  address/private-key text present, Done control absent from print. Both QR codes
  decoded from the rendered PDF at 144 DPI; visual inspection found no clipping.
  This used deterministic scalar 7. No physical printer was tested.
- Two independent adversarial reviews cleared the final implementation. Findings
  fixed before clearance: recheck authorization after audit and roster awaits,
  cancel on client token expiry, handle cancelled print scheduling, and retain
  the sheet through asynchronous browser print events until explicit close.
- `git diff --check` passed. GitNexus marked the existing wallet lifecycle cleanup
  HIGH (six direct callers during rendering, onboarding, closing, and minimizing);
  this was reported before editing, and the actual Desk lifecycle paths are
  covered by behavioral tests. Renderer and custody mount impact checks were LOW.
- Final GitNexus refresh succeeded with `--workers 1` after the parallel worker
  startup failure. Staged and `compare master` checks cover the intended 11 files;
  aggregate risk is HIGH across 13 inferred custody/auth and print-cleanup flows.
  Context review confirmed custody callers and print cleanup's local callees;
  inferred filesystem tails do not correspond to the browser renderer's calls.
  Generated shadow, skill, and index-summary rewrites were excluded from the commit.

The 14-file frontend command is:

```powershell
node node_modules/vitest/vitest.mjs run tests/doge-keys.test.js tests/teacher-wallet-loading.test.js tests/wallet-qr-scanner.test.js tests/wallet-print-sheets.test.js tests/doge-wallet-gen.test.js tests/student-wallet-print.test.js tests/desk-doge-wallet.test.js tests/desk-wallet-render.test.js tests/desk-student-wallet-onboarding.test.js tests/desk-wallet-sessions-only.test.js tests/desk-ledger-reconcile.test.js tests/wallet-logic.test.js tests/doge-wallet-logic.test.js tests/student-wallet.test.js
```

Local-only evidence: `%TEMP%/student-wallet-print-roster-final-tests.log`,
`%TEMP%/student-wallet-print-smoke-BCBCZO/student.pdf`, and
`%TEMP%/student-wallet-print-smoke-BCBCZO/student-render.png`.

The repository's `.git/hooks/pre-push` requires a fresh Fable-created
`.git/PUSH_APPROVED` sentinel. The earlier payout push consumed its approval;
this student-visible server change needs its own review packet. No approval
sentinel was created, no push performed, and no production configuration or
funding was changed during this build.

Branch context for Fable: the pre-existing local calendar-spec commit `9101181`
was already ahead of `origin/master`. The student-wallet commit contains only
the 11 feature, test, and documentation files listed in its diff; it does not
include the unrelated password script or Schoology logs in the workspace.
