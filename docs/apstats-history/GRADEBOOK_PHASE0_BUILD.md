# Gradebook Phase 0 — Build Plan & Frozen Contracts

**Status:** Build in progress. Spec `GRADEBOOK_SPEC.md` signed off 2026-05-17. This doc freezes every
interface so the three workstreams can be built in parallel without negotiating with each other.
**Read `GRADEBOOK_SPEC.md` first.** This doc is the implementation contract; the spec is the why.

> **Rule for all agents:** the three FROZEN CONTRACTS below are law. Do not rename a column, change a
> route, alter a JSON field, or move a file. If a contract looks wrong, STOP and flag it in your result
> file — do not "fix" it silently (silent contract drift breaks the other two parallel workstreams).

---

## 0. Implementation decisions (within the signed-off §6)

These are implementation-level choices the planner locked. Rationale recorded for the decision log
(acceptance criterion §7.7).

| ID | Decision | Rationale |
|----|----------|-----------|
| D-A | **Password hash = `bcryptjs`** (pure-JS bcrypt, cost factor 12). | Spec §7 allows "argon2/bcrypt". `argon2` and native `bcrypt` are node-gyp native addons — flaky on Windows local dev (CLAUDE.md platform gotcha) and add Railway build risk. `bcryptjs` is pure JS, zero native deps, identical on Windows + Railway. |
| D-B | **Standalone `roster-server/` Express service** in *this* repo (own `package.json`, deployed to Railway). NOT bolted onto the separate `curriculum_render` repo's server. | Spec §6.5: "a thin auth service we own (Railway endpoint)… the same shape against the curriculum_render project's new isolated roster* tables" (§6.1 revised — see D-G). The lrsl-driller backend the study guide copies is itself a standalone Railway Express service. Standalone keeps Phase 0 reviewable in one PR and does not entangle a separate repo. A subfolder of Node server code is inert to GH Pages (it serves the static HTML; `roster-server/` is never linked). |
| D-C | **Session token = compact HMAC-SHA256** via Node `crypto` (no JWT dep). `base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, ROSTER_TOKEN_SECRET))`. Payload `{ sid, exp }`. 30-day expiry. | Phase 1 feeders need a verifiable student stamp without a Supabase session. HMAC is dependency-free, trivial to verify, good enough for a classroom grade-of-record. Export `verifyToken()` for Phase 1. |
| D-D | **`/roster/enroll` is teacher-gated**: requires header `x-teacher-secret: <ROSTER_TEACHER_SECRET>`. No student self-signup (spec §6.2). Username generated **server-side** (fruit_animal). | Spec §6.2 "teacher-provisioned (no student self-signup)". |
| D-E | **Data access abstracted behind `roster-server/db.js`** so the service is unit-testable without network (tests inject a fake db). | Cannot provision the live Supabase project from here (no dashboard creds); build must be locally verifiable. |
| D-F | **Live provisioning is a user-action handoff** (see §6). Everything else is built deploy-ready and locally tested against mocks / a local service instance. | Creating/configuring the Supabase + Railway targets needs the user's accounts. Not a code blocker. |
| D-G | **Roster DB home = REUSE the existing curriculum_render Supabase project `<AP_SUPABASE_PROJECT_REF>`** (new isolated `roster*` tables), NOT a new dedicated project. *Revises spec §6.1; ratified 2026-05-17.* No code change — `roster-server` is already env-driven (D-E); only `ROSTER_SUPABASE_*` targets + docs change. | Supabase free tier = 2 projects, both used. New tables don't inherit existing schema (intent of §6.1 preserved). Feeder data (`answers`, AI grades) already lives there → cheap same-project joins for Phases 1+ instead of cross-project ETL. |

---

## FROZEN CONTRACT 1 — Database schema (`roster-server/migrations/0001_roster.sql`)

Postgres / Supabase. Exactly per spec §4. **No anon access — service-role only (RLS on, zero policies).**

```sql
-- 0001_roster.sql — Gradebook Phase 0. Apply to the curriculum_render Supabase project
-- (<AP_SUPABASE_PROJECT_REF>; §6.1 revised 2026-05-17 / D-G). Creates ONLY roster + roster_alias
-- (idempotent, RLS on those two only) — NEVER ALTER or touch existing tables in this shared project.
create extension if not exists pgcrypto;

create table if not exists roster (
  student_id     uuid primary key default gen_random_uuid(),
  real_name      text not null,
  section        text not null,
  login_username text not null unique,
  password_hash  text not null,
  email          text,
  status         text not null default 'active' check (status in ('active','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists roster_alias (
  alias_id   uuid primary key default gen_random_uuid(),
  student_id uuid not null references roster(student_id) on delete cascade,
  source     text not null check (source in ('worksheet','studyguide','roadmap')),
  legacy_key text not null,
  created_at timestamptz not null default now(),
  unique (source, legacy_key)
);

create index if not exists roster_section_idx on roster(section);
create index if not exists roster_alias_student_idx on roster_alias(student_id);

-- updated_at trigger
create or replace function roster_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists roster_set_updated_at on roster;
create trigger roster_set_updated_at before update on roster
  for each row execute function roster_touch_updated_at();

-- RLS: enabled with NO policies => only the service-role key (which bypasses RLS) can touch these.
alter table roster        enable row level security;
alter table roster_alias  enable row level security;
-- (Intentionally NO create policy statements. Anon/auth roles get zero rows. Spec §7.1.)
```

