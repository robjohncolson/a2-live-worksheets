# Schoology Grade Sync v1 -- BUILD spec

Session 119+ (queued post-level-editor stress-test per
[[authoring-tool-stress-test]]). Pivot from the s119 level-editor
arc to the bigger-leverage workstream: stop manually retyping
grades into Schoology that already exist as structured data in
Supabase.

## Goal

Push grades from the gradebook (Supabase) into the teacher's
Schoology gradebook via browser automation, on demand (V1) and
eventually on schedule (V2+). The teacher never opens Schoology
to enter grades again -- only to verify that the auto-sync
worked.

## Non-goals

- Programmatic Schoology login. District uses Microsoft SSO;
  automating SSO is fragile and trips bot detection. V1 reuses
  a real Edge session cookie captured via manual sign-in.
- Schoology API integration. District does not issue teacher API
  keys; the REST API path is closed. CDP browser automation only.
- Schoology -> Supabase sync. One-way only. Supabase is source of
  truth. Manual teacher edits in Schoology between syncs get
  overwritten on next run -- this is documented + intended.
- Multi-teacher support. V1 is single-teacher (the user). V2 can
  generalize if other teachers want in.
- Cron / scheduled runs on Railway. V1 is manual trigger only.
  V2 layers cron once the cookie-capture + Railway upload flow is
  designed.

## Phasing & ship gate per phase

| Phase | Scope | Ship gate |
|---|---|---|
| P0 Discovery | Test login + gradebook DOM in edge.py rig | Can manually navigate to gradebook + identify cell selectors |
| P1 Manual one-shot | Hardcoded script enters ONE grade for ONE student in ONE existing lesson | Edge opens, grade lands in correct cell, verified in browser |
| P2 Section sync | Loop over one section: auto-create missing assignments, push all current grades, idempotent re-run | Re-running produces 0 changes (delta logic works) |
| P3 Dashboard log view | Teacher dashboard surfaces sync_log table; no trigger button yet | Last 10 runs visible with counts |
| P4 (V2) Cookie capture + Railway cron | Move to scheduled runs | TBD; out of V1 scope |

Each phase commits its own BUILD doc + tests + implementation.
P0/P1 land in one session if discovery is clean.

## Architecture (V1)

```
+-------------------+       +-------------------+      +-------------------+
| Teacher laptop    |       | Supabase          |      | Schoology web UI  |
|                   |       |                   |      |                   |
| python tools/     |--read-| schoology_*       |      |                   |
|   schoology-      |       |   tables          |      |                   |
|   sync.py         |--read-| roster, grades    |      |                   |
|       |           |       |                   |      |                   |
|       v           |       |                   |      |                   |
| edge.py rig       |---------------- CDP --------------> Edge browser     |
|       |           |       |                   |      |   (logged in)    |
|       |           |--write| schoology_grade_  |      |                   |
|       v           |       |   sync (deltas)   |      |                   |
| Edge profile dir  |--write| schoology_sync_   |      |                   |
| (persisted cookie)|       |   log             |      |                   |
+-------------------+       +-------------------+      +-------------------+
```

- All sync logic runs on the teacher's laptop.
- Edge profile dir at `%TEMP%/edge-claude-cdp` (the same one
  `tools/cdp/edge.py` already uses) holds the Schoology session
  cookie. Login happens ONCE in real browser; cookie persists
  until Microsoft SSO expires (typically 30 days).
- Supabase holds the source-of-truth grades + the sync tracking
  tables. Railway roster-server doesn't run the sync but DOES
  expose read-only endpoints for the dashboard log view.
- No credentials stored anywhere. Cookie lives in profile dir,
  which is on the teacher's machine.

## File layout

```
follow-alongs/
  tools/
    cdp/
      edge.py                 # existing rig, REUSED
    schoology-sync.py         # NEW main entry point (V1)
    schoology-capture.py      # NEW thin helper (V2, deferred)
  tests/
    schoology-sync.test.js    # NEW (V1) -- mocks Schoology DOM
roster-server/
  routes/
    schoology-log.js          # NEW read-only endpoints for dashboard
  migrations/
    0010_schoology_sync.sql   # NEW tables (user-run)
SCHOOLOGY_SYNC_V1_BUILD.md    # this doc
```

## Auth model

V1 reuses the existing `edge.py` rig's dedicated profile dir.
The teacher logs into Schoology ONCE manually:

```
python tools/cdp/edge.py --url "https://<district>.schoology.com" --keep
```

This opens Edge to the Schoology login page in the dedicated
profile. Teacher clicks through Microsoft SSO (including 2FA if
applicable). The session cookie is now in the profile dir.

Every subsequent sync run reuses the profile -- no auth happens
inside the sync script. If the cookie has expired, the sync
detects "login page rendered, gradebook not reachable" and exits
with a clear error: "Schoology session expired -- run
`python tools/cdp/edge.py --url https://<district>.schoology.com
--keep` and sign in, then re-run the sync."

V2 (Railway cron): the cookie gets captured locally + uploaded to
Supabase encrypted (AES-256-GCM, matching the existing roster
password lifecycle). Railway Playwright headless run pulls + sets
the cookie before navigating to gradebook. Out of V1 scope.

## Data model (Supabase)

Three new tables. Migration `0010_schoology_sync.sql`, user-run
(matches the s116-118 user-runs-migrations pattern).

