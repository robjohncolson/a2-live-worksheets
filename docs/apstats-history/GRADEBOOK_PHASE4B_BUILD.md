# Gradebook Phase 4b — remediation_assignment write loop (FROZEN CONTRACT)

**Status:** Planner-frozen 2026-05-19 (session 100, autonomous loop, after
Phase 5 `e592d1b` DONE+PUSHED). This is the authoritative Phase-4b build
contract. Implement it loop-style (freeze → build → Codex review → planner
verify on disk → commit/push → redeploy roster-server + smoke; user runs
the SQL migration whenever ready — server degrades gracefully until then).
Reads: `GRADEBOOK_GRADING_SPEC.md` §6 (the `remediation_assignment` record
+ retake gate), §3 (the diagnostic/remediation engine — `decision B`
survives, re-check raises grade), `GRADEBOOK_PHASE4_BUILD.md` §1 (the 4a/4b
scope split rationale; 4b is the "remediation write loop").

Depends on (DONE & prod-verified): Phase 0 roster auth (`a7d7bbd`),
Sprint 1 item_ledger (`d461ebc`), Phase 3 `/grade` + `/mastery` (`801dccc`),
Phase 4a `/class/grades` + `/class/mastery` + `teacher-dashboard.html`
(`d68e98b` + `13cb326` hotfix).

## 1. Scope

Phase 4b ships the **record + approval workflow** for the
`remediation_assignment` table per `GRADEBOOK_GRADING_SPEC.md` §6. The
shape of the workflow:

1. The teacher sees per-skill weak students on the Phase-4a dashboard
   (already shipped).
2. System (or teacher manually) **proposes** a remediation row per
   (student × weak-skill), status=`proposed`.
3. Teacher **approves** → status=`assigned` (`assigned_at` set,
   `approved_by` recorded).
4. Student (or teacher acting for them) **completes** the assigned
   remediation → status=`completed` (`completed_at` set, optional
   `completed_score`/`recheck_item_id`).
5. The retake gate (`GET /remediation/unlocks?skill=X`) is unlocked iff
   every `assigned` remediation for (student, X) is `completed` (spec §6).
6. Future phases consume the gate to allow a grade-raising re-check;
   Phase 4b itself does NOT enforce or implement the re-check item — it
   only defines the record + gate.

**In scope:**
- New Supabase table `remediation_assignment` + migration SQL.
- Roster-server additive endpoint module + data-access wrapper.
- Tests against a fake DB (injectable).
- Additive teacher-dashboard.html section to drive approvals + a
  "propose-from-mastery" bulk action.
- Graceful-degrade when the table is not yet provisioned (return 503 with
  a clear "migration pending" reason; the rest of the server stays up).

**Out of scope (Phase 4c or later — explicit non-goals):**
- The re-check item itself (the gated retake the spec mentions). Phase 4b
  defines the gate; consumers wire enforcement.
- Auto-completing a remediation from `item_ledger` rows (server-derived
  completion). v1 = explicit completion calls only.
- A student-facing UI for browsing/completing remediations (the teacher
  drives v1; a student UI is a follow-up).
- Editing Phase-4a `/class/*` endpoints, `computeGrade`, `computeMastery`,
  or any client other than `teacher-dashboard.html`.
- Touching sacred `curriculum_render/data/curriculum.js`.

## 2. The five deliverables (Phase 4b)

### 2.1 Migration SQL — `roster-server/migrations/0004_remediation_assignment.sql`

User-run in the curriculum_render Supabase SQL editor (`<AP_SUPABASE_PROJECT_REF>`,
per `GRADEBOOK_SPEC.md` §6.1 revised). Creates ONLY the new table — never
ALTERs an existing one (shared-project discipline, same as 0001/0002).