Column names/types are FROZEN — `roster-server` and the spec all reference these exact names.

---

## FROZEN CONTRACT 2 — Auth service HTTP API (`roster-server/`)

Base URL configured by the client via `window.ROSTER_SERVICE_URL`. All bodies/responses are JSON.
All responses include `ok: boolean`. Errors: `{ ok:false, error:"human message" }` + appropriate HTTP status.

### `GET /health`
→ `200 { ok:true, service:"roster", time:"<iso>" }`

### `POST /roster/enroll`  *(teacher-gated)*
**Headers:** `x-teacher-secret: <ROSTER_TEACHER_SECRET>` (required; 401 `{ok:false,error:"forbidden"}` if missing/wrong).
**Body:** `{ realName: string (required), section: string (required), password: string (required), email?: string }`
**Behavior:** generate a unique `login_username` server-side (fruit_animal, see §3), `bcryptjs.hash(password,12)`,
insert into `roster`. On `login_username` collision (DB unique violation) regenerate up to 8× then 500.
**→ 200** `{ ok:true, studentId:"<uuid>", username:"<fruit_animal>", realName, section }`
**→ 400** missing field · **→ 401** bad teacher secret · **→ 500** `{ok:false,error}`

### `POST /roster/verify`
**Body:** `{ username: string, password: string }`
**Behavior:** look up by `login_username` (case-insensitive: compare `lower(login_username)=lower(username)`),
`bcryptjs.compare`. On success mint a session token (D-C, §4).
**→ 200** `{ ok:true, studentId:"<uuid>", token:"<compact-hmac>", realName, section }`
**→ 401** `{ ok:false, error:"Invalid username or password" }` (same message for unknown user AND bad password — no user enumeration)
**→ 400** missing field

### `POST /roster/resolve`  *(Phase-1 helper, contract fixed now)*
**Body:** `{ token: string }`
**→ 200** `{ ok:true, studentId:"<uuid>" }` if signature valid and not expired · **→ 401** otherwise.

**Token format (D-C), FROZEN:** `b64url(JSON.stringify({sid,exp})) + "." + b64url(HMAC_SHA256(thatFirstPart, ROSTER_TOKEN_SECRET))`.
`exp` = epoch ms, 30 days out. base64url = `+`→`-`, `/`→`_`, strip `=`. Export `signToken(studentId)` and
`verifyToken(token) -> studentId|null` from a `roster-server/token.js` for Phase 1 reuse + unit tests.

### Env (`roster-server/.env.example`)
```
ROSTER_SUPABASE_URL=          # curriculum_render project URL <AP_SUPABASE_PROJECT_URL> (D-G)
ROSTER_SUPABASE_SERVICE_KEY=  # service-role key, SERVER ONLY, never shipped to a client
ROSTER_TOKEN_SECRET=          # long random string for HMAC
ROSTER_TEACHER_SECRET=        # shared secret the teacher uses to enroll
PORT=8090
```
The service-role key and both secrets are read from `process.env` only — they MUST NOT appear in any
client file, any test fixture, or any committed `.env`. Commit only `.env.example`.

---

## FROZEN CONTRACT 3 — `roster-client.js` (repo-root sibling, like `railway_client.js`)

Placed at repo root: `roster-client.js` + `roster_config.js`. Apps load them as
`<script src="../roster_config.js"></script><script src="../roster-client.js"></script>`
(same `../` convention worksheets already use for `railway_*.js` — verified in `u6_lesson3_live.html:865`).

`roster_config.js` sets exactly:
```js
window.ROSTER_SERVICE_URL = window.ROSTER_SERVICE_URL || 'https://apstats-roster-production.up.railway.app';
```

`roster-client.js` exposes exactly one global. **Single localStorage key (FROZEN): `apstats_roster.v1`**
holding `{ studentId, username, realName, section, token, signedInAt }`.

