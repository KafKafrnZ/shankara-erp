# PHASE 1 COMPLETION BRIEF — PRODUCTION BAR

**Document type:** Binding work order for the implementing agent  
**Product:** Shankara Buildpro — Tally Data Access Layer (read-only)  
**Repo:** `D:/5ingularity/shankara-erp`  
**Audience:** Gemini (or any implementer). Not a status blog. Not a student assignment.  
**Date:** 2026-08-18  
**Phase 2:** FORBIDDEN until every box in §12 is checked with evidence.

---

## 0. READ THIS BEFORE YOU TOUCH A FILE

You are finishing **Phase 1 of a financial production system** used by 1,000–5,000 people at a listed Indian building-materials company. The data is real company books (Tally Day Book exports). A wrong duplicate voucher, a missing debit line, or an open search with no login is a **production incident**, not a “nice to have.”

This is **not**:

- a college ERP demo
- a Nest + React tutorial
- a Docker showcase
- a Tally replacement
- a dashboard mock

This is **not done** because compose runs and a search box is drawn on screen.

**Previous failure (do not repeat):** An earlier pass declared “Phase 1 Complete” after scaffolding empty Nest modules, a Hello World API, hardcoded secrets, and a fake UI. Upload, parse, search, and retrieve did not exist. That report then listed the actual Phase 1 product as “Phase 2.” If you do that again, the work is rejected in full.

### 0.1 How you will be judged

A human will:

1. Start compose, run migrations, start API + UI.
2. Log in as the seeded steward.
3. Upload `fixtures/daybook/sample-daybook.xlsx` with no code changes.
4. Search three queries (voucher number fragment, party typo, amount).
5. Open a voucher and see ledger lines.
6. Re-upload the same file and confirm row counts do not double.
7. Call every mutating route without a token and expect `401`.
8. Read `git grep` for `supersecretpassword` and `Hello World` — both must be gone.
9. Run the test suite. If the tests listed in §10 do not exist or do not pass, Phase 1 is not done.

If any of those fail, **you are not finished**. Do not write “Phase 1 complete.” Do not start Phase 2. Do not add AG Grid, OpenSearch query DSLs, Kafka, GraphQL, GST, or dashboards to look busy.

### 0.2 College-grade vs production-grade (same feature)

| Feature | College (REJECT) | Production (REQUIRED) |
|---|---|---|
| Auth | “Steward” badge in CSS; no login | JWT (or httpOnly session). Unauthenticated `/api/*` except `/api/auth/login` and `/api/health` returns **401**. Roles enforced on the server. |
| Upload | `multer` saves a file, `console.log` the name | SHA-256, object store, `ingest_batch` row, idempotent, original file retained, lineage on every fact row. |
| Parse | `xlsx` reads sheet to JSON, first row = headers | Tally title-block skip, header fingerprint, skip Opening/Closing/Grand Total, Indian numbers, Excel serial dates, row-level rejects. |
| Save | `INSERT` in a loop | Staging table + one transaction + unique upsert. Re-upload does not duplicate. |
| Search | `LIKE '%q%'` in the controller, no auth | Parameterized SQL, RBAC company/branch filter **in the query**, ranked, paged. |
| As-of | Hardcoded `"17 Aug 2026"` | `MAX(published_at)` for the caller’s visible companies. Green “live” only if a batch exists. |
| Schema | `init.sql` edited by hand, no uniques | Migrations. Unique keys. No `ON DELETE CASCADE` on facts. |
| Config | Password in `app.module.ts` | `ConfigModule` + env. Compose uses `${POSTGRES_PASSWORD}`. `.env` not committed. |
| Tests | `it('should be defined')` | Fixture parse → N vouchers → search hit → GET lines. Idempotent re-ingest. 401 without token. |
| Done | README says complete | §12 evidence block filled with commands and outputs. |

If your change matches the left column, delete it and do the right column.

---

## 1. PRODUCT LAW (do not violate)

1. **Tally is the book of record.** This system does not post, alter, delete, or write back to Tally. There is **no** “Create Voucher” button, route, or table trigger that invents accounting.
2. **We store what the file said**, including amounts we would have rounded differently. We are a mirror with an index, not a second calculator.
3. **If Tally and this system disagree, Tally wins.** Every fact row points at `batch_id` + `source_row_no`. The original file is kept.
4. **Unpublished batches are invisible** to finance/branch search. Only `steward` can see `held` / `processing` / `rejected`.
5. **Never silent-overwrite.** Same business key + different content → new version (`valid_to` on old, new row `valid_from`). Same SHA-256 → no-op.
6. **Never hard-delete financial facts.** No `ON DELETE CASCADE` from `voucher` to `voucher_line`. Soft-delete / unpublish only, and that is audited.
7. **RBAC is in the query**, not after the query. Filtering a result set in JS after `SELECT *` is a data leak.
8. **Always show data-as-of.** A faster stale number with no timestamp is a defect.
9. **Phase 1 is one company, one report type: Tally Day Book Excel.** No Sales Register, no XML, no ODBC, no stock, no GST filing.
10. **Postgres is the retrieve source of truth.** OpenSearch is **not** required to exit Phase 1. Do not spend Phase 1 building a search cluster. A correct SQL search that is fast on the fixture + 50k synthetic rows is enough.

