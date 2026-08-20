# S19 WORK ORDER — OS CANDIDATES + SQL VISIBILITY + SQL FALLBACK

You are implementing **S19 only**. Repo: `D:/5ingularity/shankara-erp`.  
Spec: `PHASE_3_AUDIT.md`, `PHASE_STATUS.md` §7, `fixtures/search/GOLD.md`, **this file** (wins on conflict).

**S0–S18 done.** Do not rewrite parsers, money, indexer mapping, or frontend.  
**S20–S22 forbidden.** No fuzz. No UI highlight. No `PHASE_3_EVIDENCE.md`. No `PHASE_3_STATUS=COMPLETE`.

---

## 0. HARD RULES (reject if broken)

1. Fill `S19_EVIDENCE.md` as a 15-row `cmd:`+`out:` table (S11 shape). Empty cell / Verified / Passed in e2e = not done.
2. Hits in `POST /api/search` are **Postgres rows**. Never return an OS `_source` as the API hit. `GET /api/vouchers/:id` stays Postgres-only (`git grep opensearch -- backend/src/vouchers` empty).
3. **SQL visibility is the law.** OS ids must be intersected with: `valid_to IS NULL AND is_deleted=false AND ingest_batch.status='published'` plus branch `company_id` in **SQL WHERE**, not JS filter after fetch. A held or `OTHER_CO` doc that is stale in OS must not appear for finance/branch.
4. **OS down / timeout / throw → existing SQL search path.** HTTP 200, gold still works. Do not 500. Timeout ≤ 500 ms.
5. OS **0 hits** is a real miss — do **not** fall back to SQL just because total=0 (that double-queries every miss). Fallback only on error/timeout/`ping` false.
6. Do not add fuzz (`fuzziness`, ngram, phonetic). T1 `shankra` must still miss. T2/T3 already hit on SQL; they may hit via OS too. S20 owns remaining typos.
7. Do not revert the exact `vch_no_norm` SQL rank bind (separate from LIKE `%`, applied after COUNT). SQL fallback must keep G7 hit 1 = `INV/SR/1`.
8. Do not edit `GOLD.md` expected/pass_rule. No TRUNCATE, no `down -v`, no drop SYN9, no unpublish **345**, no hold **651** / **533**. Leave HOLD17/1 and S18IDX/1 held.
9. No invented p95. No `s9-bench.ts`. Official p95 = 135 ms. No `parseFloat` on money. No `.env` / JWT / Tally in git.
10. `tsc` exit 0. Unit + e2e green (counts may rise). Do not weaken tests.

---

## 1. WHAT S19 IS

```
POST /api/search
  try OS candidate ids (q → shankara-vouchers, size ≥ 50)
  catch/timeout → searchSql()   // today’s path, unchanged ranking
  else
    SELECT … FROM voucher JOIN ingest_batch
    WHERE visibility AND id = ANY($os_ids)
    ORDER BY (SQL rank among those ids)
    hits + asOf from Postgres
```

After S19, finance search still passes G1–G10. Branch still cannot see `OTHER/1` even though OS stores it.

---

## 2. FILES YOU MAY TOUCH

```
backend/src/search/search.service.ts      # wire OS try + SQL intersect; keep searchSql()
backend/src/search/search.module.ts
backend/src/search-index/search-index.interface.ts   # add searchCandidates()
backend/src/search-index/opensearch.adapter.ts
backend/src/search-index/noop.adapter.ts             # searchCandidates → throw or empty-error
backend/src/search-index/*.spec.ts
backend/src/search/search.service.spec.ts            # keep exact-norm bind test; add fallback/intersect tests
S19_EVIDENCE.md
backend/test/search.e2e-spec.ts          # optional: OS-down still 200
```

**Do not edit:** parsers, ingest upsert (except you must not), `vouchers.service.ts`, frontend, `GOLD.md`, fixtures, `s9-bench.ts`, `s17-sql-baseline.ts`. Do not change S18 reindex wipe policy.

`noop.adapter` `searchCandidates` must **fail** (throw) so unit tests without a cluster take the SQL fallback — do not return `[]` as a successful miss unless the test is explicitly for empty index.

---

## 3. OS QUERY (no fuzz)

Add to `VoucherIndex`:

```ts
searchCandidates(q: string, opts: { size: number }): Promise<{ ids: string[]; tookMs: number }>
```

Query `shankara-vouchers` only. Suggested (names may vary; behavior locked):

