# S10 WORK ORDER — FILL PHASE 1 EVIDENCE ONLY

You are implementing **S10 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §11 S10, §12 gates 1–25, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S9 are done and independently verified.** Do not rewrite parser, search ranking, frontend, auth, ingest, or indexes.  
**Product Phase 2 is forbidden.** No Sales Register, no OpenSearch client, no AG Grid, no GST, no mapping UI, no “Create Voucher.”

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S10 complete in chat. Fill `PHASE_1_EVIDENCE.md` and `S10_EVIDENCE.md`. Empty cell = not done.
2. **Do not invent evidence.** Every cell must contain a **live** command (or URL) **and** the real output from this machine, this Docker, this API on `http://127.0.0.1:3000`. Copy-pasting `S5_EVIDENCE.md` / `S6_EVIDENCE.md` / e2e names (“Passed in e2e”, “Verified”) is a fail.
3. Do not write `PHASE_1_STATUS=COMPLETE` until **all 25** right-hand cells are filled with pasteable evidence. Gate 24 is already filled (do not blank it, do not change the 135 ms number, do not re-run `s9-bench.ts`).
4. Do not start Phase 2. Do not add features “while you are here.” If a live gate fails, you may apply the **minimum** code or env-example fix that makes that gate true, then re-run **that** gate. No drive-by refactors.
5. Do not `TRUNCATE voucher`. Do not drop indexes. Do not unpublish batch **345**. Do not delete `SYN9/%` rows. The 20k ingest stays.
6. Do not edit `fixtures/daybook/EXPECTED.md` or committed `sample-*.csv`. Do not restore `_headerSide` / debit-credit flip.
7. Do not add GraphQL, Kafka, Prisma, OpenSearch, AG Grid, or a new app. `git grep -n opensearch -- backend/src` must stay empty.
8. Do not commit `.env`. Do not paste passwords or JWT values into evidence files. Redact tokens as `accessToken=<redacted, length=N>`.
9. Do not use `synchronize: true`. Do not add a migration unless a gate 22/23 unique/FK check is actually missing (it is not — do not touch schema “to be safe”).
10. `npx tsc --noEmit -p tsconfig.build.json` exit 0. `npm test` and `npm run test:e2e` stay green. Do not weaken tests to make a cell green.

---

## 1. WHAT S10 IS

S10 is **not a feature**. It is the binary definition of done from `PHASE_1_AUDIT.md` §12:

```
run the live commands for gates 1–23 and 25
  → paste command + result into PHASE_1_EVIDENCE.md
  → paste the same (or fuller stdout) into S10_EVIDENCE.md
  → only then write PHASE_1_STATUS=COMPLETE as the first line of PHASE_1_EVIDENCE.md
```

A human will re-run the same commands. If a cell cannot be reproduced, S10 is rejected and `PHASE_1_STATUS=COMPLETE` must be removed.

---

## 2. FILES YOU MAY TOUCH

```
PHASE_1_EVIDENCE.md     # fill gates 1–23 and 25; keep gate 24 as-is; COMPLETE line last
S10_EVIDENCE.md         # create; raw command log, one section per gate
backend/.env.example   # ONLY if gate 3 is missing keys (placeholders, empty secrets)
backend/README.md      # ONLY if you replace the Nest tutorial with a ≤30-line runbook
```

**Do not edit** (unless a live gate fails, and then only the failing file):

`frontend/src`, parser, detector, validator, search ranking, ingest upsert, fixtures, docker-compose.yml, migrations, `s9-bench.ts`, S0–S9 briefs.

If you “clean up” `SearchDto`, `parseFloat`, health `asOf: null`, or the Nest README without a failing gate, that is a reject.

---

## 3. LIVE TARGET

Assume (do not mock):

- `docker compose up -d` already running: Postgres `:5432`, **PgBouncer `:6432`**, Redis, OpenSearch (ignore OpenSearch).
- API on `http://127.0.0.1:3000` using `DATABASE_PORT=6432`.
- Seeded users: `steward@shankara.local`, `finance@shankara.local`, `branch@shankara.local`. Passwords from `backend/.env` (`SEED_*_PASSWORD`). Do not print them.
- Committed fixture: `fixtures/daybook/sample-daybook.csv`  
  **There is no `sample-daybook.xlsx` in git.** Gate 7 uses the **csv**. Do not invent an xlsx.