```sql
-- One row per Schoology gradebook column (assignment).
create table schoology_assignment (
  id                       uuid primary key default gen_random_uuid(),
  section                  text not null,
  lesson_key               text not null,        -- e.g. 'U1.1', 'PC1', 'TEST_Q1'
  kind                     text not null check (kind in ('lesson','test','progress_check')),
  title                    text not null,        -- the title that lands in Schoology
  points                   integer not null default 100,
  due_date                 date,
  category                 text,                 -- Schoology gradebook category name
  schoology_assignment_id  text,                 -- nullable until auto-created in Schoology
  schoology_course_id      text,                 -- which Schoology course this assignment lives in
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (section, lesson_key)
);

-- Delta tracking: what value was last pushed to Schoology for each (student, assignment).
create table schoology_grade_sync (
  student_id               text not null,
  assignment_id            uuid not null references schoology_assignment(id) on delete cascade,
  last_synced_value        numeric,              -- nullable for "never synced"
  last_synced_at           timestamptz,
  last_attempted_at        timestamptz,
  last_error               text,                 -- error message if last attempt failed
  primary key (student_id, assignment_id)
);

-- One row per sync run.
create table schoology_sync_log (
  id                       uuid primary key default gen_random_uuid(),
  run_id                   text not null,        -- e.g. timestamp-based unique id
  section                  text,                 -- nullable for multi-section runs
  started_at               timestamptz not null,
  finished_at              timestamptz,
  success                  boolean,              -- nullable while in-flight
  assignments_created      integer default 0,
  grades_pushed            integer default 0,
  grades_skipped           integer default 0,    -- delta-skipped (same as last sync)
  errors_json              jsonb,                -- array of { kind, message, student_id?, assignment_id? }
  notes                    text,                 -- free-text human note
  created_at               timestamptz not null default now()
);

create index schoology_sync_log_finished_idx on schoology_sync_log(finished_at desc);
```

## Mapping rules (Supabase grades -> Schoology assignments)

Per the hybrid decision, the assignment kind is derived from
the `lesson_key`:

- `U<n>.<m>` (regular lesson) -> kind=`lesson`, points=100,
  title = `"Topic <n>.<m>: <title-from-lesson-schedule>"`,
  category = "Lessons"
- `PC<n>` or any key matching `progress_check` in the schedule
  -> kind=`progress_check`, points=100, title = `"Unit <n>
  Progress Check"`, category = "Progress Checks"
- `TEST_Q<n>` or matching key in the schedule -> kind=`test`,
  points=100, title = `"Quarter <n> Test"`, category = "Tests"

The lesson value pushed:
- For `lesson`: the unified `lessonGrade` from
  `roster-server/lesson-grade.js` (the same Cws-weighted score
  computed in Phase 6).
- For `progress_check` / `test`: the raw quiz/test score.

If `lessonGrade` is null/undefined (lesson not attempted), no
grade is pushed -- the Schoology cell stays blank (NOT zero;
treating no-attempt as zero is the gradebook's quarterGrade
job, not the sync's job).

## Sync flow (P2 full sync, one section)

Pseudo-code for `python tools/schoology-sync.py --section <X>`:

```
1. Connect to Supabase, load:
   - All students in section
   - All lessons in lesson-schedule.json scoped to section's
     quarter window
   - Existing schoology_assignment rows for section
   - Existing schoology_grade_sync rows
   - lessonGrade for every (student, lesson)

2. Determine ASSIGNMENT WORK:
   For each lesson_key in scope:
     If no schoology_assignment row exists -> needs auto-create
     If row exists but schoology_assignment_id is null -> auto-create
     Else -> reuse

3. Connect to Edge via edge.py rig (reuse profile).
   Navigate to https://<district>.schoology.com/courses/<course_id>/gradebook
   Detect "logged in" by checking for the gradebook header DOM.
   If login page is showing -> exit with "session expired" error.

4. AUTO-CREATE PHASE:
   For each lesson_key needing auto-create:
     - Navigate to Add Assignment UI
     - Fill title + points + due_date + category
     - Submit
     - Capture the new Schoology assignment id from the URL or DOM
     - Write back to schoology_assignment.schoology_assignment_id

5. GRADE PUSH PHASE:
   For each (student, lesson) pair:
     - Compute target value from lessonGrade
     - Compare to schoology_grade_sync.last_synced_value
     - If same -> skip (count as "skipped")
     - If different -> navigate to cell, type new value, save
       - On success: update last_synced_value + last_synced_at
       - On error: log error to errors_json, do NOT update last_*

6. Write summary to schoology_sync_log:
   - assignments_created, grades_pushed, grades_skipped, errors

7. Tear down browser. Print summary to terminal.
```

## Idempotency

Re-running the sync within the same session should produce 0
work (assignments_created=0, grades_pushed=0, grades_skipped=N).
Verified by:
- Assignment auto-create is gated on `schoology_assignment_id IS
  NULL` AND a pre-flight lookup-by-title in Schoology.
- Grade push is gated on `last_synced_value != current value`.

The delta is "value the SYNC last pushed vs current Supabase
value." NOT "value currently in Schoology vs current Supabase
value." This means a teacher-side manual edit in Schoology won't
trigger a re-push from the sync; only Supabase changes do.
Documented + intended.

## Auto-create idempotency (lookup-by-title)

Before creating a new Schoology assignment, the sync MUST do a
pre-flight check:
1. Load the section's existing assignment list (e.g., HTTP GET
   the gradebook page, parse the table)
2. Search by title (exact match to the title the sync would
   create)
3. If found, capture the id + write to schoology_assignment;
   skip create
4. If not found, proceed with create

Without this, a sync that crashed mid-create would on next run
create a duplicate column. The pre-flight step is mandatory.

## Failure handling

| Failure | Behavior |
|---|---|
| Session expired (login page shown) | Exit with clear instruction to re-run edge.py login flow |
| Schoology gradebook page slow / not loaded | Wait 10s, retry once, then exit with timeout error |
| Single grade write fails (cell unresponsive) | Log error to errors_json, continue with next student |
| Auto-create fails (form rejection, network) | Log error, skip all grade pushes for that assignment, continue with others |
| Student in Supabase not enrolled in Schoology section | Log warning, skip that student, continue |
| Grade value out of range (negative, >points, NaN) | Log warning, skip that grade, continue |
| Network outage mid-run | Catch, mark sync_log.success=false, write notes, exit gracefully |

The sync NEVER aborts the whole run for a single-cell failure.
Errors land in `sync_log.errors_json`; the dashboard surfaces
them so the teacher can investigate per-cell issues without
losing the rest of the run.

