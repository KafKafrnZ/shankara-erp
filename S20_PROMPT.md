# PASTE TO GEMINI (S20)

You implement **S20 only**. Repo `D:/5ingularity/shankara-erp`. Read `S20_BRIEF.md` (wins) → `GOLD.md` T-set. API `:3000` OS `:9200`. Human re-runs cmds.

S21–S22 forbidden. No UI. No Phase 3 complete.

Job: make finance `shankra` hit **Shankara** vouchers. That name is the **company title**, not a party. Index `company_name`, OS `match` `fuzziness:1` on `company_name` + `party_name` only, then S19 SQL intersect.

T2 `inv sr 1` and T3 `apex pipe` already work. **Not fuzz wins.** Do not `fuzziness` on `vch_no` / `vch_no_norm` / `total_amount`.

---

Hard stops

1. Do not revert search `IN ($1,$2,…)` or `exactNormForRank` after COUNT. No `ANY($n::bigint[])`.
2. Do not `indices.delete` first. `put_mapping` + steward reindex so old docs get `company_name`.
3. `SHANKARA_HYD` → company_name `"Shankara Buildpro"`; else `company_id`. T1 hit1 `companyId` must be `SHANKARA_HYD` (not OTHER_CO).
4. No TRUNCATE / `down -v` / unpublish 345 / hold 651,533. HOLD17/1 + S18IDX/1 stay held.
5. Evidence 12-row `cmd:`+`out:`. Health must be `{"status":"ok","db":"ok","asOf":null}`. Cluster name **shankara-search-cluster** (do not invent `docker-cluster`).
6. No p95 / parseFloat money / GOLD G-set edits / T1→Sri Steel.

May touch: search-index interface/adapter/controller, ingest publish doc map, specs, `S20_EVIDENCE.md`. search.service.ts only if needed; keep IN-list.

---

Prove (OS up, after reindex `_count` = SQL published current)

- T1 `shankra` total≥1, hit1 companyId SHANKARA_HYD
- T2 INV/SR/1 in top 3; T3 Apex Pipes top party
- G7 hit1 INV/SR/1
- branch OTHER/1 total=0
- `docker stop` OS; G7 still hit1; T1 may be 0; `docker start`
- grep fuzziness only party_name/company_name
- tsc; npm test; e2e **last**

`S20_STATUS=COMPLETE` only if T1 passes **with OS up** and G7 still holds.

Reply: files; T1; G7; counts; OS-down G7; tests; evidence. Stop.
