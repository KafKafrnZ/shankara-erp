# PHASE 2 COMPLETION BRIEF — SALES REGISTER ONLY

**Document type:** Binding work order for the implementing agent (Gemini)  
**Product:** Shankara Buildpro — Tally Data Access Layer (read-only)  
**Repo:** `D:/5ingularity/shankara-erp`  
**Date:** 2026-08-19  
**Phase 1:** COMPLETE (`PHASE_1_STATUS=COMPLETE`). Do not reopen S0–S10.  
**If this file and a later `S*_BRIEF.md` conflict, the S-brief wins.**

---

## 0. READ THIS BEFORE YOU TOUCH A FILE

Phase 2 is **not** a rewrite. It is **not** OpenSearch. It is **not** AG Grid. It is **not** a mapping UI. It is **not** Purchase / Stock / Trial Balance / GST filing / XML / ODBC.

Phase 2 is **one more Tally Excel/CSV report** that finance already exports: **Sales Register**. Same company (`SHANKARA_HYD`). Same JWT roles. Same object store. Same `voucher` / `voucher_line` tables. Same SQL search. Same UI shell.

Tally remains the book of record. We still do not post.

### 0.1 How you will be judged

A human (not you) will:

1. Upload the **existing** Day Book fixture. It still detects `DAY_BOOK`, still produces 2 vouchers / 6 lines, still searches `11820`.
2. Upload `fixtures/sales-register/sample-sales-register.csv`. It detects `SALES_REGISTER`, publishes, and those invoices appear in search.
3. Re-upload the sales file: current invoice count does not double.
4. Unauthenticated search still 401. Finance still cannot upload (403).
5. `git grep -n opensearch -- backend/src` still empty.
6. `npx tsc --noEmit -p tsconfig.build.json` exit 0. Phase 1 unit + e2e stay green (counts may rise; they must not fall).

If any of those fail, Phase 2 is not done. Do not write `PHASE_2_STATUS=COMPLETE`.

### 0.2 Product law (unchanged)

1. Tally is the book of record. No “Create Voucher.”
2. Store what the file said. Money is integer paise (`parseAmountToCents` / `formatCents`). No `parseFloat` on amounts.
3. Unpublished / held batches are invisible to finance/branch.
4. SHA-256 duplicate → no-op. Same business key + different content → version.
5. Never hard-delete facts. No `ON DELETE CASCADE` on `voucher_line`.
6. RBAC in SQL `WHERE`. Steward is global and may set `companyId`.
7. As-of = `MAX(published_at)` in Asia/Kolkata.
8. Search is **SQL on Postgres**. OpenSearch stays in compose unused.

---

## 1. WHAT PHASE 2 IS

```
Day Book path (Phase 1) ────────────── stays green
                                      │
POST /api/uploads ── detect report ───┤
                                      │
                                      └─ Sales Register (new)
                                           detect → parse → validate → upsert → publish
                                           search / get voucher / as-of (existing APIs)
```

Sales Register rows become **vouchers** (one invoice row → one voucher). GST columns land as **lines** (and `extra`), not a GST engine.

**Out of Phase 2 (do not implement):**

- Purchase Register, Ledger vouchers, Outstanding, Stock Summary, Trial Balance
- Mapping UI / saved templates / zip of many files
- Second Tally company as a product feature (OTHER_CO test rows may exist; do not build a company switcher)
- OpenSearch, AG Grid, GraphQL, Kafka, Prisma, Next.js
- GST return filing, IRN, e-way
- Cloud deploy, 5k load test

If you finish a step early, add tests. Do not start the next S-step until the human accepts the current one.

---

## 2. IMPLEMENTATION ORDER (DO NOT SKIP)

| Step | Deliverable | Done when |
|---|---|---|
| **S11** | Report detect router: `DAY_BOOK` vs `SALES_REGISTER` vs `UNRECOGNIZED_LAYOUT` | Day Book tests unchanged. Sales fixture detects `SALES_REGISTER`. Ingest of sales file does **not** parse/upsert yet (rejected `SALES_REGISTER_NOT_IMPLEMENTED` or equivalent). |
| **S12** | Sales Register parser + `EXPECTED.md` | Fixture parses to the documented voucher/line counts. Day Book parser files not rewritten. |
| **S13** | Validate + upsert + version sales rows through HTTP upload | Held by default. Publish works. Re-upload SHA no-op. Day Book ingest still held-by-default. |
| **S14** | Search + GET voucher see published sales invoices | Finance finds `INV/SR/1`. Branch RBAC still in SQL. No OpenSearch. |
| **S15** | Frontend: one upload dropzone; type shown; search still one box | No mapping UI. No AG Grid. Title unchanged. |
| **S16** | Fill `PHASE_2_EVIDENCE.md` gates | Human re-runs commands. Then `PHASE_2_STATUS=COMPLETE`. |

