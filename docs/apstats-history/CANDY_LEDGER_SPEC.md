# CANDY LEDGER — spec ("materialized candy": the 6-number model)

> Status: SPEC (awaiting review). Author session 2026-06-17. Builds on the shipped candy poke (CANDY_POKE_SPEC.md).
> Goal: give every student a clear, honest candy ledger — a permanent EARNED total plus a MATERIALIZED count of
> how much real candy the teacher has physically handed over — and turn the teacher dashboard into a weekly
> "who do I owe candy to" worklist. Grounded in a 3-agent map of the real backend / dashboard / My-Ledger.

## The model (confirmed)
Six numbers per student, with one identity that keeps them honest:

| Number | Means | Behavior | Maps to (already exists) |
|---|---|---|---|
| **Earned** | candy from effort/work | inflow, only ever rises | `candyEarned` = `computeEffort().candy` (ledger-derived) |
| **Received** | candy peers poked to you | inflow, only ever rises | `candy_gifted_in` (migration 0021) |
| **Gifted** | candy you poked to peers | outflow | `candy_gifted_out` (0021) |
| **Converted** | candy you turned into DOGE | outflow | `doge_cost_basis` (0019) |
| **Materialized** | real candy the teacher handed you | realized | **`candy_given` (0019)** — already the teacher mark-given counter |
| **Owed** *(derived)* | real candy still coming to you | = Earned + Received − Gifted − Converted − Materialized | computed |

**Identity:** `Earned + Received = Gifted + Converted + Materialized + Owed`. Earned + Received only ever rise
("never taken away"); Owed is what the teacher works down weekly.

## Headline finding: almost zero migration
**Every number already exists** (cited above). The work is (a) a **formula change** for Owed, (b) **surfacing**
the numbers, and (c) **retiring the "eat" step**. The ONLY schema-touching change is one small migration that
updates a SQL *function body* — no columns added or dropped.

### Why "eat" is retired
Today the flow is: candy is only "owed" to a student if they first chose to **eat** it (opt-in), and
`candyOwed = max(0, candy_eaten − candy_given)` (doge-wallet.js:134, :351). The model drops that opt-in: anything
not gifted or converted is simply **Owed**, and the teacher materializes it. So `candy_eaten` becomes a vestigial
column (kept for audit; stops being read/written), and the student "Eat" button goes away.

## Backend changes (roster-server)
1. **Redefine `candyOwed`** in `deriveBalances` (doge-wallet.js:134) and `/class/wallets` (:351):
   `Owed = candyEarned + candy_gifted_in − candy_gifted_out − doge_cost_basis − candy_given` (replace the
   `candy_eaten − candy_given` formula in BOTH places + the 0019 header comment).
2. **Drop `− candy_eaten` from the spendable-balance guard.** It lives in TWO places that must agree:
   - JS `deriveBalances` (doge-wallet.js:119) — code edit.
   - Postgres `doge_spend()` / `doge_gift()` functions (migration 0021) — **this is the one migration**:
     `0022_retire_candy_eaten.sql` does `CREATE OR REPLACE FUNCTION doge_spend(...)` / `doge_gift(...)` with the
     `− candy_eaten` term removed. **USER-RUN, idempotent, no column changes.** `candy_eaten` column stays.
3. **Re-base the `mark-given` clamp** (markEndpoint:325): cap `candy_given` at **Owed-eligible candy**
   (Earned + Received − Gifted − Converted) instead of `candy_eaten`. ⚠ Without this, with eat retired
   `candy_eaten` stays 0 and the teacher could never materialize anything (cap = 0).
4. **Retire `POST /wallet/eat`** (doge-wallet.js:205-217): make it a no-op / remove; stop driving disbursement
   off `candy_eaten`.
5. **Expose all six from the wallet endpoints:** add `candyReceived` (alias of `candyGiftedIn`) and the new
   `candyOwed` to `GET /wallet`; add `candyEarned` to `GET /class/wallets` (today only in `/class/grades`) so the
   dashboard has all six without a client-side join.
6. **Keep the math in ONE place.** `js/wallet_logic.js` (the frozen-econ mirror) has NO owed/materialized logic
   today — keep it that way: the server computes Owed, the client just renders the returned fields. Avoids drift.