- `EXPECTED.md`: 2 vouchers (`INV/HYD/24-25/11820`, `RCT/HYD/2401`), 6 lines, party `Sri Steel Traders`, amount `1248500.00`.
- SYN9 current count is **20000**. Leave it.

SQL via:

```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "..."
```

HTTP via `curl.exe` or Node `fetch` against `http://127.0.0.1:3000`. Not the Vite origin.

---

## 4. HOW TO FILL A CELL

Each `PHASE_1_EVIDENCE.md` right-hand cell must be short but **reproducible**:

```
cmd: curl.exe -s -w " HTTP %{http_code}" http://127.0.0.1:3000/api/health
out: {"status":"ok","db":"ok","asOf":null} HTTP 200
note: API TypeORM DATABASE_PORT=6432 (backend/.env)
```

Banned cell text:

- `Verified`
- `Passed in e2e`
- `see S6_EVIDENCE`
- `N/A` (except the optional backup note, which is **not** one of 1–25)
- `ok` / `done` / `works`

`S10_EVIDENCE.md` holds the longer stdout. The §12 table holds the one-line cmd + result.

---

## 5. GATE-BY-GATE (do these live)

Work in order. Stop and fix if a gate fails; do not skip ahead to write COMPLETE.

### 1 — Compose + migrations + health via 6432

```
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT id, name FROM migrations ORDER BY id;"
curl.exe -s http://127.0.0.1:3000/api/health
```

Must show pgbouncer `0.0.0.0:6432`, postgres healthy, migrations including `InitialSchema` + the three search-index ones, health JSON with `"db":"ok"`. Prove API uses 6432: `DATABASE_PORT=6432` in `backend/.env` (quote the key, **not** the password). Health `asOf: null` is OK for this endpoint; real as-of is gate 16.

### 2 — No password literals

```
git grep -n supersecretpassword
git grep -n "password:" -- backend/src
```

Both empty. Paste the empty output (or `git grep` exit 1). Do not “fix” by deleting comments that are not literals.

### 3 — `.env.example` exists; `.env` untracked

```
Test-Path backend/.env.example
git ls-files "*.env"
git check-ignore -v backend/.env
git check-ignore -v .env
```

`backend/.env.example` already exists with empty secrets. `git ls-files` must **not** list `.env` or `backend/.env`. If a root `.env` is tracked, untrack it (`git rm --cached`), do not delete the working file.

### 4 — Seed login, three roles

`POST /api/auth/login` three times. Paste HTTP 200 + `role` / `email` (redact JWT). Then `GET /api/auth/me` with each token: steward / finance / branch.

### 5 — Unauthenticated search is 401

```
curl.exe -s -w " HTTP %{http_code}" -X POST http://127.0.0.1:3000/api/search -H "Content-Type: application/json" -d "{\"q\":\"11820\"}"
```

Must be **401**, not 200 with empty hits.

### 6 — Finance cannot upload (403)

Login finance. `POST /api/uploads` with any file + `companyId=SHANKARA_HYD`. Must be **403**.

### 7 — Steward uploads the committed sample

Steward `POST /api/uploads` multipart field `file` = `fixtures/daybook/sample-daybook.csv`, `companyId=SHANKARA_HYD`. Do **not** send `autoPublish=true`. Paste `batchId`, `status` (`held` or `duplicate` or `published`). SHA duplicate of an already-ingested sample is **200 / duplicate** and is acceptable **if** gates 8 and 10 still hold for that sample.

### 8 — Batch published (or held then publish)

If gate 7 returned `held`, steward `POST /api/batches/:id/publish` → 200, SQL `status='published'` and `published_at IS NOT NULL`. If already published from an earlier session, `GET /api/batches/:id` + SQL for that id is enough. Do not republish batch 345 as a stunt.

### 9 — Original file retrievable by `storage_key`

SQL:

