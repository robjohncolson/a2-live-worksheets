# ROSTER_MGMT_BUILD.md

Frozen implementation contract for **Thread 3 -- Roster management**.
`ROSTER_MGMT_SPEC.md` is the design; this is the precise, frozen
contract. Written 2026-05-21 (session 106).

Two work items, A and B, built by parallel Sonnet subagents. They touch
disjoint files and both conform to the frozen PATCH contract in Section
1, so they do not clobber and need not serialize.

## 0. The frozen PATCH contract (both work items conform to this)

`PATCH /roster/:studentId` on roster-server.

- Auth: `requireTeacher(req, db)` (the existing gate). 401 if it
  returns false.
- `:studentId` is the roster `student_id` UUID.
- Request body JSON: `{ realName?, section? }`. At least one key
  present. Each present value must be a string that is non-empty after
  `.trim()`.
- Success: `200 { ok:true, student:{ studentId, realName, section,
  username } }`.
- Errors: `400 { ok:false, error }` (no editable field present, or a
  present field blank); `401` (auth); `404 { ok:false, error }`
  (no roster row with that `student_id`); `500 { ok:false, error }`
  (unexpected DB error).
- The endpoint writes ONLY `real_name`, `section`, `updated_at`. It
  never writes `login_username`, `password_hash`, `password_cipher`,
  `must_change_password`, `role`, `status`, `email`, or `created_at`.

## 1. Work item A -- roster-server (Sonnet)

Owned paths: `roster-server/db.js` (EDIT), `roster-server/server.js`
(EDIT), `roster-server/tests/roster-edit.test.js` (NEW). roster-server
uses ES modules + vitest.

A1. `db.js` -- add `updateStudent({ studentId, realName, section })`
    alongside `updatePassword` (~after line 102):
    - Build a partial update object containing only the provided
      fields (`real_name` from `realName`, `section` from `section`),
      always plus `updated_at: new Date().toISOString()`.
    - Live impl: a Supabase REST `PATCH` on `roster` filtered by
      `student_id`, selecting back `student_id, real_name, section,
      login_username`.
    - Return `{ data, error }` matching the existing db-method
      convention. `data` is the updated row; when no row matched,
      `data` is null (so the route answers 404). Never throw.

