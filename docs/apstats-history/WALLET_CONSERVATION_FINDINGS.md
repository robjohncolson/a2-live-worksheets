# WALLET_CONSERVATION_FINDINGS.md

> Findings from the candy↔DOGE conservation audit (`WALLET_CONSERVATION_AUDIT_SPEC.md`). Applies the
> Session-13 grade-integrity playbook (Redex + `fast-check` + a real-Postgres differential) to the now
> **bidirectional** wallet economy. Three independent oracles — the canonical JS reducer, the REAL
> plpgsql in pglite, and a Redex exact-rational model — are checked against the 7-number conservation
> identity and the invariants I1–I9, then an adversarial-review workflow (19 agents, 5 lenses, per-finding
> verification: 14 raw findings → **4 real, 10 refuted**) hunted for what the harness misses.
>
> **Headline:** the *core* economy (buy / sell / gift) is **SOUND** on conservation — the three oracles
> agree on every fuzzed trajectory. The review found **one real bug (F1, major) in the teacher
> disbursement path** — a lost-update race the single-threaded harness could not see — now **FIXED**, plus
> three coverage findings (F2/F3/C1) now hardened. The s16 concern that the in-memory `dogeSell` fake
> hand-copies the SQL (so a bug in both would pass) is **closed**: Layer B diffs the REAL plpgsql against
> an independently-derived reducer.

## The 7-number conservation contract

`Earned + Received + Realized == Gifted + Converted + Materialized + Owed`, with
`Owed = max(0, E + R + Z − G − C − M)` and ε = 1e-9. (`Z` = Realized, the signed cash-out P&L added by the
s16 `doge_sell`.)

## Confirmed sound (the conservation contract holds on these axes)

| # | Invariant | Verdict | Where proven |
|---|-----------|---------|--------------|
| I1 | The books close: `E+R+Z == G+C+M+Owed` after every transition | **HOLDS** | A (600-run fuzz), B (real SQL), C (1200 cases) |
| I2 | A gift is zero-sum across the class; buy/sell never inflate Earned | **HOLDS** | A (Σraw + ΣE unchanged on every gift) |
| I3 | Owed ≥ 0 under the guarded ops (no phantom debt); raw surfaced when negative | **HOLDS** | A, B, C |
| I4 | Spend guards reject over-buy/over-gift/over-sell and un-matured / sent-on-chain DOGE | **HOLDS** | A (deterministic + fuzz), B (real SQL accept/reject parity) |
| I5 | `Converted` rises only on buy / falls only on sell (floored 0); `Materialized` & `doge_sent` never decrease | **HOLDS** | A, B, C |
| I6 | A sell pays exactly `coins × candyPerDoge(price)`; Owed rises by **exactly** the payout; Realized may go negative but Owed never does | **HOLDS** | A, B, C |
| I7 | On-chain irreversibility: `doge_sent ≤ doge_balance` always; sent coins can never be cashed back | **HOLDS** | A, B, C |
| I8 | Round-trip honesty: buy→sell at the same price ≈ identity (no fee); higher nets a gain, lower a loss | **HOLDS** | A (deterministic) |
| I9 | **Differential agreement** — real SQL ≡ JS reducer ≡ Redex model on every fuzzed trajectory | **HOLDS** | B (SQL≡reducer, 150 runs), C (Redex≡reducer, 1200 cases) |

## The three layers (all green)

| Layer | File(s) | What it proves | Runtime |
|-------|---------|----------------|---------|
| **A — property fuzz** | `roster-server/tests/wallet-conservation.test.js` + `tests/fixtures/wallet-world.js` | I1–I8 over 600 random trajectories; deterministic guard (I4) + round-trip (I6/I8) pins; the s16 objections pinned as disproofs; a live buy→sell replay through the REAL routes | ~0.3s |
| **B — real-Postgres differential** | `roster-server/tests/wallet-conservation-pg.test.js` + `tests/fixtures/pg-wallet.js` | Each op runs through the **REAL `doge_spend`/`doge_gift`/`doge_sell` plpgsql** (in `@electric-sql/pglite`, WASM, no Docker) AND the reducer; persisted Postgres row == reducer within 1e-6, I1–I8 hold. **Closes the I9 / "fake hand-copies the SQL" gap.** Plus the C1 rolling-cap pin. | ~6s |
| **C — Redex formal model** | `formal/wallet-model/{wallet-model.rkt,crosscheck.rkt,cases.json,README.md}` + `roster-server/tools/wallet-model-emit-cases.mjs` | Independent exact-rational re-implementation of the column arithmetic (avg-basis unwind + Realized P&L + the mark clamps); cross-checked vs the JS reducer on 1200 trajectories → `PASS 1200/1200` | ~1s |

