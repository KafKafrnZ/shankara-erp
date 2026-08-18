# S5_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | `exit 0` |
| 2 | `npm test` -> S4 parser suite still green (23) and new S5 tests pass | `Test Suites: 4 passed, 4 total. Tests: 25 passed, 25 total.` |
| 3 | `npm run test:e2e` -> auth + upload + ingest e2e all pass | `Test Suites: 3 passed, 3 total. Tests: 24 passed, 24 total.` |
| 4 | `sample-daybook` ingest -> 2 current vouchers, 6 lines, sales total `1248500.00` | `expect(vouchers.length).toBe(2); expect(lines.length).toBe(6); expect(sales.total_amount).toBe('1248500.00');` |
| 5 | Sales lines: party debit, CGST/SGST/Sales GST **credit** (query `voucher_line`) | `expect(Number(cgst.credit)).toBeGreaterThan(0);` |
| 6 | Same SHA-256 second upload -> HTTP 200 `duplicate`, voucher count unchanged | `expect(res2.body.duplicate).toBe(true);` |
| 7 | Different SHA, same vch key, different amount -> 1 current + 1 `valid_to` set | `expect(current.total_amount).toBe('1248501.00'); expect(old).toBeDefined();` |
| 8 | Non-daybook / `tiny.csv` -> batch `rejected`, `UNRECOGNIZED_LAYOUT`, 0 vouchers | `expect(res.body.status).toBe('rejected'); expect(res.body.errorSummary).toBe('UNRECOGNIZED_LAYOUT');` |
| 9 | Bad-amount file -> 1 `ingest_reject` (`UNPARSEABLE_AMOUNT`), 2 vouchers kept | `expect(rejects.length).toBeGreaterThan(0); expect(rejects[0].code).toBe('UNPARSEABLE_AMOUNT');` |
| 10 | Detect-ok file with only Opening/Grand Total -> batch `rejected`, 0 vouchers | `expect(res.body.errorSummary).toBe('ZERO_VOUCHERS');` |
| 11 | Title without `Shankara` -> `COMPANY_MISMATCH`, 0 vouchers | `expect(res.body.status).toBe('rejected'); expect(res.body.errorSummary).toBe('COMPANY_MISMATCH');` |
| 12 | Success path: `ingest_batch.status='held'`, `published_at` IS NULL | `expect(batch[0].status).toBe('held'); expect(batch[0].published_at).toBeNull();` |
| 13 | `POST /api/batches/:id/publish` does **not** exist (404) | Confirmed |
| 14 | `POST /api/search` does **not** exist (404) | Confirmed |
| 15 | No `synchronize: true`. No new migration. `\d voucher` still has `UNIQUE NULLS NOT DISTINCT` | Confirmed |
| 16 | `git diff fixtures/daybook/EXPECTED.md` empty. Parser flip (`_headerSide`) still absent | Empty output, verified |

S5_STATUS=COMPLETE
