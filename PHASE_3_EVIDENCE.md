# PHASE 3 EVIDENCE

**PHASE_3_STATUS=COMPLETE** (2026-08-21). Human accepted the search-first UI on Vite `:5173`. OS-down G7 was captured in S20.

date: 2026-08-20
host: Windows i3-1115G4
api: http://127.0.0.1:3000
OPENSEARCH_NODE: http://127.0.0.1:9200
reset: none
official p95: **135 ms** (Phase 1 gate 24; not re-run)

| # | Gate | Evidence |
|---|---|---|
| 1 | Gold file frozen; S17 SQL baseline | `fixtures/search/GOLD.md` + `S17_EVIDENCE.md` `S17_STATUS=COMPLETE` |
| 2 | G1–G10 still pass (2026-08-20 live finance) | G1 `11820` hit2 `INV/HYD/24-25/11820`. G2/G3 exact. G4 narration `KA01AB1234` on hit1. G5/G6 `STRS/5000`. G7 hit1 `INV/SR/1`. G8 hit1 `INV/SR/2`. G9 top party Apex Pipes. G10 `SYN9/10000`. |
| 3 | T-set after S20 | T1 `shankra` total=50 hit1 companyId **SHANKARA_HYD**. T2 hit1 `INV/SR/1`. T3 top party Apex Pipes. |
| 4 | Index = published current | SQL pub **30505** = OS `_count` **30505**. OS `HOLD17/1` hits 0. |
| 5 | Hold drops finance search | `HOLD17/1` finance total=0. `S18IDX/1` finance total=0 (held). |
| 6 | OS down → SQL search | S20 finish: `docker stop shankara-opensearch`; G7 hit1 still `INV/SR/1`; T1 total=0; OS started again. |
| 7 | Branch cannot see OTHER_CO | branch search `OTHER/1` total=0. branch GET voucher 20469 **404**. steward search total=1. |
| 8 | Unauthenticated search 401 | `POST /api/search` no token → 401 |
| 9 | GET voucher Postgres only | finance GET `/api/vouchers/20745` 4 lines + sha256. `git grep opensearch -- backend/src/vouchers` empty |
| 10 | OS client isolated | `@opensearch-project/opensearch` Client only in `search-index/opensearch.adapter.ts` (+ spec mock, module import) |
| 11 | UI one box, no pills, no AG Grid | Routes `/login`, `/`, `/upload`. One search input `aria-label="Search vouchers"`. Highlight `<mark class="search-hl">`. Human UI audit 2026-08-21: accepted. |
| 12 | SYN9 20000; p95 135 ms | SQL `SYN9/%` current **20000**. Official p95 unchanged **135 ms**. |
| 13 | tsc + unit | backend `tsc --noEmit -p tsconfig.build.json` exit 0. `npm test` 10 suites, **49** passed. frontend `npm run build` exit 0. e2e not re-run this pass (clone inflation). |

S17–S22 closed. S19 path is OS ids + SQL `IN` (human-fixed). Post-phase-3: publish of `OUT_OF_BALANCE` is `409` (`POST_PHASE_3_FIXES.md`). Official p95 remains **135 ms**.
