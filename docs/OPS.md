# Shankara ERP — ops manual

Standing technical reference for whoever runs, maintains, or troubleshoots
the live system. First-time install is [`DEPLOYMENT.md`](DEPLOYMENT.md),
not this file.

---

## 1. System overview

NestJS backend + React/Vite frontend. Stewards upload item-master Excel
exports from Tally; the app versions and publishes them; everyone else
searches and filters the live catalog. Tally remains the book of record
for accounting. There is no voucher / day-book module.

```
Browser ──HTTPS──▶ Caddy (TLS, static frontend, /api/* proxy)
                      │
                      ▼
                NestJS :3000 ──▶ pgbouncer :6432 ──▶ Postgres :5432
                      │                                   ▲
                      └── pg-boss (job queue, :5432) ─────┘
                      └── Redis :6379 (provisioned, unused for cache)
```

Full data model and API surface: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 2. How it runs

### Development (a laptop)

```bash
docker compose up -d
cd backend && npm ci && npm run migration:run && npm run seed
npm run start:dev                  # http://127.0.0.1:3000/api/health
cd ../frontend && npm ci && npm run dev   # http://127.0.0.1:5173
```

Reachable only from that machine.

### Production (the office server)

```bash
sudo systemctl status shankara-backend
sudo systemctl status caddy
sudo systemctl status shankara-backup.timer
sudo docker compose -f /opt/shankara-erp/docker-compose.yml ps
```

The frontend has **no running process**. Caddy serves `frontend/dist`.

After a backend change:

```bash
cd /opt/shankara-erp/backend
sudo -u shankara npm ci && sudo -u shankara npm run build
sudo systemctl restart shankara-backend
```

After a frontend change: `npm run build` in `frontend/`, then
`sudo systemctl reload caddy`.

---

## 3. Network and access

Designed as LAN-only. A PC on the office network can open
`https://erp.shankara.local`. A PC on home broadband cannot.

If remote staff need it: put them on a **VPN** into the office LAN
(Tailscale / WireGuard). Do not port-forward this to the public internet
until monitoring and unique production secrets are in place — see
`ARCHITECTURE.md` §11.

Caddy terminates TLS with an **internal CA**. Each office device trusts
that CA once (`ops/README.md`). Public Let’s Encrypt is the wrong tool
until the hostname is on the public internet.

---

## 4. Roles

There is no separate “admin” role. **Steward is the admin role.**

| Role | Can do |
|---|---|
| `steward` | Search, upload/publish/hold batches, add/edit/delete items, manage users |
| `finance` | Search and view only |
| `branch` | Search and view only |

Enforced with `@Roles('steward')` on every write route. A finance token
gets 403 on those routes.

Auth: `httpOnly` cookie `sb_token`, `SameSite=Strict`, `Secure` when
`NODE_ENV=production`. Login body still returns `accessToken` for
scripts / e2e (`Authorization: Bearer …`). The SPA never stores the
token.

Sessions last `JWT_EXPIRES_IN` (default 8h). There is no refresh token.
After expiry, sign in again.

---

## 5. Accounts

Production accounts are created from **People** (steward-only), not by
editing the database.

The seed emails (`steward@shankara.local`, `finance@shankara.local`,
`branch@shankara.local`) exist only because `npm run seed` created them
from `SEED_*_PASSWORD` in `backend/.env`. Those passwords must be
production values on the office server, never the laptop/dev values.

There is **no “forgot password”**. A locked-out user needs another
steward to reset them from People. Keep at least two steward accounts.

Never paste production passwords into chat, email, or this repo.

---

## 6. What to watch

**Security**

- Rate limiting is per-IP. Behind Caddy, `TRUST_PROXY=true` is required
  or the whole office shares one 100 req/min bucket. Login is 10/min.
- Uploads are `.xlsx` / `.xls` / `.csv`, content-sniffed (ZIP / OLE / text).
- Signed-in users change their own password at `/account`. There is still
  no email forgot-password.
- Do not render unsanitized user input as HTML. Auth is cookie-based;
  XSS would still be a session-theft path via CSRF-same-origin actions,
  even though the token itself is not readable from JS.

**Reliability**

- Confirm `shankara-backup.timer` is actually enabled.
  `systemctl list-timers` — do not assume.
- No monitoring. A crash pages no one. `journalctl -u shankara-backend -e`
  is the log.
- Single Postgres, single Node process, one machine.

**Data**

- Manual add/edit/delete is **instant**. Spreadsheet upload always stops
  at “held” until a steward clicks Merge.
- Never run `npm run test:e2e` against the live database. The suite
  refuses unless `E2E_DATABASE_NAME` is a throwaway name.

---

## 7. Key paths

| Path | What |
|---|---|
| `backend/.env` | Secrets. `0600`, never committed |
| `docs/ARCHITECTURE.md` | Data model, API, known limitations |
| `OFFICE_DECISIONS.md` | Hardware / network / secrets ownership |
| `ops/` | Backup, restore, Caddyfile, systemd units |
| `backend/var/uploads` | Original uploaded files (in backups) |
| `frontend/dist` | What Caddy serves |

---

## 8. Diagnostics

```bash
curl -sS http://127.0.0.1:3000/api/health
sudo systemctl status shankara-backend caddy
sudo journalctl -u shankara-backend -n 100 --no-pager
sudo docker compose -f /opt/shankara-erp/docker-compose.yml logs --tail=50 postgres
```

In the app: steward **Dev** pill (top-right) — health + last 50 requests,
this browser tab only.

```bash
cd backend
npm test
E2E_DATABASE_NAME=shankara_erp_e2e DATABASE_PORT=5432 npm run test:e2e
```

Restore:

```bash
./ops/restore.sh --yes-really latest
```

Destructive. Requires `--yes-really`. See `ops/README.md`.
