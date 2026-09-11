# Start Shankara ERP on this Windows host.
# Run PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process Bypass
#   E:\shankara-erp\ops\windows\start-hosting.ps1
#
# Does not spawn node.exe or caddy.exe. NSSM owns both ports
# (ShankaraERP-Backend :3000, ShankaraERP-Caddy :80/:443).
# This script starts those services if they are stopped, then health-checks.
# One-shot install: ops\windows\setup-services.ps1

$ErrorActionPreference = 'Stop'
$Root = 'E:\shankara-erp'

# Windows installer Postgres must stay off — Docker owns 5432.
$pg = Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq 'Running') {
  Stop-Service postgresql-x64-16 -Force
}

Set-Location $Root
docker compose --env-file backend/.env up -d
docker compose --env-file backend/.env ps

function Start-IfNeeded([string]$Name) {
  $svc = Get-Service $Name -ErrorAction SilentlyContinue
  if (-not $svc) {
    throw "$Name is not installed. Run ops\windows\setup-services.ps1 once as Administrator."
  }
  if ($svc.Status -ne 'Running') {
    Start-Service $Name
  }
}

Start-IfNeeded 'ShankaraERP-Backend'
Start-IfNeeded 'ShankaraERP-Caddy'
Start-Sleep -Seconds 3

Get-Service ShankaraERP-Backend, ShankaraERP-Caddy | Format-Table Name, Status, StartType

curl.exe -fsS http://127.0.0.1:3000/api/health
Write-Host ''
curl.exe -fsSk https://erp.shankara.local/api/health
Write-Host ''
Write-Host 'Open https://erp.shankara.local'
Write-Host 'Nearby PCs: hosts entry = this PC LAN IP as erp.shankara.local; trust ops\windows\shankara-root-ca.crt'
