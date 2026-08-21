# S7 WORK ORDER — AUDIT COMPLETENESS ONLY

You are implementing **S7 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §4.16, `audit_event` comment in §5.1, §12 gate 19, and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S6 are done and independently verified.** Do not rewrite parser, validator, upsert, search ranking, or publish rules.  
**S8–S10 are forbidden.** No frontend. No OpenSearch. No audit-viewer UI. No 20k load. No new HTTP routes except what this file names (it names **none**).

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S7 complete in chat. Fill `S7_EVIDENCE.md`. Empty cell = not done.
2. Do not edit `fixtures/daybook/EXPECTED.md` or committed daybook fixtures (tmp copies only).
3. Do not edit parser/detector/validator rules. `_headerSide` stays gone.
4. Do not add GraphQL, Kafka, Prisma, OpenSearch, AG Grid, or a new app.
5. Do not commit `.env`. Do not put passwords in source or in `audit_event.meta`.
6. Do not use `synchronize: true`. Do not add a migration. `audit_event` already exists.
7. Do not `TRUNCATE` financial tables. Isolate uploads with the existing unique-izer.
8. Do not invent audit actions (`batch_view`, `as_of`, `download`). Allowed set is §2 only.
9. Do not add `GET /api/audit`. Steward reads audit in S7 **via SQL in e2e**, not a new API.
10. Failure to insert an audit row **fails the request**. Do not `try/catch` around `auditService.log` and continue.
11. `npx tsc --noEmit -p tsconfig.build.json` exit 0. Existing `npm test` (25) stay green. Existing e2e stay green.
12. No `console.log` on the request path. No catch-all 400 wrapper.

---

## 1. WHAT S7 IS

S6 already writes some audit rows. They are incomplete: `entity_type` / `entity_id` are often missing or stuffed into `meta`; publish/hold/upload audit **after** commit so a failed audit leaves the fact written; `voucher_open` puts identity only in `meta`.

S7 makes audit **load-bearing**:

```
every required action  →  one audit_event row
entity_type / entity_id on the columns (not only meta)
mutating facts + audit in the SAME DB transaction
unknown action → throw
password never stored
```

There is **no new user-facing feature**.

---

## 2. ALLOWED ACTIONS (exact)

`AuditService.log` must accept **only** these `action` values. Anything else throws `Error('UNKNOWN_AUDIT_ACTION')` before insert.

| action | When | user_id | entity_type | entity_id | meta (no password) |
|---|---|---|---|---|---|
| `login` | password ok, **before** token is returned | user id | `app_user` | user id | `{ email }` |
| `login_failed` | unknown user, inactive, or bad password | user id if known, else null | `app_user` | user id if known, else null | `{ email, reason }` reason ∈ `not_found` \| `inactive` \| `invalid_password` |
| `logout` | `POST /api/auth/logout` | user id | `app_user` | user id | `{}` |
| `upload` | new or duplicate SHA | user id | `ingest_batch` | batch id | `{ sha256, duplicate }` |
| `publish` | held → published | user id | `ingest_batch` | batch id | `{}` |
| `unpublish` | published → held | user id | `ingest_batch` | batch id | `{}` |
| `search` | `POST /api/search` after the query | user id | null | null | `{ q, total }` |
| `voucher_open` | `GET /api/vouchers/:id` 200 | user id | `voucher` | voucher id | `{}` |

Do **not** audit: health, me, GET batch, GET rejects, GET as-of, 401/403/404 that never opened a voucher.

---

## 3. FILES YOU MAY TOUCH

```
backend/src/audit/audit.service.ts
backend/src/audit/audit.service.spec.ts
backend/src/auth/auth.service.ts          # entity columns only; do not change JWT
backend/src/ingest/ingest.service.ts      # entity columns + audit inside existing txns
backend/src/search/search.service.ts      # entity columns
backend/src/vouchers/vouchers.service.ts  # entity columns
backend/test/audit.e2e-spec.ts            # new
backend/test/auth.e2e-spec.ts             # only if login_failed assert must see entity_type
S7_EVIDENCE.md
```

**Do not edit:** parser, detector, validator, fixtures, `EXPECTED.md`, `frontend/`, `docker-compose.yml`, migrations, seed, search ranking, upload detect/parse rules.

You may **read** existing e2e. Do not weaken S5 `held` or S6 search asserts.

---

## 4. `AuditService.log` CONTRACT

```ts
export const AUDIT_ACTIONS = [
  'login', 'login_failed', 'logout',
  'upload', 'publish', 'unpublish',
  'search', 'voucher_open',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
```

- If `action` is not in that list → throw, no insert.
- If `meta` contains key `password` or `accessToken` (any case) → throw, no insert.
- Persist `entityType` / `entityId` on the **columns**.
- `save` errors propagate. No swallow.

