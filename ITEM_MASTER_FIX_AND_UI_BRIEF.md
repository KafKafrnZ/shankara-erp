# Item Master — Fix & UI Work Order (strict, phased)

**Read this entire document before writing any code.** This is not a suggestion — you (the implementing agent) built the item-master backend in a previous pass, reported it complete because `npm run build` passed, and it turned out to ingest **zero rows from either real sample file** because of bugs `tsc` cannot see. This document exists specifically to stop that from happening again. Follow it literally.

**Repo:** `KafKafrnZ/shankara-erp`, branch `master`. **Depends on:** `ITEM_MASTER_ARCHITECTURE.md` (the original design spec — still the source of truth for anything this doc doesn't override) and `FRONTEND_BUILD_SPEC.md` (the existing frontend's conventions — reuse its patterns, don't invent parallel ones).

---

## 0. Non-negotiable working rules

1. **"It compiles" is not "it works."** `npm run build` / `tsc --noEmit` passing proves the code type-checks. It proves nothing about whether it parses a real file correctly. Every phase below has a **Verification** block — that block, not the build, is what makes a phase done.
2. **Real files, not vibes.** The acceptance test for anything touching parsing is the two real files at `/mnt/games/Shankara_erp_matrix/` (`MAIN MASTER ALL BRAND 130526.xlsx`, `TILES 15062026 NEW.xlsx`). When a verification step says to run against them, actually run the command, and paste the actual output in your final report — not a paraphrase, not "it works now."
3. **No phase-skipping.** Phase 0 (backend fixes) is a hard gate. Do not touch any frontend/UI file until Phase 0's exit checklist is fully satisfied and its output pasted.
4. **Copy existing patterns, don't invent new ones.** This codebase has strong, consistent conventions (entity shape, migration shape, DTO/validation shape, CSS class naming, page/component structure). Every fix or new file below names the existing file to copy the pattern from. If you're about to write something that doesn't resemble an existing analog, stop and re-read the analog.
5. **If something in this brief is ambiguous or turns out to conflict with the real code, make the most conservative choice consistent with existing patterns, and say explicitly in your report what you chose and why.** Do not silently guess and stay quiet about it.
6. **Report format (all phases):** for each fix/feature, state the file(s) touched, paste the actual command you ran to verify it, and paste its actual output. "Done" with no evidence will be sent back.

---

## PHASE 0 — Backend correctness fixes (BLOCKING)

Nothing in Phase 1 or later starts until every item below is fixed and the Phase 0 exit checklist passes.

### 0.1 [CRITICAL] Shared strings are never resolved — this is why 0 rows parsed

**File:** `backend/src/item-master/parse/item-master.parser.ts`

**Problem:** `ExcelJS.stream.xlsx.WorkbookReader(filePath, { worksheets: 'emit', sharedStrings: 'emit', hyperlinks: 'emit' })` — the `sharedStrings: 'emit'` option means ExcelJS does **not** resolve cell values to text; every string cell comes back as `{"sharedString": <n>}`, an unresolved reference. `row.values.slice(1)` then treats those reference objects as the header row. Every header cell normalizes to `''`. Every detector fails. Every sheet in every file is marked `UNRECOGNIZED_SHEET`. Verified independently: running the current code against both real files returns `recognizedSheets: 0` and `acceptedRows: 0` for **both** files.

**Required fix:** remove `sharedStrings: 'emit'` from the options object (use the default `'cache'` behavior — ExcelJS resolves shared strings automatically while still streaming rows one at a time; this does not reintroduce the "load the whole file into memory" problem `ITEM_MASTER_ARCHITECTURE.md` §4.3 warned about — only the shared-strings table itself is cached, not worksheet rows).

**Verification:**
```bash
cd backend
cat > /tmp/verify_parser.ts <<'EOF'
import { parseItemMasterStream } from './src/item-master/parse/item-master.parser';
(async () => {
  for (const f of [
    '/mnt/games/Shankara_erp_matrix/MAIN MASTER ALL BRAND 130526.xlsx',
    '/mnt/games/Shankara_erp_matrix/TILES 15062026 NEW.xlsx',
  ]) {
    const r = await parseItemMasterStream(f);
    console.log(f, { totalSheets: r.totalSheets, recognizedSheets: r.recognizedSheets, skippedSheets: r.skippedSheets, totalRows: r.totalRows, acceptedRows: r.acceptedRows, skippedRows: r.skippedRows });
  }
})();
EOF
npx ts-node -r tsconfig-paths/register /tmp/verify_parser.ts
```
Paste the full output in your report. `acceptedRows` must be nonzero for both files.

### 0.2 [HIGH] Formula-cell values get stringified into garbage

**File:** `backend/src/item-master/detect/item-layout.registry.ts` (all three `parseRow()` functions)

**Problem:** confirmed by direct inspection — a large share of real data cells in these files are Excel formulas (`VLOOKUP`, `CONCATENATE`, `MID`). ExcelJS returns these as `{ formula: "...", result: <actual value> }`, not the plain value. `row[columns['brand']]` etc. read this object directly, then `String(value)` on an object produces the literal text `"[object Object]"`. This is not a rare edge case — in the real `CP & SANI&OTHERS` sheet, *every* field (`Stock Item Name`, `Alias`, `Main Group`, `Sub Group`, `UOM`) is a `VLOOKUP` formula; in the SAP layout sheets, `Catalogue No`, `Brand`, and `HSN Description` are formulas.

**Required fix:** in `item-master.parser.ts`, where `rowValues` is built from `row.values`, unwrap every formula-result object before it reaches any detector's `parseRow()`:
```ts
const unwrapCell = (v: any) => (v && typeof v === 'object' && 'result' in v) ? v.result : v;
const rowValues = (Array.isArray(row.values) ? row.values.slice(1) : []).map(unwrapCell);
```
Do the unwrapping once, centrally, in the parser — not inside each detector's `parseRow()`. Detectors should never see a `{formula, result}` object.

**Verification:** re-run the same script as 0.1. Inspect `res.items[0..2]` (add a `console.log(JSON.stringify(r.items.slice(0,3), null, 2))` to the script) for both files — confirm `brand`, `itemName`, `mainGroup`, `subGroup` are readable text, never `"[object Object]"`. Grep the full item set for the literal string `[object Object]` and confirm zero matches:
```bash
# inside the same script, after parsing:
const bad = res.items.filter(i => JSON.stringify(i).includes('[object Object]'));
console.log('items with unresolved formula garbage:', bad.length);
```
Paste this count. It must be `0` for both files.

### 0.3 [HIGH] Header row is never scanned for — only row 1 is ever checked

**File:** `backend/src/item-master/parse/item-master.parser.ts`

**Problem:** the parser treats the *first* row it reads from a sheet as the header row, unconditionally. The real `SAP_Item_Master` sheet (in `TILES 15062026 NEW.xlsx`) has a **blank row 1**, with its real header on row 2. Because of this, the entire sheet — real, distinct item data, not a duplicate of the other sheet — gets marked `UNRECOGNIZED_SHEET` and silently dropped, even independent of bugs 0.1/0.2.

**Required fix:** mirror the existing pattern in `backend/src/ingest/detect/daybook.detector.ts` (`scanLimit = Math.min(rows.length, 20)`) — scan up to the first 20 rows of each sheet; the header row is the first row for which **some** detector in `ITEM_LAYOUT_REGISTRY` returns `true` from `detect()`. Rows before the header (blank rows, title rows) are skipped and not counted as data rows or as skips. If no row in the first 20 matches any detector, mark the sheet `UNRECOGNIZED_SHEET` as today. Restructure `parseItemMasterStream`'s row loop accordingly — you will need to buffer up to 20 rows before committing to "this is / isn't a data sheet," since the streaming reader only goes forward once.

**Verification:** re-run 0.1's script against `TILES 15062026 NEW.xlsx` specifically. Confirm the output now shows **4 sheets, and `SAP_Item_Master` is among the recognized ones** with `acceptedRows > 0` attributed to it (add per-sheet row counts to the script's output if the current `ParseResult` shape doesn't already break it down by sheet — it doesn't; a quick way to check without changing the return shape is to grep `res.items` for `sheetName === 'SAP_Item_Master'` and print `.length`).

