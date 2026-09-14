# dok/compile.ps1 — build + compile one lesson's three editions (or -All).
#
#   powershell -NoProfile -File dok/compile.ps1 1.6          # student, board, teacher -> dok/pdf/
#   powershell -NoProfile -File dok/compile.ps1 -All
#   powershell -NoProfile -File dok/compile.ps1 1.6 -NoBuild # skip the generator, just pdflatex
#
# Runs pdflatex twice per edition (tcolorbox/hyperref cross-refs) with
# --miktex-enable-installer so missing packages (extsizes, qrcode) auto-install
# on first use. Aux/log files stay in dok/tex/ (gitignored); PDFs land in dok/pdf/.
# Windows PowerShell 5.1 compatible (no && / ternary).

param(
  [string]$Topic = '',
  [switch]$All,
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$dok  = $PSScriptRoot
$repo = Split-Path -Parent $dok
$tex  = Join-Path $dok 'tex'
$pdf  = Join-Path $dok 'pdf'
if (-not (Test-Path $pdf)) { New-Item -ItemType Directory -Force -Path $pdf | Out-Null }

if ($All) {
  $topics = Get-ChildItem (Join-Path $dok 'lessons') -Filter '*.yaml' | ForEach-Object { $_.BaseName }
} elseif ($Topic) {
  $topics = @($Topic)
} else {
  Write-Error 'Give a topic (e.g. 1.6) or -All.'
  exit 1
}

$failed = @()
foreach ($t in $topics) {
  if (-not $NoBuild) {
    Push-Location $repo
    try { python (Join-Path $dok 'build_ladder.py') (Join-Path $dok "lessons\$t.yaml") }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { $failed += "$t (build)"; continue }
  }
  foreach ($ed in @('student', 'board', 'teacher')) {
    $name = "aps_${t}_$ed"
    Push-Location $tex
    try {
      $ok = $true
      foreach ($pass in 1, 2) {
        & pdflatex --miktex-enable-installer -interaction=nonstopmode -halt-on-error "$name.tex" | Out-Null
        if ($LASTEXITCODE -ne 0) { $ok = $false; break }
      }
    } finally { Pop-Location }
    if ($ok) {
      Move-Item -Force (Join-Path $tex "$name.pdf") (Join-Path $pdf "$name.pdf")
      Write-Output "ok  dok/pdf/$name.pdf"
    } else {
      $failed += $name
      Write-Output "FAIL $name  (see dok/tex/$name.log)"
    }
  }
}

if ($failed.Count -gt 0) {
  Write-Output ("failed: " + ($failed -join ', '))
  exit 1
}
Write-Output "all compiled."
