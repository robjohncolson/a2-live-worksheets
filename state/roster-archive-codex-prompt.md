# Task: Roster Archive — one-click pruning of test/stale students

You are working on the AP Stats platform (roster-server backend + teacher HTML
frontends). Your job is to implement **ROSTER_ARCHIVE_SPEC.md** (repo root) —
read it first and treat it as the contract. This prompt only sequences it.

The one-line insight: `roster.status ∈ ('active','archived')` has existed since
migration 0001 and is completely dead. You are bringing it to life. **There is
no migration in this task.**

## Files you MUST read first

1. `ROSTER_ARCHIVE_SPEC.md` — the whole thing, especially §2.2 (the caller
   audit) and §4 (invariants; each becomes a test).
2. `roster-server/db.js:263-277` (`listRoster` — your choke point), `:237-244`
   (`deleteRoster` — copy its `.maybeSingle()` 404 pattern), `:183-193`
   (`findByUsername` — already projects `status`).
3. `roster-server/server.js:643-751` (PATCH + DELETE roster endpoints — shape,
   auth, uuid guards for your two new endpoints), `:612` and `:979` (the two
   `db.listRoster` call sites with opposite needs), and the login handler
   (find it; it uses `findByUsername`).
4. `roster-server/class.js:62-72` (the `role !== 'teacher'` filter wrapper) and
   every `db.listRoster` caller listed in spec §2.2.
5. `roster-server/tests/roster-edit.test.js` — your test file mirrors this
   (fake-db object literal + app boot + fetch).
6. `teacher-dashboard.html:484-506` (Grade Backup card markup) and `:1942-2010`
   (its JS wiring) — the Manage Students card copies this shape exactly.
   `:987` (`fetchJson`) and `:2106` (`postJson`) are your transport.
7. `teacher-roster-console.html:757-784` (`deleteRow`) and `:795-852` (roster
   table render) — the Archive button goes next to Delete.

## Steps

1. **db.js**: `listRoster(section, opts)` — add `status` to the projection,
   default `.neq('status','archived')`, `opts.includeArchived` bypass. Add
   `setRosterStatus(studentId, status)`.
2. **Caller audit**: pass `{ includeArchived: true }` ONLY at `server.js:612`
   (`GET /roster/list`, and include `status` in its row payload) and
   `admin-snapshot.js:145`. Verify every other caller from spec §2.2 is
   correct with the new default — list them in your summary.
3. **Endpoints**: `POST /roster/:studentId/archive` + `/unarchive` inline in
   server.js next to PATCH/DELETE. `requireTeacher`, uuid guard, idempotent
   200s, 404 unknown id. Do NOT extend PATCH — its contract excludes status.
4. **Login gate**: archived → 403 `{ ok:false, error:'account archived — ask your teacher' }`
   before bcrypt.
5. **Tests**: `roster-server/tests/roster-archive.test.js` covering invariants
   A1–A6 from spec §4.
6. **Dashboard card** (spec §3.1): new `.section` after the backup card.
   Render name/section/status/uid ONLY — `/roster/list` returns password
   fields; never render or store them. 🧪 badge per the spec heuristics.
   Archive/Unarchive buttons with one `window.confirm`.
7. **Console** (spec §3.2): status pill + Archive/Unarchive button next to
   Delete; grey archived rows.

## Constraints

- Owned paths: `roster-server/db.js`, `roster-server/server.js`,
  `roster-server/admin-snapshot.js`, `roster-server/tests/roster-archive.test.js`,
  `teacher-dashboard.html`, `teacher-roster-console.html`. Touch nothing else.
- Use the Edit tool per change — do NOT rewrite whole files.
- roster-server auto-deploys on push to master: grade-affecting surface. The
  archive filter must be a provable no-op on an all-active roster (invariant A6).
- GitNexus rules apply (AGENTS.md): `impact` before editing any function,
  `detect_changes()` before committing.

## Verification (all must pass before you finish)

- `cd roster-server && npx vitest run` — full suite green, including the golden
  master UNCHANGED (nothing archived in its world → A6).
- `npx vitest run` from root (dashboard/console tests live there).
- Manual trace in your summary: for each of the ~14 `db.listRoster` call sites,
  one line saying archived-excluded or archived-included and why.

## Expected output

A summary listing: files changed, the caller-audit table, test names added,
and explicit confirmation that golden-master output did not move.
