# S18 WORK ORDER — INDEXER ONLY (PUBLISHED CURRENT → OPENSEARCH)

You are implementing **S18 only** of Shankara Buildpro Phase 3.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_3_AUDIT.md`, `PHASE_STATUS.md` §7, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S17 are done.** Do not rewrite parsers, money, upsert, auth, frontend, or SQL search ranking.  
**S19–S22 are forbidden.** Do not change `POST /api/search` to query OpenSearch. Do not add fuzz. Do not highlight in the UI. Do not create `PHASE_3_EVIDENCE.md`. Do not write `PHASE_3_STATUS=COMPLETE`.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S18 complete in chat. Fill `S18_EVIDENCE.md` as a **gate-by-gate table** (`cmd:` + `out:`, S11 shape). Empty cell = not done. Banned cell text: `Verified`, `Passed in e2e`, `ok`, `done`, `works`.
2. **Indexer only.** OpenSearch is a **projection** of Postgres. Postgres remains the book for retrieve. `GET /api/vouchers/:id` and `POST /api/search` stay on SQL. `git grep -n opensearch -- backend/src/search/search.service.ts` and `backend/src/vouchers/` must stay **empty**.
3. **Do not revert** the S17 human ranking fix in `search.service.ts` (exact `vch_no_norm` bind is separate from LIKE `'invsr1%'` and is applied **after** COUNT). Do not edit `fixtures/search/GOLD.md` expected / pass_rule.
4. Index **only** rows that SQL search would see: `voucher.valid_to IS NULL AND voucher.is_deleted = false AND ingest_batch.status = 'published'`. Held / unpublished / superseded / deleted must **not** remain in the index.
5. Indexer is **best-effort after** the Postgres commit. If OpenSearch is down, `publish` / `hold` still succeed. Log the error. Do not roll back the batch. Do not fail the HTTP 200.
6. Do not `TRUNCATE voucher`. Do not `docker compose down -v`. Do not drop SYN9. Do not unpublish batch **345**. Do not hold/unpublish STRS batch **651**. Do not hold published sales batch **533**.
7. Do not invent a p95. Do not re-run `s9-bench.ts`. Official p95 stays **135 ms**.
8. Do not restore `parseFloat` on money. Do not edit Day Book / Sales parsers or `EXPECTED.md`.
9. Do not commit `.env`, JWTs, `D:\Tally`, or tmp CSVs. Do not `synchronize: true`.
10. `npx tsc --noEmit -p tsconfig.build.json` exit 0. `npm test` stays green (count may rise). `npm run test:e2e` stays green (count may rise). Do not weaken tests.

---

## 1. WHAT S18 IS

```
publish / hold  (Postgres first, already works)
       └► best-effort indexer
              ├─ publish  → bulk upsert current vouchers of that batch
              ├─ hold     → delete docs with that batch_id
              └─ reindex  → wipe index, bulk all current published
POST /api/search     still SQL (S19)
GET  /api/vouchers/:id still SQL
```

After S18 a steward can reindex, and a human can `GET http://127.0.0.1:9200/shankara-vouchers/_doc/<id>` and see published current vouchers. Finance search behavior is **unchanged**.

---

## 2. FILES YOU MAY TOUCH

```
backend/src/search-index/                 # new module (name may be index/)
backend/src/ingest/ingest.service.ts      # after successful publish/hold, call indexer
backend/src/ingest/ingest.module.ts       # import SearchIndex module
backend/src/app.module.ts                 # Joi OPENSEARCH_NODE optional; import module
backend/package.json                     # @opensearch-project/opensearch
backend/package-lock.json
backend/.env.example                     # OPENSEARCH_NODE=http://127.0.0.1:9200
backend/scripts/s18-reindex.ts           # HTTP steward reindex (or call the service)
S18_EVIDENCE.md
backend/src/search-index/*.spec.ts
backend/test/*.e2e-spec.ts               # optional: unique S18IDX batch publish/hold vs OS
```

**Do not edit:** `search.service.ts` (except you must not), `vouchers.service.ts`, parsers, detectors, `GOLD.md`, Day Book / Sales fixtures, `s9-bench.ts`, `s17-sql-baseline.ts`, frontend, `PHASE_1_EVIDENCE.md`, `PHASE_2_EVIDENCE.md`.

---

## 3. OPENSEARCH (compose already running)

Container: `shankara-opensearch`  
Image: `opensearchproject/opensearch:2.11.0`  
Security plugin **disabled**.  
URL: `http://127.0.0.1:9200` (no auth).

