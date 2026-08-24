# Shankara ERP — system reference

**What this is right now**, in detail. If something here and the code
disagree, the code wins — file an update to this doc, don't trust this over
a fresh read of the source.

This document replaced a pile of superseded phase/brief docs (accounting
day-book work orders for a module that's since been removed entirely — see
git history if you need that record). It covers the system as it exists
today: an item-catalog search, filter, and CRUD tool. Nothing here describes
vouchers, day books, or Tally transaction ingest — that subsystem was fully
retired.

---

## 1. What the system does

Shankara Buildpro's stewards export their item master (SKU catalog — codes,
names, brands, groups, UOM, tax fields, whatever else Tally's export
carries) from Tally as an `.xlsx` file and upload it here. Once published,
that file's rows are searchable, filterable by any column the file actually
has, exportable to a real paste-ready Excel format, and individually
editable without needing a whole new file upload for one correction.

Tally itself remains the source of truth for the underlying business data —
this system doesn't write anything back to Tally, and there's no accounting
ledger, no vouchers, no GST filing. It's a catalog search-and-maintain tool,
not a general ERP.

Three roles:
- **steward** — uploads files, publishes/holds batches, adds/edits/deletes
  individual catalog rows, manages other users. The "office admin."
- **finance** / **branch** — search and view the published catalog only.
  Read-only. (`branch` and `companyId`/`branchId` scoping exist on the user
  model as a carry-over from the old voucher system's company-scoped
  access — the catalog itself is *not* company-scoped, so these fields
  currently have no effect on what a finance/branch user can search.)

---

## 2. Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  React/Vite  │◄────►│  NestJS backend  │◄────►│  PostgreSQL  │
│  (frontend)  │ /api │   (backend)      │ 6432 │  via pgbouncer│
└─────────────┘      └──────────────────┘      └──────┬──────┘
                             │                         │ 5432 (direct,
                             │                         │ for pg-boss)
                             ▼                         │
                      local disk / S3-shaped    ┌──────▼──────┐
                      object store (uploaded      │  Postgres    │
                      .xlsx files)                │  (same DB)   │
