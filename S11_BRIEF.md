# S11 WORK ORDER — REPORT DETECT ROUTER ONLY

You are implementing **S11 only** of Shankara Buildpro Phase 2.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_2_AUDIT.md` and **this file**. This file wins on conflict.

**Phase 1 (S0–S10) is done.** Do not rewrite Day Book parse/validate/upsert, search ranking, auth, or frontend.  
**S12–S16 are forbidden.** Do not parse Sales Register rows into vouchers. Do not upsert sales invoices. Do not add UI. Do not fill `PHASE_2_EVIDENCE.md`. Do not write `PHASE_2_STATUS=COMPLETE`.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S11 complete in chat. Fill `S11_EVIDENCE.md`. Empty cell = not done.
2. **Do not change Day Book detect fingerprint.** `detectDayBook` must still require title `day book` + Date/Particulars/Vch Type/Vch No/Debit/Credit. Existing Day Book unit tests stay green with the **same** assertions.
3. Do not parse sales invoice lines. Do not call `validateDayBook` on sales rows. Do not INSERT sales vouchers.
4. Do not edit `fixtures/daybook/EXPECTED.md` or committed `sample-daybook*.csv`.
5. Do not add GraphQL, Kafka, Prisma, OpenSearch, AG Grid, Purchase Register, mapping UI, or a new app.
6. Do not commit `.env`. Do not `synchronize: true`. Do not `TRUNCATE voucher`.
7. Money stays integer paise (`money.ts`). Do not restore `parseFloat` on amounts.
8. `npx tsc --noEmit -p tsconfig.build.json` exit 0. Current unit tests stay green (count may rise). E2e 37 stay green.

---

## 1. WHAT S11 IS

```
rows[][]
  → detectReport(rows)
       ├─ DAY_BOOK          → existing parseDayBook path (unchanged)
       ├─ SALES_REGISTER    → ingest STOPS: batch rejected, code SALES_REGISTER_NOT_IMPLEMENTED
       └─ UNRECOGNIZED      → existing UNRECOGNIZED_LAYOUT
