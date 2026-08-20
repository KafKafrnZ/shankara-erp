# Shankara Buildpro — Phase 1 + 2 report, and Phase 3 scope

**Read this first if you are Claude, Gemini, or any other agent.**  
**Repo:** https://github.com/KafKafrnZ/shankara-erp  
**Date:** 2026-08-20  
**Host of record (benchmarks):** Windows, 11th Gen Intel Core i3-1115G4 @ 3.00 GHz

| Phase | Status | Evidence |
|---|---|---|
| **1** Day Book ingest / search / retrieve | **COMPLETE** | `PHASE_1_EVIDENCE.md` → `PHASE_1_STATUS=COMPLETE` |
| **2** Sales Register on the same path | **COMPLETE** | `PHASE_2_EVIDENCE.md` → `PHASE_2_STATUS=COMPLETE` |
| **3** Search-engine quality | **S21 done, S22 evidence filled** | Waiting human audit of UI highlight + COMPLETE stamp. |

**Pre–Phase 3 stress (2026-08-20):** mixed synthetic Day Book **N=10000** (`STRS`/`STRP`/…), parse 10k/34k lines 0 rejects, HTTP ingest ~72 s, search worst p95 **122 ms**. Details: `STRESS_DAYBOOK.md`. Does **not** replace official S9 p95 **135 ms**.

Independent human review accepted every S-step against live Docker + `http://127.0.0.1:3000`. Do not take implementer chat as proof.

---

## Note for Claude

You are **not** starting Phase 1 or Phase 2. Those are closed.

- **Do not** reopen S0–S16. **Do not** rewrite Day Book parse rules. **Do not** restore `parseFloat` on money. **Do not** `TRUNCATE voucher`. **Do not** drop SYN9 (20k) rows.
- **Do not** add OpenSearch client code, AG Grid, mapping UI, Purchase Register, Stock, Trial Balance, GST filing, or “Create Voucher”. `S17_BRIEF.md` is issued and **explicitly forbids** an OS client. S18–S22 briefs do not exist.
- Old `S3_BRIEF.md`–`S10_BRIEF.md` still say “Phase 2 is forbidden.” That lock is **expired**. They are history. Current product law is this file + `PHASE_1_AUDIT.md` §1 + `PHASE_2_AUDIT.md` §0.2.
- Official search p95 is **135 ms** (Phase 1, 20k SYN9, worst of three shapes). Do not invent a new p95. Do not re-run `s9-bench.ts` unless the human asks.
- S17 and S18 are **done**. S19 candidate+SQL path is in code (human fixed OS-id `IN` bind). `S20_BRIEF.md` is issued: fuzz **only** for `shankra` via `company_name`. Do not revert IN-list or exact `vch_no_norm` bind.

---

## 1. Product (unchanged across phases)

Tally is the **book of record**. This system is a **read-only** ingest / search / retrieve layer for Tally Excel/CSV exports.

It does **not** post, alter, or write back to Tally. There is no Create Voucher. If Tally and this system disagree, **Tally wins**. Every fact row has `batch_id` + `source_row_no`. Original file bytes are kept (SHA-256 object store).

**Roles:** `steward` (global, may set any `companyId` on upload), `finance`, `branch` (`company_id` in SQL `WHERE`). Unpublished / held batches are invisible to finance and branch.

**Money:** integer paise (`backend/src/ingest/parse/money.ts`), round-half-up on the 3rd decimal. No IEEE-754 `parseFloat` on amounts going to SQL.

---

## 2. Architecture as built (Phases 1–2)

```
Steward browser (Vite :5173)
    │  JWT in sessionStorage sb.accessToken
    │  proxy /api → 127.0.0.1:3000
    ▼
NestJS 11 API
    ├─ POST /api/uploads          steward; SHA-256 store; detect → parse → validate → upsert
    ├─ POST /api/batches/:id/publish|hold
    ├─ POST /api/search           SQL on Postgres; RBAC in WHERE
    ├─ GET  /api/vouchers/:id     lines + source.sha256
    └─ GET  /api/meta/as-of       MAX(published_at)
    │
    ├─ PostgreSQL 16  via PgBouncer :6432  (TypeORM synchronize:false)
    ├─ Local FS object store  {aa}/{bb}/{sha256}
    └─ Redis + OpenSearch in compose  — unused in Phase 1–2
```

**Detect router** (`detectReport`):

1. Day Book fingerprint (title `day book` + Date/Particulars/Vch Type/Vch No/Debit/Credit) → `DAY_BOOK`
2. Else Sales Register (title `sales register`, no `day book`, invoice/amount headers) → `SALES_REGISTER`
3. Else `UNRECOGNIZED_LAYOUT`

