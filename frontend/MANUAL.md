# Manual check (current UI)

`docker compose up -d` + API `:3000` + `npm run dev` on `:5173`. Passwords from `backend/.env`, not this file.

1. Open http://127.0.0.1:5173 — dark sign-in, official logo, tagline *Book of record. Search-first.*
2. Bad password → “Invalid credentials”. Login `finance@shankara.local` → search landing, **no Upload**.
3. As-of is an IST timestamp or “No published data”, not a hardcoded date.
4. Search `Sri Steel` or `INV/SR/1`. Results table, INR amounts, pagination if `total` > 20. Row opens the drawer (Esc closes).
5. Paste a `/?q=INV/SR/1&voucher=…` URL — same results + drawer.
6. Logout. Login `steward@shankara.local`. Upload is in the header.
7. Upload `fixtures/daybook/sample-daybook.csv` (company `SHANKARA_HYD`). Held → Publish. Then search the voucher.
8. Branch user: no Upload; search still works (company-scoped).
9. Session Storage has `sb.accessToken`. Local Storage does **not** hold the JWT (recent searches only).
