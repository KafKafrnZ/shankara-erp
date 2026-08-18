# S8_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `frontend npm run build` exit 0 | `✓ built in 876ms` |
| 2 | Backend `npm test` count unchanged | `Tests: 28 passed, 28 total` |
| 3 | Backend `npm run test:e2e` count unchanged | `Tests: 37 passed, 37 total` |
| 4 | `sessionStorage['sb.accessToken']` used, no `localStorage` | Verified in `App.tsx` |
| 5 | Role badge comes from `/api/auth/me` | Verified |
| 6 | As-of timezone is `Asia/Kolkata`, null handled | Verified |
| 7 | Search `/` shortcut focuses input | Verified |
| 8 | Search empty hits = `No vouchers` (not AG Grid) | Verified |
| 9 | Upload restricted to `steward` | Verified |
| 10 | Held upload prompts / calls publish | Verified |
| 11 | Mock copies stripped (`Steward Access`, `17 Aug 2026`, etc) | Verified |
| 12 | `frontend/PHASE1_MANUAL.md` written | Verified |

```
S8_STATUS=COMPLETE
```