**Single-source note:** the conversion peg (`candyPerDoge` / `dogeFromCandy` / `candyFromDoge`) is imported
from production `doge-econ.js` — no third copy. The guard arithmetic (spendable, avg-basis, FIFO maturity)
is hand-mirrored in the reducer and **proven to match the real plpgsql by Layer B**.

## FINDING F1 — `markEndpoint` lost-update race clobbers a concurrent buy/sell (teacher path)

**Severity: major. Status: ✅ FIXED.** Pinned by `doge-wallet.test.js` → "F1: mark-given does NOT clobber
a buy that committed after the teacher read the account".

The teacher disbursement endpoints (`POST /wallet/mark-given`, `/wallet/mark-sent`, and `/wallet/address`)
were a **read-modify-write**: `markEndpoint` (`doge-wallet.js`) did `getDogeAccount` → compute the clamp →
`upsertDogeAccount(rowFor(acc, {field}))`. `rowFor` reconstructed the **whole row** — carrying
`doge_balance`, `doge_cost_basis`, `candy_given`, `doge_sent` from the (possibly stale) read — and the
upsert wrote them ALL back via `ON CONFLICT DO UPDATE SET col = EXCLUDED.col`.

So if a student's atomic `doge_spend`/`doge_sell`/`doge_gift` committed **between** the teacher's read and
write, the upsert silently rolled those columns back to their pre-spend values while the spend's
`doge_ledger` leg persisted — a **lost update that mints or destroys candy** and breaks I1/I2.

### Reproducer
Student: earned 20, balance 0, basis 0. **T0** teacher reads the account (sees basis 0). **T1** student
`POST /wallet/buy-doge` candy=10 → `doge_cost_basis=10`, `doge_balance=coins`. **T2** teacher
`mark-given` upserts `rowFor(staleAcc, {candy_given:5})` = `{doge_balance:0, doge_cost_basis:0, candy_given:5}`
→ the buy's basis/balance are clobbered back to 0, but the 10 spent candy is gone from the ledger → **Owed
jumps from 5 to 15: 10 candy minted.** No conservation layer exercises concurrent ops, so it was invisible
to A/B/C — the review's completeness/spend-guard lenses surfaced it by code-read.

### Why it's the bug the codebase already knew about
Migration 0019's header says the JS read-modify-write "could lose updates / clobber fields under concurrent
spends" — the atomic SQL functions exist to prevent exactly this. And the companion `updateDogeChain`
(`db.js`) deliberately uses a narrow `.update()` of only the `chain_*` columns "so it can never clobber a
concurrent eat/buy spend." `markEndpoint` reintroduced the full-row clobber on the teacher path.

### The fix (JS, no migration — ships on the next Railway deploy)
New `db.updateDogeField(studentId, field, value)` — a **narrow single-column write** (whitelisted to
`candy_given` / `doge_sent` / `doge_address`, with a DO-NOTHING insert to ensure the row exists) that
mirrors `updateDogeChain`. `markEndpoint` and `/wallet/address` now use it instead of
`upsertDogeAccount(rowFor(..))`; `rowFor` is deleted. Only the marked column is written, so a concurrent
spend's `doge_balance`/`doge_cost_basis` survive — the conservation-critical clobber is gone.

> **Residual (minor, accepted):** the clamp *value* is still computed from the pre-write read, so a buy that
> lands in the window can leave `candy_given` marginally above the true post-buy Owed-eligible cap →
> `candyBalanceRaw < 0`, which `deriveBalances` already **surfaces** (item-6 hardening), is monotonic, and
> self-heals on the next mark. A fully-atomic `doge_mark` plpgsql (a future USER-RUN `0024`) would close even
> this and the mark-vs-mark race, but it is NOT a conservation hole and needs a migration — out of scope for
> this pass. The catastrophic value clobber is fixed now.

## FINDING F2 — the mark-given cap's `+candy_realized` term was untested (both sign and presence)

**Severity: minor. Status: ✅ FIXED (coverage).** Pinned by `doge-wallet.test.js` → "F2: mark-given cap
INCLUDES candy_realized (+Z)". No prior test set `candy_realized != 0`, so a regression dropping or
mis-signing the `+ candy_realized` term of the cap (`E + R − G − C + Z`) would have passed the whole suite —
a kid who cashed DOGE out for a gain would have been silently unable to materialize the realized candy. The
new test seeds `candy_realized = 5` and asserts a 12-candy mark succeeds against the 10-earned + 5-realized
cap (it would clamp to 10 without the `+Z` term).

## FINDING F3 — Layer B did not independently exercise the teacher mark CLAMP

