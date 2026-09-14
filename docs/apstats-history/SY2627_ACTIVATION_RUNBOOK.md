# SY26-27 Fall Infrastructure Activation Runbook

Everything in this file is already built, tested, and deployed — it just isn't switched on yet. Each
step below is a **user-action handoff**: a Supabase paste, a Railway variable, a Schoology click, or a
local script run. None of it can be done from code. This file contains **no secrets** — every place a
real key or password is needed, it says so and tells you where to get it, but never prints the value.

## WHO tags

The task that requested this file specified three buckets. A fourth shows up naturally (a script run
from a terminal on the teacher's own machine, distinct from pasting into the Supabase web SQL editor)
and is called out explicitly rather than forced into one of the other three:

| Tag | Means |
|---|---|
| **teacher-Supabase** | Paste SQL into the Supabase dashboard's SQL Editor |
| **teacher-Railway** | Set a variable in the Railway service dashboard (Variables tab) |
| **teacher-Schoology** | Click around in the live Schoology gradebook UI |
| **teacher-local** | Run a script/command in a terminal on the teacher's own machine |

`<TEACHER_KEY>` appears in curl examples below as a placeholder for "whatever value currently satisfies
teacher auth" (`x-teacher-secret` header) — that's the shipped default until you do Step 7, and your
freshly rotated value after.

Base URL used throughout: `https://roster-production-12c1.up.railway.app` (roster-server on Railway).

---

## Order of operations (dependency-driven)

| # | Step | WHO | Depends on |
|---|---|---|---|
| 1 | Migration `0028_submission_archive.sql` | teacher-Supabase | nothing |
| 2 | Migration `0029_pc_makeup.sql` | teacher-Supabase | nothing |
| 3 | Migration `0030_quarter_grade_snapshot.sql` | teacher-Supabase | nothing |
| 4 | Load the PC26 item banks (`load-pc-bank.mjs`) | teacher-local | Step 2 (needs `pc_bank` table) |
| 5 | Railway: `PC_TRACK_ENABLED=true` | teacher-Railway | Step 4 + real paper PC scores entered |
| 6 | Railway: `PC_FIGURES_SUPABASE_URL` / `PC_FIGURES_SUPABASE_SERVICE_KEY` | teacher-Railway | Step 4 (figures only matter once items are live) |
| 7 | Rotate `TEACHER_KEY` off the published default | teacher-Railway + teacher-local | nothing (independent; do it deliberately, once) |
| 8 | Schoology live-flip (`-Live`) | teacher-Schoology + teacher-local | SY26-27 marking periods exist + `Sync Test 1` deleted |

Steps 1–3 have no dependency on each other or on anything else — do them in any order, in one sitting,
any time before the fall semester. Step 4 needs Step 2's table to exist. Steps 5–6 need Step 4's data to
be meaningful. Step 7 is timing-independent but touches two other local tools, so it's written as one
deliberate action. Step 8 is last because it depends on an external precondition (Schoology's own
marking-period setup) that has nothing to do with this repo's code.

---

## Step 1 — Migration `0028_submission_archive.sql`

**WHO:** teacher-Supabase
**File:** `roster-server/migrations/0028_submission_archive.sql`

**What it creates:** the `submission_archive` table — append-only, content-addressed by `receipt_id`
(re-uploading the same submission is a no-op). Holds the raw, self-signed student SUBMISSIONS that a
device gossips over the offline mesh, once that device reaches the internet. Two indexes
(`student_id`, `item_id`) for the teacher audit query. RLS enabled, no policies (service-role only).

**Why it matters:** this is purely a durability/audit record. Per the migration's own header comment,
archiving is **decoupled from grading** — this table never writes a score and the server can never
re-grade a submission that already carries a teacher grade. Until this migration runs,
`POST`/`GET /submissions/archive` both return `503`. `teacher-app.html` already calls
`POST /submissions/archive` every time a mesh device comes online — today that call silently fails
(wrapped in a `try/catch`), so nothing breaks by leaving this off, but nothing gets archived either.

**Do this:**
1. Supabase dashboard → the `curriculum_render` project (`<AP_SUPABASE_PROJECT_URL>` —
   the same project already used for `ROSTER_SUPABASE_URL`, per `roster-server/README.md` Step 1) →
   **SQL Editor** → **New query**.
2. *(Optional sanity check first)* `select to_regclass('public.submission_archive');` — `NULL` means
   not yet applied. The migration itself is `create table if not exists`, so re-running it is harmless
   even if you're not sure.
3. Paste the entire contents of `roster-server/migrations/0028_submission_archive.sql` and click **Run**.

**VERIFY:**
```bash
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/submissions/archive"
```
- Before the migration: `{"ok":false,"error":"submission archive not provisioned (run migration 0028)"}` (503)
- After the migration: `{"ok":true,"submissions":[...]}` (200) — an empty array is fine, it just proves
  the table and route are live.

---

## Step 2 — Migration `0029_pc_makeup.sql`

**WHO:** teacher-Supabase
**File:** `roster-server/migrations/0029_pc_makeup.sql`

**What it creates:** two tables.
- `pc_bank(unit, part, payload, updated_at)`, PK `(unit, part)` — holds the CB-secure PC26 item banks
  **with answers**. The `GET /pc/:unit/:part` route strips answers before a student ever sees them
  (grading is server-authoritative). Empty until Step 4 loads it.
- `pc_unlock(id, student_username, unit, part, unlocked_by, unlocked_at, status)`, unique on
  `(student_username, unit, part)` — the per-student, teacher-set gate for the online makeup, set
  **after** the paper administration. A partial index covers active unlocks.

Both have RLS enabled with **no policies** — service-role only, same posture as `lesson_unlock`
(migration 0009).

**Why it matters:** until this exists, every `/pc/*` route that touches either table 503s with
`"pc_bank not provisioned — run migration 0029"` or `"pc_unlock not provisioned — run migration 0029"`.
`POST /pc/grade` (teacher hand-enters a paper PC score) does **not** touch either table — it only
depends on the older `item_ledger` `'pc'`-source check (migration `0011_item_ledger_pc_source.sql`,
already applied in production) — so paper scores can technically be recorded without this migration.
Everything else on the online-makeup path (serving items, the per-student unlock gate) needs it.

**Do this:**
1. Same SQL Editor / same project as Step 1.
2. *(Optional sanity check)* `select to_regclass('public.pc_bank'), to_regclass('public.pc_unlock');`
   — both `NULL` pre-migration.
3. Paste the entire contents of `roster-server/migrations/0029_pc_makeup.sql` and click **Run**.

**VERIFY** (run this *before* Step 4 loads any data, so you see the table-exists-but-empty state):
```bash
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/1/A"
```
- Before the migration: `{"ok":false,"error":"pc_bank not provisioned — run migration 0029"}` (503)
- After the migration, before Step 4: `{"ok":false,"error":"no bank for that (unit, part)"}` (404) —
  the 404 (not 503) is the proof the table now exists.

> Note: `pc.js`'s missing-table check only tests Postgres error code `42P01`. `submissions.js`'s
> equivalent check (`isArchiveMissing`) also accepts `PGRST205`. If a pre-migration `/pc/...` call ever
> comes back as a generic `500 "Database error"` instead of the clean `503` above, it likely just means
> Supabase returned the missing-table condition under the other code — the underlying fix is the same
> (run this migration).

---

## Step 3 — Migration `0030_quarter_grade_snapshot.sql`

**WHO:** teacher-Supabase
**File:** `roster-server/migrations/0030_quarter_grade_snapshot.sql`

**What it creates:** `quarter_grade_snapshot(student_id, quarter, login_username, frozen_grade,
frozen_pc_avg, frozen_work_avg, closed_by, frozen_at)`, PK `(student_id, quarter)`. Freezes each
student's quarter grade at teacher-run quarter close — the authoritative closed-quarter record you
enter into Schoology. Idempotent close: PK + first-write-wins, so re-running a close only snapshots
students not yet frozen. Post-close improvements (e.g. a makeup PC) surface as **bonus deltas**
(current − frozen), never as an edit to the frozen number. RLS enabled, service-role only.

**Why it matters:** until this exists, `POST /class/quarter/close` and `GET /class/quarter/deltas` both
`503`. This backs the **"Quarter Close & Bonus"** panel in `teacher-dashboard.html` (the "❄ Freeze this
quarter" and "Show bonus deltas" buttons).

**Do this:**
1. Same SQL Editor / same project.
2. *(Optional sanity check)* `select to_regclass('public.quarter_grade_snapshot');` — `NULL`
   pre-migration.
3. Paste the entire contents of `roster-server/migrations/0030_quarter_grade_snapshot.sql` and click
   **Run**.

**VERIFY** (read-only — does not freeze anything):
```bash
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/class/quarter/deltas?quarter=Q1"
```
- Before the migration: `{"ok":false,"error":"quarter_grade_snapshot not provisioned — run migration 0030"}` (503)
- After the migration: `{"ok":true,...}` with an (empty, this early) deltas list.

UI equivalent: `teacher-dashboard.html` → **Quarter Close & Bonus** section → click **"Show bonus
deltas"** (a `GET`, read-only, safe any time). Do **not** click **"❄ Freeze this quarter"** as a
verification step — freezing is a real, one-way action (first close wins per student).

---

## Step 4 — Load the PC26 item banks

**WHO:** teacher-local
**Script:** `roster-server/scripts/load-pc-bank.mjs`
**Depends on:** Step 2 (`pc_bank` table must exist — the upsert 42P01s otherwise)

**What it does:** reads the CB-secure PC26 bank JSON files, which live **outside this repo** (never
committed — the script itself carries no PC content), and upserts them into `pc_bank`. Part model per
the script's own header: `A` = mid-unit MCQ Part A (U1, U2 only); `REST` = end-of-unit remainder (U1/U2:
MCQ-B + MCQ-C + FRQ; U5: MCQ-A + FRQ — U5 is a single end-of-unit administration, so it has no `A` row).

**Prerequisite (real gotcha, confirmed against a fresh checkout):** `load-pc-bank.mjs` imports
`@supabase/supabase-js`, a `roster-server` dependency. If `roster-server/node_modules` hasn't been
installed yet, even `--dry-run` fails with `ERR_MODULE_NOT_FOUND`. Run `cd roster-server && npm install`
first if you haven't already (this is the same install `roster-server/README.md`'s "Running locally"
section already asks for).

