# DOGE PAYOUT RAIL SPEC — the ✓ sent button becomes ONE button for the whole class

Today, depositing students' DOGE on-chain means the teacher runs
`tools/doge-send.mjs` from a terminal on the machine with Dogecoin Core, then the
dashboard's per-student ✓ sent buttons get marked. This spec turns that into one
dashboard button: **⚡ Deposit all ready** → preview modal → confirm → a payout
agent on the teacher's own machine picks up the sealed batch, broadcasts ONE
`sendmany` transaction paying every ready student at once, and reports the txid
back; the server marks every student ✓ sent atomically and the dashboard shows
the explorer link. Keys never leave the teacher's machine; Railway only ever
holds a work queue.

> **Status:** proposed. **Owner:** teacher. **Workflow:** brainstorm → spec → implement (Codex).
> **Money-moving + a new mutable table + wallet-adjacent writes — this is the
> highest-risk spec in the repo. Two adversarial reviews mandatory (CLAUDE.md);
> every wallet write must go through the EXISTING invariant-checked RPCs; the
> conservation harness must stay green.**

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| Batch on-chain sender: plan from `/class/wallets`, ONE `sendmany` via local Dogecoin Core RPC, dry-run default, crash journal, then `POST /wallet/mark-sent` | `tools/doge-send.mjs` (+ `tests/doge-send.test.js`) | THE payout engine — refactor its plan/send/journal core into a reusable lib; the agent wraps it |
| `POST /wallet/mark-sent` → `doge_mark(p_field:'doge_sent')` — atomic, monotonic (never claws back), capped, `doge_ledger kind='send'` audit row | `roster-server/doge-wallet.js:519,500-517`; SQL `doge_mark` re-created in `0025_review_marks.sql` | the ONLY way payout completion touches a wallet — invariants I5/I7 already prove it safe |
| Deposit-ready worklist (`doge_balance − doge_sent ≥ 5`, address set) | `GET /class/wallets` (`doge-wallet.js:524`), `MIN_MATERIALIZE_DOGE = 5` (`doge-econ.js:17`) | the batch plan's row source — same numbers the Reward panel already shows |
| Watch-only chain reads (never holds a key, never broadcasts) | `roster-server/doge-chain.js`; `GET /wallet/chain`, `GET /class/wallets/chain` | post-payout confirmation display |
| Dashboard 🍬 Reward Disbursement panel: table, `_rewardMark`, ✓ gave / ✓ sent buttons, address entry | `teacher-dashboard.html:522-534,1155-1340` | the button + status strip live HERE; per-student ✓ sent buttons remain the manual fallback |
| Conservation harness (I1–I9; SQL == JS == Redex) | `roster-server/tests/fixtures/wallet-world.js`, `wallet-conservation*.test.js`, `WALLET_CONSERVATION_AUDIT_SPEC.md` | payout completion is `mark-sent` in a loop → already inside the audited surface; extend with a batch-level sum check |
| Signed-receipt precedent: `POST /class/review` mints candy AND a `t:'review'` receipt in one loop | `roster-server/review.js:601-640`, `receipts.js:342-364` | the optional `t:'payout'` receipt copies this exactly |
| `requireTeacher(req, db)` | `roster-server/teacher-auth.js:47-77` | auth for teacher endpoints; agent auth extends it |
| Module mount convention (`mountXxx(app, deps)`, DI, no Router) | `server.js:999-1194` | new `payout.js` module |
| Migration house style (additive, idempotent, USER-RUN, 503-degrade note) | `roster-server/migrations/` — latest is `0031_frq_tickets.sql` | new migration is `0032_payout_batch.sql` |
| Paper wallets + "the app only ever needs the ADDRESS" doctrine | `tools/doge-wallet-gen.mjs`, `DOGE_WALLET_SPEC.md` | unchanged; this spec inherits the custody model |
| Linux-box daemon precedent (nightly backup systemd user timer) | memory/runbooks (`apstats-backup.timer`) | the agent's deployment shape |

## 1. Goals / Non-goals

