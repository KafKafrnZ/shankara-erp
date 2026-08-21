# Item Master — Follow-up fixes (strict, small scope)

**Context:** `ITEM_MASTER_FIX_AND_UI_BRIEF.md` was implemented and independently re-verified — the parser fixes are real and confirmed by re-running the verification script against both real files in `/mnt/games/Shankara_erp_matrix/` (174,553 + 31,792 rows now parse correctly, zero `[object Object]` garbage, `SAP_Item_Master` sheet recovered). The DotField component, the CSS interaction pass, DB indexes, DTO validation, and the two RBAC visibility fixes were also verified correct. **Good work on those — they're done, don't touch them again.**

Three gaps were found on re-audit. This brief covers only those three. Same rules as before apply: no phase/item is done until its verification step is run for real and the actual output is pasted in your report. Do not claim something is tested if you did not run it.

---

## 1. The e2e test file is a placeholder stub, not the required tests

**File:** `backend/test/item-master.e2e-spec.ts` currently contains exactly one test: `it('placeholder for e2e', () => { expect(true).toBe(true); })`. This does not exercise any of the scenarios `ITEM_MASTER_FIX_AND_UI_BRIEF.md` §0.9 required. Replace it with real tests, following the existing pattern in `backend/test/ingest.e2e-spec.ts` (same app bootstrap, same style of `request(app.getHttpServer())...`).

Required scenarios, at minimum:
- Steward can `POST /api/item-uploads` with a real small fixture file (reuse or extend `backend/fixtures/item-master/test-fixture-1.xlsx`); response is `202` with `status: 'processing'`.
- A non-steward (`finance` or `branch` token) gets `403` on the same upload endpoint.
- After upload, poll `GET /api/item-batches/:id` (with a bounded retry loop and a timeout in the test itself — don't let a broken test hang CI forever) until status leaves `'processing'`; assert it reaches `'held'` with `acceptedRows > 0`.
- `POST /api/item-batches/:id/publish` on that held batch succeeds (`200`), then `POST /api/item-search` with a query matching the fixture's item finds it.
- `finance`/`branch` calling `GET /api/item-batches/:id` on a still-`'held'` (unpublished) batch gets `404`.
- Uploading the identical file a second time returns `status: 'duplicate'`.

**Verification:** run `npm run test:e2e` (or the project's actual e2e script — check `package.json`) against a real local Postgres (`docker compose up -d` first if you have Docker available in your environment; if you genuinely cannot run a live DB in your environment, say so explicitly in your report rather than claiming these passed). Paste the actual test runner output.

## 2. Unit test fixture only covers 1 of 3 known layouts

**File:** `backend/src/item-master/parse/item-master.parser.spec.ts` currently only has a fixture for `master_code_v1`. `ITEM_MASTER_FIX_AND_UI_BRIEF.md` §0.9 asked for at least one fixture per known layout (`sap_item_master_v1`, `master_code_v1`, `cp_sani_others_v1`).

**Required fix:** add two more small fixtures (you can generate them the same way the existing one was generated — a short script building a `.xlsx` with `exceljs`, matching each layout's real header shape from `backend/src/item-master/detect/item-layout.registry.ts`) and a test case per layout, each asserting correct `itemCode`/`itemName`/`brand` resolution and zero `[object Object]` occurrences — same assertions as the existing test, just one per layout. Include at least one row with a formula-cell value (`{formula, result}`) in each fixture, since that's exactly the bug class this test suite exists to catch a regression on.

**Verification:** `npx jest --testPathPatterns=item-master`, paste the output — must show all layout tests passing.

## 3. The upload-review polling loop has no timeout

**File:** `frontend/src/pages/CatalogUploadPage.tsx`, the `useEffect` that polls `GET /api/item-batches/:id` every 2 seconds while `batch.status === 'processing'`. There is currently no upper bound — if a batch is stuck in `'processing'` (background job crashed, hung, or was never picked up), the UI polls forever with no error ever shown to the steward. `ITEM_MASTER_FIX_AND_UI_BRIEF.md` §2 explicitly required "stop after a sane timeout — e.g. 2 minutes — showing an error state rather than polling forever."

**Required fix:** track elapsed polling time (or a poll-attempt counter) alongside the existing interval; after ~2 minutes (60 polls at 2s, or track via `Date.now()` — either is fine, pick one), stop polling and set an error/timeout state. Render a clear message in the existing `batch-card` section, e.g. "Still processing after 2 minutes — this may indicate a problem. Refresh the page to check again, or contact your steward team." Do not silently keep polling past that point, and do not just fail silently — the steward needs to see *something* changed.

**Verification:** this is hard to trigger for real without deliberately breaking the background job. At minimum: read through your own change and confirm the timeout logic is unreachable-bug-free (e.g., the interval is actually cleared when the timeout fires, not just when the component unmounts), and if you can fake it (e.g., temporarily hardcode a batch state of `'processing'` with no real backend update, watch the UI in a browser, confirm the timeout message appears after your configured duration, then revert the hardcoding), do that and report what you saw. If you can't verify it live, say so plainly rather than claiming you watched it work.

---

## Report format (same as before)

For each of the 3 items: file(s) touched, the actual command you ran, and its actual output pasted in full. If you could not run a verification step live (e.g., no Docker/DB available in your environment), say so explicitly — that is an acceptable answer, a fabricated "it passed" is not.