```

After S11 a steward can upload a Sales Register file and get a **clear reject**, not a Day Book mis-parse and not a hang. Finance never sees those rows (rejected batches are unpublished).

---

## 2. FILES YOU MAY TOUCH

```
backend/src/ingest/detect/daybook.detector.ts   # only if you extract shared header helpers; fingerprint MUST not change
backend/src/ingest/detect/sales-register.detector.ts   # new
backend/src/ingest/detect/report.detector.ts           # new router
backend/src/ingest/detect/*.spec.ts
backend/src/ingest/parse/types.ts                       # DetectResult.reportType union + fail codes
backend/src/ingest/parse/daybook.parser.ts              # call detectReport first; DAY_BOOK → existing parse; SALES_REGISTER → detect-ok with 0 vouchers + reject OR return detect-only
backend/src/ingest/ingest.service.ts                    # if detect is SALES_REGISTER: batch status rejected, errorSummary SALES_REGISTER_NOT_IMPLEMENTED, acceptedRows=0
fixtures/sales-register/sample-sales-register.csv       # new, content locked below
fixtures/sales-register/not-a-sales-register.csv        # optional tiny negative
S11_EVIDENCE.md
```

**Do not edit:** `frontend/`, Day Book `EXPECTED.md`, `daybook.validator.ts`, `search.service.ts`, migrations (not needed), `s9-bench.ts`.

---

## 3. DETECT RULES

Implement `detectSalesRegister(rows)` and `detectReport(rows)`:

```ts
export function detectReport(rows: string[][]): DetectResult {
  const day = detectDayBook(rows);
  if (day.ok) return day; // Day Book wins if both strings exist
  const sales = detectSalesRegister(rows);
  if (sales.ok) return sales;
  return { ok: false, error: 'UNRECOGNIZED_LAYOUT' };
}
```

`detectSalesRegister` returns `ok: true, reportType: 'SALES_REGISTER'` when:

1. First 20 rows joined text includes `sales register` (case-insensitive).
2. First 20 rows do **not** include `day book`.
3. A header row in those 20 has:
   - `date`
   - `particulars` OR `party` OR `party's name` OR `party name`
   - `vch type` OR `voucher type`
   - `vch no` OR `voucher no` OR `invoice no` (strip trailing `.`)
   - at least one of: `invoice amount`, `total`, `debit`, `credit`, `taxable value`

Company title: first non-empty cell in the title block (same idea as Day Book). Period: `X to Y` parsed with `parseTallyDate`.

`DetectResult` success `reportType` becomes `'DAY_BOOK' | 'SALES_REGISTER'`. Failure stays `{ ok: false, error: 'UNRECOGNIZED_LAYOUT' }`.

---

## 4. FIXTURE (exact)

Create `fixtures/sales-register/sample-sales-register.csv` **exactly**:

```
Shankara Buildpro - Hyderabad
Sales Register
1-Apr-25 to 30-Apr-25

Date,Particulars,Vch Type,Vch No.,Taxable Value,CGST,SGST,IGST,Invoice Amount
1-Apr-25,Sri Steel Traders,Sales,INV/SR/1,"10,23,770.00","1,12,365.00","1,12,365.00",,"12,48,500.00"
2-Apr-25,Apex Pipes,Sales,INV/SR/2,"50,000.00","4,500.00","4,500.00",,"59,000.00"
```

S11 does **not** persist those invoices. Parser/upsert of these rows is S12/S13.

---

## 5. INGEST BEHAVIOR

When `detectReport` is `SALES_REGISTER`:

- SHA-256 store the original file (object store + `source_file`) — same as any upload.
- Create `ingest_batch` with `report_type='SALES_REGISTER'`, `status='rejected'`, `accepted_rows=0`, `errorSummary` containing `SALES_REGISTER_NOT_IMPLEMENTED`.
- HTTP 202 or 200 is fine if body includes `status: 'rejected'` and that code. Do **not** leave it `held` with silent 0 vouchers (that looks like success).
- Day Book uploads: **unchanged** (held by default, parse, upsert).

When SHA duplicate of a previous sales reject: existing duplicate short-circuit may return the old batch. That is OK.

---

## 6. TESTS (mandatory)

Add unit tests (names may vary, assertions may not):

| Test | Assert |
|---|---|
| sample-daybook.csv | `detectReport` → `DAY_BOOK`. Voucher count still 2 via existing parse tests. |
| sample-sales-register.csv | `detectReport` → `SALES_REGISTER`, `titleCompany` contains `Shankara`, period 2025-04-01..2025-04-30 |
| tiny.csv / not-a-daybook.csv | still `UNRECOGNIZED_LAYOUT` |
| A string with both “Day Book” and “Sales Register” | `DAY_BOOK` |

Optional e2e: steward uploads the sales csv → `status=rejected`, `errorSummary` includes `SALES_REGISTER_NOT_IMPLEMENTED`, SQL `count(*)` of `vch_no LIKE 'INV/SR/%'` still 0.

Do not weaken existing Day Book tests.

---

## 7. `S11_EVIDENCE.md`

| # | Gate | Evidence |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.build.json` exit 0 | |
| 2 | `npm test` — all previous tests plus new detect tests passing | |
| 3 | `npm run test:e2e` still 37 (or 37+N if you added one) | |
| 4 | Day Book sample still `reportType=DAY_BOOK` | |
| 5 | Sales sample `reportType=SALES_REGISTER` | |
| 6 | Steward upload sales csv → rejected `SALES_REGISTER_NOT_IMPLEMENTED`, zero `INV/SR/%` vouchers | |
| 7 | `git grep -n opensearch -- backend/src` empty | |
| 8 | No sales parser module yet (`git grep parseSales` empty or only detect) | |

Do not write `S11_STATUS=COMPLETE` until every cell has command output.

---

## 8. BANNED

- Parsing `INV/SR/1` into `voucher`
- Changing Day Book header aliases
- “I implemented S12 too because detect was easy”
- OpenSearch, AG Grid, mapping UI
- `PHASE_2_STATUS=COMPLETE`

Reply with files changed, test summaries, evidence table. Then **stop**.
