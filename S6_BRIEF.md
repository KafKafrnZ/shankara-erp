# S6 WORK ORDER — PUBLISH + SEARCH + GET VOUCHER + AS-OF ONLY

You are implementing **S6 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §7.1 (publish/hold/search/voucher/as-of rows), §7.6, §8, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S5 are done and independently verified.** Do not rewrite auth, storage, migrations, seed, detector, parser, validator, or upsert rules.  
**S7–S10 are forbidden.** No frontend. No OpenSearch. No 20k load test. No mapping UI. No BullMQ. No “Create Voucher.”

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S6 complete in chat. Fill `S6_EVIDENCE.md`. Empty cell = not done.
2. **Do not edit** `fixtures/daybook/EXPECTED.md` or the committed `sample-*.csv` / `tiny.csv` / `not-a-daybook.csv` (tmp copies only).
3. **Do not edit** `daybook.parser.ts` parse rules, `daybook.detector.ts`, or `daybook.validator.ts`. `_headerSide` must stay gone.
4. **Do not change S5 upsert behavior.** Upload without `autoPublish` must still finish `held` with `published_at` NULL. Existing ingest e2e that assert `held` must stay green.
5. **Default `autoPublish` is false.** `PHASE_1_AUDIT.md` says default true. **This file wins.** S8 will send `autoPublish=true`. If the field is the string `"true"` or boolean `true`, you may publish in the same upload request **after** a successful `held` upsert. Omitted / `"false"` / false → leave `held`.
6. Do not add GraphQL, Kafka, Prisma, OpenSearch client, AG Grid, or a new app.
7. Do not commit `.env`. Do not put passwords in source.
8. Do not use `synchronize: true`. Do not add a migration. Search is **SQL on the existing `voucher` / `ingest_batch` tables**.
9. Do not hard-delete financial facts. Do not add `ON DELETE CASCADE`.
10. **RBAC is in the SQL `WHERE`**, not a JS filter after `SELECT *`. Branch: `voucher.company_id = $user.companyId` always. If a branch user has null `companyId`, return 403 on search/get.
11. Do not use `parseFloat` / `Number()` on money going to SQL. Amount queries use `parseIndianAmount` → 2-decimal string bound as `::numeric`.
12. Do not `TRUNCATE voucher`. Isolate tests with the S5 unique-izer (unique title line + unique `INV/HYD/{uniq}` / `RCT/HYD/{uniq}`). Temp files in `os.tmpdir()`, deleted in `afterAll`.
13. Do not create a root `package.json` or `test.js`.
14. `npx tsc --noEmit -p tsconfig.build.json` exit 0. `npm test` stays 25. `npm run test:e2e` stays green **after** you replace the S5 404 test (see §6).
15. No `console.log` on the request path. No catch-all that rewrites every error as HTTP 400.

---

## 1. WHAT S6 IS

Make **held** facts searchable and retrievable **only after publish**.

```
held batch
  POST /api/batches/:id/publish   → status=published, published_at=now()
  POST /api/search                → hits (published + current rows only)
  GET  /api/vouchers/:id          → header + lines + source lineage
  GET  /api/meta/as-of            → MAX(published_at) visible to caller
  POST /api/batches/:id/hold      → back to held, published_at=null (unpublish)
```

Unpublished (`held` / `rejected`) vouchers are **invisible** to finance and branch. Steward search uses the same published filter (steward is not a backdoor into held data). Steward may `GET /api/vouchers/:id?version=all` to open a superseded row.

---

## 2. FILES YOU MAY TOUCH

Create / edit **only**:

```
backend/src/search/search.module.ts
backend/src/search/search.controller.ts
backend/src/search/search.service.ts
backend/src/search/dto/search.dto.ts
backend/src/vouchers/vouchers.module.ts
backend/src/vouchers/vouchers.controller.ts
backend/src/vouchers/vouchers.service.ts
backend/src/meta/meta.module.ts
backend/src/meta/meta.controller.ts
backend/src/ingest/ingest.controller.ts     # add POST publish + hold on BatchesController
backend/src/ingest/ingest.service.ts        # add publishBatch + holdBatch only
backend/src/ingest/ingest.module.ts         # export TypeOrmModule if search/vouchers need entities
backend/src/app.module.ts                  # register SearchModule, VouchersModule, MetaModule
backend/src/ingest/dto/upload.dto.ts       # wire autoPublish true|false only if needed
backend/test/ingest.e2e-spec.ts            # DELETE the 404 test (see §6)
backend/test/search.e2e-spec.ts            # new — real DB
S6_EVIDENCE.md
```

You may **read** (not rewrite) auth, users, audit, parser, validator, fixtures.

**Do not edit:** `auth/` behavior, `users/`, `health/` (leave `asOf: null` on `/api/health` — as-of lives on `/api/meta/as-of`), `database/migrations/`, `seed.ts`, `frontend/`, `docker-compose.yml`, `EXPECTED.md`, parser specs.

---

## 3. HTTP CONTRACT (exact)

### `POST /api/batches/:id/publish` — **steward only**

| Current status | HTTP | Result |
|---|---|---|
| `held` | 200 | `status='published'`, `published_at=now()`, `published_by=userId` |
| `published` | 409 | `{ "message": "NOT_HELD" }` |
| `rejected` / missing | 409 / 404 | rejected → 409 `NOT_HELD`; unknown id → 404 |
| finance / branch | 403 | |
| anonymous | 401 | |

Audit `publish` with `entityType='ingest_batch'`, `entityId=id`. If audit insert fails, the request fails (same transaction as the status update).

Response:

```json
{ "id": 1, "status": "published", "publishedAt": "2026-08-18T12:00:00.000Z" }
```

### `POST /api/batches/:id/hold` — **steward only**

| Current status | HTTP | Result |
|---|---|---|
| `published` | 200 | `status='held'`, `published_at=null` |
| `held` | 200 | no-op, still `held` |
| `rejected` | 409 | `NOT_PUBLISHED` |
| missing | 404 | |

Audit `unpublish`. Same transaction rule as publish.

### `GET /api/batches/:id` — change visibility (existing route)

- Steward: any status (already true).
- **Finance: 200 only if `status='published'`. Otherwise 404** (do not leak held batches).
- Branch: 404 unless published **and** `ingest_batch.company_id = user.companyId`.
- Rejects route stays **steward only**.

### `POST /api/search` — steward, finance, branch

DTO (`class-validator`, no `any`):

```ts
export class SearchDto {
  @IsString() @Length(1, 200) q: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() vchType?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number; // default 20
  @IsOptional() @IsInt() @Min(0) offset?: number;          // default 0
}
```

`ValidationPipe` already has `whitelist` + `forbidNonWhitelisted` + `transform`.

**Visibility SQL (mandatory, in the query):**

```
voucher.valid_to IS NULL
AND voucher.is_deleted = false
AND ingest_batch.status = 'published'
-- if role = branch:
AND voucher.company_id = $userCompanyId
```

Join `ingest_batch` on `voucher.batch_id`. Do **not** select all vouchers then filter in JS.

**Query interpretation** (OR the signals that apply, then rank):

| `q` shape | SQL |
|---|---|
| After `normalizeVchNo(q)` the result has length ≥ 1 and original `q` contains a digit or `/` or `-` | `vch_no_norm LIKE $norm \|\| '%'` |
| `parseIndianAmount(q)` is not null | `total_amount = $amt::numeric` (exact 2-dp string; do **not** invent a +0.99 range) |
| otherwise | `party_name ILIKE '%' \|\| $q \|\| '%'` OR `narration ILIKE …` OR `vch_no ILIKE …` |

If more than one signal matches, OR them.