- `term`/`prefix` on `vch_no_norm` (use `normalizeVchNo(q)`)
- `term` on `vch_no` / `total_amount` if amount parses
- `match` on `party_name` and `narration` (**no** `fuzziness`)

Return `_id`s in OS score order, `size` default **50** (max 100). Adapter timeout ≤ 500 ms.

SearchService: if `ids.length === 0` from a **successful** OS call, return `{ total: 0, hits: [], asOf }` (SQL asOf still). Do not SQL-scan the whole table on a clean miss.

---

## 4. SQL INTERSECT (locked)

```sql
WHERE voucher.valid_to IS NULL AND voucher.is_deleted = false
  AND ingest_batch.status = 'published'
  AND voucher.id = ANY($os_ids::bigint[])
  -- branch: AND voucher.company_id = $company
```

Then existing rank (`vch_no_norm` exact DESC, amount exact, party ILIKE, date, id) **among those rows**. `total` = count of **visible** intersected rows (not raw OS total).

If OS returns `OTHER/1`’s id, branch query drops it. If OS still has a held id, finance query drops it.

Response `hits[]` fields unchanged (`id,vchNo,vchType,vchDate,partyName,totalAmount,narration,companyId`). Dates local Y-M-D. Audit `search` still.

Optional body flag `via: 'os'|'sql'` is **forbidden** in production JSON (leaks internals). Log it in audit meta only if you want (`meta.backend = 'os'|'sql'`).

---

## 5. STALE-DOC PROOF (required)

OS may contain `OTHER/1`. Branch `POST /api/search {"q":"OTHER/1"}` → `total === 0`.

Plus one **injected** stale id: steward (or a tiny script) `POST :9200/shankara-vouchers/_doc/s19stale` with `vch_no=S19STALE/1` (no matching published SQL row). Finance search `S19STALE/1` → total 0. Delete that doc after. Do not insert a SQL voucher for it.

---

## 6. GOLD (must still pass on live SQL+OS path)

Finance: G1–G10 per `GOLD.md` (G4 = top hit narration contains `KA01AB1234`; G7/G8 exact `INV/SR/1` / `INV/SR/2` in top 3 — prefer hit 1).  
T1 `shankra` total=0. T2/T3 measured.  
N1 HOLD17/1 finance 0. N2 branch OTHER/1 0. N3 steward OTHER/1 ≥1. N4 unauth 401.

OS down: `docker stop shankara-opensearch`; finance G7 still hit 1 `INV/SR/1`; `docker start`. Then re-check OS ping.

---

## 7. `S19_EVIDENCE.md` gates

Header: date, host i3-1115G4, API, OPENSEARCH_NODE, syn9=20000, reset=none.

| # | Gate |
|---|---|
| 1 | env + `curl :9200` + API health |
| 2 | `tsc` exit 0 |
| 3 | `npm test` (43+N) |
| 4 | `npm run test:e2e` (39+N) |
| 5 | `git grep opensearch -- backend/src/vouchers` empty |
| 6 | G1–G10 live table, all pass |
| 7 | T1 total=0; T2/T3 recorded |
| 8 | N1–N4 |
| 9 | branch `OTHER/1` total=0 (OS has the doc) |
| 10 | S19STALE/1 in OS, finance search total=0, then delete doc |
| 11 | `docker stop` OS; G7 still hit1 `INV/SR/1`; `docker start` |
| 12 | SYN9 SQL 20000 |
| 13 | GET `/api/vouchers/20745` 4 lines + `source.sha256`; finance JWT |
| 14 | exact-norm SQL bind still present (`exactNormForRank` after COUNT) |
| 15 | `GOLD.md` expected columns unchanged |

`S19_STATUS=COMPLETE` only when every cell has real stdout. Do not write `PHASE_3_STATUS=COMPLETE`.

---

## 8. ORDER

1. `searchCandidates` on interface + OS adapter + noop throws.  
2. Extract today’s logic to `searchSql()`. Wire try/catch/timeout.  
3. Intersect + SQL rank. Unit: stale id dropped; OS throw → sql path.  
4. Live gold + N-set + stale doc + OS-down G7.  
5. Evidence. Stop.

Banned: “I added fuzz so T1 passes”; “OS _source is the hit”; “I JS-filtered OTHER_CO”; “Phase 3 complete”.

Reply: files changed; gold table; OS-down G7; stale-doc proof; test summaries; 15-row evidence. **Stop.**