**Path note:** with no `--school` flag, the script looks for the banks at
`<parent-of-this-repo-checkout>/apstatsy2627u{1,2,5}pc/extracted/unit{1,2,5}-pc-bank.v2.json` — i.e. it
assumes your checkout sits inside a folder (named `school` on the reference machine) that *also*
directly contains the three `apstatsy2627u{1,2,5}pc/` bank folders as siblings. If your checkout isn't
laid out that way, pass `--school <dir>` pointing at the folder that directly contains those three
`apstatsy2627u*pc/` folders. A missing bank for a unit does **not** fail the run — the script prints
`SKIP U<n>: bank not found at <path>` and just omits that unit's rows, so always read the dry-run output
line-by-line rather than trusting a clean exit code alone.

**Run the dry-run FIRST** (no Supabase env vars needed — it only reads local files and prints counts,
writes nothing):
```bash
node roster-server/scripts/load-pc-bank.mjs --dry-run
```

**Expected output** (per the task's confirmed counts):
```
Rows to upsert (unit/part/count):
  U1 A: 18 items
  U1 REST: 29 items
  U2 A: 19 items
  U2 REST: 25 items
  U5 REST: 21 items

--dry-run: nothing written.
```
If any line is missing or a count doesn't match, STOP and find the right bank file / `--school` path
before loading for real — do not upsert a partial or wrong bank.

**Then load for real**, with the same Supabase credentials `roster-server` itself already uses in
production (Railway → roster-server service → Variables tab → `ROSTER_SUPABASE_URL` /
`ROSTER_SUPABASE_SERVICE_KEY` — copy the values, don't paste them into a file):
```bash
ROSTER_SUPABASE_URL=... ROSTER_SUPABASE_SERVICE_KEY=... \
  node roster-server/scripts/load-pc-bank.mjs
```
Expect: `OK — upserted 5 pc_bank rows.`

**VERIFY** (repeat for each of the 5 rows):
```bash
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/1/A"
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/1/REST"
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/2/A"
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/2/REST"
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/5/REST"
```
Each should now return `{"ok":true,"unit":...,"part":...,"items":[...],"teacher":true}` with the item
count matching the dry-run line above — the Step 2 404 should now be a 200 with real items. (This uses
the teacher-secret preview path, which bypasses the per-student `pc_unlock` gate — `requireTeacher`
short-circuits the unlock check — so this works even before any student is unlocked.)

---

## Step 5 — Railway: `PC_TRACK_ENABLED=true`

**WHO:** teacher-Railway
**Read first:** `roster-server/grade-config.js` (`pcTrack.enabled`), `roster-server/lesson-grade.js`
(the PC-track gate, ~line 1084)

**What it does:** `pcTrack.enabled` reads `process.env.PC_TRACK_ENABLED === 'true'`. Off (unset, the
current production state) — `computeGrade`/`computeQuarterV3` skip PC scoring entirely: `pcRawPct`
stays `null`, `pcAvg` stays `null`, and the grade is byte-identical to the pre-PC engine (pinned by a
grade-invariance test). On — a unit's PC counts once that unit's last scheduled lesson is due.

**⚠ WHEN — do not flip early:** per `grade-config.js`'s own comment, enabling this makes an
un-taken-but-due PC count as a **0**, which caps that quarter at 70% of the Work-track score (the
two-track sub-floor ceiling) for **every student** who hasn't been scored yet. Flip this only once:
1. Step 2 + Step 4 are done (the bank exists and is loaded), **and**
2. the paper Progress Check for the unit in question has actually been administered and scored —
   either via the teacher entering scores through `POST /pc/grade`, or via unlocked online makeups
   (`POST /pc/unlock` → student `POST /pc/:unit/:part/submit`).

The baked SY26-27 schedule (`roster-server/data/lesson-schedule.json`) already has `1.1` due
`2026-09-09`, so "the fall schedule's dates pass" starts almost immediately once school opens — the
task's own guidance ("~Sept when PCs open") lines up with that schedule. Flip per-unit readiness, not
on day one of the unit: wait until that unit's PC is actually scored, not just administered.

**Do this:** Railway dashboard → roster-server service → **Variables** tab → add `PC_TRACK_ENABLED` =
`true`. Railway auto-redeploys on save.

**VERIFY:**
```bash
curl -s "https://roster-production-12c1.up.railway.app/health"
```
Confirms the redeploy came back up (`{"ok":true,"service":"roster",...}`). Then, in
`teacher-dashboard.html`'s gradebook, spot-check one student who **has** a real PC score and one who
does **not** yet: the scored student's quarter grade should reflect the PC component; the unscored
student's grade should **not** have silently dropped because of an un-taken PC counting as 0. If it
did drop for unscored students, this was flipped too early — set `PC_TRACK_ENABLED` back to unset/false
immediately.

---

## Step 6 — Railway: `PC_FIGURES_SUPABASE_URL` + `PC_FIGURES_SUPABASE_SERVICE_KEY`

**WHO:** teacher-Railway
**Read first:** `roster-server/pc-figures.js`

**What it does:** `createLiveFiguresSigner()` only activates when **both** envs are set. It signs
short-lived (7-day) URLs for the CB-secure PC figure images sitting in a private Supabase Storage bucket
(`pc-figures`, per `roster-server/data/pc-figures-manifest.json`), and attaches them to each item in the
`GET /pc/:unit/:part` response. If unset, the signer is `null` and items simply ship without figures —
the client falls back to `[Figure: ...]` text. This is a **soft degrade, not a 503**, so it's easy to
forget this flip and not notice for a while.

**✅ Resolved (teacher-confirmed 2026-08-07):** the figures bucket lives in the **same** project as
roster's DB — `<AP_SUPABASE_PROJECT_URL>` (the shared curriculum_render project, per
README decision D-G). The stale "DIFFERENT project" header comment in `pc-figures.js` has been
corrected. **This makes Step 6 trivial:** in Railway, set
`PC_FIGURES_SUPABASE_URL` = the existing `ROSTER_SUPABASE_URL` value, and
`PC_FIGURES_SUPABASE_SERVICE_KEY` = the existing `ROSTER_SUPABASE_SERVICE_KEY` value. No new keys
are needed.

**WHEN:** same time as Step 5 (~Sept). Per the task, the figures already sit in the private bucket — this
is a pure env flip, no data migration.

**Do this:** Railway → roster-server → Variables tab → add `PC_FIGURES_SUPABASE_URL` and
`PC_FIGURES_SUPABASE_SERVICE_KEY`, each set to the value the service already has in
`ROSTER_SUPABASE_URL` / `ROSTER_SUPABASE_SERVICE_KEY` (same project — see the resolution above).

**VERIFY:**
```bash
curl -s -H "x-teacher-secret: <TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/pc/1/A" | grep -o '"figures":{[^}]*}'
```
Any item that has an entry in `pc-figures-manifest.json` should now carry a
`"figures":{"stems":[...signed-url...],"choices":{...}}` block. A per-file sign failure degrades
silently (per the module's own doc comment), so the *absence* of a server error is **not** proof this
worked — you need to see an actual signed URL on a known-figure item, not just a clean response.

---

## Step 7 — Rotate `TEACHER_KEY` off the published default

**WHO:** teacher-Railway + teacher-local
**Read first:** `roster-server/teacher-auth.js`

**Why:** `getTeacherKey()` falls back to a hardcoded default whenever `TEACHER_KEY` is unset. Because
this repo is public on GitHub, that default is visible to anyone — and it unlocks **every**
teacher-gated endpoint (`requireTeacher`/`x-teacher-secret`): grades, the bulk decrypted-password
endpoints, PC banks, quarter close, everything. **This file does not print that default — rotate to a
fresh secret, do not paste the old one anywhere.**

**Do this:**
1. Generate a fresh secret (same pattern `roster-server/README.md` already uses for
   `ROSTER_TOKEN_SECRET`):
   ```bash
   openssl rand -hex 32
   ```
2. Railway → roster-server → Variables tab → set `TEACHER_KEY` = the freshly generated value.
   Railway auto-redeploys.
3. **In the same sitting**, update every local consumer that currently authenticates as teacher —
   rotating on Railway alone silently breaks these the next time they run:
   - **`tools/nightly-backup.mjs`** — reads its secret from `--config <json>`'s `"teacherKey"` field, or
     `--teacher-key`, or env `TEACHER_KEY` (per the script's own header comment). Update whichever of
     those you use.
   - **The daily Schoology sync** (`tools/daily_schoology_sync.ps1` → `tools/build_schoology_fixture.py`)
     — reads its secret from environment variable **`ROSTER_TEACHER_SECRET`**. This is a *different env
     var name* on the client side than Railway's `TEACHER_KEY`, but it must hold the **same value** you
     just set in Railway's `TEACHER_KEY` — the server checks the `x-teacher-secret` header against
     `TEACHER_KEY` OR the separate (currently-unset-in-production) `ROSTER_TEACHER_SECRET` server env;
     since you're rotating `TEACHER_KEY`, the client must send that new value. Re-run
     `setx ROSTER_TEACHER_SECRET <new-value>` on the scheduled-task account, per
     `tools/register_schoology_sync_task.ps1`'s own reminder output.

**VERIFY:**
```bash
curl -s -H "x-teacher-secret: <new TEACHER_KEY>" \
  "https://roster-production-12c1.up.railway.app/submissions/archive"
```
Expect `{"ok":true,"submissions":[...]}`. Then confirm the **old** value is dead by repeating the same
call with the old key (whatever it was — do not write it down here) and confirming
`{"ok":false,"error":"forbidden"}` (401). Finally, re-run the Schoology dry-run
(`tools/daily_schoology_sync.ps1 -Section PeriodB`, no `-Live`) and confirm `STEP 1` (which authenticates
via `ROSTER_TEACHER_SECRET`) succeeds instead of erroring — a stale local secret shows up there first.

---

## Step 8 — Schoology live-flip (`-Live`)

**WHO:** teacher-Schoology (preconditions, done in the Schoology web UI) + teacher-local (running/
registering the scripts)
**Read first:** `tools/daily_schoology_sync.ps1` header comment, `tools/schoology_sync_section.py`

**What it is:** `tools/daily_schoology_sync.ps1` always passes `--dry-run` to
`tools/schoology_sync_section.py` **unless** `-Live` is given — by design, per
`SCHOOLOGY_SYNC_V1_BUILD.md`'s P2b gate, which the script's own header comment cites.

**Two preconditions — both MUST be true before `-Live` is ever passed:**

1. **SY26-27 marking periods exist in the live Schoology gradebook.** This repo has no script that
   *creates* marking periods — `schoology_sync_section.py`'s `marking_period_for_date()` only
   *resolves* against whatever marking periods already exist, and hard-fails with
   `No grading_period_id covering due_date=...` if none cover the sync date. Create the SY26-27 marking
   periods directly in Schoology's course admin UI first.
2. **The leftover `"Sync Test 1"` assignment column(s) are deleted** from the live gradebook. These were
   created during the P1 discovery/testing phase (`tools/schoology-sync.py`'s header even notes 3
   duplicate `Sync Test 1` columns appeared once, from a resubmitted form). `tools/schoology_ops.py` does
   have a `delete_assignment(cdp, nid, ...)` helper, but it is currently exercised only by
   `tests/test_schoology_ops.py` — no CLI flag in `schoology-sync.py` or `schoology_sync_section.py`
   calls it, so there is **no one-line repo command for this**. Delete the column(s) manually in the
   Schoology gradebook UI for each course this repo syncs to: **Period B** (course id `7945275782`) and
   **Period E** (course id `7945275798`), per `SECTION_TO_COURSE_ID` in `tools/schoology_sync_section.py`.

**Do this first — dry-run, always safe, run as many times as you like:**
```powershell
$env:ROSTER_TEACHER_SECRET = '<value>'
powershell -NoProfile -File tools/daily_schoology_sync.ps1 -Section PeriodB
```
**VERIFY (before flipping):** open the produced log in `tools/.schoology-sync-logs/` and confirm:
- no `[ERROR] No grading_period_id covering due_date=...` lines (proves precondition 1),
- no stale `Sync Test 1` entry shows up among the assignments it plans to create/reuse (proves
  precondition 2), and
- both `STEP 1` and `STEP 2` complete without a non-zero exit code.

Repeat for `-Section PeriodE`.

**Only once both dry-runs are clean**, register the scheduled task with `-Live`:
```powershell
powershell -NoProfile -File tools/register_schoology_sync_task.ps1 -Section PeriodB -Live
powershell -NoProfile -File tools/register_schoology_sync_task.ps1 -Section PeriodE -Live
```

**VERIFY:**
```powershell
schtasks /Query /TN ApStatsSchoologySync /V /FO LIST
```
Confirms the task is registered with `-Live` in its command line. Then run it once by hand
(`schtasks /Run /TN ApStatsSchoologySync`) and **visually confirm in the Schoology gradebook UI** that a
real grade landed in a real assignment column for one known student — this is the same discipline
`tools/schoology-sync.py`'s own header insists on for the first live write ("always verify visually in
Edge before scripting against real assignments").

---

## Things flagged, not fixed (verify-before-relying-on-them)

- ~~`pc-figures.js` project-identity contradiction~~ **RESOLVED 2026-08-07**: same project as
  `ROSTER_SUPABASE_URL` (`<AP_SUPABASE_PROJECT_REF>`, per README decision D-G + teacher confirmation);
  the stale header comment in `pc-figures.js` is corrected. Step 6 = copy the two existing values.
- **Two specs referenced in code comments don't exist in this repo:** `PC_FIGURES_INTEGRATION_SPEC.md`
  (cited in `pc-figures.js`) and `PC_MAKEUP_PHASE2_GRADE_SPEC.md` (cited in `grade-config.js` and
  `lesson-grade.js`). Only `PC_MAKEUP_DELIVERY_SPEC.md` and `OFFLINE_GRADING_MESH_SPEC.md` actually exist
  at the repo root.
- **No scripted Schoology assignment-delete path** (Step 8): `schoology_ops.delete_assignment()` exists
  and is unit-tested, but nothing wires it to a CLI flag — the `Sync Test 1` cleanup has to be manual.
- **U1/U2/U5 bank item counts** (A18/REST29, A19/REST25, REST21, Step 4) are taken as given by the task —
  they could not be independently verified from this repo, because the CB-secure bank JSON files are
  intentionally never committed here (by the loader script's own design). Trust the dry-run's own printed
  counts over this document if they ever disagree.