Optional filters (AND): `from` / `to` on `vch_date`, `vchType` exact (case-insensitive).

**Rank** (`ORDER BY`):

1. exact `vch_no_norm = normalizeVchNo(q)`  
2. exact `total_amount = parsed amount` (if amount signal)  
3. `party_name ILIKE $q \|\| '%'`  
4. `vch_date DESC`, `id DESC`

`limit` default 20, max 100. `offset` default 0.

Response:

```json
{
  "asOf": "2026-08-18T12:00:00.000Z",
  "total": 1,
  "hits": [
    {
      "id": 1,
      "vchNo": "INV/HYD/24-25/11820",
      "vchType": "Sales",
      "vchDate": "2025-04-01",
      "partyName": "Sri Steel Traders",
      "totalAmount": "1248500.00",
      "narration": "TMT 12mm 18MT KA01AB1234",
      "companyId": "SHANKARA_HYD"
    }
  ]
}
```

`asOf` is the same value as `GET /api/meta/as-of` for this caller (`null` if nothing published in scope).

Audit `search` with `meta: { q, total }`. Do not skip.

### `GET /api/vouchers/:id` — steward, finance, branch

| Case | HTTP |
|---|---|
| Missing | 404 |
| Current + published + caller may see company | 200 |
| Current + **unpublished** batch | 404 |
| Superseded (`valid_to` not null), no query | 404 |
| Superseded, `?version=all`, **steward** | 200 |
| Superseded, `?version=all`, finance/branch | 404 |
| Branch and `company_id !== user.companyId` | **404** (not 403 — do not leak existence) |

Body:

```json
{
  "id": 1,
  "vchNo": "INV/HYD/24-25/11820",
  "vchNoNorm": "invhyd242511820",
  "vchType": "Sales",
  "vchDate": "2025-04-01",
  "partyName": "Sri Steel Traders",
  "totalAmount": "1248500.00",
  "narration": "TMT 12mm 18MT KA01AB1234",
  "companyId": "SHANKARA_HYD",
  "lines": [
    { "lineNo": 1, "ledgerName": "Sri Steel Traders", "debit": "1248500.00", "credit": "0.00" }
  ],
  "source": {
    "batchId": 1,
    "fileName": "….csv",
    "sha256": "…",
    "sourceRowNo": 8,
    "publishedAt": "2026-08-18T12:00:00.000Z"
  }
}
```

`lines` ordered by `line_no`. Audit `voucher_open` with `entityType='voucher'`, `entityId=id`.

### `GET /api/meta/as-of` — any authenticated role

```json
{ "asOf": "2026-08-18T12:00:00.000Z", "batchId": 12 }
```

or `{ "asOf": null, "batchId": null }` if the caller can see no published batch.

Definition: `MAX(published_at)` among `ingest_batch` rows with `status='published'`. Branch: also `company_id = user.companyId`. `batchId` is the batch that holds that max (if ties, highest id).

---

## 4. IMPLEMENTATION NOTES

- Reuse `parseIndianAmount` and `normalizeVchNo` from `ingest/parse/`. Do not copy-paste a second implementation.
- Parameterized queries only. TypeORM QueryBuilder or `manager.query` with `$1` is fine.
- `total_amount` / line money stay strings in JSON.
- Publishing does **not** re-parse or re-upsert.
- Holding does **not** delete vouchers. Search simply stops seeing them because `batch.status` is no longer `published`.
- Do not set `is_deleted` in S6.
- Do not implement CSV download of rejects.

---

## 5. S5 TEST YOU MUST CHANGE

In `backend/test/ingest.e2e-spec.ts` **delete** (or rewrite) this test:

```
publish and search routes do not exist yet
```

It currently expects 404 on publish/search. After S6 those routes exist. If you leave it, e2e is red and S6 is rejected.

Do **not** weaken any other S5 ingest assertion (`held`, 2 vouchers, 6 lines, receipt credit `50000.00`, `GET /api/batches/:id`).

