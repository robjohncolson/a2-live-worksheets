# Teacher -> Student Console Spec

> Status: DRAFT, session 112, 2026-05-23. The per-student contextual
> surface that's been talked about across sessions 109-111 but never
> drafted. Sibling to the Live Classroom v3 work (`LIVE_CLASSROOM_V3_SPEC.md`)
> -- shares the avatar-click hit-testing infrastructure but otherwise
> orthogonal. Absorbs the deferred Preview-as-student v2 (worksheet-level
> impersonation): the "View as" action here IS that feature.
>
> Builds on the existing roster-server teacher auth (`role='teacher'`,
> `feedback_live_classroom_self_directed.md`) and the Phase 4b
> remediation pipeline (`project_gradebook_grading_model.md`).

## 1. Problem

Today a teacher can SEE every student (the cockpit avatar board, the
`/class/grades` page, the per-day calendar modal), but the verbs are
section-wide -- there's no per-student surface for the four things that
matter in real classroom flow:

- **"What's this kid actually looking at right now?"** (curiosity
  diagnostic; requires impersonation)
- **"How's this kid doing -- summary + recent submissions"** (the
  20-second pulse check)
- **"Hey, you're voting on the wrong axis"** (the live coaching nudge,
  during avatar-based data modes)
- **"You're locked out of Lesson 6 by the gate -- I'm letting you in"**
  (the program-logic override)

The remediation_assignment infra (Phase 4b) gave the WRITE path for
formal remediation. This spec gives the surrounding lightweight surface
for everything the teacher does between those formal writes.

## 2. Goal / non-goals

**Goal**: a single contextual surface ("the Console") that a teacher
opens for ONE student at a time (or many for nudges), launched from
exactly two entry points: clicking the student's avatar in a Live
session, or clicking their row in `/class/grades`. Holds six actions:
View as (read-only impersonation), View grade, View recent submissions,
Send nudge, Apply remediation, Override lesson gate. Plus a
cockpit-side multi-select gesture for sending one nudge to many.

**Non-goals**:

- **No third entry point.** Do Now card, section roster page, schedule
  view -- none of them sprout a Console launcher. Two entry points only.
- **No voice / screen-share / peer-pair channel.** Per
  `feedback_live_classroom_self_directed.md`: classroom style is
  self-directed and ambient. Nudges are text-only, asymmetric in
  intent (teacher coaches, student replies briefly).
- **No nudge queue.** If the student is offline when a nudge fires, the
  nudge is DROPPED -- not stored for next-login delivery. The log row
  persists; the delivery does not.
- **No bulk impersonation.** View as is single-student only. Multi-
  select gesture is for nudges exclusively.
- **No Console for the teacher's OWN account.** Self-impersonation, in
  particular, is a no-op.
- **No `curriculum_render/data/curriculum.js` change.** Sacred (per
  `feedback_curriculum_render_sacred.md`).

## 3. Entry points

| Entry                       | Context     | Gesture                              | Opens                              |
|-----------------------------|-------------|--------------------------------------|------------------------------------|
| Cockpit avatar (Live)       | Live mode   | Single click on avatar sprite        | Floating popup menu                |
| Cockpit avatar (Live)       | Live mode   | Enter "Select Students" mode + click | Multi-pick + nudge bar             |
| `/class/grades` row         | Outside Live| Single click on student row          | Side drawer (Console)              |

The floating popup in Live and the side drawer in `/class/grades` show
the SAME six actions, just packaged differently for the surrounding
real estate.

## 4. The Console surface

### 4.1 Live-mode floating popup

Cockpit is already crowded (avatar board, doorways/gate panels, section
roster). A side drawer would crowd it further. Instead:

- Single click on an avatar sprite opens a small floating popup
  positioned next to the sprite (auto-flips to the other side near
  canvas edges so it never overflows).
