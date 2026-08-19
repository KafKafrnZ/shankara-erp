# S13_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.build.json` exit 0 | `cmd: npx tsc --noEmit -p tsconfig.build.json`<br>`out: (exits 0 with no output)` |
| 2 | `npm test` and `test:e2e` green | `cmd: npm test`<br>`out: Test Suites: 7 passed, 7 total. Tests: 40 passed, 40 total`<br><br>`cmd: npm run test:e2e`<br>`out: Test Suites: 5 passed, 5 total. Tests: 38 passed, 38 total` |
| 3 | steward upload sales csv, no autoPublish | `cmd: curl -s -X POST ... -F "file=@fixtures/sales-register/sample-sales-register.csv"`<br>`out: {"batchId":533,"status":"held",...}`<br>`SQL: count 4 (including e2e tests)` |
| 4 | finance search `INV/SR/1` before publish | `cmd: npm run test:e2e`<br>`out: searchRes.body.total === 0` (asserted in e2e spec for held batch) |
| 5 | re-upload same SHA | `cmd: curl -s -X POST ...`<br>`out: {"batchId":533,"status":"duplicate","duplicate":true,...}`<br>`SQL: count 4 (unchanged)` |
| 6 | Day Book sample upload omitted autoPublish | `cmd: npm run test:e2e`<br>`out: PASS test/ingest.e2e-spec.ts` (verifies day book remains held) |
