# Task: Student Wallet Onboarding — opt-in browser-side BIP-39, address-only upload

You are working on the AP Stats platform. Implement
**STUDENT_WALLET_ONBOARDING_SPEC.md** (repo root) — read it in full first; it
is the contract and this prompt only sequences it.

**THIS TASK IS KEY-ADJACENT.** The one immovable rule (spec header + invariant
W1): no private key or seed phrase may ever reach roster-server, Supabase, any
log, `localStorage`/IndexedDB/offline queue, or any fetch body. The ONLY thing
that leaves the browser is a derived mainnet address. Two adversarial reviews
are mandatory before this is considered done.

## Files you MUST read first

1. `STUDENT_WALLET_ONBOARDING_SPEC.md` — all of it; §6 invariants W1–W6 each
   become tests.
2. `tools/doge-wallet-gen.mjs` — the existing offline generator: its secp256k1
   + base58check implementation and startup self-test are the reference for
   the address-derivation math (`js/student-wallet.js` must produce identical
   addresses for identical keys; port, don't reinvent). Note its header
   doctrine — this spec extends it, never weakens it.
3. `roster-server/doge-wallet.js:481-497` (`POST /wallet/address` — the
   validation + narrow-update path your approve endpoint must reuse),
   `:26-38` (`isDogeMissing` 503 pattern for pre-migration), `DOGE_MAIN_RE`.
4. `roster-server/migrations/0032_payout_batch.sql` — house style AND the
   reservation machinery your approve endpoint must respect (409 while the
   student is in a pending/claimed batch; check `payout_batch` status + plan
   membership, don't rely on the trigger alone for the UX).
5. `ap_stats_roadmap_square_mode.html` ~15433-16247 — `_walletDogePanel`,
   `_dogeWalletRender`, `_walletLedgerDetail`: where the "Create my own
   wallet" action and pending state render. Match the existing `.s7btn` /
   drawer idioms; textContent rendering only.
6. `teacher-dashboard.html:522-534, 1155-1340` — the Reward panel; the
   proposals strip lands here, copying the existing render style.
7. `roster-server/tests/doge-wallet.test.js` — fake-db shape for your
   `wallet-proposals.test.js`.

## Steps (= spec §7 phases; tests green after each)

1. **`js/student-wallet.js`** — self-contained (embedded English BIP-39
   wordlist, no CDN, no build step): entropy via `crypto.getRandomValues`
   (hard-fail without it), 12-word phrase, BIP44 `m/44'/3'/0'/0/0` (coin type
   3), mainnet `D…` address. Export pure functions; add
   `tests/student-wallet.test.js` pinning published BIP-39/BIP44 dogecoin test
   vectors AND cross-checking against `tools/doge-wallet-gen.mjs`'s derivation
   on a fixed key.
2. **Server** — migration `0033_wallet_address_proposals.sql` (additive,
   idempotent, USER-RUN header, 503-degrade note) + the four endpoints from
   spec §4 inside `mountDogeWallet`. Proposals are inert everywhere: prove W2
   in tests. Approve refuses during an active batch (W3). Feature flag
   `STUDENT_WALLET_OPTIN` gates ONLY the propose endpoint (teacher surfaces
   always work, so the teacher can see/clear stragglers).
3. **Desk ceremony** — spec §2 exactly: typed `I UNDERSTAND` gate → reveal
   (copy disabled, print hint) → 3-word write-down check → seal (POST address,
   then overwrite variables and remove DOM nodes) → pending state in the
   drawer. Hidden when an approved address exists, when archived, or when the
   flag is off.
4. **Dashboard** — proposals strip with NEW vs CHANGE badges, Approve/Reject,
   masked addresses, last-4 read-aloud hint text.

## Constraints

- Owned paths: `js/student-wallet.js`,
  `roster-server/migrations/0033_wallet_address_proposals.sql`,
  `roster-server/doge-wallet.js`, `roster-server/tests/wallet-proposals.test.js`,
  `tests/student-wallet.test.js`, `ap_stats_roadmap_square_mode.html`,
  `teacher-dashboard.html`, plus regenerating the matching `gitnexus-shadow/`
  mirrors the freshness test requires.
- DO NOT touch: `tools/doge-wallet-gen.mjs`, the payout rail
  (`payout.js`/0032), `doge-econ.js`, `doge-chain.js` internals, any existing
  migration, `teacher-auth.js`.
- Migrations are USER-RUN (pasted into Supabase by hand).
- Use the Edit tool per change — do NOT rewrite whole files. GitNexus rules
  (AGENTS.md): `impact` before editing any function, `detect_changes()` before
  committing. Do not commit or push — leave the tree for review.

## Verification (all must pass)

- `cd roster-server && npx vitest run` — full suite, conservation layers and
  golden master untouched.
- Root: new suites + `tests/gitnexus-shadow.test.js` + the dashboard/desk
  structure suites.
- In your summary: the W1 evidence (grep results proving no key/phrase in any
  fetch/storage/log path) and the W3/W2 test names.

## Expected output

A summary listing files changed per phase, test names, W1/W2/W3 evidence, and
the manual steps left to the teacher: run migration 0033, decide when to flip
`STUDENT_WALLET_OPTIN`, and (once, before flipping it) confirm school policy
is comfortable with opt-in student self-custody.
