# Algebra 2 roster server

Express service for roster identity, sign-in and self-signup, sessions, signed
receipts, the unified ledger, lesson grades, teacher gradebook views, Do Now,
worksheet diagnostics, misconceptions and remediation, Blooket imports,
flashcard commits, review, and snapshot/restore.

## Deployment

Create separate Algebra 2 Railway and Supabase projects. Do not reuse the Algebra 2
service URL, database, tables, or secrets. Apply the surviving migrations in
numeric order to the new database. Table RLS is enabled with service-role access;
student isolation and teacher authorization are enforced by the server.

Set Railway's Root Directory to `roster-server`, install dependencies with
`npm ci`, and start with `npm start` (`node server.js`). Railway supplies
`PORT`; local development defaults to 8090. Bundle the server's `data/` directory.
The sibling shared modules used by this snapshot must also be available to the
build; Phase 2b owns their packaging and removal of obsolete client features.

Configure server-only variables:

| Variable | Purpose |
|---|---|
| ROSTER_SUPABASE_URL | New Algebra 2 Supabase project URL |
| ROSTER_SUPABASE_SERVICE_KEY | Service-role database credential |
| ROSTER_TOKEN_SECRET | Session signing secret |
| TEACHER_KEY / ROSTER_TEACHER_SECRET | Teacher authorization |
| ROSTER_PROCTOR_SECRET | Authorization for retained proctored evidence |
| RECEIPT_ISSUER_PRIVATE_KEY | Optional signed receipt issuer key |
| USE_V3_GRADING | Set to true to select the retained two-track engine |

Keep credentials server-side. After deployment, check `GET /health`, teacher
enrollment, student sign-in, ledger writes, grades, and teacher class views.
Update the client service URL during the deployment phase.

## Transitional grading data

Phase 2a preserves the SY26-27 quarter dates and the `useV3` flag. The AP-specific
tracks are removed. The remaining work blend is transitional; Phase 3 introduces
Assessments 50 / Assignments 40 / Engagement 10. The mastery input currently stays
absent, while the pure two-track combiner and its gates remain tested.

Answer keys, skill mappings, lesson schedules, and Blooket topic lists are empty
valid fixtures awaiting A2 content. Retained diagnostic and worksheet authoring
bundles still need curriculum replacement in a later phase.

## CORS

CORS is currently broad through `app.use(cors())`. Protected endpoints still
require authentication. See [the CORS deployment note](docs/cors.md) before
restricting origins; verify every retained browser client after a change.

## Class Log observer cards

The Class Log phone app (`school/class-log`, contract in its
`OBSERVER_CARD_DB_SPEC.md`) reads each block's observer card from this server.

1. Migrations: in the Supabase SQL editor run `SET search_path TO a2;`, then
   `migrations/0041_observer_cards.sql` (tables `observer_cards` and
   `observer_card_outcomes`) and `migrations/0042_observer_cards_unique.sql`
   (one card per day/course/section even when section is null, and an
   `updated_at` bump trigger), then `NOTIFY pgrst, 'reload schema';`.
   `deploy/supabase_a2_bootstrap.sql` includes both for fresh projects.
2. Env: set `CLASS_LOG_TOKEN` on Railway (`openssl rand -hex 32`) and paste the
   same value into the phone's Settings as the Cards token. Unset, the phone
   routes answer 503.

| Route | Auth | Does |
|---|---|---|
| `GET /class-log/cards?date=YYYY-MM-DD` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | `{date, cards}` with every row for the day. Strong `ETag`: `"empty"` for no cards, otherwise `"<count>-<16 hex>"`, a sha256 of every column of every row (sorted by id), so any edit, including a hand edit in the SQL editor, an insert or a delete changes it. Only an exact `If-None-Match` gives 304; a `W/` prefix is ignored because the compression layer weakens the tag on the wire (`*` and list forms get the 200). `Cache-Control: no-cache`. |
| `POST /class-log/cards/:id/outcome` | same bearer | Body `{section, ran, at, device}` (`at` null or `HH:MM`, `device` defaults to `s24`); upserts on (card, section, device); `{ok: true}`. 400 bad body, 404 unknown card. |
| `PUT /teacher/cards` | teacher (`x-teacher-secret` or teacher token) | Array of cards without `id`; upserts by (date, course, section), writing only rows whose content changed, so unchanged pushes keep `updated_at` and the ETag. `{ok, written, unchanged}`. |