---

## 2. CURRENT REPO — START HERE, DO NOT RE-SCAFFOLD

The repo already exists. **Do not run `nest new` or `npm create vite` again.** Do not create a second backend or frontend.

| Path | What it is | What you must do |
|---|---|---|
| `docker-compose.yml` | Postgres 16, PgBouncer, Redis, OpenSearch | Parameterize secrets. API must use **PgBouncer :6432**. Redis optional in Phase 1 (sessions). **Do not** wire OpenSearch for Phase 1 exit. Leave the service in compose if you want; do not build features on it. |
| `init.sql` | First-cut tables, **insufficient** | Stop treating this as live schema after you add migrations. Replace with a bootstrap that only creates the DB/extensions if needed. All table changes go through **TypeORM migrations**. |
| `backend/` | NestJS 11, TypeORM connected to localhost:5432 with a hardcoded password | Env config. Connect through PgBouncer. Delete Hello World. Implement modules below. |
| `backend/src/ingest/*` | Empty controller/service | Implement for real, or replace with the module layout in §6. No empty classes in `src/` when you finish. |
| `backend/src/database/database.module.ts` | Empty module | Either implement (entities + migrations registration) or delete it. No empty `@Module({})`. |
| `frontend/` | Vite React mock search UI | Wire to API. Remove Vite leftover `index.css` chrome (`#root { width: 1126px }`). Working upload + search + voucher pane. |
| `.gitignore` | Ignores `.env` | Keep. Add `uploads/`, `*.xlsx` except fixtures if needed. **Never commit `.env`.** |
| Secrets in git | `supersecretpassword` in compose + `app.module.ts` | Remove. Rotate. Use `.env.example` with placeholders only. |

Locked stack (do not substitute):

- Backend: **NestJS + TypeScript**
- DB: **PostgreSQL 16** via **PgBouncer transaction mode**
- ORM: **TypeORM** with `synchronize: false` **forever**
- Jobs: in-process or **BullMQ + Redis** for parse (parse must not block the HTTP thread)
- Frontend: **React + Vite**
- Search Phase 1: **SQL on Postgres**
- Files: local disk object-store port (interface must look like S3: `put` / `get` / `head`). No AWS account required.

Do **not** add: Prisma, GraphQL, Kafka, Mongo, Firebase, Next.js, Tailwind-as-rewrite, AG Grid Enterprise, OpenSearch client, GST modules, voucher posting.

TypeORM version: the lockfile has `typeorm@1.1.0`. Nest 11 allows `^0.3.0 || ^1.0.0-dev`. **Pin an explicit version. After config, `GET /api/health` must run `SELECT 1` through PgBouncer and return ok.** If 1.1.0 cannot run migrations cleanly, pin `typeorm@0.3.20` (or current 0.3.x) and update the lockfile. Do not leave `^1.1.0` floating.

---

## 3. PHASE 1 SCOPE LOCK

### In scope (you must ship all of this)

1. Config + secrets + health check through PgBouncer.
2. Auth: login, logout, JWT/session, three roles, seeded users.
3. Schema via migrations (exact tables in §5).
4. Object storage for original files.
5. Day Book upload → detect → parse → validate → upsert → publish.
6. Idempotent re-upload (SHA-256).
7. Versioned upsert on voucher business key.
8. Search API + retrieve API.
9. UI: login, upload (steward), search, voucher pane, live as-of, role badge from **token**.
10. Audit: login, upload, publish, unpublish, voucher open.
11. Tests in §10, all passing.
12. One synthetic 20k–50k row ingest to prove search stays under 200 ms p95 locally (document the number; no fake 5,000-user claim).

### Out of scope (do not implement)

- Any Tally report except Day Book Excel/CSV
- Tally XML / ODBC / Prime Server
- OpenSearch mappings, analyzers, “Google typo” engine
- AG Grid
- Cross-company mapping UI / saved templates
- Stock, GST returns, e-invoice, e-way, trial-balance calculator
- MFA TOTP app (leave `mfa_enabled BOOLEAN DEFAULT false` on users; do not fake MFA)
- Cloud deploy, Kubernetes, 5k load test, pen-test theatre
- Writing “enterprise” READMEs, badges, or architecture essays

If you finish early, **add tests and harden the parser**, do not start Phase 2 features.

---

## 4. QUALITY RULES (STRICT)

