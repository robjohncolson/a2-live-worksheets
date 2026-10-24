# Nightly "Tomorrow" draft for Algebra 2 (FABLE_SPRINT_2026_10_22D_SPEC D0) and the
# rehearsal decks for the next school day (school/class-log/KNOWLEDGE_TREE_SPEC.md 1.4). Four steps:
#   1. npm run pull-summaries        -- the latest Class Log summaries into roster-local/class-summaries/
#   2. node scripts/draft-tomorrow.mjs -- one note per section for its next class day, into roster-local/tomorrow/
#   3. node scripts/push-observer-cards.mjs -- the day log's observer cards to the server, so tomorrow's cards exist
#   4. node scripts/build-lesson-tree.mjs --all --check, then
#      node scripts/draft-card-decks.mjs --from-tree --per-section --apply -- one deck per card of each
#      section's next class day (resolved as in step 2; -Date/-Section the same), from the lesson trees (no model)
#
# Deterministic, no LLM. Steps 1-2 write only gitignored roster-local/; step 4 also rewrites
# content/a2/lesson-trees/ and content/a2/card-decks/<date>.json (tracked, no student data) when
# they change. Step 2 runs even when step 1 fails (the note then carries the last pulled
# summary). Steps 3 and 4 run whatever step 2 did; their failures are logged only (the Desk
# Rehearsal line then says "No deck" for that day, which is the signal to look), and the
# exit code is step 2's. Everything is appended to roster-local/tomorrow/log.txt.
#
# The teacher secret for steps 1, 3 and 4 comes from roster-server/.env (ROSTER_TEACHER_SECRET) or
# the environment, exactly as scripts/pull-class-summaries.mjs reads it; it is never passed
# on the command line and never logged.
#
# Register as a daily Scheduled Task (20:30) with:
#   schtasks /Create /SC DAILY /TN "A2 Tomorrow Draft" /ST 20:30 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo>\tools\nightly_tomorrow.ps1"
#   (tools/register_tomorrow_task.ps1 runs exactly that with the repo path filled in).
# Run it by hand: powershell -NoProfile -File tools/nightly_tomorrow.ps1 [-Date YYYY-MM-DD] [-Section C|D|G]

param(
  [string]$Date = '',
  [string]$Section = ''
)

$ErrorActionPreference = 'Continue'

# This script lives in tools/; the repo root is its parent.
$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir
$outDir   = Join-Path $repo 'roster-local\tomorrow'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$log = Join-Path $outDir 'log.txt'

function Write-Log {
  param([string]$Message)
  $line = "[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] $Message"
  Write-Output $line
  Add-Content -Path $log -Encoding utf8 -Value $line
}

Set-Location $repo
Write-Log "=== nightly_tomorrow started ==="

# Step 1 -- pull the summaries (a failure is logged, never fatal: the draft still runs).
Write-Log "STEP 1: npm run pull-summaries"
& npm.cmd run pull-summaries --silent 2>&1 | ForEach-Object { Write-Output $_; Add-Content -Path $log -Encoding utf8 -Value ([string]$_) }
$pullCode = $LASTEXITCODE
if ($pullCode -ne 0) { Write-Log "STEP 1 FAILED (exit $pullCode) -- drafting from the last pulled summaries." }

# Step 2 -- the draft.
$draftArgs = @((Join-Path $repo 'scripts\draft-tomorrow.mjs'))
if ($Date) { $draftArgs += @('--date', $Date) }
if ($Section) { $draftArgs += @('--section', $Section) }
Write-Log "STEP 2: node scripts/draft-tomorrow.mjs $(if ($Date) { "--date $Date " })$(if ($Section) { "--section $Section" })"
& node @draftArgs 2>&1 | ForEach-Object { Write-Output $_; Add-Content -Path $log -Encoding utf8 -Value ([string]$_) }
$draftCode = $LASTEXITCODE
if ($draftCode -ne 0) { Write-Log "STEP 2 FAILED (exit $draftCode)." }

# Runs one node script, everything into the log; returns its exit code.
function Invoke-Logged {
  param([string[]]$NodeArgs)
  & node @NodeArgs 2>&1 | ForEach-Object { Write-Host $_; Add-Content -Path $log -Encoding utf8 -Value ([string]$_) }
  return $LASTEXITCODE
}

# Step 3 -- push the observer cards (a failure is logged; the decks then have no card ids to go to).
Write-Log "STEP 3: node scripts/push-observer-cards.mjs"
$pushCode = Invoke-Logged @((Join-Path $repo 'scripts\push-observer-cards.mjs'))
if ($pushCode -ne 0) { Write-Log "STEP 3 FAILED (exit $pushCode)." }

# Step 4 -- rebuild and check the lesson trees, then the decks for the next school day.
Write-Log "STEP 4: node scripts/build-lesson-tree.mjs --all --check"
$treeCode = Invoke-Logged @((Join-Path $repo 'scripts\build-lesson-tree.mjs'), '--all', '--check')
if ($treeCode -ne 0) {
  Write-Log "STEP 4 FAILED (lesson trees, exit $treeCode) -- no decks drafted."
} else {
  $deckArgs = @((Join-Path $repo 'scripts\draft-card-decks.mjs'), '--from-tree', '--per-section', '--apply')
  if ($Date) { $deckArgs += @('--date', $Date) }
  if ($Section) { $deckArgs += @('--section', $Section) }
  Write-Log "STEP 4: node scripts/draft-card-decks.mjs --from-tree --per-section --apply $(if ($Date) { "--date $Date " })$(if ($Section) { "--section $Section" })"
  $deckCode = Invoke-Logged $deckArgs
  if ($deckCode -ne 0) { Write-Log "STEP 4 FAILED (decks, exit $deckCode)." }
}

if ($draftCode -ne 0) { exit $draftCode }
Write-Log "=== nightly_tomorrow done -- notes in $outDir ==="
exit 0
