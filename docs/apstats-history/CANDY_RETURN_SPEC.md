# CANDY RETURN SPEC — a kid gives physical candy back, the wallet takes it back

A student who took candy (the teacher clicked ✓ gave / some…) sometimes hands
some of it back. Today there is no way to record that: `candy_given` is
DELIBERATELY monotonic (conservation invariant I5 — never claws back), which is
what makes double-clicks and replays harmless. This spec does NOT weaken I5.
It adds a second monotonic counter, `candy_returned`, that offsets Materialized
in the owed identity — the same additive-counter pattern as `candy_bonus` and
`candy_realized`. The teacher gets a "↩ took back…" action next to the give
buttons; the amount can never exceed what is still out (given − returned).

> **Status:** proposed. **Owner:** teacher. **Workflow:** brainstorm (2026-09-03) → spec → implement (Codex).
> **Wallet-SQL + conservation-harness change — the most guarded surface in the
> repo. Two adversarial reviews mandatory. Every layer of the conservation
> audit that models disbursement must learn the new op or the change does not
> ship.**

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| The 9-number identity + `deriveBalances` | `roster-server/doge-wallet.js:185-230` (`rawBalance = earned + giftedIn − giftedOut − converted − materialized + realized − escrowed + bonus`) | becomes 10-number: `… + returned` |
| `doge_mark` (atomic, FOR UPDATE, monotonic, capped, ledger row) | `0025_review_marks.sql` (orig. 0024) | the shape `doge_give_back` copies exactly |
| `markEndpoint` (`POST /wallet/mark-given|sent`) | `roster-server/doge-wallet.js:~500` | the endpoint shape for `/wallet/mark-returned` |
| Additive-counter precedent (`candy_bonus`, `candy_realized`) + `doge_ledger.kind` check grown per migration | `0023`/`0025` migrations | migration `0034_candy_return.sql` adds column + `kind='give_back'` |
| Conservation harness Layers A/B (+ stakes precedent for ops outside Redex) | `roster-server/tests/fixtures/wallet-world.js` (`applyOp` :125, invariants :240), `wallet-conservation.test.js`, `wallet-conservation-pg.test.js` + `fixtures/pg-wallet.js` | new op `give_back` + extended invariants |
| Client identity mirror | `js/wallet_logic.js`; Desk `_walletLedgerDetail` "In hand" row | display returned; "In hand" = given − returned |
| Dashboard give buttons (`✓ gave`, `some…`, `_rewardMark`, `_rewardMarkPartial`) | `teacher-dashboard.html:~1730,~1830` (commit 8593c20) | "↩ took back…" sits beside them |
| Teacher auth (`requireTeacher`) + uuid guard (`badId`) | `doge-wallet.js` | unchanged, reused |
| 0032 payout reservation trigger (watches `doge_balance`/`doge_sent`) | `0032_payout_batch.sql` | a return raises Owed only — no interaction; prove it in a test |

## 1. Goals / Non-goals

Goals:
1. Teacher records "kid handed back N candies"; the student's Owed rises by N
   (spendable/giftable/convertible again), fully audited.
2. Both existing invariants survive UNCHANGED in meaning: `candy_given` stays
   monotonic (I5), and the conservation identity still balances — extended, not
   bent.
3. Guard: cumulative returns can never exceed cumulative gives
   (`candy_returned ≤ candy_given`, enforced under the row lock).
4. Full audit: each return is a `doge_ledger` row `kind='give_back',
   candy_delta=+N`, timestamped, so the give/return history reads like a
   bank statement.

