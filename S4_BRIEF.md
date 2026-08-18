# S4 WORK ORDER — DETECT + DAY BOOK PARSE ONLY

You are implementing **S4 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
This file wins if anything else conflicts.

**S0–S3 are done and verified.** Do not rewrite auth, upload, storage, migrations, seed, frontend, or docker-compose.

**S5–S10 are forbidden.** No upsert into `voucher`. No publish. No search. No OpenSearch. No frontend. No mapping UI.

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S4 complete in chat. Fill `S4_EVIDENCE.md` §8. Empty cell = not done.
2. **Do not wire the parser into `POST /api/uploads`.** Upload of `tiny.csv` must still return `202` / `duplicate`. If you run detect on every upload, S3 e2e breaks. S4 is a **library + unit tests**. S5 will call it.
3. Do not insert into `voucher`, `voucher_line`, `master_ledger`, or `ingest_reject`.
4. Do not add GraphQL, Kafka, Prisma, OpenSearch client, or a new app.
5. Do not commit `.env`. Do not put passwords in source.
6. Do not use `synchronize: true`.
7. Do not guess unknown Excel layouts. Detect fails closed: `UNRECOGNIZED_LAYOUT`.
8. Do not change `fixtures/daybook/EXPECTED.md` to match a lazy parser. Change the parser to match EXPECTED.
9. Do not write timestamped junk files into `fixtures/daybook/`. Temp files go to `os.tmpdir()`.
10. `npm run test:e2e` (S2+S3) must stay green. `npx tsc --noEmit -p tsconfig.build.json` exit 0.

---

## 1. WHAT S4 IS

A **pure detect + parse pipeline** for Tally Day Book `.csv` and `.xlsx`.

```
path | Buffer  →  detect()  →  parse()  →  ParseResult
```

`ParseResult` is in-memory. Nobody writes it to Postgres in this step.

ExcelJS **is allowed** in S4 (it was banned in S3). Add `exceljs` to `backend/package.json`. Use streaming `WorkbookReader` for `.xlsx` when possible. CSV: parse line-by-line (do not invent a second framework).

---

## 2. FILES YOU MAY TOUCH

Create / edit **only**:

```
backend/src/ingest/detect/daybook.detector.ts
backend/src/ingest/detect/daybook.detector.spec.ts
backend/src/ingest/parse/amount.ts          # parseIndianAmount
backend/src/ingest/parse/date.ts            # parseTallyDate (string + Excel serial)
backend/src/ingest/parse/vch-no.ts          # normalizeVchNo
backend/src/ingest/parse/daybook.parser.ts
backend/src/ingest/parse/daybook.parser.spec.ts
backend/src/ingest/parse/types.ts           # DetectResult, ParseResult, ParsedVoucher, ParseReject
backend/package.json / package-lock.json    # exceljs only
S4_EVIDENCE.md
```

You may **read** (not rewrite) `fixtures/daybook/*` and `EXPECTED.md`. Those files are the contract. Already committed:

| File | Role |
|---|---|
| `fixtures/daybook/sample-daybook.csv` | happy path — 2 vouchers, 6 lines |
| `fixtures/daybook/sample-daybook-bad-amount.csv` | 1 unparseable row, rest continues |
| `fixtures/daybook/sample-daybook-serial-date.csv` | Excel serial `45383` = `2024-04-01` |
| `fixtures/daybook/not-a-daybook.csv` | detect fail |
| `fixtures/daybook/tiny.csv` | upload fixture; detect fail |
| `fixtures/daybook/EXPECTED.md` | counts and field values |

For `.xlsx` tests: in `beforeAll`, build a **temp** workbook from the same rows as `sample-daybook.csv` using ExcelJS, write to `os.tmpdir()`, parse it, delete it. Do not commit a binary xlsx unless you must.

---

## 3. TYPES (exact)

```ts
export type DetectResult =
  | {
      ok: true;
      reportType: 'DAY_BOOK';
      titleCompany: string | null;
      periodFrom: string | null; // YYYY-MM-DD
      periodTo: string | null;
      headerRowIndex: number;    // 0-based among extracted text rows
      columns: Record<string, number>; // canonical name → col index
    }
  | {
      ok: false;
      error: 'UNRECOGNIZED_LAYOUT';
    };

export type ParseReject = {
  sourceRowNo: number; // 1-based as in the file (row 1 = first line)
  code: string;
  message: string;
  raw: Record<string, string>;
};

export type ParsedLine = {
  lineNo: number;
  ledgerName: string;
  debit: string;  // numeric string 2 dp, e.g. "1248500.00"
  credit: string;
  extra: Record<string, string>;
};

export type ParsedVoucher = {
  vchNo: string;
  vchNoNorm: string;
  vchType: string;
  vchDate: string; // YYYY-MM-DD
  partyName: string | null;
  totalAmount: string;
  narration: string | null;
  sourceRowNo: number;
  extra: Record<string, string>;
  lines: ParsedLine[];
};

export type ParseResult = {
  detect: DetectResult;
  vouchers: ParsedVoucher[];
  rejects: ParseReject[];
};
```

