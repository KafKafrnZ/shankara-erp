# S3_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | Confirmed ✅ |
| 2 | `npm run test:e2e` all pass | `Test Suites: 2 passed, 2 total` / `Tests: 16 passed, 16 total` ✅ |
| 3 | No parser / exceljs / opensearch added | `git grep -i exceljs` returns nothing. ✅ |
| 4 | Steward + tiny.csv → 202, `status=uploaded` | Test `steward upload csv creates source_file and batch uploaded` passes with 202. ✅ |
| 5 | Same file again → 200, `duplicate=true` | Test `second upload same bytes is duplicate and does not add source_file` passes with 200 and duplicate: true. ✅ |
| 6 | `SELECT count(*) FROM source_file` unchanged on second upload | Asserted in tests. Count unchanged. ✅ |
| 7 | File on disk under `STORAGE_DIR` named by sha256 path | Asserted in `stored file sha256 matches response` checking `./var/uploads/first2/next2/sha256`. ✅ |
| 8 | finance → 403, no token → 401 | Tests `unauthenticated upload is 401` and `finance upload is 403` passed. ✅ |
| 9 | `audit_event` has `upload` | Test queries `audit_event WHERE action = 'upload'` and asserts length. ✅ |
| 10 | Auth e2e still passing | `auth.e2e-spec.ts` 8 tests passed. ✅ |

S3_STATUS=COMPLETE
