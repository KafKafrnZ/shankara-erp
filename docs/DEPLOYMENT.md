# Shankara ERP — office-server go-live

Hand this to whoever will put the system on a real machine so people in
the office can open a URL and use it.

This is the **first-deployment runbook**. Day-to-day operations live in
[`OPS.md`](OPS.md). End-user language lives in [`USER_GUIDE.md`](USER_GUIDE.md).
Physical/network decisions the code cannot make live in
[`../OFFICE_DECISIONS.md`](../OFFICE_DECISIONS.md). Backup scripts and the
Caddy config live in [`../ops/`](../ops/). The system itself is described in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

The pieces in `ops/` were live-tested against this app. This document
sequences them, fills the gaps that were never in git (systemd units,
firewall, production `.env`, data move from the laptop), and names what
must be decided **before** anyone starts typing commands.

---

## 0. What “live” actually means

This system is built as an **on-prem, LAN-only** catalog. It is not a
public website.

| Who | Can they open the link? |
|---|---|
| A PC on the Bangalore office Wi‑Fi / LAN | Yes — that is the design. |
| Someone at home, another city, or on mobile data | **No**, not with this setup. The hostname has no public DNS, the TLS cert is a private office CA, and the firewall only opens 80/443 to the LAN. The link will not resolve. |

If the IT head’s real requirement is “anyone with the URL, from anywhere,”
that is a **different** deployment: a VPN (Tailscale / WireGuard — recommended)
so remote staff join the office LAN, **or** a public domain + Let’s Encrypt +
router port-forward, which turns a back-office tool into an internet-facing
login page. Do not do the public path until monitoring, unique secrets, and
the go-live checklist below are in place. VPN does not require any app change.

The URL people will bookmark looks like:

```
https://erp.shankara.local
```

(or whatever hostname IT picks in §1). After Caddy is up, there is no
`:5173` and no `:3000` in that URL. Caddy serves the built frontend and
proxies `/api/*` to the backend on the same machine.

---

## 1. Decide these first — do not skip

From `OFFICE_DECISIONS.md`. Several of these **block** later steps. Raise
them with the IT head before deploy day, not during it.

1. **Where do backups physically live?** Not the same disk as Postgres. A
   NAS, external drive, or second machine. One env var (`BACKUP_DIR`) once
   chosen. Same-disk backups die with the server.
2. **Are uploads on redundant storage?** `backend/var/uploads` holds every
   original `.xlsx` ever uploaded. RAID / NAS-backed disk survives a live
   disk failure without a restore.
3. **Which machine is “the server”?** One on-prem box running Docker
   (Postgres, pgbouncer, redis), the Node backend, and Caddy. Confirm it
   exists, has the spec in §3, and someone owns patching / disk / uptime.
4. **How do office PCs find it?** Real internal DNS (`erp.shankara.local` →
   the server’s LAN IP) is the clean answer. Fallback: a `hosts` file entry
   on each PC. TLS will not work off a raw IP in a useful way.
5. **Who can log into the server itself?** SSH and physical access to the
   machine that holds the catalog.
6. **Power.** A UPS, or an office outage takes the ERP down with it.
7. **Who holds production secrets?** `JWT_SECRET`, database password, first
   steward password. Someone owns `backend/.env` (mode `0600`), and what
   happens when it must be rotated.

Also decide, explicitly:

8. **Linux or Windows?** **Linux (Debian 12 or Ubuntu 22.04/24.04 LTS).**
   Every ops file in this repo assumes it: `ops/backup.sh` is bash,
   `ops/Caddyfile` is a Linux Caddy install, Compose and CI run on Linux.
   Windows is possible only as **WSL2 + Docker Desktop**, running the same
   Linux stack inside Windows. Do not treat a native Windows service as a
   first path.
9. **Fresh empty catalog, or copy the laptop’s data?** The current laptop
   already has a working catalog (~177k live items, daily dumps under
   `backups/`). Copying it is a restore, not a re-upload. See §6.

---

## 2. What already exists in this repo (do not reinvent)

| Path | Role |
|---|---|
| `docker-compose.yml` | Data tier only: Postgres 16, pgbouncer, redis. Backend and frontend are **not** containers. |
| `backend/.env.example` | Every required env var. Copy, never commit the filled file. |
| `ops/Caddyfile` | HTTPS on the LAN via Caddy’s internal CA. Serves `frontend/dist`, proxies `/api/*` → `127.0.0.1:3000`. |
| `ops/backup.sh` / `ops/restore.sh` | `pg_dump` + uploads tarball via `docker exec`. Restore is destructive and requires `--yes-really`. Live-drilled. |
| `ops/README.md` | Backup scheduling, Caddy install, per-device CA trust, DNS. |
| `ops/systemd/` | Unit files this runbook installs. Paths default to `/opt/shankara-erp`. |
| `docs/ARCHITECTURE.md` §11 | Honest list of what is still not production-hardened. |

