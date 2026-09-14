# INCIDENT 2026-07-20 — Student progress/grade "reset to 0%" + lesson lockout

Status: root cause CONFIRMED and reproduced in automated tests. **No data was lost or damaged.**
Companion docs: `PROGRESS_RESET_FIX_SPEC.md` (remediation design), `PROGRESS_RESET_REGRESSION_MATRIX.md`,
`PROGRESS_RESET_DEPLOYMENT_RUNBOOK.md`. Students are referred to as **Student V** and **Student E**
(identities known to the teacher; kept out of this public repo).

## 1. Timeline (ET)

| When | Event |
|---|---|
| ≤ 2026-07-14 | Both students' last recorded activity (worksheet/FRQ/quiz ledger rows through U1). |
| 07-14 → 07-16 | Deployment window: 12 commits (SY2627 Pass 1 data regen, PC-makeup backend, Desk PC tiles, Nightly-Review fixes, teacher reminder). GH Pages redeployed per push; roster-server redeployed per push. |
| 07-16 18:20 | Final Railway deploy `f1d0acf7` (= git `cb8ffd4`) goes live; **no further deploy through the incident**. |
| 07-16 22:20 UTC | Final GH Pages deploy (Actions run 29539218935, `cb8ffd4`); **no frontend deploy 07-17 → 07-21**. |
| 07-20 ~10:30 | Both students open the Desk; it renders "0 of N lessons done" + locked lessons. |
| 07-20 10:33 | Student V reports both accounts "reset to 0%" and locked out. |
| 07-20 22:00 | Signed nightly backup: 36 students, 1,668 ledger records (up from 1,498 on 07-19), receipt chains verify — **database intact**. |

## 2. Confirmed evidence

- **Database intact / damage ruled out**: record counts only grew (1,498 → 1,668), no roster UUID changed
  or disappeared, no per-student count decreased, snapshot receipt-chain verification passed. Replaying
  both students' ledgers through the production grading engine yields Q1 = 85 (legacy) / 96.3 and 99.8 (v3)
  — never zero. The destructive `DELETE /roster/:id` path is ruled out (its CASCADE would have emptied
  `item_ledger`; replay works; backups confirm growth).
- **Deployed artifacts = local HEAD, byte-identical**: live `ap_stats_roadmap_square_mode.html`,
  `roster-client.js`, `roster_config.js`, `railway_config.js` all diff-clean vs `cb8ffd4`. Backend ran the
  Jul-16 SUCCESS deploy continuously (clean boot logs, `/health` 200). **No stale/mismatched deploy.**
- **No code change in the window touched identity, marks, gating, or `/grade` handling** (per-commit diff
  audit). The vulnerable code dates from May/June. Token verification is a stateless 30-day HMAC
  (`roster-server/token.js`); redeploys do not invalidate sessions, and there is no
  random-secret-at-boot fallback (`signToken` throws if the secret is unset). Token *expiry* cannot be
  fully ruled out from the ledger alone: the 30-day clock runs from token **issuance** (sign-in), which
  the activity record does not establish — a session issued >30 days before 07-20 would 401. This is
  immaterial to the remediation, which handles any 401 truthfully (adversarial-review finding, Lane A).
- **Mechanism reproduced 20/20** in `tests/incident-progress-reset-*.test.js` against the *real* Desk
  functions (brace-matched extraction from the monolith): cold-cache relock, identity-fork invisibility,
  `/donow`-hydration insufficiency, and the warm-cache control proving the ledger evidence was always
  sufficient to unlock everything.

## 3. Exact root cause

**The Desk presents "server grade state unknown" as "no completed work."** Four confirmed facts compose
into the symptom:

1. **Ledger-only worksheet completion.** Both students completed the 1.2/1.3 worksheets by actually doing
   them — the worksheets scored correctness (`Cws ≥ 60`) into the server ledger — but never clicked the
   Desk's worksheet "Done" button for those lessons, so no worksheet `*-DESK_DONE` rows exist (only
   Blooket ones, auto-recorded by the flashcard gate). This is the *normal* usage pattern, shared
   class-wide.
2. **Completion oracle's server dependency.** `_isLessonComplete` accepts a local Done mark OR a synced
   score from `_gradeLessonsCache` — which is populated *only* by a successful `/grade` response. For
   ledger-only lessons, a warm cache is the *sole* source of completion.
