# Item Master Ingest & Retrieval — Architecture Spec

**Status:** design doc, not yet built. **Audience:** whoever implements this (backend + frontend — flagged for Gemini Pro per Dante's 2026-08-21 decision, since Grok's usage limit was exhausted same day). **Depends on:** the existing Shankara ERP backend (NestJS + Postgres) and the voucher-ingest pipeline it already has — this doc extends that system, it does not replace or fork it.

Read `FRONTEND_BUILD_SPEC.md` first if you haven't — it documents the existing voucher search/ingest system this doc builds alongside. This doc assumes that context.

---

## 1. What triggered this

Sample files supplied by Dante's manager (`/mnt/games/Shankara_erp_matrix/MAIN MASTER ALL BRAND 130526.xlsx`, `TILES 15062026 NEW.xlsx`) were fed to the existing upload pipeline and correctly rejected with `UNRECOGNIZED_LAYOUT`. Inspecting both files confirmed why: they are **item/SKU master catalogs** (catalogue number, brand, HSN description, SAP item code, main group/sub group, UOM), not Tally Day Book / Sales Register **transaction** exports. There is no date, no voucher number, no debit/credit — this is reference/master data, not accounting entries.

The existing system has **zero** support for this data shape. `master_ledger` (`backend/src/ingest/entities/master-ledger.entity.ts`) looks superficially related but is not — it's auto-populated as a side effect of parsing voucher lines (`backend/src/ingest/ingest.service.ts:233-240`) and only stores a ledger name string, none of the catalog fields (brand, HSN, UOM, group/sub-group) these files carry.

**Decision (confirmed with Dante 2026-08-21):** this is not a parser bug to fix — it's a second, parallel ingestion domain that needs its own upload path, own storage, own detection logic, and own search/browse surface. Hundreds to thousands of these files are expected over time, uploaded and searched constantly, so this needs to be built as a real subsystem, not a one-off importer script.

---

## 2. Two domains, kept structurally separate — do not merge them

| | Voucher pipeline (exists) | Item master pipeline (this doc) |
|---|---|---|
| What it stores | Accounting transactions (debits/credits against ledgers) | Product/SKU reference data (catalogue no, brand, item name, group, UOM) |
| Source report | Tally Day Book / Sales Register export | Tally/SAP item-master export (varies by team/brand) |
| Correctness gate | Must balance (debit sum = credit sum) — hard-blocked otherwise | No balance concept. Correctness gate is "did this row parse into a recognized layout," not arithmetic |
| Identity/versioning key | `(company_id, vch_type, vch_no, vch_date)` fingerprinted, superseded on change | `(catalogue/item code)` fingerprinted, superseded on change — see §5 |
| Company scoping | Yes — a voucher belongs to one legal company's books | **No** — see §6.1, this is the single most important divergence from the voucher model |
| Review step | Upload → held → steward reviews → publish/hold | Upload → held → steward reviews → publish/hold (same shape, kept for consistency — see §4.4) |

Build this as a new NestJS module (`backend/src/item-master/`), new tables, new endpoints, new frontend section. Wire it in *alongside* `ingest/`, not into it. The only things it reuses from the existing codebase are genuinely shared infrastructure: `SourceFile`/object store (file dedup by sha256), `AuditService`, the `Roles`/`RolesGuard` RBAC primitives, and the `VoucherIndex`-style pluggable search-indexer pattern (§7).

---

## 3. Data model

New tables, named and shaped to match the existing entity conventions exactly (`bigint` PKs, snake_case columns via `@Column({ name: ... })`, `jsonb extra` escape hatch, soft-supersession via `valid_from`/`valid_to` rather than update-in-place — same pattern as `voucher.entity.ts`).

### 3.1 `item_master_batch` (mirrors `ingest_batch`)