Architecture in one picture:

```
Browser ──HTTPS──▶ Caddy :443  (static frontend + /api proxy)
                      │
                      ▼
                NestJS :3000 ──▶ pgbouncer :6432 ──▶ Postgres :5432
                      │                                   ▲
                      └── pg-boss (LISTEN/NOTIFY, :5432) ─┘
                      └── Redis :6379 (provisioned, not used for cache yet)
```

pg-boss **must** talk to Postgres on **:5432**, not pgbouncer. Transaction
pooling breaks `LISTEN`/`NOTIFY`. That is why `JOBS_DATABASE_PORT=5432`
exists in `.env`. Do not “simplify” it.

Redis is in Compose for a future shared cache. It is not wired into the
backend today. Leave it running; do not point the app at it.

---

## 3. Hardware

Measured on the live laptop catalog: **~287 MB** database (177k items) and
**~62 MB** of uploaded files. Small system. Do not over-buy.

| Spec | Why |
|---|---|
| 4 vCPU | One Node process + Postgres + pgbouncer + redis + Caddy. Stress-tested to ~85–95 req/s on a busy machine; office search traffic is well under that. |
| 8 GB RAM | Comfortable, not a bare minimum. |
| 100 GB SSD | Years of growth, local backup staging, Docker images. |
| Static LAN IP | DNS, TLS, and Caddy are all keyed to one address. |

An office mini-PC or a modest VM is enough. Docker binds Postgres
(`5432`), pgbouncer (`6432`), and redis (`6379`) to **127.0.0.1 only**.
They are not meant to be reachable from other machines.

---

## 4. Git: which branch to deploy

Remote: `https://github.com/KafKafrnZ/shankara-erp.git`

Deploy **`master`**. It is the default branch and the live office line
(catalog CRUD, Alias merge identity, httpOnly auth cookie, Windows host
TLS/ops fixes). Do not look for `local/office-followup` — that branch was
folded into `master` and deleted.

```bash
git clone https://github.com/KafKafrnZ/shankara-erp.git /opt/shankara-erp
cd /opt/shankara-erp
```

---

## 5. Provision the server

Fresh Debian 12 or Ubuntu 22.04/24.04 LTS. Non-root sudo user. Static LAN
IP. Docker enabled on boot.

### 5.1 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker
# log out and back in so the docker group applies
docker compose version
```

### 5.2 Node.js 22 LTS

The app is Nest 11 + Vite 8. Use an even LTS (20, 22, or 24). **22 LTS is
the recommended default.** Do not use a current odd release on the office
server.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # v22.x
which node        # /usr/bin/node  — must match ops/systemd/shankara-backend.service
```

### 5.3 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo systemctl stop caddy     # started in §8 after the Caddyfile is real
```

(Other distros: https://caddyserver.com/docs/install)

### 5.4 Firewall

Only SSH and Caddy need to be reachable from the LAN.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status
```

Confirm from another office PC that `:5432`, `:6432`, `:6379`, and `:3000`
are **not** reachable. They bind to localhost on the server.

### 5.5 System user

```bash
sudo useradd --system --home /opt/shankara-erp --shell /usr/sbin/nologin shankara
```

---

## 6. Code, secrets, data tier

```bash
sudo mkdir -p /opt/shankara-erp
sudo git clone https://github.com/KafKafrnZ/shankara-erp.git /opt/shankara-erp
cd /opt/shankara-erp
sudo cp backend/.env.example backend/.env
```

### 6.1 Production `.env` — do not copy the laptop’s file

The laptop `.env` is a **dev** file. Seed passwords and `JWT_SECRET` from
it must not land on the office server.

Generate new values:

```bash
openssl rand -base64 48    # JWT_SECRET  (must be ≥ 32 characters)
openssl rand -base64 24    # POSTGRES_PASSWORD and DATABASE_PASSWORD — same value
openssl rand -base64 16    # SEED_STEWARD_PASSWORD
openssl rand -base64 16    # SEED_FINANCE_PASSWORD
openssl rand -base64 16    # SEED_BRANCH_PASSWORD
```

Edit `backend/.env` and set **all** of these (keys already exist):

