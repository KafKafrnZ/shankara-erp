# Search gold set (frozen)

**Do not edit expected / pass_rule columns without a human.**  
Measured ranks and timings live in `S17_EVIDENCE.md`, not here.

These queries are the Phase 3 contract. S17 measures them on **SQL**. Later S-steps may not “fix” a gold miss by changing the expected `vch_no`.

Roles: `finance` sees published current `SHANKARA_HYD` (and any company — finance is not company-scoped in SQL today). `branch` is `company_id` in `WHERE`. `steward` is global.

---

## G — must pass on live SQL (S17)

`POST /api/search` `{"q":"<q>"}` with the given role. Inspect `hits[0]`, `hits[1]`, `hits[2]` (ignore `hits` beyond 3 for pass/fail).

| id | q | role | pass_rule | expected |
|---|---|---|---|---|
| G1 | `11820` | finance | `vch_in_top3` | `INV/HYD/24-25/11820` |
| G2 | `INV/HYD/24-25/11820` | finance | `vch_in_top3` | `INV/HYD/24-25/11820` |
| G3 | `RCT/HYD/2401` | finance | `vch_in_top3` | `RCT/HYD/2401` |
| G4 | `KA01AB1234` | finance | `top_hit_narration` | narration contains `KA01AB1234` |
| G5 | `STRS/5000` | finance | `vch_in_top3` | `STRS/5000` |
| G6 | `Mix Party 5000` | finance | `vch_in_top3` | `STRS/5000` |
| G7 | `INV/SR/1` | finance | `vch_in_top3` | `INV/SR/1` |
| G8 | `INV/SR/2` | finance | `vch_in_top3` | `INV/SR/2` |
| G9 | `Apex Pipes` | finance | `top_hit_party` | partyName `Apex Pipes` |
| G10 | `SYN9/10000` | finance | `vch_in_top3` | `SYN9/10000` |

`vch_in_top3`: some `hits[i].vchNo === expected` for `i` in `0..2`.  
`top_hit_party`: `hits[0].partyName === 'Apex Pipes'`. Record the actual `vchNo` (e2e clones of the sales fixture share this party; do not require `INV/SR/2` here).  
`top_hit_narration`: `hits[0].narration` contains `KA01AB1234`. Record the actual `vchNo`. E2e clones copy the Day Book plate; do not require `INV/HYD/24-25/11820` here. Human amended this pass_rule after S17 SQL baseline (2026-08-20).

Mix: Day Book fixture (G1–G4), mixed 10k stress Day Book (G5–G6), Sales Register (G7–G9), SYN9 (G10).

---

## T — typo set

S17 **pass** = measured (T1 may be total=0).  
S20 **pass** (human 2026-08-20):

| id | q | role | s20_rule | note |
|---|---|---|---|---|
| T1 | `shankra` | finance | `top_hit_company` | OS fuzz on `company_name` (`Shankara`). `hits[0].companyId === 'SHANKARA_HYD'`, total≥1. Record vchNo. **Not** a party match. |
| T2 | `inv sr 1` | finance | `vch_in_top3` | Already hits `INV/SR/1` via `normalizeVchNo`. Do **not** call this a fuzz win. |
| T3 | `apex pipe` | finance | `top_hit_party` | Already hits Apex Pipes via ILIKE substring. Do **not** call this a fuzz win. |

SQL fallback (OS down): T1 may total=0. That is allowed. T1 must pass with OS **up**.

---

## A — amount-heavy observed (not gold pass/fail)

E2e clones inflate `1248500` / `59000` hit lists. Record `total` and top 3. Do **not** fail S17 if the fixture vch is rank 4+.

| id | q | role | s17_rule |
|---|---|---|---|
| A1 | `1248500` | finance | record `total` + top 3 `vchNo` + `totalAmount` |
| A2 | `59000` | finance | record `total` + top 3 `vchNo` + `totalAmount` |

---

## N — visibility (must pass on SQL)

| id | q | role | pass_rule |
|---|---|---|---|
| N1 | `HOLD17/1` | finance | `total === 0` (batch held, never published) |
| N2 | `OTHER/1` | branch | `total === 0` |
| N3 | `OTHER/1` | steward | `total >= 1` |
| N4 | `11820` | none (no token) | HTTP **401** |
