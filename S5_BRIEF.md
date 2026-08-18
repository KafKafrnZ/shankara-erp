# S5 WORK ORDER — VALIDATE + UPSERT + VERSION ONLY

You are implementing **S5 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §7.4, §7.5, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S4 are done and independently verified.** Do not rewrite auth, storage, migrations, seed, detector, or parser behavior.  
**S6–S10 are forbidden.** No publish. No search. No `GET /api/vouchers/:id`. No as-of. No OpenSearch. No frontend. No mapping UI. No BullMQ.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S5 complete in chat. Fill `S5_EVIDENCE.md`. Empty cell = not done.
2. **Do not edit** `fixtures/daybook/EXPECTED.md`.
3. **Do not edit** `fixtures/daybook/sample-daybook.csv`, `sample-daybook-bad-amount.csv`, `sample-daybook-serial-date.csv`, `not-a-daybook.csv`, `tiny.csv` except if a test copies them to `os.tmpdir()` and mutates the **copy**.
4. **Do not edit** `backend/src/ingest/parse/daybook.parser.ts` or `daybook.detector.ts` except to add a thin `parseDayBookBuffer(buf, originalName)` wrapper that does not change parse rules. The Debit/Credit flip (`_headerSide` / `assignedSide`) must **not** return. `git grep _headerSide` must be empty.
5. **Do not change** the S4 unit-test contract. `parses indian comma amounts on sample` must stay `totalAmount === '1248500.00'`. The test `sample sales and receipt lines match EXPECTED debit credit sides` must keep passing.
6. Do not add GraphQL, Kafka, Prisma, OpenSearch client, AG Grid, or a new app.
7. Do not commit `.env`. Do not put passwords in source.
8. Do not use `synchronize: true`. Do not add a migration. Tables `voucher`, `voucher_line`, `ingest_reject`, `master_ledger` **already exist**. Map them.
9. Do not hard-delete financial facts. Do not add `ON DELETE CASCADE` on `voucher_line`.
10. Do not implement `POST /api/batches/:id/publish`, `POST /api/batches/:id/hold`, `POST /api/search`, `GET /api/vouchers/:id`, `GET /api/meta/as-of`. Those are S6. After S5 those routes must **404**.
11. Do not set `published_at`. Success status is **`held`**, not `published`.
12. Do not use `parseFloat` / `Number()` on money going to Postgres. Persist the parser’s **2-decimal strings** (`'1248500.00'`) as `NUMERIC`. TypeORM column type `numeric` mapped as `string`.
13. Do not write timestamped junk files into `fixtures/`. Temp files go to `os.tmpdir()` and must be deleted in `afterAll`.
14. Do not create a root `package.json`, `test.js`, or install `csv-parse` at the repo root. That junk was just deleted.
15. `npx tsc --noEmit -p tsconfig.build.json` exit 0. S4 `npm test` stays green. E2e must stay green **after** you update the S3 upload case (see §6).

---

## 1. WHAT S5 IS

After a **new** SHA-256 is stored (S3 already does this), run detect → parse → validate → upsert **in-process** in the same request (no worker, no Redis, no BullMQ).

```
POST /api/uploads
  S3: store bytes, source_file, ingest_batch
  S5: parse stored bytes → validate → write ingest_reject
      → upsert voucher + voucher_line + master_ledger
      → batch.status = held | rejected
```

Same SHA-256: **do not parse again**. Return the existing batch. HTTP **200**, `status: 'duplicate'`, `duplicate: true`. Voucher row count must not change.

HTTP for a **new** file stays **202**. The JSON `status` is the **final S5 status** (`held` or `rejected`), not `uploaded`.

S3 e2e currently uploads a mock CSV and asserts `status === 'uploaded'`. That assertion is now **wrong**. You must update it (see §6). Do not leave parse unwired to keep that test green.

---

## 2. FILES YOU MAY TOUCH

Create / edit **only**:

