# Post–Phase 3 backend fixes

Phase 1 stored an `OUT_OF_BALANCE` warning on `ingest_batch.error_summary` and still allowed publish (`PHASE_1_AUDIT.md`, `S5_BRIEF.md`, `S8_BRIEF.md`). That was wrong for a read-only book-of-record ingest: an unbalanced batch must not become searchable.

## Publish gate

`POST /api/batches/:id/publish`:

1. Missing batch → `404`
2. Status is `published` or `rejected` → `409` `{ message: "NOT_HELD" }`
3. `errorSummary` starts with `OUT_OF_BALANCE` → `409` `{ message: "OUT_OF_BALANCE" }`. Batch stays `held`. No force-publish.
4. Otherwise publish as before (index best-effort).

The frontend disables Publish when `errorSummary` starts with `OUT_OF_BALANCE`. This 409 is the server backstop if that UI is bypassed.

## Other additive fields (no schema change)

- `POST /api/auth/login` and `GET /api/auth/me` include `displayName` (already on `app_user.display_name`) plus `branchId` on login so the login payload matches `/me`.
- `GET /api/meta/vch-types` → `{ items: string[] }` distinct published current `vch_type` values (branch-scoped like search).
- `GET /api/meta/companies` → `{ items: string[] }` distinct `ingest_batch.company_id` (branch sees only their company). Used as a steward upload datalist; company id is still a typed field. **No `companyId` search param.**
