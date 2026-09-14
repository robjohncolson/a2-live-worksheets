# TEACHER_AUTH_BUILD.md

Frozen implementation contract for **Connected Teacher Auth** -- one loop
cycle. Goal: the teacher signs in once with their roster account; that
server-verified identity authorizes every teacher page. The random
`x-teacher-secret` stops being something a human types.

## 0. Resolved decisions

- A `role` column on the `roster` table (a migration, user-run).
- `x-teacher-secret` is KEPT as a break-glass fallback -- demoted, not
  deleted. Every teacher-gated endpoint still accepts it.
- The Desk teacher access code is RETIRED. The code-only "standalone
  teacher mode" is removed. A teacher logs in only via a real roster
  account whose `role` is `teacher`.
- The teacher account to mark in the migration: `date_tiger` (the
  `login_username`). Adjust the migration if the teacher account
  differs.

## 1. The security model (READ FIRST -- this is the contract)

A request is authorized as a teacher iff EITHER:
- (A) the `x-teacher-secret` header equals `ROSTER_TEACHER_SECRET`; OR
- (B) a roster token is present (`Authorization: Bearer <t>` or
  `?token=<t>`), `verifyToken` resolves it to a `studentId`, AND that
  student's `role` is `teacher`.

FAIL-SAFE rules -- the new path may only ever ADD access for a
provably-teacher token; it must never grant access on ambiguity:
- If the role cannot be determined (the `role` column does not exist
  yet -- pre-migration -- or the DB errors, or the row is missing),
  treat the role as `student`. Path (B) then yields non-teacher.
- A token that does not verify -> non-teacher.
- A verified token whose student `role` is not exactly `teacher` ->
  non-teacher (a student cannot self-promote with their own token).
- Neither a matching secret nor a teacher token -> 401.
- Sign-in (`findByUsername` / `/roster/verify` password check) is NEVER
  modified or made to depend on the `role` column -- sign-in must keep
  working before the migration runs.

Deploy-before-migration safety: roster-server auto-deploys on commit;
the migration is run by hand afterward. Between the two, path (B)
degrades to non-teacher for everyone (role unknown -> `student`), so
teachers keep using `x-teacher-secret` -- exactly today's behavior. No
lockout, no regression. After the migration, path (B) lights up.

## 2. The migration -- work item WI-1 (planner)

NEW `roster-server/migrations/0005_roster_role.sql`, additive +
idempotent, in the style of `0003_roster_pw.sql`:

```sql
ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';
-- Constrain to the two valid values (guarded so re-runs do not error).
DO $$ BEGIN
  ALTER TABLE roster ADD CONSTRAINT roster_role_chk
    CHECK (role IN ('student','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Mark the teacher account. Adjust the username if the teacher's
-- roster account is not 'date_tiger'.
UPDATE roster SET role = 'teacher' WHERE login_username = 'date_tiger';
```

User-run in the curriculum_render Supabase SQL editor (same as
`0004`). Not applied automatically.

## 3. roster-server -- work item WI-2 (Sonnet subagent)

Owned paths: `roster-server/teacher-auth.js` (NEW),
`roster-server/db.js` (EDIT), `roster-server/server.js` (EDIT),
`roster-server/class.js` (EDIT), `roster-server/remediation.js` (EDIT),
`roster-server/tests/*` (EDIT/NEW), and `roster-client.js` (EDIT --
the client half of the same token contract). roster-server uses ES
modules + vitest; tests use an in-memory fake db.

WI-2a. `db.js` -- NEW `getRoleByStudentId(studentId)`: a defensive,
  additive query returning `'teacher'` or `'student'`. It must
  DEGRADE to `'student'` on ANY error (the `role` column missing
  pre-migration, a missing row, a DB error) -- never throw. Do NOT
  modify `findByUsername` or any existing query (sign-in must not
  depend on `role`).

WI-2b. `/roster/verify` (`server.js`) -- on a successful sign-in, after
  the existing logic, call `getRoleByStudentId(studentId)` and add
  `role` to the JSON response. Defensive: a failure here yields
  `role:'student'` and must not break sign-in.

WI-2c. NEW `roster-server/teacher-auth.js` -- export an async
  `requireTeacher(req, db)` (or equivalent) implementing the Section 1
  model: check `x-teacher-secret`; else extract a token from
  `Authorization: Bearer` / `?token=` exactly as
  `ledger.js GET /ledger/student/:studentId` does; `verifyToken` it;
  `getRoleByStudentId`; return whether the request is a teacher.
  It performs NO `res` writes -- it returns a boolean; callers send
  the 401.

WI-2d. Replace the 9 inline `x-teacher-secret` checks with
  `await requireTeacher(...)`. The endpoints (all already `async`):
  `POST /roster/enroll`, `GET /roster/list` (server.js);
  `GET /class/grades`, `GET /class/mastery` (class.js -- replaces the
  local `checkTeacherSecret`); `POST /remediation/propose`,
  `/approve`, `/waive`, `GET /remediation/list`,
  `POST /remediation/propose-from-mastery` (remediation.js). On
  non-teacher: keep the existing `401 { ok:false, error:'forbidden' }`.
  Do NOT change `GET /ledger/student/:studentId` -- out of scope.

