# WALLET_REDESIGN_SPEC — "Candy & DOGE" panel (declutter the My Ledger wallet block)

> **Status:** built (2026-06-17, s16 follow-on). Teacher: "the candy/DOGE block is cluttered." A 6-lens
> design panel (System-7-native + info-hierarchy winners) → synthesis → adversarial critique → folded.
> Pure presentation refactor of `_dogeWalletRender` in `ap_stats_roadmap_square_mode.html`; reuses every
> existing helper + POST endpoint (display-only, server-authoritative). No backend/migration change.

## The problem (from a real screenshot)
The old block packed ~5 dense geneva lines + 2 always-open input rows + a toggled gift form into one
sub-card: an L1 ledger line, an L2 middot run-on (5 facts wrapping to 2 lines), an on-chain line, a
Buy row, a Gift form, a gain line, and a Cash-out row — all 10px, no hierarchy. Plus a rounding wart:
"worth **0.7** 🍬 — you put in **1** 🍬 (▲ up 0%)" (0.72 shown two ways on one line).

## The design (System-7-native sub-panel)
A titled bevelled sub-panel that speaks the app's own dialect:

```
┌─ 🍬 Candy & DOGE ──────────────────── ▸ Details ─┐
│  🍬 22 candy to spend                            │   L1 hero (the one number to act on)
│  Ɖ 4.1 saved · worth 10 🍬 · 1.5 Ɖ ready · ▲14%  │   L2 asset line (only if holding DOGE)
│  [ Ɖ Buy ]  [ 🍬 Cash out ]  [ 🎁 Gift ]         │   native .s7btn pills; only valid ones render
└──────────────────────────────────────────────────┘
```
- **Pills open ONE inline form at a time** (mutually exclusive): the active pill inverts (`.s7btn-inv`);
  tapping another swaps the form; tapping the active pill or Cancel closes it. Buy/Cash-out forms show a
  live `→ ≈` preview as the kid types; Gift reuses `_dogeWalletGiftForm` verbatim.
- **▸ Details** (collapsed by default; the app's existing disclosure idiom) reveals the full 7-number
  ledger as a labelled field list with **exact** values (zeros omitted, "To spend or gift" bolded so it
  reconciles to the hero), the DOGE specifics, and the on-chain watch line. The chain self-refresh arms
  **only while Details is open** (a free reduction in BlockCypher polling).

## Critique refinements folded in (the design panel's adversarial pass)
1. **Maturity on the face** — L2 shows `N Ɖ ready` / `ready in ~a day`, so "worth X" never implies
   "cashable now" during the 24h hold.
2. **Direction always shown** — gain chip is `▲ up` / `▼ down` / `≈ even` (only the noisy exact 0%
   collapses to "≈ even"); the "can lose" lesson survives on small amounts.
3. **Exact values in the Details ledger** — `_candyFmt` (glance rounding, e.g. 0.72→"0.7") is used ONLY
   on the face/previews; the Details column prints 2dp so the 7-number identity still sums.
4. **Mobile/tap-targets** — pills use `min-width:0;padding:4px 12px` (the global `.s7btn` is `min-width:80px`,
   which wraps 3 pills on a phone); forms reflow with `flex-wrap`.
5. **No persisted Details-open** — default collapsed every render (calm resting state; avoids re-arming
   the chain poll); disclosure modeled on the existing gradebook collapser.
6. **Honest name** — "Candy & DOGE" (not "Savings", which would imply safety and miseducate the risk).
   Nothing-yet state shows one friendly line and **no** Details affordance.

## On-chain face hint (follow-on)
The watch-only on-chain line moved into ▸ Details to cut BlockCypher polling — but a kid then couldn't
glance at their REAL deposited coins. Added a cheap face hint: `⛓ Ɖ N in your wallet (yours to keep)`
from `dogeSent` (the teacher's deposit total, already in `/wallet`; **no live poll**), shown at rest
whenever `dogeSent > 0` (even when `inApp = 0`, i.e. all coins are on-chain). The **live** blockchain
confirmation + explorer link stay in ▸ Details (self-refreshing only while open). Face = instant glance
from app data; Details = live verified truth.

## States
- **Populated:** hero + asset line + up to 3 pills + Details.
- **All spent (owed≈0) holding DOGE:** hero "🍬 0 — do more work to earn candy", asset line + Cash-out stay; Buy/Gift drop.
- **Nothing yet (no candy, no DOGE):** "Do some work to earn your first candy." — no pills, no Details.

## Implementation
- `_candyFmt(n)` / `_dogeFmt(n)` helpers; `_dogeWalletRender` rewritten; `_walletLedgerDetail(host, w)`
  new (the Details drawer). All in `ap_stats_roadmap_square_mode.html`. Reuses `_dogeWalletAction`
  (`/wallet/buy-doge`, `/wallet/sell-doge`), `_dogeWalletGiftForm`, `_dogeWalletChainArm`.
- Tests: `tests/desk-doge-wallet.test.js` (string pins updated for the new structure) + a new
  **`tests/desk-wallet-render.test.js`** (jsdom — EXECUTES the real panel against mock data: resting,
  rounding fix, maturity cues, edge states, mutually-exclusive forms, exact-value ledger reconciliation).
  Desk wallet UI suites: 35 green. Full root suite green except the 6 pre-existing onboarding failures.
