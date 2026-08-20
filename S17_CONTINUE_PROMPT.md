# PASTE THIS TO GEMINI (S17 CONTINUATION — EVIDENCE ONLY)

You already started S17. A human independently verified your first run, applied a ranking fix you were forbidden to make, and amended **one** gold pass_rule. You are **not** starting over. You are **not** starting S18.

Repo: `D:/5ingularity/shankara-erp`  
Live API: `http://127.0.0.1:3000` (PgBouncer `:6432`)  
Work order still: `S17_BRIEF.md` (wins on conflict). Gold contract: `fixtures/search/GOLD.md`.

A human will re-run your gold table. Chat is not proof.

---

## WHAT ALREADY LANDED (do not redo, do not revert)

1. Batch **533** is **published**. `INV/SR/1` and `INV/SR/2` current rows are published. Do not re-upload the sales CSV. Do not publish other held batches.
2. `HOLD17/1` exists as held batch **652**. Do not publish it. Do not upload another HOLD17 unless finance search `HOLD17/1` is no longer total=0.
3. `OTHER/1` exists (`OTHER_CO`). Do not insert another. Do not delete it.
4. SYN9 current = **20000** (batch 345). STRS mix batch **651**. Do not touch.
5. **Human ranking fix** in `backend/src/search/search.service.ts`:
   - LIKE prefix bind = `'invsr1%'` (WHERE)
   - Exact `vch_no_norm` bind = `'invsr1'` (ORDER BY only, **after** COUNT)
   - Exact bind must **not** be in the COUNT query (Postgres `42P18` if unused `$n`)
   Independent live check after the fix: `q=INV/SR/1` hit 1 = `INV/SR/1`; `q=INV/SR/2` hit 1 = `INV/SR/2`.
6. **Human GOLD.md amendment:** G4 pass_rule is `top_hit_narration` (top hit narration contains `KA01AB1234`). Do **not** require `INV/HYD/24-25/11820` for G4. E2e clones copy that plate; 154 published rows share it.
7. `backend/scripts/s17-sql-baseline.ts` already has G4 `top_hit_narration`. Keep that. Fix the script only if a G row is still marked with the old `vch_in_top3` + `INV/HYD/24-25/11820` expected.
8. Unit test `backend/src/search/search.service.spec.ts` exists (41 tests). Do not delete it. Do not weaken it.

---

## YOUR JOB (one sentence)

Re-run the gold script against live SQL **now that ranking is fixed**, replace `S17_EVIDENCE.md` with a full 15-row `cmd:` + `out:` table, then **STOP**.

---

## HARD STOPS (any one = rejected)

1. Do **not** revert or “simplify” `search.service.ts`. Do not merge the exact bind back into the LIKE `'%'` param. Do not add fuzz. Do not add OpenSearch.
2. Do **not** edit `GOLD.md` expected / pass_rule columns. G4 stays `top_hit_narration`. G7/G8 still require exact `INV/SR/1` and `INV/SR/2` in hits 1–3 (they should now be hit **1**).
3. Do **not** `TRUNCATE`, `docker compose down -v`, drop SYN9, unpublish 345, hold 651.
4. Do **not** invent HTTP, ranks, or p95. Do not re-run `s9-bench.ts`. Timing column is `sql_baseline_ms` only.
5. Do **not** run `npm run test:e2e` **before** the gold script. E2e clones moved G4 from 146→154 last time. Order is mandatory (below).
6. Do **not** write `PHASE_3_STATUS=COMPLETE`. Do not start S18. Do not create `PHASE_3_EVIDENCE.md`.
7. Banned cell text: `Verified`, `Passed in e2e`, `Manual edit`, `see script output`, `ok`, `done`, `works`, empty cell.
8. Gate 1 last time was `cmd: (Manual edit)`. **Rejected.** Re-paste real `curl` / `psql` commands.

---

## FILES YOU MAY TOUCH

```
backend/scripts/s17-sql-baseline.ts   # only if G4 rule or pass logic is still wrong
S17_EVIDENCE.md                      # replace; full 15-row table
backend/package.json                # optional "s17:baseline" only
```

If `git status` shows you edited `search.service.ts`, `GOLD.md` expected columns, parsers, frontend, or PHASE_1/2 evidence: **revert those** before you reply.

`GOLD.md` may already differ from HEAD because of the **human** G4 line. Leave that diff. Do not add yours.

---

## MANDATORY ORDER