```
backend/src/ingest/validate/daybook.validator.ts
backend/src/ingest/validate/daybook.validator.spec.ts
backend/src/ingest/entities/voucher.entity.ts
backend/src/ingest/entities/voucher-line.entity.ts
backend/src/ingest/entities/ingest-reject.entity.ts
backend/src/ingest/entities/master-ledger.entity.ts
backend/src/ingest/ingest.service.ts          # call process after store
backend/src/ingest/ingest.controller.ts       # add GET batches + rejects
backend/src/ingest/ingest.module.ts
backend/src/ingest/parse/daybook.parser.ts    # optional thin buffer wrapper ONLY
backend/src/app.module.ts                    # Joi: DEBIT_CREDIT_TOLERANCE, EXPECTED_TALLY_COMPANY_SUBSTR
backend/.env.example
backend/test/upload.e2e-spec.ts              # mock csv → rejected (see §6)
backend/test/ingest.e2e-spec.ts              # new — real DB
backend/src/ingest/ingest.service.spec.ts    # optional if e2e covers §5
S5_EVIDENCE.md
```

**Do not edit:** `auth/`, `users/`, `health/`, `database/migrations/`, `seed.ts`, `frontend/`, `docker-compose.yml`, `EXPECTED.md`, the committed daybook fixtures, S4 parser specs (except if tsc forces an import).

---

## 3. PROCESS FLOW (exact)

After `source_file` + `ingest_batch` are committed (status may be `uploaded` for one moment):

1. Set `status='detecting'` then `'parsing'`.
2. Read the **stored** bytes from `ObjectStore.get(key)`, not a mutated request copy. Storage keys have **no extension**. Write a temp file in `os.tmpdir()` named `{sha256}{extFromOriginalName}`, call `parseDayBookFile`, delete the temp file in `finally`.
3. If `detect.ok === false`:
   - `status='rejected'`
   - `error_summary='UNRECOGNIZED_LAYOUT'`
   - 0 vouchers, 0 lines
   - return 202 with that status
4. `COMPANY_MISMATCH` (batch rejected, 0 vouchers) when:
   - `detect.titleCompany` is non-empty **and**
   - `titleCompany.toLowerCase()` does **not** include `EXPECTED_TALLY_COMPANY_SUBSTR` (env, default `shankara`, compare lowercased)
   - This accepts `companyId=SHANKARA_HYD` + title `Shankara Buildpro - Hyderabad`
   - This rejects a well-formed Day Book titled `Acme Pvt Ltd`
   - Store `error_summary='COMPANY_MISMATCH'`
5. Run validator (§4) on `ParseResult`.
6. Persist every reject (parser + validator) to `ingest_reject` (`raw` must be the row object, not `{}` when you have cells).
7. If **zero** vouchers remain after validate → `status='rejected'`, `error_summary='ZERO_VOUCHERS'` (unless already `UNRECOGNIZED_LAYOUT` / `COMPANY_MISMATCH`).
8. Else upsert (§5) in **one transaction**.
9. Update batch:
   - `tally_company` = detect.titleCompany
   - `period_from` / `period_to` from detect
   - `total_rows` / `accepted_rows` / `rejected_rows`
   - `debit_sum` / `credit_sum` as NUMERIC strings from accepted **lines** (sum in SQL `NUMERIC` or decimal strings — not JS IEEE)
   - If `abs(debit_sum - credit_sum) > DEBIT_CREDIT_TOLERANCE` (env, default `0.05`): still **`held`**, set `error_summary='OUT_OF_BALANCE: debit=… credit=…'`
   - `status='held'`
   - `published_at` stays NULL
10. If processing throws after the file row exists: set `status='rejected'`, `error_summary` = short message, do **not** leave `detecting`/`parsing`. Then rethrow or return 202 rejected. Never leave an orphan processing status.

Duplicate SHA path: unchanged S3 behavior. Do not run steps 1–10.

`autoPublish` on the DTO is **ignored** in S5. Do not publish.

---

## 4. VALIDATE

New module `validate/daybook.validator.ts`. Pure function:

```ts
validateDayBook(parsed: ParseResult): {
  vouchers: ParsedVoucher[]; // accepted only
  rejects: ParseReject[];    // parser rejects + new ones
}
```

Row-level (drop **that line**, keep the voucher if it still has ≥1 line):