### 0.4 [MEDIUM] No indexes on `item_master_row` — supersession lookup and search will degrade at real scale

**Do not edit the already-applied migration** `1787200000001-ItemMasterEntities.ts`. Write a **new** migration file, following the exact style/naming convention of existing migrations in `backend/src/database/migrations/` (timestamp-prefixed, `MigrationInterface`, raw SQL via `queryRunner.query`, both `up()` and `down()`). Name it `<timestamp>-ItemMasterIndexes.ts` with a timestamp after `1787200000001`.

Add:
```sql
-- the exact lookup processBatchJob() does on every single row of every upload
CREATE INDEX "IDX_item_master_row_current_code" ON "item_master_row" ("item_code") WHERE "valid_to" IS NULL;

-- facet/filter queries in ItemSearchService
CREATE INDEX "IDX_item_master_row_main_group" ON "item_master_row" ("main_group");
CREATE INDEX "IDX_item_master_row_sub_group" ON "item_master_row" ("sub_group");
CREATE INDEX "IDX_item_master_row_brand" ON "item_master_row" ("brand");

-- ILIKE '%...%' search — pg_trgm is already enabled in this DB
-- (see backend/src/database/migrations/1787121078440-SearchIndexTrgm.ts), reuse it, don't re-CREATE EXTENSION if it errors on already-exists, guard with IF NOT EXISTS
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "IDX_item_master_row_item_name_trgm" ON "item_master_row" USING gin ("item_name" gin_trgm_ops);
CREATE INDEX "IDX_item_master_row_brand_trgm" ON "item_master_row" USING gin ("brand" gin_trgm_ops);
CREATE INDEX "IDX_item_master_row_catalogue_no_trgm" ON "item_master_row" USING gin ("catalogue_no" gin_trgm_ops);
```
Write the matching `down()` dropping each index by name.

