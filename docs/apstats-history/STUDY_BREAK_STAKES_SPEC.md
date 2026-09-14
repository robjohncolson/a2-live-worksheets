# STUDY BREAK STAKES — bet 1 candy on a Tetris match (escrow + best-of-3 + Casino Stats)

> Status: SPEC (awaiting sign-off). Author session 19 (2026-06-18).
> Touches **roster-server** (`master`, auto-deploys to Railway on push — grade/money-adjacent) +
> the Desk (`ap_stats_roadmap_square_mode.html`). **Candy is real money (≈$0.036/candy)** under the s17
> conservation model, so this MUST re-run the conservation audit before shipping.
> Prerequisite DONE: Study Break now runs under the real roster identity on one socket (`c8c88f0`).

## 1. Teacher-locked decisions (session 19)

- **D1 — Real candy, always.** Every multiplayer (1v1) match stakes **1 candy** per player. You consent by
  ACCEPTING the challenge — there is no separate friendly/ranked toggle. "A Tetris ace can only take from a
  less-skilled kid if that kid chooses to play." Both players must have **≥1 candy** to start; otherwise the
  challenge is declined ("needs 1 candy to play"). **Solo play is always free** — stakes apply ONLY to 1v1.
- **D2 — No ante.** No per-game cost-to-play. The only candy movement is the zero-sum bet.
- **D3 — Best-of-3.** A staked match is best-of-3 games; the first to 2 game-wins takes the pot. ONE escrow
  per match, resolved once at match end. Reduces the chance a single fluke costs candy.
- **D4 — Casino Stats lab.** Track per-student wins / losses / net candy / games, and surface expected value
  + variance — a probability lesson. No daily loss cap, no reserve floor (the consent gate is the protection).

## 2. The bet (zero-sum) + conservation

A bet is a conditional gift held in escrow. Net effect of a resolved match: **winner +1 candy, loser −1** —
zero-sum across the class (s17 invariant I2). The 1/4-of-the-class total is unchanged; only ownership moves.

**Extended identity (adds one term, `Escrowed`):**
```
Earned + Received + Realized  ==  Gifted + Converted + Materialized + Escrowed + Owed
Owed (spendable) = max(0, Earned + Received + Realized − Gifted − Converted − Materialized − Escrowed)
```
While a match is live, each player's 1 staked candy sits in `Escrowed` — debited from `Owed` (so it can't be
double-spent) but NOT destroyed and NOT in anyone's spendable balance. On resolve it moves: the winner's own
stake returns to `Owed` and the loser's stake becomes the winner's `Received` (a `gift_in`); the loser's stake
leaves `Escrowed` consumed-into-gift. On refund, both stakes return to `Owed`. The books always close.

Enforced in BOTH places (CANDY_LEDGER_SPEC #2): the SQL spendable guard (all of `doge_spend`/`doge_gift`/
`doge_sell` gain `− candy_escrowed`) AND JS `deriveBalances` (`doge-wallet.js`, add `− escrowed`).

## 3. Anti-cheat — the server has ZERO game truth

The match is peer-to-peer (WebRTC; the cr server only relays). So the winner is **self-reported by both
clients**. The ONLY safe resolution:

- **Escrow at match start.** When both accept, BOTH clients POST `bet/open`; the server atomically debits 1
  candy from each into escrow (atomic both-or-neither — if either can't afford, the whole match is declined).
- **Both-confirm-or-refund.** At match end both clients POST `bet/resolve` with who they think won. If they
  AGREE → release the 2-candy pot to the winner. If they DISAGREE or one never reports within a timeout →
  **refund both** (zero-sum, nothing created/destroyed). Never trust a lone "I won".
- **Disconnect = refund (accepted caveat).** A mid-match drop yields no mutual confirmation → refund. This
  means a losing kid CAN rage-quit to void the bet (no candy lost by either). Accepted: refund is the safe
  failure mode (no theft), and the social cost (peers watched you quit) discourages it. Revisit only if abused.

## 4. Server (roster-server)

### Migration `00XX_tetris_stakes.sql` (USER-RUN; additive, CREATE-OR-REPLACE-safe)
- `alter table doge_account add column candy_escrowed numeric not null default 0;`
- `create table tetris_bet ( match_id text primary key, player_a uuid, player_b uuid, stake numeric not null,
   a_winner uuid, b_winner uuid, status text not null default 'open', created_at timestamptz default now() );`
   (status ∈ open | settled | refunded). The running `candy_escrowed` column is the conservation hook; this
   table is the per-match bookkeeping (timeout sweep + crash recovery, mirroring the s16 sell journal).
- Widen `doge_ledger` kind CHECK to add `bet_hold`, `bet_win`, `bet_loss`, `bet_refund` (additive, 0021 pattern).
- 3 atomic plpgsql fns on the `doge_gift` `FOR UPDATE → guard → conditional-UPDATE → null-on-fail → ledger-leg`
  template: `tetris_bet_open(match_id, a, b, stake, earned_a, earned_b)` (locks both rows, guards each spendable
  ≥ stake, debits both into `candy_escrowed`, inserts the `tetris_bet` row, logs two `bet_hold` legs; returns
  null if EITHER guard fails); `tetris_bet_settle(match_id, winner)` (winner: `candy_escrowed −= stake` back to
  Owed + `candy_gifted_in += stake`; loser: `candy_escrowed −= stake` consumed; legs `bet_win`/`bet_loss`;
  status=settled); `tetris_bet_refund(match_id)` (both `candy_escrowed −= stake` back to Owed; legs `bet_refund`;
  status=refunded). Idempotent on status so a double-POST can't double-pay.
- Re-add `− candy_escrowed` to the spendable guard inside `doge_spend`/`doge_gift`/`doge_sell` (CREATE OR REPLACE).

### Endpoints (`doge-wallet.js`, behind `STAKES_ENABLED` env kill-switch, default ON like gifting)
- `POST /wallet/bet/open` `{ matchId, opponentUsername }` → resolves both `student_id`s server-side, same-section
  guard, both active students, `tetris_bet_open`; 400 "needs 1 candy" if either guard fails. Both clients call
  it (idempotent on `match_id` — second call is a no-op confirm).
- `POST /wallet/bet/resolve` `{ matchId, winnerUsername }` → records THIS caller's reported winner on the row;
  when both `a_winner` and `b_winner` are set: agree → `tetris_bet_settle`; disagree → `tetris_bet_refund`.
- Server timeout sweep: a `tetris_bet` still `open` after N minutes → `tetris_bet_refund` (crash/abandon safety).
- `GET /wallet/casino` (+ `/class/casino` for the teacher): per-student wins/losses/net-candy/games from the
  `bet_*` ledger legs; the client computes EV/variance for the lab.

## 5. Client (the Desk, `ap_stats_roadmap_square_mode.html`)

- **Eligibility:** before sending/accepting a 1v1 challenge, check the wallet has ≥1 candy; else show "needs 1
  candy to play" and block (solo stays free). Show "1🍬 at stake" on the challenge prompt so consent is informed.
- **Escrow on accept:** when a match is agreed (challenge_accept → match_start), the accepting + challenging
  clients each `POST /wallet/bet/open` with a shared `matchId` (derive deterministically from both usernames +
  the match-start payload). If `bet/open` fails (can't afford / not provisioned), abort the match cleanly.
- **Best-of-3:** wrap the existing single-game match in a best-of-3 wrapper (track game-wins; first to 2 ends
  the match). Live "pot 2🍬" indicator during play.
- **Resolve:** at match end both clients `POST /wallet/bet/resolve` with the winner. Show the candy result
  ("+1🍬" / "−1🍬", or "refunded — no agreement"). Refresh the wallet.
- **Casino Stats lab:** a small panel (in My Ledger or the game over-screen) reading `/wallet/casino`: your
  W-L, net candy, games, and computed EV + variance; teacher sees `/class/casino`. The probability framing.

## 6. Conservation audit (REQUIRED before ship — candy is real money)

Extend the s17 3-layer harness (`WALLET_CONSERVATION_AUDIT_SPEC.md`) for the new `Escrowed` term + bet legs:
- **Foundation** `wallet-world.js`: add escrow to the reducer + invariants (new: I-escrow = Σ candy_escrowed ==
  Σ open-bet stakes; bet settle/refund are zero-sum; a settled bet never changes the class total).
- **Layer A** fast-check: fuzz open→settle / open→refund / interleaved spends-while-escrowed.
- **Layer B** pglite differential of the REAL `tetris_bet_open/settle/refund` plpgsql vs the reducer (the
  headline — closes the "fake copies the SQL" gap).
- **Layer C** Redex: extend the column model with the escrow term.
Then a multi-lens adversarial review of the implementation (the s16/s17 playbook).

## 7. Build phases (proposed)

1. **Backend + audit** (in-session — the critical, money-touching part): migration + 3 atomic fns + endpoints +
   guard/deriveBalances re-base + extend the conservation audit (A/B/C) + adversarial review. Migration USER-RUN.
2. **Client match-wiring**: eligibility gate, escrow-on-accept, best-of-3 wrapper, resolve, pot indicator.
3. **Casino Stats lab**: `/wallet/casino` + the EV/variance panel.

## 8. Open design questions (flag before/at build)

- **matchId derivation** — must be identical on both clients + unguessable enough that a third party can't
  forge a `bet/resolve`. Proposal: `sha(min(a,b)+'|'+max(a,b)+'|'+matchStartNonce)`; the server also checks the
  caller is a participant.
- **Disconnect policy** — default refund (§3), teacher-accepted (rage-quit-voids is the safe failure).
- **Stake size** — fixed at 1 candy (D1). Could later be teacher-set; out of scope now.

## 9. Phase 1 SHIPPED + adversarial review (s19)

**Backend shipped + conservation-proven** (migration `0024` USER-RUN; endpoints behind `STAKES_ENABLED`; no client
wires them yet, so nothing is live until the migration runs AND Phase 2 lands). Conservation audit `9→14` tests:
Layer A 600 reducer fast-check runs, Layer B **120 real-plpgsql pglite differential** runs, + lifecycle pins.
roster-server 1042/1042.

A 3-lens adversarial review (18 agents, 12 confirmed) ran on the backend. **Fixed before push:**
- **MAJOR — mark-given × escrow mint race:** the JS materialize clamp could miss a concurrently-committed escrow →
  over-materialize → negative Owed → minted candy on a loss-settle. FIXED with the atomic **`doge_mark`** plpgsql
  (recomputes the cap from the live row under a lock; also closes the prior accepted F1 mark residual).
- **matchId hijack:** a third party could pre-create a row to occupy `player_a` of someone's match. FIXED — each
  joiner must name the recorded opponent (`p_opp` bound to the counterpart), else `not-a-player`.
- **delete-mid-bet stuck escrow:** deleting a student mid-bet FK-failed the refund, freezing the survivor's candy.
  FIXED — the refund logs a leg only for players whose roster row still exists, so the survivor recovers.
- **sweep too aggressive:** `BET_TIMEOUT_MIN` 10→**30 min** (comfortably exceeds a best-of-3 so a live match isn't swept).
- **info-leak:** `bet/open`/`bet/resolve` now return an opaque `404` for not-a-player/no-bet (a non-participant
  can't tell a non-existent match from one they're not in).

**Deferred to Phase 2 (client) — noted, not blocking:**
- **matchId derivation must use a fresh per-attempt nonce** exchanged P2P (so an `insufficient`/void can't burn a
  real match's id, and a third party can't guess it). The §8 `sha(min|max|matchStartNonce)` proposal stands.
- **Caller-role guard in bet/open** (nit; the bidirectional join already prevents a teacher/archived caller from
  escrowing — the opponent's join rejects them). Add a caller active-student check when convenient.
- **bet_win ledger leg = gross-pot (2·stake)** is cosmetic — per-player legs sum correctly (`bet_hold −stake` +
  `bet_win +2·stake` = net +stake); balances never read the ledger. Left as-is (documented gross-pot model).
- **sweep only fires on bet/open** — DB-wide, so it clears school-wide whenever any bet opens; a low-frequency
  `setInterval` is optional hardening for Phase 2.

## 10. Phase 2 (client) — SHIPPED

Wired into the Tetris match flow (all in `studyBreak`, `ap_stats_roadmap_square_mode.html`):
- **1v1 is now BEST-OF-3** (first to 2 game-wins). One shared escrow spans the series.
- **matchId = the server-minted `roomId`** from `match_start` (shared + unguessable on both clients) — this
  *resolves* the deferred §8 matchId-nonce concern: no client-side derivation, the server already mints it.
- **Escrow on match start** — both clients `POST /wallet/bet/open {matchId: roomId, opponentUsername}`
  (`_studyBreakArmStakes`). FULLY GRACEFUL: a guest / stakes-off / pre-migration / insufficient response just
  leaves the match unstaked (free) — the existing Tetris never breaks.
- **Best-of-3 series tracking** at the single game-over choke point (`drawGameOverCard → _studyBreakScoreGameOnce`,
  guarded once-per-game): win→myWins++, loss→oppWins++; at 2 wins (or a forfeit) the series ends. Auto-advances
  between games (`setTimeout startNewGame`).
- **Resolve on series end** — `_studyBreakResolveStakes` posts the winner to `/wallet/bet/resolve` (both-confirm →
  settle, disagree/timeout → refund). The game-over card shows the series score + the candy outcome (+1/−1/refunded).
- **Casino Stats lab** (`_studyBreakCasinoLine`) — the lobby shows W-L / net candy / **EV per game** from
  `/wallet/casino` (the probability lesson). Challenge dialog shows "best of 3 · winner takes 2 🍬".

**2-lens adversarial review** (no money-theft/mint path found — candy is fully server-safe via both-confirm-or-refund).
**Fixed before push:** (1) a forfeit landing in the 3s auto-advance window was swallowed → ended the series
immediately in `opponentLeft` (no ghost game; reports me as the winner); (2) post-series R/Enter started a phantom
game → `startNewGame` early-returns when `seriesOver`; (3) `close()` now clears the auto-advance timer before nulling
`mpState`. **Accepted (candy-safe, documented):** simultaneous double-topout → the series refunds (rare); a mid-series
rage-quit → refund (the agreed disconnect-voids behavior). Tests: `tests/study-break-stakes.test.js` (18) runs the
real extracted methods + source-pins the hooks; root suite green except the 6 pre-existing onboarding failures.

**Live now** (migration `0024` is run): a staked best-of-3 fires whenever two signed-in classmates with ≥1 candy
play 1v1; everyone else plays free. `STAKES_ENABLED=false` on Railway is the kill-switch.
