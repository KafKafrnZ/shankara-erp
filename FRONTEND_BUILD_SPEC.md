# Shankara ERP — Frontend Build Spec

**Status:** approved direction, ready to build. **Audience:** whoever (human or AI) implements `frontend/`. **Author context:** written by Dante (in-house IT, Shankara Buildpro) after a backend deep-audit and a UI-direction pass; a 5-screen visual mockup was built separately as a design reference — this document is the self-contained build spec and does not depend on that mockup being available to you.

Read this whole document before writing code. It is meant to remove ambiguity, not to be skimmed.

---

## 1. What this system is

Shankara ERP ingests Tally "Day Book" / "Sales Register" exports (CSV/XLSX/ZIP), validates and stores them as **vouchers** (accounting entries — debits/credits against ledgers), and makes published vouchers searchable. It is an internal back-office tool, not a customer-facing product.

Two kinds of user interact with the frontend:
- **Steward** — uploads files, reviews/publishes/holds batches, can see all voucher versions including superseded ones. Global role (not scoped to one company).
- **Finance** / **Branch** — search and view published vouchers only. Read-only. May be scoped to a single `companyId` (finance sometimes is, branch always is).

The backend is done and stable (NestJS + Postgres, all endpoints below exist and are working). **This spec is frontend-only.** Do not modify anything under `backend/`.

---

## 2. Hard constraints — do not deviate without asking

1. **Desktop/laptop only.** No responsive mobile/tablet layout work. Assume a 1280px+ viewport, keyboard + mouse.
2. **English-only copy.** No i18n scaffolding.
3. **No new backend endpoints, no schema changes, no new backend logic.** If you find yourself wanting one, stop and flag it instead of building around it or adding it yourself.
4. **Search-first landing**, not a dashboard/KPI homepage. The product's job is "let a back-office person find one voucher fast," not present analytics.
5. **Brand fidelity.** Use the Shankara Buildpro palette, logo, and header pattern exactly as specified in §4 — this frontend should look like it belongs to the same company as `shankarabuildpro.in`, not like a generic admin template.
6. **Money is display-only arithmetic.** All amounts come from the API as decimal strings (e.g. `"12,48,500.00"` is NOT how they arrive — see §5.7 for the real format). Never do floating-point math on money in the frontend. If you need to compare/sum, treat values as strings/display-only; the backend has already done all real arithmetic in integer paise.
7. **Don't fabricate data or endpoints.** Every screen below is scoped to what the real API in §5 actually returns. If a screen idea needs data the API doesn't have, cut the idea — don't mock it client-side and don't invent a field.

---

## 3. Tech stack

The repo already has a Vite + React 19 + TypeScript scaffold at `frontend/` (see `frontend/package.json`, `frontend/vite.config.ts`). Build on top of it, don't re-scaffold.

- **Framework:** React 19, TypeScript (strict mode — `tsc -b` already runs as part of `npm run build`, keep it passing).
- **Bundler:** Vite (already configured, dev proxy already forwards `/api` → `http://127.0.0.1:3000`, see `frontend/vite.config.ts`). Don't change the proxy target.
- **Routing:** add `react-router-dom` (v6/v7). Routes needed: `/login`, `/` (search), `/upload` (steward only). See §6 for per-route detail.
- **Styling:** plain CSS with custom properties (design tokens in §4). Do **not** pull in a component library (MUI, AntD, Chakra, etc.) — the brand and density requirements are specific enough that a generic component kit will fight you. CSS Modules or a single well-organized stylesheet are both fine; pick one and be consistent.
- **State/data fetching:** no Redux/Zustand needed for a system this small. A thin `api.ts` fetch wrapper (see §5.1) + React state/context for the current user and as-of banner is sufficient. `@tanstack/react-query` is a reasonable addition if you want caching/retry for search-as-you-type, but it's optional, not required.
- **Testing:** if you add tests, Vitest + React Testing Library (matches the Vite setup). Not a hard requirement for v1, but don't leave the repo's existing test conventions broken.
- **Lint:** `npm run lint` runs `oxlint` — keep it clean.

