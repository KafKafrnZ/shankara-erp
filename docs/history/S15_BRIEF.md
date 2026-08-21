# S15 WORK ORDER — FRONTEND: SAME SHELL, SALES UPLOAD VISIBLE

**S14 must be accepted first.** This file wins on conflict.  
**S16 forbidden** (no evidence table for Phase 2 complete).  
**Do not edit `backend/`** unless a display bug is an existing API field you already return.

---

## 0. HARD RULES

1. Fill `S15_EVIDENCE.md`.
2. JWT stays `sessionStorage['sb.accessToken']`. Relative `/api`. Vite proxy unchanged.
3. No AG Grid. No Parties/Items pills. No Create Voucher. No mapping UI.
4. Title stays `Shankara Buildpro — Data Layer`.
5. Steward-only upload. Finance has no Upload link.
6. `cd frontend && npm run build` exit 0.
7. Do not hardcode `17 Aug 2026`. As-of stays `Asia/Kolkata`.

---

## 1. WHAT S15 IS

One dropzone still. After upload:

- If `DAY_BOOK` and `held` → existing publish prompt.
- If `SALES_REGISTER` and `held` → same publish prompt (do not invent a second wizard).
- If `rejected` with `SALES_REGISTER_NOT_IMPLEMENTED` — that code must be **gone** after S13; if you still see it, S13 was not done. Show `errorSummary` text, no spinner forever.

Search box is still one box. User can type `INV/SR/1` or `Apex Pipes`. Voucher pane shows lines (GST credits) and source sha256.

Update `frontend/PHASE1_MANUAL.md` **or** add `frontend/PHASE2_MANUAL.md` with 6 click steps for the sales fixture. Do not delete the Day Book manual.

---

## 2. FILES YOU MAY TOUCH

```
frontend/src/**
frontend/PHASE1_MANUAL.md
frontend/PHASE2_MANUAL.md
S15_EVIDENCE.md
```

---

## 3. BANNED

- Backend ranking rewrite
- OpenSearch
- AG Grid
- Purchase Register UI
- “Phase 2 complete”