WI-2e. `roster-client.js` -- `signIn()` stores `role` from the verify
  response into the session; `current()` adds `role` to its returned
  object (default `'student'` if absent, so old sessions are safe).
  `token()` is unchanged. Storage key `apstats_roster.v1` unchanged.

WI-2f. Tests (`roster-server/tests/`): `x-teacher-secret` still
  authorizes every endpoint (fallback intact); a verified teacher
  token authorizes; a verified STUDENT token is rejected (401); a
  bogus/expired token is rejected; with the `role` column absent
  (fake db has no role) the token path degrades to non-teacher while
  the secret still works; `/roster/verify` returns `role`.

## 4. The teacher pages -- work item WI-4 (Sonnet subagent)

Owned paths: `teacher-dashboard.html` (EDIT),
`teacher-roster-console.html` (EDIT), `tests/teacher-auth-pages.test.js`
(NEW). `teacher-code-generator.html` is NOT changed (it makes no
server calls).

WI-4a. Each page loads `roster-client.js` as a sibling script (after
  `roster_config.js`). Both currently load only `roster_config.js`.

WI-4b. In the request helper (`fetchJson` in teacher-dashboard,
  `api` in teacher-roster-console): if `window.rosterClient` has a
  session (`rosterClient.token()` returns a token), add
  `Authorization: Bearer <token>`. Keep sending `x-teacher-secret`
  whenever the secret input is non-empty. Sending both is fine -- the
  server accepts either. A teacher with a session needs nothing in
  the secret field.

WI-4c. The `x-teacher-secret` input + "Remember on this device"
  checkbox STAY (the fallback). Add a short line of helper text that
  it is optional when signed in as a teacher. If a teacher roster
  session is present, show a small "Signed in as <realName>
  (teacher)" line.

WI-4d. `tests/teacher-auth-pages.test.js` -- structure pins: each page
  loads `roster-client.js`; each request helper conditionally adds an
  `Authorization: Bearer` header from `rosterClient.token()`; the
  `x-teacher-secret` path is still present.

## 5. The Desk + cockpit -- work item WI-5 (PLANNER-DIRECT)

Owned paths: `ap_stats_roadmap_square_mode.html` (EDIT),
`teacher-classroom.html` (EDIT), `tests/teacher-auth-desk.test.js`
(NEW). The Desk is the contended single file -- planner-direct.

WI-5a. Remove the access-code UI from the sign-in modal (the
  `signin-teacher` checkbox, `signin-teacher-code` input,
  `signin-teacher-status` span, ~lines 1317-1324) and any JS that
  wires the code field's live feedback.

WI-5b. Remove the standalone teacher fast-path (~lines 4039-4099) and
  the post-sign-in access-code re-check (~lines 4143-4172). Remove the
  `_teacherAccessCode` helper if it has no other use. A teacher always
  goes through the normal roster sign-in.

WI-5c. After a successful roster sign-in, derive teacher-ness from
  `rosterClient.current().role`: if `'teacher'`, set
  `localStorage.apstats_user_role = 'teacher'`; else remove it.
  `apstats_user_role` stays as the Desk's role cache (many features
  read it: the Teacher menu, the gate bypasses) -- but it is now fed
  by the server-verified role, never by an access code.

WI-5d. `updateUserRoleUI` -- re-derive on every call: read
  `rosterClient.current()`; if a session exists, sync
  `apstats_user_role` to match `session.role` (so a stale or
  hand-set key is corrected); show/hide `menu-item-teacher`
  accordingly. Sign-out still clears `apstats_user_role`.

WI-5e. `teacher-classroom.html` -- `currentRole()` reads
  `rosterClient.current() && rosterClient.current().role` instead of
  `localStorage.apstats_user_role`. The boot gate (role === 'teacher'
  AND session) is otherwise unchanged.

WI-5f. `tests/teacher-auth-desk.test.js` -- structure pins: the
  access-code UI / standalone-teacher path / `_teacherAccessCode` are
  GONE; `updateUserRoleUI` reads the roster session;
  `teacher-classroom.html` reads role from the session.

## 6. Build + dispatch plan

WI-2 (roster-server + roster-client) and WI-4 (teacher pages) are
parallel Sonnet subagents -- disjoint files. WI-1 (migration) and WI-5
(Desk + cockpit) are planner-direct. Then: Codex eval -> fold ->
final review -> commit + push follow-alongs (roster-server
auto-deploys). Surface the user-run migration SQL.

## 7. GREEN definition

- roster-server `npm test`: no NEW failures beyond the known
  `redox-chat.test.js` fail; new teacher-auth tests pass.
- follow-alongs root `npm test`: no NEW failures beyond the known
  `study-guide.test.js` fail; new teacher-auth structure tests pass.
- `node scripts/audit-feeder-ids.mjs` -> CLEAN 69 / 0.
- The Desk + all touched files stay LF.

## 8. Rules / gotchas

- ASCII-only in every file (the cross-agent runner has a UTF-8 bug).
- Additive, fail-safe: never break sign-in; never grant teacher access
  on ambiguity; `x-teacher-secret` must keep working unchanged.
- Subagents: do NOT git commit/add/push; edit only owned paths.
- roster-server auto-deploys on commit; the migration is user-run
  AFTER. The code must tolerate the pre-migration window (Section 1).
- Never touch `curriculum_render/data/curriculum.js`.