| Code | When |
|---|---|
| `BOTH_SIDES` | line debit > 0 **and** credit > 0 (compare as decimal strings, not floats) |
| `UNPARSEABLE_AMOUNT` | already from parser — pass through |
| `MISSING_VCH_DATE` / `MISSING_VCH_TYPE` / `MISSING_VCH_NO` | already from parser — pass through |

If a voucher has **0 lines** after dropping bad lines, drop the voucher (do not insert a header-only row).

Do **not** invent lines. Do not flip debit/credit.

Unit-test the validator with an in-memory `ParseResult` (no DB): one line both sides → `BOTH_SIDES`, voucher dropped if that was its only line.

---

## 5. UPSERT / VERSIONING

Entities map the existing tables. Money columns: `type: 'numeric', precision: 15, scale: 2` as **`string`**.

Business key (no `tally_guid` in Day Book Phase 1):

```
(company_id, vch_type, vch_no, vch_date)
```

`company_id` = upload form `companyId` (e.g. `SHANKARA_HYD`).  
`vch_date` = parser `YYYY-MM-DD` stored as SQL `DATE`.

Content fingerprint (hex SHA-256 of canonical JSON, keys sorted):

```ts
{
  vchType, vchDate, vchNo, partyName, totalAmount, narration,
  lines: lines.map(l => ({ ledgerName, debit, credit }))
}
```

For each accepted voucher, in the batch transaction:

1. `SELECT` current row: same key, `valid_to IS NULL`, `is_deleted = false`.
2. **No current row** → `INSERT` voucher + its lines. `batch_id` = this batch. `source_row_no` = parser header row. `extra` = parser extra JSON.
3. **Current row, same fingerprint** → do nothing. Do not clone. Do not change `batch_id` on the old row.
4. **Current row, different fingerprint** → `UPDATE` old `valid_to = now()` (keep its lines), then `INSERT` new current voucher + **new** lines. Search (S6) will only see `valid_to IS NULL`.
5. Upsert `master_ledger` for each distinct `ledger_name`:  
   `INSERT … ON CONFLICT (company_id, ledger_name) DO UPDATE SET extra = master_ledger.extra`  
   (no-op update is fine). Do not invent `parent_group` / `gstin`.

Order for (4): update old `valid_to` **first**, then insert. The unique constraint is

```
UNIQUE NULLS NOT DISTINCT (company_id, vch_type, vch_no, vch_date, valid_to)
```

Two current rows (`valid_to` null) will fail. That failure is a **bug in your upsert**, not a reason to drop the constraint.

All vouchers of one batch in **one transaction**. Fixture size is 2 vouchers. Failed upsert → rollback voucher writes, batch `rejected`.

`voucher_line` FK must remain **without** `ON DELETE CASCADE`.

---

## 6. HTTP YOU MUST ADD / CHANGE

### `POST /api/uploads` (existing)

| Case | HTTP | `status` | DB |
|---|---|---|---|
| New Day Book, validate ok | 202 | `held` | 2 vouchers / 6 lines for sample |
| New non-Day Book (`tiny.csv`, mock csv) | 202 | `rejected` | 0 vouchers, `error_summary=UNRECOGNIZED_LAYOUT` |
| Same SHA-256 again | 200 | `duplicate` | no new `source_file`, voucher count unchanged |

Update `backend/test/upload.e2e-spec.ts`:

- `steward upload csv creates source_file and batch uploaded`  
  rename and assert **`rejected`** + `UNRECOGNIZED_LAYOUT` (the mock CSV is not a Day Book).  
  `source_file` still created. `voucher` count for that sha = 0.
- Duplicate test still **200** / `duplicate` / same `source_file` count.

Auth e2e `steward CAN hit a steward-only stub` already allows 200 or 202. Leave it. `tiny.csv` will now be `rejected`; that is fine.

### `GET /api/batches/:id` — **steward only**

```json
{
  "id": 1,
  "status": "held",
  "companyId": "SHANKARA_HYD",
  "tallyCompany": "Shankara Buildpro - Hyderabad",
  "periodFrom": "2025-04-01",
  "periodTo": "2025-04-30",
  "totalRows": 6,
  "acceptedRows": 2,
  "rejectedRows": 0,
  "debitSum": "1298500.00",
  "creditSum": "1298500.00",
  "errorSummary": null,
  "publishedAt": null,
  "sha256": "..."
}
```

