# Elevated one-shot setup: NSSM services for backend + Caddy.
# Run as Administrator. Logs everything to ops\windows\logs\setup-services.log

$ErrorActionPreference = 'Continue'
$Root = 'E:\shankara-erp'
$LogDir = "$Root\ops\windows\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = "$LogDir\setup-services.log"
Start-Transcript -Path $Log -Force | Out-Null

$Nssm = 'C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'
$Caddy = 'C:\Users\Admin\AppData\Local\Microsoft\WinGet\Links\caddy.exe'

Write-Host "=== Windows Postgres must stay off, Docker owns 5432 ==="
$pg = Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq 'Running') { Stop-Service postgresql-x64-16 -Force }
if ($pg) { Set-Service postgresql-x64-16 -StartupType Manual }

Write-Host "=== removing any existing Shankara services (idempotent re-run) ==="
foreach ($svc in @('ShankaraERP-Backend','ShankaraERP-Caddy')) {
  $existing = Get-Service $svc -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-Service $svc -Force -ErrorAction SilentlyContinue
    & $Nssm remove $svc confirm
  }
}

Write-Host "=== installing ShankaraERP-Backend ==="
& $Nssm install ShankaraERP-Backend 'C:\Program Files\nodejs\node.exe' 'dist\main.js'
& $Nssm set ShankaraERP-Backend AppDirectory "$Root\backend"
& $Nssm set ShankaraERP-Backend AppEnvironmentExtra 'NODE_OPTIONS=--max-old-space-size=1536'
& $Nssm set ShankaraERP-Backend Start SERVICE_DELAYED_AUTO_START
& $Nssm set ShankaraERP-Backend AppStdout "$LogDir\backend-service.out.log"
& $Nssm set ShankaraERP-Backend AppStderr "$LogDir\backend-service.err.log"
& $Nssm set ShankaraERP-Backend AppRotateFiles 1
& $Nssm set ShankaraERP-Backend AppRotateOnline 1
& $Nssm set ShankaraERP-Backend AppRotateBytes 10485760
& $Nssm set ShankaraERP-Backend AppRotateSeconds 86400
& $Nssm set ShankaraERP-Backend AppExit Default Restart
& $Nssm set ShankaraERP-Backend AppRestartDelay 5000
& $Nssm set ShankaraERP-Backend AppThrottle 1500
& $Nssm set ShankaraERP-Backend Description 'Shankara ERP NestJS backend (node dist/main.js), auto-restart on failure'

Write-Host "=== installing ShankaraERP-Caddy ==="
& $Nssm install ShankaraERP-Caddy $Caddy "run --config $Root\ops\Caddyfile.windows"
& $Nssm set ShankaraERP-Caddy AppDirectory "$Root\ops"
& $Nssm set ShankaraERP-Caddy Start SERVICE_DELAYED_AUTO_START
& $Nssm set ShankaraERP-Caddy AppStdout "$LogDir\caddy-service.out.log"
& $Nssm set ShankaraERP-Caddy AppStderr "$LogDir\caddy-service.err.log"
& $Nssm set ShankaraERP-Caddy AppRotateFiles 1
& $Nssm set ShankaraERP-Caddy AppRotateOnline 1
& $Nssm set ShankaraERP-Caddy AppRotateBytes 10485760
& $Nssm set ShankaraERP-Caddy AppRotateSeconds 86400
& $Nssm set ShankaraERP-Caddy AppExit Default Restart
& $Nssm set ShankaraERP-Caddy AppRestartDelay 5000
& $Nssm set ShankaraERP-Caddy AppThrottle 1500
& $Nssm set ShankaraERP-Caddy Description 'Shankara ERP Caddy reverse proxy (80/443), runs as SYSTEM so no UAC needed, auto-restart on failure'

Write-Host "=== clearing stale ONLOGON scheduled tasks (superseded by services) ==="
foreach ($t in @('ShankaraERP-Backend','ShankaraERP-Caddy')) {
  schtasks /Query /TN $t 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { schtasks /Delete /TN $t /F | Out-Null }
}

Write-Host "=== starting services ==="
Start-Service ShankaraERP-Backend
Start-Sleep -Seconds 8
Start-Service ShankaraERP-Caddy
Start-Sleep -Seconds 3

Write-Host "=== status ==="
Get-Service ShankaraERP-Backend, ShankaraERP-Caddy | Format-Table Name, Status, StartType
docker compose --env-file "$Root\backend\.env" -f "$Root\docker-compose.yml" ps

Write-Host "=== health checks ==="
try { Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 10 | ConvertTo-Json | Write-Host } catch { Write-Host "backend health FAILED: $_" }
try { Invoke-RestMethod -Uri 'https://erp.shankara.local/api/health' -SkipCertificateCheck -TimeoutSec 10 | ConvertTo-Json | Write-Host } catch { Write-Host "caddy health FAILED: $_" }

Write-Host "=== DONE ==="
Stop-Transcript | Out-Null
