# PHASE 3 COMPLETION BRIEF — SEARCH-ENGINE QUALITY (THIN)

**Document type:** Binding spec for Phase 3. Implementing agent: Gemini.  
**Product:** Shankara Buildpro — Tally Data Access Layer (read-only)  
**Repo:** `D:/5ingularity/shankara-erp`  
**Date:** 2026-08-20  
**Phase 1:** COMPLETE. **Phase 2:** COMPLETE. Do not reopen S0–S16.  
**If this file and a later `S*_BRIEF.md` conflict, the S-brief wins.**

---

## 0. READ THIS BEFORE YOU TOUCH A FILE

Phase 3 is **not** Purchase Register, **not** a mapping UI, **not** AG Grid, **not** a Tally replacement, **not** “Google for the company.”

Phase 3 is: finance types the way they remember (partial vch, party name, light typo) and still gets the **same voucher in the top 3**, without a second book of record and without breaking RBAC.

Postgres remains the **retrieve source of truth**. OpenSearch, if added later, is a **projection of published, current vouchers**. `GET /api/vouchers/:id` stays on Postgres.

**S17 and S18 are COMPLETE.** S19 path is in tree (human IN-list fix). **`S20_BRIEF.md` is issued.** S21–S22 do not exist. Do **not** add UI highlight.

### 0.1 How S17 will be judged

A human (not you) will:

1. Re-run your gold queries against `http://127.0.0.1:3000` with a finance token.
2. Confirm expected `vch_no` is in hits 1–3 (or the `pass_rule` in `fixtures/search/GOLD.md`).
3. Confirm typo queries are **measured**, not “fixed.”
4. `git grep -n opensearch -- backend/src` still empty.
5. SYN9 current count still **20000**. Official p95 still **135 ms** (untouched).

If any of those fail, S17 is not done. Do not write `PHASE_3_STATUS=COMPLETE`.

### 0.2 Product law (unchanged)

1. Tally is the book of record. No “Create Voucher.”
2. Store what the file said. Money is integer paise. No `parseFloat` on amounts.
3. Unpublished / held batches are invisible to finance/branch.
4. SHA-256 duplicate → no-op. Same business key + different content → version.
5. Never hard-delete facts. No `ON DELETE CASCADE` on `voucher_line`.
6. RBAC in SQL `WHERE`. Steward is global.
7. As-of = `MAX(published_at)` in Asia/Kolkata.
8. Search hits that SQL visibility would hide are a **data leak**, including any future index.

### 0.3 Architecture (target of S18+, not S17)

```
publish / hold ──► Postgres (source of truth)
                 └► indexer (S18) ──► OpenSearch
                                          │
POST /search ──► visibility SQL (RBAC, published, current)
                 └► optional OS candidates (S19)
                      ids intersected with SQL-visible set
GET /vouchers/:id ──► Postgres only
```

S17 measures **today’s SQL path** and freezes the gold set **before** that indexer exists.

---

## 1. WHAT PHASE 3 IS

| Step | Brief | Intent | Issued? |
|---|---|---|---|
| **S17** | `S17_BRIEF.md` | Gold set + SQL baseline. **No OS client.** | **COMPLETE** |
| **S18** | `S18_BRIEF.md` | Indexer: published current vouchers → OS; hold removes them | **COMPLETE** |
| **S19** | `S19_BRIEF.md` | Search uses OS candidates + SQL visibility; SQL fallback if OS down | **YES** |
| **S20** | `S20_BRIEF.md` | Fuzz `shankra` via indexed `company_name`; T2/T3 already hit | **COMPLETE** |
| **S21** | `S21_BRIEF.md` | UI still one box; optional highlight | **YES (implemented)** |
| **S22** | `S22_BRIEF.md` | `PHASE_3_EVIDENCE.md` live gates | **filled, COMPLETE pending human** |

### Out of Phase 3 (do not implement in any S17–S22)

- Purchase Register, Ledger, Outstanding, Stock Summary, Trial Balance
- Mapping UI / saved column templates / zip-of-many-files
- GST returns, IRN, e-way, posting
- AG Grid, GraphQL, Kafka, Prisma, Next.js
- “5,000 concurrent users” load test
- Replacing SQL retrieve with OS-only GET voucher
- Changing Phase 1 official p95 **135 ms** retroactively
- `docker compose down -v` (wipes SYN9)

---

## 2. S22 GATES (do not fill now)

`PHASE_3_EVIDENCE.md` does not exist until S22. Do not create it in S17. The intended gates are listed so you do not invent a different Phase 3:

| # | Gate |
|---|---|
| 1 | Gold file frozen; S17 SQL baseline table exists with cmd + stdout |
| 2 | After S20: gold G1–G10 still pass |
| 3 | After S20: typo T-set hits expected vch in 1–3 (or an issued S20 exception) |
| 4 | Index contains only `valid_to IS NULL AND is_deleted = false` from **published** batches |
| 5 | Hold / unpublish drops the voucher from search for finance |
| 6 | OpenSearch down → `POST /api/search` still works via SQL |
| 7 | Branch cannot see `OTHER_CO`; GET that id is 404 |
| 8 | Unauthenticated search 401 |
| 9 | `GET /api/vouchers/:id` does not read OpenSearch |
| 10 | OS client isolated behind an interface (`git grep` not scattered) |
| 11 | UI: one search box; no Parties/Items pills; no AG Grid |
| 12 | SYN9 current = 20000; official p95 still 135 ms |
| 13 | `tsc` + `npm test` + `npm run test:e2e` green |

S17 owns **gate 1 material only** (gold + SQL numbers). It does not write `PHASE_3_STATUS=COMPLETE`.

---

## 3. BANNED IN PHASE 3

- Inventing a p95
- Declaring Phase 3 complete from S17
- Wiring OpenSearch in S17
- Changing Day Book / Sales Register parse rules
- Restoring `parseFloat` on money
- `TRUNCATE voucher` / drop SYN9 / unpublish batch 345
- Committing `.env`, Tally exports from `D:\Tally`, or synthetic CSVs