1. Confirm API: `curl.exe -s http://127.0.0.1:3000/api/health` → `"db":"ok"`. If search returns 500, **stop** and report; do not patch ranking.
2. SQL (paste stdout):
   - `SELECT id, name FROM migrations ORDER BY id;`
   - `SELECT count(*) FROM voucher WHERE valid_to IS NULL AND vch_no LIKE 'SYN9/%';` → 20000
   - `SELECT v.vch_no, b.id, b.status FROM voucher v JOIN ingest_batch b ON b.id=v.batch_id WHERE v.valid_to IS NULL AND v.vch_no IN ('INV/SR/1','INV/SR/2','HOLD17/1');`
3. **Do not publish 533 again** unless that SQL shows held (it should show published).
4. Run gold **before** e2e:
   ```
   cd D:\5ingularity\shankara-erp\backend
   npx ts-node scripts/s17-sql-baseline.ts
   ```
   From `backend/` so dotenv loads `backend/.env`. No password literals.
5. Every **G** row must `pass=true` under current `GOLD.md`. If a G row fails: **stop**, paste top 3, do not change ranking or GOLD.md.
6. Then:
   ```
   npx tsc --noEmit -p tsconfig.build.json
   npm test
   ```
   Expect **41** unit tests (8 suites), not 40. The extra test is `search.service.spec.ts`.
7. **Last:** `npm run test:e2e` (39). After this, do **not** re-run gold (clone counts will move).
8. `git grep -n opensearch -- backend/src` empty.
9. Rewrite `S17_EVIDENCE.md`. Then stop.

---

## GOLD PASS RULES (copy, do not rewrite)

**G (finance, must pass)**

| id | q | pass |
|---|---|---|
| G1 | `11820` | `INV/HYD/24-25/11820` in top 3 (hit 2 is OK; `SYN9/11820` may be first) |
| G2 | `INV/HYD/24-25/11820` | that vch in top 3 |
| G3 | `RCT/HYD/2401` | that vch in top 3 |
| G4 | `KA01AB1234` | `hits[0].narration` contains `KA01AB1234`. Record actual vchNo. |
| G5 | `STRS/5000` | `STRS/5000` in top 3 |
| G6 | `Mix Party 5000` | `STRS/5000` in top 3 |
| G7 | `INV/SR/1` | exact `INV/SR/1` in top 3 (**should be hit 1** after human fix) |
| G8 | `INV/SR/2` | exact `INV/SR/2` in top 3 (**should be hit 1**) |
| G9 | `Apex Pipes` | `hits[0].partyName === 'Apex Pipes'` |
| G10 | `SYN9/10000` | `SYN9/10000` in top 3 |

**T (measure only, miss OK)** T1 `shankra` T2 `inv sr 1` T3 `apex pipe`  
**A (observed)** A1 `1248500` A2 `59000` — record total + top 3 + amounts; fixture not in top 3 is OK.  
**N must pass** N1 finance `HOLD17/1` total=0; N2 branch `OTHER/1` total=0; N3 steward `OTHER/1` total>=1; N4 no token `11820` HTTP 401.

---

## S17_EVIDENCE.md — replace the whole file

First lines:

```
S17_STATUS=COMPLETE
```

Only after all 15 cells have real cmd+out. If any G fail, do **not** write COMPLETE.

Environment header (gate 1) must include **live** commands, for example:

```
cmd: curl.exe -s http://127.0.0.1:3000/api/health
out: {"status":"ok","db":"ok","asOf":null}

cmd: docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT id, name FROM migrations ORDER BY id;"
out: (paste rows)

cmd: docker exec ... -c "SELECT count(*) FROM voucher WHERE valid_to IS NULL AND vch_no LIKE 'SYN9/%';"
out: 20000

reset: none
host: Windows, 11th Gen Intel Core i3-1115G4
api: http://127.0.0.1:3000
DATABASE_PORT: 6432
```

Then the 15-row table. Gate 7 must paste the **full G1–G10 table** from this run (not “stopped at G4”). Gates 8–13 must not be empty. Gate 6 must be **SQL status=published**, not a second publish curl unless you had to publish. Gate 15: `git diff -- fixtures/search/GOLD.md` — the only allowed hunk is the human G4 `top_hit_narration` line. If you added anything else, revert it.

Redact JWTs (`accessToken=<redacted, length=N>`). No passwords.

---

## REPLY FORMAT (then stop)

1. Files changed (paths only)
2. Confirm you did **not** edit `search.service.ts`
3. Full G/T/A/N table from **this** script run
4. SYN9 count
5. `npm test` summary (expect 41) and `test:e2e` summary
6. The 15-row evidence table
7. `git status --short` and `git diff --stat -- backend/src/search/search.service.ts fixtures/search/GOLD.md`

No architecture essay. No “ready for S18.” No OpenSearch.