1. **No empty classes** in `backend/src` (`@Controller('ingest') export class IngestController {}` is a defect).
2. **No leftover Nest/Vite tutorial files** as user-facing surfaces: delete or replace `getHello()`, default README content in `backend/README.md` (replace with 20-line runbook), Vite `hero.png` unused assets, title `frontend`.
3. **No `TODO` / `coming soon` / `AG Grid will render here` in UI or API responses.** If a surface is not built, it must not appear.
4. **No `synchronize: true`.** Ever.
5. **No raw string SQL concatenation of user input.** Parameterized queries only.
6. **No `SELECT *` of all vouchers** returned to the browser.
7. **No passwords, tokens, or connection strings in source.** `git grep -n "supersecretpassword"` must be empty. `git grep -n "password:" -- backend/src` must not show literals.
8. **No `any` on ingest/search DTOs.** Strict DTO classes with `class-validator`.
9. **Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.**
10. **Global prefix `api`.** CORS allow only the Vite origin from env.
11. **Max upload size 50 MB** (env). Reject other types than `.xlsx .xls .csv .zip`.
12. **Parse in a worker / async job.** HTTP upload returns `202` + `batch_id` (or `200` if the same SHA-256 already published). Client polls `GET /api/batches/:id`.
13. **Do not load an entire million-row sheet as one in-memory array of objects if you can stream.** For `.xlsx`, use ExcelJS streaming reader (`WorkbookReader`) or equivalent. Document if a library forces a full read and cap rows with a clear error (`MAX_ROWS`, default 500_000).
14. **Money is `NUMERIC(15,2)`.** Parse Indian `1,25,000.50`, `125000.50 Dr`, `(125000.50)`. Never `float`.
15. **Dates stored as `DATE` in IST calendar sense** (the date printed on the voucher, not the upload instant). Accept Excel serials and `d-MMM-yy` / `dd-MM-yyyy`.
16. **Every handler that reads or writes facts logs an audit row.** Failure to write audit fails the request (same transaction where possible).
17. **IDs in APIs are opaque integers or ULIDs — do not leak filesystem paths.**
18. **Logging:** structured, no file contents, no passwords. Use Nest Logger.
19. **Errors:** never send stack traces to the client in production (`NODE_ENV=production`). Use a filter.
20. **You may not mark Phase 1 complete in any markdown file unless §12 is filled.**

---

## 5. DATABASE — EXACT TARGET SCHEMA

Create this with **TypeORM migrations**, not by editing `init.sql` on a dirty volume.

Instructions for existing Docker volumes: document `docker compose down -v` **once** for the schema reset (dev only), then migrations own the schema. After that, never `-v` as the “migration strategy.”

Use `uuid` or `bigint` consistently. Prefer `BIGSERIAL` / `BIGINT` for facts.

### 5.1 Required tables

```sql
-- identity
CREATE TABLE app_user (
  id              BIGSERIAL PRIMARY KEY,
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('steward', 'finance', 'branch')),
  company_id      TEXT,          -- required when role = branch; null = all companies for steward/finance in Phase 1
  branch_id       TEXT,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_event (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT REFERENCES app_user(id),
  action       TEXT NOT NULL,  -- login, login_failed, upload, publish, unpublish, voucher_open, search
  entity_type  TEXT,
  entity_id    TEXT,
  ip           INET,
  user_agent   TEXT,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_at ON audit_event (at DESC);
CREATE INDEX idx_audit_user ON audit_event (user_id, at DESC);

-- files + batches
CREATE TABLE source_file (
  id           BIGSERIAL PRIMARY KEY,
  sha256       CHAR(64) NOT NULL UNIQUE,
  storage_key  TEXT NOT NULL,
  original_name TEXT NOT NULL,
  byte_size    BIGINT NOT NULL,
  content_type TEXT,
  uploaded_by  BIGINT NOT NULL REFERENCES app_user(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ingest_batch (
  id              BIGSERIAL PRIMARY KEY,
  source_file_id  BIGINT NOT NULL REFERENCES source_file(id),
  file_sha256     CHAR(64) NOT NULL,
  tally_company   TEXT NOT NULL,
  company_id      TEXT NOT NULL,
  branch_id       TEXT,
  report_type     TEXT NOT NULL CHECK (report_type IN ('DAY_BOOK')),
  period_from     DATE,
  period_to       DATE,
  status          TEXT NOT NULL CHECK (status IN (
                    'uploaded', 'detecting', 'parsing', 'validating',
                    'held', 'publishing', 'published', 'rejected', 'duplicate'
                  )),
  total_rows      INT NOT NULL DEFAULT 0,
  accepted_rows   INT NOT NULL DEFAULT 0,
  rejected_rows   INT NOT NULL DEFAULT 0,
  debit_sum       NUMERIC(18,2),
  credit_sum      NUMERIC(18,2),
  error_summary   TEXT,
  uploaded_by     BIGINT NOT NULL REFERENCES app_user(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ,
  published_by    BIGINT REFERENCES app_user(id),
  UNIQUE (file_sha256)  -- one successful identity per bytes; duplicate uploads point at this row
);

CREATE TABLE ingest_reject (
  id            BIGSERIAL PRIMARY KEY,
  batch_id      BIGINT NOT NULL REFERENCES ingest_batch(id),
  source_row_no INT NOT NULL,
  code          TEXT NOT NULL,
  message       TEXT NOT NULL,
  raw           JSONB
);
CREATE INDEX idx_reject_batch ON ingest_reject (batch_id);

CREATE TABLE master_ledger (
  id            BIGSERIAL PRIMARY KEY,
  company_id    TEXT NOT NULL,
  ledger_name   TEXT NOT NULL,
  parent_group  TEXT,
  gstin         TEXT,
  is_party      BOOLEAN NOT NULL DEFAULT FALSE,
  extra         JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (company_id, ledger_name)
);

CREATE TABLE voucher (
  id              BIGSERIAL PRIMARY KEY,
  batch_id        BIGINT NOT NULL REFERENCES ingest_batch(id),
  company_id      TEXT NOT NULL,
  branch_id       TEXT,
  tally_guid      TEXT,
  vch_no          TEXT,
  vch_no_norm     TEXT,             -- lowercase, strip / - space
  vch_type        TEXT NOT NULL,
  vch_date        DATE NOT NULL,
  party_name      TEXT,
  total_amount    NUMERIC(15,2),
  narration       TEXT,
  source_row_no   INT,
  extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to        TIMESTAMPTZ,      -- null = current version
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voucher_current_key UNIQUE NULLS NOT DISTINCT
    (company_id, vch_type, vch_no, vch_date, valid_to),
  CONSTRAINT voucher_guid_current UNIQUE NULLS NOT DISTINCT
    (company_id, tally_guid, valid_to)
);

CREATE INDEX idx_voucher_search_no     ON voucher (company_id, vch_no_norm);
CREATE INDEX idx_voucher_search_date   ON voucher (company_id, vch_date);
CREATE INDEX idx_voucher_search_party  ON voucher (company_id, party_name);
CREATE INDEX idx_voucher_current       ON voucher (company_id) WHERE valid_to IS NULL AND is_deleted = FALSE;
CREATE INDEX idx_voucher_amount        ON voucher (company_id, total_amount) WHERE valid_to IS NULL;

CREATE TABLE voucher_line (
  id           BIGSERIAL PRIMARY KEY,
  voucher_id   BIGINT NOT NULL REFERENCES voucher(id),  -- NO ON DELETE CASCADE
  line_no      INT NOT NULL,
  ledger_name  TEXT NOT NULL,
  debit        NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit       NUMERIC(15,2) NOT NULL DEFAULT 0,
  extra        JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (voucher_id, line_no),
  CONSTRAINT voucher_line_one_side CHECK (
    (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0) OR (debit = 0 AND credit = 0)
  )
);
CREATE INDEX idx_voucher_line_ledger ON voucher_line (ledger_name);
```