Unit tests in `audit.service.spec.ts` (not `should be defined`):

| Test name | Assert |
|---|---|
| `rejects unknown action` | `log({ action: 'explode' })` throws `/UNKNOWN_AUDIT_ACTION/` |
| `rejects password in meta` | `log({ action: 'login', meta: { password: 'x' } })` throws |

Use a mocked repo or Nest testing module. Do not hit Postgres in the unit spec if you can avoid it.

---

## 5. SAME TRANSACTION (mutating facts)

These three must write the fact row and the audit row in **one** transaction. If audit insert fails, the fact change rolls back.

| Method | Already has a txn? | What to do |
|---|---|---|
| `processUpload` new file | yes (`queryRunner`) | Call `auditService.log` **via `queryRunner.manager`** (or insert `audit_event` in that manager) **before** commit. Remove the post-commit `finishUpload` audit **or** make `finishUpload` a no-op for audit. |
| `processUpload` duplicate | no fact write | Audit after the lookup is fine (no fact to roll back). |
| `publishBatch` | currently save then audit | Wrap `save` + audit in one `queryRunner` transaction. |
| `holdBatch` | same | Same. |

Search and voucher_open: no fact write. Call `log` **before** returning the body. If log throws, the client gets 500 and no successful body.

Login: `log` **before** `jwtService.sign`. If log throws, no token.

Login_failed: `log` then throw 401. If log throws, 500 is correct (do not return 401 without an audit row).

Do not change detect/parse/upsert logic while moving the upload audit inside the txn.

---

## 6. CALL-SITE FIXES (required)

Update existing `auditService.log(...)` calls so they match the table in §2.

Today (wrong):

- `voucher_open` puts `entityType` / `entityId` only in `meta`
- `publish` / `unpublish` / `upload` omit `entityType` / `entityId`
- `login` / `logout` omit `entity_type='app_user'`

After S7, this SQL must work in e2e:

```sql
SELECT action, entity_type, entity_id, meta
FROM audit_event
WHERE action IN (
  'login','login_failed','logout','upload',
  'publish','unpublish','search','voucher_open'
)
ORDER BY id;
```

`login_failed.meta` must **not** contain the password the client sent.

---

## 7. TESTS YOU MUST WRITE AND PASS

### `backend/src/audit/audit.service.spec.ts`

See §4.

### `backend/test/audit.e2e-spec.ts`

Real DB. Same env passwords as other e2e (`throw` if missing). Unique-izer for the upload. **No TRUNCATE.**

One ordered path (do not split so far that you lose the trail):

1. `POST /api/auth/login` steward good → 200  
2. `POST /api/auth/login` steward bad password → 401  
3. Steward upload unique sample → 202 `held`  
4. Steward `POST /api/batches/:id/publish` → 200  
5. Finance `POST /api/search` `{ q: uniq }` → 200, `total >= 1`  
6. Finance `GET /api/vouchers/:salesId` → 200  
7. Steward `POST /api/batches/:id/hold` → 200  
8. Steward `POST /api/auth/logout` → 200  

Then **one** SQL query (or one per action) and assert:

| action | extra |
|---|---|
| `login` | `entity_type='app_user'`, `user_id` = steward id |
| `login_failed` | latest row `reason` in meta is `invalid_password`; `meta` has no `password` key |
| `upload` | `entity_type='ingest_batch'`, `entity_id` = that `batchId`, `meta.duplicate === false` |
| `publish` | `entity_type='ingest_batch'`, `entity_id` = that `batchId` |
| `search` | `meta.q` equals `uniq` (or contains it), `meta.total` ≥ 1 |
| `voucher_open` | `entity_type='voucher'`, `entity_id` = `String(salesId)` |
| `unpublish` | `entity_type='ingest_batch'`, `entity_id` = that `batchId` |
| `logout` | `entity_type='app_user'` |

Test name (exact): `full path writes login upload publish search voucher_open unpublish logout and login_failed`

Existing e2e must stay green (`npm run test:e2e`).

---

## 8. IMPLEMENTATION ORDER

1. Whitelist + password-meta guard in `AuditService` + unit spec.  
2. Fix auth / search / voucher call sites (columns).  
3. Move upload / publish / hold audit inside their transactions.  
4. Write `audit.e2e-spec.ts`.  
5. Fill `S7_EVIDENCE.md`. Stop.

Do not open S8 files.

---

## 9. BANNED SENTENCES

- “S7 complete, I added an audit log page”
- “I skipped entity_id because meta already has batchId”
- “Audit failed but publish succeeded, that’s fine”
- “Ready for S8” without `S7_STATUS=COMPLETE` in `S7_EVIDENCE.md`

Reply with files changed, `npm test` summary, `npm run test:e2e` summary, and the evidence table. Then **stop**.
