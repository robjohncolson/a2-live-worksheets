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

## Verification

Run `npx vitest run` from this directory. Tests use injected databases; PostgreSQL
migration tests use PGlite. A DB-free import is supported with NODE_ENV=test.
Production startup requires the configured Supabase project.

See [golden-master.md](docs/golden-master.md) for fixture regeneration commands.
