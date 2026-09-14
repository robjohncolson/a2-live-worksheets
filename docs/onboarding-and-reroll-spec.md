# Onboarding Combo-Lock + Safe Username Reroll — Implementation Spec

> Status: DRAFT for review (2026-06-15). Cross-repo: **follow-alongs** (Desk + roster-server)
> and **curriculum_render** (quiz + railway-server). Designed + adversarially red-teamed; the
> red-team's 6 must-fixes are folded into the build order below.

## Decisions (locked by teacher)
1. **Name finder = quaternary combo-lock dial** (↑↓←→, ~2–3 presses for 27 students). Arrow→bucket
   mapping uses **2×2 reading order** (up-left=1, up-right=2, down-left=3, down-right=4), NOT the
   raw up/left/right/down order (red-team: that breaks alphabetical↔spatial intuition).
2. **Reroll = self-serve, rate-limited to 1 per student per 24h** (server-enforced).
3. **Password = keep the shared default `apstats2627`, but HARD-BLOCK** all grade/feature-bearing
   actions **server-side** until the student changes it (not just the client modal).

## Why this is safe (identity model)
- **roster-server**: `student_id` (UUID) is the stable key; `login_username` is flexible. Ledger,
  grades, commits, and the token all key on `student_id` → **already reroll-safe**.
- **quiz (Supabase `answers`)**: PK is `(username, question_id)` → keyed on the **flexible username**,
  so a reroll MUST migrate answers `old→new` or it orphans quiz work. This migration is the crux.
- **Receipts**: roster *ledger* receipts already carry `sid` (safe). cr **quiz** receipts make `sid`
  optional (`issueReceipt`: `if (sid) payload.sid = sid`) → a reroll orphans them. Fix in step 2.

## Build order (each step is independently shippable; do in order)

### Step 0 — [TEACHER ACTION] set env vars on Railway — ✅ DONE 2026-06-15
- `ROSTER_TOKEN_SECRET` — set to the **same value on BOTH** services (the value already on the
  roster-server, copied onto cr railway-server). Confirmed: cr `/health` now reports `rosterAuth:true`.
- `ROSTER_ADMIN_TOKEN` — **not used.** Instead of a separate shared admin secret, Step 1 gates the
  re-key endpoints on a **signed-in teacher's roster token** (now verifiable since `ROSTER_TOKEN_SECRET`
  is shared). One fewer secret to manage; per-teacher + revocable.

### Step 1 — Security hardening (fail-closed) — **do before anything that re-keys answers**
- **cr `railway-server/server.js`**: `/api/roster/assign` (1638) and `/api/guest/reconcile` (1683)
  currently default **open** when `ROSTER_ADMIN_TOKEN` is unset. Change to **fail closed**: require a
  valid **teacher** roster Bearer token (verify via `sidFromRequest` + teacher role) → else `403`.
  Update `teacher-guest-reconcile.html` to send the teacher's token. (Now possible since cr can verify
  roster tokens — `rosterAuth:true`.)