If both title strings appear, **Day Book wins**.

**Persistence:** one `voucher` + `voucher_line` model for both reports. `ingest_batch.report_type` is `DAY_BOOK` or `SALES_REGISTER`. Unique `(company_id, vch_type, vch_no, vch_date, valid_to) NULLS NOT DISTINCT`. SHA-256 duplicate → HTTP `duplicate`. Content change → version (`valid_to`).

**Search:** parameterized SQL only. `ILIKE` is always OR-ed so party names with digits still match. `LIMIT`/`OFFSET` are bound parameters. Exact `vch_no_norm` rank uses a **separate** bind from the `LIKE` prefix (human S17 fix: equality must not reuse `'invsr1%'`).

---

## 3. Phase 1 — what shipped and the official bench

**Scope:** one company (`SHANKARA_HYD`), one report (**Day Book**), end-to-end: auth, object store, detect/parse/validate/upsert/publish, SQL search, voucher pane, as-of IST, audit.

**Fixture contract** (`fixtures/daybook/EXPECTED.md`): 2 vouchers, 6 lines. `INV/HYD/24-25/11820` Sales, party `Sri Steel Traders`, total **`1248500.00`**, CGST **credit `112365.00`**. `RCT/HYD/2401` Receipt `50000.00`.

### 3.1 Official search p95 (gate 24) — copy these numbers

Synthetic **N = 20,000** vouchers `SYN9/{n}`, HTTP upload + publish, batch **345**. Bench: warmup 10, then 100 measured `POST /api/search` per shape. p95 = index 94.

```
shape          n    p50_ms    p95_ms    p99_ms    hits_min
vch            100  80        114       132       1
party          100  83        135       148       1
amount         100  95        129       132       20

Worst p95: 135 ms     bar was ≤ 200 ms
```

Host: Windows i3-1115G4. SQL `SYN9/%` current count = 20000.

**Rejected / superseded p95 tables (do not quote):**

| Table | Worst p95 | Why discarded |
|---|---|---|
| 42 ms then 115 ms | invented `ECONNREFUSED` catch | Fake |
| 301 ms (party) | live, btree only, cold | Honest, over bar |
| 228 ms (amount) | live, GIN present, noisy | Honest, over bar |
| **135 ms (party)** | independent re-run of `s9-bench.ts` | **Official** |

Indexes: btree `idx_voucher_s9_vch/_amt/_pty` + GIN `pg_trgm` on `party_name` and `narration`. Planner may still seq-scan the combined `OR`; 20k still met 200 ms on a quiet machine.

### 3.2 Phase 1 post-audit (before Phase 2)

Fixed: integer paise; `VOUCHER_HAS_NO_VALID_LINES` instead of silent drop; calendar dates; parameterized LIMIT; `is_deleted` on GET voucher; trailing Dr/Cr suffix; `master_ledger DO NOTHING`. Steward `companyId` documented as global on purpose.

---

## 4. Phase 2 — what shipped

**Scope (narrower than the 2026-08-17 architecture essay):** **Sales Register only**, same APIs and UI shell. Not Purchase, not mapping UI, not OpenSearch, not a second company switcher.

| Step | What |
|---|---|
| S11 | Detect `SALES_REGISTER`; upload rejected `SALES_REGISTER_NOT_IMPLEMENTED` |
| S12 | `parseSalesRegister`: one invoice row → one voucher; party debit + Sales/CGST/SGST credits |
| S13 | Upsert held by default; SHA duplicate no extra current rows |
| S14 | SQL search + GET; `vchDate` formatted from local Y-M-D (not UTC `toISOString` → off-by-one) |
| S15 | One Upload dropzone; held → Publish button; reject shows `errorSummary` |
| S16 | Live evidence table |

**Sales fixture** (`fixtures/sales-register/EXPECTED.md`):

| Vch | Party | Total | Lines |
|---|---|---|---|
| `INV/SR/1` | Sri Steel Traders | `1248500.00` | party Dr 1248500; Sales Cr 1023770; CGST Cr 112365; SGST Cr 112365 |
| `INV/SR/2` | Apex Pipes | `59000.00` | 4 lines (50000 + 4500 + 4500) |

Independent S16 live (2026-08-19): unauth search **401**; finance upload **403**; published sales search `INV/SR/1` hit 1–3; GET 4 lines + `source.sha256`; held unique `INV/SR/1-…` finance **total=0**; SYN9 still **20000**.

**Operational nit:** the committed `sample-sales-register.csv` SHA may already exist as a **held** batch. Re-upload is `duplicate`. Search `INV/SR/1` then hits **published suffixed** e2e copies first until that held batch is published. Hold/publish semantics are correct.

