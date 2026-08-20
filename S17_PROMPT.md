# PASTE THIS TO GEMINI (S17 ONLY)

You are the implementing agent for **Shankara Buildpro**.

Repo: `D:/5ingularity/shankara-erp`  
Live API: `http://127.0.0.1:3000` (Nest; TypeORM via **PgBouncer `:6432`**)  
UI origin is irrelevant. Do not bench against Vite.

You will be independently re-run by a human against the same Docker + API. Chat is not proof.

---

## READ IN THIS ORDER (do not skip)

1. `PHASE_STATUS.md` — start here. Phase 1 COMPLETE. Phase 2 COMPLETE. Phase 3 = **S17 issued, S18–S22 not issued**.
2. `S17_BRIEF.md` — **this is your work order. It wins on any conflict.**
3. `fixtures/search/GOLD.md` — frozen queries. Do not change expected / pass_rule columns.
4. `PHASE_3_AUDIT.md` — Phase 3 law. Only S17 is issued.
5. `S11_EVIDENCE.md` — the evidence **shape** you must copy (gate table, `cmd:` + `out:`).  
   Do **not** copy `S16_EVIDENCE.md` (one prose sentence — that style is rejected).

Do not reopen `S3_BRIEF.md`–`S16_BRIEF.md` as current law. Their “next step forbidden” lines are history.

---

## YOUR JOB (one sentence)

Measure today’s **SQL** `POST /api/search` on the frozen gold set, write `S17_EVIDENCE.md` as a 15-row gate table with live command output, then **STOP**.

S17 is **not** OpenSearch. S17 is **not** fuzz. S17 is **not** UI. S17 is **not** Phase 3 complete.

---

## HARD STOPS (any one = rejected)

1. Do not declare S17 complete in chat. `S17_EVIDENCE.md` with every cell filled is the only done signal. Then write `S17_STATUS=COMPLETE` at the top of that file. Empty cell = not done.
2. Do not invent HTTP, ranks, timings, or SQL counts. Paste the real cmd + stdout. Redact JWTs and passwords (`accessToken=<redacted, length=N>`).
3. Do not edit `backend/src/search/search.service.ts`. Do not change ranking, ILIKE, LIMIT, or RBAC. If a **G** row misses after the allowed publish below: **stop, paste top 3, wait**. Do not “fix” SQL. Do not edit `GOLD.md` expected columns.
4. Do not add an OpenSearch client. Do not call `:9200`. Do not add `@opensearch-project/*`.  
   `git grep -n opensearch -- backend/src` must stay **empty**.
5. Do not `TRUNCATE voucher`. Do not `docker compose down -v`. Do not drop SYN9. Do not unpublish batch **345**. Do not hold/unpublish STRS batch **651**.
6. Do not invent a p95. Do not re-run `s9-bench.ts`. Official Phase 1 p95 stays **135 ms**. S17 timing column is `sql_baseline_ms` (one HTTP round trip, or median of 5). Never label it p95.
7. Do not restore `parseFloat` on money. Do not edit Day Book / Sales parsers, `EXPECTED.md`, or committed `sample-*.csv`.
8. Do not commit `.env`, Tally files from `D:\Tally`, tmp CSVs, or JWTs. Do not `synchronize: true`.
9. Do not start S18–S22. Do not create `PHASE_3_EVIDENCE.md`. Do not write `PHASE_3_STATUS=COMPLETE`.
10. Do not use banned evidence words as a cell: `Verified`, `Passed in e2e`, `see GOLD.md`, `ok`, `done`, `works`.

**Previous failures on this repo (do not repeat):**

- S9: invented p95 via `ECONNREFUSED` catch. Rejected.
- S13/S16: evidence captured against a drifted volume (report_type CHECK). Independent fresh clone failed.
- S16: evidence file was one sentence. Rejected as a pattern. S17 must be a gate table like S11.

---

## FILES YOU MAY TOUCH

```
backend/scripts/s17-sql-baseline.ts     # new; live HTTP only
backend/package.json                    # optional "s17:baseline"
backend/src/search/gold-file.spec.ts    # optional: GOLD.md parses to G1–G10
S17_EVIDENCE.md                          # create; 15-row gate table
```

