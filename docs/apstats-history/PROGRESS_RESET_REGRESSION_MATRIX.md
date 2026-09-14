# PROGRESS_RESET_REGRESSION_MATRIX.md — Incident 2026-07-20 failure-mode coverage

Every row is pinned by automated tests that extract the REAL functions from
`ap_stats_roadmap_square_mode.html` (brace-matched, unmodified source) into a JSDOM+vm sandbox —
harnesses: `tests/fixtures/incident-progress-reset/{oracles.js,matrix-harness.js}`.
Suites (all green): `tests/incident-progress-reset-{cache-relock 8, identity-fork 6, warm-control 6,
donow-hydration 6}.test.js`, `tests/progress-reset-matrix-{latch 15, loadstate 17, identity 14,
identity-switch 11}.test.js` = **83 tests**, plus the adapted `tests/desk-offline-grade-cache.test.js`.
Full root suite 8406/8406 (232 files); roster-server 1321/1321. Post-adversarial-gate: 10 confirmed
findings fixed + re-verified (see rows 4 and 22 and the backlog).

Legend: **latch** = the D3 durable server-completion record (`apstats_server_complete_v1:<studentId>`,
written only on a live successful `/grade`); **fail-open** = D4 (no lock while the server has never
affirmatively spoken on this device).