Notes you must implement in code, not only SQL:

- `UNIQUE NULLS NOT DISTINCT` requires Postgres 15+ (we are on 16). Do not “simplify” by dropping uniqueness.
- If you cannot express `NULLS NOT DISTINCT` in TypeORM decorators, put it in the **migration SQL**. Decorators must not fight the migration.
- Partial unique on current rows is the load-bearing invariant. Tests must prove it.
- Enable `CREATE EXTENSION IF NOT EXISTS citext;` in the first migration.

### 5.2 Seed users (migration or `npm run seed`)

| email | role | password (dev only, from env) |
|---|---|---|
| `steward@shankara.local` | steward | `SEED_STEWARD_PASSWORD` |
| `finance@shankara.local` | finance | `SEED_FINANCE_PASSWORD` |
| `branch@shankara.local` | branch | `SEED_BRANCH_PASSWORD` | `company_id=SHANKARA_HYD` |

Passwords hashed with **bcrypt** (cost ≥ 10). Never store seed passwords in SQL files. Seed is a script that reads env.

Default company id for Phase 1 fixture: `SHANKARA_HYD`. Branch user must **not** see another `company_id`.

---

## 6. BACKEND MODULE LAYOUT (REQUIRED)

Replace the empty modules. Target:

```
backend/src/
  main.ts
  app.module.ts
  health/
  config/            # env schema (Joi or zod). Fail fast if required env missing.
  auth/              # login, jwt strategy, roles guard, current user decorator
  users/
  audit/
  storage/           # ObjectStore interface + LocalFs implementation
  ingest/
    ingest.controller.ts
    ingest.service.ts
    detect/          # Day Book fingerprint
    parse/           # streaming Day Book parser
    validate/
    ingest.processor.ts   # BullMQ or async queue
  search/
  vouchers/
  database/
    entities/
    migrations/
```

`main.ts` must:

- `app.setGlobalPrefix('api')`
- `ValidationPipe` as specified
- CORS from `CORS_ORIGIN`
- listen on `PORT` (default 3000)

`TypeOrmModule.forRootAsync` must use:

```
host: DATABASE_HOST          # 127.0.0.1 for host-run API
port: DATABASE_PORT          # 6432  (PgBouncer)
username, password, database from env
synchronize: false
migrationsRun: false         # run via npm script, not silently on boot in a way you cannot see
```

When the API runs **on the host** (typical): `DATABASE_HOST=127.0.0.1` `DATABASE_PORT=6432`.  
PgBouncer in compose publishes `6432:5432` today — **keep host port 6432**. Confirm the container listens on 5432 internally (edoburu/pgbouncer default). Do not point TypeORM at `5432` (raw Postgres).

### 6.1 Env (`.env.example` committed, `.env` not)

Required keys (names exact):

