# Runs every 5 minutes (Task Scheduler: ShankaraERP-Watchdog).
# Checks the stack end-to-end and self-heals what it safely can.
# Never destructive: only starts/restarts services and containers, never stops user data.

$Root = 'E:\shankara-erp'
$LogDir = "$Root\ops\windows\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = "$LogDir\watchdog.log"
$Alert = "$LogDir\watchdog-alerts.log"

if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 5MB) {
  Move-Item $Log "$Log.old" -Force
}

function Write-Log($msg) {
  $line = "$(Get-Date -Format o)  $msg"
  Add-Content -Path $Log -Value $line
}
function Write-Alert($msg) {
  $line = "$(Get-Date -Format o)  ALERT: $msg"
  Add-Content -Path $Alert -Value $line
  Add-Content -Path $Log -Value $line
}

Write-Log "watchdog tick start"

# 1. Windows Postgres must stay stopped - it steals :5432 from Docker.
$pg = Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq 'Running') {
  Write-Alert "Windows postgresql-x64-16 was Running - stopping it (Docker owns 5432)"
  Stop-Service postgresql-x64-16 -Force -ErrorAction SilentlyContinue
}

# 2. Docker data tier.
try {
  $composeOut = & docker compose --env-file "$Root\backend\.env" -f "$Root\docker-compose.yml" ps --format json 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Alert "docker compose ps failed (exit $LASTEXITCODE): $composeOut - is Docker Desktop running / user logged in?"
  } else {
    $names = @('shankara-postgres','shankara-pgbouncer','shankara-redis')
    $upCount = ($composeOut -split "`n" | Where-Object { $_ -match '"State":"running"' }).Count
    if ($upCount -lt 3) {
      Write-Alert "docker compose reports fewer than 3 containers running ($upCount) - running docker compose up -d"
      & docker compose --env-file "$Root\backend\.env" -f "$Root\docker-compose.yml" up -d 2>&1 | Out-Null
    } else {
      Write-Log "docker: 3/3 containers up"
    }
  }
} catch {
  Write-Alert "docker check threw: $_"
}

# 3. Backend service + health endpoint.
$backendSvc = Get-Service ShankaraERP-Backend -ErrorAction SilentlyContinue
if (-not $backendSvc -or $backendSvc.Status -ne 'Running') {
  Write-Alert "ShankaraERP-Backend service not Running (status: $($backendSvc.Status)) - starting it"
  Start-Service ShankaraERP-Backend -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 8
}
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 8
  if ($health.status -ne 'ok' -or $health.db -ne 'ok') {
    Write-Alert "backend /api/health degraded: $($health | ConvertTo-Json -Compress)"
  } else {
    Write-Log "backend health ok"
  }
} catch {
  Write-Alert "backend /api/health unreachable: $_ - restarting ShankaraERP-Backend"
  Restart-Service ShankaraERP-Backend -ErrorAction SilentlyContinue
}

# 4. Caddy service + edge health.
$caddySvc = Get-Service ShankaraERP-Caddy -ErrorAction SilentlyContinue
if (-not $caddySvc -or $caddySvc.Status -ne 'Running') {
  Write-Alert "ShankaraERP-Caddy service not Running (status: $($caddySvc.Status)) - starting it"
  Start-Service ShankaraERP-Caddy -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}
try {
  $edgeCode = & curl.exe -sk -o NUL -w "%{http_code}" https://erp.shankara.local/api/health --max-time 8
  if ($edgeCode -ne '200') {
    Write-Alert "https://erp.shankara.local/api/health returned $edgeCode - restarting ShankaraERP-Caddy"
    Restart-Service ShankaraERP-Caddy -ErrorAction SilentlyContinue
  } else {
    Write-Log "caddy edge health ok"
  }
} catch {
  Write-Alert "caddy edge check threw: $_"
}

# 5. Frontend static bundle, served directly by Caddy (not covered by the
#    /api/health check above - a missing/corrupt dist folder would still
#    show backend+caddy as healthy while the site itself is broken).
try {
  $frontBody = (& curl.exe -sk https://erp.shankara.local/ --max-time 8) -join "`n"
  if ($frontBody -notmatch '<div id="root"') {
    Write-Alert "frontend root page missing expected content (dist may be missing/corrupt) - not auto-fixing, needs manual look at E:\shankara-erp\frontend\dist"
  } else {
    Write-Log "frontend static bundle ok"
  }
} catch {
  Write-Alert "frontend check threw: $_"
}

Write-Log "watchdog tick end"