- **roster-server**: enforce the **must-change hard-block**. While `must_change_password=true`,
  reject grade/feature-bearing, token-authenticated actions (`/ledger/record`, `/grade`, `/commits`,
  reroll) with `403 {error:'password change required'}`. Login + `/roster/change-password` stay open.
  Read endpoints that only need a name stay open. (Closes the shared-default impersonation window
  the finder amplifies: even if a kid picks a victim's name + types `apstats2627`, they can do
  nothing grade-bearing until *that victim's* account has changed its password.)

### Step 2 — Anchor cr quiz receipts to `sid`
- **cr `railway-server/receipts.js` `issueReceipt`**: always include `sid` in the signed payload
  (drop the `if (sid)` guard) when a verified sid is available; require the quiz client to send
  `Authorization: Bearer rosterClient.token()` at the issuance fetches so `sidFromRequest` resolves.
- Old receipts (username-only) keep verifying; new ones resolve by stable `sid`.
- (Optional, later) teach `receipt-verify.js` to follow the reroll chain so an old-username receipt
  still resolves to the current student.

### Step 3 — Quaternary combo-lock name finder (Desk + quiz sign-in)
- **Engine** (shared, `BUCKETS=4`): sort `/roster/section/PeriodX` by `realName`, hold `[lo,hi]`,
  split into 4 contiguous near-equal buckets (`bucketSize = ceil(remaining/4)`, remainder in the
  last). Labels = range + count + first/last sample name (`friendlyLabel` = first + last initial).
  Collapse a bucket of ≤4 to a literal 4-way **name pick** (final press selects a person, never a
  range). Auto-select singletons. Window-stack for ⌫/Esc back. Resolves to `login_username`, which
  flows into the **existing password step** (the password remains the real gate).
- **Keyboard/touch**: ↑↓←→ keys ↔ a 2×2 tile grid, same spatial layout; click/haptic per detent;
  44px targets; `aria-live` bucket announcements; reduced-motion drops the spin.
- **Escape hatch fix (red-team critical)**: "I'm not listed" must NOT route to `/roster/claim`
  self-signup (violates *no new accounts*). Route it to: a free-type field that accepts **only an
  existing roster username** (resolved via `/roster/section`), or a "see your teacher" dead-end.
- **Desk default fix**: a fresh device should default to **sign-in (finder)**, not the signup modal.
  Gate `/roster/claim` behind the teacher key (or disable for PeriodX) so students can't self-signup.
- **Privacy note for teacher**: the finder shows the 27 real names pre-auth (inherent to the design
  you chose). Acceptable per your call; if you later want, gate the finder behind a class-wide code.

### Step 4 — Safe reroll (the feature)
**Order: flip `login_username` on roster FIRST → migrate quiz answers SECOND → idempotent via
`migrateId` → self-heal on next sign-in.**

- **roster-server `POST /roster/:studentId/reroll-username`** (student token; `sid==:studentId`):
  - **Rate-limit**: reject if a reroll for this `sid` exists within 24h (`429`).
  - Generate candidate via `generateUsername(attempt)` (≤8 retries on UNIQUE collision) AND
    **reject any candidate that already has quiz answers** (`GET cr /api/user-answers/:cand` count>0)
    — prevents inheriting a stranger's history.
  - Atomically: record `{student_id, prior_username, new_username, migrate_id, status:'pending'}` in
    a new `roster_reroll_log` table; `UPDATE roster SET login_username=new WHERE student_id=:sid`.
  - **Never recycle**: mark prior names burned so `generateUsername` can't re-hand them out.
  - Return `{newUsername, priorUsername, migrateId}`.
- **cr `POST /api/reroll/migrate-answers`** (Bearer sid OR teacher secret; **fail closed**):
  - **Server-resolves** from/to: `from = prior_username` (from intent record), `to =` the roster's
    current `login_username` for that `sid` — **ignore client-supplied names** (red-team: stops
    re-keying onto someone else's identity).
  - **Refuse if `to` maps to a different `student_id`** (no cross-student fusion).
  - Use the **collision-safe re-key** (the `/api/guest/reconcile` pattern: drop colliding
    `question_id`s, then UPDATE the rest) — **never** the naive `mergeUserData`.
  - Idempotent via `migrateId` (UPSERT into `reroll_migrations`).
- **Reconcile self-heal**: record the migration **intent on the cr side at reroll time** (a roster→cr
  callback writing `reroll_migrations{migrateId, sid, from, to, status:'pending'}`) so that if the
  client dies mid-flow, a cr `POST /api/identity-sync` on next sign-in can finish it WITHOUT needing
  to read the roster DB. (Red-team: the original plan couldn't learn `prior_username` cross-DB.)
- **UI**: "🎲 Roll a new name" button (Account area / under Change Password). Shows the new name
  prominently and **keeps the existing valid token** (don't force a username re-type the student
  won't know). Add token-gated `GET /roster/whoami` so a still-valid session can recover its name.

## New tables
- roster-server `migrations/00NN_reroll.sql`: `roster_reroll_log(migrate_id uuid pk, student_id fk,
  prior_username, new_username, status, created_at)`; index `(student_id, created_at desc)`.
- cr `railway-server/migrations/00NN_reroll.sql`: `reroll_migrations(migrate_id uuid pk, student_id,
  from_username, to_username, status, created_at, completed_at)`. (Migrations are USER-RUN on Supabase.)

## Test plan (before live)
- Unit: quaternary partition math (N=1..40: bucket sizes, ≤4 collapse, singleton auto-select, back-stack).
- Reroll happy path; collision race (two kids same candidate); reroll INTO an in-use name (must
  refuse); migrate when target already has answers (collision-safe, no PK throw); browser-dies-mid-flow
  → self-heal on next sign-in; rate-limit (2nd reroll within 24h → 429).
- Auth: forged/cross-student token rejected; re-key endpoints fail closed when secret unset;
  must_change_password hard-block returns 403 on grade actions, 200 after change.
- Receipts: new quiz receipt carries `sid`; reroll then verify an old receipt still attributes.

## Red-team must-fixes → where handled
1. Naive `mergeUserData` PK collision → **Step 4** collision-safe re-key + refuse cross-student `to`.
2. Generated name inherits orphan answers → **Step 4** `/api/user-answers` check + never recycle.
3. Open re-key endpoints → **Step 1** fail-closed + env vars.
4. Self-heal can't learn prior username → **Step 4** cr-side intent record.
5. Receipts bake username → **Step 2** sid-anchor.
6. Shared-password impersonation window → **Step 1** server-side must-change hard-block;
   **Step 3** escape hatch can't self-signup.
