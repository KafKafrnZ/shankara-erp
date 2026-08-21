# Shankara Buildpro — current status

**Read this first.** Repo: https://github.com/KafKafrnZ/shankara-erp  
**Host of record (benchmarks):** Windows, 11th Gen Intel Core i3-1115G4 @ 3.00 GHz

| Phase | Status | Evidence |
|---|---|---|
| **1** Day Book ingest / search / retrieve | **COMPLETE** | `PHASE_1_EVIDENCE.md` |
| **2** Sales Register on the same path | **COMPLETE** | `PHASE_2_EVIDENCE.md` |
| **3** Search-engine quality (thin) | **COMPLETE** | `PHASE_3_EVIDENCE.md` |
| **UI** Search-first desktop app | **COMPLETE** | `FRONTEND_BUILD_SPEC.md` (human accepted 2026-08-21) |

Do not reopen S0–S22. Do not restore `parseFloat` on money. Do not `TRUNCATE voucher`. Do not drop SYN9. Do not invent a new p95. Official search p95 remains **135 ms**.

Tally is the **book of record**. This system is a read-only ingest / search / retrieve layer. No Create Voucher. If Tally and this system disagree, Tally wins.

---

## Run locally

```
docker compose up -d
cd backend && npm run start:dev          # :3000
cd frontend && npm run dev               # :5173, proxies /api → :3000
```

Open http://127.0.0.1:5173/login  
Seed emails: `steward@shankara.local` / `finance@shankara.local` / `branch@shankara.local`  
Passwords: `SEED_*_PASSWORD` in `backend/.env` (never commit `.env`). Click path: `frontend/MANUAL.md`.

---

## Architecture

```
Steward / finance / branch browser (Vite :5173)
    │  JWT in sessionStorage sb.accessToken
    │  proxy /api → 127.0.0.1:3000
    ▼
NestJS 11
    ├─ POST /api/auth/login          public; 10/min throttle
    ├─ POST /api/uploads             steward; SHA-256 store; detect → parse → validate → upsert
    ├─ POST /api/batches/:id/publish  409 OUT_OF_BALANCE if errorSummary starts that way
    ├─ POST /api/batches/:id/hold
    ├─ POST /api/search              OS candidate ids ∩ SQL-visible set; SQL fallback if OS down
    ├─ GET  /api/vouchers/:id        Postgres only (lines + source.sha256)
    └─ GET  /api/meta/as-of|vch-types|companies
    │
    ├─ PostgreSQL 16 via PgBouncer :6432  (TypeORM synchronize:false)
    ├─ Local FS object store {aa}/{bb}/{sha256}
    └─ OpenSearch 2.11  projection of published current vouchers (not SoT)
```

**Roles:** steward (global), finance (search/retrieve), branch (`company_id` in SQL `WHERE`). Held / unpublished batches are invisible to finance and branch.

**Money:** integer paise. Display as `₹` + Indian grouping in the UI. No IEEE-754 math for publish decisions.

**Detect:** Day Book wins over Sales Register if both title strings appear; else unrecognized.

**Publish gate:** `errorSummary` starting `OUT_OF_BALANCE` → UI disables Publish **and** API returns `409`. No force-publish. See `POST_PHASE_3_FIXES.md`.

---

## Official numbers (do not replace)

| Item | Value |
|---|---|
| SYN9 current vouchers | **20000** |
| Search worst p95 | **135 ms** (party), 100 calls, i3-1115G4 |
| p50 vch / party / amount | 80 / 83 / 95 ms |
| Day Book fixture | 2 vouchers, 6 lines, `1248500.00` |
| Sales fixture | 2 invoices, `1248500.00` + `59000.00` |
| Mixed 10k Day Book stress | parse 0 rejects; search p95 122 ms — does **not** replace 135 ms |

---

## Still open (not Phase 1–3)

1. **No real Tally export** from a live Shankara company has been parsed. Fixtures are hand-built / synthetic.
2. E2e clones inflate some search hit totals. Do **not** `TRUNCATE`.
3. Fresh-clone CI (`down -v` + migrate + seed + tests) is not automated. Do not `down -v` on this volume (drops SYN9).
4. Concurrent search load (20–50 users) has not been run. Do not claim “5,000 concurrent.”
5. Backup: `pg_dump` + copy `backend/var/uploads/{aa}/{bb}/{sha256}`. No off-host replica.

**Later than this program:** Purchase Register, mapping UI, GST/IRN, user-management UI, mobile layout.

---

## Binding files

| File | Role |
|---|---|
| `PHASE_STATUS.md` | This file. Start here. |
| `PHASE_1_AUDIT.md` / `PHASE_1_EVIDENCE.md` | Phase 1 spec and gates |
| `PHASE_2_AUDIT.md` / `PHASE_2_EVIDENCE.md` | Phase 2 spec and gates |
| `PHASE_3_AUDIT.md` / `PHASE_3_EVIDENCE.md` | Phase 3 spec and gates |
| `FRONTEND_BUILD_SPEC.md` | UI contract (implemented) |
| `POST_PHASE_3_FIXES.md` | Out-of-balance publish 409 |
| `fixtures/daybook/EXPECTED.md` | Day Book numbers |
| `fixtures/sales-register/EXPECTED.md` | Sales Register numbers |
| `fixtures/search/GOLD.md` | Frozen search gold / typo / visibility set |
| `docs/history/S3_BRIEF.md`–`S22_EVIDENCE.md` | Historical work orders. Closed. Archived 2026-08-21. |
