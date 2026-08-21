# Operations

Infra/ops tooling — not application code. Everything here is meant to run on the
real deployment (the on-prem office server), not a dev laptop.

## Backups

`backup.sh` dumps the Postgres database and archives the uploaded-file store.
`restore.sh` reverses that — **destructive**, requires `--yes-really`.

Both work via `docker exec` into the `shankara-postgres` container from
`docker-compose.yml`, so there's no separate Postgres client to install on
the host.

```bash
# back up now
./ops/backup.sh

# restore the most recent backup (drops and recreates every table — confirm first)
./ops/restore.sh --yes-really latest

# restore a specific pair
./ops/restore.sh --yes-really db-20260821T094117Z.dump uploads-20260821T094117Z.tar.gz
```

Live-tested 2026-08-21: real backup taken, database schema dropped entirely,
restored from that backup, every table's row count and specific row content
verified identical to before (`app_user`, `voucher`, `item_master_row`,
`audit_event`), uploads directory verified byte-identical file count. Both
`latest` and named-file invocations confirmed working.

**Known-safe restore warning:** `pg_restore` prints 3 "cannot drop inherited
constraint" errors for `pgboss.queue_stats_*` / `pgboss.job_common` — pg-boss's
own partitioned internal job-queue tables, not application data. The script
already recognizes and tolerates exactly this warning; anything else aborts
the restore.

### Scheduling it

Nothing schedules `backup.sh` on its own — pick one:

**Cron** (simplest — add via `crontab -e` on the office server):
```cron
# daily at 2am, keep 14 days (matches the script's default)
0 2 * * * cd /path/to/shankara-erp && ./ops/backup.sh >> /var/log/shankara-backup.log 2>&1
```

**systemd timer** (better if you want failure alerting via `systemctl status`):
```ini
# /etc/systemd/system/shankara-backup.service
[Unit]
Description=Shankara ERP backup

[Service]
Type=oneshot
WorkingDirectory=/path/to/shankara-erp
ExecStart=/path/to/shankara-erp/ops/backup.sh
```
```ini
# /etc/systemd/system/shankara-backup.timer
[Unit]
Description=Run Shankara ERP backup daily

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```
```bash
sudo systemctl enable --now shankara-backup.timer
```

### Where backups actually live — a decision for the office, not the code

By default `backup.sh` writes to `./backups/` next to the repo — **that's the
same disk as the database it's backing up**. A disk failure takes out both
the live system and every backup at once. This script only solves "can I get
back to a known-good state after a mistake, corruption, or a bad upload" —
it does **not** solve "the server's disk died." For that, `BACKUP_DIR` needs
to point somewhere physically separate: a NAS mount, an external drive, a
second machine reachable over the network, whatever the office actually has.

```bash
BACKUP_DIR=/mnt/nas/shankara-backups ./ops/backup.sh
```

That's a hardware/office-network decision, not something this script can
make — see the project root for the fuller writeup of what's still an office
decision versus what's engineering work.

## TLS reverse proxy (Caddy)

`Caddyfile` fronts the app with real HTTPS on the office LAN, no public
domain needed — see the comments at the top of the file for how the internal
certificate authority works. It serves the built frontend directly and
proxies `/api/*` to the backend, which runs as its own process on the same
machine (see docker-compose.yml's own comment: it only runs the data tier —
Postgres/pgbouncer/redis/OpenSearch — so Caddy talks to the backend via
`127.0.0.1:3000`, not a container name).

Live-tested 2026-08-21 against the real backend and a real frontend build:
HTTP→HTTPS redirect, TLS handshake via the internal CA, static frontend
serving with SPA fallback (`/catalog/upload` correctly serves `index.html`
so client-side routing works on a hard refresh), and the `/api/*` proxy
confirmed reaching the live NestJS process — verified with both a plain
health check and a real authenticated route (`/api/auth/me` correctly
returned `401` unauthenticated, proving it's the real app, not a stub).

### Installing Caddy on the office server

```bash
# Debian/Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```
(See caddyserver.com/docs/install for other distros.)

Before starting it: edit `ops/Caddyfile`'s `root *` line to the real absolute
path of `frontend/dist` on that server, and either set `ERP_HOSTNAME` or edit
the hostname line directly.

```bash
sudo cp ops/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

### Trusting the certificate on office devices

Because the cert comes from Caddy's own internal CA rather than a public one,
each device needs to trust that CA once — after that it's a normal green
padlock for as long as it's talking to this server.

1. On the server, find the root cert: `sudo find /var/lib/caddy/.local/share/caddy/pki -name root.crt`
2. Copy `root.crt` to each office machine and install it as a trusted root
   certificate authority (Windows: double-click → "Install Certificate" →
   Local Machine → "Trusted Root Certification Authorities"; macOS: open in
   Keychain Access, set to "Always Trust"; Linux: drop it in
   `/usr/local/share/ca-certificates/` and run `update-ca-certificates`).
3. If the office has a Windows domain, this can be pushed to every machine
   at once via Group Policy instead of doing it by hand per device.

### DNS / hostname

Every office machine needs `erp.shankara.local` (or whatever hostname is
chosen) to resolve to this server's LAN IP — either a real internal DNS
record if the office network has one, or a `hosts` file entry per machine
(`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on
Mac/Linux) as a simpler fallback for a small office.
