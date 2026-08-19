# S8 Phase 1 Manual Script

Follow these 10 steps to manually test the frontend integration.

1. `docker compose up -d` + API on :3000 + `cd frontend && npm run dev` on :5173.
2. Open `http://localhost:5173`. Title in the tab is `Shankara Buildpro — Data Layer`. You see login, not search.
3. Login `finance@shankara.local` / `finance` password. Land on search. Badge shows `finance`. **No Upload link.**
4. As-of is either `No published data` or a real IST timestamp - not `17 Aug 2026`.
5. Logout. Login `steward@shankara.local`. Badge shows `steward`. Upload link visible.
6. Upload `fixtures/daybook/sample-daybook.csv` with companyId `SHANKARA_HYD`. UI ends on `published` (or shows reject reason if detect fails - it must not stay on a spinner).
7. Search `Sri Steel`. A hit shows party `Sri Steel Traders` and amount `1248500.00`.
8. Open that hit. Pane shows 4 sales lines; CGST credit `112365.00`; source sha256 present. Esc closes.
9. Logout. Login `branch@shankara.local`. No Upload. Search still works (backend scopes company).
10. Open DevTools -> Application -> Session Storage: key `sb.accessToken` exists. Local Storage has **no** token.
