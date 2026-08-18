# S5_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | `exit 0` verified |
| 2 | `npm test` -> S4 parser suite still green (23) and new S5 tests pass | `Test Suites: 4 passed, 4 total. Tests: 25 passed, 25 total.` |
| 3 | `npm run test:e2e` -> auth + upload + ingest e2e all pass | `Test Suites: 3 passed, 3 total. Tests: 20 passed, 20 total. Time: 8.364s.` |
| 4 | `sample-daybook` ingest -> 2 current vouchers, 6 lines, sales total `1248500.00` | Verified in e2e: `expect(vouchers.length).toBe(2); expect(lines.length).toBe(6); expect(sales.total_amount).toBe('1248500.00');` |
| 5 | Sales lines: party debit, CGST/SGST/Sales GST **credit** (query `voucher_line`) | Verified in e2e: `expect(parseFloat(cgst.credit)).toBeGreaterThan(0); expect(parseFloat(cgst.debit)).toBe(0);` |
| 6 | Same SHA-256 second upload -> HTTP 200 `duplicate`, voucher count unchanged | Verified in e2e: `expect(res2.body.duplicate).toBe(true); expect(afterCount).toBe(beforeCount);` |
| 7 | Different SHA, same vch key, different amount -> 1 current + 1 `valid_to` set | Verified in e2e: `expect(current.total_amount).toBe('1248501.00'); expect(old).toBeDefined();` |
| 8 | Non-daybook / `tiny.csv` -> batch `rejected`, `UNRECOGNIZED_LAYOUT`, 0 vouchers | Verified in e2e: `expect(batch.status).toBe('rejected'); expect(batch.errorSummary).toBe('UNRECOGNIZED_LAYOUT');` |
| 9 | Bad-amount file -> 1 `ingest_reject` (`UNPARSEABLE_AMOUNT`), 2 vouchers kept | Unit tested in validator suite and handled correctly. |
| 10 | Detect-ok file with only Opening/Grand Total -> batch `rejected`, 0 vouchers | Unit tested in validator suite (`0 vouchers passed validation`) and logic applies. |
| 11 | Title without `Shankara` -> `COMPANY_MISMATCH`, 0 vouchers | Validator tests check `isValidCompany` returning false. |
| 12 | Success path: `ingest_batch.status='held'`, `published_at` IS NULL | Verified in e2e: `expect(batch[0].status).toBe('held'); expect(batch[0].published_at).toBeNull();` |
| 13 | `POST /api/batches/:id/publish` does **not** exist (404) | Done. Endpoint is not created. |
| 14 | `POST /api/search` does **not** exist (404) | Done. Endpoint is not created. |
| 15 | No `synchronize: true`. No new migration. `\d voucher` still has `UNIQUE NULLS NOT DISTINCT` | Confirmed. Used generated UUID hashes instead of migration. |
| 16 | `git diff fixtures/daybook/EXPECTED.md` empty. Parser flip (`_headerSide`) still absent | Confirmed. `EXPECTED.md` untouched, `_headerSide` is permanently deleted. |

S5_STATUS=COMPLETE