**Severity: minor. Status: ✅ ADDRESSED (real-route coverage); deeper oracle noted.** `mark-given`/`mark-sent`
are JS (`markEndpoint`), not plpgsql, so Layer B substitutes `pgSetColumn` (writing the reducer's already-
clamped value) — the clamp formula was only ever checked against itself, the tautology Layer B exists to
defeat. The F1 + F2 tests now drive the **real `markEndpoint`** through the mounted routes (the actual clamp
code path, not `pgSetColumn`), giving the teacher path genuine coverage. A fully-independent oracle would be
an atomic `doge_mark` plpgsql differentially checked like buy/sell/gift — the same future `0024` noted in F1.

## FINDING C1 — the gift daily cap is a ROLLING 24h window, but the fuzzer modeled it as lifetime

**Severity: was major (harness blind spot). Status: ✅ ADDRESSED (deterministic pin).** The reducer models
the daily gift cap as a lifetime cap on cumulative `candy_gifted_out`; the real `doge_gift` enforces a
**rolling 24h window** (`sum(gift_out) where ts ≥ now() − 24h`). They only coincide because no layer ages
gift legs, so a bug in the SQL's 24h window was structurally unfuzzable. The cap is an anti-farming guard,
not a conservation property (a gift is zero-sum regardless), so this never threatened the identity — but the
window logic deserved coverage. New deterministic Layer B test "C1: doge_gift enforces a ROLLING 24h cap"
inserts a 25h-old `gift_out` leg and proves the real SQL lets a fresh full-cap gift through (a lifetime cap
would reject) and then rejects the next one — exercising the window directly. (Also covered from the route
side by `doge-wallet.test.js`'s 25h-exclusion test.)

## Refuted (the harness held up — 10 of 14 raw findings)

The adversarial review's other 10 findings were verified and refuted: the avg-cost-basis proration, the
`greatest(0, …)` floor, the FIFO `− doge_sent` (NOT a double-subtract — confirms s16 objection b), the
multi-buy average-cost (no mint — s16 objection c), the spendable-guard term parity across 0019→0023, the
`+candy_realized` guard term, and the I7-after-sell preservation were all confirmed correct. The s16 review's
three objections are now pinned as **empirical** disproofs in `wallet-conservation.test.js`:

- **(a) materialize-then-sell-at-a-loss leaks candy → DISPROVEN.** A sell raises the materialize cap by
  **exactly** the payout (Δcap = +payout ≥ 0; Converted & Realized move from the same leg).
- **(b) FIFO maturity double-subtracts `doge_sent` → DISPROVEN.** The two `−doge_sent` terms apply to two
  distinct quantities; sellable clamps to exactly the in-app pool; the "fix" would block a valid cash-out.
- **(c) average-cost over multiple buys mints candy → DISPROVEN.** Selling everything unwinds the basis to 0
  and realizes exactly `payout − spent`.

## Coverage limitations (honest scope — out of scope, none threaten conservation)

- **Concurrency / row-lock serialization.** The harness is sequential, so it does not exercise the
  `FOR UPDATE` row lock that serializes concurrent spends. F1's race (a different, JS-side window) is now
  fixed and pinned; the SQL atomic guards' under-contention behavior is enforced by the row lock and is not
  differentially fuzzed (pglite is single-connection).
- **Gift cap time window in the *fuzz* path.** The differential fuzzer treats the cap as lifetime (all gifts
  "now"); the rolling 24h window is pinned by the C1 deterministic test instead.
- **Ledger-deletion negative-Owed path.** `candyBalanceRaw < 0` (Earned dropping below G+C+M when a
  receipt-carrying row is deleted after disbursement) is surfaced (not silently clamped) by `deriveBalances`;
  the generator's Earned faucet is monotonic-up, so this reconciliation branch is asserted by `doge-wallet.test.js`,
  not fuzzed.
- **The retired `eat` branch** is dead code (the route is a no-op) and is intentionally not modeled.

## Summary

| Finding | What | Status |
|---|---|---|
| — | candy↔DOGE 7-number conservation (I1–I9) for buy/sell/gift | **SOUND** (A+B+C all green) |
| **F1** | `markEndpoint` whole-row upsert clobbers a concurrent buy/sell (lost update) | ✅ **FIXED** (narrow `updateDogeField`) |
| F2 | mark-given cap's `+candy_realized` term untested | ✅ fixed (test) |
| F3 | Layer B didn't independently exercise the teacher mark clamp | ✅ addressed (real-route coverage) |
| C1 | gift cap modeled as lifetime; SQL is rolling-24h | ✅ addressed (deterministic pin) |
| s16-a/b/c | three cash-out objections | **disproven** (pinned) |

> The reusable recipe held: canonical reducer + invariants → fuzz (A) → differential vs the real engine (B)
> → independent formal re-derivation (C) → **adversarial review of the harness itself** — which is what
> caught F1, the one real bug, in the path the three oracles structurally couldn't reach.
