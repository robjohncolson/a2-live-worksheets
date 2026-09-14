# PROGRESS_RESET_DEPLOYMENT_RUNBOOK.md — Incident 2026-07-20 fix rollout

The remediation is **frontend-only**: `ap_stats_roadmap_square_mode.html` + test files. No roster-server
change, no migration, no Supabase write, no env change. Deploying it republishes GH Pages only; the
Railway backend is untouched (its auto-deploy triggers on `roster-server/**` — not part of this delta).
No student is asked to redo any work at any step.

## 1. Pre-deploy

1. **Signed snapshot (evidence baseline).** Run the existing backup to a FRESH output (do not overwrite
   prior artifacts under `C:\Users\rober\grade-backups` — they are incident evidence):
   `node tools/nightly-backup.mjs` (or let the scheduled nightly run land first). Verify it reports
   ≥ 1,668 ledger rows / 36 students and receipt-chain OK.
2. **Local gate re-check** (all must be green):
   - `npx vitest run tests/incident-progress-reset-*.test.js tests/progress-reset-matrix-*.test.js`
   - full root suite `npm test` (known pre-existing isolated-pass flakies:
     `teacher-student-console-dashboard-deeplink`, `gradebook-feeder-wiring` "empty blank")
   - `cd roster-server && npm test` (with `BCRYPT_COST=4`) — proves no backend coupling regressed.
3. Confirm the change set is exactly the documented delta (`git status` / `git diff --stat`): the Desk
   file, the incident/matrix tests + fixtures, and the four incident docs. Nothing else.

## 2. Deploy

1. Commit the delta (Desk + tests + docs) on `master` as ONE incident-only commit. The worktree carries
   unrelated pre-existing modified/untracked files — stage ONLY the enumerated incident paths
   (**never `git add -A` / `git add .`**), then verify isolation BEFORE pushing:
   `git show --name-status HEAD` must list exactly the incident delta (Desk file, incident/matrix tests
   + fixtures, the five incident docs) and nothing else. A single self-contained SHA is what makes the
   §5 one-commit revert clean. Push; GH Pages Actions (`pages.yml`) publishes automatically
   (~1–3 min build; HTML edge-cache up to ~10 min).
2. Verify the Actions run for the commit is `success`
   (`gh run list --workflow=pages.yml -L 1`).
3. Confirm artifact parity: fetch the live Desk file and diff against the pushed commit
   (`curl -s https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html`
   vs `git show <sha>:ap_stats_roadmap_square_mode.html`) — must be byte-identical (wait out the
   10-min cache if needed).

## 3. Canary verification (two sanitized paths — no student accounts touched)

**Canary A — failure-mode canary (proves unknown ≠ zero).** On the public URL, sign in as the teacher's
own account (or the sanitized test student `berry_fox`/PeriodX). In DevTools → Network, block
`roster-production-12c1.up.railway.app`, reload the Desk. Expected: NO "0 of N lessons done", NO relocked
lessons; the truthful "Grades are temporarily unavailable — your work is saved." banner with a Retry
button appears. Unblock, hit Retry (or wait for the backoff): everything reconciles to normal without a
reload.

**Canary B — healthy-path canary (proves no regression).** Same account, network unblocked, hard reload:
grade strip renders the quarter pill, calendar greys/locks match the pre-deploy state for that account,
Done buttons and resource panel behave normally. Then open the sanitized fixture proof locally:
`npx vitest run tests/incident-progress-reset-warm-control.test.js` (the control that pins healthy
behavior).

## 4. Read-only post-deploy checks

- `https://roster-production-12c1.up.railway.app/health` returns 200 (backend untouched — should be
  boring).
- Live-fetch parity check from §2.3 passes.
- Browser console on the canary session shows no new errors on boot.

## 5. Rollback

**Trigger**: any canary failure; any student report of a new lockout/blank Desk; any console error storm
on boot; Actions deploy failure.

**Procedure** (frontend-only, fully reversible, ~5 min + cache):
1. `git revert <fix-sha>` (single revert commit; the delta is self-contained) and push `master`.
2. Confirm the Pages Actions run succeeds; wait out the ≤10-min edge cache; re-run the parity fetch.
3. Students refresh — they are back on the pre-fix build. No data migration to unwind:
   - the `apstats_server_complete_v1:*` latch keys are genuinely ignored by the old build (zero
     references at HEAD);
   - the v2 grade-cache envelope is NOT ignored but is still harmless: the old `_loadGradeCache` does
     `return (o && o.data) || null` with no version/origin check, so it unwraps the envelope's `.data`
     and gets the identical grade payload the legacy shape carried. A wrong-origin envelope would be
     accepted — but that merely reverts to the pre-fix baseline, which never had an origin guard
     (adversarial-review finding, Lane D: rollback is safe; the earlier "simply ignores" wording was
     imprecise).

## 6. Observation window

- 48 hours of normal student traffic. Watch for: any report of locks that contradict completed work, the
  "temporarily unavailable" banner appearing during *healthy* backend periods (would indicate
  over-triggering), My Ledger/Unit Progress anomalies.
- Ask Students V and E to reload once post-deploy and confirm: lessons through their true frontier
  (next: 1.4 and 1.5) are open and Unit Progress shows their real counts. Their grades were never
  actually altered, so no gradebook check is needed beyond the Desk display.

## Appendix — teacher/student communication (ready to send)

> Your work was never erased. A display bug in the Desk made it *look* like your progress had reset to
> 0% and re-locked lessons you had already finished — this happened when the Desk couldn't reach the
> grade server for a moment and wrongly treated "couldn't load" as "nothing done." Every worksheet,
> quiz, and Blooket you completed has been safe in the grade ledger the whole time (we verified the
> signed backups, and your grades compute exactly as expected). The Desk is fixed so that if it ever
> can't load your grades it now says so honestly — "your work is saved" — instead of showing zeros, and
> it no longer locks lessons you've already earned. If you ever see that message, just hit Retry or sign
> in again. Nothing needs to be redone.
