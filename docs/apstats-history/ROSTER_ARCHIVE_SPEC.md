# ROSTER ARCHIVE SPEC — one-click pruning of test/stale students

Give the teacher a button to make a student vanish from every class surface —
gradebook, sign-in picker, wallets, review queue, presence pickers — without
destroying their data, and an equally easy Unarchive to undo it. Hard delete
stays where it is (local roster console) for true nukes. The core insight: the
`roster.status ∈ ('active','archived')` column has existed since migration 0001
and is dead — no endpoint writes it, `db.listRoster()` doesn't even project it.
This spec brings it to life. **No new migration is needed.**

> **Status:** proposed. **Owner:** teacher. **Workflow:** brainstorm → spec → implement (Codex).
> Grade-adjacent (touches the roster enumeration that feeds the gradebook) but
> additive and reversible — archived students are filtered at read time, their
> `item_ledger` / `doge_account` rows are untouched. Review carefully anyway:
> a wrong default filter could hide a REAL student from grading.

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| `roster.status` check `('active','archived')` | `roster-server/migrations/0001_roster.sql:6-16` | THE flag — already in the schema |
| `db.listRoster(section)` | `roster-server/db.js:263-277` | single choke point for the filter (no `status` in projection today) |
| `listRoster(db, section, includeStaff)` staff filter | `roster-server/class.js:62-72` | pattern for the archived filter |
| `db.findByUsername` (projects `status`) | `roster-server/db.js:183-193` | login gate |
| gift/bet recipient guards already checking `status !== 'active'` | `roster-server/doge-wallet.js:351,408` | proof the flag is honored where it IS read |
| `PATCH /roster/:studentId` (name/section only) | `roster-server/server.js:643-694` | endpoint shape + tests (`tests/roster-edit.test.js`) |
| `DELETE /roster/:studentId` + console `deleteRow()` | `server.js:702-751`, `teacher-roster-console.html:757-784` | stays as-is: the hard-delete escape hatch |
| `requireTeacher(req, db)` | `roster-server/teacher-auth.js:47-77` | auth for the new endpoints |
| Dashboard card pattern (Grade Backup card) | `teacher-dashboard.html:484`, wiring `:1942-2010` | the new Manage Students card copies this shape |
| Console roster table + inline edit | `teacher-roster-console.html:608-784` | gets an Archive button next to Delete |

## 1. Goals / Non-goals

Goals:
1. One-click **Archive** / **Unarchive** per student, from the teacher dashboard (the surface the teacher already lives in) and the roster console.
2. Archived students disappear from every class enumeration by default: gradebook (`/class/grades`), mastery, quarter close, wallets, casino, review queue, submissions archive, remediation proposals, trainer leaderboards, and — critically — the PUBLIC sign-in/gift picker `GET /roster/section/:section`.
3. Archived students cannot log in (clear message, not a silent 401).
4. Fully reversible: Unarchive restores everything, because nothing was deleted.
5. A "looks like a test account" hint so the teacher doesn't have to remember who's fake.

Non-goals (v1):
- No auto-archive, no bulk heuristation beyond the visual hint (teacher clicks per student; a select-all-flagged bulk action is a v2 nicety).
- No change to hard delete (console keeps it; cascade behavior unchanged).
- No new `test` column — `SMOKETEST` section convention + heuristics suffice.
- No Schoology-side changes (archived students simply drop out of `/class/grades`, which the fixture reads).

## 2. Server changes (roster-server — flag every change, it auto-deploys)

### 2.1 `db.js`
- `listRoster(section, opts = {})`: add `status` to the projection; by default append `.neq('status', 'archived')`; `opts.includeArchived === true` skips the filter. (Supabase query builder — mirror the existing section filter.)
- `setRosterStatus(studentId, status)`: narrow single-column update + `updated_at`, `.maybeSingle()` 404 pattern copied from `deleteRoster` (`db.js:237-244`). Only `'active'|'archived'` accepted.

### 2.2 Callers of `db.listRoster` — audit every one
Default (exclude archived) is correct for: `class.js:184,231,340,577,646`, `review.js:206,392`, `submissions.js:102`, `remediation.js:332`, `trainer.js:405`, `doge-wallet.js:112` (`sectionIds`), and the public picker `server.js:979`.
Pass `{ includeArchived: true }` in exactly two places:
- `GET /roster/list` (`server.js:612`) — the console/dashboard management view must SHOW archived students (so they can be unarchived). Return `status` in the row payload.
- `admin-snapshot.js:145` — the durability snapshot must capture everyone.

