# WALLET_CONSERVATION_AUDIT_SPEC — Redex / state-machine integrity audit of the candy↔DOGE economy

> **Status: ✅ DONE (s17, 2026-06-18).** All three layers built + green (Layer A 600-run fuzz, Layer B
> 150-run real-plpgsql differential via pglite, Layer C Redex `PASS 1200/1200`); roster-server 1015/1015.
> An adversarial review (19 agents, 5 lenses) found **one real bug — F1 (major): a lost-update race in the
> teacher `markEndpoint` whole-row upsert — now FIXED** (narrow `db.updateDogeField`), plus F2/F3/C1 coverage
> hardening. Core conservation (buy/sell/gift, I1–I9) is **SOUND**. Findings: `WALLET_CONSERVATION_FINDINGS.md`.
>
> Scoped 2026-06-17 (s16). The candy/DOGE economy is now **bidirectional**
> (s16 `doge_sell` cash-out added the `Realized` term + a brand-new guarded SQL function). The
> continuation prompt flags a **conservation audit** as "the strong, still-open" integrity target.
> This applies the **Session-13 grade-integrity playbook** (`formal/grade-model/` Redex + `fast-check`
> property tests + live-code/differential harnesses) to the wallet. Build this as a **fresh fan-out**.
>
> **Why now / the gap this closes:** the s16 implementation review found that the in-memory `dogeSell`
> test fake in `roster-server/tests/doge-wallet.test.js` **hand-copies the SQL `doge_sell` formula** —
> so a bug copied into BOTH the fake and `migrations/0023_doge_sell.sql` passes every test while
> production is wrong. There is currently **no independent oracle** that runs the real SQL. Same latent
> risk for `doge_spend`/`doge_gift`. This audit builds three independent oracles.

## 0. What is being audited

**The wallet state machine.** Per-student state = the `doge_account` columns; class state = the set of
students (gifts couple two students). Transitions (the only ways state changes):

| Op | Route | SQL fn (migration) | Effect |
|----|-------|--------------------|--------|
| buy_doge | `POST /wallet/buy-doge` | `doge_spend(... 'buy_doge')` (0019→0022) | candy→DOGE: `doge_balance += coins`, `doge_cost_basis += candy` (guarded by spendable) |
| sell_doge | `POST /wallet/sell-doge` | `doge_sell` (0023) | DOGE→candy: `doge_balance −= d`, `doge_cost_basis −= avgBasis`, `candy_realized += (payout − avgBasis)`; guards: un-sent in-app + FIFO maturity |
| gift | `POST /wallet/gift` | `doge_gift` (0021→0022) | candy→classmate: sender `candy_gifted_out += c` (guarded), recipient `candy_gifted_in += c`; rolling 24h cap |
| mark-given | teacher | (JS `markEndpoint`, clamped) | `candy_given` ↑ toward the Owed-eligible cap (monotonic) |
| mark-sent | teacher | (JS `markEndpoint`, clamped) | `doge_sent` ↑ toward `doge_balance` (monotonic) |

`eat` is **retired** (`/wallet/eat` is a no-op; the SQL branch is dead). `Earned` is **not stored** — it
is recomputed from the effort ledger (`computeEffort`) and passed into the SQL fns as `p_earned`; the
model treats it as a monotonic-up input.

**The derived view (JS):** `deriveBalances` (`roster-server/doge-wallet.js`) computes the 7 numbers and
the spendable guard. The **same arithmetic is duplicated** in the SQL `WHERE` guards and in the test
fakes — that triplication is exactly what this audit pins.

## 1. The conservation contract (the invariants to prove/fuzz)

Let `E`=Earned, `R`=Received (`candy_gifted_in`), `Z`=Realized (`candy_realized`), `G`=Gifted
(`candy_gifted_out`), `C`=Converted (`doge_cost_basis`), `M`=Materialized (`candy_given`), `O`=Owed
(spendable). Epsilon `1e-9` (numbers are Postgres `numeric` / JS float).

- **I1 — Identity:** `E + R + Z == G + C + M + O` after every transition. `O = max(0, E+R+Z−G−C−M)`.
- **I2 — No mint/destroy:** a **gift is zero-sum** across the class (Σ spendable unchanged). buy/sell move
  value between `C`/`O`/`Z` and never inflate `E` (effort-only faucet).
- **I3 — Owed floor:** `O ≥ 0`, OR the raw (unclamped) owed is **surfaced** (`candyBalanceRaw < 0`) — never
  silently clamped away.
- **I4 — Spend guards:** can't buy/gift more candy than spendable; can't sell more DOGE than the
  **un-sent, FIFO-matured** pool (`doge_balance − doge_sent`, bought ≥ `SELL_HOLD_HOURS` ago); concurrent
  ops serialize (the SQL row guard re-checks on the live row → no double-spend / double-sell).