If `git status` shows anything else you edited (frontend, search.service, parsers, migrations, GOLD.md expected, PHASE_1/2 evidence), revert it before you reply.

---

## LIVE FACTS ON THIS MACHINE (do not “clean up”)

```
API                  http://127.0.0.1:3000
DB                   Postgres 16 via PgBouncer :6432
migrations           1 InitialSchema, 2 SearchIndex, 3 SearchIndexFixed,
                     4 SearchIndexTrgm, 5 WidenReportTypeCheck
SYN9 current         20000   (batch 345)   DO NOT TOUCH
STRS mix current     10000   (batch 651)   DO NOT TOUCH
INV/HYD/24-25/11820  published
RCT/HYD/2401         published
STRS/5000            published, party Mix Party 5000
SYN9/10000           published, party Synth Party 10000
INV/SR/1 + INV/SR/2  currently HELD batch 533 (committed sample)
                     e2e clones INV/SR/1-<digits> are published — leave them
OTHER/1              published, company_id=OTHER_CO — leave it
HOLD9/1              does not exist — you will create HOLD17/1
OpenSearch           compose container may be up — IGNORE IT
Official p95         135 ms (party, 20k SYN9). Do not replace.
```

Reset command used: **none**. Do not pretend you ran `down -v`. Put `reset=none` in the evidence header.

Seed users (passwords from `backend/.env`, never print):

- `steward@shankara.local`
- `finance@shankara.local`
- `branch@shankara.local`

---

## PREP YOU ARE ALLOWED (data only)

### A. Publish batch 533 if still held (required for G7/G8)

```sql
SELECT v.vch_no, b.id, b.status
FROM voucher v JOIN ingest_batch b ON b.id = v.batch_id
WHERE v.valid_to IS NULL AND v.vch_no IN ('INV/SR/1','INV/SR/2');
```

If `held`: steward `POST /api/batches/533/publish` (use the id the query returns).  
Re-query until both current rows are `published`.  
Do not re-upload the sales CSV. Do not publish any other held batch.

### B. Held negative HOLD17/1

Write a tiny Day Book CSV under `os.tmpdir()` (not git):

- Title contains `Shankara`, report `Day Book`, same headers as `fixtures/daybook/sample-daybook.csv`
- One Sales voucher `HOLD17/1`, party `Hold Seventeen`, balanced `100.00`
- Steward `POST /api/uploads` field `file` + `companyId=SHANKARA_HYD`
- Default held. **Do not publish.**

If vch collision, use `HOLD17/<unix>` and record that exact vch_no in N1.

### C. Do not insert another OTHER/1

---

## GOLD SET (already in GOLD.md — copy, do not rewrite)

Live `POST http://127.0.0.1:3000/api/search` `{"q":"...","limit":20}`.

**G — must pass (finance):**

| id | q | pass_rule | expected |
|---|---|---|---|
| G1 | `11820` | vch_in_top3 | `INV/HYD/24-25/11820` |
| G2 | `INV/HYD/24-25/11820` | vch_in_top3 | `INV/HYD/24-25/11820` |
| G3 | `RCT/HYD/2401` | vch_in_top3 | `RCT/HYD/2401` |
| G4 | `KA01AB1234` | vch_in_top3 | `INV/HYD/24-25/11820` |
| G5 | `STRS/5000` | vch_in_top3 | `STRS/5000` |
| G6 | `Mix Party 5000` | vch_in_top3 | `STRS/5000` |
| G7 | `INV/SR/1` | vch_in_top3 | `INV/SR/1` |
| G8 | `INV/SR/2` | vch_in_top3 | `INV/SR/2` |
| G9 | `Apex Pipes` | top_hit_party | `hits[0].partyName === 'Apex Pipes'` (record actual vchNo; do not require INV/SR/2) |
| G10 | `SYN9/10000` | vch_in_top3 | `SYN9/10000` |

`vch_in_top3` = expected string equals `hits[0].vchNo` or `hits[1].vchNo` or `hits[2].vchNo`.

If any G row fails **after** publishing 533: stop. Do not change ranking. Do not change GOLD.md.

**T — measure only (finance). Miss is allowed. Do not add fuzz.**