**Verification:** run `npm run migration:run -- -d src/database/data-source.ts` against a real DB if one is available in your environment and confirm it applies cleanly; if no DB is available, at minimum confirm the migration file's SQL is syntactically valid Postgres (no way to fully verify without a DB — say so plainly in your report rather than claiming it ran when it didn't).

### 0.5 [MEDIUM] `publish`/the background job's completion handler race on `'processing'` status

**File:** `backend/src/item-master/item-master.service.ts`

**Problem:** `publishBatch()` only rejects `status === 'published' || status === 'rejected'` — a batch in `'processing'` (background parse job still running) is not blocked, so a fast steward action can call publish while parsing is still in flight. Worse: `processBatchJob()`'s success path unconditionally does `batch.status = 'held';` when it finishes — so if a batch was published mid-processing, the job silently reverts it back to `'held'` once it completes, with no error, no audit trail explaining why a published batch became held again.

**Required fix:**
- In `publishBatch()` and `holdBatch()`, also reject (409) when `batch.status === 'processing'`, with a clear message (e.g. `STILL_PROCESSING`) — same shape as the existing `NOT_HELD` conflict.
- In `processBatchJob()`'s success path, re-fetch the batch's current status inside the same transaction right before the final save, and only set `status = 'held'` if it is still `'processing'` at that point. If it's anything else (meaning something else changed it while the job ran — shouldn't be reachable once the guard above exists, but defend against it anyway), log a warning via `AuditService` instead of silently overwriting.

**Verification:** this is hard to test without a live DB + pg-boss running; at minimum, add the guard and confirm `tsc --noEmit` still passes. If you can spin up the local Postgres via `docker compose up -d` and actually exercise this race (upload a large-ish file, immediately call publish before the job finishes, confirm you get a 409 not a 200), do that and report the result — don't claim it's tested if you didn't run it live.