## Observability

P3 ships the dashboard view:
- New section on `teacher-dashboard.html`: "Schoology Sync Log"
- Table showing last 20 sync runs: timestamp, section,
  duration, counts (created / pushed / skipped / errors),
  success indicator
- Expand-row to see `errors_json` formatted as a list
- (P4) "Run sync now" button -- deferred until cookie-capture
  workflow lands

Read-only roster-server endpoints:
- `GET /schoology/sync-log?section=<X>&limit=20`
- `GET /schoology/sync-log/<run_id>` (full detail incl. errors)

No write endpoints on roster-server for V1 -- the sync writes
directly to Supabase from the local script.

## Test plan (P1 + P2)

- Vitest + jsdom for the DOM-parsing helpers (gradebook page ->
  assignment list)
- Mock the Schoology DOM with HTML fixtures captured during P0
  discovery (`tests/fixtures/schoology-gradebook.html` etc.)
- ~10-15 tests covering: assignment list parsing, cell selector
  generation, delta detection (current vs last_synced_value),
  error categorization

End-to-end CDP smoke (NOT in vitest -- manual):
- P1: enter one grade, verify in browser
- P2: full section sync, then immediate re-run, verify 0 work

## Open questions (resolve in P0)

1. **Schoology district URL pattern.** Confirm the actual base
   URL (`<district>.schoology.com` vs `app.schoology.com` vs
   custom domain). Affects all hardcoded navigation.

2. **Schoology course IDs vs section names.** Supabase uses
   section names like "PeriodB"; Schoology uses numeric course
   ids. Need a mapping table OR the sync grabs the course id
   from the section dropdown in Schoology on first run.

3. **Gradebook UI complexity.** Is the Schoology gradebook a
   plain HTML table with input cells, or a React-style
   single-page-app with virtual scrolling? Affects whether
   selectors are stable + whether we need to scroll into view
   before clicking each cell.

4. **Add Assignment form fields.** What does the auto-create
   form actually look like (which fields are required, what
   are valid values for category, what happens on duplicate
   title)? May need to handle field-by-field via screenshots
   in P0.

5. **Quarter window mapping.** Q1 = U1+U2+U3, Q2 = U4+U5, etc.
   per the Phase 6 grading model. Need to confirm Schoology
   has Q1/Q2/Q3/Q4 sections and how assignment categories
   align with them.

6. **2026-05-27 SCHOOLOGY UI VERSION.** Schoology releases
   change selectors. Capture a snapshot of the gradebook DOM
   during P0 as the baseline; if a future Schoology update
   breaks the sync, we re-snapshot.

## Risks (load-bearing for P0/P1)

1. **Bot detection.** Schoology may fingerprint navigator
   .webdriver or click cadence. Mitigations: realistic delays
   (~500ms between cells), use real Edge (not headless), low
   frequency. If account gets flagged, pivot to fully-manual
   workflow for affected sections.

2. **Schoology UI changes.** Each Schoology release could
   break selectors. Mitigations: stable selectors
   (aria-labels, role, semantic class names; avoid CSS-module
   hashed class names), capture before/after DOM snapshots on
   every breakage so re-targeting is fast.

3. **Browser memory / performance.** Edge with the school
   profile + gradebook is ~300-500MB. Acceptable for laptop.
   Concerning for Railway (V2) -- may need plan bump.

4. **Profile cookie expiry surprises.** Microsoft SSO sessions
   typically last 30 days but can be revoked by district IT
   at any time. The "session expired" path MUST be obvious
   and easy to fix (one terminal command).

5. **Auto-create duplicate columns.** Mitigated by mandatory
   lookup-by-title pre-flight. If pre-flight parsing is
   wrong, the sync could spam Schoology with duplicates;
   document the recovery procedure (manually delete dups,
   update schoology_assignment_id).

6. **The first run is high-stakes.** Pushing wrong grades into
   a real Schoology gradebook visible to students/parents is
   bad. Mitigations: P1 starts with a SINGLE student in a
   TEST assignment ("Sync Test 1") before touching real
   grades. P2 first run scoped to a section with student
   warning ("Grades may shuffle during sync test").

## P0 DISCOVERY (2026-05-27) -- COMPLETE

Probed live via the `tools/cdp/edge.py` rig. Teacher signed in
via MS SSO + 2FA + KMSI=Yes (session cookie now persists in
`%TEMP%/edge-claude-cdp` for ~90 days). All 6 open questions
answered with concrete selectors + IDs. Fixtures committed for
unit-test mocking.

### Fixtures captured (P0)

| File | Source | Purpose |
|---|---|---|
| `tests/fixtures/schoology-mycourses.html` | `/courses/mycourses` | Course/section enumeration for the teacher account |
| `tests/fixtures/schoology-gradebook-empty.html` | Algebra II Sec 10 gradebook | Empty-state DOM snapshot (no assignments) |
| `tests/fixtures/schoology-gradebook-apstats-sec1.html` | AP Stats Sec 1 gradebook | Empty-state DOM snapshot of the actual sync target |
| `tests/fixtures/schoology-add-assignment-form.html` | `course/<ID>/materials/assignments/add?is_popup=1` | Add Assignment popup form fields |
| `tests/fixtures/schoology-add-test-form.html` | `course/<ID>/materials/assignments/add_assessment?is_popup=1` | Add Test/Quiz popup form fields |
| `tests/fixtures/schoology-courses-map.json` | Structured | All 12 of the teacher's courses with ID -> name mapping; sync targets flagged |
| `tools/cdp/_shots/schoology-p0-*.png` | Throughout flow | Screenshots: initial nav, MS SSO, 2FA, KMSI, gradebook, course list, Add Assignment form |

### Q1: Schoology district URL pattern -- ANSWERED