| id | q | note |
|---|---|---|
| T1 | `shankra` | company title is not a search field; likely total=0 |
| T2 | `inv sr 1` | normalizeVchNo strips spaces → may already hit INV/SR/1 |
| T3 | `apex pipe` | ILIKE substring of Apex Pipes; may already hit |

**A — observed, not gold pass/fail (finance). Clones inflate totals.**

| id | q |
|---|---|
| A1 | `1248500` |
| A2 | `59000` |

Record `total` + top 3 `vchNo` + `totalAmount`. Fixture not in top 3 is OK.

**N — must pass**

| id | q | role | pass |
|---|---|---|---|
| N1 | `HOLD17/1` | finance | total === 0; steward sees batch status held |
| N2 | `OTHER/1` | branch | total === 0 |
| N3 | `OTHER/1` | steward | total >= 1 |
| N4 | `11820` | none | HTTP **401** |

---

## SCRIPT

Create `backend/scripts/s17-sql-baseline.ts`:

- Load `backend/.env` via dotenv. Fail if any `SEED_*_PASSWORD` missing. No password literals.
- Login steward / finance / branch at `POST /api/auth/login`.
- Hit **HTTP** `POST /api/search` for every G/T/A/N row (N4: no Authorization). Do not import `SearchService` and skip HTTP.
- Print a markdown table: id, q, role, http, total, top3 vchNo, partyName (G9), pass, sql_baseline_ms.
- SQL print: `SELECT count(*) FROM voucher WHERE valid_to IS NULL AND vch_no LIKE 'SYN9/%'` → must be 20000.
- Do not write results into `GOLD.md`.
- Do not call OpenSearch.

Optional: `"s17:baseline": "ts-node scripts/s17-sql-baseline.ts"` in `backend/package.json`.

Optional: `backend/src/search/gold-file.spec.ts` that reads `fixtures/search/GOLD.md` and asserts ids G1–G10 exist. It must **not** hit HTTP (volume-dependent).

---

## S17_EVIDENCE.md — mandatory 15 gates

Environment header first:

```
date: (today)
host: Windows, 11th Gen Intel Core i3-1115G4
api: http://127.0.0.1:3000
DATABASE_PORT: 6432
reset: none
migrations: (paste SELECT id, name FROM migrations)
syn9_current: (paste count)
```

Then this table. Right-hand cell = `cmd:` + `out:` only.

| # | Gate |
|---|---|
| 1 | Environment header as specified |
| 2 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 |
| 3 | `npm test` — paste summary line |
| 4 | `npm run test:e2e` — paste summary line |
| 5 | `git grep -n opensearch -- backend/src` empty |
| 6 | SQL: INV/SR/1 and INV/SR/2 current rows `published` |
| 7 | G1–G10: each id with q, total, top3, pass, sql_baseline_ms |
| 8 | T1–T3: each id with total + top3 (miss OK) |
| 9 | A1–A2: total + top3 + amounts |
| 10 | N1 finance HOLD17/1 total=0 + steward batch held |
| 11 | N2 branch OTHER/1 total=0 |
| 12 | N3 steward OTHER/1 total>=1 |
| 13 | N4 unauthenticated search HTTP 401 |
| 14 | SYN9 current = 20000 after prep |
| 15 | `git diff -- fixtures/search/GOLD.md` empty |

Do not write `S17_STATUS=COMPLETE` until all 15 cells have real output.

SQL helper:

```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "..."
```

---

## ORDER OF WORK

1. `curl.exe -s http://127.0.0.1:3000/api/health` and migrations + SYN9 count.
2. Publish 533 if held.
3. Upload HOLD17/1 held.
4. Write and run `s17-sql-baseline.ts`.
5. If a G row fails: stop and report. Do not patch search.
6. Fill `S17_EVIDENCE.md` while you go.
7. tsc / npm test / test:e2e / grep.
8. **Stop. Do not start S18. Do not git push unless the human asks. You may commit only the files listed above if the human asks.**

---

## REPLY FORMAT (then stop)

1. Files changed (paths only)
2. Sales batch publish result (id + status)
3. Full G/T/A/N tables from the script
4. SYN9 count
5. `npm test` and `test:e2e` summary lines
6. The 15-row evidence table
7. `git status --short`

No architecture essay. No “ready for S18.” No OpenSearch.
