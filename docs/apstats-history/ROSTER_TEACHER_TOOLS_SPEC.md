# ROSTER_TEACHER_TOOLS_SPEC.md

**Status: TR0–TR4 all implemented (2026-05-19). §3 security model SIGNED OFF (reversible/encrypted).
TR0+TR1 committed `92a0f46`; TR2–TR4 committed next. TR1 awaits the user deploy handoff (§5).
Codex: TR1 SHIP; TR2 BLOCKED→fixed→re-review SHIP.**
Brainstormed 2026-05-19. Builds on the live Phase 0 roster service (see `GRADEBOOK_PHASE0_BUILD.md`,
`roster-server/README.md`). This spec adds the **teacher-facing** layer that Phase 0 never built:
enrolling a class, handing out usernames, and recovering student logins.

---

## 1. Problem

Phase 0 built all the plumbing (auth, tokens, ledger, Do Now) but **no teacher console**. Today the
only ways to create student accounts or see who is enrolled are raw `curl` against
`POST /roster/enroll` or reading the Supabase `roster` table by hand. A teacher cannot realistically
enroll a class of 30 this way.

Key facts about the existing system (do not relitigate):

- **Usernames are server-generated** (`fruit_animal`, e.g. `coconut_shark`). The teacher does **not**
  choose them. Enroll input is `{ realName, section, password, email? }`; the response carries the
  generated `username`.
- Enroll is gated by the `x-teacher-secret` header (`ROSTER_TEACHER_SECRET`, in the gitignored
  `roster-server/.env`).
- Sign-in is `POST /roster/verify { username, password }` → session token. The Desk modal already
  reads username + password.
- `section` is free text the teacher picks per class (e.g. `PERIOD3`, `SY26-27-B`). Indexed
  (`roster_section_idx`) for teacher-by-class queries.

## 2. Decisions (teacher-answered 2026-05-19)

- **D-T1 — two tools, both run locally.**
  1. `scripts/teacher-roster.mjs` — Node CLI: bulk-enroll from CSV/paste, single-add, and
     (after TR1) roster export. Reads the secret from `roster-server/.env`; nothing exposed.
  2. `teacher-roster-console.html` — a browser console for day-to-day use (enroll, view roster
     by section, reset a password). **Local-only.** It is *not* linked from any student page and
     the teacher secret is **typed at runtime** (held in `sessionStorage` only, never committed).
     Carries the same red "do not deploy publicly" banner as `teacher-code-generator.html`.
- **D-T2 — default password + forced change + teacher-visible current password.** Enroll sets a
  **default password** and `must_change_password = true`. On first sign-in the Desk forces a
  change-password step. The teacher can always see the student's **current** password (the default
  until changed, then whatever the student set) — for login recovery.
- **D-T3 — roster input: both** bulk (CSV / pasted name list) and one-at-a-time.
- **D-T4 — bulk source: both** a start-of-term class paste/CSV and single-add for latecomers.

## 3. ⚠ Security decision forced by D-T2 (teacher: confirm or veto)

"The changed password is shown to the teacher" **cannot be done with a one-way hash alone.** Phase 0
deliberately stores only a bcrypt hash (§6.2 — it explicitly *fixed* a plaintext-password
anti-pattern in a reference impl). A teacher-visible *current* password requires storing the
password **reversibly**. This spec reverses that stance, narrowly and on the record:

**Chosen mechanism (least-bad): encrypted-at-rest, teacher-gated.**

- A new column `password_cipher` stores the current password encrypted with **AES-256-GCM**.
- The key is a new **server-only** env var `ROSTER_PW_ENC_KEY` (Railway only; never in git, never in
  any client file, never sent to a browser). A Supabase/DB dump **without the Railway key does not
  reveal any password**.
- The existing bcrypt `password_hash` stays the **sole** auth path — `/roster/verify` is unchanged
  except for one added response field. `password_cipher` is *only* read by the teacher-gated
  `GET /roster/list`. Both columns are updated together on enroll and on change-password.
- This is for low-stakes classroom **practice** accounts (names only; no SSN/grades-of-record in
  `roster`). The teacher legitimately needs login recovery for minors, as Google Workspace / most
  K-12 tools allow.