- Base: `https://lynnschools.schoology.com`
- Auth federated to Microsoft SSO via OAuth: client_id
  `f97b3686-bc70-4fee-b56d-f45878420d15`, redirect_uri
  `https://app.schoology.com/login/external_accounts/receive/microsoft`
- The OAuth `state` token is single-use and bound to the
  session that initiated the authorize request. Implication:
  if the sync restarts mid-auth (e.g., CDP Edge respawn), the
  callback fails with "Could not validate authentication
  state." Remediation: navigate fresh to the gradebook URL
  after auth completes -- MS will round-trip silently because
  the user is already signed in.
- The `app.schoology.com` host appears only in the OAuth
  callback URL; the gradebook UI itself stays on
  `lynnschools.schoology.com`. Hardcode the district subdomain
  in `tools/schoology-sync.py`.

### Q2: Course IDs vs section names -- ANSWERED

Teacher has 12 courses. AP Stats sync targets (`syncTarget: true`
in `schoology-courses-map.json`):

| Course ID | Course Name | Section | Notes |
|---|---|---|---|
| `7945275782` | AP Statistics | Section 1 | 10 students enrolled |
| `7945275798` | AP Statistics | Section 2 | Period mapping TBD by teacher |

Period -> Course ID mapping is **manual** -- Schoology stores
"Section N" not "Period B/E". V1 should keep a hardcoded
section name -> course ID map in a config file (or in
`schoology_assignment.schoology_course_id` per row); V2 can
add a teacher-config table.

The URL the user originally pasted (`course/7945312369/grades`)
turned out to be **Algebra II Section 10**, not AP Stats. The
empty Algebra II gradebook fixture is still useful as a
baseline DOM snapshot (cleanest possible Schoology gradebook
state).

### Q3: Gradebook UI complexity -- ANSWERED

**AngularJS SPA** (`ng-repeat`, `ng-class`, `ng-switch`,
`ng-scope` throughout). Not React, not virtual-scrolled at
the row level (all 10 students rendered eagerly). Horizontal
scrolling behavior with many assignment columns is **untested**
(empty gradebooks during P0); P1 risk.

Stable selectors found:

| Target | Selector | Notes |
|---|---|---|
| Student row | `[data-uid="<schoology_user_id>"]` | One per student. `data-uid` is the Schoology user id |
| Student name | `[aria-label="<First Last>"]` on the row's `[role="rowheader"]` child | Use this to map name -> data-uid |
| Grade cell | `[role="gridcell"]` with `data-x="<column_key>"` + `data-y="<row_index>"`, id `grader-grid-cell-<column_key>-<row_index>` | row_index is 0-based; column_key is "overall_override" for the OVERALL aggregate, or the assignment id for graded columns |
| Marking period header | `[aria-label="Marking Period N: M/D/YY - M/D/YY"]` | Date range exposed in aria-label -- safe to parse |
| Add Materials dropdown trigger | `.s-js-grader-add-materials-wrapper [role="button"]` | Top-right of the gradebook bar |
| Gradebook canvas wrapper | `.s-app-gradebook-app-canvas-wrapper` | Container that paints the grid |
| Row container | `.grader-grid-row` | Each row (header + data rows share this) |

**Avoid** the auto-hashed React-style classes on the top nav
(e.g., `._13cCs _2M5aC ...`) -- those rotate per release.

### Q4: Add Assignment form fields -- ANSWERED

Two parallel forms, **identical schema**:

| Form | URL pattern |
|---|---|
| Assignment | `course/<ID>/materials/assignments/add?is_popup=1` |
| Test/Quiz | `course/<ID>/materials/assignments/add_assessment?is_popup=1` |

Form id `s-grade-item-add-form`, POST to its own URL. Named
visible inputs (V1 sync only needs to fill the starred ones):

| Field | Type | Required | Default | Used by V1 |
|---|---|---|---|---|
| `title` * | text | Yes | none | Yes |
| `due_date[date]` | text (datepicker) | No | none | Yes (lesson date) |
| `due_date[time]` | text | No | none | No |
| `max_points` * | text | No (defaults) | `100` | Yes (always 100) |
| `grading_category_id` * | select-one | No | none | Yes (category lookup) |
| `grading_period_id` * | select-one | No | last MP | Yes (quarter lookup) |
| `is_final` | checkbox | No | unchecked | No |
| `factor` * | text | Yes | `1.00` | No (leave default) |
| `publish_scores` | checkbox | No | unchecked | Yes (CHECK -- so students see grades) |
| `sync_to_sis_wrapper[sync_to_sis_option]` | checkbox | No | unchecked | OPEN: probably yes for district SIS sync |
| `option_collected_only` | checkbox | No | unchecked | No |
| `op` (submit) | submit | -- | `Create` | Click via `input#edit-submit` |

**Categories in AP Stats Sec 1 today**:

```
value="0"       text="(Ungraded)"
value="89825655" text="Classwork"
value="new"     text="(Create new grading category)"
```

⚠ **CATEGORY GAP**. BUILD spec assumed three categories
(Lessons / Progress Checks / Tests) but the only existing
category is "Classwork". Two paths for V1:

- **(a) Teacher pre-creates the three categories** in
  Grade Setup (one-time, ~3 minutes). Cleanest -- the sync
  just looks them up by name.
- **(b) Sync auto-creates them** via the `value="new"`
  option, which surfaces a sub-form for the category name.
  Riskier (the sub-form's selectors haven't been probed).

**Recommendation:** (a). The teacher does this once before
P1 ships, and the sync code stays simple.

### Q5: Quarter / Marking Period mapping -- ANSWERED

Schoology grading_period_id values for AP Stats Sec 1
(course 7945275782). Note: IDs are **per-course/per-section**
and may differ for Sec 2 -- the sync MUST look these up per
section at run time, not hardcode them.

| Quarter | Marking Period | Date range | grading_period_id |
|---|---|---|---|
| Q1 | MP1 | 9/03/25 - 11/07/25 | `1134333` |
| Q2 | MP2 | 11/08/25 - 1/30/26 | `1134331` |
| Q3 | MP3 | 1/31/26 - 4/10/26 | `1134334` |
| Q4 | MP4 | 4/11/26 - 6/30/26 | `1134332` |

