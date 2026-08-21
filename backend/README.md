# Shankara Buildpro — backend

Read-only Tally Day Book **and** Sales Register ingest / search / retrieve. NestJS 11, PostgreSQL 16 via **PgBouncer :6432**, TypeORM `synchronize: false`. OpenSearch is a projection of published current vouchers, not the retrieve source of truth.

## Run (host)

1. Copy `backend/.env.example` → `backend/.env` and fill secrets. `DATABASE_PORT=6432`.
2. From repo root: `docker compose up -d`
3. `cd backend`
4. `npm ci`
5. `npx ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts`
6. `npx ts-node src/database/seed.ts`
7. `npm run start:dev` → `GET http://127.0.0.1:3000/api/health` must be `{"status":"ok","db":"ok",...}`
8. Frontend: `cd frontend && npm ci && npm run dev` → `http://127.0.0.1:5173`

Seeded users: `steward@shankara.local`, `finance@shankara.local`, `branch@shankara.local` (passwords from `.env`).

## Tests

```
npx tsc --noEmit -p tsconfig.build.json
npm test
npm run test:e2e
```

Fixture contract: `fixtures/daybook/EXPECTED.md`. Do not commit `.env`. Do not point TypeORM at raw Postgres `:5432`.
