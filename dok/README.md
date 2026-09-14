# DOK-3 misconception sheets

2026-09-12: only sheets generated from the misconceptions panel are active. See
[DOK_DEPRECATE_DAILY_SPEC.md](../DOK_DEPRECATE_DAILY_SPEC.md).
The 66 daily ladders and two Wednesday pairing sheets are preserved under `archive/`.
They are excluded from active builds, the manifest, the teacher index and the dashboard.

Students write a first take, work the printed parts and turn in whenever they finish
for bonus credit. The final part is scored E/P/I by a human, never AI-graded or auto-scored.
All information needed to work the problem is printed on the sheet.

## Author and publish a misconception sheet

1. Use the misconceptions panel's exact tag keys or normalized `label:` keys for the
   target evidence. Read the applicable `calibration/unit*.json` anchors.
2. Create `registry/{slug}.jsonl` and `lessons/{slug}.yaml`. Screen Time,
   `1.1_1.2_1.4_1.7`, is the current active example. Registry items need a first take,
   ordered parts ending at DOK 3, answers, a rationale, CED skill codes, FRQ pattern
   and E/P/I scoring. Multi-topic keys retain their ordered `topics` list; filenames
   replace `+` with `_`.
3. Every active YAML requires `standalone: true`, a non-empty `misconceptions` list,
   and `generated: { by: "orchestrator+teacher", "on": "2026-09-12", window_days: 42 }`
   with the actual author, date and evidence window. Quote `"on"` for YAML compatibility.
   Keep worksheet filenames as metadata. There is no calendar coverage obligation,
   pairing eligibility rule, ten-minute limit or worksheet-per-member requirement.
4. Run `python dok/build_ladder.py --validate`, then
   `powershell -NoProfile -File dok/compile.ps1 -All` (or pass a single slug).
   `--all` and `-All` enumerate only `dok/lessons/*.yaml`.
5. Review the three editions: student (two sides), board and teacher key.
   Run the DOK Vitest suites and `pytest tests/test_dok_build.py -q`.
   Commit the YAML, registry, manifest, TeX and PDFs.

Both video-free and self-paced guards remain mandatory. Retired flow fields such as
`minutes`, `exit_reflection` and teacher phase instructions are rejected. Visuals carry
data and labels only. Do not edit authored problem content to bypass a guard.

`index.html` renders each active manifest card with target labels, generation date and
three PDF links. The Desk Teacher menu's DOK ladders entry opens this index; individual
lesson resource panels have no DOK row. The dashboard Remediation sheets strip lists
all active sheets and their targets. The manifest carries the same provenance as YAML.

See [archive/README.md](archive/README.md) for history and restoration instructions.

## Weekly automation on Athena

`tools/weekly_dok.ps1` runs the misconception job. The default is a read-only
dry run: `node scripts/weekly-dok.mjs --dry-run`. It fetches PeriodB and PeriodE
over the last 14 days, using the teacher secret in `roster-server/.env` without
printing it. The lead needs four students; the job selects up to five labels,
preferring adjacent NEW-CED topics. Already-triaged targets are excluded unless
they recur for three consecutive weekly observations after triage.

The author prompt is [tools/weekly-dok-author-prompt.md](../tools/weekly-dok-author-prompt.md).
The author runs as `gpt-6-astra` with medium reasoning and creates one fresh
context, four-part worksheet. Part (d) is teacher-scored E/P/I. The runtime
supplies all existing active and archived contexts and the sanitized brief.
Complete roster identities are blocked in metadata; evidence additionally
redacts individual name fragments. Missing label skill codes come from the
checked-in item skill map, then any available topic tethers. No roster data is
saved with the brief.

Apply mode validates, compiles, runs the DOK tests, stages the explicit artifact
list, commits, creates `.git/PUSH_APPROVED`, and pushes `origin master`. A
build/staging failure restores triage and clears the job's staged paths. A push
failure retains and reports the local commit. The next apply run, or
`node scripts/weekly-dok.mjs --push-only`, fetches, rebases pending weekly commits
if necessary, and pushes them before selecting anything new. A conflicting
rebase is aborted and reported. Unpublished non-weekly commits require manual
review; they are never included in an automatic push.

The scheduled task fires Friday 21:00 and again Saturday 07:00 as a catch-up. It
also starts as soon as possible after a missed start, wakes the laptop from
sleep, and retries a failed run every 30 minutes up to three times. Apply runs
are accepted Friday from 21:00 through Saturday before noon. A week that
already has a recorded run (published or below floor) does nothing on a second
apply, so the catch-up never authors a second sheet. `--now` bypasses both.

Manual publication: `node scripts/weekly-dok.mjs --apply --now`.
Scheduled publication: `powershell -NoProfile -File tools/weekly_dok.ps1 -Apply`.
Apply requires clean tracked files and an empty index, except for local
history-only triage updates. Existing sheet keys or brief paths cause an abort;
the job never overwrites an existing sheet to resolve a collision. Failed build
artifacts remain available for inspection and must be resolved before retrying.

Successful below-floor apply runs save weekly observations in the local triage
file without publishing anything. Those observations reach the bundled server
with the next successful sheet. Dry runs never save observations. Screen Time's
five targets are backfilled with September 12 triage dates; its backfill student
counts are zero because historical targeting counts were not recorded.
The dashboard shows untriaged, triaged, and still-recurring statuses, with
untriaged rows first. Weekly task logs are under `tools/.weekly-dok-logs/`.

Register once, as the account with Codex and MiKTeX configured, for Fridays at
21:00 local starting September 18, 2026. The wrapper's `-Register` option only
prints this command; it never registers the task itself:

```text
schtasks /Create /TN "APStats-WeeklyDOK" /SC WEEKLY /D FRI /ST 21:00 /SD 09/18/2026 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\rober\Downloads\Projects\school\follow-alongs\tools\weekly_dok.ps1 -Apply" /F
```

Implementation verification is recorded in
[state/weekly-dok-verification.json](../state/weekly-dok-verification.json).
