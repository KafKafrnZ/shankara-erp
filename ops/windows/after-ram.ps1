# Run once AFTER the 8 GB RAM is installed and Windows is back up.
# Right-click PowerShell -> Run as administrator, then:
#   Set-ExecutionPolicy -Scope Process Bypass
#   E:\shankara-erp\ops\windows\after-ram.ps1

$ErrorActionPreference = 'Stop'
$Root = 'E:\shankara-erp'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:NODE_OPTIONS = '--max-old-space-size=1536'
$Caddy = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\caddy.exe"
if (-not (Test-Path $Caddy)) { $Caddy = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe" }

Write-Host '== Node =='
& 'C:\Program Files\nodejs\node.exe' --version
Write-Host '== Postgres =='
Get-Service postgresql-x64-16 | Format-Table Name, Status

New-Item -ItemType Directory -Force -Path "$Root\backend\var\uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "$Root\ops\windows\logs" | Out-Null

Set-Location "$Root\backend"
Write-Host '== backend npm ci =='
npm ci
Write-Host '== migrations =='
npm run migration:run
Write-Host '== seed =='
npm run seed
Write-Host '== backend build =='
npm run build
if (-not (Test-Path "$Root\backend\dist\main.js")) { throw 'backend build failed' }

Set-Location "$Root\frontend"
Write-Host '== frontend npm ci =='
npm ci
Write-Host '== frontend build =='
npm run build
if (-not (Test-Path "$Root\frontend\dist\index.html")) { throw 'frontend build failed' }

& $Caddy validate --config "$Root\ops\Caddyfile.windows"

Write-Host '== starting backend =='
$backend = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'dist\main.js' `
  -WorkingDirectory "$Root\backend" `
  -RedirectStandardOutput "$Root\ops\windows\logs\backend.out.log" `
  -RedirectStandardError "$Root\ops\windows\logs\backend.err.log" `
  -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 4
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 10
  Write-Host ("backend health: " + ($health | ConvertTo-Json -Compress))
} catch {
  Write-Host 'backend did not answer /api/health yet — see ops\windows\logs\backend.err.log'
}

Write-Host '== starting Caddy =='
$caddyProc = Start-Process -FilePath $Caddy `
  -ArgumentList @('run','--config',"$Root\ops\Caddyfile.windows") `
  -WorkingDirectory $Root `
  -RedirectStandardOutput "$Root\ops\windows\logs\caddy.out.log" `
  -RedirectStandardError "$Root\ops\windows\logs\caddy.err.log" `
  -PassThru -WindowStyle Hidden

Write-Host "backend pid=$($backend.Id)  caddy pid=$($caddyProc.Id)"
Write-Host 'Open https://erp.shankara.local on this PC (accept/trust the cert warning once).'
Write-Host 'Other office PCs: add hosts line  <this-PC-LAN-IP>  erp.shankara.local'
Write-Host 'Seed logins are in E:\shankara-erp\backend\.env (SEED_*_PASSWORD). Do not share that file.'
