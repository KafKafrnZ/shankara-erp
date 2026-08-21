# Access & Ops Layer — Work Order (strict, phased)

**Read this entire document before writing code.** Same rules as `ITEM_MASTER_FIX_AND_UI_BRIEF.md` and its follow-up, which you've worked from before: **"it compiles" and "the build passes" are not evidence anything works.** Every phase below has a Verification block. That block — with real, pasted command output — is what makes a phase done, not a description of what you intended.

**Context:** this repo now has a `docker-compose.yml` (data tier only), `ops/` (backup/restore/Caddy — foundations already done), and a full audit history you can read in `PHASE_STATUS.md` and the earlier `ITEM_MASTER_*` docs. This brief covers 4 of the remaining gaps from that audit: user management, rate limiting, one pagination fix, and a logging pass. Three related gaps (JWT refresh, real error-tracking-vendor integration, the voucher search seq-scan question) are **explicitly out of scope here** — see §5.

---

## 0. Non-negotiable working rules

1. **Real command output, every phase, no exceptions.** If you cannot run something live (no DB available, etc.), say so plainly — that's an acceptable answer, a fabricated "it passed" is not. This has happened before on this project; it will be checked again.
2. **Copy existing patterns exactly, don't invent parallel ones.** Every item below names the exact file to copy from. If you're about to write something that doesn't resemble its named analog, stop and re-read the analog.
3. **Before you add any new audit action string, add it to `AUDIT_ACTIONS` in `backend/src/audit/audit.service.ts`.** This exact mistake already shipped once on this project — every item-master upload threw a 500 in production because the action whitelist was never updated. Check this list is complete before you consider any phase involving `auditService.log(...)` done.
4. **Report format:** for each phase, the file(s) touched, the actual command run, its actual output, and — if you made a judgment call this brief left ambiguous — what you chose and why.

---

## PHASE 0 — User management (steward-only admin)

### Current state (verified by reading the code, not guessing)

`AppUser` (`backend/src/users/app-user.entity.ts`) already has everything needed at the data-model level: `email`, `passwordHash`, `displayName`, `role`, `companyId`, `branchId`, `isActive`. `AuthService.login()` (`backend/src/auth/auth.service.ts`) **already checks `isActive`** — `if (!user || !user.isActive) throw UnauthorizedException`. So deactivating a user already works correctly the moment `isActive` is `false`; what's missing is **any way to set it**, or to create a user, without hand-writing SQL. `UsersModule`/`UsersService` (`backend/src/users/`) currently has no controller at all — only `findByEmail`/`findById`, used internally by auth.

### 0.1 New endpoints