```
id                bigint PK
source_file_id    bigint      -- FK to existing source_file table, reused as-is
file_sha256       char(64) unique
uploaded_by       bigint
uploaded_at       timestamptz
status            text        -- 'held' | 'published' | 'rejected' | 'processing' (see §4.5 on why 'processing' is new)
total_sheets      int
recognized_sheets int         -- sheets matched to a known layout
skipped_sheets    int         -- sheets that matched no known layout (see §4.2)
total_rows        int
accepted_rows     int
skipped_rows      int         -- rows within a recognized sheet that still failed to parse
error_summary     text nullable
published_at      timestamptz nullable
published_by      bigint nullable
```

No `debit_sum`/`credit_sum`/`report_type` — those are voucher-domain concepts that don't apply here.

### 3.2 `item_master_row` (mirrors `voucher.entity.ts`'s supersession pattern)

```
id              bigint PK
batch_id        bigint FK -> item_master_batch
layout_key      text        -- which detector matched, e.g. 'sap_item_master_v1' (see §4.1)
item_code       text        -- canonical resolved code, see §5.1 on how this is chosen per layout
catalogue_no    text nullable
sap_item_code   text nullable
brand           text nullable
item_name       text        -- the human-readable description, whichever source column supplied it
hsn_description text nullable
main_group      text nullable
sub_group       text nullable
uom             text nullable
alias           text nullable
source_row_no   int nullable
extra           jsonb default '{}'   -- every column that didn't map to a named field above, preserved
fingerprint     text        -- sha256 of normalized row content, drives supersession (§5.2)
is_deleted      boolean default false
valid_from      timestamptz default now()
valid_to        timestamptz nullable
created_at      timestamptz
```

Deliberately **no `company_id`** — see §6.1.

### 3.3 `item_master_skip` (mirrors `ingest_reject`, but sheet-and-row level)

```
id              bigint PK
batch_id        bigint FK -> item_master_batch
sheet_name      text
source_row_no   int nullable   -- null if the whole sheet was skipped, not a single row within it
code            text           -- 'UNRECOGNIZED_SHEET' | 'MISSING_ITEM_CODE' | 'DUPLICATE_ROW_IN_FILE' | ...
message         text
raw             jsonb nullable
```

Whole-sheet skips (e.g. the `Main Grp_Sub Grp` lookup sheet in the TILES sample, which is a code→description reference table, not item rows) get one row here with `source_row_no: null`, not one row per line of that sheet.

### 3.4 Migration

Add one TypeORM migration under `backend/src/database/migrations/`, timestamp-prefixed like the existing ones (`1787200000000-WidenReportTypeCheck.ts` is the most recent — follow that file's shape). Run via the existing `npm run migration:run -- -d src/database/data-source.ts`. Don't hand-write SQL outside the migration system — this project's whole history (Phase 1-3 audits) has been disciplined about that.

---

## 4. Layout detection & parsing

### 4.1 Registry pattern, not a bigger if/else

The existing `detectReport()` (`backend/src/ingest/detect/report.detector.ts`) hardcodes exactly two detectors in sequence. That doesn't scale to "extend over time" as new layouts show up (Dante's confirmed decision: fixed known layouts now, extended incrementally — not a user-facing column-mapping UI in v1). Build a registry instead:

```ts
interface ItemLayoutDetector {
  key: string;                                    // 'sap_item_master_v1', 'master_code_v1', ...
  detect(headerRow: string[]): boolean;            // does this sheet's header match?
  parseRow(row: string[], columns: Record<string,number>): ParsedItemRow | { skip: true, reason: string };
}

const ITEM_LAYOUT_REGISTRY: ItemLayoutDetector[] = [
  sapItemMasterDetector,   // header: SI No / Date / Catalogue No / HSN Description / Main Group_Code / Brand / SAP Item Code / SAP Item Description / ...
  masterCodeDetector,      // header: SI No / Catalogue No / Brand / Stock Item Name for Migration / Alias / Main Group / Sub Group / UOM / ...
  cpSaniOthersDetector,    // header: (blank) / Stock Item Name / Alias / Main Group / Sub Group / UOM / ... / Category  — no SI No column, first cell is the item code itself
];
```