```

- **Backend**: NestJS 11, TypeScript, TypeORM (`synchronize: false` — all
  schema changes go through migrations in
  `backend/src/database/migrations/`). Runs as a single Node process.
- **Frontend**: React 19 + Vite + TypeScript, no component library —
  everything under `frontend/src/components/` is hand-built. Talks to the
  backend only via `fetch` (see `frontend/src/lib/api.ts`), no server-side
  rendering.
- **Database**: PostgreSQL 16. The app connects through **pgbouncer on
  :6432** (transaction pooling). One thing does **not** go through
  pgbouncer: **pg-boss** (the background-job queue that parses uploaded
  files) needs `LISTEN`/`NOTIFY`, which transaction pooling breaks — it
  connects to Postgres directly on **:5432** via `JOBS_DATABASE_PORT`.
- **Object storage**: `backend/src/storage/` defines an `ObjectStore`
  interface; `LocalFsObjectStore` is the only implementation, writing to
  `backend/var/uploads/<sha256 prefix>/<sha256>`. Content-addressed by the
  uploaded file's own hash, which is also how duplicate-upload detection
  works.
- **Docker Compose** (`docker-compose.yml`, repo root) runs the data tier
  only — Postgres, pgbouncer, redis. The backend and frontend run as host
  processes (`npm run start:dev` / `npm run dev`), not in containers.
  **Redis is provisioned but not actually used anywhere in the backend
  code right now** — it's there for future use (e.g. a shared cache across
  multiple backend instances), not wired into anything today.
- **TLS/reverse proxy**: Caddy, config at `ops/Caddyfile`, for an on-prem
  LAN deployment with no public domain (internal CA, one-time cert trust
  per office device). See `ops/README.md`.

---

## 3. Data model

Five real tables today (confirmed via `\dt` against the live database):

| Table | Purpose |
|---|---|
| `app_user` | Login accounts — email, password hash, role, active flag, token version (bumping it invalidates all that user's existing JWTs) |
| `source_file` | One row per unique uploaded file (by SHA-256), pointing at the object store key. Shared concept — not upload-type-specific |
| `item_master_batch` | One row per upload *or* per manual add/edit/delete (see §6). Tracks status, row counts, publish state |
| `item_master_row` | The actual catalog data — see below |
| `item_master_skip` | Rows/sheets a given batch's parse rejected, with a reason code and the raw source row for review |
| `audit_event` | Append-only log — see §8 |

### `item_master_row` — the versioning model

Every catalog item is a **chain of rows sharing an `item_code`**, not a row
that gets updated in place:

- `valid_from` / `valid_to` — `valid_to IS NULL` means "this is the current
  version." Publishing a new version of an existing `item_code` sets the
  *previous* live row's `valid_to` to now and inserts a new row with
  `valid_to = NULL`.
- `is_deleted` — a soft delete is just another version: a new row for that
  `item_code` with `is_deleted = true`, `valid_to = NULL`. It still shows
  in that item's version history (`GET /api/item-search/history/:itemCode`
  does **not** filter on `is_deleted` — deliberately, so "who removed this
  and when" stays visible); it just stops being returned by search.
- `extra` (jsonb) — **every column the uploaded file has that isn't one of
  the ~10 fixed fields** (see below) lands here, keyed by the column's own
  header text. This is what powers "+ Add filter" and full-field
  export/copy. A GIN index exists on this column
  (`AddExtraFieldIndex` migration).
- `fingerprint` — a SHA-256 hash of every field's value (including `extra`).
  Re-uploading a file that produces byte-identical row content for a given
  `item_code` is a no-op — the fingerprint matches, nothing new is
  inserted, no version churn from re-uploading the same data.
- `layoutKey` — which of the three parser layouts produced this row (or
  `manual_v1` for a row created through the CRUD UI, not a file).

Fixed columns every row has, regardless of source file: `itemCode`,
`itemName`, `brand`, `catalogueNo`, `sapItemCode`, `alias`, `mainGroup`,
`subGroup`, `uom`, `hsnDescription`. Which of `itemCode`/`sapItemCode`/
`alias`/`catalogueNo` is treated as *the* identifying code for display
purposes depends on which layout produced the row — see
`frontend/src/lib/item-key.ts`.

### `item_master_batch`

- `status`: `processing` (parse job running) → `held` (parsed, waiting for
  a steward to publish) → `published` (live in search), or `rejected` (parse
  failed). A published batch can be taken back to `held` ("Take off
  search").
- `is_manual` — true for a batch created by the CRUD add/edit/delete flow
  rather than a real upload. `source_file_id` is nullable specifically to
  support this (a manual batch has no uploaded file behind it).
- `file_sha256` is unique — this is how duplicate-upload detection works
  (re-uploading the identical file returns the existing batch rather than
  creating a new one). Manual batches get a random hash here since
  they have no real file to hash.

---

## 4. Catalog upload → publish pipeline

1. **Upload** (`POST /api/item-uploads`, steward only) — the file is
   hashed, stored in the object store, and a batch row is created with
   status `processing`. A `pg-boss` job (`item-master-parse`) is enqueued
   and the request returns immediately (`202`).
2. **Parse** (background job, `ItemMasterService.processBatchJob`) —
   streams the workbook via ExcelJS, tries each of 3 layout detectors in
   order (`backend/src/item-master/detect/item-layout.registry.ts`):
   `sap_item_master_v1`, `master_code_v1`, `cp_sani_others_v1`. Whichever
   one matches the header row parses every data row. Anything the matched
   layout doesn't map to a fixed field is captured into `extra`
   (`item-master.parser.ts`'s `extractExtra`). Unparseable rows go to
   `item_master_skip` with a reason code, not silently dropped. On success
   the batch moves to `held`.
3. **Publish** (`POST /api/item-batches/:id/publish`, steward only) — takes
   a Postgres advisory lock (`pg_advisory_xact_lock(hashtext('item-master-publish'))`)
   so concurrent publishes serialize instead of racing, closes out the
   previous live row for any `item_code` this batch shares with the current
   live set, and flips the batch to `published`. This is also the exact
   mechanism manual add/edit/delete reuses (§6) — a manual change *is* a
   1-row batch that gets published the same way.
4. **Hold** (`POST /api/item-batches/:id/hold`) — the reverse: take a
   published batch off search, restoring whatever was live before it for
   any item codes it was the current version of.

Real numbers from this project's own data: two live files, 174,072 +
31,792 parsed rows, ~13s and ~6s respectively to parse (measured during
this session's stress test, transpile-only ts-node, one machine).

---

## 5. Search & filters

`ItemSearchService` (`backend/src/item-master/item-search.service.ts`) is
the whole read path. `visibleRows()` is the one filter every query shares:
`valid_to IS NULL AND is_deleted = false AND batch.status = 'published'`.

- **Text search** (`q`) — `ILIKE` (escaped for literal `%`/`_`, which
  genuinely appear in tile/sanitaryware item codes) across every
  identifier-shaped fixed field at once: `itemCode`, `itemName`,
  `catalogueNo`, `brand`, `alias`, `sapItemCode`, `hsnDescription`. This
  is deliberate — different layouts use different columns as *the* primary
  code, so searching all of them means one query works regardless of
  which file an item came from.
- **Fixed filters** — `mainGroup`, `subGroup`, `brand`, exact match.
  `GET /api/item-search/facets` returns the distinct values + counts for
  all three, cached 60s.
- **Dynamic filters** — any key present in `extra`.
  `GET /api/item-search/fields` lists which extra columns actually exist
  right now (union across live rows, cached 60s). `GET
  /api/item-search/facets/extra?field=X` returns that field's distinct
  values + counts, cached 60s **per field** — this was found under-cached
  and fixed during this session's stress test (was running its query on
  every single call, 3-5x slower than everything else; now behaves like
  the other facets). Search accepts up to 5 extra filters at once
  (`extra: { [field]: value }` in the request body), each bound as a query
  parameter, never string-interpolated.
- All three caches are cleared together whenever anything publishes/holds
  (`clearFacetsCache()`), and are **per-process, in-memory** — see the
  limitations section for what that means if this ever scales past one
  backend instance.

---

## 6. Manual CRUD (add / edit / delete one item)

Steward-only, reusing the exact same batch→publish→audit pipeline uploads
use, rather than a parallel "just UPDATE the row" path:

- **Add or edit** — `POST /api/item-master/rows` (`ManualItemDto`), keyed
  by `itemCode`. Creates a 1-row batch (`is_manual: true`,
  `source_file_id: null`, status `held`), inserts the row, then
  immediately calls the same `publishBatch()` uploads use — no separate
  review step, since there's nothing to review on a single typed-in row.
  Audited as `item_manual_create` or `item_manual_update` depending on
  whether the item code already existed.
- **Delete** — `DELETE /api/item-master/rows/:itemCode`. Same mechanism,
  inserts one more version with `is_deleted: true`. 404s if the item isn't
  currently live. Audited as `item_manual_delete`.
- The frontend's `+ New item` button and the drawer's `Edit`/`Delete`
  buttons (steward-only) drive this. Deleting shows a confirm banner first
  (`ItemDrawer.tsx`); a deleted item's drawer offers "Add it back," which
  reopens the edit form pre-filled from its last known values.

---

## 7. Export, copy, and multi-select

- **Single item** — the drawer's `Copy details` (clipboard) and `Export to
  Excel` (downloads a real `.xlsx`) both act on `GET
  /api/item-search/history/:itemCode`'s current row.
- **Multiple items** — check the box on any result row; a sticky tray at
  the bottom of the screen tracks the selection (survives across searches
  on purpose — pick some, search again, pick more), with its own `Copy
  details` / `Export to Excel` / `Clear`, plus a "Show" toggle to review
  and individually remove picks before acting. These call `POST
  /api/item-search/bulk` (JSON) and `POST /api/item-search/export`
  (`.xlsx`, via `exceljs`) — both capped at 200 item codes per request.
- Both the clipboard copy and the `.xlsx` export use the same column set:
  the 10 fixed fields, plus every `extra` key present across the selected
  rows (union, alphabetical). The clipboard version is tab-separated —
  pasting it into an open Excel sheet lands as real columns, not one
  messy cell (`frontend/src/lib/excel-export.ts`).

---

## 8. Auth, roles, and audit

- **JWT** issued on `POST /api/auth/login`, stored in the frontend's
  `sessionStorage` (not a cookie). `JWT_EXPIRES_IN` defaults to `8h`,
  no refresh-token flow — after that, re-login.
- `tokenVersion` on `app_user` — bumping it (not currently exposed in any
  UI) would invalidate every existing token for that user; the JWT payload
  carries the version it was issued with and the guard checks it matches.
- **Role gating**: `@Roles('steward')` (see `roles.decorator.ts` /
  `roles.guard.ts`) on any endpoint that needs it; enforced globally via
  `APP_GUARD` alongside `JwtAuthGuard`. `@Public()` opts a route out of
  auth entirely (only `/api/health` and `/api/auth/login` use it).
- **Rate limiting**: global default **100 requests/minute per IP**
  (`ThrottlerModule` in `app.module.ts`), tighter on login (10/min) and
  item uploads (20/min). This is per-IP, not per-user — see §11 for what
  that means behind a shared office connection or a misconfigured proxy.
- **Audit log** — append-only, `audit_event` table, every action in
  `AUDIT_ACTIONS` (`backend/src/audit/audit.service.ts`):
  `login`, `login_failed`, `logout`, `item_upload`, `item_publish`,
  `item_hold`, `item_retry`, `item_manual_create`, `item_manual_update`,
  `item_manual_delete`, `item_collision_warn`, `job_status_override_warn`,
  `user_create`, `user_update`, `user_password_reset`. Logging an action
  not in this list throws — this whitelist has to be updated whenever a
  new audited action is added.
- **Security headers**: `helmet()` is applied globally. CORS origin is
  configurable (`CORS_ORIGIN`), permissive in non-production for local dev
  convenience.

---

## 9. Frontend structure

- **Routing** (`App.tsx`): `/login`, `/catalog`, `/catalog/upload`,
  `/admin/users`, all under `AppShell` except `/login`. Unauthenticated
  visitors to `/` see `ChooserPage` (the red/black split — "Find an item" /
  "Upload items," both routing through `/login?next=...`).
- **Key components** (`frontend/src/components/`):
  - `FilterBar.tsx` — the fixed three filters + dynamic "+ Add filter."
  - `ItemDrawer.tsx` / `ItemEditForm.tsx` — view/edit/create one item.
  - `SelectionTray.tsx` — the multi-select bottom bar.
  - `LiveSourcePane.tsx` — the compact "what's live right now" strip.
  - `DevPanel.tsx` — steward-only, top-right corner, backend health +
    live request log (see §10).
  - `HowToOverlay.tsx` / `lib/howto.ts` — the first-run onboarding
    carousel, 7 cards, steward-only ones filtered by role.
- **Design tokens** (`styles/tokens.css`): brand red `#e30613`, ink
  `#141414`, a warm off-white background (`#f9f5f5`, deliberately not
  neutral grey), semantic colors for success/warning/critical distinct
  from the brand accent so status pills don't blend into brand chrome.
  `DotField.tsx` draws the ambient red-dot texture (canvas, mouse-reactive,
  respects `prefers-reduced-motion`).
