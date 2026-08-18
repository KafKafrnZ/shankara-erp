# S8 WORK ORDER — FRONTEND ONLY

You are implementing **S8 only** of Shankara Buildpro Phase 1.  
Repo: `D:/5ingularity/shankara-erp`  
Spec of record: `PHASE_1_AUDIT.md` §9 and **this file**.  
If this file and anything else conflict, **this file wins**.

**S0–S7 are done and independently verified.** The API already does login, upload, detect/parse/upsert, publish, search, get voucher, as-of, audit.  
**S9–S10 are forbidden.** No 20k ingest. No `PHASE_1_EVIDENCE.md`. Do not write “Phase 1 complete.”

---

## 0. HARD RULES (violation = rejected)

1. Do not declare S8 complete in chat. Fill `S8_EVIDENCE.md`. Empty cell = not done.
2. **Do not edit `backend/`.** No new routes. No `autoPublish` wiring in Nest. No parser/search/audit changes. If the UI cannot do a thing, you are calling the wrong existing endpoint.
3. Do not edit `fixtures/daybook/EXPECTED.md` or committed fixtures.
4. Do not add AG Grid, OpenSearch, GraphQL, Next.js, Tailwind-as-rewrite, chart libraries, or a second frontend.
5. Do not commit `.env`. Do not put passwords or JWT secrets in source.
6. Do not store the JWT in `localStorage`. **`sessionStorage` only** (key `sb.accessToken`).
7. Do not hardcode `http://localhost:3000` in fetch URLs. Use **relative** `/api/...` and the Vite proxy.
8. Do not show “Create Voucher”, Parties/Items pills, AG Grid placeholders, or a hardcoded as-of date.
9. Do not invent a mapping UI, GST screen, or dashboard charts.
10. `cd frontend && npm run build` exit 0. Backend `npm test` and `npm run test:e2e` stay green (you must not have touched them).

---

## 1. WHAT S8 IS

Replace the Vite mock in `frontend/` with a working three-surface app that talks to the **existing** Nest API.

```
Login  →  Search (home)
            ↳ click hit → voucher pane
Steward only: Upload → POST /uploads → if held, POST /batches/:id/publish
Header always: role from /api/auth/me + as-of from /api/meta/as-of
```

The current `frontend/src/App.tsx` is a mock: hardcoded `Steward Access`, `17 Aug 2026 14:10 IST`, AG Grid placeholder, Parties/Items pills. **Delete that product surface.** Keep Vite + React 19.

---

## 2. FILES YOU MAY TOUCH

```
frontend/index.html
frontend/vite.config.ts
frontend/src/**                 # rewrite
frontend/public/**              # optional
frontend/PHASE1_MANUAL.md       # required
S8_EVIDENCE.md
```

You may delete unused Vite assets (`src/assets/hero.png`, `react.svg`, `vite.svg`) if nothing imports them.

**Do not touch `backend/`, `fixtures/`, `docker-compose.yml`, S0–S7 briefs.**

---

## 3. VITE

`frontend/vite.config.ts` must proxy:

```ts
server: {
  port: 5173,
  proxy: {
    '/api': 'http://127.0.0.1:3000',
  },
}
```

`frontend/index.html` `<title>` **exactly**:

```
Shankara Buildpro — Data Layer
```

CORS on the API is already `CORS_ORIGIN=http://localhost:5173`. Do not change backend CORS.

---

## 4. AUTH CLIENT

```
POST /api/auth/login     { email, password }
  → 200 { accessToken, user: { id, email, role, companyId } }
  → 401 invalid

GET  /api/auth/me        Authorization: Bearer <token>
  → { id, email, role, companyId, branchId }

POST /api/auth/logout    Authorization: Bearer <token>
```

Rules:

- On login 200: save `accessToken` to `sessionStorage['sb.accessToken']`. Then `GET /api/auth/me` and keep that user in React state. **Role badge text is `user.role`** (`steward` / `finance` / `branch`), not `"Steward Access"`.
- Every later request: `Authorization: Bearer ${sessionStorage.getItem('sb.accessToken')}`.
- Any 401: clear `sessionStorage`, show login.
- Logout button: `POST /api/auth/logout`, clear storage, show login.
- Reload: if token exists, call `/api/auth/me`; 200 → stay logged in; 401 → login.
- No `localStorage`.

---

## 5. SCREENS

Tiny state router is enough (`'login' | 'search' | 'upload'`). React Router is allowed. No other pages.

### 5.1 Login

- Email + password fields. Submit → `POST /api/auth/login`.
- Show the API error message on 401. Do not log the password.
- After success → Search.

### 5.2 Search (home after login)

- One text input. Autofocus. **`/`** (when focus is not already in an input) focuses it. **Enter** searches.
- `POST /api/search` body `{ "q": "<trimmed>", "limit": 20 }`. Do not send empty `q`.
- Render `hits` as a list/table: `vchNo`, `vchType`, `vchDate`, `partyName`, `totalAmount`.
- Empty result: `No vouchers` (not a fake grid).
- Click or Enter on a focused row → open voucher pane for `hits[].id`.
- **No** Parties / Items / All Entities pills.

### 5.3 Voucher pane

- Overlay or right drawer. **Esc** closes.
- `GET /api/vouchers/:id`.
- Show header: vchNo, type, date, party, totalAmount, narration.
- Lines table: lineNo, ledgerName, debit, credit.
- Source lineage: fileName, sha256 (monospace, may truncate), sourceRowNo, publishedAt.
- 404: `Not found or unpublished`.

### 5.4 Upload — **steward only**

