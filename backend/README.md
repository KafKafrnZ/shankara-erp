# Shankara ERP — backend

Item catalog search, filter, and CRUD system for Shankara Buildpro. NestJS 11,
PostgreSQL 16 via **PgBouncer :6432** for the app, direct Postgres **:5432**
for pg-boss (its `LISTEN`/`NOTIFY` job queue needs a real connection,
transaction pooling breaks it). TypeORM with `synchronize: false` — schema
changes only ever happen through migrations.

See `../docs/ARCHITECTURE.md` for the full system reference (data model, API
surface, roles, known limitations). This file is just how to run it.

## Run (host)

1. Copy `backend/.env.example` → `backend/.env` and fill in secrets.
2. From the repo root: `docker compose up -d` (starts Postgres, pgbouncer, redis)
3. `cd backend && npm ci`
4. `npm run migration:run`
5. `npm run seed` (creates the steward/finance/branch users from `SEED_*_PASSWORD` in `.env`)
6. `npm run start:dev` → `GET http://127.0.0.1:3000/api/health` should return `{"status":"ok","db":"ok",...}`
7. Frontend: `cd frontend && npm ci && npm run dev` → `http://127.0.0.1:5173`

Seeded users: `steward@shankara.local`, `finance@shankara.local`,
`branch@shankara.local` — passwords from `.env`.

## Tests

```bash
npx tsc --noEmit
npm test                # unit
npm run test:e2e        # e2e — see the warning below first
```

**Never point `test:e2e` at the real database.** `test/setup-e2e-env.ts`
refuses to run unless `DATABASE_NAME` is an isolated scratch database (or
`CI` is set) — the scratch DB needs migrations run against it separately,
same as the real one:

```bash
E2E_DATABASE_NAME=shankara_erp_e2e DATABASE_PORT=5432 npm run migration:run
E2E_DATABASE_NAME=shankara_erp_e2e DATABASE_PORT=5432 npm run test:e2e
```

## Fixtures

`fixtures/item-master/` holds the `.xlsx` files the parser tests and e2e
tests upload. `sap-fixture.xlsx` and `cp-fixture.xlsx` are reproducible via
`node generate_fixtures.js`; `test-fixture-1.xlsx` and `tiny.xlsx` are
committed directly.
