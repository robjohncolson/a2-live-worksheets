# ROSTER_MGMT_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 106). Thread 3 of the
> post-grade-pipeline backlog (CONTINUATION_PROMPT.md session 105).
> Companion frozen contract: ROSTER_MGMT_BUILD.md.

## 1. Overview

Roster management for the teacher: edit a student's section and real
name after enrollment, and quickly create a near-copy of an existing
student. Today `teacher-roster-console.html` lists the roster read-only
-- once a student is enrolled there is no way to fix a mistyped name or
move them to a different section without a direct SQL edit.

Two surfaces:
- roster-server -- one new write endpoint `PATCH /roster/:studentId`
  plus its `db` method. roster-server lives inside follow-alongs
  (`roster-server/`) and auto-deploys on a push touching
  `roster-server/**`.
- `teacher-roster-console.html` -- inline row editing and a duplicate
  affordance.

No schema change, no migration. The roster table already has every
column this thread writes.

## 2. Goals / non-goals

Goals:
- The teacher can correct a student's `real_name` and move them between
  sections from the roster console, without SQL.
- The teacher can create a new student pre-filled from an existing one
  (same section, same name as a starting point) in a couple of clicks.

Non-goals:
- No username editing. `login_username` is UNIQUE and is the student's
  identity for sign-in and for every gradebook ledger row keyed to
  them -- it is immutable.
- No role editing from this surface. `roster.role` (student/teacher) is
  changed only by migration / direct SQL (see the teacher-auth memory).
- No password editing here -- password lifecycle already has its own
  endpoints (`/roster/change-password`) and console sections.
- No delete / archive in this thread (the `status` column's
  `archived` value is left for a future thread).
- No new migration -- `real_name` and `section` are existing,
  already-nullable-free TEXT columns.

## 3. R1 -- the PATCH endpoint

`PATCH /roster/:studentId` on roster-server.

- Auth: `requireTeacher(req, db)` -- identical gate to `POST
  /roster/enroll` and `GET /roster/list` (accepts a teacher roster
  token OR the `x-teacher-secret` break-glass header). 401 on failure.
- Request body: `{ realName?, section? }`. At least one field must be
  present. A present field must be a non-empty string after trim;
  a present-but-blank field is a 400.
- Effect: updates `real_name` and/or `section` on the row with the
  given `student_id`. Touches `updated_at`. Touches NOTHING else --
  not `login_username`, `password_hash`, `password_cipher`,
  `must_change_password`, `role`, `status`, `email`, `created_at`.
- Response: `200 { ok:true, student:{ studentId, realName, section,
  username } }` (mirrors the shape of the enroll response). `404
  { ok:false, error }` if no row has that `student_id`. `400
  { ok:false, error }` on a missing/blank body. `401` on auth failure.
  `500 { ok:false, error }` on an unexpected DB error.

Decisions:
- D-R1a. Path param is the immutable `student_id` (UUID), never the
  username -- a username could in principle be re-pointed; the UUID
  cannot.
- D-R1b. Partial update -- only the fields present in the body change.
  Sending just `{ section }` leaves `real_name` untouched.
- D-R1c. `section` is free-form TEXT (the schema has no format
  constraint; existing values include `PeriodB`, `PeriodE`, `PeriodX`).
  The endpoint trims and rejects empty, but does NOT enforce a pattern.

## 4. R2 -- the db method

New `db.updateStudent({ studentId, realName, section })` in
`roster-server/db.js`, alongside the existing `updatePassword`.

- Builds a partial update payload from only the provided fields, always
  including `updated_at`.
- Returns `{ data, error }` matching the existing db-method convention.
  `data` is the updated row (at least `student_id`, `real_name`,
  `section`, `login_username`); `data` is null / a not-found signal
  when no row matched, so the route can answer 404.
- The live implementation is a Supabase REST `PATCH`; the test fake
  implements the same contract in memory.

## 5. R3 -- duplicate a student (client-side)

"Duplicate" is a client-side convenience in `teacher-roster-console.html`,
NOT a new server endpoint.

Rationale: a duplicated student is a brand-new person who needs a fresh
unique `login_username` and a fresh password. The existing `POST
/roster/enroll` already does exactly that -- username-collision retry,
bcrypt hashing, the reversible-cipher write, `must_change_password`.
A dedicated duplicate endpoint would re-implement that audited path for
no real gain, and would force a decision about copying the source's
(only cipher-recoverable) password. Prefilling enroll avoids all of it.