Env (`.env.example` + Joi **optional**, default `http://127.0.0.1:9200`):

```
OPENSEARCH_NODE=http://127.0.0.1:9200
```

If `OPENSEARCH_NODE` is empty / `off`, use a no-op implementation so unit tests without a cluster still pass. Live S18 evidence uses the real node.

Index name (locked): **`shankara-vouchers`**  
Document `_id` (locked): Postgres `voucher.id` as string.

### 3.1 Mapping (locked fields)

Create the index if missing. Do not index `voucher_line`.

| Field | OS type | Source |
|---|---|---|
| `company_id` | keyword | `voucher.company_id` |
| `vch_no` | keyword | `voucher.vch_no` |
| `vch_no_norm` | keyword | `voucher.vch_no_norm` |
| `party_name` | text + `.raw` keyword | `voucher.party_name` |
| `total_amount` | keyword | `voucher.total_amount` as 2-dp **string** (no float) |
| `narration` | text | `voucher.narration` |
| `vch_date` | date | `voucher.vch_date` (`yyyy-MM-dd`) |
| `vch_type` | keyword | `voucher.vch_type` |
| `batch_id` | keyword | `voucher.batch_id` as string |

S19/S20 may query these. Do not add items/HSN/dossiers.

### 3.2 Client isolation (locked)

One interface, one live adapter, one no-op:

```ts
export interface VoucherIndex {
  upsert(docs: IndexedVoucher[]): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  deleteByBatchId(batchId: string): Promise<void>;
  reindexAll(docs: IndexedVoucher[]): Promise<{ indexed: number }>; // wipe + bulk
  ping(): Promise<boolean>;
}
```

`git grep -n Client -- backend/src` / `git grep -n opensearch -- backend/src` must only hit `search-index/` (or `index/`) plus maybe `app.module.ts` Joi. Not `search.service.ts`, not `vouchers.service.ts`, not parsers.

Use `@opensearch-project/opensearch` (2.x, matches compose 2.11). Do not add Elasticsearch OSS extras.

---

## 4. WRITE PATH

Postgres transaction **commits first**. Then indexer.

### 4.1 Publish

After `publishBatch` saves `status='published'`:

- Load vouchers for that `batch_id` with `valid_to IS NULL AND is_deleted = false`.
- `upsert` those docs.
- `deleteByIds` for that batch’s rows where `valid_to IS NOT NULL OR is_deleted = true` (superseded in the same batch).

### 4.2 Hold / unpublish

After `holdBatch` saves `status='held'`:

- `deleteByBatchId(batchId)` so finance SQL-invisible rows are gone from OS.

### 4.3 Reindex (required)

Steward-only `POST /api/index/reindex` (path may vary; must be steward, finance **403**):

1. SQL current published:
   ```sql
   SELECT v.* FROM voucher v
   JOIN ingest_batch b ON b.id = v.batch_id
   WHERE v.valid_to IS NULL AND v.is_deleted = false AND b.status = 'published'
   ```
2. Wipe `shankara-vouchers` (delete index or `delete_by_query` match_all) and recreate mapping.
3. **Bulk** upsert in chunks of **500–1000**. Do not `index()` one-by-one for 30k rows.
4. Return `{ sqlCurrent, indexed }` — they must match.

`backend/scripts/s18-reindex.ts` logs in as steward and calls that route (timeout generous; 20k SYN9 + 10k STRS + clones).

Stale versioned docs from **other** batches may linger until reindex. Do not build Kafka/CDC. Reindex is the repair.

### 4.4 Best-effort

Wrap indexer calls in try/catch. Publish/hold HTTP still 200 if OS throws. Do not leave the Postgres row unpublished because OS failed.

---

## 5. WHAT YOU MUST NOT INDEX

