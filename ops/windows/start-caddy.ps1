$ErrorActionPreference = 'Stop'
$caddy = 'C:\Users\Admin\AppData\Local\Microsoft\WinGet\Links\caddy.exe'
$cfg = 'E:\shankara-erp\ops\Caddyfile.windows'
Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
& $caddy start --config $cfg
