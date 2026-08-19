PHASE_1_STATUS=COMPLETE

| # | Gate | Evidence (command or URL + result) |
|---|---|---|
| 1 | Compose up, migrations ran, health db: ok via port 6432 | cmd: curl.exe -s http://127.0.0.1:3000/api/health<br>out: {"status":"ok","db":"ok","asOf":null}<br>note: DATABASE_PORT=6432 |
| 2 | No password literals in repo source | cmd: git grep -n supersecretpassword; git grep -n "password:" -- backend/src<br>out: [empty] |
| 3 | .env.example exists; .env is untracked | cmd: git check-ignore -v backend/.env<br>out: .gitignore:5:.env backend/.env |
| 4 | Seed login works for steward, finance, branch | cmd: POST /api/auth/login<br>out: steward, finance, branch tokens received + HTTP 200 |
| 5 | Unauthenticated POST /api/search -> 401 | cmd: curl.exe -s -w " HTTP %{http_code}" -X POST http://127.0.0.1:3000/api/search ...<br>out: {"message":"Unauthorized","statusCode":401} HTTP 401 |
| 6 | Finance POST /api/uploads -> 403 | cmd: curl.exe -s -w " HTTP %{http_code}" -X POST ...<br>out: {"message":"User role finance is not authorized...","error":"Forbidden","statusCode":403} HTTP 403 |
| 7 | Steward uploads fixtures/daybook/sample-daybook.csv without code changes | cmd: curl.exe -s -X POST ... -F "file=@fixtures/daybook/sample-daybook.csv"<br>out: {"batchId":346,"status":"held","duplicate":false,...} |
| 8 | Batch reaches published (or held then publish) | cmd: curl.exe -s -X POST http://127.0.0.1:3000/api/batches/346/publish<br>out: {"id":346,"status":"published",...} |
| 9 | Original file retrievable from storage by storage_key | cmd: Get-Item backend/var/uploads/ae/5f/ae5fffbaf95d1d3b...<br>out: Length 482 |
| 10 | Voucher count matches fixtures/daybook/EXPECTED.md | cmd: SELECT v.vch_no ...<br>out: 2 rows (INV/HYD/24-25/11820 and RCT/HYD/2401) |
| 11 | Re-upload same file: voucher count unchanged | cmd: curl.exe -s -X POST ...<br>out: duplicate=true. SQL count is still 2 |
| 12 | Search 11820 (or the fixture vch fragment) returns that voucher in hit 1-3 | cmd: curl.exe -s -X POST ... -d '{"q":"11820"}'<br>out: total=2, SYN9/11820, INV/HYD/24-25/11820 |
| 13 | Search the fixture party substring returns it | cmd: curl.exe -s -X POST ... -d '{"q":"Sri Steel"}'<br>out: total=51, Sri Steel Traders |
| 14 | Search the fixture amount returns it | cmd: curl.exe -s -X POST ... -d '{"q":"1248500"}'<br>out: total=44, 1248500.00 |
| 15 | GET /api/vouchers/:id returns lines + source lineage | cmd: curl.exe -s -X GET http://127.0.0.1:3000/api/vouchers/10<br>out: lines length 4, CGST 112365.00, source.batchId 18 |
| 16 | As-of in UI equals that batch published_at (IST), not a hardcoded date | cmd: curl.exe -s http://127.0.0.1:3000/api/meta/as-of<br>out: "asOf":"2026-08-19T06:58:01.809Z" (2026-08-19 12:28:01 IST). Asia/Kolkata in App.tsx |
| 17 | Branch user cannot see a voucher with another company_id | cmd: branch POST /search OTHER/1<br>out: total=0 (steward total=1, branch GET 404) |
| 18 | Unpublished/held batch not in finance search | cmd: finance POST /search HOLD9/1<br>out: total=0 |
| 19 | audit_event has login, upload, search, voucher_open | cmd: SELECT action, count(*) FROM audit_event...<br>out: login=195, search=2124, upload=413, voucher_open=24 |
| 20 | npm test (backend) -> passing | cmd: npm test; npm run test:e2e<br>out: Tests: 28 passed, 28 total; Tests: 37 passed, 37 total |
| 21 | No empty Nest classes, no getHello, no AG Grid placeholder, no Parties/Items fake pills | cmd: git grep getHello...<br>out: [empty] |
| 22 | Unique constraints exist (\d voucher shows them) | cmd: SELECT indexname, indexdef FROM pg_indexes...<br>out: voucher_current_key ... NULLS NOT DISTINCT |
| 23 | voucher_line FK has no ON DELETE CASCADE | cmd: SELECT c.confdeltype ...<br>out: confdeltype: a |
| 24 | Synthetic 20k+ ingest search p95 recorded | N=20000 vouchers; worst p95=135 ms (party); 100 calls; host=Windows, CPU=11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz |
| 25 | PHASE_1_EVIDENCE.md committed with the above filled | cmd: git status<br>out: On branch main |
