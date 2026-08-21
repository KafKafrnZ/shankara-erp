# S11_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.build.json` exit 0 | `cmd: npx tsc --noEmit -p tsconfig.build.json`<br>`out: (exits 0 with no output)` |
| 2 | `npm test` – all previous tests plus new detect tests passing | `cmd: npm test`<br>`out: Test Suites: 6 passed, 6 total. Tests: 38 passed, 38 total` |
| 3 | `npm run test:e2e` still 37 (or 37+N if you added one) | `cmd: npm run test:e2e`<br>`out: Test Suites: 5 passed, 5 total. Tests: 37 passed, 37 total` |
| 4 | Day Book sample still `reportType=DAY_BOOK` | `cmd: npm test`<br>`out: PASS src/ingest/detect/report.detector.spec.ts` detects sample-daybook.csv as DAY_BOOK |
| 5 | Sales sample `reportType=SALES_REGISTER` | `cmd: npm test`<br>`out: PASS src/ingest/detect/report.detector.spec.ts` detects sample-sales-register.csv as SALES_REGISTER |
| 6 | Steward upload sales csv -> rejected `SALES_REGISTER_NOT_IMPLEMENTED`, zero `INV/SR/%` vouchers | `cmd: curl -X POST ... -F "file=@fixtures/sales-register/sample-sales-register.csv"`<br>`out: {"batchId":443,"status":"rejected",...,"errorSummary":"SALES_REGISTER_NOT_IMPLEMENTED"}`<br>`SQL: count=0` |
| 7 | `git grep -n opensearch -- backend/src` empty | `cmd: git grep -n opensearch -- backend/src`<br>`out: (empty)` |
| 8 | No sales parser module yet (`git grep parseSales` empty or only detect) | `cmd: git grep parseSales -- backend/src`<br>`out: (empty)` |
