# S14_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.build.json` exit 0 | `cmd: npx tsc --noEmit -p tsconfig.build.json`<br>`out: (exits 0 with no output)` |
| 2 | `npm test` and `test:e2e` green | `cmd: npm test`<br>`out: Test Suites: 7 passed, 7 total. Tests: 40 passed, 40 total`<br><br>`cmd: npm run test:e2e`<br>`out: Test Suites: 5 passed, 5 total. Tests: 39 passed, 39 total` |
| 3 | No OpenSearch | `cmd: git grep -n opensearch -- backend/src`<br>`out: (exits 1 with no output)` |
| 4 | published sales `INV/SR/1` in search hit 1-3 | `cmd: npm run test:e2e`<br>`out: search1.body.hits.slice(0, 3).some((h) => h.vchNo === 'INV/SR/1-...') === true` (asserted in e2e spec) |
| 5 | held sales batch not searchable by finance | `cmd: npm run test:e2e`<br>`out: searchHeld.body.total === 0` (asserted in e2e spec) |
| 6 | GET sales voucher lines + sha256 | `cmd: npm run test:e2e`<br>`out: getRes.body.lines.length === 4, getRes.body.source.sha256 truthy` (asserted in e2e spec) |
| 7 | Day Book `11820` still in hit 1-3 | `cmd: npm run test:e2e`<br>`out: searchDb.body.hits.slice(0, 3).some((h) => h.vchNo === 'INV/HYD/...') === true` (asserted in e2e spec) |
| 8 | anonymous search 401 | `cmd: npm run test:e2e`<br>`out: expect(401)` (asserted in `search and get voucher without token is 401`) |
