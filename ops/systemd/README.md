# systemd units

Installed by the go-live runbook in `docs/DEPLOYMENT.md`. Default paths
assume the clone lives at `/opt/shankara-erp` — edit before copying to
`/etc/systemd/system/`.

| File | What |
|---|---|
| `shankara-backend.service` | NestJS (`node dist/main.js`), user `shankara` |
| `shankara-backup.service` | Oneshoot: `ops/backup.sh` |
| `shankara-backup.timer` | Daily 02:00, persistent |

Set `BACKUP_DIR` in the backup service to an **off-box** path before
enabling the timer. Same-disk backups die with the server.
