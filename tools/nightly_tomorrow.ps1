# Nightly "Tomorrow" draft for Algebra 2 (FABLE_SPRINT_2026_10_22D_SPEC D0) and the
# atomic section plans for the next school day. Four steps:
#   1. npm run pull-summaries        -- the latest Class Log summaries into roster-local/class-summaries/
#   2. node scripts/draft-tomorrow.mjs -- one note per section for its next class day, into roster-local/tomorrow/
#   3. node scripts/build-lesson-tree.mjs --all --check
#   4. node scripts/plan-next-class.mjs publish --per-section --ready-only -- one transaction
#      for each section's matching card/deck package, with durable commitments,
#      explicit teacher decisions, current mastery and textbook guidance.
#
# Deterministic, no LLM. Steps 1-2 and plan artifacts write only gitignored
# roster-local/; step 3 rebuilds tracked lesson trees when they change. Step 2
# runs even when step 1 fails. Step 4 reads authoritative server state and publishes
# only after every authored target compiles; unauthored placeholders are logged
# and skipped. Malformed authored input, a conflict or an error leaves the old paired
# plan intact. Any failed draft, tree build or plan publication returns a nonzero exit
# code for Task Scheduler. Everything is appended to roster-local/tomorrow/log.txt.
#
# The teacher secret for steps 1 and 4 comes from roster-server/.env (ROSTER_TEACHER_SECRET) or
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

# Step 3 -- rebuild and check the shared lesson inputs before compiling any plan.
Write-Log "STEP 3: node scripts/build-lesson-tree.mjs --all --check"
$treeCode = Invoke-Logged @((Join-Path $repo 'scripts\build-lesson-tree.mjs'), '--all', '--check')
$planCode = 0
if ($treeCode -ne 0) {
  Write-Log "STEP 3 FAILED (lesson trees, exit $treeCode) -- no plans published."
} else {
  $planArgs = @((Join-Path $repo 'scripts\plan-next-class.mjs'), 'publish', '--per-section', '--ready-only')
  if ($Date) { $planArgs += @('--date', $Date) }
  if ($Section) { $planArgs += @('--section', $Section) }
  Write-Log "STEP 4: node scripts/plan-next-class.mjs publish --per-section --ready-only $(if ($Date) { "--date $Date " })$(if ($Section) { "--section $Section" })"
  $planCode = Invoke-Logged $planArgs
  if ($planCode -ne 0) { Write-Log "STEP 4 FAILED (atomic plans, exit $planCode)." }
}

foreach ($stepCode in @($draftCode, $treeCode, $planCode)) {
  if ($stepCode -ne 0) { exit $stepCode }
}
Write-Log "=== nightly_tomorrow done -- notes in $outDir ==="
exit 0
