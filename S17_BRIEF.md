# S17 WORK ORDER — GOLD SET + SQL BASELINE ONLY

You are implementing **S17 only** of Shankara Buildpro Phase 3.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_3_AUDIT.md`, `PHASE_STATUS.md` §7, `fixtures/search/GOLD.md`, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S16 are done.** Do not rewrite parsers, money, upsert, auth, or frontend.  
**S18–S22 are forbidden.** Do not add an OpenSearch client. Do not index. Do not add fuzz. Do not highlight in the UI. Do not create `PHASE_3_EVIDENCE.md`. Do not write `PHASE_3_STATUS=COMPLETE`.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S17 complete in chat. Fill `S17_EVIDENCE.md` as a **gate-by-gate table** (not one prose sentence — that was S16’s miss). Empty cell = not done.
2. **Do not invent HTTP or ranks.** Every gold / typo / amount / visibility row must be a live `POST /api/search` (or 401) against `http://127.0.0.1:3000`. Paste cmd + stdout (redact JWT).
3. **Do not change search ranking.** A human already split the `vch_no_norm` LIKE prefix bind from the exact-match rank bind in `search.service.ts` (clones were beating `INV/SR/1` because equality used `'invsr1%'`). **Do not revert that.** Do not add fuzz. If a **G** row still misses after that fix: **stop, paste top 3, wait**. Do not edit `GOLD.md` expected columns (G4 pass_rule is `top_hit_narration`; that amendment is human).
4. **Do not add OpenSearch.** `git grep -n opensearch -- backend/src` must stay empty. No `@opensearch-project/*` in `package.json`. Compose may keep running `shankara-opensearch`; you ignore it.
5. Do not `TRUNCATE voucher`. Do not `docker compose down -v`. Do not drop SYN9. Do not unpublish batch **345**. Do not hold/unpublish the 10k `STRS` batch **651**.
6. Do not invent a p95. Do not re-run `s9-bench.ts`. Do not change official Phase 1 p95 **135 ms**. S17 latency is **one shot (or median of 5)** per gold query, labeled `sql_baseline_ms`, never `p95`.
7. Do not edit `fixtures/daybook/EXPECTED.md`, `fixtures/sales-register/EXPECTED.md`, or committed `sample-*.csv`. Do not restore `parseFloat` on money.
8. Do not commit `.env`, JWTs, `D:\Tally` files, or tmp CSVs. Do not `synchronize: true`.
9. `npx tsc --noEmit -p tsconfig.build.json` exit 0. `npm test` and `npm run test:e2e` stay green (counts may rise if you add a GOLD.md parse test).
10. Evidence header (first section of `S17_EVIDENCE.md`) must list: date, host, API URL, `SELECT id, name FROM migrations`, SYN9 current count. **Reset command used: none.** Do not pretend you started from `down -v`.

---

## 1. WHAT S17 IS

Freeze how SQL search behaves **before** any index exists, so S18–S20 cannot move the goalposts.

```
confirm live API + migrations + SYN9=20000
  → publish held committed Sales Register sample if INV/SR/1 is still held
  → upload unique HOLD17/1 Day Book as held (do not publish)
  → POST /api/search for every GOLD.md row (G, T, A, N)
  → write ranks + sql_baseline_ms into S17_EVIDENCE.md
  → stop
```

`fixtures/search/GOLD.md` is **already written**. Copy expected from there. Do not rewrite it.

---

## 2. FILES YOU MAY TOUCH

```
backend/scripts/s17-sql-baseline.ts     # new; HTTP only
backend/package.json                    # optional script "s17:baseline"
backend/src/search/gold-file.spec.ts    # optional: GOLD.md parses to G1–G10
S17_EVIDENCE.md
```

**Do not edit:** `frontend/`, parsers, detectors, validators, `search.service.ts`, `vouchers.service.ts`, ingest, migrations, `s9-bench.ts`, `stress-daybook.ts`, `GOLD.md` expected columns, Day Book / Sales fixtures, `PHASE_1_EVIDENCE.md`, `PHASE_2_EVIDENCE.md`.

You may **read** `GOLD.md`. You may not change G/T/A/N expected or pass_rule.

---

## 3. LIVE TARGET

Assume (do not mock):

- `docker compose up -d` already running: Postgres `:5432`, **PgBouncer `:6432`**, Redis, OpenSearch (ignore OpenSearch).
- API on `http://127.0.0.1:3000` using `DATABASE_PORT=6432`.
- Seeded users: `steward@shankara.local`, `finance@shankara.local`, `branch@shankara.local`. Passwords from `backend/.env` (`SEED_*_PASSWORD`). Do not print them.
- SYN9 current = **20000**. STRS mix from `STRESS_DAYBOOK.md` is published (batch **651**). Leave both.
- Committed sales sample `fixtures/sales-register/sample-sales-register.csv` is in this volume as **held** batch **533** (`INV/SR/1`, `INV/SR/2`). Finance cannot see those exact vch_no until that batch is published. E2e clones (`INV/SR/1-<digits>`) are published and must stay.

SQL via:

```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "..."
```

HTTP via `curl.exe` or the Node script against `http://127.0.0.1:3000`. Not the Vite origin.

---

## 4. PREP (allowed writes to data, not to ranking code)

### 4.1 Publish the committed sales sample if still held

```sql
SELECT v.vch_no, b.id, b.status
FROM voucher v JOIN ingest_batch b ON b.id = v.batch_id
WHERE v.valid_to IS NULL AND v.vch_no IN ('INV/SR/1','INV/SR/2');
```