Non-goals (v1):
- No student-initiated returns (teacher-only — it's physical candy in the room).
- No DOGE returns (`doge_sent` is on-chain and truly irreversible; nothing here
  touches it).
- No editing/deleting past give rows — returns are compensating entries, never
  rewrites.

## 2. The accounting (the whole design in one block)

New monotonic column `doge_account.candy_returned` (default 0).

- Identity becomes: `Earned + Received + Realized + Bonus + Returned =
  Gifted + Converted + Materialized + Escrowed + Owed`
  i.e. `rawBalance = … − materialized + returned + …`.
- "Still out" (physical candy in the kid's hands) = `candy_given − candy_returned`.
  The Desk "In hand" row and the dashboard's `✓ N given` confirmations show
  THIS number, labeled so history isn't hidden (e.g. `✓ 5 given · 2 returned`).
- `doge_mark`'s give-cap must add `+ candy_returned` (returned candy can be
  handed out again later): `v_cap := p_earned + bonus + gifted_in − gifted_out
  − cost_basis + realized − escrowed + candy_returned`.
- `doge_give_back(p_sid, p_amount)` (SQL, migration 0034): FOR UPDATE lock;
  clamp `v_new := least(candy_returned + p_amount, candy_given)` (monotonic-up,
  capped at given — the I5 twin); write column + `updated_at`; insert ledger
  row `kind='give_back', candy_delta = +(v_new − v_old)`. Third-rerun-safe
  `create or replace`; the `doge_ledger` kind check constraint re-created with
  `give_back` added (house pattern from 0021→0025).

## 3. Server + client surface

- `POST /wallet/mark-returned` — teacher-gated, `{studentId, amount}`,
  `amount > 0`, uuid guard; calls `db.dogeGiveBack`; 503 until 0034 runs
  (mirror `isDogeMissing` with a specific matcher, like 0033 did).
- `deriveBalances` gains `candyReturned` + the identity change; `candyOwed`
  comment updated. `js/wallet_logic.js` mirror updated in lockstep (the
  bundle-parity/offline engine reads the server modules — check
  `scripts/build-grade-engine.mjs` inputs; wallet_logic is client-mirror only).
- Dashboard: in the give cell, when `given − returned > 0.01`, add
  `↩ took back…` button → prompt "How many did NAME hand back? (out: X)" →
  validate (positive, ≤ still-out) → POST. Repaint shows updated owed and the
  `given · returned` confirmation.
- Desk wallet Details drawer: `In hand` becomes given − returned; add a
  `Handed back` row when returned > 0. Student-visible, read-only.

## 4. Conservation harness (ships with the change, not after)

- **Layer A** (`wallet-world.js`): new op `give_back` in `applyOp`; invariants
  extended — identity with Returned; `candy_returned` monotonic;
  `candy_returned ≤ candy_given` always; give-cap includes returned; fuzz mix
  includes give_back ops.
- **Layer B** (`pg-wallet.js` + differential test): run migration 0034 SQL in
  pglite; differential JS-vs-SQL agreement on sequences mixing give/give_back.
- **Layer C** (Redex): follow the stakes precedent — v1 may leave `give_back`
  out of the Racket model, but then `wallet-model-emit-cases.mjs` must not emit
  give_back cases and a comment in `wallet-model.rkt` records the exclusion.
  **[default: excluded in v1, like bets]**
- Existing golden master and payout conservation suites must pass untouched.

## 5. Invariants (each maps to a test)

- R1: identity holds with Returned across fuzzed op sequences (A) and in SQL (B).
- R2: `candy_returned` never decreases; never exceeds `candy_given`; a return
  larger than still-out clamps exactly to still-out (server) and is rejected
  client-side with a message.
- R3: give → return → give again round-trips: owed and caps end exactly where
  simple arithmetic says; every step has its ledger row.
- R4: replay-safe: re-POSTing the same return is bounded by the clamp (same
  guarantee doge_mark gives gives).
- R5: no payout interaction: an active payout batch neither blocks nor is
  blocked by a candy return (DOGE columns untouched).
- R6: pre-0034 → endpoint 503s; every other wallet route unaffected.

## 6. Phases

| Phase | Work |
|---|---|
| 1 — SQL + harness | migration 0034, wallet-world op + invariants, pglite differential |
| 2 — server | db.js `dogeGiveBack`, `/wallet/mark-returned`, deriveBalances, tests |
| 3 — dashboard | ↩ took back… button + confirmations |
| 4 — Desk | In hand / Handed back rows + wallet_logic mirror |

## 7. Open decisions (defaults chosen; change if you want)

- Show `Handed back` to the student in the Desk drawer **[default: yes — honest ledger]**.
- Redex Layer C coverage **[default: excluded v1 per §4]**.
- Fractional returns **[default: allowed, same as gives]**.

## 8. Files touched (estimate)

**New:** `roster-server/migrations/0034_candy_return.sql`, `roster-server/tests/candy-return.test.js` (+ pg differential additions).
**Edited:** `roster-server/doge-wallet.js`, `roster-server/db.js`, `roster-server/tests/fixtures/wallet-world.js`, `roster-server/tests/fixtures/pg-wallet.js`, `roster-server/tests/wallet-conservation*.test.js`, `js/wallet_logic.js`, `teacher-dashboard.html`, `ap_stats_roadmap_square_mode.html`, shadow mirrors.
**Unchanged:** `doge_mark`'s monotonic write itself (only its cap formula), payout rail, receipts, doge-chain.

### TL;DR
Returns are a second monotonic counter, not an un-give: `candy_returned` rises
(never past `candy_given`), the identity gains `+ Returned`, the give-cap gains
`+ returned`, every return is an audited `give_back` ledger row, and the
teacher gets a "↩ took back…" prompt beside the give buttons. I5 stays intact;
the conservation harness learns the op in the same commit.