- **Accessibility/readability intent**: 16px+ body text, high contrast,
  icon+word pairing on every nav link, plain-language copy throughout —
  built for non-technical, often older, users who learn by imitation
  rather than reading documentation. This shaped a lot of specific
  decisions (fixed filters never move, confirm-before-publish/delete
  banners instead of native `confirm()`, etc.) — see git history around
  the "non-tech friendly" commits if you need the reasoning behind a
  specific choice here.

---

## 10. Dev Panel

Steward-only, `frontend/src/components/DevPanel.tsx` + `lib/devlog.ts`.
Collapsed to a small "Dev" pill (top-right, below the header) with a status
dot; expands into a dark, monospace panel showing:

- Backend health (polled every 20s: `/api/health`, response time, DB
  status), and
- A live, in-memory, last-50-requests log (method, path, status, timing) —
  every call through `lib/api.ts`'s `api()` helper pushes an entry.

Entirely client-side and per-browser-tab — nothing here is sent anywhere
or persisted. It's a debugging convenience for whoever's driving the
browser, not a monitoring system (see §11 for the real gap that leaves).

---

## 11. Known limitations — what's not production-ready yet

Carried over from a full audit + live stress test done this session
(10 → 800 concurrent requests, zero errors at any level — the system
degrades by queueing, not by crashing; throughput ceiling ~85-95 req/s on
the machine this was tested on, which also runs everything else at once).