- Contents: a header showing `[Real Name] (@username) -- Section X`,
  then the six action buttons in a vertical stack, then a Close (`x`)
  in the corner. ESC also closes.
- Buttons: `View as` / `View grade` / `View recent` / `Send nudge` /
  `Apply remediation` / `Override gate` (the last two only enabled when
  contextually relevant; see Sections 9 + 7.3).
- `View as`, `View grade`, `View recent` all OPEN A NEW TAB (full
  screen; the cockpit stays usable underneath).
- `Send nudge` expands the popup itself into a textarea + Send button.
- `Apply remediation` and `Override gate` open a small confirm modal
  (single screen, no tab switch).

### 4.2 `/class/grades` side drawer

Outside Live, real estate is fine -- `/class/grades` is a flat table.
Click a row: drawer slides in from the right (System 7 aesthetic
matching the rest of the Desk):

- Same header (real name + @username + section + a quarter-grade
  summary chip).
- Same six action buttons but with the inline "View grade" /
  "View recent" content rendered DIRECTLY inside the drawer (no tab
  open needed -- the table view is already a static review surface).
- `View as` / `Apply remediation` / `Override gate` still open
  tab/modal as in 4.1.
- `Send nudge` is disabled outside Live mode (the student isn't
  online; the nudge would drop per Section 6.3).

### 4.3 Real names everywhere in teacher view

A latent prerequisite for both 4.1 and 4.2: the cockpit + `/class/grades`
currently show usernames only. Teacher view must show `real_name` for
every student (cockpit avatar overhead label + drawer header +
grades-table row). The `roster` table already carries `real_name` as a
single TEXT column (since `0001_roster.sql`) -- NO MIGRATION NEEDED.

## 5. Action inventory

| Action                  | Live popup | Drawer  | Server endpoint                     | Spec section |
|-------------------------|------------|---------|-------------------------------------|--------------|
| View as                 | new tab    | new tab | (Desk -- query param + auth)        | 7            |
| View grade              | new tab    | inline  | `GET /teacher/student/:id/grade`    | 8            |
| View recent submissions | new tab    | inline  | `GET /teacher/student/:id/recent`   | 8            |
| Send nudge              | inline     | (disabled outside Live) | `POST /teacher/nudge` + WS `teacher_nudge` | 6 |
| Apply remediation       | modal      | modal   | (existing Phase 4b endpoints)       | 10           |
| Override lesson gate    | modal      | modal   | `POST /teacher/lesson-unlock`       | 9            |

## 6. Nudge channel

The session's most novel piece; the only feature that introduces a
bidirectional teacher <-> student channel.

### 6.1 Mechanics

- Free text BOTH directions, 280-char cap (enforced client + server).
- Teacher composes in the popup (Live) or in a global "Send to
  selected" bar (Select-Students mode -- Section 7).
- Server posts `POST /teacher/nudge` with `{ recipientUsernames: [],
  text }`. Server fans out a WS message `teacher_nudge` to each
  recipient's classroom socket; writes a row to `nudges_log` per
  delivered recipient.
- A nudge fired at an offline student is DROPPED (Section 6.3) -- the
  log row records `delivered_at = null` so the teacher can see "this
  one didn't land".

### 6.2 Student-side delivery

- The student's Desk listens for `teacher_nudge` on its existing
  classroom-board WS.
- On arrival: a small toast slides in from the top-right corner of the
  Desk, plays a soft single chime (re-use the TI-84 trainer's existing
  beep oscillator -- one short tone, mid-pitch).
- Toast contents: `Mr. Colson:` line + the nudge text + a 280-char
  reply textarea + `Reply` + `Dismiss` buttons.
- Auto-dismiss after 10 s of inactivity. Hovering over the toast pauses
  the auto-dismiss timer. Clicking Reply submits + dismisses.
