# DN2c Build — `rosterClient` single sign-in into the Desk

**Frozen contract** (planner, 2026-05-18, session 100). Status: IMPLEMENTED + Codex-reviewed (4 findings dispositioned — see §Codex review).
Sprint **DN2c** of `DESK_DONOW_SPEC.md` §4.1 (the *identity* half of decision D2;
the `gradebookClient.record` worksheet half = DN2a/DN2b, shipped; curriculum_render
quiz = DN2d, separate). Unblocked: DN1 redeploy LIVE & prod-verified (`1179a05`).

## Goal

Make `window.rosterClient` the Desk's **single sign-in surface** so DN3 can call
`/donow` with `rosterClient.token()` / `rosterClient.studentId()`. Backward-
compatible: every existing `getStudentEmail()`-keyed Desk feature keeps working
with **zero** other code changes.

## Scope — all in `ap_stats_roadmap_square_mode.html` (one file, LF, ~8074 lines)

1. **Load the shared client.** Add, before the main inline `<script>`, in the
   canonical order + flat paths (Desk is at repo root, same as
   `roster-client-demo.html` lines 26–28):
   ```html
   <script src="roster_config.js"></script>
   <script src="roster-client.js"></script>
   ```
   Reuses the single shared client — never inline a copy.

2. **Sign-In modal** (currently lines ~1204–1221, single `#signin-email`):
   replace the one email input with **`#signin-username` + `#signin-password`**
   (`type="password"`). Copy → "Sign in with the username & password your
   teacher gave you." Keep S7 styling, the `#signin-error` line, Cancel/OK
   buttons. No `#signin-email` may remain.

3. **`submitSignIn()`** → becomes `async`:
   - **in-flight guard** (`submitSignIn._pending`) so the OK click + the password
     Enter handler can't double-submit; the OK button (`#signin-ok`) is disabled
     while pending and restored in a `finally`.
   - guard: if `!window.rosterClient` → inline offline error, return. (Copy is a
     fuller "Sign-in unavailable (offline). Try again on the school network." —
     richer than the original sketch; intentional.)
   - read **trimmed username**; **password is read verbatim — NOT trimmed**
     (leading/trailing characters can be valid in a password; trimming would
     silently corrupt valid credentials — security-correct). If either empty →
     inline error, return.
   - `const r = await window.rosterClient.signIn(u, p);`
   - `!r.ok` → `#signin-error = r.error || 'Sign-in failed'`, return.
   - ok → **mirror identity into the legacy key** so all existing
     `getStudentEmail()` consumers keep working unchanged:
     `localStorage.setItem('apstats_desk_student_email', rosterClient.current().username)`.
     Then `registerStudent(username)` (legacy table column is free text — a
     non-email string is harmless; clean-start cohort, path retired in DN3),
     `updateStudentMenu()`, `closeSignInModal()`, success dialog using
     `rosterClient.current().realName || username`.

4. **`signOutStudent()`** → `if (window.rosterClient) window.rosterClient.signOut();`
   then `localStorage.removeItem('apstats_desk_student_email')`,
   `updateStudentMenu()`, `location.reload()`.

5. **`openSignInModal()`** → prefill `#signin-username` from
   `rosterClient.current()?.username` (fall back to legacy email value); always
   blank `#signin-password`; clear `#signin-error`.

6. **`updateStudentMenu()`** → prefer `rosterClient.current()`:
   "Signed in as: `realName` (`username`)"; else legacy email; else
   "Not signed in".

7. **Untouched (DN3, NOT DN2c):** `getStudentEmail/getStudentMarks/recordProgress/
   registerStudent` bodies, the legacy `student_progress` Supabase POST, every
   `_signedIn`/`markComplete` gate (they read `apstats_desk_student_email`,
   which roster sign-in now populates), the calendar, the schedule.

## Non-goals (explicitly DN3 / DN2d / AI-tutor lane)

`/donow` calls · calendar 4-state coloring · Do Now card · soft speed-bump ·
collapse to one fall calendar · replacing the legacy `recordProgress` path ·
the AI-tutor Desk-tile "copy tutor prompt" fold-in · curriculum_render quiz feeder.