**Security**
- JWT in `sessionStorage`, not an httpOnly cookie — an XSS anywhere becomes
  token theft. Low risk today (no `dangerouslySetInnerHTML` anywhere), but
  a real trade-off, not a non-issue.
- File upload validation is extension-only (`.xlsx` in the filename), not
  content-sniffed. A malformed/oversized workbook only fails deep inside
  the parser, not at the door.
- Rate limiting is per-IP. Behind a shared office NAT or a reverse proxy
  without `TRUST_PROXY` set correctly, that's a shared bucket for
  everyone behind it, not a per-person one. (`TRUST_PROXY` is documented
  in `ops/README.md`'s Caddy section — verified end-to-end this session:
  Caddy forwards `X-Forwarded-For` by default, the backend just needs
  `TRUST_PROXY=true` when it's actually behind a real proxy, and *only*
  then.)
- No self-service password recovery for a locked-out steward.

**Reliability / ops**
- Backups exist and work (`ops/backup.sh` / `restore.sh`, live-tested) but
  **aren't scheduled anywhere by default** — someone has to wire up the
  cron/systemd timer documented in `ops/README.md` on whatever machine
  actually becomes the production server. (A user-level systemd timer was
  set up on the *dev* machine this session for the current working data —
  that does not carry over to a real deployment automatically.)
