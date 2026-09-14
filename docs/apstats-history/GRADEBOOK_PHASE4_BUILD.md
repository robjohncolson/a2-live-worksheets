# Gradebook Phase 4 — teacher dashboard + student render (FROZEN CONTRACT)

**Status:** Planner-frozen 2026-05-19 (session 100, autonomous loop, after
Phase 3 `801dccc` DONE+PROD-VERIFIED). This doc is the authoritative Phase-4
build contract; implement it loop-style (freeze → build → Codex review →
planner verify on disk → commit/push → redeploy roster-server + smoke).
Reads: `GRADEBOOK_SPEC.md` §8, `GRADEBOOK_GRADING_SPEC.md` v2 §3/§4,
`GRADEBOOK_PHASE3_BUILD.md` (the `/grade`+`/mastery` shapes Phase 4 consumes).

Depends on (DONE & prod-verified): Phase 3 `/grade` + `/mastery` (`801dccc`),
Phase 0 `roster-client.js`/`roster_config.js` (repo-root siblings),
`db.listRoster(section)` (teacher-gated, exists).

## 1. Scope — Phase 4a (this) vs Phase 4b (deferred, separate contract)

`GRADEBOOK_GRADING_SPEC.md` §3/§8 names Phase 4 = "teacher dashboard
(weak-skill triage, **remediation approve**, heatmap) + `start-here.html`
student render". **Planner scope split (the key Phase-4 decision):**

- **Phase 4a — THIS increment (read/visibility layer):** class-wide grade +
  skill-heatmap visibility for the teacher, and the live student grade render.
  No new DB table, no write workflow. A coherent, shippable increment whose
  primary value is *seeing* grades and *who's weak where*.
- **Phase 4b — DEFERRED to its own frozen contract:** the §6
  `remediation_assignment` write loop (system-proposes → teacher-approves →
  completing it gates a re-check that *raises* the grade). It needs a **NEW
  `remediation_assignment` table in the curriculum_render Supabase** =
  user-gated migration + bigger blast radius — exactly the kind of DB-migration
  boundary Phase 0/1 were split on. Building it inside 4a would entangle a
  multi-table workflow with a pure read layer. **Rationale recorded so reload
  knows this was a deliberate split, not an omission.** The 4a dashboard
  surfaces the weak-skill triage list the teacher acts on; 4b formalizes the
  record + gating.

## 2. The three deliverables (Phase 4a)

### 2.1 roster-server additive — class aggregation (planner implements directly)

The Phase-3 `/grade` + `/mastery` are **per-student roster-token** gated; the
teacher holds no student tokens. So the dashboard needs **teacher-gated
class-wide** endpoints (mirror `/roster/list`: `x-teacher-secret`, optional
`?section=`).

- **Refactor (behaviour-identical — the 157 tests pin it):** extract pure
  `computeGrade(ledgerRows, answerKey, config)` from `grade.js` and
  `computeMastery(ledgerRows, answerKey, skillMap, bkt, config)` from
  `mastery.js` into the route-free core (same module or `scoring.js`-adjacent).
  The existing `GET /grade` / `GET /mastery` handlers call the extracted
  function — **zero behaviour change** (Phase-3 GREEN gate must still hold:
  roster-server 157/157, the same per-student outputs).
- **`GET /class/grades?section=`** (x-teacher-secret; 401 like `/roster/list`):
  `db.listRoster(section)` → for each student `ledgerDb.getLedgerByStudent` →
  `computeGrade` → return `{ ok, asOf, section, students:[{ studentId,
  realName, username, units, quarters, completion }], config }`. Read-only.
- **`GET /class/mastery?section=`** (x-teacher-secret): same fan-out →
  `computeMastery` per student → return per-student weak lists **plus a class
  `heatmap`**: `{ skill: { weak, total, pctWeak } }` aggregated across the
  section (the "who's weak where" core). Read-only. θ stays server-side
  config; the heatmap exposes counts, not per-student probabilities beyond
  the weak flag (teacher tool — same trust level as `/ledger/student`).
- Additive + injectable + no-network tests, exactly like `mountRollup`/
  `mountGrade`. `db` (roster) is now also injected where class endpoints mount
  (for `listRoster`) — thread it through `createApp` without breaking the
  existing positional callers (guard-mount like the others).

### 2.2 `teacher-dashboard.html` (new single-file — mirror `teacher-roster-console.html`)

Same proven pattern as `teacher-roster-console.html`: `x-teacher-secret`
input (placeholder "not stored" — **never persisted to localStorage**),
`svcUrl()` from `window.ROSTER_SERVICE_URL`, `fetch` with the
`x-teacher-secret` header, optional section filter. Renders:
- **Class grade table:** row per student; columns = Q1–Q4 quarter grades +
  per-unit `unitGrade`; a separate **completion accountability** column
  (the §2 "did they do the work" readout, visually distinct from the grade).