```sql
create table if not exists remediation_assignment (
  assignment_id    uuid primary key default gen_random_uuid(),
  student_id       uuid not null references roster(student_id) on delete cascade,
  unit             text not null,
  skill            text not null,
  source_attempt   text,                -- optional reference to an item_ledger row id
  assigned_refs    jsonb not null default '[]'::jsonb,  -- list of items the student is being asked to do
  status           text not null check (status in ('proposed','assigned','completed','waived')) default 'proposed',
  proposed_by      text not null default 'system',
  approved_by      text,                -- teacher username/email, set on approve
  assigned_at      timestamptz,         -- set on approve (status='assigned')
  completed_at     timestamptz,         -- set on complete (status='completed')
  completed_score  numeric,             -- optional score on the re-check item
  recheck_item_id  text,                -- the item that closed the loop
  unlocks          text,                -- the re-check this remediation gates (free-form id/name)
  notes            text,                -- optional teacher notes
  created_at       timestamptz not null default now()
);

create index if not exists remediation_student_idx on remediation_assignment(student_id);
create index if not exists remediation_skill_idx   on remediation_assignment(skill);
create index if not exists remediation_status_idx  on remediation_assignment(status);
create index if not exists remediation_student_skill_idx on remediation_assignment(student_id, skill);

alter table remediation_assignment enable row level security;
-- Intentionally NO policies. Service-role only. Same posture as roster + item_ledger.
```

### 2.2 `roster-server/remediation-db.js` (NEW data-access wrapper)

Mirrors `ledger-db.js` shape: `createLiveRemediationDb()` constructs the
live Supabase wrapper; tests inject a fake. Exports `createRemediationDb
(client)` returning these helpers:

- `insertAssignment({ studentId, unit, skill, sourceAttempt, assignedRefs,
  proposedBy, unlocks, notes })` — insert a new row (status=`proposed`).
  Returns `{ data: { assignment_id, ... }, error }`.
- `getAssignmentById(assignmentId)` — fetch one. Returns `{ data, error }`.
- `updateAssignmentStatus({ assignmentId, status, approvedBy?,
  completedScore?, recheckItemId? })` — set status + the appropriate
  timestamp. Returns `{ data, error }`.
- `listAssignmentsForStudent(studentId, { status? })` — student view, optional
  status filter. Returns `{ data, error }`.
- `listAssignmentsForSection({ section, status? })` — teacher view. Joins to
  `roster` via Supabase's foreign-key shorthand to filter by section.
  Returns `{ data, error }` where data carries the student fields needed for
  the dashboard render.
- `findAssignment({ studentId, unit, skill, status? })` — idempotency probe
  used by propose-from-mastery (skip if a `proposed`/`assigned` row already
  exists for the pair).

**Error contract:** Postgres `relation does not exist` (`42P01`) is treated
as **migration-pending** — return `{ data: null, error: { code: '42P01',
... } }` unchanged; the route handler converts that to a 503 with a clear
reason. Other errors propagate as usual.

### 2.3 `roster-server/remediation.js` — endpoint module

Same shape as `ledger.js` / `class.js`. Exports `mountRemediation(app,
{ verifyToken, remediationDb, ledgerDb, db, loadAnswerKey, loadSkillMap,
bkt })`. All routes additive; no existing route touched.

Helpers: `checkTeacherSecret(req, res)` (mirrors class.js; 401 if missing/
wrong); `respondTableMissing(res)` (helper that converts the `42P01` error
to a uniform 503 response so degrade is consistent across routes).

- **`POST /remediation/propose`** (teacher-gated)
  - Body: `{ studentId, unit, skill, sourceAttempt?, assignedRefs?,
    unlocks?, notes?, proposedBy? }` (`proposedBy` defaults to `'teacher'`
    when supplied; system propose uses `'system'`).
  - Validates studentId/unit/skill non-empty; rejects 400 otherwise.
  - → 200 `{ ok:true, assignmentId, status:'proposed' }`.

- **`POST /remediation/approve`** (teacher-gated)
  - Body: `{ assignmentId, approvedBy? }`.
  - Loads the row, refuses if status !== `'proposed'` (409 with a clear
    message — idempotent on second call returns the existing assigned row).
  - On success: sets `status='assigned'`, `assigned_at=now()`,
    `approved_by`. → 200 `{ ok:true, status:'assigned', assignedAt }`.

