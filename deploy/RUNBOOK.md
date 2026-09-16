# Algebra 2 deployment

Manual steps for the teacher, 2026-09-14. Repository: private
`robjohncolson/a2-live-worksheets`, branch `main`. Both Vercel and GitHub Pages are
required. This preparation has not created any cloud resources or applied SQL.

1. **Bootstrap the existing shared Supabase project.** Open Supabase → select the
   existing project → SQL Editor → New query. Paste the entire contents of
   `deploy/supabase_a2_bootstrap.sql` → Run. Do not create another project.
   Done: no SQL errors; Table Editor → schema selector → `a2` shows 19 tables,
   including `_bootstrap_migrations` with 24 rows. Every A2 table, view and RPC
   belongs in `a2`. The bootstrap pins RPC execution search paths too. All tables
   have RLS and only the service role receives data access. Re-running the script
   preserves data and skips applied migrations. Migration files remain the source
   of truth: regenerate with `node scripts/build-bootstrap-sql.mjs`. After applying
   a migration, add a new migration for future changes; do not edit an applied one
   (the bootstrap refuses changed checksums).

2. **Expose the A2 schema to REST.** Supabase → Project Settings → API (in newer
   dashboards, Data API) → Exposed schemas → add `a2` → Save. Preserve the other
   apps' entries. Done: `a2` appears in the saved list. Without this step REST
   cannot see A2 even with correct keys. See [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas).