```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

DATABASE_HOST=127.0.0.1
DATABASE_PORT=6432
DATABASE_USER=shankara_admin
DATABASE_PASSWORD=          # no default in code
DATABASE_NAME=shankara_erp

POSTGRES_USER=shankara_admin
POSTGRES_PASSWORD=
POSTGRES_DB=shankara_erp

JWT_SECRET=                 # min 32 chars, fail boot if shorter
JWT_EXPIRES_IN=8h

STORAGE_DIR=./var/uploads
MAX_UPLOAD_BYTES=52428800
MAX_PARSE_ROWS=500000
DEBIT_CREDIT_TOLERANCE=0.05

SEED_STEWARD_PASSWORD=
SEED_FINANCE_PASSWORD=
SEED_BRANCH_PASSWORD=

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Compose must interpolate `POSTGRES_*`. No password literals in `docker-compose.yml`.

---

## 7. INGEST PIPELINE — BEHAVIOR CONTRACT

This is the heart of Phase 1. Implement it completely.

### 7.1 HTTP

| Method | Path | Role | Behavior |
|---|---|---|---|
| `POST` | `/api/auth/login` | public | `{ email, password }` → `{ accessToken, user: { id, email, role, companyId } }` + audit |
| `POST` | `/api/auth/logout` | any auth | invalidate if you use a denylist; otherwise client drops token. Still audit. |
| `GET` | `/api/auth/me` | any auth | current user |
| `GET` | `/api/health` | public | `{ status: 'ok', db: 'ok', asOf: null \| iso }` — `SELECT 1` via pooler |
| `POST` | `/api/uploads` | **steward** | `multipart` field `file` + fields `companyId`, `branchId?`. Returns existing batch if SHA-256 known (`status: duplicate` or the prior batch). Else `202` `{ batchId, status }`. |
| `GET` | `/api/batches/:id` | steward; finance if published | status, counts, debit/credit sums, errorSummary |
| `GET` | `/api/batches/:id/rejects` | steward | paged reject rows; also `Accept: text/csv` download |
| `POST` | `/api/batches/:id/publish` | steward | only from `held` or `validating` success → `published`, sets `published_at` |
| `POST` | `/api/batches/:id/hold` | steward | unpublish or keep off search |
| `POST` | `/api/search` | finance, steward, branch | see §8 |
| `GET` | `/api/vouchers/:id` | finance, steward, branch (scoped) | header + lines |
| `GET` | `/api/meta/as-of` | any auth | `{ asOf: iso \| null, batchId }` scoped to caller |

Auto-publish: **allowed in Phase 1 if validation passes** (no debit/credit break beyond tolerance and no fatal detect error). Still write `held` if the steward sends `autoPublish=false`. Default `autoPublish=true` so the fixture path is one upload → searchable.

### 7.2 Detect (Day Book only)

Fingerprint the first 20 rows of text:

- Company name line (large title)
- Report name contains `Day Book` (case-insensitive)
- Period line like `1-Apr-25 to 30-Apr-25`
- Header row containing at least: **Particulars** (or **Ledger**), **Vch Type** / **Voucher Type**, **Vch No** / **Voucher No**, **Debit**, **Credit**. Date column titled **Date**.

If fingerprint fails → `status=rejected`, `error_summary='UNRECOGNIZED_LAYOUT'`. **Do not guess.** Phase 1 has no mapping UI.

Store detected `period_from`, `period_to`, title company name. If title company and `companyId` field disagree, **reject the batch** (`COMPANY_MISMATCH`) unless `companyId` was the only source and the title is empty.

### 7.3 Parse rules (Tally Day Book Excel)

Tally Day Book is **not** a clean table. Your parser must handle all of the following. Each bullet is a **test case** in `daybook.parser.spec.ts`.

1. Skip 3–8 title rows before headers.
2. Header may be two rows; use the row that contains `Vch No` / `Debit`.
3. Skip rows whose Particulars is `Opening Balance`, `Closing Balance`, `Grand Total`, `Total`, or empty with no amounts.
4. Skip subtotal rows (Particulars empty or `Total` and both debit+credit filled as totals).
5. **Voucher grouping:** Tally often prints:

   ```
   Date       Particulars              Vch Type   Vch No    Debit      Credit
   1-Apr-25   Sri Steel Traders        Sales      11820     1248500
              CGST                             112365
              SGST                             112365
              Sales GST                        1023770
   ```

   First row = voucher header (date, type, number, party = first particulars). Following rows with **empty Vch No** belong to the same voucher as lines. A new voucher starts when `Vch No` is non-empty **or** Date is non-empty after a completed voucher.

6. First non-tax line’s Particulars is `party_name` if `Vch Type` is Sales/Purchase/Receipt/Payment; otherwise leave party null and still store all lines.
7. `total_amount` = max(sum(debit), sum(credit)) of that voucher’s lines, or the header amount if Tally only put the amount on the first row. **All lines must still be stored.**
8. If Tally put the full amount only on the party row and later lines are the split, do not invent extra lines.
9. Narration: Tally sometimes puts narration on a following row in Particulars with no amounts. Store as `narration`. Do not create a ledger line with 0/0 unless it has a ledger-like name and you are unsure — prefer narration.
10. Amounts: strip `₹`, commas, `Dr`, `Cr`, spaces. Accounting-paren negatives. Unparseable amount → reject **that row**, continue.
11. Dates: Excel serial and `d-MMM-yy` / `dd-MM-yyyy` / `yyyy-mm-dd`.
12. `vch_no_norm`: lowercase, remove `/`, `-`, spaces. `INV/HYD/24-25/11820` → `invhyd242511820`.
13. Unknown extra columns → `extra` jsonb. **Do not drop columns.**
14. Hard cap `MAX_PARSE_ROWS`. Exceed → batch `rejected`, no partial publish.

### 7.4 Validate

Row-level (goes to `ingest_reject`, voucher not inserted):

- Missing `vch_type`
- Missing `vch_date`
- Missing `vch_no` on a header row
- Unparseable amount
- Line with both debit and credit > 0

Batch-level:

- `abs(sum(debit) - sum(credit)) > DEBIT_CREDIT_TOLERANCE` → batch may still **publish with a warning** stored on `error_summary` (`OUT_OF_BALANCE: debit=… credit=…`) because Tally Day Books can include opening rows we skipped. **Do not silently drop the imbalance.** Surface it on `GET /batches/:id`.
- Zero accepted vouchers → `rejected`.

### 7.5 Upsert / versioning

For each accepted voucher:

1. Compute key: if `tally_guid` present use `(company_id, tally_guid)` else `(company_id, vch_type, vch_no, vch_date)`.
2. Find current row (`valid_to IS NULL`, `is_deleted = false`).
3. If none → insert voucher + lines.
4. If same content fingerprint (hash of type, date, no, party, amount, narration, lines) → keep, do not clone.
5. If different content → set `valid_to = now()` on old (keep its lines), insert new current version + new lines. Search only sees `valid_to IS NULL`.
6. Upsert `master_ledger` for each distinct ledger name (`ON CONFLICT (company_id, ledger_name) DO UPDATE`).

Same file SHA-256:

- Do not parse again.
- Return the existing `ingest_batch` and `source_file`.
- Audit `upload` with `meta.duplicate = true`.

Different file, same voucher keys: versioning path (step 5).

All of this in **one DB transaction per batch** (or per chunk of 1,000 vouchers if you must, but then a failed later chunk must not leave a `published` batch). Prefer one transaction for the fixture and for ≤ 20k vouchers.

### 7.6 Lineage (non-negotiable)

Every `voucher` row has `batch_id` and `source_row_no` (header row in the sheet).  
`GET /api/vouchers/:id` includes:

```json
{
  "source": {
    "batchId": 1,
    "fileName": "sample-daybook.xlsx",
    "sha256": "...",
    "sourceRowNo": 12,
    "publishedAt": "2026-08-18T08:00:00.000Z"
  }
}
```

---

## 8. SEARCH AND RETRIEVE

### 8.1 `POST /api/search`

Body:

```json
{
  "q": "string, 1-200 chars",
  "from": "YYYY-MM-DD | optional",
  "to": "YYYY-MM-DD | optional",
  "vchType": "optional",
  "limit": 20,
  "offset": 0
}
```

Rules:

- `branch` role: `AND company_id = user.company_id` (and `branch_id` if set). **Always.**
- `finance` / `steward`: all companies in Phase 1.
- Only `valid_to IS NULL AND is_deleted = false AND batch.status = 'published'`.
- Query interpretation (apply in SQL, combination OR’d, then rank):

  | Signal | Match |
  |---|---|
  | `q` digits/`/`/`-` | `vch_no_norm LIKE` normalized q + prefix |
  | `q` looks like amount (`1,24,850` or `1248500` or `1248500.00`) | `total_amount` = parsed amount OR between amount and amount+0.99 |
  | otherwise | `party_name ILIKE %q%` OR `narration ILIKE %q%` OR `vch_no ILIKE %q%` |

- Rank: exact `vch_no_norm` first, then exact amount, then party prefix, then date desc.
- Response:

```json
{
  "asOf": "ISO",
  "total": 123,
  "hits": [
    {
      "id": 1,
      "vchNo": "INV/HYD/24-25/11820",
      "vchType": "Sales",
      "vchDate": "2025-04-01",
      "partyName": "Sri Steel Traders",
      "totalAmount": "1248500.00",
      "narration": "TMT 12mm",
      "companyId": "SHANKARA_HYD"
    }
  ]
}
```

- Default `limit` 20, max 100.
- Audit `search` with `{ q, total }` — do not skip.

Typeahead: the UI may debounce 200 ms and call the same endpoint. Do not add a second undocumented route unless it is `/api/search` with `limit=8`.

**Do not use OpenSearch in Phase 1.** If you add an OpenSearch call, you have violated scope.

### 8.2 `GET /api/vouchers/:id`

- 404 if missing, unpublished, superseded (`valid_to` not null) — **unless** `?version=all` and role is steward.
- 403 if branch user and `company_id` mismatch (use 404 if you prefer not to leak existence; pick one and test it — **404 recommended**).
- Body: voucher + `lines[]` + `source` (see §7.6).
- Audit `voucher_open`.

---

## 9. FRONTEND CONTRACT

One app, three screens. No router library required; a tiny state router is fine. React Router is allowed.

1. **Login** — email/password. Store token in memory + `sessionStorage` (acceptable for Phase 1) or httpOnly cookie if you implement cookie JWT properly. Do not put JWT in `localStorage` comments as “TODO secure later” while still using it without HTTPS notes — `sessionStorage` + short expiry is the Phase 1 default.
2. **Search (home after login)** — focused input, `/` focuses it, Enter searches, click/Enter on a hit opens pane. Filters: All (default), Vouchers only (Phase 1 only has vouchers — hide Parties/Items pills; they are Phase 3).
3. **Upload (steward only)** — nav link visible iff `role === 'steward'`. Drag-and-drop + file picker. Progress: uploaded → parsing → published | rejected. Show accept/reject counts and imbalance warning.
4. **Voucher pane** — overlay or right drawer: header, lines table, source lineage, Esc closes.

Visible always when logged in:

- Role badge from `/api/auth/me`, not the string `"Steward Access"` hardcoded.
- **Data as of {formatted IST}** from `/api/meta/as-of`. If `asOf` is null: show `No published data` in muted text, **no green live dot**.

Remove:

- Placeholder copy about AG Grid
- Hardcoded date `17 Aug 2026 14:10 IST`
- Unused Vite starter CSS that centers a 1126px column and purple accents in `index.css`
- Filter pills that do nothing

Vite proxy: `/api` → `http://127.0.0.1:3000`. Frontend never hardcodes production URLs.

