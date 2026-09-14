# SCHOOLOGY_UID_BRIDGE_P4B_BUILD.md — roster ↔ Schoology-uid bridge (grade-pipeline P4b)

> Build contract for **P4b** of `GRADE_PIPELINE_E2E_SPEC.md`. Verified against
> source 2026-05-31 (session 123, HEAD `6958ca1`). Line numbers drift —
> re-confirm before editing. **ASCII only. roster-server files use LF.**

## 0. Why

The grade→Schoology connector (`schoology_sync_section.py`) keys every grade push
on the **Schoology user id**: `_push_grades` resolves the live gradebook row via
`students_by_id.get(str(student_id))` (`tools/schoology_sync_section.py:468`), where
`student_id` is the first segment of each fixture key `"<id>/<lessonKey>"`
(`_load_grades_fixture:713`). But the producer (`build_schoology_fixture.py`) emits
the **roster UUID** (`/class/grades` `studentId`), which never matches a Schoology
uid. Today's stopgap is a hand-authored `--uid-map`.

**P4b** makes the mapping durable: a `roster.schoology_uid` column, a teacher-gated
backfill route, the uid surfaced on `/class/grades`, and the producer preferring it
— so the daily batch needs no hand-authored map.

## 1. Hard constraints (read before touching anything)

