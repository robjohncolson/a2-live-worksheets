# Nightly "Tomorrow" draft for Algebra 2 (FABLE_SPRINT_2026_10_22D_SPEC D0). Two steps:
#   1. npm run pull-summaries        -- the latest Class Log summaries into roster-local/class-summaries/
#   2. node scripts/draft-tomorrow.mjs -- one note per section for its next class day, into roster-local/tomorrow/
#
# Deterministic, no LLM, nothing is written outside gitignored roster-local/. Step 2 runs
# even when step 1 fails (the note then carries the last pulled summary), and the exit
# code is step 2's. Everything is appended to roster-local/tomorrow/log.txt.
#
# The teacher secret for step 1 comes from roster-server/.env (ROSTER_TEACHER_SECRET) or
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
if ($draftCode -ne 0) {
  Write-Log "STEP 2 FAILED (exit $draftCode)."
  exit $draftCode
}

Write-Log "=== nightly_tomorrow done -- notes in $outDir ==="
exit 0