For each sheet in an uploaded workbook: normalize the header row the same way `daybook.detector.ts`'s `cleanHeader()` does (trim, collapse whitespace, lowercase, strip trailing dot), then try each registered detector in order. First match wins. No match → the whole sheet becomes one `item_master_skip` row with `code: 'UNRECOGNIZED_SHEET'`, and processing continues to the next sheet — **a file is never rejected outright just because one of its sheets doesn't match**, unlike the voucher pipeline's whole-file `UNRECOGNIZED_LAYOUT` reject. This is a deliberate behavioral difference: a single Day Book export is one homogeneous report, but a single item-master workbook routinely bundles multiple unrelated sheets (confirmed in both sample files — 4 sheets and 2 sheets respectively, not all of which are item rows).

Confirm the exact header sets for the two clearly-item-row sheets in the two known sample files before writing the detectors — read them directly (`openpyxl`/`pandas`, header row is row index 0 in `Nstl_Sapitemmaster_Tallyuploadf` and `SAP_Item_Master`, row index 0 in `MASTER CODE`, row index 0 in `CP & SANI&OTHERS` with a blank first header cell) rather than trusting this doc's paraphrase — the exact column text (including trailing spaces like `'Conversion1 '` and the non-breaking space in `'Material\xa0Long\xa0Text'`) matters for exact-match detection and should be normalized the same way the day-book detector already normalizes headers.

### 4.2 Reference/lookup sheets — don't discard, don't force into item rows

`Main Grp_Sub Grp` (present twice, identically, in the TILES file) is a small code→description lookup (`TI` → `TILES`, `FA` → `FAUCETS`, etc.), not item data. Two reasonable options, in order of recommendation:
1. **v1: skip and log** (`UNRECOGNIZED_SHEET` in `item_master_skip`) — simplest, loses nothing critical since `main_group`/`sub_group` text is already carried in full on the item rows themselves (e.g. `'CEMENT'` / `'CM-ACC'` in the `MASTER CODE` sheet), so the lookup table is redundant with data already present per-row.
2. **Later, if useful:** a small `item_master_group_lookup(code, description)` table for building a clean taxonomy/filter UI, populated opportunistically when this sheet shape is seen. Don't build this in v1 — it's a nice-to-have, not something blocking search/browse (main_group/sub_group text on each row is enough to filter by, see §8).

### 4.3 File size and row volume — this is the real engineering risk in this feature

The two sample files are **15MB and 7.6MB** with tens of thousands of rows across their sheets. That's an order of magnitude larger than typical Day Book exports this system was built against. Two consequences:

1. **Don't parse synchronously in the HTTP request handler** the way `ingest.service.ts:processUpload()` does today. For "hundreds if not thousands" of these files, some uploaded concurrently, holding an HTTP connection + a DB transaction open for a multi-tens-of-thousands-row parse is a real availability risk (connection pool exhaustion, request timeouts, a slow upload blocking others). Use a background job queue (`pg-boss` is a reasonable choice here — no new infra dependency beyond the Postgres this project already runs, unlike BullMQ which wants Redis). `POST /api/item-uploads` should: validate the file, dedupe by sha256, store it, create the `item_master_batch` row with `status: 'processing'`, enqueue a parse job, and return `202` immediately with the batch id. The frontend polls `GET /api/item-batches/:id` until status leaves `'processing'`.
2. **Streaming parse, not load-the-whole-sheet-into-memory.** `parseDayBookStream` (`backend/src/ingest/parse/daybook.parser.ts`) already establishes the streaming pattern for this codebase (`ExcelJS` or equivalent streaming reader, not `sheet_to_json`-style full materialization) — follow the same approach for item-master sheets, it matters more here given the file sizes.

### 4.4 Why keep a publish/hold review step for data with no balance check

It would be simpler to auto-publish item rows the moment they parse cleanly. Don't — keep the same `held → steward reviews → publish` shape the voucher pipeline uses, for two concrete reasons: (a) it lets a steward see `accepted_rows`/`skipped_rows`/`skipped_sheets` counts and catch a bad file (wrong sheet order, a renamed column that silently drops rows) *before* it becomes live, searchable data that finance/branch users start relying on; (b) it keeps one mental model across both upload screens instead of two different interaction patterns for what's otherwise structurally the same workflow (upload → review → commit). This is a deliberate consistency choice, not a leftover requirement from the voucher domain.