- **`POST /remediation/complete`** (token-gated)
  - Body: `{ token, assignmentId, completedScore?, recheckItemId? }`.
  - `verifyToken(token)` → studentId; 401 on invalid/missing.
  - Loads the row, refuses if `student_id !== verifiedStudentId` (403 —
    a student may only complete their own remediations) OR if status is
    not `'assigned'` (409 — only assigned rows can be completed).
  - Sets `status='completed'`, `completed_at=now()`, optional
    `completed_score`/`recheck_item_id`.
  - → 200 `{ ok:true, status:'completed', completedAt }`.

- **`POST /remediation/waive`** (teacher-gated)
  - Body: `{ assignmentId, notes? }`.
  - Sets `status='waived'` (no timestamp change beyond the implicit
    update). → 200 `{ ok:true, status:'waived' }`.

- **`GET /remediation/student?token=...`** (token-gated)
  - `verifyToken` → studentId.
  - Returns the student's own rows (any status). → 200 `{ ok:true,
    assignments:[...] }`.

- **`GET /remediation/list?section=...&status=...`** (teacher-gated)
  - Section + optional status filter. Joins via roster to surface
    `real_name`/`username`. → 200 `{ ok:true, assignments:[...] }`.

- **`GET /remediation/unlocks?token=...&skill=...`** (token-gated)
  - For (studentId, skill): finds all `'assigned'` rows. `unlocked=true`
    iff zero such rows remain (every assigned remediation for this skill
    is now `'completed'` or `'waived'`).
  - → 200 `{ ok:true, unlocked: boolean, pending: [...assignmentIds...] }`.

- **`POST /remediation/propose-from-mastery`** (teacher-gated)
  - Body: `{ section, dryRun?: false, proposedBy?: 'system' }`.
  - Fetches `db.listRoster(section)` → per-student
    `computeMastery(...)` (same path as Phase 4a `/class/mastery`).
  - For every weak skill per student: if NO existing
    `proposed`/`assigned`/`completed` row for (studentId, skill) exists,
    insert one with status `'proposed'`. Idempotent — re-runs skip
    already-covered pairs.
  - → 200 `{ ok:true, proposed:[{ studentId, skill, assignmentId }, ...],
    skipped:[{ studentId, skill, existingStatus }, ...] }`.
  - `dryRun=true` returns the lists without inserting.
  - Requires the same deps as `/class/mastery` — guard-mount only when
    they're all present (degrade if `loadSkillMap` or `bkt` missing).

### 2.4 `roster-server/server.js` — additive mount

Inject `createLiveRemediationDb()` alongside the existing live db
constructions. Guard-mount `mountRemediation` only when `db` +
`remediationDb` + `verifyToken` are present (always true in production
unless Supabase env is missing — same posture as the other modules). The
propose-from-mastery route additionally needs `ledgerDb` + `loadAnswerKey`
+ `loadSkillMap` + `bkt` (same guards as `/class/mastery`); inside
`mountRemediation`, that route is skipped if those deps are missing — the
other routes still mount.

### 2.5 `roster-server/tests/remediation.test.js` — vitest suite

Pattern: jsdom-free node tests. Build a small `fakeRemediationDb` +
`fakeDb` (roster) + `fakeLedgerDb` (only as needed for
propose-from-mastery) + a fake `loadAnswerKey` / `loadSkillMap` /
`bkt`. Use `createApp(...)` + supertest-style POST/GET via
`http`/`undici` (mirror the existing test style in
`tests/grade.test.js` / `tests/class.test.js` / `tests/ledger.test.js`).

**Required cases (the GREEN gate):**
- `POST /remediation/propose` happy path + 401 (no teacher secret) + 400
  (missing field).
- `POST /remediation/approve` proposed → assigned + 409 on wrong status
  + 401 (no teacher secret) + 404 on unknown id.
- `POST /remediation/complete` happy path + 401 (no token) + 403 (token
  for a DIFFERENT student) + 409 on non-`assigned` row + 404 on unknown.
- `POST /remediation/waive` happy path + 401 (no teacher secret) + 404
  on unknown.
- `GET /remediation/student?token=` returns only the verified student's
  rows; 401 on no/bad token.
- `GET /remediation/list?section=&status=` teacher view, filters apply;
  401 on no teacher secret.
- `GET /remediation/unlocks?token=&skill=` returns `unlocked:true` when
  no pending assigned rows; `unlocked:false` + the pending ids when
  any remain.
- `POST /remediation/propose-from-mastery` idempotent: second call
  with the same fake state inserts zero new rows (skip list non-empty).
- **Graceful degrade:** when `remediationDb` returns `{error:{code:
  '42P01'}}`, every route returns 503 with `error:'remediation table
  not yet provisioned'` — the server does NOT 500 or crash; other
  routes stay alive.

