# Task: DOGE Payout Rail — one-button batch on-chain deposits

You are working on the AP Stats platform. Your job is to implement
**DOGE_PAYOUT_RAIL_SPEC.md** (repo root) — read it in full first; it is the
contract and this prompt only sequences it.

**THIS TASK MOVES REAL MONEY.** The repo's rule (CLAUDE.md) mandates two
adversarial reviews for roster-server changes; wallet writes are protected by a
three-layer conservation harness that MUST stay green. The security model in
spec §2 is non-negotiable: no key material ever touches roster-server, any
browser, or any log line (invariant P8).

## The problem (read this carefully)

Batch on-chain sending already works — but only as a terminal command
(`tools/doge-send.mjs`: plan from `/class/wallets`, one `sendmany` via local
Dogecoin Core, dry-run default, crash journal, then `POST /wallet/mark-sent`
per student). The teacher wants a dashboard button instead. Since keys live
only on the teacher's machine, the button cannot send — it seals a **frozen,
hash-pinned batch** into a new `payout_batch` table; a **polling agent** on the
teacher's machine executes it and reports the txid back. All wallet mutation
goes through the EXISTING monotonic `doge_mark` RPC — the payout module itself
never writes `doge_account` (invariant P1).

## Files you MUST read first

1. `DOGE_PAYOUT_RAIL_SPEC.md` — all of it; §7 invariants P1–P8 each become tests.
2. `tools/doge-send.mjs` + `tests/doge-send.test.js` — the engine you are
   refactoring into `tools/lib/doge-send-core.mjs`. Its dry-run default,
   journal, and injected-CLI test pattern must survive the extraction.
3. `roster-server/doge-wallet.js:500-524` (`markEndpoint` — the ONLY wallet
   write path you may call; note `earnedCandyOf` + `db.dogeMark` shape),
   `:26-38` (`isDogeMissing` 503 pattern — mirror it as `isPayoutMissing`),
   `:112` (`sectionIds`), `:524-563` (`GET /class/wallets` worklist math —
   your plan must reproduce its deposit-ready numbers exactly).
4. `roster-server/doge-econ.js:14-19` (frozen constants; `MIN_MATERIALIZE_DOGE = 5`).
5. `roster-server/teacher-auth.js:24-77` (`getTeacherKey`, `requireTeacher`) —
   extend with `requirePayoutAgent` per spec §4.
6. `roster-server/server.js:999-1194` — the `mountXxx(app, deps)` DI
   convention; `payout.js` mounts the same way, dependency-gated.
7. `roster-server/migrations/0031_frq_tickets.sql` (or any recent migration) —
   house style: additive, idempotent, USER-RUN header, 503-degrade note. Yours
   is `0032_payout_batch.sql` (spec §3 has the exact SQL to start from).
8. `roster-server/tests/fixtures/wallet-world.js` (`applyOp` :125,
   `checkStateInvariants` :240) + `tests/wallet-conservation.test.js` — your
   `payout-conservation.test.js` drives batches through this world.
9. `roster-server/review.js:601-640` + `receipts.js:342-364` — the
   mint-candy-AND-sign-receipt precedent for Phase 5 (`issuePayoutReceipt`).
10. `teacher-dashboard.html:522-534` (Reward panel markup), `:1155-1340` (its
    JS incl. `_rewardMark`), `:484-506` + the `RESTORE` typed-confirm gate
    (`:1942-2010`) — the `PAY` confirm copies it.

## Steps (= spec §8 phases; do them in order, tests green after each)

1. **Refactor**: extract plan/execute/journal from `doge-send.mjs` into
   `tools/lib/doge-send-core.mjs` (pure + injected `runCli`; no `.exe`
   assumption — the binary path is config). `doge-send.mjs` becomes a thin CLI
   wrapper; `tests/doge-send.test.js` passes UNCHANGED, plus new
   `tests/doge-send-core.test.js`.