Goals:
1. One dashboard button that deposits every ready student's DOGE on-chain in a single transaction, with a preview the teacher confirms first.
2. Zero keys on Railway or in any browser, ever. The agent polls OUT from the teacher's machine; nothing connects IN to it.
3. Idempotent end-to-end: double-clicks, agent crashes mid-broadcast, and replayed completions cannot double-pay or double-mark (journal + `doge_mark` monotonicity + one-active-batch rule).
4. Full audit trail: batch row with plan snapshot + txid; per-student `doge_ledger kind='send'` rows (existing); optional signed `t:'payout'` receipt.
5. Dashboard shows batch lifecycle live: `pending → claimed → sent (txid ⛓ link)` or `failed (reason)`.

Non-goals (v1):
- **No teacher-initiated candy→DOGE conversion.** Students remain the only buyers (`/wallet/buy-doge`); the batch only deposits DOGE they already own in-app. (Auto-converting Owed candy for "opted-in" students changes the conservation identity — v2 at most, with its own spec.)
- No student-facing address entry (stays teacher-only via `_rewardSetAddress`).
- No sends below `MIN_MATERIALIZE_DOGE` (no dust).
- No hot-wallet auto-top-up; the teacher funds the sending wallet manually from cold storage.
- No new node infrastructure — whatever machine already runs (or will run) Dogecoin Core hosts the agent.

## 2. The one non-negotiable security rule

The spending key exists ONLY inside Dogecoin Core's wallet on the teacher's
machine. roster-server stores addresses, amounts, batch state, txids — never key
material, never signed transactions. The agent authenticates to roster-server
with a dedicated `PAYOUT_AGENT_KEY` env var (server side: accepted alongside the
teacher key for payout endpoints only), so a leaked agent config can claim
batches but cannot touch grades, roster, or other teacher endpoints.

## 3. Data model — migration `0032_payout_batch.sql`

```sql
create table if not exists payout_batch (
  batch_id    uuid primary key default gen_random_uuid(),
  status      text not null default 'pending'
              check (status in ('pending','claimed','sent','failed','cancelled')),
  plan        jsonb not null,          -- frozen at seal time: [{studentId, address, doge}], total, minPerStudent
  plan_hash   text not null,           -- sha256 of canonical plan; agent re-verifies before sending
  txid        text,
  error       text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  resolved_at timestamptz
);
-- ONE active batch at a time:
create unique index if not exists payout_batch_one_active
  on payout_batch ((true)) where status in ('pending','claimed');
alter table payout_batch enable row level security;  -- no policies; service-role only
```
Until this runs, all `/payout/*` routes 503 (`isPayoutMissing()` mirroring `isDogeMissing()`, `doge-wallet.js:26-38`).

## 4. Server endpoints — new module `roster-server/payout.js` (`mountPayout(app, deps)`)

| Endpoint | Auth | Effect |
|---|---|---|
| `POST /payout/plan` | teacher | recompute the deposit-ready worklist (same math as `/class/wallets` `candyOwed`/deposit columns); return rows + total + `planHash`. Pure read — no writes. |
| `POST /payout/batch` | teacher | body `{ planHash }`. Recompute plan server-side; if hash mismatches (wallet state moved since preview) → 409 with fresh plan. Insert `payout_batch` pending. 409 if an active batch exists. |
| `POST /payout/batch/:id/cancel` | teacher | pending → cancelled (claimed batches cannot be cancelled — the agent may be mid-broadcast). |
| `GET /payout/next` | **agent or teacher** | the oldest pending batch (or 204). Agent poll target. |
| `POST /payout/batch/:id/claim` | agent | pending → claimed (idempotent for the same agent; 409 if sent/failed). |
| `POST /payout/batch/:id/complete` | agent | body `{ txid, outputs: [{studentId, doge}] }`. Verify outputs ⊆ frozen plan (same students, same amounts). For each output: `earnedCandyOf` + `db.dogeMark(p_field:'doge_sent')` — the exact `markEndpoint` path. Set sent + txid. Idempotent: same txid re-post → 200 no-op (dogeMark monotonicity makes re-marks harmless anyway). |
| `POST /payout/batch/:id/fail` | agent | claimed → failed with `error`. |
| `GET /payout/status` | teacher | latest batch (any status) for the dashboard strip. |