3. **Create the Railway service.** Railway → existing workspace/project → New →
   GitHub Repo → `robjohncolson/a2-live-worksheets`. If absent, configure the GitHub
   app's repository access first. Name the service `a2-live-worksheets`. Service →
   Settings → Source → Root Directory: `roster-server`. Use `main`. Settings →
   Deploy: start command `node server.js`, healthcheck `/health` (also in
   `roster-server/railway.json`). Variables → Raw Editor: enter the variables below
   from `roster-server/.env.example`; never paste keys into browser files. Deploy.
   Settings → Networking → Public Networking → Generate Domain; copy the HTTPS URL.
   Done: deployment Active, logs say `roster-server listening`, and `<railway>/health`
   returns `ok: true`, `schema: "a2"`, and receipts enabled. Health is a liveness
   check; the signup/submission smoke below verifies REST access.

   | Variable | Value / generation |
   | --- | --- |
   | `ROSTER_SUPABASE_URL` | Shared project → Project Settings → API → Project URL. |
   | `ROSTER_SUPABASE_SERVICE_KEY` | Same project's API Keys → legacy `service_role` key; server only. |
   | `ROSTER_DB_SCHEMA` | `a2`. `public` causes startup refusal. |
   | `ROSTER_TOKEN_SECRET` | New independent value: `openssl rand -hex 32`. |
   | `ROSTER_TEACHER_SECRET` | New independent value: `openssl rand -hex 32`; use in the roster console. |
   | `TEACHER_KEY` | Set equal to `ROSTER_TEACHER_SECRET` so all teacher surfaces use the same credential. |
   | `ROSTER_PROCTOR_SECRET` | New independent value: `openssl rand -hex 32`. |
   | `ROSTER_PW_ENC_KEY` | New value: `openssl rand -hex 32`; retain securely. Rotation makes old recoverable password ciphertext unreadable. |
   | `RECEIPT_ISSUER_PRIVATE_KEY` | Run the Node command below and paste its single base64 line. Retain securely for receipts/transcripts. |
   | `PORT` | `8090` locally; use Railway's injected port in deployment, or explicitly `8090` with the generated domain targeting it. |
   | `WORK_MANIFEST_PATH` | Leave unset for the bundled `roster-server/data/work-manifest.json`. |
   | `USE_DISTRICT_FORMULA` | `true`. |
   | `USE_V3_GRADING` | `false`. |
   | `OPEN_SIGNUP_SECTIONS` | `PeriodC:Section C;PeriodD:Section D;PeriodG:Section G` (no surrounding quotes in Railway's individual value field). |
   | `CORS_ORIGINS` | Initially the example value; replace with actual origins in step 7. |

   Generate the receipt key on the teacher's computer (do not run in CI logs):

   ```sh
   node -e "const c=require('node:crypto'); const k=c.generateKeyPairSync('ed25519'); console.log(k.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))"
   ```

4. **Set the browser's service URL and push.** Replace the placeholder
   `https://a2-live-worksheets-production.up.railway.app` in `railway_config.js` and
   `roster_config.js` with the copied URL. Update the fallback literals in
   `railway_client.js` and `roster-client.js` to match, so missing config scripts
   still work. Alternatively, before those scripts on each page, load:

   ```html
   <script>
   window.A2_CONFIG = {
     ROSTER_SERVICE_URL: 'https://YOUR-ACTUAL-SERVICE.up.railway.app',
     RAILWAY_SERVER_URL: 'https://YOUR-ACTUAL-SERVICE.up.railway.app'
   };
   </script>
   ```

   This object contains URLs only. The teacher's existing local URL override can
   be cleared with `localStorage.removeItem('roster_service_url_override')` in the
   browser console. Push the reviewed changes to `main` using the normal repository
   workflow. Done: loaded pages' Network requests target the actual A2 service.

5. **Deploy Vercel.** Vercel → Add New → Project → Import Git Repository →
   `a2-live-worksheets` → Framework Preset: Other → Root Directory: `.` → Deploy.
   The committed `vercel.json` provides a static build; `/` serves `index.html`.
   Record the production URL (the requested project name is only a placeholder
   until Vercel assigns it). Done: Ready, landing page loads and
   `<vercel>/content/a2/` lesson assets load from their page links. Vercel is a
   required student host.

6. **Deploy GitHub Pages.** GitHub → repository → Settings → Pages → Build and
   deployment → Source: GitHub Actions. Actions → Deploy Algebra 2 Pages → Run
   workflow → `main` (future pushes run automatically). Done: green deploy job;
   its environment URL opens the landing page, normally
   `https://robjohncolson.github.io/a2-live-worksheets/`. The workflow stages the
   repository root using `.vercelignore`, keeping `content/`, `lib/` and `data/`.
   The private repo requires a Pages-eligible plan such as GitHub Pro; if Pages
   settings are unavailable, resolve that account requirement without changing the
   repo's privacy. See [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

7. **Finish CORS.** Railway → service → Variables → `CORS_ORIGINS`: enter the actual
   Vercel origin, GitHub Pages origin, and local development origins separated by
   commas; then deploy the variable change. Example:
   `https://a2-live-worksheets.vercel.app,https://robjohncolson.github.io,http://localhost:8080,http://localhost:8091`.
   Origins have no trailing slash or path: the GitHub origin excludes
   `/a2-live-worksheets/`. `server.js` passes this allowlist to `cors()`; only an
   unset variable permits wildcard access and logs a warning. An empty value
   permits no browser origins. Done: both hosts can call `/health` and authenticated
   endpoints without CORS errors; an unrelated origin receives no allow-origin header.

8. **Smoke both hosts.** Open `<host>/start-here.html` (include the repository
   prefix for Pages). Sign up a clearly named test student in Section C, retain
   its generated login, then open `desk.html` and `check.html?lesson=1-1`. Submit
   once. Return to Desk and confirm the lesson tile chip and My Gradebook update;
   reload to confirm persistence. Repeat from the other host using the same test
   login. Done: both hosts show the saved result. Teacher menu → Teacher Tools →
   Roster Console: authenticate with the teacher secret, locate the test student,
   delete it and confirm it disappears. Supabase → Table Editor → `a2` → `roster`
   can independently confirm deletion.

9. **Schoology dry-run on the A2 course.** The SY26-27 course IDs for PeriodC, PeriodD
   and PeriodG are in `SECTION_TO_COURSE_ID` in `tools/schoology_sync_section.py`
   (added 2026-09-15). Set `A2_SCHOOLOGY_COURSE_ID_PeriodC`, `_PeriodD`, or `_PeriodG`
   only to override them. In PowerShell at the repo root set
   `$env:ROSTER_TEACHER_SECRET='YOUR_TEACHER_SECRET'` locally.
   Keep the existing Edge CDP rig signed into Schoology, then run:

   ```powershell
   ./tools/daily_schoology_sync.ps1 -Section PeriodC -Base 'https://YOUR-ACTUAL-SERVICE.up.railway.app'
   ```

   Omit `-Live`: the wrapper defaults to `--dry-run`, reads course ID from the
   environment and stops if it is absent. In Schoology → course → Grade Setup,
   confirm the categories are exactly Assessments, Assignments, Engagement.
   Inspect `tools/.schoology-sync-logs/sync-PeriodC-*.log`: done means the A2 course
   ID is correct, the proposed components resolve to those three categories,
   no missing-category errors appear, and no grades or assignments were written.
   No live Schoology sync is authorized by this preparation.

## Rollback

Pause A2 first: Railway → `a2-live-worksheets` → Deployments → active deployment's
three-dot menu → Remove. Disconnect its GitHub source under Settings → Source to
prevent the next push from restarting it; keep its variables for recovery. Done:
no active deployment and the A2 URL stops responding. To resume, reconnect and
deploy the reviewed commit. See [Railway deployment actions](https://docs.railway.com/deployments/deployment-actions).

For an intentional full A2 reset, export any A2 data you need first. Supabase →
shared project → SQL Editor → New query → run exactly:

```sql
DROP SCHEMA a2 CASCADE;
```

This deletes A2 tables/functions/data and its bootstrap ledger. Never drop the
shared project or another schema. Do not create cross-schema dependencies on A2;
`CASCADE` removes dependants too. Remove `a2` from Exposed schemas after dropping
it. Done: `a2` is absent, the other apps' schemas remain. Reapply steps 1–2 for a
fresh empty A2 installation, restore the saved A2 data if needed, then redeploy.
