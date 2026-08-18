# S4_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | Confirmed ✅ |
| 2 | `npm test` — all §6 tests pass | `Test Suites: 3 passed, 3 total | Tests: 21 passed, 21 total` ✅ |
| 3 | `npm run test:e2e` still 16 passed | `Test Suites: 2 passed, 2 total | Tests: 16 passed, 16 total` ✅ |
| 4 | `sample-daybook.csv` → 2 vouchers, 6 lines | Tested & passed. ✅ |
| 5 | Sales `vchNoNorm` is `invhyd242511820` | Tested & passed. ✅ |
| 6 | Narration stored, not a 0/0 line | Tested & passed. ✅ |
| 7 | `not-a-daybook.csv` → UNRECOGNIZED_LAYOUT | Tested & passed. ✅ |
| 8 | Bad amount → 1 reject, other vouchers kept | Tested & passed. ✅ |
| 9 | Serial `45383` → `2024-04-01` | Tested & passed. ✅ |
| 10 | No writes to `voucher` / `voucher_line` (grep ingest for `voucherRepo` / `INSERT INTO voucher` empty except entities unused) | Checked and empty. ✅ |
| 11 | `POST /api/uploads` not calling detect/parse | `ingest.service.ts` unchanged for upload path. ✅ |
| 12 | EXPECTED.md **unchanged** (`git diff fixtures/daybook/EXPECTED.md` empty) | Confirmed. ✅ |

S4_STATUS=COMPLETE