Auth plumbing: `requirePayoutAgent(req, db)` = `requireTeacher(req, db) || req.headers['x-payout-agent-key'] === process.env.PAYOUT_AGENT_KEY` (only when the env var is set; no default value — unset means teacher-key-only).

## 5. The agent — `tools/doge-payout-agent.mjs`

Refactor `tools/doge-send.mjs` first: extract its plan/execute/journal core into
`tools/lib/doge-send-core.mjs` (pure functions + injected `runCli`), keep
`doge-send.mjs` as the manual CLI wrapper (existing tests keep passing). The
agent then:

1. Polls `GET /payout/next` every 60s (config: `POLL_SECONDS`).
2. On a batch: `claim` → verify `plan_hash` against its own recomputation of the plan payload → check both the selected Core account and wallet balances cover `total + fee headroom` (abort → `fail` with "insufficient float: have Ɖx need Ɖy") → **journal the intent** (reuse the `.doge-send-journal.json` pattern, keyed by `batch_id`) → arm with the server → one `sendmany` → journal the txid → `complete`.
3. Crash recovery on startup: journal has a batch with a txid but no recorded `complete` → re-post `complete` (idempotent). Journal has intent but no txid → verify via Core (`gettransaction`/listing) whether it broadcast. An armed intent with no matching transaction remains blocked for operator reconciliation; absence alone never authorizes a retry or automatic failure. NEVER auto-retry a broadcast.
4. Config via env/`.payout-agent.json`: roster URL, `PAYOUT_AGENT_KEY`, `DOGE_CLI` path (the `dogecoin-cli` binary — no `.exe` assumption; must work on Linux), wallet name, legacy source account (`sourceAccount` / `DOGE_SOURCE_ACCOUNT`, default `""`), fee headroom. The source account is separate from the wallet name and is frozen in the journal before claiming. Before intent/arm, both `getbalance <source account> 1` and the wallet's spendable `getbalance` must cover total plus headroom. `sendmany` uses that same source account and one-confirmation minimum. Negative account bookkeeping means zero available float; it fails before broadcast arm even if the whole wallet has funds. The read-only aggregate `"*"` is not a valid source account. The manual sender accepts the same `DOGE_SOURCE_ACCOUNT` setting.
5. Deployment: a systemd **user service** on the teacher's Linux box (unit file committed as `tools/doge-payout-agent.service` with install notes), mirroring the `apstats-backup.timer` precedent. Windows-scheduled-task alternative documented, not built.

## 6. Dashboard UX (inside the existing Reward Disbursement panel)