| Row | In OS? |
|---|---|
| SYN9/* published current | yes (after reindex) |
| STRS/* published current | yes |
| `INV/SR/1` batch 533 published | yes |
| `HOLD17/1` batch 652 **held** | **no** |
| `OTHER/1` published `OTHER_CO` | **yes** (RBAC is S19, not the indexer) |
| `valid_to IS NOT NULL` | no (after reindex) |
| `is_deleted = true` | no |

---

## 6. LIVE PROOF VOUCHER (do not smash SYN9)

Unique Day Book CSV under `os.tmpdir()` (do not commit):

- Title contains `Shankara`, report `Day Book`, same headers as `sample-daybook.csv`
- One Sales voucher **`S18IDX/1`**, party `S18 Index Party`, balanced `100.00`
- Steward upload `companyId=SHANKARA_HYD` → held
- Prove **not** in OS (held)
- Steward publish → GET `_doc/<postgres id>` 200, `vch_no=S18IDX/1`
- Finance `POST /api/search` `{"q":"S18IDX/1"}` still works via **SQL** (hit in top 3)
- Steward hold → OS `_doc/<id>` **404**; finance search `S18IDX/1` total **0**
- Leave it held when done (like HOLD17). Do not hold 345/533/651.

---

## 7. `POST /api/search` UNCHANGED

After S18:

- `search.service.ts` has **no** OpenSearch import.
- Gold G7 still: finance `{"q":"INV/SR/1"}` hit 1 is exact `INV/SR/1` (ranking bind).
- Unauthenticated search still 401.
- Stop OS (`docker stop shankara-opensearch`) → `POST /api/search {"q":"SYN9/10000"}` still 200 with a hit, then `docker start shankara-opensearch`. That proves S18 did not couple search to the cluster.

---

## 8. TESTS (mandatory)

| Test | Assert |
|---|---|
| Unit: adapter maps a voucher to the locked fields (2-dp string amount, `_id` = id) | no float |
| Unit: no-op adapter does not throw | |
| Unit or e2e: finance `POST /api/index/reindex` → 403 | |
| Existing `search.service.spec.ts` still passes (exact vs LIKE binds) | do not weaken |
| Existing unit + e2e stay green | counts may rise |

Optional e2e for S18IDX publish/hold vs OS. Do not skip live evidence because “e2e covers it.”

---

## 9. `S18_EVIDENCE.md` (mandatory shape)

Environment header first: date, host, API, `OPENSEARCH_NODE`, migrations 1–5, SYN9=20000, `reset: none`. Live `curl` / `psql` / `docker`, not `Manual edit`.

| # | Gate |
|---|---|
| 1 | Environment header + `curl.exe -s http://127.0.0.1:9200` cluster name / tagline |
| 2 | `tsc --noEmit -p tsconfig.build.json` exit 0 |
| 3 | `npm test` summary (41+N) |
| 4 | `npm run test:e2e` summary (39+N) |
| 5 | `git grep -n opensearch -- backend/src/search/search.service.ts` empty; same for `vouchers/` |
| 6 | `git grep -n opensearch -- backend/src` only under the index module (+ Joi) |
| 7 | Steward reindex: `{ sqlCurrent, indexed }` equal; `GET .../shankara-vouchers/_count` matches |
| 8 | SQL `HOLD17/1` held; OS search `q=vch_no:HOLD17/1` hits **0** |
| 9 | OS has `OTHER/1` (published other company) |
| 10 | S18IDX/1: held → absent; publish → present; hold → 404; finance search 0 after hold |
| 11 | Finance reindex 403 |
| 12 | `docker stop shankara-opensearch`; finance `POST /api/search {"q":"SYN9/10000"}` 200 total≥1; `docker start` |
| 13 | Gold G7: finance `INV/SR/1` hit 1 is exact `INV/SR/1` |
| 14 | SYN9 current SQL still 20000; ranking bind not reverted (`git diff` still shows the S17 exact-norm split) |
| 15 | `GET /api/vouchers/:id` for `INV/SR/1` still returns lines + `source.sha256`; no OS in that service |

Do not write `S18_STATUS=COMPLETE` until every cell has command output. Do not write `PHASE_3_STATUS=COMPLETE`.

---

## 10. IMPLEMENTATION ORDER

1. `curl.exe -s http://127.0.0.1:9200` — if compose OS is down, `docker start shankara-opensearch` (do **not** `down -v`).
2. Interface + OS adapter + no-op + module. Mapping create.
3. `POST /api/index/reindex` steward-only. Bulk.
4. Hook publish / hold **after** Postgres commit, try/catch.
5. Reindex live. Compare counts.
6. S18IDX/1 publish/hold proof.
7. OS-down search still SQL.
8. Fill `S18_EVIDENCE.md`. Stop.

---

## 11. BANNED SENTENCES

- “Search now uses OpenSearch so S19 is basically done”
- “I skipped reindex and indexed on the fly in search.service”
- “I unpublished SYN9 so OS counts were easy”
- “p95 improved”
- “Phase 3 complete”
- “HOLD17/1 is in the index, I’ll filter in JS”

Reply with files changed, reindex counts, S18IDX proof, OS-down search proof, G7 hit 1, test summaries, evidence table. Then **stop**.
