# FRQ Grade Tickets — rollout runbook (SY2627)

**For the teacher.** Phase 2 (`FRQ_GRADE_TICKETS_SPEC.md`) is fully implemented and deployed
**dormant**: nothing changes for students until you flip the env vars below. Each stage is one
env change on Railway, is independently reversible, and the single rollback switch is always
`FRQ_GRADE_MODE=off`.

What it does once live: reflection grades become **server-owned** — the browser can no longer
author a score (closing the hole where a signed-in student could POST `score:1`), a closed
laptop / dead Wi-Fi never loses a grade (the ledger row itself is the ticket; a worker inside
roster-server grades it within seconds), and students see honest live status
("✓ Saved · queued for grading" → "⏳ Grading… ~9 s" → verdict, or "✓ Graded while you were away").

---

## Stage 0 — DONE (in this push; no action)

- Code deployed on both Railway services, **flag off**, behavior identical to yesterday.
- Verify after deploy: `https://roster-production-12c1.up.railway.app/health` shows
  `frq: { mode: "off", ... }` and
  `https://curriculumrender-production.up.railway.app/health` shows `aiGradeAuth: "off"`.

## Stage 1 — run the migration (5 min, safe anytime)

1. Supabase dashboard → the **curriculum_render project `<AP_SUPABASE_PROJECT_REF>`** → SQL editor.
   (That project hosts ALL roster tables — `roster`, `item_ledger`, `trainer_state` — per
   GRADEBOOK_SPEC §6.1 / roster-server/README.md; `<AP_SUPABASE_PROJECT_REF>` is only the
   roadmap/driller/lesson_urls project and has no `item_ledger`.)
2. Paste + run **`roster-server/migrations/0031_frq_tickets.sql`** (whole file; re-running is safe).
   Lock impact: adds columns (metadata-only) + two small partial indexes — seconds.
3. Nothing changes at runtime yet; roster `/health` keeps `mode: "off"`.

## Stage 2 — secrets + shadow mode (one evening)

Railway env:

| Service | Variable | Value |
|---|---|---|
| roster-server | `FRQ_GRADE_MODE` | `shadow` |
| roster-server | `FRQ_GRADER_URL` | `https://curriculumrender-production.up.railway.app` |
| roster-server | `ROSTER_GRADER_SECRET` | a fresh long random string (e.g. `openssl rand -hex 32`) — `FRQ_GRADER_SECRET` also accepted |
| curriculum render | `ROSTER_GRADER_SECRET` | the **same** string |

Shadow: students still get the current client-side grading, **no grade is written by the server**;
the worker re-grades a sample server-side and counts agreement. Check
`/health` → `frq.worker` counters: `shadowCompared / shadowExact / shadowOneBand / shadowTwoBand`.
**Gate to proceed:** ≥100 compared, zero `shadowTwoBand` (an E↔I disagreement blocks — tell Claude),
exact ≥95%.

## Stage 3 — authoritative canary (a day)

- roster-server: `FRQ_GRADE_MODE=authoritative`, `FRQ_CANARY_STUDENTS=<your studentId>`
  (your teacher account's studentId — comma-separate to add a test student).
- Open a worksheet as that account: type a reflection, blur → watch
  "✓ Saved · queued for grading" → verdict in seconds. Try airplane-mode mid-save (it should say
  "Saved on this device…" and recover), and an appeal.

## Stage 4 — everyone + grader lockdown

- roster-server: `FRQ_CANARY_STUDENTS=*`
- After a normal class day: curriculum render `AI_GRADE_AUTH=log` (observe `/health`, no rejects),
  then a day later `AI_GRADE_AUTH=enforce` (blocks anonymous grader abuse; students' pages already
  send their roster token).

## Rollback (any time, one switch)

- roster-server `FRQ_GRADE_MODE=off` → pages return to today's client-side grading on their next
  config check (≤60 s), pending tickets stay saved and the hourly sweep still grades them.
  No data rollback needed — every write is raise-only.
- curriculum render `AI_GRADE_AUTH=off` independently reverts the grader lockdown.

## Standing safety nets (unchanged)

- Hourly GitHub Action + your systemd timer still sweep null-score rows (now via the committed
  server rubric bundle, with stale-edit rows correctly skipped, and they FAIL RED on real errors).
- The signed nightly backup and receipts are untouched; claim/lease metadata is deliberately
  outside backups.

## If something looks wrong

`/health` → `frq` block: `mode`, `bundle` digest, `worker` counters (`applied`, `floorHeld`,
`stale`, `failed`, `tickErrors`, `lastTickAt`). Screenshot that + the student symptom and hand it
to Claude. `FRQ_GRADE_MODE=off` first if grades are visibly wrong; it cannot lose anything.