Behavior:
- Each roster row in the console gets a "Duplicate" button.
- Clicking it prefills the existing "Add One Student" form with the
  source student's `realName` and `section`, scrolls to / focuses that
  form, and leaves the password field for the teacher to set (the same
  as a normal add).
- The teacher reviews, optionally edits the name, and submits through
  the unchanged `POST /roster/enroll`. The new student gets a freshly
  generated unique username and `role:'student'`.

Decisions:
- D-R3a. No server endpoint, no `db` method for duplicate. Pure
  client-side prefill of an already-audited path.
- D-R3b. The source's `email` is NOT carried over (a new person; the
  enroll form's email field is optional anyway).
- D-R3c. If a future thread wants true one-click duplication with no
  review step, that is a documented follow-up (a `POST
  /roster/:studentId/duplicate` server endpoint) -- explicitly out of
  scope here.

## 6. R4 -- inline editing UX in the console

In the existing "View Roster" table (`teacher-roster-console.html`,
the table with columns Real Name / Username / Section / Current
Password / Status / Created):

- Each row gets an "Actions" cell with an "Edit" button and a
  "Duplicate" button.
- "Edit" switches that row into edit mode: the Real Name and Section
  cells become `<input>` fields prefilled with the current values; the
  "Edit" button becomes "Save" + "Cancel". Username, password, status,
  and created stay read-only.
- "Save" validates both fields are non-empty, calls `PATCH
  /roster/:studentId`, and on success updates the row in place and
  exits edit mode; on error it shows the error inline and stays in
  edit mode.
- "Cancel" restores the original values and exits edit mode.
- "Duplicate" performs the R3 prefill.

Decisions:
- D-R4a. Explicit Edit/Save/Cancel buttons -- not `contenteditable`
  cells -- matching the console's existing System-7 button aesthetic
  and making the write intent unambiguous.
- D-R4b. One row editable at a time is sufficient; starting an edit on
  another row while one is open simply cancels the first.
- D-R4c. Requests reuse the console's existing `api()` helper, which
  already sends both the `x-teacher-secret` header and the teacher
  Bearer token when available -- the server's `requireTeacher` accepts
  either.

## 7. Auth

No new auth surface. `PATCH /roster/:studentId` uses the same
`requireTeacher` gate as the other teacher-gated roster routes. The
console already authenticates every call through `api()` with the
teacher secret and/or the roster Bearer token.

## 8. Testing

- New `roster-server/tests/roster-edit.test.js` (vitest, the existing
  `createFakeDb()` + `TestServer` pattern from `tests/auth.test.js`):
  PATCH happy path (realName only, section only, both); 401 without
  auth; 404 for an unknown `studentId`; 400 for an empty body and for a
  blank field; a pin that `login_username`, `role`, and the password
  fields are never modified by PATCH; the `db.updateStudent` partial
  payload shape.
- New `tests/roster-console-structure.test.js` (follow-alongs root
  vitest + jsdom): the View Roster table renders an Actions cell with
  Edit and Duplicate; Edit swaps Real Name / Section into inputs;
  Save issues a `PATCH /roster/:id`; Duplicate prefills the Add form
  with the source row's name + section.

Definition of done: `roster-server` `npm test` and follow-alongs root
`npm test` both show no NEW failures beyond the known pre-existing
follow-alongs `tests/study-guide.test.js` fail; the two new test files
pass; `node scripts/audit-feeder-ids.mjs` -> CLEAN.

## 9. Constraints and risks

- `login_username` is UNIQUE and immutable -- PATCH must never touch
  it. Pinned by a test.
- `roster.role` is server-of-record for teacher auth -- PATCH must
  never touch it. Pinned by a test.
- This thread touches `roster-server/**`, so the push AUTO-DEPLOYS
  roster-server to Railway. The PATCH endpoint is additive and the
  console change is client-side, so the deploy is low-risk -- but the
  new endpoint is only live in prod once that deploy lands.
- All roster-server files and `teacher-roster-console.html` are LF --
  preserve.
- ASCII-only in new files (the Codex cross-agent runner has a known
  UTF-8 decode bug).
- Stage own paths only -- the repo carries pre-existing untracked
  scratch; never `git add -A`.