### 2.3 New endpoints (inline in `server.js` next to PATCH/DELETE)
- `POST /roster/:studentId/archive` and `POST /roster/:studentId/unarchive` — `requireTeacher`, uuid guard, call `setRosterStatus`, return `{ ok, studentId, status }`. Idempotent (archiving an archived student is a 200 no-op).
- Deliberately NOT folded into `PATCH /roster/:studentId` — that endpoint's contract says it never touches status/role/credentials; keep that promise.

### 2.4 Login gate
In the login handler (find it via `db.findByUsername`, which already projects `status`): if `status === 'archived'`, return 403 `{ ok:false, error:'account archived — ask your teacher' }` BEFORE the bcrypt compare. Token-refresh/verify paths for an already-issued token can stay as-is for v1 (tokens expire; the enumeration filters do the real work).

## 3. UI

### 3.1 Teacher dashboard — new "Manage Students" card
New `.section` after Grade Backup & Recovery, same pattern (function cluster + `addEventListener` wiring). Loads `GET /roster/list` (teacher secret; NOTE: this endpoint returns password material — render ONLY name/section/status/uid, never the password fields). Per row:
- name · section · status pill (`active` / `archived` greyed)
- 🧪 **test?** badge when heuristics fire: `schoologyUid` empty AND section is `SMOKETEST`-like OR name matches `/test|demo|asdf|zz/i`. Pure client-side hint, no server change.
- **Archive** button (one `window.confirm`: "Hide NAME from all class views? Their work is kept; Unarchive restores everything.") / **Unarchive** button for archived rows.

### 3.2 Roster console
In the existing roster table (`teacher-roster-console.html:795-852`): render the status pill, add an **Archive/Unarchive** button next to Delete, and grey archived rows. Delete keeps its scarier confirm text.

### 3.3 Student-visible effect
An archived student's login fails with the clear message; classmates stop seeing them in gift/opponent pickers (the `/roster/section/:section` filter + the existing `doge-wallet.js` status guards). No other student-facing UI change.

## 4. Invariants (each maps to a test)

- A1: archive/unarchive never touches `item_ledger`, `doge_account`, `doge_ledger`, or any child row — only `roster.status` + `updated_at`.
- A2: archived student absent from `/class/grades`, `/class/wallets`, `/class/review-queue`, `/roster/section/:section`; present in `/roster/list` (with status) and `/admin/snapshot`.
- A3: archive → unarchive → `/class/grades` output for that student is byte-identical to never-archived (same fixture world).
- A4: archived login → 403 with the friendly error; active login unaffected.
- A5: endpoints are teacher-gated (401 without secret/bearer) and idempotent.
- A6: gradebook golden master UNCHANGED when no student is archived (the filter must be a pure no-op on an all-active roster).

## 5. Phases

| Phase | Work |
|---|---|
| 1 — server | db.js changes + endpoints + login gate + caller audit + tests |
| 2 — dashboard | Manage Students card |
| 3 — console | Archive button + status pill in the roster table |

## 6. Tests (Vitest, mirrors `tests/roster-edit.test.js`)
`roster-server/tests/roster-archive.test.js`: fake-db app boot; A1–A6 above; plus: `includeArchived` plumbing (`/roster/list` shows, `/class/grades` hides), unknown studentId → 404, bad status transition impossible (only the two endpoints write).

## 7. Open decisions (defaults chosen; change if you want)

- Archived students keep their username reserved (uniqueness unchanged) **[default: yes — prevents a new student silently colliding with an archived identity]**.
- Do archived rows count in Monthly/Do-Now style aggregates? **[default: excluded everywhere `listRoster` default applies — nothing special-cased]**.
- Bulk "archive all flagged" button **[default: v2]**.

## 8. Files touched (estimate)

**New:** `roster-server/tests/roster-archive.test.js`.
**Edited:** `roster-server/db.js`, `roster-server/server.js`, `roster-server/admin-snapshot.js` (one arg), `teacher-dashboard.html`, `teacher-roster-console.html`.
**Unchanged:** all migrations (0001 already has the column), grade engine, wallet SQL, worksheets, Desk.

### TL;DR
`roster.status='archived'` already exists in the schema — write it from two new teacher-gated endpoints, filter it by default inside `db.listRoster` (with an `includeArchived` escape hatch for `/roster/list` and the admin snapshot), block archived logins, and put Archive/Unarchive buttons in a new dashboard card + the console table. No migration, no deletion, fully reversible.