- No monitoring/alerting beyond the manual Dev Panel — a crash at 2am pages
  no one.
- No persisted, aggregated application logs — stdout only.

**Scalability**
- Single Node process, no clustering — this is the real ceiling behind the
  stress test's throughput number.
- The facet/extra-field/extra-facet caches are **per-process**. Multiple
  backend instances would each cache independently; a publish only clears
  the cache on whichever instance handled that request. Redis is
  provisioned in the Docker stack for exactly this kind of shared-cache
  use case and isn't wired up yet.
- Single Postgres instance, no replica/failover.

**Data & workflow**
- Bulk export/copy caps at 200 items — no "export this whole category."
- Manual edits publish instantly (by design — see the CRUD design
  decision in git history), so there's no single "undo" for a typo, only
  editing again.

**Testing / quality**
- No frontend test suite (Vitest/RTL or otherwise) — this session's UI
  verification was manual (screenshots + code review), not automated
  regression coverage. Backend has 7 unit + 19 e2e tests, reasonable but
  thin for a system this size.
- ~560 pre-existing lint issues (mostly Prettier formatting, ~440
  auto-fixable), explicitly non-blocking in CI so it doesn't gate
  unrelated work — real debt, not urgent.

---

## 12. Testing & CI

```bash
# backend
npx tsc --noEmit
npm test                                  # unit
E2E_DATABASE_NAME=shankara_erp_e2e DATABASE_PORT=5432 npm run test:e2e

# frontend
npm run build                             # tsc -b && vite build
npm run lint
```

`backend/test/setup-e2e-env.ts` **refuses to run e2e tests against
anything that isn't an isolated scratch database** (unless `CI` is set) —
this is a hard guard, not a suggestion, specifically so e2e runs can never
touch real production/demo data.

CI (`.github/workflows/ci.yml`): backend job runs against a real ephemeral
Postgres service container — type-check, non-blocking lint, unit tests,
migrations, seed, e2e, build. Frontend job — lint, build. Both must be
green on `master`/PRs.

---

## 13. Environment variables

See `backend/.env.example` for the authoritative, current list. Notable
ones:

| Var | Purpose |
|---|---|
| `DATABASE_PORT` | `6432` for the app (via pgbouncer) |
| `JOBS_DATABASE_PORT` | `5432` — pg-boss needs a direct connection |
| `TRUST_PROXY` | `false` unless a real reverse proxy sits in front — see §11 |
| `STORAGE_DIR` | Where uploaded files land on disk |
| `MAX_UPLOAD_BYTES` / `MAX_PARSE_ROWS` | Upload size / row-count guards |
| `SEED_STEWARD_PASSWORD` / `SEED_FINANCE_PASSWORD` / `SEED_BRANCH_PASSWORD` | Used only by `npm run seed` |

`REDIS_HOST`/`REDIS_PORT` are present but unused (see §11's caching note).
