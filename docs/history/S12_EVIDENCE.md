# S12_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.build.json` exit 0 | `cmd: npx tsc --noEmit -p tsconfig.build.json`<br>`out: (exits 0 with no output)` |
| 2 | `npm test` – green | `cmd: npm test`<br>`out: Test Suites: 7 passed, 7 total. Tests: 40 passed, 40 total` |
| 3 | Day Book sample still 2 vouchers / 1248500.00 / GST credit | `cmd: npm test`<br>`out: PASS src/ingest/parse/daybook.parser.spec.ts` (verifies Day Book parsing logic is untouched) |
| 4 | Sales Register test matches EXPECTED.md | `cmd: npm test`<br>`out: PASS src/ingest/parse/sales-register.parser.spec.ts` (parses exactly 2 vouchers and asserts against `EXPECTED.md`) |
| 5 | HTTP ingest still returns `SALES_REGISTER_NOT_IMPLEMENTED` | `cmd: curl -X POST ... -F "file=@fixtures/sales-register/sample-sales-register.csv"`<br>`out: {"batchId":443,"status":"rejected",...,"errorSummary":"SALES_REGISTER_NOT_IMPLEMENTED"}` (done via `ingest.service.ts` checking `reportType` and rejecting before processing vouchers) |
