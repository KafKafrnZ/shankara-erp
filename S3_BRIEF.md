# S3 WORK ORDER — UPLOAD + OBJECT STORE ONLY

You are implementing **S3 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §7.1 (upload row only), §6 `storage/`, and this file.  
If this file and anything else conflict, **this file wins**.

**S2 is already complete and verified.** Do not rewrite auth, JWT, guards, seed, migrations, or health.  
**S4–S10 are forbidden.** No Day Book parser. No detect. No OpenSearch. No frontend. No AG Grid. No Phase 2.

---

## 0. HARD RULES (violation = rejected work)

1. Do not declare S3 complete in chat. Create `S3_EVIDENCE.md` with the table in §8 filled. Empty cells = not done.
2. Do not start S4. If you write a parser, ExcelJS Day Book grouping, or `detect/` folder, the PR is rejected.
3. Do not change auth behavior. `npm run test:e2e` must stay green (update **only** the steward upload case — see §6).
4. Do not add GraphQL, Kafka, Prisma, MinIO, S3 AWS SDK, OpenSearch client, or new frameworks.
5. Do not commit `.env`. Do not put passwords in source.
6. Do not use `synchronize: true`.
7. Do not `console.log` the file and return `{ ok: true }`. The current stub must be **replaced**.
8. Do not store files under the original filename only. Storage key is derived from **SHA-256**.
9. Parse happens in S4. After S3 the batch status is `uploaded` or `duplicate`. Never `parsing` / `published` from this step.
10. If you finish early, add tests. Do not invent features.

---

## 1. WHAT S3 IS

Replace `POST /api/uploads` so a **steward** can send a multipart file and the system:

1. Rejects non-steward (403) and anonymous (401) — already true; keep it.
2. Accepts only `.xlsx .xls .csv .zip`.
3. Rejects bodies larger than `MAX_UPLOAD_BYTES` (default 52428800).
4. Streams the file to disk under `STORAGE_DIR`.
5. Computes **SHA-256** of the bytes.
6. Inserts `source_file` (unique on `sha256`).
7. Inserts `ingest_batch` with `status='uploaded'`, `report_type='DAY_BOOK'`, `company_id` from the form, `tally_company` same as `companyId` for Phase 1, `uploaded_by` = current user.
8. If that SHA-256 already exists: **do not store a second copy**. Return the existing batch with a duplicate flag. Set new attempt’s visible status to the existing row (`duplicate` semantics: return existing `source_file` + its `ingest_batch`). Do not insert a second `source_file`. You may skip a second `ingest_batch` or insert one with `status='duplicate'` pointing at the same `source_file_id` — pick **one** and test it. Required: **voucher tables stay untouched** and a second upload of the same bytes does not create a second `source_file` row.
9. Writes `audit_event.action = 'upload'` with `meta: { sha256, batchId, duplicate }`.
10. HTTP: **202** for a new file, **200** for duplicate. JSON shape below.

No parsing. No ExcelJS. No validation of Day Book layout. You may persist the original filename only as metadata.

---

## 2. FILES YOU MAY TOUCH

Create / edit **only** these (plus tests and `S3_EVIDENCE.md`):

```
backend/src/storage/object-store.ts          # interface
backend/src/storage/local-fs.object-store.ts
backend/src/storage/storage.module.ts
backend/src/ingest/ingest.module.ts
backend/src/ingest/ingest.controller.ts      # replace stub
backend/src/ingest/ingest.service.ts         # create — real service
backend/src/ingest/dto/upload.dto.ts
backend/src/ingest/entities/source-file.entity.ts
backend/src/ingest/entities/ingest-batch.entity.ts
backend/src/app.module.ts                    # register StorageModule; add STORAGE_DIR + MAX_UPLOAD_BYTES to Joi
backend/.env.example                        # ensure STORAGE_DIR + MAX_UPLOAD_BYTES documented
backend/test/auth.e2e-spec.ts               # only the steward upload test
backend/test/upload.e2e-spec.ts             # new
fixtures/daybook/tiny.bin                     # or tiny.csv — any small allowed file for e2e
S3_EVIDENCE.md
.gitignore                                    # already ignores backend/var/ — do not remove that
```

**Do not edit** `auth/`, `users/`, `health/`, `database/migrations/`, `seed.ts`, `frontend/`, `docker-compose.yml` except if you absolutely must add a comment. No new migration unless an entity cannot map the **existing** tables. The tables `source_file` and `ingest_batch` **already exist**. Map them. Do not drop/recreate.

---

## 3. OBJECT STORE CONTRACT

```ts
export type StoredObject = {
  key: string;
  sha256: string;
  bytes: number;
};

export interface ObjectStore {
  put(sha256: string, body: NodeJS.ReadableStream | Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
}
```

Local implementation:

- Root = `STORAGE_DIR` (default `./var/uploads`, resolved from `backend/` cwd).
- Key format: `{first2}/{next2}/{sha256}` e.g. `ab/cd/abcd…64hex`.
- `put` is idempotent: if the file already exists on disk, do not overwrite; still return the same key/sha/size.
- Create parent dirs.
- Bind this interface with a provider token (`OBJECT_STORE`). Do not import `LocalFsObjectStore` from the ingest service — inject the interface.

No AWS. No MinIO. The interface exists so S3-compatible storage can replace the impl later without touching ingest.

