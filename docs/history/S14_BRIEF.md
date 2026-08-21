# S14 WORK ORDER — SEARCH + RETRIEVE SALES INVOICES (SQL ONLY)

**S13 must be accepted first.** This file wins on conflict.  
**S15–S16 forbidden.** No frontend. No OpenSearch.

---

## 0. HARD RULES

1. Fill `S14_EVIDENCE.md`.
2. Search remains **parameterized SQL** on `voucher`. `git grep -n opensearch -- backend/src` empty.
3. Do not change Day Book ranking rules except if you add an optional AND filter.
4. RBAC still in SQL `WHERE`. Branch cannot see `OTHER_CO`.
5. Unpublished sales batches stay invisible to finance/branch.
6. Do not `parseFloat` amounts. `parseIndianAmount` for `q`.
7. `LIMIT`/`OFFSET` stay bound parameters.
8. `tsc` 0. Phase 1 search e2e stay green.

---

## 1. WHAT S14 IS

After steward publishes the held sales batch:

- `POST /api/search` `{ "q": "INV/SR/1" }` → that voucher in hit 1–3
- `{ "q": "Apex Pipes" }` → `INV/SR/2`
- `{ "q": "59000" }` or `{ "q": "59,000.00" }` → `INV/SR/2`
- `GET /api/vouchers/:id` → 4 lines + `source.sha256` + `source.batchId`

Optional AND filter (only if cheap): `vchType=Sales` already exists. Do **not** add OpenSearch. Do not add a new microservice.

Format `vchDate` for JSON as `YYYY-MM-DD` from the **calendar date in Asia/Kolkata or the Postgres date string**, not `toISOString().split('T')[0]` if that still emits `2025-03-31` for `2025-04-01`. If you touch date formatting, fix it for Day Book GET too (same bug). Do not change SQL `vch_date` values.

---

## 2. FILES YOU MAY TOUCH

```
backend/src/search/search.service.ts      # only if a tiny date/filter fix; ranking stay
backend/src/vouchers/vouchers.service.ts  # date format + is_deleted already required
backend/test/search.e2e-spec.ts
S14_EVIDENCE.md
```

---

## 3. TESTS

| Test | Assert |
|---|---|
| published sales `INV/SR/1` in search hit 1–3 | |
| held sales batch not searchable by finance | |
| GET sales voucher lines + sha256 | |
| Day Book `11820` still in hit 1–3 | |
| anonymous search 401 | |

---

## 4. BANNED

- OpenSearch client
- Frontend
- Mapping UI
- `PHASE_2_STATUS=COMPLETE`
