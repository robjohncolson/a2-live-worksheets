# STUDENT WALLET ONBOARDING SPEC — paper wallets stay default, self-custody becomes an opt-in

How a student comes to own a Dogecoin address. Today there is exactly one path:
the teacher runs the offline paper-wallet generator, hands the student a sheet,
and types the address into the dashboard. This spec keeps that as the default
and adds an OPT-IN second path: the student generates a BIP-39 wallet **in
their own browser**, sees the phrase exactly once behind a "we can never
recover this" ceremony, and only the derived ADDRESS leaves the device — into
a pending queue the teacher approves before it can ever be paid.

> **Status:** proposed. **Owner:** teacher. **Workflow:** brainstorm (2026-09-02) → spec → implement (Codex).
> Key-adjacent. The immovable rule is inherited from the payout rail (P8):
> **no private key or seed phrase ever touches roster-server, Supabase, any log
> line, or any storage that outlives the reveal ceremony.** Two adversarial
> reviews mandatory. The teacher's decision from the brainstorm: irrecoverable
> self-custody must never be the ONLY path for a class of minors.

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| Offline paper-wallet generator (secp256k1, base58check self-test, "RUN OFFLINE" banner, `--testnet`) | `tools/doge-wallet-gen.mjs` + `tests/doge-wallet-gen.test.js` | THE default path — unchanged; its address-only doctrine is this spec's law |
| Teacher-only address registration | `POST /wallet/address` (`roster-server/doge-wallet.js:481-497`), `_rewardSetAddress` (`teacher-dashboard.html:1207`) | stays the approval-side write; self-custody path feeds it a queue instead of a `prompt()` |
| Mainnet address validation (`DOGE_MAIN_RE`) | `roster-server/doge-wallet.js` | validate proposed addresses server-side too |
| Watch-only chain reads | `roster-server/doge-chain.js`; Desk `⛓ on-chain` line | the student's proof their wallet is real, no key needed |
| Payout seal checks `doge_address` matches the frozen plan under row lock | `payout_create` in `migrations/0032_payout_batch.sql` | pending/unapproved addresses can NEVER enter a batch — only `doge_address` is payable |
| Desk wallet panel (`_walletDogePanel`, `_dogeWalletRender`) | `ap_stats_roadmap_square_mode.html` ~15433-16247 | hosts the "Create my own wallet" opt-in entry |
| Migration house style; latest is `0032` | `roster-server/migrations/` | new migration is `0033_wallet_address_proposals.sql` |
| `requireTeacher` / student Bearer tokens | `roster-server/teacher-auth.js`, `token.js` | auth for approve/propose respectively |

## 1. Goals / Non-goals

Goals:
1. **Paper wallets remain the default** and the recommended path (teacher keeps
   a sealed backup envelope per student — loss recovery for fourteen-year-olds).
2. Opt-in self-custody: browser-side BIP-39 generation, reveal-once, address-only
   upload. Real ownership, real consequences, clearly labelled as irrecoverable.
3. Teacher stays in the loop: a student-proposed address is **pending** until
   the teacher approves it; only approved addresses are payable or chain-watched.
4. Address-change hygiene: any change to an already-approved address requires a
   fresh teacher approval (the "my address changed, resend!" scam is dead on
   arrival), and is blocked outright while that student is in an active payout batch
   (the 0032 reservation trigger already fences the wallet row; the proposal flow
   must refuse at the approve step too).

Non-goals (v1):
- **No key generation, storage, custody, or recovery server-side — ever.** Also
  no key material in `localStorage`, IndexedDB, or the offline queue; RAM only,
  wiped after the ceremony.
- No in-app signing or spending. The Desk stays watch-only.
- No forced migration: students with paper wallets are untouched.
- No re-reveal. Lost phrase = lost coins; the UI says so before, during, and after.

## 2. The ceremony (student, Desk)

A new "🔐 Create my own wallet (advanced)" action inside the wallet Details
drawer, visible only when the student has no approved address:

1. **Warning gate** — plain-language screen: "Your teacher cannot recover this.
   The school cannot recover this. Nobody can. If you lose the phrase, any DOGE
   at this address is gone forever. A paper wallet from your teacher is the
   safe option." Student must type `I UNDERSTAND`.
2. **Generate** — 128-bit entropy from `crypto.getRandomValues` → 12-word
   BIP-39 phrase → BIP44 derivation (coin type 3, `m/44'/3'/0'/0/0`) → mainnet
   `D…` address. All in a new self-contained `js/student-wallet.js` (embedded
   wordlist, no CDN, no build step — matches repo doctrine). Nothing rendered
   yet is persisted anywhere.
3. **Reveal once** — the 12 words, numbered, with copy disabled and a print
   hint. Then a **write-down check**: the student re-enters 3 randomly chosen
   words. Fail → back to the reveal (same phrase, same session only).
