# STUDENT_SELF_SIGNUP_BUILD.md — open self-signup with re-roll + 4-digit PIN

**Shipped 2026-06-03.** New students open a link, the **signup modal auto-pops on a
first-time device**, they type their real name, **🎲 re-roll a `fruit_animal` username**
until happy, set a **4-digit PIN**, and claim. **First-come-first-serve** is the DB
`UNIQUE` on `roster.login_username` (the atomic insert is the race winner).

## Decisions (teacher, 2026-06-03)
- **Open self-signup** (no class code) — weakest gate accepted; rate-limit is the backstop.
- **Period** = a single hidden `PeriodX` shown as **"Period X"**. The *schedule* students
  see is forced to **E** (`cP='E'`). Section value `PeriodX` is the live convention the
  sign-in dropdown queries (`/roster/section/PeriodX`) — using `PeriodE` would hide new
  signups from that dropdown, so the **section value stays `PeriodX`** while the displayed
  schedule is E. The two are separate axes.
- **Auth** = 4-digit PIN (a PIN is just a 4-digit password — flows through `/roster/verify`
  unchanged). `must_change_password=false` (the student set it).
- **Real name** is student-typed; the teacher reconciles via `/roster/list` + rename.

## Server (`roster-server/`)
- **`signup-config.js`** (new) — `parseOpenSections(env)` / `getOpenSections()` / `isOpenSection(v)`.
  Env `OPEN_SIGNUP_SECTIONS` = `value:label;…` (default `PeriodX:Period X`). Teacher-editable
  for fall (set env + redeploy → signup auto-shows a real dropdown for N>1).
- **`rate-limit.js`** (new) — in-memory fixed-window per-IP limiter (`now` injectable) + a
  per-username **`createLoginThrottle`** (failed-attempt lockout) + a hard memory backstop.
- **`db.insertRoster`** — gained optional `mustChangePassword = true` (default preserves
  enroll; claim passes `false`). Only prior caller = enroll, unaffected.
- **`server.js`** — `app.set('trust proxy', 1)` (**1 hop**, not `true` — `true` lets a client forge
  `X-Forwarded-For` and rotate it to defeat the limiter); a `signupClaimLimiter` (env `SIGNUP_CLAIM_MAX`/
  `SIGNUP_CLAIM_WINDOW_MS`, default **120/15min** — generous because a class shares one school NAT);
  a per-username **`verifyThrottle`** on `/roster/verify` (env `VERIFY_LOCKOUT_MAX`/`_WINDOW_MS`, default
  **10/15min**) so a 4-digit PIN + public usernames can't be brute-forced into account takeover; two routes:
  - `GET /roster/open-sections` (public) → `{ ok, sections:[{value,label}] }`.
  - `POST /roster/claim` (public, rate-limited) — body `{realName, section, username, pin}`:
    realName sanitized (`[^\p{L}\p{M} .'-]` stripped, 1–80); **section re-validated against the
    allowlist (403 if not — never trust the client)**; username `^[a-z0-9_]{3,40}$` lowercased;
    pin `^\d{4}$`; bcrypt cost 12 + reversible cipher; `409 username-taken` on unique violation;
    on success mints a token and returns the **`/roster/verify` shape** (auto sign-in).

## Client (`roster-client.js`)
- `rosterClient.claim({realName,section,username,pin})` — POSTs `/roster/claim`; on `ok`
  persists `apstats_roster.v1` (claim == sign-in); `{ok:false, code:'username-taken'}` → UI re-rolls.
- `rosterClient.openSections()` — GETs `/roster/open-sections`; `[]` on any failure (UI falls back).

## Desk (`ap_stats_roadmap_square_mode.html`)
- **Signup modal** `#signup-overlay` (System 7): real-name, period (read-only label when 1
  option / `<select>` when many), username card + `🎲 Re-roll`, PIN + confirm PIN, `Create account`,
  `Sign in instead`. Sign-in modal cross-links via `_switchToSignUp()`.
- **JS**: `_spinUsername` (client-side spin from embedded word lists — mirror of `username.js`,
  instant, no round-trip), `_renderSignupSections`, `openSignupModal`/`closeSignupModal`,
  `_switchToSignUp`/`_switchToSignIn`, `submitSignUp` (validate → `claim` → `_applySignedUpSession`),
  `_applySignedUpSession` (mirror legacy key + refresh Desk + welcome that reminds username + PIN).
- **Boot**: `cP='E'` forced, `?period=` ignored (like `?year=`) → both `…&period=B` and `…&period=E`
  links show the same X=E schedule. The visible "Period X" controls call `setP('E')`.
- **First-load**: on boot-splash dismissal when `!_deskAccessGranted()`, a device with no sign-in
  history (`_loadKnownUsers()` empty) opens **signup**; a returning device opens **sign-in**.

## Tests (all green)
- `roster-server/tests/signup-claim.test.js` — 18 (claim happy/taken/section/pin/realname/charset/
  ratelimit + open-sections + pure `parseOpenSections`/`createRateLimiter`).