- **I5 — Monotonicity:** `doge_cost_basis` only rises on buy (falls only on sell, by the unwound avg
  basis, floored at 0); `candy_given`/`doge_sent` never decrease (mark caps clamp, never claw back).
- **I6 — Sell P&L:** payout `== coins × candyPerDoge(price)` exactly; `O` rises by **exactly** the payout;
  `Z += payout − avgBasis`; `Z` may go **negative** (a real loss) but a sell can never drive `O` negative
  (Δ`O` = +payout ≥ 0).
- **I7 — On-chain irreversibility:** coins counted in `doge_sent` (on the kid's paper wallet) can **never**
  be cashed back; `doge_sent ≤ doge_balance` always.
- **I8 — Round-trip honesty:** buy then sell at the **same** price ≈ identity (no fee); a higher sell price
  nets candy (gain), a lower one nets less (loss) — and the realized gain == the on-chain appreciation.
- **I9 — Differential agreement (the headline):** the **real SQL** functions, the **JS** `deriveBalances`/
  guards, and the **Redex** model all agree on the resulting balances for every fuzzed trajectory.

## 2. The three layers (Session-13 shapes, applied to the wallet)

### Shared foundation (build FIRST, before fanning out A/B/C)
A single trajectory generator + invariant module both A and B drive, and C cross-checks:
- `roster-server/tests/fixtures/wallet-world.js` (new, mirrors `tests/fixtures/sim-world.js`):
  - a **trajectory generator** (`fast-check`): a sequence of typed ops over K students —
    `{op:'earn', sid, candy}` (monotonic-up faucet), `buy/sell/gift/markGiven/markSent` with random
    amounts, random live `price`, and random buy-ages (to exercise FIFO maturity).
  - a **canonical JS reducer** `applyOp(state, op)` that mirrors the SQL guards EXACTLY (the one place the
    JS spendable/sell math lives for the audit), returning the new state or a `rejected` flag.
  - the **invariant checks** I1–I8 as pure assertions over a state (+ the prior state for deltas).
  - **⚠ single-source-of-truth note:** ideally extract the guard arithmetic (`spendable = E − M − C − G + R + Z`,
    the avg-basis unwind, FIFO maturity) into ONE pure module imported by `deriveBalances`, the reducer, and
    the case emitter — so A/B/C check ONE definition. If that refactor is out of scope, the reducer must be
    documented as a faithful hand-mirror and Layer B is what proves it matches the SQL.

### Layer A — property-fuzz the conservation invariants (fast-check, real JS)
- File: `roster-server/tests/wallet-conservation.test.js`.
- Drive `NUM_RUNS≈600` random trajectories through the reducer; assert I1–I8 after every op; assert
  gift zero-sum across the class; shrink any violation to a minimal counter-trajectory (s13 style).
- ALSO run each trajectory through the **real route handlers** where cheap (mount `doge-wallet.js` on a
  bare app with the in-memory fakes, as `doge-wallet.test.js` already does) so the live guard ordering /
  error paths are exercised, not just the reducer.
- `fast-check` is already a roster-server devDep (`^4.8.0`).

### Layer B — real-Postgres differential harness (closes the I9 / "fake mirrors SQL" gap)
- **The point:** run the **actual** `doge_spend`/`doge_gift`/`doge_sell` plpgsql against a real Postgres,
  in-process, and diff vs the JS reducer for every fuzzed trajectory.
- **Engine:** `@electric-sql/pglite` — Postgres compiled to WASM, runs in Node with **no Docker** (works
  on this Windows box + CI). New roster-server devDep. **First build step: confirm pglite runs plpgsql**
  (it ships the default `plpgsql` language); if it can't, fall back to `testcontainers` + Docker Postgres,
  or mark Layer B blocked and lean on C.
- Files: `roster-server/tests/wallet-conservation-pg.test.js` + `roster-server/tests/fixtures/pg-wallet.js`
  (loader: create a **minimal `roster`** table + run the relevant DDL/functions from
  `migrations/0019,0021,0022,0023` into a fresh pglite db per test).
- Harness: for each trajectory, apply each op via the **real RPC SQL** (`select doge_spend(...)` etc.) AND
  the JS reducer; after each op assert the pglite row == the reducer state (within `1e-9`) AND I1–I8.
- **Time/maturity:** `doge_sell` maturity uses `now()` + a `p_hold_hours` interval over `doge_ledger.ts`.
  Control it by inserting buy legs with explicit past `ts` (mirror the real fixture), or test the
  non-matured path with a large hold and the matured path with `ts` in the past. Document the approach.
- This is the layer that would have caught a formula bug copied into both the fake and the SQL.

### Layer C — Redex formal model (`formal/wallet-model/`, mirrors `formal/grade-model/`)
- `formal/wallet-model/wallet-model.rkt` — a small-step Redex model: state = the ledger columns (rationals
  to avoid float drift; mirror JS doubles only where a gate/round matters), reductions for
  buy/sell/gift/markGiven/markSent with their guards, and a metafunction for `deriveBalances`/`Owed`.
  Prove **I1 (identity)** and **I3/I5/I7** as machine invariants via `redex-check` / bounded exhaustive
  search over a small state space (s13: "tiny space = proof").
- `roster-server/tools/wallet-model-emit-cases.mjs` — like `grade-model-emit-cases.mjs`: a deterministic
  PRNG + edge values emit trajectories + the JS-computed final balances as the oracle → `formal/wallet-model/cases.json`.
- `formal/wallet-model/crosscheck.rkt` — reads `cases.json`, replays each trajectory through the Redex
  model, asserts agreement within tolerance; prints `PASS n/n`.
- `formal/wallet-model/README.md` — run notes. **Racket on this box:** scoop (`$env:Path += ';C:\\Users\\rober\\scoop\\shims'`
  in PowerShell); **`racket` segfaults under MSYS bash → run from PowerShell.** racket v9.2 + redex installed.
- Run: `node roster-server/tools/wallet-model-emit-cases.mjs` then PowerShell `racket formal/wallet-model/crosscheck.rkt` → `PASS n/n`.

## 3. Findings protocol (s13)
Any invariant violation → **pin as a deterministic test** (the shrunk counter-trajectory) + document in a new
`WALLET_CONSERVATION_FINDINGS.md` (severity, root cause, the I# it breaks). Fixes gate behind a flag/migration
and keep the default path byte-identical where possible. **AI/automated fixes never downgrade** — same posture
as the grade work. If a finding is in the SQL, the fix is a `CREATE OR REPLACE` in a new USER-RUN migration
(e.g. `0024_*`), mirrored in `deriveBalances` + the reducer (the two-place rule).

## 4. Fan-out plan (for the fresh build session)
1. **Phase 0 (serial):** build the **shared foundation** — `wallet-world.js` (generator + reducer + I1–I8) +
   (optional) extract the guard arithmetic into one pure module. Everything else depends on this.
2. **Phase 1 (parallel):** Layer A (property tests), Layer B (pglite loader + differential — *its own track,
   highest value*), Layer C (Redex model + emit-cases + crosscheck). Independent once Phase 0 lands.
3. **Phase 2 (serial):** run all three; triage + pin any findings; write `WALLET_CONSERVATION_FINDINGS.md`;
   fold fixes (new migration if SQL) with adversarial review; update this spec's status to DONE.

## 5. Gotchas / facts the build session needs
- **Epsilon `1e-9`** everywhere; Postgres `numeric` vs JS float — compare with tolerance, not `===`.
- **Avg cost basis** on sell: `basis = doge_cost_basis × (d / doge_balance)`; maturity is **FIFO** (independent
  of the avg-basis split) — both must be modeled. `doge_sell` re-enforces maturity atomically (don't rely
  only on the JS pre-gate).
- **`doge_ledger.kind` CHECK** = `('eat','buy_doge','give','send','gift_out','gift_in','sell_doge')`; a new
  kind needs a migration.
- **`p_earned` is an input** (ledger-derived), not a column — the harness computes/feeds it; `Earned` is
  monotonic-up in the generator.
- **Guard-fail shape:** the SQL fns return a **row-of-NULLs** over PostgREST (the route checks
  `!r.data.student_id`); the pglite harness sees a NULL row — handle both.
- **Files that already encode the math** (read them first): `roster-server/doge-wallet.js` (`deriveBalances`,
  `maturedSellable`, the route guards, `markEndpoint`), `roster-server/doge-econ.js` (`candyPerDoge`/
  `dogeFromCandy`/`candyFromDoge`/`computeEffort`), `migrations/0019,0021,0022,0023`, and the existing
  `roster-server/tests/doge-wallet.test.js` fakes (the thing being independently checked).
- **Precedent to copy:** `formal/grade-model/*`, `roster-server/tools/grade-model-emit-cases.mjs`,
  `roster-server/tests/grade-sim-invariants.test.js`, `roster-server/tests/fixtures/sim-world.js`,
  `tests/lesson-gating-live.test.js` (the `fnBody` live-extractor pattern, if a live-DOM check is wanted).
- **Run the full suites after:** roster-server (`cd roster-server && npx vitest run`) + root; baseline is
  the **6 pre-existing onboarding failures** (desk-gating-fixes / desk-self-signup / desk-user-role /
  desk-signin-wall) — anything else is a regression.