- **Skill heatmap:** per-skill class `pctWeak` from `/class/mastery`,
  colour-scaled (green→red); the "who's weak where" at a glance.
- **Weak-skill triage list:** skills sorted by `pctWeak` desc, each
  expandable to the students weak in it (the actionable list; 4b will add
  the approve workflow on top of this same surface).
Read-only teacher tool; no writes; no PII beyond the roster console's level.

### 2.3 `start-here.html` — live student grade render (enhance the existing page)

`start-here.html` already explains the cumulative+booster model in prose
(cumulative framing, NO BKT jargon — already §3/§4-aligned). Add **ONE new
section, "Where you stand"**, between "How your grade actually works" and the
summer on-ramp:
- Loads the repo-root siblings `roster_config.js` + `roster-client.js`
  (same dir — start-here.html is at repo root, like the worksheets' `../`
  pattern but same-level here).
- On load: `rosterClient.token()` →
  - **signed in:** `fetch(ROSTER_SERVICE_URL + '/grade?token=' + token)` →
    render per-unit + per-quarter cumulative grades + the completion readout,
    in the page's existing visual language and the existing cumulative
    framing ("you've banked …", "the Progress Check is how you reach the
    very top"). Show `banked`/`unitGrade`/`quarterGrade`; frame `P`/PC as
    the only-raises booster. **NO BKT jargon, NO θ, NO probabilities, NO
    `/mastery` call on the student page** (spec §3 — to eliminate any
    jargon-leak risk, 4a student render = the GRADE only; the motivational
    per-skill "territory" view is explicitly **deferred** within 4a as it
    needs careful jargon-free UX).
  - **not signed in:** a friendly stub ("Sign in on the Desk to see your
    progress here") — the page stays a valid public welcome page for
    not-yet-enrolled visitors; all existing static content unchanged.
- Fail-soft: any fetch/identity error → the stub, never a broken page or a
  console-scary state (mirror `gradebook-client.js` decision L-D ethos).

## 3. Method (loop algorithm)

Contract frozen (this doc) → **planner implements 2.1 directly** (cohesive
contended server tooling; parallel-Sonnet on roster-server = clobber, the
hard-won s100 rule) → then **parallel Sonnet for 2.2 + 2.3** (genuinely
independent files: a new teacher HTML and an enhancement to a different
student HTML — no overlap, safe to fan out per the CLAUDE.md rule) → Codex
cross-agent **read-only review** (ASCII-only; detached; parse
`state/cross-agent/<id>.result.json`/transcript tail) → planner re-verify on
disk (suites + guards + smoke) → tight commit (stage own paths only) → push →
**roster-server redeploy** (`railway up --ci -s roster`) + class-endpoint
SMOKETEST smoke → update memory/CONTINUATION → Task #5 (§6.4 + AI-tutor).

## 4. GREEN gate (unchanged shape)

- roster-server full suite green — **no Phase-0/1/donow/rollup/grade/mastery
  /TR regression** (the refactor is behaviour-identical) + new
  `tests/class.test.js` (fan-out, teacher-gate 401, heatmap aggregation,
  read-only, malformed-tolerant) green.
- follow-alongs root suite: only the 1 known `study-guide.test.js` fail;
  new Phase-4 structure/no-jargon guard test green (assert
  `teacher-dashboard.html` exists + the `start-here.html` "Where you stand"
  block contains NO `θ`/`pKnow`/`BKT`/`probability` tokens — the §3
  student-jargon guard).
- `node scripts/audit-feeder-ids.mjs` → CLEAN 69 (Phase 4 adds no skill-map
  keys).
- roster-server **REAL redeploy** + smoke: `/class/grades` + `/class/mastery`
  with `x-teacher-secret` against a `SMOKETEST` section (enroll → record →
  class endpoint returns the student's computed grade/heatmap); fold cleanup
  into the standing `delete from roster where section='SMOKETEST';`.

## 5. Guardrails

Never write sacred `curriculum.js`. roster-server additive only; the
extract-pure-fn refactor must keep `/grade`+`/mastery` byte-behaviour-
identical (Phase-3 tests are the proof). Stage own paths only (repo has
unrelated dirty scratch + concurrent-session history). `x-teacher-secret`
is **never** persisted client-side. Student page: **zero** BKT/θ/probability
vocabulary (automated guard test). Phase 4b (remediation write loop +
re-check gating + the new Supabase table) is OUT of this contract — it gets
its own frozen build doc and a user-gated migration.