1. **roster-server/** auto-deploys to Railway on push. These edits touch a LIVE
   grade server for real students. Every read of the new column MUST degrade
   gracefully if the migration has not run yet (column absent). Mirror the existing
   defensive precedents: `db.js::getSpriteHueByStudentId` (returns null on any error)
   and the sprite-hue route's `42703 → 503 'not provisioned'` mapping
   (`server.js:415`).
2. **The migration is USER-RUN** on the shared curriculum_render Supabase (like
   `0010`, `0011`). Code must not assume it has run.
3. **Do NOT modify** `POST /roster/enroll` (FROZEN CONTRACT 2) or the existing
   `PATCH /roster/:studentId` (frozen to realName/section). Population goes through a
   NEW dedicated sub-route, mirroring `PATCH /roster/:studentId/sprite-hue`.
4. **Do NOT add `schoology_uid` to `db.js::listRoster`'s projection.** `listRoster`
   feeds `/roster/list`, `/class/grades`, AND `/class/mastery`; a select on a
   non-existent column 500s all three pre-migration. Use a SEPARATE defensive batch
   lookup instead (`getSchoologyUidMap`).
5. **`curriculum_render/data/curriculum.js` is sacred** — untouched (not in scope).
6. Additive only. Existing tests must stay green. New fake-db test doubles that lack
   the new functions must not break callers (typeof-guard the call site).

## 2. Work units (disjoint file sets — safe to build in parallel)

### Unit A — roster-server core

**A1. Migration** `roster-server/migrations/0012_roster_schoology_uid.sql` (new):

```sql
-- 0012_roster_schoology_uid: add the schoology_uid bridge column to roster.
-- Maps a roster student to their Schoology user id so the grade-sync producer
-- (tools/build_schoology_fixture.py) can key the fixture by Schoology uid
-- directly, instead of a hand-authored --uid-map. GRADE_PIPELINE_E2E_SPEC.md P4b.
--
-- Additive + idempotent. Run on the shared curriculum_render Supabase. NEVER
-- ALTER or touch any other table in this shared project.
alter table roster add column if not exists schoology_uid text;

-- One Schoology account maps to at most one roster row. Partial unique index
-- (nulls ignored) blocks two students sharing a uid; many NULLs are allowed.
create unique index if not exists roster_schoology_uid_key
  on roster (schoology_uid) where schoology_uid is not null;
```

**A2. `roster-server/db.js`** — add two functions, export both from `createDb`:

- `getSchoologyUidMap(studentIds)` — defensive batch lookup. Returns
  `{ [student_id]: uid }` for rows with a non-null `schoology_uid`; returns `{}` on
  empty input, on any error (incl. `42703` undefined_column pre-migration), or on a
  throw. NEVER throws. Pattern = `getSpriteHueByStudentId`.

  ```js
  async function getSchoologyUidMap(studentIds) {
    try {
      if (!Array.isArray(studentIds) || studentIds.length === 0) return {};
      const { data, error } = await client
        .from('roster')
        .select('student_id, schoology_uid')
        .in('student_id', studentIds);
      if (error || !Array.isArray(data)) return {};
      const out = {};
      for (const r of data) {
        if (r && r.schoology_uid != null) out[r.student_id] = r.schoology_uid;
      }
      return out;
    } catch (_) {
      return {};
    }
  }
  ```

- `updateSchoologyUid({ studentId, schoologyUid })` — writes only `schoology_uid`
  (+ `updated_at`). `schoologyUid` is already validated/normalized by the route
  (non-empty string OR null). Returns `{ data, error }`; `data` is `{ student_id,
  schoology_uid }` on success, `null` when no row matched. Pattern = `updateSpriteHue`.

  ```js
  async function updateSchoologyUid({ studentId, schoologyUid }) {
    return client
      .from('roster')
      .update({ schoology_uid: schoologyUid, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .select('student_id, schoology_uid')
      .maybeSingle();
  }
  ```

  Add `getSchoologyUidMap, updateSchoologyUid` to the object returned at the top of
  `createDb` (the `return { ... }` line ~24).

**A3. `roster-server/server.js`** — new route `PATCH /roster/:studentId/schoology-uid`
(teacher-gated). Place it right after the sprite-hue route. Mirror sprite-hue's
column-missing → 503 detection but **auth = `requireTeacher`** (not a student token):

- 401 `{ok:false,error:'forbidden'}` if `!await requireTeacher(req, db)`.
- Body `{ schoologyUid: string | null }`. The key MUST be present (a missing key is
  400 — never a silent clear, same rule as sprite-hue). Value rules:
  - `null` → clears the mapping (allowed).
  - a non-empty string (after trim) → stored trimmed.
  - a **number** → coerce to its string form (Schoology uids are numeric strings;
    accept `8405518810` or `"8405518810"`).
  - anything else (object/boolean/empty-or-whitespace string) → 400.
- On DB error: detect column-missing (`code === '42703'`, or message contains
  `schoology_uid` AND `does not exist`/`column`) → **503 `{ok:false,error:'schoology_uid
  not provisioned'}`**. Any other error → 500 `{ok:false,error:'Database error'}`.
- `data === null` (no row matched) → 404 `{ok:false,error:'Student not found'}`.
- Success → 200 `{ok:true, schoologyUid: data.schoology_uid}`.

Reuse a local `isSchoologyUidColumnMissing(e)` helper shaped like the existing
`isSpriteHueColumnMissing`.

**A4. `roster-server/class.js`** — surface the uid in `/class/grades`. After
`const fan = await fanLedger(ledgerDb, rows);` (~line 78), compute the map ONCE and
merge it per student. **typeof-guard** so existing fake dbs without the function
don't throw:

```js
const uidMap = (db && typeof db.getSchoologyUidMap === 'function')
  ? await db.getSchoologyUidMap(rows.map(r => r.student_id))
  : {};
const students = fan.map(({ roster, ledgerRows }) => {
  const computed = computeGrade(ledgerRows, answerKey, config, { lessonSchedule, section: roster && roster.section ? roster.section : null, worksheetBlankCounts });
  return { ...studentMeta(roster), schoologyUid: uidMap[roster.student_id] ?? null, ...computed };
});
```

(Do NOT touch `studentMeta` — the merge happens at the call site so `studentMeta`
stays a pure roster→header map.)

**A5. Tests** (`roster-server/tests/`):
- `db.js`: `getSchoologyUidMap` returns the map for mapped rows, `{}` for empty input,
  `{}` when the client errors / throws; `updateSchoologyUid` builds the right payload
  and returns `{data:null}` on no-match.
- New `tests/schoology-uid.test.js` for the route: 200 set (string + numeric coerce),
  200 clear (null), 400 missing key, 400 bad type, 401 no/wrong secret, 404 unknown
  student, **503 when the fake db returns `{error:{code:'42703'}}`**, 500 on other
  error. Use the `createFakeDb()` + `TestServer` pattern from `auth.test.js` /
  `roster-edit.test.js`; extend the fake db with `updateSchoologyUid` +
  `getSchoologyUidMap`.
- `/class/grades`: a student carries `schoologyUid` when the fake db's
  `getSchoologyUidMap` returns one; `null` when absent; endpoint still works when the
  db lacks `getSchoologyUidMap` (back-compat / typeof-guard).

### Unit B — producer (`tools/build_schoology_fixture.py`)

**B1.** In `build_fixture`, prefer the server-surfaced uid, then the explicit
`--uid-map`, then the roster id:

```python
rid = str(s.get("studentId"))
surfaced = s.get("schoologyUid")
uid = str(surfaced) if surfaced not in (None, "") else uid_map.get(rid, rid)
```

**B2.** In `inspect_summary`, add bridge coverage:
`uid_bridge_covered = sum(1 for s in students if s.get("schoologyUid") not in (None, ""))`
and include it in the returned dict. In `--inspect`, after the existing NOTEs, if
`students > 0 and uid_bridge_covered == 0`, print a NOTE to stderr that the uid bridge
is empty (run migration 0012 + backfill via `teacher-roster.mjs --set-schoology-uids`,
else pass `--uid-map`).

**B3.** Update the module docstring: with the bridge populated, `--uid-map` is
optional (the server surfaces `schoologyUid`); `--uid-map` still overrides.

**B4.** Extend `tests/test_build_schoology_fixture*.py` (find the existing test file):
`build_fixture` prefers `schoologyUid` over `uid_map` over `studentId`; falls back
correctly when `schoologyUid` is null/absent; `inspect_summary` reports
`uid_bridge_covered`.

### Unit C — bulk-enroll backfill (`scripts/teacher-roster.mjs`)

**C1.** New mode `--set-schoology-uids <csv>` (additive; flag-parser already treats
unknown `--x value` as `flags.x = value`, so no parser change needed beyond routing).
CSV rows: `username,schoologyUid` (header auto-detected/skipped: first cell in
`['username','user','login','login_username']`). Behavior:
- Resolve service URL + secret like the other modes.
- `--dry-run`: parse + print the plan (rows + resolved URL/secret presence), NO
  network — consistent with enroll's dry-run.
- Live: `GET /roster/list[?section=]` (reuse the TR1 endpoint) to build a
  `login_username -> student_id` map (case-insensitive); also map `realName ->
  student_id` as a fallback join key. For each CSV row, resolve the studentId, then
  `PATCH /roster/:studentId/schoology-uid` with `{schoologyUid}` (empty cell → null,
  i.e. clear). Print an aligned result table (username, schoologyUid, status). Exit
  non-zero if any row failed/unresolved.
- A `--section` filter scopes the `/roster/list` fetch.

**C2.** Add a `--set-schoology-uids` block to `HELP` and route it in `main()` (before
the enroll path, like `--view`). Keep it self-contained; reuse `splitCsvLine`,
`csvCell`, `printTable`, `resolveUrl`, `resolveSecret`, `readFileSafe`.

**C3.** If feasible without heavy harness, add a tiny test (or a `--dry-run` smoke in
a comment) for the CSV parse + plan. Node has no existing test for this script; a
light parse-only unit is acceptable, do not over-build.

### Unit D — daily batch (Windows schtask)

**D1.** `tools/daily_schoology_sync.ps1` (new, LF or CRLF both fine for ps1):
- Params: `-Section <S>` (default `PeriodB`), `-Live` (switch; default = DRY-RUN),
  `-Base <url>`, `-LogDir <path>` (default `tools/.schoology-sync-logs`).
- Reads `ROSTER_TEACHER_SECRET` from the environment (never on the CLI). If unset,
  errors with guidance and exits 1.
- Step 1: `python tools/build_schoology_fixture.py --section <S> --out <temp fixture>`
  (env carries the secret).
- Step 2: `python tools/schoology_sync_section.py --sync-section <S> --grades-fixture
  <temp fixture>` PLUS `--dry-run` UNLESS `-Live` is passed.
- Tee all output to a timestamped log under `-LogDir`. Non-zero exit on any failure.
- Header comment: this is the single-host teacher-laptop daily batch
  (GRADE_PIPELINE_E2E_SPEC.md §4). **Defaults to dry-run by design** — flip to
  `-Live` only once SY26-27 marking periods exist (the live dated sync is PARKED to
  ~Sept-2026; see SCHOOLOGY_SYNC_V1_BUILD.md P2b gate).

**D2.** `tools/register_schoology_sync_task.ps1` (new): one-time `schtasks /Create`
that registers a daily run of `daily_schoology_sync.ps1` at a chosen time
(`-Time 16:30` default, `-TaskName ApStatsSchoologySync` default, `-Live` switch
forwarded). Echo the created task + how to remove it (`schtasks /Delete`). Mirror the
existing auto-continuation schtask infra style.

**D3.** Document the daily batch in `GRADE_PIPELINE_E2E_SPEC.md` (§4 / §7 P4b status):
how to set the env secret, register the task, and the dry-run→live gate.

## 3. Acceptance

- roster-server vitest GREEN (existing + new); `npx vitest run` in `roster-server/`.
- python: the build_schoology_fixture test file passes (`python -m pytest` or the
  repo's `python tests/test_build_schoology_fixture*.py` runner — match the existing
  convention).
- Root vitest unaffected (sanity: the known 1 pre-existing failure may remain; no NEW
  failures).
- `build_fixture` with a `/class/grades` doc that carries `schoologyUid` produces
  Schoology-uid-keyed fixture entries with NO `--uid-map`.
- `--inspect` reports `uid_bridge_covered`.
- All four units are ADDITIVE; `git diff` touches only: `roster-server/migrations/
  0012_*.sql`, `roster-server/db.js`, `roster-server/server.js`, `roster-server/
  class.js`, `roster-server/tests/*`, `tools/build_schoology_fixture.py`,
  `tests/test_build_schoology_fixture*.py`, `scripts/teacher-roster.mjs`,
  `tools/daily_schoology_sync.ps1`, `tools/register_schoology_sync_task.ps1`,
  `GRADE_PIPELINE_E2E_SPEC.md`, this spec.

## 4. Post-build (teacher actions — NOT code)

1. Run `0012_roster_schoology_uid.sql` on the curriculum_render Supabase.
2. Backfill uids: `node scripts/teacher-roster.mjs --set-schoology-uids uids.csv
   --section <S>` (CSV: `username,schoologyUid`).
3. Verify: `ROSTER_TEACHER_SECRET=... python tools/build_schoology_fixture.py
   --section <S> --inspect` → `uid_bridge_covered > 0`.
4. Daily batch stays **dry-run** until SY26-27 marking periods exist (~Sept-2026).