### 0.6 Delete the stray `.orig` file

`git rm backend/src/item-master/item-master.service.ts.orig`. This is a leftover merge-conflict backup file that should never have been committed. Confirm `git status` shows it removed, not just deleted-on-disk.

### 0.7 [LOW-MEDIUM] Add real input validation to item search

**File:** `backend/src/item-master/item-search.controller.ts` currently takes `@Body() query: any` with zero validation — every other search endpoint in this codebase (see `backend/src/search/dto/search.dto.ts`) uses a `class-validator` DTO.

**Required fix:** create `backend/src/item-master/dto/item-search.dto.ts` mirroring `search.dto.ts`'s exact pattern — `@IsOptional() @IsString() @Length(1, 200) q?: string`, `@IsOptional() @IsString() mainGroup?/subGroup?/brand?: string`, `@IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number = 50`, `@IsOptional() @IsInt() @Min(0) @Type(() => Number) offset?: number = 0`. Use it as the controller's `@Body()` type instead of `any`.

### 0.8 [LOW-MEDIUM] Visibility gaps: `getItemHistory()` and item-batches `getBatch()` leak unpublished data

**File:** `backend/src/item-master/item-search.service.ts` — `getItemHistory(itemCode)` currently returns **every** row for that code regardless of the owning batch's status, to **any** authenticated role. This breaks the "unpublished data is invisible to non-steward roles" convention the rest of the system follows (see `backend/src/ingest/ingest.service.ts`'s `getBatch()`, which 404s a held batch for `finance`).

**Required fix:** `getItemHistory()` must join `item_master_batch` and filter to `batch.status = 'published'` — this still shows genuine version history of everything that was ever actually published (which is the real, intended feature), it just stops leaking draft/held/rejected data through a side door.

**File:** `backend/src/item-master/item-master.controller.ts` — `ItemBatchesController.getBatch()` has `@Roles('steward', 'finance', 'branch')` with no further filtering, unlike the voucher equivalent. **Required fix:** mirror `ingest.service.ts`'s pattern — if the caller's role is `finance` or `branch` and `batch.status !== 'published'`, throw `NotFoundException`.

### 0.9 [MEDIUM] There are no tests. Add a minimum set.

Zero unit or e2e tests exist for any of this. This is directly why 0.1–0.3 shipped undetected. At minimum:

