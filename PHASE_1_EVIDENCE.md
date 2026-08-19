| # | Gate | Evidence (command or URL + result) |
|---|---|---|
| 1 | Compose up, migrations ran, health `db: ok` via port **6432** | |
| 2 | No password literals in repo source (`git grep` output empty for `supersecretpassword`) | |
| 3 | `.env.example` exists; `.env` is untracked | |
| 4 | Seed login works for steward, finance, branch | |
| 5 | Unauthenticated `POST /api/search` ??? 401 | |
| 6 | Finance `POST /api/uploads` ??? 403 | |
| 7 | Steward uploads `fixtures/daybook/sample-daybook.xlsx` without code changes | |
| 8 | Batch reaches `published` (or `held` then publish) | |
| 9 | Original file retrievable from storage by `storage_key` | |
| 10 | Voucher count matches `fixtures/daybook/EXPECTED.md` | |
| 11 | Re-upload same file: voucher count unchanged | |
| 12 | Search `11820` (or the fixture vch fragment) returns that voucher in hit 1???3 | |
| 13 | Search the fixture party substring returns it | |
| 14 | Search the fixture amount returns it | |
| 15 | `GET /api/vouchers/:id` returns lines + source lineage | |
| 16 | As-of in UI equals that batch `published_at` (IST), not a hardcoded date | |
| 17 | Branch user cannot see a voucher with another `company_id` | |
| 18 | Unpublished/held batch not in finance search | |
| 19 | `audit_event` has login, upload, search, voucher_open | |
| 20 | `npm test` (backend) ??? all ??10 tests ??? passing | |
| 21 | No empty Nest classes, no `getHello`, no AG Grid placeholder, no Parties/Items fake pills | |
| 22 | Unique constraints exist (`\d voucher` shows them) | |
| 23 | `voucher_line` FK has **no** `ON DELETE CASCADE` | |
| 24 | Synthetic 20k+ ingest search p95 recorded | N=20000 vouchers; worst p95=115 ms (amount); 100 calls; host=Windows, CPU=11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz |
| 25 | `PHASE_1_EVIDENCE.md` committed with the above filled | |

