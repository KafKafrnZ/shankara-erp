# PHASE_2_EVIDENCE.md

S16 fills this. Do **not** fill during S11–S15. Empty = Phase 2 not complete.

| # | Gate | Evidence (command + result) |
|---|---|---|
| 1 | Existing Day Book fixture still detects `DAY_BOOK` and parses 2 vouchers / 6 lines | |
| 2 | `tiny.csv` / `not-a-daybook.csv` still `UNRECOGNIZED_LAYOUT` | |
| 3 | Sales fixture detects `SALES_REGISTER` (not Day Book) | |
| 4 | Steward upload of sales fixture → held (default) then publish | |
| 5 | SHA re-upload of sales fixture: current `INV/SR/%` count unchanged | |
| 6 | Finance search `INV/SR/1` returns that invoice in hit 1–3 | |
| 7 | `GET /api/vouchers/:id` returns sales lines + `source.sha256` | |
| 8 | Finance cannot upload (403). Anonymous search 401 | |
| 9 | Held sales batch not in finance search | |
| 10 | `git grep -n opensearch -- backend/src` empty | |
| 11 | `tsc` exit 0; Phase 1 unit+e2e still all pass | |
| 12 | No AG Grid, mapping UI, Purchase, Stock, TB, Create Voucher | |
| 13 | This file committed with 1–12 filled | |

```
PHASE_2_STATUS=
```
