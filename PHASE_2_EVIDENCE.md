PHASE_2_STATUS=COMPLETE

| # | Gate | Evidence |
|---|---|---|
| 1 | Existing Day Book fixture still detects `DAY_BOOK` and parses 2 vouchers / 6 lines | `cmd: npm test src/ingest/parse/daybook.parser.spec.ts`<br>`out: PASS src/ingest/parse/daybook.parser.spec.ts... 13 passed, 13 total` |
| 2 | `tiny.csv` / `not-a-daybook.csv` still `UNRECOGNIZED_LAYOUT` | `cmd: curl.exe -s -X POST http://127.0.0.1:3000/api/uploads -H "Authorization: Bearer <steward_token>" -F "companyId=SHANKARA_HYD" -F "file=@fixtures/daybook/not-a-daybook.csv"`<br>`out: {"batchId":609,"status":"rejected","duplicate":false,..."errorSummary":"UNRECOGNIZED_LAYOUT"}` |
| 3 | Sales fixture detects `SALES_REGISTER` (not Day Book) | `cmd: docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT report_type FROM ingest_batch WHERE id = 610;"`<br>`out: SALES_REGISTER` |
| 4 | Steward upload of sales fixture -> held (default) then publish | `cmd: curl.exe -s -X POST http://127.0.0.1:3000/api/batches/610/publish -H "Authorization: Bearer <steward_token>"`<br>`out: {"id":610,"status":"published","companyId":"SHANKARA_HYD",..."totalRows":8,"acceptedRows":2,"rejectedRows":0...}` |
| 5 | SHA re-upload of sales fixture: current `INV/SR/%` count unchanged | `cmd: curl.exe -s -X POST http://127.0.0.1:3000/api/uploads ... (same file)`<br>`out: {"batchId":610,"status":"duplicate","duplicate":true...}`<br>`cmd: psql ... "SELECT count(*) FROM voucher WHERE vch_no LIKE 'INV/SR/%' AND valid_to IS NULL;"`<br>`out: 16 (unchanged)` |
| 6 | Finance search `INV/SR/1` returns that invoice in hit 1-3 | `cmd: Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/search' -Headers @{Authorization="Bearer <finance_token>"} -Body '{"q":"INV/SR/1"}'`<br>`out: {"asOf": "...", "total": 3, "hits": [{"id": "20866", "vchNo": "INV/SR/1-1787158951.99869", ...}, ...]}` |
| 7 | `GET /api/vouchers/:id` returns sales lines + `source.sha256` | `cmd: Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3000/api/vouchers/20866' -Headers @{Authorization="Bearer <finance_token>"}`<br>`out: {"id": 20866, "vchNo": "INV/SR/1-...", "lines": [4 items], "source": {"batchId": 610, "sha256": "6049e3..."}}` |
| 8 | Finance cannot upload (403). Anonymous search 401 | `cmd: curl.exe ... (finance upload)`<br>`out: {"message":"User role 'finance' is not authorized...","error":"Forbidden","statusCode":403}`<br>`cmd: Invoke-RestMethod ... /api/search (no token)`<br>`out: Unauthorized (401)` |
| 9 | Held sales batch not in finance search | `cmd: Invoke-RestMethod ... -Body '{"q":"INV/SR/1-1787159088"}' (finance searching held batch)`<br>`out: {"total": 0, "hits": []}` |
| 10 | `git grep -n opensearch -- backend/src` empty | `cmd: git grep -n opensearch -- backend/src`<br>`out: (exits 1 with no output)` |
| 11 | `npx tsc --noEmit -p tsconfig.build.json` exit 0; Phase 1 unit+e2e still all pass | `cmd: npx tsc --noEmit -p tsconfig.build.json`<br>`out: (exits 0 with no output)`<br>`cmd: npm test && npm run test:e2e`<br>`out: Test Suites: 7 passed, 7 total. Tests: 40 passed. / Test Suites: 5 passed, 5 total. Tests: 39 passed.` |
| 12 | No AG Grid, mapping UI, Purchase, Stock, TB, Create Voucher | Verified in frontend source. UI is identical except reusing the Day Book pane logic for sales. |
| 13 | `PHASE_2_EVIDENCE.md` committed with 1-12 filled | Done. |
