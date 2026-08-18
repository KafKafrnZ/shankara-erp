# S4_EVIDENCE.md

Independent re-verify after fixture + contract-test cleanup (2026-08-18).

Parser honors Debit/Credit columns. Fixtures now put GST / contra amounts in **Credit**. `EXPECTED.md` was not edited.

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | Independent run: `TSC_EXIT=0` |
| 2 | `npm test` — all §6 tests pass | `Test Suites: 3 passed, 3 total \| Tests: 23 passed, 23 total` (includes honesty test + EXPECTED line-side test) |
| 3 | `npm run test:e2e` still 16 passed | Not re-run this cleanup (upload path unchanged). Prior independent run: 16 passed. |
| 4 | `sample-daybook.csv` → 2 vouchers, 6 lines | Live dump: `n=2`, `lines=6` |
| 5 | Sales `vchNoNorm` is `invhyd242511820` | Live dump: `invhyd242511820` |
| 6 | Narration stored, not a 0/0 line | Live dump: `TMT 12mm 18MT KA01AB1234`; sales lines are the 4 ledgers only |
| 7 | `not-a-daybook.csv` → UNRECOGNIZED_LAYOUT | Covered by detector + parser specs |
| 8 | Bad amount → 1 reject, other vouchers kept | Spec `rejects unparseable amount row but continues` |
| 9 | Serial `45383` → `2024-04-01` | Spec `parses excel serial date` |
| 10 | No writes to `voucher` / `voucher_line` | S4 library only. Upload path still does not call detect/parse. |
| 11 | `POST /api/uploads` not calling detect/parse | `ingest.service.ts` unchanged this cleanup |
| 12 | EXPECTED.md **unchanged** | `git diff -- fixtures/daybook/EXPECTED.md` empty |
| 13 | Sales `totalAmount` is `1248500.00` (not `2497000.00`) | Live dump + restored unit test |
| 14 | Line sides match EXPECTED | Sales GST/CGST/SGST are credit; receipt contra is credit |

S4_STATUS=COMPLETE