Aligns with the Phase 6 gradebook model:
- Q1 = U1+U2+U3 -> MP1 1134333
- Q2 = U4+U5 -> MP2 1134331
- Q3 = U6+U7 -> MP3 1134334
- Q4 = U8+U9 -> MP4 1134332

The sync derives the right grading_period_id from the
`schoology_assignment.due_date` (date falls inside MP date
range -> use that MP's id).

### Q6: Schoology UI version baseline -- ANSWERED

Captured at 2026-05-27. The body element carries a
`s-app-gradebook-app-beta` class -- this is Schoology's
newer "gradebook app" iteration (not the legacy gradebook).
If the beta moves to GA without renaming the class, fixtures
remain valid. If beta is replaced, the `[data-uid]` /
`[role="gridcell"]` / `data-x` / `data-y` selectors are
likely to survive because they're semantic; the class names
under `_13cCs` etc are not.

User-agent string captured: `Edg/148.0.3967.83` on Win 10
1513x900 viewport. CDP rig forces `--remote-allow-origins=*`
to bypass Chromium 144+ origin handshake. No Schoology bot
detection triggered (3 separate page loads + ~10 DOM probes
+ 2 form loads in ~5 minutes; no captcha or rate limit).

### New P1 risks surfaced by P0

1. **OAuth state token expires fast.** First navigation after
   sign-in MUST be the gradebook URL, not the URL that was
   queued before sign-in (the queued state token may already
   be stale). Sync code: do `cdp.attach_url(GRADEBOOK_URL)`
   AFTER sign-in completes, never reuse a pre-auth state.

2. **Grading category pre-creation.** Teacher must create
   "Lessons", "Progress Checks", "Tests" categories in
   Schoology Grade Setup before P1 ships, OR the sync needs
   the auto-create category sub-form probed and wired.

3. **Per-section grading_period_id lookup.** The MP IDs in
   Section 1 may differ from Section 2. The sync's first
   action per course must be a quick GET to the Add
   Assignment form to harvest the period ID -> date range
   mapping, then cache it for the run.

4. **SIS sync checkbox decision pending.** Teacher must
   decide whether Schoology grades should also push to the
   district PowerSchool SIS. If yes, V1 always sets
   `sync_to_sis_wrapper[sync_to_sis_option]=1`. If no, leave
   unchecked. Default UI state is unchecked.

5. **publish_scores default is unchecked.** Without this
   checkbox, students don't see their grades. V1 must
   ALWAYS check it (otherwise grades land but stay hidden).

6. **Horizontal virtual scrolling untested.** With dozens of
   assignments, the gradebook may not render all cells in
   the DOM at once. P1 with the first 5 lessons will surface
   this; if so, the sync needs to scroll the grid container
   into view per cell before clicking.

### P1 readiness checklist

- [x] Q1 URL pattern confirmed (`lynnschools.schoology.com`)
- [x] Q2 course ID mapping in `schoology-courses-map.json`
- [x] Q3 stable selectors documented
- [x] Q4 Add Assignment form schema captured
- [x] Q5 quarter -> MP id mapping documented
- [x] Q6 UI version baseline (fixtures + user-agent)
- [x] CDP rig confirmed to drive MS SSO email+password (with manual 2FA)
- [x] KMSI=Yes locks in the cookie for ~90 days
- [x] Teacher creates the 3 grading categories in AP Stats Sec 1 + Sec 2 (s121 decision: in-flight by teacher)
- [x] Teacher confirms SIS-sync checkbox decision (s121 decision: **YES** -- the sync ALWAYS checks `sync_to_sis_wrapper[sync_to_sis_option]` so Schoology grades auto-push to PowerSchool)
- [x] Teacher confirms which Schoology section maps to which AP class period (s121 decision: **Sec 1 = Period B**, Sec 2 = Period E)

P1 is unblocked. P1a (fixture-driven scaffold) ships in s121.

## P1a (2026-05-27) -- COMPLETE

P1a is the no-blockers half of P1: build + test the DOM-parsing
helpers and the Python entry point against the P0 fixtures. The
live one-shot write (P1b) is the next step once the teacher has
finished pre-creating the 3 grading categories.

### Files added

| File | Purpose |
|---|---|
| `tools/schoology-dom-helpers.js` | Pure DOM parsers (IIFE attaches to `window.SchoologyDomHelpers`); injected into the live page via `Runtime.evaluate`. 9 exports: `listStudents`, `listAssignments`, `findCellSelector`, `parseMarkingPeriods`, `parseAddAssignmentForm`, `findCategoryIdByName`, `findMarkingPeriodIdForDate`, `detectLoginState`, `AGGREGATE_KEYS`. |
| `tests/schoology-dom-helpers.test.js` | 31 vitest cases across 8 groups, jsdom-loaded against the 6 P0 fixtures. |
| `tools/schoology-sync.py` | P1 CLI: `--p1-discover` (read-only roster + columns dump) and `--p1-write` (one-shot grade write with `--dry-run` safety mode). |

### Section name -> course id map (P1 hardcoded)

```
SECTION_TO_COURSE_ID = {
    "PeriodB": "7945275782",   # AP Stats Sec 1
    "PeriodE": "7945275798",   # AP Stats Sec 2
}
```

V2 promotes this to a Supabase teacher-config table; V1 keeps it
inline in `tools/schoology-sync.py`.

### P0 gap surfaced by P1a tests

The empty AP Stats Sec 1 gradebook renders **10 placeholder
columns** with `data-x="0".."9"` and class
`grader-grid-cell-type-none`. These are AngularJS grid padding;
not real assignment columns. `listAssignments()` filters them out
by checking for the `grader-grid-cell-type-none` class. Once real
assignment columns exist (long numeric Schoology assignment ids
as `data-x`), the filter still works because real columns have a
different cell type class.

### P1b ship-gate procedure (do this with the teacher present)

1. Teacher confirms the 3 grading categories exist in AP Stats
   Sec 1 + Sec 2 (Lessons / Progress Checks / Tests).
2. Teacher manually creates ONE assignment in AP Stats Sec 1
   titled `Sync Test 1`, points=100, category=`Lessons`,
   marking period = whichever MP is current. (Auto-create via
   form is P2 territory.)
3. Run discover to read the new assignment's `data-x`:
   ```
   python tools/schoology-sync.py --p1-discover --course-id 7945275782
   ```
4. Run dry-run with a real student's uid to confirm the cell
   selector resolves:
   ```
   python tools/schoology-sync.py --p1-write --course-id 7945275782 \\
       --student-id <uid> --column-key <data-x> --value 85 --dry-run
   ```
5. Drop the `--dry-run`. Watch Edge: the cell should focus,
   accept "85", and commit on Enter. The screenshot lands at
   `tools/cdp/_shots/schoology-p1-after-write.png`.
6. Teacher visually verifies the grade in the gradebook +
   confirms the student's view also shows it (since
   `publish_scores` was checked when the assignment was created).