`index.html` title: `Shankara Buildpro — Data Layer`.

No “Create Voucher”. No charts.

---

## 10. TESTS YOU MUST WRITE AND PASS

Delete or replace `should be defined` and `Hello World` e2e as the primary suite. The following names must exist and pass (`npm test` in `backend`, plus e2e).

### 10.1 Parser unit tests — `src/ingest/parse/daybook.parser.spec.ts`

Use **checked-in fixtures** (xlsx and/or CSV). You must create a realistic Day Book workbook in `fixtures/daybook/`.

| Test name | Assert |
|---|---|
| `skips title block and finds header` | first voucher date is the first real row, not the company name |
| `skips opening closing and grand total` | those rows are not vouchers |
| `groups split lines under one voucher` | one voucher, ≥ 3 lines, party = first particulars |
| `parses indian comma amounts` | `12,48,500.00` → `1248500.00` |
| `parses excel serial date` | serial `45414` → `2024-04-01` (verify the serial you put in the fixture) |
| `normalizes voucher number` | `INV/HYD/24-25/11820` → `invhyd242511820` |
| `rejects unparseable amount row but continues` | reject count 1, other vouchers accepted |
| `unrecognized sheet returns detect failure` | detect result `UNRECOGNIZED_LAYOUT` |

### 10.2 Ingest integration — `src/ingest/ingest.service.spec.ts` (or e2e)

