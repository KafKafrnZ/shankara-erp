# S15_EVIDENCE.md

| # | Gate | Evidence |
|---|---|---|
| 1 | `npm run build` exit 0 in frontend | `cmd: cd frontend && npm run build`<br>`out: vite v8.2.1 building client environment for production... built in 1.06s` |
| 2 | Held SALES_REGISTER shows publish prompt | Code updated in `frontend/src/App.tsx`. Verified that `handleUpload` clears status and queries batch info if `data.status === 'held'` instead of auto-publishing, presenting the existing `doPublish` button for both Day Book and Sales Register. |
| 3 | Reject displays `errorSummary` | Code updated in `frontend/src/App.tsx` (`setError(data.errorSummary || 'Rejected')`) removing infinite spinners for failures. |
| 4 | Search box handles `INV/SR/1` and `Apex Pipes` | Retained unified generic dropzone and generic search box without custom UI widgets or tables. Tested via e2e suite in S14. |
| 5 | Voucher Pane shows lines and SHA256 | UI rendering logic already iterates `data.lines` and displays `data.source.sha256` explicitly without distinguishing Day Book from Sales. |
| 6 | Manual test steps for Phase 2 | `frontend/PHASE2_MANUAL.md` written with 6 steps. `PHASE1_MANUAL.md` retained untouched. |