If `status='held'`, steward:

```
POST /api/batches/<id>/publish
```

Then re-query: both rows `published`. G7/G8 are otherwise impossible (finance cannot see held facts).

If already published, do nothing. Do not re-upload the CSV (SHA duplicate). Do not publish any other held batch.

### 4.2 Held negative `HOLD17/1`

No `HOLD9/1` row exists on this volume. Create a **new** unique Day Book CSV under `os.tmpdir()` (do not commit it):

- Title company contains `Shankara`, report `Day Book`, same headers as `sample-daybook.csv`.
- One Sales voucher `HOLD17/1`, party `Hold Seventeen`, amounts `100.00` / `100.00` (balanced).
- Steward `POST /api/uploads` `companyId=SHANKARA_HYD`. Default held. **Do not publish.**
- If SHA/vch collision, change the particular string (not the vch_no) or pick `HOLD17/<unix>` and put that exact vch_no in the N1 evidence row. Prefer `HOLD17/1`.

### 4.3 `OTHER/1`

Already published `company_id='OTHER_CO'`. Do not insert another. Do not delete it.

---

## 5. BASELINE SCRIPT

`backend/scripts/s17-sql-baseline.ts` (Node, `ts-node` is a backend dep):

1. Fail if `SEED_STEWARD_PASSWORD` / `SEED_FINANCE_PASSWORD` / `SEED_BRANCH_PASSWORD` missing. Read `.env`; do not hardcode.
2. Login steward / finance / branch. Redact tokens in any log.
3. For each GOLD.md **G, T, A** row: finance `POST /api/search` `{"q":"...","limit":20}`. Record:
   - `http_status`
   - `total`
   - `top3` as `vchNo` list (and `partyName` for G9)
   - `pass` true/false against `pass_rule`
   - `sql_baseline_ms` = `Date.now()` around that **one** HTTP round trip (optional: 5 calls, print median, still not p95)
4. N1 finance `HOLD17/1` → `total===0`
5. N2 branch `OTHER/1` → `total===0`
6. N3 steward `OTHER/1` → `total>=1`
7. N4 no `Authorization` header, `q=11820` → **401**
8. SQL: `SELECT count(*) FROM voucher WHERE valid_to IS NULL AND vch_no LIKE 'SYN9/%'` must print **20000**
9. Print a markdown table to stdout. Do not write that table into `GOLD.md`.

Do not call OpenSearch `:9200`. Do not use a private `SearchService` import that skips HTTP — the point is the same path finance uses.

Optional `package.json` script: `"s17:baseline": "ts-node scripts/s17-sql-baseline.ts"`.

---

## 6. `S17_EVIDENCE.md` (mandatory shape)

First section: environment header (rule 10).

Then **one table**, every gate a row, right-hand cell = `cmd:` + `out:` (S11 style). Banned cell text: `Verified`, `Passed in e2e`, `see GOLD.md`, `ok`, `done`, `works`.

| # | Gate | Evidence |
|---|---|---|
| 1 | Environment header: date, host, API, migrations list, SYN9 count, reset=none | |
| 2 | `tsc --noEmit -p tsconfig.build.json` exit 0 | |
| 3 | `npm test` green | |
| 4 | `npm run test:e2e` green | |
| 5 | `git grep -n opensearch -- backend/src` empty | |
| 6 | Sales sample `INV/SR/1`+`INV/SR/2` current rows are `published` (4.1) | |
| 7 | G1–G10: each row cmd + `total` + top 3 + pass + `sql_baseline_ms` | |
| 8 | T1–T3: each row cmd + `total` + top 3 (miss is OK) | |
| 9 | A1–A2: each row `total` + top 3 + amounts | |
| 10 | N1 finance `HOLD17/1` `total=0`; steward batch status `held` | |
| 11 | N2 branch `OTHER/1` `total=0` | |
| 12 | N3 steward `OTHER/1` `total>=1` | |
| 13 | N4 unauthenticated search HTTP 401 | |
| 14 | SYN9 current still 20000 after prep | |
| 15 | `GOLD.md` expected columns unchanged (`git diff fixtures/search/GOLD.md` empty or only your commit if you never touched it) | |

G7 requires step 4.1. If G7 fails because you skipped publish, S17 is rejected.

Do not write `S17_STATUS=COMPLETE` until every cell has command output. Do not add `PHASE_3_STATUS=COMPLETE` anywhere.

---

## 7. IMPLEMENTATION ORDER

1. Health + migrations + SYN9 count (gate 1 / 14 start).
2. Publish held sales sample if needed (gate 6).
3. Upload HOLD17/1 held (gate 10 prep).
4. Script runs G/T/A/N against live HTTP.
5. If a **G** row fails: stop, paste the actual top 3, do not change ranking or GOLD.md. Wait for the human.
6. Fill `S17_EVIDENCE.md` as you go (gate table).
7. `tsc` / `npm test` / `test:e2e` / grep (gates 2–5).
8. Stop. Do not start S18.

---

## 8. BANNED SENTENCES

- “I added OpenSearch so the gold set is future-proof”
- “p95 is still fine”
- “Verified” / “Passed in e2e” as a cell
- “I changed expected vch_no because clones ranked higher”
- “I truncated so gold is clean”
- “Phase 3 complete”
- “T1 missed so I added fuzz in search.service.ts”
- “I re-ran s9-bench”

Reply with files changed, the G/T/A/N tables, SYN9 count, test summaries, and **stop**.