Wrong or missing bearer token: 401 with no body. The phone routes are mounted
before the app-wide JSON parser: auth runs first, then a 64 KB route parser, so
bad JSON gives `400 {ok:false,error:"bad_json"}` and an oversize body
`413 {ok:false,error:"too_large"}` (no stack). `PUT /teacher/cards` sits behind
the password gate like the other teacher routes, so the app-wide parser applies there.

Limits (characters, not bytes; 400 before storage): section 16, device 32,
title 200, lesson 32, frame 500, body 4000; minutes an integer 1-180; course
`algebra2`/`apstats`; at most 500 cards per PUT. The rules live in
`observer-card-rules.js`, shared with the push script.

Authoring: a `content/a2/day-log.json` entry may carry an `observerCard`
(date, section and lesson come from the entry; section `all` or none means every
section that day):

```json
{ "date": "2026-10-21", "section": "G", "lesson": "1-3", "plan": "...",
  "observerCard": { "title": "Which graph matches the table?", "mode": "whiteboards",
    "minutes": 8, "frame": "I chose ___ because ___.",
    "body": "## Prompt\n\nShow the table; boards up on 3." } }
```

Modes: `whiteboards`, `ipad`, `poster`, `pairs`, `jam`, `other`. Then run
`node scripts/push-observer-cards.mjs [--from YYYY-MM-DD] [--dry-run] [--server URL] [--secret S]`
from the repo root (teacher secret resolved like the other Desk scripts; server
error text is redacted and truncated before printing). It is idempotent and safe
in a cron.

The session JSON the phone publishes (`sessions/<date>/<section>.json` in the
data repo) now carries `observerCard.id` (the `observer_cards` row id), not a
`cards/...` file path.

## Class Log summaries

After the phone publishes a lesson summary (`school/class-log/POLISH2_SPEC.md`,
WP-C) it posts it here so the Desk can read what landed, what students asked,
what was promised and what to prep next.

1. Migration: in the Supabase SQL editor run
   `migrations/0043_class_summaries.sql` (table `a2.class_summaries`, primary key
   (date, course, section), RLS on, service role only; every name is
   schema-qualified, so no `SET search_path` is needed), then
   `NOTIFY pgrst, 'reload schema';`. Until it runs, both routes answer 503 and
   the phone retries. `deploy/supabase_a2_bootstrap.sql` includes it.
2. Env: none new. The phone uses the same `CLASS_LOG_TOKEN` as the observer
   cards (its Cards URL and token settings).

| Route | Auth | Does |
|---|---|---|
| `POST /class-log/summaries` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | Body `{date, course, section, model, markdown, landed, studentQuestions, promises, nextPrep, transcriptPath, summaryPath}`; upserts on (date, course, section), replacing the whole row and stamping `recorded_at`; `{ok: true}`. 400 bad body. |
| `GET /teacher/summaries?from=YYYY-MM-DD&to=YYYY-MM-DD` | teacher (`x-teacher-secret` or teacher token) | `{from, to, summaries}`: rows with `from <= date <= to` (both required, at most 62 days inclusive), ordered by date, section, course, in the POST body's camelCase shape plus `recordedAt`. |

Wrong or missing bearer token: 401 with no body; `CLASS_LOG_TOKEN` unset: 503.
The phone route is mounted before the app-wide JSON parser with a 1 MB route
parser (enough for every field at its limit in 4-byte characters), so bad JSON
gives `400 {ok:false,error:"bad_json"}` and an oversize body
`413 {ok:false,error:"too_large"}`. Storage errors, including the missing table,
give 503 with no details.

Limits (characters, not bytes): course `algebra2`/`apstats`; section 1-16
(trimmed); model up to 64 (optional); markdown required, up to 40 000; each of
`landed`, `studentQuestions`, `promises`, `nextPrep` an array of up to 40
strings of up to 400 (trimmed, blank items dropped, missing means `[]`);
`transcriptPath`/`summaryPath` up to 200 (optional).

## Verification

Run `npx vitest run` from this directory. Tests use injected databases; PostgreSQL
migration tests use PGlite. A DB-free import is supported with NODE_ENV=test.
Production startup requires the configured Supabase project.

See [golden-master.md](docs/golden-master.md) for fixture regeneration commands.