401 anonymous. 403 finance. 404 unknown id.

`acceptedRows` = accepted **vouchers**. `rejectedRows` = `ingest_reject` count. `totalRows` = accepted lines (6 on the sample).

### `GET /api/batches/:id/rejects` — **steward only**

Paged: `?page=1&pageSize=50`. JSON `{ items, total }`. Each item: `sourceRowNo`, `code`, `message`, `raw`.

Do **not** add CSV download in S5 (that can wait).

---

## 7. TESTS YOU MUST WRITE AND PASS

Not `should be defined`.

### `daybook.validator.spec.ts`

| Test name | Assert |
|---|---|
| `drops line with both debit and credit` | `BOTH_SIDES`, that line gone |
| `drops voucher when every line is invalid` | voucher list empty |

### `backend/test/ingest.e2e-spec.ts` (real DB, same pattern as upload e2e)

**SHA isolation:** copy fixtures to `os.tmpdir()`. Insert a unique ignored title-block line **after the period line and before the header**, e.g. `Run ${Date.now()}-${pid}`. Parser skips title rows. SHA-256 will not collide with a previous run. Do **not** `TRUNCATE voucher`. Delete temp files in `afterAll`.

| Test name | Assert |
|---|---|
| `ingest sample daybook creates expected voucher count` | `voucher` current (`valid_to IS NULL`) = **2**; `voucher_line` = **6**; sales `total_amount='1248500.00'`; `vch_no_norm='invhyd242511820'`; batch `held`; `published_at` null |
| `sample line sides match EXPECTED` | SQL: CGST/SGST/Sales GST `credit > 0` and `debit = 0`; receipt “Sri Steel Traders” `credit='50000.00'` |
| `same sha256 second ingest does not duplicate vouchers` | HTTP 200 `duplicate`; current voucher count unchanged |
| `changed file same vch key versions the row` | second file = same unique-izer pattern, Sales header debit changed to `"12,48,501.00"` (quoted, still in Debit column). After ingest: **one** current Sales row with new amount, **one** Sales row with `valid_to` NOT NULL and old amount `1248500.00`. Lines of the old row still exist. |
| `unrecognized layout rejects with zero vouchers` | `tiny.csv` copy (or mock csv): `rejected`, `UNRECOGNIZED_LAYOUT`, 0 vouchers |
| `bad amount writes ingest_reject and keeps other vouchers` | bad-amount copy: `ingest_reject` count ≥ 1, code `UNPARSEABLE_AMOUNT`, current vouchers = 2 |
| `zero vouchers after skip totals rejects batch` | tmp Day Book with title + header + Opening + Grand Total only → `rejected`, `ZERO_VOUCHERS` |
| `company mismatch rejects batch` | copy of sample with first line `Acme Pvt Ltd` → `rejected`, `COMPANY_MISMATCH`, 0 vouchers |
| `publish and search routes do not exist yet` | `POST /api/batches/:id/publish` and `POST /api/search` → **404** |

`npm test` (S4 units + validator) must pass.  
`npm run test:e2e` must pass (auth + updated upload + new ingest).

---

## 8. IMPLEMENTATION ORDER

1. Entities for the four existing tables. Register in `IngestModule`.  
2. Validator + unit spec.  
3. `processBatch` in `IngestService`, called after a new upload commit.  
4. `GET /api/batches/:id` and `/rejects`.  
5. Update upload e2e. Write ingest e2e.  
6. Fill `S5_EVIDENCE.md`. Stop.

Do not open S6 files.

---

## 9. BANNED SENTENCES

- “S5 complete, vouchers saved, ready to search”
- “I auto-published so you can see them”
- “I flipped GST to credit in the parser because the file was awkward”
- “I changed EXPECTED.md / sample-daybook.csv to match the upsert”
- “I left mock csv as `uploaded` so S3 e2e would stay green”
- “Ready for S6” without `S5_STATUS=COMPLETE` in `S5_EVIDENCE.md`

Reply with files changed, `npm test` summary, `npm run test:e2e` summary, and the evidence table. Then **stop**.
