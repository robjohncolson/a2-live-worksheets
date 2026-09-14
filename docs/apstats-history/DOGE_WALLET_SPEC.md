# DOGE Effort Wallet — Spec v2 (decisions baked in)

> Status: **DRAFT, post-review.** Your six answers are folded in. Big change from
> v1: **real on-chain DOGE to per-kid paper wallets + a watch-only node** (not a
> custodial tracked balance). Remaining opens are in §13.

## Changelog v1 → v2
- **Broker model confirmed** (your #1). Candy = the stable **$300** dollar reserve;
  you buy/send DOGE at spot with each kid's forgone candy-dollars → your cost is
  capped at $300 with **zero price exposure**, even if DOGE crashes.
- **On-chain, not custodial** (your #2). Each kid gets a **paper DOGE wallet**;
  the app is **watch-only** (stores the address, reads the chain, never holds a
  key). No year-end payout — the kid already holds the coins.
- **Forced decision each session** (your #3): declare at session end *or* at the
  start of the next session; undecided after that → candy.
- **No sell-back** (your #4): candy→DOGE is one-way.
- **Leaderboard: dropped** (your #5 — silence; not building it).
- **Numbers pinned** (your #6): 30 kids; candy $13/360 = **$0.036/pc**;
  $300 ≈ **~8,300 pieces**; **≈36 effort pts = 1 candy**; **1 DOGE ≈ 2.4 candy** today.

## 0. TL;DR

Do work → earn **candy** (fixed: ~36 effort pts = 1 candy = $0.036). At each
session's end you must **declare**: 🍬 **eat it** (consumed) or **Ɖ buy DOGE** at
the **live price** (candy→DOGE floats; cheap now ~2.4/DOGE, maybe 33/DOGE later).
Buying sends **real DOGE to your own paper-wallet address**; the app **watches**
that address and shows the on-chain balance. You self-custody (paper key); the
coins are yours, on-chain, immediately — nothing to pay out in June.

## 1. The lesson

Work early → earn candy early → buy DOGE while it's cheap → hold a real,
self-custodied, (maybe) appreciating asset instead of a candy you ate in 30
seconds. Two kids with equal effort can finish the year very differently based on
*when* they converted and *whether* they held. Plus real-world skills: paper
wallets, addresses, on-chain confirmation, self-custody, volatility.

## 2. Core model

```
   EFFORT (real work)
        │  FIXED: 36 pts → 1 candy  ($0.036)         [app-tracked]
        ▼
   🍬 CANDY balance ── eat ──▶ consumed (you hand out the candy)
        │
        │  BUY DOGE at the LIVE price
        │  candy_per_DOGE = DOGE_usd / 0.036   ← FLOATS (2.4 now … 33 later)
        ▼
   teacher SENDS real DOGE to the kid's paper-wallet ADDRESS  (at grade-sync)
        ▼
   Ɖ on-chain balance ── app WATCHES the address (read-only) ──▶ shown in wallet
        ▼
   year-end: nothing to do — the kid already holds the coins (paper key)
```

## 3. Economics — why your $300 is safe

- **Candy is the dollar reserve.** You get paid in dollars; candy is bought in
  dollars; both stable. The **$300** caps everything.
- **A conversion costs you the candy-value, period.** Kid spends `c` candy
  (= `c × $0.036`) → you send `c × $0.036 / DOGE_usd` coins → your cost is
  `c × $0.036`, *independent of the DOGE price*. Sum over all kids ≤ $300.
- **Crash-proof:** DOGE at $0.0001 → a kid's $0.88 buys 8,800 coins and you pay
  $0.88. DOGE at $1 → same $0.88 buys 0.88 coins, you pay $0.88. The kid's *bet*
  is whether their coins appreciate; your spend never moves.
- Realistically kids earn a fraction of the ~10k pts/yr, so actual spend < $300.
- **Custodial price-window exposure (the one gap):** coins are priced at **buy**
  time but you fund/send them **later** (mark-sent / `doge-send.mjs`). The $300
  caps candy-**dollars** forgone, *not* the coin-**dollar** cost at deposit — if
  DOGE rises between a kid's buy and your send, sourcing the banked coins costs
  more than the candy-dollars debited. **Mitigation:** deposit promptly, or hold a
  small DOGE float (§13, Funding float) bought near the kids' buy prices so your coin cost is
  locked when theirs is. (The candy reserve itself never has price risk; only the
  buy→deposit lag does.)

## 4. The fixed numbers (frozen at outset)

| Constant | Value | Note |
|---|---|---|
| `CANDY_USD` | **$0.036** | $13 / 360-pc bag |
| `POINTS_PER_CANDY` | **36** | makes ~10k pts/kid ≈ $10 ≈ 1/30 of $300 |
| `DOGE_usd` | live (~$0.088) | from the oracle, §5 — the only thing that floats |
| Budget | **$300** | ≈ 8,300 candy; ≈ 3,400 DOGE today |
| Class | **30** | B + E |

> `POINTS_PER_CANDY = 36` assumes ~10k effort pts/kid/yr (estimated from your
> "168 ≈ 1.3 lessons" anchor). It's the one tunable; once real accrual data lands
> a few weeks in, nudge it so the budget lands on $300. Freeze it after that.

## 5. Feeds (two of them)

1. **Price oracle — DOGE/USD.** Roster-server fetches CoinGecko
   (`/simple/price?ids=dogecoin&vs_currencies=usd`), caches ~5 min, and **stamps
   the price into every conversion** (audit: "bought 1 DOGE @ 2.4 candy, Sep 14").
   Server-side so a kid can't spoof a cheap rate. Grade-sync also snapshots a
   daily price → the in-app chart.
2. **Watch-only chain feed — address balances.** Poll a block-explorer API
   (BlockCypher / Dogechain) for each registered address: confirmed balance +
   incoming txs. **No keys, no full node, no blockchain download.** (A self-hosted
   `dogecoind` watch-only node is possible for full trustlessness — §13.)
   > **SHIPPED (`roster-server/doge-chain.js`):** mainnet `D…` → **BlockCypher**.
   > **Testnet has NO provider wired** (Blockchair has no `dogecoin/testnet` chain,
   > BlockCypher none either) → a testnet read returns an explicit error; registration
   > is mainnet-`D…`-locked anyway (`/wallet/address` validator, exactly 34 chars).
   > Server-side proxy (browser CORS + rate limits), 5-min cache, last-good-on-failure
   > (durable across restarts via the 0020 columns). Endpoints `GET /wallet/chain`
   > (student's own) + `GET /class/wallets/chain` (teacher, batched, optional `?section=`).
   > Cache columns = **migration `0020` (USER-RUN, OPTIONAL)**; the live read works with
   > only `0019` + a registered address. **Rate limits:** the teacher dashboard batch is
   > one-shot, but the Desk polls **per open wallet** every 5 min — BlockCypher's free
   > tier is ~100 req/hr unauthenticated, so set Railway env **`BLOCKCYPHER_TOKEN`** once
   > more than a handful of wallets stay open. Widening to testnet needs both a real
   > DOGE-testnet read API AND the `/wallet/address` validator widened.

## 6. Student wallet — states & the forced choice

Shows **🍬 candy** (app balance) and **Ɖ DOGE** (on-chain, watch-only).

- **Earn:** finishing work credits candy (from effort points).
- **Forced declaration:** at session end — or at the **start of the next session**
  for the prior one — the student must pick **Eat** or **Buy DOGE** for that
  session's candy. A pending banner nags until they choose. Undecided past the
  grace window → **candy** (you can't conscript a kid into a DOGE bet).
- **Buy DOGE:** converts at the server's live rate; logs a **send intent**. The
  coins land when you run the grade-sync send (§10), then the watch-only feed
  shows them confirming. One-way (no sell-back).
- **Eat:** logs a candy redemption so your physical counts reconcile.

## 7. Pedagogical surfaces

- **Live value:** "Ɖ 12.0 — $1.06 today · = 30 candy you didn't eat."
- **Cost basis:** "You bought at avg **2.1 candy**; it's **2.4** now — up 14%."
- **Projection:** "If DOGE → $1 by June: **$12.00**."
- **Real chain:** a link to the kid's address on a block explorer ("this is real —
  here's your transaction"). Take the paper wallet home, import it into any DOGE
  app, it's really yours.
- **Price chart** from the daily snapshots, with your buy points marked.

## 8. Data model (roster-server, additive)

```
doge_account            (one row per student)
  student_id  PK/FK
  doge_address    TEXT      -- the kid's paper-wallet PUBLIC address (watch-only)
  candy_balance   NUMERIC   -- earned, unspent candy (app truth)
  candy_eaten     NUMERIC   -- lifetime consumed (reconciliation)
  doge_cost_basis NUMERIC   -- total candy spent buying DOGE (avg-price display)
  chain_doge        NUMERIC   -- last watch-only confirmed on-chain balance (cached, migration 0020)
  chain_unconfirmed NUMERIC   -- last unconfirmed/mempool balance (cached)
  chain_tx_count    INTEGER   -- tx count at last sync
  chain_synced_at   TIMESTAMP -- when the watch-only read last succeeded

effort_ledger           (append-only)
  id, student_id, ts, session_key
  kind            TEXT      -- 'earn' | 'eat' | 'buy_doge'
  candy_delta     NUMERIC
  doge_delta      NUMERIC   -- coins bought (buy_doge)
  doge_price_usd  NUMERIC   -- stamped
  candy_per_doge  NUMERIC
  send_txid       TEXT      -- the on-chain send (filled at grade-sync)
  status          TEXT      -- 'pending_send' | 'sent' | 'confirmed' | 'settled'

doge_price_snapshot     (ts, price_usd, source)   -- daily, for the chart
```

`(student_id, session_key, kind)` unique → re-sync never double-credits.

> **Key backup (decision, §13):** the paper keys are the kids' to self-custody, but
> lost paper = stuck coins. Recommend you keep a **sealed offline backup** of the
> address↔key map (a printed sheet in a drawer) so a lost wallet is recoverable.
> The *app/server never stores private keys.*

## 9. API endpoints

**Student (Bearer):**
- `GET  /wallet` → candy, on-chain DOGE, candyPerDoge, dogeUsd, costBasis, history,
  pending declarations
- `POST /wallet/declare` `{ session_key, choice: 'eat'|'buy_doge' }`
- (read-only DOGE — no spend endpoint exists in the web app, by design)

**Teacher (requireTeacher):**
- `POST /wallet/address` `{ student_id, doge_address }` — register a paper wallet
- `GET  /class/sends` → all `pending_send` buys (address, coins, price) for the
  grade-sync sender to broadcast
- `POST /class/sends/confirm` `{ entries:[{id, txid}] }` — record broadcast txids
- `GET  /class/wallets` → class hold-vs-eat split, $ exposure, totals
- `POST /class/price/refresh` — snapshot price (grade-sync calls this)

## 10. Sending workflow + automation (the "mini")

The **spending key never touches the web.** It lives in a wallet on your **home
laptop** (the same machine that runs the Schoology grade-sync). A small
`tools/doge-send.mjs` step, run with the sync:

1. `POST /class/price/refresh` — snapshot today's DOGE price.
2. Recompute effort → credit new candy (idempotent by `session_key`).
3. `GET /class/sends` — the queued DOGE buys.
4. **Batch-broadcast** one transaction with many outputs (cheap, one fee) sending
   each kid's coins to their address; post the txids back via `/class/sends/confirm`.
5. The watch-only feed then shows the coins confirming in each kid's wallet.

No year-end payout — it's continuous and on-chain. (Funding: keep a small DOGE
float on the laptop wallet, topped up toward the $300 as conversions happen.)

## 11. UI / copy

Lives in the existing **My Ledger** window: candy + DOGE header, the forced
session declaration, the value/cost-basis/projection lines, the explorer link, the
price chart. Ties into the Start-Here orientation explainer.

## 12. Trust, fairness, fees

- **App is watch-only** — no private keys anywhere in the web/server. Spending is
  manual, batched, on your laptop.
- **One-way + effort-only faucet** — no churn, no farming; DOGE only from real work.
- **Fees/dust:** Dogecoin fees are small but a tiny early conversion pays a few %
  in fee. **Batch sends** (one tx, many outputs) amortize it — the per-recipient
  marginal fee is ~nothing (the canary's whole-tx fee was 0.0023 DOGE). Because of
  that, the buy **minimum is just a deliberate-conversion gate, NOT a dust guard**:
  set to **5 candy (~1 lesson, ~2 DOGE)** as of 2026-06-16 — still ~200× the dust
  threshold (tuned down from 25 once real accrual showed 25 felt like ~5 lessons).
- **Volatility framing:** holding is a *bet*; some kids win the price lottery. Teach
  it as uncertainty, and keep the candy path always open so no one must gamble.

## 13. Remaining opens

1. **Chain feed:** block-explorer API (light, recommended) vs self-hosted
   `dogecoind` watch-only node (fully trustless, heavy).
2. **Lost-paper-key policy:** keep a sealed teacher backup of keys (recommended) vs
   "you lose it, it's gone" (harsher real-world lesson).
3. **Minimum conversion** — RESOLVED: **5 candy** (deliberate-conversion gate, not a dust guard; batching handles dust). Tuned down from 25 on real accrual data.
4. **Funding float:** pre-load the laptop wallet with ~$300 DOGE vs buy-at-send.
5. **`POINTS_PER_CANDY`** final value — start at 36, retune once real accrual data
   is in, then freeze.

## 14. Build phases

1. **MVP** — (a) a teacher **paper-wallet generator** tool (offline keypairs + a
   printable sheet w/ QR); (b) Desk wallet showing 🍬 candy (app) + Ɖ DOGE
   (watch-only via explorer API) + the forced session choice + value/cost-basis/
   projection. Sends done by you manually at first. Demoable without the full
   backend.
2. **Backend** — §8 tables + §9 endpoints in roster-server (auto-deploys; grade-
   adjacent, flagged on push). Cross-device + teacher class view + send queue.
3. **Automation** — `tools/doge-send.mjs` batch sender + price/chain snapshots
   folded into the grade-sync.

---
*Mark up §13 and I'll build Phase 1 (generator + the watch-only Desk wallet).*
