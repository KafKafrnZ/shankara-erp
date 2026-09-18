# Elevated one-shot: registers a scheduled task that runs start-hosting.ps1
# automatically at Windows logon, so Docker + Backend + Caddy come up (and
# get health-checked) without anyone clicking Start-Shankara-ERP.bat.
# Runs as SYSTEM so it needs no UAC prompt at logon. Re-runnable (idempotent).

$ErrorActionPreference = 'Continue'
$Root = 'E:\shankara-erp'
$LogDir = "$Root\ops\windows\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Start-Transcript, not *>> stream redirection: confirmed live that *>>
# turns docker's harmless stderr warnings into ErrorRecords that
# start-hosting.ps1's $ErrorActionPreference = 'Stop' then escalates into a
# silent, unlogged script-terminating exception. Start-Transcript is a
# host-output mirror, not a stream redirect operator, so it doesn't trigger
# that - the same pattern used for every successful manual elevated test of
# this script throughout development.
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  "-NoProfile -ExecutionPolicy Bypass -Command " +
  "`"Start-Transcript -Path '$LogDir\autostart.log' -Append -Force" +
  "; & '$Root\ops\windows\start-hosting.ps1'" +
  "; Stop-Transcript`""
)

$AtLogon = New-ScheduledTaskTrigger -AtLogOn

$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Unregister-ScheduledTask -TaskName 'ShankaraERP-AutoStart' -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName 'ShankaraERP-AutoStart' -Action $Action `
  -Trigger $AtLogon -Principal $Principal -Settings $Settings `
  -Description 'Runs start-hosting.ps1 at Windows logon: starts Docker/containers/Backend/Caddy if needed and health-checks them. Logs to ops\windows\logs\autostart.log. Runs as SYSTEM (session 0) so the on-success browser launch in start-hosting.ps1 will not visibly open - check the log or just visit the site.' `
  -Force | Out-Null

Write-Host "--- task info ---"
Get-ScheduledTask -TaskName 'ShankaraERP-AutoStart' | Select-Object TaskName, State
