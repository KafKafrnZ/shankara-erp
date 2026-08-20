S20_STATUS=COMPLETE

date: 2026-08-20
host: Windows, 11th Gen Intel Core i3-1115G4
api: http://127.0.0.1:3000
OPENSEARCH_NODE: http://127.0.0.1:9200
reset: none
syn9_current: 20000

Gemini quota-stopped mid S20. Human finished: mapping/fuzz already in adapter; steward reindex; debug SQL logs removed; node-fetch `_count` hack removed.

`S20_EVIDENCE.md` was locked by another process; this file is the filled table.

| # | Gate | Evidence |
|---|---|---|
| 1 | env + health + `:9200` | `curl.exe -s http://127.0.0.1:3000/api/health` → `{"status":"ok","db":"ok","asOf":null}`. `:9200` cluster **shankara-search-cluster** 2.11.0 |
| 2 | tsc | `npx tsc --noEmit -p tsconfig.build.json` exit 0 |
| 3 | npm test | Test Suites: 10 passed, 10 total. Tests: **49** passed |
| 4 | e2e | not re-run this finish pass (e2e clones inflate INV/SR). Last known S19: 39 passed |
| 5 | mapping + reindex | `company_name: text`. Steward reindex `{"sqlCurrent":30505,"indexed":30505}`. `_count` **30505** |
| 6 | T1 `shankra` OS up | HTTP 200 total=50 hit1 `RCT/HYD/2401` **companyId=SHANKARA_HYD** |
| 7 | T2/T3 + fuzz grep | T2 hit1 `INV/SR/1`. T3 party Apex Pipes. `fuzziness` only on `party_name` and `company_name` |
| 8 | G7 | hit1 **INV/SR/1** |
| 9 | N2 | branch `OTHER/1` total=0 |
| 10 | OS down | G7 hit1 still INV/SR/1; T1 total=0 (allowed); `docker start`; `_count` 30505 |
| 11 | SYN9 + IN-list | SYN9 SQL 20000. Search uses `voucher.id IN ($n,…)` not `ANY($n::bigint[])` |
| 12 | GOLD.md T1 | `s20_rule` `top_hit_company` unchanged |
