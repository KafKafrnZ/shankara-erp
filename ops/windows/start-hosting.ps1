# Start Shankara ERP on this Windows host.
# Run PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process Bypass
#   E:\shankara-erp\ops\windows\start-hosting.ps1

$ErrorActionPreference = 'Stop'
$Root = 'E:\shankara-erp'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$Caddy = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\caddy.exe"
if (-not (Test-Path $Caddy)) {
  $Caddy = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"
}

New-Item -ItemType Directory -Force -Path "$Root\ops\windows\logs" | Out-Null

# Windows installer Postgres must stay off — Docker owns 5432.
$pg = Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq 'Running') {
  Stop-Service postgresql-x64-16 -Force
}

Set-Location $Root
docker compose --env-file backend/.env up -d
docker compose --env-file backend/.env ps

$on3000 = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3000 }
if (-not $on3000) {
  $env:NODE_OPTIONS = '--max-old-space-size=1536'
  Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
    -ArgumentList 'dist\main.js' `
    -WorkingDirectory "$Root\backend" `
    -RedirectStandardOutput "$Root\ops\windows\logs\backend.out.log" `
    -RedirectStandardError "$Root\ops\windows\logs\backend.err.log" `
    -WindowStyle Hidden
  Start-Sleep -Seconds 8
}

Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 10 | Out-Host

Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
& $Caddy start --config "$Root\ops\Caddyfile.windows"
Write-Host 'Open https://erp.shankara.local  (certificate warning once is expected)'
Write-Host 'Nearby PCs: add this PC LAN IP to hosts as erp.shankara.local'
Write-Host 'Logins: steward@shankara.local / finance@ / branch@  — passwords in backend\.env SEED_*_PASSWORD'
