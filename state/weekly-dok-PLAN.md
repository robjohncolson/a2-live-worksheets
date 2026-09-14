# Weekly DOK implementation plan

Date: 2026-09-12
Starting branch: master
Starting HEAD: 9b09bfba
Status: complete; four local commits, no push, no apply run, no task registration. See weekly-dok-verification.json.

## Four intended commits

1. Add scripts/weekly-dok.mjs, tools/weekly_dok.ps1,
   tools/weekly-dok-author-prompt.md, selection/orchestration tests, and this plan.
2. Add the bundled triage file, Screen Time back-fill, server triage/recurrence
   behavior, and server tests.
3. Add dashboard Status cells and untriaged-first ordering; refine the existing
   remediation target strip and extend its DOM tests.
4. Document weekly operation and the task registration command; record all suite
   results and the live dry-run brief in state/weekly-dok-verification.json.

Never push during implementation, execute --apply, or register the scheduled task.
Preserve unrelated working-tree changes. Use TEMP or test-results for scratch.
Normalize every touched text file to LF before each commit and run GitNexus
detect_changes on the staged scope before committing.

## Module layout

- scripts/weekly-dok.mjs: top-level constants (4 students, 5 labels, 14 days,
  3 weekly runs); pure merging, ranking, clustering, privacy-safe brief generation,
  triage updates, and orchestration. Inject fetch, clock, filesystem, Codex,
  validation, compilation, tests, and Git boundaries.
- tools/weekly_dok.ps1: dry-run default, explicit apply mode, apply logs under
  tools/.weekly-dok-logs, registration-command printing without registration.
- tools/weekly-dok-author-prompt.md: exact schema reference, complete forbidden
  phrase list, fresh-context requirement, four laddered parts, printed resources,
  and teacher-only E/P/I scoring of (d). Include all active/archived stem contexts
  at runtime. Author must never commit or push.
- roster-server/data/misconception-triage.json: versioned entries and weekly run
  history with timestamps and qualifying post-triage top-15 keys.
- roster-server/misconceptions.js: decorate frequent/class rows with triage and
  recurrence, retaining existing counts and persistence rules. Rank post-triage
  events using the full event collection, not the capped evidence excerpts.
- roster-server/class.js: load bundled triage through an injectable boundary for
  the authenticated endpoint.
- teacher-dashboard.html: textContent-only status cells and target descriptions.

## Selection pseudocode

    read the teacher secret at runtime without printing it
    fetch PeriodB and PeriodE frequent lists for the 14-day window
    merge by key: sum section-distinct student/event counts; union lessons/skills
    project evidence into item IDs and text only; remove roster names/identifiers
    load triage and back-fill Screen Time keys from its actual YAML metadata
    exclude triaged keys unless recurringAfterTriage is true
    sort by students descending, events descending, key ascending
    if no lead or lead.students < 4: report "below floor" and exit successfully
    select lead
    prefer remaining labels sharing a same-unit, adjacent NEW-CED topic with lead
    fill remaining places by rank, up to five labels total
    derive ordered topics and sheet key; reject existing artifact/key collisions
    render date, key, labels, counts, lessons, skills, <=3 excerpts each, house rules
    dry-run: print brief, write nothing, invoke neither author nor publishing
    apply: author exactly one sheet; validate; compile; run DOK tests
    check artifact scope, privacy, metadata, LF endings, and unchanged existing files
    update triage only after successful checks; stage the explicit artifact allowlist
    publication transaction: restore triage on pre-commit failure; retain/report commits on push failure

Recurring-run history must distinguish qualifying and nonqualifying observations,
deduplicate repeated invocations within a week, and reset after re-triage. Successful below-floor apply runs save weeklyRuns locally without publishing.
History-only triage changes are allowed at the next preflight and ship with the
next successful sheet. Failed builds restore the pre-run triage document.

## Mocked boundaries and verification

- Fetch: sections, window, authentication header, HTTP errors and malformed payloads.
- Clock: local run date, scheduling guard, weekly deduplication, recurrence streaks.
- Filesystem: dry-run zero writes; artifact collisions; exact writes; LF bytes;
  failed-build triage immutability; archive/existing-sheet preservation.
- Codex: pinned model/effort/arguments, stdin prompt, nonzero exit, unauthorized edits.
- Validator/compiler/tests: failure at each step must prevent staging/commit.
- Git: clean allowed paths and index preflight, exact staging allowlist, pre-commit
  scope check, commit failure, approval marker, push failure/uncertain remote result.
- Selection tests: cross-section merge, exclusion, recurrence, floor, cluster
  preference, cap, deterministic ties, brief completeness, and name redaction.
- Server tests: null/present triage, post-triage-only top-15 eligibility, three
  consecutive weekly runs, broken streaks, untriaged-first ordering, auth/cache.
- DOM tests: three status states, red recurrence, correct column spans, safe text,
  default order, and target strip contents.
- Python: weekly-auto provenance validates under the existing validator.
- Required final suites: focused weekly/dashboard/active Vitest; roster-server
  npm test; pytest tests/test_dok_build.py -q; root npm test with named baseline
  failures; node scripts/weekly-dok.mjs --dry-run against the live endpoint.

## Exploration evidence

GitNexus impact for computeMisconceptions reported LOW risk, four direct callers,
and two affected process groups (mountClass and mountReview). Direct callers also
include scripts/smoke-misconceptions.mjs and a test-results diagnostic script.
Further impact checks are required before editing mountClass or dashboard symbols.
The dashboard already renders each remediation sheet's target keys.
Installed codex exec --help confirms --approve-for-me is supported.

## Corrected publication transaction

Build and stage failures restore triage and clear only the job's staged paths.
Push failures retain and report the commit. Apply and push-only fetch first,
rebase pending weekly commits if needed, and publish those before selection.
Dry-run performs no Git writes or push recovery.

Weekly observations are deduplicated by calendar week. Below-floor apply runs
need to preserve observations so recurrence can become eligible even when all
labels are already triaged. The bundled history must also reach the endpoint.
Successful below-floor apply runs save history locally without publishing; the
next successful sheet carries that history to the bundled endpoint. Dry runs
never save observations. No extra history-only publication is introduced.