- Reply mechanic: `POST /student/nudge-reply` -> `{ nudgeId, text }`
  -> server routes back to teacher socket(s) as `student_nudge_reply`
  -> cockpit shows a small toast over the student's avatar (Live) OR a
  badge on the drawer if the drawer is open.
- Reply rows write to the same `nudges_log` table with
  `direction='student'`.

### 6.3 Drop, don't queue

The non-goal in Section 2 ("no nudge queue") is load-bearing. If the
student is OFFLINE when the nudge fires:
- Server writes the `nudges_log` row with `delivered_at = NULL` (the
  log persists -- studies-of-the-feature use case from Q5 of the
  session-112 brainstorm).
- No WS fanout (the student has no socket).
- No catch-up on next login.

This intentional ephemerality matches the live-coaching intent.
Asynchronous communication is what the existing `/donow` task list and
the (future) e-mail-the-student channel are for.

### 6.4 Moderation

Free text both directions accepted. Cohort is small and known. NO
profanity filter, NO per-student rate limit in P3. (Reserved for
post-launch if a real incident surfaces; the rate-limit pattern from
roster-server's existing login endpoint is easy to drop in.)
Sole guardrail: 280-char cap, both directions.

## 7. View as (read-only Desk impersonation)

Absorbs `PREVIEW_AS_STUDENT_SPEC.md`'s deferred worksheet-level work.

### 7.1 Auth model

Cockpit / drawer click on `View as` opens
`/ap_stats_roadmap_square_mode.html?viewAsUserId=<username>` in a new
tab. The Desk's bootstrap inspects this param:

1. If `viewAsUserId` is present AND there's no teacher token in
   localStorage -> redirect to teacher sign-in.
2. If teacher token is present -> fetch `/teacher/student/:id/profile`
   with the teacher token (server validates `role='teacher'` and the
   target student belongs to a section the teacher administers).
3. On success, the Desk stores `viewAsContext = { username, readOnly: true }`
   in `sessionStorage` (NOT localStorage -- per-tab, so the teacher's
   own Desk in another tab isn't affected).
4. ALL existing `/donow`, `/grades`, etc. calls switch to teacher-
   authed `/teacher/student/:id/<resource>` variants for the duration
   of this tab's life.

### 7.2 Read-only UI

- Fixed top-of-page banner: `Viewing as <Real Name> -- read-only`
  with a high-contrast warning treatment (e.g., orange band). Banner
  is sticky so the teacher never forgets.
- All submit buttons / textareas / inputs disabled at the DOM level
  (an opacity + `disabled` attribute pass that the Desk runs on
  bootstrap when `viewAsContext.readOnly` is true).
- All client-side state writes (localStorage completion registry,
  `apstats_ws_completion`) are short-circuited: the Desk's write
  helpers no-op when `viewAsContext` is set.
- Server-side: the `/teacher/student/:id/*` write endpoints (e.g., a
  PATCH for completion) simply don't exist in P2. Adding them is an
  explicit future decision.

### 7.3 Write carve-out: Override gate

The single write the teacher CAN do inside View-as is to override the
lesson gate (Section 9). The banner's right edge gains an `Override
gate for this student` button; click opens the override modal
described in Section 9.

### 7.4 The session-108 Preview-as-student is the prior art

`PREVIEW_AS_STUDENT_SPEC.md` (shipped s108 as `73d311c`) flipped a
per-tab `sessionStorage` flag (`apstats_preview_as_student`) so the
teacher's own Desk behaved as a student would. This spec generalizes
that pattern: `viewAsContext` replaces the boolean flag with an
object carrying the target username + readOnly. The s108 menu item
remains for "preview the Desk as a generic student"; the new flow is
specifically "preview the Desk as STUDENT X with their data".

## 8. Grade + recent submissions

Two cheap pure-read endpoints:

### 8.1 `GET /teacher/student/:id/grade`

Returns a summary card. Reuses `roster-server/lesson-grade.js`:

```json
{
  "username": "jdoe",
  "displayName": "Jane Doe",
  "section": "PeriodX",
  "quarter": "Q4",
  "quarterGrade": 87.3,
  "quarterCeiling": 92.1,
  "lessonGrades": [
    { "lessonKey": "u6-l1-2", "grade": 91.0, "weight": 1.0 },
    { "lessonKey": "u6-l3", "grade": 83.5, "weight": 1.0 }
  ]
}
```

Rendered in the popup-opened tab OR inline in the drawer.

### 8.2 `GET /teacher/student/:id/recent`

Returns the last N submissions (default 20):

```json
{
  "submissions": [
    { "ts": "2026-05-22T14:01:00Z", "lessonKey": "u6-l3", "questionId": "WS-U6L3-Q4", "kind": "blank", "value": "0.45", "correct": true },
    { "ts": "2026-05-22T14:02:15Z", "lessonKey": "u6-l3", "questionId": "WS-U6L3-Q5", "kind": "frq", "verdict": "P", "appeals": 0 },
    ...
  ]
}
```

Both endpoints are reads; no migrations needed. The data already
exists in the existing roster-server tables.

## 9. Override lesson gate

The riskiest write (bypasses program logic). Sticky -- mirrors the
Phase 4b remediation lifecycle but lives in its own table since intent
differs (remediation = "you must do this extra work"; override = "I'm
unlocking what was locked").

### 9.1 Migration: `lesson_unlock` table

```sql
CREATE TABLE lesson_unlock (
  id BIGSERIAL PRIMARY KEY,
  student_username TEXT NOT NULL,
  lesson_key TEXT NOT NULL,
  unlocked_by TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (student_username, lesson_key)
);
```

`status` allows future revocation without losing history (`active`,
`revoked`). P5 only writes `active`.

### 9.2 Endpoint: `POST /teacher/lesson-unlock`

Body: `{ studentUsername, lessonKey, reason }`. Server checks teacher
role + target student exists in a section the teacher administers ->
upserts the unlock row. Returns the row.

### 9.3 Student-side lesson gate consults the unlock list

The Desk's lesson-gate-check (`_deskIsLessonLocked` -- the function
that decides whether to grey-out a lesson tile or block its panel) now
ALSO consults a new `/student/lesson-unlocks` endpoint at sign-in.
Locally cached in localStorage as `apstats_lesson_unlocks`. A lesson
present in the unlock list bypasses the gate logic that would
otherwise lock it.

### 9.4 Trigger UX

From inside View-as (Section 7.3) only. The teacher clicks a locked
lesson tile in the impersonated Desk; the gate-locked panel that
normally opens has a "Override gate for this student" button at the
bottom; click opens a confirm modal: `Unlock <lessonKey> for <Real
Name>? Reason: <textarea>`. On Confirm: POST + the gate clears for
that student on their next page load.

## 10. Apply remediation

Pure wiring to existing Phase 4b endpoints. The Console's "Apply
remediation" button opens a modal that calls the existing
`POST /remediation/propose` endpoint with the appropriate student +
the teacher's chosen lessonKey + reason. The remediation lifecycle
(propose -> approve -> complete -> waive) is unchanged.

No new endpoints. No migration. The work is purely UI -- a modal that
reuses the existing teacher-dashboard.html's remediation form, factored
out into a reusable component if useful, otherwise duplicated.

## 11. Select Students mode (cockpit)

The multi-pick gesture. Adds a "Select Students" toggle button to the
cockpit's left rail (near the existing Live / Doorways / Gate
controls).

- ON state: avatar sprites freeze (no `applyPos` updates render), get
  desaturated (CSS `filter: grayscale(0.7) brightness(0.85)`), and
  their overhead labels switch from `@username` to `Real Name`.
- Click an avatar: toggle inclusion in the multi-select. Selected
  avatars get a bright outline + a check mark over their head.
- A floating bar appears at the bottom-center: `Send nudge to <N>
  selected` + a textarea + Send button + Cancel.
- Send: same `POST /teacher/nudge` endpoint, with the array of
  selected usernames.
- Exit Select mode: Cancel button OR ESC -> avatars reanimate +
  recolor + labels revert.

Real names visible OUTSIDE Select mode too (Section 4.3) -- but they
revert to `@username` style in the cockpit overhead label position
when not in Select mode, since the overhead label is the only one
that's space-constrained.

## 12. Server contract summary

New endpoints (all teacher-auth required except `/student/*`):

| Endpoint                                  | Method | Purpose                                  | Phase |
|-------------------------------------------|--------|------------------------------------------|-------|
| `/teacher/student/:id/profile`            | GET    | Real name + section + role checks        | P1    |
| `/teacher/student/:id/grade`              | GET    | Quarter grade + lesson grades            | P1    |
| `/teacher/student/:id/recent`             | GET    | Recent submissions                       | P1    |
| `/teacher/student/:id/*` (read variants of /donow etc.) | GET | Teacher-authed read of student-Desk data | P2    |
| `/teacher/nudge`                          | POST   | Send free-text nudge to N recipients     | P3    |
| `/student/nudge-reply`                    | POST   | Student replies to nudge                 | P3    |
| `/teacher/lesson-unlock`                  | POST   | Add lesson to unlock list                | P5    |
| `/student/lesson-unlocks`                 | GET    | Read unlock list for current user        | P5    |

WS additions (ride the existing classroom WS):

| Message                | Direction        | Carries                              | Phase |
|------------------------|------------------|--------------------------------------|-------|
| `teacher_nudge`        | server -> student| `{ nudgeId, text, ts }`              | P3    |
| `student_nudge_reply`  | server -> teacher| `{ nudgeId, fromUsername, text, ts }`| P3    |

Migrations:

| Migration                          | Contents                       | Phase |
|------------------------------------|--------------------------------|-------|
| `0008_nudges_log.sql`              | `nudges_log` table             | P3    |
| `0009_lesson_unlock.sql`           | `lesson_unlock` table          | P5    |

(P1 has NO migration -- `roster.real_name` already exists per
`0001_roster.sql`.)

User-run in Supabase, same pattern as the v2.1 and Phase 4b migrations.

## 13. Phased rollout

| Phase | Workstream                                                                 | Touches                                                                 |
|-------|----------------------------------------------------------------------------|-------------------------------------------------------------------------|
| **P1** | Drawer infra + `/class/grades` row click + View grade + View recent + real names | follow-alongs `teacher-dashboard.html` (drawer + row click + real_name rendering); roster-server `teacher.js` (new file, 3 read endpoints); NO migration |
| **P2** | View as (full Desk impersonation, read-only, banner, disabled submits)     | follow-alongs Desk bootstrap + write-helper short-circuits; roster-server `/teacher/student/:id/*` read variants |
| **P3** | Nudges (cockpit popup + student toast + reply + `nudges_log`)              | follow-alongs cockpit (`teacher-classroom.html`) + Desk (toast component); roster-server endpoints; curriculum_render WS handlers + `nudges_log` migration |
| **P4** | Select-Students mode (multi-nudge)                                         | follow-alongs cockpit only (UI on top of P3 nudge plumbing)             |
| **P5** | Override gate (`lesson_unlock` table + View-as carve-out)                  | follow-alongs Desk (gate-check consults unlock list, View-as banner button); roster-server unlock endpoints + migration |

Each phase is one session's work via the proven loop (BUILD contract
-> parallel Sonnet -> Codex review -> fold -> commit). P1 + P2 are
client-heavy + thin server; P3 is the largest (introduces the
bidirectional channel + persistence); P4 is pure cockpit UX; P5 is
small but the riskiest write so the most planning per LOC.

Sequencing rationale:
- P1 establishes the drawer + the read endpoints; everything else
  reuses them.
- P2 unblocks both Viewing-as use cases (live curiosity + outside-Live
  review) before any write feature ships.
- P3's nudge channel is decoupled from P2's impersonation; could
  technically swap P2 <-> P3 if a real classroom incident needs nudges
  more urgently than impersonation.
- P4 strictly depends on P3 (it's a multi-recipient gesture on the
  P3 plumbing).
- P5 depends on P2 (the override is launched from inside View-as) but
  is otherwise independent.

## 14. Open decisions

1. **Drawer animation style.** Slide in from right (System 7 modal
   sheet) vs. fade in over the table. Freeze in P1 BUILD.
2. **Toast positioning + multi-nudge collision.** If the teacher sends
   5 nudges in 30 s and the student's Desk gets 5 toasts, do they
   stack? Replace? Freeze in P3 BUILD.
3. **Soft chime sound exact identity.** Re-use the TI-84 trainer beep
   oscillator config (specific Web Audio params), or define a
   one-purpose tone? Freeze in P3 BUILD.
4. **`nudges_log` retention.** P3 ships with no cleanup. Add a
   30-day-then-archive cron? Out-of-scope for P3; revisit if size
   becomes a Supabase storage concern.
5. **Override-gate revocation UX.** P5 writes only `status='active'`.
   A revoke surface (teacher clicks "remove override" in some yet-
   unknown view) is deferred. Add to P5 BUILD or split out.
6. **Selected-state persistence across cockpit refresh** in Select
   Students mode. Probably not -- a refresh exits Select mode --
   matches existing cockpit reset behaviour. Freeze in P4 BUILD.

## 15. Out-of-scope

- **Teacher-to-section-wide broadcast nudge.** "Send to entire Period
  B" without picking individuals. Easy server-side (one extra endpoint),
  but the UX is different enough (no Select-Students freeze gesture)
  that it gets its own spec if requested.
- **Student-initiated DM ("Ask question" button on the Desk).** The
  current spec has students REPLY to nudges but never INITIATE. If
  classroom usage surfaces a need (a student stuck during Live wants
  to flag the teacher without raising hand), spec it separately.
- **Nudge editing / deletion.** Sent is sent; the log row stands.
- **Per-student colour coding of nudges.** All nudges in the cockpit
  look the same; no per-recipient theme.
- **Teacher-side nudge history view.** The `nudges_log` is written but
  there's no UI to browse it in P3. A future "Nudge history for
  <student>" tab inside the Console is a natural extension; defer.
- **Console for the teacher's OWN account.** Self-impersonation is
  explicitly a no-op.
- **Console launched from Do Now card / section roster / schedule
  view.** Two entry points only (Section 3).

## Recall on freeze

When ready to implement a phase, the proven loop:

1. Pick the phase (P1 / P2 / P3 / P4 / P5).
2. Freeze a `TEACHER_STUDENT_CONSOLE_P{n}_BUILD.md` contract that
   quotes the verbatim source text for every observable symbol +
   endpoint shape + WS message shape.
3. Dispatch parallel Sonnet units on disjoint files; planner-direct on
   contended files (the Desk, the cockpit HTML).
4. Codex read-only review with a 600 s timeout; fold every finding.
5. Planner-verify on disk + run vitest (roster-server + root +
   curriculum_render if WS changed) + smoke a known-good scenario
   (real student account in a real Live session for P3+).
6. Stage own paths only; commit via `git commit -F-` heredoc; push.

Sibling work that does NOT block this:

- The Live Classroom v3 P3.1 deferred MAJOR fold (DC <-> WS split-brain
  relay) stays parked unless real-classroom usage surfaces it.
- v3 P4.1 doorway polish (theming, >8 doorways, blind voting) stays
  parked.
- Additional v3.x data modes (sliders, 2D-axes, sampling-distribution-
  live, CI coverage) are independent; they don't share code paths with
  the Console.
