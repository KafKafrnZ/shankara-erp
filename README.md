# Shankara ERP

Item catalog search, filter, and CRUD system for **Shankara Buildpro**.
Stewards upload item-master Excel exports from Tally; everyone else searches
and filters the live catalog by any column the file has. There is no
accounting/voucher module — that was retired; Tally remains the book of
record for transactions.

**Start here for the full picture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
— data model, every feature, the full API surface, roles, and a frank list
of what's not production-ready yet.

**Putting it on the office server** so people can open a URL:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Day-to-day ops:
[`docs/OPS.md`](docs/OPS.md). Staff who only search the catalog:
[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).

## Run

```bash
docker compose up -d                          # Postgres, pgbouncer, redis
cd backend && npm ci && npm run migration:run && npm run seed
npm run start:dev                             # http://127.0.0.1:3000/api/health
cd ../frontend && npm ci && npm run dev        # http://127.0.0.1:5173
```

Seed emails: `steward@shankara.local`, `finance@shankara.local`,
`branch@shankara.local`. Passwords are `SEED_*_PASSWORD` in `backend/.env`
(copy from `backend/.env.example` first) — never commit `.env` or a JWT.

## Repo layout

| Path | What |
|---|---|
| `backend/` | NestJS API — see `backend/README.md` |
| `frontend/` | React/Vite app — see `frontend/README.md` |
| `docs/ARCHITECTURE.md` | The detailed system reference |
| `docs/DEPLOYMENT.md` | First-time office-server go-live runbook (for IT) |
| `docs/OPS.md` | Standing ops reference once it is live |
| `docs/USER_GUIDE.md` | Plain-language guide for catalog users |
| `ops/` | Backup/restore, Caddy TLS config, systemd units — see `ops/README.md` |
| `OFFICE_DECISIONS.md` | Physical/network decisions the code can't make for you |

## What it is not

No accounting entries, no posting back to Tally, no GST filing, no mobile
app. Read-and-write for the catalog only; Tally is still where the numbers
that matter for accounting live.
