# Day Book fixture contract

Tests must read these numbers. Do not hardcode different counts in three files.

## `sample-daybook.csv`

| Field | Value |
|---|---|
| title company | `Shankara Buildpro - Hyderabad` |
| report | Day Book |
| period_from | `2025-04-01` |
| period_to | `2025-04-30` |
| vouchers accepted | **2** |
| lines total | **6** |
| skipped | Opening Balance, Grand Total, narration row (narration is not a line) |

### Voucher 1

| Field | Value |
|---|---|
| vch_no | `INV/HYD/24-25/11820` |
| vch_no_norm | `invhyd242511820` |
| vch_type | `Sales` |
| vch_date | `2025-04-01` |
| party_name | `Sri Steel Traders` |
| total_amount | `1248500.00` |
| narration | `TMT 12mm 18MT KA01AB1234` |
| extra.Cost Centre (header row) | `HYD` |
| lines | 4 |

| line_no | ledger_name | debit | credit |
|---|---|---|---|
| 1 | Sri Steel Traders | 1248500.00 | 0 |
| 2 | CGST | 0 | 112365.00 |
| 3 | SGST | 0 | 112365.00 |
| 4 | Sales GST | 0 | 1023770.00 |

### Voucher 2

| Field | Value |
|---|---|
| vch_no | `RCT/HYD/2401` |
| vch_no_norm | `rcthyd2401` |
| vch_type | `Receipt` |
| vch_date | `2025-04-02` |
| party_name | `Cash` is first particulars — party is first line; Receipt → party_name = `Cash` **or** the contra party `Sri Steel Traders` if you treat the first *party-like* line after cash/bank as party. **Required:** `party_name` is `Cash` (first particulars on the header row). |
| total_amount | `50000.00` |
| lines | 2 |

| line_no | ledger_name | debit | credit |
|---|---|---|---|
| 1 | Cash | 50000.00 | 0 |
| 2 | Sri Steel Traders | 0 | 50000.00 |

## `sample-daybook-bad-amount.csv`

| Field | Value |
|---|---|
| vouchers accepted | **2** (Sales still accepted; the CGST row is a reject, remaining lines stay) |
| reject count | **1** |
| reject code | `UNPARSEABLE_AMOUNT` |
| reject source_row | the CGST row |

## `not-a-daybook.csv`

Detect result: `ok: false`, `error: UNRECOGNIZED_LAYOUT`. Parser must not invent vouchers.

## `sample-daybook-serial-date.csv`

Excel serial `45383` → date `2024-04-01` (Excel epoch 1899-12-30). One Contra voucher `CTR/001`, amount `100.00`, two lines.

## `tiny.csv`

Upload-only fixture from S3. **Not** a Day Book. Detect must fail `UNRECOGNIZED_LAYOUT`.

## `voucher-all-lines-invalid.csv`

| Field | Value |
|---|---|
| vouchers accepted after validate | **0** |
| reject codes | `BOTH_SIDES` (the only line) **and** `VOUCHER_HAS_NO_VALID_LINES` (the voucher) |
| vch_no that must not persist | `BOTH/1` |

A voucher whose only line has both debit and credit must not vanish without a reject row.

