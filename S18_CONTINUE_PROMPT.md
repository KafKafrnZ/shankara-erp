# PASTE TO GEMINI (S18 CONTINUE)

S18 is **not complete**. Indexer shape is accepted. Live projection is not. Do not start S19. Do not rewrite parsers. Do not touch `search.service.ts` (exact `vch_no_norm` bind after COUNT stays). Do not edit `GOLD.md`.

Repo `D:/5ingularity/shankara-erp`. Brief still `S18_BRIEF.md` (wins). API `http://127.0.0.1:3000`. OS `http://127.0.0.1:9200`.

Independent re-run: SQL published current **30413**; OS `_count` **22413**; SYN9 in OS **14897/20000**; `vch_no:"INV/SR/1"` OS hits **0**. Cause: `reindexAll` **deletes the index first**, then bulks 500/chunk; nest watch died mid-bulk (`EADDRINUSE`). Partial index is not a pass.

---

Fix (then stop)

1. Reindex must not leave a hole. Do **not** `indices.delete` then hope. Create a new index (or alias swap), bulk **all** current published, atomically point `shankara-vouchers` at it, delete the old one. If you keep one index: bulk upsert without wipe, then `delete_by_query` docs whose `_id` is not in the SQL current set — but counts must still match when you finish. Chunks 500–1000. One process; do not rely on `start:dev` reload during reindex.
2. `total_amount` = Postgres 2-dp **string** (or `formatCents`). Remove `Number(x).toFixed(2)`.
3. Add the missing unit test: adapter/doc mapping locked fields, amount is string, `_id` = voucher id. `npm test` becomes 41+N.
4. Steward `POST /api/index/reindex` (JWT). Do not curl it unauthenticated. Finance still 403.

Do not: TRUNCATE, `down -v`, unpublish 345, hold 651/533, query OS from search, fuzz, UI, `PHASE_3_STATUS=COMPLETE`.

Leave `HOLD17/1` and `S18IDX/1` **held**. `OTHER/1` stays published.

---

Prove live (paste cmd+out into `S18_EVIDENCE.md`; replace gates 7 and 13 at least)

After reindex, in this order:

- SQL: `count(*)` voucher ⨝ ingest_batch where `valid_to IS NULL AND is_deleted=false AND b.status='published'`
- `GET http://127.0.0.1:9200/shankara-vouchers/_count` — **equal** to that SQL
- OS `q=vch_no:"INV/SR/1"` hits ≥ 1
- OS `q=vch_no:"HOLD17/1"` hits 0
- OS `q=vch_no:"OTHER/1"` hits 1
- finance `POST /api/search {"q":"INV/SR/1"}` hit1 still exact `INV/SR/1` (SQL)
- SYN9 SQL current still 20000
- `git grep opensearch -- backend/src/search/search.service.ts` empty
- `npx tsc --noEmit -p tsconfig.build.json` ; `npm test` ; `npm run test:e2e` **after** the reindex proof (e2e last)

`S18_STATUS=COMPLETE` only if `_count` equals SQL **on the same machine after the run**. If nest reloads mid-reindex, re-run reindex and re-count. Empty cell / Verified = reject.

Reply: files changed; `{sqlCurrent,indexed,_count}`; INV/SR/1 OS hit; G7 hit1; test summaries; updated evidence rows 7/13. Stop.
