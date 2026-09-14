# SELL_DOGE_SPEC — DOGE → candy "Cash Out" (bidirectional conversion)

> **Status:** building (2026-06-17). Reverses DOGE_WALLET_SPEC decision #4 ("no sell-back") **on
> purpose**, per the teacher. Lets a student realize an appreciation gain: convert candy → DOGE,
> hold it, then cash DOGE → candy at the *new* floating rate. "DOGE worth 2 candy today, 3
> tomorrow → the kid gets more candy." Memory: `doge-candy-buyback-decisions.md`.

## The lesson

The forward leg already teaches *buy early = cheaper* (candy→DOGE floats). The reverse leg teaches
the payoff: **an appreciating asset you held is worth more candy than you paid.** It also teaches
the symmetric risk — if DOGE fell, you get back less (honest P&L). Holding overnight (not minute-to-
minute trading) is the behavior we reward.

## Teacher's locked decisions (2026-06-17)

1. **Uncapped floating gains.** Cash-out pays the full live rate; kids keep all appreciation. Not
   bounded by the $300 candy budget — *backed* instead by the teacher's ~10,273 real node DOGE,
   which appreciates in parallel (treat node DOGE as the reserve). The classroom amounts are small.
2. **Overnight hold (~24h).** DOGE bought now can't be cashed for `SELL_HOLD_HOURS` (default 24).
   This — not price freshness — is the anti-arbitrage defense: it dwarfs the 5-min price-cache
   window, so no risk-free same-window churn. FIFO maturity from the `doge_ledger` timestamps.
3. **Honest P&L (kids can lose).** Payout = `coins × liveRate`, regardless of cost basis. If DOGE
   fell they get less than they paid; the teacher keeps the difference. Hardest to game.

## Hard constraints (enforced, not optional)

- **Only in-app, un-sent coins are sellable** = `doge_balance − doge_sent`. Coins the teacher already
  pushed on-chain are self-custodied in the kid's paper wallet — no server key, can never be reclaimed.
- **Server-authoritative price.** The client never supplies a rate; the server stamps the live
  CoinGecko price onto the ledger row (same oracle as buy).
- **Two-place math stays in lock-step** — the JS `deriveBalances` formula and the SQL guards must agree
  (CANDY_LEDGER_SPEC #2). The frozen econ is mirrored in `roster-server/doge-econ.js` ⇄ `js/wallet_logic.js`.

## The 7-number conservation identity

The candy ledger gains a **Realized** term (net realized P&L, can be negative) on the earned side:

```
Earned + Received + Realized = Gifted + Converted + Materialized + Owed
Owed (spendable) = Earned + Received + Realized − Gifted − Converted − Materialized
```

A cash-out of `s` coins at live rate `r`, with average cost basis `B = doge_cost_basis × s / doge_balance`:

| Bucket | Δ | Column |
|--------|---|--------|
| `doge_balance` | − s | `doge_balance` |
| Converted | − B | `doge_cost_basis` (floored at 0) |
| Realized | + (s·r − B) | `candy_realized` (new) |
| Owed | + s·r | derived |

Identity check: LHS Δ = Realized Δ = `s·r − B`; RHS Δ = `−B + s·r`. Balanced. The kid's spendable
candy rises by the full payout `s·r`; the gain (or loss) is booked to Realized. Cost basis is
**average** (matches the "you bought at avg X" display); maturity is **FIFO** (which coins are old
enough) — independent concerns, no conflict.

## Schema — migration `0023_doge_sell.sql` (USER-RUN, additive)

- `alter table doge_account add column if not exists candy_realized numeric not null default 0;`
- Widen `doge_ledger_kind_check` to add `'sell_doge'`.
- `CREATE OR REPLACE` `doge_spend` + `doge_gift`: add `+ candy_realized` to the spendable guard (so
  realized candy is spendable/giftable/convertible). Bodies otherwise identical to 0022.
- New `doge_sell(p_sid, p_doge, p_rate, p_price, p_hold_hours default 24)`: `FOR UPDATE` row lock →
  guard `(doge_balance − doge_sent) ≥ p_doge` (in-app only) → guard FIFO maturity from `doge_ledger`
  (`matured_bought − sold − sent ≥ p_doge`) → atomic decrement + Realized credit → log a `sell_doge`
  ledger leg (`candy_delta = +payout`, `doge_delta = −coins`, price/rate stamped). Returns the row, or
  NULL on any guard fail (route → 400).

Until 0023 runs, `POST /wallet/sell-doge` 503s gracefully (`isDogeMissing` catches the absent
function / column via 42883 / PGRST202).

## API — `POST /wallet/sell-doge`

- Body `{ doge }` (coins to cash out). Auth via Bearer token (student).
- Kill-switch `BUYBACK_ENABLED` (default ON; falsey spellings `false/0/no/off` → 403 "cash-out is turned off"), mirrors `GIFTING_ENABLED`.
- 401 no sid · 503 no price · 400 `doge ≤ 0` · 400 over-maturity (friendly: "you can cash out X Ɖ right now…") · 503 pre-migration · 400 "not enough DOGE" (SQL guard fail).
- Success → `{ ok, ...deriveBalances, soldCoins, candyReturned, candyPerDoge, dogeUsd }`.
- `GET /wallet` adds `sellableDoge` (matured, in-app) so the Desk shows a Cash-Out button + "ready / unlocks ~a day after you buy".

## UI (the Desk `_dogeWalletRender`)

When the kid holds in-app DOGE: a **gain line** ("Your Ɖ is worth V 🍬 now — you put in C 🍬, ▲ up X%")
+ a **🍬 Cash out Ɖ** control (amount input capped at `sellableDoge`, "N Ɖ ready · 1 Ɖ = R 🍬"), or a
"cashes back ~a day after you buy (it can go up or down)" hint while it's still maturing. Sibling of
Buy-DOGE / Gift. The client never holds a key (POSTs `{doge}`, like buy POSTs `{candy}`).

## Tests

- `roster-server/tests/doge-sell.test.js`: `candyFromDoge` math; route 401/503/400/kill-switch;
  gain (price up) and loss (price down → negative Realized); FIFO maturity (immature coins blocked,
  matured coins sellable); can't sell coins already sent on-chain; conservation (7-number identity
  holds; Owed rises by the full payout); round-trip (buy → mature → sell at higher rate nets candy).
- `tests/desk-doge-wallet.test.js`: render contains `act('/wallet/sell-doge')` + `sellableDoge`;
  existing pins (`/wallet/buy-doge` present, `/wallet/eat` absent, no key client-side) preserved.
- `teacher-dashboard.html` `rawOwed` reconciliation flag + `candyOwed` learn the `+ realized` term.
