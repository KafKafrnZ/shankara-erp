# S20 WORK ORDER — COMPANY/PARTY FUZZ ONLY (`shankra`)

You are implementing **S20 only**. Repo: `D:/5ingularity/shankara-erp`.  
This file wins on conflict. Spec: `PHASE_3_AUDIT.md`, `GOLD.md` T-set (human S20 lines).

**S0–S18 done.** S19 serving path was 500 on OS-id SQL; a human fixed bound `IN` + drop non-numeric `_id`. **Do not revert that.** Do not revert `exactNormForRank` after COUNT.

**S21–S22 forbidden.** No UI highlight. No `PHASE_3_EVIDENCE.md`. No `PHASE_3_STATUS=COMPLETE`.

---

## 0. HARD RULES

1. `S20_EVIDENCE.md` 12-row `cmd:`+`out:` table. Empty / Verified / Passed in e2e = reject.
2. **Only T1 needs fuzz.** T2 `inv sr 1` and T3 `apex pipe` already hit. Do not add `fuzziness` to make those “pass.” Do not claim them as fuzz wins.
3. **Do not** `fuzziness` on `vch_no`, `vch_no_norm`, or `total_amount`. That explodes `INV/SR/1` / amounts.
4. Hits still from **Postgres** after OS ids. SQL visibility unchanged. JS filter after SELECT * = reject.
5. Do not `ILIKE '%shankra%'` as the fix (no company-name column in SQL today; do not seq-scan). Fuzz is **OS only**.
6. Existing index has **no** `company_name`. `ensureIndex` will not recreate mapping. You must `put_mapping` + **steward reindex** so old docs get the field. Do not `indices.delete` the live index as the first step (S18 hole).
7. No TRUNCATE / `down -v` / unpublish 345 / hold 651 or 533. HOLD17/1 and S18IDX/1 stay held.
8. No p95 / `s9-bench` / parseFloat on money / `.env` in git. Official p95 = 135 ms.
9. Do not edit G1–G10 expected columns except you must not. T-set s20_rule is already in `GOLD.md` (human). Do not retarget T1 to `Sri Steel`.
10. `tsc` 0. Unit + e2e green (counts may rise). Do not weaken G7 tests.

---

## 1. WHAT S20 IS

`shankra` is 1 edit from **Shankara**. That string is the **company title**, not a party. Index it, fuzz-match it, SQL-intersect the ids.

```
index.company_name = "Shankara Buildpro" when company_id = SHANKARA_HYD
                   = company_id otherwise (OTHER_CO must not win T1)
OS match company_name + party_name with fuzziness: 1
POST /search still: OS ids → SQL WHERE published/current (+ branch) → SQL rank
```

---

## 2. FILES YOU MAY TOUCH

```
backend/src/search-index/search-index.interface.ts   # company_name on IndexedVoucher
backend/src/search-index/opensearch.adapter.ts       # mapping put + fuzz match
backend/src/search-index/noop.adapter.ts             # unchanged throw on searchCandidates
backend/src/ingest/ingest.service.ts                 # set company_name on publish upsert
backend/src/search-index/search-index.controller.ts  # set company_name on reindex docs
backend/src/search-index/*.spec.ts
S20_EVIDENCE.md
```

**Do not edit:** `vouchers.service.ts`, parsers, frontend, G-set GOLD expected, `s9-bench.ts`.  
`search.service.ts` only if you must pass `q` through unchanged — **do not** replace `IN ($1,$2,…)` with `ANY($n::bigint[])`.

---

## 3. MAPPING + DOCS (locked)

`company_name`: type **text**.

Derive (one helper, use in publish + reindex):

```
SHANKARA_HYD → "Shankara Buildpro"
anything else → company_id (e.g. OTHER_CO)
```

`put_mapping` on existing `shankara-vouchers` if the field is missing. Then steward `POST /api/index/reindex` (JWT). `_count` must still equal SQL published current after reindex.

---

## 4. OS QUERY

Keep S19 should-clauses (term/prefix `vch_no_norm`, term `vch_no` / `total_amount`, match party/narration **without** fuzz).

**Add:**

```
match: { party_name:   { query: q, fuzziness: 1, prefix_length: 1 } }
match: { company_name: { query: q, fuzziness: 1, prefix_length: 1 } }
```

`minimum_should_match: 1`. Timeout ≤ 500 ms. No ngram, phonetic, synonym, “did you mean.”

---

## 5. GOLD

Finance, OS **up**, after reindex:

| id | pass |
|---|---|
| G1–G10 | unchanged (`GOLD.md`) |
| T1 `shankra` | total≥1, `hits[0].companyId === 'SHANKARA_HYD'` |
| T2 | `INV/SR/1` in top 3 |
| T3 | top hit party Apex Pipes |
| N1–N4 | held / branch OTHER / steward OTHER / 401 |

OS **down**: G7 still hit1 `INV/SR/1` (SQL). T1 may be 0 — paste it; do not fail S20 on that row.

Branch `shankra` must not surface `OTHER_CO`.

---

## 6. `S20_EVIDENCE.md` gates

| # | Gate |
|---|---|
| 1 | env, health `asOf:null` (not invented JSON), `curl :9200` cluster **shankara-search-cluster** |
| 2 | `tsc --noEmit -p tsconfig.build.json` |
| 3 | `npm test` |
| 4 | `npm run test:e2e` **last** |
| 5 | mapping has `company_name`; reindex `{sqlCurrent,indexed,_count}` equal |
| 6 | T1 finance `shankra` total≥1, hit1 companyId SHANKARA_HYD, top3 vchNo |
| 7 | T2/T3 still pass; grep `fuzziness` only on party_name/company_name |
| 8 | G7 hit1 `INV/SR/1` |
| 9 | N2 branch OTHER/1 total=0 |
| 10 | `docker stop` OS; G7 hit1 still `INV/SR/1`; T1 recorded; `docker start` |
| 11 | SYN9 SQL 20000; IN-list still in search.service (no `bigint[]`) |
| 12 | `GOLD.md` T1 s20_rule unchanged from human text |

`S20_STATUS=COMPLETE` only with real stdout. No Phase 3 complete.

---

## 7. ORDER

1. Helper + field on IndexedVoucher. put_mapping.  
2. Publish/reindex fill `company_name`. Reindex live.  
3. Fuzz match those two fields only. Unit: mapping includes company_name; fuzziness not on vch_no_norm.  
4. Live T1 + G7 + N2 + OS-down G7.  
5. Evidence. Stop.

Banned: “T2 is a fuzz win”; `fuzziness` on voucher numbers; `ILIKE` company title in Postgres; retarget T1 to Sri Steel; `indices.delete` then hope.

Reply: files; T1 table; G7; reindex counts; OS-down G7; tests; 12-row evidence. **Stop.**