Needs test DB. Use a `.env.test` pointing at a disposable DB **or** transactional rollback. Document how to run.

| Test name | Assert |
|---|---|
| `ingest sample daybook creates expected voucher count` | count matches fixture spec file `fixtures/daybook/EXPECTED.md` |
| `same sha256 second ingest does not duplicate vouchers` | voucher count unchanged, batch status `duplicate` or same id |
| `changed file same vch key versions the row` | one current, one with `valid_to` set |
| `unpublished batch is not searchable` | hold/unpublish → search total 0 for that vch |
| `search by amount finds voucher` | |
| `search by party substring finds voucher` | |
| `search by vch no fragment finds voucher` | `11820` or `invhyd` |
| `branch user cannot see other company` | 0 hits / 404 |

### 10.3 Auth e2e

| Test name | Assert |
|---|---|
| `search without token is 401` | |
| `upload as finance is 403` | |
| `login bad password is 401 and audits login_failed` | |
| `login good steward can upload` | |

### 10.4 Health

| Test name | Assert |
|---|---|
| `GET /api/health returns db ok` | fails if pointed at raw downed DB |

### 10.5 Frontend

If you add no frontend test runner, provide `frontend/PHASE1_MANUAL.md` with a 10-step click path. Prefer Vitest + Testing Library for login redirect and search call mocking — not required if backend tests are complete **and** the manual script is accurate.

**Fixture spec:** `fixtures/daybook/EXPECTED.md` must state: number of vouchers, number of lines, one known `vch_no`, one known party, one known amount. Tests read those numbers. Do not hardcode magic counts in three places.

Create the sample xlsx yourself to match Tally layout in §7.3. Do not wait for Shankara to email a file.

---

## 11. IMPLEMENTATION ORDER (DO NOT SKIP OR REORDER)

You will be reviewed after each step. Do not jump to UI polish.

| Step | Deliverable | Done when |
|---|---|---|
| S0 | Secrets + env + compose interpolation + health through **:6432** | `GET /api/health` ok; `git grep supersecretpassword` empty |
| S1 | Migrations for §5 + seed script | Tables exist; three users can be selected |
| S2 | Auth module + guards | §10.3 tests pass |
| S3 | Local object store + `POST /api/uploads` stores bytes + `source_file` | File on disk named by sha256, not original filename only |
| S4 | Detect + parse + unit tests | §10.1 passes |
| S5 | Validate + upsert + versioning | §10.2 first four tests pass |
| S6 | Publish + search + get voucher + as-of | remaining §10.2 pass |
| S7 | Audit on login, upload, search, open | SQL shows rows after the e2e |
| S8 | Frontend wired | manual script or tests; no placeholders |
| S9 | 20k-row synthetic ingest + note p95 search in `PHASE_1_EVIDENCE.md` | number written, not “fast” |
| S10 | Fill §12 evidence. Only then you may write Phase 1 complete. | |