| Key | Production value |
|---|---|
| `NODE_ENV` | `production` — turns on the `Secure` flag on the auth cookie. Without this, browsers on HTTPS may still accept it, but the cookie contract is wrong. |
| `PORT` | `3000` |
| `CORS_ORIGIN` | `https://erp.shankara.local` (the real hostname from §1, including `https://`) |
| `DATABASE_HOST` | `127.0.0.1` |
| `DATABASE_PORT` | `6432` (pgbouncer) |
| `JOBS_DATABASE_PORT` | `5432` (direct Postgres, for pg-boss) |
| `DATABASE_USER` / `POSTGRES_USER` | `shankara_admin` |
| `DATABASE_PASSWORD` / `POSTGRES_PASSWORD` | the generated value, **identical** |
| `DATABASE_NAME` / `POSTGRES_DB` | `shankara_erp` |
| `JWT_SECRET` | generated, ≥ 32 chars |
| `JWT_EXPIRES_IN` | `8h` |
| `TRUST_PROXY` | `false` until Caddy is in front, then `true` in §8 |
| `STORAGE_DIR` | `./var/uploads` |
| `SEED_*_PASSWORD` | generated unique values. Hand the steward password to one person, in person, once. |

```bash
sudo chmod 600 /opt/shankara-erp/backend/.env
sudo chown shankara:shankara /opt/shankara-erp/backend/.env
```

`docker-compose.yml` reads the same `backend/.env` for the Postgres
container. A symlink `.env -> backend/.env` already exists at repo root
for Compose variable substitution (`DATABASE_PASSWORD` etc.). Keep it.

### 6.2 Start the data tier

```bash
cd /opt/shankara-erp
sudo docker compose up -d
sudo docker compose ps
# shankara-postgres should be (healthy)
# shankara-pgbouncer and shankara-redis should be Up
```

Compose uses `restart: unless-stopped`. After `docker` is enabled on boot,
the three containers come back after a reboot.

### 6.3 Schema

```bash
cd /opt/shankara-erp/backend
sudo -u shankara npm ci
sudo -u shankara npm run migration:run
```

If `npm ci` cannot run as `shankara` because `/opt` is root-owned, either
`sudo chown -R shankara:shankara /opt/shankara-erp` (simplest) or run
`npm ci` as the deploy user and then `chown` `node_modules`, `dist`, and
`var`. The backend process user **must** be able to write `backend/var/uploads`.

### 6.4 Data: empty seed vs restore from the laptop

**Option A — empty catalog (new office server)**

```bash
cd /opt/shankara-erp/backend
sudo -u shankara npm run seed
```

Creates `steward@shankara.local`, `finance@shankara.local`,
`branch@shankara.local` with the **production** `SEED_*_PASSWORD` values.
Then a steward uploads a fresh Tally `.xlsx` through the UI.

**Option B — bring the laptop catalog with you (recommended if that
catalog is already the real one)**

On the laptop (while Docker is up):

```bash
cd /home/dante/projects/shankara-erp   # or wherever the laptop clone lives
./ops/backup.sh
# produces backups/db-<timestamp>.dump and backups/uploads-<timestamp>.tar.gz
```

Copy **both** files to the server (USB, scp, NAS). On the server, after
migrations in 6.3 — **not** after seed, or you will replace seed users
anyway:

```bash
sudo mkdir -p /opt/shankara-erp/backups
# copy the two files in
sudo ./ops/restore.sh --yes-really db-YYYYMMDDThhmmssZ.dump uploads-YYYYMMDDThhmmssZ.tar.gz
```

Restore drops and recreates every table. It is supposed to. `pg_restore`
prints three “cannot drop inherited constraint” lines for pg-boss
partition internals; the script already treats those as safe.

After a restore:

- Production `SEED_*_PASSWORD` values in `.env` **do not** change the
  restored users. Those users still have the laptop hashes.
- **Reset the steward password immediately** from a one-off script or by
  logging in with the old laptop password (if you still have it) and using
  People admin. Do not leave laptop/dev passwords on the office server.
- `JWT_SECRET` is new, so every old token is already invalid. Fine.

### 6.5 Production builds

```bash
cd /opt/shankara-erp/backend
sudo -u shankara npm run build          # -> backend/dist

cd /opt/shankara-erp/frontend
sudo -u shankara npm ci
sudo -u shankara npm run build          # -> frontend/dist  (Caddy serves this)
```

Confirm `backend/dist/main.js` and `frontend/dist/index.html` exist.

---

## 7. Run the backend as a service

`npm run start:dev` dies when the terminal closes and does not survive a
reboot. Production uses systemd.

