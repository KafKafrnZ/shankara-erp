# S13 WORK ORDER — SALES VALIDATE + UPSERT + VERSION ONLY

**S12 must be accepted first.** This file wins on conflict with `PHASE_2_AUDIT.md`.  
**S14–S16 forbidden.** No search ranking rewrite. No frontend. No OpenSearch.

---

## 0. HARD RULES

1. Fill `S13_EVIDENCE.md`. Empty = not done.
2. Default `autoPublish=false`. Sales upload finishes **held**, `published_at` NULL — same as Day Book.
3. Do not `TRUNCATE`. Do not version `INV/HYD/24-25/11820`. Sales vch nos are `INV/SR/{n}`.
4. SHA-256 duplicate of the sales file → no extra current rows.
5. Same business key + different content → version (`valid_to` on old).
6. Money: persist 2-decimal strings from the parser as `NUMERIC`. No `parseFloat`.
7. `VOUCHER_HAS_NO_VALID_LINES` still applies (validator). Do not silently drop.
8. Day Book ingest e2e (`held` when autoPublish omitted) stays green.
9. No OpenSearch. No mapping UI. `tsc` 0. Tests green.

---

## 1. WHAT S13 IS

Wire `parseSalesRegister` into `IngestService.processUpload` for `reportType=SALES_REGISTER`:

```
store bytes → detect SALES_REGISTER → parse → validateDayBook (or shared validate)
  → upsert voucher + lines in one transaction
  → ingest_batch report_type=SALES_REGISTER, status=held
```

Remove `SALES_REGISTER_NOT_IMPLEMENTED` reject for a **valid** sales file. Invalid layout still `UNRECOGNIZED_LAYOUT`.

Reuse existing unique key and versioning. `companyId` from DTO (steward global). Audit `upload` in the same transaction as today.

---

## 2. FILES YOU MAY TOUCH

```
backend/src/ingest/ingest.service.ts
backend/src/ingest/validate/*          # only if sales needs a thin wrapper; do not break BOTH_SIDES / VOUCHER_HAS_NO_VALID_LINES
backend/test/ingest.e2e-spec.ts        # add sales held + duplicate cases
S13_EVIDENCE.md
```

Do not edit frontend, search ranking, Day Book parser rules, Day Book fixtures.

---

## 3. E2E (mandatory)

| Test | Assert |
|---|---|
| steward upload sales csv, no autoPublish | `held`, `published_at` null, SQL current `INV/SR/1` and `INV/SR/2` exist, `report_type=SALES_REGISTER` |
| finance search `INV/SR/1` before publish | `total === 0` |
| re-upload same SHA | voucher current count for `INV/SR/%` unchanged |
| Day Book sample upload omitted autoPublish | still `held` |

Publish is already S6. You may call existing `POST /batches/:id/publish` in e2e to prove rows become searchable — that is allowed here if search tests stay in S14. Prefer S13 e2e stop at **held + SQL count**. Search is S14.

---

## 4. BANNED

- `autoPublish` default true
- OpenSearch
- Frontend
- “I also ranked sales invoices in search”