- Nav control **Upload** is rendered **iff** `user.role === 'steward'`. Finance and branch must not see it. Direct navigation to upload as non-steward → bounce to search.
- Fields: `companyId` text, default `SHANKARA_HYD`. File input + drag-and-drop. Accept `.xlsx,.xls,.csv,.zip`.
- `POST /api/uploads` multipart field name **`file`**, plus `companyId`.
- Then:

| Response | UI |
|---|---|
| 202 `status: 'held'` | `GET /api/batches/:id`, then `POST /api/batches/:id/publish`. Show `published` + `acceptedRows` / `rejectedRows`. If `errorSummary` starts with `OUT_OF_BALANCE`, show it as a warning (still published). |
| 202 `status: 'rejected'` | Show `errorSummary` (`UNRECOGNIZED_LAYOUT` / `COMPANY_MISMATCH` / `ZERO_VOUCHERS`). Do not publish. |
| 200 `duplicate: true` | `GET /api/batches/:id`. Show existing status. If `held`, offer a **Publish** button (do not auto-publish a duplicate). |
| 401 / 403 / 400 | Show API message. |

Progress labels you may show, in order, and only while that step is in flight: `uploading` → `publishing` → `published` | `rejected`. The backend parse is in-process inside upload; do not invent a fake `parsing` spinner that never ends.

Do **not** add a “Create Voucher” control.

### 5.5 Chrome (always when logged in)

- Role badge = `user.role` from `/api/auth/me`.
- As-of: `GET /api/meta/as-of` on login and after a successful publish.
  - `asOf` non-null: `Data as of {dd MMM yyyy, HH:mm} IST` using timezone **`Asia/Kolkata`**. `Intl.DateTimeFormat` is fine.
  - `asOf` null: muted text `No published data`. **No** green live dot.
- Logout.

---

## 6. API SHAPES (already shipped — do not change the server)

```
POST /api/search  { q, limit? }
→ { asOf, total, hits: [{ id, vchNo, vchType, vchDate, partyName, totalAmount, narration, companyId }] }

GET /api/vouchers/:id
→ { id, vchNo, vchType, vchDate, partyName, totalAmount, narration, lines: [{ lineNo, ledgerName, debit, credit }], source: { batchId, fileName, sha256, sourceRowNo, publishedAt } }

POST /api/uploads  (multipart file, companyId)
→ { batchId, status, duplicate, sha256, errorSummary? }

GET /api/batches/:id
→ { id, status, acceptedRows, rejectedRows, debitSum, creditSum, errorSummary, publishedAt, sha256 }

POST /api/batches/:id/publish  → { id, status, publishedAt }
GET /api/meta/as-of            → { asOf, batchId }
```

Money in the UI is the **string** the API returned (`1248500.00`). Do not `parseFloat` for display if you can show the string; if you format, keep 2 decimal places.

---

## 7. WHAT YOU MUST REMOVE

From `frontend/src` and `index.html`:

- `Steward Access`
- `17 Aug 2026` (any year-stamped fake as-of)
- “AG Grid will render here” / “millions of rows”
- Parties / Items filter pills
- Vite default title `frontend`
- `#root { width: 1126px }` / purple tutorial chrome in `index.css` if still present

Plain CSS is required. You may rewrite `App.css` / `index.css`. Do not add a CSS framework.

---

## 8. TESTS / MANUAL SCRIPT

No Playwright required.

Create `frontend/PHASE1_MANUAL.md` with **exactly these 10 steps** (you may add notes under each):

1. `docker compose` + API on :3000 + `cd frontend && npm run dev` on :5173.
2. Open `http://localhost:5173`. Title in the tab is `Shankara Buildpro — Data Layer`. You see login, not search.
3. Login `finance@shankara.local` / finance password. Land on search. Badge shows `finance`. **No Upload link.**
4. As-of is either `No published data` or a real IST timestamp — not `17 Aug 2026`.
5. Logout. Login `steward@shankara.local`. Badge shows `steward`. Upload link visible.
6. Upload `fixtures/daybook/sample-daybook.csv` with companyId `SHANKARA_HYD`. UI ends on `published` (or shows reject reason if detect fails — it must not stay on a spinner).
7. Search `Sri Steel`. A hit shows party `Sri Steel Traders` and amount `1248500.00`.
8. Open that hit. Pane shows 4 sales lines; CGST credit `112365.00`; source sha256 present. Esc closes.
9. Logout. Login `branch@shankara.local`. No Upload. Search still works (backend scopes company).
10. Open DevTools → Application → Session Storage: key `sb.accessToken` exists. Local Storage has **no** token.

Backend tests: run `cd backend && npm test && npm run test:e2e` and paste summaries. They must still be 28 / 37 (or whatever they were before you started — they must not drop because you must not edit backend).

`cd frontend && npm run build` must exit 0.

---

## 9. IMPLEMENTATION ORDER

1. Vite proxy + `index.html` title.  
2. Auth client (`sessionStorage` + `/api/auth/*`). Login screen.  
3. Search + as-of + role badge.  
4. Voucher pane (Esc).  
5. Steward upload + auto publish after `held`. Hide upload for other roles.  
6. Strip mock copy. Write `PHASE1_MANUAL.md`.  
7. `npm run build`. Fill `S8_EVIDENCE.md`. Stop.

Do not open S9.

---

## 10. BANNED SENTENCES

- “S8 complete, AG Grid can come later”
- “I stored the JWT in localStorage for convenience”
- “I hardcoded the steward badge because /me was awkward”
- “I changed the backend to autoPublish so the UI is simpler”
- “Ready for S9 / Phase 1 complete” without `S8_STATUS=COMPLETE`

Reply with files changed, `npm run build` summary, backend test summaries (unchanged), and the evidence table. Then **stop**.
