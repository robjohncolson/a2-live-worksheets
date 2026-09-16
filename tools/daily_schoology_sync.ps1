# Single-host teacher-laptop daily batch for the grade -> Schoology hop
# (GRADE_PIPELINE_E2E_SPEC.md section 4). Two steps:
#   1. build_schoology_fixture.py  -- GET /class/grades -> a temp fixture.
#   2. schoology_sync_section.py   -- push that fixture into Schoology.
#
# DEFAULTS TO DRY-RUN BY DESIGN. Step 2 always passes --dry-run UNLESS -Live is
# given. Flip to -Live ONLY once SY26-27 marking periods exist -- the live dated
# sync is PARKED to ~Sept-2026 (see SCHOOLOGY_SYNC_V1_BUILD.md P2b gate).
#
# The teacher secret is read from the environment (ROSTER_TEACHER_SECRET), never
# the CLI, so the scheduled task can run headless. The teacher just keeps Edge
# signed into Schoology (~90-day cookie).
#
# Register as a daily Scheduled Task with register_schoology_sync_task.ps1.

param(
  [string]$Section = 'PeriodC',
  [switch]$Live,
  [string]$Base = '',
  [string]$LogDir = ''
)

$ErrorActionPreference = 'Continue'

# This script lives in tools/; the repo root is its parent.
$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir

if (-not $LogDir) { $LogDir = Join-Path $toolsDir '.schoology-sync-logs' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$log     = Join-Path $LogDir "sync-$Section-$stamp.log"
$fixture = Join-Path $LogDir "fixture-$Section-$stamp.json"

function Write-Log {
  param([string]$Message)
  $line = "[" + (Get-Date -Format 'HH:mm:ss') + "] $Message"
  Write-Output $line
  Add-Content -Path $log -Value $line
}

$mode = if ($Live) { 'LIVE' } else { 'DRY-RUN' }
Write-Log "=== daily_schoology_sync started ($mode) section=$Section ==="

# The secret must come from the environment -- never accept it on the CLI.
if (-not $env:ROSTER_TEACHER_SECRET) {
  Write-Log "ERROR: ROSTER_TEACHER_SECRET is not set in the environment."
  Write-Log "       Set it once for the scheduled-task account, e.g.:"
  Write-Log "         setx ROSTER_TEACHER_SECRET <secret>"
  Write-Log "       then re-run. The secret is NEVER passed on the command line."
  exit 1
}

# Build the python argument lists. --base is optional (the producer + connector
# both default to the prod URL when it is omitted).
$buildArgs = @(
  (Join-Path $toolsDir 'build_schoology_fixture.py'),
  '--section', $Section,
  '--out', $fixture,
  '--granularity', 'component'   # SY2627: fine-grained columns = the Desk's "Schoology today"
)
if ($Base) { $buildArgs += @('--base', $Base) }

# Course id: env override wins; otherwise schoology_sync_section.py uses its
# SECTION_TO_COURSE_ID map (SY26-27 PeriodC/D/G ids live there since 2026-09-15).
$courseId = [Environment]::GetEnvironmentVariable("A2_SCHOOLOGY_COURSE_ID_$Section")
if (-not $courseId) { $courseId = $env:A2_SCHOOLOGY_COURSE_ID }
$syncArgs = @(
  (Join-Path $toolsDir 'schoology_sync_section.py'),
  '--sync-section', $Section,
  '--grades-fixture', $fixture,
  '--granularity', 'component'   # must match step 1; --through defaults to today (NY)
)
if ($courseId) { $syncArgs += @('--course-id', $courseId) }
if ($Live) { $syncArgs += '--apply' } else { $syncArgs += '--dry-run' }

# Step 1 -- producer.
Write-Log "STEP 1: build_schoology_fixture.py --section $Section --out $fixture"
& python @buildArgs 2>&1 | Tee-Object -FilePath $log -Append
$buildCode = $LASTEXITCODE
if ($buildCode -ne 0) {
  Write-Log "STEP 1 FAILED (exit $buildCode) -- aborting before any Schoology write."
  exit $buildCode
}

# Step 2 -- connector (dry-run unless -Live).
Write-Log "STEP 2: schoology_sync_section.py --sync-section $Section --grades-fixture <fixture>$(if (-not $Live) { ' --dry-run' })"
& python @syncArgs 2>&1 | Tee-Object -FilePath $log -Append
$syncCode = $LASTEXITCODE
if ($syncCode -ne 0) {
  Write-Log "STEP 2 FAILED (exit $syncCode)."
  exit $syncCode
}

Write-Log "=== daily_schoology_sync done ($mode) -- log: $log ==="
exit 0