| # | Failure mode | Expected UI / gate behavior | Test mapping |
|---|---|---|---|
| 1 | Affected-account shape: worksheet ledger evidence (Cws≥60), no worksheet `DESK_DONE` row | Lesson completes on a cold cache via the latch; successor stays unlocked | matrix-latch "affected-account shape"; cache-relock "D3 latch keeps completion durable" |
| 2 | Fresh browser / new device | First live `/grade` writes the latch; completion then survives any later cold cache (Inv. 4) | matrix-latch "fresh device" |
| 3 | Cleared localStorage **and** `/grade` simultaneously unavailable | Nothing exists to restore — cached completion is unrecoverable in this state *by definition* (latch, grade cache, and marks are all gone). Required behavior: UNKNOWN/`unavailable` state + truthful "your work is saved" messaging + fail-open navigation. Never fabricated completion, never 0%, never a lock from mere uncertainty. The first later successful `/grade` re-establishes everything (rows 9/10f) | matrix-latch "cleared storage" (fail-open); matrix-loadstate D5 (honest label); matrix-cleared-storage combined end-to-end case (real `renderDoNowGrades`, nothing seeded, `/grade` failing) |
| 4 | Identity transitions: legacy email → bare username → `username@roster.local` | `_migrateMarksAliases` unions the alias buckets (additive, primary wins). Sign-in tails capture the PRIOR legacy key before overwriting it and pass it to the migration, so a genuine pre-roster email bucket is recovered, not stranded (gate finding H1, fixed) | matrix-identity "identity transition" + H1 recovery test + stranded-regression pin; identity-fork D6 suite + mis-addressed control |
| 5 | Guest → roster transition | Migration touches ONLY the current identity's aliases; no cross-identity read/write | matrix-identity "guest -> roster (no cross-identity leak)" |
| 6 | Wrong-user cache | Latch keyed to a different `studentId` is never read; grade cache is UUID-keyed (pre-existing) | matrix-latch "wrong-user cache" |
| 7 | Wrong-backend cache | Origin-mismatched latch AND grade-cache envelope v2 rejected as evidence, never deleted (Inv. 7) | matrix-latch "wrong-backend cache" (2 cases) |
| 8 | First render before `/grade` resolves | Cold cache + no latch ⇒ fail-open, never a false lock; rProg shows "Progress loading…" | matrix-identity "render-before-resolve"; matrix-loadstate D5 |
| 9 | Successful delayed `/grade` | Full reconcile: forced `rCal` + `rProg` on unavailable→available, even when cache was warm-from-restore | matrix-loadstate "delayed success reconcile (D7)", "offline then recovery" |
| 10a | `/grade` 401 | `unavailable/auth`; Sign-in banner; roster session NEVER cleared (source-pinned) | matrix-loadstate "401 -> auth" (2 cases) |
| 10b | `/grade` 403 | Same as 401 (`auth`) | matrix-loadstate "403 -> auth" |
| 10c | `/grade` 500 | `unavailable/server`; evidence restore; Retry banner; capped backoff scheduled | matrix-loadstate "500 -> server" |
| 10d | Malformed JSON / `{ok:false}` on 200 | `server`, never `available`; never latched, never cached | matrix-loadstate "malformed JSON / {ok:false}" (2 cases) |
| 10e | Timeout / unreachable / offline | `network`; evidence restore (cache / re-derive) as before | matrix-loadstate "timeout / null-res -> network" (2 cases) |
| 10f | Recovery after any failure | `available`; error cleared, banner hidden, retries reset, latch written | matrix-loadstate "offline then recovery" |
| 11 | `/donow` success with only partial `DESK_DONE` evidence | Hydration seeds only reported artifacts (blooket-only for 1.2/1.3); latch supplies the missing worksheet signal | donow-hydration suite; matrix-latch "partial DESK_DONE hydration" |
| 12 | Server-qualified predecessor stays unlocked after refresh | Next legitimate lesson (1.4 / 1.5) unlocked on a cold cache once latched | cache-relock "next legit lesson UNLOCKED"; donow-hydration "next legit lesson UNLOCKS" |
| 13 | No visible 0% while state unknown | rProg renders "Progress loading…" / "…temporarily unavailable — your work is saved." — never "0 of N"; banner is XSS-safe createElement/textContent | matrix-loadstate "rProg honest-unknown (D5)" (3 cases incl. warm control) |
| 14 | No stale grade from another student | Grade cache + latch are `studentId`-keyed; view-as keys resolve null (no restore/write) | matrix-latch "wrong-user" + view-as rows; pre-existing `_gradeCacheKey` view-as guard (fa `8e76195`) |
| 15 | Repeated refresh / idempotency | Latch monotonic (omitted topic / lower score never un-latches); migration idempotent per identity | matrix-latch "refresh idempotency / monotonic latch" (3 cases) |
| 16 | Multi-tab storage events | Writes in one tab visible in the other (shared backing); the cross-tab `storage` listener is scoped to identity keys and never fires on evidence keys | matrix-latch + matrix-identity multi-tab rows (behavioral + source pin) |
| 17 | Mobile-home entry vs the Desk | mobile-home unaffected: no new-symbol references; its pill hides (never 0%), keeps cached grade on 401, has no lockout (I2-confirmed) | matrix-identity "mobile-home non-regression" |
| 18 | Teacher view-as | Read-only: latch key null, `_latchServerComplete` no-ops, migration skipped, banner suppressed; `_hydrateMarksFromDonow` view-as guard re-pinned | matrix-latch + matrix-identity view-as rows; donow-hydration regression guards |
| 19 | Server affirmatively says predecessor incomplete | Strict gate STILL LOCKS — fail-open never leaks into the affirmative-evidence case | matrix-latch "strict-gate-still-strict"; warm-control CANARY |
| 20 | Auto-retry discipline | ≤3 per page load, 15s/30s/60s, single-flighted (no stacking) | matrix-loadstate "auto-retry cap" |
| 21 | Healthy warm path unchanged | Warm `/grade` alone completes/unlocks/greys everything (control for the whole class shape) | warm-control suite (6 cases, unchanged from the repro phase) |
| 22 | In-place identity switch on a shared device (X signs out/in as Y without reload) | `_resetGradeStateForIdentitySwitch()` runs at the top of all three sign-in tails: clears `_gradeLessonsCache`/`_gradeGradebookCache`/`_gradeQuartersCache`, cancels any armed retry timer (so X's stale-token retry can never persist X's grades/latch under Y's keys — gate findings B1/B2), resets tri-state; boot reconciles the legacy key to the live roster session before migrating (B3) | matrix-identity-switch suite (11: runtime reset behavior + source pins on all three tails, boot reconcile, Retry→renderDoNowGrades) |

Backlog (LOW, non-blocking, adjudicated by the adversarial gate): (1) auth-kind failures also receive
the capped auto-retry (benign — bounded, single-flighted, session never cleared); (2) `renderDoNowGrades`
has no request-generation single-flight guard (overlapping boot/visibility/retry calls; last-writer-wins
on identical-identity data — pre-existing shape); (3) `_persistServerComplete`/`_persistGradeCache`
swallow localStorage quota exceptions (fail-open to pre-fix behavior); (4) the D3 latch is deliberately
monotonic — a server-side score *correction* below threshold never revokes completion (documented
semantics, matrix row 15).