```js
window.rosterClient = {
  current(): { studentId, username, realName, section } | null,   // from localStorage; null if absent/expired-shaped
  async signIn(username, password): { ok, studentId, realName, section, error? },  // POST /roster/verify, persists key on ok
  async enroll({ realName, section, password, teacherSecret, email? }): { ok, username, studentId, error? }, // POST /roster/enroll with x-teacher-secret header
  signOut(): void,                                                 // removes the localStorage key
  studentId(): string | null,                                      // convenience = current()?.studentId ?? null
  token(): string | null                                           // convenience for Phase-1 feeders
}
```

Constraints: pure browser JS, no build, no imports, no Supabase, no secrets. Talks ONLY to
`window.ROSTER_SERVICE_URL`. Reads service URL at call time (not module-load) so tests can override.
`current()` must not throw if localStorage is blocked (wrap in try/catch → return null).

---

## 1. File layout (what gets created — FROZEN paths)

```
follow-alongs/
  roster-client.js                         # workstream C  (repo root, sibling of railway_client.js)
  roster_config.js                         # workstream C
  roster-client-demo.html                  # workstream C  (manual + jsdom cross-host identity proof)
  GRADEBOOK_PHASE0_BUILD.md                # this file (planner)
  GRADEBOOK_SPEC.md                        # exists; workstream A appends a Decision Log section
  tests/
    roster-client.test.js                  # workstream C  (jsdom, runs under root `npm test`)
  roster-server/                           # workstream B  (standalone Railway Express service)
    package.json                           #   own deps: express, cors, @supabase/supabase-js, bcryptjs, vitest
    server.js                              #   Express app + routes (FROZEN CONTRACT 2)
    db.js                                  #   data-access wrapper around supabase-js (injectable for tests)
    token.js                               #   signToken / verifyToken (D-C)
    username.js                            #   fruit_animal generator (ported from study guide §3)
    .env.example
    railway.json                           #   { "deploy": { "startCommand": "node server.js" } }
    README.md                              #   deploy runbook (provision + migrate + env + deploy)
    migrations/
      0001_roster.sql                      # workstream A authors; lives here so it ships with the service
    tests/
      auth.test.js                         #   enroll/verify/resolve against an injected fake db
      token.test.js                        #   sign/verify round-trip, tamper, expiry
```

Workstream A authors `roster-server/migrations/0001_roster.sql` + `roster-server/README.md` runbook +
the Decision Log appended to `GRADEBOOK_SPEC.md`. Workstream B owns everything else under `roster-server/`
**except** that SQL file + README (A writes those; B may read them). Workstream C owns the three
repo-root/`tests/` client files. No path is owned by two workstreams → safe parallel.

---

## 2. Acceptance criteria mapping (spec §7 → who delivers)

| Spec §7 criterion | Delivered by | "Done" = |
|---|---|---|
| roster + roster_alias, RLS service-role-only | A | `0001_roster.sql` matches FROZEN CONTRACT 1 verbatim; README runbook to apply it |
| Auth service /roster/enroll + /roster/verify→{studentId,token}, bcrypt, service key server-only | B | routes match FROZEN CONTRACT 2; `auth.test.js` + `token.test.js` green; no secret in any committed file |
| roster-client.js parent-dir sibling, current/signIn/enroll/studentId, talks only to auth service | C | matches FROZEN CONTRACT 3; `roster-client.test.js` green (jsdom, fetch mocked) |
| One enrolled student resolves to same student_id from roadmap, worksheet, study guide | C | `roster-client-demo.html` + a jsdom test proving `current().studentId` is identical across 3 simulated hosts sharing `apstats_roster.v1` |
| /api/submit-answer, /api/ai/grade, /api/ai/appeal accept+persist student_id | A (doc only) | Decision Log + spec note: contract/field fixed here, wiring is Phase 1. **Do NOT edit the curriculum_render repo this phase.** |
| No plaintext passwords/salts client-visible | B+C | grep proof: no password/secret in roster-client.js, roster_config.js, demo, or any test fixture |
| Documented decision per §6.1–§6.4 | A | "Decision Log" section appended to `GRADEBOOK_SPEC.md` covering §6.1–6.4 + D-A..D-G (§6.1 reuse-project revision recorded) |

**Out of scope this phase (do NOT do):** item_ledger/skill_mastery tables, any feeder wiring, the
curriculum_render quiz path, editing the separate `curriculum_render` repo, roadmap/worksheet login
UI integration (that is Phase 1 adoption), touching `curriculum_render/data/curriculum.js` ever.

---

## 3. Concrete reuse pointers (don't reinvent)