No Phase 2 20k sales bench was required or run. Do not invent one.

---

## 5. Tests at Phase 2 close (independent)

| Suite | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.build.json` | exit 0 |
| `npm test` (backend) | **40 / 40** |
| `npm run test:e2e` | **39 / 39** |
| `cd frontend && npm run build` | exit 0 (S15) |
| `git grep -n opensearch -- backend/src` | empty |

---

## 6. Still open (do not “fix” unless a human asks)

1. **No real Tally export** from a live Shankara company has been parsed. Fixtures are hand-built / synthetic.
2. E2e clones inflate `Sri Steel` / `INV/SR/%` hit totals. Do **not** `TRUNCATE`.
3. Fresh-clone CI (`down -v` + migrate + seed + tests) is not automated. Do not `down -v` on this volume (drops SYN9).
4. Backup: `pg_dump` the DB; copy `backend/var/uploads/{aa}/{bb}/{sha256}`. Restore = `psql` + copy object tree. No off-host replica.

**Closed this pass:** health `asOf` from `MAX(published_at)`; login 10/min throttle; `helmet`; CORS includes `127.0.0.1:5173`; dead `autoPublish` removed; integer paise for debit/credit tolerance; sales fixture line-value asserts.

---

## 7. Phase 3 — scope and architecture (S17 complete)

The 2026-08-17 architecture essay called Phase 3 “search-engine quality” (OpenSearch, typeahead, fuzz, facets, dossiers). **This program will do a thinner, sequential Phase 3.** S17 and S18 are complete. `S19_BRIEF.md` is issued. S20–S22 are **not** written. Do not add fuzz or UI from this section.

### 7.1 Goal

Finance can type the way they remember (typos, partial vch, party nickname) and still get the **same voucher** in the top 3, without a second book of record and without breaking RBAC.

Postgres remains the **retrieve source of truth**. If a search index is added, it is a **projection of published, current vouchers**. Hold / unpublish must drop hits. Branch `company_id` filter stays in the serving query, not only in JS.

### 7.2 In scope (intended)

1. **Gold set (mandatory before any cluster):** frozen in `fixtures/search/GOLD.md` (G1–G10 + typo T1–T3 + amount A1–A2 + visibility N1–N4). S17 measures SQL **first**. Do not edit expected columns without a human.
2. **OpenSearch as index, not source of truth:** index only `valid_to IS NULL AND is_deleted = false` rows from **published** batches. Fields: `company_id`, `vch_no`, `vch_no_norm`, `party_name`, `total_amount`, `narration`, `vch_date`, `vch_type`, `batch_id`. Sync on publish and on hold/unpublish (delete or mark unpublished).
3. **`POST /api/search`:** may query the index for candidate ids, then **load lines and lineage from Postgres**. If OpenSearch is down, **SQL fallback** (today’s path). Never return a hit that SQL visibility would hide.
4. **Typeahead / light fuzz** on party and vch_no only. No “Google” marketing. No item/HSN dossier.
5. **UI:** still **one search box**. Optional highlight of the match. No AG Grid. No Parties/Items pills.
6. **Evidence:** gold-set pass table + typo-set table + “OS down → SQL still works” + branch still cannot see `OTHER_CO` + `git grep` shows OS usage is isolated behind an interface.

### 7.3 Out of Phase 3

- Purchase Register, Ledger, Outstanding, Stock Summary, Trial Balance
- Mapping UI / saved column templates / zip-of-many-files
- GST returns, IRN, e-way, posting
- AG Grid, GraphQL, Kafka, Prisma, Next.js
- “5,000 concurrent users” load test
- Replacing SQL retrieve with OS-only GET voucher
- Changing Phase 1 p95 135 ms retroactively

Those deferred items (Purchase, mapping, more companies) are **later than Phase 3**, not a side quest inside it.

### 7.4 Architecture sketch (Phase 3)

```
publish / hold ──► Postgres (source of truth)
                 └► indexer (best-effort) ──► OpenSearch
                                                │
POST /search ──► visibility SQL (RBAC, published, current)
                 └► optional OS query for ranking/candidates
                      ids intersected with SQL-visible set
