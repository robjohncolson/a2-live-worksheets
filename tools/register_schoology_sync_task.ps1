# One-time registration of the daily grade -> Schoology batch as a Windows
# Scheduled Task (GRADE_PIPELINE_E2E_SPEC.md section 4). Same infra pattern as
# the existing auto-continuation schtask: a daily schtasks /Create that launches
# daily_schoology_sync.ps1 under powershell.exe.
#
# Defaults register a DRY-RUN job. Pass -Live to forward -Live to the batch (only
# once SY26-27 marking periods exist -- live dated sync is PARKED to ~Sept-2026).
#
# The scheduled-task account must have ROSTER_TEACHER_SECRET set in its
# environment (e.g. `setx ROSTER_TEACHER_SECRET <secret>`); the batch reads it
# from there and never from the CLI.
#
# Usage:
#   powershell -NoProfile -File tools/register_schoology_sync_task.ps1
#   powershell -NoProfile -File tools/register_schoology_sync_task.ps1 -Section PeriodE -Time 16:45
#   powershell -NoProfile -File tools/register_schoology_sync_task.ps1 -Live   # once live is in scope

param(
  [string]$Section  = 'PeriodB',
  [string]$Time     = '16:30',
  [string]$TaskName = 'ApStatsSchoologySync',
  [switch]$Live
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$batch    = Join-Path $toolsDir 'daily_schoology_sync.ps1'

if (-not (Test-Path $batch)) {
  Write-Error "Cannot find the batch script at $batch"
  exit 1
}

# Build the powershell.exe command that the task runs each day. -NoProfile keeps
# it deterministic; forward -Section and (optionally) -Live to the batch.
$ps = (Get-Command powershell.exe).Source
$inner = "-NoProfile -ExecutionPolicy Bypass -File `"$batch`" -Section $Section"
if ($Live) { $inner += ' -Live' }
$action = "`"$ps`" $inner"

Write-Output "Registering daily Scheduled Task:"
Write-Output "  Name:    $TaskName"
Write-Output "  Time:    $Time (daily)"
Write-Output "  Section: $Section"
Write-Output "  Mode:    $(if ($Live) { 'LIVE' } else { 'DRY-RUN (default)' })"
Write-Output "  Runs:    $action"
Write-Output ""

schtasks /Create /SC DAILY /TN $TaskName /TR $action /ST $Time /F
if ($LASTEXITCODE -ne 0) {
  Write-Error "schtasks /Create failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}

Write-Output ""
Write-Output "Task '$TaskName' created."
Write-Output "  Run it now:  schtasks /Run /TN $TaskName"
Write-Output "  Inspect it:  schtasks /Query /TN $TaskName /V /FO LIST"
Write-Output "  Delete it:   schtasks /Delete /TN $TaskName /F"
Write-Output ""
Write-Output "Reminder: the task account needs ROSTER_TEACHER_SECRET in its environment,"
Write-Output "and the batch defaults to DRY-RUN until you re-register with -Live."
exit 0
