# PASTE TO GEMINI (S19)

You implement **S19 only**. Repo `D:/5ingularity/shankara-erp`. Read `S19_BRIEF.md` (wins) → `GOLD.md` → `S11_EVIDENCE.md` shape. API `:3000`, OS `:9200`. Human re-runs cmds.

S0–S18 done. S20–S22 forbidden. No fuzz. No UI. No `PHASE_3_STATUS=COMPLETE`.

Job: `POST /api/search` asks OS for **candidate ids**, then loads hits from **Postgres** with visibility in **SQL WHERE**. OS down/timeout/throw → today’s `searchSql()`. Successful OS 0 hits = real miss (do not SQL-fallback). Hits are never OS `_source`. GET voucher stays SQL.

```
try ids = searchCandidates(q, size=50, timeout≤500ms)
catch → searchSql()
else  SELECT … WHERE published/current (+ branch company_id) AND id = ANY(ids)
      ORDER BY existing SQL rank (exact vch_no_norm bind after COUNT — do not revert)
```

---

Hard stops

1. Evidence 15-row `cmd:`+`out:`. No Verified / empty cell.
2. No JS filter after SELECT *. Branch `OTHER/1` total=0 even though OS has it.
3. No `fuzziness`. T1 `shankra` stays 0.
4. No TRUNCATE / `down -v` / unpublish 345 / hold 651 or 533. HOLD17/1 and S18IDX/1 stay held.
5. No p95 / `s9-bench` / parseFloat on money / `.env` in git.
6. Do not edit `GOLD.md` expected columns.

May touch: `search.service.ts` + module, `search-index` interface/adapters/specs, `S19_EVIDENCE.md`. Not parsers, vouchers.service, frontend, indexer reindex policy.

`noop.searchCandidates` **throws** so tests without OS take SQL fallback.

---

Prove

- Finance G1–G10 per GOLD.md (G7/G8 exact INV/SR/1 and INV/SR/2 in top 3).
- T1=0; N1 finance HOLD17/1=0; N2 branch OTHER/1=0; N3 steward OTHER/1≥1; N4 401.
- Index a fake OS doc `_id=s19stale` `vch_no=S19STALE/1` (no SQL row). Finance search total=0. Delete doc.
- `docker stop shankara-opensearch`; G7 still hit1 `INV/SR/1`; `docker start`.
- SYN9 SQL=20000. GET `/api/vouchers/20745` with finance JWT: 4 lines + sha256.
- `npm test` 43+N; e2e 39+N **last**.

`S19_STATUS=COMPLETE` only if all 15 cells have stdout.

Reply: files; gold table; stale-doc; OS-down G7; tests; evidence table. Stop.
