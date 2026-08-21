# S12 WORK ORDER — SALES REGISTER PARSE ONLY

You are implementing **S12 only**.  
Repo: `D:/5ingularity/shankara-erp`  
Spec: `PHASE_2_AUDIT.md` + **this file** (this file wins).

**Do not start S12 until the human has accepted S11.** If S11 evidence cells are empty, stop.

**S13–S16 are forbidden.** No upsert of sales rows. No frontend. No OpenSearch.

---

## 0. HARD RULES

1. Fill `S12_EVIDENCE.md`. Do not declare complete in chat.
2. **Do not edit** Day Book parser rules, `daybook.detector.ts` fingerprint, or `fixtures/daybook/EXPECTED.md`.
3. Do not INSERT into `voucher`. Parse returns in-memory `ParseResult` only. Ingest of sales files may still reject until S13 — **or** you may parse in-process for tests without publishing. HTTP upsert of sales is S13.
4. Money: `parseIndianAmount` / `parseAmountToCents` only. No `parseFloat` on amounts.
5. No OpenSearch, AG Grid, mapping UI, Purchase, Stock.
6. `tsc` 0. S11 tests stay green.

---

## 1. WHAT S12 IS

```
detect SALES_REGISTER
  → parseSalesRegister(rows) → ParseResult
       vouchers[], rejects[]
```

One **data row** = one **voucher**. Not a Day Book split-line grouping.

---

## 2. FILES YOU MAY TOUCH

```
backend/src/ingest/parse/sales-register.parser.ts   # new
backend/src/ingest/parse/sales-register.parser.spec.ts
backend/src/ingest/parse/types.ts                    # only if you need extra on DetectResult
backend/src/ingest/parse/daybook.parser.ts           # stream router: SALES_REGISTER → parseSalesRegister; DAY_BOOK → parseDayBook
fixtures/sales-register/EXPECTED.md                 # new
S12_EVIDENCE.md
```

Keep `sample-sales-register.csv` from S11. Do not change its cells.

---

## 3. PARSE RULES

Skip title/period. Header from detect. Then each non-empty row after header:

**Reject row (do not invent a voucher):**

- Missing date → `MISSING_VCH_DATE`
- Missing vch no / invoice no → `MISSING_VCH_NO`
- Missing vch type → `MISSING_VCH_TYPE`
- Unparseable Invoice Amount (or Total) → `UNPARSEABLE_AMOUNT`

**Accept row → voucher:**

| Field | Source |
|---|---|
| `vchDate` | Date column via `parseTallyDate` |
| `vchType` | Vch Type (default `Sales` if blank after required check — do **not** default; required) |
| `vchNo` | Vch No. / Invoice No |
| `vchNoNorm` | `normalizeVchNo` |
| `partyName` | Particulars / Party |
| `totalAmount` | Invoice Amount if present, else Total, else Debit, else Credit — via `parseIndianAmount` |
| `narration` | null unless a Narration column exists |
| `extra` | every other header cell (Taxable Value, CGST, SGST, IGST, GSTIN, …) as original strings |

**Lines (required, so GET voucher is not empty):**

Build lines from numeric columns that parse to a non-zero amount, in this order if present:

1. Particulars / Party → debit = `totalAmount`, credit = `0.00` (party receivable)
2. Taxable Value → ledger `Sales`, debit `0.00`, credit = taxable
3. CGST → ledger `CGST`, credit = amount
4. SGST → ledger `SGST`, credit = amount
5. IGST → ledger `IGST`, credit = amount

If Taxable+GST credits do not equal party debit, **still store what the file said**. Do not “fix” GST math. A reject `OUT_OF_BALANCE` on the **batch** is S13, not a silent rewrite here.

Skip Opening/Grand Total rows (same keywords as Day Book).

---

## 4. `fixtures/sales-register/EXPECTED.md` (write this; do not fudge numbers)

From `sample-sales-register.csv`:

| Field | Value |
|---|---|
| vouchers | **2** |
| `INV/SR/1` party | `Sri Steel Traders` |
| `INV/SR/1` total | `1248500.00` |
| `INV/SR/1` lines | 4 (party 1248500.00 Dr; Sales 1023770.00 Cr; CGST 112365.00 Cr; SGST 112365.00 Cr) |
| `INV/SR/2` party | `Apex Pipes` |
| `INV/SR/2` total | `59000.00` |
| `INV/SR/2` lines | 4 (50000.00 + 4500 + 4500 + party 59000.00) |

Tests **read this file’s numbers**. Do not hardcode different totals in three places.

---

## 5. TESTS

| Test | Assert |
|---|---|
| parse sales fixture | 2 vouchers, totals and line sides match EXPECTED |
| Day Book sample | still 2 vouchers, `1248500.00`, GST **credit** |
| unparseable invoice amount | that row rejected, the other voucher still accepted |
| `tiny.csv` | still unrecognized |

---

## 6. INGEST (S12)

HTTP upload of the sales csv may still return `SALES_REGISTER_NOT_IMPLEMENTED` **or** you may parse into the batch rejects/accepted **without** upsert. Prefer: parse runs, `ingest.service` still does not INSERT sales vouchers until S13. Document which you chose in evidence.

---

## 7. BANNED

- Upsert / publish of `INV/SR/*`
- Editing Day Book EXPECTED
- OpenSearch
- S13–S16

Stop after evidence table + tests.