## Test — `tests/desk-roster-signin.test.js` (jsdom; mirrors schedule.test.js + roster-client.test.js)

- Both script tags present; `roster_config.js` **before** `roster-client.js`; flat paths.
- Modal has `#signin-username` + `#signin-password[type=password]`; **no** `#signin-email`.
- Source wiring: `submitSignIn` references `rosterClient.signIn` and writes
  `apstats_desk_student_email`; `signOutStudent` references `rosterClient.signOut`;
  `updateStudentMenu`/`openSignInModal` reference `rosterClient.current`.
- Optional: fetch-mocked happy path (verify mode) — signIn ok → legacy key set.

## Method

Planner implements directly (one cohesive contended single-file change —
parallel-Sonnet fan-out = clobber risk per the proven DN2a/DN2b note) → Codex
FOCUSED review (`Agent/runner/cross-agent.py`, tight, ~1400s) → planner re-verify
on disk under vitest (new test + `roster-client.test.js` + `gradebook-feeder-
wiring` 92/92 + `audit-feeder-ids` CLEAN 69 + root suite; the 1 known
`study-guide.test.js` fail stays, NOT a regression) → tight single-purpose commit
(forensic HEAD before/after; clobber-free vs the idle AI-tutor session).
Desk is **LF** — keep edits EOL-clean (no CRLF reintroduction).

## Codex review (focused, read-only, 2026-05-18) — 4 findings dispositioned

1. **MAJOR — identity switch drops local done-state continuity.** After the
   first roster sign-in, `getStudentEmail()` returns the roster username, so
   `apstats_desk_marks_<oldEmail>` no longer matches `apstats_desk_marks_<username>`;
   any pre-DN2c local marks orphan. **DISPOSITION: accepted by design, not
   fixed.** The signed-off spec mandates a **clean-start SUMMER26 cohort**
   (`GRADEBOOK_SPEC.md` §6 / Phase 0: "`roster_alias` exists, legacy
   reconciliation deferred") and **DN3 retires the legacy localStorage/anon-
   Supabase `student_progress` path entirely** — `/donow` (server, keyed by
   `studentId`) becomes the authoritative completion source. These local marks
   are a non-authoritative mirror of a path being removed; adding a migration
   here is explicit DN3/legacy-reconciliation scope this sprint defers. Fixing
   it would be a contract violation (§Non-goals).
2. **MINOR — double-submit unguarded.** FIXED: `submitSignIn._pending` +
   `#signin-ok` disable/restore-in-`finally`.
3. **MAJOR — tests proved string presence, not runtime wiring.** FIXED: added
   §5 runtime block — executes the real `getStudentEmail/updateStudentMenu/
   openSignInModal/submitSignIn/signOutStudent` in a `vm` sandbox with fake
   `rosterClient`/`localStorage`/`document`; proves the legacy key is written
   *only after auth success* and equals `current().username` (not the typed
   value), failure writes nothing, offline is graceful, the in-flight guard
   holds, sign-out clears both, menu/modal read `current()`.
4. **MINOR — impl drifted from the sketch literals (offline copy, trim).**
   RESOLVED by aligning this doc to the implementation: richer offline copy is
   intentional; **password is deliberately not trimmed** (security-correct).

Codex explicitly confirmed clean: no DN3/DN2d scope creep; script load order
correct (`roster_config.js`/`roster-client.js` before the sole inline app
script; `updateStudentMenu()` only called later at init); username-as-identity
mechanically fine for the `_signedIn`/`markComplete` gates; no Desk-side
password persistence/logging; no direct Supabase added.

## Acceptance

Signing in on the Desk uses roster username+password via the shared client;
`rosterClient.current()/studentId()/token()` populated; legacy email-keyed
features still work (identity mirrored); sign-out clears both; one sign-in
surface; zero direct-Supabase added; DN3 can now consume `rosterClient.token()`.
Verified on disk: `tests/desk-roster-signin.test.js` 27/27 (19 static + 8
runtime behavioral).