- **fruit_animal username generator** — port from `study_guide_diagnostic.html`:
  - word lists: lines **2621–2623** (`USERNAME_FRUITS`, `USERNAME_ANIMALS`, `USERNAME_VEHICLES`)
  - generator: lines **2629–2640** (`generateUniqueUsername`) — `fruit_animal`, then `fruit_animal_vehicle`,
    then `fruit_animal_<rand>`. In `roster-server/username.js`: same word lists; uniqueness is a **DB
    insert under the `login_username` UNIQUE constraint with regenerate-on-collision retry**, not an
    in-memory set.
- **Auth HTTP shape to mirror** — study guide → driller backend: `POST {base}/api/users` create
  `{username,real_name,password}`, `POST {base}/api/users/verify` `{username,password}`
  (`study_guide_diagnostic.html:2592–2607, 3140–3232`). We keep the *shape*, rename routes to
  `/roster/*`, and **fix the security hole**: the reference impl
  `curriculum_render_v2/railway-server/server.js:528` does `data.password !== password` (PLAINTEXT).
  Phase 0 MUST use bcryptjs hash+compare. Do not copy the plaintext comparison.
- **Express/Supabase server skeleton to mirror** — `curriculum_render/railway-server/server.js`
  (ES modules, `import express`, `createClient(SUPABASE_URL, SERVICE_KEY)`, `app.use(cors())`,
  `app.listen(process.env.PORT||...)`). roster-server points at the **new** project's env vars, not
  `<AP_SUPABASE_PROJECT_REF>`.
- **Sibling client pattern to mirror** — `railway_client.js` (IIFE-ish, sets `window.<global>`, reads
  `window.<CONFIG>`) + `railway_config.js` (one liner). Keep `roster-client.js` equally dependency-free.

---

## 4. Test expectations (each workstream ships its own; all must be green before Codex review)

- **B `roster-server/tests/`** (vitest, run `cd roster-server && npm i && npm test`):
  - `token.test.js`: sign→verify round-trips; tampered payload → null; expired → null; wrong secret → null.
  - `auth.test.js`: inject a fake `db` (in-memory Map). enroll happy-path returns uuid+username;
    enroll without teacher secret → 401; verify good creds → token that `verifyToken` accepts;
    verify bad password → 401 with the SAME generic message as unknown user; password never stored
    or returned in plaintext (assert stored value is a bcrypt hash `^\$2[aby]\$`).
- **C `tests/roster-client.test.js`** (jsdom, runs under root `npm test`):
  - `current()` null when key absent; returns parsed object when `apstats_roster.v1` present; never throws.
  - `signIn` mocks `fetch` → on `{ok:true,...}` persists the one key and `studentId()` returns the uuid.
  - `enroll` sends `x-teacher-secret` header; does not persist a session (enroll ≠ signin).
  - `signOut` removes the key. No password/secret string literals anywhere in the client files.
  - **Cross-host identity test:** simulate 3 documents sharing one localStorage (set
    `apstats_roster.v1` once) → `rosterClient.current().studentId` identical in all 3 (criterion §7.4).
- Root `npm test` must stay green (845/845 baseline + the new client test).

## 5. Definition of done for the parallel batch (before Codex)

Each Sonnet agent writes a `.result.md` stating: files created, contract adherence (quote the frozen
section it implemented), test command + actual pass output, and anything it had to flag. **A result
file is not evidence — the planner re-runs every test (memory gotcha s88b: fabricated pass reports).**

## 6. USER-ACTION HANDOFF (cannot be done from here — needs the user's accounts)

These are documented in `roster-server/README.md` and are *not* code blockers; the build is verified
locally against mocks/a local instance.

1. Use the **existing curriculum_render Supabase project** `<AP_SUPABASE_PROJECT_URL>` — **do NOT create a new project** (spec §6.1 revised 2026-05-17 / D-G; free tier = 2 projects, both used). Copy its URL + service-role key from that project's API settings.
2. Run `roster-server/migrations/0001_roster.sql` in that project's SQL editor. It is idempotent and creates ONLY `roster` + `roster_alias`. **Before running, sanity-check there is no pre-existing `roster`/`roster_alias` table of a different shape; after running, confirm exactly those two tables were created and no existing table changed. Never run destructive/`ALTER` SQL in this shared project.**
3. Create a Railway service from `roster-server/`; set env: `ROSTER_SUPABASE_URL`,
   `ROSTER_SUPABASE_SERVICE_KEY`, `ROSTER_TOKEN_SECRET` (`openssl rand -hex 32`),
   `ROSTER_TEACHER_SECRET`. Note the deployed URL.
4. Put the deployed URL in `roster_config.js` (`window.ROSTER_SERVICE_URL`).
5. Smoke: `curl /health`; enroll one student with the teacher secret; `signIn` from
   `roster-client-demo.html`.
```