Public API:

```ts
detectDayBook(rows: string[][]): DetectResult;
parseDayBook(rows: string[][]): ParseResult;
parseDayBookFile(filePath: string): Promise<ParseResult>; // csv or xlsx by extension
parseIndianAmount(raw: string): string | null; // null = unparseable
parseTallyDate(raw: string | number): string | null;
normalizeVchNo(raw: string): string;
```

If detect fails, `parseDayBook` / `parseDayBookFile` returns `{ detect, vouchers: [], rejects: [] }` and does **not** throw.

---

## 4. DETECT RULES

Fingerprint the first 20 rows of **cell text**:

- Some cell contains `Day Book` (case-insensitive).
- A header row contains **Date** and (**Particulars** or **Ledger**) and (**Vch Type** or **Voucher Type**) and (**Vch No** or **Voucher No.** or **Vch No.**) and **Debit** and **Credit**.
- Period: a cell matching `{date} to {date}` → `periodFrom` / `periodTo`.
- `titleCompany` = first non-empty row that is not the report name and not the period line (usually row 1).

Column map: normalize header labels (trim, collapse spaces, strip trailing `.`) to keys:

`date`, `particulars`, `vchType`, `vchNo`, `debit`, `credit`, plus any unknown header under its trimmed name.

If the header cannot be found → `{ ok: false, error: 'UNRECOGNIZED_LAYOUT' }`.  
**Do not guess** “first row with 4 columns is the header.”

`COMPANY_MISMATCH` is **not** applied in S4 (no `companyId` argument). S5 will compare `titleCompany` to the upload field.

---

## 5. PARSE RULES (must match EXPECTED.md)

Implement every bullet. Each is a named test.

1. Skip title rows before the detected header.
2. If two header-like rows, use the one that contains `Vch No` / `Debit`.
3. Skip particulars (trim, case-insensitive) in: `Opening Balance`, `Closing Balance`, `Grand Total`, `Total`.
4. Skip empty particulars with no amounts.
5. **Group vouchers:** a new voucher starts when `vchNo` is non-empty **or** `date` is non-empty after a voucher has started. Rows with empty `vchNo` and empty `date` are **lines** of the current voucher.
6. Header row of a voucher: `date`, `vchType`, `vchNo` required. Missing any of those on a row that looks like a new voucher → reject that row (`MISSING_VCH_NO` / `MISSING_VCH_TYPE` / `MISSING_VCH_DATE`), do not start a voucher.
7. `partyName` = particulars of the voucher header row for types Sales, Purchase, Receipt, Payment, Credit Note, Debit Note. Contra: `partyName` null (still store lines).
8. `totalAmount` = max(sum(debits), sum(credits)) of **accepted lines**, formatted to 2 dp. If that is 0 and the header row had an amount, use the header amount **and** still keep the header as a line if it has a ledger name and an amount.
9. Do not invent lines Tally did not print.
10. A following row with particulars, **no** date, **no** vchNo, **both amounts empty** → `narration` (append if multiple). **Not** a 0/0 ledger line.
11. Amounts via `parseIndianAmount`: strip `₹`, spaces, `Dr`, `Cr`, Indian commas (`12,48,500.00` → `1248500.00`). `(125000.50)` → `-125000.50`. Unparseable → reject **that row** with `UNPARSEABLE_AMOUNT`, **continue** the voucher.
12. Dates: `d-MMM-yy`, `dd-MM-yyyy`, `yyyy-mm-dd`, and Excel serial numbers (epoch **1899-12-30**, as used by ExcelJS). Serial `45383` = `2024-04-01`.
13. `vchNoNorm`: lowercase, remove `/`, `-`, whitespace. `INV/HYD/24-25/11820` → `invhyd242511820`.
14. Unknown columns → `extra` on the voucher (header row values) or line (that row’s values). Do not drop `Cost Centre`.
15. `MAX_PARSE_ROWS` from env (default 500000). If data rows after header exceed the cap → `ParseResult.detect` stays ok, `vouchers=[]`, `rejects=[{ code: 'MAX_PARSE_ROWS', ... }]`. Do not return a partial voucher list when the cap is exceeded.