### 4.5 Reuse file-level dedup as-is

Same sha256-based short-circuit as `processUpload()` already does (`backend/src/ingest/ingest.service.ts:65-84`) — if the exact same file was uploaded before, return `{ status: 'duplicate' }` immediately, no reprocessing. Reuse the existing `source_file` table and object store for this; don't build a second file-storage path.

---

## 5. Identity, versioning, and supersession

### 5.1 Canonical item code — resolve per layout, don't assume one column name

The three known layouts don't agree on what the "real" identifier is:
- `Nstl_Sapitemmaster_Tallyuploadf` / `SAP_Item_Master`: `SAP Item Code` (e.g. `BFSJAQZMPCHR125C`) is the stable, generated identifier — prefer it over `Catalogue No`, which is the *manufacturer's* code and can collide across brands.
- `MASTER CODE`: no SAP code column; `Alias` (e.g. `BCMACCOPC53`) plays the same role — a generated, unique-looking code — prefer it over `Catalogue No` (frequently blank in this sheet, per the sample data).
- `CP & SANI&OTHERS`: the first column *is* the code directly (no header label), paired with an `Alias` column that duplicates it prefixed — prefer the first column.

Each layout's parser must resolve one `item_code` value per row using that layout's best available stable identifier, in a documented per-layout precedence order (write this explicitly in each detector, don't leave it implicit). Store the columns you *didn't* pick as the canonical code in their own named fields anyway (`catalogue_no`, `sap_item_code`, `alias` are all separate columns on `item_master_row`, per §3.2) so nothing is lost — only the choice of *which one drives supersession identity* needs a firm rule.

### 5.2 Supersession, same mechanism as vouchers

Mirror `ingest.service.ts:173-206` exactly: fingerprint the full normalized row (all mapped fields, sorted/stable-stringified, sha256'd). On each upload:
- Look up the current row (`valid_to IS NULL`) for this `item_code`.
- Same fingerprint → no-op, skip (this is the common case for re-uploads of a mostly-unchanged catalog).
- Different fingerprint → close the old row (`valid_to = now()`), insert a new one.
- No existing row → insert fresh.

This is what makes "hundreds/thousands of files uploaded constantly" tractable: re-uploading a full catalog export every time a distributor sends an update doesn't create thousands of duplicate rows, it only touches what actually changed, and — same as vouchers — nothing is ever hard-deleted, so "what did this SKU's data look like on date X" stays answerable. This also gives you change-history-per-item essentially for free (§9).

### 5.3 Cross-file identity collisions are expected, not an error

The same `item_code` may legitimately appear across different uploaded files over time (a distributor re-sends their catalog monthly; a new brand's file is added later). Supersession handles updates to the *same* code fine. What it does **not** currently handle is two *different, unrelated* products colliding on the same code by accident (a genuine data-entry error upstream) — that would silently overwrite one with the other. Flag this as a known gap rather than silently accepting it: log a `WARN`-level audit event (reusing `AuditService`) whenever a supersession changes `brand` or `main_group` for an existing code (a strong signal the "same code" isn't actually the same product), so a steward can review it later. Don't build a full conflict-resolution UI for this in v1 — just don't let it fail silently.

---

## 6. RBAC and scoping

### 6.1 Item master is NOT company-scoped — this is the key divergence from the voucher model

Vouchers belong to one legal company's books, and the whole voucher search/RBAC model (`search.service.ts`, `vouchers.service.ts`) exists to enforce that a `branch` or company-scoped `finance` user only ever sees their own company's transactions. **Item/SKU catalog data is different in kind**: a stock item code and its brand/description is supplier reference data, true regardless of which company entity's books you're looking at. Scoping it by `company_id` the same way would mean a branch user can't look up what a SKU means unless it happens to match their company — which doesn't match how this data is actually used (a person searching "what is BFSJAQZMPCHR125C" wants the answer, not a 404 because they're logged in under the wrong company).

**Recommendation: item master search/browse is visible to all authenticated roles (steward, finance, branch alike), unscoped.** Only *uploading/publishing* stays steward-only (§6.2) — read access is universal, write access is restricted, same shape as the existing `@Roles('steward')` pattern but with `search`/`getRow` left with no `@Roles()` decorator at all (any authenticated role passes `RolesGuard`, exactly like `search.controller.ts` and `vouchers.controller.ts` today).

Flag this decision explicitly to Dante/the Head before building — it's an inference from what the data *is*, not something confirmed in the requirements gathered so far. If it turns out item master data genuinely needs to differ per company (e.g. two Shankara-group companies stock different subsets of the same supplier's catalog and that distinction matters operationally), this needs a company scoping column added back in before it's a habit anyone depends on.

### 6.2 Write access

`POST /api/item-uploads`, `POST /api/item-batches/:id/publish`, `POST /api/item-batches/:id/hold` → `@Roles('steward')`, identical pattern to `ingest.controller.ts`. No new role is needed.

---

## 7. Retrieval architecture — CRUD/SQL vs. vector embeddings

**Recommendation: plain structured search (SQL + trigram, with the existing OpenSearch adapter pattern as an optional accelerator), not vector embeddings, for v1.** Reasoning:

1. **The query shape doesn't need semantics, it needs exact/fuzzy structured lookup.** People will search this by a catalogue number they're holding, a brand name, an item name they're transcribing off a delivery note, or a main/sub group they want to browse. That's `ILIKE`/trigram-similarity territory (typo-tolerant substring/prefix matching on `item_code`, `item_name`, `brand`), not "find conceptually similar products to this description" territory. Nobody's issuing a query like "durable bathroom fixture under a certain price point" that would actually benefit from embedding-space similarity — and even if they did, this catalog has no price field to reason about anyway.
2. **The infra for the recommended approach already exists in this repo, at zero new cost.** `pg_trgm` is already enabled and used (`backend/src/database/migrations/1787121078440-SearchIndexTrgm.ts`), and the pluggable indexer pattern is already built and proven: `VOUCHER_INDEX_TOKEN`/`VoucherIndex` interface (`backend/src/search-index/search-index.interface.ts`) with an `OpensearchAdapter` and a `NoOpAdapter` fallback when `OPENSEARCH_NODE` isn't configured. Stand up the equivalent `ITEM_INDEX_TOKEN`/`ItemIndex` interface, same shape (`upsert`/`deleteByIds`/`searchCandidates`/`reindexAll`/`ping`), same fallback behavior. This is copy-the-pattern work, not new infrastructure.
3. **Vector search is real added cost with no corresponding problem to solve yet:** an embedding model (hosted or local), a vector store (pgvector isn't currently installed in this project — that's a new extension, new migration, new query patterns — or an external vector DB, which is a new operational dependency entirely), an embedding-generation pipeline that has to run on every upload (adding real latency/cost to the "hundreds/thousands of files" ingestion path this doc is already trying to keep lean via background jobs), and ongoing relevance tuning that structured search doesn't need. None of that is justified by the query pattern described above.

**Concrete v1 design:**
- Primary: SQL query against `item_master_row` (current rows only, `valid_to IS NULL AND is_deleted = false AND` batch `status = 'published'`), `ILIKE`/`%` matching on `item_code`, `item_name`, `catalogue_no`, `brand`, plus exact filters on `main_group`/`sub_group`/`brand` as facets — same shape as `search.service.ts`'s `searchSql()`, reuse its ranking heuristic (exact code match ranked first, then substring matches, then alpha/recency).
- Optional acceleration: an `ItemIndex` OpenSearch adapter mirroring `search-index/opensearch.adapter.ts`, used as a candidate-id prefilter with graceful fallback to SQL on any indexer error — exactly the resilience pattern `search.service.ts:19-34` already uses (`try { indexer } catch { sql }`).
- Endpoint: `POST /api/item-search` with `{ q?, mainGroup?, subGroup?, brand?, limit?, offset? }`, response `{ total, hits: [...] }` — same envelope shape as `POST /api/search` for frontend consistency.

**When to revisit this decision:** if usage data later shows people frequently searching with loose natural-language descriptions rather than codes/names/brands (a real signal semantic search would help), or if the catalog grows large enough and messy enough that near-duplicate detection across differently-worded descriptions becomes a genuine data-quality problem worth solving computationally rather than via the `WARN`-audit approach in §5.3. Write this down as an explicit trigger condition rather than either building embeddings speculatively now or forgetting to reconsider it later.

---

## 8. Frontend surface

New nav item, "Catalog" or "Item Master" (name it whatever the Head's team actually calls this internally — ask, don't guess), visible to all roles for search/browse, with an "Upload" action visible only to `steward` (same visibility rule as the existing Upload nav item in `FRONTEND_BUILD_SPEC.md` §6.2).

- **Browse/search screen:** search bar (code/name/brand free text) + facet filters (Main Group, Sub Group, Brand — populate the facet option lists from a distinct-values query, not hardcoded, since the real value set isn't fully known upfront and will grow as new files are uploaded), dense results table (Item Code, Item Name, Brand, Main Group / Sub Group, UOM), pagination — structurally identical to the existing voucher results table (`FRONTEND_BUILD_SPEC.md` §6.3), reuse the same table/pagination components rather than building parallel ones.
- **Item detail:** a row's full field set (all of `item_master_row`, including `extra` for anything layout-specific that didn't get a named column) plus, if §5.2's supersession history is wired up, a simple "previous versions" list (`valid_from`/`valid_to` timestamps) — cheap to add given the data model already tracks it, genuinely useful for "why did this item's group change" questions (§9).
- **Upload screen (steward only):** dropzone, same interaction shape as `FRONTEND_BUILD_SPEC.md` §6.5's voucher upload, but the post-upload review view shows sheet-level results (`recognized_sheets`/`skipped_sheets`, and the `item_master_skip` list per sheet) instead of debit/credit balance — there is no balance-gate equivalent to build here, don't invent one.
- Given `status: 'processing'` (§4.3) is now a real possible state, the upload review screen needs a polling or "check back" state for it — a batch that isn't done parsing yet should show progress/row-count-so-far if cheaply available, or just "processing, refresh in a moment" if not.

---

## 9. Genuinely useful functionality worth prioritizing (not commitments — flag for Dante to greenlight)

Ranked by value-to-effort, given the versioned data model already buys some of these almost for free:

1. **Per-item change history** (§5.2/§8) — "show every version of this SKU's data over time." Nearly free once supersession is built; skip only if there's a reason not to expose it.
2. **CSV export of search/browse results** — a real back-office need (someone wants to hand a filtered list to someone else, or work offline). Cheap: stream the same query that powers search results to CSV.
3. **Cross-upload data-quality report** — surfaces cases from §5.3 (same code, changed brand/group across uploads) and files with unusually high `skipped_rows`/`skipped_sheets` ratios, in one steward-facing view. Turns the audit-log entries already being written into something actually actionable instead of just recorded.
4. **Distinct-value facet counts** ("Brand: JAQUAR (412), KOHLER (289), ...") on the browse screen — makes the catalog explorable, not just searchable, and is a cheap `GROUP BY` on top of the same table.

Explicitly **not** recommended for v1, and why:
- Vector/semantic search — covered in §7.
- Linking item master rows to voucher line items — the sample data gives no indication vouchers reference SKU codes (Tally voucher lines are ledger names, an accounting concept; item codes are a separate, product concept) — don't build a relation the data doesn't actually support. If this turns out to be wrong, it's a real, separate design question, not an assumption to bake in speculatively.
- A generic/flexible column-mapping UI for unknown layouts — Dante already decided against this for v1 (§4.1); the registry-with-a-skip-fallback approach is the agreed scope.
- AV/malware scanning of uploaded files — a real gap, but it's a *pre-existing* gap shared with the voucher upload path (`ingest.controller.ts` has none either), not something specific to this feature. Worth raising as a separate, cross-cutting security item rather than solving once here and leaving the other upload path exposed.

---

## 10. "Enterprise-grade" checklist — what to hold this to

Concrete, checkable practices, all of which extend patterns this codebase already applies elsewhere rather than introducing new ones:

- [ ] All multi-row writes wrapped in a single DB transaction (`queryRunner` pattern from `ingest.service.ts`), so a mid-parse failure never leaves a batch half-committed.
- [ ] Every upload/publish/hold/search action logged via the existing `AuditService` (new action strings: `item_upload`, `item_publish`, `item_hold`, `item_search`), same table, same query surface stewards already use for the voucher audit trail.
- [ ] File-type/size validation at the controller boundary (reuse `ingest.controller.ts`'s extension allowlist pattern; add an explicit max-size check given these files run 7-15MB+, larger than typical Day Book exports).
- [ ] Rate limiting on `POST /api/item-uploads` via the existing `ThrottlerModule`, consistent with `auth/login`'s existing throttle usage.
- [ ] No hard deletes anywhere in this feature — supersession + `is_deleted` flag only, matching the voucher model's audit-preserving design.
- [ ] Background job processing for parsing (§4.3), so upload volume/size can't degrade the rest of the API's responsiveness.
- [ ] Structured, typed skip/error codes (`item_master_skip.code`) mapped to plain language in the frontend, same discipline as the existing `ingest_reject` code table in `FRONTEND_BUILD_SPEC.md` §5.8 — never surface a raw code or stack trace to a steward.

### Benchmarks to hold this to (proposed — confirm/adjust once real data volume is known)

| Metric | Target | Why this number |
|---|---|---|
| Search p95 latency | < 200ms | Matches the existing voucher search benchmark already achieved (135ms/122ms p95, per the Phase 3 audit) — no reason this should be slower given a comparable or smaller row count per company-unscoped query |
| Upload → parse-complete time, 15MB / ~20k-row file | < 60s in the background job | Rough target based on the actual sample file sizes; measure against the real files in `/mnt/games/Shankara_erp_matrix/` during implementation and tighten/loosen this once real numbers exist — don't ship a benchmark nobody's actually measured |
| Row parse success rate | Track and surface per batch (`accepted_rows / total_rows`), no fixed target | This is a data-quality signal to *report*, not a pass/fail gate — a low rate on a given file is informative (bad export, wrong sheet) not necessarily a bug |
| Concurrent uploads without degrading search latency | Should hold at 5+ concurrent uploads | The stated volume ("hundreds if not thousands of files... uploaded and retrieved constantly") implies overlap between uploads and searches happening live — this is the actual reason §4.3 insists on background processing rather than synchronous request-blocking parsing |

---

## 11. Open questions to resolve before/while building

1. **Item master company-scoping (§6.1)** — confirmed inference, not confirmed requirement. Verify with the Head before shipping unscoped read access as permanent.
2. **Canonical item-code precedence per layout (§5.1)** — the precedence rules given are Dante's/Claude's best read of the two sample files; verify against a few more real files before locking in, since "hundreds/thousands of files" almost certainly means more layout variety than these two samples show.
3. **Naming** — what the Head's team actually calls this ("item master," "SKU catalog," "stock master," something else) should drive UI copy and probably the module name too if it's not too late to rename.
4. **Retention** — vouchers keep every superseded version forever by existing design; confirm the same policy is wanted here rather than assumed, given the row volume could get large over "hundreds/thousands of files" much faster than the voucher table grows.

---

## 12. Build order

1. Migration + entities (§3).
2. Layout registry with the 2-3 known detectors, tested directly against the real sample files in `/mnt/games/Shankara_erp_matrix/` (don't invent fixtures for this — the real files are sitting right there and are exactly the acceptance test).
3. Background job wiring (§4.3) — get one file parsing end-to-end via the queue before building more layouts on top of a synchronous prototype you'll have to redo.
4. Upload/batch/publish/hold endpoints (steward-only) + item-master upload review screen.
5. Search endpoint + browse/search screen (all roles).
6. Item detail view + version history.
7. CSV export, data-quality report (§9, if greenlit).

Report back per-phase, same as the voucher frontend build — Dante audits against this doc and the real backend before this goes further.
