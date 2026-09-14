# Payout source account fix — 2026-09-05

The agent checked the whole wallet with `getbalance`, then called `sendmany`
from the legacy empty account. Dogecoin Core 1.14.9 checks that account's
bookkeeping balance before creating a transaction. A negative default account
therefore passed our preflight when the whole wallet still held funds, then
failed after the server had armed the batch.

## Changes

- `sourceAccount` in the private agent JSON, or `DOGE_SOURCE_ACCOUNT`, selects
  the legacy account. The empty account remains the compatible default.
- Preflight requires both `getbalance <account> 1` and the wallet's spendable
  balance to cover the payout plus fee headroom. Negative account balances
  produce the existing controlled insufficient-float failure before arming.
- Account selection is persisted before claim and held fixed through validation,
  intent, arm, and send. Existing journals retain their original account behavior.
- The manual sender accepts `DOGE_SOURCE_ACCOUNT` too.
- Dashboard status distinguishes preparation, awaiting the node result, a delayed
  unresolved result, and a recorded transaction awaiting balance reconciliation.
  Pending/claimed batches continue to disable duplicate-send controls.

## Operator recovery performed

The single rejected live batch was recovered after verifying the Core error
occurred before transaction creation. Its exact identifier and full evidence
remain in a private local recovery archive, not this repository.

1. Disabled the scheduled task, stopped its wrapper and agent, and verified no
   agent, manual sender, or `sendmany` CLI remained.
2. Matched the local journal to the server's frozen plan, canonical hash,
   claim-token digest, comment, amounts, and exact arm timestamp.
3. Verified the same Core wallet fingerprint, synchronized main chain, an absent
   anchored transaction lookup, and no matching comment in the full wallet history.
4. Preserved journal, configuration, logs, and before/after evidence in a directory
   whose Windows ACL grants access only to the owner, SYSTEM, and Administrators.
5. Conditionally changed only `status`, `error`, and `resolved_at` on that exact
   unresolved claimed batch. Preserved plan, hash, claim digest, and arm timestamp.
6. Verified one changed batch, no remaining active batch, unchanged student
   balances/send ledger, and unchanged node balance/transaction count. Archived
   the journal only after those checks succeeded.

No payment was sent or retried. The public fail/cancel APIs remain unchanged;
this exceptional operator reconciliation does not weaken their arm guard.
The teacher subsequently selected the existing `allowance` account. The private
agent configuration now sets `sourceAccount` to `allowance`; all other settings
are unchanged. Read-only preflight passed for the rejected plan and configured
fee buffer. The queue was empty before the scheduled agent was re-enabled and
restarted, and the new agent process was verified running without an active journal.
The teacher can retry through the dashboard's existing preview/confirmation flow.

## Validation

- Shared sender, manual sender, and agent: 101 tests passed under WSL Ubuntu.
  Native Windows passes the new cases; two existing assertions assume POSIX
  file modes and absolute path syntax.
- Dashboard status: 10 DOM/fake-time tests passed.
- Two independent adversarial reviews found no remaining blocking defects.
- Live recovery verified unchanged accounting and node funds.
- GitNexus pre-edit impacts were LOW; change analysis reports MEDIUM risk across
  the two indexed shared send flows. The actual diff stays within payout tooling,
  dashboard status, tests, and documentation.
- Full roster-server run under WSL: 1,636 passed, with timeout failures in two
  unrelated grading test files. Those two files passed on Windows: 48 passed,
  3 skipped. Payout, wallet, and conservation suites passed in the full run.
- Production agent queue returns HTTP 204 after recovery (no queued batch).

The teacher authorized pushing after the initial local commit. The local
`.git/hooks/pre-push` gate rejected the push: only the Fable orchestrator may
create its one-shot approval sentinel. Both adversarial reviews and teacher
sign-off are complete; the hook and sentinel were left unchanged for orchestrator
release. No database migration or server deployment is needed for the local
sender fix or completed batch recovery.