### P1b risks specific to the cell-write mechanism

P0 did not probe the actual cell-edit mechanism (the gradebook
was empty). Best-guess implementation in `p1_write()`:
- `scrollIntoView` the cell
- coordinate-click center
- read `document.activeElement` to find the gradebook-mounted input
- type via React-compatible value setter + `input`/`change` events
- dispatch Enter

If the click does NOT focus an editable input, the gradebook may
require a different gesture (double-click, F2 key, or clicking a
nested `.grader-grid-cell-edit` div). The script captures a
screenshot of the failure state at
`tools/cdp/_shots/schoology-p1-no-input.png` so the right gesture
can be re-recorded here.

### Auto-create form behavior to record at P2

- `sync_to_sis_wrapper[sync_to_sis_option]` MUST be set to `1`
  on every auto-create (s121 teacher decision: SIS sync ON).
- `publish_scores` MUST be set to `1` (otherwise grades land but
  stay hidden from students).
- The form has a multi-course "additional courses" section that
  could create the same assignment in BOTH AP Stats sections
  with one form submission. P2 may use this for efficiency; for
  P1 we stay single-section.

## P1b (2026-05-29) -- COMPLETE

The live one-shot grade write. **Ship gate MET**: a grade landed in a real
gradebook cell and PERSISTED across a reload (server-saved), screenshot-verified.

### What shipped

- Grade `95` written to student Julissa Arbaiza Yanes (uid `126191360`,
  rowIndex 0) in the `Sync Test 1` assignment of AP Stats Sec 1
  (`7945275782`), column `data-x="0"`. Confirmed persisted: after a fresh
  gradebook reload the cell still showed `95` and her OVERALL recomputed to
  `98.33` (Calc. `95`). `publish_scores` was OFF, so it stays hidden from the
  student.
- `tools/schoology-sync.py` `p1_write()` rewritten to the VERIFIED mechanism
  (the P1a best-guess React-setter did NOT save).

### The verified cell-write mechanism (load-bearing)

The grade cell (`#grader-grid-cell-<col>-<row>`) contains a PERSISTENT
`<input class="grade grader-edit-input">` -- always in the DOM, **no
`ng-model`**, not a click-to-mount editor. Schoology saves the grade ONLY on a
**real keystroke sequence committed with Enter**. These all FAILED to persist
(value showed locally but was discarded on reload):

- React-compatible value setter + `input`/`change` events.
- `Input.insertText` + `input`/`change` + blur (stuck locally, NOT saved).
- `Input.insertText` + Enter (Enter cleared it).

The WORKING recipe (in `p1_write`):

1. **Focus** the input via JS `.focus()` (deterministic). A trusted
   coordinate-click on the input's rect also focuses it, but only after Angular
   binds its click handler -- the first clicks after load are flaky (often leave
   `activeElement === BODY`). The script retries BOTH `.focus()` and a click, up
   to 6 times, re-querying the input each attempt.
2. **Clear** the existing value with Backspace (so re-syncs overwrite).
3. **Type** each character via `Input.dispatchKeyEvent` (full keyDown/keyUp with
   `text`) -- this fires Angular's save handler.
4. **Commit** with a real Enter `Input.dispatchKeyEvent`.

### Gotchas surfaced (carry into P2)

- **`devicePixelRatio = 1.25`** on the rig host. `Input.dispatchMouseEvent`
  takes CSS pixels (use `getBoundingClientRect` directly); device-pixel coords
  (CSS x DPR) MISS. The ~1513-CSS-px viewport is downscaled in the PNG
  screenshots (~954 px), so screenshot pixels != click coords.
- **Focus is intermittent** -- even `.focus()` occasionally doesn't stick when
  the grid re-renders between CDP calls; the retry-both loop is the mitigation.
  P2 batch sync should re-focus per cell and keep the retry.
- **3 duplicate `Sync Test 1` columns** (`data-x` 0,1,2) exist -- the Add
  Assignment popup returned a raw JSON page (render hiccup) and the teacher
  resubmitted, landing 3 copies. Teacher to delete 2. P2 auto-create MUST do the
  lookup-by-title pre-flight (already specced) to avoid this.
- **Student id mapping:** the teacher's `1_54123` was a `personal_id` (SIS id)
  shown in the gradebook, NOT the `data-uid`. The sync keys on `data-uid` (long
  numeric). P2 should resolve roster ids to `data-uid` up front (read the row's
  `personal_id` span, or maintain a map).

### P1b readiness checklist

- [x] Session cookie valid (~2 days into the ~90-day window)
- [x] `--p1-discover` lists roster + columns (read-only)
- [x] `--p1-write --dry-run` resolves the cell selector
- [x] live `--p1-write` lands a grade that PERSISTS across reload
- [x] verified mechanism baked into `p1_write` + this doc
- [ ] teacher deletes the 2 duplicate `Sync Test 1` columns
- [ ] P2: section-loop sync, auto-create with lookup-by-title, roster id -> uid

