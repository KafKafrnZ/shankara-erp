# S9 WORK ORDER — 20k SYNTHETIC INGEST + SEARCH p95 ONLY

You are implementing **S9 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §3 item 12, §11 S9, §12 gate 24, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S8 are done and independently verified.** Do not rewrite parser, search ranking, frontend, or auth.  
**S10 is forbidden.** Do not fill gates 1–23 or 25 of `PHASE_1_EVIDENCE.md`. Do not write `PHASE_1_STATUS=COMPLETE`.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S9 complete in chat. Fill `S9_EVIDENCE.md`. Empty cell = not done.
2. **Do not invent a p95.** The number must come from the bench script hitting **live** `POST /api/search` on `http://127.0.0.1:3000`. If you write “fast” or “~200ms” without the script table, S9 is rejected.
3. If measured p95 **> 200 ms**, S9 is **not complete**. Report the real number. You may add a btree-friendly index **only** via a new TypeORM migration (no `synchronize: true`). You may **not** add OpenSearch.
4. Do not commit the synthetic CSV. Write it under `os.tmpdir()` or `backend/var/` (already gitignored). `git status` must not show a 20k-row fixture.
5. Do not `TRUNCATE voucher`. Use unique voucher numbers (`SYN9/{n}`) so you do not smash S5/S6/S8 data more than necessary. Company title must still contain `Shankara` (detect `COMPANY_MISMATCH` otherwise). `companyId=SHANKARA_HYD`.
6. Do not edit `frontend/` except if `npm run build` is already green (leave it).
7. Do not edit parser/detector/validator rules, `EXPECTED.md`, or committed `sample-*.csv`.
8. Do not add GraphQL, Kafka, Prisma, OpenSearch, AG Grid, or a new app.
9. Do not commit `.env`. Do not put passwords in the script; read `SEED_STEWARD_PASSWORD` from env.
10. `npx tsc --noEmit -p tsconfig.build.json` exit 0. Existing unit 28 and e2e 37 stay green.

---

## 1. WHAT S9 IS

Prove the **SQL search** path is usable on a Day Book sized like a real month, not the 2-voucher fixture.

```
generate ≥20_000 balanced Day Book vouchers as CSV
  → POST /api/uploads (steward)  [long timeout]
  → if held, POST /api/batches/:id/publish
  → 100× POST /api/search (warmup 10, then measure)
  → print p50 / p95 / p99
  → write that p95 into PHASE_1_EVIDENCE.md gate 24 only
```

Ingest **through the HTTP API**, not a private `parseDayBook` loop that skips upload/audit. The point is the same path a steward uses.

---

## 2. FILES YOU MAY TOUCH

```
backend/scripts/s9-bench.ts          # generator + HTTP bench
backend/package.json                 # optional script "s9:bench"
.gitignore                            # only if you must ignore a local csv path
PHASE_1_EVIDENCE.md                   # create; fill gate 24 ONLY
S9_EVIDENCE.md
backend/src/database/migrations/*    # ONLY if you need an index to meet p95 ≤ 200ms
```

**Do not edit:** `frontend/src`, parser, search ranking logic (unless you add a migration index and keep the same SQL predicates), fixtures, S0–S8 briefs.

---

## 3. SYNTHETIC FILE (exact layout)

CSV must detect as Day Book (same fingerprint as `sample-daybook.csv`):

```
Shankara Buildpro - Hyderabad
Day Book
1-Apr-25 to 30-Apr-25

Date,Particulars,Vch Type,Vch No.,Debit,Credit
```

For `n` in `1..N` (N ≥ 20000):

```
1-Apr-25,Synth Party {n},Sales,SYN9/{n},"1,000.00",
,Sales GST {n},,,,"1,000.00"
```

Rules:

- Debit column on the header row, **Credit** column on the follow-on line (quoted Indian commas). Do **not** put GST in Debit.
- Unique `vch_no` so upsert does not version S8 data.
- Skip Opening/Grand Total or include them once; they must not become vouchers.
- Print `generated_vouchers=N` and file bytes.

N default **20000**. Env `S9_VOUCHERS` may raise it, not lower it below 20000.

---

## 4. INGEST

Script (Node, `ts-node` is already a backend dep):

1. `POST /api/auth/login` steward (`steward@shankara.local` / `SEED_STEWARD_PASSWORD`). Fail if env missing.
2. `POST /api/uploads` multipart field `file` + `companyId=SHANKARA_HYD`. Use a **≥ 10 minute** timeout. Do not use the browser.
3. If `status === 'rejected'` → print `errorSummary` and exit 1.
4. If `held` → `POST /api/batches/:id/publish`.
5. SQL: `SELECT count(*) FROM voucher v JOIN ingest_batch b ON v.batch_id = b.id WHERE b.id = $1 AND v.valid_to IS NULL`. Must be ≥ N.
6. Print `batchId`, `ingest_ms`, `publish_ms`, `acceptedRows`.

If HTTP upload cannot finish (proxy timeout), you may call the running API via `http.request` with `timeout: 0` from the script. You may **not** bypass `IngestService.processUpload`.

---

## 5. SEARCH BENCH

After publish, against `http://127.0.0.1:3000`:

- Warmup: 10 requests discarded.
- Measure: **100** requests, `POST /api/search` with finance **or** steward token.
- Record elapsed ms per request (client-side, `Date.now()` around the full HTTP round trip).
- Sort, p50 = index 49, p95 = index 94, p99 = index 98 (0-based, N=100).

Run **three** query shapes, each 100 measured calls (or 100 mixed; if mixed, still report per-shape p95):

| Shape | `q` |
|---|---|
| vch fragment | `SYN9/10000` (must hit) |
| party | `Synth Party 10000` |
| amount | `1000` or `1,000.00` |

Print a table:

```
shape          n   p50_ms   p95_ms   p99_ms   hits_min
vch            100  ..      ..       ..       ≥1
party          100  ..      ..       ..       ≥1
amount         100  ..      ..       ..       ≥1
```

Gate 24 uses the **worst** of the three p95 values. That worst p95 must be **≤ 200**.

Do not include warmup. Do not use `curl` timing from one request as p95.

---

## 6. `PHASE_1_EVIDENCE.md`

Create the file. Copy the §12 table from `PHASE_1_AUDIT.md`. Fill **only** row 24, for example:

```
| 24 | Synthetic 20k+ ingest search p95 recorded | N=20000 vouchers; worst p95=NNN ms (vch fragment); 100 calls; host=Windows, CPU=… |
```

Leave 1–23 and 25 **empty**.  
Do **not** add `PHASE_1_STATUS=COMPLETE`.

---

## 7. IMPLEMENTATION ORDER

1. Generator writes tmp CSV; print N and bytes.  
2. HTTP login → upload → publish → SQL count.  
3. Bench three shapes; print table.  
4. If worst p95 > 200: add an index migration that matches existing search `WHERE` (company_id, vch_no_norm, total_amount, party_name, valid_to). Re-run bench. Do not add OpenSearch.  
5. Write gate 24. Fill `S9_EVIDENCE.md`. Stop.

---

## 8. BANNED SENTENCES

- “p95 is fine, around 200ms”
- “I skipped HTTP upload and inserted 20k rows with a SQL loop”
- “I committed synthetic-20k.csv so you can replay”
- “I turned on OpenSearch for S9”
- “Phase 1 complete” / fill gates 1–25

Reply with files changed, the bench table, SQL count, `npm test` / `test:e2e` summaries, and the evidence table. Then **stop**.