### 2.6 `teacher-dashboard.html` — additive remediation panel

Mirror the existing Phase 4a panels' style. ADD a third section after the
existing class grade table + skill heatmap:

- A "Remediation" heading + an info paragraph (one sentence: "Proposed
  remediations show up here; approve to assign them to the student.").
- A "Propose from current mastery" button — calls `POST /remediation/
  propose-from-mastery?section=<current>` with the teacher secret;
  shows a small inline summary on success.
- A live table of remediation rows for the current section, with
  per-row buttons: `Approve` (if proposed), `Waive` (if proposed or
  assigned), `Complete` (if assigned; teacher-acting-for-student
  shortcut — POSTs `/remediation/complete` with their own token; note:
  this requires the teacher to ALSO be a roster member with a token,
  OR — simpler — call a token-less teacher-gated alias; per the spec
  the teacher can mark complete on the student's behalf).

**To keep the spec simple:** `POST /remediation/complete` accepts EITHER
`token` (student) OR `x-teacher-secret` (teacher acting for student). If
neither is valid → 401. The 403 (different student) only applies to the
token path. **Update §2.3 accordingly.**

Read-only loads on dashboard mount: `GET /remediation/list?section=
<current>` whenever the section filter changes; manual refresh button
after the action group.

**Visual:** match the existing dashboard's `.panel`/`.heatmap-tile`/
`<details>` patterns. NO new external CSS imports. Teacher secret stays
in the existing input (NEVER persisted).

## 3. Method (loop algorithm)

Contract frozen (this doc) → **planner implements all 5 deliverables
directly** (cohesive, single-owner, contended server tree —
parallel-Sonnet is a clobber risk on a single roster-server tree; the
dashboard HTML is ALSO touched here and the planner owns it for atomic
review). The migration SQL is text-only and tests run against the fake
db, so no DB step is needed during the build. → Codex cross-agent
**read-only review** (ASCII-only; detached via PowerShell + the
`.codex-phase5-dispatch.py`-pattern wrapper; parse the result file's
`findings` array) → planner re-verify on disk (vitest roster-server +
follow-alongs root + audit-feeder-ids) → tight commit (stage own paths
only) → push → `railway up --ci -s roster` (Phase 4b adds endpoints) →
smoke `/health` + `/remediation/*` against a SMOKETEST section (expect
503 until the user runs the migration; the deliverable is the
"degrade-mode" path being correct in prod — the migration is a separate
user step) → update memory + CONTINUATION.

## 4. GREEN gate (the loop gate)

- **roster-server** full suite green — no regression in Phase-0/1/donow/
  rollup/grade/mastery/class/TR (169 prior tests) + the new
  `remediation.test.js` (target ~30 cases per §2.5) all pass. New
  baseline ≈ **roster-server 199/199**.
- **follow-alongs root** suite: only the 1 known `study-guide.test.js`
  fail unchanged; no new failures. (No new follow-alongs test file in
  Phase 4b — the teacher-dashboard.html change is structure-checked by
  the existing phase4-structure.test.js if it asserts dashboard shape,
  OR a fresh `phase4b-structure.test.js` if not. Decide at implementation:
  add a minimal structure test if and only if phase4-structure doesn't
  already pin the dashboard's exact section count.)
- `node scripts/audit-feeder-ids.mjs` → CLEAN 69 (Phase 4b adds no
  skill-map keys; the propose-from-mastery path consumes the existing
  bundled skill-map).
- `roster-server` redeploy SMOKETEST: `/health` ok; `POST /remediation/
  propose` with teacher secret returns either 200 (if user already ran
  the migration) OR 503 "remediation table not yet provisioned" — both
  outcomes are acceptable; the failure to test is a 500 or process
  crash. Document the actual response in the smoke notes.
- All touched files keep their EOL convention (Desk + cr `index.html`
  are LF; `teacher-dashboard.html` should already be LF — verify with
  `git diff --stat`). No CRLF flips.

## 5. Guardrails (hard-won)

- **Sacred:** never touch `curriculum_render/data/curriculum.js`. Phase
  4b consumes the bundled skill-map via the existing loader path
  (Phase 3) — read-only.
- **Additive only on roster-server:** every existing route + helper
  must work byte-identically. The 169 prior tests pin this.
- **Stage own paths only:** repo has unrelated dirty scratch + the
  pre-existing `.ai-tutor-u*.result.md` and `.codex-phase5-*` files.
  `git add` each Phase 4b file explicitly; NEVER `git add -A`.
- **ASCII-only Codex prompts:** strip `§`/em-dash/`→` from the prompt
  (per the recorded cp1252 0x97/0xa7 runner bug). Include "reply in
  ASCII only" in the prompt.
- **Detached Codex run** via PowerShell `Start-Process -WindowStyle
  Hidden -RedirectStandardOutput …` + the existing wrapper pattern.
- **Migration is user-owned:** commit the SQL but do NOT attempt to
  run it. The 503 degrade path is the build doc's correctness gate
  until the user runs the migration in the Supabase SQL editor.
- **Teacher-secret never persisted client-side:** the dashboard panel
  reuses the existing in-memory secret input.
- **`POST /remediation/complete`** accepts EITHER a valid student
  token OR a valid teacher secret (per §2.6) — the dashboard uses
  the teacher path. The 403 (cross-student) only applies to the
  token branch.
- **`assigned_refs` is `jsonb`** — always serialize as a JSON array,
  never an object or string. Tests pin this.
- **Foreign-key + cascade:** `student_id` references `roster(student_id)
  on delete cascade` — deleting the SMOKETEST roster row also cleans
  remediation_assignment rows for that student (mirrors `item_ledger`).
  The standing `delete from roster where section='SMOKETEST';` chore
  remains the same cleanup statement.

## 6. Acceptance / Definition of Done

- `git diff --stat` shows the expected files: `roster-server/
  migrations/0004_remediation_assignment.sql` (new) + `roster-server/
  remediation-db.js` (new) + `roster-server/remediation.js` (new) +
  `roster-server/tests/remediation.test.js` (new) + `roster-server/
  server.js` (modified, additive) + `teacher-dashboard.html`
  (modified, additive) + this build doc.
- New tests pass; prior 169 stay green.
- Codex review folded (whatever level — BLOCKER → fix immediately,
  MAJOR/MINOR → fold or document as deferred with a reason).
- Commit: `Phase 4b: remediation_assignment write loop (additive
  roster-server endpoints + teacher-dashboard approvals; user-gated
  Supabase migration 0004)`.
- Pushed to `master`.
- `railway up --ci -s roster` — Deploy complete; live smoke confirms
  `/health` + the new endpoints' degrade-or-real behavior.
- Memory + `CONTINUATION_PROMPT.md` updated; the user-owned SQL step
  is documented as the only remaining handoff.

---

**Planner-frozen 2026-05-19, session 100. Loop step 2 = build (planner-
direct across the roster-server tree + the teacher dashboard).**
