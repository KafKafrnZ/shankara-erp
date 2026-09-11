$ErrorActionPreference = 'Continue'
$log = 'E:\shankara-erp\ops\windows\logs\tasks.txt'
"register start $(Get-Date -Format o)" | Set-Content $log
schtasks /Create /TN ShankaraERP-Backend /SC ONLOGON /RL LIMITED /RU 'Admin' /IT /F /TR 'E:\shankara-erp\ops\windows\run-backend.cmd' >> $log 2>&1
schtasks /Create /TN ShankaraERP-Caddy /SC ONLOGON /RL HIGHEST /RU 'Admin' /IT /F /TR 'E:\shankara-erp\ops\windows\run-caddy.cmd' >> $log 2>&1
schtasks /Query /TN ShankaraERP-Backend >> $log 2>&1
schtasks /Query /TN ShankaraERP-Caddy >> $log 2>&1
"register done $(Get-Date -Format o)" | Add-Content $log