Do not open a Phase 2 file.

---

## 12. DEFINITION OF DONE — BINARY

Copy this into `PHASE_1_EVIDENCE.md` and fill the right column. Empty or “N/A” (except the two marked optional) = **not done**.

| # | Gate | Evidence (command or URL + result) |
|---|---|---|
| 1 | Compose up, migrations ran, health `db: ok` via port **6432** | |
| 2 | No password literals in repo source (`git grep` output empty for `supersecretpassword`) | |
| 3 | `.env.example` exists; `.env` is untracked | |
| 4 | Seed login works for steward, finance, branch | |
| 5 | Unauthenticated `POST /api/search` → 401 | |
| 6 | Finance `POST /api/uploads` → 403 | |
| 7 | Steward uploads `fixtures/daybook/sample-daybook.xlsx` without code changes | |
| 8 | Batch reaches `published` (or `held` then publish) | |
| 9 | Original file retrievable from storage by `storage_key` | |
| 10 | Voucher count matches `fixtures/daybook/EXPECTED.md` | |
| 11 | Re-upload same file: voucher count unchanged | |
| 12 | Search `11820` (or the fixture vch fragment) returns that voucher in hit 1–3 | |
| 13 | Search the fixture party substring returns it | |
| 14 | Search the fixture amount returns it | |
| 15 | `GET /api/vouchers/:id` returns lines + source lineage | |
| 16 | As-of in UI equals that batch `published_at` (IST), not a hardcoded date | |
| 17 | Branch user cannot see a voucher with another `company_id` | |
| 18 | Unpublished/held batch not in finance search | |
| 19 | `audit_event` has login, upload, search, voucher_open | |
| 20 | `npm test` (backend) — all §10 tests — passing | |
| 21 | No empty Nest classes, no `getHello`, no AG Grid placeholder, no Parties/Items fake pills | |
| 22 | Unique constraints exist (`\d voucher` shows them) | |
| 23 | `voucher_line` FK has **no** `ON DELETE CASCADE` | |
| 24 | Synthetic 20k+ ingest search p95 recorded | |
| 25 | `PHASE_1_EVIDENCE.md` committed with the above filled | |

**Optional (nice, not a substitute for 1–25):** backup/restore note (`pg_dump` / `pg_restore` once).

When 1–25 are true, add a single line at the top of `PHASE_1_EVIDENCE.md`:

```
PHASE_1_STATUS=COMPLETE
```

Until that file exists with that line **and** the table is filled, Phase 1 is incomplete — regardless of any other markdown.

---

## 13. WHAT YOU MUST NOT SAY

These sentences have already been used incorrectly. They are **banned** in your summary to the human:

- “Phase 1 complete” / “foundation is perfectly set”
- “Ready for Phase 2”
- “Supports 5,000 concurrent users” (you have not load-tested that)
- “OpenSearch is ready for Google-like search”
- “Auth is represented by the steward badge”
- “Ingest pipeline skeleton is in place” (skeleton = not done)
- “We can add validation later”

Say instead: which **S-step** you finished, which §12 boxes are green, which are not.

---

## 14. REVIEWER REJECTION LIST (instant fail)

The human will reject the PR/work if any of these appear:

- `supersecretpassword` or any DB password in committed files
- `synchronize: true`
- Empty `IngestController` / `IngestService`
- `Hello World`
- Hardcoded as-of date
- Search UI that does not call `/api/search`
- Upload that only `console.log`s
- Duplicate vouchers after re-upload of the fixture
- OpenSearch client code added “for later”
- New tables for GST / stock / posting
- `ON DELETE CASCADE` on `voucher_line`
- Tests that only check `toBeDefined()`
- Phase 2 folder, Phase 2 markdown, or “next we’ll build the parser”

---

## 15. RUNBOOK YOU MUST LEAVE BEHIND

Replace `backend/README.md` tutorial text with a short runbook (also a root `README.md` if missing):

```
# Shankara Data Layer — local Phase 1

## Start
1. Copy .env.example → .env and set passwords + JWT_SECRET (≥32 chars)
2. docker compose up -d
3. cd backend && npm ci && npm run migration:run && npm run seed
4. npm run start:dev
5. cd ../frontend && npm ci && npm run dev
6. Login steward@shankara.local / (SEED_STEWARD_PASSWORD)
7. Upload fixtures/daybook/sample-daybook.xlsx
8. Search the voucher in fixtures/daybook/EXPECTED.md

## Test
cd backend && npm test
```

No Nest marketing. No donation badges.

---

## 16. REMINDER

Tally posts. This system **finds**.

Phase 1 is done only when a steward drops one Day Book and a second user finds a voucher without opening Tally or Excel — with login, lineage, idempotent re-upload, and tests that will fail if that stops being true.

Do the work in §11 order. Fill §12. Stop.

---

*End of binding work order. Do not start Phase 2.*