2. **Server**: write `0032_payout_batch.sql` (spec §3 — including the
   one-active-batch partial unique index and, for Phase 5, the nullable
   `receipt_id`/`receipt_compact` pair on `doge_ledger`). Build
   `roster-server/payout.js` with the §4 endpoint table exactly: plan / batch
   (409 on hash mismatch or active batch) / cancel / next / claim / complete /
   fail / status. `complete` verifies outputs ⊆ frozen plan, then loops the
   `markEndpoint` logic. `requirePayoutAgent` accepts the teacher key OR
   `x-payout-agent-key` === `PAYOUT_AGENT_KEY` (only when that env is set —
   no default). Tests: `payout.test.js` (state machine, auth matrix,
   503-pre-migration, P2–P6) + `payout-conservation.test.js` (wallet-world,
   I1–I9 + P2).
3. **Agent**: `tools/doge-payout-agent.mjs` per spec §5 — poll, claim, verify
   plan hash by recomputation, float check (abort → fail with the exact
   "insufficient float" message), journal intent, ONE `sendmany`, journal
   txid, complete. Crash-recovery matrix per §5.3: txid-without-complete →
   re-post complete; intent-without-txid → verify via Core, else fail. NEVER
   auto-retry a broadcast. Plus `tools/doge-payout-agent.service` (systemd
   user unit, install notes in comments) and `tests/doge-payout-agent.test.js`
   with fake `runCli` + fake server.
4. **Dashboard**: ⚡ Deposit-all button + preview modal (typed `PAY` confirm)
   + 10s status strip per spec §6. Per-student ✓ sent buttons stay.
5. **Receipts** (default in): `issuePayoutReceipt` in `receipts.js`
   (`t:'payout'` payload per spec §8), minted per student inside `complete`,
   persisted to the new `doge_ledger` columns; degrade gracefully when the
   issuer is disabled (return null, don't fail the batch).

## Constraints

- Owned paths: `roster-server/migrations/0032_payout_batch.sql`,
  `roster-server/payout.js`, `roster-server/teacher-auth.js`,
  `roster-server/receipts.js`, `roster-server/server.js` (mount only),
  `roster-server/tests/payout*.test.js`, `tools/doge-send.mjs`,
  `tools/lib/doge-send-core.mjs`, `tools/doge-payout-agent.mjs`,
  `tools/doge-payout-agent.service`, `tests/doge-send-core.test.js`,
  `tests/doge-payout-agent.test.js`, `teacher-dashboard.html`.
- DO NOT touch: any wallet SQL function, `doge-econ.js`, `doge-chain.js`,
  `doge-wallet.js` (you call its logic; if you must share `markEndpoint`
  internals, export a helper — smallest possible diff), the Desk, any student
  surface, any existing migration.
- Migrations are USER-RUN (pasted into Supabase by hand) — never executed by
  code; all `/payout/*` routes 503 until it runs.
- Use the Edit tool per change — do NOT rewrite whole files.
- GitNexus rules (AGENTS.md): `impact` before editing any function,
  `detect_changes()` before committing.
- roster-server auto-deploys on push — do not push until every gate passes.

## Verification (all must pass)

- `cd roster-server && npx vitest run` — full suite, ESPECIALLY
  `wallet-conservation*.test.js` and `wallet-stakes-conservation.test.js`,
  untouched and green (invariant P7).
- `npx vitest run` from root — doge-send suite unchanged + new core/agent tests.
- In your summary: the P1 proof (grep-level evidence that payout.js contains
  zero direct `doge_account` writes) and the replay matrix results (P4).

## Expected output

A summary listing files changed per phase, test names added, the P1/P4
evidence, and what the teacher must do by hand: run migration 0032, set
`PAYOUT_AGENT_KEY` on Railway + agent config, install the systemd unit on the
machine running Dogecoin Core, and fund the sending wallet from cold storage.
