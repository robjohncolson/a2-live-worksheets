# DOGE Effort Wallet — Candy Gifting Spec (kid → kid transfers)

> Status: **SPEC ONLY — not built.** Contract for review (2026-06-16). Extends
> `DOGE_WALLET_SPEC.md`. The teacher asked: "kids send each other '5 candies' worth"
> — and noted that in-app balances are custodial, so a transfer needs no on-chain
> fee/minimum until a kid commits to a real DOGE send. Both observations are correct;
> this spec turns that into a guarded, abuse-resistant feature.

## 1. The idea (and why it's mechanically free)

Candy + app-tracked DOGE are **custodial within the app** — the real coins sit in
the teacher's float until the batched grade-sync send (`doge-send.mjs`). So a
kid→kid transfer is **a pure ledger move**: debit the sender, credit the recipient,
zero on-chain activity, **no fee, no minimum**. The only place real fees/dust ever
apply is the eventual batch send, which a transfer merely *retargets* (the teacher
ends up sending to the recipient's address instead of the sender's). The teacher
never has to do anything per-transfer.

**Scope decision (teacher, 2026-06-16): gift CANDY** (the friendlier "send 5
candies" UX), accepting the schema change below. (The lighter DOGE-only variant
was the alternative; candy was chosen.)

## 2. The tension this must respect

`DOGE_WALLET_SPEC.md` §12 is **"DOGE only from real work — no churn, no farming."**
Transfers let a kid hold candy they did not earn, which opens two risks:

- **Effort-laundering** — a kid does work, gifts the candy away; the recipient's
  *spendable* balance rises without effort.
- **Coercion** — "give me your candy" pressure between students.

This spec keeps the faucet honest by separating **earned** from **spendable**:

- The teacher's **"candy earned" / effort metric stays PURE** — it is still
  `computeEffort(ledger receipts)` (real work only). Gifting **never** touches it.
  The gradebook/effort view is unpolluted; a gift moves *spendable* candy, not
  *earned* credit.
- Gifting is **zero-sum** → the **$300 budget is unaffected**. Total candy in
  circulation is unchanged; the teacher's total physical-candy liability is still
  `Σ candy_eaten` (a gift only shifts *who* eventually eats/holds it). Proof: if A
  gifts B 5 and B eats them, B's `candy_owed` rises 5 and A can no longer eat those
  5 — the 5 the teacher owes just moved from A to B. Net liability constant.

## 3. Data model (additive — migration `0021`)

Today: `spendable = earnedCandy − candy_eaten − doge_cost_basis`.
With gifting:

```
spendable = earnedCandy − candy_eaten − doge_cost_basis − candy_gifted_out + candy_gifted_in
```

```sql
-- 0021_doge_gifting (USER-RUN, additive)
alter table doge_account add column if not exists candy_gifted_out numeric not null default 0;  -- candy this kid sent away
alter table doge_account add column if not exists candy_gifted_in  numeric not null default 0;  -- candy this kid received
-- doge_ledger.kind CHECK currently allows ('eat','buy_doge','give','send').
-- Add the two transfer legs:
alter table doge_ledger drop constraint if exists doge_ledger_kind_check;
alter table doge_ledger add  constraint doge_ledger_kind_check
  check (kind in ('eat','buy_doge','give','send','gift_out','gift_in'));
```

`deriveBalances()` (roster-server/doge-wallet.js) adds `− candy_gifted_out + candy_gifted_in`
to `candyBalance` (and to `candyBalanceRaw`). `/class/wallets` surfaces both new
fields so the teacher dashboard can show net flow + audit.

## 4. Atomic transfer (migration `0021`, mirrors `doge_spend`)

A transfer must debit A and credit B in ONE transaction, guarded on A's spendable.

```sql
create or replace function doge_gift(
  p_from uuid, p_to uuid, p_candy numeric, p_earned_from numeric
) returns doge_account
language plpgsql as $$
declare result doge_account;
begin
  if p_from = p_to then return null; end if;
  if p_candy <= 0 then return null; end if;
  insert into doge_account (student_id) values (p_from) on conflict do nothing;
  insert into doge_account (student_id) values (p_to)   on conflict do nothing;
  -- Guarded debit of the SENDER (re-evaluates spendable against the live row).
  update doge_account
     set candy_gifted_out = candy_gifted_out + p_candy, updated_at = now()
   where student_id = p_from
     and (p_earned_from - candy_eaten - doge_cost_basis - candy_gifted_out + candy_gifted_in) >= p_candy - 1e-9
  returning * into result;
  if result.student_id is null then return null; end if;          -- insufficient → no credit
  update doge_account set candy_gifted_in = candy_gifted_in + p_candy, updated_at = now()
   where student_id = p_to;
  insert into doge_ledger (student_id, kind, candy_delta) values (p_from, 'gift_out', -p_candy);
  insert into doge_ledger (student_id, kind, candy_delta) values (p_to,   'gift_in',   p_candy);
  return result;  -- sender's updated row, or NULL when the guard failed
end; $$;
```

`db.dogeGift(params)` = `client.rpc('doge_gift', params)`. The same row-of-nulls
guard the endpoints already use applies (`!r.data.student_id` → "not enough candy").

> The shipped function (migration `0021`) also takes a `p_cap` parameter and, after a
> `SELECT … FOR UPDATE` lock on the sender's row, rejects (returns null) when the
> rolling-24h `gift_out` sum + this gift would exceed the cap — making the daily cap
> hard against concurrent bursts. The illustrative SQL above omits that for clarity;
> the migration file is authoritative.

## 5. Endpoint — `POST /wallet/gift` (student auth = the sender)

```
body: { toUsername, candy }
```
The recipient is picked by their **public username** — the roster endpoint never
exposes `student_id`s, so we resolve username → student_id server-side.