```sql
SELECT sf.id, sf.sha256, sf.storage_key, sf.original_name, sf.bytes
FROM source_file sf
JOIN ingest_batch b ON b.source_file_id = sf.id
WHERE b.id = <sample-batch-id>;
```

Then prove the bytes exist at `backend/var/uploads/{aa}/{bb}/{sha256}` (LocalFs key is `aa/bb/sha256`). `Test-Path` or `Get-Item` length matches `sf.bytes`. Do not upload a new file just to pass this if the sample file is already on disk.

### 10 — Voucher count matches EXPECTED.md

The **table is not 2 rows** (SYN9 is 20k). Count the **sample** keys:

```sql
SELECT v.vch_no, v.party_name, v.total_amount,
       (SELECT count(*) FROM voucher_line vl WHERE vl.voucher_id = v.id) AS lines
FROM voucher v
WHERE v.valid_to IS NULL
  AND v.vch_no IN ('INV/HYD/24-25/11820','RCT/HYD/2401')
ORDER BY v.vch_no;
```

Must be **2** current vouchers, line counts **4** and **2** (6 total), party `Sri Steel Traders`, amount `1248500.00` on the sales voucher.

### 11 — Re-upload same file: current count unchanged

Upload `sample-daybook.csv` **again**. SQL count from gate 10 must stay **2** current rows for those `vch_no`. Paste before and after counts + upload status (`duplicate` or held with no extra current rows).

### 12 — Search `11820` hits in rank 1–3

Finance or steward `POST /api/search` `{"q":"11820"}`. Paste `total` and the first three `hits[].vchNo`. `INV/HYD/24-25/11820` must appear in **hit 1–3**.

### 13 — Search fixture party

`{"q":"Sri Steel"}` — a hit with `partyName` `Sri Steel Traders`.

### 14 — Search fixture amount

`{"q":"1248500"}` or `{"q":"12,48,500.00"}` — that sales voucher is in the hits.

### 15 — GET voucher returns lines + source lineage

`GET /api/vouchers/:id` for the sales voucher id from gate 12. Body must include:

- `lines` length **4**
- CGST credit `112365.00` (string or numeric 2-dp)
- `source.sha256`
- `source.batchId`
- `source.publishedAt` non-null

### 16 — As-of is batch `published_at` (IST), not a hardcoded date

```
GET /api/meta/as-of          → ISO timestamp or { asOf: "..." }
SQL: SELECT MAX(published_at) FROM ingest_batch WHERE status='published';
```

They must match (same instant). Then prove UI format is `Asia/Kolkata`:

```
git grep -n "Asia/Kolkata" -- frontend/src
git grep -n "17 Aug 2026" -- frontend/src
```

Kolkata present; `17 Aug 2026` absent. Convert the ISO to IST in the cell (e.g. `2026-08-19 … IST`). That is the as-of a user should see. Do not require a screenshot.

### 17 — Branch cannot see another `company_id`

Branch user `company_id=SHANKARA_HYD`. Need **one** published voucher with `company_id <> 'SHANKARA_HYD'`.

If none exists, **SQL insert** a throwaway published `ingest_batch` + one `voucher` (`company_id='OTHER_CO'`, unique `vch_no` e.g. `OTHER/1`, `valid_to` NULL, `is_deleted` false). Do not attach it to batch 345. Do not TRUNCATE.

Then:

- branch `POST /api/search` `{"q":"OTHER/1"}` → `total === 0`
- steward `POST /api/search` `{"q":"OTHER/1"}` → `total >= 1`
- branch `GET /api/vouchers/:id` of that row → **404** (not 403)

Leave the OTHER_CO row; do not clean it up with a delete of facts.

### 18 — Unpublished / held batch not in finance search

Do **not** hold batch 345.

Upload a **unique** tiny Day Book (write under `os.tmpdir()`, unique `vch_no` e.g. `HOLD9/1`, company title still contains `Shankara`, same header fingerprint as the sample). Default `autoPublish` false → `held`.

- finance `POST /api/search` `{"q":"HOLD9/1"}` → `total === 0`
- steward `GET /api/batches/:id` → `status=held`
- Do not publish this batch.