Do not introduce a second package manager lockfile, a different bundler, or a framework rewrite (no Next.js migration) — this is an internal tool with an existing scaffold, not a green-field greenfield product build.

---

## 4. Brand tokens (exact values — do not approximate)

Source of truth: `/mnt/games/Wrk/Shankara/website/app/globals.css` and `/mnt/games/Wrk/Shankara/website/public/brand/shankara-logo-official.svg` (the company's marketing site — same company, same brand, reuse it verbatim). Put these in a single CSS file, e.g. `frontend/src/styles/tokens.css`:

```css
:root {
  /* brand */
  --sb-red: #e30613;
  --sb-red-deep: #c10510;
  --sb-red-soft: #f26b73;
  --sb-white: #ffffff;
  --sb-off-white: #f7f7f7;
  --sb-mist: #ececec;
  --sb-ink: #141414;
  --sb-muted: #5c5c5c;
  --sb-line: #d1d5db;
  --sb-logo-red: #ff0000;

  /* app aliases */
  --bg: var(--sb-off-white);
  --surface: var(--sb-white);
  --surface-sunken: var(--sb-mist);
  --ink: var(--sb-ink);
  --muted: var(--sb-muted);
  --line: var(--sb-line);
  --accent: var(--sb-red);
  --accent-deep: var(--sb-red-deep);

  /* semantic state — deliberately distinct from --accent so critical
     pills don't blend into brand-red chrome (header, CTAs) */
  --success-bg: #e9f5ee; --success-text: #146c43; --success-line: #146c43;
  --warning-bg: #fdf3e0; --warning-text: #8a5300; --warning-line: #8a5300;
  --critical-bg: #fbeae8; --critical-text: #7a231b; --critical-line: #7a231b;
  --info-bg: var(--sb-mist); --info-text: var(--sb-muted); --info-line: var(--sb-line);

  --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
  --font-editorial: 'Cormorant Garamond', Georgia, serif;
  --radius: 6px;
}
```

Fonts: Inter (UI, all body/table/label text) + Cormorant Garamond (editorial accents only — sign-in tagline, nothing else) via Google Fonts `<link>` tags in `index.html`, same as the marketing site's `next/font/google` usage.

**Header pattern** (used on every authenticated screen's top bar):
```css
background: rgba(255,255,255,0.94);
border-bottom: 3px solid var(--sb-red);
backdrop-filter: blur(8px);
```

**Logo:** `shankara-logo-official.svg` (`viewBox="0 0 114 46"`) — copy it into `frontend/src/assets/shankara-logo.svg`. It's white+red-only (`fill="white"` on the wordmark, `fill="#FF0000"` on the icon), designed for a dark background. On the dark sign-in screen, use it at natural size directly. On light surfaces (app header bar), wrap it in a dark "chip": a small `background: var(--sb-ink)` container with `border-radius: var(--radius)` and padding, so the white wordmark stays legible. Do not recolor the logo itself.

**Semantic color usage rule:** success/warning/critical pills use a pale tinted background + saturated text + matching border (as in the tokens above), never the brand red for non-brand purposes — brand red is reserved for the header accent line, primary CTAs, and the logo icon, so a "Publish blocked" critical pill doesn't visually compete with the "Publish" button next to it.

---

## 5. API contract (exhaustive — this is the entire backend surface the frontend will call)

Base URL in dev: `/api` (Vite proxies to `http://127.0.0.1:3000`; in prod, same-origin `/api` or configure via env — check with Dante before hardcoding a prod API host). All endpoints below require `Authorization: Bearer <token>` **except** `POST /api/auth/login` and `GET /api/health`.

### 5.1 Auth wrapper

Build one `frontend/src/lib/api.ts` that:
- Reads the token from `sessionStorage.getItem('sb.accessToken')` (this key is already used by the existing placeholder `App.tsx` — keep it, don't rename).
- Attaches `Authorization: Bearer <token>` to every request automatically.
- On any `401` response: clear the token, redirect to `/login`. Don't silently retry.
- On `403`: surface a "you don't have access to this" state, don't redirect (the user is logged in fine, just wrong role — e.g. finance hitting a steward-only endpoint).
- Throws a typed error the UI can branch on (see §5.8 for error shapes).

### 5.2 `POST /api/auth/login`
Public. Body: `{ email: string, password: string }`.
Response `200`: `{ accessToken: string, user: { id: string, email: string, role: 'steward'|'finance'|'branch', companyId: string|null } }`.
`401` on bad credentials or inactive user (generic "Invalid credentials" — do not distinguish "wrong password" vs "no such user" in the UI, the backend doesn't either, on purpose).
Rate-limited (10/min per IP) — a `429` is possible under hammering; handle it as "too many attempts, wait a moment."

### 5.3 `GET /api/auth/me`
Returns the full current user: `{ id, email, role, companyId: string|null, branchId: string|null }`. Call this on app load if a token is present in `sessionStorage`, to hydrate user state and validate the token is still good (token TTL is 8h by default — expect it to go stale mid-session sometimes).

### 5.4 `POST /api/auth/logout`
Body: none. `{ ok: true }`. Also clear the client-side token and redirect to `/login` regardless of response.

### 5.5 `GET /api/meta/as-of`
Returns `{ asOf: string|null, batchId: number|null }` — `asOf` is an ISO timestamp of the most recent **published** batch (scoped to the user's company if they're `branch` or `finance`-with-a-companyId; global for `steward`/unscoped `finance`). `null` if nothing's published yet for that scope. This is the "data as of ..." badge shown on every authenticated screen — see §6.2.

### 5.6 `POST /api/search`
Body (all optional except nothing is required — empty body is a valid "browse everything" query):
```ts
{
  q?: string;       // free text, 1-200 chars
  from?: string;    // ISO date, inclusive
  to?: string;      // ISO date, inclusive
  vchType?: string; // exact-ish (ILIKE) match, e.g. "Sales", "Receipt", "Payment", "Journal"
  limit?: number;   // default 20, max 100
  offset?: number;  // default 0
}
```
Response `200`: `{ asOf: string|null, total: number, hits: Array<{ id: number, vchNo: string, vchType: string, vchDate: string /* YYYY-MM-DD */, partyName: string, totalAmount: string, narration: string, companyId: string }> }`.

Notes for the frontend:
- Results are automatically scoped server-side by role/company — the frontend never needs to add a company filter param for that purpose. A company **filter** in the UI (if you add one, e.g. for a steward who can see multiple companies) is a separate, purely additive concern — check whether `vchType` and a company facet are worth exposing as filter chips; the backend does not currently accept a `companyId` search param, so a company filter would have to be client-side post-filtering of a single company's data, or simply omitted from v1. **Do not invent a `companyId` search param — the backend doesn't have one.**
- `total` is the count for pagination — implement offset-based pagination (Prev/Next or page numbers), not infinite scroll, to match the dense back-office table style.
- Only `vchType` values that exist in the data are meaningful; there's no `/api/meta/vch-types` endpoint, so either hardcode the known set (`Sales`, `Receipt`, `Payment`, `Journal`, `Purchase`, `Contra`, `Debit Note`, `Credit Note` — confirm the real set against a live DB or the fixtures under `backend/fixtures/` before shipping a hardcoded list) or build the filter as a free-text field instead of a fixed checkbox list if you can't confirm the full set.
- Empty `q` + no filters = browse mode (paginated list of everything the user can see, newest first). This is a legitimate first-load state for the results view, not an error.

### 5.7 `GET /api/vouchers/:id?version=all`
Returns one voucher's full detail (used for the voucher drawer). `version=all` is only honored for `steward` role (lets a steward see a *superseded* version; everyone else gets `404` for superseded vouchers, and `404` for vouchers whose batch isn't published).

Response `200`:
```ts
{
  id: number,
  vchNo: string,
  vchNoNorm: string,
  vchType: string,
  vchDate: string,        // YYYY-MM-DD
  partyName: string,
  totalAmount: string,    // decimal string, e.g. "1248500.00" — format for display, see §5.9
  narration: string,
  companyId: string,
  lines: Array<{ lineNo: number, ledgerName: string, debit: string, credit: string }>,
  source: {
    batchId: number,
    fileName: string,
    sha256: string,
    sourceRowNo: number,
    publishedAt: string | null, // ISO
  }
}
```
`404` if: voucher doesn't exist, belongs to another company (role-scoped), belongs to an unpublished batch, or is a superseded version being requested by a non-steward. Treat all of these the same in the UI — "voucher not found" — don't try to distinguish them, the backend doesn't tell you which.

The `lines` array is the debit/credit breakdown — sum of `debit` across lines should equal sum of `credit` (that's what "balanced" means for a *published* voucher; imbalance is a *batch-level* pre-publish concern, see §5.8). Render as a table with a bold total row.

There's no explicit "is this superseded" or "version number" field on the voucher response itself — if you want a version indicator (the mockup reference used one), you'd need to infer it from context or skip it; **do not fabricate a version count the API doesn't provide.**

### 5.8 Steward-only ingest/batch endpoints (require `role: 'steward'` — a `403` otherwise)

**`POST /api/uploads`** — multipart form, field `file` (`.xlsx`/`.xls`/`.csv`/`.zip` only, backend rejects other extensions with `400`) + body fields `companyId` (required string) and `branchId` (optional string).
- `200` if the exact same file (by SHA-256) was already uploaded before: `{ batchId: number, status: 'duplicate', duplicate: true, sha256, originalName, bytes }`.
- `202` for a new upload: `{ batchId: number, status: 'held'|'rejected', duplicate: false, sha256, originalName, bytes, errorSummary?: string }`.
  - `status: 'rejected'` with `errorSummary` one of: `UNRECOGNIZED_LAYOUT` (file doesn't look like a Day Book / Sales Register export), `COMPANY_MISMATCH` (file's Tally company name doesn't match this deployment), `ZERO_VOUCHERS` (nothing parseable in it).
  - `status: 'held'` with **no** `errorSummary` is the good/normal case — batch is ready to review and publish.
  - `status: 'held'` **with** `errorSummary` starting `OUT_OF_BALANCE: debit=X credit=Y` means it parsed fine but debits ≠ credits — this is the balance-gate case, see below. It's still `held` (not `rejected`) because the steward can inspect it, but publish will be refused.

**`GET /api/batches/:id`** — `{ id, status: 'held'|'published'|'rejected', companyId, tallyCompany, periodFrom, periodTo, totalRows, acceptedRows, rejectedRows, debitSum: string, creditSum: string, errorSummary: string|null, publishedAt: string|null, sha256 }`. Note: `finance` role gets `404` on a `held` batch (finance never sees unpublished batches, by design — don't build a finance-facing batch view at all, this endpoint's frontend usage is steward-only).

**`GET /api/batches/:id/rejects?page=1&pageSize=50`** — per-row parse/validation failures for a batch. `{ items: Array<{ sourceRowNo: number, code: string, message: string, raw: object }>, total: number }`. This is the "N rows couldn't be read" table. Real `code` values you'll see (map every one of these to a plain-language sentence — don't show raw codes to the user):

| code | when it happens | suggested plain-language text |
|---|---|---|
| `MISSING_VCH_DATE` | row has no date | "Row missing a date" |
| `MISSING_VCH_NO` | row has no voucher number | "Row missing a voucher number" |
| `MISSING_VCH_TYPE` | row has no voucher type | "Row missing a voucher type (Sales/Receipt/etc.)" |
| `UNPARSEABLE_AMOUNT` | a debit/credit/total column isn't a valid number | "Couldn't read this row's amount as a number" |
| `BOTH_SIDES` | a line has both a debit and a credit value (should be one or the other) | "Row has both a debit and a credit amount — expected only one" |
| `VOUCHER_HAS_NO_VALID_LINES` | every line in a voucher failed validation | "None of this voucher's lines could be read" |
| `MAX_PARSE_ROWS` | file exceeds the row cap the parser will process | "File has more rows than can be processed in one batch" |

Show `raw` (the original row data) collapsed/secondary, so a steward can cross-check against their source file without it dominating the row.

**`POST /api/batches/:id/publish`** — no body. `200` with the updated batch object (same shape as `GET /api/batches/:id`) on success.
- `409` with message `NOT_HELD` if the batch is already `published` or `rejected` — disable the Publish button once status leaves `held`, don't rely on the error alone.
- **`409` with message `OUT_OF_BALANCE` if `errorSummary` starts with `OUT_OF_BALANCE`** — this is a real, recently-added server-side hard block (see `POST_PHASE_3_FIXES.md` at repo root for the fix history). **The Publish button must be disabled client-side whenever `batch.errorSummary` starts with `OUT_OF_BALANCE`**, with visible copy explaining why (the debit/credit difference, computed as `parseFloat(debitSum) - parseFloat(creditSum)` for **display only** — this is fine for showing a difference to a human, just never use it to drive a publish decision, the backend already made that decision) and what to do (fix the source file and re-upload — there is no "force publish" or "edit in place" affordance, by design).

**`POST /api/batches/:id/hold`** — no body. `200` with updated batch object. Moves a `published` batch back to `held` (an "unpublish" / retract action). Idempotent if already held.

### 5.9 Money formatting

All money fields (`totalAmount`, `debitSum`, `creditSum`, line `debit`/`credit`) arrive as **decimal strings** like `"1248500.00"` (paise-precision, dot-decimal, no thousands separator, no currency symbol). The backend does not localize this. The frontend is responsible for display formatting:
- Format as Indian numbering (lakhs/crores, e.g. `12,48,500.00`) with a `₹` prefix, right-aligned, tabular-nums, since this is an Indian back-office tool and that's the convention the business actually uses.
- Write one small formatter util (`formatINR(value: string): string`) and use it everywhere — don't hand-roll comma insertion per-component.
- Never parse these into a JS `number` for anything except display-only derived text (like the out-of-balance difference above) — never sum/compare them client-side to make a decision the backend is responsible for.

### 5.10 Errors — general shape

Standard Nest exception JSON: `{ statusCode: number, message: string | string[], error: string }`. `message` is sometimes a single string (e.g. `"OUT_OF_BALANCE"`, `"Invalid credentials"`) and sometimes an array (validation errors from `class-validator`, e.g. bad search params). Handle both. Don't show raw validation-error arrays to the user for the search form — the search DTO's constraints (§5.6) are simple enough that you should prevent invalid input client-side (e.g. date pickers, limit clamped 1–100) rather than relying on server validation errors as the UX.

---

## 6. Screens

Five screens, matching the approved UI direction. Build in this order (each is independently useful — don't build all five before checking in).

### 6.1 Sign in — route `/login`

Full-bleed dark panel (`background: var(--sb-ink)`), centered card. Logo at natural size (no chip — dark background matches the logo's native design). A short editorial tagline in Cormorant Garamond italic (something like "Book of record. Search-first." — exact copy is Dante's call, keep it short and non-marketing-y, this is an internal tool). Email + password fields, red submit button (`--accent`). On success: store `accessToken` in `sessionStorage.setItem('sb.accessToken', ...)`, fetch `/api/auth/me`, redirect to `/`. On `401`: show "Invalid credentials" inline, don't clear the fields. Footnote: "No self-serve signup — contact your steward for access." (there's no signup/forgot-password flow in the backend — don't build UI for either).

### 6.2 App shell (used by every authenticated route)

A persistent top header, present on `/` and `/upload`:
- Left: brand logo chip + "Shankara ERP" wordmark.
- Right: company badge (only meaningful if the user is company-scoped — `branch` always, `finance` sometimes; for a `steward` or unscoped `finance`, either omit it or show "All companies"), "As of {formatted asOf timestamp}" badge from `GET /api/meta/as-of` (poll or refetch on nav, not on every keystroke), a user chip (initials avatar + name/role — note: `/api/auth/me` gives `email`, not a display name; deriving a name from the email local-part, e.g. `r.sharma@...` → "R. Sharma", is a reasonable v1 shortcut, but check with Dante if user records ever get a proper name field before over-investing here).
- Nav: "Search" always; "Upload" only if `role === 'steward'` (hide it entirely for finance/branch — don't just disable it, the backend will 403 it anyway but there's no reason to show a dead link).
- Logout action → `POST /api/auth/logout`, clear token, redirect to `/login`.

### 6.3 Search — route `/`, two states on one page

**Landing state** (no query yet — first load, or after clearing search): centered "Find any voucher" hero, a large single search input (free text — matches against voucher number, party name, narration, amount; see §5.6), a couple of filter affordances (date range; voucher-type — see the caveat in §5.6 about confirming the real type list) collapsed/secondary rather than dominant, and a **recent searches** list. Recent searches are **client-side only** (no backend endpoint for this) — persist the last ~5 distinct `q` values in `localStorage` (not `sessionStorage`, so it survives across sessions), keyed per logged-in user id so one shared machine doesn't mix histories.

**Results state** (query or filters active, or "browse all" with an explicit browse action): compact search bar at top (not the big hero), a left filter rail (date range, voucher type, mirroring the landing filters just relocated), a dense results table — columns: Date, Particulars (party name + narration truncated), Voucher type, Voucher no., Debit, Credit, Company (omit the Company column if the logged-in user is single-company-scoped — no point showing a constant column), and row actions (view detail, copy voucher no. to clipboard, print — print can be `window.print()` on a per-voucher print-friendly view, doesn't need a dedicated backend endpoint). Pagination footer using `total`/`limit`/`offset` from the search response.

Clicking a row opens the voucher detail (§6.4). Use the URL (query params, e.g. `/?q=...&from=...&voucher=123`) to make search state and an open voucher both bookmarkable/shareable — this is a real value-add for a back-office tool where people paste voucher links to each other, not scope creep.

Empty results: a plain "No vouchers matched" state, not a blank table — and if `total === 0` because of filters, hint at loosening them.

### 6.4 Voucher detail — drawer overlay, not a full route (but reflected in the URL, see §6.3)

Right-side drawer over the (dimmed) results list. Header: voucher no./type/party + copy/print/close actions. Meta grid: Date, Company, Party. Lines table: ledger name, debit, credit columns, bold total row (debit total = credit total, since only published/balanced-at-publish-time vouchers are ever visible here — see §5.7, unbalanced batches never reach this screen because they can't be published). A small source/provenance line using `source.fileName` and `source.publishedAt` ("Published {date} · from {fileName}") — useful for a back-office person double-checking against a paper trail, and it's real data the API already returns, not an invented feature.

If the user is `steward`, consider also surfacing whatever the `?version=all` param would reveal for a superseded voucher — but only build this if you have a concrete UI for "here are the other versions of this voucher," which requires the steward to already know the id of a superseded version (the API doesn't expose "list all versions of voucher X" — only "give me version X if I already know its id and pass `version=all`"). If there's no natural entry point for that in v1, skip the superseded-version UI entirely rather than half-building it.

### 6.5 Upload & publish — route `/upload`, steward-only (guard client-side; also enforced server-side as a 403 backstop)

A dropzone (drag-and-drop + click-to-browse) accepting `.csv/.xlsx/.xls/.zip`, plus a `companyId` field (steward is global, so this is a real required input, not a fixed label — likely a select if you can enumerate known companies, otherwise a text field; check with Dante what companies actually exist before hardcoding a list) and optional `branchId`. On submit, `POST /api/uploads`.

After upload, show the resulting batch:
- `duplicate: true` → "This file was already uploaded" with a link/reference to the existing batch id, not an error state.
- `status: 'rejected'` → red/critical state with the `errorSummary` mapped to plain language (`UNRECOGNIZED_LAYOUT` → "This doesn't look like a Day Book or Sales Register export"; `COMPANY_MISMATCH` → "This file's company doesn't match this system"; `ZERO_VOUCHERS` → "No vouchers could be read from this file").
- `status: 'held'`, no `errorSummary` → normal review state: show `totalRows`/`acceptedRows`/`rejectedRows`, debit/credit sums, a **Publish** button (enabled) and a **Hold** affordance if it's currently published (not applicable right after upload, but reuse this same batch view for `GET /api/batches/:id` when a steward navigates to an existing batch, where Hold *is* relevant).
- `status: 'held'` **with** `errorSummary` starting `OUT_OF_BALANCE` → the critical balance-gate state described in §5.8: disabled Publish button, visible debit/credit/difference figures, explanatory copy, no bypass.
- If `rejectedRows > 0`, show the per-row reject table from `GET /api/batches/:id/rejects` (paginated) using the code→plain-language map in §5.8, regardless of whether the batch is otherwise publishable — a batch can have both accepted rows worth publishing and some rejected rows worth flagging; these are independent facts, don't conflate "has rejects" with "can't publish" (only the balance check blocks publish).

This screen is the one most directly demonstrating the server-side fix already shipped this project (`POST_PHASE_3_FIXES.md`) — the hard block on publishing an out-of-balance batch is real backend behavior, not a frontend nicety, so the frontend's job is to make that block legible and actionable, not to re-implement or second-guess it.

---

## 7. Explicit non-goals for v1

Don't build these — they're either not backed by any endpoint, out of scope per §2, or premature:
- Mobile/tablet responsive layouts.
- Any language other than English.
- A dashboard/analytics/KPI homepage.
- Signup, password reset, or user management UI (no backend endpoints for any of these).
- Editing a voucher or a batch's parsed data in place (the system is ingest → review → publish/hold; there is no edit endpoint).
- A "force publish" or any bypass of the balance gate.
- Multi-company search filtering beyond what §5.6 describes (no `companyId` search param exists).
- Real-time/websocket updates (all data fetching is plain request/response).
- Client-side generation or storage of any financial totals beyond formatting already-computed backend values.

---

## 8. Definition of done (v1)

- [ ] `/login` works against a real backend (steward, finance, and branch test users all succeed; bad credentials show an inline error, not a crash).
- [ ] Token persists across a page reload within a session (`sessionStorage`), and expiring/invalid tokens cleanly redirect to `/login` (test by clearing the token value to garbage and reloading).
- [ ] `/` landing → search → results → open a voucher drawer → close it, all via mouse and via URL (paste a `/?q=...&voucher=123` URL directly and confirm it renders the same state).
- [ ] Pagination on results actually pages (`offset`/`limit` wired correctly, not just cosmetic Prev/Next).
- [ ] `/upload` is unreachable in the nav for a finance/branch test user, and returns a graceful "not authorized" state if navigated to directly (don't let a raw 403 JSON or a blank white screen show).
- [ ] Uploading a real out-of-balance fixture file produces a disabled Publish button with visible debit/credit/difference and explanatory copy (this is the single most important behavior to get right — it's the one directly tied to a real backend fix this project shipped).
- [ ] Uploading a file with reject rows shows the reject table with plain-language messages, not raw error codes.
- [ ] All money values render as `₹` + Indian-grouped digits, right-aligned, tabular-nums, everywhere they appear.
- [ ] Brand tokens/fonts/logo/header pattern match §4 exactly — no default browser blue links, no generic sans-serif fallback rendering in place of Inter, no recolored logo.
- [ ] `npm run build` (in `frontend/`) and `npm run lint` both pass clean.

---

## 9. Dev setup

```bash
# backend, in one terminal (needs backend/.env — see backend/.env.example if present, or ask Dante)
cd backend && npm run start:dev   # listens on :3000

# frontend, in another terminal
cd frontend && npm run dev        # listens on :5173, proxies /api to :3000
```

Seed/test users and fixture files live under `backend/fixtures/` and the e2e specs (`backend/test/*.e2e-spec.ts`) — read a couple of the e2e specs before building the upload screen, they show real request/response payloads including what an out-of-balance fixture and a reject-row fixture actually look like.

---

## 10. When you're done

Report back with: what routes/screens are built, what's stubbed vs. fully wired, any place you deviated from this spec and why, and any backend gap you hit that blocked something (e.g. "no endpoint exists for X, so Y is client-side-only / omitted"). Dante will audit against this spec and the real backend before this goes further.
