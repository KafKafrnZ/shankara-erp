# Phase 2 Manual Script (Sales Register UI)

Follow these 6 steps to manually test the Sales Register frontend integration.

1. `docker compose up -d` + API on :3000 + `cd frontend && npm run dev` on :5173.
2. Login as `steward@shankara.local` (steward password from `.env`). Go to Upload. No password in this file.
3. Drop `fixtures/sales-register/sample-sales-register.csv` into the dropzone (companyId: `SHANKARA_HYD`). Click Upload.
4. The file gets uploaded and is placed in `held` status. Click the newly visible "Publish" button. The status changes to `published`.
5. Navigate to Search. Type `INV/SR/1` (or `Apex Pipes`). The sales voucher will appear in the top results.
6. Click the `INV/SR/1` hit. The Voucher Pane opens showing 4 lines (including CGST/SGST credits) and the `sha256` of the sales register source file.