**Rejected alternative (offered, not chosen):** teacher *reset-only* — teacher can reset a student
to a new password and sees only the password the teacher just set, never the student's chosen
secret. This keeps pure one-way hashing.

**✅ SIGNED OFF 2026-05-19:** teacher chose **reversible (encrypted)** — the chosen mechanism above
is final. Reset-only is NOT being built. This is the recorded, deliberate narrow reversal of
Phase-0 §6.2 for classroom login recovery.

## 4. Endpoints (TR1 — all additive; live auth path otherwise frozen)

| Method/Path | Auth | Body / Query | Result |
|---|---|---|---|
| `POST /roster/enroll` *(amended)* | `x-teacher-secret` | `{realName,section,password,email?}` | unchanged response **+** sets `must_change_password=true`, writes `password_cipher` |
| `POST /roster/verify` *(amended)* | none | `{username,password}` | unchanged **+** `mustChangePassword:boolean` |
| `POST /roster/change-password` *(new)* | session token | `{token,newPassword}` | re-hashes, re-encrypts, clears flag → `{ok:true}` |
| `GET /roster/list` *(new)* | `x-teacher-secret` | `?section=` (optional) | `[{realName,username,section,currentPassword,mustChangePassword,createdAt}]` |

`/roster/list` returns plaintext-equivalent passwords → it is **teacher-gated only** and the console
that calls it must stay local-only (D-T1).

Migration `0003_roster_pw.sql` (additive, idempotent, safe in the shared curriculum_render project —
never ALTERs other tables): `add column if not exists password_cipher text`,
`add column if not exists must_change_password boolean not null default true`.

## 5. Sprint plan

| Sprint | Scope | Server change? | Handoff |
|---|---|---|---|
| **TR0** | `scripts/teacher-roster.mjs` enroll mode vs **existing** `/roster/enroll` + sample CSV | none | none — usable immediately |
| **TR1** | `0003` migration, enc util, `change-password`, `list`, `verify` flag, enroll amend; tests + Codex review | yes | user: run SQL, set `ROSTER_PW_ENC_KEY`, redeploy + smoke |
| **TR2** | Desk forced change-password modal when `mustChangePassword` | none (client) | none |
| **TR3** | `teacher-roster-console.html` (local-only): enroll / view roster / reset | none | none |
| **TR4** | `teacher-roster.mjs` roster-view/export mode (uses `/roster/list`) | none | none |

TR2/TR3/TR4 depend on TR1. TR0 is independent and ships first.

**TR0 bridge caveat:** until TR1 deploys, "must change" and teacher-view-current are not enforced
server-side. The credentials sheet TR0 writes **is** the authoritative record of the default
passwords for that run. Acceptable interim.

## 6. Acceptance

- **TR0:** `node scripts/teacher-roster.mjs --help` documents usage; `--dry-run` parses a class CSV
  with zero network calls; a live `--section SMOKETEST` enroll returns a username and writes a
  correctly quoted credentials CSV; the SMOKETEST row folds into the existing
  `delete from roster where section='SMOKETEST';` cleanup chore.
- **TR1:** new endpoints contract-tested; `roster-server` full suite (auth/token/ledger/donow) stays
  green (live auth path proven unchanged); production smoke per `roster-server/README.md`.
- **TR2:** a `must_change_password` student is forced through the modal before any Desk feature;
  existing sign-in (DN2c) regression-tested; Desk EOL stays LF.
- **TR3/TR4:** roster view shows current passwords per section for the teacher only.

## 7. Method & guardrails

Standard gradebook method: freeze contract → planner implement → Codex focused review → planner
verify on disk → tight per-repo commit. `roster-server` is **LF**; the Desk is **LF**; older
U1–U3/U8–U9 worksheets are CRLF (not touched here). curriculum.js stays sacred (untouched).
`roster-server` changes hit the **live** auth service that Phase 0/1/DN1 all depend on — every
change additive, `/roster/verify` and `/roster/enroll` logic otherwise frozen, full regression
before the user-driven redeploy.