A2. `server.js` -- add a `PATCH /roster/:studentId` route near
    `GET /roster/list` (~after line 269). Model the auth + error
    handling on the enroll route (~lines 48-118):
    - `if (!await requireTeacher(req, db)) return 401`.
    - Read `studentId` from the path; read `realName`/`section` from
      the JSON body.
    - Validate: at least one of `realName`/`section` present; each
      present value trims to non-empty. Else 400.
    - Call `db.updateStudent({ studentId, realName, section })` with
      only the trimmed present fields. On `error` -> 500. On
      `data == null` -> 404. On success -> 200 with the contract
      response shape (`username` from the row's `login_username`).
    - Additive only -- do not modify any existing route or handler.
    - Match the Express routing style already used (the project uses
      explicit method handlers; if a router pattern is in use, follow
      it). If the framework needs a body parser for PATCH, the enroll
      POST already proves JSON bodies are parsed -- reuse that path.

A3. `tests/roster-edit.test.js` (NEW) -- vitest, reuse the
    `createFakeDb()` + `TestServer` pattern from `tests/auth.test.js`
    (extend the fake db with an `updateStudent` that mutates the
    in-memory row and returns null-data for an unknown id). Cases:
    - PATCH realName only / section only / both -> 200, row updated.
    - No auth header -> 401.
    - Unknown `studentId` -> 404.
    - Empty body `{}` -> 400; a present-but-blank field -> 400.
    - A pin that after PATCH the row's `login_username`, `role`, and
      password fields are byte-identical to before.
    - The `updateStudent` payload includes `updated_at` and excludes
      every non-editable column.

A4. `server.js` -- `GET /roster/list` currently maps each roster row to
    a UI object that omits the id. Add `studentId` (the row's
    `student_id`) to that mapped object so the console can address rows
    for PATCH. `db.listRoster` already selects `student_id` -- this is
    an additive pass-through that changes no other field (mirrors the
    Phase 4a `13cb326` rationale). Extend `tests/roster-edit.test.js`
    (or the existing list test) with a pin that `/roster/list` exposes
    `studentId`.

## 2. Work item B -- teacher-roster-console.html (Sonnet)

Owned paths: `teacher-roster-console.html` (EDIT),
`tests/roster-console-structure.test.js` (NEW).

B1. In the "View Roster" table (the table whose columns are Real Name /
    Username / Section / Current Password / Status / Created): add an
    "Actions" column. Each rendered student row gets, in that column,
    an "Edit" button and a "Duplicate" button.

B2. Edit mode (one row at a time):
    - "Edit" replaces the Real Name and Section cell contents with
      `<input type="text">` prefilled with the current values, and
      swaps the row's buttons to "Save" + "Cancel". Username, Current
      Password, Status, Created stay read-only.
    - "Save": validate both inputs trim to non-empty; call
      `PATCH /roster/<studentId>` via the existing `api()` helper with
      body `{ realName, section }`. On success, write the returned
      values back into the row's cells and exit edit mode. On error,
      show the error text inline (near the row) and stay in edit mode.
    - "Cancel": restore the original cell text, exit edit mode.
    - Starting Edit on another row while one is open cancels the first.
    - Each row carries the student's `studentId` as a data attribute,
      read from the `GET /roster/list` response -- work item A extends
      that response to include `studentId`. Work item B edits no server
      file.

B3. Duplicate: "Duplicate" prefills the existing "Add One Student" form
    (the Real name + Section fields) with the source row's real name
    and section, then scrolls to / focuses that form. It does NOT
    submit. The teacher reviews, sets a password, and submits through
    the unchanged `POST /roster/enroll` path. No new endpoint, no
    server call from the Duplicate button itself.

B4. `tests/roster-console-structure.test.js` (NEW) -- follow-alongs
    root vitest + jsdom, following an existing HTML structure test
    (e.g. `tests/ui-components.test.js`): the roster table renders an
    Actions cell with Edit + Duplicate; Edit swaps Real Name/Section to
    inputs and shows Save/Cancel; Save targets `PATCH /roster/`;
    Duplicate populates the Add-form name + section fields.

## 3. Cross-cutting rules (both work items)

- EOL: every roster-server JS file and `teacher-roster-console.html`
  are LF -- preserve.
- ASCII-only in all new/edited content (the Codex cross-agent runner
  has a known UTF-8 decode bug).
- Subagents: do NOT `git commit`, `git push`, or `git add`. Create/edit
  ONLY your owned paths. The planner commits after Codex eval + final
  review.
- Work item B must not edit any server file; work item A must not edit
  the console. If B finds it needs a server change (see B2), it stops
  and reports rather than crossing the boundary.

## 4. Dispatch and verification

A and B dispatch as parallel Sonnet subagents. Then: Codex read-only
review -> planner folds findings + re-verifies on disk -> commit.

The whole thread is ONE commit (roster-server + console together --
it is one feature). Because it touches `roster-server/**`, the push
auto-deploys roster-server to Railway.

## 5. Definition of done (GREEN)

- `roster-server` `npm test`: no NEW failures; `roster-edit` passes.
- follow-alongs root `npm test`: no NEW failures beyond the known
  pre-existing `tests/study-guide.test.js` fail; `roster-console-structure`
  passes.
- `node scripts/audit-feeder-ids.mjs` -> CLEAN 69 / MISMATCH 0.
- All touched files LF.
- After the auto-deploy lands, `PATCH /roster/:id` returns 401 without
  auth (route mounted) -- verify on Railway.