Edit the paths in `ops/systemd/shankara-backend.service` if the clone is
not `/opt/shankara-erp`. Then:

```bash
sudo cp /opt/shankara-erp/ops/systemd/shankara-backend.service \
        /etc/systemd/system/shankara-backend.service
sudo chown -R shankara:shankara /opt/shankara-erp
sudo systemctl daemon-reload
sudo systemctl enable --now shankara-backend
sudo systemctl status shankara-backend
curl -sS http://127.0.0.1:3000/api/health
# expect: {"status":"ok","db":"ok",...}
```

The frontend has **no process** in production. Caddy serves the static
build.

Restart after a backend code change:

```bash
cd /opt/shankara-erp
sudo -u shankara git pull
cd backend && sudo -u shankara npm ci && sudo -u shankara npm run build
sudo systemctl restart shankara-backend
```

Frontend code change: rebuild `frontend/` then `sudo systemctl reload caddy`
(no backend restart needed).

---

## 8. TLS, hostname, and office devices

Already built. Full notes: `ops/README.md`. Condensed path:

1. Edit `ops/Caddyfile`:
   - Hostname: `{$ERP_HOSTNAME:erp.shankara.local}` — export
     `ERP_HOSTNAME` in Caddy’s environment, or replace the line with the
     real name.
   - `root *` **must** become the absolute path
     `/opt/shankara-erp/frontend/dist` (the committed file is a
     placeholder `/path/to/shankara-erp/frontend/dist`).
2. Install and start:

```bash
sudo cp /opt/shankara-erp/ops/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

3. **Now** set `TRUST_PROXY=true` in `backend/.env` and
   `sudo systemctl restart shankara-backend`. Do this only after Caddy is
   actually in front. Without it, every request looks like `127.0.0.1` and
   the per-IP rate limiter (100/min default, 10/min on login) becomes one
   shared bucket for the whole office. Setting it `true` *without* a proxy
   lets a client spoof `X-Forwarded-For`.

4. DNS: create `erp.shankara.local` (or the chosen name) → the server’s
   LAN IP on internal DNS. Fallback, per machine:

   - Windows: `C:\Windows\System32\drivers\etc\hosts`
   - macOS / Linux: `/etc/hosts`

   ```
   192.168.x.x    erp.shankara.local
   ```

5. Trust Caddy’s internal CA **once per device**. Public CAs will not
   issue a cert for a `.local` name on a machine that is not on the public
   internet.

```bash
sudo find /var/lib/caddy/.local/share/caddy/pki -name root.crt
```

Copy that `root.crt` to each office PC:

- Windows: double-click → Install Certificate → Local Machine → Trusted
  Root Certification Authorities. A domain-joined office can push this
  with Group Policy instead of visiting every desk.
- macOS: Keychain Access → always trust.
- Linux: `/usr/local/share/ca-certificates/` then `update-ca-certificates`.

Until the CA is trusted, browsers show a scary warning. That is expected.
After trust, it is a normal padlock.

Verify from the server:

```bash
curl -k https://erp.shankara.local/api/health
curl -k https://erp.shankara.local/api/auth/me
# 401 on /api/auth/me means Caddy reached the real Nest process, not a stub
```

From an office PC with the CA trusted (no `-k`):

```bash
curl https://erp.shankara.local/api/health
```

Then open `https://erp.shankara.local` in a browser, log in as steward,
search something known (e.g. a brand that exists in the catalog).

Auth is an `httpOnly`, `SameSite=Strict` cookie (`sb_token`). In
`NODE_ENV=production` it is also `Secure`, so it is only sent on HTTPS.
The Vite dev server is **not** used in production; do not leave
`npm run dev` running on the office server.

---

## 9. Schedule backups

The scripts work. They do nothing until something calls them.

Edit `ops/systemd/shankara-backup.service` and set `BACKUP_DIR` to the
off-box path from §1. Then:

```bash
sudo mkdir -p /mnt/nas/shankara-backups          # whatever was decided
sudo cp /opt/shankara-erp/ops/systemd/shankara-backup.service \
        /etc/systemd/system/shankara-backup.service
sudo cp /opt/shankara-erp/ops/systemd/shankara-backup.timer \
        /etc/systemd/system/shankara-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now shankara-backup.timer
sudo systemctl start shankara-backup             # run once now, do not wait for 02:00
ls /mnt/nas/shankara-backups                     # a .dump and a .tar.gz
```

**Restore drill, once, before calling this done.** A backup nobody has
restored is a hope. Against a throwaway copy, or in a maintenance window:

```bash
./ops/restore.sh --yes-really latest
```

Then check row counts (`item_master_row`, `app_user`) match what you
expected. See `ops/README.md` for the known-safe pg-boss warnings.

Default retention is 14 days (`RETENTION_DAYS`).

---

## 10. Reboot test

```bash
sudo reboot
```

After it comes back:

```bash
sudo docker compose -f /opt/shankara-erp/docker-compose.yml ps
sudo systemctl is-active shankara-backend caddy
curl -sS http://127.0.0.1:3000/api/health
curl -k https://erp.shankara.local/api/health
```

If any of those fail, do not hand the URL to staff.

---

## 11. Go-live checklist

Print this. Tick it on the server, not from memory.

- [ ] Linux (Debian/Ubuntu), not a native Windows install
- [ ] Deployed branch is `master`
- [ ] `JWT_SECRET` and DB password generated on this machine — not copied from the laptop
- [ ] Steward / finance / branch passwords are unique production values, given to real people, not shared in chat
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN=https://<real-hostname>`
- [ ] `TRUST_PROXY=true` **and** Caddy is the only way in
- [ ] `backend/.env` is `0600`, owned by `shankara`
- [ ] `shankara-backend.service` enabled; reboot-tested
- [ ] Caddy enabled; `root *` points at the real `frontend/dist`
- [ ] Firewall: only 22/80/443 from the LAN; :3000/:5432/:6432/:6379 not reachable off-box
- [ ] Internal DNS or hosts file on every PC that needs access
- [ ] Caddy root CA trusted on those PCs
- [ ] Backup timer enabled, `BACKUP_DIR` is off-box, one backup taken, one restore drilled
- [ ] A real Tally `.xlsx` uploaded and published **on this instance** (or a restore of the laptop catalog verified by search)
- [ ] Steward can open People and create a second steward so one locked-out person is not a disaster (there is no self-service password reset)
- [ ] Nobody shares the steward account
- [ ] Staff get [`USER_GUIDE.md`](USER_GUIDE.md), not this file

---

## 12. What this runbook does not cover (known, not forgotten)

From `ARCHITECTURE.md` §11, still true after the 2026-08-28 cookie and
upload-sniff work:

- **No monitoring / alerting.** A 2am crash pages no one. The in-app Dev
  Panel (steward, top-right) is the only live view. Pick a vendor before
  treating overnight uptime as someone else’s problem.
- **Single machine, single Node process, single Postgres.** Fine for one
  office. There is no replica and no cluster.
- **Per-process caches.** Do not run two backend instances until Redis is
  actually wired for cache invalidation on publish.
- **No self-service password recovery.** A locked-out steward needs
  another steward (People screen) or a server admin.
- **Uploads accept `.xlsx`, `.xls`, and `.csv`.** Extension and bytes
  must agree (ZIP / OLE / text). A renamed PDF still gets a
  plain-language 400 at the door.
- **Manual add/edit/delete publishes instantly.** Spreadsheet uploads
  still stop at a review (“held”) step. A typo in the drawer is live
  until someone edits again.
- **Catalog is not company-scoped.** `branch` / `companyId` on the user
  row do not filter search. Fine with one company; a hole the moment a
  second legal entity is onboarded.

None of these block go-live at office scale. They block “put it on the
public internet” and “serve three cities from this one box.”

---

## 13. Rollback

If a release misbehaves:

```bash
sudo systemctl stop shankara-backend
cd /opt/shankara-erp
sudo ./ops/restore.sh --yes-really latest
cd backend && sudo -u shankara git checkout <known-good-sha>
sudo -u shankara npm ci && sudo -u shankara npm run build
sudo systemctl start shankara-backend
```

Frontend rollback: check out the same sha, `npm run build` in `frontend/`,
`sudo systemctl reload caddy`.

Do not run `npm run test:e2e` against the production database. The suite
refuses unless `E2E_DATABASE_NAME` names a throwaway DB. Do not bypass
that guard.

---

## 14. First hour with staff

1. Open `https://erp.shankara.local` on an office PC that has the CA
   trusted. Confirm the padlock.
2. Log in as steward. Search a brand you know exists.
3. Create real user accounts under **People**. Do not keep using the seed
   emails for daily work if you can avoid it.
4. Hand finance/branch their own logins. Send them [`USER_GUIDE.md`](USER_GUIDE.md).
5. Watch one steward upload (or confirm the restored catalog). The
   “Merge into catalog” click is the point of no return for that file.

After that, this document can live in the repo. Day-to-day is [`OPS.md`](OPS.md).