- **Fixture files:** create `backend/fixtures/item-master/` (mirror `backend/fixtures/daybook/`'s convention) with small synthetic `.xlsx` files — at least one per known layout, and critically **at least one fixture with a formula-driven cell and shared-string headers**, so a regression on 0.1/0.2 fails a test immediately instead of silently shipping again. You can generate these with `exceljs` itself in a small script, or by hand-trimming a few rows out of the real sample files (strip everything except a handful of representative rows so the fixture stays small — do not commit full copies of the real 15MB files).
- **Unit test** (`backend/src/item-master/parse/item-master.parser.spec.ts`): parse each fixture, assert exact `acceptedRows`/`skippedRows`/`recognizedSheets` counts and that no item contains `[object Object]` anywhere in its fields.
- **e2e test** additions to a new `backend/test/item-master.e2e-spec.ts`: steward can upload; non-steward upload is 403; after the background job completes (poll `GET /api/item-batches/:id` until status leaves `'processing'`, with a reasonable timeout), batch is `'held'` with `acceptedRows > 0`; publish then makes it searchable via `POST /api/item-search`; `finance`/`branch` cannot see a held batch via `GET /api/item-batches/:id` (404); uploading the identical file twice returns `status: 'duplicate'` the second time.

### Phase 0 exit checklist — do not proceed to Phase 1 until every box is true and evidenced in your report

- [ ] 0.1–0.3 fixed; the verification script run against **both** real files in `/mnt/games/Shankara_erp_matrix/` shows nonzero `acceptedRows` for every sheet except the two genuinely-lookup-only sheets (`Main Grp_Sub Grp`, `Main Grp_Sub Grp (1)`), and zero `[object Object]` occurrences anywhere in the parsed items. Output pasted in full.
- [ ] 0.4 migration written and its SQL validated (DB-applied if possible, syntax-checked if not).
- [ ] 0.5 guard added.
- [ ] 0.6 `.orig` file removed.
- [ ] 0.7, 0.8 fixed.
- [ ] 0.9 fixtures + tests added and passing (`npm test` output pasted).
- [ ] `npm run build` (backend) passes clean.

---

## PHASE 1 — Design-system additions

Build these as isolated, reusable pieces and confirm they work on their own before wiring them into any item-master page. Both requirements below apply to the **whole frontend**, not just new item-master screens — the gap they're fixing already exists across the current app.

### 1.1 "Responsive clickables" — every interactive element needs hover + active + focus + a transition

**Ground truth, verified by inspection:** `frontend/src/index.css` currently has **zero** `:active` selectors and **zero** `transition` properties anywhere in the entire file. Hover states exist (`.btn-primary:hover`, `.btn-secondary:hover`, `.btn-ghost:hover`, `tr.clickable:hover`, `.linkish:hover`, `a:hover`, `.nav-link:hover`) but snap instantly with no animation, and nothing gives feedback on the press itself. `:focus-visible` is defined once, globally (`outline: 2px solid var(--accent); outline-offset: 2px;`) and is fine as-is — keep it, don't override it per-component unless you have a specific reason, and if you do, it must stay at minimum 2px with at least 3:1 contrast against its surface.

**Required fix — a full pass across `frontend/src/index.css`:**

1. Add to `frontend/src/styles/tokens.css`:
   ```css
   --transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
   --transition-base: 180ms cubic-bezier(0.4, 0, 0.2, 1);
   ```
2. For every existing hoverable/clickable selector (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.nav-link`, `tr.clickable`, `.linkish`, `a`, any filter chip / pill that's actually clickable as opposed to purely a status indicator), add a `transition` naming only the properties that actually change (never `transition: all` — that's lazy and causes layout jank on properties you didn't mean to animate), and add an `:active` state:
   - `.btn*`: `transform: scale(0.98)` on `:active`, combined with the same background shift already used on `:hover` but one step darker/deeper (e.g. `.btn-primary:active` → `background: var(--accent-deep)` plus the scale).
   - `tr.clickable` and other non-button clickable rows: **do not use `transform` on table rows** (it causes visual jitter against adjacent rows) — use a background-color-only `:active` state, one step darker than its `:hover` background.
   - `.linkish` / plain links: a subtle color-only `:active` shift, no transform.
   - `.btn:disabled` already exists (`opacity: 0.45; cursor: not-allowed;`) — apply the identical treatment to every new disabled-capable control you add in Phase 2 (disabled Publish button, disabled pagination arrows, etc.) rather than inventing a new disabled treatment.
3. List, in your report, every selector you touched — this task is explicitly "all clickables," not just new ones, so the existing Login/Search/Upload screens should visibly gain this polish too.

### 1.2 Red reactive dot-field background

**Intent:** a quiet, brand-colored animated texture behind the app's chrome — dots in the Shankara red family, arranged on a grid, that brighten and grow near the user's cursor. Reference: the kind of subtle reactive dot-grid background used on modern developer-tool marketing sites (you mentioned the Antigravity IDE/CLI site as a loose visual reference for the *texture*). **Do not fully replicate a marketing hero** — no connecting/constellation lines between dots, no big animated bursts. This is chrome behind a back-office accounting tool, not a landing page: it needs to read as quiet and professional, present but easy to ignore. Dots only.

**Component:** new file `frontend/src/components/DotField.tsx`. A single `<canvas>`, not one DOM element per dot (performance and click-safety both require this).

**Exact behavior:**
- `position: fixed; inset: 0; z-index: 0; pointer-events: none;` — it must never intercept a click or block a hover on real UI; every page's actual content sits at `z-index: 1` or higher (verify existing `.app-shell`/page-root stacking already does this or add it).
- Grid of dots, fixed spacing (`--dot-spacing`, default `34px`), each dot a filled circle of base radius `~1.5px`, color from the Shankara red family (use `var(--sb-red)` for tonal consistency with the rest of the chrome — read it via `getComputedStyle` at mount time, or hardcode `#e30613` if reading computed style adds meaningful complexity; either is acceptable, say which you did).
- Two opacity presets via a `variant` prop: `<DotField variant="light" />` (base opacity `0.08`, for use on the app's normal off-white/white surfaces) and `<DotField variant="dark" />` (base opacity `0.14`, for use on the dark sign-in screen — dark ink swallows more of a faint red than the light background does, so it needs a higher base opacity to read at all; this difference is deliberate, not an inconsistency).
- **Pointer reactivity:** track `mousemove` (throttled to `requestAnimationFrame`, never doing synchronous per-event DOM/canvas writes). Dots within `--dot-reactive-radius` (default `160px`) of the pointer scale up (base radius × up to `2.5`) and raise opacity (up to `0.55`), with a smoothstep falloff by distance — not linear, not a hard cutoff:
  ```ts
  const t = Math.max(0, 1 - dist / radius);
  const factor = t * t * (3 - 2 * t); // smoothstep
  ```
  Dots outside the radius render at their flat base state, completely undisturbed.
- **`prefers-reduced-motion: reduce`:** when set, skip the pointer-tracking animation loop entirely — render the dot grid once, statically, at base opacity, and do nothing on `mousemove`. Still shows the texture, just inert.
- **Resize:** listen for `window.resize`, debounced ~150ms, recompute canvas backing-store size against `devicePixelRatio` (must stay crisp on hi-DPI screens) and regenerate grid coordinates for the new viewport. Don't reflow on every raw resize event.
- **Performance sanity check:** at `34px` spacing on a 1920×1080 viewport that's roughly 1,800 dots — fine for 2D canvas at 60fps by redrawing the whole canvas per frame. Don't go denser than `24px` spacing without actually profiling frame time; if you do, say so and report the measured frame time.
- **Desktop-only, matching the rest of this app's existing constraint** (`FRONTEND_BUILD_SPEC.md` §2.1) — no touch-event handling needed; on a non-mouse device it should just render the static base grid, which is a harmless, correct fallback, not something to special-case.

**Where it mounts:**
- `LoginPage.tsx`: one `<DotField variant="dark" />` behind the existing dark sign-in panel.
- `AppShell.tsx`: one `<DotField variant="light" />`, mounted once at the shell root (not per-route, not per-page) so it persists without restarting/flickering across navigation between Search / Catalog / Upload.
- **Never** place it behind dense data (the results table, the item-master results table, the batch review card, the reject/skip list) — those already sit on fully opaque `--surface: white` card/table backgrounds per the existing CSS, so the dots are already naturally hidden underneath them by z-index + opacity; just confirm none of those containers have a transparent or semi-transparent background that would let the dots bleed through and hurt legibility, and fix any that do.

**Verification:** run the frontend dev server, visually confirm on `/login` and on `/` (search) that the dot field renders, reacts to cursor movement, doesn't block any click (test clicking a button/link directly over where dots render), and that toggling reduced-motion in your OS/browser settings freezes it. `npm run build` (frontend) must still pass clean.

---

## PHASE 2 — Item Master screens

Reference `ITEM_MASTER_ARCHITECTURE.md` §8 for the screen list and behavior. Reuse existing frontend conventions exactly — do not build a parallel styling or component system for these new screens.

- **Nav:** add a `"Catalog"` `NavLink` to `AppShell.tsx`'s `header-nav`, visible to **all** roles (unlike Upload) — copy the exact `<NavLink to="/" end className={...}>` pattern already there. Add a second nav item `"Catalog Upload"`, steward-only, copying the exact `{user.role === 'steward' && (...)}` conditional already used for the existing `/upload` link.
- **Routes:** in `App.tsx`, add `/catalog` and `/catalog/upload` inside the existing `<Route element={<AppShell />}>` block, next to `/` and `/upload`.
- **`frontend/src/pages/CatalogPage.tsx`:** browse/search screen. Structurally mirror `SearchPage.tsx` — a search bar, a left filter rail (reuse its exact CSS classes) driven by `GET /api/item-search/facets` for the Main Group / Sub Group / Brand filter option lists (do not hardcode these — the whole point of facets is they reflect real uploaded data), a dense results table (`item_code`, `item_name`, `brand`, `main_group`/`sub_group`, `uom`) using the existing `.results-table` classes, and pagination reusing the existing pagination pattern.
- **`frontend/src/components/ItemDrawer.tsx`:** item detail, structurally mirror `VoucherDrawer.tsx` — header with copy/close actions, a meta grid of the item's fields, and a version-history list from `GET /api/item-search/history/:itemCode` (now correctly scoped per Phase 0 §0.8) showing each past version with its `valid_from`/`valid_to` range.
- **`frontend/src/pages/CatalogUploadPage.tsx`:** steward-only upload/review, structurally mirror `UploadPage.tsx`'s dropzone + review pattern, with one addition the voucher flow doesn't need: a **`'processing'` state**. After upload, if `status === 'processing'`, poll `GET /api/item-batches/:id` every ~2 seconds (stop on any terminal status: `held`/`published`/`rejected`, and stop after a sane timeout — e.g. 2 minutes — showing an error state rather than polling forever) with a lightweight "processing your file…" indicator. Once `held`, show `totalSheets`/`recognizedSheets`/`skippedSheets`/`totalRows`/`acceptedRows`/`skippedRows` and the skip list (see next bullet), plus Publish/Hold actions mirroring the existing pattern.
- **`frontend/src/lib/item-skip-codes.ts`:** mirror the shape of the existing `reject-codes.ts` exactly, mapping the item-master skip codes (`UNRECOGNIZED_SHEET`, `MISSING_ITEM_CODE`, `MISSING_ITEM_NAME`) to one plain-language sentence each. Never show a raw code to the user, same rule as the voucher reject table.

Apply the Phase 1.1 interaction states (hover/active/focus/transition) and the Phase 1.2 `DotField` to every new screen in this phase as you build it — don't build them plain and add polish later.

---

## PHASE 3 — Final verification and report

- [ ] Phase 0 exit checklist (repeated here for visibility) is fully satisfied.
- [ ] `frontend/src/index.css`: every existing and new clickable has hover + active + focus-visible + a named transition; list every selector touched.
- [ ] `DotField` works on `/login` and inside `AppShell`, doesn't block clicks, respects reduced-motion, builds clean.
- [ ] `/catalog`, `/catalog/upload`, and the item detail drawer are wired, navigable, and RBAC-correct (Upload nav/route invisible and 403'd for non-steward, same as the existing voucher Upload).
- [ ] `npm run build` passes clean in **both** `backend/` and `frontend/`.
- [ ] Every fixture/test added in Phase 0 §0.9 passes.

**Explicit non-goals — do not do these:** don't add particle-to-particle connecting lines to `DotField`; don't make item-master search company-scoped (this was a deliberate architecture decision, see `ITEM_MASTER_ARCHITECTURE.md` §6.1); don't touch the voucher pipeline's business logic beyond the Phase 1.1 CSS pass; don't skip re-testing against the real sample files after Phase 0 fixes and just re-assert the old numbers from memory.

**Report format:** for every phase, paste the actual commands you ran and their actual output, and list every file you touched. If you made a judgment call on anything this brief left ambiguous, state what you chose and why — don't silently guess and stay quiet about it.
