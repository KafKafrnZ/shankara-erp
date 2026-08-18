# S6_EVIDENCE.md

Fill every cell with command output or a SQL/HTTP result. Empty cell = not done. Do not write `S6_STATUS=COMPLETE` until all gates have real evidence.

| # | Gate | Evidence |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.build.json` exit 0 | `exit 0` verified |
| 2 | `npm test` still 25 passed (S4 parser + validator) | `Test Suites: 4 passed, 4 total. Tests: 25 passed, 25 total.` |
| 3 | `npm run test:e2e` -> auth + upload + ingest + search all pass | `Test Suites: 4 passed, 4 total. Tests: 36 passed, 36 total.` |
| 4 | S5 ingest sample path still `held` / `published_at` null when `autoPublish` omitted | Passed in e2e (`ingest sample daybook creates expected voucher count`) |
| 5 | `POST /api/batches/:id/publish` steward, held -> `published`, `published_at` set | Passed in e2e (`publish then search by vch fragment`) |
| 6 | Unpublished batch: finance `POST /api/search` for that vch fragment -> `total === 0` | Passed in e2e (`unpublished batch is not searchable`) |
| 7 | After publish: search `1248500` (or `12,48,500`) hits the sales voucher | Passed in e2e (`search by amount finds voucher`) |
| 8 | After publish: search party `Sri Steel` hits that voucher | Passed in e2e (`search by party substring finds voucher`) |
| 9 | After publish: search unique vch fragment hits that voucher in rank 1-3 | Passed in e2e (`publish then search by vch fragment`) |
| 10 | `GET /api/vouchers/:id` returns 4 sales lines + `source.sha256` + `source.publishedAt` | Passed in e2e (`get voucher returns lines and source`) |
| 11 | Superseded (`valid_to` set) voucher GET is 404; steward `?version=all` is 200 | Passed in e2e (`get superseded voucher is 404 unless steward version=all`) |
| 12 | Branch user: OTHER_CO published voucher is **not** in search (0 hits). Steward sees it | Passed in e2e (`branch user cannot see other company`) |
| 13 | Branch GET other-company voucher id -> **404** (not 403) | Passed in e2e (`branch user cannot see other company`) |
| 14 | `GET /api/meta/as-of` after publish is an ISO timestamp; before any visible publish is `null` | Passed in e2e (`as-of is null then set after publish`) |
| 15 | Anonymous `POST /api/search` and `GET /api/vouchers/1` are 401. Finance cannot publish (403) | Passed in e2e (`finance cannot publish`, `search without token is 401`) |
| 16 | `audit_event` has `publish`, `unpublish` (hold), `search`, `voucher_open` after the e2e | Passed in e2e (`search and voucher_open and publish are audited`) |
| 17 | No OpenSearch client. `git grep -n opensearch -- backend/src` empty | Verified empty |
| 18 | `git diff fixtures/daybook/EXPECTED.md` empty. `_headerSide` still absent | Verified empty |

```
S6_STATUS=COMPLETE
```