7. **(Optional, diagnostic)** add a server assert that the identity holds (mirrors the existing
   `candyBalanceRaw` negative-flag pattern) to catch drift.

## Student My-Ledger (the Desk, ap_stats_roadmap_square_mode.html)
- **Add an Earned / Materialized / Owed block** in `_dogeWalletRender` (after the balance line ~L11919);
  optionally show Gifted / Received / Converted as secondary. All six are computable from the existing
  `GET /wallet` payload — **no new fetch.** Copy idea:
  `Earned 80 🍬 (yours) · Got 30 in hand · 50 still coming` (+ a small breakdown on tap).
- **Remove the "Eat" button** + its `act('/wallet/eat')` wiring (~L11942/11954). Keep Buy DOGE + Gift.
- **Preview gate (decision below):** the whole wallet panel is hidden unless `_dogeWalletPreviewOn()` — teachers
  always see it; students only with the opt-in flag. To show students their ledger we likely flip students ON.
- **Update the frozen test** `tests/desk-doge-wallet.test.js:41` which asserts the render contains
  `act('/wallet/eat')` — that pin must change when the Eat button is removed.

## Teacher dashboard (the disbursement worklist)
- **Add an `Owed` column** = `effort.candy + candyGiftedIn − candyGiftedOut − dogeCostBasis − candyGiven`
  (teacher-dashboard.html header ~:502, per-row ~:1116). **This column is the weekly worklist** — sort by it.
- **Surface Received / Gifted / Converted** (all already arrive from `/class/wallets`, just not rendered).
- **Repurpose "To give 🍬" + ✓gave to act on Owed:** mark-given against the re-based cap (#3 above); each ✓
  moves candy **Owed → Materialized**.
- **Fix section scoping:** `_fetchRewardWallets()` should pass the same `?section=` the grades fetch uses (:1044).
- **Guests** never appear (device-local, off-roster); **teacher/test accounts** are included + badged 🧪.

## Decisions to confirm (these shape the build)
1. **Weekly "to give THIS WEEK" grouping** — you said "probably a weekly thing, I dunno." `doge_account` keeps
   only running totals (no per-week buckets), and earned candy never hits `doge_ledger`, so a true weekly cohort
   needs a small **additive** column `last_materialized_at timestamptz` (the "as-of" line; this-week = Owed accrued
   since it). **Option A:** ship just the running **Owed** column now (you work it down whenever — no extra column),
   add weekly bucketing later if you want it. **Option B:** add `last_materialized_at` now for a true weekly view.
   *Recommend A* (simpler; Owed is already a perfectly good worklist).
2. **Student visibility** — flip the wallet preview ON for students so they can see Earned/Materialized/Owed?
   (Today it's teacher-only unless a student sets the opt-in flag.) *Recommend yes* — the ledger is the point.
3. **DOGE** — keep Converted as the optional "turn candy into DOGE" path (it stays one of the outflow buckets), or
   retire DOGE too for a pure candy ledger? *Recommend keep for now* (it's harmless and already built; droppable later).

## Phasing
- **Phase 1:** the 6-number ledger end-to-end — Owed-formula change, retire eat (incl. the `0022` function
  migration + mark-given cap re-base), student Earned/Materialized/Owed block, dashboard Owed column +
  Received/Gifted/Converted, section-scope fix. (Decisions 2+3 fold in here.)
- **Phase 2 (optional, decision 1B):** `last_materialized_at` + the weekly "to give this week" grouping.

## Test plan
- roster-server: new tests for the Owed identity + the re-based mark-given cap; `doge_spend`/`doge_gift` guard
  without `candy_eaten` (extend the existing grade-sim/wallet conservation tests); 0022 migration is
  CREATE-OR-REPLACE-only.
- Desk: update `desk-doge-wallet.test.js` (drop the Eat pin, add Earned/Materialized/Owed render pins);
  the identity holds in the renderer.
- dashboard: Owed column math + section scoping.

## Migration summary (answers "do I need to run one?")
**One small USER-RUN migration: `0022_retire_candy_eaten.sql`** — `CREATE OR REPLACE` of `doge_spend()` +
`doge_gift()` to drop the `− candy_eaten` term. **No columns added/dropped.** Plus **one optional additive column**
(`last_materialized_at`) only if you choose the weekly view (decision 1B). Everything else is code.