- Header gains **⚡ Deposit all ready (Ɖ N to M students)** — enabled only when the worklist is non-empty and no batch is active.
- Click → `POST /payout/plan` → modal table (student · address(short) · Ɖ) + total + "one transaction, one fee" note + typed confirm (`PAY`, mirroring the backup card's `RESTORE` gate) → `POST /payout/batch`.
- Status strip under the header, polling `GET /payout/status` every 10s while a batch is active: `⏳ waiting for the payout agent…` → `🔏 agent is broadcasting…` → `⛓ sent — view tx ↗` (blockchair link via `explorerUrl` pattern) or `❌ failed: <reason>` + a Retry (re-plan) button.
- Per-student ✓ sent buttons stay — the manual fallback when the agent/node is down.
- Students see the result through the EXISTING surfaces untouched: `doge_sent` rises → Desk wallet's `⛓ Ɖ N in your wallet (yours to keep)` line and the watch-only chain fetch show the coins arriving.

## 7. Non-negotiable invariants (each maps to a test)

- P1: no code path writes `doge_account` except the existing invariant-checked RPCs (`doge_mark` via the `markEndpoint` logic). The payout module contains ZERO direct wallet updates.
- P2: Σ plan outputs == Σ (`doge_sent` deltas applied at complete) == the `sendmany` output map the agent journals. Batch-level conservation.
- P3: at most one batch in `pending|claimed` (DB-enforced by the partial unique index; endpoint returns 409, never queues silently).
- P4: replay safety — re-posting `complete` (same or different txid), double `claim`, double button-click: all end in the same final state, no double-mark (I5 monotonicity is the backstop, the batch state machine is the front door).
- P5: `plan_hash` mismatch at batch-create or agent-verify aborts BEFORE any broadcast.
- P6: a `cancelled`/`failed`/`sent` batch is terminal; only `pending → claimed → sent|failed` and `pending → cancelled` transitions exist.
- P7: existing conservation suites (wallet-world, pg differential, stakes) stay green untouched.
- P8: no key material, no WIF, no signed tx hex ever appears in any roster-server table, log line, or endpoint payload.

## 8. Phases

| Phase | Work |
|---|---|
| 1 — refactor | extract `doge-send-core.mjs`; `doge-send.mjs` CLI keeps behavior + tests |
| 2 — server | migration 0032 + `payout.js` + `requirePayoutAgent` + tests (P1–P8) |
| 3 — agent | `doge-payout-agent.mjs` + journal/crash tests (fake `runCli`, fake server) |
| 4 — dashboard | button + preview modal + status strip |
| 5 — receipts (optional, default in) | `issuePayoutReceipt` (`t:'payout'`: `{v:1,t:'payout',sid,batch,txid,doge,ts,n}`) minted per student at `complete`, persisted on a nullable `receipt_id/receipt_compact` column pair added to `doge_ledger` in the SAME 0032 migration; Desk ledger rows pick it up read-only later |

## 9. Tests (Vitest, mirrors existing suites)

- `roster-server/tests/payout.test.js` — endpoint state machine, auth matrix (teacher / agent key / student token / nothing), 503-before-migration, plan determinism, P2–P6.
- `roster-server/tests/payout-conservation.test.js` — drive plan→batch→complete through the wallet-world fixture; assert I1–I9 hold and P2.
- `tests/doge-send-core.test.js` — extracted core keeps `doge-send.test.js` behaviors (dry-run default, journal, sendmany args).
- `tests/doge-payout-agent.test.js` — poll/claim/verify/journal/complete happy path; crash-recovery matrix (txid-no-complete, intent-no-txid); insufficient-float abort.

## 10. Open decisions (defaults chosen; change if you want)

- Which machine runs Core + the agent **[default: the Linux box (systemd), same host as the nightly backup timer]**.
- `PAYOUT_AGENT_KEY` separate from `TEACHER_KEY` **[default: yes, separate; unset = payout endpoints are teacher-key-only and the agent uses the teacher key]**.
- Poll interval **[default: 60s]**.
- Per-batch DOGE cap as a sanity brake **[default: 500 Ɖ; env `PAYOUT_BATCH_CAP`]**.
- `t:'payout'` receipts in v1 **[default: yes — Phase 5, cheap given the review-receipt precedent]**.
- Full node vs light signer **[default: Dogecoin Core full node — it's what doge-send.mjs already speaks, and it gives watch-only treasury visibility free. A BlockCypher-broadcast light variant is a v2 fallback, not built]**.

## 11. Files touched (estimate)

**New:** `roster-server/migrations/0032_payout_batch.sql`, `roster-server/payout.js`, `roster-server/tests/payout.test.js`, `roster-server/tests/payout-conservation.test.js`, `tools/lib/doge-send-core.mjs`, `tools/doge-payout-agent.mjs`, `tools/doge-payout-agent.service`, `tests/doge-send-core.test.js`, `tests/doge-payout-agent.test.js`.
**Edited:** `roster-server/server.js` (mount), `roster-server/teacher-auth.js` (or payout-local `requirePayoutAgent`), `roster-server/receipts.js` (Phase 5), `tools/doge-send.mjs` (thin wrapper), `teacher-dashboard.html`.
**Unchanged:** all wallet SQL functions, `doge-econ.js`, `doge-chain.js`, the Desk, every student surface.

### TL;DR
Seal a frozen payout plan into a one-active-row `payout_batch` table; a polling agent on the teacher's machine (the only place keys exist) verifies the plan hash, broadcasts ONE `sendmany` through the already-tested doge-send core, and reports the txid; the server marks every student ✓ sent through the existing monotonic invariant-checked `doge_mark`. The dashboard button is just the front door on machinery the repo already trusts.