3. **Silent HTTP-error swallow (the defect).** `renderDoNowGrades` (L8431–8448) treats only *thrown*
   network failures as "offline" (restoring the cached payload / re-deriving). An HTTP non-ok response
   (401/500) silently early-returns: no cache restore, no error UI, no retry affordance, cache stays cold
   for the whole session. `/donow` hydration cannot compensate — it reconstructs only explicit
   `*-DESK_DONE` artifacts (`roster-server/donow.js` L82–97).
4. **Strict gate + honest-looking zero.** With the cache cold, `_isLessonUnlocked`'s strict
   predecessor-completion gate relocks every lesson after the first one missing a worksheet mark
   (both students lock at 1.3), and `rProg`/My Ledger render **"0 of N lessons done"** — the "grades reset
   to 0%" the students reported. No surface renders a literal 0% grade; unknown state *renders as zero
   progress*.

**Trigger** (bounded; exact HTTP status unconfirmed — Railway has no request-level logging): some
non-success `/grade` (and likely `/donow`) outcome on the students' devices on 07-20 ~10:30 — a transient
backend/Supabase 5xx, a network failure on a device without a prior grade cache, or an auth 401. Every
candidate trigger converts to the identical persistent symptom through the defect above, which is why the
fix targets the *failure class* (any unknown server state), not one trigger.

Classification summary:
- **Confirmed**: the client mechanism (1–4); artifact parity; DB integrity; `/donow` hydration limits.
- **Strongly supported**: trigger = non-success `/grade` at the incident moment (the only remaining path
  to the reproduced symptom; all alternatives ruled out).
- **Unconfirmed**: which specific status (401 vs 5xx vs unreachable) each device saw; whether either
  student was additionally on a forked marks bucket (amplifier only — not required, per repro).
- **Ruled out**: DB damage/deletion, deploy mismatch, code regression in the window, secret-loss
  (sign-in would 500 for everyone), quarter-freeze (write-only: `snapshotQuarter` is referenced only by
  the teacher `POST /class/quarter/close` path, never read by `GET /grade`), PC-track wiring (env-gated
  off; the Phase-2 grade-invariance test pins the engine byte-identical with `pcTrack.enabled:false`),
  answer-key regen 500 (all-or-nothing; `/health` green; replay clean). Token expiry is *plausible but
  unestablished* (see §2) — an expired-at-issuance-age token is simply one concrete form of the 401
  trigger candidate, equally covered by the fix.

## 4. Contributing conditions

- No worksheet `DESK_DONE` rows for later lessons (normal usage; class-wide exposure).
- `/donow` hydration restores only explicit self-attest artifacts, never ledger-derived completion.
- Identity-key forks (`apstats_desk_student_email` bare-username vs synthesized `@roster.local` bucket)
  can empty the *local* marks view; self-heals via `/donow` when it succeeds — amplifier, not cause.
- No retry, no error surface, no re-auth affordance after a failed `/grade`; the 60s repaint interval
  re-renders from the cold state without re-fetching.
- Grade cache restore was gated to thrown-network failures only, and (pre-fix) carried no backend-origin
  metadata.

## 5. Why two students, same symptom, same morning

Their exposure is identical because the *data shape* is identical and class-wide: Blooket completion
self-attested via the flashcard gate, worksheet completion ledger-only. Any student whose Desk hit a
failed `/grade` without local worksheet marks would render the same lockout + "0 of N". These two were
the ones who visited (and reported) during the failure window; the July summer lull explains the small
blast radius.

## 6. Incident window and student impact

- Window: from the first failed `/grade` on their devices (~07-20 10:30 ET; possibly earlier visits went
  fine — last activity 07-14 was normal) until remediation/refresh with a successful `/grade`.
- Impact: **display and navigation only.** No ledger rows, grades, roster identities, or receipts were
  altered. Q1 replay: Student V 85 / 96.3 (legacy / v3), Student E 85 / 99.8. Next legitimate lessons
  (1.4 and 1.5) were wrongly gated behind relocked predecessors; no work needs to be redone.

## 7. Evidence gaps (for RC, optional)

- Railway request-level logs don't exist for the window (only 3 boot lines) — the exact HTTP status seen
  by the students is unrecoverable server-side. Deliberately not pulled: raw request logs could contain
  `?token=` query strings (session-token leak risk).
- Railway env-var change history (to formally close "manual `ROSTER_TOKEN_SECRET` rotation") — no
  evidence for it, code cannot cause it, and it would have required a manual act.