**You implement S11 only until the human says S11 is accepted.** Do not open S12 files “while you are here.”

---

## 3. SALES REGISTER FINGERPRINT (locked)

A file is `SALES_REGISTER` when **all** of:

1. Some scanned title/period row (first 20 rows) contains the substring `sales register` (case-insensitive).
2. It does **not** contain `day book` in those rows.
3. A header row contains **Date**, (**Particulars** or **Party** or **Party's Name**), (**Vch Type** or **Voucher Type**), (**Vch No** or **Voucher No** or **Invoice No**), and at least one amount column named **Invoice Amount** or **Total** or **Debit** or **Credit** or **Taxable Value**.

A file is `DAY_BOOK` when the existing Day Book detector would return `ok: true` (title `day book` + Date/Particulars/Vch Type/Vch No/Debit/Credit). **Do not change that fingerprint.** If both strings somehow appear, **Day Book wins** (legacy files).

Otherwise: `UNRECOGNIZED_LAYOUT` (same as today for `tiny.csv` / `not-a-daybook.csv`).

---

## 4. IDENTITY OF A SALES VOUCHER

Business key stays the Phase 1 unique:

`(company_id, vch_type, vch_no, vch_date, valid_to) NULLS NOT DISTINCT`

Use **new** voucher numbers in the sales fixture (`INV/SR/1`, `INV/SR/2`) so you do not version `INV/HYD/24-25/11820`.

`ingest_batch.report_type` = `SALES_REGISTER` for those batches. Day Book batches stay `DAY_BOOK`.

---

## 5. DEFINITION OF DONE — BINARY

Copy into `PHASE_2_EVIDENCE.md` and fill the right column. Empty = not done.

| # | Gate |
|---|---|
| 1 | Existing Day Book fixture still detects `DAY_BOOK` and parses 2 vouchers / 6 lines |
| 2 | `tiny.csv` / `not-a-daybook.csv` still `UNRECOGNIZED_LAYOUT` |
| 3 | Sales fixture detects `SALES_REGISTER` (not Day Book) |
| 4 | Steward upload of sales fixture → held (default) then publish |
| 5 | SHA re-upload of sales fixture: current `INV/SR/%` count unchanged |
| 6 | Finance search `INV/SR/1` returns that invoice in hit 1–3 |
| 7 | `GET /api/vouchers/:id` returns sales lines + `source.sha256` |
| 8 | Finance cannot upload (403). Anonymous search 401 |
| 9 | Held sales batch not in finance search |
| 10 | `git grep -n opensearch -- backend/src` empty |
| 11 | `npx tsc --noEmit -p tsconfig.build.json` exit 0; Phase 1 unit+e2e still all pass |
| 12 | No AG Grid, mapping UI, Purchase, Stock, TB, Create Voucher |
| 13 | `PHASE_2_EVIDENCE.md` committed with 1–12 filled |

When 1–13 are true, first line of `PHASE_2_EVIDENCE.md`:

```
PHASE_2_STATUS=COMPLETE
```

---

## 6. BANNED SENTENCES

- “Phase 2 complete” before the COMPLETE line and a full table
- “I also wired Purchase / OpenSearch / mapping while I was here”
- “Day Book detect needed a small rewrite so sales could share it” (Day Book fingerprint is frozen)
- “I truncated SYN9 to keep counts clean”
- “Foundation for GST filing is ready”

---

## 7. FILES OF RECORD

| File | Role |
|---|---|
| `PHASE_2_AUDIT.md` | This file. Scope lock. |
| `S11_BRIEF.md` … `S16_BRIEF.md` | Step work orders. **The current S-brief wins on conflict.** |
| `S11_EVIDENCE.md` … | Filled by the implementer. Empty cell = not done. |
| `PHASE_2_EVIDENCE.md` | S16 only. Do not fill early. |
| `PHASE_1_*` | History. Do not blank COMPLETE. Do not edit Day Book `EXPECTED.md` except to add a new file section if a later brief says so. |