---

## 6. TESTS YOU MUST WRITE AND PASS

`backend/test/search.e2e-spec.ts`. Real DB. Same login + unique-izer pattern as ingest e2e. **No TRUNCATE.**

Login: steward, finance (`SEED_FINANCE_PASSWORD`), branch (`SEED_BRANCH_PASSWORD`). If a password env is missing, `throw` in `beforeAll` (no fallback).

Helper: upload unique sample as steward → `{ batchId, uniq, salesId? }`. Tests that need hits call publish first.

| Test name | Assert |
|---|---|
| `search without token is 401` | `POST /api/search` no header → 401 |
| `finance cannot publish` | finance `POST /api/batches/:id/publish` → 403; batch still `held` |
| `unpublished batch is not searchable` | upload unique sample, **do not** publish; finance search `q=uniq` → `total === 0` |
| `publish then search by vch fragment` | publish; finance search `q=uniq` (the unique vch token) → `total >= 1`; first 3 hits include that sales `vchNo` |
| `search by amount finds voucher` | after publish, `q='1248500'` **and** `q='12,48,500.00'` each return a hit with `totalAmount==='1248500.00'` |
| `search by party substring finds voucher` | `q='Sri Steel'` → hit `partyName==='Sri Steel Traders'` |
| `hold removes voucher from search` | publish → search hit; hold → finance search same `q` → `total === 0`; `asOf` may become null if that was the only published batch in scope |
| `get voucher returns lines and source` | after publish, `GET /api/vouchers/:id` finance 200; sales has **4** lines; CGST credit `112365.00`; `source.sha256` matches upload; `source.publishedAt` is non-null |
| `get unpublished voucher is 404` | held batch voucher id → finance 404 |
| `get superseded voucher is 404 unless steward version=all` | upload A, publish, upload B same uniq + debit `12,48,501.00`, publish B. Old sales id: finance GET 404; steward GET `?version=all` 200 |
| `branch user cannot see other company` | steward upload+publish unique sample with `companyId=OTHER_CO` (keep title containing `Shankara` so detect does not `COMPANY_MISMATCH`). Branch `POST /api/search` `q=uniq` → `total === 0`. Steward search → hit. Branch `GET /api/vouchers/:id` of that sales id → **404** |
| `as-of is null then set after publish` | if this test’s company scope has no other published batch: `GET /api/meta/as-of` as finance is `{ asOf: null }` before; after publish `asOf` is ISO and `batchId` equals the published id |
| `search and voucher_open and publish are audited` | after the publish+search+get path, SQL: `audit_event.action` includes `publish`, `search`, `voucher_open` |

`npm test` must stay 25.  
`npm run test:e2e` must pass (auth + upload + remaining ingest + new search).

---

## 7. IMPLEMENTATION ORDER

1. `publishBatch` / `holdBatch` on `IngestService` + routes on `BatchesController`.  
2. Delete the S5 404 test. Add publish/finance-403 e2e. Confirm S5 `held` tests still pass.  
3. `SearchModule` + DTO + SQL search.  
4. `VouchersModule` + lineage.  
5. `GET /api/meta/as-of`.  
6. Fill `search.e2e-spec.ts`.  
7. Fill `S6_EVIDENCE.md`. Stop.

Do not open S7–S10 files. Do not “also wire the frontend.”

---

## 8. BANNED SENTENCES

- “S6 complete, I also added a search box in React”
- “I used OpenSearch because SQL ILIKE won’t scale”
- “I auto-publish every upload so S5 held tests were awkward”
- “I TRUNCATE voucher so search tests are isolated”
- “Branch gets 403 so they know the voucher exists”
- “Ready for S7/S8” without `S6_STATUS=COMPLETE` in `S6_EVIDENCE.md`

Reply with files changed, `npm test` summary, `npm run test:e2e` summary, and the evidence table. Then **stop**.
