$ErrorActionPreference = 'Continue'
$Root = 'E:\shankara-erp'
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Root\ops\windows\watchdog.ps1`""

# Two triggers: fire once at boot (so recovery starts immediately after a
# restart instead of waiting up to 5 min), and keep repeating every 5 min
# indefinitely after that. schtasks.exe (the old registration method) only
# supports one trigger per task; Register-ScheduledTask lets us combine both.
$AtStartup = New-ScheduledTaskTrigger -AtStartup
$Repeating = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Unregister-ScheduledTask -TaskName 'ShankaraERP-Watchdog' -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName 'ShankaraERP-Watchdog' -Action $Action `
  -Trigger @($AtStartup, $Repeating) -Principal $Principal -Settings $Settings `
  -Description 'Checks Shankara ERP docker/backend/caddy/frontend health every 5 min and at boot; self-heals what it safely can.' `
  -Force | Out-Null

# Make future disappearances diagnosable - this log is disabled by default.
wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true 2>$null | Out-Null

Write-Host "--- running once now to smoke-test ---"
Start-ScheduledTask -TaskName 'ShankaraERP-Watchdog'
Start-Sleep -Seconds 8
Write-Host "--- task info ---"
Get-ScheduledTask -TaskName 'ShankaraERP-Watchdog' | Get-ScheduledTaskInfo | Format-List
Get-ScheduledTask -TaskName 'ShankaraERP-Watchdog' | Select-Object TaskName, State