Add `backend/src/users/users.controller.ts`. Steward-only (`@Roles('steward')`, same decorator/pattern as `backend/src/ingest/ingest.controller.ts`'s upload endpoint) on every route in this controller — no other role should reach any of it.

- **`POST /api/users`** — create a user. Body: `email`, `displayName`, `role` (`'steward'|'finance'|'branch'`), `companyId?`, `branchId?`, `password`. Hash with `bcrypt` at the same cost factor `auth.service.ts` already uses for comparison (check what `seed.ts` uses to hash — match it exactly, don't invent a different round count). Reject a duplicate email with a clear `409`, not a raw DB constraint error leaking through.
- **`GET /api/users`** — list all users for an admin table. Return `id, email, displayName, role, companyId, branchId, isActive, createdAt` — never return `passwordHash`.
- **`PATCH /api/users/:id`** — update `displayName`, `role`, `companyId`, `branchId`, `isActive`. This is also how deactivation happens (`{ isActive: false }`).
- **`POST /api/users/:id/reset-password`** — body: `newPassword`. Steward sets it directly. There is no email-sending infrastructure in this project and this brief does not add one — this matches the existing "No self-serve signup — contact your steward for access" copy already on the login page (`frontend/src/pages/LoginPage.tsx`). Don't build a token-based email reset flow; that's a different, larger feature this brief isn't asking for.

**Required guard — do not skip this:** a steward must not be able to deactivate the last active steward account (including, trivially, themselves, if they're the only one). Query the count of `role='steward' AND is_active=true` before applying a deactivation or role-change that would drop it to zero, and reject with a clear error if so. Locking every steward out of the system is the one mistake here that has no recovery path short of a direct DB edit.

**New DTOs**, `backend/src/users/dto/`, mirroring the exact `class-validator` shape used in `backend/src/search/dto/search.dto.ts` and `backend/src/item-master/dto/item-search.dto.ts` — `@IsEmail`, `@IsString`, `@IsIn(['steward','finance','branch'])` for role, `@IsOptional()` where appropriate, `@MinLength` on password (pick something reasonable, e.g. 8, and say so in your report).

**Audit:** every create/update/deactivate/password-reset call must go through `AuditService.log()`. Add `'user_create'`, `'user_update'`, `'user_password_reset'` to `AUDIT_ACTIONS` in `audit.service.ts` **before** wiring these up (see §0 rule 3). Never put a plaintext password anywhere in `meta` — `AuditService.log()` already throws on `password`/`accessToken` keys in `meta`, confirm your calls don't try to smuggle one in some other key name.

**Module wiring:** register the new controller and any new DTOs in `backend/src/users/users.module.ts`. Confirm `UsersModule` is already imported in `app.module.ts` (it is) — no change needed there unless you add new module-level dependencies.

### 0.2 Frontend

New page, steward-only, mirroring the existing steward-only-route pattern (`/upload`, `/catalog/upload` — see `frontend/src/App.tsx` and the `user.role === 'steward'` conditional in `frontend/src/components/AppShell.tsx`'s nav).

- Route `/admin/users`, nav item `"Users"` in `AppShell.tsx`, steward-only, same conditional pattern as the existing steward-only links.
- `frontend/src/pages/UsersPage.tsx`: a table (reuse `.results-table` CSS classes, same as `CatalogPage.tsx`/`SearchPage.tsx`) listing users with role/company/branch/active-status (use a `.pill` — `pill-success` for active, `pill-critical` for inactive, matching the existing pill vocabulary), a "New user" form/modal, and per-row actions for edit / deactivate-reactivate / reset password.
- Apply the interactive-states pass from the earlier UI brief (hover/active/focus/transition) to every new control here — don't ship this one plain and let it be the one screen that didn't get it.

### Verification

- Live-test against a real DB (same pattern as prior audits — `docker start shankara-postgres shankara-pgbouncer`, or point at plain Postgres on 5432 if pgbouncer auth is stale, as documented in this project's own prior sessions): create a user, log in as them, deactivate them, confirm login now fails, reactivate, confirm it works again, reset their password, confirm the old password no longer works and the new one does.
- Confirm the last-steward guard actually rejects: try to deactivate every steward down to zero and confirm it's blocked with a clear error, not a silent success.
- `GET /api/users` and `POST/PATCH /api/users*` all return `403` for a `finance`/`branch` token — actually test this, don't assume the decorator works.
- Add e2e coverage in a new `backend/test/users.e2e-spec.ts`, following the exact structure of `backend/test/item-master.e2e-spec.ts` (including `app.setGlobalPrefix('api')` — **that exact line was missing once already on this project and broke every request in the file silently as 404s. Do not repeat it.**). Minimum cases: steward creates a user and can log in as them; non-steward gets 403 on every route; deactivation blocks login; last-steward guard rejects; password reset actually changes the password.
- Paste real `npm run test:e2e` output.

---

## PHASE 1 — Rate limiting beyond login

### Current state (verified)

`ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60000, limit: 10 }] })` is already registered in `app.module.ts` — but `ThrottlerGuard` is **not** in the global `providers: [{ provide: APP_GUARD, ... }]` list there (only `JwtAuthGuard` and `RolesGuard` are). It only currently applies to the one route that explicitly opts in with `@UseGuards(ThrottlerGuard)` — the login endpoint in `auth.controller.ts`. Every other endpoint is completely unthrottled.

### 1.1 Required fix

Add a third global guard entry to `app.module.ts`'s `providers` array: `{ provide: APP_GUARD, useClass: ThrottlerGuard }`. This makes the existing `ThrottlerModule.forRoot` default (10 req/60s) apply to **every** route unless overridden.

10/min is almost certainly too tight as a blanket default for normal app usage (a steward paging through search results, a finance user refining filters). Raise the **default** throttler's `limit` to something workable for real usage — 100 requests per 60 seconds is a reasonable starting point for a small back-office user base — while leaving the login endpoint's existing explicit `@Throttle({ default: { limit: 10, ttl: 60000 } })` override in place untouched (route-level `@Throttle()` overrides the global default, so login keeps its tighter limit regardless of what the global default becomes).

Add an explicit, tighter `@Throttle()` override on the two upload endpoints specifically (`POST /api/uploads` in `ingest.controller.ts`, `POST /api/item-uploads` in `item-master.controller.ts`) — these trigger real parsing/background work per request, so they deserve a stricter limit than a read endpoint. Pick something reasonable (e.g. 20/min) and say what you chose.

### 1.2 The real risk here: don't silently break the existing test suite

Turning on a **global** guard is a much bigger behavior change than the login-only throttle ever was — several existing e2e spec files fire many requests in quick succession within one test run (`search.e2e-spec.ts`, `ingest.e2e-spec.ts`, the item-master suite). If the chosen limit is too tight, tests will start failing with `429`, not because anything is broken, but because the limit is wrong for legitimate burst usage (including a real steward uploading several files back to back, or the frontend's own polling loop in `CatalogUploadPage.tsx` hitting `GET /api/item-batches/:id` every 2 seconds).

**Required verification, not optional:** run the **full** `npm run test:e2e` (all suites, not filtered to one file) against a real live DB after this change and confirm **all** existing tests still pass. If anything now fails with a `429` that isn't actually testing rate-limiting itself, that's a signal the chosen limit is wrong — fix the limit, don't work around it by disabling the guard for tests (a limit that doesn't actually apply under test conditions proves nothing about whether it's sane in production).

### Verification

- Paste the full `npm run test:e2e` output post-change — all suites, all green.
- Manually confirm the throttle actually engages somewhere: hit an endpoint rapidly past its limit and confirm a real `429`, not just read the code and assume it works.

---

## PHASE 2 — Item-master skip list pagination

### Current state (verified)

`ItemMasterService.getSkips()` (`backend/src/item-master/item-master.service.ts`) hard-caps at `take: 1000` with a code comment acknowledging it: `// In a real app we'd paginate this`. A real uploaded file in this project's own testing produced ~19,700 skipped rows — a steward reviewing that batch currently only ever sees the first 1,000.

### Required fix

Mirror `IngestService.getBatchRejects()` in `backend/src/ingest/ingest.service.ts` **exactly** — same `page`/`pageSize` query params, same `skip`/`take` pattern via `findAndCount`, same `{ items, total }` response shape:

```ts
async getBatchRejects(id: number, page: number, pageSize: number) {
  const [items, total] = await this.ingestRejectRepo.findAndCount({
    where: { batchId: String(id) },
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: { sourceRowNo: 'ASC' }
  });
  return { items: items.map(...), total };
}
```

Update `ItemBatchesController.getSkips()` (`backend/src/item-master/item-master.controller.ts`) to accept the same `?page=1&pageSize=50` query params `IngestController`'s reject endpoint already does.

**Frontend:** `CatalogUploadPage.tsx` currently calls `GET /api/item-batches/:id/skips` with no pagination params and expects `{ data, total }` — note the field is currently named `data`, while the voucher pattern you're mirroring uses `items`. **Pick one name and make backend and frontend agree** — recommend renaming the item-master response to `items` for consistency with the voucher pattern, and updating `CatalogUploadPage.tsx`'s `res.data` reference and its TS interface to match. Add pagination controls to the skip-list table (reuse whatever pagination UI pattern `SearchPage.tsx`/`CatalogPage.tsx` already use — don't invent a new one).

### Verification

- Upload a fixture that produces >50 skips (or lower the page size for the test), confirm the second page returns different rows than the first, confirm `total` matches the real total skip count, confirm the UI's pagination controls actually work end to end.
- Add a unit or e2e test asserting page 2 doesn't return page 1's rows.

---

## PHASE 3 — Consistent structured logging

### Current state

There is no logging library, no structured/leveled logging, and no error tracking anywhere in this project. Failures are visible only via scattered raw `console.error`/`console.log` calls (e.g. throughout `ingest.service.ts`, `item-master.service.ts`, the OpenSearch adapters) or by someone manually querying the `audit_event` table.

### Scope — deliberately modest, read this before reaching for a new dependency

This phase is **not** "integrate Sentry" or any other external error-tracking vendor — that needs an actual account and a decision from Dante about which vendor, and isn't something to invent unilaterally. This phase is: **replace ad-hoc `console.*` calls with NestJS's already-built-in `Logger`**, which costs zero new dependencies and gives every log line a consistent level (`log`/`warn`/`error`/`debug`), a timestamp, and a context tag (which service/module it came from) — the actual prerequisite for plugging in any real log aggregation or error-tracking tool later, whichever one gets chosen.

- Grep the codebase for `console.log`/`console.error`/`console.warn` in `backend/src/` (excluding `test/` and any `_verify`-style scratch files, which shouldn't exist in the tree anyway — if you find any, that's leftover cruft from a previous session, flag it, don't add more) and replace each with an injected `Logger` instance (`private readonly logger = new Logger(ClassName.name);` at the top of the class, `this.logger.error(...)`/`.warn(...)`/`.log(...)` in place of the console call) — matching the exact pattern NestJS's own docs and CLI-generated code use.
- Leave a one-paragraph note in your report on where a real error-tracking SDK's hook would go once one is chosen (e.g., NestJS's global exception filter is the natural place to forward unhandled exceptions to an external service) — don't build the filter itself unless you're also told which vendor to target.

### Verification

- `grep -rn "console\.\(log\|error\|warn\)" backend/src` should return nothing (or only genuinely justified exceptions you explicitly call out and explain).
- `npm run build` and the full unit + e2e suite still pass — this is a mechanical refactor, it should not change behavior; if it does, that's a sign something was replaced incorrectly.

---

## 5. Explicitly out of scope for this brief

- **JWT refresh tokens.** Current 8h expiry with daily re-login is workable, not broken. A real refresh-token flow (rotation, revocation, storage strategy) is a security-sensitive design decision that deserves its own dedicated brief, not something to bundle in here.
- **A real error-tracking vendor integration** (Sentry or otherwise) — needs a vendor decision and an account from Dante first. Phase 3 above prepares the ground for it; it doesn't pick or wire one.
- **The voucher search sequence-scan question** (documented in `PHASE_STATUS.md`) — this needs `EXPLAIN ANALYZE` against realistic data volume before proposing a fix, not a guess. If you have spare time after Phases 0–3 are fully verified, you may investigate and report findings (what the planner actually does, whether a targeted index or query restructure clearly helps), but do **not** ship a speculative index/query change without that evidence — the project's own docs already note this seq-scan still meets its performance bar today, so an unproven "fix" is pure risk for no confirmed gain.

## Report format

Same as every prior brief on this project: for each phase, the actual commands run and their actual output, every file touched, and any judgment call you made stated plainly rather than left silent.