---

## 4. HTTP CONTRACT

`POST /api/uploads`  
Guards: JWT + `@Roles('steward')`  
`Content-Type: multipart/form-data`

| Field | Required | Rules |
|---|---|---|
| `file` | yes | `.xlsx .xls .csv .zip` only; size ≤ `MAX_UPLOAD_BYTES` |
| `companyId` | yes | non-empty string; Phase 1 fixture uses `SHANKARA_HYD` |
| `branchId` | no | string |
| `autoPublish` | no | **ignore in S3** (do not parse/publish) |

**202 Created new:**

```json
{
  "batchId": 1,
  "status": "uploaded",
  "duplicate": false,
  "sha256": "64-hex-lowercase",
  "originalName": "daybook.xlsx",
  "bytes": 12345
}
```

**200 Same bytes already stored:**

```json
{
  "batchId": <existing batch id>,
  "status": "duplicate",
  "duplicate": true,
  "sha256": "same",
  "originalName": "<original stored name or new name>",
  "bytes": 12345
}
```

Errors:

| Case | Status |
|---|---|
| No token | 401 |
| finance / branch | 403 |
| missing file or companyId | 400 |
| bad extension | 400 |
| oversize | 413 or 400 (pick one, test it) |

Use `FileInterceptor('file')`. Set multer limits from `MAX_UPLOAD_BYTES`. Do not use memory storage for the whole file if you can dest-to-disk; memory is allowed only if you still hash and then write via `ObjectStore.put` and **never** leave an orphan tmp file on success. Clean tmp files on failure.

`GET /api/batches/:id` — **not required in S3**. Do not build the rest of the ingest pipeline.

---

## 5. DATABASE RULES

Use TypeORM entities mapped to existing columns (`sha256`, `storage_key`, `original_name`, `byte_size`, `uploaded_by`, etc.).  
`synchronize` stays **false**.

- `source_file.sha256` is UNIQUE — catch the unique violation for the duplicate path; do not delete the first row.
- `ingest_batch.file_sha256` is UNIQUE in the current schema. Second upload of the same file **must not** violate this blindly. Use the existing batch (return it with `duplicate: true`). Do not wrap this in “delete all batches and retry.”
- Do not insert into `voucher` / `voucher_line` / `master_ledger` / `ingest_reject`.
- `uploaded_by` = authenticated user id (bigint). Not a name string.

---

## 6. TESTS (required)

Keep `test/auth.e2e-spec.ts` passing.

**Change only this:** the test `steward CAN hit a steward-only stub` currently POSTs an empty body and expects 201. Update it to attach `fixtures/daybook/tiny.csv` (create a 1-line CSV) plus `companyId=SHANKARA_HYD` and expect **202** (or **200** if that fixture was already uploaded in an earlier test). Do not delete the 401/403 upload tests.

Add `test/upload.e2e-spec.ts`:

| Test name | Assert |
|---|---|
| `unauthenticated upload is 401` | |
| `finance upload is 403` | |
| `steward upload without file is 400` | |
| `steward upload bad extension is 400` | `.exe` or `.txt` |
| `steward upload csv creates source_file and batch uploaded` | 202; row in `source_file`; row in `ingest_batch` status `uploaded`; file exists on disk at `storage_key`; audit `upload` |
| `second upload same bytes is duplicate and does not add source_file` | 200; `duplicate: true`; `COUNT(*)` on `source_file` unchanged |
| `stored file sha256 matches response` | hash the file on disk |

Unit test (optional but preferred): `local-fs.object-store.spec.ts` — `put` twice with same sha is idempotent.

`npm run test:e2e` must pass **all** files.

---

## 7. IMPLEMENTATION ORDER

1. `ObjectStore` + local impl + module.  
2. Entities for `source_file` and `ingest_batch`.  
3. Replace stub controller/service.  
4. Wire `STORAGE_DIR` / `MAX_UPLOAD_BYTES` in Joi (`STORAGE_DIR` default `./var/uploads`, `MAX_UPLOAD_BYTES` default `52428800`).  
5. Tests.  
6. Restart API if you run one.  
7. Fill `S3_EVIDENCE.md`. Stop.

---

## 8. EVIDENCE — copy to `S3_EVIDENCE.md`

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | |
| 2 | `npm run test:e2e` all pass | paste summary line |
| 3 | No parser / exceljs / opensearch added | `git grep -i exceljs` empty |
| 4 | Steward + tiny.csv → 202, `status=uploaded` | |
| 5 | Same file again → 200, `duplicate=true` | |
| 6 | `SELECT count(*) FROM source_file` unchanged on second upload | |
| 7 | File on disk under `STORAGE_DIR` named by sha256 path | |
| 8 | finance → 403, no token → 401 | |
| 9 | `audit_event` has `upload` | |
| 10 | Auth e2e still passing | |

When 1–10 are filled:

```
S3_STATUS=COMPLETE
```

Until that line exists, S3 is not complete.

---

## 9. BANNED SENTENCES

- “S3 complete, ready for S4” without `S3_EVIDENCE.md`
- “Parser skeleton is in place”
- “I also added OpenSearch indexing”
- “Upload returns `{ ok: true }` for now”

Reply to the human with: files changed, e2e summary, and the evidence table. Then **stop**.