## P2 (2026-05-29) -- section-sync ENGINE + dry-run (live create/push = P2b gate)

Built via a parallel Sonnet fan-out (3 implementers against frozen contracts) +
integration/review. Files:

- `tools/schoology_sync_lib.py` -- PURE logic (classify_lesson_key,
  assignment_title/points, marking_period_for_date, should_push,
  plan_assignment_work, compute_sync_actions). `tests/test_schoology_sync_lib.py` (74).
- `tools/schoology_ops.py` -- importable live ops EXTRACTED from the P1b verified
  code: connect, navigate, inject_helpers, list_students/assignments/categories/
  marking_periods, find_cell_selector, write_grade_to_cell (the verified P1b
  mechanism, byte-identical), find_assignment_id_by_title, add_assignment.
  `schoology-sync.py` refactored to import it; the P1 CLI is unchanged.
- `tools/schoology_sync_section.py` -- the `--sync-section <Period> [--dry-run]`
  CLI: scope from the schedule (lessons + progressChecks + posters for the
  section's period), plan_assignment_work, auto-create, grade-push, a StateStore
  abstraction (LocalJsonStateStore default at gitignored
  `tools/.schoology-sync-state.json`; SupabaseStateStore is a stub pointing at
  migration 0010). `tests/test_schoology_sync_section.py` (26).
- `roster-server/migrations/0010_schoology_sync.sql` -- the 3 tracking tables
  (named 0010 because 0008/0009 already exist; table DDL verbatim per the spec).

**VERIFIED:** pure logic (74 + 26 tests, all green); **dry-run LIVE** -- it reads
the real gradebook, resolves 95 scope items for Period B, and plans 95 correct
creates (Topic 1.1 due 2026-09-09 ... Unit 9 Progress Check due 2027-02-04, right
kinds/titles/dates from the SY26-27 pack-left schedule), with a clean summary and
ZERO writes. State-based idempotency holds in tests: a 2nd run with the same
state file plans 0 creates (plan_assignment_work sees stored ids) and 0 pushes
(compute_sync_actions skips equal values).

**Integration bugs found + fixed:** `ops.connect`/`ops.navigate` were missing
(contract gap); the orchestration read the STALE root `data/lesson-schedule.json`
(null U1-U5 dates + old SY25-26 U6-U9 dates) instead of the canonical
`roster-server/data/lesson-schedule.json` (SY26-27 pack-left); the orchestration
passed `None` as `cdp` to the live ops (BLOCKER -- the live path would crash).
All fixed + re-verified.

### P2b GATE -- run `--dry-run` ONLY until this is done

The live create/push path is built but NOT live-verified (mirrors how P1a
shipped a scaffold and P1b verified the live write). Two functions need a live
create to nail:

- **`find_assignment_id_by_title`** -- the header-title -> `data-x` mapping needs
  live RE. The gradebook's column-header titles render in `ng-binding` spans
  whose `closest('[data-x]')` is null, and `[role="columnheader"]` textContent
  includes menu cruft, so the current exact-match likely returns null. Until
  fixed, the lookup-by-title pre-flight may not detect existing columns ->
  duplicate-create risk if the local state is lost.
- **`add_assignment`** id-capture -- the `/assignment/(\d+)` URL regex likely
  won't match; the real create returns a JSON blob with `assignment_nid` (per
  the P1b incident). Needs a live create to confirm the form-fill + to capture
  the id (parse `assignment_nid`, or diff `list_assignments` before/after).

**P2b = one live create smoke**: create ONE test assignment via `add_assignment`,
confirm the form-fill works + `find_assignment_id_by_title` finds it + the id/
column is captured, then delete it -- then enable live `--sync-section`. This is
the P1b-style live reverse-engineering for the CREATE path.

### P2b (2026-05-30) -- CREATE path VERIFIED

Live-verified the auto-create path via a smoke (created `P2 Smoke Test` in AP
Stats Sec 1, captured nid `8405518810`). Fixes folded into `schoology_ops.py` +
`schoology_sync_section.py`:

- **submit**: `add_assignment` now `scrollIntoView`s `input#edit-submit` before
  the coordinate-click -- the form is long, so the raw below-the-fold click
  silently MISSED (no create + a misleading ok=True). `ok` now reflects actual
  completion.
- **id-capture**: a successful Drupal submit returns a JSON blob
  `{"assignment_nid":"<id>","path":"assignment-creation-complete",...}`;
  `add_assignment` parses `assignment_nid` (the `/assignment/<id>` URL never
  appears).
- **find_assignment_id_by_title rewritten** to scan row-0 grade-cell
  aria-labels (`<student>, <title>[, <grade> out of <pts> points]`) for the
  `", <title>"` segment and return the column `data-x`. The old header-title
  scan returned null (titles are ng-binding spans NOT inside `[data-x]`).
  VERIFIED: `find_assignment_id_by_title('P2 Smoke Test')` -> the column data-x.
- **due_date**: ISO `YYYY-MM-DD` is rejected ("Field Due date is invalid"); now
  converted to `m/dd/yy`, with `due_date[time]` defaulting to `11:59pm` (a date
  with no time fails "A time is required to enable submissions").
- **grade-push targeting reconciled**: `_push_grades` resolves the column
  `data-x` LIVE by title (write_grade_to_cell keys on data-x, NOT the nid).

