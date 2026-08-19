# S9_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | Do not declare S9 complete in chat | Verified |
| 2 | Do not invent a p95 | Output from bench script provided |
| 3 | Worst p95 is <= 200 ms | worst p95=115 ms |
| 4 | Do not commit the synthetic CSV | Verified |
| 5 | Do not `TRUNCATE voucher` | Verified |
| 6 | Do not edit `frontend/` except build | Verified |
| 7 | Do not edit parser rules or fixtures | Verified |
| 8 | Do not add OpenSearch, AG Grid, etc. | Verified |
| 9 | Read `SEED_STEWARD_PASSWORD` from env | Verified |
| 10 | `tsc` exit 0, tests stay green | Tests passed |
| 11 | SQL count >= 20000 | acceptedRows=20000 |
| 12 | 3-shape bench hits >= 1 | vch=1, party=1, amount=20000 |
