# ROSTER_TEACHER_TOOLS_TR1_BUILD.md — FROZEN CONTRACT

Sprint TR1 of `ROSTER_TEACHER_TOOLS_SPEC.md`. Roster-server password lifecycle.
Implement exactly this contract. **All changes additive; the live `/roster/verify` and
`/roster/enroll` behaviors are FROZEN except the two explicitly-noted additive deltas.**

## C1 — Migration `roster-server/migrations/0003_roster_pw.sql`

Additive only. Safe in the shared curriculum_render project. Never ALTER/touch other tables.

```sql
alter table roster add column if not exists password_cipher text;
alter table roster add column if not exists must_change_password boolean not null default true;
```

Idempotent. Existing rows inherit `must_change_password = true` (acceptable; real cohort not yet
enrolled, SMOKETEST rows are deleted by the existing cleanup chore).

## C2 — `roster-server/crypto.js` (new)

AES-256-GCM, Node `crypto` only, **never throws**.

- Key source: `process.env.ROSTER_PW_ENC_KEY`.
  - 64 hex chars → `Buffer.from(key,'hex')` (32 bytes). Otherwise → `sha256(key)` (32 bytes).
  - Absent/empty → crypto is **disabled** (best-effort; the live auth path must not break if the
    new env var is missing post-deploy).
- `encryptPassword(plain) -> string|null`
  - Disabled, or `plain` empty → `null`.
  - Else `"v1:" + b64(iv12) + ":" + b64(tag16) + ":" + b64(ct)`.
- `decryptPassword(blob) -> string|null`
  - Anything not a valid `v1:` blob, wrong key, tampered, or disabled → `null` (no throw).
- `cryptoEnabled() -> boolean` (for diagnostics/tests).

## C3 — `roster-server/db.js` (additive)

`createDb` returns `{ insertRoster, findByUsername, updatePassword, listRoster }`.

- `insertRoster({...,passwordCipher})` — insert also writes `password_cipher: passwordCipher ?? null`
  and `must_change_password: true`. **Select string unchanged** (`student_id, login_username,
  real_name, section`).
- `findByUsername(username)` — select string gains `, must_change_password` (nothing else changes).
- `updatePassword({ studentId, passwordHash, passwordCipher })` *(new)* —
  `update roster set password_hash=…, password_cipher=…, must_change_password=false
   where student_id=studentId` → `.select('student_id').single()` → `{data,error}`.
- `listRoster(section)` *(new)* — select
  `real_name, login_username, section, password_cipher, must_change_password, created_at`;
  if `section` truthy `.eq('section',section)`; `.order('section').order('created_at')` →
  `{data,error}` (data = array).

## C4 — `roster-server/server.js` (additive)

`import { encryptPassword, decryptPassword } from './crypto.js';`

- **Enroll (additive delta only):** after `bcrypt.hash`, compute
  `const passwordCipher = encryptPassword(password);` and pass `passwordCipher` to
  `db.insertRoster`. Response, status codes, retry loop, teacher-gate — all UNCHANGED.
- **Verify (additive delta only):** success response gains
  `mustChangePassword: !!data.must_change_password`. Everything else (generic 401, bcrypt compare,
  token mint, no-enumeration) UNCHANGED. Response still must not contain `hash`/`password_hash`.
- **`POST /roster/change-password` (new):**
  - Body `{ token, newPassword }`.
  - No/!token → 401 `{ok:false,error:"invalid token"}`. `verifyToken(token)` → studentId; null →
    401 same.
  - Missing `newPassword` or length < 6 → 400 `{ok:false,error:"newPassword must be at least 6 characters"}`.
  - `bcrypt.hash(newPassword,12)`, `encryptPassword(newPassword)`, `db.updatePassword(...)`.
    db error → 500 `{ok:false,error:"Database error"}`. Else 200 `{ok:true}`.
  - Response never contains `hash`/`password`/the new password.
- **`GET /roster/list` (new):**
  - Teacher-gated identically to enroll (`x-teacher-secret`; missing/wrong → 401
    `{ok:false,error:"forbidden"}`).
  - Optional `?section=`. `db.listRoster(section)`; error → 500 `{ok:false,error:"Database error"}`.
  - 200 `{ok:true, students:[{ realName, username, section,
    currentPassword: decryptPassword(row.password_cipher), mustChangePassword:
    !!row.must_change_password, createdAt: row.created_at }]}`. `currentPassword` is `null` when no
    cipher / decrypt fails / key absent (caller shows "(unavailable)").

Mount inline next to enroll/verify/resolve (core roster, not a separate concern). Routes use the
already-in-scope `db` and the imported `verifyToken` — they work under `createApp(db)` (the
auth.test.js harness) with no ledgerDb/manifest.

## C5 — `.env.example` + `README.md`

- `.env.example`: add `ROSTER_PW_ENC_KEY=` with the `openssl rand -hex 32` note + "server only,
  never client; rotating it makes existing `password_cipher` values unreadable (passwords still
  work — they re-encrypt on next change)."
- `README.md`: new "TR1 — password lifecycle" section: apply `0003`, set `ROSTER_PW_ENC_KEY`,
  redeploy, smoke (enroll → verify shows `mustChangePassword:true` → change-password → verify shows
  `false` + new pw works → teacher `GET /roster/list` shows current password).

## C6 — Tests (must all pass + full existing suite stays green)

- `tests/crypto.test.js` (new): round-trip; tamper→null; wrong-key→null; disabled (no env)→
  encrypt null & decrypt null; non-hex key still works (sha256 path).
- `tests/auth.test.js` (extend, do not weaken existing assertions):
  - Fake db: rows gain `must_change_password`/`password_cipher`; add `updatePassword`, `listRoster`.
    Set `process.env.ROSTER_PW_ENC_KEY` in `beforeEach`, delete in `afterEach`.
  - enroll → fake row has `must_change_password===true` and a non-null `password_cipher`.
  - verify (fresh) → `mustChangePassword===true`; body still has no `hash`.
  - change-password: bad/missing token→401; short newPassword→400; happy → 200, then verify shows
    `mustChangePassword===false`, new password works, **old password fails**.
  - `GET /roster/list`: no/wrong secret→401 forbidden; with secret → students[] with decrypted
    `currentPassword`, `mustChangePassword` flag; `?section=` filters.
  - Regression: every pre-existing enroll/verify/resolve assertion still passes unchanged.

## C7 — Guardrails

LF endings. ASCII. No new deps (Node `crypto` + existing `bcryptjs`). curriculum.js untouched.
Live auth path frozen (only the 2 additive deltas). After green: Codex focused review (method
norm — catches a real bug every sprint on this subsystem), then planner verify, then user handoff
(SQL + `ROSTER_PW_ENC_KEY` + redeploy + smoke). Commit only when the user asks.