4. **Seal** — on success: POST the derived address to `/wallet/address/propose`
   (student token), then overwrite the phrase/key variables and drop every DOM
   node that held them. Refresh/navigation before sealing discards everything
   (nothing was stored); the student simply starts over with a new phrase.
5. **Pending state** — the drawer shows "⏳ address awaiting teacher approval:
   D…xxxx (first+last 4)". The student verifies out loud with the teacher.

## 3. Data model — migration `0033_wallet_address_proposals.sql`

Additive, idempotent, USER-RUN. One column pair on `doge_account`:
`proposed_address text`, `proposed_at timestamptz`. No new table — a proposal
is at most one per student, latest-wins, and is NOT the payable address.
`doge_address` (approved) is untouched by proposals. Until the migration runs,
the propose endpoint 503s (mirror `isDogeMissing`).

## 4. Server endpoints (extend `mountDogeWallet` in `roster-server/doge-wallet.js`)

| Endpoint | Auth | Effect |
|---|---|---|
| `POST /wallet/address/propose` | student token | body `{address}`; `DOGE_MAIN_RE` validate; write `proposed_address/_at` on the student's OWN row (narrow update). Refuse (409) if it equals the current approved address. |
| `GET /class/wallet-proposals` | teacher | list pending proposals: student, masked address, proposed_at, plus whether the student already has an approved address (i.e. this is a CHANGE — render louder). |
| `POST /wallet/address/approve` | teacher | body `{studentId}`; copy `proposed_address` → `doge_address`, clear the proposal. Refuse (409) while the student appears in a pending/claimed payout batch. Internally reuses the existing address-set path so validation/audit stay single-sourced. |
| `POST /wallet/address/reject` | teacher | clear the proposal (with the reason returned to the student's drawer as a plain string). |

The existing teacher-only `POST /wallet/address` remains for the paper-wallet
default. Payouts, chain reads, and everything else keep reading `doge_address`
only — a pending proposal is inert everywhere by construction.

## 5. Teacher UX

Reward Disbursement panel gains a small "📥 proposed addresses (N)" strip when
proposals exist: student · masked address · NEW/CHANGE badge · Approve /
Reject. The approval habit to teach in-class: the student reads their last 4
characters aloud from their own screen before you click Approve.

## 6. Invariants (each maps to a test)

- W1: grep-level — `student-wallet.js` contains no network call carrying
  anything but the derived address; no key/phrase string ever appears in a
  fetch body, storage API call, or console output.
- W2: a proposed address never appears in `/class/wallets` deposit math,
  `payout/plan`, or chain fetches — only `doge_address` does.
- W3: approve while the student is in an active batch → 409, wallet row unchanged.
- W4: propose → approve → the address behaves exactly like a teacher-entered one
  (payable, chain-watched); reject → drawer shows the reason, row unchanged.
- W5: known BIP-39 test vectors (phrase → address) pin the derivation, and the
  generator refuses to run without `crypto.getRandomValues`.
- W6: students with an approved address don't see the create action; archived
  students can't propose (composes with roster archive).

## 7. Phases

| Phase | Work |
|---|---|
| 1 — crypto module | `js/student-wallet.js` + vector tests (pure, no UI) |
| 2 — server | migration 0033 + the four endpoints + tests |
| 3 — Desk ceremony | warning gate → reveal → check → seal → pending state |
| 4 — dashboard | proposals strip + approve/reject |

## 8. Open decisions (defaults chosen; change if you want)

- 12 words vs 24 **[default: 12 — dollars-scale funds; shorter is likelier to be written down correctly]**.
- Print-a-backup button on the reveal screen **[default: yes — printing is the student's own custody choice; it never touches the server]**.
- Age/permission gate before the ceremony **[default: none beyond the typed warning — teacher judgement + school policy check happens once, before the feature flips on at all]**.
- Feature flag **[default: `STUDENT_WALLET_OPTIN` off until you say go]**.

## 9. Files touched (estimate)

**New:** `js/student-wallet.js`, `roster-server/migrations/0033_wallet_address_proposals.sql`, `tests/student-wallet.test.js`, `roster-server/tests/wallet-proposals.test.js`.
**Edited:** `roster-server/doge-wallet.js`, `ap_stats_roadmap_square_mode.html` (wallet drawer), `teacher-dashboard.html` (proposals strip).
**Unchanged:** `tools/doge-wallet-gen.mjs`, the payout rail, all wallet SQL except 0033, receipts.

### TL;DR
Paper wallets stay the default with the teacher's sealed-envelope recovery; a
flagged opt-in lets a student generate a BIP-39 wallet entirely in their
browser, prove they wrote the phrase down, and upload ONLY the address into a
pending queue the teacher approves. Keys never exist server-side, pending
addresses can't be paid, and approved addresses behave exactly like today's.