### 19 — `audit_event` has login, upload, search, voucher_open

```sql
SELECT action, count(*) FROM audit_event
WHERE action IN ('login','upload','search','voucher_open')
GROUP BY action ORDER BY action;
```

All four counts **≥ 1**. If `voucher_open` is 0, hit gate 15 first then re-query. Do not INSERT audit rows by hand.

### 20 — Backend tests passing

From `backend/`:

```
npx tsc --noEmit -p tsconfig.build.json
npm test
npm run test:e2e
```

Paste the summary lines (`Tests: N passed, N total`). Do not paste the entire suite. Fail = S10 not done. Do not skip e2e because “unit is enough.”

### 21 — No empty Nest classes / getHello / AG Grid / fake pills

```
git grep -n getHello -- backend/src
git grep -n "AG Grid" -- frontend/src
git grep -n "Parties" -- frontend/src
git grep -n "Create Voucher" -- frontend/src
```

All empty. Also: no `@Controller(...) export class X {}` empty body in `backend/src`. If you find one, implement or delete it, then re-grep.

### 22 — Unique constraints on `voucher`

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='voucher' ORDER BY indexname;
```

Must include `voucher_current_key` with `NULLS NOT DISTINCT` and `voucher_guid_current`. Paste those two `indexdef` lines.

### 23 — `voucher_line` FK has **no** ON DELETE CASCADE

```sql
SELECT c.conname, c.confdeltype
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'voucher_line' AND c.contype = 'f';
```

`confdeltype` must **not** be `c`. (`a` = no action, `r` = restrict are OK.)

### 24 — Already filled

Leave:

```
N=20000 vouchers; worst p95=135 ms (party); 100 calls; host=Windows, CPU=11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz
```

Do not re-bench. Do not “improve” to a new number.

### 25 — Evidence file committed

```
git add PHASE_1_EVIDENCE.md S10_EVIDENCE.md S10_BRIEF.md
git status
git commit -m "docs: fill Phase 1 evidence gates 1-25"
git log -1 --oneline
git ls-files PHASE_1_EVIDENCE.md
```

Commit **only** those evidence/brief docs (plus `.env.example` / README if you had to touch them for a failed gate). Do not `git add` `backend/src`, fixtures, or `.env`. Do **not** `git push`. If commit is refused by a hook, paste `git status` + the hook error; do not force.

---

## 6. COMPLETE LINE (last)

When gates 1–25 are filled with real evidence, set the **first line** of `PHASE_1_EVIDENCE.md` to:

```
PHASE_1_STATUS=COMPLETE
```

Keep the markdown table immediately after. Do not add essays, architecture diagrams, or a Phase 2 roadmap.

Optional (not a substitute for 1–25): one `pg_dump --schema-only` note. Skip unless you already did it.

---

## 7. IMPLEMENTATION ORDER

1. Confirm compose + API (gate 1). If health is down, start the API; do not fake JSON.
2. Gates 2–3 (repo hygiene).
3. Gates 4–6 (auth).
4. Gates 7–11 (sample ingest + idempotent re-upload + EXPECTED counts).
5. Gates 12–16 (search + retrieve + as-of).
6. Gates 17–18 (RBAC / held). Insert OTHER_CO and HOLD9 as specified; do not smash SYN9.
7. Gates 19–23 (audit, tests, grep, constraints).
8. Gate 24 untouched.
9. Fill `S10_EVIDENCE.md` with the raw logs as you go.
10. Gate 25 commit. Then COMPLETE line. Stop.

---

## 8. BANNED SENTENCES

- “Phase 1 complete” before the COMPLETE line **and** a full table
- “Ready for Phase 2”
- “Verified” / “Passed in e2e” as a cell
- “I skipped live HTTP and copied S6_EVIDENCE”
- “I truncated SYN9 so EXPECTED counts are the whole table”
- “I uploaded OpenSearch for completeness”
- “p95 is still 135, I re-ran s9-bench to be sure” (do not re-run)

Reply with files changed, the filled §12 table, test summaries, `git log -1`, and **stop**.