The orchestration's pre-flight (find_by_title BEFORE create) prevents duplicate
columns + self-heals the occasional flaky `ok=False` (a transient -- the create
actually lands; the next run's pre-flight reuses it).

**Still gated (needs SY26-27 data, NOT code):**
- Full live `--sync-section` WITH dates needs SY26-27 marking periods to exist
  -- the current MPs are SY25-26, so SY26-27 lesson dates (Sept 2026+) map to no
  MP (`marking_period_for_date -> None`). Date-LESS create works today; the
  date+MP path is untested-live until SY26-27 MPs are set up.
- Grade push is unexercised (no SY26-27 grade data yet); its pieces
  (find_by_title data-x + the verified P1b write_grade_to_cell) are each proven.
- Create is occasionally flaky (transient false); the pre-flight mitigates -- a
  verify-after-create retry would harden it further.

### Assignment DELETE (P2b RE, 2026-05-30) -- implemented

`schoology_ops.delete_assignment(cdp, nid)`: GET `/assignment/delete/<nid>`
renders a Drupal confirm form (id `s-grade-item-delete-form`) with a single
"Delete" submit (`input#edit-submit`, op=Delete); scrollIntoView + coordinate-
click it. Assignment node ids come from the materials page (anchors
`/assignment/<nid>`) or the create JSON. **The action URL does NOT redirect on
success and the confirm form lingers**, so `ok` is best-effort (a still-showing
"Are you sure" = a missed click); the coordinate-click is occasionally flaky, so
the robust pattern is a **delete-until-gone loop** (re-query the materials page
until the title is absent). Deleting an assignment also deletes ALL its grades.
The 2 `P2 Smoke Test` smoke columns were cleaned up via this; `Sync Test 1`
(data-x=0, grade 95) was preserved.

### Retry hardening + the eventual-consistency WALL (P2b, 2026-05-30)

`add_assignment` now polls for the transient success JSON (best-effort nid +
validation-error capture); `delete_assignment` retries the click and
re-navigates the delete URL to verify. BUT the load-bearing finding from
hardening: **Schoology's create/delete confirmation is fundamentally unreliable
via DOM scraping** -- every signal is transient or eventually-consistent/cached:

- the create success JSON (`assignment-creation-complete`) is TRANSIENT -- the
  page redirects away from it within ~1s, so a poll often misses it;
- the gradebook columns appear with a lag (5-6s+) and the grid render races
  (a fresh load can momentarily show zero assignment columns);
- the materials list is CACHED -- it lags new creates AND shows DELETED
  assignments as still-present (a just-deleted nid reappeared on a later load);
- even re-navigating `/assignment/delete/<nid>` can render the confirm form for
  an apparently-deleted assignment, so it is not a hard signal either.

Coordinate-click vs JS `.click()` made no consistent difference on these Drupal
forms -- the flakiness is the backend consistency, not the gesture. The submit
CLICK itself is reliable (creates land); only CONFIRMATION is unreliable.

**Architectural consequence (load-bearing for the live sync):** do NOT rely on
synchronous per-call confirmation. The reliability mechanism is the IDEMPOTENT
re-run -- the sync reconciles state via `find_assignment_id_by_title` (and a
delete-until-gone loop) across runs, tolerating that any single call's `ok` is
best-effort. `add_assignment` / `delete_assignment` return best-effort `ok`;
the orchestration's pre-flight + re-sync is the source of truth.

**Stray cleanup OUTSTANDING:** P2b verification left ~3 `P2 Retry Test`
assignments (nids 8405581289, 8405583046, 8405583594) in Sec 1 that automated
deletes could not reliably remove (the cache made verification impossible).
**These need MANUAL deletion via the live Schoology UI** (the teacher sees real
state; the automation was fighting a stale cache). They are hidden (publish off,
no grades). *(Update 2026-05-30: the teacher confirmed only `Sync Test 1`
remains -- these strays were actually deleted; the `ok=False` was a delete-side
false-negative, see below.)*

### Network fast-path live smoke (s123, 2026-05-30)

Ran a live date-less create on Sec 1 (`FastPath Smoke DELETE ME`, publish off /
sync off) to confirm the create-nid Network fast-path. Findings:

- **Create works; the fast-path did NOT fire.** `add_assignment` returned the
  nid, but via the DOM-poll fallback -- `wait_for_response("assignment-creation-complete")`
  returned `None`. ROOT CAUSE: that string is a token in the JSON response BODY
  (`"path":...`), NOT in the response URL. The real create POSTs to
  `/course/<id>/materials/assignments/add?is_popup=1` (form `s-grade-item-add-form`
  action). **Fix:** filter corrected to `materials/assignments/add`. **KEEP
  (live-verified 2026-05-30, re-smoke with a reliable submit):** the corrected
  filter matches that one response (out of ~100) and `getResponseBody` returns
  the JSON (status 200, `assignment_nid` present) -- the `is_popup` form yields
  a normal capturable response, NOT an evicted navigation, so the fast-path
  FIRES and supplies the nid from the network. The earlier "redirect race"
  worry did not materialize. DOM poll + find-by-title reconciliation stay as
  fallback / safety net.
- **Delete `ok` is a false-negative.** `delete_assignment` returned `ok=False`
  but the gradebook confirmed the column was GONE (`find_assignment_id_by_title`
  == None; count back to baseline). The confirm-form-renders check is unreliable.
  **Fix:** `delete_assignment(cdp, nid, *, course_id=None, title=None)` now
  verifies against gradebook truth when course_id+title are passed; the
  form-renders check is only the fallback. This is the same false-negative that
  made the `P2 Retry Test` strays look outstanding when they were already gone.

Both fixes are unit-tested (`tests/test_schoology_ops.py`) AND live-verified
(re-smoke 2026-05-30): the corrected fast-path fired and captured the nid from
the network; the gradebook-truth delete returned ok=True correctly. DECISION:
KEEP the fast-path.

**Flaky submit (separate finding, open):** in one re-smoke the coordinate-click
on `input#edit-submit` MISSED (no create fired at all), while a JS `.click()` on
the same button fired it reliably. The submit GESTURE -- not the capture -- is
the weak link. Consider switching `add_assignment`'s submit to a JS
`document.querySelector('input#edit-submit').click()`. The reconciliation re-run
already tolerates a missed submit, so this is reliability, not correctness.
