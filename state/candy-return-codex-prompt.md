# Task: Candy Return — "↩ took back…" as a second monotonic counter

You are working on the AP Stats platform. Implement **CANDY_RETURN_SPEC.md**
(repo root) — read it in full first; it is the contract and this prompt only
sequences it.

**THIS TOUCHES THE WALLET SQL AND THE CONSERVATION HARNESS** — the most
guarded surface in the repo. Two adversarial reviews are mandatory. The design
rule: do NOT weaken invariant I5 (`candy_given` never decreases). A return is
a NEW monotonic counter `candy_returned` (≤ `candy_given`, enforced under the
row lock), a compensating `doge_ledger` row `kind='give_back'`, and a `+
returned` term in the owed identity and in `doge_mark`'s give-cap. The harness
learns the op in the SAME change — a wallet op the conservation suites don't
model does not ship.

## Files you MUST read first

1. `CANDY_RETURN_SPEC.md` — all of it; §2 is the entire accounting design and
   §5's R1–R6 each become tests.
2. `roster-server/migrations/0025_review_marks.sql` — `doge_mark`'s exact
   shape (FOR UPDATE, clamp, ledger insert) — `doge_give_back` copies it; and
   the house pattern for growing the `doge_ledger.kind` check constraint
   (0021→0025 re-create it each time; yours is `0034_candy_return.sql` and
   adds `give_back`). Also update `doge_mark`'s `v_cap` to `+ candy_returned`
   by re-creating it in 0034 (the established pattern).
3. `roster-server/doge-wallet.js:185-230` (`deriveBalances` — the identity),
   `:~500` (`markEndpoint` — the endpoint shape), the 0033-style specific
   missing-migration matcher (`isWalletProposalMissing`) as the model for a
   `candy_returned`-specific 503.
4. `roster-server/tests/fixtures/wallet-world.js` (`applyOp` :125,
   `checkStateInvariants` :240, `checkDeltaInvariants` :269) and
   `wallet-conservation.test.js` — Layer A gets op `give_back` + extended
   invariants + fuzz coverage.
5. `roster-server/tests/fixtures/pg-wallet.js` + `wallet-conservation-pg.test.js`
   — Layer B runs your 0034 SQL in pglite and differentials JS vs SQL.
6. `roster-server/tools/wallet-model-emit-cases.mjs` + `formal/wallet-model/`
   — Layer C: v1 EXCLUDES give_back (stakes precedent); ensure the emitter
   never emits give_back cases and leave a dated comment in `wallet-model.rkt`.
7. `js/wallet_logic.js` — the client identity mirror; update in lockstep.
8. `teacher-dashboard.html:~1730-1850` (commit 8593c20: `_rewardMark`,
   `_rewardMarkPartial`, the give cell with `✓ gave` + `some…`) — `↩ took
   back…` sits beside them, prompt-validated like `some…`, capped at
   still-out (given − returned), and the `✓ N given` confirmation becomes
   `✓ N given · M returned` when M > 0.
9. `ap_stats_roadmap_square_mode.html` `_walletLedgerDetail` (~16200) — the
   `In hand` row becomes given − returned; add `Handed back` when > 0.

## Steps (= spec §6 phases; tests green after each)

1. **SQL + harness first**: write 0034 (column, `doge_give_back`, kind check,
   `doge_mark` cap re-create; additive/idempotent/USER-RUN header/503 note);
   extend wallet-world with the op + R1/R2 invariants; extend the pglite
   differential. All three conservation suites + stakes suite green.
2. **Server**: `db.dogeGiveBack` (rpc call), `POST /wallet/mark-returned`
   (teacher-gated, uuid guard, amount > 0, specific 503 pre-0034),
   `deriveBalances` identity + `candyReturned` field.
   `roster-server/tests/candy-return.test.js` covers R2–R6.
3. **Dashboard**: the button + validation + confirmations; regenerate shadow
   mirrors (`node scripts/gitnexus-shadow.mjs`).
4. **Desk + mirror**: `wallet_logic.js` identity, In hand / Handed back rows.

## Constraints

- Owned paths: `roster-server/migrations/0034_candy_return.sql`,
  `roster-server/doge-wallet.js`, `roster-server/db.js`,
  `roster-server/tests/candy-return.test.js`,
  `roster-server/tests/fixtures/wallet-world.js`,
  `roster-server/tests/fixtures/pg-wallet.js`,
  `roster-server/tests/wallet-conservation.test.js`,
  `roster-server/tests/wallet-conservation-pg.test.js`,
  `roster-server/tools/wallet-model-emit-cases.mjs`,
  `formal/wallet-model/wallet-model.rkt` (comment only),
  `js/wallet_logic.js`, `teacher-dashboard.html`,
  `ap_stats_roadmap_square_mode.html`, `gitnexus-shadow/*` regeneration.
- DO NOT touch: the payout rail (`payout.js`, 0032, 0033), `doge_sent`
  anywhere, receipts, `teacher-auth.js`, `doge-econ.js` constants.
- Migrations are USER-RUN. Use the Edit tool per change. GitNexus rules
  (AGENTS.md): `impact` before editing, `detect_changes()` before finishing.
  Do not commit or push — leave the tree for review.

## Verification (all must pass)

- `cd roster-server && npx vitest run` — FULL suite; conservation Layers A+B
  with the new op, stakes suite, golden master, payout suites all green.
- Root: dashboard/Desk structure + shadow suites, wallet_logic tests.
- In your summary: the R3 round-trip trace (give 5 → return 2 → give 1, with
  every intermediate owed/cap/ledger row), and explicit confirmation that
  `candy_given` is never decremented anywhere in the diff.

## Expected output

A summary listing files changed per phase, test names, the R3 trace, the
never-decrements confirmation, and the one manual step for the teacher: run
migration 0034 in Supabase (endpoint 503s until then).