- `tests/desk-self-signup.test.js` — 17 (modal markup, boot X=E, first-load branch, runtime spin/
  submit/validation/switch).
- `tests/roster-client.test.js` — +5 (claim persist/taken/network, openSections ok/fail).
- `tests/desk-signin-wall.test.js` — test 06 updated for the signup/sign-in branch.
- Baselines: roster-server **790**, Desk suite green. Pre-existing unrelated fails (untouched):
  `grade-clarity`, `grade-pipeline-w4`, `poll-archive-desk`, `study-guide`.

## Deploy / ops
- **No DB migration** (PIN reuses `password_hash`; `section` is a free string; `must_change_password`
  exists). `roster-server/` auto-deploys on push; the Desk is GH Pages.
- To change periods for fall: set Railway env `OPEN_SIGNUP_SECTIONS` (e.g. `PeriodA:Period A;PeriodB:Period B`)
  and restore real `?period` routing in the boot IIFE + the "Period X" controls.

## Adversarial review (5 dimensions, verify pass) — all confirmed findings folded
- **HIGH** `trust proxy: true` → forged-XFF limiter bypass → `trust proxy: 1` (+ forged-XFF regression test).
- **HIGH** `/roster/verify` had no lockout → per-username `verifyThrottle` (a PIN account was brute-forceable).
- Collision check tightened (`'duplicate key'`, not a loose `'unique'` substring); `_applySignedUpSession`
  now **fail-closed** if the session didn't persist (localStorage blocked); period `<select>` selection
  preserved across the server refine; stale `PeriodE` comments corrected; multi-period dropdown +
  `openSignupModal` now tested. Verify the Railway proxy depth once live (log `req.ip`); 1 is correct for a
  single edge proxy.

## Teacher-tooling extension (2026-06-04) — onboarding · class gradebook · delete

**Teacher self-signup.** The signup modal gained an **"I'm a teacher"** checkbox → a Teacher-key
field. `POST /roster/claim` accepts optional `teacherKey`: if `=== getTeacherKey()` (env
`TEACHER_KEY`, **default `apstats2627`**) the account is created `role='teacher'`; wrong key → 403
`invalid-teacher-key`; absent → student. `db.insertRoster` gained a `role` param. **`getTeacherKey()`
+ `requireTeacher()` now accept the simple key as `x-teacher-secret` everywhere** (legacy
`ROSTER_TEACHER_SECRET` still works) — so `apstats2627` is the one teacher key. *Teacher-accepted
posture: that key unlocks all student data; rotate via `TEACHER_KEY` if it leaks.*

**Class gradebook (in-Desk).** A teacher **Class Gradebook** entry (Teacher menu + a Do-Now chip
gated on `_deskIsTeacher()`) opens `openClassGradebook()`: fetch `/class/grades?section=<teacher's
section>` with the teacher's Bearer token → a student `<select>` → `_selectClassStudent(idx)` renders
that student's gradebook by **reusing the My Gradebook modal**. The displayed gradebook is held in a
new **`_activeGradebook`** (decoupled from the Do-Now `_gradeGradebookCache`, so the class view never
clobbers the teacher's own grade chip). Load-failure shows a distinct message vs an empty class.

**Delete student.** `DELETE /roster/:studentId` (teacher-gated) + `db.deleteRoster` (maybeSingle →
404 vs 500; **400 on a malformed uuid**). The roster FKs are **ON DELETE CASCADE**, so this also
removes the student's `item_ledger` (work/grades), remediation, aliases. `teacher-roster-console.html`
got a **Delete** button + `deleteRow()` — confirm **fails CLOSED** (aborts if `window.confirm` is
unavailable) and warns that work/grades go too.

**Review:** 4-dimension adversarial pass — **0 high/critical**; all confirmed low/medium folded
(delete fail-closed, uuid-400, load-failure message, cache-decouple, + behavioral tests for
`openClassGradebook`/`_selectClassStudent`/delete-500/requireTeacher-empty-header/`TEACHER_KEY`
test isolation). Green: roster-server **811**, desk-my-gradebook 6, roster-console 25, desk-self-signup 41.

**Follow-up (fall-gated):** the class view binds to the teacher's own `section`; when real periods
replace the single `PeriodX`, add a section `<select>` (or omit the param) so a teacher can see all
periods — `/class/grades` already authorizes a teacher for any section.

## Known follow-ups (non-blocking)
- Section `PeriodX` → `sectionToPeriod` is `null` → grade due-dates use the B/E-**union** fallback,
  while the displayed schedule is E. For brand-new students with no history this is immaterial; if
  exact E due-dates are wanted later, make `sectionToPeriod('PeriodX')='E'` (monotonic: only raises).
- Abuse: open signup behind one NAT means a prankster could create junk accounts up to the per-IP cap;
  the teacher deletes junk via the roster tools. Tighten `SIGNUP_CLAIM_MAX` or add a class code if needed.
