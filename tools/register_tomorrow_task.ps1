# One-time registration of the nightly Algebra 2 "Tomorrow" draft as a Windows Scheduled
# Task (FABLE_SPRINT_2026_10_22D_SPEC D0). Same pattern as register_schoology_sync_task.ps1:
# a daily schtasks /Create that launches nightly_tomorrow.ps1 under powershell.exe.
#
# Usage:
#   powershell -NoProfile -File tools/register_tomorrow_task.ps1
#   powershell -NoProfile -File tools/register_tomorrow_task.ps1 -Time 20:45

param(
  [string]$Time     = '20:30',
  [string]$TaskName = 'A2 Tomorrow Draft'
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$batch    = Join-Path $toolsDir 'nightly_tomorrow.ps1'

if (-not (Test-Path $batch)) {
  Write-Error "Cannot find the batch script at $batch"
  exit 1
}

$ps = (Get-Command powershell.exe).Source
$action = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$batch`""

Write-Output "Registering daily Scheduled Task:"
Write-Output "  Name: $TaskName"
Write-Output "  Time: $Time (daily)"
Write-Output "  Runs: $action"
Write-Output ""

schtasks /Create /SC DAILY /TN $TaskName /TR $action /ST $Time /F
if ($LASTEXITCODE -ne 0) {
  Write-Error "schtasks /Create failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}

Write-Output ""
Write-Output "Task '$TaskName' created."
Write-Output "  Run it now:  schtasks /Run /TN `"$TaskName`""
Write-Output "  Inspect it:  schtasks /Query /TN `"$TaskName`" /V /FO LIST"
Write-Output "  Delete it:   schtasks /Delete /TN `"$TaskName`" /F"
exit 0