Money in the result is **strings with 2 decimal places**, never IEEE floats.

---

## 6. TESTS YOU MUST WRITE AND PASS

`backend` unit tests via `npm test` (jest `src/**/*.spec.ts`). These are **not** `should be defined`.

### `daybook.detector.spec.ts`

| Test name | Assert |
|---|---|
| `detects sample-daybook.csv` | `ok`, period `2025-04-01`–`2025-04-30`, title contains `Shankara` |
| `rejects not-a-daybook.csv` | `UNRECOGNIZED_LAYOUT` |
| `rejects tiny.csv` | `UNRECOGNIZED_LAYOUT` |

### `amount / date / vch-no` specs (can live in one file)

| Test name | Assert |
|---|---|
| `parses indian comma amounts` | `12,48,500.00` → `1248500.00` |
| `parses Dr Cr and rupee` | `₹ 50,000.00 Dr` → `50000.00` |
| `parses accounting paren` | `(1,000.00)` → `-1000.00` |
| `unparseable amount returns null` | `NOT_A_NUMBER` → `null` |
| `parses d-MMM-yy` | `1-Apr-25` → `2025-04-01` |
| `parses excel serial 45383` | `2024-04-01` |
| `normalizes voucher number` | `INV/HYD/24-25/11820` → `invhyd242511820` |

### `daybook.parser.spec.ts`

Read expected counts from `EXPECTED.md` **or** hardcode the exact values from that file (must match).

| Test name | Assert |
|---|---|
| `skips title block and finds header` | first voucher date is `2025-04-01`, not the company name |
| `skips opening closing and grand total` | no voucher named Opening/Grand Total; voucher count **2** |
| `groups split lines under one voucher` | sales voucher has **4** lines, party `Sri Steel Traders` |
| `stores narration not as a zero line` | narration equals `TMT 12mm 18MT KA01AB1234`; no 0/0 line with that text |
| `parses indian comma amounts on sample` | `totalAmount === '1248500.00'` |
| `normalizes voucher number on sample` | `invhyd242511820` |
| `keeps unknown column in extra` | `extra['Cost Centre'] === 'HYD'` |
| `rejects unparseable amount row but continues` | bad-amount fixture: reject count 1, still 2 vouchers |
| `parses excel serial date` | serial fixture date `2024-04-01` |
| `unrecognized sheet returns detect failure` | `not-a-daybook.csv` → `detect.ok === false`, 0 vouchers |
| `parses xlsx built from sample-daybook rows` | same 2 vouchers / 6 lines as CSV |

`npm test` must pass. `npm run test:e2e` must still pass (16 tests).

---

## 7. IMPLEMENTATION ORDER

1. `types.ts` + `amount.ts` + `date.ts` + `vch-no.ts` + their specs.  
2. Detector + detector specs.  
3. Parser + parser specs against committed fixtures.  
4. `parseDayBookFile` for csv + xlsx.  
5. Xlsx temp-file test.  
6. Fill `S4_EVIDENCE.md`. Stop.

Do not open S5 files.

---

## 8. EVIDENCE — copy to `S4_EVIDENCE.md`

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | |
| 2 | `npm test` — all §6 tests pass | paste jest summary |
| 3 | `npm run test:e2e` still 16 passed | paste summary |
| 4 | `sample-daybook.csv` → 2 vouchers, 6 lines | |
| 5 | Sales `vchNoNorm` is `invhyd242511820` | |
| 6 | Narration stored, not a 0/0 line | |
| 7 | `not-a-daybook.csv` → UNRECOGNIZED_LAYOUT | |
| 8 | Bad amount → 1 reject, other vouchers kept | |
| 9 | Serial `45383` → `2024-04-01` | |
| 10 | No writes to `voucher` / `voucher_line` (grep ingest for `voucherRepo` / `INSERT INTO voucher` empty except entities unused) | |
| 11 | `POST /api/uploads` not calling detect/parse | |
| 12 | EXPECTED.md **unchanged** (`git diff fixtures/daybook/EXPECTED.md` empty) | |

When 1–12 are filled:

```
S4_STATUS=COMPLETE
```

Until that line exists, S4 is not complete.

---

## 9. BANNED SENTENCES

- “S4 complete, parser skeleton ready for upsert”
- “I also wired parse into upload”
- “I adjusted EXPECTED.md because the totals were awkward”
- “Ready for S5” without `S4_EVIDENCE.md`

Reply with files changed, `npm test` summary, `npm run test:e2e` summary, and the evidence table. Then **stop**.
