# Start Shankara ERP on this Windows host (Docker + NSSM Backend + Caddy),
# then confirm it's actually up. Meant to be double-clicked via
# Start-Shankara-ERP.bat, which elevates and calls this - running it
# directly needs an Administrator PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass
#   E:\shankara-erp\ops\windows\start-hosting.ps1
#
# Does not spawn node.exe or caddy.exe. NSSM owns both ports
# (ShankaraERP-Backend :3000, ShankaraERP-Caddy :80/:443, also serves the
# frontend static files - there is no separate frontend process).
# One-shot install if the services themselves are missing:
#   ops\windows\setup-services.ps1

$ErrorActionPreference = 'Stop'
$Root = 'E:\shankara-erp'
$failures = @()

function Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAILED] $msg" -ForegroundColor Red; $script:failures += $msg }

# Windows installer Postgres must stay off - Docker owns 5432.
$pg = Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq 'Running') {
  Stop-Service postgresql-x64-16 -Force
}

Step 'Docker Desktop'
$dockerReady = $false
try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerReady = $true } } catch {}
if ($dockerReady) {
  Ok 'already running'
} else {
  $dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dockerExe)) {
    Fail "Docker Desktop.exe not found at $dockerExe - install or start it manually."
  } else {
    Write-Host '  Starting Docker Desktop, this can take 30-90 seconds...'
    Start-Process $dockerExe
    $waited = 0
    while (-not $dockerReady -and $waited -lt 120) {
      Start-Sleep -Seconds 5
      $waited += 5
      try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerReady = $true } } catch {}
    }
    if ($dockerReady) { Ok "up after ${waited}s" } else { Fail "did not come up within 120s" }
  }
}

if ($dockerReady) {
  Step 'Containers (postgres/pgbouncer/redis)'
  Set-Location $Root
  docker compose --env-file backend/.env up -d
  docker compose --env-file backend/.env ps
  Ok 'docker compose up'
} else {
  Write-Host "`nSkipping the rest - nothing works without Docker. Fix Docker Desktop and re-run this." -ForegroundColor Yellow
}

function Start-IfNeeded([string]$Name) {
  $svc = Get-Service $Name -ErrorAction SilentlyContinue
  if (-not $svc) {
    Fail "$Name is not installed. Run ops\windows\setup-services.ps1 once as Administrator."
    return
  }
  if ($svc.Status -ne 'Running') {
    Start-Service $Name
  }
  $svc.Refresh()
  if ($svc.Status -eq 'Running') { Ok "$Name running" } else { Fail "$Name did not start (status: $($svc.Status))" }
}

if ($dockerReady) {
  Step 'Backend + Caddy services'
  Start-IfNeeded 'ShankaraERP-Backend'
  Start-IfNeeded 'ShankaraERP-Caddy'
  Start-Sleep -Seconds 5

  Step 'Health checks'
  try {
    $h1 = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 10
    if ($h1.status -eq 'ok') { Ok "backend: $($h1 | ConvertTo-Json -Compress)" } else { Fail "backend unhealthy: $($h1 | ConvertTo-Json -Compress)" }
  } catch { Fail "backend unreachable: $($_.Exception.Message)" }
  try {
    $h2 = Invoke-RestMethod -Uri 'https://erp.shankara.local/api/health' -TimeoutSec 10
    if ($h2.status -eq 'ok') { Ok "site (https://erp.shankara.local): $($h2 | ConvertTo-Json -Compress)" } else { Fail "site unhealthy: $($h2 | ConvertTo-Json -Compress)" }
  } catch { Fail "site unreachable: $($_.Exception.Message)" }
}

Write-Host ''
if ($failures.Count -eq 0) {
  Write-Host '=================================================' -ForegroundColor Green
  Write-Host ' Shankara ERP is UP: https://erp.shankara.local' -ForegroundColor Green
  Write-Host '=================================================' -ForegroundColor Green
  Start-Process 'https://erp.shankara.local'
} else {
  Write-Host '=================================================' -ForegroundColor Red
  Write-Host ' Something needs attention:' -ForegroundColor Red
  $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  Write-Host ' Contact IT / re-run this after fixing the above.' -ForegroundColor Red
  Write-Host '=================================================' -ForegroundColor Red
}