Validations, in order (reuse helpers already in doge-wallet.js):
1. `sid` from token (else 401).
2. `candy` is a positive **whole** number (gifts are integer candy — no dust-of-candy, matches "send 5"); else 400.
3. `toUsername` required (else 400); `db.findByUsername(toUsername)` → 404
   ("unknown classmate") if no such student; then `toStudentId === sid` → 400
   ("can't gift yourself").
4. **Same section only** — the resolved recipient must share the sender's section
   (`db.findByStudentId(sid).section === recipient.section`; a classroom economy, not
   school-wide). Else 404 ("not in your class").
5. **Daily cap** — sum of today's `gift_out` for the sender from `doge_ledger`
   ≤ `DAILY_GIFT_CAP` (propose **20 candy/day**). Over → 429 ("daily gift limit").
6. **Kill-switch** — if `GIFTING_ENABLED` (env, default `true`) is off → 403
   ("gifting is turned off"). Lets the teacher disable class-wide instantly.
7. `earnedFrom = computeEffort(sender ledger).candy`; call `db.dogeGift({p_from:sid,
   p_to:toStudentId, p_candy:candy, p_earned_from:earnedFrom})` (where `toStudentId`
   is the server-resolved id from step 3).
8. `!r.data.student_id` → 400 "not enough candy". Else 200 with the sender's new balance.

503-graceful pre-`0021`: the only reachable pre-migration state is the `doge_gift`
function being absent → PostgREST `PGRST202` / Postgres `42883` (function-not-found),
which `isDogeMissing` already catches → clean 503. (The new columns are only ever
read via `select('*')`→`num()`→0, never named in a query, so `42703`/`PGRST204`
cannot surface on this path — no extra codes needed.)

## 6. UI — Desk My-Ledger ("🎁 Gift candy")

In `_dogeWalletRender` (the wallet panel), when `candyBalance >= 1`, add a **🎁 Gift
candy** button beside Eat / Buy. It opens a small inline picker:
- a `<select>` of classmates (the section roster — reuse the Desk's existing
  `/roster/section/:section` fetch; exclude self + teacher/test accounts),
- a whole-number amount input (max = floor(candyBalance), and ≤ the daily-cap remaining),
- a **Confirm** that POSTs `/wallet/gift`, then re-renders the wallet.

A successful gift shows a one-line "🎁 sent N candy to <name>". The recipient sees a
`gift_in` row in their ledger feed (already rendered from `/wallet` history). Keep it
behind the same `_dogeWalletPreviewOn()` gate as the rest of the wallet.

## 7. Teacher visibility

`/class/wallets` returns `candyGiftedOut` / `candyGiftedIn` per kid; the dashboard
Reward Disbursement adds a small "net gifted" indicator so the teacher can spot
lopsided flows (a coercion smell). All transfers are in `doge_ledger`
(`gift_out`/`gift_in`) for a full audit. (The teacher's "to give" / "to deposit"
math is unchanged — gifting doesn't alter physical-candy or DOGE liability.)

## 8. Guardrails summary (the anti-abuse contract)

| Guard | Value | Defends |
|---|---|---|
| Daily cap per sender | 20 candy/day, **HARD** | farming velocity, coercion |
| Recipient must be an active student | enforced (role≠teacher, status=active) | parking candy in the teacher/dead accounts |
| Same-section only | enforced (latent — see note) | school-wide laundering rings |
| Whole candy, positive, not-self | enforced | dust, self-deal |
| Earned/effort metric untouched | by design | effort-laundering of the *grade* |
| Teacher kill-switch | `GIFTING_ENABLED` env (`false`/`0`/`no`/`off`) | instant class-wide off |
| Full audit | `doge_ledger` gift_out/in | teacher oversight |
| Atomic guarded debit + cap | `doge_gift()` row-locked | double-spend / overdraft / cap-burst |

> **Daily cap is HARD:** enforced both in the route (friendly 429 fast path) AND
> inside `doge_gift()` under a `SELECT … FOR UPDATE` row lock (the route passes
> `p_cap`), so concurrent gifts from one sender serialize and can't burst past the
> cap. A rare race loses the friendly 429 message (falls to a 400 "not enough candy")
> but is still rejected.
>
> **Same-section is latent today:** every self-signup student is in the single
> universal section `PeriodX` (signup-config.js `DEFAULT_SECTIONS`; `OPEN_SIGNUP_SECTIONS`
> unset), so the section check (doge-wallet.js) is a STRUCTURAL guard that only bites
> once real per-period sections are assigned. Until then the daily cap + the
> recipient-is-active-student check carry the anti-laundering/anti-coercion load.

## 9. Tests (when built)

- `doge_gift` conservation: A+B total spendable constant across a gift; overdraft
  rejected; self-gift / non-positive rejected; row-of-nulls guard.
- Route: 401 (no token), 404 (unknown username / cross-section recipient), 400
  (missing `toUsername`, non-whole candy, self target, insufficient), 429 (daily
  cap), 403 (kill-switch off), 200 happy path + balance.
- Effort purity: a gift does NOT change either kid's `computeEffort` candy.
- Budget invariant: Σ liability unchanged after a gift+eat.
- 503 pre-`0021`.
- Desk: picker excludes self/teacher, caps the amount, re-renders on success.

## 10. Build phases (follow-on, when approved)

1. Migration `0021` + `db.dogeGift` + `deriveBalances`/`/class/wallets` field wiring.
2. `POST /wallet/gift` + guardrails + tests.
3. Desk 🎁 picker + recipient feed.
4. Dashboard net-gifted indicator.

— *Roster-server changes auto-deploy on push (flag it). All additive + 503-graceful
pre-`0021`, like the rest of the wallet.*