GET /vouchers/:id ──► Postgres only
```

Compose already has `shankara-opensearch`. S18 wired the indexer. S19 may query it for **ids only**; retrieve stays Postgres.

### 7.5 Suggested step order (names only; no work)

| Step | Intent | Brief |
|---|---|---|
| S17 | Gold set + SQL baseline measurements (no OS client) | **COMPLETE** (`S17_EVIDENCE.md`) |
| S18 | Indexer: published current vouchers → OS; hold removes them | **COMPLETE** (`S18_EVIDENCE.md`) |
| S19 | Search uses OS candidates + SQL visibility; SQL fallback | **issued** (`S19_BRIEF.md`) |
| S20 | Typo/fuzz on party + company_name (`shankra`); T2/T3 already hit | **COMPLETE** (`S20_EVIDENCE.md`) |
| S21 | UI: still one box; optional highlight | **done** (`S21_BRIEF.md` / `S21_EVIDENCE.md`) |
| S22 | `PHASE_3_EVIDENCE.md` live gates | **filled, COMPLETE not stamped** |

**S21 implemented. `PHASE_3_EVIDENCE.md` filled. Do not write `PHASE_3_STATUS=COMPLETE` until a human checks highlight on :5173.**

S18 live (independent, after continuation): SQL published current = OS `_count` = **30431**. `INV/SR/1` in OS `_id=20745`. HOLD17/1 absent. OTHER/1 present. Search still SQL. G7 hit 1 = `INV/SR/1`. Reindex no longer `indices.delete`s first.

S17 SQL baseline (finance, gold captured **before** e2e; clone totals move after e2e — ranking does not):

```
G1  11820                 hit2 INV/HYD/24-25/11820   pass
G2  INV/HYD/24-25/11820   hit1 same                  pass
G3  RCT/HYD/2401          hit1                       pass
G4  KA01AB1234            top narration has plate    pass (clones; not the fixture vch)
G5  STRS/5000             hit1                       pass
G6  Mix Party 5000        STRS/5000                  pass
G7  INV/SR/1              hit1 exact INV/SR/1        pass (needs exact vch_no_norm bind)
G8  INV/SR/2              hit1 exact INV/SR/2        pass
G9  Apex Pipes            top party Apex Pipes       pass
G10 SYN9/10000            hit1                       pass
T1  shankra               total=0                    SQL miss (S20 candidate)
T2  inv sr 1              hit1 INV/SR/1              already hits via normalizeVchNo
T3  apex pipe             Apex Pipes                 already hits via ILIKE substring
N1  HOLD17/1 finance      total=0                    pass
N2  OTHER/1 branch        total=0                    pass
N3  OTHER/1 steward       total=1                    pass
N4  11820 no token        401                        pass
```

Official p95 is still **135 ms**. S17 `sql_baseline_ms` is one-shot, not a p95.

---

## 8. File map

| File | Role |
|---|---|
| `PHASE_STATUS.md` | **This file.** Claude/Gemini starting point. |
| `PHASE_1_AUDIT.md` / `PHASE_1_EVIDENCE.md` / `PHASE_1_RESULTS.md` | Phase 1 spec, gates, narrative |
| `PHASE_1_UPDATES.md` | Post-audit money + drop-reject |
| `PHASE_2_AUDIT.md` / `PHASE_2_EVIDENCE.md` | Phase 2 spec and gates |
| `PHASE_3_AUDIT.md` | Phase 3 spec (thin). S18–S22 still locked. |
| `S17_BRIEF.md` / `S17_EVIDENCE.md` | S17 closed (gold + SQL baseline) |
| `S18_BRIEF.md` / `S18_EVIDENCE.md` | S18 closed (indexer only) |
| `S19_BRIEF.md` | S19 work order (OS ids + SQL; IN-list human-fixed) |
| `S20_BRIEF.md` | **Current work order** (`company_name` fuzz / T1) |
| `S3_BRIEF.md`–`S16_BRIEF.md` + `S*_EVIDENCE.md` | Closed work orders |
| `fixtures/daybook/EXPECTED.md` | Day Book contract |
| `fixtures/sales-register/EXPECTED.md` | Sales Register contract |
| `fixtures/search/GOLD.md` | Frozen search gold / typo / visibility set |

---

## 9. Official numbers (one page)

| Item | Value |
|---|---|
| Phase 1 | COMPLETE |
| Phase 2 | COMPLETE |
| Phase 3 | S17–S21 done; S22 evidence filled; COMPLETE stamp pending human |
| SYN9 current vouchers | **20000** |
| Search worst p95 | **135 ms** (party), 100 calls, i3-1115G4 |
| p50 vch / party / amount | 80 / 83 / 95 ms |
| Day Book fixture | 2 vouchers, 6 lines, `1248500.00` |
| Sales fixture | 2 invoices, `1248500.00` + `59000.00` |
| Backend unit | 40 passed |
| Backend e2e | 39 passed |
| Search engine today | Postgres SQL |
| OpenSearch in `backend/src` | none |
| Mixed 10k Day Book stress | parse 0 rejects; ingest 72 s; search worst p95 **122 ms** (`STRESS_DAYBOOK.md`) |
